"use client";

import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Alert, Button, Card, Input, Label } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { money } from "@/lib/utils";

type Variant = { id: string; title: string; priceCents: number; isEnabled: boolean; costCents: number };
type Product = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  categoryId: string | null;
  variants: Variant[];
  printAreas: Array<{ id: string; position: string; widthPx: number; heightPx: number }>;
};
type Category = { id: string; name: string };

function AdminProduct() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<Product | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const prod = await api<Product>(`/admin/catalog/products/${id}`);
    setP(prod);
    setVariants(prod.variants);
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after the fetch resolves
    void load();
    api<Category[]>("/catalog/categories").then(setCats);
  }, [load]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api(`/admin/catalog/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: f.get("title"),
          description: f.get("description"),
          status: f.get("status"),
          categoryId: f.get("categoryId") || null,
        }),
      });
      await api(`/admin/catalog/products/${id}/variants`, {
        method: "PATCH",
        body: JSON.stringify({ variants: variants.map((v) => ({ id: v.id, priceCents: v.priceCents, isEnabled: v.isEnabled })) }),
      });
      setMsg({ tone: "success", text: "Saved." });
      void load();
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err) });
    }
  }

  async function addCategory() {
    const name = window.prompt("New category name");
    if (!name) return;
    const c = await api<Category>("/admin/catalog/categories", { method: "POST", body: JSON.stringify({ name }) });
    setCats((x) => [...x, c]);
  }

  function setAll(cents: number) {
    setVariants((vs) => vs.map((v) => ({ ...v, priceCents: cents })));
  }

  if (!p) return <AdminShell title="Product">{null}</AdminShell>;
  return (
    <AdminShell title={p.title}>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <form onSubmit={save} className="grid gap-6">
        <Card className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={p.title} required maxLength={120} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <textarea id="description" name="description" defaultValue={p.description} rows={5} maxLength={5000} className="w-full rounded-lg border border-line bg-bg p-3 text-sm" />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <select id="status" name="status" defaultValue={p.status} className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm">
              <option value="DRAFT">Draft (hidden)</option>
              <option value="ACTIVE">Active (in the shop)</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
          <div>
            <Label htmlFor="categoryId">
              Category{" "}
              <button type="button" onClick={addCategory} className="text-xs text-accent">
                + new
              </button>
            </Label>
            <select id="categoryId" name="categoryId" defaultValue={p.categoryId ?? ""} className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm">
              <option value="">None</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-muted sm:col-span-2">
            Print areas: {p.printAreas.map((a) => `${a.position} ${a.widthPx}×${a.heightPx}px`).join(" · ")}
          </div>
        </Card>
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Variants & prices</h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const v = window.prompt("Set every variant to price (USD)");
                if (v && Number(v) > 0) setAll(Math.round(Number(v) * 100));
              }}
            >
              Set all prices
            </Button>
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-2 font-normal">Variant</th>
                  <th className="py-2 font-normal">Price (USD)</th>
                  <th className="py-2 font-normal">On sale</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v, i) => (
                  <tr key={v.id} className="border-t border-line">
                    <td className="py-1.5">{v.title}</td>
                    <td className="py-1.5">
                      <Input
                        type="number"
                        min="1"
                        step="0.01"
                        className="h-8 w-28"
                        value={(v.priceCents / 100).toFixed(2)}
                        aria-label={`Price for ${v.title}`}
                        onChange={(e) =>
                          setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, priceCents: Math.round(Number(e.target.value) * 100) } : x)))
                        }
                      />
                    </td>
                    <td className="py-1.5">
                      <input
                        type="checkbox"
                        checked={v.isEnabled}
                        aria-label={`Sell ${v.title}`}
                        onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, isEnabled: e.target.checked } : x)))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">From {money(Math.min(...variants.map((v) => v.priceCents)))}</p>
        </Card>
        <div>
          <Button type="submit" variant="accent">
            Save product
          </Button>
        </div>
      </form>
    </AdminShell>
  );
}

export default function AdminProductPage() {
  return (
    <Suspense>
      <AdminProduct />
    </Suspense>
  );
}
