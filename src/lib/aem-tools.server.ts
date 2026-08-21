// src/lib/aem-tools.server.ts
// Tools AEM AI (the central admin AI) can call on itself — not things a
// person clicks, things the AI decides to use mid-conversation, same
// pattern as Halway's admin-ai tool-calling (query_table, run_sql, etc).

import { getAdmin } from "@/integrations/mysupabase/admin.server";

// -----------------------------------------------------------------------
// KEY MANAGEMENT
// Lets AEM AI look at all issued keys, tell which ones belong to a site
// it recognizes (via connected_sites) vs. an unrecognized/foreign caller,
// and adjust restriction level on the ones it doesn't recognize.
// -----------------------------------------------------------------------

export async function listKeysWithSiteMatch() {
  const db = getAdmin();
  const [{ data: keys }, { data: sites }] = await Promise.all([
    db.from("hub_api_keys").select("id, label, key_prefix, scope, rate_limit_per_hour, revoked, last_used_at"),
    db.from("connected_sites").select("site_name"),
  ]);

  const knownSiteNames = new Set((sites ?? []).map((s) => s.site_name.toLowerCase()));

  return (keys ?? []).map((k) => ({
    ...k,
    recognized: knownSiteNames.has((k.label ?? "").toLowerCase()),
  }));
}

/** AEM AI calls this after spotting a key whose label doesn't match any
 * connected_sites entry — i.e. an outside/test caller, not one of your
 * own sites — to tighten or loosen that specific key's restrictions. */
export async function setKeyRestriction(
  keyId: string,
  updates: { scope?: "owner" | "restricted"; rateLimitPerHour?: number; revoked?: boolean }
) {
  const db = getAdmin();
  const patch: Record<string, unknown> = {};
  if (updates.scope) patch.scope = updates.scope;
  if (updates.rateLimitPerHour !== undefined) patch.rate_limit_per_hour = updates.rateLimitPerHour;
  if (updates.revoked !== undefined) patch.revoked = updates.revoked;

  const { error } = await db.from("hub_api_keys").update(patch).eq("id", keyId);
  if (error) throw new Error(`Failed to update key: ${error.message}`);
  return { ok: true };
}

// -----------------------------------------------------------------------
// SITE SWITCHING
// Lets AEM AI list every connected site and fetch the credentials needed
// to act on a specific one (e.g. "work on Halway" -> load Halway's
// GitHub token + Supabase key for this turn only, never store them
// outside Vault).
// -----------------------------------------------------------------------

export async function listConnectedSites() {
  const db = getAdmin();
  const { data } = await db
    .from("connected_sites")
    .select("id, site_name, github_repo, deploy_platform, is_self");
  return data ?? [];
}

/** Pulls the real secret values out of Vault for one site, for use during
 * this request only. Never log or persist the returned values. */
export async function getSiteCredentials(siteId: string) {
  const db = getAdmin();
  const { data: site } = await db
    .from("connected_sites")
    .select("*")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) throw new Error("Site not found");

  async function readSecret(secretId: string | null) {
    if (!secretId) return null;
    const { data, error } = await db.rpc("read_vault_secret", { secret_id: secretId });
    if (error) throw new Error(`Vault read failed: ${error.message}`);
    return data as string | null;
  }

  const [githubToken, deployToken, supabaseServiceKey] = await Promise.all([
    readSecret(site.github_token_secret_id),
    readSecret(site.deploy_token_secret_id),
    readSecret(site.supabase_service_key_secret_id),
  ]);

  return {
    siteName: site.site_name,
    githubRepo: site.github_repo,
    githubToken,
    deployPlatform: site.deploy_platform,
    deployToken,
    supabaseProjectRef: site.supabase_project_ref,
    supabaseServiceKey,
  };
}
