import "server-only";

/** Server-side calls from Next.js to the API container (never exposed to the browser). */
const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

export type ProductCard = {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  image2?: string | null;
  isDemo?: boolean;
  fromCents: number;
  currency: string;
  category: { slug: string; name: string } | null;
};

export type ReadyDesign = {
  id: string;
  name: string;
  preview: string | null;
  product: { id: string; slug: string; title: string; image: string | null; currency: string; fromCents: number; isDemo?: boolean };
};

export type ProductDetail = {
  id: string;
  slug: string;
  title: string;
  description: string;
  isDemo?: boolean;
  brand: string | null;
  images: string[];
  currency: string;
  category: { slug: string; name: string } | null;
  variants: Array<{ id: string; printifyVariantId: number; title: string; options: Record<string, string>; priceCents: number }>;
  printAreas: Array<{ position: string; widthPx: number; heightPx: number; variantIds: number[] }>;
  reviews: Array<{ rating: number; body: string; createdAt: string; author: string }>;
};

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}/api/v1${path}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export const getProducts = (category?: string, q?: string) => {
  const qs = new URLSearchParams();
  if (category) qs.set("category", category);
  if (q) qs.set("q", q);
  return get<ProductCard[]>(`/catalog/products${qs.size ? `?${qs}` : ""}`);
};
export const getReadyDesigns = () => get<ReadyDesign[]>("/designs/templates");
export const getProduct = (slug: string) => get<ProductDetail>(`/catalog/products/${encodeURIComponent(slug)}`);
export const getCategories = () => get<Array<{ id: string; slug: string; name: string }>>("/catalog/categories");
