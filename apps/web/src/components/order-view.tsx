import { money } from "@/lib/utils";

export type Order = {
  number: string;
  status: string;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  items: Array<{ id: string; quantity: number; unitPriceCents: number; variant: string; product: { title: string; slug: string } }>;
  shipments: Array<{ carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; shippedAt: string | null; deliveredAt: string | null }>;
};

export const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid — preparing",
  SUBMITTING: "Sending to print",
  IN_PRODUCTION: "Printing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELED: "Canceled",
  NEEDS_ATTENTION: "Being reviewed",
};

const STEPS = ["PAID", "IN_PRODUCTION", "SHIPPED", "DELIVERED"];

export function OrderView({ o }: { o: Order }) {
  const step = Math.max(STEPS.indexOf(o.status === "SUBMITTING" ? "IN_PRODUCTION" : o.status), o.status === "NEEDS_ATTENTION" ? 0 : -1);
  return (
    <div className="grid gap-6">
      <ol className="grid grid-cols-4 gap-2 text-center text-xs" aria-label="Order progress">
        {["Paid", "Printing", "Shipped", "Delivered"].map((label, i) => (
          <li key={label} className={i <= step ? "font-medium text-fg" : "text-muted"}>
            <div className={`mb-1 h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`} />
            {label}
          </li>
        ))}
      </ol>
      {o.shipments.map((s, i) => (
        <div key={i} className="rounded-xl border border-line p-3 text-sm">
          Shipped{s.carrier ? ` with ${s.carrier}` : ""} {s.trackingNumber && <>· {s.trackingNumber}</>}{" "}
          {s.trackingUrl?.startsWith("https://") && (
            <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-accent">
              Track package
            </a>
          )}
        </div>
      ))}
      <ul className="divide-y divide-line text-sm">
        {o.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-2 py-2">
            <span>
              {i.product.title} — {i.variant} × {i.quantity}
            </span>
            <span>{money(i.unitPriceCents * i.quantity, o.currency)}</span>
          </li>
        ))}
      </ul>
      <dl className="ml-auto grid w-64 grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted">Subtotal</dt>
        <dd className="text-right">{money(o.subtotalCents, o.currency)}</dd>
        {o.discountCents > 0 && (
          <>
            <dt className="text-muted">Discount</dt>
            <dd className="text-right">−{money(o.discountCents, o.currency)}</dd>
          </>
        )}
        <dt className="text-muted">Shipping</dt>
        <dd className="text-right">{money(o.shippingCents, o.currency)}</dd>
        <dt className="font-semibold">Total</dt>
        <dd className="text-right font-semibold">{money(o.totalCents, o.currency)}</dd>
      </dl>
    </div>
  );
}
