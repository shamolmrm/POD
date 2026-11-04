import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { User } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import { TooManyRequests, zodBody } from "../../common/http";
import { RateLimitService } from "../../common/rate-limit.service";
import { PrismaService } from "../../prisma.service";
import { CurrentUser, OptionalAuthGuard } from "../auth/guards";
import { OwnerService } from "../designs/owner";
import { CartService } from "./cart.service";
import { couponDiscount, subtotal } from "./pricing";

const AddIn = z.object({ variantId: z.string().uuid(), designVersionId: z.string().uuid(), quantity: z.number().int().min(1).max(50) });
const QtyIn = z.object({ quantity: z.number().int().min(1).max(50) });
const CouponIn = z.object({ code: z.string().trim().toUpperCase().min(2).max(40) });
export const ShipTo = z.object({
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  region: z.string().trim().max(80).optional(),
  zip: z.string().trim().max(20).optional(),
  city: z.string().trim().max(80).optional(),
});

@Controller("cart")
@UseGuards(OptionalAuthGuard)
export class CartController {
  constructor(
    private readonly carts: CartService,
    private readonly prisma: PrismaService,
    private readonly owners: OwnerService,
    private readonly limits: RateLimitService,
  ) {}

  @Get()
  async get(@CurrentUser() user: User | null, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.carts.view(await this.carts.cart(user, req, res));
  }

  @Post("items")
  async add(@Body(zodBody(AddIn)) body: z.infer<typeof AddIn>, @CurrentUser() user: User | null, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cart = await this.carts.cart(user, req, res);
    await this.carts.add(cart.id, body, this.owners.resolve(user, req, res));
    return this.carts.view(await this.carts.cart(user, req, res));
  }

  @Patch("items/:id")
  async qty(@Param("id", ParseUUIDPipe) id: string, @Body(zodBody(QtyIn)) body: z.infer<typeof QtyIn>, @CurrentUser() user: User | null, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cart = await this.carts.cart(user, req, res);
    const { count } = await this.prisma.cartItem.updateMany({ where: { id, cartId: cart.id }, data: { quantity: body.quantity } });
    if (!count) throw new NotFoundException();
    return this.carts.view(await this.carts.cart(user, req, res));
  }

  @Delete("items/:id")
  async remove(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: User | null, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cart = await this.carts.cart(user, req, res);
    await this.prisma.cartItem.deleteMany({ where: { id, cartId: cart.id } });
    return this.carts.view(await this.carts.cart(user, req, res));
  }

  @Post("coupon")
  @HttpCode(200)
  async coupon(@Body(zodBody(CouponIn)) body: z.infer<typeof CouponIn>, @CurrentUser() user: User | null, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cart = await this.carts.cart(user, req, res);
    if (await this.limits.hit(`coupon:${cart.id}`, 10, 300)) throw new TooManyRequests(); // no brute-forcing codes
    const coupon = await this.prisma.coupon.findUnique({ where: { code: body.code } });
    const view = await this.carts.view(cart);
    const d = couponDiscount(coupon, subtotal(view.items.filter((i) => i.available)));
    if ("error" in d) throw new BadRequestException(d.error);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: body.code } });
    return this.carts.view(await this.carts.cart(user, req, res));
  }

  @Delete("coupon")
  async removeCoupon(@CurrentUser() user: User | null, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cart = await this.carts.cart(user, req, res);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return this.carts.view(await this.carts.cart(user, req, res));
  }

  @Post("shipping")
  @HttpCode(200)
  async shipping(@Body(zodBody(ShipTo)) body: z.infer<typeof ShipTo>, @CurrentUser() user: User | null, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cart = await this.carts.cart(user, req, res);
    if (await this.limits.hit(`ship:${cart.id}`, 20, 60)) throw new TooManyRequests();
    return this.carts.shippingQuote(cart, body);
  }
}
