"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Alert, Button, buttonVariants, Card, Input } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import type { CartView } from "@/lib/cart";
import { money } from "@/lib/utils";

export default function CartPage() {
  const [cart, setCart] = useState<CartView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    let alive = true;
    api<CartView>("/cart")
      .then((c) => alive && setCart(c))
      .catch((err) => alive && setError(errorText(err)));
    return () => {
      alive = false;
    };
  }, []);

  async function run(p: Promise<CartView>) {
    setError(null);
    try {
      setCart(await p);
    } catch (err) {
      setError(errorText(err));
    }
  }

  const items = cart?.items ?? [];
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold">Your cart</h1>
        {error && <Alert tone="error">{error}</Alert>}
        {!cart ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <Card className="text-center">
            <p className="mb-4 text-muted">Your cart is empty.</p>
            <Link href="/products" className={buttonVariants({ variant: "accent" })}>
              Start designing
            </Link>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-[1fr_320px]">
            <ul className="grid content-start gap-3">
              {items.map((i) => (
                <li key={i.id} className="flex gap-4 rounded-2xl border border-line p-3">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-line bg-fg/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {(i.design.preview ?? i.product.image) && <img src={i.design.preview ?? i.product.image!} alt="" className="h-full w-full object-contain" />}
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium">{i.product.title}</div>
                    <div className="text-muted">{i.variant.title}</div>
                    <div className="text-muted">
                      Design:{" "}
                      <Link href={`/design/${i.product.slug}?d=${i.design.id}`} className="text-accent">
                        {i.design.name}
                      </Link>
                    </div>
                    {!i.available && <div className="text-red-600">No longer available — please remove.</div>}
                    <div className="mt-2 flex items-center gap-2">
                      <label className="flex items-center gap-1">
                        Qty
                        <select
                          value={i.quantity}
                          onChange={(e) => run(api(`/cart/items/${i.id}`, { method: "PATCH", body: JSON.stringify({ quantity: Number(e.target.value) }) }))}
                          className="h-8 rounded-lg border border-line bg-bg px-1"
                        >
                          {Array.from({ length: 20 }, (_, n) => n + 1).map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => run(api(`/cart/items/${i.id}`, { method: "DELETE" }))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm font-medium">{money(i.unitPriceCents * i.quantity)}</div>
                </li>
              ))}
            </ul>
            <Card className="h-fit">
              <h2 className="mb-4 font-semibold">Summary</h2>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-muted">Subtotal</dt>
                <dd className="text-right">{money(cart.subtotalCents)}</dd>
                {cart.discountCents > 0 && (
                  <>
                    <dt className="text-muted">Discount ({cart.couponCode})</dt>
                    <dd className="text-right text-emerald-600">−{money(cart.discountCents)}</dd>
                  </>
                )}
                <dt className="text-muted">Shipping</dt>
                <dd className="text-right text-muted">at checkout</dd>
              </dl>
              {cart.couponError && <p className="mt-2 text-xs text-red-600">{cart.couponError}</p>}
              {cart.couponCode ? (
                <button className="mt-2 text-xs text-muted underline" onClick={() => run(api("/cart/coupon", { method: "DELETE" }))}>
                  Remove code {cart.couponCode}
                </button>
              ) : (
                <form
                  className="mt-4 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (code.trim()) void run(api("/cart/coupon", { method: "POST", body: JSON.stringify({ code }) }));
                  }}
                >
                  <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Discount code" aria-label="Discount code" />
                  <Button type="submit" variant="outline">
                    Apply
                  </Button>
                </form>
              )}
              <Link href="/checkout" className={buttonVariants({ variant: "accent", size: "lg", className: "mt-6 w-full" })}>
                Checkout
              </Link>
            </Card>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
