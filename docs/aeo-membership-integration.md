# AEO membership adapter

This platform contains a local WebCrypto verifier for AEO Ed25519 membership credentials and the UCCS `uccs/1` registration envelope.

Membership establishes ecosystem membership only. It is not live device/session authentication, capability authorization, or user consent. The verifier does not route traffic through Central Hub, perform registry lookups, or write to this platform's database.

The caller supplies trusted issuer public keys and a revocation checker. Browser runtimes without WebCrypto Ed25519 support fail closed. No production credentials or private keys are included.

## Root-signed trust bundles

The `src/lib/aeo/trust-bundle.ts` verifier accepts a compact JWS signed by an Ed25519 root key that the caller pins out of band. It validates the trust-bundle profile, issuer/audience, root-key validity, signature, seven-day maximum lifetime, issuer-key records, and credential revocation IDs.

The caller must persist the highest accepted bundle version in its own secure storage and pass it as `minimumVersion` on later verification. The verifier deliberately does not create shared storage or perform network retrieval. Root rotation/recovery and live issuer/revocation distribution remain production prerequisites.

## Security boundaries

Membership, peer/device authentication, capability authorization, and user consent remain separate checks. A valid membership credential or trust bundle never grants a capability by itself. Central Hub is not a mandatory gateway, and this adapter does not change this platform's database, identity, or runtime.
