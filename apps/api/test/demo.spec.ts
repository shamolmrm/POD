import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { seedDemo } from "../src/demo/seed";
import { StorageService } from "../src/modules/files/storage.service";

describe("demo catalog seed", () => {
  jest.setTimeout(60_000);

  it("creates products in every category with existing images, and designs that fit their print areas", async () => {
    process.env.FILES_DIR = mkdtempSync(join(tmpdir(), "pod-demo-"));
    const storage = new StorageService({ env: "test", port: 0, databaseUrl: "", redisUrl: "", publicBaseUrl: "" });
    const products: Array<Record<string, any>> = [];
    const designs: Array<Record<string, any>> = [];
    const prisma = {
      product: {
        count: async () => 0,
        create: async ({ data }: { data: Record<string, unknown> }) => (products.push(data), { id: `p${products.length}` }),
      },
      category: { upsert: async ({ create }: { create: { slug: string } }) => ({ id: create.slug }) },
      design: { create: async ({ data }: { data: Record<string, unknown> }) => designs.push(data) },
    } as unknown as PrismaClient;

    const msg = await seedDemo(prisma, storage);
    expect(msg).toMatch(/8 categories, 24 demo products and 12 ready-made designs/);

    const perCategory = new Map<string, number>();
    for (const p of products) {
      perCategory.set(p.categoryId, (perCategory.get(p.categoryId) ?? 0) + 1);
      expect(p.isDemo).toBe(true);
      for (const img of p.images as string[]) expect(existsSync(join(__dirname, "../../web/public", img))).toBe(true);
      expect(p.variants.create.length).toBeGreaterThan(0);
    }
    expect([...perCategory.values()]).toEqual(Array(8).fill(3));

    for (const d of designs) {
      const v = d.versions.create;
      const [position, area] = Object.entries(v.areas as Record<string, { widthPx: number; heightPx: number; canvas: { objects: Array<{ type: string }> } }>)[0];
      const product = products[Number(String(d.productId).slice(1)) - 1];
      expect(product.printAreas.create).toContainEqual({ position, widthPx: area.widthPx, heightPx: area.heightPx });
      expect(area.canvas.objects.some((o) => o.type === "Textbox")).toBe(true);
      const meta = await sharp(await storage.read(v.previewKey)).metadata();
      expect(meta.format).toBe("png");
    }
  });
});
