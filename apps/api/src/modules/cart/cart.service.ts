import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, User } from "@prisma/client";
import type { Request, Response } from "express";
import { PrismaService } from "../../prisma.service";
import { OwnerService } from "../designs/owner";
import { StorageService } from "../files/storage.service";
import { type AddressTo, PrintifyClient } from "../printify/printify.client";
import { couponDiscount, totals } from "./pricing";

const MAX_ITEMS = 30;
const CART_INCLUDE = {
  items: {
    orderBy: { id: "asc" as const },
    include: {
      variant: { include: { product: { select: { id: true, slug: true, title: true, status: true, currency: true, printifyBlueprintId: true, printifyProviderId: true, images: true } } } },
      designVersion: { select: { id: true, previewKey: true, printFiles: true, areas: true, design: { select: { id: true, name: true } } } },
    },
  },
} satisfies Prisma.CartInclude;

export type FullCart = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly owners: OwnerService,
    private readonly storage: StorageService,
    private readonly printify: PrintifyClient,
  ) {}

  /** The cart for this request; a guest cart is merged into the user's cart after sign-in. */
  async cart(user: User | null, req: Request, res: Response): Promise<FullCart> {
    const owner = this.owners.resolve(user, req, res);
    if (owner.userId) {
      const userCart = await this.prisma.cart.upsert({ where: { userId: owner.userId }, create: { userId: owner.userId }, update: {} });
      const guestHash = OwnerService.guestHash(req);
      if (guestHash) {
        const guest = await this.prisma.cart.findUnique({ where: { guestToken: guestHash } });
        if (guest && guest.id !== userCart.id) {
          await this.prisma.cartItem.updateMany({ where: { cartId: guest.id }, data: { cartId: userCart.id } });
          await this.prisma.cart.delete({ where: { id: guest.id } });
        }
      }
      return this.prisma.cart.findUniqueOrThrow({ where: { id: userCart.id }, include: CART_INCLUDE });
    }
    const guestToken = owner.guestToken as string;
    return this.prisma.cart.upsert({ where: { guestToken }, create: { guestToken }, update: {}, include: CART_INCLUDE });
  }

  async add(cartId: string, input: { variantId: string; designVersionId: string; quantity: number }, owner: { userId: string | null; guestToken: string | null }) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: input.variantId }, include: { product: { include: { printAreas: true } } } });
    if (!variant || !variant.isEnabled || variant.product.status !== "ACTIVE") throw new BadRequestException("This product option is not available.");
    if (variant.product.isDemo) throw new BadRequestException("This is a demo product and can't be ordered yet. Real products are coming soon!");
    const version = await this.prisma.designVersion.findUnique({ where: { id: input.designVersionId }, include: { design: true } });
    const ownsDesign = version && (owner.userId ? version.design.ownerId === owner.userId : version.design.guestToken === owner.guestToken);
    if (!version || !ownsDesign) throw new NotFoundException("Design not found.");
    if (version.design.productId !== variant.productId) throw new BadRequestException("This design was made for a different product.");

    // every designed area must fit this variant and have its print file ready
    const areas = version.areas as Record<string, { widthPx: number; heightPx: number }>;
    const files = (version.printFiles as Record<string, { key: string }> | null) ?? {};
    for (const [pos, a] of Object.entries(areas)) {
      const fits = variant.product.printAreas.some(
        (p) => p.position === pos && p.widthPx === a.widthPx && p.heightPx === a.heightPx && ((p.variantIds as number[]).length === 0 || (p.variantIds as number[]).includes(variant.printifyVariantId)),
      );
      if (!fits) throw new BadRequestException(`The "${pos}" design does not fit this size. Open the editor with this size selected and save again.`);
      if (!files[pos]) throw new BadRequestException("Print files are missing. Please add to cart from the editor again.");
    }
    if ((await this.prisma.cartItem.count({ where: { cartId } })) >= MAX_ITEMS) throw new BadRequestException("Your cart is full.");
    const same = await this.prisma.cartItem.findFirst({ where: { cartId, variantId: variant.id, designVersionId: version.id } });
    if (same) return this.prisma.cartItem.update({ where: { id: same.id }, data: { quantity: Math.min(50, same.quantity + input.quantity) } });
    return this.prisma.cartItem.create({ data: { cartId, variantId: variant.id, designVersionId: version.id, quantity: input.quantity } });
  }

  /** Cart as shown to the customer: current prices from the catalog, coupon applied. */
  async view(cart: FullCart) {
    const items = cart.items.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      unitPriceCents: i.variant.priceCents,
      available: i.variant.isEnabled && i.variant.product.status === "ACTIVE",
      variant: { id: i.variant.id, title: i.variant.title },
      product: { slug: i.variant.product.slug, title: i.variant.product.title, image: (i.variant.product.images as string[])[0] ?? null },
      design: { id: i.designVersion.design.id, name: i.designVersion.design.name, preview: i.designVersion.previewKey ? this.storage.signedUrl(i.designVersion.previewKey) : null },
    }));
    const lines = items.filter((i) => i.available);
    let discountCents = 0;
    let couponError: string | null = null;
    if (cart.couponCode) {
      const coupon = await this.prisma.coupon.findUnique({ where: { code: cart.couponCode } });
      const d = couponDiscount(coupon, lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0));
      if ("cents" in d) discountCents = d.cents;
      else couponError = d.error;
    }
    return { id: cart.id, items, couponCode: cart.couponCode, couponError, currency: "USD", ...totals(lines, discountCents, 0) };
  }

  /** Live Printify shipping quote (standard) for the cart's items to a destination. */
  async shippingQuote(cart: FullCart, address: Partial<AddressTo> & { country: string }) {
    const items = cart.items.filter((i) => i.variant.isEnabled && i.variant.product.status === "ACTIVE");
    if (!items.length) throw new BadRequestException("Your cart is empty.");
    const quote = await this.printify.calculateShipping({
      line_items: items.map((i) => ({
        print_provider_id: i.variant.product.printifyProviderId,
        blueprint_id: i.variant.product.printifyBlueprintId,
        variant_id: i.variant.printifyVariantId,
        quantity: i.quantity,
      })),
      address_to: address,
    });
    if (typeof quote.standard !== "number") throw new BadRequestException("Shipping to this address is not available.");
    return { standardCents: quote.standard };
  }
}
