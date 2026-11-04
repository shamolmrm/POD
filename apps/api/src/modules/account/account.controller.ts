import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import type { User } from "@prisma/client";
import { z } from "zod";
import { zodBody } from "../../common/http";
import { PrismaService } from "../../prisma.service";
import { toPublic } from "../auth/auth.service";
import { AuthGuard, CurrentUser } from "../auth/guards";

const text = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

export const AddressIn = z.object({
  firstName: text(60),
  lastName: text(60),
  phone: optional(30),
  line1: text(120),
  line2: optional(120),
  city: text(80),
  region: optional(80),
  postalCode: text(20),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a 2-letter country code"),
  isDefault: z.boolean().optional().default(false),
});
const ProfileIn = z.object({ name: text(80) });
const MAX_ADDRESSES = 10;

@Controller("account")
@UseGuards(AuthGuard)
export class AccountController {
  constructor(private readonly prisma: PrismaService) {}

  @Patch("profile")
  async profile(@CurrentUser() user: User, @Body(zodBody(ProfileIn)) body: z.infer<typeof ProfileIn>) {
    return toPublic(await this.prisma.user.update({ where: { id: user.id }, data: { name: body.name } }));
  }

  @Get("addresses")
  addresses(@CurrentUser() user: User) {
    return this.prisma.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  }

  @Post("addresses")
  async add(@CurrentUser() user: User, @Body(zodBody(AddressIn)) body: z.infer<typeof AddressIn>) {
    const count = await this.prisma.address.count({ where: { userId: user.id } });
    if (count >= MAX_ADDRESSES) throw new BadRequestException(`You can save up to ${MAX_ADDRESSES} addresses.`);
    return this.prisma.$transaction(async (tx) => {
      const isDefault = body.isDefault || count === 0;
      if (isDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      return tx.address.create({ data: { ...body, isDefault, userId: user.id } });
    });
  }

  @Patch("addresses/:id")
  async update(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(zodBody(AddressIn)) body: z.infer<typeof AddressIn>,
  ) {
    await this.own(user, id);
    return this.prisma.$transaction(async (tx) => {
      if (body.isDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: body });
    });
  }

  @Delete("addresses/:id")
  @HttpCode(204)
  async remove(@CurrentUser() user: User, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.own(user, id);
    await this.prisma.address.delete({ where: { id } });
  }

  private async own(user: User, id: string): Promise<void> {
    const found = await this.prisma.address.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!found) throw new NotFoundException("Address not found.");
  }
}
