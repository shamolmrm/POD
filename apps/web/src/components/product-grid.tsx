import { Palette, ShoppingBag } from "lucide-react";
import Link from "next/link";
import type { ProductCard, ReadyDesign } from "@/lib/server-api";
import { money } from "@/lib/utils";

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">{text}</p>;
}

/** Blank products: open the product page / editor to design your own. */
export function ProductGrid({ products, mode = "view" }: { products: ProductCard[]; mode?: "view" | "create" }) {
  if (!products.length) return <Empty text="New products are on the way. Check back soon!" />;
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id} className="group">
          <Link href={mode === "create" ? `/design/${p.slug}` : `/products/${p.slug}`} className="block">
            <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-fg/5">
              {p.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt={p.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105" />
              )}
              {p.image2 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image2} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-300 group-hover:opacity-100" />
              )}
              {p.isDemo && <span className="absolute right-3 top-3 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">Demo</span>}
              <span className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 translate-y-2 items-center gap-1.5 whitespace-nowrap rounded-full bg-fg px-4 py-2 text-xs font-medium text-bg opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100">
                <Palette className="h-3.5 w-3.5" /> Customize
              </span>
            </div>
            {p.category && <p className="mt-3 text-xs uppercase tracking-wide text-muted">{p.category.name}</p>}
            <h3 className="mt-1 line-clamp-2 text-sm font-medium group-hover:text-accent">{p.title}</h3>
            <p className="mt-1 text-sm">
              <span className="text-muted">From </span>
              <span className="font-semibold">{money(p.fromCents, p.currency)}</span>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Ready-made designs made by the shop: pick size/colour and buy, or tweak them first. */
export function DesignGrid({ designs }: { designs: ReadyDesign[] }) {
  if (!designs.length) return <Empty text="Our first ready-made designs are coming soon. Meanwhile, create your own!" />;
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
      {designs.map((d) => (
        <li key={d.id} className="group">
          <Link href={`/design/${d.product.slug}?t=${d.id}`} className="block">
            <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-fg/[0.03] to-fg/[0.08]">
              {d.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.preview} alt={d.name} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-6 transition duration-300 group-hover:scale-105" />
              ) : (
                d.product.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.product.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                )
              )}
              {d.product.isDemo && <span className="absolute right-3 top-3 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">Demo</span>}
              <span className="absolute left-3 top-3 rounded-full bg-bg/90 px-2.5 py-1 text-[11px] font-medium shadow-sm">{d.product.title.split(" ").slice(0, 3).join(" ")}</span>
              <span className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 translate-y-2 items-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-4 py-2 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100">
                <ShoppingBag className="h-3.5 w-3.5" /> Choose size & buy
              </span>
            </div>
            <h3 className="mt-3 line-clamp-2 text-sm font-medium group-hover:text-accent">{d.name}</h3>
            <p className="mt-1 text-sm">
              <span className="text-muted">From </span>
              <span className="font-semibold">{money(d.product.fromCents, d.product.currency)}</span>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
