import { Injectable, Logger } from "@nestjs/common";
import { UnrecoverableError } from "bullmq";
import { AuditService } from "../../common/audit.service";
import { PrismaService } from "../../prisma.service";
import { StorageService } from "../files/storage.service";
import { PrintifyClient, PrintifyError } from "../printify/printify.client";
import { MailerService } from "../notifications/mailer.service";
import { OrdersService, type ShipAddress } from "./orders.service";

/**
 * Paid order → Printify. Runs in the worker. Each step stores its Printify id before moving on,
 * so a retry continues where the last attempt stopped instead of creating duplicates.
 *  1. upload print files (Printify fetches them from our signed URLs)
 *  2. create one hidden product per order line (exact print files, scale 1 = fills the area)
 *  3. create the order (external_id = our order id), then send_to_production
 */
@Injectable()
export class FulfillmentService {
  private readonly log = new Logger("Fulfillment");

  constructor(
    private readonly prisma: PrismaService,
    private readonly printify: PrintifyClient,
    private readonly storage: StorageService,
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
  ) {}

  async submit(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { include: { variant: { include: { product: true } }, designVersion: true } } },
    });
    if (!["PAID", "SUBMITTING", "NEEDS_ATTENTION"].includes(order.status) || order.paidAt === null) {
      this.log.warn(`skip ${order.number}: status ${order.status}`);
      return; // never send an unpaid order to production
    }
    await this.orders.setStatus(order.id, "SUBMITTING");

    try {
      for (const item of order.items) {
        if (item.printifyProductId) continue;
        const files = item.designVersion.printFiles as Record<string, { key: string }>;
        const placeholders = [];
        for (const [position, f] of Object.entries(files)) {
          const up = await this.printify.uploadByUrl(`${order.number}-${position}.png`, this.storage.signedUrl(f.key, 6 * 3600, true));
          placeholders.push({ position, images: [{ id: up.id, x: 0.5, y: 0.5, scale: 1, angle: 0 }] });
        }
        const v = item.variant;
        const product = await this.printify.createProduct({
          title: `${order.number} · ${v.product.title}`,
          description: `Custom order ${order.number}`,
          blueprint_id: v.product.printifyBlueprintId,
          print_provider_id: v.product.printifyProviderId,
          variants: [{ id: v.printifyVariantId, price: item.unitPriceCents, is_enabled: true }],
          print_areas: [{ variant_ids: [v.printifyVariantId], placeholders }],
        });
        await this.prisma.orderItem.update({ where: { id: item.id }, data: { printifyProductId: product.id } });
        item.printifyProductId = product.id;
      }

      let printifyOrderId = order.printifyOrderId;
      if (!printifyOrderId) {
        const a = order.shippingAddress as unknown as ShipAddress;
        try {
          const created = await this.printify.createOrder({
            external_id: order.id,
            label: order.number,
            line_items: order.items.map((i) => ({ product_id: i.printifyProductId!, variant_id: i.variant.printifyVariantId, quantity: i.quantity, external_id: i.id })),
            shipping_method: order.shippingMethod,
            send_shipping_notification: false,
            address_to: {
              first_name: a.firstName,
              last_name: a.lastName,
              email: a.email,
              phone: a.phone ?? undefined,
              country: a.country,
              region: a.region ?? "",
              address1: a.line1,
              address2: a.line2 ?? "",
              city: a.city,
              zip: a.postalCode,
            },
          });
          printifyOrderId = created.id;
        } catch (err) {
          // a network error here may still have created the order — never retry blindly
          if (!(err instanceof PrintifyError) || err.status < 500) throw new UnrecoverableError(`create order: ${(err as Error).message}`);
          throw err;
        }
        await this.prisma.order.update({ where: { id: order.id }, data: { printifyOrderId } });
      }

      await this.printify.sendToProduction(printifyOrderId);
      await this.orders.setStatus(order.id, "IN_PRODUCTION", { lastError: null });
      await this.audit.record("order.submitted", { target: order.number, detail: { printifyOrderId } });
    } catch (err) {
      const message = (err as Error).message.slice(0, 500);
      this.log.error(`${order.number}: ${message}`);
      await this.prisma.order.update({ where: { id: order.id }, data: { lastError: message } });
      throw err;
    }
  }

  /** Called by the worker when all retries are used up. */
  async giveUp(orderId: string, reason: string): Promise<void> {
    await this.orders.setStatus(orderId, "NEEDS_ATTENTION", { lastError: reason.slice(0, 500) });
  }

  /** Printify webhook → our order. Events are matched by Printify order id. */
  async onPrintifyEvent(topic: string, resource: { id?: string; data?: Record<string, unknown> }): Promise<void> {
    if (!resource?.id) return;
    const order = await this.prisma.order.findUnique({ where: { printifyOrderId: String(resource.id) } });
    if (!order) return;
    const data = resource.data ?? {};
    const carrier = (data.carrier ?? {}) as { code?: string; tracking_number?: string; tracking_url?: string };

    switch (topic) {
      case "order:sent-to-production":
        await this.orders.setStatus(order.id, "IN_PRODUCTION");
        break;
      case "order:shipment:created": {
        const trackingNumber = carrier.tracking_number ?? null;
        await this.prisma.shipment.upsert({
          where: { orderId_trackingNumber: { orderId: order.id, trackingNumber: trackingNumber ?? "" } },
          create: {
            orderId: order.id,
            carrier: carrier.code ?? null,
            trackingNumber: trackingNumber ?? "",
            trackingUrl: carrier.tracking_url ?? null,
            shippedAt: data.shipped_at ? new Date(String(data.shipped_at)) : new Date(),
          },
          update: { trackingUrl: carrier.tracking_url ?? null },
        });
        if (await this.orders.setStatus(order.id, "SHIPPED")) {
          await this.mailer.shipped(order.id, carrier.tracking_url ?? null, carrier.code ?? null).catch((e: Error) => this.log.error(e.message));
        }
        break;
      }
      case "order:shipment:delivered":
        await this.prisma.shipment.updateMany({ where: { orderId: order.id, trackingNumber: carrier.tracking_number ?? undefined }, data: { deliveredAt: new Date() } });
        await this.orders.setStatus(order.id, "DELIVERED");
        break;
      case "order:line-item:canceled":
        await this.orders.setStatus(order.id, "NEEDS_ATTENTION", { lastError: `Printify canceled a line item (${String(data.status_details ?? "no reason given")}).` });
        break;
      case "order:updated":
        if (data.status === "canceled") await this.orders.setStatus(order.id, "NEEDS_ATTENTION", { lastError: "Printify canceled the order." });
        break;
    }
  }
}
