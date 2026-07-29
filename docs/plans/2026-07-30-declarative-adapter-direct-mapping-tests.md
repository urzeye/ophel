# DeclarativeAdapter Direct Mapping Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Convert P1-01's direct `SitePackManifest` mapping acceptance criterion into durable Vitest coverage.

**Architecture:** Instantiate the public adapter with cloned valid fixtures, call its public mapping methods, and assert values plus defensive-copy boundaries. Use Vitest global stubs for the small location and document surfaces needed by `match()` and `getConversationTitle()`.

**Tech Stack:** TypeScript 5.3, Vitest 3.2.4, existing SitePack registry example, `SiteAdapter` and `DeclarativeAdapter` runtime code.

---

### Task 1: Cover identity, selectors, and direct configs

**Files:**

- Create: `src/adapters/declarative/adapter.test.ts`

**Step 1: Build full and minimal fixtures**

Clone the comprehensive registry example for explicit mappings and create a minimal manifest for default-value assertions.

**Step 2: Test identity and selector mappings**

Assert the pack-prefixed site ID, localization, theme, capabilities, textarea/submit/new-chat/stop/response/chat-content/user-query selectors, and scroll/sidebar lookup arguments.

**Step 3: Test config mappings**

Assert export, network, model switcher, width, Zen, clean, submit-key, Quick Quote, Mermaid, and host-theme-sync values.

**Step 4: Run the focused file**

Run: `pnpm test -- src/adapters/declarative/adapter.test.ts`

Expected: mapping assertions pass unless they expose a concrete adapter defect.

### Task 2: Cover defaults and defensive copies

**Files:**

- Modify: `src/adapters/declarative/adapter.test.ts`

**Step 1: Test documented defaults**

Assert absent optional fields produce the neutral theme, empty selector arrays, null configs, `Enter`, `disabled`, `native`, and disabled host-theme sync.

**Step 2: Test constructor isolation**

Mutate the source manifest after adapter construction and prove adapter results remain unchanged.

**Step 3: Test returned-value isolation**

Mutate returned selector arrays, capability sets, theme values, network metadata, model arrays, width entries, and Zen/Clean nested values. Re-read every value and prove the stored manifest remains unchanged.

### Task 3: Cover match and title behavior

**Files:**

- Modify: `src/adapters/declarative/adapter.test.ts`

**Step 1: Test static URL matching**

Use table-driven location stubs for exact hosts, wildcard apex/subdomains, optional ports, explicit ports, HTTPS rejection, and path matching. Confirm `detect` does not bypass a failed static match.

**Step 2: Test title extraction**

Use minimal document and element fakes to cover `activeMatch` plus `titleSelector`, normalized text, and document-title fallback with the site-name suffix removed.

**Step 3: Run the full test suite**

Run: `pnpm test`

Expected: all tests pass.

### Task 4: Update tracking, verify, and deliver

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`
- Review: `src/adapters/declarative/adapter.test.ts`
- Review: `docs/plans/2026-07-30-declarative-adapter-direct-mapping-tests-design.md`
- Review: `docs/plans/2026-07-30-declarative-adapter-direct-mapping-tests.md`

**Step 1: Update task status**

Mark P1-01 `已完成` only after the direct mapping matrix passes.

**Step 2: Run repository checks**

Run:

1. `pnpm format:check`
2. `pnpm exec eslint src/adapters/declarative/adapter.test.ts`
3. `pnpm typecheck`
4. `pnpm registry:validate`
5. `pnpm build`
6. `pnpm build:userscript`
7. `git diff --check`

Expected: all checks pass.

**Step 3: Review and commit**

Confirm no P1-02 through P1-05 behavior is duplicated, no DOM dependency is added, no production fallback is introduced, generated files remain untouched, and the user's `.gitignore` change remains unstaged. Commit the isolated batch with `test(adapter): cover declarative mappings` and push the current branch.
