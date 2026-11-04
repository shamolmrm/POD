import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { User } from "@prisma/client";
import { z } from "zod";
import { AuditService } from "../../common/audit.service";
import { zodBody } from "../../common/http";
import { PrismaService } from "../../prisma.service";
import { AuthGuard, CurrentUser, Roles } from "../auth/guards";
import { PrintifyClient } from "../printify/printify.client";
import { removeDemo, seedDemo } from "../../demo/seed";
import { StorageService } from "../files/storage.service";
import { CatalogService, slugify } from "./catalog.service";

@Controller("catalog")
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("products")
  products(@Query("category") category?: string, @Query("q") q?: string) {
    return this.catalog.listActive(category?.slice(0, 80), q?.slice(0, 80));
  }

  @Get("products/:slug")
  product(@Param("slug") slug: string) {
    return this.catalog.bySlug(slug.slice(0, 120));
  }

  @Get("categories")
  categories() {
    return this.prisma.category.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }] });
  }
}

const ImportIn = z.object({
  blueprintId: z.number().int().positive(),
  providerId: z.number().int().positive(),
  title: z.string().trim().max(120).optional(),
  priceCents: z.number().int().min(100).max(100_000),
  categoryId: z.string().uuid().nullable().optional(),
});
const ProductPatch = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  categoryId: z.string().uuid().nullable().optional(),
});
const VariantPatch = z.object({
  variants: z
    .array(z.object({ id: z.string().uuid(), priceCents: z.number().int().min(100).max(100_000), isEnabled: z.boolean() }))
    .max(500),
});
const CategoryIn = z.object({ name: z.string().trim().min(2).max(60), sort: z.number().int().min(0).max(999).default(0) });

@Controller("admin/catalog")
@UseGuards(AuthGuard)
@Roles("ADMIN", "STAFF")
export class AdminCatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly prisma: PrismaService,
    private readonly printify: PrintifyClient,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  @Post("demo")
  async seedDemo(@CurrentUser() user: User) {
    const message = await seedDemo(this.prisma, this.storage);
    await this.audit.record("catalog.demo_seed", { actorId: user.id, detail: { message } });
    return { message };
  }

  @Post("demo/remove")
  async removeDemo(@CurrentUser() user: User) {
    const message = await removeDemo(this.prisma, this.storage);
    await this.audit.record("catalog.demo_remove", { actorId: user.id, detail: { message } });
    return { message };
  }

  /** Is Printify connected? Never returns the token. */
  @Get("printify/status")
  async status() {
    if (!this.printify.configured) return { connected: false, shopConfigured: false, shops: [] };
    try {
      const shops = await this.printify.shops();
      return { connected: true, shopConfigured: this.printify.shopConfigured, shops: shops.map((s) => ({ id: s.id, title: s.title, salesChannel: s.sales_channel })) };
    } catch {
      return { connected: false, shopConfigured: this.printify.shopConfigured, shops: [], error: "Printify rejected the token." };
    }
  }

  @Get("printify/blueprints")
  blueprints(@Query("q") q = "") {
    return this.catalog.searchBlueprints(q.slice(0, 80));
  }

  @Get("printify/blueprints/:id/providers")
  providers(@Param("id", ParseIntPipe) id: number) {
    return this.catalog.providers(id);
  }

  @Post("import")
  async import(@CurrentUser() user: User, @Body(zodBody(ImportIn)) body: z.infer<typeof ImportIn>) {
    const product = await this.catalog.importProduct(body);
    await this.audit.record("catalog.import", { actorId: user.id, target: product.id, detail: { blueprint: body.blueprintId, provider: body.providerId } });
    return product;
  }

  @Get("products")
  list() {
    return this.prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { variants: true } }, category: true },
    });
  }

  @Get("products/:id")
  async get(@Param("id", ParseUUIDPipe) id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: { orderBy: { title: "asc" } }, printAreas: true, category: true },
    });
    if (!p) throw new NotFoundException();
    return p;
  }

  @Patch("products/:id")
  async update(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string, @Body(zodBody(ProductPatch)) body: z.infer<typeof ProductPatch>) {
    const p = await this.prisma.product.update({ where: { id }, data: body });
    await this.audit.record("catalog.update", { actorId: user.id, target: id, detail: body });
    return p;
  }

  @Patch("products/:id/variants")
  async variants(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string, @Body(zodBody(VariantPatch)) body: z.infer<typeof VariantPatch>) {
    await this.prisma.$transaction(
      body.variants.map((v) =>
        this.prisma.productVariant.updateMany({ where: { id: v.id, productId: id }, data: { priceCents: v.priceCents, isEnabled: v.isEnabled } }),
      ),
    );
    await this.audit.record("catalog.prices", { actorId: user.id, target: id, detail: { count: body.variants.length } });
    return { ok: true };
  }

  @Post("categories")
  category(@Body(zodBody(CategoryIn)) body: z.infer<typeof CategoryIn>) {
    return this.prisma.category.create({ data: { ...body, slug: slugify(body.name) } });
  }
}
