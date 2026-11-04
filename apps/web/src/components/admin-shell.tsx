"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/reviews", label: "Reviews" },
];

/** Admin layout. The API enforces roles on every admin route; this only redirects non-staff. */
export function AdminShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { user } = useSession();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (user === null) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [user, router, path]);

  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <nav aria-label="Admin" className="mb-6 flex flex-wrap gap-1 border-b border-line pb-3 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-lg px-3 py-1.5 hover:bg-fg/5",
                (n.href === "/admin" ? path === "/admin" : path.startsWith(n.href)) && "bg-fg/10 font-medium",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {actions}
        </div>
        {user === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : user && user.role !== "CUSTOMER" ? (
          children
        ) : (
          <p className="text-sm text-muted">This area is for shop staff.</p>
        )}
      </div>
    </>
  );
}
