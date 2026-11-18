import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/integrations/mysupabase/middleware.server";
import { routeChat, routeImage, type RouteTask, PROVIDERS_META } from "./router/index.server";
import { buildRanker } from "./orchestrator.functions";

const RouteInput = z.object({
  task: z.enum(["complex_app", "mobile_code", "website", "image"]),
  prompt: z.string().min(1).max(20000),
  system: z.string().optional(),
  preferProvider: z.string().optional(),
  projectId: z.string().uuid().optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(50000) }))
    .max(40)
    .optional(),
});

export const callRouter = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator((d: unknown) => RouteInput.parse(d))
  .handler(async ({ data, context }) => {
    const started = Date.now();
    const { user, admin } = context;

    try {
      if (data.task === "image") {
        const dataUrl = await routeImage(data.prompt);
        await admin.from("generations").insert({
          project_id: data.projectId ?? null,
          user_id: user.id,
          task: data.task,
          provider: "huggingface",
          model: "FLUX.1-schnell",
          prompt: data.prompt,
          output: "[image]",
          latency_ms: Date.now() - started,
          ok: true,
        });
        return { kind: "image" as const, dataUrl };
      }

      const messages = [
        ...(data.system ? [{ role: "system" as const, content: data.system }] : []),
        ...(data.history ?? []).map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: data.prompt },
      ];
      const rank = await buildRanker(admin, data.task).catch(() => undefined);
      const result = await routeChat(data.task as RouteTask, messages, {
        preferProvider: data.preferProvider,
        rank,
      });

      await admin.from("generations").insert({
        project_id: data.projectId ?? null,
        user_id: user.id,
        task: data.task,
        provider: result.provider,
        model: result.model,
        prompt: data.prompt,
        output: result.text.slice(0, 50000),
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
        latency_ms: Date.now() - started,
        ok: true,
      });

      return {
        kind: "text" as const,
        text: result.text,
        provider: result.provider,
        model: result.model,
        attempts: result.attempts,
      };
    } catch (e) {
      await admin.from("generations").insert({
        project_id: data.projectId ?? null,
        user_id: user.id,
        task: data.task,
        provider: "none",
        prompt: data.prompt,
        latency_ms: Date.now() - started,
        ok: false,
        error: (e as Error).message.slice(0, 1000),
      });
      throw e;
    }
  });

export const getRouterMeta = createServerFn({ method: "GET" }).handler(async () => PROVIDERS_META);
