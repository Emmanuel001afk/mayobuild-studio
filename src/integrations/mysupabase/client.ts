import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/integrations/mysupabase/url";

let _clientPromise: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
  if (_clientPromise) return _clientPromise;
  _clientPromise = (async () => {
    // A timeout here matters — without one, a slow/stalled connection (e.g.
    // poor mobile signal) leaves the whole app stuck on "Loading…" forever
    // with no error shown at all, since this is the very first request the
    // app makes before anything else can render.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let res: Response;
    try {
      res = await fetch("/api/public/supabase-config", { signal: controller.signal });
    } catch (err) {
      const isTimeout = (err as Error)?.name === "AbortError";
      _clientPromise = null; // allow a retry on next call instead of caching the failure forever
      throw new Error(
        isTimeout
          ? "Connection timed out loading the app — check your network and try again."
          : `Could not reach the server: ${(err as Error).message}`
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      _clientPromise = null;
      throw new Error("Failed to load Supabase config");
    }
    const { url, anonKey } = (await res.json()) as { url: string; anonKey: string };
    const normalizedUrl = normalizeSupabaseUrl(url);

    return createClient(normalizedUrl, anonKey, {
      global: {
        headers: {
          apikey: anonKey,
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
