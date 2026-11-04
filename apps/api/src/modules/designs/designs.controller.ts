import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Prisma, User } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import { TooManyRequests, zodBody } from "../../common/http";
import { RateLimitService } from "../../common/rate-limit.service";
import { PrismaService } from "../../prisma.service";
import { AuthGuard, CurrentUser, OptionalAuthGuard, Roles } from "../auth/guards";
import { StorageService } from "../files/storage.service";
import { checkPrintFile, MAX_UPLOAD_BYTES, processUpload, UploadError } from "./images";
import { type Owner, ownerWhere, OwnerService } from "./owner";

const MAX_ASSETS_PER_OWNER = 300;
const MAX_DESIGNS_PER_OWNER = 200;

const Area = z.object({
  canvas: z.record(z.string(), z.unknown()),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
});
const Areas = z.record(z.string().min(1).max(40), Area).refine((a) => Object.keys(a).length > 0 && Object.keys(a).length <= 12, "Add at least one print area");
const DesignIn = z.object({ productId: z.string().uuid(), name: z.string().trim().max(80).optional(), areas: Areas });
const VersionIn = z.object({ areas: Areas, name: z.string().trim().max(80).optional() });

type File = Express.Multer.File;
const upload = (maxBytes: number) => FileInterceptor("file", { limits: { fileSize: maxBytes, files: 1 } });

@Controller()
@UseGuards(OptionalAuthGuard)
export class DesignsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly owners: OwnerService,
    private readonly limits: RateLimitService,
  ) {}

  // ── uploads ──

  @Post("assets")
  @UseInterceptors(upload(MAX_UPLOAD_BYTES))
  async uploadAsset(@UploadedFile() file: File | undefined, @CurrentUser() user: User | null, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!file) throw new BadRequestException("Choose an image to upload.");
    const owner = this.owners.resolve(user, req, res);
    await this.throttle(owner, "upload", 40);
    if ((await this.prisma.asset.count({ where: ownerWhere(owner) })) >= MAX_ASSETS_PER_OWNER) {
      throw new BadRequestException("Upload limit reached. Delete some old designs first.");
    }
    const img = await processUpload(file.buffer).catch(rethrow);
    const key = this.storage.newKey("uploads", img.ext);
    await this.storage.save(key, img.data);
    const asset = await this.prisma.asset.create({
      data: { ...ownerWhere(owner), storageKey: key, mime: img.mime, widthPx: img.width, heightPx: img.height, bytes: img.data.length, sha256: img.sha256 },
    });
    return { id: asset.id, widthPx: asset.widthPx, heightPx: asset.heightPx, url: this.storage.signedUrl(key, 7 * 86400) };
  }

  /** Fresh signed URL for an image used in a design (own uploads, or shop-made template images). */
  @Get("assets/:id")
  async asset(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: User | null, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const owner = this.owners.resolve(user, req, res);
    const a = await this.prisma.asset.findUnique({ where: { id }, include: { owner: { select: { role: true } } } });
    const mine = a && (owner.userId ? a.ownerId === owner.userId : a.guestToken === owner.guestToken);
    const shop = a?.owner && a.owner.role !== "CUSTOMER";
    if (!a || (!mine && !shop)) throw new NotFoundException("Image not found.");
    return { id: a.id, widthPx: a.widthPx, heightPx: a.heightPx, url: this.storage.signedUrl(a.storageKey, 7 * 86400) };
  }

  // ── designs ──

  @Get("designs")
  async mine(@CurrentUser() user: User | null, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const owner = this.owners.resolve(user, req, res);
    const designs = await this.prisma.design.findMany({
      where: ownerWhere(owner),
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { product: { select: { slug: true, title: true } }, versions: { orderBy: { number: "desc" }, take: 1, select: { previewKey: true } } },
    });
    return designs.map((d) => ({
      id: d.id,
      name: d.name,
      updatedAt: d.updatedAt,
      product: d.product,
      preview: d.versions[0]?.previewKey ? this.storage.signedUrl(d.versions[0].previewKey) : null,
    }));
  }

  @Get("designs/templates")
  async templates(@Query("productId") productId?: string) {
    const designs = await this.prisma.design.findMany({
      where: { isTemplate: true, ...(productId && /^[0-9a-f-]{36}$/.test(productId) ? { productId } : {}) },
      take: 60,
      orderBy: { updatedAt: "desc" },
      include: { versions: { orderBy: { number: "desc" }, take: 1 } },
    });
    return designs
      .filter((d) => d.versions[0])
      .map((d) => ({
        id: d.id,
        name: d.name,
        productId: d.productId,
        areas: d.versions[0].areas,
        preview: d.versions[0].previewKey ? this.storage.signedUrl(d.versions[0].previewKey) : null,
      }));
  }

  @Get("designs/:id")
  async get(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: User | null, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const d = await this.own(id, this.owners.resolve(user, req, res));
    const v = await this.prisma.designVersion.findFirst({ where: { designId: d.id }, orderBy: { number: "desc" } });
    const product = await this.prisma.product.findUnique({ where: { id: d.productId }, select: { slug: true } });
    return { id: d.id, name: d.name, productId: d.productId, productSlug: product?.slug, version: v && { id: v.id, number: v.number, areas: v.areas } };
  }

  @Post("designs")
  async create(@Body(zodBody(DesignIn)) body: z.infer<typeof DesignIn>, @CurrentUser() user: User | null, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const owner = this.owners.resolve(user, req, res);
    await this.throttle(owner, "design", 60);
    if ((await this.prisma.design.count({ where: ownerWhere(owner) })) >= MAX_DESIGNS_PER_OWNER) {
      throw new BadRequestException("Design limit reached. Delete some old designs first.");
    }
    await this.checkAreas(body.productId, body.areas);
    const design = await this.prisma.design.create({
      data: {
        ...ownerWhere(owner),
        productId: body.productId,
        name: body.name || "My design",
        versions: { create: { number: 1, areas: body.areas as Prisma.InputJsonValue } },
      },
      include: { versions: true },
    });
    return { id: design.id, versionId: design.versions[0].id, number: 1 };
  }

  /** Every save creates a new immutable version; orders keep pointing at the version that was bought. */
  @Post("designs/:id/versions")
  async version(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(zodBody(VersionIn)) body: z.infer<typeof VersionIn>,
    @CurrentUser() user: User | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const owner = this.owners.resolve(user, req, res);
    await this.throttle(owner, "design", 60);
    const d = await this.own(id, owner);
    await this.checkAreas(d.productId, body.areas);
    const last = await this.prisma.designVersion.findFirst({ where: { designId: d.id }, orderBy: { number: "desc" } });
    const number = (last?.number ?? 0) + 1;
    const v = await this.prisma.designVersion.create({ data: { designId: d.id, number, areas: body.areas as Prisma.InputJsonValue } });
    await this.prisma.design.update({ where: { id: d.id }, data: { name: body.name || d.name } });
    return { id: d.id, versionId: v.id, number };
  }

  /** Upload a rendered print file (exact print-area size) or the preview image for a version. */
  @Post("designs/:id/versions/:vid/files")
  @UseInterceptors(upload(60 * 1024 * 1024))
  async files(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("vid", ParseUUIDPipe) vid: string,
    @Body("position") position: string,
    @UploadedFile() file: File | undefined,
    @CurrentUser() user: User | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!file) throw new BadRequestException("Missing file.");
    const owner = this.owners.resolve(user, req, res);
    await this.throttle(owner, "render", 120);
    const d = await this.own(id, owner);
    const v = await this.prisma.designVersion.findFirst({ where: { id: vid, designId: d.id } });
    if (!v) throw new NotFoundException("Design version not found.");

    if (position === "__preview") {
      const img = await processUpload(file.buffer).catch(rethrow);
      if (img.width > 2400 || img.height > 2400) throw new BadRequestException("Preview is too large.");
      const key = this.storage.newKey("previews", img.ext);
      await this.storage.save(key, img.data);
      await this.prisma.designVersion.update({ where: { id: v.id }, data: { previewKey: key } });
      return { ok: true };
    }

    const areas = v.areas as Record<string, { widthPx: number; heightPx: number }>;
    const area = areas[position];
    if (!area) throw new BadRequestException("Unknown print area.");
    await checkPrintFile(file.buffer, area.widthPx, area.heightPx).catch(rethrow);
    const key = this.storage.newKey("renders", "png");
    await this.storage.save(key, file.buffer);
    // read-modify-write inside a transaction so parallel uploads for other areas are kept
    await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.designVersion.findUniqueOrThrow({ where: { id: v.id } });
      const files = { ...((fresh.printFiles as Record<string, unknown>) ?? {}), [position]: { key, widthPx: area.widthPx, heightPx: area.heightPx } };
      await tx.designVersion.update({ where: { id: v.id }, data: { printFiles: files as Prisma.InputJsonValue } });
    });
    return { ok: true };
  }

  @Patch("admin/designs/:id/template")
  @UseGuards(AuthGuard)
  @Roles("ADMIN", "STAFF")
  async template(@Param("id", ParseUUIDPipe) id: string, @Body(zodBody(z.object({ isTemplate: z.boolean() }))) body: { isTemplate: boolean }) {
    return this.prisma.design.update({ where: { id }, data: { isTemplate: body.isTemplate }, select: { id: true, isTemplate: true } });
  }

  // ── helpers ──

  private async own(id: string, owner: Owner) {
    const d = await this.prisma.design.findFirst({ where: { id, ...ownerWhere(owner) } });
    if (!d) throw new NotFoundException("Design not found.");
    return d;
  }

  /** Each area must match a print area of the product (same position and exact pixel size). */
  private async checkAreas(productId: string, areas: Record<string, { widthPx: number; heightPx: number }>) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, status: { not: "ARCHIVED" } }, include: { printAreas: true } });
    if (!product) throw new NotFoundException("Product not found.");
    for (const [position, a] of Object.entries(areas)) {
      const ok = product.printAreas.some((p) => p.position === position && p.widthPx === a.widthPx && p.heightPx === a.heightPx);
      if (!ok) throw new BadRequestException(`Print area "${position}" does not match this product.`);
    }
  }

  private async throttle(owner: Owner, what: string, perMinute: number) {
    if (await this.limits.hit(`${what}:${owner.userId ?? owner.guestToken}`, perMinute, 60)) throw new TooManyRequests();
  }
}

function rethrow(err: unknown): never {
  if (err instanceof UploadError) throw new BadRequestException(err.message);
  throw err;
}
