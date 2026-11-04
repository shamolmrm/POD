"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { STATUS_LABEL } from "@/components/order-view";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { buttonVariants, Card } from "@/components/ui";
import { api } from "@/lib/api";

function Result() {
  const number = useSearchParams().get("order");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!number) return;
    let alive = true;
    // the page only reports what the server recorded after verifying with the gateway
    api<{ status: string }>(`/checkout/result/${encodeURIComponent(number)}`)
      .then((o) => alive && setStatus(o.status))
      .catch(() => alive && setStatus("UNKNOWN"));
    return () => {
      alive = false;
    };
  }, [number]);

  const paid = status && status !== "PENDING_PAYMENT" && status !== "UNKNOWN" && status !== "CANCELED";
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <Card className="text-center">
        {!number ? (
          <p>We could not match this payment to an order. If you were charged, contact us with your receipt.</p>
        ) : status === null ? (
          <p className="text-muted">Checking your payment…</p>
        ) : paid ? (
          <>
            <h1 className="text-2xl font-semibold">Thank you! 🎉</h1>
            <p className="mt-2 text-muted">
              Payment received for order <b>{number}</b> ({STATUS_LABEL[status] ?? status}). A confirmation email is on its way.
            </p>
            <Link href={`/orders/${number}`} className={buttonVariants({ variant: "accent", className: "mt-6" })}>
              View order
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Payment not completed</h1>
            <p className="mt-2 text-muted">Order {number} has not been paid. Nothing was charged by us — your cart is still saved.</p>
            <Link href="/cart" className={buttonVariants({ variant: "accent", className: "mt-6" })}>
              Back to cart
            </Link>
          </>
        )}
      </Card>
    </main>
  );
}

export default function Page() {
  return (
    <>
      <SiteHeader />
      <Suspense>
        <Result />
      </Suspense>
      <SiteFooter />
    </>
  );
}
