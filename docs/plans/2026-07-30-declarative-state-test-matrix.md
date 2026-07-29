# Declarative State Detection Test Matrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Protect P1-05's generation, session, share-page, and new-tab state contracts with durable Vitest coverage.

**Architecture:** Instantiate the public adapter from small valid manifests, route element lookup through a spy, and stub only the `window` and element surfaces used by the real state methods. Mock the eager DOMToolkit singleton so the Node test environment stays dependency-free.

**Tech Stack:** TypeScript 5.3, Vitest 3.2.4, `DeclarativeAdapter`, browser URL and computed-style semantics.

---

### Task 1: Cover generation visibility

**Files:**

- Create: `src/adapters/declarative/adapter-state.test.ts`

1. Add minimal manifest, window, and fake-element helpers.
2. Test missing configuration and no selector matches.
3. Test a visible match on a later configured selector.
4. Add table-driven rejection cases for hidden, transparent, disconnected, zero-size, and Ophel-contained candidates.
5. Run `pnpm test -- src/adapters/declarative/adapter-state.test.ts`.

### Task 2: Cover session and navigation state

**Files:**

- Modify: `src/adapters/declarative/adapter-state.test.ts`

1. Test base and configured session ID extraction, including mismatch and empty capture.
2. Test omitted, empty, matching, and non-matching new-conversation patterns.
3. Test default and configured share prefixes.
4. Test default origin, configured same-origin URL resolution, and cross-origin rejection.
5. Run `pnpm test`.

### Task 3: Update tracking, verify, and deliver

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`
- Review: `src/adapters/declarative/adapter-state.test.ts`
- Review: `docs/plans/2026-07-30-declarative-state-test-matrix-design.md`
- Review: `docs/plans/2026-07-30-declarative-state-test-matrix.md`

1. Mark P1-05 `已完成` only after the matrix passes.
2. Run `pnpm format:check`, focused ESLint, `pnpm typecheck`, `pnpm registry:validate`, `pnpm build`, `pnpm build:userscript`, and `git diff --check`.
3. Review for duplicated visibility logic, fallback state guesses, new DOM dependencies, generated files, and accidental `.gitignore` staging.
4. Commit with `test(adapter): cover declarative state detection` and push the current branch.
