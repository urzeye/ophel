# Declarative Outline Test Matrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Protect P1-03's scoped, ordered, hierarchical outline extraction contracts with durable Vitest coverage.

**Architecture:** Feed production `extractOutline()` structural fake Elements. Override only response-container lookup and `calculateRangeWordCount()` in a test subclass, so boundary selection and inline-bookmark behavior stay real.

**Tech Stack:** TypeScript 5.3, Vitest 3.2.4, `DeclarativeAdapter`, `SiteAdapter` outline APIs.

---

### Task 1: Build the fake DOM harness

**Files:**

- Create: `src/adapters/declarative/adapter-outline.test.ts`

1. Add a minimal manifest and mocked DOMToolkit module.
2. Build fake containers/elements with query filtering, parent chains, class lists, selector matching, and deterministic document order.
3. Add a test adapter that records response lookups and word-count boundaries.

### Task 2: Cover candidate construction and output

**Files:**

- Modify: `src/adapters/declarative/adapter-outline.test.ts`

1. Test missing selector/container behavior.
2. Test unsorted results, max-level filtering/clamping, empty headings, and `gh-` self/ancestor exclusion.
3. Test user-query inclusion on/off and empty-query omission.
4. Run `pnpm test -- src/adapters/declarative/adapter-outline.test.ts`.

### Task 3: Cover boundaries and bookmarks

**Files:**

- Modify: `src/adapters/declarative/adapter-outline.test.ts`

1. Record word-count calls for user-query, nested, peer, next-turn, and terminal boundaries.
2. Prove hidden user-query items still delimit heading counts.
3. Test inherited inline bookmarks filtering disconnected items.
4. Run `pnpm test`.

### Task 4: Update tracking, verify, and deliver

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

1. Mark P1-03 `已完成` only after the matrix passes.
2. Run format, focused ESLint, typecheck, registry validation, extension build, userscript build, and `git diff --check`.
3. Review for DOM-scope broadening, duplicated outline logic, new dependencies, generated files, and `.gitignore` staging.
4. Commit with `test(adapter): cover declarative outline extraction` and push.
