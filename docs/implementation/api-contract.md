# Happy Cone API contract

Base `/api`; JSON. All except login require `Authorization: Bearer <token>`. Money is integer **ngwee** (K42 = 4200); quantities are decimal strings. Errors `{detail: string}`. Times UTC ISO 8601. Database initialized only by CLI migrate/seed (test create_app initializes isolated DB).

## Identity
- `POST /auth/login` `{username,password}` -> `{token,user:{id,username,name,role,active}}`. Seed command creates `manager`, `cashier`, and `owner`; explicit password argument required. The production proxy rate-limits repeated login attempts.
- `GET /session` -> `{id,username,name,role,active}`.
- `POST /auth/logout` -> `{ok:true}`.
- `POST /auth/change-password` `{current_password,new_password}` -> `{ok:true,other_sessions_revoked}`. Keeps the current session and revokes the user's other sessions.
- Owner only: `GET /users`, `POST /users`, `PATCH /users/{id}`, `POST /users/{id}/reset-password`, and `POST /users/{id}/revoke-sessions`. New role assignments accept only `CASHIER`, `MANAGER`, or `OWNER_ADMIN`. Historic `SERVER` rows remain listable and can be reassigned; role or active-status changes revoke the affected user's sessions. The last active owner cannot be deactivated or demoted.

## Service status
- `GET /health` is a process liveness check and does not access the database.
- `GET /ready` executes a database query and returns `{status:"ready",database:"ok"}` only when the service can accept database-backed work.
- Every HTTP response includes `X-Request-ID`. A valid caller-provided identifier is preserved; otherwise the API assigns one. Structured request logs include the same identifier, response status, path and duration.

## Catalog
- `GET /catalog` -> `{categories:[...],products:[{id,category_id,name,category,description,color,active,variants:[...],choice_sets:[{group_id,name,minimum,maximum,position}]}],modifier_groups:[...],modifiers:[...]}`. Normal reads include active products only after they have at least one active price. Manager/owner `?include_inactive=true` includes unfinished and archived records; cashier use of that flag returns 403.
- Manager/owner menu creation: `POST /catalog/categories`, `POST /catalog/menu-items`, `POST /catalog/modifier-groups`, and `POST /catalog/modifier-groups/{group_id}/modifiers`. A menu-item command atomically creates the item, its prices, and attached choice sets: `{id,category_id,name,description,color,active,prices:[{id,name,price_ngwee,active,recipe:[]}],choice_sets:[{group_id,minimum,maximum,position}]}`.
- Manager/owner menu editing: `PUT /catalog/categories/{id}`, `PUT /catalog/menu-items/{product_id}`, `PUT /catalog/modifier-groups/{id}`, and `PUT /catalog/modifiers/{id}`. The atomic menu-item update replaces its current prices and product-specific choice assignments in one transaction. Legacy product/variant endpoints remain for compatibility. `PATCH /catalog/products/{id}` remains available for quick availability changes.
- Create commands require a permanent lowercase item code containing letters, numbers and hyphens. Codes cannot be renamed. Duplicate codes return 409. Blank or oversized fields, invalid colours or choice limits, unknown parents, negative prices, duplicate child codes, and duplicate choice-set assignments return 422 without committing partial changes. The web forms generate these codes; staff do not type them.
- Product commands contain `{category_id,name,description,color,active}`. Price and choice commands contain `{name,price_ngwee,active}`; the retained API may also return an empty legacy `recipe` array. Modifier group commands contain `{name,minimum,maximum}` with `0 <= minimum <= maximum <= 20`. Create commands add `id`.
- Every mutation is branch-locked, committed atomically, and audited with structured before/after state. Catalog records are archived through `active:false`; there is no destructive delete endpoint.
- Product choice assignments govern required and maximum selections for that specific item. Repeated modifier IDs are allowed up to the assigned maximum, so a Double Scoop may contain `["flavour-vanilla","flavour-vanilla","cup"]`. Groups not attached to the item are rejected.
- `PATCH /catalog/products/{id}` manager/owner `{active:boolean}` -> `{id,active}`.

## Business day
- `GET /business-day/current` -> day object or `null` (latest OPEN day only).
- `GET /business-day` -> newest-first day objects.
- `POST /business-day/open` cashier/manager/owner `{opening_float_ngwee:50000}` -> day.
- `POST /business-day/close` manager/owner `{actual_cash_ngwee:54200}` -> closed day.
- Day `{id,status,opened_at,closed_at,opening_float_ngwee,actual_cash_ngwee,expected_cash_ngwee,variance_ngwee,summary}`. Actual/variance/closed_at/summary null before close; expected calculated live. Summary shape below.
- `POST /business-day/cash-movements` manager/owner `{amount_ngwee:1000,reason:"Cash added"}` -> `{id,amount_ngwee,reason}`. Signed amount; nonzero.

## Orders and checkout
- `POST /orders/quote` cashier/manager/owner `{lines:[{variant_id,quantity:1,modifier_ids:["cone","oreo"],notes:""}]}` -> `{lines:[{variant_id,name,quantity,unit_price_ngwee,total_ngwee,modifier_names,notes}],total_ngwee}`. Variant and modifier IDs are strings from catalog; server always prices.
- `POST /orders` cashier/manager/owner `{idempotency_key:"UUID",business_day_id:"...",lines:[...],payment:{method:"CASH",tendered_ngwee:5000},offline:false}` -> completed Order with `status:"SERVED"`, HTTP 201 (also replay). Mobile money uses `{method:"MOBILE_MONEY_MANUAL"}` and card uses `{method:"CARD_MANUAL"}`; provider, card, phone, and transaction-reference fields are not accepted. `business_day_id` is required and binds an offline sale to its originating day. `offline:true` permits Cash only. Key replay with changed payload returns 409. Prices always come from the server.
- `GET /orders?active=true` -> historic non-completed Order[] oldest first; new cashier-only sales do not enter this list. Omit active for recent sales (newest first, up to 200).
- `GET /orders/{id}` -> Order.
- `POST /orders/{id}/status` is retained for manager/owner handling of historic records. It accepts guarded `NEW -> PREPARING -> READY -> SERVED` transitions; stale state returns 409. New checkouts already use `SERVED`.
- `POST /orders/{id}/refund` manager/owner `{reason:"Customer refund"}` -> Order. Full refund only during original OPEN business day, preserves original order/payment and creates financial reversal; stock is NOT automatically returned. Repeated refund rejected.
- `GET /orders/{id}/ticket` is a compatibility payload for existing integrations: `{order_id,number,created_at,lines,total_ngwee,payment_status,payment_method,tendered_ngwee,change_ngwee,fiscal_status:"NOT_CONFIGURED"}`. The web application prints one customer receipt from the saved sale.
- Order `{id,number,business_day_id,status,created_at,cashier_name,lines,total_ngwee,payment:{method,status,amount_ngwee,tendered_ngwee,change_ngwee,provider,reference},refunded:boolean,refund_reason:null|string,offline:boolean}`. `cashier_name` is captured at checkout and does not change when the staff account is renamed. Lines same shape as quote. Payment status `CONFIRMED` or `REFUNDED`.
- `GET /events` SSE remains available for compatibility and emits `orders` events containing `{revision:string}` on database state changes. The cashier-only web application does not expose a preparation queue.

## Retained inventory compatibility
Inventory tables and routes remain available so earlier data is preserved and a later stock project can build on it. The active stand setting is `inventory_tracking_enabled:false`: checkout does not validate stock, write recipe consumption, or change on-hand balances. Inventory screens are not part of the current Menu workflow. Legacy manager/owner routes:
- `GET /inventory` -> `[{id,name,unit,on_hand:"100.000",low_stock_threshold:"10.000"}]`.
- `GET /inventory/movements?item_id=...` -> `[{id,item_id,item_name,type,quantity,unit,reference,reason,actor_id,created_at}]` newest first (up to 500).
- `POST /inventory/movements` `{item_id,type:"RECEIPT"|"WASTE"|"ADJUSTMENT_IN"|"ADJUSTMENT_OUT"|"RETURN_IN"|"RETURN_OUT"|"STAFF_USE",quantity:"10.000",reason:"Supplier delivery"}` -> movement. Request quantity positive, ledger response signed. Base units only.
- `POST /inventory/counts` `{item_id,counted_quantity:"20.000",reason:"Evening count"}` -> `{id,item_id,expected_quantity,counted_quantity,variance,created_at}`. Count records variance; explicit separate adjustment required to affect stock.
- `GET /inventory/counts` -> count objects newest first.

## Reporting / audit
Manager/owner:
- `GET /reports/daily?business_day_id=...` -> summary; omitted day selects latest business day. No day -> zero totals with day null.
- Summary `{business_day_id,order_count,gross_sales_ngwee,refunds_ngwee,net_sales_ngwee,average_order_ngwee,payment_totals:{CASH,MOBILE_MONEY_MANUAL,CARD_MANUAL},opening_float_ngwee,cash_movements_ngwee,expected_cash_ngwee,actual_cash_ngwee,variance_ngwee,products:[{name,quantity,total_ngwee}]}`. Payment totals net refunds. Average net/order count, integer rounded down. Product totals gross before full-order refunds; summary explicitly identifies refunded total separately.
- `GET /audit` -> `[{id,actor_id,actor_name,action,entity,entity_id,metadata,correlation_id,created_at}]` newest first, limit 200.

Role enforcement is backend-owned. Historic SERVER rows can sign in only for reassignment; new role assignments accept Cashier, Manager, or Owner administrator. Cashiers sell and open/read the business day. Managers maintain the Menu, reports, refunds, settings, and cash close. Owner administrators additionally manage staff accounts. No production accounts, menu records, or transactions are created automatically.
