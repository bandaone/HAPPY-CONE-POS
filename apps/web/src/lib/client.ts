import type {
  AuditEvent,
  CartLine,
  CashMovement,
  Catalog,
  CatalogItemCreate,
  CatalogItemUpdate,
  Category,
  CategoryCreateInput,
  CategoryUpdateInput,
  CheckoutCommand,
  CountInput,
  Day,
  InventoryItem,
  LoginResult,
  Movement,
  MovementInput,
  Modifier,
  ModifierGroup,
  ModifierGroupCreateInput,
  ModifierGroupUpdateInput,
  Order,
  OrderStatus,
  POSClient,
  Product,
  ProductActiveResult,
  ProductCreateInput,
  ProductUpdateInput,
  Quote,
  StockCount,
  Summary,
  User,
  UserCreateInput,
  UserUpdateInput,
  Variant,
} from "./types";

export * from "./types";

export interface ParseMoneyOptions {
  allowNegative?: boolean;
}

export function money(valueNgwee: number): string {
  if (!Number.isSafeInteger(valueNgwee)) throw new Error("Money must be an integer number of ngwee");
  const sign = valueNgwee < 0 ? "-" : "";
  const digits = String(Math.abs(valueNgwee)).padStart(3, "0");
  return `${sign}K${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function parseMoney(value: string, options: ParseMoneyOptions | boolean = {}): number {
  const allowNegative = typeof options === "boolean" ? options : options.allowNegative === true;
  const match = value.trim().match(/^(-)?(?:K\s*)?((?:\d{1,3}(?:,\d{3})*)|\d+)(?:\.(\d{1,2}))?$/i);
  if (!match) throw new Error("Enter a valid kwacha amount with no more than two decimal places");
  if (match[1] && !allowNegative) throw new Error("Amount cannot be negative");
  const whole = match[2].replaceAll(",", "").replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").padEnd(2, "0");
  const ngweeDigits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  if (ngweeDigits.length > 16) throw new Error("Amount is too large");
  const amount = Number(ngweeDigits);
  if (!Number.isSafeInteger(amount)) throw new Error("Amount is too large");
  return match[1] ? -amount : amount;
}

export class POSAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "POSAPIError";
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export class ApiClient implements POSClient {
  private token?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(token?: string, options: ApiClientOptions = {}) {
    this.token = token;
    this.baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers, signal: controller.signal });
      const contentType = response.headers.get("content-type") ?? "";
      const body: unknown = contentType.includes("application/json")
        ? await response.json().catch(() => null)
        : await response.text().catch(() => "");
      if (!response.ok) {
        const detail = body && typeof body === "object" && "detail" in body && typeof body.detail === "string"
          ? body.detail
          : `Request failed (${response.status})`;
        throw new POSAPIError(detail, response.status);
      }
      return body as T;
    } catch (error) {
      if (error instanceof POSAPIError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new POSAPIError("The request timed out. Check the connection and try again.", 0);
      }
      throw new POSAPIError("The service could not be reached. Check the connection and try again.", 0);
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const result = await this.request<LoginResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    this.token = result.token;
    return result;
  }

  async logout(): Promise<{ ok: true }> {
    const result = await this.request<{ ok: true }>("/auth/logout", { method: "POST" });
    this.token = undefined;
    return result;
  }

  session = () => this.request<User>("/session");
  changePassword = (currentPassword: string, newPassword: string) => this.request<{ ok: true; other_sessions_revoked: number }>("/auth/change-password", {
    method: "POST", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  users = () => this.request<User[]>("/users");
  createUser = (input: UserCreateInput) => this.request<User>("/users", {
    method: "POST", body: JSON.stringify(input),
  });
  updateUser = (id: string, input: UserUpdateInput) => this.request<User>(`/users/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify(input),
  });
  resetUserPassword = (id: string, password: string) => this.request<{ ok: true; sessions_revoked: number }>(`/users/${encodeURIComponent(id)}/reset-password`, {
    method: "POST", body: JSON.stringify({ password }),
  });
  revokeUserSessions = (id: string) => this.request<{ revoked: number }>(`/users/${encodeURIComponent(id)}/revoke-sessions`, {
    method: "POST",
  });
  catalog = (includeInactive?: boolean) => this.request<Catalog>(`/catalog${includeInactive ? "?include_inactive=true" : ""}`);
  createCategory = (input: CategoryCreateInput) => this.request<Category>("/catalog/categories", {
    method: "POST", body: JSON.stringify(input),
  });
  updateCategory = (id: string, input: CategoryUpdateInput) => this.request<Category>(`/catalog/categories/${encodeURIComponent(id)}`, {
    method: "PUT", body: JSON.stringify(input),
  });
  createProduct = (input: ProductCreateInput) => this.request<Product>("/catalog/products", {
    method: "POST", body: JSON.stringify(input),
  });
  updateProduct = (id: string, input: ProductUpdateInput) => this.request<Product>(`/catalog/products/${encodeURIComponent(id)}`, {
    method: "PUT", body: JSON.stringify(input),
  });
  createVariant = (productId: string, input: CatalogItemCreate) => this.request<Variant>(`/catalog/products/${encodeURIComponent(productId)}/variants`, {
    method: "POST", body: JSON.stringify(input),
  });
  updateVariant = (id: string, input: CatalogItemUpdate) => this.request<Variant>(`/catalog/variants/${encodeURIComponent(id)}`, {
    method: "PUT", body: JSON.stringify(input),
  });
  createModifierGroup = (input: ModifierGroupCreateInput) => this.request<ModifierGroup>("/catalog/modifier-groups", {
    method: "POST", body: JSON.stringify(input),
  });
  updateModifierGroup = (id: string, input: ModifierGroupUpdateInput) => this.request<ModifierGroup>(`/catalog/modifier-groups/${encodeURIComponent(id)}`, {
    method: "PUT", body: JSON.stringify(input),
  });
  createModifier = (groupId: string, input: CatalogItemCreate) => this.request<Modifier>(`/catalog/modifier-groups/${encodeURIComponent(groupId)}/modifiers`, {
    method: "POST", body: JSON.stringify(input),
  });
  updateModifier = (id: string, input: CatalogItemUpdate) => this.request<Modifier>(`/catalog/modifiers/${encodeURIComponent(id)}`, {
    method: "PUT", body: JSON.stringify(input),
  });
  currentDay = () => this.request<Day | null>("/business-day/current");
  days = () => this.request<Day[]>("/business-day");
  openDay = (openingFloatNgwee: number) => this.request<Day>("/business-day/open", {
    method: "POST", body: JSON.stringify({ opening_float_ngwee: openingFloatNgwee }),
  });
  closeDay = (actualCashNgwee: number) => this.request<Day>("/business-day/close", {
    method: "POST", body: JSON.stringify({ actual_cash_ngwee: actualCashNgwee }),
  });
  cashMovement = (amountNgwee: number, reason: string) => this.request<CashMovement>("/business-day/cash-movements", {
    method: "POST", body: JSON.stringify({ amount_ngwee: amountNgwee, reason }),
  });
  quote = (lines: CartLine[]) => this.request<Quote>("/orders/quote", {
    method: "POST", body: JSON.stringify({ lines }),
  });
  checkout = (command: CheckoutCommand) => this.request<Order>("/orders", {
    method: "POST", body: JSON.stringify(command),
  });
  orders = (active?: boolean) => this.request<Order[]>(`/orders${active ? "?active=true" : ""}`);
  transition = (order: Order, status: OrderStatus) => this.request<Order>(`/orders/${encodeURIComponent(order.id)}/status`, {
    method: "POST", body: JSON.stringify({ status, expected_status: order.status }),
  });
  refund = (order: Order, reason: string) => this.request<Order>(`/orders/${encodeURIComponent(order.id)}/refund`, {
    method: "POST", body: JSON.stringify({ reason }),
  });
  inventory = () => this.request<InventoryItem[]>("/inventory");
  movements = (itemId?: string) => this.request<Movement[]>(`/inventory/movements${itemId ? `?item_id=${encodeURIComponent(itemId)}` : ""}`);
  movement = (input: MovementInput) => this.request<Movement>("/inventory/movements", {
    method: "POST", body: JSON.stringify(input),
  });
  count = (input: CountInput) => this.request<StockCount>("/inventory/counts", {
    method: "POST", body: JSON.stringify(input),
  });
  counts = () => this.request<StockCount[]>("/inventory/counts");
  report = (dayId?: string) => this.request<Summary>(`/reports/daily${dayId ? `?business_day_id=${encodeURIComponent(dayId)}` : ""}`);
  audit = () => this.request<AuditEvent[]>("/audit");
  setProductActive = (id: string, active: boolean) => this.request<ProductActiveResult>(`/catalog/products/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify({ active }),
  });

  watchOrders(onChange: () => void): () => void {
    let stopped = false;
    let controller: AbortController | null = null;
    let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let reconnectDelay = 1_000;
    const schedule = () => {
      if (stopped || reconnectTimer) return;
      reconnectTimer = globalThis.setTimeout(() => { reconnectTimer = null; void connect(); }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 15_000);
    };
    const connect = async () => {
      if (stopped) return;
      controller = new AbortController();
      const headers = new Headers({ Accept: "text/event-stream" });
      if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
      try {
        const response = await fetch(`${this.baseUrl}/events`, { headers, signal: controller.signal });
        if (!response.ok || !response.body) throw new Error("Order event stream unavailable");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true }).replaceAll("\r\n", "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const event = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
            const hasData = frame.split("\n").some((line) => line.startsWith("data:"));
            if (hasData && (!event || event === "orders")) { reconnectDelay = 1_000; onChange(); }
            boundary = buffer.indexOf("\n\n");
          }
        }
        schedule();
      } catch (error) {
        if (!(stopped && error instanceof DOMException && error.name === "AbortError")) schedule();
      }
    };
    void connect();
    return () => {
      stopped = true;
      controller?.abort();
      if (reconnectTimer) globalThis.clearTimeout(reconnectTimer);
    };
  }
}
