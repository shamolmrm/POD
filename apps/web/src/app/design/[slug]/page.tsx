"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { EditorProduct } from "@/components/editor/design-editor";
import { SiteHeader } from "@/components/site-header";
import { Alert } from "@/components/ui";
import { api, errorText } from "@/lib/api";

// Fabric touches `window`, so the editor only runs in the browser.
const DesignEditor = dynamic(() => import("@/components/editor/design-editor").then((m) => m.DesignEditor), {
  ssr: false,
  loading: () => <p className="text-sm text-muted">Loading editor…</p>,
});

function EditorPage() {
  const { slug } = useParams<{ slug: string }>();
  const designId = useSearchParams().get("d") ?? undefined;
  const [product, setProduct] = useState<EditorProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<EditorProduct>(`/catalog/products/${encodeURIComponent(slug)}`)
      .then((p) => alive && setProduct(p))
      .catch((err) => alive && setError(errorText(err, "Product not found.")));
    return () => {
      alive = false;
    };
  }, [slug]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">{product ? `Design your ${product.title}` : "Design editor"}</h1>
        <Link href="/account/designs" className="text-sm text-muted hover:text-accent">
          My designs
        </Link>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {product && (
        <DesignEditor
          key={designId ?? "new"}
          product={product}
          designId={designId && /^[0-9a-f-]{36}$/i.test(designId) ? designId : undefined}
        />
      )}
    </main>
  );
}

export default function DesignPage() {
  return (
    <>
      <SiteHeader />
      <Suspense>
        <EditorPage />
      </Suspense>
    </>
  );
}
