# ChatGLM Adapter Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert ChatGLM into the fourth P3-05 configurable built-in adapter so cached registry patches can update its site selectors without changing its existing command behavior.

**Architecture:** Keep `ChatGLMAdapter` as the command implementation and move serializable DOM selectors plus shared configuration into one validated `ChatGLMSiteConfig`. Runtime injection and registry validation must reference the same config/version pair; theme event orchestration, share API export, attachment parsing, and URL filtering remain imperative.

**Tech Stack:** TypeScript 5.3, existing SitePack validation/merge APIs, `SiteAdapter`, Plasmo/Vite dual-platform builds.

---

### Task 1: Define the ChatGLM built-in configuration

**Files:**

- Create: `src/adapters/chatglm-config.ts`
- Reference: `src/adapters/qianwen-config.ts`
- Reference: `src/adapters/declarative/types.ts`

1. Define `ChatGLMSiteConfig extends BuiltinSiteConfig` with required selector, input, generation, network, model-switcher, export, width, Zen, clean, Quick Quote, and site-private fields.
2. Derive combined selectors from a small set of base values and preserve existing selector order.
3. Export `CHATGLM_CONFIG_VERSION = 1` and the unique `CHATGLM_CONFIG` object.

### Task 2: Make ChatGLM consume injected configuration

**Files:**

- Modify: `src/adapters/chatglm.ts`

1. Add `getBuiltinConfig()`, `getBuiltinConfigVersion()`, and `applyMergedConfig()`.
2. Replace patchable selector and pure-config reads with dynamic `this.config` lookups; clone externally returned arrays and objects.
3. Preserve textarea events, theme click timing/fallback, query-parameter routing, share API export, attachment parsing, thought extraction, model lookup, and Canvas avoidance behavior.
4. Remove replaced selector constants and inline host selectors so the adapter has no second selector source.

### Task 3: Register and document the migration

**Files:**

- Modify: `src/core/builtin-config-registry.ts`
- Create: `docs/developer/chatglm-adapter-config-hotfix-matrix.md`

1. Register ChatGLM with the shared config/version pair.
2. Document the patchable selector boundary and behaviors that still require an application release.
3. Keep P3-05 in progress until the four-site real-page regression matrix is completed.

### Task 4: Verify and deliver the ChatGLM closure

1. Validate the default config with its private-key allowlist and built-in capability requirements.
2. Verify a legal ChatGLM patch applies, an unknown private selector key is rejected, and a stale base version is skipped.
3. Compare migrated defaults with the previous selector constants/getter values and audit remaining direct selectors.
4. Run focused Prettier/ESLint, `pnpm typecheck`, `pnpm format:check`, clean-tree ESLint, `pnpm build`, `pnpm build:userscript`, and `git diff --check`.
5. Review the final diff, exclude the user-owned `.gitignore` change, then commit and push as `refactor(adapter): configure ChatGLM selectors`.
