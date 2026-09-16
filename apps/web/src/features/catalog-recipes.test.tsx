import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "../lib/client";
import type {
  Catalog, CatalogItemCreate, CatalogItemUpdate, InventoryItem, ProductCreateInput,
} from "../lib/types";
import { CatalogRecipes } from "./CatalogRecipes";

const catalog: Catalog = {
  categories: [{ id: "ice-cream", name: "Ice cream" }],
  products: [{
    id: "vanilla", category_id: "ice-cream", name: "Vanilla",
    category: "Ice cream", description: "Classic, creamy and always a favourite.",
    color: "#F6E4AB", active: true,
    variants: [
      { id: "vanilla-single", product_id: "vanilla", name: "Single scoop", price_ngwee: 2200, active: true,
        recipe: [{ item_id: "vanilla-stock", quantity: "80.000" }] },
      { id: "vanilla-double", product_id: "vanilla", name: "Double scoop", price_ngwee: 3200, active: true,
        recipe: [{ item_id: "vanilla-stock", quantity: "160.000" }] },
    ],
  }],
  modifier_groups: [{ id: "serving", name: "Serving", minimum: 1, maximum: 1 }],
  modifiers: [{ id: "cone", group_id: "serving", group: "serving", name: "Waffle cone", price_ngwee: 500,
    active: true, recipe: [{ item_id: "cones", quantity: "1.000" }] }],
};

const inventory: InventoryItem[] = [
  { id: "vanilla-stock", name: "Vanilla ice cream", unit: "ml", on_hand: "20000.000", low_stock_threshold: "2000.000" },
  { id: "napkins", name: "Napkins", unit: "piece", on_hand: "500.000", low_stock_threshold: "50.000" },
  { id: "cones", name: "Waffle cones", unit: "piece", on_hand: "200.000", low_stock_threshold: "30.000" },
];

class CatalogClient extends ApiClient {
  updateCommands: Array<{ id: string; input: CatalogItemUpdate }> = [];
  createdProducts: ProductCreateInput[] = [];
  createdModifiers: Array<{ groupId: string; input: CatalogItemCreate }> = [];

  override catalog = vi.fn(async () => structuredClone(catalog));
  override inventory = vi.fn(async () => structuredClone(inventory));
  override updateVariant = vi.fn(async (id: string, input: CatalogItemUpdate) => {
    this.updateCommands.push({ id, input });
    return { id, product_id: "vanilla", ...input };
  });
  override createProduct = vi.fn(async (input: ProductCreateInput) => {
    this.createdProducts.push(input);
    return { ...input, category: "Ice cream", variants: [] };
  });
  override createModifier = vi.fn(async (groupId: string, input: CatalogItemCreate) => {
    this.createdModifiers.push({ groupId, input });
    return { ...input, group_id: groupId, group: groupId };
  });
}

describe("menu and stock recipe administration", () => {
  it("edits a variation price, availability and complete stock recipe", async () => {
    const user = userEvent.setup();
    const client = new CatalogClient();
    render(<CatalogRecipes client={client} onChanged={vi.fn()} onError={vi.fn()}/>);

    expect(await screen.findByText("Classic, creamy and always a favourite.")).toBeInTheDocument();
    const productToggle = screen.getByRole("button", { name: "Show Vanilla details" });
    expect(productToggle).toHaveAttribute("aria-expanded", "false");
    await user.click(productToggle);
    expect(productToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("K22.00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Single scoop" }));
    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText("Selling price (K)"));
    await user.type(within(dialog).getByLabelText("Selling price (K)"), "35.00");
    await user.clear(within(dialog).getByLabelText("Quantity 1"));
    await user.type(within(dialog).getByLabelText("Quantity 1"), "120");
    await user.click(within(dialog).getByRole("button", { name: "Add ingredient" }));
    await user.selectOptions(within(dialog).getByLabelText("Ingredient 2"), "napkins");
    await user.type(within(dialog).getByLabelText("Quantity 2"), "1");
    await user.click(within(dialog).getByRole("button", { name: "Save variation" }));

    expect(client.updateCommands).toEqual([{
      id: "vanilla-single",
      input: {
        name: "Single scoop", price_ngwee: 3500, active: true,
        recipe: [
          { item_id: "vanilla-stock", quantity: "120.000" },
          { item_id: "napkins", quantity: "1.000" },
        ],
      },
    }]);
  });

  it("creates a fully described product with a stable item code", async () => {
    const user = userEvent.setup();
    const client = new CatalogClient();
    render(<CatalogRecipes client={client} onChanged={vi.fn()} onError={vi.fn()}/>);
    await screen.findByText("Vanilla");

    await user.click(screen.getByRole("button", { name: "Add product" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Item code"), "mango");
    await user.type(within(dialog).getByLabelText("Product name"), "Mango sunshine");
    await user.type(within(dialog).getByLabelText("Customer description"), "Bright mango ice cream made for hot afternoons.");
    await user.click(within(dialog).getByRole("button", { name: "Create product" }));

    expect(client.createdProducts).toEqual([{
      id: "mango", category_id: "ice-cream", name: "Mango sunshine",
      description: "Bright mango ice cream made for hot afternoons.",
      color: "#F6E4AB", active: true,
    }]);
  });

  it("blocks duplicate recipe ingredients before calling the API", async () => {
    const user = userEvent.setup();
    const client = new CatalogClient();
    render(<CatalogRecipes client={client} onChanged={vi.fn()} onError={vi.fn()}/>);
    await screen.findByText("Vanilla");
    await user.click(screen.getByRole("button", { name: "Show Vanilla details" }));
    await user.click(screen.getByRole("button", { name: "Edit Single scoop" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Add ingredient" }));
    await user.selectOptions(within(dialog).getByLabelText("Ingredient 2"), "vanilla-stock");
    await user.type(within(dialog).getByLabelText("Quantity 2"), "1");
    await user.click(within(dialog).getByRole("button", { name: "Save variation" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent(/ingredient can only appear once/i);
    expect(client.updateCommands).toHaveLength(0);
  });
});
