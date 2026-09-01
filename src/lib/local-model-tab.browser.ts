// src/lib/local-model-tab.browser.ts
// Runs inside the browser tab, loading the user's GGUF model via wllama.
// The selected model is persisted in IndexedDB by local-model-store.browser.ts
// so a page refresh does not require selecting the file again.

import { Wllama } from "@wllama/wllama";
import { loadActiveModel, saveActiveModel, clearActiveModel } from "@/lib/local-model-store.browser";

const DEVICE_ID_KEY = "aem_device_id";

export function pickModelFileFromDevice(): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".gguf";
    input.multiple = true;
    input.onchange = () => {
      if (input.files?.length) resolve(Array.from(input.files));
      else reject(new Error("No file selected"));
    };
    input.click();
  });
}

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

async function relay(body: Record<string, unknown>) {
  const res = await fetch("/api/hub-relay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function startLocalModelTab(
  modelSource: string | File[],
  onStatus?: (s: string) => void,
) {
  const deviceId = getOrCreateDeviceId();
  onStatus?.("Preparing model loader…");

  const wllama = new Wllama({ default: "/wllama/wllama.wasm" });
  const isUrlSource = typeof modelSource === "string";

  const progressCallback = ({ loaded, total }: { loaded: number; total: number }) => {
    const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
    onStatus?.(`Loading model: ${pct}% (${mb(loaded)}MB / ${mb(total)}MB)`);
  };

  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  if (!isUrlSource) {
    const startedAt = Date.now();
    elapsedTimer = setInterval(() => {
      const secs = Math.round((Date.now() - startedAt) / 1000);
      onStatus?.(`Loading model… ${secs}s elapsed (larger files can take a few minutes on mobile)`);
    }, 1000);
  }

  try {
    if (isUrlSource) {
      await wllama.loadModelFromUrl(modelSource, { n_ctx: 2048, progressCallback });
    } else {
      await wllama.loadModel(modelSource, { n_ctx: 2048, progressCallback });
      // Persist only after a successful load. This is removable persistent
      // storage, not a permanent/immutable installation.
      await saveActiveModel(modelSource);
    }
  } finally {
    if (elapsedTimer) clearInterval(elapsedTimer);
  }

  onStatus?.(`Model loaded — connected as ${deviceId.slice(0, 8)}…`);

  let stopped = false;
  const heartbeat = setInterval(() => {
    if (!stopped) relay({ action: "heartbeat", deviceId }).catch(() => {});
  }, 30_000);

  (async () => {
    while (!stopped) {
      try {
        const { job } = await relay({ action: "poll", deviceId });
        if (!job) continue;
        onStatus?.("Thinking…");
        try {
          const completion = await wllama.createChatCompletion({
            messages: [{ role: "user", content: job.prompt }],
            temperature: 0.4,
            max_tokens: 512,
          });
          const answer = completion.choices?.[0]?.message?.content ?? "";
          await relay({ action: "answer", deviceId, jobId: job.id, answer });
          onStatus?.("Idle — ready for the next request.");
        } catch (err) {
          await relay({ action: "answer", deviceId, jobId: job.id, error: `[local model error: ${(err as Error).message}]` });
        }
      } catch {
        onStatus?.("Connection hiccup — retrying…");
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  })();

  return {
    deviceId,
    wllama,
    stop() {
      stopped = true;
      clearInterval(heartbeat);
    },
  };
}

export async function startPersistedLocalModelTab(onStatus?: (s: string) => void) {
  const files = await loadActiveModel();
  if (!files?.length) return null;
  onStatus?.("Restoring saved local model…");
  return startLocalModelTab(files, onStatus);
}

export async function removePersistedLocalModel() {
  await clearActiveModel();
}
