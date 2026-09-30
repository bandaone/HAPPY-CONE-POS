import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  Banknote,
  Coffee,
  CreditCard,
  IceCreamBowl,
  IceCreamCone,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Trash2,
  Utensils,
  WifiOff,
} from "lucide-react";
import {
  currencySymbol,
  money,
  moneyInput,
  parseMoney,
  POSAPIError,
} from "../lib/client";
import type {
  CartLine,
  Catalog,
  CheckoutCommand,
  Day,
  PaymentMethod,
  POSClient,
  Product,
  Quote,
  StandProfile,
} from "../lib/types";
import {
  Badge,
  BrandLogo,
  ErrorMessage,
  Modal,
  SubmitButton,
  timeOf,
  dateOf,
} from "../components/ui";
import { createIdempotencyKey } from "../lib/ids";
import { ProductCustomizer } from "./ProductCustomizer";

function summarizeModifiers(names: string[]) {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) =>
    count > 1 ? `${name} ×${count}` : name,
  );
}

export function estimate(lines: CartLine[], catalog: Catalog): Quote {
  return {
    lines: lines.map((line) => {
      const product = catalog.products.find((p) =>
        p.variants.some((v) => v.id === line.variant_id),
      );
      const variant = product?.variants.find((v) => v.id === line.variant_id);
      const modifiers = line.modifier_ids
        .map((id) => catalog.modifiers.find((m) => m.id === id))
        .filter((m) => !!m);
      const price =
        (variant?.price_ngwee ?? 0) +
        modifiers.reduce((sum, item) => sum + item.price_ngwee, 0);
      return {
        ...line,
        name: `${variant?.name ?? ""} ${product?.name ?? "Unavailable item"}`,
        unit_price_ngwee: price,
        total_ngwee: price * line.quantity,
        modifier_names: summarizeModifiers(modifiers.map((m) => m.name)),
      };
    }),
    total_ngwee: lines.reduce((sum, line) => {
      const variant = catalog.products
        .flatMap((p) => p.variants)
        .find((v) => v.id === line.variant_id);
      return (
        sum +
        ((variant?.price_ngwee ?? 0) +
          line.modifier_ids.reduce(
            (n, id) =>
              n +
              (catalog.modifiers.find((m) => m.id === id)?.price_ngwee ?? 0),
            0,
          )) *
          line.quantity
      );
    }, 0),
  };
}
const palettes = [
  ["#f0e5ce", "#917b53"],
  ["#e2cdc1", "#7b5544"],
  ["#f0dcd7", "#9a5a58"],
  ["#eee0c7", "#9d7a4b"],
  ["#e0e6cf", "#647a4e"],
  ["#e9e3d9", "#746456"],
  ["#e7dce6", "#866581"],
  ["#dfe8e0", "#607e6a"],
  ["#e9dac9", "#8c694a"],
];
export function Pos({
  catalog,
  cart,
  setCart,
  day,
  locked,
  onPay,
  onOpenDay,
}: {
  catalog: Catalog;
  cart: CartLine[];
  setCart: (lines: CartLine[]) => void;
  day: Day | null;
  locked: boolean;
  onPay: () => void;
  onOpenDay: () => void;
}) {
  const [category, setCategory] = useState("All items");
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const sellable = catalog.products.filter(
    (p) => p.active && p.variants.some((v) => v.active),
  );
  const categories = ["All items", ...new Set(sellable.map((p) => p.category))];
  const products = sellable.filter(
    (p) =>
      (category === "All items" || p.category === category) &&
      `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const quote = estimate(cart, catalog);
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        ) &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  function add(line: CartLine) {
    const index = cart.findIndex(
      (item) =>
        item.variant_id === line.variant_id &&
        JSON.stringify(item.modifier_ids.slice().sort()) ===
          JSON.stringify(line.modifier_ids.slice().sort()) &&
        item.notes === line.notes,
    );
    if (index < 0) setCart([...cart, line]);
    else
      setCart(
        cart.map((item, i) =>
          i === index
            ? { ...item, quantity: item.quantity + line.quantity }
            : item,
        ),
      );
    setProduct(null);
  }
  function quantity(index: number, delta: number) {
    setCart(
      cart
        .map((line, i) =>
          i === index ? { ...line, quantity: line.quantity + delta } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">The counter</span>
          <h1>A little scoop of happy.</h1>
          <p>Good things start here. Let’s make a sale.</p>
        </div>
        <div className="heading-aside">
          <Badge tone={day ? "green" : "orange"}>
            {day ? "Business day open" : "Business day closed"}
          </Badge>
        </div>
      </div>
      {locked && (
        <div className="notice">
          <ShieldCheck size={17} />
          <span>
            A payment is waiting for a confirmed result. Recover it below before
            starting a new sale. The original payment details will be reused.
          </span>
        </div>
      )}
      <div className="pos-layout">
        <section className="menu-panel" aria-label="Product menu">
          <div className="menu-tools">
            <label className="search-box">
              <Search size={17} />
              <input
                ref={search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a flavour, shake or treat…"
                aria-label="Search menu"
              />
              <kbd className="key-hint">/</kbd>
            </label>
          </div>
          <div className="category-tabs" aria-label="Product categories">
            {categories.map((c) => (
              <button
                key={c}
                className={`category-tab ${category === c ? "active" : ""}`}
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
              >
                {c}
                <span>
                  {c === "All items"
                    ? catalog.products.length
                    : catalog.products.filter((p) => p.category === c).length}
                </span>
              </button>
            ))}
          </div>
          <div className="section-label">
            <h2>
              {category === "All items" ? "Made for a happy day" : category}
            </h2>
            <span>{products.length} items</span>
          </div>
          <div className="product-grid">
            {products.map((p) => {
              const index = catalog.products.indexOf(p);
              const color = palettes[index % palettes.length];
              const Icon =
                p.category.toLowerCase().includes("shake") ||
                p.category.toLowerCase().includes("drink")
                  ? Coffee
                  : p.category.toLowerCase().includes("sundae")
                    ? IceCreamBowl
                    : IceCreamCone;
              const activeVariants = p.variants.filter((v) => v.active);
              const directAdd =
                activeVariants.length === 1 && p.choice_sets.length === 0;
              return (
                <button
                  className="product-card"
                  key={p.id}
                  disabled={locked}
                  onClick={() =>
                    directAdd
                      ? add({
                          variant_id: activeVariants[0].id,
                          quantity: 1,
                          modifier_ids: [],
                          notes: "",
                        })
                      : setProduct(p)
                  }
                  aria-label={`${directAdd ? "Add" : "Customize"} ${p.name}`}
                >
                  <div
                    className="product-visual"
                    style={
                      {
                        "--flavor": color[0],
                        "--flavor-ink": color[1],
                      } as CSSProperties
                    }
                  >
                    <span className="product-sequence">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <Icon aria-hidden="true" />
                    <span className="product-tag">
                      {p.category === "Scoops"
                        ? "Small scoop. Big smile."
                        : p.category}
                    </span>
                  </div>
                  <div className="product-body">
                    <h3>{p.name}</h3>
                    <p>{p.description || "Freshly made, your way"}</p>
                    <div className="product-price">
                      <span>
                        <small>from </small>
                        {money(
                          Math.min(...p.variants.map((v) => v.price_ngwee)),
                        )}
                      </span>
                      <span className="product-add">
                        <Plus size={15} />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {!products.length && (
            <div className="empty-state">
              <h3>No treats found</h3>
              <p>Try a different search or category.</p>
            </div>
          )}
          <div className="menu-note">
            <Utensils size={13} />
            <span>
              Choose your scoop, serving and a little something extra.
            </span>
          </div>
        </section>
        <aside
          className="order-panel"
          id="current-order"
          aria-label="Current sale"
        >
          <header className="order-head">
            <div>
              <h2>
                Current sale <span className="muted">· {count}</span>
              </h2>
              <p>
                {cart.length
                  ? "One happy customer, coming up."
                  : "Ready for something good."}
              </p>
            </div>
            <ReceiptText size={20} className="muted" />
          </header>
          <div className="order-mode">
            <ShoppingBag size={14} />
            Counter sale
          </div>
          <div className="order-lines" aria-live="polite">
            {!cart.length ? (
              <div className="order-empty">
                <div className="empty-icon">
                  <ShoppingBag size={24} strokeWidth={1.3} />
                </div>
                <h3>A fresh start</h3>
                <p>Pick something from the menu to start the sale.</p>
              </div>
            ) : (
              quote.lines.map((line, index) => (
                <div className="order-line" key={`${index}-${line.variant_id}`}>
                  <div className="line-title">
                    <strong>{line.name}</strong>
                    <span>{money(line.total_ngwee)}</span>
                  </div>
                  <p className="line-detail">
                    {line.modifier_names.join(" · ")}
                    {line.notes && (
                      <>
                        <br />
                        Note: {line.notes}
                      </>
                    )}
                  </p>
                  <div className="line-controls">
                    <div className="quantity-control">
                      <button
                        disabled={locked}
                        onClick={() => quantity(index, -1)}
                        aria-label={`Decrease ${line.name}`}
                      >
                        <Minus size={13} />
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        disabled={locked || line.quantity >= 99}
                        onClick={() => quantity(index, 1)}
                        aria-label={`Increase ${line.name}`}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    <button
                      className="icon-button"
                      disabled={locked}
                      onClick={() =>
                        setCart(cart.filter((_, i) => i !== index))
                      }
                      aria-label={`Remove ${line.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <footer className="order-footer">
            <div className="total-row">
              <span>
                Subtotal ({count} {count === 1 ? "item" : "items"})
              </span>
              <span>{money(quote.total_ngwee)}</span>
            </div>
            <div className="total-row">
              <span>Prices as displayed</span>
              <span>No extra charges</span>
            </div>
            <div className="total-row grand-total">
              <span>Total</span>
              <strong>{money(quote.total_ngwee)}</strong>
            </div>
            <button
              className="button primary checkout-button"
              onClick={day || locked ? onPay : onOpenDay}
              disabled={!locked && day !== null && !cart.length}
            >
              <span>
                {locked
                  ? "Recover saved payment"
                  : day
                    ? "Take payment"
                    : "Open business day"}
              </span>
              <ArrowRight size={18} />
            </button>
            <p className="order-footnote">
              <ShieldCheck size={11} />
              Sale saved before the receipt is printed
            </p>
          </footer>
        </aside>
      </div>
      {cart.length > 0 && (
        <a className="button dark mobile-cart-link" href="#current-order">
          <ShoppingBag size={17} />
          {count} items · {money(quote.total_ngwee)}
          <ArrowRight size={15} />
        </a>
      )}
      {product && (
        <ProductCustomizer
          product={product}
          catalog={catalog}
          onClose={() => setProduct(null)}
          onAdd={add}
        />
      )}
    </>
  );
}
export function Payment({
  client,
  cart,
  catalog,
  day,
  attempt,
  offline,
  onClose,
  onSubmit,
}: {
  client: POSClient;
  cart: CartLine[];
  catalog: Catalog;
  day: Day | null;
  attempt: CheckoutCommand | null;
  offline: boolean;
  onClose: () => void;
  onSubmit: (command: CheckoutCommand) => Promise<void>;
}) {
  const [quote, setQuote] = useState<Quote | null>(
    attempt || offline ? estimate(attempt?.lines ?? cart, catalog) : null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(
    attempt?.payment.method ?? "CASH",
  );
  const [cash, setCash] = useState(
    attempt?.payment.tendered_ngwee != null
      ? moneyInput(attempt.payment.tendered_ngwee)
      : "",
  );
  const key = useRef(attempt?.idempotency_key ?? createIdempotencyKey());
  const attempted = useRef<CheckoutCommand | null>(attempt);

  useEffect(() => {
    let current = true;
    if (!offline && !attempt) {
      client
        .quote(cart)
        .then((nextQuote) => {
          if (current) setQuote(nextQuote);
        })
        .catch((cause) => {
          if (current) setError(cause.message);
        });
    }
    return () => {
      current = false;
    };
  }, [client, cart, offline, attempt]);

  let tendered = 0;
  try {
    tendered = parseMoney(cash || "0");
  } catch {
    /* The cash form reports invalid amounts when submitted. */
  }

  const paymentLabel = (value: PaymentMethod) =>
    value === "CASH"
      ? "Cash"
      : value === "MOBILE_MONEY_MANUAL"
        ? "Mobile money"
        : "Card";

  async function complete(
    selectedMethod: PaymentMethod,
    cashReceived?: number,
  ) {
    if (!quote || busy) return;
    setMethod(selectedMethod);
    setError("");
    setBusy(true);
    try {
      const command: CheckoutCommand = attempted.current ?? {
        idempotency_key: key.current,
        business_day_id: day?.id ?? "",
        lines: cart,
        payment: {
          method: selectedMethod,
          ...(selectedMethod === "CASH"
            ? { tendered_ngwee: cashReceived }
            : {}),
        },
        offline,
      };
      if (
        !attempted.current &&
        command.payment.method === "CASH" &&
        (command.payment.tendered_ngwee ?? 0) < quote.total_ngwee
      ) {
        throw new Error("Cash received must cover the sale total.");
      }
      attempted.current = command;
      await onSubmit(command);
    } catch (cause) {
      if (
        cause instanceof POSAPIError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 408
      ) {
        attempted.current = null;
      }
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submitCash(event: FormEvent) {
    event.preventDefault();
    try {
      void complete("CASH", parseMoney(cash));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  const recovery = attempted.current;
  const showRetry = Boolean(recovery && (attempt || error));
  return (
    <Modal
      title="Take payment"
      eyebrow={
        attempt
          ? "Recover original payment"
          : offline
            ? "Offline cash sale"
            : "Complete the sale"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submitCash}>
        <div className="modal-body">
          <div className="amount-due">
            <span>
              {attempt
                ? "Recover the original payment"
                : quote
                  ? `${cart.reduce((total, line) => total + line.quantity, 0)} items · Total due`
                  : "Confirming the current price..."}
            </span>
            <strong>{quote ? money(quote.total_ngwee) : "—"}</strong>
            {attempt ? (
              <span>
                {paymentLabel(attempt.payment.method)} will be retried with the
                original sale details.
              </span>
            ) : null}
          </div>

          {attempt ? (
            <div className="notice">
              <ShieldCheck size={17} />
              <span>
                Retry returns the original sale if it was already accepted, so
                it will not create a duplicate.
              </span>
            </div>
          ) : null}

          {offline ? (
            <div className="notice">
              <WifiOff size={17} />
              <span>
                This cash sale will be saved on this device and sent when the
                connection returns.
              </span>
            </div>
          ) : null}

          <div className="payment-tabs">
            {(
              [
                ["CASH", "Cash", Banknote],
                ["MOBILE_MONEY_MANUAL", "Mobile money", Smartphone],
                ["CARD_MANUAL", "Card", CreditCard],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                className={`choice ${method === id ? "selected" : ""}`}
                key={id}
                type="button"
                onClick={() => {
                  setMethod(id);
                  if (id !== "CASH") void complete(id);
                }}
                disabled={
                  busy ||
                  !quote ||
                  Boolean(recovery) ||
                  (offline && id !== "CASH")
                }
                aria-pressed={method === id}
              >
                <Icon size={19} />
                {label}
              </button>
            ))}
          </div>

          {method === "CASH" ? (
            <>
              <label className="field">
                Cash received ({currencySymbol()})
                <input
                  autoFocus
                  inputMode="decimal"
                  required
                  value={cash}
                  onChange={(event) => setCash(event.target.value)}
                  disabled={busy || Boolean(recovery)}
                  placeholder="0.00"
                />
              </label>
              <div className="quick-cash">
                {[quote?.total_ngwee ?? 0, 5000, 10000, 20000]
                  .filter(
                    (amount, index, amounts) =>
                      amount > 0 &&
                      amounts.indexOf(amount) === index &&
                      amount >= (quote?.total_ngwee ?? 0),
                  )
                  .map((amount) => (
                    <button
                      type="button"
                      key={amount}
                      disabled={busy || Boolean(recovery)}
                      onClick={() => setCash(moneyInput(amount))}
                    >
                      {amount === quote?.total_ngwee ? "Exact" : money(amount)}
                    </button>
                  ))}
              </div>
              {!attempt ? (
                <div className="change-due" aria-live="polite">
                  <span>Change to give</span>
                  <strong>
                    {money(Math.max(0, tendered - (quote?.total_ngwee ?? 0)))}
                  </strong>
                </div>
              ) : null}
            </>
          ) : (
            <div className="notice">
              <ShieldCheck size={17} />
              <span>
                Tap the payment method once after the customer has paid. The
                sale records only the method used.
              </span>
            </div>
          )}

          <ErrorMessage error={error} />
          {recovery && error ? (
            <p className="hint-inline">
              Retry uses the same sale details to prevent a duplicate.
            </p>
          ) : null}
        </div>

        {method === "CASH" || showRetry ? (
          <div className="modal-footer">
            {method === "CASH" ? (
              <SubmitButton
                busy={busy}
                disabled={!quote || (!!attempt && offline)}
              >
                {offline
                  ? "Save cash sale on device"
                  : recovery
                    ? "Retry Cash payment"
                    : "Confirm cash payment"}
              </SubmitButton>
            ) : (
              <button
                className="button primary"
                type="button"
                disabled={busy || !quote}
                onClick={() =>
                  void complete(recovery?.payment.method ?? method)
                }
              >
                {busy ? null : <ArrowRight size={18} />}
                Retry {paymentLabel(recovery?.payment.method ?? method)} payment
              </button>
            )}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
export function PendingReceipt({
  command,
  createdAt,
  catalog,
  profile,
}: {
  command: CheckoutCommand;
  createdAt: string;
  catalog: Catalog;
  profile?: StandProfile;
}) {
  const quote = estimate(command.lines, catalog);
  return (
    <div
      className={`receipt receipt-paper-${(profile?.receipt_paper_width ?? "80mm").slice(0, 2)}`}
    >
      <BrandLogo variant="receipt" />
      <p className="receipt-meta">
        {profile?.stand_name ?? "Lusaka stand"} · Provisional receipt
        <br />
        {dateOf(createdAt)} · {timeOf(createdAt)}
      </p>
      <div className="receipt-number" style={{ fontSize: 29 }}>
        L-{command.idempotency_key.slice(0, 8).toUpperCase()}
      </div>
      <Badge tone="orange">Pending sync</Badge>
      <div className="receipt-lines">
        {quote.lines.map((line, index) => (
          <div className="receipt-line" key={index}>
            <div>
              {line.quantity} × {line.name}
              <small>{line.modifier_names.join(" · ")}</small>
            </div>
            <strong>{money(line.total_ngwee)}</strong>
          </div>
        ))}
      </div>
      <div className="total-row grand-total">
        <span>Local menu total</span>
        <strong>{money(quote.total_ngwee)}</strong>
      </div>
      <div className="total-row">
        <span>Cash received</span>
        <strong>{money(command.payment.tendered_ngwee ?? 0)}</strong>
      </div>
      <div className="total-row">
        <span>Change</span>
        <strong>
          {money(
            Math.max(
              0,
              (command.payment.tendered_ngwee ?? 0) - quote.total_ngwee,
            ),
          )}
        </strong>
      </div>
      <p>
        Cash payment recorded on this device.
        <br />
        The final receipt number is assigned after sync.
      </p>
      <p className="receipt-meta">Provisional receipt · Not a fiscal invoice</p>
    </div>
  );
}
