import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/integrations/mysupabase/middleware.server";
import { getIntegration } from "@/lib/integrations.server";
import { routeChat } from "@/lib/router/index.server";

const Msg = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(60000) });

const Input = z.object({
  messages: z.array(Msg).min(1).max(40),
  attachments: z
    .array(z.object({ name: z.string().max(300), text: z.string().max(60000) }))
    .max(10)
    .optional(),
  scope: z.enum(["admin", "user"]).default("user"),
});

const SYSTEM = `You are the Mayobuild Orchestrator — the operations brain of Mayobuild Studio.

You help the operator connect and run their stack: GitHub (code), their database (Supabase or any Postgres/other), and their deployment platform. You also advise on architecture, review code, debug builds, and can write code for ANY target — React/TypeScript web apps, games (Phaser/Three.js/Unity C#), mobile (Expo/React Native/Capacitor), backend services, SQL, and embedded firmware (Arduino, ESP32).

Rules:
- Talk like a senior engineer talking to a colleague: direct, plain English, no filler, no hype.
- When something is broken, say what is broken, why, and the exact next step.
- When the operator attaches files, read them before answering and reference the real file names.
- Only output code when code is genuinely what is being asked for; label the language and the target file path.
- Review your own answer once before finishing: check the claim, the file path, and the syntax. If unsure, say what you are unsure about instead of guessing.
- Never print secrets, tokens, or keys back to the screen.`;

export const consoleChat = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;

    const attachmentBlock = (data.attachments ?? []).length
      ? "\n\nATTACHED FILES:\n" +
        (data.attachments ?? [])
          .map((a) => `----- ${a.name} -----\n${a.text.slice(0, 20000)}`)
          .join("\n\n")
      : "";

    const systemPrompt =
      SYSTEM +
      (data.scope === "admin"
        ? "\n\nYou are running in the platform owner's admin console: you may discuss platform-wide data, all user accounts, revenue and infrastructure."
        : "\n\nYou are running in a customer's console: only discuss that customer's own projects and connections.");

    const history = data.messages.slice(0, -1);
    const last = data.messages[data.messages.length - 1];
    const prompt = last.content + attachmentBlock;

    // 1) Bring-your-own AI key (any OpenAI-compatible endpoint) takes priority.
    const own = await getIntegration(admin, user.id, "ai");
    if (own?.secret) {
      const baseUrl = (own.config?.base_url as string) || "https://api.openai.com/v1";
      const model = (own.config?.model as string) || "gpt-4o-mini";
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${own.secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.4,
            messages: [
              { role: "system", content: systemPrompt },
              ...history,
              { role: "user", content: prompt },
            ],
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error("[console] own-key provider failed", res.status, body.slice(0, 300));
          throw new Error(`Your AI provider returned ${res.status}.`);
        }
        const json: any = await res.json();
        return {
          text: (json.choices?.[0]?.message?.content ?? "").toString(),
          provider: "your-key",
          model,
        };
      } catch (e: any) {
        return {
          text: `I could not reach your own AI provider (${e.message}). Check the key, base URL and model in Connections, or remove the key to fall back to the platform AI.`,
          provider: "your-key",
          model,
        };
      }
    }

    // 2) Platform AI (smart router with failover).
    const result = await routeChat("complex_app", [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: prompt },
    ]);

    await admin.from("generations").insert({
      user_id: user.id,
      project_id: null,
      task: "console",
      provider: result.provider,
      model: result.model,
      prompt: prompt.slice(0, 8000),
      output: result.text.slice(0, 100_000),
    });

    return { text: result.text, provider: result.provider, model: result.model };
  });
