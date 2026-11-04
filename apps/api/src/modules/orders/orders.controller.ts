import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { OrderStatus, User } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import { AuditService } from "../../common/audit.service";
import { email, TooManyRequests, zodBody } from "../../common/http";
import { RateLimitService } from "../../common/rate-limit.service";
import { CONFIG, type Config } from "../../config";
import { PrismaService } from "../../prisma.service";
import { AddressIn } from "../account/account.controller";
import { AuthGuard, CurrentUser, OptionalAuthGuard, Roles } from "../auth/guards";
import { CartService } from "../cart/cart.service";
import { StorageService } from "../files/storage.service";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../payments/provider";
import { PrintifyClient } from "../printify/printify.client";
import { OrdersService } from "./orders.service";

const CheckoutIn = z.object({ email, address: AddressIn.omit({ isDefault: true }) });

function publicOrder(o: {
  number: string;
  status: OrderStatus;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  createdAt: Date;
  paidAt: Date | null;
  shippingAddress: unknown;
  items: Array<{ id: string; quantity: number; unitPriceCents: number; variant: { title: string; product: { title: string; slug: string } } }>;
  shipments: Array<{ carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; shippedAt: Date | null; deliveredAt: Date | null }>;
}) {
  return {
    number: o.number,
    status: o.status,
    currency: o.currency,
    subtotalCents: o.subtotalCents,
    discountCents: o.discountCents,
    shippingCents: o.shippingCents,
    totalCents: o.totalCents,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    shippingAddress: o.shippingAddress,
    items: o.items.map((i) => ({ id: i.id, quantity: i.quantity, unitPriceCents: i.unitPriceCents, variant: i.variant.title, product: i.variant.product })),
    shipments: o.shipments,
  };
}
const ORDER_INCLUDE = { items: { include: { variant: { include: { product: { select: { title: true, slug: true } } } } } }, shipments: true } as const;

@Controller()
@UseGuards(OptionalAuthGuard)
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly orders: OrdersService,
    private readonly limits: RateLimitService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  @Get("checkout/status")
  status() {
    return { paymentsEnabled: this.provider.configured, provider: this.provider.configured ? this.provider.name : null };
  }

  /** Quote shipping, create the order with server prices, and return the gateway redirect. */
  @Post("checkout")
  @HttpCode(200)
  async checkout(@Body(zodBody(CheckoutIn)) body: z.infer<typeof CheckoutIn>, @CurrentUser() user: User | null, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cart = await this.carts.cart(user, req, res);
    if (await this.limits.hit(`checkout:${cart.id}`, 6, 300)) throw new TooManyRequests();
    const { standardCents } = await this.carts.shippingQuote(cart, { country: body.address.country, region: body.address.region ?? undefined, zip: body.address.postalCode, city: body.address.city });
    return this.orders.checkout(cart, user?.id ?? null, { ...body.address, email: user?.email ?? body.email }, standardCents);
  }

  /** Status only (no personal data) for the post-payment page, which guests also see. */
  @Get("checkout/result/:number")
  async result(@Param("number") number: string, @Req() req: Request) {
    if (await this.limits.hit(`order-lookup:${req.ip}`, 30, 300)) throw new TooManyRequests();
    const o = await this.prisma.order.findUnique({ where: { number: number.slice(0, 40) }, select: { status: true } });
    if (!o) throw new NotFoundException();
    return { status: o.status };
  }

  @Get("orders")
  @UseGuards(AuthGuard)
  async mine(@CurrentUser() user: User) {
    const list = await this.prisma.order.findMany({ where: { userId: user.id, status: { not: "PENDING_PAYMENT" } }, orderBy: { createdAt: "desc" }, include: ORDER_INCLUDE, take: 100 });
    return list.map(publicOrder);
  }

  /** One order: the owner, or anyone with the order number + email (guest checkout). */
  @Get("orders/:number")
  async one(@Param("number") number: string, @Query("email") emailQ: string | undefined, @CurrentUser() user: User | null, @Req() req: Request) {
    if (await this.limits.hit(`order-lookup:${req.ip}`, 30, 300)) throw new TooManyRequests();
    const o = await this.prisma.order.findUnique({ where: { number: number.slice(0, 40) }, include: ORDER_INCLUDE });
    const allowed = o && ((user && (o.userId === user.id || user.role !== "CUSTOMER")) || (emailQ && emailQ.trim().toLowerCase() === o.email));
    if (!o || !allowed) throw new NotFoundException("Order not found. Check the number and email.");
    return publicOrder(o);
  }
}

const StatusFilter = z.enum(["PENDING_PAYMENT", "PAID", "SUBMITTING", "IN_PRODUCTION", "SHIPPED", "DELIVERED", "CANCELED", "NEEDS_ATTENTION"]);
const PRINTIFY_TOPICS = ["order:sent-to-production", "order:shipment:created", "order:shipment:delivered", "order:line-item:canceled", "order:updated"];

@Controller("admin")
@UseGuards(AuthGuard)
@Roles("ADMIN", "STAFF")
export class AdminOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly printify: PrintifyClient,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Get("stats")
  async stats() {
    const [paid, attention, inProd, shipped, revenue] = await Promise.all([
      this.prisma.order.count({ where: { status: "PAID" } }),
      this.prisma.order.count({ where: { status: "NEEDS_ATTENTION" } }),
      this.prisma.order.count({ where: { status: { in: ["SUBMITTING", "IN_PRODUCTION"] } } }),
      this.prisma.order.count({ where: { status: { in: ["SHIPPED", "DELIVERED"] } } }),
      this.prisma.order.aggregate({ _sum: { totalCents: true }, where: { paidAt: { not: null }, status: { not: "CANCELED" } } }),
    ]);
    return { paid, attention, inProduction: inProd, shipped, revenueCents: revenue._sum.totalCents ?? 0 };
  }

  @Get("orders")
  list(@Query("status") status?: string) {
    const s = status ? StatusFilter.safeParse(status) : null;
    return this.prisma.order.findMany({
      where: s?.success ? { status: s.data } : { status: { not: "PENDING_PAYMENT" } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, number: true, email: true, status: true, totalCents: true, currency: true, createdAt: true, paidAt: true, lastError: true },
    });
  }

  @Get("orders/:id")
  async get(@Param("id", ParseUUIDPipe) id: string) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { variant: { include: { product: true } }, designVersion: true } }, payments: true, shipments: true },
    });
    if (!o) throw new NotFoundException();
    return {
      ...o,
      items: o.items.map((i) => ({
        ...i,
        printFiles: Object.fromEntries(
          Object.entries((i.designVersion.printFiles as Record<string, { key: string }>) ?? {}).map(([pos, f]) => [pos, this.storage.signedUrl(f.key)]),
        ),
        preview: i.designVersion.previewKey ? this.storage.signedUrl(i.designVersion.previewKey) : null,
      })),
    };
  }

  /** Re-queue Printify submission for a paid order that failed. */
  @Post("orders/:id/retry")
  @HttpCode(200)
  async retry(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string) {
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id } });
    if (!o.paidAt || !["PAID", "NEEDS_ATTENTION", "SUBMITTING"].includes(o.status)) throw new BadRequestException("Only paid orders that are not in production can be retried.");
    await this.orders.setStatus(o.id, "PAID");
    await this.orders.enqueue(o.id);
    await this.audit.record("order.retry", { actorId: user.id, target: o.number });
    return { ok: true };
  }

  @Patch("orders/:id/status")
  async setStatus(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string, @Body(zodBody(z.object({ status: StatusFilter }))) body: { status: OrderStatus }) {
    const ok = await this.orders.setStatus(id, body.status);
    if (!ok) throw new BadRequestException("That status change is not allowed.");
    await this.audit.record("order.status", { actorId: user.id, target: id, detail: body });
    return { ok };
  }

  /** Register Printify webhooks for this shop (idempotent: skips topics already pointing here). */
  @Post("printify/webhooks")
  @HttpCode(200)
  async registerWebhooks(@CurrentUser() user: User) {
    const secret = process.env.PRINTIFY_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException("PRINTIFY_WEBHOOK_SECRET is not set on the server.");
    const url = `${this.config.publicBaseUrl}/api/v1/webhooks/printify`;
    const existing = await this.printify.listWebhooks();
    const created: string[] = [];
    for (const topic of PRINTIFY_TOPICS) {
      if (existing.some((w) => w.topic === topic && w.url === url)) continue;
      await this.printify.createWebhook(topic, url, secret);
      created.push(topic);
    }
    await this.audit.record("printify.webhooks", { actorId: user.id, detail: { created } });
    return { created, total: PRINTIFY_TOPICS.length };
  }

  @Get("reviews")
  reviews(@Query("status") status = "PENDING") {
    return this.prisma.review.findMany({
      where: { status: status === "APPROVED" ? "APPROVED" : status === "REJECTED" ? "REJECTED" : "PENDING" },
      include: { product: { select: { title: true } }, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  @Patch("reviews/:id")
  moderate(@Param("id", ParseUUIDPipe) id: string, @Body(zodBody(z.object({ status: z.enum(["APPROVED", "REJECTED"]) }))) body: { status: "APPROVED" | "REJECTED" }) {
    return this.prisma.review.update({ where: { id }, data: { status: body.status } });
  }
}

const ReviewIn = z.object({ rating: z.number().int().min(1).max(5), body: z.string().trim().min(5).max(2000) });

@Controller("catalog/products/:slug/reviews")
@UseGuards(AuthGuard)
export class ReviewsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Verified purchases only: the reviewer must have a shipped/delivered order containing the product. */
  @Post()
  async create(@CurrentUser() user: User, @Param("slug") slug: string, @Body(zodBody(ReviewIn)) body: z.infer<typeof ReviewIn>) {
    const product = await this.prisma.product.findUnique({ where: { slug: slug.slice(0, 120) } });
    if (!product) throw new NotFoundException();
    const bought = await this.prisma.orderItem.findFirst({
      where: { variant: { productId: product.id }, order: { userId: user.id, status: { in: ["SHIPPED", "DELIVERED"] } } },
    });
    if (!bought) throw new BadRequestException("You can review products after your order has shipped.");
    return this.prisma.review.upsert({
      where: { productId_userId: { productId: product.id, userId: user.id } },
      create: { productId: product.id, userId: user.id, ...body },
      update: { ...body, status: "PENDING" },
      select: { id: true, status: true },
    });
  }
}

