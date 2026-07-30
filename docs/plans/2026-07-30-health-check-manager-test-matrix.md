# HealthCheckManager Test Matrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Turn P2-08's temporary health-check smoke into durable Vitest coverage and close the task only after every acceptance path passes.

**Architecture:** Drive the public `HealthCheckManager` with cloned in-memory platform storage and deterministic injected callbacks. Use distinct manager instances for page-load history, real storage watchers for configuration recovery, the exported recovery helper for slow DOM behavior, and React server rendering for notice action visibility.

**Tech Stack:** TypeScript 5.3, Vitest 3.2.4, React 18 server rendering, public HealthCheckManager APIs, and existing platform storage types.

---

### Task 1: Build the health-manager harness

**Files:**

- Create: `src/core/health-check-manager.test.ts`

**Steps:**

1. Implement cloned in-memory `PlatformStorage` with `get`, `set`, `remove`, and `watch` behavior.
2. Add deterministic built-in and SitePack contexts, failed/healthy evaluations, update results, and minimal adapter doubles.
3. Run `pnpm test -- src/core/health-check-manager.test.ts` and require the harness to compile.

### Task 2: Cover threshold, reset, exemption, and slow recovery

**Files:**

- Extend: `src/core/health-check-manager.test.ts`

**Steps:**

1. Test first/second load threshold and same-load deduplication.
2. Test healthy reset followed by a new count of one.
3. Test new-conversation exemption preserving prior evidence.
4. Test the real bounded recovery helper with deterministic timers.
5. Run the focused test file.

### Task 3: Cover update recovery, reasons, and report privacy

**Files:**

- Extend: `src/core/health-check-manager.test.ts`

**Steps:**

1. Test registry, local, and general warning-reason classification.
2. Test manual update recovery and watched storage recovery.
3. Test issue URL preconditions, included diagnostic fields, and excluded route/content fields.
4. Run the focused test file.

### Task 4: Cover panel action visibility

**Files:**

- Create: `src/components/site-adapter-health-notice.test.ts`

**Steps:**

1. Mock localization and toast output, then render the real notice with React server rendering.
2. Assert updateable warnings show both update and report actions.
3. Assert local-pack warnings hide the update action and retain the report action.
4. Assert non-warning snapshots render nothing.

### Task 5: Verify, update the ledger, and deliver

**Files:**

- Modify after tests pass: `docs/developer/site-adapter-pluginization-tasks.csv`
- Review: existing `src/style.css` and `src/contents/ui-entry.tsx` injection path without changing them.

**Steps:**

1. Run:
   - `pnpm test -- src/core/health-check-manager.test.ts src/components/site-adapter-health-notice.test.ts`
   - `pnpm test`
   - `pnpm format:check`
   - `pnpm exec eslint src/core/health-check-manager.test.ts src/components/site-adapter-health-notice.test.ts`
   - `node scripts/compare_locales.js`
   - `pnpm typecheck`
   - `pnpm build`
   - `pnpm build:userscript`
   - `git diff --check`
2. Mark P2-08 `已完成` only if every acceptance path and repository check passes.
3. Review for duplicated manager logic, fake success paths, UI/style changes, generated files, unrelated diffs, and `.gitignore` staging.
4. Commit with `test(core): cover adapter health checks` and push the current branch.
