import { POSAPIError } from "./client";
import type {
  AuditEvent,
  CartLine,
  CashMovement,
  Catalog,
  CheckoutCommand,
  CountInput,
  Day,
  InventoryItem,
  LoginResult,
  Movement,
  MovementInput,
  MovementType,
  Order,
  OrderStatus,
  POSClient,
  Product,
  ProductActiveResult,
  Quote,
  StockCount,
  Summary,
  User,
} from "./types";

export const DEMO_STORAGE_KEY = "happy-cone:demo:v1";
const DEMO_VERSION = 1;
const user: User = { id: "demo-manager", username: "demo", name: "Demo manager", role: "MANAGER", active: true };

interface DemoCashMovement extends CashMovement { business_day_id: string; created_at: string }
interface DemoState {
  version: number;
  catalog: Catalog;
  days: Day[];
  orders: Order[];
  checkoutPayloads: Record<string, string>;
  checkoutOrderIds: Record<string, string>;
  movements: Movement[];
  cashMovements: DemoCashMovement[];
  counts: StockCount[];
  audit: AuditEvent[];
  nextOrderNumber: number;
}

interface StockSeed { id: string; name: string; unit: string; quantity: string; low: string }

const stockSeeds: StockSeed[] = [
  { id: "vanilla-mix", name: "Vanilla bean ice cream", unit: "ml", quantity: "30000.000", low: "5000.000" },
  { id: "chocolate-mix", name: "Dark chocolate ice cream", unit: "ml", quantity: "30000.000", low: "5000.000" },
  { id: "strawberry-mix", name: "Strawberry ice cream", unit: "ml", quantity: "30000.000", low: "5000.000" },
  { id: "caramel-mix", name: "Salted caramel ice cream", unit: "ml", quantity: "30000.000", low: "5000.000" },
  { id: "pistachio-mix", name: "Pistachio ice cream", unit: "ml", quantity: "30000.000", low: "5000.000" },
  { id: "cookies-mix", name: "Cookies and cream ice cream", unit: "ml", quantity: "30000.000", low: "5000.000" },
  { id: "milk", name: "Fresh milk", unit: "ml", quantity: "20000.000", low: "3000.000" },
  { id: "brownie", name: "Brownie pieces", unit: "g", quantity: "5000.000", low: "500.000" },
  { id: "cone-stock", name: "Waffle cones", unit: "piece", quantity: "300.000", low: "40.000" },
  { id: "cup-stock", name: "Serving cups", unit: "piece", quantity: "300.000", low: "40.000" },
  { id: "oreo-stock", name: "Oreo crumb", unit: "g", quantity: "6000.000", low: "700.000" },
  { id: "sprinkles-stock", name: "Rainbow sprinkles", unit: "g", quantity: "4000.000", low: "500.000" },
  { id: "sauce-stock", name: "Chocolate sauce", unit: "ml", quantity: "6000.000", low: "700.000" },
];

const flavourProducts: Array<[string, string, string, string]> = [
  ["vanilla", "Vanilla bean", "vanilla-mix", "#f5e7bd"],
  ["dark-chocolate", "Dark chocolate", "chocolate-mix", "#6d4534"],
  ["strawberry", "Strawberry", "strawberry-mix", "#ef9ca9"],
  ["salted-caramel", "Salted caramel", "caramel-mix", "#d79b58"],
  ["pistachio", "Pistachio", "pistachio-mix", "#afc98a"],
  ["cookies-cream", "Cookies & cream", "cookies-mix", "#b9b4ae"],
];

function flavourProduct([id, name, itemId, color]: [string, string, string, string]): Product {
  return {
    id, name, category: "Scoops", description: "Small-batch ice cream", color, active: true,
    variants: [
      { id: `${id}-single`, name: "Single", price_ngwee: 2200, recipe: [{ item_id: itemId, quantity: "80.000" }] },
      { id: `${id}-double`, name: "Double", price_ngwee: 3200, recipe: [{ item_id: itemId, quantity: "160.000" }] },
    ],
  };
}

function seedCatalog(): Catalog {
  return {
    products: [
      ...flavourProducts.map(flavourProduct),
      {
        id: "classic-sundae", name: "Classic sundae", category: "Sundaes",
        description: "Vanilla bean with chocolate sauce", color: "#f1cfbf", active: true,
        variants: [{ id: "classic-sundae-regular", name: "Regular", price_ngwee: 4500, recipe: [
          { item_id: "vanilla-mix", quantity: "160.000" }, { item_id: "sauce-stock", quantity: "25.000" },
        ] }],
      },
      {
        id: "brownie-sundae", name: "Brownie sundae", category: "Sundaes",
        description: "Dark chocolate ice cream and brownie pieces", color: "#9e7160", active: true,
        variants: [{ id: "brownie-sundae-regular", name: "Regular", price_ngwee: 5200, recipe: [
          { item_id: "chocolate-mix", quantity: "160.000" }, { item_id: "brownie", quantity: "45.000" },
        ] }],
      },
      {
        id: "vanilla-milkshake", name: "Vanilla milkshake", category: "Milkshakes",
        description: "Vanilla bean ice cream blended with fresh milk", color: "#eee1bc", active: true,
        variants: [{ id: "vanilla-milkshake-regular", name: "Regular", price_ngwee: 4600, recipe: [
          { item_id: "vanilla-mix", quantity: "120.000" }, { item_id: "milk", quantity: "250.000" },
        ] }],
      },
      {
        id: "chocolate-milkshake", name: "Chocolate milkshake", category: "Milkshakes",
        description: "Dark chocolate ice cream blended with fresh milk", color: "#8a5c49", active: true,
        variants: [{ id: "chocolate-milkshake-regular", name: "Regular", price_ngwee: 4800, recipe: [
          { item_id: "chocolate-mix", quantity: "120.000" }, { item_id: "milk", quantity: "250.000" },
        ] }],
      },
    ],
    modifiers: [
      { id: "cone", name: "Cone", group: "Serving", price_ngwee: 500, active: true, recipe: [{ item_id: "cone-stock", quantity: "1.000" }] },
      { id: "cup", name: "Cup", group: "Serving", price_ngwee: 0, active: true, recipe: [{ item_id: "cup-stock", quantity: "1.000" }] },
      { id: "oreo", name: "Oreo", group: "Topping", price_ngwee: 500, active: true, recipe: [{ item_id: "oreo-stock", quantity: "20.000" }] },
      { id: "sprinkles", name: "Sprinkles", group: "Topping", price_ngwee: 400, active: true, recipe: [{ item_id: "sprinkles-stock", quantity: "15.000" }] },
      { id: "chocolate-sauce", name: "Chocolate sauce", group: "Topping", price_ngwee: 500, active: true, recipe: [{ item_id: "sauce-stock", quantity: "25.000" }] },
    ],
  };
}

function now(): string { return new Date().toISOString(); }
function id(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function seedState(): DemoState {
  const createdAt = now();
  const dayId = id("demo-day");
  const movements: Movement[] = stockSeeds.map((item) => ({
    id: id("movement"), item_id: item.id, item_name: item.name, type: "RECEIPT",
    quantity: item.quantity, unit: item.unit, reference: "DEMO-SEED", reason: "Demo opening stock",
    actor_id: user.id, created_at: createdAt,
  }));
  return {
    version: DEMO_VERSION, catalog: seedCatalog(), days: [{
      id: dayId, status: "OPEN", opened_at: createdAt, closed_at: null,
      opening_float_ngwee: 50_000, actual_cash_ngwee: null, expected_cash_ngwee: 50_000,
      variance_ngwee: null, summary: null,
    }], orders: [], checkoutPayloads: {}, checkoutOrderIds: {}, movements, cashMovements: [], counts: [], audit: [], nextOrderNumber: 1,
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function decimalToMilli(value: string): number {
  const match = value.match(/^(-)?(\d+)(?:\.(\d{1,3}))?$/);
  if (!match) throw new POSAPIError("Quantity must be a decimal with up to three places", 422);
  const result = Number(match[2]) * 1000 + Number((match[3] ?? "").padEnd(3, "0"));
  if (!Number.isSafeInteger(result)) throw new POSAPIError("Quantity is too large", 422);
  return match[1] ? -result : result;
}
function milliToDecimal(value: number): string {
  const sign = value < 0 ? "-" : "";
  const digits = String(Math.abs(value)).padStart(4, "0");
  return `${sign}${digits.slice(0, -3)}.${digits.slice(-3)}`;
}

function stockOnHand(state: DemoState, itemId: string): number {
  return state.movements.filter((movement) => movement.item_id === itemId).reduce((sum, movement) => sum + decimalToMilli(movement.quantity), 0);
}

function summaryFor(state: DemoState, dayId: string | undefined): Summary {
  const day = dayId ? state.days.find((candidate) => candidate.id === dayId) : state.days[0];
  if (dayId && !day) throw new POSAPIError("Business day not found", 404);
  if (!day) return {
    business_day_id: null, order_count: 0, gross_sales_ngwee: 0, refunds_ngwee: 0,
    net_sales_ngwee: 0, average_order_ngwee: 0,
    payment_totals: { CASH: 0, MOBILE_MONEY_MANUAL: 0, CARD_MANUAL: 0 }, opening_float_ngwee: 0,
    cash_movements_ngwee: 0, expected_cash_ngwee: 0, actual_cash_ngwee: null, variance_ngwee: null, products: [],
  };
  const orders = state.orders.filter((order) => order.business_day_id === day.id);
  const gross = orders.reduce((sum, order) => sum + order.total_ngwee, 0);
  const refunds = orders.filter((order) => order.refunded).reduce((sum, order) => sum + order.total_ngwee, 0);
  const paymentTotals = { CASH: 0, MOBILE_MONEY_MANUAL: 0, CARD_MANUAL: 0 };
  for (const order of orders) paymentTotals[order.payment.method] += order.refunded ? 0 : order.total_ngwee;
  const productMap = new Map<string, { name: string; quantity: number; total_ngwee: number }>();
  for (const order of orders) for (const line of order.lines) {
    const current = productMap.get(line.name) ?? { name: line.name, quantity: 0, total_ngwee: 0 };
    current.quantity += line.quantity; current.total_ngwee += line.total_ngwee; productMap.set(line.name, current);
  }
  const cashMovements = state.cashMovements.filter((movement) => movement.business_day_id === day.id).reduce((sum, movement) => sum + movement.amount_ngwee, 0);
  const expected = day.opening_float_ngwee + paymentTotals.CASH + cashMovements;
  return {
    business_day_id: day.id, order_count: orders.length, gross_sales_ngwee: gross, refunds_ngwee: refunds,
    net_sales_ngwee: gross - refunds, average_order_ngwee: orders.length ? Math.floor((gross - refunds) / orders.length) : 0,
    payment_totals: paymentTotals, opening_float_ngwee: day.opening_float_ngwee,
    cash_movements_ngwee: cashMovements, expected_cash_ngwee: expected,
    actual_cash_ngwee: day.actual_cash_ngwee, variance_ngwee: day.actual_cash_ngwee === null ? null : day.actual_cash_ngwee - expected,
    products: [...productMap.values()],
  };
}

export class DemoClient implements POSClient {
  private readonly storage?: Storage;
  private state: DemoState;
  private readonly orderWatchers = new Set<() => void>();

  constructor(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
    this.storage = storage;
    this.state = this.read();
  }

  private read(): DemoState {
    if (!this.storage) return this.state ?? seedState();
    const raw = this.storage?.getItem(DEMO_STORAGE_KEY);
    if (raw) try {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed.version === DEMO_VERSION) return parsed;
    } catch { /* Reset only malformed, isolated demo data. */ }
    const state = seedState();
    this.storage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  private write(state: DemoState): void {
    this.state = state;
    this.storage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  }

  private async mutate<T>(work: (state: DemoState) => T | Promise<T>): Promise<T> {
    const execute = async () => {
      const latest = this.read();
      const result = await work(latest);
      this.write(latest);
      return clone(result);
    };
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
    return locks ? locks.request("happy-cone-demo", execute) : execute();
  }

  private addAudit(state: DemoState, action: string, entity: string, entityId: string, metadata: Record<string, unknown> = {}): void {
    state.audit.unshift({ id: id("audit"), actor_id: user.id, actor_name: user.name, action, entity, entity_id: entityId, metadata, correlation_id: id("correlation"), created_at: now() });
  }

  async login(_username: string, _password: string): Promise<LoginResult> { return { token: "demo-session", user: clone(user) }; }
  async logout(): Promise<{ ok: true }> { return { ok: true }; }
  async session(): Promise<User> { return clone(user); }
  async catalog(includeInactive = false): Promise<Catalog> { this.state = this.read(); return clone({ ...this.state.catalog, products: includeInactive ? this.state.catalog.products : this.state.catalog.products.filter((product) => product.active) }); }

  watchOrders(onChange: () => void): () => void {
    this.orderWatchers.add(onChange);
    const storageListener = (event: StorageEvent) => { if (event.key === DEMO_STORAGE_KEY) onChange(); };
    if (typeof window !== "undefined") window.addEventListener("storage", storageListener);
    return () => { this.orderWatchers.delete(onChange); if (typeof window !== "undefined") window.removeEventListener("storage", storageListener); };
  }

  private emitOrders(): void { for (const watcher of this.orderWatchers) watcher(); }

  async currentDay(): Promise<Day | null> {
    this.state = this.read();
    const day = this.state.days.find((candidate) => candidate.status === "OPEN");
    if (!day) return null;
    const result = clone(day); result.expected_cash_ngwee = summaryFor(this.state, day.id).expected_cash_ngwee;
    return result;
  }

  async days(): Promise<Day[]> {
    this.state = this.read();
    return clone(this.state.days.map((day) => ({ ...day, expected_cash_ngwee: summaryFor(this.state, day.id).expected_cash_ngwee })));
  }

  openDay(openingFloatNgwee: number): Promise<Day> {
    if (!Number.isSafeInteger(openingFloatNgwee) || openingFloatNgwee < 0) return Promise.reject(new POSAPIError("Opening float must be a non-negative ngwee amount", 422));
    return this.mutate((state) => {
      if (state.days.some((day) => day.status === "OPEN")) throw new POSAPIError("A business day is already open", 409);
      const day: Day = { id: id("demo-day"), status: "OPEN", opened_at: now(), closed_at: null, opening_float_ngwee: openingFloatNgwee, actual_cash_ngwee: null, expected_cash_ngwee: openingFloatNgwee, variance_ngwee: null, summary: null };
      state.days.unshift(day); this.addAudit(state, "BUSINESS_DAY_OPENED", "business_day", day.id, { opening_float_ngwee: openingFloatNgwee }); return day;
    });
  }

  closeDay(actualCashNgwee: number): Promise<Day> {
    if (!Number.isSafeInteger(actualCashNgwee) || actualCashNgwee < 0) return Promise.reject(new POSAPIError("Actual cash must be a non-negative ngwee amount", 422));
    return this.mutate((state) => {
      const day = state.days.find((candidate) => candidate.status === "OPEN");
      if (!day) throw new POSAPIError("No business day is open", 409);
      const report = summaryFor(state, day.id);
      day.status = "CLOSED"; day.closed_at = now(); day.actual_cash_ngwee = actualCashNgwee;
      day.expected_cash_ngwee = report.expected_cash_ngwee; day.variance_ngwee = actualCashNgwee - report.expected_cash_ngwee;
      day.summary = { ...report, actual_cash_ngwee: actualCashNgwee, variance_ngwee: day.variance_ngwee };
      this.addAudit(state, "BUSINESS_DAY_CLOSED", "business_day", day.id, { actual_cash_ngwee: actualCashNgwee, variance_ngwee: day.variance_ngwee }); return day;
    });
  }

  cashMovement(amountNgwee: number, reason: string): Promise<CashMovement> {
    if (!Number.isSafeInteger(amountNgwee) || amountNgwee === 0) return Promise.reject(new POSAPIError("Cash movement must be a nonzero ngwee amount", 422));
    if (!reason.trim()) return Promise.reject(new POSAPIError("A reason is required", 422));
    return this.mutate((state) => {
      const day = state.days.find((candidate) => candidate.status === "OPEN");
      if (!day) throw new POSAPIError("No business day is open", 409);
      const movement: DemoCashMovement = { id: id("cash"), amount_ngwee: amountNgwee, reason: reason.trim(), business_day_id: day.id, created_at: now() };
      state.cashMovements.unshift(movement); this.addAudit(state, "CASH_MOVEMENT_RECORDED", "cash_movement", movement.id, { amount_ngwee: amountNgwee, reason: movement.reason });
      return { id: movement.id, amount_ngwee: movement.amount_ngwee, reason: movement.reason };
    });
  }

  private quoteFrom(state: DemoState, lines: CartLine[]): Quote {
    if (!Array.isArray(lines) || lines.length === 0) throw new POSAPIError("Add at least one item", 422);
    const priced = lines.map((line) => {
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new POSAPIError("Line quantity must be a positive whole number", 422);
      if (new Set(line.modifier_ids).size !== line.modifier_ids.length) throw new POSAPIError("A modifier cannot be selected more than once", 422);
      const product = state.catalog.products.find((candidate) => candidate.active && candidate.variants.some((variant) => variant.id === line.variant_id));
      const variant = product?.variants.find((candidate) => candidate.id === line.variant_id);
      if (!product || !variant) throw new POSAPIError("A selected product is unavailable", 422);
      const modifiers = line.modifier_ids.map((modifierId) => state.catalog.modifiers.find((candidate) => candidate.id === modifierId && candidate.active));
      if (modifiers.some((modifier) => !modifier)) throw new POSAPIError("A selected modifier is unavailable", 422);
      const validModifiers = modifiers.flatMap((modifier) => modifier ? [modifier] : []);
      if (validModifiers.filter((modifier) => modifier.group === "Serving").length !== 1) throw new POSAPIError("Choose exactly one serving option", 422);
      if (validModifiers.filter((modifier) => modifier.group === "Topping").length > 3) throw new POSAPIError("Choose no more than three toppings", 422);
      const unit = variant.price_ngwee + validModifiers.reduce((sum, modifier) => sum + modifier.price_ngwee, 0);
      return {
        variant_id: line.variant_id, name: `${product.name} · ${variant.name}`, quantity: line.quantity,
        modifier_names: validModifiers.map((modifier) => modifier.name), notes: line.notes,
        unit_price_ngwee: unit, total_ngwee: unit * line.quantity,
      };
    });
    return { lines: priced, total_ngwee: priced.reduce((sum, line) => sum + line.total_ngwee, 0) };
  }

  async quote(lines: CartLine[]): Promise<Quote> { this.state = this.read(); return clone(this.quoteFrom(this.state, lines)); }

  checkout(command: CheckoutCommand): Promise<Order> {
    return this.mutate((state) => {
      const payload = stable(command);
      const previous = state.checkoutPayloads[command.idempotency_key];
      if (previous) {
        if (previous !== payload) throw new POSAPIError("Idempotency key was already used with a different checkout payload", 409);
        const replay = state.orders.find((order) => order.id === state.checkoutOrderIds[command.idempotency_key]);
        if (!replay) throw new POSAPIError("The replayed order could not be found", 409);
        return replay;
      }
      const day = state.days.find((candidate) => candidate.status === "OPEN");
      if (!day || day.id !== command.business_day_id) throw new POSAPIError("Checkout must belong to the current open business day", 409);
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(command.idempotency_key)) throw new POSAPIError("Enter a valid idempotency key", 422);
      const quoted = this.quoteFrom(state, command.lines);
      const payment = command.payment;
      if (command.offline && payment.method !== "CASH") throw new POSAPIError("Offline checkout supports cash only", 422);
      if (payment.method === "CASH") {
        if (!Number.isSafeInteger(payment.tendered_ngwee) || (payment.tendered_ngwee ?? 0) < quoted.total_ngwee) throw new POSAPIError("Cash tendered is less than the amount due", 422);
      } else if (!payment.provider?.trim() || !payment.reference?.trim()) {
        throw new POSAPIError("Manual payments require a provider and reference", 422);
      }
      if (payment.method !== "CASH" && state.orders.some((order) => order.payment.method === payment.method && order.payment.provider === payment.provider && order.payment.reference === payment.reference)) {
        throw new POSAPIError("This external payment reference has already been recorded", 409);
      }
      const consumption = new Map<string, number>();
      for (const line of command.lines) {
        const variant = state.catalog.products.flatMap((product) => product.variants).find((candidate) => candidate.id === line.variant_id)!;
        const modifiers = line.modifier_ids.map((modifierId) => state.catalog.modifiers.find((candidate) => candidate.id === modifierId)!);
        for (const component of [...variant.recipe, ...modifiers.flatMap((modifier) => modifier.recipe)]) {
          consumption.set(component.item_id, (consumption.get(component.item_id) ?? 0) + decimalToMilli(component.quantity) * line.quantity);
        }
      }
      for (const [itemId, quantity] of consumption) {
        if (stockOnHand(state, itemId) < quantity) throw new POSAPIError("Insufficient stock for this order", 409);
      }
      const orderId = id("demo-order");
      const order: Order = {
        id: orderId, number: `A${String(state.nextOrderNumber++).padStart(3, "0")}`, business_day_id: day.id,
        status: "NEW", created_at: now(), lines: quoted.lines, total_ngwee: quoted.total_ngwee,
        payment: { method: payment.method, status: "CONFIRMED", amount_ngwee: quoted.total_ngwee,
          tendered_ngwee: payment.method === "CASH" ? payment.tendered_ngwee ?? null : null,
          change_ngwee: payment.method === "CASH" ? (payment.tendered_ngwee ?? 0) - quoted.total_ngwee : null,
          provider: payment.provider, reference: payment.reference }, refunded: false, refund_reason: null, offline: command.offline,
      };
      state.orders.push(order); state.checkoutPayloads[command.idempotency_key] = payload; state.checkoutOrderIds[command.idempotency_key] = order.id;
      for (const [itemId, quantity] of consumption) {
        const seed = stockSeeds.find((item) => item.id === itemId)!;
        state.movements.unshift({ id: id("movement"), item_id: itemId, item_name: seed.name, type: "SALE_CONSUMPTION",
          quantity: milliToDecimal(-quantity), unit: seed.unit, reference: order.id,
          reason: `Order ${order.number}`, actor_id: user.id, created_at: order.created_at });
      }
      this.addAudit(state, "ORDER_CHECKED_OUT", "order", order.id, { number: order.number, total_ngwee: order.total_ngwee, offline: order.offline });
      return order;
    }).then((order) => { this.emitOrders(); return order; });
  }

  async orders(active?: boolean): Promise<Order[]> {
    this.state = this.read();
    const selected = active ? this.state.orders.filter((order) => order.status !== "SERVED" && !order.refunded) : this.state.orders;
    return clone(active ? selected : [...selected].reverse().slice(0, 200));
  }

  transition(order: Order, status: OrderStatus): Promise<Order> {
    return this.mutate((state) => {
      const stored = state.orders.find((candidate) => candidate.id === order.id);
      if (!stored || stored.status !== order.status) throw new POSAPIError("Order status changed; refresh and try again", 409);
      const next: Partial<Record<OrderStatus, OrderStatus>> = { NEW: "PREPARING", PREPARING: "READY", READY: "SERVED" };
      if (next[stored.status] !== status) throw new POSAPIError("Invalid order status transition", 409);
      stored.status = status; this.addAudit(state, "ORDER_STATUS_CHANGED", "order", stored.id, { status }); return stored;
    }).then((updated) => { this.emitOrders(); return updated; });
  }

  refund(order: Order, reason: string): Promise<Order> {
    return this.mutate((state) => {
      const stored = state.orders.find((candidate) => candidate.id === order.id);
      const day = state.days.find((candidate) => candidate.status === "OPEN");
      if (!stored) throw new POSAPIError("Order not found", 404);
      if (stored.refunded) throw new POSAPIError("Order has already been refunded", 409);
      if (!day || day.id !== stored.business_day_id) throw new POSAPIError("Refunds are allowed only during the original open business day", 409);
      if (!reason.trim()) throw new POSAPIError("A refund reason is required", 422);
      stored.refunded = true; stored.refund_reason = reason.trim(); stored.payment.status = "REFUNDED";
      this.addAudit(state, "ORDER_REFUNDED", "order", stored.id, { reason: stored.refund_reason, total_ngwee: stored.total_ngwee }); return stored;
    }).then((refunded) => { this.emitOrders(); return refunded; });
  }

  async inventory(): Promise<InventoryItem[]> {
    this.state = this.read();
    return clone(stockSeeds.map((item) => ({ id: item.id, name: item.name, unit: item.unit, on_hand: milliToDecimal(stockOnHand(this.state, item.id)), low_stock_threshold: item.low })));
  }

  async movements(itemId?: string): Promise<Movement[]> {
    this.state = this.read();
    return clone(this.state.movements.filter((movement) => !itemId || movement.item_id === itemId).slice(0, 500));
  }

  movement(input: MovementInput): Promise<Movement> {
    return this.mutate((state) => {
      const seed = stockSeeds.find((item) => item.id === input.item_id);
      if (!seed) throw new POSAPIError("Inventory item not found", 404);
      const quantity = decimalToMilli(input.quantity);
      if (quantity <= 0) throw new POSAPIError("Movement quantity must be positive", 422);
      if (!input.reason.trim()) throw new POSAPIError("A movement reason is required", 422);
      const positive: MovementType[] = ["RECEIPT", "ADJUSTMENT_IN", "RETURN_IN"];
      const signed = positive.includes(input.type) ? quantity : -quantity;
      if (signed < 0 && stockOnHand(state, input.item_id) + signed < 0) throw new POSAPIError("Insufficient stock; review inventory before retrying", 409);
      const movement: Movement = { id: id("movement"), item_id: seed.id, item_name: seed.name, type: input.type,
        quantity: milliToDecimal(signed), unit: seed.unit, reference: null, reason: input.reason.trim(), actor_id: user.id, created_at: now() };
      state.movements.unshift(movement); this.addAudit(state, "INVENTORY_MOVEMENT_RECORDED", "inventory_movement", movement.id, { item_id: seed.id, type: input.type, quantity: movement.quantity }); return movement;
    });
  }

  count(input: CountInput): Promise<StockCount> {
    return this.mutate((state) => {
      if (!stockSeeds.some((item) => item.id === input.item_id)) throw new POSAPIError("Inventory item not found", 404);
      const counted = decimalToMilli(input.counted_quantity);
      if (counted < 0) throw new POSAPIError("Counted quantity cannot be negative", 422);
      if (!input.reason.trim()) throw new POSAPIError("A count reason is required", 422);
      const expected = stockOnHand(state, input.item_id);
      const count: StockCount = { id: id("count"), item_id: input.item_id, expected_quantity: milliToDecimal(expected), counted_quantity: milliToDecimal(counted), variance: milliToDecimal(counted - expected), created_at: now() };
      state.counts.unshift(count); this.addAudit(state, "STOCK_COUNT_RECORDED", "stock_count", count.id, { item_id: input.item_id, variance: count.variance, reason: input.reason.trim() }); return count;
    });
  }

  async counts(): Promise<StockCount[]> { this.state = this.read(); return clone(this.state.counts); }
  async report(dayId?: string): Promise<Summary> { this.state = this.read(); return clone(summaryFor(this.state, dayId)); }
  async audit(): Promise<AuditEvent[]> { this.state = this.read(); return clone(this.state.audit.slice(0, 200)); }
  async changePassword(): Promise<{ ok: true; other_sessions_revoked: number }> { return { ok: true, other_sessions_revoked: 0 }; }
  async users(): Promise<User[]> { return [clone(user)]; }
  async createUser(): Promise<User> { throw new POSAPIError("Staff accounts are managed at the live counter", 422); }
  async updateUser(): Promise<User> { throw new POSAPIError("Staff accounts are managed at the live counter", 422); }
  async resetUserPassword(): Promise<{ ok: true; sessions_revoked: number }> { throw new POSAPIError("Staff accounts are managed at the live counter", 422); }
  async revokeUserSessions(): Promise<{ revoked: number }> { throw new POSAPIError("Staff accounts are managed at the live counter", 422); }

  setProductActive(productId: string, active: boolean): Promise<ProductActiveResult> {
    return this.mutate((state) => {
      const product = state.catalog.products.find((candidate) => candidate.id === productId);
      if (!product) throw new POSAPIError("Product not found", 404);
      product.active = active; this.addAudit(state, "PRODUCT_AVAILABILITY_CHANGED", "product", product.id, { active }); return { id: product.id, active };
    });
  }
}
