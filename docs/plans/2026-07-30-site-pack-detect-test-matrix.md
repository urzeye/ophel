# SitePack Detect Test Matrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Replace P2-04's deleted temporary smoke with durable tests for declarative detection, bounded retries, precedence, candidate switching, and panel wiring.

**Architecture:** Exercise pure detect APIs with a typed fake document and deterministic observer/timer controls. Exercise detection state and switching through mocked PackManager/platform boundaries, reuse the existing adapter-registry precedence suite, and server-render the real notice for conditional UI coverage.

**Tech Stack:** TypeScript 5.3, Vitest 3.2.4, React 18 server rendering, existing SitePack types, and platform/PackManager interfaces.

---

### Task 1: Cover rule and package semantics

**Files:**

- Create: `src/adapters/declarative/detect.test.ts`

**Steps:**

1. Implement a minimal fake document with selector matches, invalid selectors, generator meta elements, and a document root.
2. Test selector and generator hit/miss, rule AND/list OR, invalid-selector isolation, empty matches, URL gating, and no-detect eligibility.
3. Test pack scanning preserves matching packages and structured issues.

### Task 2: Cover bounded mutation scanning

**Files:**

- Extend: `src/adapters/declarative/detect.test.ts`

**Steps:**

1. Use fake timers and an injected observer factory for delayed mutation hits.
2. Test immediate settle behavior, timeout, observer-unavailable, attempt-limit, cleanup, and issue deduplication.
3. Run `pnpm test -- src/adapters/declarative/detect.test.ts`.

### Task 3: Cover detection state and selection rollback

**Files:**

- Create: `src/adapters/site-pack-detection.test.ts`

**Steps:**

1. Mock `createRuntimePackManager`, platform storage/site-pack operations, language, and localized names.
2. Test sorted immutable state and active-candidate selection.
3. Test unknown candidate, stale binding, permission denial, success, reconciliation rollback, and rollback failure.
4. Run the focused state test.

### Task 4: Cover notice and App wiring

**Files:**

- Create: `src/components/site-pack-detection-notice.test.ts`
- Reuse: `src/adapters/index.test.ts`

**Steps:**

1. Server-render the real notice with zero, one, and multiple candidates.
2. Assert active candidate copy, selector/button states, theme-prefixed classes, and existing CSS injection/state rules.
3. Assert `App` awaits `selectDetectedSitePack(packId)` before `window.location.reload()`.
4. Run the detect, state, notice, and existing registry-index tests together.

### Task 5: Verify, update the ledger, and deliver

**Files:**

- Modify after tests pass: `docs/developer/site-adapter-pluginization-tasks.csv`

**Steps:**

1. Run:
   - `pnpm test -- src/adapters/declarative/detect.test.ts src/adapters/site-pack-detection.test.ts src/components/site-pack-detection-notice.test.ts src/adapters/index.test.ts`
   - `pnpm test`
   - `pnpm format:check`
   - focused ESLint for the three new tests
   - `node scripts/compare_locales.js`
   - `pnpm typecheck`
   - `pnpm build`
   - `pnpm build:userscript`
   - `git diff --check`
2. Mark P2-04 `已完成` only if all rule, retry, precedence, switching, and UI paths pass.
3. Review for duplicated detect logic, leaked persistent state, weakened explicit-binding behavior, runtime/style changes, generated files, unrelated diffs, and `.gitignore` staging.
4. Commit with `test(adapter): cover SitePack detection` and push the current branch.
