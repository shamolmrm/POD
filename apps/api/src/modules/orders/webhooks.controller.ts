import { Body, Controller, ForbiddenException, Headers, HttpCode, Inject, Logger, Post, type RawBodyRequest, Req, Res } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { CONFIG, type Config } from "../../config";
import { PrismaService } from "../../prisma.service";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../payments/provider";
import { verifyPrintifySignature } from "../printify/printify.client";
import { FulfillmentService } from "./fulfillment.service";
import { OrdersService } from "./orders.service";

/** Server-to-server callbacks. Exempt from the Origin check; each is verified on its own terms. */
@Controller("webhooks")
export class WebhooksController {
  private readonly log = new Logger("Webhooks");

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly fulfillment: FulfillmentService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** Gateway IPN (form-encoded). Verified with the gateway's validation API before anything changes. */
  @Post("payments/sslcommerz")
  @HttpCode(200)
  async ipn(@Body() body: Record<string, string>) {
    const v = await this.provider.verify(body ?? {});
    await this.orders.applyPayment(v);
    return { ok: true };
  }

  /** The customer's browser comes back here from the gateway; verify, then send them to the result page. */
  @Post("payments/sslcommerz/return")
  async browserReturn(@Body() body: Record<string, string>, @Res() res: Response) {
    let number: string | undefined;
    try {
      number = (await this.orders.applyPayment(await this.provider.verify(body ?? {}))).orderNumber;
    } catch (err) {
      this.log.error(`return: ${(err as Error).message}`);
    }
    const target = number ? `/checkout/result?order=${encodeURIComponent(number)}` : "/checkout/result";
    res.redirect(303, `${this.config.publicBaseUrl}${target}`);
  }

  /** Printify events, HMAC-signed (X-Pfy-Signature). Stored once per event id, then applied. */
  @Post("printify")
  @HttpCode(200)
  async printify(@Req() req: RawBodyRequest<Request>, @Headers("x-pfy-signature") signature: string | undefined) {
    const secret = process.env.PRINTIFY_WEBHOOK_SECRET ?? "";
    if (!req.rawBody || !verifyPrintifySignature(req.rawBody, signature, secret)) throw new ForbiddenException("Bad signature");
    const event = req.body as { id?: string; type?: string; resource?: { id?: string; data?: Record<string, unknown> } };
    if (!event?.id || !event.type) return { ok: true };
    try {
      await this.prisma.webhookEvent.create({ data: { source: "printify", eventId: String(event.id), topic: event.type, payload: event as Prisma.InputJsonValue } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: true, duplicate: true };
      throw err;
    }
    try {
      await this.fulfillment.onPrintifyEvent(event.type, event.resource ?? {});
      await this.prisma.webhookEvent.updateMany({ where: { source: "printify", eventId: String(event.id) }, data: { processedAt: new Date() } });
    } catch (err) {
      await this.prisma.webhookEvent.updateMany({ where: { source: "printify", eventId: String(event.id) }, data: { error: (err as Error).message.slice(0, 500) } });
      this.log.error(`printify ${event.type}: ${(err as Error).message}`);
    }
    return { ok: true };
  }
}
