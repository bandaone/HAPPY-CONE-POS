import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { defaultStandProfile } from "../App";
import type { POSClient, StandProfile, User } from "../lib/types";
import { StandSettingsCards } from "./StandSettings";

const manager: User = {
  id: "manager",
  username: "manager",
  name: "Mwamba Banda",
  role: "MANAGER",
  active: true,
};

it("lets a manager edit stand identity and saves the complete profile", async () => {
  const updateStandSettings = vi.fn(async (profile: StandProfile) => profile);
  const onSaved = vi.fn();
  render(
    <StandSettingsCards
      profile={defaultStandProfile}
      user={manager}
      client={{ updateStandSettings } as unknown as POSClient}
      onSaved={onSaved}
      onAudit={() => {}}
      onHelp={() => {}}
    />,
  );
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Edit details" }));
  const dialog = screen.getByRole("dialog", { name: "Edit stand details" });
  const standName = within(dialog).getByLabelText("Stand name");
  await user.clear(standName);
  await user.type(standName, "Arcades stand");
  await user.click(
    within(dialog).getByRole("button", { name: "Save changes" }),
  );

  expect(updateStandSettings).toHaveBeenCalledWith(
    expect.objectContaining({ stand_name: "Arcades stand" }),
  );
  expect(onSaved).toHaveBeenCalledWith(
    expect.objectContaining({ stand_name: "Arcades stand" }),
  );
});

it("lets a manager maintain the details printed on receipts", async () => {
  const updateStandSettings = vi.fn(async (profile: StandProfile) => profile);
  render(
    <StandSettingsCards
      profile={defaultStandProfile}
      user={manager}
      client={{ updateStandSettings } as unknown as POSClient}
      onSaved={() => {}}
      onAudit={() => {}}
      onHelp={() => {}}
    />,
  );
  const user = userEvent.setup();

  await user.click(
    screen.getByRole("button", { name: "Edit receipt details" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Edit receipt details" });
  await user.clear(within(dialog).getByLabelText("TPIN"));
  await user.type(within(dialog).getByLabelText("TPIN"), "1002003004");
  await user.clear(within(dialog).getByLabelText("Contact number"));
  await user.type(
    within(dialog).getByLabelText("Contact number"),
    "0977000111",
  );
  await user.clear(within(dialog).getByLabelText("Receipt footer"));
  await user.type(
    within(dialog).getByLabelText("Receipt footer"),
    "A little happiness in every cone.",
  );
  expect(
    within(dialog).queryByLabelText("Tax category"),
  ).not.toBeInTheDocument();
  expect(
    within(dialog).queryByLabelText("Tax rate (%)"),
  ).not.toBeInTheDocument();
  await user.click(
    within(dialog).getByRole("button", { name: "Save changes" }),
  );

  expect(updateStandSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      tax_id: "1002003004",
      contact_number: "0977000111",
      receipt_footer: "A little happiness in every cone.",
      tax_label: defaultStandProfile.tax_label,
      tax_rate_basis_points: defaultStandProfile.tax_rate_basis_points,
    }),
  );
});

it("does not present legacy tax treatment as editable receipt information", () => {
  render(
    <StandSettingsCards
      profile={defaultStandProfile}
      user={manager}
      client={{} as POSClient}
      onSaved={() => {}}
      onAudit={() => {}}
      onHelp={() => {}}
    />,
  );

  expect(screen.queryByText("Tax treatment")).not.toBeInTheDocument();
  expect(
    screen.queryByText(defaultStandProfile.tax_label),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Fiscal status")).not.toBeInTheDocument();
});

it("lets a manager choose the installed receipt paper width", async () => {
  const updateStandSettings = vi.fn(async (profile: StandProfile) => profile);
  render(
    <StandSettingsCards
      profile={defaultStandProfile}
      user={manager}
      client={{ updateStandSettings } as unknown as POSClient}
      onSaved={() => {}}
      onAudit={() => {}}
      onHelp={() => {}}
    />,
  );
  const user = userEvent.setup();

  await user.click(
    screen.getByRole("button", { name: "Edit receipt details" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Edit receipt details" });
  const paperWidth = within(dialog).getByRole("combobox", {
    name: "Receipt paper width",
  });
  await user.selectOptions(paperWidth, "58mm");
  await user.click(
    within(dialog).getByRole("button", { name: "Save changes" }),
  );

  expect(updateStandSettings).toHaveBeenCalledWith(
    expect.objectContaining({ receipt_paper_width: "58mm" }),
  );
});
