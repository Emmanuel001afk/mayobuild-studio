import { createHash, randomBytes } from "node:crypto";
import { getAdmin } from "@/integrations/mysupabase/admin.server";
import { hashHubKey } from "@/lib/hub-keys.server";

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function authorizeHubOwner(request: Request) {
  const token = bearerToken(request);
  if (!token) return { ok: false as const, status: 401, error: "Owner API key required" };
  const db = getAdmin();
  const { data, error } = await db
    .from("hub_api_keys")
    .select("id, scope, revoked")
    .eq("key_hash", hashHubKey(token))
    .maybeSingle();
  if (error) return { ok: false as const, status: 503, error: "Could not verify owner API key" };
  if (!data || data.revoked || data.scope !== "owner") {
    return { ok: false as const, status: 403, error: "An active owner API key is required" };
  }
  void db.from("hub_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { ok: true as const, db };
}

export async function authorizePlatform(request: Request) {
  const token = bearerToken(request);
  if (!token) return { ok: false as const, status: 401, error: "Platform token required" };
  const db = getAdmin();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await db
    .from("platform_registry_keys")
    .select("id, platform_id, revoked")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) return { ok: false as const, status: 503, error: "Could not verify platform token" };
  if (!data || data.revoked) return { ok: false as const, status: 401, error: "Invalid or revoked platform token" };
  void db.from("platform_registry_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { ok: true as const, db, platformId: data.platform_id };
}

export function createPlatformToken() {
  const token = "PLAT_" + randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash, prefix: token.slice(0, 13) };
}

export async function readJsonBody(request: Request, maxBytes = 32_768): Promise<any> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new Error("Request body is too large");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error("Request body is too large");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}
