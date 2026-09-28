import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Order, StandProfile } from "../lib/types";
import { PendingReceipt } from "./Pos";
import { Receipt, ReceiptModal } from "./Receipt";

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
});

afterAll(() => {
  if (originalShowModal) HTMLDialogElement.prototype.showModal = originalShowModal;
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  if (originalClose) HTMLDialogElement.prototype.close = originalClose;
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});

const profile = {
  business_name: "CREAMY HEAVEN LIMITED", stand_name: "Cairo shop", location: "Lusaka",
  tax_id: "1002681530", contact_number: "0771450074", tax_label: "TURNOVER TAX (TOT)",
  tax_rate_basis_points: 500, receipt_footer: "Thank you for choosing Happy Cone.",
} as StandProfile;

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "2f8c40ab-8822-4a1a-9f44-118e0ce2c845",
    number: "A001",
    business_day_id: "day-one",
    status: "SERVED",
    created_at: "2026-09-17T08:30:00Z",
    cashier_name: "Mwamba Manager",
    lines: [{
      variant_id: "vanilla-double", name: "Vanilla · Double scoop", quantity: 2,
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
  it("prints one receipt number with customer, tax, payment and cashier details", () => {
    render(<Receipt order={order()} profile={profile}/>);

    const receipt = screen.getByRole("article", { name: "Receipt A001" });
    expect(receipt).toHaveTextContent(/Receipt No\.\s*A001/);
    expect(screen.queryByRole("heading", { name: "Customer Receipt" })).not.toBeInTheDocument();
    expect(screen.getByText("CREAMY HEAVEN LIMITED")).toBeInTheDocument();
    expect(screen.getByText("Cairo shop")).toBeInTheDocument();
    expect(screen.getByText("Lusaka")).toBeInTheDocument();
    expect(screen.getByText("TPIN: 1002681530")).toBeInTheDocument();
    expect(screen.getByText("Tel: 0771450074")).toBeInTheDocument();
    expect(screen.queryByText("Order A001")).not.toBeInTheDocument();
    expect(screen.queryByText("Sale reference")).not.toBeInTheDocument();
    expect(screen.queryByText("2F8C40AB")).not.toBeInTheDocument();
    expect(screen.queryByText("VANILLA-DOUBLE")).not.toBeInTheDocument();
    expect(screen.getByText("2 × K35.00")).toBeInTheDocument();
    expect(screen.getAllByText("K70.00")).toHaveLength(2);
    expect(screen.getByText("K100.00")).toBeInTheDocument();
    expect(screen.getByText("K30.00")).toBeInTheDocument();
    expect(screen.getByText("Mwamba Manager")).toBeInTheDocument();
    expect(screen.getByText("2 units")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tax details" })).toBeInTheDocument();
    expect(screen.getByText("TURNOVER TAX (TOT)")).toBeInTheDocument();
    expect(screen.getByText("5% of gross sale")).toBeInTheDocument();
    expect(screen.getByText("K3.50")).toBeInTheDocument();
    expect(screen.queryByText("Taxable sales")).not.toBeInTheDocument();
    expect(screen.queryByText(/VAT/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Smart Invoice|SDC|MRC|QR/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fiscal identifiers/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Payment status")).not.toBeInTheDocument();
    expect(receipt).not.toHaveTextContent(/customer ticket|serving ticket/i);
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

  it("focuses the primary print action when a completed sale opens", () => {
    render(<ReceiptModal order={order()} profile={profile} onClose={vi.fn()} onPrint={vi.fn()}/>);

    const print = screen.getByRole("button", { name: "Print receipt" });
    expect(print).toHaveFocus();
    expect(print).toHaveClass("primary");
    expect(screen.getByRole("button", { name: "Done" })).not.toHaveClass("primary");
  });

  it("labels an offline cash copy as a provisional receipt pending sync", () => {
    render(<PendingReceipt
      command={{
        idempotency_key: "local-sale-12345678", business_day_id: "day-one", offline: true,
        lines: [{ variant_id: "vanilla-double", quantity: 1, modifier_ids: ["cup"], notes: "" }],
        payment: { method: "CASH", tendered_ngwee: 5000, provider: null, reference: null },
      }}
      createdAt="2026-09-17T08:30:00Z"
      catalog={{
        categories: [{ id: "scoops", name: "Scoops" }],
        products: [{
          id: "vanilla", category_id: "scoops", category: "Scoops", name: "Vanilla", description: "", color: "#fff", active: true,
          variants: [{ id: "vanilla-double", product_id: "vanilla", name: "Double scoop", price_ngwee: 3200, active: true, recipe: [] }],
        }],
        modifier_groups: [{ id: "serving", name: "Serving", minimum: 1, maximum: 1 }],
        modifiers: [{ id: "cup", group_id: "serving", group: "Serving", name: "Cup", price_ngwee: 0, active: true, recipe: [] }],
      }}
      profile={profile}
    />);

    expect(screen.getAllByText(/Provisional receipt/).length).toBeGreaterThan(0);
    expect(screen.getByText("Pending sync")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/server acceptance|customer ticket|final order number/i);
  });
});
