// src/lib/aem-core-tools.server.ts
// The top-priority tools for AEM AI — kept deliberately small (not every
// possible tool at once). Add more here later as real needs come up.
//
// 1. delegate_to_coding_specialist — the small local model hands off real
//    coding questions to a stronger hosted model, in parallel, instead of
//    struggling alone (this is your "point the foot, carry the spoon" idea).
// 2. generate_image — Pollination.ai, free, no key needed.
// 3. web_search — DuckDuckGo instant-answer API, free, no key needed
//    (limited compared to a real search engine, but genuinely free).

import { callAIWithFailover } from "@/lib/ai-providers.server";
import { getAdmin } from "@/integrations/mysupabase/admin.server";

/** A narrow CONSULT, not a replacement — the local 0.5B model stays the
 * one writing the actual code. This just answers one specific, narrow
 * sub-question (e.g. "correct syntax for X", "what does this error mean")
 * so the local model can use that piece and still produce the final
 * answer itself. */
export async function consultOnCodingDetail(narrowQuestion: string): Promise<string> {
  const res = await callAIWithFailover([
    {
      role: "system",
      content:
        "Answer ONLY the specific narrow technical detail asked — a syntax " +
        "rule, a library fact, an error explanation. One or two sentences " +
        "maximum. Do NOT write a full solution or full code block.",
    },
    { role: "user", content: narrowQuestion },
  ]);
  if (!res.ok) throw new Error(res.error ?? "consult call failed");
  return res.text ?? "";
}

export async function generateImage(prompt: string): Promise<{ url: string }> {
  // Pollination.ai: free, no API key, just a URL that returns the image.
  const encoded = encodeURIComponent(prompt);
  return { url: `https://image.pollinations.ai/prompt/${encoded}` };
}

export async function learnFromYoutube(videoUrl: string): Promise<{ transcript: string; note?: string }> {
  const idMatch = videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!idMatch) return { transcript: "", note: "Could not extract a video ID from that URL." };
  const videoId = idMatch[1];

  try {
    // Public caption track endpoint — no API key needed, but this is an
    // unofficial method (not YouTube's official Data API), so it can
    // occasionally break if YouTube changes something on their end.
    const res = await fetch(`https://video.google.com/timedtext?lang=en&v=${videoId}`);
    if (!res.ok) return { transcript: "", note: "No captions available for this video." };
    const xml = await res.text();
    const text = xml
      .replace(/<[^>]+>/g, " ")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return { transcript: "", note: "This video has no English captions." };

    // Save what was learned so this video never needs re-fetching — the
    // small local model can pull this from memory next time via RAG.
    getAdmin().from("hub_memory").insert({
      source: "youtube",
      content: `Video ${videoUrl}:\n${text.slice(0, 4000)}`,
    }).then(() => {});

    return { transcript: text.slice(0, 6000) };
  } catch {
    return { transcript: "", note: "Could not fetch transcript — this method is unofficial and can occasionally fail." };
  }
}

export async function webSearch(query: string): Promise<{ summary: string; source?: string }> {
  const res = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
  );
  if (!res.ok) return { summary: "Search unavailable right now." };
  const data = await res.json();
  const summary = data?.AbstractText || data?.Answer || "No direct summary found for this query.";
  return { summary, source: data?.AbstractURL || undefined };
}

// --- Tool definitions, OpenAI-compatible format, for the hub's tool loop ---
export const CORE_TOOLS = [
  {
    type: "function",
    function: {
      name: "consult_on_coding_detail",
      description: "Ask a narrow, specific coding question (syntax, error meaning, a library fact) — NOT a request to write the full solution. You (the local model) remain the one writing the actual code.",
      parameters: {
        type: "object",
        properties: { narrowQuestion: { type: "string" } },
        required: ["narrowQuestion"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Generate an image from a text prompt (e.g. a receipt background).",
      parameters: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information not in memory.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "learn_from_youtube",
      description: "Fetch a YouTube video's transcript to learn from it (e.g. a coding tutorial). Use when a topic isn't well covered by memory or search.",
      parameters: {
        type: "object",
        properties: { videoUrl: { type: "string" } },
        required: ["videoUrl"],
      },
    },
  },
] as const;

export async function runCoreTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "consult_on_coding_detail":
      return { answer: await consultOnCodingDetail(String(args.narrowQuestion)) };
    case "generate_image":
      return await generateImage(String(args.prompt));
    case "web_search":
      return await webSearch(String(args.query));
    case "learn_from_youtube":
      return await learnFromYoutube(String(args.videoUrl));
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
