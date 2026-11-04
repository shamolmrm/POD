"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Alert, Button, Card, Input, Label } from "@/components/ui";
import { api, errorText, post } from "@/lib/api";

type Status = { connected: boolean; shopConfigured: boolean; shops: Array<{ id: number; title: string; salesChannel: string }>; error?: string };
type Blueprint = { id: number; title: string; brand: string; model: string; image: string | null };
type Provider = { id: number; title: string; production_time?: { average: number; unit: string } | null };
type Row = { id: string; slug: string; title: string; status: string; printifyBlueprintId: number; _count: { variants: number }; category: { name: string } | null };

function Importer({ onImported }: { onImported: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Blueprint[] | null>(null);
  const [picked, setPicked] = useState<Blueprint | null>(null);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setResults(await api<Blueprint[]>(`/admin/catalog/printify/blueprints?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function pick(b: Blueprint) {
    setPicked(b);
    setProviders(null);
    try {
      setProviders(await api<Provider[]>(`/admin/catalog/printify/blueprints/${b.id}/providers`));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function importIt(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await post("/admin/catalog/import", {
        blueprintId: picked.id,
        providerId: Number(f.get("provider")),
        title: f.get("title") || undefined,
        priceCents: Math.round(Number(f.get("price")) * 100),
      });
      setPicked(null);
      setResults(null);
      onImported();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-semibold">Add a product from Printify</h2>
      <p className="mb-4 text-sm text-muted">Search the Printify catalog, choose a print provider, set your selling price.</p>
      {error && <Alert tone="error">{error}</Alert>}
      <form onSubmit={search} className="mb-4 flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. unisex tee, mug, hoodie, poster" />
        <Button type="submit">Search</Button>
      </form>
      {results && !picked && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((b) => (
            <li key={b.id}>
              <button onClick={() => pick(b)} className="flex w-full gap-3 rounded-xl border border-line p-2 text-left hover:border-accent">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.image && <img src={b.image} alt="" className="h-16 w-16 rounded-lg object-cover" />}
                <span className="text-sm">
                  <span className="font-medium">{b.title}</span>
                  <span className="block text-xs text-muted">
                    {b.brand} {b.model}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="text-sm text-muted">No matches.</li>}
        </ul>
      )}
      {picked && (
        <form onSubmit={importIt} className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
          <div className="sm:col-span-2 text-sm">
            Selected: <span className="font-medium">{picked.title}</span>{" "}
            <button type="button" className="text-accent" onClick={() => setPicked(null)}>
              change
            </button>
          </div>
          <div>
            <Label htmlFor="provider">Print provider</Label>
            <select id="provider" name="provider" required className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm">
              {!providers && <option>Loading…</option>}
              {providers?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.production_time ? ` · ~${p.production_time.average} ${p.production_time.unit.replace("_", " ")}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="price">Selling price (USD)</Label>
            <Input id="price" name="price" type="number" min="1" step="0.01" defaultValue="24.99" required />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="title">Title (optional)</Label>
            <Input id="title" name="title" placeholder={picked.title} maxLength={120} />
          </div>
          <p className="text-xs text-muted sm:col-span-2">
            Imported as a draft with all in-stock variants. Check Printify&apos;s cost for this provider before publishing.
          </p>
          <Button type="submit" variant="accent" disabled={busy || !providers?.length}>
            {busy ? "Importing…" : "Import as draft"}
          </Button>
        </form>
      )}
    </Card>
  );
}

export default function AdminProducts() {
  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    api<Status>("/admin/catalog/printify/status").then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => {
    let alive = true;
    api<Row[]>("/admin/catalog/products")
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [tick]);

  return (
    <AdminShell title="Products">
      <div className="grid gap-6">
        {status && !status.connected && (
          <Alert tone="error">
            Printify is not connected{status.error ? ` (${status.error})` : ""}. Add PRINTIFY_API_TOKEN and PRINTIFY_SHOP_ID to the server
            .env, then redeploy.
          </Alert>
        )}
        {status?.connected && !status.shopConfigured && (
          <Alert>
            Printify connected. Set PRINTIFY_SHOP_ID to one of: {status.shops.map((s) => `${s.id} (${s.title}, ${s.salesChannel})`).join(", ")}
          </Alert>
        )}
        {status?.connected && <Importer onImported={load} />}
        <Card>
          <h2 className="mb-4 font-semibold">Catalog</h2>
          {rows?.length === 0 && <p className="text-sm text-muted">No products yet.</p>}
          <ul className="divide-y divide-line text-sm">
            {rows?.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <Link href={`/admin/products/${r.id}`} className="font-medium hover:text-accent">
                  {r.title}
                </Link>
                <span className="text-muted">
                  {r._count.variants} variants · {r.category?.name ?? "No category"} ·{" "}
                  <span className={r.status === "ACTIVE" ? "text-emerald-600" : ""}>{r.status.toLowerCase()}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AdminShell>
  );
}
