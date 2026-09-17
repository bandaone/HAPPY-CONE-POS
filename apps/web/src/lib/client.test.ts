import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, money, parseMoney } from "./client";

describe("money", () => {
  it("formats integer ngwee as kwacha", () => {
    expect(money(4200)).toBe("K42.00");
    expect(money(5)).toBe("K0.05");
    expect(money(-805)).toBe("-K8.05");
  });

  it("parses currency text without floating point conversion", () => {
    expect(parseMoney("K42.00")).toBe(4200);
    expect(parseMoney("1,234.5")).toBe(123450);
    expect(parseMoney("0.09")).toBe(9);
  });

  it("rejects malformed and negative values unless explicitly allowed", () => {
    expect(() => parseMoney("1.234")).toThrow(/valid amount/i);
    expect(() => parseMoney("-2.00")).toThrow(/negative/i);
    expect(parseMoney("-2.00", { allowNegative: true })).toBe(-200);
  });
});

describe("catalog administration client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates a fully described product at the catalog boundary", async () => {
    const response = {
      id: "mango", category_id: "ice-cream", name: "Mango sunshine",
      category: "Ice cream", description: "Bright mango ice cream.",
      color: "#F4B942", active: true, variants: [],
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 201, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetch);
    const client = new ApiClient("owner-token", { baseUrl: "/api" });
    const input = {
      id: "mango", category_id: "ice-cream", name: "Mango sunshine",
      description: "Bright mango ice cream.", color: "#F4B942", active: true,
    };

    await expect(client.createProduct(input)).resolves.toEqual(response);
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe("/api/catalog/products");
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body)).toEqual(input);
  });

  it("creates and updates variations with complete stock recipes", async () => {
    const variation = {
      id: "mango-single", product_id: "mango", name: "Single scoop",
      price_ngwee: 2800, active: true,
      recipe: [{ item_id: "mango-stock", quantity: "90.000" }],
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(variation), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetch);
    const client = new ApiClient("manager-token", { baseUrl: "/api" });

    await client.createVariant("mango", {
      id: variation.id, name: variation.name, price_ngwee: variation.price_ngwee,
      active: true, recipe: variation.recipe,
    });
    await client.updateVariant("mango-single", {
      name: "Single scoop", price_ngwee: 3000, active: false, recipe: [],
    });

    expect(fetch.mock.calls[0][0]).toBe("/api/catalog/products/mango/variants");
    expect(fetch.mock.calls[0][1].method).toBe("POST");
    expect(fetch.mock.calls[1][0]).toBe("/api/catalog/variants/mango-single");
    expect(fetch.mock.calls[1][1].method).toBe("PUT");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      name: "Single scoop", price_ngwee: 3000, active: false, recipe: [],
    });
  });

  it("uses the category, modifier-group and modifier endpoints", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "ok" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetch);
    const client = new ApiClient("manager-token", { baseUrl: "/api" });

    await client.createCategory({ id: "desserts", name: "Desserts" });
    await client.updateCategory("desserts", { name: "Frozen desserts" });
    await client.createModifierGroup({ id: "extras", name: "Extras", minimum: 0, maximum: 3 });
    await client.updateModifierGroup("extras", { name: "Finishing touches", minimum: 0, maximum: 2 });
    await client.createModifier("extras", {
      id: "cherry", name: "Cherry", price_ngwee: 200, active: true,
      recipe: [{ item_id: "cherries", quantity: "1.000" }],
    });
    await client.updateModifier("cherry", {
      name: "Cherry", price_ngwee: 250, active: true,
      recipe: [{ item_id: "cherries", quantity: "1.000" }],
    });

    expect(fetch.mock.calls.map(([url, request]) => [url, request.method])).toEqual([
      ["/api/catalog/categories", "POST"],
      ["/api/catalog/categories/desserts", "PUT"],
      ["/api/catalog/modifier-groups", "POST"],
      ["/api/catalog/modifier-groups/extras", "PUT"],
      ["/api/catalog/modifier-groups/extras/modifiers", "POST"],
      ["/api/catalog/modifiers/cherry", "PUT"],
    ]);
  });
});
