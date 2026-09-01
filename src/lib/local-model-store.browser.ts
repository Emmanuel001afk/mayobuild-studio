// src/lib/local-model-store.browser.ts
// Persistent, removable browser-side storage for the active GGUF model.
// Model bytes remain on the user's device. IndexedDB survives page reloads.

const DB_NAME = "mayobuild-local-model";
const DB_VERSION = 1;
const STORE_NAME = "models";
const ACTIVE_KEY = "active";

interface StoredModelPart {
  key: string;
  index: number;
  name: string;
  type: string;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local model storage"));
  });
}

export async function saveActiveModel(files: File[]): Promise<void> {
  if (!files.length) throw new Error("No model files to store");
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        files.forEach((file, index) => store.put({
          key: `${ACTIVE_KEY}:${index}`,
          index,
          name: file.name,
          type: file.type || "application/octet-stream",
          blob: file,
        } satisfies StoredModelPart));
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not store local model"));
    tx.onabort = () => reject(tx.error ?? new Error("Local model storage was aborted"));
  });
  db.close();
}

export async function loadActiveModel(): Promise<File[] | null> {
  const db = await openDb();
  const records = await new Promise<StoredModelPart[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as StoredModelPart[]).sort((a, b) => a.index - b.index));
    request.onerror = () => reject(request.error ?? new Error("Could not read local model"));
  });
  db.close();
  if (!records.length) return null;
  return records.map((r) => new File([r.blob], r.name, { type: r.type }));
}

export async function clearActiveModel(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not remove local model"));
    tx.onabort = () => reject(tx.error ?? new Error("Local model removal was aborted"));
  });
  db.close();
}
