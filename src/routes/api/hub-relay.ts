// src/routes/api/hub-relay.ts
// Bridges the hub to whichever browser tab currently has your local GGUF
// model loaded (via wllama).
//
// WHY THIS IS NOT A WEBSOCKET: this app is deployed on a serverless/edge
// runtime where functions spin up per request, so a long-lived socket (and
// any in-memory Map of sockets) cannot survive between calls. Instead the
// tab and the hub talk through a tiny job queue table in the database:
//
//   1. hub inserts a row into hub_local_jobs (status = 'pending')
//   2. the tab long-polls  POST /api/hub-relay { action: 'poll' }
//   3. the tab answers     POST /api/hub-relay { action: 'answer' }
//   4. hub reads the answer back off the same row
//
// This works on any host, survives restarts, and needs no real server.

import { createFileRoute } from "@tanstack/react-router";
import { getAdmin } from "@/integrations/mysupabase/admin.server";

const DEVICE_ONLINE_WINDOW_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True if a tab with this deviceId has checked in within the last minute. */
export async function isDeviceOnline(deviceId: string): Promise<boolean> {
  const db = getAdmin();
  const { data } = await db
    .from("hub_devices")
    .select("last_seen_at")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (!data?.last_seen_at) return false;
  return Date.now() - new Date(data.last_seen_at).getTime() < DEVICE_ONLINE_WINDOW_MS;
}

/** Hands a prompt to the browser-tab model and waits for its answer. */
export async function askLocalModel(deviceId: string, prompt: string, timeoutMs = 45_000): Promise<string> {
  const db = getAdmin();
  const { data: job, error } = await db
    .from("hub_local_jobs")
    .insert({ device_id: deviceId, prompt, status: "pending" })
    .select("id")
    .single();
  if (error || !job) throw new Error(`Could not queue local job: ${error?.message}`);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(800);
    const { data: row } = await db
      .from("hub_local_jobs")
      .select("status, answer")
      .eq("id", job.id)
      .maybeSingle();
    if (row?.status === "done") return row.answer ?? "";
    if (row?.status === "error") throw new Error(row.answer ?? "local model error");
  }

  await db.from("hub_local_jobs").update({ status: "expired" }).eq("id", job.id);
  throw new Error("Local model tab did not respond in time (tab may be closed)");
}

export const Route = createFileRoute("/api/hub-relay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as
          | { action?: string; deviceId?: string; jobId?: string; answer?: string; error?: string }
          | null;
        const deviceId = body?.deviceId;
        if (!body?.action || !deviceId) {
          return new Response("action and deviceId are required", { status: 400 });
        }

        const db = getAdmin();
        const now = new Date().toISOString();

        // Every call doubles as a heartbeat, so the hub knows the tab is alive.
        await db
          .from("hub_devices")
          .upsert({ device_id: deviceId, last_seen_at: now }, { onConflict: "device_id" });

        if (body.action === "heartbeat") {
          return Response.json({ ok: true });
        }

        if (body.action === "poll") {
          // Short long-poll: look for work for up to ~20s, then return empty
          // so the tab can immediately re-poll (keeps the request short
          // enough for serverless limits).
          const deadline = Date.now() + 20_000;
          while (Date.now() < deadline) {
            const { data: jobs } = await db
              .from("hub_local_jobs")
              .select("id, prompt")
              .eq("device_id", deviceId)
              .eq("status", "pending")
              .order("created_at", { ascending: true })
              .limit(1);

            const job = jobs?.[0];
            if (job) {
              await db.from("hub_local_jobs").update({ status: "working" }).eq("id", job.id);
              return Response.json({ job: { id: job.id, prompt: job.prompt } });
            }
            await sleep(1500);
          }
          return Response.json({ job: null });
        }

        if (body.action === "answer") {
          if (!body.jobId) return new Response("jobId required", { status: 400 });
          await db
            .from("hub_local_jobs")
            .update({
              status: body.error ? "error" : "done",
              answer: body.error ?? body.answer ?? "",
              answered_at: now,
            })
            .eq("id", body.jobId)
            .eq("device_id", deviceId);
          return Response.json({ ok: true });
        }

        return new Response("Unknown action", { status: 400 });
      },
    },
  },
});
