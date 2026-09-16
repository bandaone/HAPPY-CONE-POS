import { POSAPIError } from "./client";
import type { CheckoutCommand, Order, POSClient } from "./types";

const DATABASE_NAME = "happy-cone-offline";
const STORE_NAME = "checkouts";
const DATABASE_VERSION = 1;

export interface PendingCheckout {
  id: string;
  user_id: string;
  command: CheckoutCommand;
  status: "PENDING" | "REJECTED";
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncPendingResult {
  synced: Array<{ pending: PendingCheckout; order: Order }>;
  rejected: PendingCheckout[];
  remaining: PendingCheckout[];
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function key(userId: string, idempotencyKey: string): string { return `${userId}:${idempotencyKey}`; }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([name, child]) => `${JSON.stringify(name)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Offline storage unavailable; order has not been saved"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!store.indexNames.contains("user_id")) store.createIndex("user_id", "user_id", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage could not be opened"));
    request.onblocked = () => reject(new Error("Offline storage upgrade was blocked by another tab"));
  });
}

async function getOne(recordId: string): Promise<PendingCheckout | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(recordId);
      request.onsuccess = () => resolve(request.result as PendingCheckout | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

async function put(record: PendingCheckout): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline checkout could not be saved"));
    });
  } finally { database.close(); }
}

async function remove(recordId: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(recordId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Synced checkout could not be removed"));
    });
  } finally { database.close(); }
}

export async function enqueueCheckout(userId: string, command: CheckoutCommand): Promise<PendingCheckout> {
  if (!userId.trim()) throw new Error("A user is required for an offline checkout");
  if (command.payment.method !== "CASH") throw new POSAPIError("Only cash checkout can be queued offline", 422);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(command.idempotency_key)) throw new POSAPIError("Enter a valid idempotency key", 422);
  const normalized: CheckoutCommand = clone({ ...command, offline: true });
  const recordId = key(userId, normalized.idempotency_key);
  const existing = await getOne(recordId);
  if (existing) {
    if (stable(existing.command) !== stable(normalized)) throw new POSAPIError("Idempotency key was already queued with a different checkout payload", 409);
    return clone(existing);
  }
  const timestamp = new Date().toISOString();
  const pending: PendingCheckout = {
    id: recordId, user_id: userId, command: normalized, status: "PENDING", attempts: 0,
    error: null, created_at: timestamp, updated_at: timestamp,
  };
  await put(pending);
  return clone(pending);
}

export async function listPending(userId: string): Promise<PendingCheckout[]> {
  if (!userId.trim()) return [];
  const database = await openDatabase();
  try {
    const records = await new Promise<PendingCheckout[]>((resolve, reject) => {
      const store = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
      const request = store.index("user_id").getAll(userId);
      request.onsuccess = () => resolve(request.result as PendingCheckout[]);
      request.onerror = () => reject(request.error);
    });
    return records.sort((a, b) => a.created_at.localeCompare(b.created_at)).map(clone);
  } finally { database.close(); }
}

export async function syncPending(userId: string, client: Pick<POSClient, "checkout">): Promise<SyncPendingResult> {
  const synced: SyncPendingResult["synced"] = [];
  const rejected: PendingCheckout[] = [];
  const queued = await listPending(userId);
  for (const pending of queued) {
    if (pending.status === "REJECTED") { rejected.push(pending); continue; }
    try {
      const order = await client.checkout(clone(pending.command));
      await remove(pending.id);
      synced.push({ pending, order });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checkout sync failed";
      const status = error instanceof POSAPIError ? error.status : 0;
      const isTerminalRejection = status >= 400 && status < 500 && ![401, 408, 429].includes(status);
      const updated: PendingCheckout = {
        ...pending, status: isTerminalRejection ? "REJECTED" : "PENDING", attempts: pending.attempts + 1,
        error: message, updated_at: new Date().toISOString(),
      };
      await put(updated);
      if (updated.status === "REJECTED") rejected.push(updated);
      if (!isTerminalRejection) break;
    }
  }
  return { synced, rejected, remaining: await listPending(userId) };
}
