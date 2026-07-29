# Dynamic Site ID Test Matrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Protect P1-08's `pack:` platform metadata and arbitrary string-key data flow with durable Vitest coverage.

**Architecture:** Test real PackManager platform mapping and platform-catalog state with mocked storage/i18n boundaries, then exercise real settings normalization/selectors/backup codec and the prompt platform predicate.

**Tech Stack:** TypeScript 5.3, Vitest 3.2.4, PackManager, platform catalog, Zustand prompt predicate, backup codec.

---

### Task 1: Cover dynamic platform metadata and catalog state

**Files:**

- Create: `src/core/platform-catalog.test.ts`

1. Build valid structural installed-pack fixtures.
2. Cover built-in ID guard behavior and ordered SitePack-to-platform mapping.
3. Assert localized names, wildcard URL matching, origin/favicon derivation, Unicode initials, and empty-match metadata.
4. Cover catalog priming, language rebuild, lazy-load promise reuse, issue logging, and failure fallback.

### Task 2: Cover dynamic settings and backup preservation

**Files:**

- Create: `src/utils/dynamic-site-settings.test.ts`

1. Add a complete `pack:` key across theme, layout, panel avoidance, and model-lock records.
2. Normalize a JSON round trip and assert all selectors return the dynamic values while built-in sibling keys remain intact.
3. Create a settings backup, build a restore plan, parse the restored Zustand envelope, normalize it, and prove the key remains unchanged.

### Task 3: Cover prompt platform matching

**Files:**

- Create: `src/stores/prompts-store.test.ts`

1. Mock persistence and default prompts only.
2. Prove universal prompts remain visible, exact `pack:` IDs match, and unrelated built-in/dynamic filters do not match.
3. Run the three focused test files.

### Task 4: Update tracking, verify, and deliver

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

1. Mark P1-08 `已完成` only after all matrices pass.
2. Run full tests, format, focused ESLint, typecheck, registry validation, extension build, userscript build, and `git diff --check`.
3. Review for duplicated platform catalogs, key coercion, backup loss, P1-15 scope leakage, UI/theme/Shadow DOM changes, generated files, and `.gitignore` staging.
4. Commit with `test(core): cover dynamic site identities` and push.
