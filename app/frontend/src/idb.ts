/**
 * A tiny key-value store in IndexedDB: the app's data kept on the phone, so it
 * opens and works without signal. Falls back to memory when IndexedDB isn't
 * there (private mode in some browsers): the app works, just not offline.
 */
const DB = "reps";
const STORE = "kv";

let opening: Promise<IDBDatabase | null> | undefined;
const memory = new Map<string, unknown>();

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  if (!db) return memory.get(key) as T | undefined;
  return run<T>("readonly", (s) => s.get(key));
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  if (!db) {
    memory.set(key, value);
    return;
  }
  await run("readwrite", (s) => s.put(value, key));
}

/** Remove every key starting with `prefix` (e.g. one person's data at log-out). */
export async function idbClear(prefix: string): Promise<void> {
  for (const k of [...memory.keys()]) if (k.startsWith(prefix)) memory.delete(k);
  const keys = (await run<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) ?? [];
  await Promise.all(keys.filter((k) => String(k).startsWith(prefix)).map((k) => run("readwrite", (s) => s.delete(k))));
}
