import type { MetadataRoute } from "next";

const BASE = "https://pod.supersoftltd.com";

/** Closed to search engines until launch (set SITE_LAUNCHED=true on the web container). */
export default function robots(): MetadataRoute.Robots {
  if (process.env.SITE_LAUNCHED !== "true") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/cart", "/checkout", "/orders", "/design"] },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
