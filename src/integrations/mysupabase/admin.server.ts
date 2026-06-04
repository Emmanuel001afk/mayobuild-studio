import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/integrations/mysupabase/url";

let _admin: SupabaseClient | null = null;
export function getAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const rawUrl = process.env.MY_SUPABASE_URL;
  const key = process.env.MY_SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) throw new Error("MY_SUPABASE_URL / MY_SUPABASE_SERVICE_ROLE_KEY missing");
  const url = normalizeSupabaseUrl(rawUrl);
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

export function getPublicConfig() {
  const rawUrl = process.env.MY_SUPABASE_URL;
  const anonKey = process.env.MY_SUPABASE_ANON_KEY;
  if (!rawUrl || !anonKey) throw new Error("MY_SUPABASE_URL / MY_SUPABASE_ANON_KEY missing");
  const url = normalizeSupabaseUrl(rawUrl);
  return { url, anonKey };
}

/** Validate a user JWT and return the user, or null. */
export async function getUserFromToken(token: string | undefined | null) {
  if (!token) return null;
  const admin = getAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error) return null;
  return data.user;
}
