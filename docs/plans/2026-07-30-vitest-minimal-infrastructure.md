# Minimal Vitest Infrastructure Implementation Plan

**Goal:** Establish the repository's persistent pure-TypeScript test runner and CI gate.

**Architecture:** Keep one root Vitest configuration and colocate tests with the pure modules they cover. Start with runtime-validator contract tests; defer exhaustive validator and merge matrices to isolated follow-up commits.

**Tech stack:** TypeScript 5.3, Vitest 3.2.4, Vite resolve aliases, pnpm, GitHub Actions Node 20.

---

### Task 1: Add the test runner

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `vitest.config.ts`

1. Add Vitest 3.2.4 as a development dependency with pnpm.
2. Add `test: vitest run` to package scripts.
3. Configure Node tests under `src/**/*.test.ts` and support the `~` alias.

### Task 2: Seed a real validator suite

**Files:**

- Create: `src/adapters/declarative/validate.test.ts`

1. Build a minimal valid SitePack fixture.
2. Assert the fixture validates successfully.
3. Assert unknown keys produce a structured `unknown_key` error.
4. Assert CSS escape normalization still blocks an obfuscated `url()` token.

### Task 3: Add the CI gate and update tracking

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

1. Run `pnpm test` after type checking and before build verification.
2. Mark only P0-00 as completed; leave P0-02 and P0-04 in progress.

### Task 4: Verify and publish the isolated batch

Run:

```powershell
pnpm test
pnpm format:check
pnpm exec eslint vitest.config.ts src/adapters/declarative/validate.test.ts
pnpm typecheck
pnpm build
git diff --check
```

Review the diff for runtime changes, duplicate tooling, generated output, lockfile drift, and accidental inclusion of the user's `.gitignore` change. Commit and push only the P0-00 files.
