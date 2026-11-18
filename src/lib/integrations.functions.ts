import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/integrations/mysupabase/middleware.server";

export type IntegrationProvider = "github" | "supabase" | "deploy" | "ai";

const ProviderEnum = z.enum(["github", "supabase", "deploy", "ai"]);

function mask(secret: string | null | undefined) {
  if (!secret) return null;
  if (secret.length <= 8) return "••••";
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

/** List the caller's connections. Secrets are always masked. */
export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const { admin, user } = context;
    const { data, error } = await admin
      .from("user_integrations")
      .select("id,provider,label,secret,config,updated_at")
      .eq("user_id", user.id);
    if (error) {
      console.error("[integrations] list failed", error.message);
      return { items: [] as any[], setupRequired: true };
    }
    return {
      items: (data ?? []).map((r: any) => ({
        provider: r.provider,
        label: r.label,
        config: r.config ?? {},
        masked: mask(r.secret),
        connected: !!r.secret,
        updated_at: r.updated_at,
      })),
      setupRequired: false,
    };
  });

const SaveInput = z.object({
  provider: ProviderEnum,
  label: z.string().max(200).optional(),
  secret: z.string().max(4000).optional(),
  config: z.record(z.string(), z.any()).optional(),
});

export const saveIntegration = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const row: Record<string, unknown> = {
      user_id: user.id,
      provider: data.provider,
      label: data.label ?? null,
      config: data.config ?? {},
      updated_at: new Date().toISOString(),
    };
    // Only overwrite the secret when a new one is supplied.
    if (data.secret) row.secret = data.secret;
    const { error } = await admin
      .from("user_integrations")
      .upsert(row, { onConflict: "user_id,provider" });
    if (error) {
      console.error("[integrations] save failed", error.message);
      throw new Error(
        "Could not save the connection. If this is the first time, run the user_integrations block from db/schema.sql in your database.",
      );
    }
    return { ok: true as const };
  });

export const deleteIntegration = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator((d: unknown) => z.object({ provider: ProviderEnum }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    await admin
      .from("user_integrations")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", data.provider);
    return { ok: true as const };
  });
