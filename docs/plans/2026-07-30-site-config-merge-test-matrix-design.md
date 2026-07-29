# Site Config Merge Test Matrix Design

## Context

P0-04 implements the configuration chain used by built-in selector hotfixes: built-in defaults, then a compatible remote patch, then a local user override. The implementation already exposes explicit layer outcomes, but its merge and compatibility contracts are not yet locked by persistent tests.

## Goals

- Prove nested objects merge recursively, arrays replace atomically, and `null` deletes keys.
- Prove input configs are cloned rather than mutated or shared.
- Lock the remote-patch then user-override precedence.
- Cover target, base-config, minimum-app, and maximum-app compatibility gates.
- Distinguish layer validation rejection from merged-result rejection.
- Protect built-in capabilities and required private selectors after merging.
- Verify the explicit `applyMergedConfig` receiver contract.

## Fixtures

Use the registry's comprehensive SitePack example with manifest-only fields removed as a complete built-in config. This keeps the base fixture aligned with the schema and exercises every required capability without creating a second hand-maintained full config.

## Outcomes

Every layer assertion checks the returned `status`, `reason` or `stage`, and the final config. Rejected or skipped layers must leave the last valid config unchanged. Applied layers must preserve unrelated fields and report the remote patch version.

## Non-goals

- Retest individual validator rules covered by P0-02.
- Test remote fetching, caching, registry revisions, or last-known-good state; those belong to P0-05.
- Test adapter-specific selector mappings or browser startup ordering.

## Completion

P0-04 can be marked complete when the acceptance matrix passes without runtime changes, or after any exposed merge defect is fixed and covered by a regression test.
