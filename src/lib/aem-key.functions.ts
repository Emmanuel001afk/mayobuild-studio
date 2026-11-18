// src/lib/aem-key.functions.ts
// Creating/listing hub API keys is OWNER-ONLY: these endpoints are locked
// to the signed-in admin account (ADMIN_EMAIL). Without this, anyone could
// mint themselves an owner-scope key to the hub.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateHubKey } from "./hub-keys.server";
import { requireUser } from "@/integrations/mysupabase/middleware.server";
import { getAdmin } from "@/integrations/mysupabase/admin.server";

function assertAdmin(email: string | null | undefined) {
  const allowed = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!allowed || !email || email.toLowerCase() !== allowed) {
    throw new Error("Forbidden: admin only");
  }
}

export const createHubKey = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      label: z.string().min(1).max(80),
      scope: z.enum(["owner", "restricted"]),
      rateLimitPerHour: z.number().min(1).max(10000).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context.user.email);
    const generated = generateHubKey(data.scope, data.rateLimitPerHour ?? 50);

    const db = getAdmin();
    const { error } = await db.from("hub_api_keys").insert({
      label: data.label,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
      scope: generated.scope,
      rate_limit_per_hour: generated.rateLimitPerHour,
    });

    if (error) throw new Error(`Failed to save key: ${error.message}`);

    // Only place the full plain-text key is ever returned. Show it once,
    // then it's gone — only the hash is stored from here on.
    return { fullKey: generated.fullKey, label: data.label, scope: generated.scope };
  });

export const listHubKeys = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    assertAdmin(context.user.email);
    const { data } = await getAdmin()
      .from("hub_api_keys")
      .select("id, label, key_prefix, scope, rate_limit_per_hour, revoked, last_used_at, created_at")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const revokeHubKey = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ keyId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    assertAdmin(context.user.email);
    const { error } = await getAdmin()
      .from("hub_api_keys")
      .update({ revoked: true })
      .eq("id", data.keyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
