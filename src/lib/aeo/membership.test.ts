import { describe, expect, it } from "bun:test";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { verifyAeoTrustBundle } from "./trust-bundle";
import {
  AEO_FRAMEWORK_AUDIENCE,
  AEO_MEMBERSHIP_TYP,
  AEO_UCCS_PROTOCOL,
  verifyAeoMembershipCredential,
  verifyAeoPeerRegistration,
} from "./membership";

const cryptoApi = globalThis.crypto ?? webcrypto;
const now = 1_800_000_000;
const pairPromise = cryptoApi.subtle.generateKey("Ed25519", true, ["sign", "verify"]);

async function fixture() {
  const pair = await pairPromise;
  const publicKey = new Uint8Array(await cryptoApi.subtle.exportKey("raw", pair.publicKey));
  const b64 = (bytes: Uint8Array) => {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  };
  const claims = {
    iss: "https://identity.aeo.example",
    aud: AEO_FRAMEWORK_AUDIENCE,
    ecosystem: "AEO",
    credential_type: "aeo-membership",
    credential_version: 1,
    sub: "com.aeo.testplatform",
    platform: { id: "com.aeo.testplatform", name: "AEO Test Platform" },
    publisher: { id: "com.aeo.platforms", key_id: "halwayin-test-key" },
    scope: ["member"],
    jti: "7f4e8c1a-4b8d-4c5a-9e2d-2f7a8b9c0d1e",
    iat: now - 60,
    nbf: now - 60,
    exp: now + 86_340,
  };
  const json = (value: unknown) => b64(new TextEncoder().encode(JSON.stringify(value)));
  const header = json({ alg: "EdDSA", typ: AEO_MEMBERSHIP_TYP, kid: "test-issuer" });
  const payload = json(claims);
  const input = header + "." + payload;
  const signature = new Uint8Array(await cryptoApi.subtle.sign("Ed25519", pair.privateKey, new TextEncoder().encode(input)));
  const token = input + "." + b64(signature);
  return {
    token,
    claims,
    options: {
      trustedKeys: [{ kid: "test-issuer", issuer: claims.iss, algorithm: "Ed25519" as const, publicKey, notBefore: now - 10_000, notAfter: now + 1_000_000 }],
      isCredentialRevoked: async () => false,
      nowSeconds: now,
    },
  };
}

describe("AEO membership verification", () => {
  it("accepts a correctly signed membership credential", async () => {
    const f = await fixture();
    const result = await verifyAeoMembershipCredential(f.token, f.options);
    expect(result.platformId).toBe("com.aeo.testplatform");
  });

  it("fails closed when revocation status is positive", async () => {
    const f = await fixture();
    await expect(verifyAeoMembershipCredential(f.token, {
      ...f.options,
      isCredentialRevoked: async () => true,
    })).rejects.toThrow(/revoked/i);
  });

  it("binds the registration envelope to the signed platform identity", async () => {
    const f = await fixture();
    const registration = {
      ecosystem: "AEO" as const,
      protocol: AEO_UCCS_PROTOCOL,
      platformId: "com.aeo.testplatform",
      displayName: "AEO Test Platform",
      membershipCredential: f.token,
    };
    await expect(verifyAeoPeerRegistration(registration, f.options)).resolves.toMatchObject({
      valid: true,
      platformId: "com.aeo.testplatform",
    });
    await expect(verifyAeoPeerRegistration({
      ...registration,
      displayName: "Impersonated App",
    }, f.options)).rejects.toThrow(/does not match/i);
  });
});


describe("shared AEO cross-platform conformance vector", () => {
  it("verifies the same root-signed trust bundle, membership credential and registration envelope", async () => {
    const vector = JSON.parse(readFileSync(new URL("./fixtures/aeo-conformance-vectors-v1.json", import.meta.url), "utf8"));
    const bundle = await verifyAeoTrustBundle(vector.trustBundle, {
      pinnedRootKeys: vector.pinnedRootKeys,
      nowSeconds: vector.nowSeconds,
    });
    expect(bundle.version).toBe(vector.expected.trustBundleVersion);
    expect(bundle.trustedKeys[0]?.kid).toBe(vector.expected.issuerKeyId);
    const options = {
      trustedKeys: bundle.trustedKeys,
      isCredentialRevoked: bundle.isCredentialRevoked,
      nowSeconds: vector.nowSeconds,
    };
    const membership = await verifyAeoMembershipCredential(vector.membershipCredential, options);
    expect(membership.platformId).toBe(vector.expected.membershipPlatformId);
    expect(membership.platformName).toBe(vector.expected.membershipPlatformName);
    const registration = await verifyAeoPeerRegistration(vector.registration, options);
    expect(registration.platformId).toBe(vector.expected.membershipPlatformId);
  });
});
