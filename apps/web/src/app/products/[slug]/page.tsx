import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui";
import { getProduct } from "@/lib/server-api";
import { money } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  if (!p) return { title: "Product not found" };
  return {
    title: `Custom ${p.title} | Custom Print Studio`,
    description: p.description.slice(0, 160),
    openGraph: { title: p.title, images: p.images.slice(0, 1) },
  };
}

function optionValues(variants: Array<{ options: Record<string, string> }>) {
  const map = new Map<string, Set<string>>();
  for (const v of variants) for (const [k, val] of Object.entries(v.options ?? {})) (map.get(k) ?? map.set(k, new Set()).get(k)!).add(val);
  return [...map.entries()].map(([name, values]) => ({ name, values: [...values] }));
}

async function Product({ params }: Props) {
  const p = await getProduct((await params).slug);
  if (!p) notFound();
  const from = Math.min(...p.variants.map((v) => v.priceCents));
  const options = optionValues(p.variants);
  const avg = p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    description: p.description.slice(0, 500),
    image: p.images,
    brand: p.brand ?? undefined,
    offers: { "@type": "AggregateOffer", priceCurrency: p.currency, lowPrice: (from / 100).toFixed(2), offerCount: p.variants.length },
    ...(avg ? { aggregateRating: { "@type": "AggregateRating", ratingValue: avg.toFixed(1), reviewCount: p.reviews.length } } : {}),
  };

  return (
    <div className="grid gap-10 md:grid-cols-2">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="grid gap-3">
        <div className="aspect-square overflow-hidden rounded-2xl border border-line bg-fg/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.images[0] && <img src={p.images[0]} alt={p.title} className="h-full w-full object-cover" />}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {p.images.slice(1, 5).map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" loading="lazy" className="aspect-square rounded-xl border border-line object-cover" />
          ))}
        </div>
      </div>
      <div>
        {p.category && (
          <Link href={`/products?category=${p.category.slug}`} className="text-sm text-muted hover:text-accent">
            {p.category.name}
          </Link>
        )}
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{p.title}</h1>
        {p.isDemo && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Demo product — you can try the editor, but ordering opens soon.
          </p>
        )}
        <p className="mt-2 text-xl">From {money(from, p.currency)}</p>
        {avg && (
          <p className="mt-1 text-sm text-muted">
            ★ {avg.toFixed(1)} · {p.reviews.length} review{p.reviews.length > 1 ? "s" : ""}
          </p>
        )}
        <div className="mt-6 grid gap-3 text-sm">
          {options.map((o) => (
            <div key={o.name}>
              <div className="mb-1 font-medium capitalize">{o.name}</div>
              <div className="flex flex-wrap gap-1.5">
                {o.values.slice(0, 30).map((v) => (
                  <span key={v} className="rounded-md border border-line px-2 py-0.5 text-xs">
                    {v}
                  </span>
                ))}
                {o.values.length > 30 && <span className="text-xs text-muted">+{o.values.length - 30} more</span>}
              </div>
            </div>
          ))}
          <div className="text-muted">Print areas: {[...new Set(p.printAreas.map((a) => a.position))].join(", ")}</div>
        </div>
        <Link href={`/design/${p.slug}`} className={buttonVariants({ variant: "accent", size: "lg", className: "mt-8 w-full sm:w-auto" })}>
          Start designing
        </Link>
        <div className="mt-8 whitespace-pre-line text-sm leading-relaxed text-muted">{p.description}</div>
        {p.reviews.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 font-semibold">Reviews</h2>
            <ul className="grid gap-3">
              {p.reviews.map((r, i) => (
                <li key={i} className="rounded-xl border border-line p-3 text-sm">
                  <div className="font-medium">
                    {"★".repeat(r.rating)}
                    <span className="text-muted">{"★".repeat(5 - r.rating)}</span> · {r.author}
                  </div>
                  <p className="mt-1 text-muted">{r.body}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

export default function ProductPage({ params }: Props) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <Product params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
