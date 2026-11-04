"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Alert, Button, Card, Field, Label } from "@/components/ui";
import { api, errorText, useSession } from "@/lib/api";
import { COUNTRIES, type CartView } from "@/lib/cart";
import { money } from "@/lib/utils";

type Status = { paymentsEnabled: boolean };
type Address = { firstName: string; lastName: string; phone: string | null; line1: string; line2: string | null; city: string; region: string | null; postalCode: string; country: string; isDefault: boolean };

export default function CheckoutPage() {
  const { user } = useSession();
  const [cart, setCart] = useState<CartView | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [saved, setSaved] = useState<Address | null>(null);
  const [shipping, setShipping] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<CartView>("/cart").then((c) => alive && setCart(c));
    api<Status>("/checkout/status").then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    api<Address[]>("/account/addresses").then((list) => alive && setSaved(list.find((a) => a.isDefault) ?? list[0] ?? null));
    return () => {
      alive = false;
    };
  }, [user]);

  async function quote(form: HTMLFormElement) {
    const f = new FormData(form);
    if (!f.get("country")) return;
    try {
      const q = await api<{ standardCents: number }>("/cart/shipping", {
        method: "POST",
        body: JSON.stringify({ country: f.get("country"), region: f.get("region") || undefined, zip: f.get("postalCode") || undefined, city: f.get("city") || undefined }),
      });
      setShipping(q.standardCents);
      setError(null);
    } catch (err) {
      setShipping(null);
      setError(errorText(err));
    }
  }

  async function pay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError(null);
    try {
      const { email, ...address } = f;
      const r = await api<{ redirectUrl: string }>("/checkout", { method: "POST", body: JSON.stringify({ email: email ?? user?.email, address }) });
      window.location.href = r.redirectUrl; // the payment gateway's hosted page
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const v = (k: keyof Address) => (saved?.[k] as string | null) ?? "";
  const items = cart?.items ?? [];
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold">Checkout</h1>
        {status && !status.paymentsEnabled && (
          <Alert>Online payment is being set up and will open soon. You can still save designs and fill your cart.</Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        {cart && items.length === 0 ? (
          <p className="text-muted">
            Your cart is empty. <Link href="/products" className="text-accent">Browse products</Link>
          </p>
        ) : (
          <form key={saved ? "saved" : "blank"} onSubmit={pay} onBlur={(e) => void quote(e.currentTarget)} className="grid gap-6 md:grid-cols-[1fr_320px]">
            <Card>
              <h2 className="mb-4 font-semibold">Shipping address</h2>
              {!user && (
                <>
                  <Field id="email" name="email" type="email" label="Email (for your receipt and tracking)" required autoComplete="email" />
                  <p className="-mt-2 mb-4 text-xs text-muted">
                    Have an account? <Link href="/login?next=/checkout" className="text-accent">Sign in</Link>
                  </p>
                </>
              )}
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field id="firstName" name="firstName" label="First name" required defaultValue={v("firstName")} autoComplete="given-name" />
                <Field id="lastName" name="lastName" label="Last name" required defaultValue={v("lastName")} autoComplete="family-name" />
                <Field id="line1" name="line1" label="Address" required defaultValue={v("line1")} autoComplete="address-line1" />
                <Field id="line2" name="line2" label="Apartment, suite (optional)" defaultValue={v("line2")} autoComplete="address-line2" />
                <Field id="city" name="city" label="City" required defaultValue={v("city")} autoComplete="address-level2" />
                <Field id="region" name="region" label="State / region" defaultValue={v("region")} autoComplete="address-level1" />
                <Field id="postalCode" name="postalCode" label="Postal code" required defaultValue={v("postalCode")} autoComplete="postal-code" />
                <div className="mb-4">
                  <Label htmlFor="country">Country</Label>
                  <select id="country" name="country" required defaultValue={v("country") || ""} className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm" autoComplete="country">
                    <option value="" disabled>
                      Choose…
                    </option>
                    {COUNTRIES.map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <Field id="phone" name="phone" type="tel" label="Phone (for the courier)" defaultValue={v("phone")} autoComplete="tel" />
              </div>
            </Card>
            <Card className="h-fit">
              <h2 className="mb-4 font-semibold">Order summary</h2>
              {cart && (
                <dl className="grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-muted">Items ({items.reduce((s, i) => s + i.quantity, 0)})</dt>
                  <dd className="text-right">{money(cart.subtotalCents)}</dd>
                  {cart.discountCents > 0 && (
                    <>
                      <dt className="text-muted">Discount</dt>
                      <dd className="text-right text-emerald-600">−{money(cart.discountCents)}</dd>
                    </>
                  )}
                  <dt className="text-muted">Shipping</dt>
                  <dd className="text-right">{shipping === null ? "enter address" : money(shipping)}</dd>
                  <dt className="font-semibold">Total</dt>
                  <dd className="text-right font-semibold">{money(cart.subtotalCents - cart.discountCents + (shipping ?? 0))}</dd>
                </dl>
              )}
              <Button type="submit" variant="accent" size="lg" className="mt-6 w-full" disabled={busy || !status?.paymentsEnabled || shipping === null}>
                {busy ? "Redirecting to payment…" : "Pay securely"}
              </Button>
              <p className="mt-3 text-xs text-muted">You will pay on the payment provider&apos;s secure page. We never see your card number.</p>
            </Card>
          </form>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
