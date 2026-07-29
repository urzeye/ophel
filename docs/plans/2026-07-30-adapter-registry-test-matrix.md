# Adapter Registry Test Matrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Protect P1-06's singleton startup gate, dynamic adapter loading, activation priority, and failure isolation with durable Vitest coverage.

**Architecture:** Import the real `src/adapters/index.ts` after mocking its site adapters and external runtime boundaries. Reset modules between tests to recreate registry state, and use source contract assertions for the Plasmo and userscript bootstraps.

**Tech Stack:** TypeScript 5.3, Vitest 3.2.4, React 18 source contracts, `AdapterRegistry`, `PackManager`, `DeclarativeAdapter`.

---

### Task 1: Build the isolated registry harness

**Files:**

- Create: `src/adapters/index.test.ts`

1. Define structural SitePack fixtures and hoisted mutable runtime state.
2. Mock all built-in adapter modules with deterministic `match()`/`getSiteId()` implementations.
3. Mock platform storage, PackManager runtime, built-in patch application, dynamic platform priming, detect runtime, and detection state.
4. Reset module cache, globals, mocks, and state before every test.

### Task 2: Cover initialization and static loading

**Files:**

- Modify: `src/adapters/index.test.ts`

1. Prove `registryReady()` and `initAdapterRegistry()` share one promise and run patch loading before PackManager reads.
2. Prove repeated calls do not reload or duplicate adapters.
3. Cover built-in-first selection, effective-enabled filtering, installation order, issue logging, and platform priming.
4. Cover per-package constructor failure and root storage failure isolation.

### Task 3: Cover origin activation and bootstrap gates

**Files:**

- Modify: `src/adapters/index.test.ts`

1. Cover valid explicit binding and missing explicit binding without dynamic fallback.
2. Cover detect candidate ordering, selected detected adapter priority, and static fallback placement.
3. Assert `ui-entry.tsx` renders `<App />` only after `registryReady()`, and extension/userscript entries await registry initialization.
4. Run `pnpm test -- src/adapters/index.test.ts`.

### Task 4: Update tracking, verify, and deliver

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

1. Mark P1-06 `已完成` only after the full matrix passes.
2. Run full tests, format, focused ESLint, typecheck, registry validation, extension build, userscript build, and `git diff --check`.
3. Review for production-only test hooks, duplicated registry state, changed `getAdapter()` consumers, UI/theme/Shadow DOM changes, generated files, and `.gitignore` staging.
4. Commit with `test(adapter): cover dynamic registry lifecycle` and push.
