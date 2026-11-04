import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { CONFIG, type Config } from "../../config";
import { safeEqual } from "../auth/tokens";

/**
 * Printify REST client. Only endpoints documented at https://developers.printify.com are used.
 * The token stays on the server (Printify has no CORS, and it must never reach a browser).
 */

export class PrintifyError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Printify ${status}: ${typeof body === "string" ? body : JSON.stringify(body).slice(0, 300)}`);
  }
}

export type Blueprint = { id: number; title: string; description: string; brand: string; model: string; images: string[] };
export type PrintProvider = { id: number; title: string; production_time?: { average: number; unit: string } | null };
export type Placeholder = { position: string; decoration_method?: string; height: number; width: number };
export type CatalogVariant = { id: number; title: string; options: Record<string, string>; placeholders: Placeholder[] };
export type ShippingProfile = {
  variant_ids: number[];
  first_item: { cost: number; currency: string };
  additional_items: { cost: number; currency: string };
  countries: string[];
};
export type AddressTo = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  country: string;
  region?: string;
  address1: string;
  address2?: string;
  city: string;
  zip: string;
};
export type ShippingQuote = { standard?: number; express?: number; priority?: number; printify_express?: number; economy?: number };
export type UploadedImage = { id: string; file_name: string; height: number; width: number; size: number; mime_type: string; preview_url: string };
export type ProductImage = { id: string; x: number; y: number; scale: number; angle: number };
export type CreateProduct = {
  title: string;
  description: string;
  blueprint_id: number;
  print_provider_id: number;
  variants: Array<{ id: number; price: number; is_enabled: boolean }>;
  print_areas: Array<{ variant_ids: number[]; placeholders: Array<{ position: string; images: ProductImage[] }> }>;
};
export type CreatedProduct = { id: string; variants: Array<{ id: number; sku: string; cost: number; price: number; is_enabled: boolean }> };

const BASE = "https://api.printify.com/v1";

@Injectable()
export class PrintifyClient {
  private readonly log = new Logger("Printify");
  private readonly token = process.env.PRINTIFY_API_TOKEN ?? "";
  private readonly shopId = process.env.PRINTIFY_SHOP_ID ?? "";
  private readonly userAgent: string;

  constructor(@Inject(CONFIG) config: Config) {
    this.userAgent = process.env.PRINTIFY_USER_AGENT || `${new URL(config.publicBaseUrl).host} (custom store)`;
  }

  get configured(): boolean {
    return !!this.token;
  }

  get shopConfigured(): boolean {
    return !!this.token && !!this.shopId;
  }

  // ── catalog ──
  shops() {
    return this.call<Array<{ id: number; title: string; sales_channel: string }>>("GET", "/shops.json");
  }
  blueprints() {
    return this.call<Blueprint[]>("GET", "/catalog/blueprints.json");
  }
  providers(blueprintId: number) {
    return this.call<PrintProvider[]>("GET", `/catalog/blueprints/${blueprintId}/print_providers.json`);
  }
  variants(blueprintId: number, providerId: number) {
    return this.call<{ id: number; title: string; variants: CatalogVariant[] }>(
      "GET",
      `/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json`,
    );
  }
  shipping(blueprintId: number, providerId: number) {
    return this.call<{ handling_time: { value: number; unit: string }; profiles: ShippingProfile[] }>(
      "GET",
      `/catalog/blueprints/${blueprintId}/print_providers/${providerId}/shipping.json`,
    );
  }

  // ── uploads / products / orders (shop scoped) ──
  uploadByUrl(fileName: string, url: string) {
    return this.call<UploadedImage>("POST", "/uploads/images.json", { file_name: fileName, url });
  }
  createProduct(body: CreateProduct) {
    return this.call<CreatedProduct>("POST", `/shops/${this.shop()}/products.json`, body);
  }
  calculateShipping(body: {
    line_items: Array<{ print_provider_id: number; blueprint_id: number; variant_id: number; quantity: number }>;
    address_to: Partial<AddressTo> & { country: string };
  }) {
    return this.call<ShippingQuote>("POST", `/shops/${this.shop()}/orders/shipping.json`, body);
  }
  createOrder(body: {
    external_id: string;
    label?: string;
    line_items: Array<{ product_id: string; variant_id: number; quantity: number; external_id?: string }>;
    shipping_method: number;
    send_shipping_notification: boolean;
    address_to: AddressTo;
  }) {
    return this.call<{ id: string }>("POST", `/shops/${this.shop()}/orders.json`, body);
  }
  sendToProduction(orderId: string) {
    return this.call<unknown>("POST", `/shops/${this.shop()}/orders/${orderId}/send_to_production.json`);
  }
  getOrder(orderId: string) {
    return this.call<{ id: string; status: string }>("GET", `/shops/${this.shop()}/orders/${orderId}.json`);
  }
  listWebhooks() {
    return this.call<Array<{ id: string; topic: string; url: string }>>("GET", `/shops/${this.shop()}/webhooks.json`);
  }
  createWebhook(topic: string, url: string, secret: string) {
    return this.call<{ id: string }>("POST", `/shops/${this.shop()}/webhooks.json`, { topic, url, secret });
  }

  private shop(): string {
    if (!this.shopId) throw new ServiceUnavailableException("Printify shop is not configured (PRINTIFY_SHOP_ID).");
    return this.shopId;
  }

  private async call<T>(method: string, path: string, body?: unknown, attempt = 1): Promise<T> {
    if (!this.token) throw new ServiceUnavailableException("Printify is not connected yet (PRINTIFY_API_TOKEN).");
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "User-Agent": this.userAgent,
        "Content-Type": "application/json;charset=utf-8",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 429 && attempt < 4) {
      const wait = Number(res.headers.get("retry-after") ?? 2 ** attempt) * 1000;
      this.log.warn(`429 on ${path}, retrying in ${wait} ms`);
      await new Promise((r) => setTimeout(r, wait));
      return this.call<T>(method, path, body, attempt + 1);
    }
    const text = await res.text();
    const data = text ? safeJson(text) : undefined;
    if (!res.ok) throw new PrintifyError(res.status, data ?? text);
    return data as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** `X-Pfy-Signature: sha256=<hex HMAC-SHA256 of the raw body>` (Printify webhook docs). */
export function verifyPrintifySignature(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(header.slice(7), expected);
}
