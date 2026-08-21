// src/lib/aem-key.functions.ts
// Server function to create a new hub API key. Matches this project's
// real createServerFn pattern (see src/lib/api/example.functions.ts).
// The plain-text key is only ever returned here, once — after this call
// only its hash exists in the database.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateHubKey } from "./hub-keys.server";
import { getAdmin } from "@/integrations/mysupabase/admin.server";

export const createHubKey = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      label: z.string().min(1),
      scope: z.enum(["owner", "restricted"]),
      rateLimitPerHour: z.number().min(1).max(10000).optional(),
    })
  )
  .handler(async ({ data }) => {
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

export const listHubKeys = createServerFn({ method: "POST" }).handler(async () => {
  const db = getAdmin();
  const { data } = await db
    .from("hub_api_keys")
    .select("id, label, key_prefix, scope, rate_limit_per_hour, revoked, last_used_at, created_at")
    .order("created_at", { ascending: false });
  return data ?? [];
});
