import type { Metadata } from "next";
import { Suspense } from "react";
import { DesignGrid } from "@/components/product-grid";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getReadyDesigns } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Ready-made designs | Custom Print Studio",
  description: "Shop ready-made designs on T-shirts, hoodies, mugs and more. Printed on demand and shipped worldwide.",
};

async function Designs() {
  return <DesignGrid designs={(await getReadyDesigns()) ?? []} />;
}

export default function ShopPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Ready-made designs</h1>
        <p className="mb-8 mt-2 text-muted">Choose a design, pick your size and colour, and order. You can also tweak the text before buying.</p>
        <Suspense fallback={<p className="text-sm text-muted">Loading designs…</p>}>
          <Designs />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
