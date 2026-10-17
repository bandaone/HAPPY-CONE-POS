import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, BarChart3, Boxes, Eye, EyeOff, LogOut, RefreshCw, Store as StoreIcon } from "lucide-react";

import { supabaseSource, type DashboardData, type DashboardSource, type DashboardUser } from "./data";

const empty: DashboardData = { stores: [], days: [], inventory: [] };
const readable = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const money = (ngwee: number, symbol = "K") => `${symbol}${(ngwee / 100).toFixed(2)}`;

function SignIn({ source, onSignedIn }: { source: DashboardSource; onSignedIn: (user: DashboardUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await source.signIn(email, password);
      onSignedIn({ email });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Sign in failed.");
    } finally { setBusy(false); }
  };
  return <main className="login-shell">
    <section className="login-card">
      <div className="brand-mark">HC</div>
      <span className="eyebrow">Private owner reporting</span>
      <h1>See how the stand is doing.</h1>
      <p>Sales, cash and stock updates from Happy Cone. This view cannot change anything at the counter.</p>
      <form onSubmit={submit}>
        <label>Email<input aria-label="Email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)}/></label>
        <label>Password<div className="password-field"><input aria-label="Password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)}/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </section>
  </main>;
}

function Report({ data, onRefresh, onSignOut }: { data: DashboardData; onRefresh: () => void; onSignOut: () => void }) {
  const [storeId, setStoreId] = useState(data.stores[0]?.store_id ?? "");
  const store = data.stores.find((item) => item.store_id === storeId) ?? data.stores[0];
  const days = data.days.filter((day) => day.store_id === store?.store_id);
  const [dayId, setDayId] = useState(days[0]?.business_day_id ?? "");
  const day = days.find((item) => item.business_day_id === dayId) ?? days[0];
  const report = day?.summary as any;
  const inventory = data.inventory.filter((item) => !item.store_id || item.store_id === store?.store_id);
  const stale = store ? Date.now() - new Date(store.last_synced_at).getTime() > 15 * 60 * 1000 : true;
  const symbol = store?.currency_symbol ?? "K";
  const maxHourly = Math.max(1, ...(report?.hourly_sales ?? []).map((item: any) => item.net_sales_ngwee));
  if (!store) return <main className="empty-page"><h1>No store assigned</h1><p>Ask the Supabase administrator to assign your owner account to a store.</p><button onClick={onSignOut}>Sign out</button></main>;
  return <div className="dashboard-shell">
    <header className="topbar">
      <div className="identity"><div className="brand-mark small">HC</div><div><span>Happy Cone</span><strong>Owner view</strong></div></div>
      <div className="top-actions"><button onClick={onRefresh}><RefreshCw size={16}/>Refresh</button><button onClick={onSignOut}><LogOut size={16}/>Sign out</button></div>
    </header>
    <main>
      <section className="page-head">
        <div><span className="eyebrow">One store · Read only</span><h1>{store.stand_name}</h1><p>{store.location} · Updated {new Date(store.last_synced_at).toLocaleString()}</p></div>
        <div className="filters">
          {data.stores.length > 1 && <label>Store<select value={store.store_id} onChange={(event) => { setStoreId(event.target.value); setDayId(""); }}>{data.stores.map((item) => <option key={item.store_id} value={item.store_id}>{item.stand_name}</option>)}</select></label>}
          <label>Business day<select aria-label="Business day" value={day?.business_day_id ?? ""} onChange={(event) => setDayId(event.target.value)}>{days.map((item) => <option key={item.business_day_id} value={item.business_day_id}>{new Date(item.opened_at).toLocaleDateString()} · {item.closed_at ? "Closed" : "Open"}</option>)}</select></label>
        </div>
      </section>
      {stale && <div className="stale-banner" role="status"><AlertTriangle size={18}/><div><strong>The last update is old.</strong><span>The shop can keep selling offline. Figures will catch up when its internet connection returns.</span></div></div>}
      {!report ? <section className="panel empty-panel"><StoreIcon/><h2>No business day data yet</h2><p>The dashboard will fill after the shop completes its first synchronized action.</p></section> : <>
        <section className="metrics">
          <article className="metric hero"><span>Net sales</span><strong>{money(report.net_sales_ngwee, symbol)}</strong><small>{report.completed_sale_count} completed sales</small></article>
          <article className="metric"><span>Items sold</span><strong>{report.units_sold}</strong><small>Average {money(report.average_order_ngwee, symbol)}</small></article>
          <article className="metric"><span>Expected cash</span><strong>{money(report.expected_cash_ngwee, symbol)}</strong><small>{report.actual_cash_ngwee == null ? "Day still open" : `Counted ${money(report.actual_cash_ngwee, symbol)}`}</small></article>
          <article className="metric"><span>Waste value</span><strong>{money((report.waste ?? []).reduce((sum: number, item: any) => sum + item.value_ngwee, 0), symbol)}</strong><small>{(report.waste ?? []).length} records</small></article>
        </section>
        <div className="grid two">
          <section className="panel"><header><div><span className="eyebrow">How customers paid</span><h2>Payment split</h2></div><BarChart3/></header>{[["Cash","CASH"],["Mobile money","MOBILE_MONEY_MANUAL"],["Card","CARD_MANUAL"]].map(([label,key]) => <div className="value-row" key={key}><span>{label}</span><strong>{money(report.payment_totals[key] ?? 0, symbol)}</strong></div>)}</section>
          <section className="panel"><header><div><span className="eyebrow">Sales through the day</span><h2>Hourly trend</h2></div></header><div className="hour-chart">{(report.hourly_sales ?? []).map((item: any) => <div className="hour" key={item.hour}><div className="bar-track"><span style={{ height: `${Math.max(8, item.net_sales_ngwee / maxHourly * 100)}%` }}/></div><strong>{item.hour}</strong><small>{money(item.net_sales_ngwee, symbol)}</small></div>)}</div></section>
        </div>
        <div className="grid two">
          <section className="panel"><header><div><span className="eyebrow">What sold</span><h2>Top items</h2></div></header>{(report.products ?? []).map((item: any) => <div className="value-row" key={item.name}><span><strong>{item.name}</strong><small>{item.quantity} sold</small></span><strong>{money(item.total_ngwee, symbol)}</strong></div>)}</section>
          <section className="panel"><header><div><span className="eyebrow">Expected on hand</span><h2>Stock</h2></div><Boxes/></header>{inventory.map((item) => { const low = Number(item.on_hand) <= Number(item.low_stock_threshold); return <div className="value-row" key={item.id}><span><strong>{item.name}</strong><small>{low ? "Low stock" : "Available"}</small></span><strong className={low ? "danger" : ""}>{item.on_hand} {item.unit}</strong></div>; })}</section>
        </div>
        <section className="panel"><header><div><span className="eyebrow">Losses recorded by staff</span><h2>Waste</h2></div></header>{(report.waste ?? []).length ? (report.waste ?? []).map((item: any) => <div className="waste-row" key={item.id}><span><strong>{item.label}</strong><small>{readable(item.reason)} · {item.actor_name}</small></span><span>{item.quantity}</span><strong>{money(item.value_ngwee, symbol)}</strong></div>) : <p className="muted">No waste recorded for this day.</p>}</section>
        {report.actual_cash_ngwee != null && <section className="panel cash-close"><span>Closing cash variance</span><strong className={report.variance_ngwee === 0 ? "" : "danger"}>{money(report.variance_ngwee, symbol)}</strong></section>}
      </>}
    </main>
  </div>;
}

export function DashboardApp({ source = supabaseSource }: { source?: DashboardSource }) {
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [data, setData] = useState<DashboardData>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    try { setData(await source.load()); setError(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Reports could not be loaded."); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    source.session().then(async (session) => {
      if (!active) return;
      setUser(session);
      if (session) await load();
      else setLoading(false);
    }).catch((failure) => { if (active) { setError(String(failure)); setLoading(false); } });
    const unsubscribe = source.onAuthChange((session) => setUser(session));
    return () => { active = false; unsubscribe(); };
  }, [source]);
  const content = useMemo(() => {
    if (!user) return <SignIn source={source} onSignedIn={async (nextUser) => { setUser(nextUser); await load(); }}/>;
    if (loading) return <main className="loading">Loading owner report…</main>;
    if (error) return <main className="empty-page"><h1>Reports unavailable</h1><p>{error}</p><button onClick={() => void load()}>Try again</button></main>;
    return <Report data={data} onRefresh={() => void load()} onSignOut={async () => { await source.signOut(); setUser(null); setData(empty); }}/>;
  }, [user, loading, error, data, source]);
  return content;
}
