/**
 * AEO membership and UCCS registration verification.
 *
 * This is deliberately a local verifier: no registry lookup, routing, storage,
 * capability grant, device authentication, or user-consent decision is implied.
 */
export const AEO_UCCS_PROTOCOL = "uccs/1" as const;
export const AEO_MEMBERSHIP_TYP = "AEO-MEMBERSHIP+jwt" as const;
export const AEO_FRAMEWORK_AUDIENCE = "urn:aeo:framework" as const;

export interface AeoTrustedIssuerKey {
  kid: string;
  issuer: string;
  algorithm: "Ed25519";
  publicKey: Uint8Array | string;
  notBefore?: number;
  notAfter?: number;
  revokedAt?: number;
}

export interface AeoMembershipVerificationOptions {
  trustedKeys: readonly AeoTrustedIssuerKey[];
  isCredentialRevoked: (input: {
    issuer: string;
    jti: string;
    platformId: string;
  }) => boolean | Promise<boolean>;
  nowSeconds?: number;
  clockSkewSeconds?: number;
  maxLifetimeSeconds?: number;
}

export interface AeoVerifiedMembership {
  valid: true;
  ecosystem: "AEO";
  issuer: string;
  platformId: string;
  platformName: string;
  publisherId: string;
  publisherKeyId: string;
  credentialId: string;
  issuedAt: number;
  expiresAt: number;
  scopes: readonly string[];
}

export interface AeoPeerRegistration {
  ecosystem: "AEO";
  protocol: typeof AEO_UCCS_PROTOCOL;
  platformId: string;
  displayName: string;
  membershipCredential: string;
}

export class AeoMembershipError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AeoMembershipError";
  }
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLATFORM_ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

function fail(code: string, message: string): never {
  throw new AeoMembershipError(code, message);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeSegment(segment: string, field: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) fail("malformed_token", `Invalid ${field} encoding`);
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  let encoded = "";
  for (const byte of bytes) encoded += String.fromCharCode(byte);
  const canonical = btoa(encoded).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  if (canonical !== segment) fail("malformed_token", `Non-canonical ${field} encoding`);
  return bytes;
}

function decodeJson(segment: string, field: string): Record<string, unknown> {
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(decodeSegment(segment, field));
    const parsed: unknown = JSON.parse(source);
    if (!record(parsed)) fail("malformed_token", `${field} must be a JSON object`);
    return parsed;
  } catch (error) {
    if (error instanceof AeoMembershipError) throw error;
    fail("malformed_token", `Invalid ${field} JSON`);
  }
}

function requiredString(value: unknown, field: string, max = 255): string {
  if (typeof value !== "string" || !value || value.length > max || value.trim() !== value) {
    fail("invalid_claims", `Invalid ${field}`);
  }
  return value;
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function rawKey(value: string | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) return value;
  return decodeSegment(value, "trusted public key");
}

export async function verifyAeoMembershipCredential(
  compact: string,
  options: AeoMembershipVerificationOptions,
): Promise<AeoVerifiedMembership> {
  if (typeof compact !== "string" || !compact || compact.length > 16_384) {
    fail("malformed_token", "Credential is missing or exceeds the size limit");
  }
  if (!options || !Array.isArray(options.trustedKeys) ||
      typeof options.isCredentialRevoked !== "function") {
    fail("invalid_verifier_config", "Trusted issuer keys and revocation checker are required");
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSeconds ?? 60;
  const maxLifetime = options.maxLifetimeSeconds ?? 90 * 24 * 60 * 60;
  if (!integer(now) || !integer(skew) || skew < 0 || skew > 300 ||
      !integer(maxLifetime) || maxLifetime < 60 || maxLifetime > 90 * 24 * 60 * 60) {
    fail("invalid_verifier_config", "Invalid verifier time configuration");
  }

  const parts = compact.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    fail("malformed_token", "Credential must be a three-part compact JWS");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson(encodedHeader, "protected header");
  const claims = decodeJson(encodedPayload, "payload");
  if (header.alg !== "EdDSA" || header.typ !== AEO_MEMBERSHIP_TYP ||
      typeof header.kid !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(header.kid) ||
      Object.keys(header).some((key) => !["alg", "typ", "kid"].includes(key))) {
    fail("unsupported_header", "Credential does not match the AEO EdDSA membership profile");
  }

  const matches = options.trustedKeys.filter((key) => key.kid === header.kid);
  if (matches.length !== 1) fail("untrusted_issuer_key", "Signing key is missing or ambiguous");
  const key = matches[0];
  if (key.algorithm !== "Ed25519" || !key.issuer || key.issuer.trim() !== key.issuer) {
    fail("invalid_trust_key", "Trusted issuer key is invalid");
  }
  if ((key.notBefore !== undefined && (!integer(key.notBefore) || now + skew < key.notBefore)) ||
      (key.notAfter !== undefined && (!integer(key.notAfter) || now - skew > key.notAfter)) ||
      (key.revokedAt !== undefined && (!integer(key.revokedAt) || now >= key.revokedAt)) ||
      (key.notBefore !== undefined && key.notAfter !== undefined && key.notAfter <= key.notBefore)) {
    fail("untrusted_issuer_key", "Signing key is outside its validity period or revoked");
  }

  const issuer = requiredString(claims.iss, "issuer");
  if (issuer !== key.issuer || claims.aud !== AEO_FRAMEWORK_AUDIENCE ||
      claims.ecosystem !== "AEO" || claims.credential_type !== "aeo-membership" ||
      claims.credential_version !== 1) {
    fail("wrong_credential_purpose", "Credential issuer, audience, ecosystem or type is invalid");
  }
  const platformId = requiredString(claims.sub, "platform ID");
  if (!PLATFORM_ID.test(platformId) || !record(claims.platform) ||
      claims.platform.id !== platformId) {
    fail("invalid_claims", "Signed platform identity is invalid or inconsistent");
  }
  const platformName = requiredString(claims.platform.name, "platform name", 80);
  if (!record(claims.publisher)) fail("invalid_claims", "Publisher identity is missing");
  const publisherId = requiredString(claims.publisher.id, "publisher ID");
  const publisherKeyId = requiredString(claims.publisher.key_id, "publisher key ID", 128);
  if (!PLATFORM_ID.test(publisherId)) fail("invalid_claims", "Publisher ID is invalid");

  const credentialId = requiredString(claims.jti, "credential ID", 64);
  if (!UUID_V4.test(credentialId)) fail("invalid_claims", "Credential ID must be a UUIDv4");
  if (!Array.isArray(claims.scope) || !claims.scope.includes("member") ||
      claims.scope.some((scope) => typeof scope !== "string") ||
      new Set(claims.scope).size !== claims.scope.length) {
    fail("invalid_claims", "Membership scope must contain a unique member entry");
  }

  if (!integer(claims.iat) || !integer(claims.nbf) || !integer(claims.exp)) {
    fail("credential_time_invalid", "Credential timestamps must be safe integers");
  }
  const iat = claims.iat;
  const nbf = claims.nbf;
  const exp = claims.exp;
  if (exp <= iat || nbf < iat || nbf > exp ||
      iat > now + skew || nbf > now + skew || exp <= now - skew ||
      exp - iat > maxLifetime) {
    fail("credential_time_invalid", "Credential is expired, not yet valid, or has an invalid lifetime");
  }

  const signature = decodeSegment(encodedSignature, "signature");
  if (signature.length !== 64) fail("malformed_token", "Ed25519 signature must be 64 bytes");
  const publicKey = rawKey(key.publicKey);
  if (publicKey.length !== 32) fail("invalid_trust_key", "Ed25519 public key must be 32 bytes");
  try {
    if (!globalThis.crypto?.subtle) fail("crypto_unavailable", "WebCrypto is unavailable");
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      "raw", publicKey.slice().buffer as ArrayBuffer, { name: "Ed25519" }, false, ["verify"],
    );
    const valid = await globalThis.crypto.subtle.verify(
      { name: "Ed25519" }, cryptoKey, signature.slice().buffer as ArrayBuffer,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    if (!valid) fail("invalid_signature", "Credential signature is invalid");
  } catch (error) {
    if (error instanceof AeoMembershipError) throw error;
    fail("crypto_unavailable", "WebCrypto Ed25519 verification is unavailable in this runtime");
  }

  let revoked: boolean;
  try {
    revoked = await options.isCredentialRevoked({ issuer, jti: credentialId, platformId });
  } catch {
    fail("revocation_check_failed", "Credential revocation status could not be checked");
  }
  if (revoked !== false) fail("credential_revoked_or_unknown", "Credential is revoked or its status is unknown");

  return Object.freeze({
    valid: true,
    ecosystem: "AEO",
    issuer,
    platformId,
    platformName,
    publisherId,
    publisherKeyId,
    credentialId,
    issuedAt: iat,
    expiresAt: exp,
    scopes: Object.freeze([...claims.scope]),
  });
}

export async function verifyAeoPeerRegistration(
  registration: AeoPeerRegistration,
  options: AeoMembershipVerificationOptions,
): Promise<{ valid: true; protocol: typeof AEO_UCCS_PROTOCOL; platformId: string; displayName: string; membership: AeoVerifiedMembership }> {
  if (!record(registration) || registration.ecosystem !== "AEO" ||
      registration.protocol !== AEO_UCCS_PROTOCOL) {
    fail("invalid_registration", "Unsupported AEO ecosystem or UCCS protocol");
  }
  const platformId = requiredString(registration.platformId, "registration platform ID");
  const displayName = requiredString(registration.displayName, "registration display name", 80);
  if (!PLATFORM_ID.test(platformId)) fail("invalid_registration", "Invalid registration platform ID");
  const membership = await verifyAeoMembershipCredential(registration.membershipCredential, options);
  if (membership.platformId !== platformId || membership.platformName !== displayName) {
    fail("registration_identity_mismatch", "Registration identity does not match signed membership credential");
  }
  return Object.freeze({ valid: true, protocol: AEO_UCCS_PROTOCOL, platformId, displayName, membership });
}


export const AEO_TRUST_BUNDLE_TYP = "AEO-TRUST-BUNDLE+jwt" as const;
export const AEO_TRUST_BUNDLE_AUDIENCE = "urn:aeo:trust-bundle" as const;

export interface AeoPinnedRootKey {
  kid: string;
  issuer: "AEO";
  algorithm: "Ed25519";
  publicKey: Uint8Array | string;
  notBefore?: number;
  notAfter?: number;
  revokedAt?: number;
}

export interface AeoTrustBundleVerificationOptions {
  pinnedRootKeys: readonly AeoPinnedRootKey[];
  minimumVersion?: number;
  nowSeconds?: number;
  clockSkewSeconds?: number;
}

export interface AeoVerifiedTrustBundle {
  version: number;
  issuedAt: number;
  expiresAt: number;
  trustedKeys: readonly AeoTrustedIssuerKey[];
  isCredentialRevoked: (input: { issuer: string; jti: string; platformId: string }) => boolean;
}

/** Verify a root-signed trust bundle. Persist its version and pass it as minimumVersion to prevent rollback. */
export async function verifyAeoTrustBundle(
  compact: string,
  options: AeoTrustBundleVerificationOptions,
): Promise<AeoVerifiedTrustBundle> {
  if (typeof compact !== "string" || !compact || compact.length > 65_536) {
    fail("malformed_trust_bundle", "Trust bundle is missing or exceeds the size limit");
  }
  if (!options || !Array.isArray(options.pinnedRootKeys) || options.pinnedRootKeys.length === 0) {
    fail("invalid_trust_config", "Pinned AEO root keys are required");
  }
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSeconds ?? 60;
  const minimumVersion = options.minimumVersion ?? 0;
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(skew) || skew < 0 || skew > 300 ||
      !Number.isSafeInteger(minimumVersion) || minimumVersion < 0) {
    fail("invalid_trust_config", "Invalid trust-bundle verifier configuration");
  }
  const parts = compact.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    fail("malformed_trust_bundle", "Trust bundle must be a three-part compact JWS");
  }
  const header = decodeJson(parts[0], "trust-bundle header");
  const payload = decodeJson(parts[1], "trust-bundle payload");
  if (header.alg !== "EdDSA" || header.typ !== AEO_TRUST_BUNDLE_TYP ||
      typeof header.kid !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(header.kid) ||
      Object.keys(header).some((key) => !["alg", "typ", "kid"].includes(key))) {
    fail("unsupported_trust_bundle_header", "Trust bundle does not match the AEO root-signature profile");
  }
  const roots = options.pinnedRootKeys.filter((root) => root.kid === header.kid);
  if (roots.length !== 1) fail("untrusted_root_key", "Pinned AEO root key is missing or ambiguous");
  const root = roots[0];
  if (root.issuer !== "AEO" || root.algorithm !== "Ed25519" ||
      (root.notBefore !== undefined && (!Number.isSafeInteger(root.notBefore) || now + skew < root.notBefore)) ||
      (root.notAfter !== undefined && (!Number.isSafeInteger(root.notAfter) || now - skew > root.notAfter)) ||
      (root.revokedAt !== undefined && (!Number.isSafeInteger(root.revokedAt) || now >= root.revokedAt)) ||
      (root.notBefore !== undefined && root.notAfter !== undefined && root.notAfter <= root.notBefore)) {
    fail("untrusted_root_key", "Pinned AEO root key is invalid, expired, or revoked");
  }
  if (payload.iss !== "AEO" || payload.aud !== AEO_TRUST_BUNDLE_AUDIENCE ||
      payload.bundle_type !== "aeo-trust-bundle" || payload.bundle_version !== 1) {
    fail("invalid_trust_bundle", "Trust bundle issuer, audience or profile version is invalid");
  }
  const version = payload.version;
  const iat = payload.iat;
  const nbf = payload.nbf;
  const exp = payload.exp;
  if (!Number.isSafeInteger(version) || (version as number) < 1 ||
      (version as number) < minimumVersion ||
      ![iat, nbf, exp].every(Number.isSafeInteger) ||
      (exp as number) <= (iat as number) || (nbf as number) < (iat as number) ||
      (nbf as number) > (exp as number) || (iat as number) > now + skew ||
      (nbf as number) > now + skew || (exp as number) <= now - skew ||
      (exp as number) - (iat as number) > 7 * 24 * 60 * 60) {
    fail("trust_bundle_time_or_version_invalid", "Trust bundle is expired, stale, or has an invalid lifetime/version");
  }
  const signature = decodeSegment(parts[2], "trust-bundle signature");
  if (signature.length !== 64) fail("malformed_trust_bundle", "Ed25519 trust-bundle signature must be 64 bytes");
  const publicKey = rawKey(root.publicKey);
  if (publicKey.length !== 32) fail("invalid_trust_key", "Pinned root public key must be 32 bytes");
  try {
    if (!globalThis.crypto?.subtle) fail("crypto_unavailable", "WebCrypto is unavailable");
    const imported = await globalThis.crypto.subtle.importKey(
      "raw", publicKey.slice().buffer as ArrayBuffer, { name: "Ed25519" }, false, ["verify"],
    );
    const valid = await globalThis.crypto.subtle.verify(
      { name: "Ed25519" }, imported, signature.slice().buffer as ArrayBuffer,
      new TextEncoder().encode(parts[0] + "." + parts[1]),
    );
    if (!valid) fail("invalid_trust_bundle_signature", "Trust bundle signature is invalid");
  } catch (error) {
    if (error instanceof AeoMembershipError) throw error;
    fail("crypto_unavailable", "Ed25519 trust-bundle verification is unavailable in this runtime");
  }
  if (!Array.isArray(payload.keys) || payload.keys.length < 1 || payload.keys.length > 100) {
    fail("invalid_trust_bundle", "Trust bundle must contain 1 to 100 issuer keys");
  }
  const seenKids = new Set<string>();
  const trustedKeys = payload.keys.map((item) => {
    if (!record(item)) fail("invalid_trust_bundle", "Invalid issuer key record");
    const kid = requiredString(item.kid, "issuer key ID", 128);
    const issuer = requiredString(item.issuer, "issuer");
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(kid) || seenKids.has(kid) || item.algorithm !== "Ed25519") {
      fail("invalid_trust_bundle", "Issuer key ID is duplicated or its algorithm is unsupported");
    }
    seenKids.add(kid);
    const issuerPublicKey = decodeSegment(requiredString(item.publicKey, "issuer public key", 128), "issuer public key");
    if (issuerPublicKey.length !== 32) fail("invalid_trust_bundle", "Issuer Ed25519 public key must be 32 bytes");
    for (const field of ["notBefore", "notAfter", "revokedAt"] as const) {
      if (item[field] !== undefined && !Number.isSafeInteger(item[field])) {
        fail("invalid_trust_bundle", "Invalid issuer key " + field);
      }
    }
    const notBefore = item.notBefore;
    const notAfter = item.notAfter;
    if (typeof notBefore === "number" && typeof notAfter === "number" && notAfter <= notBefore) {
      fail("invalid_trust_bundle", "Issuer key validity interval is invalid");
    }
    return Object.freeze({
      kid, issuer, algorithm: "Ed25519" as const, publicKey: issuerPublicKey,
      ...(item.notBefore !== undefined ? { notBefore: item.notBefore as number } : {}),
      ...(item.notAfter !== undefined ? { notAfter: item.notAfter as number } : {}),
      ...(item.revokedAt !== undefined ? { revokedAt: item.revokedAt as number } : {}),
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
    version: version as number,
    issuedAt: iat as number,
    expiresAt: exp as number,
    trustedKeys: Object.freeze(trustedKeys),
    isCredentialRevoked: ({ jti }: { issuer: string; jti: string; platformId: string }) => revoked.has(jti),
  });
}
