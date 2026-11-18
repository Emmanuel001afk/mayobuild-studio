// Client-side AI provider keys + failover chat for the offline app.
//
// The web build's AI router (src/lib/router) runs server-side and reads keys
// from environment variables — the installed shell (Electron/Capacitor) has
// no server, so it could never reach it. This module is the shell's answer:
// the user pastes their own provider keys into the app (Assist → Cloud AI),
// they are stored ONLY in this device's localStorage, and chat requests go
// straight from the device to the chosen provider (CORS-enabled endpoints,
// all OpenAI-compatible). No Mayobuild server is involved; the app itself
// stays 100% offline.
//
// Providers mirror the server router's failover list (ai-providers.server.ts)
// plus OpenAI and DeepSeek, so any key the user already has works.

export interface AiProvider {
  id: string;
  name: string;
  url: string;
  model: string;
  hint: string;
}

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-3.1-flash-lite",
    hint: "aistudio.google.com → Get API key",
  },
  {
    id: "groq",
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "openai/gpt-oss-120b",
    hint: "console.groq.com → API keys",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "deepseek/deepseek-chat",
    hint: "openrouter.ai → Keys (one key, 300+ models)",
  },
  {
    id: "openai",
    name: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    hint: "platform.openai.com → API keys",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    url: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
    hint: "platform.deepseek.com → API keys",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    url: "https://api.cerebras.ai/v1/chat/completions",
    model: "llama3.1-70b",
    hint: "inference.cerebras.ai → API keys",
  },
  {
    id: "mistral",
    name: "Mistral",
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-large-latest",
    hint: "console.mistral.ai → Keys",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    url: "https://router.huggingface.co/v1/chat/completions",
    model: "meta-llama/Llama-3.3-70B-Instruct",
    hint: "huggingface.co → Settings → Access tokens",
  },
];

const STORE_KEY = "mayobuild-ai-keys-v1";

function readAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(keys: Record<string, string>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(keys));
  } catch {
    /* storage full/unavailable — keys stay in memory for the session */
  }
}

export const aiKeys = {
  /** All stored keys (provider id → key). */
  all(): Record<string, string> {
    return readAll();
  },
  get(id: string): string | null {
    const k = readAll()[id];
    return k && k.trim() ? k.trim() : null;
  },
  set(id: string, key: string) {
    const all = readAll();
    if (key && key.trim()) all[id] = key.trim();
    else delete all[id];
    writeAll(all);
  },
  hasAny(): boolean {
    return Object.values(readAll()).some(Boolean);
  },
  /** Human-readable list of providers with a key saved. */
  withKeys(): string[] {
    return Object.keys(readAll()).filter((id) => AI_PROVIDERS.some((p) => p.id === id));
  },
};

export interface CloudChatResult {
  text: string;
  provider: string;
  model: string;
}

async function callProvider(
  p: AiProvider,
  key: string,
  messages: { role: string; content: string }[],
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(p.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: p.model, messages, temperature: 0.7, max_tokens: 600 }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${body ? ` — ${body.slice(0, 140)}` : ""}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("empty response");
    return text;
  } finally {
    clearTimeout(to);
  }
}

/**
 * Chat with the first provider (in failover order) that has a stored key and
 * answers. Throws an Error summarising every failed attempt when none works.
 */
export async function cloudChat(
  messages: { role: string; content: string }[],
  opts?: { timeoutMs?: number; onTry?: (provider: string) => void },
): Promise<CloudChatResult> {
  const keys = aiKeys.all();
  const attempts: string[] = [];
  for (const p of AI_PROVIDERS) {
    const key = keys[p.id];
    if (!key || !key.trim()) continue;
    opts?.onTry?.(p.name);
    try {
      const text = await callProvider(p, key, messages, opts?.timeoutMs ?? 30_000);
      return { text, provider: p.name, model: p.model };
    } catch (e) {
      attempts.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(
    attempts.length
      ? `All configured providers failed:\n${attempts.join("\n")}`
      : "No API keys stored yet — add one in Assist → Cloud AI",
  );
}

/** One-token-ish round trip to validate a stored (or new) key. */
export async function testKey(providerId: string, keyOverride?: string): Promise<{ ok: boolean; message: string }> {
  const p = AI_PROVIDERS.find((x) => x.id === providerId);
  if (!p) return { ok: false, message: "Unknown provider" };
  const key = keyOverride ?? aiKeys.get(providerId);
  if (!key) return { ok: false, message: "No key" };
  try {
    await callProvider(
      p,
      key,
      [
        { role: "system", content: "Reply with the single word: ok" },
        { role: "user", content: "ping" },
      ],
      20_000,
    );
    return { ok: true, message: `Works — ${p.model} answered` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
