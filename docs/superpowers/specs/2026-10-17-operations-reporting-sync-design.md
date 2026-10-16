# Happy Cone Operations, Inventory and Remote Reporting Design

**Date:** 17 October 2026  
**Status:** Proposed for implementation  
**Target:** Single-store Happy Cone POS with local Windows operation and read-only remote monitoring

## Purpose

Complete the Happy Cone POS as a dependable single-store operating system. The cashier must be able to sell quickly, correct only the latest sale before another sale is recorded, print a short receipt, and keep cash and ingredient stock accurate. Owners must be able to monitor the store remotely without gaining the ability to alter store records.

The shop must continue operating if the internet or the cloud reporting service is unavailable. The local shop database remains the operational source of truth.

## Confirmed product decisions

- The receipt uses the configured business or stand name as text and does not print the logo icon.
- Both cashiers and managers may correct only the globally most recent completed sale.
- A sale can be corrected only while no newer sale has been recorded and while its business day remains open.
- Completed sales are never overwritten or deleted. Correction creates an audited reversal and a replacement sale.
- Stock is ingredient based. Menu items and choices consume stock through simple recipes.
- Stock and menu setup must remain straightforward for nontechnical staff.
- Waste requires a quantity and reason. Its financial value is reported at selling-price value.
- The first release serves one store.
- Remote access is read-only.
- The shop continues working locally without internet and synchronizes when connectivity returns.
- The initial hosting target is Supabase Free for cloud reporting data and authentication, with Cloudflare Pages Free for the owner dashboard.

## Current-system findings

The repository already contains useful foundations:

- append-only refunds, cash movements, stock movements and audit events;
- business-day open and close with expected cash, actual cash and variance;
- menu variants, modifier choices and recipe components;
- ingredient stock, stock counts and waste movement types;
- daily sales totals, payment totals and product quantities;
- a local Windows installation and update mechanism.

The current simplified release disables stock tracking. Refunds do not return stock, product reporting does not subtract refunded quantities, cash movements are shown only as a net value, and remote reporting is not implemented. The working tree also contains unfinished receipt and installation-document edits; these must be preserved and repaired deliberately.

## System architecture

### Local shop system

The Windows shop computer runs the existing React PWA, FastAPI service and PostgreSQL database. It performs all cashier, menu, cash, inventory and reporting operations locally.

Every operation that affects money or stock is committed locally before the interface reports success. Printing and cloud synchronization cannot make a completed sale fail.

### Cloud reporting system

The local API sends immutable reporting events to a Supabase project over HTTPS. Synchronization is outbound from the shop; no inbound internet connection to the shop computer is required.

Cloudflare Pages hosts a separate read-only owner dashboard. Owners authenticate through Supabase Auth. Row-level security permits owners to read the single store's reporting tables while denying client-side writes.

The cloud copy is a reporting replica. It is not used to complete checkout, decide stock availability, correct sales or close the business day.

### Synchronization guarantees

- Each local event has a stable UUID, store ID, sequence number and local commit timestamp.
- A durable local outbox records events in the same transaction as the business operation.
- Uploads are idempotent; resending an event cannot create duplicate cloud activity.
- Events upload in sequence, using bounded batches and retry delays.
- Failed uploads remain queued and are visible to managers.
- The store operates normally while offline.
- Daily close does not depend on cloud availability.
- The dashboard shows the last successful synchronization time and warns when data is stale.

## Receipt design

The receipt is optimized for the configured 58 mm or 80 mm paper width.

It contains:

1. business or stand name as a compact text heading;
2. location, TPIN and contact number;
3. date, time and receipt number;
4. concise item, choice, quantity and amount lines;
5. total and payment method;
6. cash received and change for cash sales;
7. cashier name;
8. configured receipt footer.

The logo icon, decorative headings, units-bought summary, provider references and redundant explanatory text are omitted. Tax presentation continues to use the configured turnover-tax wording until Smart Invoice becomes the fiscal receipt source.

Print CSS sets an exact paper width, removes modal chrome and minimizes margins and vertical spacing. Receipt rendering remains readable on screen and in browser print preview.

## Latest-sale correction

### Eligibility

A cashier or manager may correct an order only when all conditions are true:

- it is the most recently completed sale across the store;
- no later order exists, including one recorded by another cashier;
- its business day is still open;
- it has not already been reversed or replaced;
- it is not waiting in a conflicting offline checkout state.

The API enforces eligibility inside the same branch lock and database transaction used for checkout. Hiding the button in the interface is not considered enforcement.

### Correction flow

1. Staff open the latest sale and choose **Correct latest sale**.
2. The interface explains that the original record will remain in history.
3. Staff enter a required correction reason.
4. The server creates a full reversal for the original payment and all stock consumption.
5. The original cart is reopened in the checkout interface.
6. Staff change items, choices, quantities or payment method.
7. Completing checkout creates a new sale with a new receipt number and a link to the reversed sale.

If the reopened cart is abandoned, the original remains reversed and reports show the reversal without a replacement. The system provides a clear **Resume correction** action until another sale is completed. Recording a new unrelated sale permanently closes the correction opportunity.

### Audit and reporting

The immutable correction record stores the original sale ID, replacement sale ID when present, reason, initiating user, payment reversal, stock reversal and timestamps. Reports show corrected sales separately from customer refunds.

## Cash and daily reconciliation

The cash day screen and daily report share one calculation service so displayed totals cannot diverge.

The report includes:

- business-day opening and closing staff and timestamps;
- opening float;
- every cash sale, reversal and manual cash movement;
- cash-in and cash-out movements as separate rows with reason, staff member and time;
- cash, mobile-money and card totals;
- gross sales, corrections, refunds and net sales;
- expected cash calculation with an expandable explanation;
- counted closing cash and variance;
- sale count, units sold, average sale and hourly trend;
- item and variation quantities and values;
- choice or topping quantities where useful;
- ingredient consumption from sales;
- waste quantities, reasons and selling-price value;
- stock receipts, adjustments and closing expected balances.

Refunded and corrected items are removed from net product quantities and values. The closed-day snapshot stores the detailed report so historical figures do not change when menu names or recipes are edited later.

## Inventory and menu setup

### Stock items

A stock item contains a plain name, base unit, optional pack name, units per pack and low-stock threshold. Examples:

- Vanilla ice cream — base unit: scoop; pack: tub; scoops per tub: configured by staff.
- Regular cone — base unit: cone; pack: box; cones per box: configured by staff.
- Chocolate sauce — base unit: serving; pack: bottle; servings per bottle: configured by staff.

Receiving stock defaults to packs but also permits a base-unit quantity. Staff never enter conversion formulas.

### Menu recipes

Each sale variation and priced extra has a short **Uses from stock** list. A recipe row selects a stock item and quantity. Common recipe templates can be copied to similar variations.

The menu editor keeps normal item creation separate from optional stock setup:

1. name and category;
2. price or prices;
3. customer choices;
4. stock used per sale.

The interface offers practical shortcuts such as copying a recipe from another variation and applying a shared cone or cup component to several items.

An available menu variation must have a valid recipe once inventory tracking is enabled. Archived menu entries retain their historical recipes.

### Automatic stock movements

- Sale: deduct the sale variation and selected-choice recipes.
- Latest-sale correction: restore the original recipes, then deduct the replacement recipes.
- Stock receipt: add received packs or base units.
- Waste: deduct the derived recipe or selected stock quantity.
- Adjustment: add or remove stock with a required reason.
- Physical count: record expected, counted and variance; an approved adjustment reconciles the ledger.

Stock movements remain append-only. Current balance is the sum of movements.

## Waste workflow

The fast waste action supports two paths:

- **Prepared item waste:** select a menu item or variation and its choices. The system derives the ingredient quantities and selling-price value.
- **Ingredient waste:** select a stock item and quantity for spills, spoilage or damaged packaging. Staff also select the closest related menu item or enter a selling-value estimate when an automatic retail value cannot be derived.

A reason is mandatory. Suggested reasons include dropped before serving, preparation mistake, melted or spoiled, damaged packaging and other. Selecting **Other** requires a comment.

Waste records show the recording user and time, cannot be deleted, and may be corrected only by an opposite audited movement.

## Owner dashboard

The remote dashboard is optimized for phones and ordinary laptops. It provides:

- today's sales and net sales;
- payment-method breakdown;
- hourly sales trend;
- top-selling items and quantities;
- current expected stock and low-stock warnings;
- today's ingredient consumption;
- waste quantity, reason and selling-price value;
- cash expected, counted and variance after close;
- recent corrections, refunds and cash movements;
- last synchronization time and pending/stale warning;
- selectable historical business days and date-range trends.

Remote users cannot mutate operational data. Menu management, sale correction, stock adjustment, cash movement and staff administration remain available only on the local system.

## Permissions

- **Cashier:** checkout, reprint, correct the eligible latest sale, record prepared-item waste, view the current cash-day status needed for work.
- **Manager:** all cashier actions, open/close and reconcile the day, record cash movements, receive/adjust/count stock, configure menu recipes, view detailed local reports.
- **Owner admin:** all local management and configuration, cloud-owner account administration.
- **Remote owner:** read-only cloud dashboard access.

Every mutation records the authenticated user. Shared accounts are unsupported.

## Offline behavior

Local checkout, corrections, receipts, cash operations, stock movements and reports remain available without internet. Cloud synchronization status never blocks the counter.

Offline browser checkout retains the existing idempotent journal. When a queued checkout reaches the local API, latest-sale eligibility is evaluated by the server's committed order sequence. The interface prevents a correction while it has an unresolved offline checkout that could become the newer sale.

## Security

- The Supabase service credential is stored only in the local API configuration, never in browser JavaScript.
- Owner dashboard access uses Supabase Auth and row-level security.
- Cloud tables deny owner writes.
- Sync requests are authenticated, idempotent and rate limited.
- No database or POS port is exposed on the shop router.
- Secrets are excluded from release archives, logs and source control.
- Local and cloud audit records omit card data and mobile-money transaction details.

## Data migration

New migrations add correction links, inventory pack conversion, sale-stock snapshots, waste retail value, reporting outbox and store identity. Existing sales remain valid.

Enabling inventory requires an explicit opening-stock setup:

1. create or confirm stock items;
2. enter pack conversions;
3. attach recipes to active menu variations and extras;
4. record opening quantities;
5. run a validation preview;
6. enable automatic deduction.

The system does not retroactively invent stock consumption for historical sales.

## Deployment and upgrades

Development, automated testing and cloud setup can be completed away from the shop computer. The final Windows release upgrades the existing installation in place.

Before the shop update:

- create and verify a local database backup;
- preserve existing configuration and users;
- install the versioned application release;
- run forward-only database migrations;
- configure the store's cloud sync credential;
- verify local operation before enabling sync;
- retain the previous release and documented rollback procedure.

Final commissioning tests the thermal printer, local network, automatic startup, offline checkout, correction, stock deduction, waste, daily close and remote synchronization.

## Error handling

- Latest-sale conflicts return a clear message explaining that a newer sale locked the record.
- Insufficient stock identifies the missing ingredient and required quantity.
- Sync failures queue for retry and show the last successful sync time.
- Duplicate sync events are accepted idempotently without duplicate reporting.
- Receipt printing failures never remove or reverse a sale.
- Cloud dashboard failures never affect local operations.
- Report calculations fail closed and log correlation IDs rather than silently omitting movements.

## Testing requirements

### Domain and API

- latest sale can be reversed by cashier and manager;
- earlier sale cannot be reversed after a newer sale commits;
- concurrent checkouts and correction requests preserve the global latest-sale rule;
- correction reverses payment and exact stock snapshots;
- replacement sale links to the original;
- abandoned correction remains visible and auditable;
- refunded and corrected items are excluded from net product reporting;
- cash reconciliation expands to the exact contributing movements;
- sale recipes, extras, waste and reversal produce correct stock movements;
- pack conversions preserve decimal precision;
- closed-day snapshots retain detailed immutable totals;
- outbox commit is atomic with each business mutation;
- sync retry and duplicate upload are idempotent;
- cloud access policies deny remote writes and cross-store reads.

### Web and usability

- receipt print snapshots at 58 mm and 80 mm contain no logo and no clipped text;
- latest-sale correction is reachable quickly and disabled immediately after a newer sale;
- menu recipe setup can be completed without IDs or formulas;
- stock receipt and waste flows use large touch targets and plain wording;
- detailed daily reports agree with test ledger records;
- dashboard clearly distinguishes current, stale and offline data;
- keyboard, touch, focus order, labels, status messages and contrast meet existing accessibility standards.

### Release verification

- fresh Windows installation;
- in-place upgrade with existing data;
- backup and restore rehearsal;
- printer commissioning;
- local network access;
- internet loss and recovery;
- remote dashboard authentication and read-only enforcement.

## Delivery sequence

1. Repair and compact the receipt.
2. Implement latest-sale correction and audit links.
3. Correct and expand daily sales and cash reporting.
4. Re-enable inventory with simple stock-item and recipe setup.
5. Implement automatic sale deduction, reversal and waste valuation.
6. Add the transactional outbox and cloud reporting schema.
7. Build the read-only owner dashboard.
8. Produce and verify the Windows upgrade release.

This sequence keeps each financial and stock calculation locally testable before remote synchronization is introduced.
