import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/integrations/mysupabase/url";

let _clientPromise: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
  if (_clientPromise) return _clientPromise;
  _clientPromise = (async () => {
    const res = await fetch("/api/public/supabase-config");
    if (!res.ok) throw new Error("Failed to load Supabase config");
    const { url, anonKey } = (await res.json()) as { url: string; anonKey: string };
    const normalizedUrl = normalizeSupabaseUrl(url);

    return createClient(normalizedUrl, anonKey, {
      global: {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "mayobuild-auth",
      },
    });
  })();
  return _clientPromise;
}

export async function getSession(): Promise<Session | null> {
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function getAccessToken(): Promise<string | null> {
  const s = await getSession();
  return s?.access_token ?? null;
}
