# Portable platform integration

Mayobuild Studio / Central Hub provides an optional registry and diagnostics service. It is not a runtime dependency of OEA, EMA, AEM Store, or Phormi. Each platform must continue its own core functions when Central Hub or its UI is unavailable.

## Setup

1. Run `db/platform-registry.sql` in the **Central Hub Supabase project only**.
2. Create an active `owner` API key in the Central Hub AEM AI Hub key manager. Never embed this owner key in a distributed APK or browser bundle.
3. Register a platform with `POST /api/platform-registry`, using the owner key and JSON like:

```json
{
  "action": "register",
  "platformId": "com.uong.ema",
  "name": "EMA",
  "platformType": "android",
  "packageName": "com.uong.ema",
  "version": "1.0.0",
  "apiVersion": "1",
  "capabilities": ["assistant.commands", "ai.request"]
}
```

4. To issue or rotate a platform token, repeat registration with `"issueKey": true`. The response shows the token once. Rotation revokes prior active tokens for that platform.
5. Send diagnostic events to `POST /api/platform-diagnostics` with that platform token:

```json
{
  "eventType": "runtime.error",
  "severity": "error",
  "summary": "A task failed",
  "appVersion": "1.0.0",
  "deviceId": "random-install-id",
  "details": { "code": "EXAMPLE_CODE" }
}
```

6. Read the registry with `GET /api/platform-registry` and recent diagnostic events with `GET /api/platform-diagnostics?limit=50`, both using an active owner key. Add `&platformId=com.uong.ema` to filter diagnostics.

## Security and independence

- Owner keys may register platforms and read the shared records. They must remain server-side/admin-only.
- Platform tokens are scoped to one registered platform and only their hashes are stored. The current token flow is intended for trusted server-side agents and controlled testing.
- **Do not embed a long-lived platform token in a publicly distributed APK or browser bundle.** APK contents can be inspected. Before enabling production diagnostic submission from public mobile clients, add a per-install enrollment/short-lived credential flow or route submissions through a trusted backend. This API does not yet implement that enrollment flow.
- Never send passwords, API keys, access tokens, message contents, or other secrets in diagnostic details.
- Device IDs should be random installation identifiers, not phone numbers or account IDs.
- These endpoints are optional reporting/coordination services. A platform must not block its launcher, browsing, store, or assistant features on successful registry access.
- AI remains optional. The registry and diagnostic endpoints do not call AI.
- Platform-specific databases remain separate. These records are only shared metadata and diagnostic events.
