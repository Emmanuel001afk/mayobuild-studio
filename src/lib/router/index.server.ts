import {
  Cerebras,
  DeepSeek,
  Gemini,
  Groq,
  HuggingFace,
  Mistral,
  OpenRouter,
  huggingfaceImage,
} from "./providers/all.server";
import type { ChatMessage, ChatResult, Provider } from "./providers/types";

export type RouteTask = "complex_app" | "mobile_code" | "website" | "image";

/** Routing rules per user spec. */
const CHAIN: Record<RouteTask, Provider[]> = {
  // Building from scratch: Gemini first (smartest, best reasoning for generating full apps)
  complex_app: [Gemini, DeepSeek, Groq, OpenRouter, Mistral, Cerebras, HuggingFace],
  // Mobile building: same as complex_app
  mobile_code: [Gemini, DeepSeek, Groq, OpenRouter, Mistral, Cerebras, HuggingFace],
  // Editing existing sites: DeepSeek first (best for understanding and editing code)
  website: [DeepSeek, Gemini, Groq, OpenRouter, Mistral, Cerebras, HuggingFace],
  image: [], // handled separately
};

export async function routeChat(
  task: RouteTask,
  messages: ChatMessage[],
  opts?: { preferProvider?: string },
): Promise<ChatResult & { attempts: { provider: string; error: string }[] }> {
  if (task === "image") throw new Error("Use routeImage for image tasks");
  let chain = CHAIN[task];
  if (opts?.preferProvider) {
    const head = chain.find((p) => p.name === opts.preferProvider);
    if (head) chain = [head, ...chain.filter((p) => p !== head)];
  }
  const temperature = task === "website" ? 0.2 : task === "complex_app" ? 0.8 : task === "mobile_code" ? 0.7 : 0.5;
  const attempts: { provider: string; error: string }[] = [];
  for (const provider of chain) {
    try {
      const out = await provider.chat(messages, { temperature });
      return { ...out, attempts };
    } catch (e) {
      attempts.push({ provider: provider.name, error: (e as Error).message });
    }
  }
  // Log the detailed provider failures server-side only; throw a sanitized error to the caller.
  console.error("[router] all providers failed", { task, attempts });
  throw new Error("AI generation failed. Please try again.");
}

export async function routeImage(prompt: string): Promise<string> {
  return huggingfaceImage(prompt);
}

export const PROVIDERS_META = {
  complex_app: ["Gemini 2.5", "DeepSeek", "Groq", "OpenRouter", "Mistral", "Cerebras", "HuggingFace"],
  mobile_code: ["Gemini 2.5", "DeepSeek", "Groq", "OpenRouter", "Mistral", "Cerebras", "HuggingFace"],
  website: ["DeepSeek", "Gemini 2.5", "Groq", "OpenRouter", "Mistral", "Cerebras", "HuggingFace"],
  image: ["Hugging Face (FLUX.1)"],
};
