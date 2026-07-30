import type { SupabaseClient } from "@supabase/supabase-js";

export type IntegrationRow = {
  provider: string;
  label: string | null;
  secret: string | null;
  config: Record<string, any>;
};

/** Server-only: read a user's integration row including the raw secret. */
export async function getIntegration(
  admin: SupabaseClient,
  userId: string,
  provider: string,
): Promise<IntegrationRow | null> {
  const { data, error } = await admin
    .from("user_integrations")
    .select("provider,label,secret,config")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error || !data) return null;
  return { ...(data as any), config: (data as any).config ?? {} };
}

/**
 * Resolve the GitHub token for a user: their own connected token first,
 * falling back to the platform-wide GITHUB_TOKEN only if they have none.
 * This is what fixes "the global token only ever reaches one repo".
 */
export async function resolveGithubToken(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const row = await getIntegration(admin, userId, "github");
  return row?.secret || process.env.GITHUB_TOKEN || null;
}
