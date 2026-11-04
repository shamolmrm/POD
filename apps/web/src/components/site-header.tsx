"use client";

import { ShoppingBag, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { useSession } from "@/lib/api";

export const BRAND = "Custom Print Studio";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold">
      <span className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-accent to-accent-2" aria-hidden="true" />
      {BRAND}
    </Link>
  );
}

export function SiteHeader() {
  const { user } = useSession();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          <Link href="/products" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Products
          </Link>
          <Link href="/cart" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Cart">
            <ShoppingBag className="h-5 w-5" />
          </Link>
          {user === undefined ? (
            <span className="h-8 w-16" />
          ) : user ? (
            <>
              {user.role !== "CUSTOMER" && (
                <Link href="/admin" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Admin
                </Link>
              )}
              <Link href="/account" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <UserIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{user.name.split(" ")[0]}</span>
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Sign in
              </Link>
              <Link href="/register" className={buttonVariants({ variant: "accent", size: "sm" })}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted">
        <span>© {BRAND}</span>
        <span>Printed on demand · Shipped worldwide</span>
      </div>
    </footer>
  );
}
