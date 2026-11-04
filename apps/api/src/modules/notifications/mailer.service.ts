import { Inject, Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { CONFIG, type Config } from "../../config";
import { PrismaService } from "../../prisma.service";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const usd = (cents: number, cur: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(cents / 100);

/** Transactional email. Without SMTP settings, messages are logged (subject + recipient only) instead of sent. */
@Injectable()
export class MailerService {
  private readonly log = new Logger("Mailer");
  private readonly transport: Transporter | null;
  private readonly from = process.env.MAIL_FROM || "Custom Print Studio <no-reply@supersoftltd.com>";

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONFIG) private readonly config: Config,
  ) {
    const host = process.env.SMTP_HOST;
    this.transport = host
      ? nodemailer.createTransport({
          host,
          port: Number(process.env.SMTP_PORT || 587),
          secure: Number(process.env.SMTP_PORT) === 465,
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
        })
      : null;
  }

  get enabled(): boolean {
    return !!this.transport;
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.transport) {
      this.log.log(`(email disabled) to=${to.replace(/(.{2}).*@/, "$1***@")} subject="${subject}"`);
      return;
    }
    await this.transport.sendMail({ from: this.from, to, subject, html });
  }

  private layout(title: string, body: string): string {
    return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#16151a">
      <h2 style="margin:0 0 16px">${esc(title)}</h2>${body}
      <p style="color:#6b6875;font-size:12px;margin-top:32px">Custom Print Studio · ${esc(this.config.publicBaseUrl)}</p></div>`;
  }

  async orderConfirmation(orderId: string): Promise<void> {
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { variant: { include: { product: true } } } } } });
    const rows = o.items
      .map((i) => `<tr><td>${esc(i.variant.product.title)} — ${esc(i.variant.title)} × ${i.quantity}</td><td align="right">${usd(i.unitPriceCents * i.quantity, o.currency)}</td></tr>`)
      .join("");
    await this.send(
      o.email,
      `Order ${o.number} confirmed`,
      this.layout(
        "Thanks for your order!",
        `<p>We received your payment for order <b>${esc(o.number)}</b>. Your products are now being printed — we'll email you the tracking link when it ships.</p>
        <table width="100%" style="font-size:14px">${rows}
        <tr><td>Shipping</td><td align="right">${usd(o.shippingCents, o.currency)}</td></tr>
        ${o.discountCents ? `<tr><td>Discount</td><td align="right">−${usd(o.discountCents, o.currency)}</td></tr>` : ""}
        <tr><td><b>Total</b></td><td align="right"><b>${usd(o.totalCents, o.currency)}</b></td></tr></table>
        <p><a href="${this.config.publicBaseUrl}/orders/${esc(o.number)}">View your order</a></p>`,
      ),
    );
  }

  async shipped(orderId: string, trackingUrl: string | null, carrier: string | null): Promise<void> {
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await this.send(
      o.email,
      `Your order ${o.number} has shipped`,
      this.layout(
        "Your order is on its way",
        `<p>Order <b>${esc(o.number)}</b> has shipped${carrier ? ` with ${esc(carrier)}` : ""}.</p>
        ${trackingUrl && /^https:\/\//.test(trackingUrl) ? `<p><a href="${esc(trackingUrl)}">Track your package</a></p>` : ""}
        <p><a href="${this.config.publicBaseUrl}/orders/${esc(o.number)}">View your order</a></p>`,
      ),
    );
  }
}
