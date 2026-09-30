import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { POSAPIError } from "../lib/client";
import type { Catalog, CheckoutCommand, Day, POSClient } from "../lib/types";
import { Payment } from "./Pos";

const cart = [
  { variant_id: "simple-standard", quantity: 1, modifier_ids: [], notes: "" },
];
const catalog: Catalog = {
  categories: [{ id: "soft-serve", name: "Soft serve" }],
  products: [
    {
      id: "simple",
      category_id: "soft-serve",
      category: "Soft serve",
      name: "Classic cone",
      description: "",
      color: "#F6E4AB",
      active: true,
      choice_sets: [],
      variants: [
        {
          id: "simple-standard",
          product_id: "simple",
          name: "Standard",
          price_ngwee: 2500,
          active: true,
          recipe: [],
        },
      ],
    },
  ],
  modifier_groups: [],
  modifiers: [],
};
const day = { id: "day-one", status: "OPEN" } as Day;

function client() {
  return {
    quote: vi.fn(async () => ({
      lines: [
        {
          ...cart[0],
          name: "Classic cone",
          unit_price_ngwee: 2500,
          total_ngwee: 2500,
          modifier_names: [],
        },
      ],
      total_ngwee: 2500,
    })),
  } as unknown as POSClient;
}

describe("fast payment", () => {
  it("keeps cash amount and change visible until the cashier confirms", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async (_command: CheckoutCommand) => undefined);
    render(
      <Payment
        client={client()}
        cart={cart}
        catalog={catalog}
        day={day}
        attempt={null}
        offline={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Take payment" });

    await user.type(
      await within(dialog).findByLabelText("Cash received (K)"),
      "30.00",
    );
    expect(within(dialog).getByText("K5.00")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm cash payment" }),
    );

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        payment: { method: "CASH", tendered_ngwee: 3000 },
      }),
    );
  });

  it.each([
    ["Mobile money", "MOBILE_MONEY_MANUAL"],
    ["Card", "CARD_MANUAL"],
  ] as const)(
    "submits %s immediately with method only and blocks repeat taps",
    async (label, method) => {
      const user = userEvent.setup();
      let resolve!: () => void;
      const pending = new Promise<void>((done) => {
        resolve = done;
      });
      const onSubmit = vi.fn((_command: CheckoutCommand) => pending);
      render(
        <Payment
          client={client()}
          cart={cart}
          catalog={catalog}
          day={day}
          attempt={null}
          offline={false}
          onClose={vi.fn()}
          onSubmit={onSubmit}
        />,
      );
      const dialog = screen.getByRole("dialog", { name: "Take payment" });
      await within(dialog).findByText("K25.00");

      await user.click(within(dialog).getByRole("button", { name: label }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0].payment).toEqual({ method });
      for (const methodLabel of ["Cash", "Mobile money", "Card"]) {
        expect(
          within(dialog).getByRole("button", { name: methodLabel }),
        ).toBeDisabled();
      }
      resolve();
    },
  );

  it("retries a timed-out card sale with the same idempotency key and method", async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn(async (_command: CheckoutCommand) => undefined)
      .mockRejectedValueOnce(new POSAPIError("The request timed out.", 0))
      .mockResolvedValueOnce(undefined);
    render(
      <Payment
        client={client()}
        cart={cart}
        catalog={catalog}
        day={day}
        attempt={null}
        offline={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Take payment" });
    await within(dialog).findByText("K25.00");

    await user.click(within(dialog).getByRole("button", { name: "Card" }));
    expect(
      await within(dialog).findByText("The request timed out."),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "Retry Card payment" }),
    );

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0].idempotency_key).toBe(
      onSubmit.mock.calls[0][0].idempotency_key,
    );
    expect(onSubmit.mock.calls[1][0].payment).toEqual({
      method: "CARD_MANUAL",
    });
  });
});
