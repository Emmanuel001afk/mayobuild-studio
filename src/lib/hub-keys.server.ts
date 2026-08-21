// src/lib/hub-keys.server.ts
// Generates and verifies the "AM_" prefixed API keys other sites use to
// call /api/hub. Keys are stored as a SHA-256 hash — same practice as
// passwords — so even if the database is ever read, the real key can't be
// recovered from it.

import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "AM";

export type HubKeyScope = "owner" | "restricted";

/** Creates a brand new key. Returns the full plain-text key ONCE — after
 * this, only its hash is stored, so save/copy it immediately when shown.
 *
 * scope = 'owner'      -> your own websites (Halway, etc). No rate limit.
 * scope = 'restricted' -> anyone testing. Rate-limited, e.g. 50 calls/hour. */
export function generateHubKey(
  scope: HubKeyScope = "restricted",
  rateLimitPerHour = 50
): { fullKey: string; prefix: string; hash: string; scope: HubKeyScope; rateLimitPerHour: number } {
  const randomPart = randomBytes(24).toString("base64url"); // ~32 chars, url-safe
  const fullKey = `${KEY_PREFIX}_${randomPart}`;
  const hash = createHash("sha256").update(fullKey).digest("hex");
  return { fullKey, prefix: KEY_PREFIX, hash, scope, rateLimitPerHour: scope === "owner" ? 0 : rateLimitPerHour };
}

export function hashHubKey(candidateKey: string): string {
  return createHash("sha256").update(candidateKey).digest("hex");
}
