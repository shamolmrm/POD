import { BadRequestException, Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import type { OrderStatus, Prisma } from "@prisma/client";
import { Queue } from "bullmq";
import { randomBytes } from "node:crypto";
import { AuditService } from "../../common/audit.service";
import { CONFIG, type Config } from "../../config";
import { PrismaService } from "../../prisma.service";
import { QUEUES, redisConnection } from "../../queues";
import type { FullCart } from "../cart/cart.service";
import { couponDiscount, totals } from "../cart/pricing";
import { MailerService } from "../notifications/mailer.service";
import { PAYMENT_PROVIDER, type PaymentProvider, type Verified } from "../payments/provider";

/** Allowed status changes. Anything else is a bug and is refused. */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELED"],
  PAID: ["SUBMITTING", "NEEDS_ATTENTION", "CANCELED"],
  SUBMITTING: ["IN_PRODUCTION", "NEEDS_ATTENTION", "PAID"],
  IN_PRODUCTION: ["SHIPPED", "DELIVERED", "NEEDS_ATTENTION", "CANCELED"],
  SHIPPED: ["DELIVERED", "NEEDS_ATTENTION"],
  DELIVERED: [],
  CANCELED: [],
  NEEDS_ATTENTION: ["PAID", "SUBMITTING", "IN_PRODUCTION", "SHIPPED", "DELIVERED", "CANCELED"],
};

export function canMove(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function orderNumber(now = new Date()): string {
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, "");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand = [...randomBytes(5)].map((b) => alphabet[b % alphabet.length]).join("");
  return `CPS-${ymd}-${rand}`;
}

export type ShipAddress = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postalCode: string;
  country: string;
};

@Injectable()
export class OrdersService implements OnModuleDestroy {
  private readonly log = new Logger("Orders");
  private readonly queue: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(CONFIG) private readonly config: Config,
  ) {
    this.queue = new Queue(QUEUES.fulfillment, { connection: redisConnection(config.redisUrl) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }

  /** Create a PENDING_PAYMENT order from the cart with server-side prices, then start payment. */
  async checkout(cart: FullCart, userId: string | null, address: ShipAddress, shippingCents: number) {
    if (!this.provider.configured) throw new BadRequestException("Online payment is not enabled yet. Please check back soon.");
    const items = cart.items.filter((i) => i.variant.isEnabled && i.variant.product.status === "ACTIVE");
    if (!items.length) throw new BadRequestException("Your cart is empty.");
    if (items.length !== cart.items.length) throw new BadRequestException("Some items are no longer available. Please review your cart.");
    for (const i of items) {
      if (!i.designVersion.printFiles) throw new BadRequestException("A design is missing its print files. Please add it from the editor again.");
    }
    const lines = items.map((i) => ({ unitPriceCents: i.variant.priceCents, quantity: i.quantity }));
    let discount = 0;
    if (cart.couponCode) {
      const d = couponDiscount(await this.prisma.coupon.findUnique({ where: { code: cart.couponCode } }), lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0));
      if ("error" in d) throw new BadRequestException(d.error);
      discount = d.cents;
    }
    const t = totals(lines, discount, shippingCents);
    const currency = items[0].variant.product.currency;

    const order = await this.prisma.order.create({
      data: {
        number: orderNumber(),
        userId,
        email: address.email,
        currency,
        ...t,
        couponCode: cart.couponCode,
        shippingAddress: address as unknown as Prisma.InputJsonValue,
        shippingMethod: 1,
        items: {
          create: items.map((i) => ({ variantId: i.variant.id, designVersionId: i.designVersion.id, quantity: i.quantity, unitPriceCents: i.variant.priceCents })),
        },
        payments: { create: { provider: this.provider.name, amountCents: t.totalCents, currency } },
      },
      include: { payments: true },
    });
    const payment = order.payments[0];
    const base = this.config.publicBaseUrl;
    const hook = `${base}/api/v1/webhooks/payments/${this.provider.name}`;
    const { redirectUrl, sessionKey } = await this.provider.initiate({
      txnId: payment.id,
      orderNumber: order.number,
      amountCents: t.totalCents,
      currency,
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
      customer: {
        name: `${address.firstName} ${address.lastName}`,
        email: address.email,
        phone: address.phone ?? undefined,
        address1: address.line1,
        city: address.city,
        postcode: address.postalCode,
        country: address.country,
      },
      urls: { success: `${hook}/return`, fail: `${hook}/return`, cancel: `${hook}/return`, ipn: hook },
    });
    await this.prisma.payment.update({ where: { id: payment.id }, data: { detail: { sessionKey: sessionKey ?? null, cartId: cart.id } } });
    await this.audit.record("order.created", { actorId: userId, target: order.number, detail: { total: t.totalCents, currency } });
    return { orderNumber: order.number, redirectUrl };
  }

  /**
   * Apply a gateway confirmation. Idempotent: duplicate IPNs/returns do nothing.
   * The order is PAID only if amount AND currency match exactly what we asked for.
   */
  async applyPayment(v: Verified): Promise<{ orderNumber?: string; paid: boolean }> {
    if (!v.txnId || !/^[0-9a-f-]{36}$/.test(v.txnId)) return { paid: false };
    const payment = await this.prisma.payment.findUnique({ where: { id: v.txnId }, include: { order: true } });
    if (!payment) return { paid: false };
    const order = payment.order;
    if (!v.ok) {
      if (payment.status === "INITIATED") await this.prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", detail: { reason: v.reason } } });
      return { orderNumber: order.number, paid: order.status !== "PENDING_PAYMENT" };
    }
    if (v.amountCents !== payment.amountCents || v.currency !== payment.currency) {
      this.log.error(`amount/currency mismatch for ${order.number}: got ${v.amountCents} ${v.currency}`);
      await this.audit.record("payment.mismatch", { target: order.number, detail: { got: v.amountCents, currency: v.currency, expected: payment.amountCents } });
      await this.prisma.order.update({ where: { id: order.id }, data: { status: "NEEDS_ATTENTION", lastError: "Payment amount mismatch — check the gateway." } });
      return { orderNumber: order.number, paid: false };
    }

    const nextStatus: OrderStatus = v.highRisk ? "NEEDS_ATTENTION" : "PAID";
    const changed = await this.prisma.$transaction(async (tx) => {
      // only the first confirmation wins (row filter = optimistic lock)
      const { count } = await tx.order.updateMany({
        where: { id: order.id, status: "PENDING_PAYMENT" },
        data: { status: nextStatus, paidAt: new Date(), lastError: v.highRisk ? "Gateway flagged this payment as high risk — review before fulfilment." : null },
      });
      if (!count) return false;
      await tx.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED", providerTxnId: v.providerTxnId, detail: v.raw as Prisma.InputJsonValue } });
      if (order.couponCode) await tx.coupon.updateMany({ where: { code: order.couponCode }, data: { redeemed: { increment: 1 } } });
      // empty the cart the order was placed from (guest or signed-in)
      const cartId = (payment.detail as { cartId?: string } | null)?.cartId;
      if (cartId) await tx.cartItem.deleteMany({ where: { cartId } });
      return true;
    });
    if (changed) {
      await this.audit.record("order.paid", { target: order.number, detail: { provider: payment.provider, highRisk: v.highRisk } });
      if (!v.highRisk) await this.enqueue(order.id);
      await this.mailer.orderConfirmation(order.id).catch((e: Error) => this.log.error(`mail: ${e.message}`));
    }
    return { orderNumber: order.number, paid: true };
  }

  /** Queue Printify submission (job id = order id, so it is never queued twice at once). */
  async enqueue(orderId: string): Promise<void> {
    await this.queue.add("submit", { orderId }, { jobId: `submit-${orderId}-${Date.now()}`, attempts: 5, backoff: { type: "exponential", delay: 60_000 }, removeOnComplete: 500, removeOnFail: 500 });
  }

  async setStatus(orderId: string, to: OrderStatus, extra: Prisma.OrderUpdateInput = {}): Promise<boolean> {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === to) return false;
    if (!canMove(order.status, to)) {
      this.log.warn(`refused ${order.number}: ${order.status} → ${to}`);
      return false;
    }
    const { count } = await this.prisma.order.updateMany({ where: { id: orderId, status: order.status }, data: { ...(extra as Prisma.OrderUpdateManyMutationInput), status: to } });
    return count > 0;
  }
}

