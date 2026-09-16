import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_STORAGE_KEY, DemoClient } from "./demo";
import type { CheckoutCommand } from "./types";

function command(dayId: string, key: string = crypto.randomUUID()): CheckoutCommand {
  return {
    idempotency_key: key,
    business_day_id: dayId,
    lines: [{ variant_id: "vanilla-double", quantity: 1, modifier_ids: ["cone", "oreo"], notes: "" }],
    payment: { method: "CASH", tendered_ngwee: 5000, provider: null, reference: null },
    offline: false,
  };
}

describe("DemoClient", () => {
  beforeEach(() => localStorage.removeItem(DEMO_STORAGE_KEY));

  it("runs a coherent sale, preparation, refund, stock and report flow across refresh", async () => {
    const client = new DemoClient();
    expect((await client.session()).name).toBe("Demo manager");
    const day = await client.currentDay();
    expect(day?.opening_float_ngwee).toBe(50_000);
    expect(await client.orders()).toEqual([]);

    const before = await client.inventory();
    const order = await client.checkout(command(day!.id, "flow-key-1"));
    expect(order.total_ngwee).toBe(4200);
    expect(order.payment.change_ngwee).toBe(800);
    expect((await client.checkout(command(day!.id, "flow-key-1"))).id).toBe(order.id);

    const preparing = await client.transition(order, "PREPARING");
    expect((await new DemoClient().orders(true))[0].status).toBe("PREPARING");
    const refunded = await client.refund(preparing, "Customer refund");
    expect(refunded.payment.status).toBe("REFUNDED");
    const report = await client.report(day!.id);
    expect(report).toMatchObject({ gross_sales_ngwee: 4200, refunds_ngwee: 4200, net_sales_ngwee: 0, expected_cash_ngwee: 50_000 });

    const after = await client.inventory();
    const vanillaBefore = before.find((item) => item.id === "vanilla-mix")!;
    const vanillaAfter = after.find((item) => item.id === "vanilla-mix")!;
    expect(Number(vanillaBefore.on_hand) - Number(vanillaAfter.on_hand)).toBe(160);
  });

  it("rejects changed payloads for a used idempotency key", async () => {
    const client = new DemoClient();
    const day = await client.currentDay();
    const original = command(day!.id, "same-key");
    await client.checkout(original);
    await expect(client.checkout({ ...original, lines: [{ ...original.lines[0], modifier_ids: ["cup"] }] })).rejects.toMatchObject({ status: 409 });
    expect(await client.orders()).toHaveLength(1);
  });

  it("rejects insufficient cash without creating a sale", async () => {
    const client = new DemoClient();
    const day = await client.currentDay();
    const checkout = command(day!.id);
    checkout.payment.tendered_ngwee = 4100;
    await expect(client.checkout(checkout)).rejects.toThrow(/less than/i);
    expect(await client.orders()).toEqual([]);
  });

  it("records stock count variance without overwriting the ledger balance", async () => {
    const client = new DemoClient();
    const before = (await client.inventory()).find((item) => item.id === "cone-stock")!;
    const count = await client.count({ item_id: "cone-stock", counted_quantity: "297.000", reason: "Evening count" });
    expect(count).toMatchObject({ expected_quantity: "300.000", counted_quantity: "297.000", variance: "-3.000" });
    expect((await client.inventory()).find((item) => item.id === "cone-stock")!.on_hand).toBe(before.on_hand);
    expect(await client.movements("cone-stock")).toHaveLength(1);
  });
});
