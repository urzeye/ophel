# PackManager Lifecycle Test Matrix Design

## Context

P1-07 implements the installed SitePack source of truth, local and registry installation, monotonic updates, enable/disable, uninstall, effective activation, registry reconciliation, and per-record error isolation. The implementation was exercised by a temporary smoke script, but the task remains open because its idempotence and failure-isolation acceptance rules are not protected by the permanent test suite.

## Goals

- Lock local install, identical reinstall, update, disable/enable, and uninstall idempotence.
- Reject invalid manifests, incompatible app versions, built-in conflicts, installed-pack conflicts, source replacement, version rollback, and version reuse without mutating valid installed data.
- Prove malformed stored records are reported and skipped while unrelated valid packs remain readable and mutable.
- Lock unsupported installed-storage schema failure as an explicit error.
- Install registry packs only from a valid active remote cache.
- Reconcile registry updates, kill switches, missing artifacts, and later recovery while preserving user enable preference and local packages.
- Prove one invalid registry artifact does not block another installed registry pack from updating.
- Assert public snapshots and mutation results do not expose mutable persisted manifest references.

## Selected Approach

Drive the public `PackManager` API with an in-memory implementation of `RemoteConfigStorage`, deterministic Unix-millisecond timestamps, and explicit installed/remote state fixtures. Build minimal valid SitePack manifests and registry index entries through shared helpers, then inspect both returned snapshots and persisted keys after each operation.

This exercises the real storage parser, runtime validator, built-in and installed conflict policy, mutation queue, registry cache parser, and reconciliation loop without exposing private methods or duplicating their decisions in the test harness.

## Alternatives Considered

### Restore the temporary smoke script

The original smoke covered many branches, but it was intentionally deleted and does not run in CI. Recreating it would not provide durable regression protection.

### Unit-test private parser and upsert helpers directly

This would reduce fixture setup but bypass storage boundaries, mutation ordering, clone guarantees, and issue aggregation. It is not selected.

## Matrix

### Local lifecycle

- New install, identical reinstall, higher-version update, enabled-state preservation, disable/enable no-op behavior, and repeated uninstall.
- Concurrent identical installs serialize to one write and one no-op.
- Returned records and manifests are defensive copies.

### Validation and conflict gates

- Invalid schema and minimum-app-version rejection.
- Built-in ID and built-in-domain conflicts.
- Overlap with another installed pack even when paths differ.
- Local/registry source conflict.
- Version rollback and same-version content reuse.
- Every rejection leaves unrelated installed state unchanged.

### Stored-state isolation

- A malformed record becomes a structured issue while valid records still load.
- Installing another valid pack preserves the malformed raw record.
- Unsupported root schema fails explicitly.

### Registry lifecycle

- Valid cached install and identical reinstall.
- Higher-version automatic update.
- `disabled` and missing-artifact status transitions without erasing the user preference or installed last-known-good manifest.
- Later valid version recovery restores effective activation.
- Local packages remain untouched by registry synchronization.
- Invalid, rollback, or reused registry artifacts preserve the affected last-known-good record while other registry packs continue updating.

## Non-goals

- Test origin binding, dynamic script registration, backup cleanup, or management UI behavior owned by P1-16, P1-17, P2-01, P2-02, and P1-10.
- Retest every SitePack schema rule covered by P0-02.
- Exercise real CDN transport or browser storage implementations.

## Completion

P1-07 can be marked complete when the lifecycle matrix passes, invalid records and registry artifacts are isolated as specified, and extension/userscript builds remain green.
