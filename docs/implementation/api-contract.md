# Happy Cone API contract

Base `/api`; JSON. All except login require `Authorization: Bearer <token>`. Money is integer **ngwee** (K42 = 4200); quantities are decimal strings. Errors `{detail: string}`. Times UTC ISO 8601. Database initialized only by CLI migrate/seed (test create_app initializes isolated DB).

## Identity
- `POST /auth/login` `{username,password}` -> `{token,user:{id,username,name,role,active}}`. Seed command creates `manager`, `cashier`, `server`, `owner`; explicit password argument required. The production proxy rate-limits repeated login attempts.
- `GET /session` -> `{id,username,name,role,active}`.
- `POST /auth/logout` -> `{ok:true}`.
- `POST /auth/change-password` `{current_password,new_password}` -> `{ok:true,other_sessions_revoked}`. Keeps the current session and revokes the user's other sessions.
- Owner only: `GET /users`, `POST /users`, `PATCH /users/{id}`, `POST /users/{id}/reset-password`, and `POST /users/{id}/revoke-sessions`. Role or active-status changes revoke the affected user's sessions. The last active owner cannot be deactivated or demoted.

## Service status
- `GET /health` is a process liveness check and does not access the database.
- `GET /ready` executes a database query and returns `{status:"ready",database:"ok"}` only when the service can accept database-backed work.
- Every HTTP response includes `X-Request-ID`. A valid caller-provided identifier is preserved; otherwise the API assigns one. Structured request logs include the same identifier, response status, path and duration.

## Catalog
- `GET /catalog` -> `{categories:[{id,name}],products:[{id,category_id,name,category,description,color,active,variants:[{id,product_id,name,price_ngwee,active,recipe:[{item_id,quantity}]}]}],modifier_groups:[{id,name,minimum,maximum}],modifiers:[{id,group_id,group,name,price_ngwee,active,recipe:[{item_id,quantity}]}]}`. Normal reads include active sellable records. Manager/owner `?include_inactive=true` includes archived products, variations and modifiers; cashier/server use of that flag returns 403.
- Manager/owner creation: `POST /catalog/categories`, `POST /catalog/products`, `POST /catalog/products/{product_id}/variants`, `POST /catalog/modifier-groups`, and `POST /catalog/modifier-groups/{group_id}/modifiers`.
- Manager/owner editing: `PUT /catalog/categories/{id}`, `PUT /catalog/products/{id}`, `PUT /catalog/variants/{id}`, `PUT /catalog/modifier-groups/{id}`, and `PUT /catalog/modifiers/{id}`. `PATCH /catalog/products/{id}` remains available for a quick `{active:boolean}` change.
- Create commands require a permanent lowercase item code containing letters, numbers and hyphens. Codes cannot be renamed. Duplicate codes return 409. Blank/oversized fields, invalid colours, invalid group limits, unknown parents, negative prices, duplicate recipe ingredients, unknown stock items, and non-positive or over-precision recipe quantities return 422 without committing partial changes.
- Product commands contain `{category_id,name,description,color,active}`. Variation and modifier commands contain `{name,price_ngwee,active,recipe:[{item_id,quantity}]}`. Modifier group commands contain `{name,minimum,maximum}` with `0 <= minimum <= maximum <= 20`. Create commands add `id`.
- Every mutation is branch-locked, committed atomically, and audited with structured before/after state. Catalog records are archived through `active:false`; there is no destructive delete endpoint.
- Seed: Vanilla, Chocolate, Strawberry with Single / Double variants; Cone/Cup serving options, Oreo/Sprinkles/Chocolate sauce toppings. Double Vanilla 3200 + Cone 500 + Oreo 500 = 4200. Modifier-group limits govern required and maximum selections; duplicate modifier IDs are rejected.
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
- `POST /orders` cashier/manager/owner `{idempotency_key:"UUID",business_day_id:"...",lines:[...],payment:{method:"CASH",tendered_ngwee:5000,provider:null,reference:null},offline:false}` -> Order, HTTP 201 (also replay). `business_day_id` REQUIRED binds offline sale to its originating day. `offline:true` permits CASH only. Manual methods `MOBILE_MONEY_MANUAL` and `CARD_MANUAL` require provider and reference; tendered omitted. Key replay with changed payload returns 409. No client supplied prices.
- `GET /orders?active=true` -> Order[] oldest first for active queue; omit active for recent sales (newest first, up to 200).
- `GET /orders/{id}` -> Order.
- `POST /orders/{id}/status` server/manager/owner `{status:"PREPARING",expected_status:"NEW"}` -> Order. Only `NEW -> PREPARING -> READY -> SERVED`. Stale state returns 409.
- `POST /orders/{id}/refund` manager/owner `{reason:"Customer refund"}` -> Order. Full refund only during original OPEN business day, preserves original order/payment and creates financial reversal; stock is NOT automatically returned. Repeated refund rejected.
- `GET /orders/{id}/ticket` -> `{order_id,number,created_at,lines,total_ngwee,payment_status,payment_method,tendered_ngwee,change_ngwee,fiscal_status:"NOT_CONFIGURED"}`.
- Order `{id,number,business_day_id,status,created_at,cashier_name,lines,total_ngwee,payment:{method,status,amount_ngwee,tendered_ngwee,change_ngwee,provider,reference},refunded:boolean,refund_reason:null|string,offline:boolean}`. `cashier_name` is captured at checkout and does not change when the staff account is renamed. Lines same shape as quote. Payment status `CONFIRMED` or `REFUNDED`.
- `GET /events` SSE with bearer auth: events `orders` containing `{revision:string}` on DB state changes; clients reload GET /orders?active=true. Reconnect must reload. Designed for multi-worker correctness by DB state polling; UI can use authenticated fetch stream or periodic queue polling fallback.

## Inventory
Manager/owner routes:
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

Role enforcement is backend-owned. SERVER catalog/queue/ticket/session only; CASHIER also checkout and day open/read; MANAGER handles stand operations and reports; OWNER_ADMIN additionally manages staff accounts. No accounts or demo transactions are created automatically.
