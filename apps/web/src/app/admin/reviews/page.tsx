"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";

type Review = { id: string; rating: number; body: string; status: string; createdAt: string; product: { title: string }; user: { name: string; email: string } };

export default function Reviews() {
  const [status, setStatus] = useState("PENDING");
  const [list, setList] = useState<Review[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    api<Review[]>(`/admin/reviews?status=${status}`).then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, [status, tick]);

  const moderate = (id: string, s: "APPROVED" | "REJECTED") =>
    api(`/admin/reviews/${id}`, { method: "PATCH", body: JSON.stringify({ status: s }) }).then(() => setTick((t) => t + 1));

  return (
    <AdminShell
      title="Reviews"
      actions={
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-line bg-bg px-2 text-sm" aria-label="Filter">
          <option value="PENDING">Waiting for approval</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      }
    >
      <Card className="p-0">
        <ul className="divide-y divide-line text-sm">
          {list.map((r) => (
            <li key={r.id} className="grid gap-2 p-4">
              <div className="font-medium">
                {"★".repeat(r.rating)} · {r.product.title} · {r.user.name} ({r.user.email})
              </div>
              <p className="text-muted">{r.body}</p>
              {status === "PENDING" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => moderate(r.id, "APPROVED")}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => moderate(r.id, "REJECTED")}>
                    Reject
                  </Button>
                </div>
              )}
            </li>
          ))}
          {list.length === 0 && <li className="p-4 text-muted">Nothing here.</li>}
        </ul>
      </Card>
    </AdminShell>
  );
}
