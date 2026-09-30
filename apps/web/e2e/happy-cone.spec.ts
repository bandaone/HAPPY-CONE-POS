import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const axeTags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

async function signIn(page: Page, username = "manager") {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Staff sign-in" }),
  ).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password");
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/auth/login") &&
      candidate.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Open counter" }).click();
  const token = (await (await response).json()).token as string;
  await expect(
    page.getByRole("button", { name: "Account and stand" }),
  ).toBeVisible();
  const tour = page.getByRole("dialog", { name: "Welcome to your counter" });
  await expect(tour).toBeVisible();
  await tour.getByRole("button", { name: "Skip tour" }).click();
  return token;
}

async function openBusinessDay(page: Page) {
  await page.getByRole("button", { name: "Counter", exact: true }).click();
  await page
    .getByRole("button", { name: "Open business day", exact: true })
    .click();
  await page.getByLabel("Opening cash float (K)").fill("500");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Open business day", exact: true })
    .click();
  await expect(
    page.getByText("Business day open", { exact: true }),
  ).toBeVisible();
}

async function createChoiceSet(
  page: Page,
  name: string,
  minimum: string,
  maximum: string,
  choices: string[],
) {
  await page.getByRole("button", { name: "Add choice set" }).click();
  let dialog = page.getByRole("dialog", { name: "Add choice set" });
  await dialog.getByLabel("Choice set name").fill(name);
  await dialog.getByLabel("Default minimum").fill(minimum);
  await dialog.getByLabel("Default maximum").fill(maximum);
  await dialog.getByRole("button", { name: "Create choice set" }).click();
  const card = page.locator(".menu-choice-card").filter({ hasText: name });
  await expect(card).toBeVisible();

  for (const choice of choices) {
    await card.getByRole("button", { name: `Add choice to ${name}` }).click();
    dialog = page.getByRole("dialog", { name: "Add choice" });
    await dialog.getByLabel("Choice name").fill(choice);
    await dialog.getByLabel("Extra price (K)").fill("0.00");
    await dialog.getByRole("button", { name: "Create choice" }).click();
    await expect(
      card.getByRole("button", { name: `Edit ${choice}` }),
    ).toBeVisible();
  }
}

async function createMenuItem(
  page: Page,
  values: {
    name: string;
    price: string;
    description: string;
    choices?: Array<{ name: string; minimum: string; maximum: string }>;
  },
) {
  await page.getByRole("button", { name: "Add menu item" }).click();
  const dialog = page.getByRole("dialog", { name: "Add menu item" });
  await dialog.getByLabel("Menu item name").fill(values.name);
  await dialog.getByLabel("Selling price (K)").fill(values.price);
  for (const choice of values.choices ?? []) {
    await dialog.getByLabel(`Use ${choice.name}`).check();
    await dialog.getByLabel(`${choice.name} minimum`).fill(choice.minimum);
    await dialog.getByLabel(`${choice.name} maximum`).fill(choice.maximum);
  }
  await dialog.getByText("More menu details", { exact: true }).click();
  await dialog.getByLabel("Description").fill(values.description);
  await dialog.getByRole("button", { name: "Create menu item" }).click();
  await expect(
    page.getByText(values.description, { exact: true }),
  ).toBeVisible();
}

async function addSeededVanilla(page: Page) {
  await page
    .getByRole("button", { name: "Customize Vanilla", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Vanilla" });
  await dialog.getByRole("button", { name: /^Double/ }).click();
  await dialog.getByRole("button", { name: "Add Waffle cone" }).click();
  await dialog.getByRole("button", { name: "Add Oreo crumble" }).click();
  await dialog.getByRole("button", { name: "Add to sale" }).click();
}

async function setReceiptWidth(page: Page, width: "58mm" | "80mm") {
  await page.getByRole("button", { name: "Settings and information" }).click();
  await page.getByRole("button", { name: "Edit receipt details" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit receipt details" });
  await dialog.getByLabel("Receipt paper width").selectOption(width);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Counter", exact: true }).click();
}

async function assertReceiptFits(
  page: Page,
  width: number,
  paperClass: string,
) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ media: "print" });
  const receipt = page.locator(".receipt-print .receipt");
  await expect(receipt).toBeVisible();
  await expect(receipt).toHaveClass(new RegExp(paperClass));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await receipt.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      return [
        ...node.querySelectorAll(
          ".receipt-item-price span:last-child,.receipt-value-row dd",
        ),
      ].every((cell) => cell.getBoundingClientRect().right <= bounds.right + 1);
    }),
  ).toBe(true);
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 1280, height: 720 });
}

test.beforeEach(async ({ request }) => {
  const response = await request.post("http://127.0.0.1:8001/__test/reset");
  expect(response.ok()).toBe(true);
});

test("login is accessible and reflows on phone and desktop", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Staff sign-in" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("visible-password-check");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
  expect(
    (await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Open counter", exact: true }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations,
  ).toEqual([]);
});

test("manager builds the menu and completes cash, mobile money and card sales", async ({
  page,
}) => {
  const token = await signIn(page);
  const headers = { Authorization: `Bearer ${token}` };

  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Menu", exact: true }),
  ).toBeVisible();
  await createChoiceSet(page, "Flavour", "0", "3", ["Vanilla", "Chocolate"]);
  await createMenuItem(page, {
    name: "Soft serve cup",
    price: "25.00",
    description: "A quick classic cup.",
  });
  await createMenuItem(page, {
    name: "Double Scoop",
    price: "40.00",
    description: "Choose any two scoops.",
    choices: [
      { name: "Serving", minimum: "1", maximum: "1" },
      { name: "Flavour", minimum: "2", maximum: "2" },
    ],
  });
  await page.getByRole("button", { name: "Show Double Scoop details" }).click();
  const doubleCard = page
    .locator(".menu-item-card")
    .filter({ hasText: "Double Scoop" });
  await expect(doubleCard.getByText("2 required")).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations,
  ).toEqual([]);

  const movementsBefore = await (
    await page.request.get("/api/inventory/movements", { headers })
  ).json();
  await openBusinessDay(page);

  await page.getByRole("button", { name: "Add Soft serve cup" }).click();
  await page.getByRole("button", { name: "Take payment", exact: true }).click();
  await page.getByLabel("Cash received (K)").fill("30.00");
  await expect(
    page.getByRole("dialog").getByText("K5.00", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm cash payment" }).click();

  let receipt = page.getByRole("dialog", { name: "Receipt A001" });
  await expect(
    receipt.getByText("CREAMY HEAVEN LIMITED", { exact: true }),
  ).toBeVisible();
  await expect(
    receipt.getByText("TPIN: 1002681530", { exact: true }),
  ).toBeVisible();
  await expect(receipt.getByText("Receipt No.", { exact: true })).toBeVisible();
  await expect(
    receipt.getByText("Mwansa Banda", { exact: true }),
  ).toBeVisible();
  await expect(receipt.getByText("Cash", { exact: true })).toBeVisible();
  await expect(receipt.getByText("K30.00", { exact: true })).toBeVisible();
  await expect(receipt.getByText("K5.00", { exact: true })).toBeVisible();
  await expect(
    receipt.getByText(
      /Tax details|TURNOVER TAX|gross sale|Provider|Payment reference|Customer receipt|serving ticket|Order A001/i,
    ),
  ).toHaveCount(0);
  await page.evaluate(() => {
    window.print = () => undefined;
  });
  await receipt.getByRole("button", { name: "Print receipt" }).click();
  await assertReceiptFits(page, 302, "receipt-paper-80");
  await receipt.getByRole("button", { name: "Done" }).click();

  await setReceiptWidth(page, "58mm");
  await page.getByRole("button", { name: "Customize Double Scoop" }).click();
  let customizer = page.getByRole("dialog", { name: "Double Scoop" });
  await customizer.getByRole("button", { name: "Add Vanilla" }).click();
  await customizer.getByRole("button", { name: "Add Vanilla" }).click();
  await customizer.getByRole("button", { name: "Add Paper cup" }).click();
  await expect(customizer.getByText("2 of 2 selected")).toBeVisible();
  await customizer.getByRole("button", { name: "Add to sale" }).click();
  await page.getByRole("button", { name: "Take payment", exact: true }).click();
  await page.getByRole("button", { name: "Mobile money", exact: true }).click();

  receipt = page.getByRole("dialog", { name: "Receipt A002" });
  await expect(
    receipt.getByText("Vanilla ×2 · Paper cup", { exact: true }),
  ).toBeVisible();
  await expect(
    receipt.getByText("Mobile money", { exact: true }),
  ).toBeVisible();
  await expect(
    receipt.getByText(/Provider|Payment reference|Cash received|Change/i),
  ).toHaveCount(0);
  await receipt.getByRole("button", { name: "Print receipt" }).click();
  await assertReceiptFits(page, 219, "receipt-paper-58");
  await receipt.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Customize Double Scoop" }).click();
  customizer = page.getByRole("dialog", { name: "Double Scoop" });
  await customizer.getByRole("button", { name: "Add Vanilla" }).click();
  await customizer.getByRole("button", { name: "Add Chocolate" }).click();
  await customizer.getByRole("button", { name: "Add Waffle cone" }).click();
  await customizer.getByRole("button", { name: "Add to sale" }).click();
  await page.getByRole("button", { name: "Take payment", exact: true }).click();
  await page.getByRole("button", { name: "Card", exact: true }).click();
  receipt = page.getByRole("dialog", { name: "Receipt A003" });
  await expect(
    receipt.getByText("Chocolate · Vanilla · Waffle cone", { exact: true }),
  ).toBeVisible();
  await expect(receipt.getByText("Card", { exact: true })).toBeVisible();
  await receipt.getByRole("button", { name: "Done" }).click();

  const orders = await (
    await page.request.get("/api/orders", { headers })
  ).json();
  expect(orders).toHaveLength(3);
  expect(
    orders.map(
      (order: { payment: { method: string } }) => order.payment.method,
    ),
  ).toEqual(["CARD_MANUAL", "MOBILE_MONEY_MANUAL", "CASH"]);
  const movementsAfter = await (
    await page.request.get("/api/inventory/movements", { headers })
  ).json();
  expect(movementsAfter).toHaveLength(movementsBefore.length);
  expect(
    movementsAfter.filter(
      (movement: { type: string }) => movement.type === "SALE_CONSUMPTION",
    ),
  ).toHaveLength(0);

  await page.getByRole("button", { name: "Sales", exact: true }).click();
  const saleRow = page.getByRole("row", { name: /A002/ });
  await saleRow.getByRole("button", { name: "Receipt", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Receipt A002" })
      .getByText("Vanilla ×2 · Paper cup"),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Receipt A002" })
    .getByRole("button", { name: "Done" })
    .click();

  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Daily report" }),
  ).toBeVisible();
  const paymentPanel = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: "Payment methods" }),
  });
  await expect(
    paymentPanel.getByText("Mobile money", { exact: true }),
  ).toBeVisible();
  await expect(paymentPanel.getByText("Card", { exact: true })).toBeVisible();
  await expect(page.getByText(/manual/i)).toHaveCount(0);
  const summary = await (
    await page.request.get("/api/reports/daily", { headers })
  ).json();
  expect(summary.net_sales_ngwee).toBe(11000);
  expect(summary.payment_totals).toEqual({
    CASH: 2500,
    MOBILE_MONEY_MANUAL: 4000,
    CARD_MANUAL: 4500,
  });
  expect(summary.expected_cash_ngwee).toBe(52500);
});

test("an offline cash sale survives reload and syncs once", async ({
  page,
  context,
}) => {
  const token = await signIn(page);
  const headers = { Authorization: `Bearer ${token}` };
  await openBusinessDay(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Customize Vanilla", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
  ).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/You’re offline/)).toBeVisible();
  await addSeededVanilla(page);
  await page.getByRole("button", { name: "Take payment", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mobile money", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Cash received (K)").fill("50");
  await page.getByRole("button", { name: "Save cash sale on device" }).click();
  await expect(
    page.getByRole("dialog").getByText("Pending sync", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "1 to sync" })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole("button", { name: "1 to sync" })).toHaveCount(0);
  const orders = await (
    await page.request.get("/api/orders", { headers })
  ).json();
  expect(
    orders.filter((order: { offline: boolean }) => order.offline),
  ).toHaveLength(1);
  await page.reload();
  const again = await (
    await page.request.get("/api/orders", { headers })
  ).json();
  expect(
    again.filter((order: { offline: boolean }) => order.offline),
  ).toHaveLength(1);
});

test("owner edits stand details, receipt fields and staff access", async ({
  page,
}) => {
  await signIn(page, "owner");
  await page.getByRole("button", { name: "Settings and information" }).click();
  await expect(
    page.getByRole("heading", { name: "Staff accounts" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit details" }).click();
  let dialog = page.getByRole("dialog", { name: "Edit stand details" });
  await dialog.getByLabel("Stand name").fill("Arcades stand");
  await dialog.getByLabel("Location").fill("Great East Road, Lusaka");
  await dialog.getByRole("button", { name: "Save changes" }).click();

  await page.getByRole("button", { name: "Edit receipt details" }).click();
  dialog = page.getByRole("dialog", { name: "Edit receipt details" });
  await dialog.getByLabel("Legal business name").fill("CREAMY HEAVEN LIMITED");
  await dialog.getByLabel("TPIN").fill("1002681530");
  await dialog.getByLabel("Contact number").fill("0771450074");
  await dialog
    .getByLabel("Receipt footer")
    .fill("A little happiness in every cone.");
  await expect(dialog.getByLabel("Tax category")).toHaveCount(0);
  await expect(dialog.getByLabel("Tax rate (%)")).toHaveCount(0);
  expect(
    (
      await new AxeBuilder({ page })
        .include("dialog")
        .withTags(axeTags)
        .analyze()
    ).violations,
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("1002681530", { exact: true })).toBeVisible();
  await expect(page.getByText("Fiscal status", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Add staff account" }).click();
  const create = page.getByRole("dialog");
  await expect(
    create.getByLabel("Role").getByRole("option", { name: /Server/i }),
  ).toHaveCount(0);
  await create.getByLabel("Full name").fill("Evening Cashier");
  await create.getByLabel("Username").fill("evening-cashier");
  await create.getByLabel("Role").selectOption("CASHIER");
  await create.getByLabel("Temporary password").fill("temporary-password-2026");
  await create.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("Evening Cashier", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit Evening Cashier" }).click();
  const edit = page.getByRole("dialog");
  await edit.getByLabel("Account active").uncheck();
  await edit.getByRole("button", { name: "Save account changes" }).click();
  await expect(
    page.getByRole("row", { name: /Evening Cashier/ }).getByText("Inactive"),
  ).toBeVisible();
});
