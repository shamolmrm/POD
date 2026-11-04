"use client";

import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui";

export default function AdminHome() {
  return (
    <AdminShell title="Admin">
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/products">
          <Card className="hover:border-accent">
            <h2 className="font-semibold">Products</h2>
            <p className="mt-1 text-sm text-muted">Import from Printify, set prices, publish.</p>
          </Card>
        </Link>
        <Link href="/admin/orders">
          <Card className="hover:border-accent">
            <h2 className="font-semibold">Orders</h2>
            <p className="mt-1 text-sm text-muted">Paid orders, Printify status, tracking.</p>
          </Card>
        </Link>
      </div>
    </AdminShell>
  );
}
