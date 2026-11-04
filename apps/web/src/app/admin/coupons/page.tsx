"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Alert, Button, Card, Field, Label } from "@/components/ui";
import { api, errorText, post } from "@/lib/api";
import { money } from "@/lib/utils";

type Coupon = { id: string; code: string; type: "PERCENT" | "FIXED"; value: number; minSubtotal: number; maxRedemptions: number | null; redeemed: number; endsAt: string | null; isActive: boolean };

export default function Coupons() {
  const [list, setList] = useState<Coupon[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    api<Coupon[]>("/admin/coupons").then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, [tick]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const type = f.get("type") as "PERCENT" | "FIXED";
    try {
      await post("/admin/coupons", {
        code: f.get("code"),
        type,
        value: type === "PERCENT" ? Number(f.get("value")) : Math.round(Number(f.get("value")) * 100),
        minSubtotal: Math.round(Number(f.get("min") || 0) * 100),
        maxRedemptions: f.get("max") ? Number(f.get("max")) : null,
        endsAt: f.get("ends") ? new Date(String(f.get("ends"))).toISOString() : null,
      });
      form.reset();
      setError(null);
      setTick((t) => t + 1);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <AdminShell title="Coupons">
      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">New coupon</h2>
        {error && <Alert tone="error">{error}</Alert>}
        <form onSubmit={create} className="grid gap-x-4 sm:grid-cols-3">
          <Field id="code" name="code" label="Code" required placeholder="WELCOME10" />
          <div className="mb-4">
            <Label htmlFor="type">Type</Label>
            <select id="type" name="type" className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm">
              <option value="PERCENT">Percent off</option>
              <option value="FIXED">Fixed amount (USD)</option>
            </select>
          </div>
          <Field id="value" name="value" type="number" step="0.01" min="0.01" label="Value" required />
          <Field id="min" name="min" type="number" step="0.01" min="0" label="Minimum order (USD)" />
          <Field id="max" name="max" type="number" min="1" label="Max uses (blank = unlimited)" />
          <Field id="ends" name="ends" type="date" label="Ends on (optional)" />
          <Button type="submit">Create coupon</Button>
        </form>
      </Card>
      <Card className="p-0">
        <ul className="divide-y divide-line text-sm">
          {list.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span className="font-mono font-medium">{c.code}</span>
              <span>{c.type === "PERCENT" ? `${c.value}% off` : `${money(c.value)} off`}</span>
              <span className="text-muted">
                used {c.redeemed}
                {c.maxRedemptions ? `/${c.maxRedemptions}` : ""} {c.endsAt && `· ends ${new Date(c.endsAt).toLocaleDateString()}`}
              </span>
              <Button size="sm" variant="outline" onClick={() => api(`/admin/coupons/${c.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !c.isActive }) }).then(() => setTick((t) => t + 1))}>
                {c.isActive ? "Disable" : "Enable"}
              </Button>
            </li>
          ))}
          {list.length === 0 && <li className="p-4 text-muted">No coupons yet.</li>}
        </ul>
      </Card>
    </AdminShell>
  );
}
