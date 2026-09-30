import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import {
  Archive,
  ChevronDown,
  CirclePlus,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";

import {
  Badge,
  Empty,
  ErrorMessage,
  Modal,
  SubmitButton,
} from "../components/ui";
import { currencySymbol, money, parseMoney } from "../lib/client";
import type {
  Catalog,
  Category,
  MenuItemCreateInput,
  MenuItemUpdateInput,
  Modifier,
  ModifierGroup,
  POSClient,
  Product,
  ProductChoiceSetInput,
} from "../lib/types";

interface Props {
  client: POSClient;
  onChanged: () => void | Promise<void>;
  onError: (message: string) => void;
}

type Dialog =
  | { kind: "category"; item?: Category }
  | { kind: "item"; item?: Product }
  | { kind: "set"; item?: ModifierGroup }
  | { kind: "choice"; group: ModifierGroup; item?: Modifier };

interface DraftPrice {
  key: string;
  id: string;
  name: string;
  amount: string;
  active: boolean;
}

interface DraftSet {
  enabled: boolean;
  minimum: string;
  maximum: string;
}

const emptyCatalog: Catalog = {
  categories: [],
  products: [],
  modifier_groups: [],
  modifiers: [],
};

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The change could not be saved. Please try again.";
}

function generatedCode(name: string, parentId = ""): string {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item";
  const prefix = parentId
    ? `${parentId.slice(0, 35).replace(/-+$/g, "")}-`
    : "";
  return `${prefix}${slug}`.slice(0, 60).replace(/-+$/g, "");
}

function productUpdate(product: Product, active: boolean): MenuItemUpdateInput {
  return {
    category_id: product.category_id,
    name: product.name,
    description: product.description,
    color: product.color,
    active,
    prices: product.variants.map((price) => ({
      id: price.id,
      name: price.name,
      price_ngwee: price.price_ngwee,
      active,
      recipe: [],
    })),
    choice_sets: product.choice_sets.map(
      ({ group_id, minimum, maximum, position }) => ({
        group_id,
        minimum,
        maximum,
        position,
      }),
    ),
  };
}

function CategoryForm({
  client,
  item,
  finish,
}: {
  client: POSClient;
  item?: Category;
  finish: (error?: string) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (item) await client.updateCategory(item.id, { name });
      else await client.createCategory({ id: generatedCode(name), name });
      await finish();
    } catch (reason) {
      const message = errorText(reason);
      setError(message);
      await finish(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <div className="modal-body">
        <label className="field">
          Category name
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <p className="hint-inline">
          Categories keep the counter menu quick to scan.
        </p>
        <ErrorMessage error={error} />
      </div>
      <div className="modal-footer">
        <SubmitButton busy={busy}>
          {item ? "Save category" : "Create category"}
        </SubmitButton>
      </div>
    </form>
  );
}

function ChoiceSetForm({
  client,
  item,
  finish,
}: {
  client: POSClient;
  item?: ModifierGroup;
  finish: (error?: string) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [minimum, setMinimum] = useState(String(item?.minimum ?? 0));
  const [maximum, setMaximum] = useState(String(item?.maximum ?? 3));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const values = { name, minimum: Number(minimum), maximum: Number(maximum) };
    if (values.minimum > values.maximum) {
      setError("Minimum choices cannot exceed maximum choices.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (item) await client.updateModifierGroup(item.id, values);
      else
        await client.createModifierGroup({
          id: generatedCode(name),
          ...values,
        });
      await finish();
    } catch (reason) {
      const message = errorText(reason);
      setError(message);
      await finish(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <div className="modal-body">
        <label className="field">
          Choice set name
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="catalog-field-grid">
          <label className="field">
            Default minimum
            <input
              type="number"
              min="0"
              max="20"
              required
              value={minimum}
              onChange={(event) => setMinimum(event.target.value)}
            />
          </label>
          <label className="field">
            Default maximum
            <input
              type="number"
              min="0"
              max="20"
              required
              value={maximum}
              onChange={(event) => setMaximum(event.target.value)}
            />
          </label>
        </div>
        <p className="hint-inline">
          Each menu item can use its own limits when this set is attached.
        </p>
        <ErrorMessage error={error} />
      </div>
      <div className="modal-footer">
        <SubmitButton busy={busy}>
          {item ? "Save choice set" : "Create choice set"}
        </SubmitButton>
      </div>
    </form>
  );
}

function ChoiceForm({
  client,
  group,
  item,
  finish,
}: {
  client: POSClient;
  group: ModifierGroup;
  item?: Modifier;
  finish: (error?: string) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(
    item ? (item.price_ngwee / 100).toFixed(2) : "0.00",
  );
  const [active, setActive] = useState(item?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    let priceNgwee: number;
    try {
      priceNgwee = parseMoney(price);
    } catch (reason) {
      setError(errorText(reason));
      return;
    }
    const values = { name, price_ngwee: priceNgwee, active, recipe: [] };
    setBusy(true);
    try {
      if (item) await client.updateModifier(item.id, values);
      else
        await client.createModifier(group.id, {
          id: generatedCode(name, group.id),
          ...values,
        });
      await finish();
    } catch (reason) {
      const message = errorText(reason);
      setError(message);
      await finish(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <div className="modal-body">
        <label className="field">
          Choice name
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          Extra price ({currencySymbol()})
          <input
            aria-label={`Extra price (${currencySymbol()})`}
            inputMode="decimal"
            required
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
          <small>Use 0.00 when the choice is included in the menu price.</small>
        </label>
        {item && (
          <label className="choice">
            <span>
              <strong>Available</strong>
              <small>Archived choices remain on earlier receipts.</small>
            </span>
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
          </label>
        )}
        <ErrorMessage error={error} />
      </div>
      <div className="modal-footer">
        <SubmitButton busy={busy}>
          {item ? "Save choice" : "Create choice"}
        </SubmitButton>
      </div>
    </form>
  );
}

function MenuItemForm({
  client,
  catalog,
  item,
  finish,
}: {
  client: POSClient;
  catalog: Catalog;
  item?: Product;
  finish: (error?: string) => Promise<void>;
}) {
  const formId = useId();
  const [name, setName] = useState(item?.name ?? "");
  const [categoryId, setCategoryId] = useState(
    item?.category_id ?? catalog.categories[0]?.id ?? "",
  );
  const [description, setDescription] = useState(item?.description ?? "");
  const [color, setColor] = useState(item?.color ?? "#F6E4AB");
  const [prices, setPrices] = useState<DraftPrice[]>(() =>
    item?.variants.length
      ? item.variants.map((price, index) => ({
          key: `${formId}-${index}`,
          id: price.id,
          name: price.name,
          amount: (price.price_ngwee / 100).toFixed(2),
          active: price.active,
        }))
      : [
          {
            key: `${formId}-0`,
            id: "",
            name: "Standard",
            amount: "0.00",
            active: true,
          },
        ],
  );
  const [sets, setSets] = useState<Record<string, DraftSet>>(() =>
    Object.fromEntries(
      catalog.modifier_groups.map((group) => {
        const selected = item?.choice_sets.find(
          (choice) => choice.group_id === group.id,
        );
        return [
          group.id,
          {
            enabled: Boolean(selected),
            minimum: String(selected?.minimum ?? group.minimum),
            maximum: String(selected?.maximum ?? group.maximum),
          },
        ];
      }),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const primary = prices[0];
  const updatePrice = (key: string, values: Partial<DraftPrice>) =>
    setPrices((current) =>
      current.map((price) =>
        price.key === key ? { ...price, ...values } : price,
      ),
    );
  const addPrice = () =>
    setPrices((current) => [
      ...current,
      {
        key: `${formId}-${Date.now()}-${current.length}`,
        id: "",
        name: "",
        amount: "0.00",
        active: true,
      },
    ]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const itemId = item?.id ?? generatedCode(name);
    const nextPrices = [];
    try {
      for (const [index, price] of prices.entries()) {
        nextPrices.push({
          id:
            price.id ||
            generatedCode(price.name || `price-${index + 1}`, itemId),
          name: price.name || "Standard",
          price_ngwee: parseMoney(price.amount),
          active: price.active,
          recipe: [],
        });
      }
    } catch (reason) {
      setError(errorText(reason));
      return;
    }
    const choiceSets: ProductChoiceSetInput[] = [];
    for (const group of catalog.modifier_groups) {
      const selected = sets[group.id];
      if (!selected?.enabled) continue;
      const minimum = Number(selected.minimum);
      const maximum = Number(selected.maximum);
      if (
        !Number.isInteger(minimum) ||
        !Number.isInteger(maximum) ||
        minimum < 0 ||
        maximum > 20 ||
        minimum > maximum
      ) {
        setError(`${group.name} needs valid minimum and maximum choices.`);
        return;
      }
      choiceSets.push({
        group_id: group.id,
        minimum,
        maximum,
        position: choiceSets.length,
      });
    }
    const values: MenuItemUpdateInput = {
      category_id: categoryId,
      name,
      description,
      color,
      active: item?.active ?? true,
      prices: nextPrices,
      choice_sets: choiceSets,
    };
    setBusy(true);
    try {
      if (item) await client.updateMenuItem(item.id, values);
      else
        await client.createMenuItem({
          id: itemId,
          ...values,
        } as MenuItemCreateInput);
      await finish();
    } catch (reason) {
      const message = errorText(reason);
      setError(message);
      await finish(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <div className="modal-body menu-item-form">
        <div className="catalog-field-grid">
          <label className="field">
            Menu item name
            <input
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            Category
            <select
              required
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {catalog.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          Selling price ({currencySymbol()})
          <input
            inputMode="decimal"
            required
            value={primary.amount}
            onChange={(event) =>
              updatePrice(primary.key, { amount: event.target.value })
            }
          />
        </label>

        {!!catalog.modifier_groups.length && (
          <fieldset className="menu-choice-picker">
            <legend>Choice sets</legend>
            <p>Attach only the choices this item needs at the counter.</p>
            {catalog.modifier_groups.map((group) => {
              const selected = sets[group.id] ?? {
                enabled: false,
                minimum: "0",
                maximum: "1",
              };
              return (
                <div className="menu-choice-set" key={group.id}>
                  <label className="choice compact">
                    <span>
                      <strong>{group.name}</strong>
                      <small>
                        {
                          catalog.modifiers.filter(
                            (choice) =>
                              choice.group_id === group.id && choice.active,
                          ).length
                        }{" "}
                        choices available
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      aria-label={`Use ${group.name}`}
                      checked={selected.enabled}
                      onChange={(event) =>
                        setSets((current) => ({
                          ...current,
                          [group.id]: {
                            ...selected,
                            enabled: event.target.checked,
                          },
                        }))
                      }
                    />
                  </label>
                  {selected.enabled && (
                    <div className="catalog-field-grid choice-limits">
                      <label className="field">
                        Minimum
                        <input
                          aria-label={`${group.name} minimum`}
                          type="number"
                          min="0"
                          max="20"
                          value={selected.minimum}
                          onChange={(event) =>
                            setSets((current) => ({
                              ...current,
                              [group.id]: {
                                ...selected,
                                minimum: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        Maximum
                        <input
                          aria-label={`${group.name} maximum`}
                          type="number"
                          min="0"
                          max="20"
                          value={selected.maximum}
                          onChange={(event) =>
                            setSets((current) => ({
                              ...current,
                              [group.id]: {
                                ...selected,
                                maximum: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>
        )}

        <details className="catalog-optional">
          <summary>More menu details</summary>
          <div>
            <label className="field">
              Description
              <textarea
                aria-label="Description"
                maxLength={300}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
              <small>
                A short line that helps the cashier explain the item.
              </small>
            </label>
            <label className="field menu-colour-field">
              Menu colour
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value.toUpperCase())}
              />
            </label>
            <div className="menu-prices-head">
              <div>
                <h3>Price choices</h3>
                <p>Use these when the same item has another size or format.</p>
              </div>
              <button className="button" type="button" onClick={addPrice}>
                <Plus size={15} /> Add price choice
              </button>
            </div>
            {prices.map((price, index) => (
              <div className="menu-price-row" key={price.key}>
                <label className="field">
                  Name
                  <input
                    aria-label={`Price choice ${index + 1} name`}
                    required
                    value={price.name}
                    onChange={(event) =>
                      updatePrice(price.key, { name: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Price ({currencySymbol()})
                  <input
                    aria-label={`Price choice ${index + 1} price`}
                    required
                    inputMode="decimal"
                    value={price.amount}
                    onChange={(event) =>
                      updatePrice(price.key, { amount: event.target.value })
                    }
                  />
                </label>
                {prices.length > 1 && (
                  <button
                    className="text-button danger-text"
                    type="button"
                    onClick={() =>
                      setPrices((current) =>
                        current.filter((row) => row.key !== price.key),
                      )
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
        <ErrorMessage error={error} />
      </div>
      <div className="modal-footer">
        <SubmitButton busy={busy}>
          {item ? "Save menu item" : "Create menu item"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function MenuAdmin({ client, onChanged, onError }: Props) {
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCatalog(await client.catalog(true));
      setError("");
    } catch (reason) {
      const message = errorText(reason);
      setError(message);
      onError(message);
    } finally {
      setLoading(false);
    }
  }, [client, onError]);
  useEffect(() => {
    void load();
  }, [load]);
  const finish = async (failure?: string) => {
    if (failure) {
      onError(failure);
      return;
    }
    setDialog(null);
    await load();
    await onChanged();
  };
  const changeAvailability = async (product: Product, active: boolean) => {
    setBusyItem(product.id);
    setError("");
    try {
      await client.updateMenuItem(product.id, productUpdate(product, active));
      await load();
      await onChanged();
    } catch (reason) {
      const message = errorText(reason);
      setError(message);
      onError(message);
    } finally {
      setBusyItem(null);
    }
  };
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="menu-admin">
      <div className="page-heading menu-page-heading">
        <div>
          <span className="eyebrow">What the counter sells</span>
          <h1>Menu</h1>
          <p>
            Create items, set prices and keep the available choices clear for
            cashiers.
          </p>
        </div>
        <div className="catalog-actions">
          <button
            className="button"
            type="button"
            onClick={() => setDialog({ kind: "category" })}
          >
            <Plus size={16} /> Add category
          </button>
          <button
            className="button"
            type="button"
            onClick={() => setDialog({ kind: "set" })}
          >
            <Plus size={16} /> Add choice set
          </button>
          <button
            className="button primary"
            type="button"
            disabled={!catalog.categories.length}
            onClick={() => setDialog({ kind: "item" })}
          >
            <CirclePlus size={17} /> Add menu item
          </button>
        </div>
      </div>
      <ErrorMessage error={error} />
      {loading ? (
        <div className="spinner-area" role="status">
          Loading menu…
        </div>
      ) : (
        <div className="menu-admin-layout">
          <section className="panel menu-items-panel">
            <div className="panel-head">
              <div>
                <h2>Menu items</h2>
                <p className="hint-inline">
                  Available items appear at the counter. Archived items stay on
                  earlier receipts.
                </p>
              </div>
            </div>
            <div className="menu-category-strip">
              <span>Categories</span>
              {catalog.categories.map((category) => (
                <button
                  className="catalog-chip"
                  type="button"
                  key={category.id}
                  aria-label={`Edit ${category.name} category`}
                  onClick={() =>
                    setDialog({ kind: "category", item: category })
                  }
                >
                  {category.name}
                  <Pencil size={13} />
                </button>
              ))}
            </div>
            <div className="menu-item-list">
              {catalog.products.map((product) => {
                const open = expanded.has(product.id);
                const startingPrice =
                  product.variants
                    .filter((price) => price.active)
                    .sort((a, b) => a.price_ngwee - b.price_ngwee)[0] ??
                  product.variants[0];
                return (
                  <article
                    className={`menu-item-card ${product.active ? "" : "archived"}`}
                    key={product.id}
                  >
                    <div className="menu-item-main">
                      <button
                        className="menu-item-toggle"
                        type="button"
                        aria-expanded={open}
                        aria-label={`${open ? "Hide" : "Show"} ${product.name} details`}
                        onClick={() => toggle(product.id)}
                      >
                        <span
                          className="catalog-swatch"
                          style={{ background: product.color }}
                        />
                        <span>
                          <strong>{product.name}</strong>
                          <small>
                            {product.category}
                            {startingPrice
                              ? ` · ${money(startingPrice.price_ngwee)}`
                              : ""}
                          </small>
                          {product.description && <p>{product.description}</p>}
                        </span>
                        <ChevronDown className={open ? "open" : ""} size={19} />
                      </button>
                      <Badge tone={product.active ? "green" : "red"}>
                        {product.active ? "Available" : "Archived"}
                      </Badge>
                      <button
                        className="button"
                        type="button"
                        aria-label={`Edit ${product.name}`}
                        onClick={() =>
                          setDialog({ kind: "item", item: product })
                        }
                      >
                        <Pencil size={15} /> Edit
                      </button>
                      <button
                        className="button"
                        type="button"
                        disabled={busyItem === product.id}
                        aria-label={`${product.active ? "Archive" : "Restore"} ${product.name}`}
                        onClick={() =>
                          void changeAvailability(product, !product.active)
                        }
                      >
                        {product.active ? (
                          <Archive size={15} />
                        ) : (
                          <RotateCcw size={15} />
                        )}{" "}
                        {busyItem === product.id
                          ? "Saving…"
                          : product.active
                            ? "Archive"
                            : "Restore"}
                      </button>
                    </div>
                    {open && (
                      <div className="menu-item-details">
                        <div>
                          <span>Price choices</span>
                          {product.variants.map((price) => (
                            <p key={price.id}>
                              <strong>{price.name}</strong>
                              <span>{money(price.price_ngwee)}</span>
                            </p>
                          ))}
                        </div>
                        <div>
                          <span>Choice sets</span>
                          {product.choice_sets.length ? (
                            product.choice_sets.map((set) => (
                              <p key={set.group_id}>
                                <strong>{set.name}</strong>
                                <span>
                                  {set.minimum === set.maximum
                                    ? `${set.minimum} required`
                                    : `${set.minimum}–${set.maximum}`}
                                </span>
                              </p>
                            ))
                          ) : (
                            <p>No choices needed</p>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
              {!catalog.products.length && (
                <Empty title="No menu items yet">
                  Add your first item once a category is ready.
                </Empty>
              )}
            </div>
          </section>

          <section className="panel menu-choices-panel">
            <div className="panel-head">
              <div>
                <h2>Choice sets</h2>
                <p className="hint-inline">
                  Reusable flavours, serving options and toppings.
                </p>
              </div>
            </div>
            {catalog.modifier_groups.map((group) => (
              <section className="menu-choice-card" key={group.id}>
                <div className="menu-choice-card-head">
                  <div>
                    <strong>{group.name}</strong>
                    <small>
                      {
                        catalog.modifiers.filter(
                          (choice) =>
                            choice.group_id === group.id && choice.active,
                        ).length
                      }{" "}
                      available
                    </small>
                  </div>
                  <div>
                    <button
                      className="text-button"
                      type="button"
                      aria-label={`Edit ${group.name} choice set`}
                      onClick={() => setDialog({ kind: "set", item: group })}
                    >
                      Edit
                    </button>
                    <button
                      className="button"
                      type="button"
                      aria-label={`Add choice to ${group.name}`}
                      onClick={() => setDialog({ kind: "choice", group })}
                    >
                      <Plus size={15} /> Add choice
                    </button>
                  </div>
                </div>
                <div className="menu-choice-list">
                  {catalog.modifiers
                    .filter((choice) => choice.group_id === group.id)
                    .map((choice) => (
                      <button
                        type="button"
                        key={choice.id}
                        aria-label={`Edit ${choice.name}`}
                        onClick={() =>
                          setDialog({ kind: "choice", group, item: choice })
                        }
                      >
                        <span>
                          <strong>{choice.name}</strong>
                          {choice.price_ngwee > 0 && (
                            <small>+{money(choice.price_ngwee)}</small>
                          )}
                        </span>
                        <Badge tone={choice.active ? "green" : "red"}>
                          {choice.active ? "Available" : "Archived"}
                        </Badge>
                      </button>
                    ))}
                </div>
              </section>
            ))}
            {!catalog.modifier_groups.length && (
              <Empty title="No choice sets yet">
                Add a set when an item needs flavours, serving options or
                extras.
              </Empty>
            )}
          </section>
        </div>
      )}

      {dialog?.kind === "category" && (
        <Modal
          title={dialog.item ? "Edit category" : "Add category"}
          eyebrow="Menu structure"
          onClose={() => setDialog(null)}
        >
          <CategoryForm client={client} item={dialog.item} finish={finish} />
        </Modal>
      )}
      {dialog?.kind === "item" && (
        <Modal
          title={dialog.item ? "Edit menu item" : "Add menu item"}
          eyebrow="Counter menu"
          onClose={() => setDialog(null)}
          wide
        >
          <MenuItemForm
            client={client}
            catalog={catalog}
            item={dialog.item}
            finish={finish}
          />
        </Modal>
      )}
      {dialog?.kind === "set" && (
        <Modal
          title={dialog.item ? "Edit choice set" : "Add choice set"}
          eyebrow="Reusable choices"
          onClose={() => setDialog(null)}
        >
          <ChoiceSetForm client={client} item={dialog.item} finish={finish} />
        </Modal>
      )}
      {dialog?.kind === "choice" && (
        <Modal
          title={dialog.item ? "Edit choice" : "Add choice"}
          eyebrow={dialog.group.name}
          onClose={() => setDialog(null)}
        >
          <ChoiceForm
            client={client}
            group={dialog.group}
            item={dialog.item}
            finish={finish}
          />
        </Modal>
      )}
    </section>
  );
}
