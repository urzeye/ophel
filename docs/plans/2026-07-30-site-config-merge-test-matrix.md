# Site Config Merge Test Matrix Implementation Plan

**Goal:** Lock P0-04's three-layer merge, compatibility, validation, and injection contracts with Vitest.

**Architecture:** Build a valid built-in config from the registry example, call only exported merge APIs, and assert both layer metadata and immutable final configs.

**Tech stack:** TypeScript 5.3, Vitest 3.2.4, SitePack validator and merge modules.

---

### Task 1: Cover primitive merge semantics

**Files:**

- Create: `src/adapters/declarative/merge.test.ts`

1. Test recursive object merging.
2. Test atomic array replacement.
3. Test `null` deletion.
4. Test cloning and base-config immutability.

### Task 2: Cover three-layer resolution and compatibility

**Files:**

- Modify: `src/adapters/declarative/merge.test.ts`

1. Apply a remote patch and then a user override, preserving unrelated values from each layer.
2. Cover absent layers.
3. Cover target-site, base-config-version, minimum-app-version, and maximum-app-version skip reasons.

### Task 3: Cover validation boundaries and injection

**Files:**

- Modify: `src/adapters/declarative/merge.test.ts`

1. Distinguish patch/override validation rejection from merged-result rejection.
2. Reject deletion of fields required by capabilities and built-in private selectors.
3. Reject invalid built-in configs explicitly.
4. Test `supportsMergedConfig`, `supportsBuiltinSiteConfig`, and `applyMergedConfig`.

### Task 4: Update tracking and verify

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

1. Mark P0-04 complete only after the matrix passes.
2. Run tests, formatting, focused ESLint, typecheck, registry validation, extension build, and `git diff --check`.
3. Review for duplicated validation logic, mutation of fixtures, hidden fallback behavior, generated files, and accidental `.gitignore` staging.
4. Commit and push the isolated P0-04 batch.
