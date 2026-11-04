import { ArrowRight, Globe2, Lock, Palette, Printer, Sparkles, Truck, Upload, Wand2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DesignGrid, ProductGrid } from "@/components/product-grid";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { DEPARTMENTS } from "@/lib/departments";
import { buttonVariants } from "@/components/ui";
import { getProducts, getReadyDesigns } from "@/lib/server-api";

function SectionHead({ title, subtitle, href, cta }: { title: string; subtitle?: string; href: string; cta: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
        {cta} <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function GridSkeleton() {
  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i}>
          <div className="aspect-square animate-pulse rounded-2xl bg-fg/5" />
          <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-fg/5" />
        </li>
      ))}
    </ul>
  );
}

async function ReadyMade() {
  return <DesignGrid designs={((await getReadyDesigns()) ?? []).slice(0, 8)} />;
}

async function Products() {
  return <ProductGrid products={((await getProducts()) ?? []).slice(0, 8)} />;
}

/** Collage of product silhouettes for the hero (pure SVG, no external images). */
function HeroArt() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <div className="absolute inset-6 rounded-[2.5rem] bg-gradient-to-br from-accent/25 via-accent-2/20 to-transparent blur-2xl" />
      <svg viewBox="0 0 200 200" className="absolute left-0 top-4 w-[62%] rotate-[-6deg] drop-shadow-xl" aria-hidden="true">
        <path d="M70 30 L45 40 L20 70 L42 88 L55 75 L55 175 L145 175 L145 75 L158 88 L180 70 L155 40 L130 30 Q100 52 70 30 Z" fill="#fff" stroke="#16151a" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="100" cy="105" r="22" fill="url(#hg)" />
        <path d="M80 140 h40" stroke="#16151a" strokeWidth="5" strokeLinecap="round" />
        <defs>
          <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff5a36" />
            <stop offset="1" stopColor="#6d4aff" />
          </linearGradient>
        </defs>
      </svg>
      <svg viewBox="0 0 120 120" className="absolute bottom-6 right-2 w-[42%] rotate-[8deg] drop-shadow-xl" aria-hidden="true">
        <rect x="18" y="22" width="70" height="80" rx="8" fill="#fff" stroke="#16151a" strokeWidth="3" />
        <path d="M88 40 h10 a12 12 0 0 1 0 24 h-10" fill="none" stroke="#16151a" strokeWidth="3" />
        <path d="M34 56 l10 -12 10 12 10 -12" fill="none" stroke="#6d4aff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <text x="53" y="84" textAnchor="middle" fontSize="11" fontWeight="700" fill="#ff5a36">YOURS</text>
      </svg>
      <svg viewBox="0 0 120 150" className="absolute right-6 top-0 w-[34%] rotate-[4deg] drop-shadow-xl" aria-hidden="true">
        <rect x="8" y="8" width="104" height="134" rx="4" fill="#fff" stroke="#16151a" strokeWidth="3" />
        <rect x="20" y="20" width="80" height="80" rx="2" fill="#ffe7df" />
        <circle cx="60" cy="58" r="20" fill="#ff5a36" />
        <path d="M30 120 h60" stroke="#16151a" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span className="absolute bottom-[38%] left-[8%] rounded-full bg-bg px-3 py-1.5 text-xs font-semibold shadow-lg">✨ Your design here</span>
    </div>
  );
}

const STEPS = [
  { icon: Palette, title: "Pick a product or design", text: "Choose from ready-made designs, or a blank T-shirt, hoodie, mug and more." },
  { icon: Upload, title: "Make it yours", text: "Upload photos, add names and text, or create artwork with AI. See it live." },
  { icon: Printer, title: "We print & ship", text: "Printed on demand by professional partners and delivered with tracking." },
];

const PERKS = [
  { icon: Printer, title: "Premium print quality", text: "Print files are prepared at full resolution for every product." },
  { icon: Globe2, title: "Shipped worldwide", text: "Production partners across the world, with tracking on every order." },
  { icon: Lock, title: "Secure checkout", text: "Pay on the payment provider's secure page — we never see your card." },
];

const FAQ = [
  ["Can I buy a design without changing anything?", "Yes. Open any ready-made design, choose your size and colour, and add it to the cart."],
  ["Can I print my own photo or logo?", "Yes. Upload a JPG or PNG in the editor. We show the print quality (DPI) so you know it will look sharp."],
  ["How long does delivery take?", "Each item is printed when you order it, usually within a few business days, then shipped. You get a tracking link by email."],
  ["Is there a minimum order?", "No — order a single piece or many."],
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* hero */}
        <section className="relative overflow-hidden border-b border-line">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(255,90,54,0.12),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(109,74,255,0.12),transparent_55%)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
            <div>
              <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-line bg-bg px-3 py-1 text-xs font-medium">
                <Sparkles className="h-3.5 w-3.5 text-accent" /> Printed on demand · Shipped worldwide
              </p>
              <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
                Wear it. Gift it.{" "}
                <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">Make it yours.</span>
              </h1>
              <p className="mt-5 max-w-lg text-lg text-muted">
                Shop ready-made designs on T-shirts, hoodies, mugs and more — or create your own in our easy online editor.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/shop" className={buttonVariants({ size: "lg" })}>
                  Shop designs
                </Link>
                <Link href="/create" className={buttonVariants({ variant: "accent", size: "lg" })}>
                  <Wand2 className="h-4 w-4" /> Create your own
                </Link>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
                <li className="flex items-center gap-1.5"><Truck className="h-4 w-4" /> Tracked delivery</li>
                <li className="flex items-center gap-1.5"><Lock className="h-4 w-4" /> Secure payment</li>
                <li className="flex items-center gap-1.5"><Printer className="h-4 w-4" /> No minimum order</li>
              </ul>
            </div>
            <HeroArt />
          </div>
        </section>

        {/* departments */}
        <section className="mx-auto max-w-7xl px-4 py-12">
          <ul className="grid grid-cols-4 gap-3 sm:grid-cols-8">
            {DEPARTMENTS.map((d) => (
              <li key={d.slug}>
                <Link href={`/products?category=${d.slug}`} className="group flex flex-col items-center gap-2 rounded-2xl border border-line p-3 text-center transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md">
                  <span className="text-3xl transition group-hover:scale-110" aria-hidden="true">
                    {d.icon}
                  </span>
                  <span className="text-xs font-medium">{d.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ready-made designs */}
        <section className="mx-auto max-w-7xl px-4 py-8">
          <SectionHead title="Ready-made designs" subtitle="Pick one, choose your size and colour, done." href="/shop" cta="View all designs" />
          <Suspense fallback={<GridSkeleton />}>
            <ReadyMade />
          </Suspense>
        </section>

        {/* create-your-own banner */}
        <section className="mx-auto max-w-7xl px-4 py-12">
          <div className="grid items-center gap-8 overflow-hidden rounded-3xl bg-fg px-6 py-10 text-bg sm:px-12 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Have your own idea?</h2>
              <p className="mt-3 max-w-xl text-bg/70">
                Put your photo, logo, name or AI-generated art on any product. Live preview, print-quality check, and front & back printing.
              </p>
              <Link href="/create" className={buttonVariants({ variant: "accent", size: "lg", className: "mt-6" })}>
                Start designing <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <ul className="grid gap-3 text-sm">
              {["Upload photos & logos", "Add text in 10 fonts", "Create art with AI", "Front, back & sleeve printing"].map((t) => (
                <li key={t} className="flex items-center gap-3 rounded-xl bg-bg/10 px-4 py-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs text-white">✓</span> {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* blanks to customize */}
        <section className="mx-auto max-w-7xl px-4 py-8">
          <SectionHead title="Products to customize" subtitle="Start from a blank and make it yours." href="/products" cta="All products" />
          <Suspense fallback={<GridSkeleton />}>
            <Products />
          </Suspense>
        </section>

        {/* how it works */}
        <section className="mx-auto max-w-7xl px-4 py-14">
          <h2 className="mb-8 text-center text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-2xl border border-line p-6">
                <span className="absolute right-5 top-4 text-5xl font-black text-fg/5">{i + 1}</span>
                <s.icon className="h-7 w-7 text-accent" />
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* perks */}
        <section className="border-y border-line bg-fg/[0.03]">
          <ul className="mx-auto grid max-w-7xl gap-6 px-4 py-10 md:grid-cols-3">
            {PERKS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-bg shadow-sm">
                  <p.icon className="h-6 w-6 text-accent-2" />
                </span>
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-14">
          <h2 className="mb-6 text-center text-2xl font-bold tracking-tight sm:text-3xl">Questions</h2>
          <div className="divide-y divide-line rounded-2xl border border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="text-muted transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
