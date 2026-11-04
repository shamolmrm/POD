import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12 sm:py-20">
      <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold">
        <span className="inline-block h-7 w-7 rounded-md bg-gradient-to-br from-accent to-accent-2" aria-hidden="true" />
        Custom Print Studio
      </Link>
      <Card>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
    </main>
  );
}
