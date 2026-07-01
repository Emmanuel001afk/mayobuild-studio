import type { ChatMessage, ChatResult, Provider } from "./types";

/** Generic OpenAI-compatible chat call. Most providers expose this. */
async function openaiChat(opts: {
  url: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  provider: string;
  temperature?: number;
  extraHeaders?: Record<string, string>;
}): Promise<ChatResult> {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
      ...(opts.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.5,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error(`[provider:${opts.provider}] upstream error ${res.status}`, txt.slice(0, 400));
    throw new Error(`${opts.provider} upstream error (${res.status})`);
  }
  const json: any = await res.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  return {
    text,
    provider: opts.provider,
    model: opts.model,
    tokens_in: json.usage?.prompt_tokens,
    tokens_out: json.usage?.completion_tokens,
  };
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not configured`);
  return v;
}

export const OpenAI: Provider = {
  name: "openai",
  models: ["gpt-4o-mini", "gpt-4o"],
  chat: (messages, o) =>
    openaiChat({
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: need("OPENAI_API_KEY"),
      model: o?.model ?? "gpt-4o-mini",
      temperature: o?.temperature,
      messages,
      provider: "openai",
    }),
};

export const DeepSeek: Provider = {
  name: "deepseek",
  models: ["deepseek-chat", "deepseek-coder"],
  chat: (messages, o) =>
    openaiChat({
      url: "https://api.deepseek.com/v1/chat/completions",
      apiKey: need("DEEPSEEK_API_KEY"),
      model: o?.model ?? "deepseek-chat",
      temperature: o?.temperature,
      messages,
      provider: "deepseek",
    }),
};

export const Groq: Provider = {
  name: "groq",
  models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  chat: (messages, o) =>
    openaiChat({
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: need("GROQ_API_KEY"),
      model: o?.model ?? "llama-3.3-70b-versatile",
      temperature: o?.temperature,
      messages,
      provider: "groq",
    }),
};

export const OpenRouter: Provider = {
  name: "openrouter",
  models: ["deepseek/deepseek-chat-v3-0324:free", "meta-llama/llama-3.3-70b-instruct:free"],
  chat: (messages, o) =>
    openaiChat({
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: need("OPENROUTER_API_KEY"),
      model: o?.model ?? "deepseek/deepseek-chat-v3-0324:free",
      temperature: o?.temperature,
      messages,
      provider: "openrouter",
      extraHeaders: { "HTTP-Referer": "https://mayobuild.studio", "X-Title": "Mayobuild Studio" },
    }),
};

export const Mistral: Provider = {
  name: "mistral",
  models: ["mistral-large-latest", "mistral-small-latest"],
  chat: (messages, o) =>
    openaiChat({
      url: "https://api.mistral.ai/v1/chat/completions",
      apiKey: need("MISTRAL_API_KEY"),
      model: o?.model ?? "mistral-large-latest",
      temperature: o?.temperature,
      messages,
      provider: "mistral",
    }),
};

export const Cerebras: Provider = {
  name: "cerebras",
  models: ["llama3.1-70b", "llama3.1-8b"],
  chat: (messages, o) =>
    openaiChat({
      url: "https://api.cerebras.ai/v1/chat/completions",
      apiKey: need("CEREBRAS_API_KEY"),
      model: o?.model ?? "llama3.1-70b",
      temperature: o?.temperature,
      messages,
      provider: "cerebras",
    }),
};

// Gemini uses Google's REST API
export const Gemini: Provider = {
  name: "gemini",
  models: ["gemini-2.5-flash", "gemini-2.5-pro"],
  async chat(messages, o) {
    const apiKey = need("GEMINI_API_KEY");
    const model = o?.model ?? "gemini-2.5-flash";
    const temperature = o?.temperature ?? 0.5;
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const systemInstruction = messages.find((m) => m.role === "system")?.content;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature },
        ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`gemini ${res.status}: ${t.slice(0, 400)}`);
    }
    const json: any = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
    return {
      text,
      provider: "gemini",
      model,
      tokens_in: json.usageMetadata?.promptTokenCount,
      tokens_out: json.usageMetadata?.candidatesTokenCount,
    };
  },
};

// Hugging Face — text via router API (OpenAI-compatible)
export const HuggingFace: Provider = {
  name: "huggingface",
  models: ["meta-llama/Llama-3.3-70B-Instruct"],
  chat: (messages, o) =>
    openaiChat({
      url: "https://router.huggingface.co/v1/chat/completions",
      apiKey: need("HUGGINGFACE_API_KEY"),
      model: o?.model ?? "meta-llama/Llama-3.3-70B-Instruct",
      temperature: o?.temperature,
      messages,
      provider: "huggingface",
    }),
};

/** Hugging Face image generation → returns base64 data URL */
export async function huggingfaceImage(prompt: string): Promise<string> {
  const apiKey = need("HUGGINGFACE_API_KEY");
  const model = "black-forest-labs/FLUX.1-schnell";
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: prompt }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`huggingface image ${res.status}: ${t.slice(0, 300)}`);
  }
  const ab = await res.arrayBuffer();
  const b64 = Buffer.from(ab).toString("base64");
  return `data:image/png;base64,${b64}`;
}
