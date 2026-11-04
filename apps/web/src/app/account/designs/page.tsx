"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { buttonVariants, Card } from "@/components/ui";
import { api } from "@/lib/api";

type Design = { id: string; name: string; updatedAt: string; product: { slug: string; title: string }; preview: string | null };

export default function MyDesigns() {
  const [list, setList] = useState<Design[] | null>(null);
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
        <h1 className="mb-6 text-2xl font-semibold">My designs</h1>
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
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
