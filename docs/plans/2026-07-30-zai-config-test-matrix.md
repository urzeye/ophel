# Z.ai Config Test Matrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add durable automated coverage for P0-08's Z.ai selector configuration and hotfix injection while preserving the outstanding live-site acceptance boundary.

**Architecture:** Test the real `ZaiAdapter` against its exported base config and descriptor, resolve a real typed patch through the shared merge pipeline, and use a source-consumption assertion for the private-selector allowlist.

**Tech Stack:** TypeScript 5.3, Vitest 3.2.4, ZaiAdapter, shared SiteConfig resolver, and Node file inspection.

---

### Task 1: Cover default config and descriptor wiring

**Files:**

- Create: `src/adapters/zai-config.test.ts`

1. Assert the adapter and built-in descriptor share `ZAI_CONFIG` and `ZAI_CONFIG_VERSION`.
2. Assert default selectors, input key, export config, model config, width, Zen, panel avoidance, and feature capabilities match the exported config.
3. Mutate returned arrays/objects and prove later reads remain unchanged.

### Task 2: Cover live patch consumption

**Files:**

- Extend: `src/adapters/zai-config.test.ts`

1. Resolve a version-compatible Z.ai patch through `resolveSiteConfig()`.
2. Inject the merged config into an existing adapter.
3. Assert patched public selectors, generation detection, model config, export config, width, Zen, panel avoidance, and user-query width take effect immediately.

### Task 3: Lock the private-selector matrix and documentation boundary

**Files:**

- Extend: `src/adapters/zai-config.test.ts`
- Modify: `docs/developer/zai-adapter-config-hotfix-matrix.md`

1. Read `zai.ts` and require every private allowlist key to have a runtime `this.config.sitePrivateSelectors.<key>` access.
2. Clarify that Z.ai consumes `input.submitKey`; input-control mode changes still require an application release.
3. Document the automated checks and keep the real-site manual checklist outstanding.

### Task 4: Verify and deliver

1. Run focused and full tests, format, focused ESLint, typecheck, registry validation, extension build, userscript build, and `git diff --check`.
2. Review for duplicated selector truth, test-only production changes, P0-13 scope leakage, generated files, and `.gitignore` staging.
3. Commit with `test(adapter): cover Z.ai config hotfixing` and push; do not mark P0-08 complete.
