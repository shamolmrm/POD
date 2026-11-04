"use client";

import { Menu, Search, ShoppingBag, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui";
import { api, useSession } from "@/lib/api";
import { DEPARTMENTS } from "@/lib/departments";

export const BRAND = "Custom Print Studio";


export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 font-bold tracking-tight">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-sm text-white" aria-hidden="true">
        CP
      </span>
      <span className="hidden sm:inline">{BRAND}</span>
    </Link>
  );
}

function CartButton() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ items: Array<{ quantity: number }> }>("/cart")
      .then((c) => alive && setCount(c.items.reduce((s, i) => s + i.quantity, 0)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Link href="/cart" className={buttonVariants({ variant: "ghost", size: "icon", className: "relative" })} aria-label={`Cart${count ? `, ${count} items` : ""}`}>
      <ShoppingBag className="h-5 w-5" />
      {!!count && (
        <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white">{count}</span>
      )}
    </Link>
  );
}

export function SiteHeader() {
  const { user } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <details className="group relative lg:hidden">
          <summary className={buttonVariants({ variant: "ghost", size: "icon", className: "list-none [&::-webkit-details-marker]:hidden" })} aria-label="Menu">
            <Menu className="h-5 w-5" />
          </summary>
          <nav aria-label="Departments" className="absolute left-0 mt-2 w-60 rounded-xl border border-line bg-bg p-2 shadow-xl">
            <Link href="/products" className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-fg/5">
              All products
            </Link>
            <Link href="/shop" className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-fg/5">
              Ready-made designs
            </Link>
            {DEPARTMENTS.map((d) => (
              <Link key={d.slug} href={`/products?category=${d.slug}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-fg/5">
                {d.icon} {d.name}
              </Link>
            ))}
          </nav>
        </details>
        <Logo />
        <form
          role="search"
          className="relative mx-auto hidden w-full max-w-xl md:block"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/products${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder="Search t-shirts, mugs, hoodies…"
            aria-label="Search products"
            className="h-10 w-full rounded-full border border-line bg-fg/5 pl-9 pr-4 text-sm outline-none focus:border-accent focus:bg-bg"
          />
        </form>
        <nav aria-label="Account" className="ml-auto flex items-center gap-1 text-sm md:ml-0">
          <Link href="/create" className={buttonVariants({ variant: "accent", size: "sm", className: "hidden sm:inline-flex" })}>
            Create your own
          </Link>
          {user && user.role !== "CUSTOMER" && (
            <Link href="/admin" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Admin
            </Link>
          )}
          {user === undefined ? (
            <span className="h-9 w-9" />
          ) : (
            <Link href={user ? "/account" : "/login"} className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label={user ? "My account" : "Sign in"}>
              <UserIcon className="h-5 w-5" />
            </Link>
          )}
          <CartButton />
        </nav>
      </div>
      <nav aria-label="Departments" className="hidden border-t border-line lg:block">
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 text-sm">
          <Link href="/shop" className="whitespace-nowrap rounded-md px-3 py-2 font-medium hover:text-accent">
            Ready-made designs
          </Link>
          {DEPARTMENTS.map((d) => (
            <Link key={d.slug} href={`/products?category=${d.slug}`} className="whitespace-nowrap rounded-md px-3 py-2 text-muted hover:text-fg">
              {d.name}
            </Link>
          ))}
          <Link href="/create" className="ml-auto whitespace-nowrap rounded-md px-3 py-2 font-medium text-accent">
            ✨ Design your own
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-fg/[0.03]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-muted">Custom printed apparel, mugs and gifts. Pick a ready-made design or create your own — printed on demand and shipped worldwide.</p>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Shop</h2>
          <ul className="grid gap-2 text-sm text-muted">
            <li><Link href="/shop" className="hover:text-fg">Ready-made designs</Link></li>
            <li><Link href="/products" className="hover:text-fg">All products</Link></li>
            <li><Link href="/create" className="hover:text-fg">Design your own</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">My account</h2>
          <ul className="grid gap-2 text-sm text-muted">
            <li><Link href="/account/orders" className="hover:text-fg">Order tracking</Link></li>
            <li><Link href="/account/designs" className="hover:text-fg">My designs</Link></li>
            <li><Link href="/cart" className="hover:text-fg">Cart</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Why shop with us</h2>
          <ul className="grid gap-2 text-sm text-muted">
            <li>Printed on demand — no waste</li>
            <li>Worldwide shipping with tracking</li>
            <li>Secure payment</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-muted">© {BRAND}</div>
    </footer>
  );
}
