"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { buttonVariants, Card } from "@/components/ui";
import { api, useSession } from "@/lib/api";

type Design = { id: string; name: string; isTemplate: boolean; updatedAt: string; product: { slug: string; title: string }; preview: string | null };

export default function MyDesigns() {
  const [list, setList] = useState<Design[] | null>(null);
  const { user } = useSession();
  const staff = !!user && user.role !== "CUSTOMER";

  async function toggleStore(d: Design) {
    await api(`/admin/designs/${d.id}/template`, { method: "PATCH", body: JSON.stringify({ isTemplate: !d.isTemplate }) });
    setList((l) => l?.map((x) => (x.id === d.id ? { ...x, isTemplate: !x.isTemplate } : x)) ?? null);
  }
  useEffect(() => {
    let alive = true;
    api<Design[]>("/designs")
      .then((d) => alive && setList(d))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="mb-2 text-2xl font-semibold">My designs</h1>
        {staff && <p className="mb-6 text-sm text-muted">Tick “Sell in store” to show a design on the home page and in Ready-made designs. Save it with a preview first.</p>}
        {!list ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : list.length === 0 ? (
          <Card className="text-center">
            <p className="mb-4 text-muted">You have no saved designs yet.</p>
            <Link href="/products" className={buttonVariants({ variant: "accent" })}>
              Create one
            </Link>
          </Card>
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {list.map((d) => (
              <li key={d.id}>
                <Link href={`/design/${d.product.slug}?d=${d.id}`} className="group block">
                  <div className="aspect-square overflow-hidden rounded-2xl border border-line bg-fg/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {d.preview && <img src={d.preview} alt="" className="h-full w-full object-contain" />}
                  </div>
                  <div className="mt-2 text-sm font-medium group-hover:text-accent">{d.name}</div>
                  <div className="text-xs text-muted">{d.product.title}</div>
                </Link>
                {staff && (
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={d.isTemplate} onChange={() => void toggleStore(d)} />
                    Sell in store (ready-made)
                  </label>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
