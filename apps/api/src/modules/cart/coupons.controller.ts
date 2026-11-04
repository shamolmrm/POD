import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import type { User } from "@prisma/client";
import { z } from "zod";
import { AuditService } from "../../common/audit.service";
import { zodBody } from "../../common/http";
import { PrismaService } from "../../prisma.service";
import { AuthGuard, CurrentUser, Roles } from "../auth/guards";

const CouponIn = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/, "Use 3-40 letters, digits, - or _"),
    type: z.enum(["PERCENT", "FIXED"]),
    value: z.number().int().positive(),
    minSubtotal: z.number().int().min(0).default(0),
    maxRedemptions: z.number().int().positive().nullable().optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
  })
  .refine((c) => c.type !== "PERCENT" || c.value <= 100, { message: "A percent coupon cannot exceed 100", path: ["value"] });

@Controller("admin/coupons")
@UseGuards(AuthGuard)
@Roles("ADMIN", "STAFF")
export class CouponsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  }

  @Post()
  async create(@CurrentUser() user: User, @Body(zodBody(CouponIn)) body: z.infer<typeof CouponIn>) {
    const c = await this.prisma.coupon.create({ data: body });
    await this.audit.record("coupon.create", { actorId: user.id, target: c.code });
    return c;
  }

  @Patch(":id")
  async toggle(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string, @Body(zodBody(z.object({ isActive: z.boolean() }))) body: { isActive: boolean }) {
    const c = await this.prisma.coupon.update({ where: { id }, data: { isActive: body.isActive } });
    await this.audit.record("coupon.toggle", { actorId: user.id, target: c.code, detail: body });
    return c;
  }
}
