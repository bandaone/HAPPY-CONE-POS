import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  Catalog,
  MenuItemCreateInput,
  MenuItemUpdateInput,
  POSClient,
} from "../lib/types";
import { MenuAdmin } from "./MenuAdmin";

const catalog: Catalog = {
  categories: [{ id: "ice-cream", name: "Ice cream" }],
  products: [
    {
      id: "single-scoop",
      category_id: "ice-cream",
      category: "Ice cream",
      name: "Single scoop",
      description: "Choose one flavour.",
      color: "#F5C2D0",
      active: true,
      variants: [
        {
          id: "single-scoop-standard",
          product_id: "single-scoop",
          name: "Standard",
          price_ngwee: 3000,
          active: true,
          recipe: [],
        },
      ],
      choice_sets: [
        {
          group_id: "flavour",
          name: "Flavour",
          minimum: 1,
          maximum: 1,
          position: 0,
        },
      ],
    },
    {
      id: "sample-cup",
      category_id: "ice-cream",
      category: "Ice cream",
      name: "Sample cup",
      description: "",
      color: "#F6E4AB",
      active: false,
      variants: [
        {
          id: "sample-cup-standard",
          product_id: "sample-cup",
          name: "Standard",
          price_ngwee: 1000,
          active: false,
          recipe: [],
        },
      ],
      choice_sets: [],
    },
  ],
  modifier_groups: [
    { id: "flavour", name: "Flavour", minimum: 0, maximum: 3 },
    { id: "serving", name: "Serve in", minimum: 0, maximum: 1 },
  ],
  modifiers: [
    {
      id: "vanilla",
      group_id: "flavour",
      group: "flavour",
      name: "Vanilla",
      price_ngwee: 0,
      active: true,
      recipe: [],
    },
  ],
};

function menuClient() {
  return {
    catalog: vi.fn(async () => structuredClone(catalog)),
    inventory: vi.fn(async () => []),
    createMenuItem: vi.fn(async (input: MenuItemCreateInput) => ({
      ...catalog.products[0],
      ...input,
      category: "Ice cream",
    })),
    updateMenuItem: vi.fn(async (_id: string, input: MenuItemUpdateInput) => ({
      ...catalog.products[0],
      ...input,
      category: "Ice cream",
    })),
    createCategory: vi.fn(async (input: { id: string; name: string }) => input),
    updateCategory: vi.fn(),
    createModifierGroup: vi.fn(
      async (input: {
        id: string;
        name: string;
        minimum: number;
        maximum: number;
      }) => input,
    ),
    updateModifierGroup: vi.fn(),
    createModifier: vi.fn(async (groupId: string, input: object) => ({
      ...input,
      group_id: groupId,
      group: groupId,
    })),
    updateModifier: vi.fn(),
  } as unknown as POSClient;
}

describe("Menu workspace", () => {
  it("loads the complete menu without requesting inventory or showing stock language", async () => {
    const client = menuClient();
    render(<MenuAdmin client={client} onChanged={vi.fn()} onError={vi.fn()} />);

    expect(
      await screen.findByRole("heading", { name: "Menu" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Single scoop")).toBeInTheDocument();
    expect(client.catalog).toHaveBeenCalledWith(true);
    expect(client.inventory).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent(
      /stock|recipe|ingredient|quantity used|low threshold|variation/i,
    );
  });

  it("creates a complete menu item from the short form", async () => {
    const user = userEvent.setup();
    const client = menuClient();
    render(<MenuAdmin client={client} onChanged={vi.fn()} onError={vi.fn()} />);
    await screen.findByText("Single scoop");

    await user.click(screen.getByRole("button", { name: "Add menu item" }));
    const dialog = screen.getByRole("dialog", { name: "Add menu item" });
    await user.type(
      within(dialog).getByLabelText("Menu item name"),
      "Classic soft serve cone",
    );
    await user.clear(within(dialog).getByLabelText("Selling price (K)"));
    await user.type(
      within(dialog).getByLabelText("Selling price (K)"),
      "25.00",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create menu item" }),
    );

    expect(client.createMenuItem).toHaveBeenCalledWith({
      id: "classic-soft-serve-cone",
      category_id: "ice-cream",
      name: "Classic soft serve cone",
      description: "",
      color: "#F6E4AB",
      active: true,
      prices: [
        {
          id: "classic-soft-serve-cone-standard",
          name: "Standard",
          price_ngwee: 2500,
          active: true,
          recipe: [],
        },
      ],
      choice_sets: [],
    });
  });

  it("edits description, price and product-specific choice limits, then archives and restores", async () => {
    const user = userEvent.setup();
    const client = menuClient();
    render(<MenuAdmin client={client} onChanged={vi.fn()} onError={vi.fn()} />);
    await screen.findByText("Single scoop");

    await user.click(screen.getByRole("button", { name: "Edit Single scoop" }));
    const dialog = screen.getByRole("dialog", { name: "Edit menu item" });
    await user.click(within(dialog).getByText("More menu details"));
    await user.clear(within(dialog).getByLabelText("Description"));
    await user.type(
      within(dialog).getByLabelText("Description"),
      "One scoop served your way.",
    );
    await user.clear(within(dialog).getByLabelText("Selling price (K)"));
    await user.type(
      within(dialog).getByLabelText("Selling price (K)"),
      "32.00",
    );
    await user.click(within(dialog).getByLabelText("Use Serve in"));
    await user.clear(within(dialog).getByLabelText("Serve in minimum"));
    await user.type(within(dialog).getByLabelText("Serve in minimum"), "1");
    await user.clear(within(dialog).getByLabelText("Serve in maximum"));
    await user.type(within(dialog).getByLabelText("Serve in maximum"), "1");
    await user.click(
      within(dialog).getByRole("button", { name: "Save menu item" }),
    );

    expect(client.updateMenuItem).toHaveBeenLastCalledWith(
      "single-scoop",
      expect.objectContaining({
        description: "One scoop served your way.",
        prices: [expect.objectContaining({ price_ngwee: 3200 })],
        choice_sets: [
          { group_id: "flavour", minimum: 1, maximum: 1, position: 0 },
          { group_id: "serving", minimum: 1, maximum: 1, position: 1 },
        ],
      }),
    );

    await user.click(
      screen.getByRole("button", { name: "Archive Single scoop" }),
    );
    expect(client.updateMenuItem).toHaveBeenLastCalledWith(
      "single-scoop",
      expect.objectContaining({ active: false }),
    );
    await user.click(
      screen.getByRole("button", { name: "Restore Sample cup" }),
    );
    expect(client.updateMenuItem).toHaveBeenLastCalledWith(
      "sample-cup",
      expect.objectContaining({ active: true }),
    );
  });

  it("creates categories, choice sets and choices with plain business labels", async () => {
    const user = userEvent.setup();
    const client = menuClient();
    render(<MenuAdmin client={client} onChanged={vi.fn()} onError={vi.fn()} />);
    await screen.findByText("Single scoop");

    await user.click(screen.getByRole("button", { name: "Add category" }));
    await user.type(screen.getByLabelText("Category name"), "Specials");
    await user.click(screen.getByRole("button", { name: "Create category" }));
    expect(client.createCategory).toHaveBeenCalledWith({
      id: "specials",
      name: "Specials",
    });

    await user.click(screen.getByRole("button", { name: "Add choice set" }));
    await user.type(screen.getByLabelText("Choice set name"), "Toppings");
    await user.click(screen.getByRole("button", { name: "Create choice set" }));
    expect(client.createModifierGroup).toHaveBeenCalledWith({
      id: "toppings",
      name: "Toppings",
      minimum: 0,
      maximum: 3,
    });

    await user.click(
      screen.getByRole("button", { name: "Add choice to Flavour" }),
    );
    const choiceDialog = screen.getByRole("dialog", { name: "Add choice" });
    await user.type(
      within(choiceDialog).getByLabelText("Choice name"),
      "Chocolate",
    );
    await user.clear(within(choiceDialog).getByLabelText("Extra price (K)"));
    await user.type(
      within(choiceDialog).getByLabelText("Extra price (K)"),
      "2.00",
    );
    await user.click(
      within(choiceDialog).getByRole("button", { name: "Create choice" }),
    );
    expect(client.createModifier).toHaveBeenCalledWith("flavour", {
      id: "flavour-chocolate",
      name: "Chocolate",
      price_ngwee: 200,
      active: true,
      recipe: [],
    });
    await waitFor(() => expect(client.catalog).toHaveBeenCalled());
  });
});
