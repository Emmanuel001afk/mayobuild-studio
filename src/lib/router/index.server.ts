import {
  Cerebras,
  DeepSeek,
  Gemini,
  Groq,
  HuggingFace,
  Mistral,
  OpenAI,
  OpenRouter,
  huggingfaceImage,
} from "./providers/all.server";
import type { ChatMessage, ChatResult, Provider } from "./providers/types";

export type RouteTask = "complex_app" | "mobile_code" | "website" | "image";

/** Static routing rules per user spec. The Orchestrator brain re-ranks these at runtime. */
const CHAIN: Record<RouteTask, Provider[]> = {
  complex_app: [Gemini, DeepSeek, OpenAI, Groq, OpenRouter, Mistral, Cerebras, HuggingFace],
  mobile_code: [Gemini, DeepSeek, OpenAI, Groq, OpenRouter, Mistral, Cerebras, HuggingFace],
  website: [DeepSeek, Gemini, OpenAI, Groq, OpenRouter, Mistral, Cerebras, HuggingFace],
  image: [],
};

const PROVIDER_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, provider: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${provider} timed out after ${PROVIDER_TIMEOUT_MS}ms`)), PROVIDER_TIMEOUT_MS);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function routeChat(
  task: RouteTask,
  messages: ChatMessage[],
  opts?: { preferProvider?: string; rank?: (providers: Provider[]) => Provider[] },
): Promise<ChatResult & { attempts: { provider: string; error: string }[] }> {
  if (task === "image") throw new Error("Use routeImage for image tasks");
  let chain = CHAIN[task];
  if (opts?.rank) chain = opts.rank(chain);
  if (opts?.preferProvider) {
    const head = chain.find((p) => p.name === opts.preferProvider);
    if (head) chain = [head, ...chain.filter((p) => p !== head)];
  }
  const temperature = task === "website" ? 0.2 : task === "complex_app" ? 0.8 : task === "mobile_code" ? 0.7 : 0.5;
  const attempts: { provider: string; error: string }[] = [];
  for (const provider of chain) {
    try {
      const out = await withTimeout(provider.chat(messages, { temperature }), provider.name);
      return { ...out, attempts };
    } catch (e) {
      attempts.push({ provider: provider.name, error: (e as Error).message });
    }
  }
  console.error("[router] all providers failed", { task, attempts });
  throw new Error("AI generation failed. Please try again.");
}

export async function routeImage(prompt: string): Promise<string> {
  return huggingfaceImage(prompt);
}

export const PROVIDERS_META = {
  complex_app: ["Gemini 2.5", "DeepSeek", "OpenAI", "Groq", "OpenRouter", "Mistral", "Cerebras", "HuggingFace"],
  mobile_code: ["Gemini 2.5", "DeepSeek", "OpenAI", "Groq", "OpenRouter", "Mistral", "Cerebras", "HuggingFace"],
  website: ["DeepSeek", "Gemini 2.5", "OpenAI", "Groq", "OpenRouter", "Mistral", "Cerebras", "HuggingFace"],
  image: ["Hugging Face (FLUX.1)"],
};
