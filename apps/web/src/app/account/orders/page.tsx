"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type Order, STATUS_LABEL } from "@/components/order-view";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/utils";

export default function MyOrders() {
  const router = useRouter();
  const [list, setList] = useState<Order[] | null>(null);
  useEffect(() => {
    let alive = true;
    api<Order[]>("/orders")
      .then((o) => alive && setList(o))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login?next=/account/orders");
        else if (alive) setList([]);
      });
    return () => {
      alive = false;
    };
  }, [router]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold">My orders</h1>
        {!list ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : list.length === 0 ? (
          <Card className="text-muted">No orders yet.</Card>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {list.map((o) => (
              <li key={o.number}>
                <Link href={`/orders/${o.number}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-fg/5">
                  <span className="font-medium">{o.number}</span>
                  <span className="text-sm text-muted">{new Date(o.createdAt).toLocaleDateString()}</span>
                  <span className="text-sm">{STATUS_LABEL[o.status] ?? o.status}</span>
                  <span className="text-sm font-medium">{money(o.totalCents, o.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
