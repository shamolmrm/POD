import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductGrid } from "@/components/product-grid";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getProducts } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Design your own | Custom Print Studio",
  description: "Upload your photo or logo, add text or create AI art, and print it on T-shirts, mugs and more.",
};

async function Blanks() {
  return <ProductGrid products={(await getProducts()) ?? []} mode="create" />;
}

export default function CreatePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Design your own</h1>
        <p className="mb-8 mt-2 text-muted">Pick a product to open it in the editor. Upload photos, add text, or create artwork with AI.</p>
        <Suspense fallback={<p className="text-sm text-muted">Loading products…</p>}>
          <Blanks />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
