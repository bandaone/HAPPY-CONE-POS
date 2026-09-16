import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { ChevronDown, PackagePlus, Pencil, Plus } from "lucide-react";

import { Badge, Empty, ErrorMessage, Modal, SubmitButton } from "../components/ui";
import { money, parseMoney } from "../lib/client";
import type {
  Catalog, CatalogItemCreate, CatalogItemUpdate, Category, InventoryItem, Modifier,
  ModifierGroup, POSClient, Product, ProductCreateInput, ProductUpdateInput,
  RecipeComponent, Variant,
} from "../lib/types";

interface Props {
  client: POSClient;
  onChanged: () => void | Promise<void>;
  onError: (message: string) => void;
}

type Dialog =
  | { kind: "category"; item?: Category }
  | { kind: "product"; item?: Product }
  | { kind: "group"; item?: ModifierGroup }
  | { kind: "variant"; productId: string; item?: Variant }
  | { kind: "modifier"; groupId: string; item?: Modifier };

const emptyCatalog: Catalog = { categories: [], products: [], modifier_groups: [], modifiers: [] };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "The change could not be saved. Please try again.";
}

function RecipeSummary({ recipe, inventory }: { recipe: RecipeComponent[]; inventory: InventoryItem[] }) {
  if (!recipe.length) return <span className="catalog-recipe-empty">No stock recipe</span>;
  return <span>{recipe.map(component => {
    const item = inventory.find(entry => entry.id === component.item_id);
    return `${item?.name ?? component.item_id} ${component.quantity} ${item?.unit ?? ""}`.trim();
  }).join(" · ")}</span>;
}

function CategoryForm({ client, item, finish }: {
  client: POSClient; item?: Category; finish: (error?: string) => Promise<void>;
}) {
  const [code, setCode] = useState(item?.id ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (item) await client.updateCategory(item.id, { name });
      else await client.createCategory({ id: code, name });
      await finish();
    } catch (reason) { const message = errorText(reason); setError(message); await finish(message); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit}><div className="modal-body">
    {!item && <label className="field">Item code<input aria-label="Item code" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={60} value={code} onChange={event => setCode(event.target.value.toLowerCase())}/><small>Permanent code using lowercase letters, numbers and hyphens.</small></label>}
    <label className="field">Category name<input aria-label="Category name" required maxLength={100} value={name} onChange={event => setName(event.target.value)}/></label>
    <ErrorMessage error={error}/>
  </div><div className="modal-footer"><SubmitButton busy={busy}>{item ? "Save category" : "Create category"}</SubmitButton></div></form>;
}

function ProductForm({ client, categories, item, finish }: {
  client: POSClient; categories: Category[]; item?: Product; finish: (error?: string) => Promise<void>;
}) {
  const [code, setCode] = useState(item?.id ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [categoryId, setCategoryId] = useState(item?.category_id ?? categories[0]?.id ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [color, setColor] = useState(item?.color ?? "#F6E4AB");
  const [active, setActive] = useState(item?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    const values: ProductUpdateInput = { category_id: categoryId, name, description, color, active };
    try {
      if (item) await client.updateProduct(item.id, values);
      else await client.createProduct({ id: code, ...values } as ProductCreateInput);
      await finish();
    } catch (reason) { const message = errorText(reason); setError(message); await finish(message); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit}><div className="modal-body">
    {!item && <label className="field">Item code<input aria-label="Item code" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={60} value={code} onChange={event => setCode(event.target.value.toLowerCase())}/><small>Permanent code used by receipts and reports.</small></label>}
    {item && <div className="catalog-code"><span>Item code</span><strong>{item.id}</strong><small>Codes stay fixed to protect sale history.</small></div>}
    <label className="field">Product name<input aria-label="Product name" required maxLength={100} value={name} onChange={event => setName(event.target.value)}/></label>
    <label className="field">Category<select aria-label="Category" required value={categoryId} onChange={event => setCategoryId(event.target.value)}>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
    <label className="field">Customer description<textarea aria-label="Customer description" required maxLength={300} rows={3} value={description} onChange={event => setDescription(event.target.value)}/><small>Shown on the cashier menu to help staff explain the item.</small></label>
    <label className="field">Display colour<input aria-label="Display colour" type="color" value={color} onChange={event => setColor(event.target.value.toUpperCase())}/></label>
    <label className="choice"><span><strong>Available for sale</strong><small>Turn this off to archive the product without deleting history.</small></span><input type="checkbox" aria-label="Available for sale" checked={active} onChange={event => setActive(event.target.checked)}/></label>
    <ErrorMessage error={error}/>
  </div><div className="modal-footer"><SubmitButton busy={busy}>{item ? "Save product" : "Create product"}</SubmitButton></div></form>;
}

function GroupForm({ client, item, finish }: {
  client: POSClient; item?: ModifierGroup; finish: (error?: string) => Promise<void>;
}) {
  const [code, setCode] = useState(item?.id ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [minimum, setMinimum] = useState(String(item?.minimum ?? 0));
  const [maximum, setMaximum] = useState(String(item?.maximum ?? 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const limits = { name, minimum: Number(minimum), maximum: Number(maximum) };
    if (limits.minimum > limits.maximum) { setError("Minimum selections cannot exceed maximum selections."); return; }
    setBusy(true); setError("");
    try {
      if (item) await client.updateModifierGroup(item.id, limits);
      else await client.createModifierGroup({ id: code, ...limits });
      await finish();
    } catch (reason) { const message = errorText(reason); setError(message); await finish(message); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit}><div className="modal-body">
    {!item && <label className="field">Item code<input aria-label="Item code" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={code} onChange={event => setCode(event.target.value.toLowerCase())}/></label>}
    <label className="field">Group name<input aria-label="Group name" required value={name} onChange={event => setName(event.target.value)}/></label>
    <div className="catalog-field-grid"><label className="field">Minimum choices<input aria-label="Minimum choices" type="number" min="0" max="20" required value={minimum} onChange={event => setMinimum(event.target.value)}/></label><label className="field">Maximum choices<input aria-label="Maximum choices" type="number" min="0" max="20" required value={maximum} onChange={event => setMaximum(event.target.value)}/></label></div>
    <ErrorMessage error={error}/>
  </div><div className="modal-footer"><SubmitButton busy={busy}>{item ? "Save choice group" : "Create choice group"}</SubmitButton></div></form>;
}

interface DraftRecipe { key: string; item_id: string; quantity: string }

function ItemForm({ client, kind, parentId, item, inventory, finish }: {
  client: POSClient; kind: "variant" | "modifier"; parentId: string; item?: Variant | Modifier;
  inventory: InventoryItem[]; finish: (error?: string) => Promise<void>;
}) {
  const prefix = useId();
  const [code, setCode] = useState(item?.id ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? (item.price_ngwee / 100).toFixed(2) : "0.00");
  const [active, setActive] = useState(item?.active ?? true);
  const [rows, setRows] = useState<DraftRecipe[]>(() => (item?.recipe ?? []).map((row, index) => ({ key: `${prefix}-${index}`, ...row })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const addRow = () => setRows(current => [...current, { key: `${prefix}-${Date.now()}-${current.length}`, item_id: "", quantity: "" }]);
  const updateRow = (key: string, change: Partial<DraftRecipe>) => setRows(current => current.map(row => row.key === key ? { ...row, ...change } : row));
  const removeRow = (key: string) => setRows(current => current.filter(row => row.key !== key));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const selected = rows.map(row => row.item_id).filter(Boolean);
    if (new Set(selected).size !== selected.length) { setError("Each ingredient can only appear once in a recipe."); return; }
    const recipe: RecipeComponent[] = [];
    for (const row of rows) {
      const quantity = Number(row.quantity);
      const decimals = row.quantity.includes(".") ? row.quantity.split(".")[1].length : 0;
      if (!row.item_id || !Number.isFinite(quantity) || quantity <= 0 || decimals > 3) {
        setError("Choose an ingredient and enter a positive quantity with up to three decimal places."); return;
      }
      recipe.push({ item_id: row.item_id, quantity: quantity.toFixed(3) });
    }
    let priceNgwee: number;
    try { priceNgwee = parseMoney(price); }
    catch (reason) { setError(errorText(reason)); return; }
    const values: CatalogItemUpdate = { name, price_ngwee: priceNgwee, active, recipe };
    setBusy(true);
    try {
      if (item) {
        if (kind === "variant") await client.updateVariant(item.id, values);
        else await client.updateModifier(item.id, values);
      } else {
        const create: CatalogItemCreate = { id: code, ...values };
        if (kind === "variant") await client.createVariant(parentId, create);
        else await client.createModifier(parentId, create);
      }
      await finish();
    } catch (reason) { const message = errorText(reason); setError(message); await finish(message); }
    finally { setBusy(false); }
  };
  const label = kind === "variant" ? "variation" : "extra";
  return <form onSubmit={submit}><div className="modal-body">
    {!item && <label className="field">Item code<input aria-label="Item code" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={code} onChange={event => setCode(event.target.value.toLowerCase())}/><small>Permanent code printed on receipts.</small></label>}
    {item && <div className="catalog-code"><span>Item code</span><strong>{item.id}</strong></div>}
    <label className="field">Name<input aria-label="Name" required maxLength={100} value={name} onChange={event => setName(event.target.value)}/></label>
    <label className="field">Selling price (K)<input aria-label="Selling price (K)" inputMode="decimal" required value={price} onChange={event => setPrice(event.target.value)}/></label>
    <label className="choice"><span><strong>Available for sale</strong><small>Archived items remain on earlier receipts and reports.</small></span><input aria-label="Available for sale" type="checkbox" checked={active} onChange={event => setActive(event.target.checked)}/></label>
    <div className="recipe-heading"><div><h3>Stock recipe</h3><p>Stock deducted each time one {label} is sold.</p></div><button className="button" type="button" onClick={addRow}><Plus size={16}/> Add ingredient</button></div>
    {rows.map((row, index) => {
      const stock = inventory.find(entry => entry.id === row.item_id);
      return <div className="recipe-row" key={row.key}>
        <label className="field">Ingredient {index + 1}<select aria-label={`Ingredient ${index + 1}`} required value={row.item_id} onChange={event => updateRow(row.key, { item_id: event.target.value })}><option value="">Choose stock item</option>{inventory.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        <label className="field">Quantity {index + 1}<span className="quantity-with-unit"><input aria-label={`Quantity ${index + 1}`} inputMode="decimal" required value={row.quantity} onChange={event => updateRow(row.key, { quantity: event.target.value })}/><span>{stock?.unit ?? "unit"}</span></span></label>
        <button className="button danger" type="button" aria-label={`Remove recipe row ${index + 1}`} onClick={() => removeRow(row.key)}>Remove</button>
      </div>;
    })}
    {!rows.length && <div className="notice">No stock will be deducted for this item. Save only if that is intentional.</div>}
    <ErrorMessage error={error}/>
  </div><div className="modal-footer"><SubmitButton busy={busy}>{item ? `Save ${label}` : `Create ${label}`}</SubmitButton></div></form>;
}

export function CatalogRecipes({ client, onChanged, onError }: Props) {
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCatalog, nextInventory] = await Promise.all([client.catalog(true), client.inventory()]);
      setCatalog(nextCatalog); setInventory(nextInventory); setError("");
    } catch (reason) { const message = errorText(reason); setError(message); onError(message); }
    finally { setLoading(false); }
  }, [client, onError]);
  useEffect(() => { void load(); }, [load]);
  const finish = async (failure?: string) => {
    if (failure) { onError(failure); return; }
    setDialog(null); await load(); await onChanged();
  };
  const toggle = (id: string) => setExpanded(current => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });

  return <section className="panel catalog-admin"><div className="panel-head catalog-admin-head"><div><h2>Menu and stock recipes</h2><p className="hint-inline">Build what the counter sells, set prices, and define the stock used by every option.</p></div><div className="catalog-actions"><button className="button" type="button" onClick={() => setDialog({ kind: "category" })}><Plus size={16}/> Add category</button><button className="button primary" type="button" disabled={!catalog.categories.length} onClick={() => setDialog({ kind: "product" })}><Plus size={16}/> Add product</button><button className="button" type="button" onClick={() => setDialog({ kind: "group" })}><Plus size={16}/> Add choice group</button></div></div>
    <ErrorMessage error={error}/>
    {loading ? <div className="spinner-area">Loading menu and recipes…</div> : <div className="catalog-admin-body">
      <div className="catalog-structure"><span>Categories</span>{catalog.categories.map(category => <button className="catalog-chip" type="button" key={category.id} onClick={() => setDialog({ kind: "category", item: category })}>{category.name}<Pencil size={13}/></button>)}</div>
      <div className="catalog-product-list">{catalog.products.map(product => {
        const open = expanded.has(product.id);
        return <article className="catalog-product" key={product.id}><div className="catalog-product-main"><button className="catalog-product-toggle" type="button" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} ${product.name} details`} onClick={() => toggle(product.id)}><span className="catalog-swatch" style={{ background: product.color }}/><span><strong>{product.name}</strong><small>{product.category} · {product.id}</small><p>{product.description}</p></span><ChevronDown className={open ? "open" : ""} size={19}/></button><Badge tone={product.active ? "green" : "red"}>{product.active ? "Available" : "Archived"}</Badge><button className="button" type="button" aria-label={`Edit ${product.name}`} onClick={() => setDialog({ kind: "product", item: product })}><Pencil size={15}/> Edit product</button></div>
          {open && <div className="catalog-children"><div className="catalog-child-head"><h3>Variations</h3><button className="button" type="button" onClick={() => setDialog({ kind: "variant", productId: product.id })}><Plus size={15}/> Add variation</button></div>{product.variants.length ? product.variants.map(variant => <div className="catalog-item-row" key={variant.id}><div><strong>{variant.name}</strong><small>{variant.id}</small></div><strong className="catalog-price">{money(variant.price_ngwee)}</strong><Badge tone={variant.active ? "green" : "red"}>{variant.active ? "Available" : "Archived"}</Badge><div className="catalog-recipe"><RecipeSummary recipe={variant.recipe} inventory={inventory}/></div><button className="button" type="button" aria-label={`Edit ${variant.name}`} onClick={() => setDialog({ kind: "variant", productId: product.id, item: variant })}>Edit</button></div>) : <Empty title="No variations yet">Add a sellable size or format for this product.</Empty>}</div>}
        </article>;
      })}{!catalog.products.length && <Empty icon={<PackagePlus/>} title="No products yet">Add a category, then create the first product and variation.</Empty>}</div>
      <div className="catalog-groups"><div className="catalog-section-title"><div><h3>Serving choices and extras</h3><p>These options add their own price and stock recipe.</p></div></div>{catalog.modifier_groups.map(group => {
        const modifiers = catalog.modifiers.filter(item => item.group_id === group.id);
        return <section className="catalog-group" key={group.id}><div className="catalog-group-head"><div><strong>{group.name}</strong><small>{group.minimum === group.maximum ? `${group.minimum} required` : `${group.minimum}–${group.maximum} choices`} · {group.id}</small></div><div><button className="button" type="button" aria-label={`Edit ${group.name} group`} onClick={() => setDialog({ kind: "group", item: group })}><Pencil size={15}/> Edit group</button><button className="button" type="button" onClick={() => setDialog({ kind: "modifier", groupId: group.id })}><Plus size={15}/> Add extra</button></div></div>{modifiers.map(modifier => <div className="catalog-item-row" key={modifier.id}><div><strong>{modifier.name}</strong><small>{modifier.id}</small></div><strong className="catalog-price">{money(modifier.price_ngwee)}</strong><Badge tone={modifier.active ? "green" : "red"}>{modifier.active ? "Available" : "Archived"}</Badge><div className="catalog-recipe"><RecipeSummary recipe={modifier.recipe} inventory={inventory}/></div><button className="button" type="button" aria-label={`Edit ${modifier.name}`} onClick={() => setDialog({ kind: "modifier", groupId: group.id, item: modifier })}>Edit</button></div>)}</section>;
      })}</div>
    </div>}
    {dialog?.kind === "category" && <Modal title={dialog.item ? "Edit category" : "Add category"} eyebrow="Menu structure" onClose={() => setDialog(null)}><CategoryForm client={client} item={dialog.item} finish={finish}/></Modal>}
    {dialog?.kind === "product" && <Modal title={dialog.item ? "Edit product" : "Add product"} eyebrow="Customer menu" onClose={() => setDialog(null)} wide><ProductForm client={client} categories={catalog.categories} item={dialog.item} finish={finish}/></Modal>}
    {dialog?.kind === "group" && <Modal title={dialog.item ? "Edit choice group" : "Add choice group"} eyebrow="Serving and extras" onClose={() => setDialog(null)}><GroupForm client={client} item={dialog.item} finish={finish}/></Modal>}
    {dialog?.kind === "variant" && <Modal title={dialog.item ? "Edit variation" : "Add variation"} eyebrow="Price and stock recipe" onClose={() => setDialog(null)} wide><ItemForm client={client} kind="variant" parentId={dialog.productId} item={dialog.item} inventory={inventory} finish={finish}/></Modal>}
    {dialog?.kind === "modifier" && <Modal title={dialog.item ? "Edit extra" : "Add extra"} eyebrow="Price and stock recipe" onClose={() => setDialog(null)} wide><ItemForm client={client} kind="modifier" parentId={dialog.groupId} item={dialog.item} inventory={inventory} finish={finish}/></Modal>}
  </section>;
}
