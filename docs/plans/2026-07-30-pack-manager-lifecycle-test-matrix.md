# PackManager Lifecycle Test Matrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Convert P1-07's idempotent lifecycle and abnormal-package isolation requirements into durable Vitest coverage.

**Architecture:** Use deterministic in-memory storage for both `sitepacks/installed` and `sitepacks/remote-state`. Exercise only public `PackManager` operations, generate valid remote snapshots with shared fixture helpers, and assert mutation results, structured issues, effective enabled packs, and persisted last-known-good records.

**Tech Stack:** TypeScript 5.3, Vitest 3.2.4, runtime SitePack validator, PackManager, RemoteConfig state schema.

---

### Task 1: Build fixtures and cover local lifecycle

**Files:**

- Create: `src/core/pack-manager.test.ts`

**Step 1: Add deterministic storage and manifest helpers**

Create cloning in-memory storage with write tracking, a controllable clock, minimal valid manifests, installed-state readers, registry index entries, and active remote-state builders.

**Step 2: Test install and update idempotence**

Cover new install, identical reinstall, concurrent identical installs, higher-version update, timestamp rules, and preservation of the user's enabled state.

**Step 3: Test enable and uninstall idempotence**

Cover repeated disable/enable, effective enabled filtering, repeated uninstall, and retention of the separately owned remote cache.

**Step 4: Test defensive copies**

Mutate returned mutation records and snapshots, then prove persisted manifests are unchanged.

### Task 2: Cover validation, conflict, and stored-record isolation

**Files:**

- Modify: `src/core/pack-manager.test.ts`

**Step 1: Cover manifest and version gates**

Test invalid manifests, minimum app versions, rollback, and same-version changed content. Assert the installed key is unchanged after every rejection.

**Step 2: Cover activation conflicts**

Test built-in ID, built-in match, installed match, and local/registry source conflicts.

**Step 3: Cover stored-state isolation**

Inject one malformed raw record beside a valid record. Assert the valid pack loads, the issue is structured, unrelated installation remains possible, and the malformed raw record is preserved. Test unsupported root schema separately.

**Step 4: Run focused tests**

Run: `pnpm test -- src/core/pack-manager.test.ts`

Expected: all local and storage-boundary cases pass.

### Task 3: Cover registry install and reconciliation

**Files:**

- Modify: `src/core/pack-manager.test.ts`

**Step 1: Cover registry installation gates**

Install a valid cached pack, assert identical reinstall is a no-op, and reject disabled, missing, malformed, or incompatible cache entries without changing installed state.

**Step 2: Cover status transitions and recovery**

Update an installed registry pack, then apply a kill switch, remove it from the active catalog, and publish a later valid version. Assert last-known-good preservation, status changes, effective activation, and user preference preservation at each step.

**Step 3: Cover per-pack failure isolation**

Synchronize two registry packs where one validly updates and the other has invalid, rollback, or reused content. Assert the valid update commits, the bad pack remains last-known-good, and structured issues identify only the bad pack. Keep a local pack unchanged throughout.

**Step 4: Run the full test suite**

Run: `pnpm test`

Expected: the complete suite passes.

### Task 4: Update tracking, verify, and deliver

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`
- Review: `src/core/pack-manager.test.ts`
- Review: `docs/plans/2026-07-30-pack-manager-lifecycle-test-matrix-design.md`
- Review: `docs/plans/2026-07-30-pack-manager-lifecycle-test-matrix.md`

**Step 1: Update task status**

Mark P1-07 `已完成` only after all lifecycle and isolation cases pass.

**Step 2: Run repository checks**

Run:

1. `pnpm format:check`
2. `pnpm exec eslint src/core/pack-manager.test.ts`
3. `pnpm typecheck`
4. `pnpm registry:validate`
5. `pnpm build`
6. `pnpm build:userscript`
7. `git diff --check`

Expected: all checks pass.

**Step 3: Review and commit**

Confirm the tests use public APIs and production validators, installed and remote state remain separate, local packs never auto-update, failures remain explicit, generated files are absent, and `.gitignore` remains unstaged. Commit with `test(core): cover site pack lifecycle` and push the current branch.
