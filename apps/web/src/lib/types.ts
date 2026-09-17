export type Role = "CASHIER" | "SERVER" | "MANAGER" | "OWNER_ADMIN";

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: boolean;
}

export interface UserCreateInput {
  username: string;
  name: string;
  role: Role;
  password: string;
}

export interface UserUpdateInput {
  name: string;
  role: Role;
  active: boolean;
}

export interface StandProfile {
  business_name: string;
  stand_name: string;
  location: string;
  currency_name: string;
  currency_code: string;
  currency_symbol: string;
  timezone: string;
  payment_guidance: string;
  ticket_guidance: string;
  receipt_footer: string;
  activity_guidance: string;
  guide_workflow: string;
  guide_controls: string;
  guide_offline: string;
  guide_printing: string;
}

export interface RecipeComponent {
  item_id: string;
  quantity: string;
}

export interface Category { id: string; name: string }
export interface CategoryCreateInput extends Category {}
export interface CategoryUpdateInput { name: string }

export interface Variant {
  id: string;
  product_id: string;
  name: string;
  price_ngwee: number;
  active: boolean;
  recipe: RecipeComponent[];
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  category: string;
  description: string;
  color: string;
  active: boolean;
  variants: Variant[];
}

export interface ProductUpdateInput {
  category_id: string;
  name: string;
  description: string;
  color: string;
  active: boolean;
}

export interface ProductCreateInput extends ProductUpdateInput { id: string }

export interface CatalogItemUpdate {
  name: string;
  price_ngwee: number;
  active: boolean;
  recipe: RecipeComponent[];
}

export interface CatalogItemCreate extends CatalogItemUpdate { id: string }

export interface ModifierGroup {
  id: string;
  name: string;
  minimum: number;
  maximum: number;
}

export interface ModifierGroupCreateInput extends ModifierGroup {}
export interface ModifierGroupUpdateInput { name: string; minimum: number; maximum: number }

export interface Modifier {
  id: string;
  group_id: string;
  name: string;
  group: string;
  price_ngwee: number;
  active: boolean;
  recipe: RecipeComponent[];
}

export interface Catalog {
  categories: Category[];
  products: Product[];
  modifier_groups: ModifierGroup[];
  modifiers: Modifier[];
}

export interface CartLine {
  variant_id: string;
  quantity: number;
  modifier_ids: string[];
  notes: string;
}

export interface PricedLine {
  variant_id: string;
  name: string;
  quantity: number;
  unit_price_ngwee: number;
  total_ngwee: number;
  modifier_names: string[];
  notes: string;
}

export interface Quote {
  lines: PricedLine[];
  total_ngwee: number;
}

export type PaymentMethod = "CASH" | "MOBILE_MONEY_MANUAL" | "CARD_MANUAL";
export type PaymentStatus = "CONFIRMED" | "REFUNDED";
export type OrderStatus = "NEW" | "PREPARING" | "READY" | "SERVED";

export interface CheckoutPayment {
  method: PaymentMethod;
  tendered_ngwee?: number;
  provider: string | null;
  reference: string | null;
}

export interface CheckoutCommand {
  idempotency_key: string;
  business_day_id: string;
  lines: CartLine[];
  payment: CheckoutPayment;
  offline: boolean;
}

export interface OrderPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  amount_ngwee: number;
  tendered_ngwee: number | null;
  change_ngwee: number | null;
  provider: string | null;
  reference: string | null;
}

export interface Order {
  id: string;
  number: string;
  business_day_id: string;
  status: OrderStatus;
  created_at: string;
  cashier_name: string;
  lines: PricedLine[];
  total_ngwee: number;
  payment: OrderPayment;
  refunded: boolean;
  refund_reason: string | null;
  offline: boolean;
}

export interface ProductSummary {
  name: string;
  quantity: number;
  total_ngwee: number;
}

export interface PaymentTotals {
  CASH: number;
  MOBILE_MONEY_MANUAL: number;
  CARD_MANUAL: number;
}

export interface Summary {
  business_day_id: string | null;
  order_count: number;
  gross_sales_ngwee: number;
  refunds_ngwee: number;
  net_sales_ngwee: number;
  average_order_ngwee: number;
  payment_totals: PaymentTotals;
  opening_float_ngwee: number;
  cash_movements_ngwee: number;
  expected_cash_ngwee: number;
  actual_cash_ngwee: number | null;
  variance_ngwee: number | null;
  products: ProductSummary[];
}

export interface Day {
  id: string;
  status: "OPEN" | "CLOSED";
  opened_at: string;
  closed_at: string | null;
  opening_float_ngwee: number;
  actual_cash_ngwee: number | null;
  expected_cash_ngwee: number;
  variance_ngwee: number | null;
  summary: Summary | null;
}

export interface CashMovement {
  id: string;
  amount_ngwee: number;
  reason: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  on_hand: string;
  low_stock_threshold: string;
}

export type MovementType =
  | "RECEIPT"
  | "SALE_CONSUMPTION"
  | "WASTE"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "RETURN_IN"
  | "RETURN_OUT"
  | "STAFF_USE";

export interface Movement {
  id: string;
  item_id: string;
  item_name: string;
  type: MovementType;
  quantity: string;
  unit: string;
  reference: string | null;
  reason: string;
  actor_id: string;
  created_at: string;
}

export interface MovementInput {
  item_id: string;
  type: Exclude<MovementType, "SALE_CONSUMPTION">;
  quantity: string;
  reason: string;
}

export interface StockCount {
  id: string;
  item_id: string;
  expected_quantity: string;
  counted_quantity: string;
  variance: string;
  created_at: string;
}

export interface CountInput {
  item_id: string;
  counted_quantity: string;
  reason: string;
}

export interface AuditEvent {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  entity: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  correlation_id: string;
  created_at: string;
}

export interface LoginResult {
  token: string;
  user: User;
}

export interface ProductActiveResult {
  id: string;
  active: boolean;
}

export interface POSClient {
  login(username: string, password: string): Promise<LoginResult>;
  logout(): Promise<{ ok: true }>;
  session(): Promise<User>;
  standSettings(): Promise<StandProfile>;
  updateStandSettings(input: StandProfile): Promise<StandProfile>;
  changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true; other_sessions_revoked: number }>;
  users(): Promise<User[]>;
  createUser(input: UserCreateInput): Promise<User>;
  updateUser(id: string, input: UserUpdateInput): Promise<User>;
  resetUserPassword(id: string, password: string): Promise<{ ok: true; sessions_revoked: number }>;
  revokeUserSessions(id: string): Promise<{ revoked: number }>;
  catalog(includeInactive?: boolean): Promise<Catalog>;
  createCategory(input: CategoryCreateInput): Promise<Category>;
  updateCategory(id: string, input: CategoryUpdateInput): Promise<Category>;
  createProduct(input: ProductCreateInput): Promise<Product>;
  updateProduct(id: string, input: ProductUpdateInput): Promise<Product>;
  createVariant(productId: string, input: CatalogItemCreate): Promise<Variant>;
  updateVariant(id: string, input: CatalogItemUpdate): Promise<Variant>;
  createModifierGroup(input: ModifierGroupCreateInput): Promise<ModifierGroup>;
  updateModifierGroup(id: string, input: ModifierGroupUpdateInput): Promise<ModifierGroup>;
  createModifier(groupId: string, input: CatalogItemCreate): Promise<Modifier>;
  updateModifier(id: string, input: CatalogItemUpdate): Promise<Modifier>;
  currentDay(): Promise<Day | null>;
  days(): Promise<Day[]>;
  openDay(openingFloatNgwee: number): Promise<Day>;
  closeDay(actualCashNgwee: number): Promise<Day>;
  cashMovement(amountNgwee: number, reason: string): Promise<CashMovement>;
  quote(lines: CartLine[]): Promise<Quote>;
  checkout(command: CheckoutCommand): Promise<Order>;
  orders(active?: boolean): Promise<Order[]>;
  transition(order: Order, status: OrderStatus): Promise<Order>;
  refund(order: Order, reason: string): Promise<Order>;
  inventory(): Promise<InventoryItem[]>;
  movements(itemId?: string): Promise<Movement[]>;
  movement(input: MovementInput): Promise<Movement>;
  count(input: CountInput): Promise<StockCount>;
  counts(): Promise<StockCount[]>;
  report(dayId?: string): Promise<Summary>;
  audit(): Promise<AuditEvent[]>;
  setProductActive(id: string, active: boolean): Promise<ProductActiveResult>;
  watchOrders?(onChange: () => void): () => void;
}
