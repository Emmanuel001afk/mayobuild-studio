import { describe, expect, it } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyAeoTrustBundle, AeoTrustBundleError } from "./trust-bundle";

const b64url = (value: Uint8Array | string) =>
  Buffer.from(value).toString("base64url");
const now = 1_800_000_000;

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawRoot = new Uint8Array(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
  const issuerKey = new Uint8Array(32).fill(7);
  const payload = {
    iss: "AEO", aud: "urn:aeo:trust-bundle", bundle_type: "aeo-trust-bundle",
    bundle_version: 1, version: 4, iat: now - 10, nbf: now - 10, exp: now + 3600,
    keys: [{ kid: "issuer-1", issuer: "urn:aeo:issuer:test", algorithm: "Ed25519", publicKey: b64url(issuerKey) }],
    revokedCredentialIds: [],
  };
  const header = { alg: "EdDSA", typ: "AEO-TRUST-BUNDLE+jwt", kid: "root-1" };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const signingInput = `${h}.${p}`;
  const signature = sign(null, Buffer.from(signingInput), privateKey);
  return {
    compact: `${signingInput}.${signature.toString("base64url")}`,
    options: { pinnedRootKeys: [{ kid: "root-1", issuer: "AEO" as const, algorithm: "Ed25519" as const, publicKey: rawRoot }], nowSeconds: now },
  };
}

describe("AEO trust-bundle verifier", () => {
  it("accepts a valid root-signed bundle and returns issuer keys and revocation lookup", async () => {
    const { compact, options } = fixture();
    const result = await verifyAeoTrustBundle(compact, options);
    expect(result.version).toBe(4);
    expect(result.trustedKeys).toHaveLength(1);
    expect(result.isCredentialRevoked({ issuer: "x", platformId: "a.b", jti: "00000000-0000-4000-8000-000000000000" })).toBe(false);
  });
  it("rejects a tampered signature", async () => {
    const { compact, options } = fixture();
    const [h, p, sig] = compact.split(".");
    const changed = `${h}.${p}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`;
    await expect(verifyAeoTrustBundle(changed, options)).rejects.toBeInstanceOf(AeoTrustBundleError);
  });
  it("rejects rollback below the caller's persisted version", async () => {
    const { compact, options } = fixture();
    await expect(verifyAeoTrustBundle(compact, { ...options, minimumVersion: 5 }))
      .rejects.toMatchObject({ code: "trust_bundle_time_or_version_invalid" });
  });
  it("rejects an unknown pinned root", async () => {
    const { compact, options } = fixture();
    await expect(verifyAeoTrustBundle(compact, { ...options, pinnedRootKeys: [] }))
      .rejects.toMatchObject({ code: "invalid_trust_config" });
  });
});
