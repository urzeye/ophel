# SitePack Validator Test Matrix Implementation Plan

**Goal:** Convert P0-02's runtime validation acceptance rules into durable Vitest coverage.

**Architecture:** Test only exported validator APIs. Use a minimal fixture for isolated boundary cases, the registry example for a complete valid configuration, and shared assertions for structured validation errors.

**Tech stack:** TypeScript 5.3, Vitest 3.2.4, `safe-regex2`, runtime SitePack validator, registry example JSON.

---

### Task 1: Expand manifest and security coverage

**Files:**

- Modify: `src/adapters/declarative/validate.test.ts`

1. Add reusable valid fixtures and structured-error assertions.
2. Cover required/type/version errors and byte, array, selector, regex, and CSS boundaries.
3. Cover match patterns, detect rules, same-origin paths, IDs, colors, and CSS normalization.
4. Cover regex compilation and `safe-regex2` rejection.

### Task 2: Cover capability contracts

**Files:**

- Modify: `src/adapters/declarative/validate.test.ts`

1. Validate the comprehensive registry example.
2. Add missing-field failures for every capability.
3. Add unknown and duplicate capability failures.

### Task 3: Cover built-in, override, and patch validators

**Files:**

- Create: `src/adapters/declarative/validate-config.test.ts`

1. Test built-in required capabilities and private selector allowlists.
2. Test partial overrides and null deletion.
3. Test valid patch metadata and semantic-version ranges.
4. Prove patch config cannot bypass unknown-key, CSS, regex, or private-selector validation.

### Task 4: Update tracking and verify

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

1. Mark P0-02 complete only after the full matrix passes.
2. Run `pnpm test`, format, focused ESLint, typecheck, extension build, and `git diff --check`.
3. Review for tests that merely mirror implementation details, skipped cases, runtime changes, generated artifacts, and accidental `.gitignore` staging.
4. Commit and push the isolated P0-02 batch.
