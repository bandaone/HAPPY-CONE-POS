import { createClient } from "@supabase/supabase-js";

export interface DashboardUser { email: string }
export interface Store {
  store_id: string; name: string; stand_name: string; location: string;
  currency_symbol: string; timezone: string; last_synced_at: string;
}
export interface DayRow {
  store_id: string; business_day_id: string; opened_at: string;
  closed_at: string | null; summary: Record<string, any>;
}
export interface InventoryRow {
  store_id?: string; id: string; name: string; unit: string; on_hand: string;
  low_stock_threshold: string; active: boolean;
}
export interface DashboardData {
  stores: Store[]; days: DayRow[]; inventory: InventoryRow[];
}
export interface DashboardSource {
  session(): Promise<DashboardUser | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  load(): Promise<DashboardData>;
  onAuthChange(callback: (user: DashboardUser | null) => void): () => void;
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const client = url && key ? createClient(url, key) : null;

function configuredClient() {
  if (!client) throw new Error("Owner reporting is not configured on this deployment.");
  return client;
}

export const supabaseSource: DashboardSource = {
  async session() {
    const { data, error } = await configuredClient().auth.getSession();
    if (error) throw error;
    return data.session?.user.email ? { email: data.session.user.email } : null;
  },
  async signIn(email, password) {
    const { error } = await configuredClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async signOut() {
    const { error } = await configuredClient().auth.signOut();
    if (error) throw error;
  },
  async load() {
    const database = configuredClient();
    const [stores, days, inventory] = await Promise.all([
      database.from("reporting_stores").select("store_id,name,stand_name,location,currency_symbol,timezone,last_synced_at").order("stand_name"),
      database.from("reporting_days").select("store_id,business_day_id,opened_at,closed_at,summary").order("opened_at", { ascending: false }).limit(90),
      database.from("reporting_inventory").select("store_id,items"),
    ]);
    for (const result of [stores, days, inventory]) if (result.error) throw result.error;
    return {
      stores: (stores.data ?? []) as Store[],
      days: (days.data ?? []) as DayRow[],
      inventory: (inventory.data ?? []).flatMap((row: any) =>
        (row.items ?? []).map((item: InventoryRow) => ({ ...item, store_id: row.store_id })),
      ),
    };
  },
  onAuthChange(callback) {
    const { data } = configuredClient().auth.onAuthStateChange((_event, session) => {
      callback(session?.user.email ? { email: session.user.email } : null);
    });
    return () => data.subscription.unsubscribe();
  },
};
