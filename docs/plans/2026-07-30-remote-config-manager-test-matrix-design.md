# RemoteConfigManager Test Matrix Design

## Context

P0-05 already has the cross-platform manager, registry transports, persistent state, alarm scheduling, userscript throttling, and settings integration. Its failure-safety contracts are not yet protected by persistent tests, so regressions in source fallback, monotonic revisions, artifact validation, or last-known-good preservation could silently disable adapters or activate untrusted data.

## Goals

- Exercise `RemoteConfigManager` only through its public API and injected dependencies.
- Prove primary-source failure falls back to the secondary source, while total source failure preserves the active snapshot.
- Reject SHA-256 mismatches and registry revision rollback without replacing last-known-good data.
- Prove `disabled` entries remove active packs and patches without downloading their artifacts.
- Prove a structurally invalid artifact with a valid digest cannot partially replace an active snapshot.
- Prove an ignored `(siteId, patchVersion)` is not downloaded again, while a newer patch is eligible and clears the marker.
- Lock the 24-hour-style throttle contract with deterministic timestamps and no network access.

## Selected Approach

Use a black-box Vitest harness with an in-memory `RemoteConfigStorage`, a URL-routed byte transport, deterministic `now`, and real SHA-256 fixture digests. Build valid pack and patch artifacts through the same public schema shapes used by production, then inspect the persisted state after each check.

This keeps the test boundary aligned with runtime behavior: index bytes are decoded and validated, artifact bytes are hashed, pack or patch contents pass both validation levels, and the manager performs the final atomic state write.

## Alternatives Considered

### Expose or spy on private manager methods

This would make individual branches easy to reach, but it would couple tests to implementation details and bypass byte decoding, hashing, source iteration, and atomic persistence. It is not selected.

### Run a local HTTP server and real browser/userscript clients

This is appropriate for the staging and two-platform acceptance exercise, but it is slower and environment-dependent. It remains part of P0-05/P0-11 integration evidence rather than this unit-test batch.

## Matrix

### Source and scheduling behavior

- Primary index request fails; secondary index and artifact requests succeed.
- Both sources fail; the result records both failures and preserves the active snapshot.
- A non-forced check inside the interval returns `throttled` without calling the transport or writing state.

### Integrity and monotonicity

- Artifact bytes do not match the index SHA-256 digest.
- A registry revision is lower than the active revision.
- A bad artifact has a valid digest but fails runtime validation; no candidate artifact becomes active.

### Stop and recovery paths

- A higher registry revision marks active pack and patch entries `disabled`; both are removed without artifact requests.
- Ignoring an active patch removes it immediately and stores the highest ignored version.
- Rechecking the same ignored patch fetches only the index.
- A newer patch downloads successfully and removes the obsolete ignore marker.

## Non-goals

- Retest every registry-index or SitePack schema rule already covered by P0-02.
- Test configuration merge semantics already covered by P0-04.
- Claim real Chrome extension and userscript integration from Node-based unit tests or successful builds.

## Completion

This automated batch is complete when the focused matrix and repository checks pass, including both extension and userscript builds. P0-05 remains `进行中` until real two-platform integration evidence exists.
