import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DashboardApp } from "./App";
import type { DashboardSource } from "./data";

const report = {
  business_day_id: "day-1",
  opened_at: "2026-10-17T08:00:00Z",
  closed_at: null,
  net_sales_ngwee: 12600,
  gross_sales_ngwee: 12600,
  completed_sale_count: 3,
  units_sold: 4,
  average_order_ngwee: 4200,
  payment_totals: { CASH: 4200, MOBILE_MONEY_MANUAL: 4200, CARD_MANUAL: 4200 },
  expected_cash_ngwee: 54200,
  actual_cash_ngwee: null,
  variance_ngwee: null,
  products: [{ name: "Vanilla · Double", quantity: 3, total_ngwee: 9600 }],
  hourly_sales: [{ hour: "10:00", order_count: 2, net_sales_ngwee: 8400 }],
  stock_usage: [{ item_id: "vanilla", name: "Vanilla mix", quantity: "480.000", unit: "ml" }],
  waste: [{ id: "waste-1", kind: "PREPARED", label: "Chocolate · Single",
    quantity: "1.000", reason: "DROPPED", comment: "", value_ngwee: 2200,
    actor_name: "Chipo", created_at: "2026-10-17T10:30:00Z" }],
  sales: [], cash_activity: [], cash_movements: [], cash_reconciliation: {
    opening_float_ngwee: 50000, cash_sales_ngwee: 4200, cash_reversals_ngwee: 0,
    cash_movements_ngwee: 0, expected_cash_ngwee: 54200,
  },
  order_count: 3, refunds_ngwee: 0, corrections_ngwee: 0, opening_float_ngwee: 50000,
  cash_movements_ngwee: 0, opened_by_name: "Mwansa", closed_by_name: null,
};

function source(lastSyncedAt = "2026-10-17T10:35:00Z"): DashboardSource {
  return {
    session: vi.fn().mockResolvedValue(null),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue({
      stores: [{ store_id: "store-1", name: "Happy Cone", stand_name: "Lusaka stand",
        location: "Lusaka", currency_symbol: "K", timezone: "Africa/Lusaka",
        last_synced_at: lastSyncedAt }],
      days: [{ store_id: "store-1", business_day_id: "day-1", opened_at: report.opened_at,
        closed_at: null, summary: report }],
      inventory: [{ id: "vanilla", name: "Vanilla mix", unit: "ml", on_hand: "12000.000",
        low_stock_threshold: "2000.000", active: true }],
    }),
    onAuthChange: vi.fn().mockReturnValue(() => undefined),
  };
}

describe("owner dashboard", () => {
  it("signs in and shows one-store sales, payments, stock, waste and cash", async () => {
    vi.setSystemTime(new Date("2026-10-17T10:40:00Z"));
    const data = source();
    const user = userEvent.setup();
    render(<DashboardApp source={data} />);
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(password, "long-owner-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("K126.00")).toBeInTheDocument();
    expect(screen.getByText("Vanilla · Double")).toBeInTheDocument();
    expect(screen.getByText("Mobile money")).toBeInTheDocument();
    expect(screen.getByText("Vanilla mix")).toBeInTheDocument();
    expect(screen.getByText("Chocolate · Single")).toBeInTheDocument();
    expect(screen.getByText("K542.00")).toBeInTheDocument();
  });

  it("warns clearly when the store has not synced recently", async () => {
    vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
    const data = source("2026-10-17T10:35:00Z");
    vi.mocked(data.session).mockResolvedValue({ email: "owner@example.com" });
    render(<DashboardApp source={data} />);
    expect(await screen.findByRole("status")).toHaveTextContent(/last update is old/i);
  });
});
