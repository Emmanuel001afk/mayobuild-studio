// src/lib/local-model-tab.browser.ts
// Runs INSIDE your open browser tab (not on the server). Loads your
// downloaded .gguf model via wllama, then long-polls /api/hub-relay for
// prompts the hub wants answered. Keep this tab open (it can be
// minimized/backgrounded) for the local model to stay reachable.

import { Wllama } from "@wllama/wllama";

const DEVICE_ID_KEY = "aem_device_id";

/** Opens the phone's normal file picker, filtered to .gguf files, so the
 * already-downloaded model can be selected directly — no re-download. */
export function pickModelFileFromDevice(): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".gguf";
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

  const wllama = new Wllama({
    default: "/wllama/",
    "single-thread/wllama.wasm": "/wllama/wllama.wasm",
    "multi-thread/wllama.wasm": "/wllama/wllama.wasm",
  });

  // Real progress now, instead of one static message the whole time —
  // this reports actual bytes loaded so a genuine hang looks different
  // from a slow-but-working load.
  const startedAt = Date.now();
  const progressCallback = ({ loaded, total }: { loaded: number; total: number }) => {
    const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
    const secs = Math.round((Date.now() - startedAt) / 1000);
    onStatus?.(`Loading model: ${pct}% (${mb(loaded)}MB / ${mb(total)}MB) — ${secs}s elapsed`);
  };

  const loadOpts = { n_ctx: 2048, progressCallback };

  // Two ways in: a URL (re-downloads the file), or File objects picked
  // directly from the phone's own storage (no re-download, no hosting).
  if (typeof modelSource === "string") {
    await wllama.loadModelFromUrl(modelSource, loadOpts);
  } else {
    await wllama.loadModel(modelSource, loadOpts);
  }

  onStatus?.(`Model loaded — connected as ${deviceId.slice(0, 8)}…`);

  let stopped = false;

  // Heartbeat so the hub knows this tab is alive even while idle.
  const heartbeat = setInterval(() => {
    if (!stopped) relay({ action: "heartbeat", deviceId }).catch(() => {});
  }, 30_000);

  // Long-poll loop: ask for work, answer it, repeat.
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
          await relay({
            action: "answer",
            deviceId,
            jobId: job.id,
            error: `[local model error: ${(err as Error).message}]`,
          });
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
