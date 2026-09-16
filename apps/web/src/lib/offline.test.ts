import { describe, expect, it, vi } from "vitest";
import { POSAPIError } from "./client";
import { enqueueCheckout, listPending, syncPending } from "./offline";
import type { CheckoutCommand, Order } from "./types";

function command(key: string, userMarker = "day-1"): CheckoutCommand {
  return {
    idempotency_key: key, business_day_id: userMarker,
    lines: [{ variant_id: "vanilla-single", quantity: 1, modifier_ids: ["cup"], notes: "" }],
    payment: { method: "CASH", tendered_ngwee: 2200, provider: null, reference: null }, offline: false,
  };
}

describe("offline checkout queue", () => {
  it("marks cash orders offline, keeps owner namespaces separate and replays sequentially", async () => {
    const suffix = crypto.randomUUID();
    const firstUser = `cashier-a-${suffix}`;
    const secondUser = `cashier-b-${suffix}`;
    await enqueueCheckout(firstUser, command(`first-${suffix}`));
    await enqueueCheckout(firstUser, command(`second-${suffix}`));
    await enqueueCheckout(secondUser, command(`other-${suffix}`));
    expect(await listPending(firstUser)).toHaveLength(2);
    expect((await listPending(firstUser))[0].command.offline).toBe(true);
    expect(await listPending(secondUser)).toHaveLength(1);

    const seen: string[] = [];
    const client = { checkout: vi.fn(async (checkout: CheckoutCommand) => {
      seen.push(checkout.idempotency_key);
      return { id: checkout.idempotency_key } as Order;
    }) };
    const result = await syncPending(firstUser, client);
    expect(seen).toEqual([`first-${suffix}`, `second-${suffix}`]);
    expect(result.synced).toHaveLength(2);
    expect(await listPending(firstUser)).toEqual([]);
    expect(await listPending(secondUser)).toHaveLength(1);
  });

  it("retains rejected commands with their error and does not retry them automatically", async () => {
    const userId = `rejected-${crypto.randomUUID()}`;
    await enqueueCheckout(userId, command(`bad-${userId}`));
    const checkout = vi.fn().mockRejectedValue(new POSAPIError("Business day is closed", 409));
    const result = await syncPending(userId, { checkout });
    expect(result.rejected[0]).toMatchObject({ status: "REJECTED", error: "Business day is closed", attempts: 1 });
    await syncPending(userId, { checkout });
    expect(checkout).toHaveBeenCalledTimes(1);
  });

  it("rejects non-cash orders and changed queued payloads", async () => {
    const userId = `owner-${crypto.randomUUID()}`;
    const queued = command(`key-${userId}`);
    await enqueueCheckout(userId, queued);
    await expect(enqueueCheckout(userId, { ...queued, business_day_id: "changed" })).rejects.toMatchObject({ status: 409 });
    await expect(enqueueCheckout(userId, { ...command("manual"), payment: { method: "CARD_MANUAL", provider: "Terminal", reference: "1" } })).rejects.toThrow(/cash/i);
  });

  it("refuses a sale when durable browser storage is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    try {
      await expect(enqueueCheckout("cashier", command("no-storage"))).rejects.toThrow("Offline storage unavailable; order has not been saved");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps service failures pending and replays the exact key on recovery", async () => {
    const userId = `transient-${crypto.randomUUID()}`;
    const queued = await enqueueCheckout(userId, command(`retry-${crypto.randomUUID()}`));
    const checkout = vi.fn()
      .mockRejectedValueOnce(new POSAPIError("Service unavailable", 503))
      .mockResolvedValueOnce({ id: "accepted-order" } as Order);
    const first = await syncPending(userId, { checkout });
    expect(first.remaining[0]).toMatchObject({ status: "PENDING", attempts: 1, error: "Service unavailable" });
    const second = await syncPending(userId, { checkout });
    expect(second.synced[0].pending.command).toEqual(queued.command);
    expect(checkout.mock.calls[0][0].idempotency_key).toBe(checkout.mock.calls[1][0].idempotency_key);
    expect(await listPending(userId)).toEqual([]);
  });

  it("keeps authorization failures pending for re-login", async () => {
    const userId = `auth-${crypto.randomUUID()}`;
    await enqueueCheckout(userId, command(`auth-${crypto.randomUUID()}`));
    const result = await syncPending(userId, { checkout: vi.fn().mockRejectedValue(new POSAPIError("Sign in again", 401)) });
    expect(result.rejected).toEqual([]);
    expect(result.remaining[0]).toMatchObject({ status: "PENDING", error: "Sign in again" });
  });
});
