// src/routes/api/hub.ts
// The central hub endpoint — this is what Halway (and any other of your
// websites) calls to reach AEM AI, the shared brain living in this project.
//
// Auth: Authorization: Bearer <key>  — looked up per-caller in hub_api_keys,
// scope-checked (owner = unlimited, restricted = rate-limited), logged.
//
// NEW in this version: AEM AI can now call tools mid-answer — list its own
// API keys, spot ones that don't match a known site, adjust their
// restrictions, or list which websites it's connected to — using the
// functions in aem-tools.server.ts.

import { createFileRoute } from "@tanstack/react-router";
import { callAIWithFailover, type ChatMessage } from "@/lib/ai-providers.server";
import { classifyTask, retrieveMemory } from "@/lib/ai-hub-core";
import { hashHubKey } from "@/lib/hub-keys.server";
import { getAdmin } from "@/integrations/mysupabase/admin.server";
import { askLocalModel, isDeviceOnline } from "@/routes/api/hub-relay";
import {
  listKeysWithSiteMatch,
  setKeyRestriction,
  listConnectedSites,
} from "@/lib/aem-tools.server";
import { CORE_TOOLS, runCoreTool } from "@/lib/aem-core-tools.server";

// TEMPORARY FIX toggle — the browser-tab (wllama) local model path.
// Set USE_LOCAL_MODEL=true in env to try it; set to false/unset to skip
// straight to the hosted providers (Gemini/Groq/etc). Never delete this —
// once a real server exists, just leave this env var off. The code stays
// dormant and ready if it's ever useful again.
const USE_LOCAL_MODEL = process.env.USE_LOCAL_MODEL !== "false";

function unauthorized(msg = "Unauthorized") {
  return new Response(msg, { status: 401 });
}

// --- Tool definitions AEM AI can choose to call, OpenAI-compatible format ---
const AEM_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_keys",
      description: "List every issued API key, showing which ones match a known connected site vs. which are unrecognized/foreign callers.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "set_key_restriction",
      description: "Adjust an existing key's scope, rate limit, or revoke it. Use on keys that don't match a known site.",
      parameters: {
        type: "object",
        properties: {
          keyId: { type: "string" },
          scope: { type: "string", enum: ["owner", "restricted"] },
          rateLimitPerHour: { type: "number" },
          revoked: { type: "boolean" },
        },
        required: ["keyId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_connected_sites",
      description: "List every website AEM AI is connected to and can work on.",
      parameters: { type: "object", properties: {} },
    },
  },
] as const;

async function runTool(name: string, args: Record<string, unknown>, allowManagementTools: boolean) {
  const coreNames = CORE_TOOLS.map((t) => t.function.name) as string[];
  if (coreNames.includes(name)) return await runCoreTool(name, args);

  if (!allowManagementTools) {
    return { error: "This tool requires an owner-scope key." };
  }

  switch (name) {
    case "list_keys":
      return await listKeysWithSiteMatch();
    case "set_key_restriction":
      return await setKeyRestriction(String(args.keyId), {
        scope: args.scope as "owner" | "restricted" | undefined,
        rateLimitPerHour: args.rateLimitPerHour as number | undefined,
        revoked: args.revoked as boolean | undefined,
      });
    case "list_connected_sites":
      return await listConnectedSites();
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export const Route = createFileRoute("/api/hub")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // --- Auth: per-caller key, looked up in hub_api_keys ---
        const authHeader = request.headers.get("authorization");
        const providedKey = authHeader?.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7)
          : null;
        if (!providedKey) return unauthorized("Missing API key");

        const db = getAdmin();
        const providedHash = hashHubKey(providedKey);
        const { data: keyRow } = await db
          .from("hub_api_keys")
          .select("id, scope, rate_limit_per_hour, revoked")
          .eq("key_hash", providedHash)
          .maybeSingle();

        if (!keyRow || keyRow.revoked) return unauthorized("Invalid or revoked key");

        if (keyRow.scope === "restricted") {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { count } = await db
            .from("hub_api_usage")
            .select("id", { count: "exact", head: true })
            .eq("key_id", keyRow.id)
            .gte("called_at", oneHourAgo);

          if ((count ?? 0) >= keyRow.rate_limit_per_hour) {
            return new Response("Rate limit exceeded for this key", { status: 429 });
          }
        }

        db.from("hub_api_usage").insert({ key_id: keyRow.id }).then(() => {});
        db.from("hub_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id).then(() => {});

        // --- Parse request ---
        const body = await request.json().catch(() => null);
        const prompt = body?.message as string | undefined;
        if (!prompt || typeof prompt !== "string") {
          return new Response("message is required", { status: 400 });
        }

        // --- Classify (kept for the caller's visibility on what kind of ask this was) ---
        const callModel = async (p: string) => {
          const res = await callAIWithFailover([{ role: "user", content: p }]);
          return res.ok && res.text ? res.text : "";
        };
        const category = await classifyTask(prompt, callModel);

        // --- TEMPORARY FIX: try the browser-tab local model first, if the
        //     toggle is on and a tab is actually connected right now.
        //     Only for SIMPLE/REASONING/CODING categories — image, fraud,
        //     websearch all need real tool-calling, which small local
        //     models handle unreliably, so those always go to the hosted
        //     path below instead, regardless of this toggle.
        const deviceId = body?.deviceId as string | undefined;
        const localModelEligible = ["SIMPLE", "REASONING", "CODING"].includes(category);

        if (USE_LOCAL_MODEL && deviceId && localModelEligible && (await isDeviceOnline(deviceId))) {
          try {
            // RAG still applies even on the temporary path — the hub does
            // the retrieval itself and hands the local model pre-loaded
            // context, rather than expecting the tiny model to fetch its
            // own memory (it can't call tools reliably; the hub can).
            const memoryIds = await retrieveMemory(
              prompt,
              async (q) => (await db.rpc("hub_memory_keyword_search", { q })).data ?? [],
              async () => [], // vector search wired in once embeddings are generated on write
            );
            let memoryContext = "";
            if (memoryIds.length) {
              const { data: rows } = await db.from("hub_memory").select("content").in("id", memoryIds);
              memoryContext = (rows ?? []).map((r) => r.content).join("\n---\n");
            }

            const promptWithMemory = memoryContext
              ? `Relevant context:\n${memoryContext}\n\nQuestion: ${prompt}`
              : prompt;

            const localAnswer = await askLocalModel(deviceId, promptWithMemory);
            return Response.json({ category, answer: localAnswer, source: "local-browser-tab", ragApplied: memoryIds.length > 0 });
          } catch {
            // Tab didn't respond in time — fall through silently to hosted providers.
          }
        }

        // --- Tool-calling loop: only the OWNER can trigger key/site tools.
        //     Restricted (test) keys get plain answers only — they should
        //     never be able to ask AEM AI to list or change its own keys. ---
        // Core tools (coding delegation, image gen, web search) are safe
        // for anyone to use. Key/site management tools are owner-only.
        const allowManagementTools = keyRow.scope === "owner";
        const toolsForThisCall = allowManagementTools
          ? [...CORE_TOOLS, ...AEM_TOOLS]
          : [...CORE_TOOLS];
        const messages: ChatMessage[] = [
          {
            role: "system",
            content:
              "You are AEM AI, a central admin assistant. You can call tools to " +
              "check or adjust your own API keys and see which sites you're " +
              "connected to, when relevant to the request.",
          },
          { role: "user", content: prompt },
        ];

        let finalText = "";
        for (let step = 0; step < 4; step++) {
          const res = await callAIWithFailover(messages, { tools: toolsForThisCall });
          if (!res.ok) return Response.json({ category, error: res.error }, { status: 502 });

          if (res.toolCalls?.length) {
            messages.push({ role: "assistant", content: res.text ?? "", tool_calls: res.toolCalls } as ChatMessage);
            for (const call of res.toolCalls) {
              const args = JSON.parse(call.function.arguments || "{}");
              const result = await runTool(call.function.name, args, allowManagementTools);
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify(result),
              } as ChatMessage);
            }
            continue; // loop again so the model can respond using the tool result
          }

          finalText = res.text ?? "";
          break;
        }

        // --- Distillation-into-memory: a hosted-model answer becomes a
        //     lesson the small local model can pull from later via RAG —
        //     this is how the small model's *effective* knowledge grows
        //     over time, with no real fine-tuning needed. ---
        if (finalText) {
          db.from("hub_memory").insert({
            source: "distilled",
            content: `Q: ${prompt}\nA: ${finalText}`,
          }).then(() => {});
        }

        return Response.json({ category, answer: finalText });
      },
    },
  },
});
