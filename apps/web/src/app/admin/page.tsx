"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Alert, Button, Card } from "@/components/ui";
import { api, errorText, post } from "@/lib/api";
import { money } from "@/lib/utils";

type Stats = { paid: number; attention: number; inProduction: number; shipped: number; revenueCents: number };

export default function AdminHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    api<Stats>("/admin/stats").then(setStats).catch(() => undefined);
  }, []);

  async function webhooks() {
    try {
      const r = await post<{ created: string[]; total: number }>("/admin/printify/webhooks");
      setMsg({ tone: "success", text: r.created.length ? `Registered ${r.created.length} Printify webhooks.` : "Printify webhooks are already registered." });
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err) });
    }
  }

  const tiles: Array<[string, string | number, string]> = stats
    ? [
        ["Needs attention", stats.attention, "/admin/orders?status=NEEDS_ATTENTION"],
        ["Paid, not yet sent", stats.paid, "/admin/orders?status=PAID"],
        ["In production", stats.inProduction, "/admin/orders?status=IN_PRODUCTION"],
        ["Shipped / delivered", stats.shipped, "/admin/orders?status=SHIPPED"],
        ["Revenue (paid)", money(stats.revenueCents), "/admin/orders"],
      ]
    : [];
  return (
    <AdminShell
      title="Overview"
      actions={
        <Button variant="outline" size="sm" onClick={webhooks}>
          Register Printify webhooks
        </Button>
      }
    >
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {tiles.map(([label, value, href]) => (
          <Link key={label} href={href}>
            <Card className="p-4 hover:border-accent">
              <div className="text-xs text-muted">{label}</div>
              <div className={`mt-1 text-2xl font-semibold ${label === "Needs attention" && Number(value) > 0 ? "text-red-600" : ""}`}>{value}</div>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          ["/admin/products", "Products", "Import from Printify, set prices, publish."],
          ["/admin/coupons", "Coupons", "Discount codes and limits."],
          ["/admin/reviews", "Reviews", "Approve verified-purchase reviews."],
        ].map(([href, title, text]) => (
          <Link key={href} href={href}>
            <Card className="hover:border-accent">
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </Card>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
