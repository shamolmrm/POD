import type { Coupon } from "@prisma/client";
import { couponDiscount, subtotal, totals } from "../src/modules/cart/pricing";

const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  id: "c",
  code: "SAVE10",
  type: "PERCENT",
  value: 10,
  minSubtotal: 0,
  maxRedemptions: null,
  redeemed: 0,
  startsAt: null,
  endsAt: null,
  isActive: true,
  createdAt: new Date(),
  ...over,
});

describe("pricing", () => {
  it("subtotal and totals use integer cents", () => {
    const lines = [
      { unitPriceCents: 2499, quantity: 2 },
      { unitPriceCents: 1599, quantity: 1 },
    ];
    expect(subtotal(lines)).toBe(6597);
    expect(totals(lines, 660, 475)).toEqual({ subtotalCents: 6597, discountCents: 660, shippingCents: 475, totalCents: 6412 });
    expect(totals(lines, 99999, 0).totalCents).toBe(0); // discount never exceeds the subtotal
  });

  it("percent and fixed coupons", () => {
    expect(couponDiscount(coupon(), 6597)).toEqual({ cents: 660 });
    expect(couponDiscount(coupon({ type: "FIXED", value: 500 }), 6597)).toEqual({ cents: 500 });
    expect(couponDiscount(coupon({ type: "FIXED", value: 9000 }), 6597)).toEqual({ cents: 6597 });
  });

  it("rejects inactive, expired, early, exhausted and below-minimum coupons", () => {
    const now = new Date("2026-11-04T12:00:00Z");
    expect(couponDiscount(null, 1000)).toEqual({ error: "This code is not valid." });
    expect(couponDiscount(coupon({ isActive: false }), 1000)).toHaveProperty("error");
    expect(couponDiscount(coupon({ endsAt: new Date("2026-11-01") }), 1000, now)).toEqual({ error: "This code has expired." });
    expect(couponDiscount(coupon({ startsAt: new Date("2026-12-01") }), 1000, now)).toEqual({ error: "This code is not active yet." });
    expect(couponDiscount(coupon({ maxRedemptions: 5, redeemed: 5 }), 1000)).toEqual({ error: "This code has been fully used." });
    expect(couponDiscount(coupon({ minSubtotal: 5000 }), 4999)).toHaveProperty("error");
  });
});
