// src/lib/aem-brain.server.ts
// The shared AEM AI answering core. Both entry points use it:
//   1. /api/hub          -> other websites, authenticated with an AM_ key
//   2. askAem server fn  -> the overseer talking to the model in this app,
//                           authenticated by their normal login (NO key).
// An API key is only ever about letting an *outside* site in — it is not a
// requirement for talking to the model from here.

import { callAIWithFailover, type ChatMessage } from "@/lib/ai-providers.server";
import { classifyTask, retrieveMemory } from "@/lib/ai-hub-core";
import { getAdmin } from "@/integrations/mysupabase/admin.server";
import { askLocalModel, isDeviceOnline } from "@/routes/api/hub-relay";
import {
  listKeysWithSiteMatch,
  setKeyRestriction,
  listConnectedSites,
} from "@/lib/aem-tools.server";
import { CORE_TOOLS, runCoreTool } from "@/lib/aem-core-tools.server";

const USE_LOCAL_MODEL = process.env.USE_LOCAL_MODEL !== "false";

export const AEM_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_keys",
      description:
        "List every issued API key, showing which ones match a known connected site vs. which are unrecognized/foreign callers.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "set_key_restriction",
      description:
        "Adjust an existing key's scope, rate limit, or revoke it. Use on keys that don't match a known site.",
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

  if (!allowManagementTools) return { error: "This tool requires an owner-scope caller." };

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

export type AemAnswer = {
  category: string;
  answer?: string;
  error?: string;
  source?: string;
  ragApplied?: boolean;
};

export async function answerWithAem(opts: {
  prompt: string;
  deviceId?: string | undefined;
  allowManagementTools: boolean;
}): Promise<AemAnswer> {
  const { prompt, deviceId, allowManagementTools } = opts;
  const db = getAdmin();

  const callModel = async (p: string) => {
    const res = await callAIWithFailover([{ role: "user", content: p }]);
    return res.ok && res.text ? res.text : "";
  };
  const category = await classifyTask(prompt, callModel);

  const localModelEligible = ["SIMPLE", "REASONING", "CODING"].includes(category);
  if (USE_LOCAL_MODEL && deviceId && localModelEligible && (await isDeviceOnline(deviceId))) {
    try {
      const memoryIds = await retrieveMemory(
        prompt,
        async (q) => (await db.rpc("hub_memory_keyword_search", { q })).data ?? [],
        async () => [],
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
      return {
        category,
        answer: localAnswer,
        source: "local-browser-tab",
        ragApplied: memoryIds.length > 0,
      };
    } catch {
      // fall through to hosted providers
    }
  }

  const toolsForThisCall = allowManagementTools ? [...CORE_TOOLS, ...AEM_TOOLS] : [...CORE_TOOLS];
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
    if (!res.ok) return { category, error: res.error };

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
      continue;
    }

    finalText = res.text ?? "";
    break;
  }

  if (finalText) {
    db.from("hub_memory")
      .insert({ source: "distilled", content: `Q: ${prompt}\nA: ${finalText}` })
      .then(() => {});
  }

  return { category, answer: finalText, source: "hosted" };
}
