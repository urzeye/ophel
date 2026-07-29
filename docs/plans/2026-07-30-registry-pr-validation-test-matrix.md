# Registry PR Validation Test Matrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Prove P0-07 rejects unsafe or conflicting registry PR candidates with field-located errors while preserving the trusted-base workflow boundary.

**Architecture:** Run `loadValidatedRegistrySources()` against isolated temporary registry roots for most cases, spawn the real `tsx` CLI for one failure contract, and assert the workflow's security-critical wiring from its checked-in YAML.

**Tech Stack:** Vitest 3.2.4, Node.js filesystem and child-process APIs, `registry/scripts/validate.mjs`, GitHub Actions YAML.

---

### Task 1: Add registry test discovery and fixture harness

**Files:**

- Modify: `vitest.config.ts`
- Create: `registry/scripts/validate.test.mjs`

1. Include `registry/**/*.test.mjs` alongside existing source tests.
2. Build a per-test temporary registry root with copied schema/example files and empty `sites`/`patches` directories.
3. Add helpers for cloning the example manifest, writing JSON sources, and asserting field-located validation errors.

### Task 2: Cover registry policy and shared safety validation

**Files:**

- Modify: `registry/scripts/validate.test.mjs`

1. Prove a valid synthetic pack loads successfully.
2. Cover JSON Schema failure, duplicate ID, built-in ID, built-in match, and inter-pack match conflicts.
3. Cover unsafe regex, escaped unsafe CSS, and missing capability requirements through the registry entry point.
4. Run `pnpm test -- registry/scripts/validate.test.mjs`.

### Task 3: Cover CLI and workflow contracts

**Files:**

- Modify: `registry/scripts/validate.test.mjs`

1. Spawn the real `tsx` CLI against an invalid temporary registry and assert non-zero status plus source/field/code output.
2. Assert the workflow checks out the trusted base, fetches the expected PR head into a detached worktree, validates that candidate root, reports the log in a PR comment, and fails the job on validation failure.
3. Run `pnpm test` and `pnpm registry:validate`.

### Task 4: Update tracking, verify, and deliver

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

1. Mark P0-07 `已完成` only after the full matrix passes.
2. Run format, focused ESLint, typecheck, registry validation, extension build, userscript build, and `git diff --check`.
3. Review for duplicated validator rules, temporary-file leakage, workflow security regressions, generated files, and `.gitignore` staging.
4. Commit with `test(registry): cover PR validation workflow` and push.
