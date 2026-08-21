// src/lib/local-model-tab.browser.ts
// Runs INSIDE your open browser tab (not on the server). Loads your
// downloaded model via wllama, connects to /api/hub-relay, and answers
// whatever prompts get forwarded to it. Keep this tab open (can be
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

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export async function startLocalModelTab(
  modelSource: string | File[],
  onStatus?: (s: string) => void
) {
  const deviceId = getOrCreateDeviceId();
  onStatus?.("Loading model into browser memory...");

  const wllama = new Wllama({
    "single-thread/wllama.wasm": "/wllama/single-thread.wasm",
    "multi-thread/wllama.wasm": "/wllama/multi-thread.wasm",
  });

  // Two ways in: a URL (re-downloads the file), or File objects picked
  // directly from the phone's own storage (no re-download, no hosting
  // needed at all — this is the one to use since the file is already
  // sitting on the device).
  if (typeof modelSource === "string") {
    await wllama.loadModelFromUrl(modelSource, { n_ctx: 2048 });
  } else {
    await wllama.loadModel(modelSource, { n_ctx: 2048 });
  }

  onStatus?.("Model loaded. Connecting to hub...");

  const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${wsProtocol}//${location.host}/api/hub-relay?deviceId=${deviceId}`);

  ws.onopen = () => onStatus?.(`Connected — device ID: ${deviceId}`);

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type !== "prompt") return;

    try {
      const answer = await wllama.createCompletion(msg.prompt, {
        nPredict: 512,
        sampling: { temp: 0.4 },
      });
      ws.send(JSON.stringify({ type: "answer", requestId: msg.requestId, answer }));
    } catch (err) {
      ws.send(JSON.stringify({
        type: "answer",
        requestId: msg.requestId,
        answer: `[local model error: ${(err as Error).message}]`,
      }));
    }
  };

  ws.onclose = () => onStatus?.("Disconnected from hub (tab may have lost network, or server restarted).");

  // Reconnect if it drops while the tab is still open.
  ws.onerror = () => onStatus?.("Connection error — will retry.");

  return { deviceId, wllama, ws };
}
