import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Catalog, Day, Product } from "../lib/types";
import { Pos } from "./Pos";
import { ProductCustomizer } from "./ProductCustomizer";

const doubleScoop: Product = {
  id: "double-scoop", category_id: "scoops", category: "Scooped ice cream",
  name: "Double scoop", description: "Choose two scoops.", color: "#F5C2D0", active: true,
  variants: [{ id: "double-scoop-standard", product_id: "double-scoop", name: "Standard", price_ngwee: 4000, active: true, recipe: [] }],
  choice_sets: [
    { group_id: "flavour", name: "Flavour", minimum: 2, maximum: 2, position: 0 },
    { group_id: "serving", name: "Serve in", minimum: 1, maximum: 1, position: 1 },
  ],
};

const catalog: Catalog = {
  categories: [{ id: "scoops", name: "Scooped ice cream" }],
  products: [doubleScoop, {
    id: "soft-serve-cup", category_id: "scoops", category: "Scooped ice cream",
    name: "Soft serve cup", description: "Ready as listed.", color: "#F6E4AB", active: true,
    variants: [{ id: "soft-serve-cup-standard", product_id: "soft-serve-cup", name: "Standard", price_ngwee: 2500, active: true, recipe: [] }],
    choice_sets: [],
  }],
  modifier_groups: [
    { id: "flavour", name: "Flavour", minimum: 0, maximum: 3 },
    { id: "serving", name: "Serve in", minimum: 0, maximum: 1 },
    { id: "unrelated", name: "Staff options", minimum: 0, maximum: 1 },
  ],
  modifiers: [
    { id: "vanilla", group_id: "flavour", group: "flavour", name: "Vanilla", price_ngwee: 0, active: true, recipe: [] },
    { id: "chocolate", group_id: "flavour", group: "flavour", name: "Chocolate", price_ngwee: 200, active: true, recipe: [] },
    { id: "cup", group_id: "serving", group: "serving", name: "Cup", price_ngwee: 0, active: true, recipe: [] },
    { id: "secret", group_id: "unrelated", group: "unrelated", name: "Staff only", price_ngwee: 0, active: true, recipe: [] },
  ],
};

describe("counter item choices", () => {
  it("adds a simple one-price item directly from its menu card", async () => {
    const user = userEvent.setup();
    const setCart = vi.fn();
    const day = { id: "day-one", status: "OPEN" } as Day;
    render(<Pos catalog={catalog} cart={[]} setCart={setCart} day={day} locked={false} onPay={vi.fn()} onOpenDay={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "Add Soft serve cup" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(setCart).toHaveBeenCalledWith([{
      variant_id: "soft-serve-cup-standard", quantity: 1, modifier_ids: [], notes: "",
    }]);
  });

  it("shows only attached sets, accepts repeated flavours and emits repeated IDs", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<ProductCustomizer product={doubleScoop} catalog={catalog} onAdd={onAdd} onClose={vi.fn()}/>);
    const dialog = screen.getByRole("dialog", { name: "Double scoop" });

    expect(within(dialog).getByRole("group", { name: "Flavour" })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "Serve in" })).toBeInTheDocument();
    expect(within(dialog).queryByText("Staff options")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add to sale" })).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: "Add Vanilla" }));
    await user.click(within(dialog).getByRole("button", { name: "Add Vanilla" }));
    expect(within(dialog).getByText("2 of 2 selected")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add Vanilla" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Add Cup" }));
    await user.click(within(dialog).getByRole("button", { name: "Add to sale" }));

    expect(onAdd).toHaveBeenCalledWith({
      variant_id: "double-scoop-standard", quantity: 1,
      modifier_ids: ["vanilla", "vanilla", "cup"], notes: "",
    });
  });
});
