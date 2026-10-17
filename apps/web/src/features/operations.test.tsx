import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Inventory, Reports, Sales } from "./Operations";
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
      modifier_ids: ["waffle-cone"],
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
  correctable: true,
  correction_status: null,
  corrected_by_order_id: null,
  corrects_order_id: null,
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
        onCorrect={vi.fn()}
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

  it("reopens the latest sale for correction after a required reason", async () => {
    const user = userEvent.setup();
    const corrected = { ...completedSale, refunded: true, correction_status: "PENDING" as const };
    const client = {
      orders: vi.fn().mockResolvedValue([completedSale]),
      correct: vi.fn().mockResolvedValue(corrected),
    } as unknown as POSClient;
    const onCorrect = vi.fn();

    render(
      <Sales client={client} canManage={false} onReceipt={vi.fn()}
        onCorrect={onCorrect} onChanged={vi.fn()} />,
    );

    await user.click(await screen.findByRole("button", { name: "Correct latest sale" }));
    await user.type(screen.getByLabelText("Required reason"), "Customer changed their choice");
    await user.click(screen.getByRole("button", { name: "Reverse and edit sale" }));

    expect(client.correct).toHaveBeenCalledWith(completedSale, "Customer changed their choice");
    expect(onCorrect).toHaveBeenCalledWith(corrected);
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
      products: [{ name: "Vanilla · Double", quantity: 3, total_ngwee: 12600 }],
      completed_sale_count: 3,
      units_sold: 3,
      corrections_ngwee: 0,
      opened_at: "2026-09-28T08:00:00Z",
      closed_at: null,
      opened_by_name: "Mwansa Banda",
      closed_by_name: null,
      sales: [{
        order_id: "sale-1", receipt_number: "A001", created_at: "2026-09-28T08:30:00Z",
        cashier_name: "Mwansa Banda", payment_method: "MOBILE_MONEY_MANUAL", gross_ngwee: 4200,
        reversal_ngwee: 0, net_ngwee: 4200, correction_status: null,
        corrects_receipt_number: null, reason: null,
      }],
      cash_activity: [{
        kind: "SALE", created_at: "2026-09-28T08:30:00Z", receipt_number: "A001",
        amount_ngwee: 4200, reason: "Cash sale", actor_name: "Mwansa Banda",
      }],
      cash_movements: [],
      hourly_sales: [{ hour: "08:00", order_count: 1, net_sales_ngwee: 4200 }],
      stock_usage: [{ item_id: "vanilla", name: "Vanilla mix", quantity: "160.000", unit: "ml" }],
      waste: [],
      cash_reconciliation: {
        opening_float_ngwee: 0, cash_sales_ngwee: 4200,
        cash_reversals_ngwee: 0, cash_movements_ngwee: 0, expected_cash_ngwee: 4200,
      },
    } as Summary;
    const client = {
      days: vi.fn().mockResolvedValue([day]),
      report: vi.fn().mockResolvedValue(report),
    } as unknown as POSClient;

    render(<Reports client={client} />);

    expect((await screen.findAllByText("Mobile money")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Card")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/manual/i);
    expect(screen.getByRole("heading", { name: "Sale details" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cash activity" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stock used" })).toBeInTheDocument();
    expect(screen.getByText("A001")).toBeInTheDocument();
    expect(screen.getByText("Vanilla mix")).toBeInTheDocument();
  });
});


describe("simple stock setup", () => {
  it("creates an ingredient with an optional pack conversion", async () => {
    const user = userEvent.setup();
    const client = {
      inventory: vi.fn().mockResolvedValue([]),
      movements: vi.fn().mockResolvedValue([]),
      counts: vi.fn().mockResolvedValue([]),
      catalog: vi.fn().mockResolvedValue({ categories: [], products: [], modifier_groups: [], modifiers: [] }),
      createInventoryItem: vi.fn().mockResolvedValue({}),
    } as unknown as POSClient;
    render(<Inventory client={client} onError={vi.fn()} onChanged={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Add ingredient" }));
    await user.type(screen.getByLabelText("Ingredient name"), "Vanilla mix");
    await user.type(screen.getByLabelText("Item code"), "vanilla-mix");
    await user.type(screen.getByLabelText("Counting unit"), "ml");
    await user.type(screen.getByLabelText("Pack name (optional)"), "tub");
    await user.clear(screen.getByLabelText("Units in one pack"));
    await user.type(screen.getByLabelText("Units in one pack"), "5000");
    await user.click(screen.getByRole("button", { name: "Save ingredient" }));

    expect(client.createInventoryItem).toHaveBeenCalledWith(expect.objectContaining({
      id: "vanilla-mix", name: "Vanilla mix", base_unit: "ml",
      pack_name: "tub", units_per_pack: "5000",
    }));
  });

  it("starts tracking from explicit opening quantities", async () => {
    const user = userEvent.setup();
    const item = { id: "vanilla", name: "Vanilla mix", unit: "ml", base_unit: "ml",
      pack_name: null, units_per_pack: "1.000", active: true, on_hand: "0.000",
      low_stock_threshold: "500.000" };
    const client = {
      inventory: vi.fn().mockResolvedValue([item]), movements: vi.fn().mockResolvedValue([]),
      counts: vi.fn().mockResolvedValue([]), activateInventory: vi.fn().mockResolvedValue({
        inventory_tracking_enabled: true, started_at: "2026-10-17T10:00:00Z",
      }),
      catalog: vi.fn().mockResolvedValue({ categories: [], products: [], modifier_groups: [], modifiers: [] }),
    } as unknown as POSClient;
    render(<Inventory client={client} onError={vi.fn()} onChanged={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Start stock tracking" }));
    await user.type(screen.getByLabelText("Opening quantity for Vanilla mix"), "20000");
    await user.click(screen.getByRole("button", { name: "Start tracking" }));
    expect(client.activateInventory).toHaveBeenCalledWith([{ item_id: "vanilla", quantity: "20000" }]);
  });

  it("records ingredient waste with a required reason and selling-value source", async () => {
    const user = userEvent.setup();
    const item = { id: "vanilla", name: "Vanilla mix", unit: "ml", base_unit: "ml",
      pack_name: null, units_per_pack: "1.000", active: true, on_hand: "20000.000",
      low_stock_threshold: "500.000" };
    const client = {
      inventory: vi.fn().mockResolvedValue([item]), movements: vi.fn().mockResolvedValue([]),
      counts: vi.fn().mockResolvedValue([]),
      catalog: vi.fn().mockResolvedValue({
        categories: [], modifier_groups: [], modifiers: [],
        products: [{ id: "vanilla-product", category_id: "ice-cream", category: "Ice cream",
          name: "Vanilla", description: "", color: "#fff", active: true, choice_sets: [],
          variants: [{ id: "vanilla-double", product_id: "vanilla-product", name: "Double",
            price_ngwee: 3200, active: true, recipe: [{ item_id: "vanilla", quantity: "160.000" }] }],
        }],
      }),
      ingredientWaste: vi.fn().mockResolvedValue({}),
    } as unknown as POSClient;
    render(<Inventory client={client} onError={vi.fn()} onChanged={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Record waste" }));
    await user.click(screen.getByRole("button", { name: "Ingredient" }));
    await user.type(screen.getByLabelText("Wasted quantity"), "160");
    await user.selectOptions(screen.getByLabelText("Reason"), "MELTED_OR_SPOILED");
    await user.selectOptions(screen.getByLabelText("Related menu price"), "vanilla-double");
    await user.click(screen.getByRole("button", { name: "Record ingredient waste" }));

    expect(client.ingredientWaste).toHaveBeenCalledWith(expect.objectContaining({
      item_id: "vanilla", quantity: "160", reason: "MELTED_OR_SPOILED",
      related_variant_id: "vanilla-double",
    }));
  });

});
