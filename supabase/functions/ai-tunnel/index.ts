import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_MESSAGE = 20_000;
const MAX_REQUESTS_PER_HOUR = 120;
const PROVIDER_TIMEOUT_MS = 15_000;

type Provider = {
  name: string;
  secret: string;
  url: string;
  model: string;
};

const PROVIDERS: Provider[] = [
  { name: "groq", secret: "GROQ", url: "https://api.groq.com/openai/v1/chat/completions", model: "openai/gpt-oss-120b" },
  { name: "gemini", secret: "GEMINI", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-2.5-flash" },
  { name: "mistral", secret: "MISTRAL", url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-large-latest" },
  { name: "cerebras", secret: "CEREBRAS", url: "https://api.cerebras.ai/v1/chat/completions", model: "llama-3.3-70b" },
  { name: "openrouter", secret: "OPENROUTER", url: "https://openrouter.ai/api/v1/chat/completions", model: "openai/gpt-oss-120b" },
  { name: "huggingface", secret: "HUGGINGFACE", url: "https://router.huggingface.co/v1/chat/completions", model: "meta-llama/Llama-3.3-70B-Instruct" },
  { name: "sambanova", secret: "SAMBANOVA", url: "https://api.sambanova.ai/v1/chat/completions", model: "Meta-Llama-3.3-70B-Instruct" },
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function secretValue(name: string) {
  const exact = Deno.env.get(name)?.trim();
  if (exact) return exact;
  const legacy = Deno.env.get(name + "_API_KEY")?.trim();
  return legacy || "";
}

function providerModel(provider: Provider) {
  const override = Deno.env.get(provider.secret + "_MODEL")?.trim();
  return override || provider.model;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractMessage(data: any) {
  const message = data?.choices?.[0]?.message;
  const text = message?.content;
  if (typeof text === "string" && text.trim()) return text.trim();

  if (Array.isArray(text)) {
    const joined = text.map((part) => typeof part === "string" ? part : part?.text ?? "").join("").trim();
    if (joined) return joined;
  }

  const candidateParts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(candidateParts)) {
    const joined = candidateParts.map((part: any) => part?.text ?? "").join("").trim();
    if (joined) return joined;
  }

  return "";
}

async function callHostedAI(messages: Array<{ role: string; content: string }>) {
  const attempts: string[] = [];

  for (const provider of PROVIDERS) {
    const key = secretValue(provider.secret);
    if (!key) {
      attempts.push(provider.name + ": no key configured");
      continue;
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
        "Accept": "application/json",
      };
      if (provider.name === "openrouter") headers["X-Title"] = "Shared AI Tunnel";

      const res = await fetchWithTimeout(provider.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: providerModel(provider),
          messages,
          temperature: 0.4,
        }),
      });

      const raw = await res.text();
      if (!res.ok) {
        attempts.push(provider.name + ": HTTP " + res.status);
        continue;
      }

      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        attempts.push(provider.name + ": invalid JSON response");
        continue;
      }

      const text = extractMessage(data);
      if (!text) {
        attempts.push(provider.name + ": empty response");
        continue;
      }

      return { ok: true, provider: provider.name, text };
    } catch (error) {
      const name = error instanceof Error && error.name === "AbortError"
        ? "timed out"
        : error instanceof Error ? error.message : "request failed";
      attempts.push(provider.name + ": " + name);
    }
  }

  return {
    ok: false,
    error: "All AI providers failed or are unconfigured: " + attempts.join("; "),
  };
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!key) {
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS") || "";
    if (secretKeysRaw) {
      try {
        key = JSON.parse(secretKeysRaw)["default"] || "";
      } catch {
        // Fall through to the legacy service-role variable.
      }
    }
  }

  if (!url || !key) throw new Error("Supabase admin credentials are unavailable");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ ok: false, error: "POST required" }, 405);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return response({ ok: false, error: "Invalid request" }, 400);
  }

  if (!body || typeof body !== "object") return response({ ok: false, error: "Invalid request" }, 400);

  const action = typeof body.action === "string" ? body.action : "ask";
  const appId = typeof body.appId === "string" ? body.appId.trim() : "";
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";

  if (!appId || !deviceId) return response({ ok: false, error: "appId and deviceId are required" }, 400);
  if (appId.length > 160 || deviceId.length > 200) {
    return response({ ok: false, error: "Invalid app or device identifier" }, 400);
  }

  let db;
  try {
    db = getAdminClient();
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : "Backend configuration error" }, 500);
  }

  if (action === "register") {
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...tokenBytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    const tokenHash = await sha256(token);
    const label = typeof body.deviceLabel === "string" ? body.deviceLabel.trim().slice(0, 120) : null;

    const { data: existing, error: lookupError } = await db
      .from("ai_tunnel_devices")
      .select("id, revoked")
      .eq("app_id", appId)
      .eq("device_id", deviceId)
      .maybeSingle();

    if (lookupError) return response({ ok: false, error: "Could not register AI tunnel device" }, 500);
    if (existing?.revoked) return response({ ok: false, error: "AI tunnel device is revoked" }, 403);

    const result = existing
      ? await db.from("ai_tunnel_devices").update({
          token_hash: tokenHash,
          device_label: label,
          last_seen_at: new Date().toISOString(),
        }).eq("id", existing.id)
      : await db.from("ai_tunnel_devices").insert({
          app_id: appId,
          device_id: deviceId,
          device_label: label,
          token_hash: tokenHash,
        });

    if (result.error) return response({ ok: false, error: "Could not register AI tunnel device" }, 500);
    return response({ ok: true, token });
  }

  if (action !== "ask") return response({ ok: false, error: "Unknown tunnel action" }, 400);

  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return response({ ok: false, error: "AI tunnel session is missing" }, 401);

  const tokenHash = await sha256(token);
  const { data: device, error: deviceError } = await db
    .from("ai_tunnel_devices")
    .select("id, app_id, device_id, revoked, request_count, window_started_at, window_count")
    .eq("app_id", appId)
    .eq("device_id", deviceId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (deviceError || !device || device.revoked) {
    return response({ ok: false, error: "AI tunnel session is invalid" }, 401);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return response({ ok: false, error: "message is required" }, 400);
  if (message.length > MAX_MESSAGE) return response({ ok: false, error: "message is too large" }, 413);

  const nowDate = new Date();
  const windowStarted = new Date(device.window_started_at || nowDate.toISOString());
  const sameWindow = nowDate.getTime() - windowStarted.getTime() < 60 * 60 * 1000;
  const windowCount = sameWindow ? Number(device.window_count || 0) : 0;

  if (windowCount >= MAX_REQUESTS_PER_HOUR) {
    return response({ ok: false, error: "AI tunnel rate limit exceeded" }, 429);
  }

  const now = nowDate.toISOString();
  const update = await db.from("ai_tunnel_devices").update({
    last_seen_at: now,
    request_count: Number(device.request_count || 0) + 1,
    window_started_at: sameWindow ? windowStarted.toISOString() : now,
    window_count: windowCount + 1,
  }).eq("id", device.id);

  if (update.error) return response({ ok: false, error: "Could not update AI tunnel session" }, 500);

  const result = await callHostedAI([
    {
      role: "system",
      content: "You are the shared AI tunnel used by native apps and browsers. Act as a general-purpose assistant. Follow the caller's instructions, reason through multi-step tasks, do not claim a device action succeeded unless the caller reports it, and do not invent facts. Current backend mode is hosted-provider failover only.",
    },
    { role: "user", content: message },
  ]);

  if (!result.ok) return response({ ok: false, category: "GENERAL", error: result.error }, 502);

  return response({
    ok: true,
    category: "GENERAL",
    answer: result.text,
    source: "hosted:" + result.provider,
    ragApplied: false,
  });
});
