/**
 * AEO root-signed trust-bundle verification.
 * Pinned root keys and monotonic version storage are caller responsibilities.
 * No network, database, registry, or private signing key is used here.
 */
export const AEO_TRUST_BUNDLE_TYP = "AEO-TRUST-BUNDLE+jwt" as const;
export const AEO_TRUST_BUNDLE_AUDIENCE = "urn:aeo:trust-bundle" as const;
const MAX_COMPACT_LENGTH = 65_536;
const MAX_BUNDLE_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AeoPinnedRootKey {
  kid: string;
  issuer: "AEO";
  algorithm: "Ed25519";
  publicKey: string | Uint8Array;
  notBefore?: number;
  notAfter?: number;
  revokedAt?: number;
}
export interface AeoTrustBundleOptions {
  pinnedRootKeys: readonly AeoPinnedRootKey[];
  minimumVersion?: number;
  nowSeconds?: number;
  clockSkewSeconds?: number;
}
export interface AeoTrustBundle {
  version: number;
  issuedAt: number;
  expiresAt: number;
  trustedKeys: readonly {
    kid: string;
    issuer: string;
    algorithm: "Ed25519";
    publicKey: Uint8Array;
    notBefore?: number;
    notAfter?: number;
    revokedAt?: number;
  }[];
  isCredentialRevoked(input: { issuer: string; jti: string; platformId: string }): boolean;
}
export class AeoTrustBundleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AeoTrustBundleError";
  }
}
function fail(code: string, message: string): never {
  throw new AeoTrustBundleError(code, message);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function decodeBase64Url(value: unknown, field: string): Uint8Array {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    fail("malformed_trust_bundle", `Invalid ${field} encoding`);
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  let binary: string;
  try { binary = atob(padded); } catch { return fail("malformed_trust_bundle", `Invalid ${field} encoding`); }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  let canonical = "";
  for (const byte of bytes) canonical += String.fromCharCode(byte);
  if (btoa(canonical).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_") !== value) {
    fail("malformed_trust_bundle", `Non-canonical ${field} encoding`);
  }
  return bytes;
}
function decodeJson(segment: string, field: string): Record<string, unknown> {
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(segment, field));
    const parsed: unknown = JSON.parse(source);
    if (!isRecord(parsed)) fail("malformed_trust_bundle", `${field} must be a JSON object`);
    return parsed;
  } catch (error) {
    if (error instanceof AeoTrustBundleError) throw error;
    return fail("malformed_trust_bundle", `Invalid ${field} JSON`);
  }
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}
function requiredString(value: unknown, field: string, max = 255): string {
  if (typeof value !== "string" || !value || value.length > max || value.trim() !== value) {
    fail("invalid_trust_bundle", `Invalid ${field}`);
  }
  return value;
}
function publicKeyBytes(value: string | Uint8Array, field: string): Uint8Array {
  const bytes = typeof value === "string" ? decodeBase64Url(value, field) : value;
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
    fail("invalid_trust_key", `${field} must be a 32-byte Ed25519 public key`);
  }
  return bytes;
}

/** Verify a root-signed bundle. Persist its returned version before accepting a lower one later. */
export async function verifyAeoTrustBundle(
  compact: string,
  options: AeoTrustBundleOptions,
): Promise<AeoTrustBundle> {
  if (typeof compact !== "string" || !compact || compact.length > MAX_COMPACT_LENGTH) {
    fail("malformed_trust_bundle", "Trust bundle is missing or exceeds the size limit");
  }
  if (!options || !Array.isArray(options.pinnedRootKeys) || options.pinnedRootKeys.length === 0) {
    fail("invalid_trust_config", "Pinned AEO root keys are required");
  }
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSeconds ?? 60;
  const minimumVersion = options.minimumVersion ?? 0;
  if (!integer(now) || !integer(skew) || skew < 0 || skew > 300 ||
      !integer(minimumVersion) || minimumVersion < 0) {
    fail("invalid_trust_config", "Invalid trust-bundle verifier configuration");
  }
  const parts = compact.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    fail("malformed_trust_bundle", "Trust bundle must be a three-part compact JWS");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson(encodedHeader, "trust-bundle header");
  const payload = decodeJson(encodedPayload, "trust-bundle payload");
  if (header.alg !== "EdDSA" || header.typ !== AEO_TRUST_BUNDLE_TYP ||
      typeof header.kid !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(header.kid) ||
      Object.keys(header).some((key) => !["alg", "typ", "kid"].includes(key))) {
    fail("unsupported_trust_bundle_header", "Unsupported AEO trust-bundle signature profile");
  }
  const roots = options.pinnedRootKeys.filter((candidate) => candidate?.kid === header.kid);
  if (roots.length !== 1) fail("untrusted_root_key", "Pinned root key is missing or ambiguous");
  const root = roots[0];
  if (root.issuer !== "AEO" || root.algorithm !== "Ed25519" ||
      (root.notBefore !== undefined && !integer(root.notBefore)) ||
      (root.notAfter !== undefined && !integer(root.notAfter)) ||
      (root.revokedAt !== undefined && !integer(root.revokedAt)) ||
      (root.notBefore !== undefined && now + skew < root.notBefore) ||
      (root.notAfter !== undefined && now - skew > root.notAfter) ||
      (root.revokedAt !== undefined && now >= root.revokedAt) ||
      (root.notBefore !== undefined && root.notAfter !== undefined && root.notAfter <= root.notBefore)) {
    fail("untrusted_root_key", "Pinned AEO root key is invalid, expired, or revoked");
  }
  if (payload.iss !== "AEO" || payload.aud !== AEO_TRUST_BUNDLE_AUDIENCE ||
      payload.bundle_type !== "aeo-trust-bundle" || payload.bundle_version !== 1) {
    fail("invalid_trust_bundle", "Trust bundle issuer, audience, or profile version is invalid");
  }
  const version = payload.version;
  const { iat, nbf, exp } = payload;
  if (!integer(version) || version < 1 || version < minimumVersion ||
      !integer(iat) || !integer(nbf) || !integer(exp) ||
      exp <= iat || nbf < iat || nbf > exp ||
      iat > now + skew || nbf > now + skew || exp <= now - skew ||
      exp - iat > MAX_BUNDLE_LIFETIME_SECONDS) {
    fail("trust_bundle_time_or_version_invalid", "Trust bundle is expired, stale, or has an invalid version/lifetime");
  }
  const signature = decodeBase64Url(encodedSignature, "trust-bundle signature");
  if (signature.length !== 64) fail("malformed_trust_bundle", "Ed25519 signature must be 64 bytes");
  const rootBytes = publicKeyBytes(root.publicKey, "Pinned root public key");
  try {
    if (!globalThis.crypto?.subtle) fail("crypto_unavailable", "WebCrypto is unavailable");
    const imported = await globalThis.crypto.subtle.importKey("raw", rootBytes, { name: "Ed25519" }, false, ["verify"]);
    const valid = await globalThis.crypto.subtle.verify(
      { name: "Ed25519" }, imported, signature, new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    if (!valid) fail("invalid_trust_bundle_signature", "Trust-bundle signature is invalid");
  } catch (error) {
    if (error instanceof AeoTrustBundleError) throw error;
    fail("crypto_unavailable", "Ed25519 trust-bundle verification is unavailable in this runtime");
  }
  if (!Array.isArray(payload.keys) || payload.keys.length < 1 || payload.keys.length > 100) {
    fail("invalid_trust_bundle", "Trust bundle must contain 1 to 100 issuer keys");
  }
  const seenKids = new Set<string>();
  const trustedKeys = payload.keys.map((entry) => {
    if (!isRecord(entry)) fail("invalid_trust_bundle", "Issuer key record must be an object");
    const kid = requiredString(entry.kid, "issuer key ID", 128);
    const issuer = requiredString(entry.issuer, "issuer");
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(kid) || seenKids.has(kid) || entry.algorithm !== "Ed25519") {
      fail("invalid_trust_bundle", "Issuer key ID is duplicated or algorithm is unsupported");
    }
    seenKids.add(kid);
    const key = publicKeyBytes(requiredString(entry.publicKey, "issuer public key", 128), "Issuer public key");
    for (const field of ["notBefore", "notAfter", "revokedAt"] as const) {
      if (entry[field] !== undefined && !integer(entry[field])) fail("invalid_trust_bundle", `Invalid issuer key ${field}`);
    }
    if (entry.notBefore !== undefined && entry.notAfter !== undefined && entry.notAfter <= entry.notBefore) {
      fail("invalid_trust_bundle", "Issuer key validity interval is invalid");
    }
    return Object.freeze({
      kid, issuer, algorithm: "Ed25519" as const, publicKey: key,
      ...(entry.notBefore !== undefined ? { notBefore: entry.notBefore } : {}),
      ...(entry.notAfter !== undefined ? { notAfter: entry.notAfter } : {}),
      ...(entry.revokedAt !== undefined ? { revokedAt: entry.revokedAt } : {}),
    });
  });
  const revokedIds = payload.revokedCredentialIds ?? [];
  if (!Array.isArray(revokedIds) || revokedIds.length > 10_000 ||
      revokedIds.some((id) => typeof id !== "string" || !UUID_V4.test(id)) ||
      new Set(revokedIds).size !== revokedIds.length) {
    fail("invalid_trust_bundle", "Credential revocation list is invalid");
  }
  const revoked = new Set(revokedIds as string[]);
  return Object.freeze({
    version, issuedAt: iat, expiresAt: exp,
    trustedKeys: Object.freeze(trustedKeys),
    isCredentialRevoked: ({ jti }: { issuer: string; jti: string; platformId: string }) => revoked.has(jti),
  });
}
