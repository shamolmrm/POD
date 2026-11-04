"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { STATUS_LABEL } from "@/components/order-view";
import { Card } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/utils";

type Row = { id: string; number: string; email: string; status: string; totalCents: number; currency: string; createdAt: string; lastError: string | null };

function Orders() {
  const router = useRouter();
  const status = useSearchParams().get("status") ?? "";
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let alive = true;
    api<Row[]>(`/admin/orders${status ? `?status=${status}` : ""}`).then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, [status]);

  return (
    <AdminShell
      title="Orders"
      actions={
        <select value={status} onChange={(e) => router.push(`/admin/orders${e.target.value ? `?status=${e.target.value}` : ""}`)} className="h-9 rounded-lg border border-line bg-bg px-2 text-sm" aria-label="Filter by status">
          <option value="">All paid orders</option>
          {Object.entries(STATUS_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      }
    >
      <Card className="p-0">
        {rows?.length === 0 && <p className="p-6 text-sm text-muted">No orders.</p>}
        <ul className="divide-y divide-line text-sm">
          {rows?.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/orders/${o.id}`} className="grid gap-1 p-4 hover:bg-fg/5 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center sm:gap-4">
                <span className="font-medium">{o.number}</span>
                <span className="truncate text-muted">{o.email}</span>
                <span className={o.status === "NEEDS_ATTENTION" ? "text-red-600" : ""}>{STATUS_LABEL[o.status] ?? o.status}</span>
                <span className="font-medium">{money(o.totalCents, o.currency)}</span>
                {o.lastError && <span className="text-xs text-red-600 sm:col-span-4">{o.lastError}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </AdminShell>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Orders />
    </Suspense>
  );
}
