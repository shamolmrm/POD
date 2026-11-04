import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { fromCents, type InitiateInput, type PaymentProvider, toCents, type Verified } from "./provider";

/**
 * SSLCOMMERZ (Bangladesh), API v4. Endpoints from https://developer.sslcommerz.com/doc/v4/ :
 *  - session:    POST {host}/gwprocess/v4/api.php
 *  - validation: GET  {host}/validator/api/validationserverAPI.php?val_id&store_id&store_passwd&format=json
 * The IPN is only a notification: every payment is confirmed through the validation API and
 * checked against our transaction id, amount and currency.
 */
@Injectable()
export class SslcommerzProvider implements PaymentProvider {
  readonly name = "sslcommerz";
  private readonly log = new Logger("SSLCOMMERZ");
  private readonly storeId = process.env.SSLCOMMERZ_STORE_ID ?? "";
  private readonly storePass = process.env.SSLCOMMERZ_STORE_PASSWORD ?? "";
  private readonly host = process.env.SSLCOMMERZ_SANDBOX === "false" ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com";

  get configured(): boolean {
    return !!this.storeId && !!this.storePass;
  }

  async initiate(input: InitiateInput): Promise<{ redirectUrl: string; sessionKey?: string }> {
    if (!this.configured) throw new ServiceUnavailableException("Payments are not enabled yet.");
    const form = new URLSearchParams({
      store_id: this.storeId,
      store_passwd: this.storePass,
      total_amount: fromCents(input.amountCents),
      currency: input.currency,
      tran_id: input.txnId,
      success_url: input.urls.success,
      fail_url: input.urls.fail,
      cancel_url: input.urls.cancel,
      ipn_url: input.urls.ipn,
      cus_name: input.customer.name,
      cus_email: input.customer.email,
      cus_add1: input.customer.address1,
      cus_city: input.customer.city,
      cus_postcode: input.customer.postcode,
      cus_country: input.customer.country,
      cus_phone: input.customer.phone || "N/A",
      shipping_method: "NO", // physical shipping is handled by Printify, not SSLCOMMERZ logistics
      num_of_item: String(input.itemCount),
      product_name: `Order ${input.orderNumber}`,
      product_category: "Custom printed goods",
      product_profile: "physical-goods",
      value_a: input.orderNumber,
    });
    const res = await fetch(`${this.host}/gwprocess/v4/api.php`, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
    const data = (await res.json().catch(() => ({}))) as { status?: string; GatewayPageURL?: string; sessionkey?: string; failedreason?: string };
    if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
      this.log.warn(`session failed: ${data.failedreason ?? res.status}`);
      throw new ServiceUnavailableException("The payment gateway is not available right now. Please try again.");
    }
    return { redirectUrl: data.GatewayPageURL, sessionKey: data.sessionkey };
  }

  async verify(fields: Record<string, string>): Promise<Verified> {
    const valId = fields.val_id;
    const txnId = fields.tran_id;
    if (!valId) return { ok: false, txnId, reason: `not paid (${fields.status ?? "no val_id"})` };
    const url = new URL(`${this.host}/validator/api/validationserverAPI.php`);
    url.search = new URLSearchParams({ val_id: valId, store_id: this.storeId, store_passwd: this.storePass, format: "json" }).toString();
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const v = (await res.json().catch(() => ({}))) as Record<string, string>;
    if (v.status !== "VALID" && v.status !== "VALIDATED") return { ok: false, txnId, reason: `validation ${v.status ?? res.status}`, raw: redact(v) };
    // currency_amount/currency_type = what the customer was charged in our currency (amount is in BDT)
    const amountCents = toCents(v.currency_amount ?? v.amount);
    const currency = (v.currency_type ?? v.currency ?? "").toUpperCase();
    return { ok: true, txnId: v.tran_id, providerTxnId: v.bank_tran_id || valId, amountCents, currency, highRisk: String(v.risk_level) === "1", raw: redact(v) };
  }
}

/** Keep the audit trail useful without storing card details. */
function redact(v: Record<string, string>): Record<string, unknown> {
  const { card_no: _c, store_passwd: _p, ...rest } = v;
  return rest;
}
