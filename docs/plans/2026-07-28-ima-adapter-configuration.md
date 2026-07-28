# Ima Adapter Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert Ima into the second configurable built-in adapter so cached registry patches can update its site selectors without changing its existing command behavior.

**Architecture:** Follow the established Z.ai pattern: keep a validated built-in default config at module scope, let `ImaAdapter` read all patchable selectors through `this.config`, and register one shared descriptor for runtime loading and registry validation. Host/path/storage parsing and imperative DOM, input, export, and navigation algorithms remain in `ima.ts` and still require an application release.

**Tech Stack:** TypeScript 5.3, existing SitePack validation/merge APIs, `SiteAdapter`, Plasmo/Vite dual-platform builds.

---

### Task 1: Define the Ima built-in configuration

**Files:**

- Create: `src/adapters/ima-config.ts`
- Reference: `src/adapters/zai-config.ts`
- Reference: `src/adapters/declarative/types.ts`

**Step 1: Define strongly typed config fields**

Create `ImaSiteConfig extends BuiltinSiteConfig` with required public selector, input, generation, network, model-switcher, export, width, Zen, clean, and site-private selector fields.

**Step 2: Move patchable pure data into the config**

Move Ima DOM selectors and declarative config values out of `ima.ts`. Keep hostname/path regexes, storage keys, attachment attribute parsing, URL filtering, and imperative algorithms in code.

**Step 3: Add the compatibility version**

Export `IMA_CONFIG_VERSION = 1` and `IMA_CONFIG`. Future built-in selector fixes must increment this version so stale patches fail the `baseConfigVersion` gate.

### Task 2: Make Ima consume injected configuration

**Files:**

- Modify: `src/adapters/ima.ts`

**Step 1: Add the configurable-adapter contract**

Initialize `private config: ImaSiteConfig = IMA_CONFIG`, then implement `getBuiltinConfig()`, `getBuiltinConfigVersion()`, and `applyMergedConfig()` using the existing `BuiltinSiteConfig` contract.

**Step 2: Replace selector reads**

Replace all site-specific selector constants and inline site selectors with `this.config.selectors`, `this.config.sitePrivateSelectors`, or the relevant common config section. Return cloned arrays/objects from public getters where callers may mutate them.

**Step 3: Preserve command behavior**

Do not change contenteditable insertion, conversation/session parsing, export asset extraction, URL filtering, click simulation, outline algorithms, or other imperative behavior. Do not cache values derived from `this.config` in the constructor or class fields.

### Task 3: Register and document the second pilot

**Files:**

- Modify: `src/core/builtin-config-registry.ts`
- Create: `docs/developer/ima-adapter-config-hotfix-matrix.md`
- Create: `docs/developer/site-adapter-config-migration-guide.md`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Register the shared descriptor**

Add Ima to the built-in config descriptor map so runtime patch loading and registry validation use the same `siteId`, `configVersion`, base config, and private-selector allowlist.

**Step 2: Record the hotfix boundary**

Document which Ima fields can be patched and which hostname, storage, parsing, API, export, input, and navigation behaviors still require a release.

**Step 3: Write the migration procedure**

Document the repeatable steps and checklist for future Phase 3 built-in adapter migrations, including config typing, selector replacement, descriptor registration, versioning, diff review, and regression expectations.

**Step 4: Update task tracking**

Mark P0-09 as in progress until the real-site Ima regression checklist is completed.

### Task 4: Verify and deliver the functional closure

**Files:**

- Verify only the files above

**Step 1: Run focused formatting**

Run: `pnpm exec prettier --check src/adapters/ima-config.ts src/adapters/ima.ts src/core/builtin-config-registry.ts`

Expected: all files pass.

**Step 2: Run static and dual-platform checks**

Run: `pnpm lint:check`

Expected: zero errors; existing warnings may remain.

Run: `pnpm typecheck`

Expected: pass.

Run: `pnpm build`

Expected: Chrome extension build completes.

Run: `pnpm build:userscript`

Expected: userscript build completes.

**Step 3: Review the diff**

Confirm `ima.ts` contains no remaining patchable site selector constants outside config, no constructor-derived config cache, no second descriptor source, and no unrelated changes. Preserve the existing user-owned `.gitignore` modification and Playwright artifacts.

**Step 4: Commit and push**

```bash
git add src/adapters/ima-config.ts src/adapters/ima.ts src/core/builtin-config-registry.ts docs/developer/ima-adapter-config-hotfix-matrix.md docs/developer/site-adapter-config-migration-guide.md docs/developer/site-adapter-pluginization-tasks.csv docs/plans/2026-07-28-ima-adapter-configuration.md
git commit -m "refactor(adapter): configure Ima selectors"
git push origin feat/site-adapter-pluginization
```
