// MayoCut local storage layer — IndexedDB.
// The user's device IS the database. Nothing is sent to any server.

import type { ExportItem, MediaItem, Project, UserTemplate } from "./types";
import type { LutRecord } from "./luts";

const DB_NAME = "mayocut-db";
const DB_VERSION = 3;
const STORES = ["media", "blobs", "projects", "templates", "exports", "luts", "fonts"] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // A second tab upgrading the schema would otherwise block for ever on a
      // connection nobody closes, making every later write fail silently.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null; // allow a retry after a transient failure
      reject(req.error ?? new Error("Failed to open Mayocut local storage"));
    };
  }).catch((e: unknown) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

/**
 * Ask the browser to keep this data.
 *
 * Without this, IndexedDB lives in the "best-effort" bucket: browsers evict it
 * under storage pressure, and on Android/iOS closing the tab for a while can
 * be enough. That is the "I came back and my media was gone" report. Asking is
 * not guaranteed (the browser may decline, especially in private mode) but it
 * is the only lever we have, and it must be asked for once at startup while
 * still handling a user gesture.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Bytes used / available, for the storage meter. */
export async function storageUsage(): Promise<{ used: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est) return null;
    return { used: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return null;
  }
}

function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const db = {
  // --- media ---
  listMedia: (): Promise<MediaItem[]> => tx("media", "readonly", (s) => s.getAll() as IDBRequest),
  putMedia: (item: MediaItem, blob: Blob): Promise<unknown> =>
    open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(["media", "blobs"], "readwrite");
          t.objectStore("media").put(item);
          t.objectStore("blobs").put({ id: item.id, blob });
          t.oncomplete = () => resolve(undefined);
          t.onerror = () => reject(t.error);
        }),
    ),
  getBlob: (id: string): Promise<Blob | undefined> =>
    tx<{ id: string; blob: Blob } | undefined>("blobs", "readonly", (s) => s.get(id)).then(
      (r) => r?.blob,
    ),
  // --- preview proxies (never used for export) ---
  getProxy: (mediaId: string): Promise<Blob | undefined> =>
    tx<{ id: string; blob: Blob } | undefined>("blobs", "readonly", (s) =>
      s.get(`proxy_${mediaId}`),
    ).then((r) => r?.blob),
  putProxy: (mediaId: string, blob: Blob): Promise<unknown> =>
    tx("blobs", "readwrite", (s) => s.put({ id: `proxy_${mediaId}`, blob })),
  deleteProxy: (mediaId: string): Promise<unknown> =>
    tx("blobs", "readwrite", (s) => s.delete(`proxy_${mediaId}`)),
  /** Store a blob with a custom id (TTS model files) without touching the media store. */
  putRawBlob: (id: string, blob: Blob): Promise<void> =>
    tx("blobs", "readwrite", (s) => s.put({ id, blob })) as Promise<void>,
  deleteMedia: (id: string): Promise<unknown> =>
    open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(["media", "blobs"], "readwrite");
          t.objectStore("media").delete(id);
          t.objectStore("blobs").delete(id);
          t.oncomplete = () => resolve(undefined);
          t.onerror = () => reject(t.error);
        }),
    ),

  // --- projects ---
  listProjects: (): Promise<Project[]> =>
    tx("projects", "readonly", (s) => s.getAll() as IDBRequest),
  saveProject: (p: Project): Promise<unknown> => tx("projects", "readwrite", (s) => s.put(p)),
  getProject: (id: string): Promise<Project | undefined> =>
    tx("projects", "readonly", (s) => s.get(id)),
  deleteProject: (id: string): Promise<unknown> => tx("projects", "readwrite", (s) => s.delete(id)),

  // --- user templates ---
  listTemplates: (): Promise<UserTemplate[]> =>
    tx("templates", "readonly", (s) => s.getAll() as IDBRequest),
  saveTemplate: (t: UserTemplate): Promise<unknown> =>
    tx("templates", "readwrite", (s) => s.put(t)),
  deleteTemplate: (id: string): Promise<unknown> =>
    tx("templates", "readwrite", (s) => s.delete(id)),

  // --- imported LUTs (.cube) ---
  listLuts: (): Promise<LutRecord[]> => tx("luts", "readonly", (s) => s.getAll() as IDBRequest),
  saveLut: (r: LutRecord): Promise<unknown> => tx("luts", "readwrite", (s) => s.put(r)),
  deleteLut: (id: string): Promise<unknown> => tx("luts", "readwrite", (s) => s.delete(id)),

  // --- imported fonts (ttf/otf bytes, kept on-device) ---
  listFonts: (): Promise<{ id: string; family: string; name: string; blob: Blob }[]> =>
    tx("fonts", "readonly", (s) => s.getAll() as IDBRequest),
  saveFont: (f: { id: string; family: string; name: string; blob: Blob }): Promise<unknown> =>
    tx("fonts", "readwrite", (s) => s.put(f)),
  deleteFont: (id: string): Promise<unknown> => tx("fonts", "readwrite", (s) => s.delete(id)),

  // --- exports ---
  listExports: (): Promise<ExportItem[]> =>
    tx("exports", "readonly", (s) => s.getAll() as IDBRequest),
  saveExport: (item: ExportItem, blob: Blob): Promise<unknown> =>
    open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(["exports", "blobs"], "readwrite");
          t.objectStore("exports").put(item);
          // export blobs stored in the same blob store, id-prefixed
          t.objectStore("blobs").put({ id: `exp_${item.id}`, blob });
          t.oncomplete = () => resolve(undefined);
          t.onerror = () => reject(t.error);
        }),
    ),
  getExportBlob: (id: string): Promise<Blob | undefined> =>
    tx<{ id: string; blob: Blob } | undefined>("blobs", "readonly", (s) => s.get(`exp_${id}`)).then(
      (r) => r?.blob,
    ),
  deleteExport: (id: string): Promise<unknown> =>
    open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(["exports", "blobs"], "readwrite");
          t.objectStore("exports").delete(id);
          t.objectStore("blobs").delete(`exp_${id}`);
          t.oncomplete = () => resolve(undefined);
          t.onerror = () => reject(t.error);
        }),
    ),
};
