"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { type Order, OrderView, STATUS_LABEL } from "@/components/order-view";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Alert, Button, Card, Field } from "@/components/ui";
import { api, errorText } from "@/lib/api";

function OrderPage() {
  const { number } = useParams<{ number: string }>();
  const emailParam = useSearchParams().get("email");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needEmail, setNeedEmail] = useState(false);

  async function load(email?: string | null) {
    try {
      setOrder(await api<Order>(`/orders/${encodeURIComponent(number)}${email ? `?email=${encodeURIComponent(email)}` : ""}`));
      setError(null);
      setNeedEmail(false);
    } catch (err) {
      if (!email) setNeedEmail(true);
      else setError(errorText(err));
    }
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after the fetch resolves
    void load(emailParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number, emailParam]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Order {number}</h1>
      {order && <p className="mb-6 text-muted">{STATUS_LABEL[order.status] ?? order.status}</p>}
      {error && <Alert tone="error">{error}</Alert>}
      {needEmail && !order && (
        <Card className="mt-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load(String(new FormData(e.currentTarget).get("email")));
            }}
          >
            <Field id="email" name="email" type="email" label="Enter the email used for this order" required />
            <Button type="submit">View order</Button>
          </form>
        </Card>
      )}
      {order && <OrderView o={order} />}
    </main>
  );
}

export default function Page() {
  return (
    <>
      <SiteHeader />
      <Suspense>
        <OrderPage />
      </Suspense>
      <SiteFooter />
    </>
  );
}
