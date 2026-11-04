import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProductGrid } from "@/components/product-grid";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getCategories, getProducts } from "@/lib/server-api";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Products — design your own | Custom Print Studio",
  description: "Custom T-shirts, hoodies, mugs, posters and more. Design online, printed on demand, shipped worldwide.",
};

async function Catalog({ searchParams }: { searchParams: Promise<{ category?: string; q?: string }> }) {
  const { category, q } = await searchParams;
  const [products, categories] = await Promise.all([getProducts(category, q), getCategories()]);
  return (
    <>
      {!!categories?.length && (
        <nav aria-label="Categories" className="mb-6 flex flex-wrap gap-2 text-sm">
          <Link href="/products" className={cn("rounded-full border border-line px-3 py-1", !category && "bg-fg text-bg")}>
            All
          </Link>
          {categories.map((c) => (
            <Link key={c.id} href={`/products?category=${c.slug}`} className={cn("rounded-full border border-line px-3 py-1", category === c.slug && "bg-fg text-bg")}>
              {c.name}
            </Link>
          ))}
        </nav>
      )}
      {q && <p className="mb-4 text-sm text-muted">Results for “{q}”</p>}
      <ProductGrid products={products ?? []} />
    </>
  );
}

export default function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string }> }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Pick a product to design</h1>
        <p className="mb-8 text-muted">Choose a blank, then add your photos, text and logos in the editor.</p>
        <Suspense fallback={<p className="text-sm text-muted">Loading products…</p>}>
          <Catalog searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
