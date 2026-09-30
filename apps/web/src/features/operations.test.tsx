import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Reports, Sales } from "./Operations";
import type { Day, Order, POSClient, Summary } from "../lib/types";

const completedSale: Order = {
  id: "sale-1",
  number: "A001",
  business_day_id: "day-1",
  status: "SERVED",
  created_at: "2026-09-28T08:00:00Z",
  cashier_name: "Mwansa Banda",
  lines: [
    {
      variant_id: "vanilla-double",
      name: "Vanilla · Double",
      quantity: 1,
      unit_price_ngwee: 4200,
      total_ngwee: 4200,
      modifier_names: ["Waffle cone"],
      notes: "",
    },
  ],
  total_ngwee: 4200,
  payment: {
    method: "CASH",
    status: "CONFIRMED",
    amount_ngwee: 4200,
    tendered_ngwee: 5000,
    change_ngwee: 800,
    provider: null,
    reference: null,
  },
  refunded: false,
  refund_reason: null,
  offline: false,
};

describe("sales history", () => {
  it("presents completed sales by receipt number without preparation statuses", async () => {
    const client = {
      orders: vi.fn().mockResolvedValue([completedSale]),
    } as unknown as POSClient;

    render(
      <Sales
        client={client}
        canManage
        onReceipt={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("columnheader", { name: "Receipt No." }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Search sales")).toHaveAttribute(
      "placeholder",
      "Receipt number or product",
    );
    expect(
      screen.getByText("Completed", { selector: ".badge" }),
    ).toBeInTheDocument();
    const statusFilter = screen.getByLabelText("Filter sales status");
    expect(
      within(statusFilter).queryByRole("option", {
        name: /New|Preparing|Ready|Served/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Recent orders|order number/i),
    ).not.toBeInTheDocument();
  });
});

describe("daily report payment labels", () => {
  it("shows the customer payment methods without internal manual wording", async () => {
    const day = {
      id: "day-1",
      status: "OPEN",
      opened_at: "2026-09-28T08:00:00Z",
    } as Day;
    const report = {
      business_day_id: "day-1",
      order_count: 3,
      gross_sales_ngwee: 12600,
      refunds_ngwee: 0,
      net_sales_ngwee: 12600,
      average_order_ngwee: 4200,
      payment_totals: {
        CASH: 4200,
        MOBILE_MONEY_MANUAL: 4200,
        CARD_MANUAL: 4200,
      },
      opening_float_ngwee: 0,
      cash_movements_ngwee: 0,
      expected_cash_ngwee: 4200,
      actual_cash_ngwee: null,
      variance_ngwee: null,
      products: [],
    } as Summary;
    const client = {
      days: vi.fn().mockResolvedValue([day]),
      report: vi.fn().mockResolvedValue(report),
    } as unknown as POSClient;

    render(<Reports client={client} />);

    expect(await screen.findByText("Mobile money")).toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/manual/i);
  });
});
