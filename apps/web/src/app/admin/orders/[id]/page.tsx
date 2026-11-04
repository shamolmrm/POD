"use client";

import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { STATUS_LABEL } from "@/components/order-view";
import { Alert, Button, Card } from "@/components/ui";
import { api, errorText, post } from "@/lib/api";
import { money } from "@/lib/utils";

type AdminOrder = {
  id: string;
  number: string;
  email: string;
  status: string;
  currency: string;
  totalCents: number;
  shippingCents: number;
  discountCents: number;
  printifyOrderId: string | null;
  lastError: string | null;
  paidAt: string | null;
  createdAt: string;
  shippingAddress: Record<string, string>;
  payments: Array<{ id: string; provider: string; status: string; amountCents: number; currency: string; providerTxnId: string | null }>;
  shipments: Array<{ carrier: string | null; trackingNumber: string | null; trackingUrl: string | null }>;
  items: Array<{ id: string; quantity: number; unitPriceCents: number; printifyProductId: string | null; variant: { title: string; product: { title: string } }; printFiles: Record<string, string>; preview: string | null }>;
};

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [o, setO] = useState<AdminOrder | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const load = useCallback(() => api<AdminOrder>(`/admin/orders/${id}`).then(setO), [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after the fetch resolves
    void load();
  }, [load]);

  async function act(p: Promise<unknown>, ok: string) {
    try {
      await p;
      setMsg({ tone: "success", text: ok });
      void load();
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err) });
    }
  }

  if (!o) return <AdminShell title="Order">{null}</AdminShell>;
  const a = o.shippingAddress;
  return (
    <AdminShell
      title={`Order ${o.number}`}
      actions={
        <div className="flex gap-2">
          {o.paidAt && ["PAID", "NEEDS_ATTENTION", "SUBMITTING"].includes(o.status) && (
            <Button size="sm" variant="accent" onClick={() => act(post(`/admin/orders/${o.id}/retry`), "Queued for Printify.")}>
              Send to Printify
            </Button>
          )}
          {o.status !== "CANCELED" && o.status !== "DELIVERED" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.confirm("Mark as canceled? Refund the customer in the payment gateway separately.") && act(api(`/admin/orders/${o.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "CANCELED" }) }), "Marked canceled.")}
            >
              Cancel
            </Button>
          )}
        </div>
      }
    >
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {o.lastError && <Alert tone="error">{o.lastError}</Alert>}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="text-sm">
          <h2 className="mb-3 font-semibold">Status</h2>
          <p>{STATUS_LABEL[o.status] ?? o.status}</p>
          <p className="text-muted">Printify order: {o.printifyOrderId ?? "—"}</p>
          <p className="text-muted">Paid: {o.paidAt ? new Date(o.paidAt).toLocaleString() : "no"}</p>
          {o.payments.map((p) => (
            <p key={p.id} className="text-muted">
              {p.provider}: {p.status} · {money(p.amountCents, p.currency)} · {p.providerTxnId ?? "—"}
            </p>
          ))}
          {o.shipments.map((s, i) => (
            <p key={i}>
              Shipment: {s.carrier} {s.trackingNumber}{" "}
              {s.trackingUrl?.startsWith("https://") && (
                <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-accent">
                  track
                </a>
              )}
            </p>
          ))}
        </Card>
        <Card className="text-sm">
          <h2 className="mb-3 font-semibold">Ship to</h2>
          <p>
            {a.firstName} {a.lastName} · {o.email} {a.phone && `· ${a.phone}`}
          </p>
          <p className="text-muted">{[a.line1, a.line2, a.city, a.region, a.postalCode, a.country].filter(Boolean).join(", ")}</p>
          <p className="mt-3 font-medium">Total {money(o.totalCents, o.currency)}</p>
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="mb-3 font-semibold">Items</h2>
        <ul className="grid gap-4">
          {o.items.map((i) => (
            <li key={i.id} className="flex gap-4 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {i.preview && <img src={i.preview} alt="" className="h-24 w-24 rounded-lg border border-line object-contain" />}
              <div>
                <div className="font-medium">
                  {i.variant.product.title} — {i.variant.title} × {i.quantity}
                </div>
                <div className="text-muted">Printify product: {i.printifyProductId ?? "not created yet"}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {Object.entries(i.printFiles).map(([pos, url]) => (
                    <a key={pos} href={url} target="_blank" rel="noopener" className="text-accent">
                      {pos} print file
                    </a>
                  ))}
                </div>
              </div>
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
      <OrderDetail />
    </Suspense>
  );
}
