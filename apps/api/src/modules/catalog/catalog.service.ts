import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { RedisService } from "../../redis.service";
import { type CatalogVariant, PrintifyClient } from "../printify/printify.client";

export function slugify(text: string): string {
  return (
    text
      .replace(/[™®©]/g, "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 80) || "product"
  );
}

/** Group Printify placeholders into print areas: one per (position, width, height) with its variant ids. */
export function buildPrintAreas(variants: CatalogVariant[]) {
  const areas = new Map<string, { position: string; widthPx: number; heightPx: number; variantIds: number[] }>();
  for (const v of variants) {
    for (const p of v.placeholders ?? []) {
      const key = `${p.position}|${p.width}|${p.height}`;
      const area = areas.get(key) ?? { position: p.position, widthPx: p.width, heightPx: p.height, variantIds: [] };
      area.variantIds.push(v.id);
      areas.set(key, area);
    }
  }
  return [...areas.values()];
}

const CACHE_SECONDS = 6 * 3600; // catalog endpoints are limited to 100 req/min

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly printify: PrintifyClient,
    private readonly redis: RedisService,
  ) {}

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    try {
      const hit = await this.redis.client.get(`printify:${key}`);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      /* cache is optional */
    }
    const value = await load();
    await this.redis.client.set(`printify:${key}`, JSON.stringify(value), "EX", CACHE_SECONDS).catch(() => undefined);
    return value;
  }

  async searchBlueprints(q: string) {
    const all = await this.cached("blueprints", () => this.printify.blueprints());
    const term = q.trim().toLowerCase();
    return all
      .filter((b) => !term || `${b.title} ${b.brand} ${b.model}`.toLowerCase().includes(term))
      .slice(0, 60)
      .map((b) => ({ id: b.id, title: b.title, brand: b.brand, model: b.model, image: b.images?.[0] ?? null }));
  }

  providers(blueprintId: number) {
    return this.cached(`providers:${blueprintId}`, () => this.printify.providers(blueprintId));
  }

  /** Create a store product from a Printify blueprint + provider (all in-stock variants, one base price). */
  async importProduct(input: { blueprintId: number; providerId: number; title?: string; priceCents: number; categoryId?: string | null }) {
    const exists = await this.prisma.product.findUnique({
      where: { printifyBlueprintId_printifyProviderId: { printifyBlueprintId: input.blueprintId, printifyProviderId: input.providerId } },
    });
    if (exists) throw new ConflictException("This product is already in the catalog.");
    const blueprint = (await this.cached("blueprints", () => this.printify.blueprints())).find((b) => b.id === input.blueprintId);
    if (!blueprint) throw new NotFoundException("Blueprint not found in the Printify catalog.");
    const { variants } = await this.printify.variants(input.blueprintId, input.providerId);
    if (!variants.length) throw new BadRequestException("This provider has no variants in stock for this product.");

    const title = input.title?.trim() || blueprint.title;
    let slug = slugify(title);
    if (await this.prisma.product.findUnique({ where: { slug } })) slug = `${slug}-${input.blueprintId}-${input.providerId}`;

    return this.prisma.product.create({
      data: {
        slug,
        title,
        description: stripHtml(blueprint.description),
        brand: blueprint.brand,
        model: blueprint.model,
        images: blueprint.images.slice(0, 8),
        printifyBlueprintId: input.blueprintId,
        printifyProviderId: input.providerId,
        categoryId: input.categoryId ?? null,
        variants: {
          create: variants.map((v) => ({
            printifyVariantId: v.id,
            title: v.title,
            options: v.options as Prisma.InputJsonValue,
            costCents: 0,
            priceCents: input.priceCents,
          })),
        },
        printAreas: { create: buildPrintAreas(variants) },
      },
      include: { variants: true, printAreas: true },
    });
  }

  // ── public storefront ──

  async listActive(category?: string, q?: string) {
    const term = q?.trim();
    const products = await this.prisma.product.findMany({
      where: {
        status: "ACTIVE",
        ...(category ? { category: { slug: category } } : {}),
        ...(term ? { OR: [{ title: { contains: term, mode: "insensitive" } }, { description: { contains: term, mode: "insensitive" } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { variants: { where: { isEnabled: true }, select: { priceCents: true } }, category: { select: { slug: true, name: true } } },
    });
    return products
      .filter((p) => p.variants.length)
      .map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        image: (p.images as string[])[0] ?? null,
        image2: (p.images as string[])[1] ?? null,
        isDemo: p.isDemo,
        fromCents: Math.min(...p.variants.map((v) => v.priceCents)),
        currency: p.currency,
        category: p.category,
      }));
  }

  async bySlug(slug: string) {
    const p = await this.prisma.product.findFirst({
      where: { slug, status: "ACTIVE" },
      include: {
        variants: { where: { isEnabled: true }, orderBy: { priceCents: "asc" } },
        printAreas: true,
        category: { select: { slug: true, name: true } },
        reviews: { where: { status: "APPROVED" }, select: { rating: true, body: true, createdAt: true, user: { select: { name: true } } }, take: 20, orderBy: { createdAt: "desc" } },
      },
    });
    if (!p || !p.variants.length) throw new NotFoundException("Product not found.");
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      isDemo: p.isDemo,
      brand: p.brand,
      images: p.images as string[],
      currency: p.currency,
      category: p.category,
      variants: p.variants.map((v) => ({ id: v.id, printifyVariantId: v.printifyVariantId, title: v.title, options: v.options, priceCents: v.priceCents })),
      printAreas: p.printAreas.map((a) => ({ position: a.position, widthPx: a.widthPx, heightPx: a.heightPx, variantIds: a.variantIds })),
      reviews: p.reviews.map((r) => ({ rating: r.rating, body: r.body, createdAt: r.createdAt, author: r.user.name.split(" ")[0] })),
    };
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 5000);
}
