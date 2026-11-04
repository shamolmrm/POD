import { canMove, orderNumber, OrdersService } from "../src/modules/orders/orders.service";
import { fromCents, toCents, type Verified } from "../src/modules/payments/provider";
import { SslcommerzProvider } from "../src/modules/payments/sslcommerz.provider";

describe("money helpers", () => {
  it("parses gateway amounts exactly", () => {
    expect(toCents("12.50")).toBe(1250);
    expect(toCents("12.5")).toBe(1250);
    expect(toCents("12")).toBe(1200);
    expect(toCents("12.505")).toBeNaN();
    expect(toCents("abc")).toBeNaN();
    expect(fromCents(6412)).toBe("64.12");
  });
});

describe("order rules", () => {
  it("only allows sensible status changes", () => {
    expect(canMove("PENDING_PAYMENT", "PAID")).toBe(true);
    expect(canMove("PENDING_PAYMENT", "IN_PRODUCTION")).toBe(false); // never produce unpaid orders
    expect(canMove("DELIVERED", "PAID")).toBe(false);
    expect(canMove("NEEDS_ATTENTION", "PAID")).toBe(true);
  });

  it("order numbers are readable and unique-ish", () => {
    const n = orderNumber(new Date("2026-11-04T10:00:00Z"));
    expect(n).toMatch(/^CPS-261104-[A-Z2-9]{5}$/);
    expect(new Set(Array.from({ length: 200 }, () => orderNumber())).size).toBe(200);
  });
});

describe("SslcommerzProvider.verify", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("is not paid without a val_id (cancel/fail returns)", async () => {
    const p = new SslcommerzProvider();
    expect(await p.verify({ tran_id: "t", status: "CANCELLED" })).toMatchObject({ ok: false });
  });

  it("trusts only the validation API response", async () => {
    global.fetch = jest.fn(async () => ({
      json: async () => ({ status: "VALID", tran_id: "pay-1", currency_type: "USD", currency_amount: "64.12", amount: "7600.00", bank_tran_id: "B1", risk_level: "0", card_no: "4111XXXX" }),
      status: 200,
    })) as unknown as typeof fetch;
    const v = await new SslcommerzProvider().verify({ val_id: "V1", tran_id: "forged-in-body", amount: "1.00" });
    expect(v).toMatchObject({ ok: true, txnId: "pay-1", amountCents: 6412, currency: "USD", highRisk: false, providerTxnId: "B1" });
    expect((v as { raw: Record<string, unknown> }).raw.card_no).toBeUndefined(); // card data not kept
  });

  it("rejects invalid transactions", async () => {
    global.fetch = jest.fn(async () => ({ json: async () => ({ status: "INVALID_TRANSACTION" }), status: 200 })) as unknown as typeof fetch;
    expect(await new SslcommerzProvider().verify({ val_id: "V1", tran_id: "x" })).toMatchObject({ ok: false });
  });
});

describe("OrdersService.applyPayment", () => {
  const PAY_ID = "11111111-1111-4111-8111-111111111111";

  function setup(status = "PENDING_PAYMENT") {
    const order = { id: "o1", number: "CPS-1", status, couponCode: null, userId: null };
    const payment = { id: PAY_ID, amountCents: 6412, currency: "USD", status: "INITIATED", provider: "sslcommerz", detail: { cartId: "c1" }, order };
    const calls: string[] = [];
    const tx = {
      order: {
        updateMany: async ({ where }: { where: { status: string } }) => {
          const hit = order.status === where.status;
          if (hit) order.status = "PAID";
          calls.push(`order.update:${hit}`);
          return { count: hit ? 1 : 0 };
        },
      },
      payment: { update: async () => calls.push("payment.update") },
      coupon: { updateMany: async () => calls.push("coupon") },
      cartItem: { deleteMany: async () => calls.push("cart.clear") },
    };
    const prisma = {
      payment: { findUnique: async () => payment, update: async () => calls.push("payment.fail") },
      order: { update: async ({ data }: { data: { status: string } }) => ((order.status = data.status), calls.push(`order.flag:${data.status}`)) },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    };
    const service = Object.create(OrdersService.prototype) as OrdersService;
    Object.assign(service, {
      prisma,
      audit: { record: async () => undefined },
      mailer: { orderConfirmation: async () => calls.push("mail") },
      log: { error: () => undefined, warn: () => undefined },
      enqueue: async () => calls.push("enqueue"),
    });
    return { service, order, calls };
  }

  const ok = (over: Partial<Extract<Verified, { ok: true }>> = {}): Verified => ({
    ok: true,
    txnId: PAY_ID,
    providerTxnId: "B1",
    amountCents: 6412,
    currency: "USD",
    highRisk: false,
    raw: {},
    ...over,
  });

  it("marks paid once, clears the cart, queues fulfilment, ignores duplicates", async () => {
    const { service, order, calls } = setup();
    expect(await service.applyPayment(ok())).toEqual({ orderNumber: "CPS-1", paid: true });
    expect(order.status).toBe("PAID");
    expect(calls).toEqual(expect.arrayContaining(["payment.update", "cart.clear", "enqueue", "mail"]));
    calls.length = 0;
    await service.applyPayment(ok()); // duplicate IPN
    expect(calls).toEqual(["order.update:false"]);
  });

  it("does not mark paid when the amount or currency differs", async () => {
    for (const bad of [ok({ amountCents: 100 }), ok({ currency: "BDT" })]) {
      const { service, order, calls } = setup();
      expect((await service.applyPayment(bad)).paid).toBe(false);
      expect(order.status).toBe("NEEDS_ATTENTION");
      expect(calls).not.toContain("enqueue");
    }
  });

  it("ignores unknown transaction ids", async () => {
    const { service, calls } = setup();
    expect(await service.applyPayment(ok({ txnId: "not-a-uuid" }))).toEqual({ paid: false });
    expect(calls).toEqual([]);
  });
});
