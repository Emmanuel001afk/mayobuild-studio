# AEO membership adapter

This platform now contains a local WebCrypto verifier for AEO Ed25519 membership credentials and the UCCS `uccs/1` registration envelope.

Membership establishes ecosystem membership only. It is not live device/session authentication, capability authorization, or user consent. The verifier does not route traffic through Central Hub, perform registry lookups, or write to this platform's database.

The caller supplies trusted issuer public keys and a revocation checker. Browser runtimes without WebCrypto Ed25519 support fail closed. This adapter does not yet implement root-signed trust-bundle verification, persistent anti-rollback state, root rotation/recovery, or live issuer/revocation distribution. No production credentials or private keys are included.


## Root-signed trust bundles

This adapter verifies AEO trust bundles signed by pinned Ed25519 root keys, validates issuer keys and credential revocation IDs, and enforces expiry and a caller-supplied minimum version. The caller must persist the highest accepted version and pass it as `minimumVersion`; the verifier does not persist state. Root rotation/recovery and live issuer/revocation distribution remain production prerequisites.
