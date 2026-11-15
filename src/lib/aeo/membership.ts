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

  const { iat, nbf, exp } = claims;
  if (![iat, nbf, exp].every(integer) || exp <= iat || nbf < iat || nbf > exp ||
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
      "raw", publicKey, { name: "Ed25519" }, false, ["verify"],
    );
    const valid = await globalThis.crypto.subtle.verify(
      { name: "Ed25519" }, cryptoKey, signature,
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
