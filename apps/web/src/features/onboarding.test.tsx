import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import type { Catalog, User } from "../lib/types";

const catalog: Catalog = { categories: [], products: [], modifier_groups: [], modifiers: [] };
const cashier: User = {
  id: "cashier-first-day",
  username: "cashier",
  name: "Chanda Cashier",
  role: "CASHIER",
  active: true,
};

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/api/auth/login")) return json({ token: "cashier-token", user: cashier });
    if (url.endsWith("/api/session")) return json(cashier);
    if (url.includes("/api/catalog")) return json(catalog);
    if (url.endsWith("/api/business-day/current")) return json(null);
    if (url.endsWith("/api/auth/logout")) return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${url}`);
  }));
});

describe("first-time guidance", () => {
  it("returns an expired saved session to staff sign-in", async () => {
    sessionStorage.setItem("happy-cone:session-token", JSON.stringify("expired-token"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Session expired" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Staff sign-in" })).toBeInTheDocument();
    expect(screen.queryByText("Connection unavailable")).not.toBeInTheDocument();
  });

  it("starts on a dedicated login screen and introduces the real workspace after sign-in", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Staff sign-in" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
    expect(screen.queryByText(/practice mode/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Username"), "cashier");
    await user.type(screen.getByLabelText("Password"), "first-day-password");
    await user.click(screen.getByRole("button", { name: "Open counter" }));

    const tour = await screen.findByRole("dialog", { name: "Welcome to your counter" });
    expect(within(tour).getByText("1 of 4")).toBeInTheDocument();
    expect(within(tour).getByText(/guided look at the tools you will use/i)).toBeInTheDocument();
    await user.click(within(tour).getByRole("button", { name: "Next" }));
    expect(within(tour).getByRole("heading", { name: "Find your way around" })).toBeInTheDocument();
    await user.click(within(tour).getByRole("button", { name: "Skip tour" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Find your way around" })).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Help" }));
    const guide = screen.getByRole("dialog", { name: "Counter guide" });
    await user.click(within(guide).getByRole("button", { name: "Take product tour" }));
    expect(await screen.findByRole("dialog", { name: "Welcome to your counter" })).toBeInTheDocument();
  });

  it("lets staff reveal and hide the password before sign-in", async () => {
    const user = userEvent.setup();
    render(<App />);

    const password = await screen.findByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    await user.type(password, "first-day-password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("first-day-password");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("keeps an incomplete product off the cashier counter", async () => {
    const incompleteCatalog: Catalog = {
      categories: [{ id: "ice-cream", name: "Ice cream" }],
      products: [{
        id: "unfinished", category_id: "ice-cream", name: "Unfinished item",
        category: "Ice cream", description: "Still being configured", color: "#F4B942",
        active: true, variants: [],
      }],
      modifier_groups: [], modifiers: [],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith("/api/session")) return json(cashier);
      if (url.includes("/api/catalog")) return json(incompleteCatalog);
      if (url.endsWith("/api/business-day/current")) return json(null);
      throw new Error(`Unexpected request: ${url}`);
    }));
    sessionStorage.setItem("happy-cone:session-token", JSON.stringify("cashier-token"));
    localStorage.setItem(`happy-cone:tour:v1:${cashier.id}`, "complete");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "A little scoop of happy." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Customize Unfinished item" })).not.toBeInTheDocument();
    expect(screen.getByText("No treats found")).toBeInTheDocument();
  });
});
