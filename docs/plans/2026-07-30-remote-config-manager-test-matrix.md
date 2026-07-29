# RemoteConfigManager Test Matrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Protect P0-05's source fallback, integrity, monotonicity, stop, last-known-good, ignore-marker, and throttle contracts with durable Vitest coverage.

**Architecture:** Drive the public `RemoteConfigManager` with deterministic injected dependencies. Route exact URLs to encoded JSON bytes or errors, calculate fixture digests with Node's SHA-256 implementation, and inspect cloned in-memory state after each atomic manager operation.

**Tech Stack:** TypeScript 5.3, Vitest 3.2.4, Node crypto, runtime SitePack validators and merge logic.

---

### Task 1: Build the black-box harness

**Files:**

- Create: `src/core/remote-config-manager.test.ts`

**Step 1: Add reusable fixtures**

Create helpers for a valid built-in config descriptor, SitePack, site patch, registry entries, and registry indexes. Serialize all remote payloads through `TextEncoder` and calculate their real SHA-256 digests.

**Step 2: Add deterministic dependencies**

Implement an in-memory `RemoteConfigStorage` that clones reads and writes, plus a Vitest transport mock that maps exact source and artifact URLs to bytes or errors and records every request.

**Step 3: Run the focused test file**

Run: `pnpm test -- src/core/remote-config-manager.test.ts`

Expected: the harness compiles; behavior tests added in later tasks initially fail only when they expose a runtime defect.

### Task 2: Cover source, integrity, and last-known-good behavior

**Files:**

- Modify: `src/core/remote-config-manager.test.ts`

**Step 1: Cover source iteration**

Test primary-to-secondary fallback and total dual-source failure, including persisted error details and preservation of an existing active snapshot.

**Step 2: Cover integrity and revision gates**

Test SHA-256 mismatch and a lower `registryRevision`, asserting that neither case replaces the active snapshot.

**Step 3: Cover atomic candidate failure**

Serve an invalid pack whose digest matches the index. Assert the check fails after validation and the complete last-known-good snapshot remains active.

**Step 4: Run the focused test file**

Run: `pnpm test -- src/core/remote-config-manager.test.ts`

Expected: all source, integrity, monotonicity, and atomicity cases pass.

### Task 3: Cover stop, ignore, and throttle behavior

**Files:**

- Modify: `src/core/remote-config-manager.test.ts`

**Step 1: Cover registry stop flags**

Start with active pack and patch artifacts, then publish a higher revision with both entries disabled. Assert both artifacts are removed and no artifact URL is requested.

**Step 2: Cover local patch ignore markers**

Ignore an active patch, recheck the same registry revision without redownloading it, then publish a newer patch and assert it is downloaded and the old marker is cleared.

**Step 3: Cover scheduling throttle**

Seed a recent `lastCheckAt`, make a non-forced check, and assert the returned `nextCheckAt`, zero transport calls, and zero storage writes.

**Step 4: Run the full test suite**

Run: `pnpm test`

Expected: the complete suite passes.

### Task 4: Verify and deliver the isolated batch

**Files:**

- Review: `src/core/remote-config-manager.test.ts`
- Review: `docs/plans/2026-07-30-remote-config-manager-test-matrix-design.md`
- Review: `docs/plans/2026-07-30-remote-config-manager-test-matrix.md`
- Do not modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Run repository checks**

Run, in order:

1. `pnpm format:check`
2. `pnpm exec eslint src/core/remote-config-manager.test.ts`
3. `pnpm typecheck`
4. `pnpm registry:validate`
5. `pnpm build`
6. `pnpm build:userscript`
7. `git diff --check`

Expected: all commands pass. The two builds prove static cross-platform wiring only, not real integration acceptance.

**Step 2: Review the diff**

Confirm the tests use production validators and hashing behavior, do not duplicate manager logic, do not add fallback behavior, do not touch generated artifacts, and do not include the user's `.gitignore` change.

**Step 3: Commit and push**

Stage only the two plan documents and `src/core/remote-config-manager.test.ts`, commit with `test(core): cover remote config manager`, and push the current branch.
