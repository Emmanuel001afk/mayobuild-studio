// ai-hub-core.ts
// Central AI hub logic for the workspace (mayobuild-studio) — meant to sit in
// /supabase/functions/_shared/ alongside your existing ai-providers.ts.
//
// Concepts translated (not copied) from:
//   - DeepThink-AIOS (Python)  -> task classification / routing
//   - reasonkit-mem (Rust)     -> hybrid memory retrieval (Reciprocal Rank Fusion)
//   - rizzclaw (Go)            -> multi-source input structuring
//
// This file has three parts: TASK ROUTER, MEMORY FUSION, VERIFICATION.

// ---------------------------------------------------------------------------
// PART 1: TASK ROUTER
// Classifies an incoming request so the hub knows which "lane" to send it
// down before picking a model/tool. Mirrors DeepThink-AIOS's router.py idea,
// rewritten to call your existing callAIWithFailover() instead of a local model.
// ---------------------------------------------------------------------------

export type TaskCategory =
  | "CODING"
  | "REASONING"
  | "FRAUD_CHECK"
  | "IMAGE"
  | "WEBSEARCH"
  | "SIMPLE";

export async function classifyTask(
  prompt: string,
  callModel: (prompt: string) => Promise<string>
): Promise<TaskCategory> {
  const lower = prompt.toLowerCase();

  // Fast keyword shortcuts first — avoids an extra AI call for obvious cases.
  if (/(fraud|fake receipt|chargeback|suspicious transfer|escrow)/.test(lower)) {
    return "FRAUD_CHECK";
  }
  if (/(generate.*image|receipt background|create.*picture)/.test(lower)) {
    return "IMAGE";
  }

  const classificationPrompt =
    "Classify this request into ONE category only. Reply with just the word.\n" +
    "CODING - writing, editing, or debugging code\n" +
    "REASONING - multi-step logic, math, planning\n" +
    "FRAUD_CHECK - checking a transaction, receipt, or payment for fraud\n" +
    "IMAGE - generating or editing an image\n" +
    "WEBSEARCH - needs current/live information\n" +
    "SIMPLE - anything else, direct Q&A\n\n" +
    `Request: ${prompt.slice(0, 500)}`;

  const result = (await callModel(classificationPrompt)).trim().toUpperCase();
  const categories: TaskCategory[] = [
    "CODING", "REASONING", "FRAUD_CHECK", "IMAGE", "WEBSEARCH", "SIMPLE",
  ];
  return categories.find((c) => result.includes(c)) ?? "SIMPLE";
}

// ---------------------------------------------------------------------------
// PART 2: MEMORY FUSION (RAG)
// Combines keyword search results and vector/embedding search results into
// one ranked list using Reciprocal Rank Fusion — same algorithm reasonkit-mem
// uses, rewritten for plain TypeScript + Supabase's pgvector results.
// ---------------------------------------------------------------------------

export interface RankedResult {
  id: string;
  rank: number; // 0-indexed position in that method's result list
}

export interface FusedResult {
  id: string;
  fusionScore: number;
}

/**
 * Reciprocal Rank Fusion: combines multiple ranked lists (e.g. keyword search
 * + vector search) into one list, without needing the raw scores to be on
 * the same scale. k=60 is the standard constant used in IR research.
 */
export function reciprocalRankFusion(
  resultLists: RankedResult[][],
  k = 60
): FusedResult[] {
  const scores = new Map<string, number>();

  for (const list of resultLists) {
    for (const { id, rank } of list) {
      const contribution = 1 / (k + rank + 1);
      scores.set(id, (scores.get(id) ?? 0) + contribution);
    }
  }

  return Array.from(scores.entries())
    .map(([id, fusionScore]) => ({ id, fusionScore }))
    .sort((a, b) => b.fusionScore - a.fusionScore);
}

/**
 * Example of how this plugs into Supabase: run a keyword search (ILIKE or
 * full-text) and a vector search (pgvector <-> operator) separately, turn
 * each into a RankedResult[], then fuse them here before feeding the top
 * results into the AI's context as "memory."
 */
export async function retrieveMemory(
  query: string,
  keywordSearch: (q: string) => Promise<{ id: string }[]>,
  vectorSearch: (q: string) => Promise<{ id: string }[]>,
  topN = 5
): Promise<string[]> {
  const [keywordHits, vectorHits] = await Promise.all([
    keywordSearch(query),
    vectorSearch(query),
  ]);

  const keywordRanked: RankedResult[] = keywordHits.map((h, i) => ({ id: h.id, rank: i }));
  const vectorRanked: RankedResult[] = vectorHits.map((h, i) => ({ id: h.id, rank: i }));

  const fused = reciprocalRankFusion([keywordRanked, vectorRanked]);
  return fused.slice(0, topN).map((r) => r.id);
}

// ---------------------------------------------------------------------------
// PART 3: VERIFICATION / CROSS-CHECK
// Two-pass answer verification — one model answers, a second pass checks it,
// matching the "AIs work as peers, cross-check before responding" idea from
// tonight's conversation.
// ---------------------------------------------------------------------------

export interface VerifiedAnswer {
  answer: string;
  verified: boolean;
  note?: string;
}

export async function answerWithVerification(
  prompt: string,
  callPrimary: (p: string) => Promise<string>,
  callVerifier: (p: string) => Promise<string>
): Promise<VerifiedAnswer> {
  const draft = await callPrimary(prompt);

  const verificationPrompt =
    "Check this answer for factual errors, code bugs, or logical mistakes. " +
    "Reply 'OK' if it's correct, or explain the specific problem if not.\n\n" +
    `Original question: ${prompt}\n\nAnswer to check: ${draft}`;

  const verdict = await callVerifier(verificationPrompt);
  const verified = verdict.trim().toUpperCase().startsWith("OK");

  return {
    answer: draft,
    verified,
    note: verified ? undefined : verdict,
  };
}
