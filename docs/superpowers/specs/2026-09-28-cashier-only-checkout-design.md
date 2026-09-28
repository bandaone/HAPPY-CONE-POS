# Happy Cone Cashier-Only Checkout Design

**Date:** 2026-09-28  
**Status:** Approved in chat; awaiting review of this written specification

## Purpose

Happy Cone will run a cashier-led counter. The cashier records payment and gives the customer one ordinary receipt. Servers are told what to prepare verbally. They do not receive printed tickets, digital notices or order numbers, and they do not use a preparation workspace.

The checkout must remain fast while preserving the internal records needed for stock, refunds, reporting, payment recovery and audit history.

## Decisions

- Print one customer receipt only.
- Do not print or display a serving ticket.
- Do not send a server notification.
- Remove the preparation queue from normal operation.
- Do not expose a customer-facing order-number or ticket-number system.
- Retain one small sequential **Receipt No.** on the receipt and in Sales so staff can find a transaction for review or refund.
- Preserve internal database identifiers and idempotency keys. They are implementation records and do not become customer-facing order numbers.
- Treat a successful checkout as a completed sale immediately.

## Cashier Flow

1. The cashier selects products, variations and extras.
2. The cashier opens payment and confirms cash, mobile money or card details.
3. The server records the sale, payment, stock consumption and audit event in one transaction.
4. The sale is immediately complete; it does not wait for preparation status changes.
5. The customer receipt opens as soon as checkout succeeds.
6. **Print receipt** is the primary, initially focused action. **Done** closes the receipt without printing.
7. The cart clears only after the server has accepted the sale. Retrying a failed request uses the existing idempotency key so a customer cannot be charged twice.

The browser print dialog remains the initial printer adapter. The application does not claim that printing succeeded, and closing or failing the printer dialog never reverses the sale. Staff can reprint the receipt from Sales.

## Customer Receipt

The printed receipt contains only information useful to the customer and the business:

- Happy Cone logo;
- legal business name, stand name and location;
- TPIN and contact number;
- date and time;
- small `Receipt No. A001` style reference;
- purchased items, quantities, unit prices, extras and line totals;
- sale total and payment details;
- cashier name;
- configured Turnover Tax details;
- configured receipt footer.

The receipt removes:

- `Order` labels;
- a second sale-reference value;
- internal variation codes;
- customer-ticket wording;
- preparation status;
- server instructions;
- serving-ticket content.

Refunded receipts keep the same receipt number and display the existing refund marking and reason.

## Sale Status and Data Compatibility

New online and synchronized offline sales are stored as complete (`SERVED`) at creation. This prevents paid sales from accumulating in an unused active-order queue.

The existing `orders`, `order_lines` and `number` database fields remain in place to avoid a risky data migration. In the user interface and printed output, these records are called **sales** and the sequential number is called **Receipt No.** Existing historic records remain readable and refundable.

The old status-transition API can remain temporarily for backward compatibility, but no current Happy Cone screen calls it. It must not create or print a server ticket.

## Navigation and Staff Roles

- Remove **Prepare** from the navigation for every role.
- Remove preparation instructions from the product tour, Help and editable operating-guide defaults.
- Remove **Server** from the role options used to create or edit staff accounts.
- Keep existing `SERVER` records so account and audit history is not deleted.
- When editing a legacy server account, show its current role as a labelled legacy value and require the owner to choose Cashier, Manager or Owner administrator before reactivating it.
- A legacy server account cannot enter an operational workspace. Sign-in or session restoration presents a clear message asking the owner to reassign or deactivate the account.
- Owner administrators can still see legacy server accounts in Staff Accounts and change them to a supported role or deactivate them.

Supported operational roles become Cashier, Manager and Owner administrator. Existing permission boundaries for refunds, reports, stock and staff management remain unchanged.

## Sales and Wording

Visible language follows the cashier-only model:

| Existing wording | Replacement |
| --- | --- |
| Order A001 | Receipt No. A001 |
| Order details | Sale details |
| Customer ticket | Receipt |
| Preparation queue | Removed |
| Start preparing / Mark ready / Mark served | Removed |
| Pending server acceptance | Pending sync |

The Sales page continues to list completed transactions, payment state and refunds. It does not show preparation status when every new sale is already complete.

A data migration replaces the old built-in preparation and customer-ticket guidance only when it still matches the supplied default wording. Business wording already customized by an owner is preserved for manual review.

## Offline and Failure Behaviour

- Offline mode continues to allow cash-only capture.
- An offline printout is labelled **Provisional receipt** and uses a local reference until synchronization assigns the final receipt number.
- Synchronization stores the sale as complete and preserves one-time submission guarantees.
- Network, printer and browser failures do not remove a saved sale or restore consumed stock.
- A failed checkout remains recoverable with the same payment attempt.
- A failed print shows the existing recovery message and directs staff to Sales for reprinting.

## Speed and Accessibility

- Keep quick-cash buttons and calculated change.
- Use one primary action at each stage: **Confirm payment**, then **Print receipt**.
- Give payment and receipt actions a minimum 44-by-44-pixel target, visible keyboard focus and plain action labels.
- Move focus to the receipt’s Print button after checkout so keyboard users can print with Enter.
- Keep payment errors inside the payment dialog without clearing entered provider or reference details.
- Avoid confirmation dialogs in the successful checkout path.
- Preserve narrow-phone reflow, 200% zoom support, screen-reader labels and reduced-motion behaviour.

## Verification

Automated checks must prove:

- checkout creates a complete sale and deducts each recipe component once;
- duplicate checkout retries return the original sale;
- no active preparation order remains after successful checkout or offline synchronization;
- only one printable customer receipt is rendered;
- the receipt contains `Receipt No.` and does not contain `Order`, `Customer ticket`, internal item codes or serving-ticket content;
- receipt printing failure leaves the sale available for reprint;
- Prepare is absent from navigation and onboarding;
- the Server role cannot be newly assigned;
- legacy server accounts remain visible to the owner and receive a clear no-workspace response;
- Cashier, Manager and Owner administrator permissions still work;
- browser journeys cover cash checkout, print/reprint, refund lookup, stock deduction, reporting, day close and offline sync;
- 58 mm and 80 mm print layouts do not clip receipt numbers or amounts;
- automated WCAG checks and phone reflow continue to pass.

## Acceptance Criteria

The change is complete when a cashier can take a payment, reach a print-ready ordinary receipt immediately, print or close it, and begin the next sale without any preparation action. No interface or printout asks a server to interact with the system, while receipt lookup, stock, refunds, reports and audit history remain accurate.
