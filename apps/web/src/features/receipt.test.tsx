import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Order } from "../lib/types";
import { Receipt } from "./Receipt";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "2f8c40ab-8822-4a1a-9f44-118e0ce2c845",
    number: "A001",
    business_day_id: "day-one",
    status: "NEW",
    created_at: "2026-09-17T08:30:00Z",
    cashier_name: "Mwamba Manager",
    lines: [{
      variant_id: "vanilla-single", name: "Vanilla · Single scoop", quantity: 2,
      unit_price_ngwee: 3500, total_ngwee: 7000,
      modifier_names: [], notes: "",
    }],
    total_ngwee: 7000,
    payment: {
      method: "CASH", status: "CONFIRMED", amount_ngwee: 7000,
      tendered_ngwee: 10000, change_ngwee: 3000, provider: null, reference: null,
    },
    refunded: false,
    refund_reason: null,
    offline: false,
    ...overrides,
  };
}

describe("operational customer receipt", () => {
  it("prints item codes, quantities, prices, payment and cashier details", () => {
    render(<Receipt order={order()}/>);

    expect(screen.getByRole("heading", { name: "Customer Receipt" })).toBeInTheDocument();
    expect(screen.getByText("Order A001")).toBeInTheDocument();
    expect(screen.getByText("2F8C40AB")).toBeInTheDocument();
    expect(screen.getByText("VANILLA-SINGLE")).toBeInTheDocument();
    expect(screen.getByText("2 × K35.00")).toBeInTheDocument();
    expect(screen.getAllByText("K70.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("K100.00")).toBeInTheDocument();
    expect(screen.getByText("K30.00")).toBeInTheDocument();
    expect(screen.getByText("Mwamba Manager")).toBeInTheDocument();
    expect(screen.getByText("2 units")).toBeInTheDocument();
    expect(screen.getByText("Operational customer receipt — fiscal integration not configured")).toBeInTheDocument();
    expect(screen.queryByText(/Tax Invoice|TPIN|Smart Invoice|SDC|MRC|QR/i)).not.toBeInTheDocument();
  });

  it("shows confirmed external payment details without cash fields", () => {
    render(<Receipt order={order({
      payment: {
        method: "MOBILE_MONEY_MANUAL", status: "CONFIRMED", amount_ngwee: 7000,
        tendered_ngwee: null, change_ngwee: null, provider: "MTN MoMo", reference: "MM-20458",
      },
    })}/>);

    expect(screen.getByText("Mobile money")).toBeInTheDocument();
    expect(screen.getByText("MTN MoMo")).toBeInTheDocument();
    expect(screen.getByText("MM-20458")).toBeInTheDocument();
    expect(screen.queryByText("Cash received")).not.toBeInTheDocument();
    expect(screen.queryByText("Change")).not.toBeInTheDocument();
  });

  it("marks refunded sales and gives the recorded reason", () => {
    render(<Receipt order={order({ refunded: true, refund_reason: "Customer changed their order" })}/>);
    expect(screen.getByText("Refunded")).toBeInTheDocument();
    expect(screen.getByText("Customer changed their order")).toBeInTheDocument();
  });
});
