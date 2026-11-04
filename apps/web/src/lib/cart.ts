export type CartItem = {
  id: string;
  quantity: number;
  unitPriceCents: number;
  available: boolean;
  variant: { id: string; title: string };
  product: { slug: string; title: string; image: string | null };
  design: { id: string; name: string; preview: string | null };
};

export type CartView = {
  id: string;
  items: CartItem[];
  couponCode: string | null;
  couponError: string | null;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
};

/** Common destinations first; any ISO code works. */
export const COUNTRIES: Array<[string, string]> = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["NL", "Netherlands"],
  ["IE", "Ireland"],
  ["NZ", "New Zealand"],
  ["SE", "Sweden"],
  ["ES", "Spain"],
  ["IT", "Italy"],
  ["AE", "United Arab Emirates"],
  ["SG", "Singapore"],
  ["IN", "India"],
  ["BD", "Bangladesh"],
];
