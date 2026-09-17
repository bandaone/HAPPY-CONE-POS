import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ClipboardList, Clock3, KeyRound, ReceiptText, RefreshCw, UserPlus } from "lucide-react";
import { Badge, Empty, ErrorMessage, Modal, SubmitButton, dateOf, readable, timeOf } from "../components/ui";
import { currencySymbol, money, parseMoney } from "../lib/client";
import type {
  AuditEvent, Day, InventoryItem, Movement, MovementInput, Order, OrderStatus, POSClient, Role, StockCount, Summary, User,
} from "../lib/types";

type Changed = () => void | Promise<void>;
interface CoreProps { client: POSClient; onError: (message: string) => void; onChanged: Changed }

function errorText(error: unknown): string { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }
function statusTone(status: string): "neutral" | "green" | "orange" | "red" {
  if (["READY", "SERVED", "CLOSED", "RECEIPT", "ADJUSTMENT_IN", "RETURN_IN"].includes(status)) return "green";
  if (["NEW", "PREPARING", "OPEN"].includes(status)) return "orange";
  if (["REFUNDED", "WASTE", "ADJUSTMENT_OUT", "RETURN_OUT", "STAFF_USE"].includes(status)) return "red";
  return "neutral";
}
async function notifyChanged(callback: Changed): Promise<void> { await callback(); }

export function Preparation({ client, onError, onChanged }: CoreProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try { setOrders(await client.orders(true)); setUpdated(new Date()); setError(""); }
    catch (reason) { setError(errorText(reason)); }
    finally { if (!quiet) setLoading(false); }
  }, [client]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 5_000);
    const unwatch = client.watchOrders?.(() => void load(true));
    return () => { window.clearInterval(timer); unwatch?.(); };
  }, [client, load]);
  const advance = async (order: Order, status: OrderStatus) => {
    if (busy) return;
    setBusy(order.id);
    try { await client.transition(order, status); await load(true); await notifyChanged(onChanged); }
    catch (reason) { const message = errorText(reason); setError(message); onError(message); await load(true); }
    finally { setBusy(null); }
  };
  const lanes: Array<{ status: OrderStatus; title: string; next: OrderStatus; action: string }> = [
    { status: "NEW", title: "New", next: "PREPARING", action: "Start preparing" },
    { status: "PREPARING", title: "Preparing", next: "READY", action: "Mark ready" },
    { status: "READY", title: "Ready", next: "SERVED", action: "Mark served" },
  ];
  return <>
    <div className="page-heading"><div><h1>Preparation queue</h1><p>Order events refresh the queue promptly, with a five-second fallback. Each move checks the latest server status.</p></div><div className="heading-aside"><span className="muted"><small>{updated ? `Updated ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Waiting for update"}</small></span><button className="button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/> Refresh</button></div></div>
    <ErrorMessage error={error}/>
    {loading ? <div className="spinner-area">Loading preparation queue…</div> : <div className="queue-grid">{lanes.map((lane) => {
      const laneOrders = orders.filter((order) => order.status === lane.status);
      return <section className="queue-column" key={lane.status} aria-labelledby={`lane-${lane.status}`}><div className="queue-column-header" id={`lane-${lane.status}`}>{lane.title}<span>{laneOrders.length}</span></div>
        {laneOrders.length === 0 ? <div className="queue-empty">No {lane.title.toLowerCase()} orders</div> : laneOrders.map((order) => { const created = new Date(order.created_at).getTime(); const age = Math.max(0, Math.floor(((updated?.getTime() ?? created) - created) / 60_000)); return <article className="queue-order" key={order.id}>
          <div className="queue-order-head"><strong>{order.number}</strong><Badge tone={statusTone(order.status)}>{readable(order.status)}</Badge></div><div className="table-detail">{timeOf(order.created_at)} · {age} min old · <Badge tone={order.payment.status === "CONFIRMED" ? "green" : "red"}>{order.payment.status === "CONFIRMED" ? "Paid" : readable(order.payment.status)}</Badge></div>
          <ul>{order.lines.map((line, index) => <li key={`${line.variant_id}-${index}`}><strong>{line.quantity}</strong><div>{line.name}<small>{line.modifier_names.join(" · ")}</small>{line.notes && <div className="order-note">{line.notes}</div>}</div></li>)}</ul>
          <button type="button" className="button dark" disabled={busy !== null} onClick={() => void advance(order, lane.next)}>{busy === order.id ? "Updating…" : lane.action}</button>
        </article>; })}</section>;
    })}</div>}
  </>;
}

type InventoryTab = "stock" | "ledger" | "counts";
type InventoryAction = "RECEIPT" | "WASTE" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "COUNT";

export function Inventory({ client, onError, onChanged }: CoreProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [tab, setTab] = useState<InventoryTab>("stock");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<InventoryAction | null>(null);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const [nextItems, nextMovements, nextCounts] = await Promise.all([client.inventory(), client.movements(), client.counts()]); setItems(nextItems); setMovements(nextMovements); setCounts(nextCounts); setError(""); }
    catch (failure) { setError(errorText(failure)); }
    finally { setLoading(false); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  const selected = items.find((item) => item.id === itemId);
  const openAction = (nextAction: InventoryAction, selectedId = items[0]?.id ?? "") => { setAction(nextAction); setItemId(selectedId); setQuantity(""); setReason(""); setError(""); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!action || busy) return;
    setBusy(true);
    try {
      if (action === "COUNT") await client.count({ item_id: itemId, counted_quantity: quantity, reason });
      else await client.movement({ item_id: itemId, type: action, quantity, reason } as MovementInput);
      setAction(null); await load(); await notifyChanged(onChanged);
    } catch (failure) { const message = errorText(failure); setError(message); onError(message); }
    finally { setBusy(false); }
  };
  return <>
    <div className="page-heading"><div><span className="eyebrow">Stock and menu</span><h1>Stock</h1><p>Manage inventory movements, physical counts, menu items, prices and stock recipes in one place.</p></div><div className="heading-aside"><button className="button" type="button" onClick={() => openAction("COUNT")}>Count stock</button><button className="button" type="button" onClick={() => openAction("WASTE")}>Record waste</button><button className="button" type="button" onClick={() => openAction("ADJUSTMENT_IN")}>Adjust in</button><button className="button" type="button" onClick={() => openAction("ADJUSTMENT_OUT")}>Adjust out</button><button className="button primary" type="button" onClick={() => openAction("RECEIPT")}>Receive stock</button></div></div>
    <ErrorMessage error={error}/>
    <div className="segmented" role="group" aria-label="Inventory view">{([['stock','Current stock'],['ledger','Movement ledger'],['counts','Stock counts']] as Array<[InventoryTab,string]>).map(([value,label]) => <button aria-pressed={tab === value} className={`button ${tab === value ? "active" : ""}`} type="button" key={value} onClick={() => setTab(value)}>{label}</button>)}</div>
    {loading ? <div className="spinner-area">Loading inventory…</div> : tab === "stock" ? <div className="panel table-scroll"><table><thead><tr><th>Item</th><th>Unit</th><th className="table-numeric">On hand</th><th className="table-numeric">Low threshold</th><th>Action</th></tr></thead><tbody>{items.map((item) => { const low = Number(item.on_hand) <= Number(item.low_stock_threshold); return <tr key={item.id}><td><strong>{item.name}</strong>{low && <div className="table-detail low-stock">Low stock</div>}</td><td>{item.unit}</td><td className="table-numeric"><strong>{item.on_hand}</strong></td><td className="table-numeric">{item.low_stock_threshold}</td><td><button className="text-button" type="button" onClick={() => openAction("COUNT", item.id)}>Count</button></td></tr>; })}</tbody></table></div>
      : tab === "ledger" ? <div className="panel table-scroll"><table><thead><tr><th>When</th><th>Item</th><th>Movement</th><th className="table-numeric">Quantity</th><th>Reason / reference</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{dateOf(movement.created_at)} · {timeOf(movement.created_at)}</td><td><strong>{movement.item_name}</strong></td><td><Badge tone={statusTone(movement.type)}>{readable(movement.type)}</Badge></td><td className="table-numeric">{movement.quantity} {movement.unit}</td><td>{movement.reason}<div className="table-detail">{movement.reference ?? "Manual entry"}</div></td></tr>)}</tbody></table>{movements.length === 0 && <Empty title="No stock movements">Receipts, sales and adjustments will appear here.</Empty>}</div>
      : <div className="panel table-scroll"><table><thead><tr><th>When</th><th>Item</th><th className="table-numeric">Expected</th><th className="table-numeric">Counted</th><th className="table-numeric">Variance</th></tr></thead><tbody>{counts.map((count) => <tr key={count.id}><td>{dateOf(count.created_at)} · {timeOf(count.created_at)}</td><td><strong>{items.find((item) => item.id === count.item_id)?.name ?? count.item_id}</strong></td><td className="table-numeric">{count.expected_quantity}</td><td className="table-numeric">{count.counted_quantity}</td><td className={`table-numeric ${Number(count.variance) !== 0 ? "low-stock" : ""}`}>{count.variance}</td></tr>)}</tbody></table>{counts.length === 0 && <Empty title="No physical counts">Count an item to record expected stock and variance.</Empty>}</div>}
    {action && <Modal title={action === "RECEIPT" ? "Receive stock" : action === "WASTE" ? "Record waste" : action === "ADJUSTMENT_IN" ? "Adjust stock in" : action === "ADJUSTMENT_OUT" ? "Adjust stock out" : "Count stock"} eyebrow="Inventory ledger" onClose={() => !busy && setAction(null)}><form onSubmit={submit}><div className="modal-body"><p>{action === "COUNT" ? "This count records variance only. Use a separate adjustment if the ledger should change." : "This creates a permanent signed movement in the stock ledger."}</p><label className="field">Inventory item<select value={itemId} required onChange={(event) => setItemId(event.target.value)}>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field">{action === "COUNT" ? "Counted quantity" : "Quantity"}<input inputMode="decimal" required placeholder="0.000" value={quantity} onChange={(event) => setQuantity(event.target.value)}/><small>Enter a positive quantity in {selected?.unit ?? "the item's base unit"}.</small></label><label className="field">Reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder={action === "RECEIPT" ? "Supplier delivery" : action === "WASTE" ? "Damaged during service" : action === "COUNT" ? "Evening count" : "Reason for manual correction"}/></label><ErrorMessage error={error}/></div><div className="modal-footer"><button className="button" type="button" onClick={() => setAction(null)} disabled={busy}>Cancel</button><SubmitButton busy={busy}>Record {action === "COUNT" ? "count" : "movement"}</SubmitButton></div></form></Modal>}
  </>;
}

interface BusinessDayProps extends CoreProps { day: Day | null; canManage: boolean; pendingCount: number }
type DayAction = "OPEN" | "CLOSE" | "CASH";
export function BusinessDay({ client, day, canManage, onChanged, onError, pendingCount }: BusinessDayProps) {
  const [days, setDays] = useState<Day[]>([]);
  const [action, setAction] = useState<DayAction | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { setDays(await client.days()); setError(""); } catch (failure) { setError(errorText(failure)); } }, [client]);
  useEffect(() => { void load(); }, [load, day]);
  const expected = day?.expected_cash_ngwee ?? 0;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!action || busy) return;
    if (action === "CLOSE" && pendingCount > 0) { setError("Sync pending offline sales before closing the business day."); return; }
    setBusy(true);
    try { const ngwee = parseMoney(amount, { allowNegative: action === "CASH" }); if (action === "OPEN") await client.openDay(ngwee); else if (action === "CLOSE") await client.closeDay(ngwee); else await client.cashMovement(ngwee, reason); setAction(null); setAmount(""); setReason(""); await load(); await notifyChanged(onChanged); }
    catch (failure) { const message = errorText(failure); setError(message); onError(message); }
    finally { setBusy(false); }
  };
  return <>
    <div className="page-heading"><div><h1>Business day</h1><p>Open, reconcile and close the stand's trading day.</p></div><div className="heading-aside">{day ? <Badge tone="green">Open</Badge> : <Badge>Closed</Badge>}{!day && <button className="button primary" type="button" onClick={() => setAction("OPEN")}>Open day</button>}</div></div>
    <ErrorMessage error={error}/>
    {day ? <><div className="metrics"><div className="metric"><span className="metric-label">Opening float</span><strong>{money(day.opening_float_ngwee)}</strong><small>{dateOf(day.opened_at)} at {timeOf(day.opened_at)}</small></div><div className="metric accent"><span className="metric-label">Expected cash</span><strong>{money(expected)}</strong><small>Float, cash sales, refunds and movements</small></div><div className="metric"><span className="metric-label">Pending offline</span><strong>{pendingCount}</strong><small>{pendingCount ? "Sync before close" : "Queue is clear"}</small></div><div className="metric"><span className="metric-label">Status</span><strong>Open</strong><small>Day {day.id.slice(-8)}</small></div></div><div className="panel"><div className="panel-head"><h2>Cash controls</h2></div><div className="panel-body"><div className="notice"><Clock3 size={18}/><span>Record non-sale cash added or removed with a signed amount and a clear reason.</span></div><div className="heading-aside"><button className="button" type="button" disabled={!canManage} onClick={() => setAction("CASH")}>Cash movement</button><button className="button danger" type="button" disabled={!canManage || pendingCount > 0} onClick={() => setAction("CLOSE")}>Close day</button></div>{!canManage && <p className="hint-inline">A manager or owner closes the business day and records cash movements.</p>}{pendingCount > 0 && <p className="hint-inline">Closing is blocked while {pendingCount} offline {pendingCount === 1 ? "sale is" : "sales are"} waiting to sync.</p>}</div></div></> : <div className="panel"><Empty icon={<Clock3/>} title="No open business day">Enter the opening float before taking the first sale.</Empty></div>}
    <section className="panel"><div className="panel-head"><h2>Previous days</h2></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Status</th><th className="table-numeric">Net sales</th><th className="table-numeric">Expected</th><th className="table-numeric">Actual</th><th className="table-numeric">Variance</th></tr></thead><tbody>{days.filter((entry) => entry.status === "CLOSED").map((entry) => <tr key={entry.id}><td>{dateOf(entry.opened_at)}</td><td><Badge tone="green">Closed</Badge></td><td className="table-numeric">{money(entry.summary?.net_sales_ngwee ?? 0)}</td><td className="table-numeric">{money(entry.expected_cash_ngwee)}</td><td className="table-numeric">{entry.actual_cash_ngwee === null ? "—" : money(entry.actual_cash_ngwee)}</td><td className={`table-numeric ${entry.variance_ngwee ? "low-stock" : ""}`}>{entry.variance_ngwee === null ? "—" : money(entry.variance_ngwee)}</td></tr>)}</tbody></table></div></section>
    {action && <Modal title={action === "OPEN" ? "Open business day" : action === "CLOSE" ? "Close business day" : "Record cash movement"} eyebrow="Cash control" onClose={() => !busy && setAction(null)}><form onSubmit={submit}><div className="modal-body"><p>{action === "OPEN" ? "Enter the cash already in the drawer." : action === "CLOSE" ? `Count the drawer and enter the actual cash. Expected: ${money(expected)}.` : "Use a negative amount for cash removed and a positive amount for cash added."}</p>{action === "CLOSE" && pendingCount > 0 && <div className="notice">Sync {pendingCount} pending offline sale(s) before closing.</div>}<label className="field">{action === "OPEN" ? "Opening float" : action === "CLOSE" ? "Actual cash" : "Signed amount"}<input autoFocus inputMode="decimal" placeholder={action === "CASH" ? "-20.00" : "500.00"} value={amount} required onChange={(event) => setAmount(event.target.value)}/><small>{currencySymbol()}; for example 500.00</small></label>{action === "CASH" && <label className="field">Reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Cash removed for supplies"/></label>}<ErrorMessage error={error}/></div><div className="modal-footer"><button className="button" type="button" disabled={busy} onClick={() => setAction(null)}>Cancel</button><SubmitButton busy={busy} disabled={action === "CLOSE" && pendingCount > 0}>{action === "OPEN" ? "Open day" : action === "CLOSE" ? "Confirm close" : "Record movement"}</SubmitButton></div></form></Modal>}
  </>;
}

export function Reports({ client }: { client: POSClient }) {
  const [days, setDays] = useState<Day[]>([]);
  const [dayId, setDayId] = useState("");
  const [report, setReport] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { let current = true; setLoading(true); void client.days().then(async (found) => { const selected = dayId || found[0]?.id || ""; const result = await client.report(selected || undefined); if (current) { setDays(found); setDayId(selected); setReport(result); setError(""); } }).catch((failure) => current && setError(errorText(failure))).finally(() => current && setLoading(false)); return () => { current = false; }; }, [client, dayId]);
  return <><div className="page-heading"><div><h1>Daily report</h1><p>Sales, refunds, payment methods and product performance by business day.</p></div><label className="field">Business day<select value={dayId} onChange={(event) => setDayId(event.target.value)}>{days.map((entry) => <option key={entry.id} value={entry.id}>{dateOf(entry.opened_at)} · {readable(entry.status)}</option>)}</select></label></div><ErrorMessage error={error}/>{loading || !report ? <div className="spinner-area">Loading report…</div> : <><div className="metrics"><div className="metric accent"><span className="metric-label">Net sales</span><strong>{money(report.net_sales_ngwee)}</strong><small>Gross less full refunds</small></div><div className="metric"><span className="metric-label">Orders</span><strong>{report.order_count}</strong><small>Average {money(report.average_order_ngwee)}</small></div><div className="metric"><span className="metric-label">Gross sales</span><strong>{money(report.gross_sales_ngwee)}</strong><small>Before refunds</small></div><div className="metric"><span className="metric-label">Refunds</span><strong>{money(report.refunds_ngwee)}</strong><small>Financial reversals</small></div></div><div className="two-columns"><section className="panel"><div className="panel-head"><h2>Payment methods</h2></div><div className="panel-body"><div className="balance-row"><span>Cash</span><strong>{money(report.payment_totals.CASH)}</strong></div><div className="balance-row"><span>Mobile money · manual</span><strong>{money(report.payment_totals.MOBILE_MONEY_MANUAL)}</strong></div><div className="balance-row"><span>Card · manual</span><strong>{money(report.payment_totals.CARD_MANUAL)}</strong></div><div className="balance-row total"><span>Total net sales</span><strong>{money(report.net_sales_ngwee)}</strong></div></div></section><section className="panel"><div className="panel-head"><h2>Cash reconciliation</h2></div><div className="panel-body"><div className="balance-row"><span>Opening float</span><strong>{money(report.opening_float_ngwee)}</strong></div><div className="balance-row"><span>Cash movements</span><strong>{money(report.cash_movements_ngwee)}</strong></div><div className="balance-row"><span>Expected cash</span><strong>{money(report.expected_cash_ngwee)}</strong></div><div className="balance-row"><span>Actual cash</span><strong>{report.actual_cash_ngwee === null ? "Not closed" : money(report.actual_cash_ngwee)}</strong></div><div className="balance-row total"><span>Variance</span><strong>{report.variance_ngwee === null ? "—" : money(report.variance_ngwee)}</strong></div></div></section></div><section className="panel"><div className="panel-head"><h2>Product breakdown</h2><span className="muted"><small>Gross before refunds</small></span></div><div className="table-scroll">{report.products.length ? <table><thead><tr><th>Product</th><th className="table-numeric">Quantity</th><th className="table-numeric">Gross total</th></tr></thead><tbody>{report.products.map((product) => <tr key={product.name}><td><strong>{product.name}</strong></td><td className="table-numeric">{product.quantity}</td><td className="table-numeric"><strong>{money(product.total_ngwee)}</strong></td></tr>)}</tbody></table> : <Empty title="No sales for this day">Product totals appear after checkout.</Empty>}</div></section></>}</>;
}

interface SalesProps { client: POSClient; canManage: boolean; onReceipt: (order: Order) => void; onChanged: Changed }
export function Sales({ client, canManage, onReceipt, onChanged }: SalesProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selected, setSelected] = useState<Order | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setOrders(await client.orders()); setError(""); } catch (failure) { setError(errorText(failure)); } finally { setLoading(false); } }, [client]);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => orders.filter((order) => (status === "ALL" || order.status === status || (status === "REFUNDED" && order.refunded)) && (!search.trim() || order.number.toLowerCase().includes(search.trim().toLowerCase()) || order.lines.some((line) => line.name.toLowerCase().includes(search.trim().toLowerCase())))), [orders, search, status]);
  const submitRefund = async (event: FormEvent) => { event.preventDefault(); if (!refundOrder || busy) return; setBusy(true); try { await client.refund(refundOrder, reason); setRefundOrder(null); setReason(""); await load(); await notifyChanged(onChanged); } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); } };
  return <><div className="page-heading"><div><h1>Sales</h1><p>Recent orders remain available for review, receipts and controlled refunds.</p></div><button className="button" type="button" onClick={() => void load()}><RefreshCw size={16}/> Refresh</button></div><ErrorMessage error={error}/><div className="menu-tools"><label className="search-box">Search orders<input aria-label="Search orders" placeholder="Order number or product" value={search} onChange={(event) => setSearch(event.target.value)}/></label><select className="button" aria-label="Filter sales status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="NEW">New</option><option value="PREPARING">Preparing</option><option value="READY">Ready</option><option value="SERVED">Served</option><option value="REFUNDED">Refunded</option></select></div>{loading ? <div className="spinner-area">Loading sales…</div> : <div className="panel table-scroll"><table><thead><tr><th>Order</th><th>When</th><th>Status</th><th>Payment</th><th className="table-numeric">Total</th><th>Actions</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id}><td><strong>{order.number}</strong><div className="table-detail">{order.lines.length} line(s){order.offline ? " · Offline capture" : ""}</div></td><td>{dateOf(order.created_at)} · {timeOf(order.created_at)}</td><td><Badge tone={order.refunded ? "red" : statusTone(order.status)}>{order.refunded ? "Refunded" : readable(order.status)}</Badge></td><td>{readable(order.payment.method)}</td><td className="table-numeric"><strong>{money(order.total_ngwee)}</strong></td><td><button className="text-button" type="button" onClick={() => setSelected(order)}>Details</button><button className="text-button" type="button" onClick={() => onReceipt(order)}>Receipt</button>{canManage && !order.refunded && <button className="text-button" type="button" onClick={() => { setRefundOrder(order); setReason(""); setError(""); }}>Refund</button>}</td></tr>)}</tbody></table>{filtered.length === 0 && <Empty icon={<ReceiptText/>} title="No matching sales">Try a different order number, product or status.</Empty>}</div>}
    {selected && <Modal title={`Order ${selected.number}`} eyebrow="Sale detail" wide onClose={() => setSelected(null)}><div className="modal-body"><div className="key-value"><span>Status</span><Badge tone={selected.refunded ? "red" : statusTone(selected.status)}>{selected.refunded ? "Refunded" : readable(selected.status)}</Badge></div><div className="key-value"><span>Payment</span><strong>{readable(selected.payment.method)}</strong></div>{selected.lines.map((line, index) => <div className="key-value" key={`${line.variant_id}-${index}`}><span>{line.quantity} × {line.name}<small className="muted"> {line.modifier_names.join(" · ")}</small></span><strong>{money(line.total_ngwee)}</strong></div>)}<div className="key-value"><span>Total</span><strong>{money(selected.total_ngwee)}</strong></div>{selected.refund_reason && <div className="notice">Refund reason: {selected.refund_reason}</div>}</div><div className="modal-footer"><button className="button" type="button" onClick={() => { const order = selected; setSelected(null); onReceipt(order); }}>Open receipt</button><button className="button primary" type="button" onClick={() => setSelected(null)}>Done</button></div></Modal>}
    {refundOrder && <Modal title={`Refund ${refundOrder.number}`} eyebrow="Audited financial action" onClose={() => !busy && setRefundOrder(null)}><form onSubmit={submitRefund}><div className="modal-body"><p>Return the money using the original payment method, then record it here. This full refund reverses {money(refundOrder.total_ngwee)} in the original open business day. Stock is not returned automatically.</p><div className="notice">The original order and payment remain in the sales record. Your name and reason are added to the audit log.</div><label className="field">Required reason<textarea autoFocus required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Customer refund"/></label><ErrorMessage error={error}/></div><div className="modal-footer"><button className="button" type="button" onClick={() => setRefundOrder(null)} disabled={busy}>Cancel</button><SubmitButton busy={busy} disabled={!reason.trim()}>Confirm full refund</SubmitButton></div></form></Modal>}
  </>;
}

export function Audit({ client }: { client: POSClient }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setEvents(await client.audit()); setError(""); } catch (failure) { setError(errorText(failure)); } finally { setLoading(false); } }, [client]);
  useEffect(() => { void load(); }, [load]);
  return <><div className="page-heading"><div><h1>Audit log</h1><p>Recent security and business-sensitive actions, newest first.</p></div><button className="button" type="button" onClick={() => void load()}><RefreshCw size={16}/> Refresh</button></div><ErrorMessage error={error}/>{loading ? <div className="spinner-area">Loading audit trail…</div> : <div className="panel table-scroll"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{dateOf(event.created_at)} · {timeOf(event.created_at)}</td><td><strong>{event.actor_name}</strong><div className="table-detail">{event.actor_id}</div></td><td><Badge>{readable(event.action)}</Badge></td><td>{readable(event.entity)}<div className="table-detail">{event.entity_id}</div></td><td><code>{Object.keys(event.metadata).length ? JSON.stringify(event.metadata) : "—"}</code><div className="table-detail">Correlation {event.correlation_id}</div></td></tr>)}</tbody></table>{events.length === 0 && <Empty icon={<ClipboardList/>} title="No audit events">Sensitive actions will appear here.</Empty>}</div>}</>;
}

export function MenuAvailability({ client, onError, onChanged }: CoreProps) {
  const [products, setProducts] = useState<Awaited<ReturnType<POSClient["catalog"]>>["products"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setProducts((await client.catalog(true)).products); setError(""); }
    catch (failure) { setError(errorText(failure)); }
    finally { setLoading(false); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (productId: string, active: boolean) => {
    if (busyId) return;
    setBusyId(productId);
    try { await client.setProductActive(productId, active); await load(); await notifyChanged(onChanged); }
    catch (failure) { const message = errorText(failure); setError(message); onError(message); }
    finally { setBusyId(null); }
  };
  return <section className="panel"><div className="panel-head"><div><h2>Menu availability</h2><p className="hint-inline">Hide an unavailable product from the counter and restore it when ready.</p></div></div><ErrorMessage error={error}/>{loading ? <div className="spinner-area">Loading menu…</div> : <div className="table-scroll"><table><thead><tr><th>Product</th><th>Category</th><th>Status</th><th>Action</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><div className="table-detail">{product.variants.length} option(s)</div></td><td>{product.category}</td><td><Badge tone={product.active ? "green" : "red"}>{product.active ? "Available" : "Unavailable"}</Badge></td><td><button className="button" type="button" disabled={busyId !== null} onClick={() => void toggle(product.id, !product.active)}>{busyId === product.id ? "Updating…" : product.active ? "Mark unavailable" : "Make available"}</button></td></tr>)}</tbody></table></div>}</section>;
}

type StaffDialog = { kind: "create" } | { kind: "edit"; user: User } | { kind: "reset"; user: User } | null;

export function StaffAccounts({ client, currentUserId, onError }: { client: POSClient; currentUserId: string; onError: (message: string) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<StaffDialog>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("CASHIER");
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await client.users()); setError(""); }
    catch (failure) { const message = errorText(failure); setError(message); onError(message); }
    finally { setLoading(false); }
  }, [client, onError]);
  useEffect(() => { void load(); }, [load]);
  const openCreate = () => { setName(""); setUsername(""); setRole("CASHIER"); setActive(true); setPassword(""); setError(""); setDialog({ kind: "create" }); };
  const openEdit = (user: User) => { setName(user.name); setUsername(user.username); setRole(user.role); setActive(user.active); setError(""); setDialog({ kind: "edit", user }); };
  const openReset = (user: User) => { setPassword(""); setError(""); setDialog({ kind: "reset", user }); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!dialog || busy) return; setBusy(true); setError("");
    try {
      if (dialog.kind === "create") await client.createUser({ name, username, role, password });
      else if (dialog.kind === "edit") await client.updateUser(dialog.user.id, { name, role, active });
      else await client.resetUserPassword(dialog.user.id, password);
      setDialog(null); await load();
    } catch (failure) { const message = errorText(failure); setError(message); onError(message); }
    finally { setBusy(false); }
  };
  const revoke = async (user: User) => {
    if (busy || user.id === currentUserId) return;
    setBusy(true); setError("");
    try { await client.revokeUserSessions(user.id); await load(); }
    catch (failure) { const message = errorText(failure); setError(message); onError(message); }
    finally { setBusy(false); }
  };
  return <section className="panel" style={{marginBottom:22}}><div className="panel-head"><div><h2>Staff accounts</h2><p className="hint-inline">Create accounts, assign roles and remove access when a team member leaves.</p></div><button className="button primary" type="button" onClick={openCreate}><UserPlus size={16}/> Add staff account</button></div><ErrorMessage error={error}/>{loading ? <div className="spinner-area">Loading staff accounts…</div> : <div className="table-scroll"><table><thead><tr><th>Team member</th><th>Username</th><th>Role</th><th>Status</th><th>Account actions</th></tr></thead><tbody>{users.map((staff) => <tr key={staff.id}><td><strong>{staff.name}</strong>{staff.id === currentUserId && <div className="table-detail">Your account</div>}</td><td>{staff.username}</td><td><Badge>{readable(staff.role)}</Badge></td><td><Badge tone={staff.active ? "green" : "red"}>{staff.active ? "Active" : "Inactive"}</Badge></td><td><div className="heading-aside" style={{justifyContent:"flex-start"}}><button className="text-button" type="button" onClick={() => openEdit(staff)} aria-label={`Edit ${staff.name}`}>Edit</button><button className="text-button" type="button" onClick={() => openReset(staff)} aria-label={`Reset password for ${staff.name}`}><KeyRound size={14}/> Reset password</button><button className="text-button" type="button" disabled={staff.id === currentUserId || busy} onClick={() => void revoke(staff)} aria-label={`Sign out ${staff.name} from all devices`}>Sign out devices</button></div></td></tr>)}</tbody></table></div>}
  {dialog && <Modal title={dialog.kind === "create" ? "Add staff account" : dialog.kind === "edit" ? `Edit ${dialog.user.name}` : `Reset ${dialog.user.name}'s password`} eyebrow="Owner administration" onClose={() => !busy && setDialog(null)}><form onSubmit={submit}><div className="modal-body">{dialog.kind !== "reset" && <><label className="field">Full name<input aria-label="Full name" autoFocus required value={name} onChange={(event) => setName(event.target.value)}/></label>{dialog.kind === "create" && <label className="field">Username<input aria-label="Username" required autoCapitalize="none" autoCorrect="off" value={username} onChange={(event) => setUsername(event.target.value)}/><small>Letters, numbers, dots, hyphens and underscores only.</small></label>}<label className="field">Role<select aria-label="Role" value={role} disabled={dialog.kind === "edit" && dialog.user.id === currentUserId} onChange={(event) => setRole(event.target.value as Role)}><option value="CASHIER">Cashier</option><option value="SERVER">Server</option><option value="MANAGER">Manager</option><option value="OWNER_ADMIN">Owner administrator</option></select></label>{dialog.kind === "edit" && <label className="choice"><span><strong>Account active</strong><small>Inactive staff cannot sign in.</small></span><input type="checkbox" aria-label="Account active" checked={active} disabled={dialog.user.id === currentUserId} onChange={(event) => setActive(event.target.checked)}/></label>}</>}{dialog.kind !== "edit" && <label className="field">{dialog.kind === "create" ? "Temporary password" : "New temporary password"}<input aria-label={dialog.kind === "create" ? "Temporary password" : "New temporary password"} type="password" required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)}/><small>Use at least 12 characters and share it privately.</small></label>}<ErrorMessage error={error}/></div><div className="modal-footer"><button className="button" type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><SubmitButton busy={busy}>{dialog.kind === "create" ? "Create account" : dialog.kind === "edit" ? "Save account changes" : "Reset password"}</SubmitButton></div></form></Modal>}
  </section>;
}

export function AccountPassword({ client, onClose, onChanged }: { client: POSClient; onClose: () => void; onChanged: (otherSessionsRevoked: number) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (newPassword !== confirmation) { setError("The new passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const result = await client.changePassword(currentPassword, newPassword);
      onChanged(result.other_sessions_revoked);
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return <Modal title="Change your password" eyebrow="Account security" onClose={() => !busy && onClose()}><form onSubmit={submit}><div className="modal-body"><p>Choose a unique password with at least 12 characters. Other signed-in devices will be signed out.</p><label className="field">Current password<input aria-label="Current password" autoFocus type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)}/></label><label className="field">New password<input aria-label="New password" type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)}/></label><label className="field">Confirm new password<input aria-label="Confirm new password" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)}/></label><ErrorMessage error={error}/></div><div className="modal-footer"><button className="button" type="button" disabled={busy} onClick={onClose}>Cancel</button><SubmitButton busy={busy}>Update password</SubmitButton></div></form></Modal>;
}
