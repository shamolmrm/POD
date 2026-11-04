import type { Coupon } from "@prisma/client";

/** Pure money logic (integer cents). Shared by cart display and checkout so totals always match. */

export type Line = { unitPriceCents: number; quantity: number };

export function subtotal(lines: Line[]): number {
  return lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
}

/** Discount for a coupon, or a reason why it cannot be used. Never exceeds the subtotal. */
export function couponDiscount(c: Coupon | null, subtotalCents: number, now = new Date()): { cents: number } | { error: string } {
  if (!c || !c.isActive) return { error: "This code is not valid." };
  if (c.startsAt && c.startsAt > now) return { error: "This code is not active yet." };
  if (c.endsAt && c.endsAt < now) return { error: "This code has expired." };
  if (c.maxRedemptions !== null && c.redeemed >= c.maxRedemptions) return { error: "This code has been fully used." };
  if (subtotalCents < c.minSubtotal) return { error: `This code needs an order of at least $${(c.minSubtotal / 100).toFixed(2)}.` };
  const raw = c.type === "PERCENT" ? Math.round((subtotalCents * Math.min(100, Math.max(0, c.value))) / 100) : c.value;
  return { cents: Math.max(0, Math.min(raw, subtotalCents)) };
}

export function totals(lines: Line[], discountCents: number, shippingCents: number) {
  const sub = subtotal(lines);
  const discount = Math.min(discountCents, sub);
  return { subtotalCents: sub, discountCents: discount, shippingCents, totalCents: sub - discount + shippingCents };
}
