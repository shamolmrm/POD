/**
 * Payment gateway abstraction. An order becomes PAID only from `verify()`, which must confirm the
 * payment server-to-server with the gateway; browser redirects and IPN bodies are never trusted alone.
 */

export type InitiateInput = {
  txnId: string; // our Payment.id, echoed back by the gateway
  orderNumber: string;
  amountCents: number;
  currency: string;
  customer: { name: string; email: string; phone?: string; address1: string; city: string; postcode: string; country: string };
  itemCount: number;
  urls: { success: string; fail: string; cancel: string; ipn: string };
};

export type Verified =
  | { ok: true; txnId: string; providerTxnId: string; amountCents: number; currency: string; highRisk: boolean; raw: Record<string, unknown> }
  | { ok: false; txnId?: string; reason: string; raw?: Record<string, unknown> };

export interface PaymentProvider {
  readonly name: string;
  readonly configured: boolean;
  initiate(input: InitiateInput): Promise<{ redirectUrl: string; sessionKey?: string }>;
  /** Called with the fields the gateway POSTed (IPN or browser return). Must re-check with the gateway. */
  verify(fields: Record<string, string>): Promise<Verified>;
}

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

/** "12.50" / "12.5" / "12" → 1250; anything else → NaN. */
export function toCents(amount: string | number | undefined): number {
  const s = String(amount ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return Number.NaN;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
