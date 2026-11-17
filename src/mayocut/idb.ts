// MayoCut local storage layer — IndexedDB.
// The user's device IS the database. Nothing is sent to any server.

import type { ExportItem, MediaItem, Project, UserTemplate } from "../types";

const DB_NAME = "mayocut-db";
const DB_VERSION = 1;
const STORES = ["media", "blobs", "projects", "templates", "exports"] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open Mayocut local storage"));
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
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
  listProjects: (): Promise<Project[]> => tx("projects", "readonly", (s) => s.getAll() as IDBRequest),
  saveProject: (p: Project): Promise<unknown> => tx("projects", "readwrite", (s) => s.put(p)),
  getProject: (id: string): Promise<Project | undefined> => tx("projects", "readonly", (s) => s.get(id)),
  deleteProject: (id: string): Promise<unknown> => tx("projects", "readwrite", (s) => s.delete(id)),

  // --- user templates ---
  listTemplates: (): Promise<UserTemplate[]> => tx("templates", "readonly", (s) => s.getAll() as IDBRequest),
  saveTemplate: (t: UserTemplate): Promise<unknown> => tx("templates", "readwrite", (s) => s.put(t)),
  deleteTemplate: (id: string): Promise<unknown> => tx("templates", "readwrite", (s) => s.delete(id)),

  // --- exports ---
  listExports: (): Promise<ExportItem[]> => tx("exports", "readonly", (s) => s.getAll() as IDBRequest),
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
