import Link from "next/link";
import type { ProductCard } from "@/lib/server-api";
import { money } from "@/lib/utils";

export function ProductGrid({ products }: { products: ProductCard[] }) {
  if (!products.length) {
    return <p className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">New products are on the way. Check back soon!</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id}>
          <Link href={`/products/${p.slug}`} className="group block">
            <div className="aspect-square overflow-hidden rounded-2xl border border-line bg-fg/5">
              {p.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt={p.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
              )}
            </div>
            <h3 className="mt-2 line-clamp-2 text-sm font-medium group-hover:text-accent">{p.title}</h3>
            <p className="text-sm text-muted">From {money(p.fromCents, p.currency)}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
