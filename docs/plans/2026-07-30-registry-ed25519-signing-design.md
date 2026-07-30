# Registry Ed25519 Signing Design

## Status

Accepted for P4-03 implementation.

## Context

The registry currently downloads `index.json` over HTTPS from jsDelivr with a raw GitHub fallback, then checks each immutable pack or patch against the SHA-256 digest recorded in that index. This detects a corrupted or independently modified artifact, but it does not authenticate the index itself. An attacker who can modify the `registry-dist` branch or a CDN response can replace both the index and its artifact digests, and the two configured sources are availability fallbacks rather than independent trust roots.

P4-03 therefore has material incremental value: authenticate one small root document and keep the existing SHA-256 artifact checks beneath it. The solution must work in both extension and userscript bundles, preserve last-known-good state on failure, avoid custom cryptographic implementations, and support deliberate key rotation without accepting unsigned data.

## Decision

Publish a detached `index.sig.json` beside `index.json`. CI signs the exact serialized bytes written to `index.json` with Ed25519. The signature envelope contains only a schema version, fixed algorithm, key ID, and 64-byte signature encoded as lowercase hexadecimal.

The client performs the trust chain in this order:

1. Fetch the raw `index.json` bytes from one configured source.
2. Fetch `index.sig.json` from the same source and validate its strict envelope schema.
3. Select a public key only from the built-in trusted keyring and verify the signature over the unchanged index bytes.
4. Parse and validate the authenticated index, including the signing key's allowed registry-revision range.
5. Fetch changed immutable artifacts and compare their SHA-256 digests with the authenticated index before schema and merge validation.
6. Atomically replace active state only after the complete candidate succeeds.

Signing exact bytes avoids maintaining separate canonical-JSON implementations in Node and browser code. The existing deterministic `JSON.stringify(value, null, 2) + "\\n"` serializer remains the sole publisher representation, while verification is independent of whitespace or property-order assumptions because it uses the downloaded bytes directly.

## Key Management

- CI reads a base64-encoded PKCS#8 Ed25519 private key from the `REGISTRY_SIGNING_PRIVATE_KEY` repository Actions secret. The private key is never written to the repository, workflow logs, build output, or client bundle.
- `REGISTRY_SIGNING_KEY_ID` identifies the expected built-in public key. The build fails if the private key does not derive to that public key, preventing a successful but unverifiable publication.
- The client keyring stores raw 32-byte public keys plus optional minimum and maximum `registryRevision` bounds.
- Rotation is staged: first release a client that trusts both old and new keys with explicit revision bounds, then switch the CI secret and key ID, and only remove the old key after the supported client population has crossed the cutoff.
- A compromised or retired key must receive a finite maximum revision in a client release; keeping an unbounded retired key would allow it to sign future registry revisions.
- `pnpm registry:build` uses an in-memory ephemeral key so contributors can exercise the complete local output shape without production credentials. Only `pnpm registry:build:signed` accepts the production secret and validates it against the pinned public key.

## Failure Semantics

There is no unsigned compatibility fallback in new clients.

- A missing signature, malformed envelope, unknown key ID, invalid signature, or out-of-range key makes that source fail.
- The manager then tries the next configured source through the same complete verification path.
- If every source fails, the manager records the failures and continues using the existing last-known-good snapshot. A first installation simply has no remote packs or patches until a valid signed registry is available; built-in adapters continue to work.
- Existing clients that predate P4-03 continue to understand the registry because `index.json` itself is unchanged. This rollout limitation cannot be repaired by registry signing; users gain the stronger trust model after updating the application.

## Security Boundaries

The signature covers `generatedAt`, `schemaVersion`, `registryRevision`, every pack and patch metadata field, disabled flags, immutable paths, and all artifact SHA-256 digests because all of them are inside the signed index bytes.

It protects against CDN response replacement and `registry-dist` branch modification without the signing key. It does not protect against compromise of both the Actions signing secret and the publishing workflow, a malicious source change approved on `main`, or a malicious application release that replaces the built-in public key. Existing schema validation, capability limits, origin binding, and last-known-good behavior remain required defense-in-depth layers.

## Alternatives Considered

### Embed the signature inside `index.json`

This requires defining and maintaining a canonical representation that excludes the signature field on both publisher and client. It adds migration and implementation risk without improving the trust boundary, so it is not selected.

### Sign every artifact independently

Per-artifact signatures multiply files and verification work while duplicating the authenticated SHA-256 mapping already present in the index. Signing the root index provides the same chain for the current immutable artifact model with less operational complexity.

### Cross-check jsDelivr and raw GitHub responses

Agreement improves detection only when the sources fail independently, adds latency and availability coupling, and still does not establish publisher identity. The sources remain sequential availability fallbacks rather than security authorities.

### Keep unsigned indexes during a migration window

An automatic fallback would let an attacker remove the signature and force the weaker path. New clients therefore require signatures immediately and rely on last-known-good state for availability.

## Verification Matrix

- Publisher emits a signature that verifies against the exact emitted index bytes.
- Publisher rejects a missing key, unknown key ID, non-Ed25519 key, and a private key that does not match the pinned public key.
- Client accepts a valid signed index and continues through artifact SHA-256 validation.
- Client rejects tampered index bytes, malformed or missing signature files, unknown key IDs, invalid signatures, and revision-range violations.
- A bad primary signature falls back to a valid secondary source.
- Total signature failure preserves the active snapshot and records both source failures.
- Extension and userscript production builds include the same verifier and keyring.

## References

- `docs/developer/site-adapter-pluginization-plan.md` sections 7 and 8
- `docs/developer/site-adapter-pluginization-tasks.csv` P4-03
- RFC 8032: Edwards-Curve Digital Signature Algorithm (EdDSA)
