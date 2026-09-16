import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import type { Catalog, CheckoutCommand, Day, Order, User } from "../lib/types";

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
  vi.stubGlobal("scrollTo", vi.fn());
});

afterAll(() => {
  if (originalShowModal) HTMLDialogElement.prototype.showModal = originalShowModal;
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  if (originalClose) HTMLDialogElement.prototype.close = originalClose;
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  vi.unstubAllGlobals();
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("live checkout recovery", () => {
  it("reuses the original payment command after an unknown result, dialog close, and reload", async () => {
    const catalog: Catalog = {
      products: [{ id: "vanilla", name: "Vanilla bean", category: "Scoops", description: "Small-batch ice cream", color: "#f5e7bd", active: true, variants: [
        { id: "vanilla-single", name: "Single", price_ngwee: 2200, recipe: [] },
        { id: "vanilla-double", name: "Double", price_ngwee: 3200, recipe: [] },
      ] }],
      modifiers: [
        { id: "cup", name: "Cup", group: "serving", price_ngwee: 0, active: true, recipe: [] },
        { id: "cone", name: "Cone", group: "serving", price_ngwee: 500, active: true, recipe: [] },
        { id: "oreo", name: "Oreo", group: "topping", price_ngwee: 500, active: true, recipe: [] },
      ],
    };
    const day: Day = { id: "live-day", status: "OPEN", opened_at: new Date().toISOString(), closed_at: null, opening_float_ngwee: 50_000, actual_cash_ngwee: null, expected_cash_ngwee: 50_000, variance_ngwee: null, summary: null };
    const currentUser: User = { id: "manager-live", username: "manager", name: "Live manager", role: "MANAGER", active: true };
    const checkoutCalls: CheckoutCommand[] = [];
    let unknownResult = true;
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith("/api/session")) return json(currentUser);
      if (url.includes("/api/catalog")) return json(catalog);
      if (url.endsWith("/api/business-day/current")) return json(day);
      if (url.endsWith("/api/orders/quote")) return json({ lines: [{ variant_id: "vanilla-double", name: "Vanilla bean · Double", quantity: 1, unit_price_ngwee: 4200, total_ngwee: 4200, modifier_names: ["Cone", "Oreo"], notes: "" }], total_ngwee: 4200 });
      if (url.endsWith("/api/orders") && init?.method === "POST") {
        const command = JSON.parse(String(init.body)) as CheckoutCommand;
        checkoutCalls.push(command);
        if (unknownResult) { unknownResult = false; throw new DOMException("Timed out", "AbortError"); }
        const order: Order = { id: "accepted-order", number: "A001", business_day_id: day.id, status: "NEW", created_at: new Date().toISOString(), lines: [{ variant_id: "vanilla-double", name: "Vanilla bean · Double", quantity: 1, unit_price_ngwee: 4200, total_ngwee: 4200, modifier_names: ["Cone", "Oreo"], notes: "" }], total_ngwee: 4200, payment: { method: "CASH", status: "CONFIRMED", amount_ngwee: 4200, tendered_ngwee: 5000, change_ngwee: 800, provider: null, reference: null }, refunded: false, refund_reason: null, offline: false };
        return json(order);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("happy-cone:tour:v1:manager-live", "complete");
    sessionStorage.setItem("happy-cone:session-token", JSON.stringify("live-token"));

    const user = userEvent.setup();
    const first = render(<App/>);
    await screen.findByRole("heading", { name: "A little scoop of happy." });
    await user.click(screen.getByRole("button", { name: "Customize Vanilla bean" }));
    let dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Double/ }));
    await user.click(within(dialog).getByRole("button", { name: /Cone/ }));
    await user.click(within(dialog).getByRole("button", { name: /Oreo/ }));
    await user.click(within(dialog).getByRole("button", { name: /Add to order/ }));
    await user.click(screen.getByRole("button", { name: /Take payment/ }));
    dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Cash received (K)"), "50.00");
    await user.click(within(dialog).getByRole("button", { name: /Confirm payment/ }));
    expect(await within(dialog).findByText(/request timed out/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close dialog" }));
    await user.click(screen.getByRole("button", { name: /Recover saved payment/ }));
    expect(await screen.findByText(/Recovering your saved payment/i)).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close dialog" }));
    first.unmount();

    render(<App/>);
    await screen.findByRole("heading", { name: "A little scoop of happy." });
    await user.click(screen.getByRole("button", { name: /Recover saved payment/ }));
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Confirm payment/ }));
    expect(await screen.findByText("A001")).toBeInTheDocument();
    expect(checkoutCalls).toHaveLength(2);
    expect(checkoutCalls[1]).toEqual(checkoutCalls[0]);
    vi.unstubAllGlobals();
  });
});
