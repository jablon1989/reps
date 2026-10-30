import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "./api";
import { idbGet, idbSet } from "./idb";
import { useSync, type Change } from "./sync";
import type { Docs } from "./types";

type Kind = keyof Docs;
type DocOf<K extends Kind> = Docs[K][number];

const EMPTY: Docs = { routine: [], body: [], goal: [], note: [], plan: [] };

interface DocsState {
  docs: Docs;
  loaded: boolean;
  get: <K extends Kind>(kind: K, id: string) => DocOf<K> | undefined;
  /** Save / delete: on the phone at once, sent by the sync queue (works offline). */
  put: <K extends Kind>(kind: K, doc: DocOf<K>) => void;
  remove: (kind: Kind, id: string) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<DocsState | null>(null);

export function useDocs(): DocsState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useDocs outside DocsProvider");
  return s;
}

function upsert<K extends Kind>(docs: Docs, kind: K, doc: DocOf<K>): Docs {
  const list = (docs[kind] as DocOf<K>[]).filter((d) => d.id !== doc.id);
  return { ...docs, [kind]: [...list, doc] };
}

function without(docs: Docs, kind: Kind, id: string): Docs {
  return { ...docs, [kind]: (docs[kind] as { id: string }[]).filter((d) => d.id !== id) };
}

/** Lay changes that haven't reached the server yet over the server's documents. */
export function applyWaitingDocs(docs: Docs, waiting: Change[]): Docs {
  let out = docs;
  for (const c of waiting) {
    const m = c.path.match(/^\/docs\/(\w+)\/([^/?]+)$/);
    if (!m || !(m[1] in EMPTY)) continue;
    const kind = m[1] as Kind;
    const id = decodeURIComponent(m[2]);
    out =
      c.method === "DELETE" ? without(out, kind, id) : upsert(out, kind, { ...(c.body as object), id } as DocOf<Kind>);
  }
  return out;
}

/** Routines, body measurements, goals, day notes and day plans. */
export function DocsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const sync = useSync();
  const key = sync.storeKey("docs");
  const [docs, setDocs] = useState<Docs>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const keep = useCallback(
    (next: Docs) => {
      setDocs(next);
      idbSet(key, next);
    },
    [key],
  );

  const load = useCallback(async () => {
    try {
      keep(applyWaitingDocs({ ...EMPTY, ...(await api.docs()) }, sync.waiting()));
      setLoaded(true);
    } catch {
      /* no signal: the phone's copy stays */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, keep]);

  useEffect(() => {
    let stale = false;
    idbGet<Docs>(key).then((cached) => {
      if (cached && !stale) {
        setDocs((d) => (d === EMPTY ? applyWaitingDocs({ ...EMPTY, ...cached }, sync.waiting()) : d));
        setLoaded(true);
      }
    });
    load();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load]);

  const value = useMemo<DocsState>(
    () => ({
      docs,
      loaded,
      get: (kind, id) => (docs[kind] as { id: string }[]).find((d) => d.id === id) as never,
      put: (kind, doc) => {
        setDocs((d) => {
          const next = upsert(d, kind, doc);
          idbSet(key, next);
          return next;
        });
        const { id, ...body } = doc as { id: string };
        sync.queue({ method: "PUT", path: `/docs/${kind}/${encodeURIComponent(id)}`, body });
      },
      remove: (kind, id) => {
        setDocs((d) => {
          const next = without(d, kind, id);
          idbSet(key, next);
          return next;
        });
        sync.queue({ method: "DELETE", path: `/docs/${kind}/${encodeURIComponent(id)}` });
      },
      reload: load,
    }),
    [docs, loaded, key, sync, load],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
