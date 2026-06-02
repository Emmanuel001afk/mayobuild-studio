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

/** Routing rules per user spec. */
const CHAIN: Record<RouteTask, Provider[]> = {
  complex_app: [DeepSeek, OpenAI, Groq, Gemini],
  mobile_code: [DeepSeek, OpenAI, Groq, Gemini],
  website: [OpenRouter, Mistral, HuggingFace, Cerebras],
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
  const attempts: { provider: string; error: string }[] = [];
  for (const provider of chain) {
    try {
      const out = await provider.chat(messages);
      return { ...out, attempts };
    } catch (e) {
      attempts.push({ provider: provider.name, error: (e as Error).message });
    }
  }
  throw new Error(`All providers failed for task=${task}: ${JSON.stringify(attempts)}`);
}

export async function routeImage(prompt: string): Promise<string> {
  return huggingfaceImage(prompt);
}

export const PROVIDERS_META = {
  complex_app: ["DeepSeek", "OpenAI", "Groq", "Gemini 2.5"],
  mobile_code: ["DeepSeek", "OpenAI", "Groq", "Gemini 2.5"],
  website: ["OpenRouter", "Mistral", "Hugging Face", "Cerebras"],
  image: ["Hugging Face (FLUX.1)"],
};
