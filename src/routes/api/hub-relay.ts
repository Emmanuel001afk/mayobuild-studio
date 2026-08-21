// src/routes/api/hub-relay.ts
// Keeps a live connection open to whichever browser tab has the local
// model loaded (via wllama), so /api/hub can forward a request to it and
// get a real answer back — instead of only calling Gemini/Groq.
//
// IMPORTANT DEPLOYMENT NOTE: this requires a persistent Node server, not
// a serverless/edge deploy target — WebSocket connections can't survive
// on platforms that spin functions up per-request (e.g. plain Vercel
// serverless functions). Confirm mayobuild-studio's actual host supports
// long-lived connections before relying on this in production.

import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "node:crypto";

// In-memory map of active device connections. Lives only as long as the
// server process does — fine for this use case since a tab reconnecting
// simply re-registers.
type PendingRequest = { resolve: (answer: string) => void; reject: (err: Error) => void };

const activeSockets = new Map<string, WebSocket>();
const pendingRequests = new Map<string, PendingRequest>();

/** Called by /api/hub when it wants an answer from the browser-tab model
 * instead of (or in addition to) the hosted providers. Times out if the
 * tab doesn't respond — e.g. the tab was closed. */
export function askLocalModel(deviceId: string, prompt: string, timeoutMs = 30000): Promise<string> {
  const socket = activeSockets.get(deviceId);
  if (!socket) return Promise.reject(new Error("No active browser tab connected for this device"));

  const requestId = randomUUID();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("Local model tab did not respond in time (tab may be closed)"));
    }, timeoutMs);

    pendingRequests.set(requestId, {
      resolve: (answer) => { clearTimeout(timer); resolve(answer); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });

    socket.send(JSON.stringify({ type: "prompt", requestId, prompt }));
  });
}

export function isDeviceOnline(deviceId: string): boolean {
  return activeSockets.has(deviceId);
}

export const Route = createFileRoute("/api/hub-relay")({
  server: {
    handlers: {
      // Browser tab connects here once wllama has the model loaded.
      // deviceId is a stable id the tab generates once and reuses across
      // reconnects (e.g. stored in localStorage on the tab's own side).
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const deviceId = url.searchParams.get("deviceId");
        if (!deviceId) return new Response("deviceId query param required", { status: 400 });

        // @ts-expect-error -- Deno/Node WebSocket upgrade API varies by
        // runtime; wire this to whatever WebSocket upgrade mechanism the
        // actual deploy target provides (e.g. Deno.upgradeWebSocket, or
        // the equivalent for the Node adapter in use).
        const { socket, response } = Deno.upgradeWebSocket(request);

        socket.onopen = () => {
          activeSockets.set(deviceId, socket);
          console.log(`[hub-relay] device connected: ${deviceId}`);
        };

        socket.onmessage = (event: MessageEvent) => {
          const msg = JSON.parse(event.data);
          if (msg.type === "answer" && msg.requestId) {
            const pending = pendingRequests.get(msg.requestId);
            if (pending) {
              pending.resolve(msg.answer);
              pendingRequests.delete(msg.requestId);
            }
          }
        };

        socket.onclose = () => {
          activeSockets.delete(deviceId);
          console.log(`[hub-relay] device disconnected: ${deviceId}`);
        };

        return response;
      },
    },
  },
});
