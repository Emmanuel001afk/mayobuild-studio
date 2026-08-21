// src/lib/ai-providers.server.ts
// Shared AI failover helper for mayobuild-studio's server routes.
// Same pattern as Halway's supabase/functions/_shared/ai-providers.ts,
// adapted for TanStack Start (Node runtime -> process.env, not Deno.env).
//
// Order: Gemini -> Groq -> OpenRouter -> Cerebras -> Mistral -> Hugging Face

export type ChatMessage = { role: string; content: string; [key: string]: unknown };

interface ProviderConfig {
  name: string;
  envKey: string;
  url: string;
  model: string;
}

const PROVIDERS: ProviderConfig[] = [
  { name: "gemini", envKey: "GEMINI_API_KEY", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-3.1-flash-lite" },
  { name: "groq", envKey: "GROQ_API_KEY", url: "https://api.groq.com/openai/v1/chat/completions", model: "openai/gpt-oss-120b" },
  { name: "openrouter", envKey: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", model: "deepseek/deepseek-chat" },
  { name: "cerebras", envKey: "CEREBRAS_API_KEY", url: "https://api.cerebras.ai/v1/chat/completions", model: "llama3.1-70b" },
  { name: "mistral", envKey: "MISTRAL_API_KEY", url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-large-latest" },
  { name: "huggingface", envKey: "HUGGINGFACE_API_KEY", url: "https://router.huggingface.co/v1/chat/completions", model: "meta-llama/Llama-3.3-70B-Instruct" },
];

const PROVIDER_TIMEOUT_MS = 15000;

export interface AICallResult {
  ok: boolean;
  provider?: string;
  text?: string;
  toolCalls?: { id: string; function: { name: string; arguments: string } }[];
  error?: string;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function callAIWithFailover(
  messages: ChatMessage[],
  opts?: { temperature?: number; tools?: unknown[] }
): Promise<AICallResult> {
  const attempts: string[] = [];

  for (const p of PROVIDERS) {
    const key = process.env[p.envKey];
    if (!key) { attempts.push(`${p.name}: no key configured`); continue; }

    try {
      const res = await fetchWithTimeout(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: p.model,
          messages,
          temperature: opts?.temperature ?? 0.4,
          ...(opts?.tools ? { tools: opts.tools, tool_choice: "auto" } : {}),
        }),
      }, PROVIDER_TIMEOUT_MS);

      if (!res.ok) {
        attempts.push(`${p.name}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const message = data?.choices?.[0]?.message;
      const text = message?.content;
      const toolCalls = message?.tool_calls;

      // A tool call with no text is a valid, expected response — only
      // treat it as a failure if there's neither text nor a tool call.
      if (!text && !toolCalls?.length) { attempts.push(`${p.name}: empty response`); continue; }

      return { ok: true, provider: p.name, text: text ?? "", toolCalls };
    } catch (e) {
      const isTimeout = (e as Error)?.name === "AbortError";
      attempts.push(`${p.name}: ${isTimeout ? "timed out" : String((e as Error)?.message || e)}`);
      continue;
    }
  }

  return { ok: false, error: `All providers failed or unconfigured: ${attempts.join("; ")}` };
}
