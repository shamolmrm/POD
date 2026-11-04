import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/server-api";

const BASE = "https://pod.supersoftltd.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = (await getProducts()) ?? [];
  return [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/products`, changeFrequency: "daily", priority: 0.9 },
    ...products.map((p) => ({ url: `${BASE}/products/${p.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
