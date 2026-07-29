# Qianwen Adapter Configuration Implementation Plan

**Goal:** Convert Qianwen into the second P3-05 configurable built-in adapter so cached registry patches can update its site selectors without changing its existing command behavior.

**Architecture:** Follow the shared built-in configuration pattern established by Z.ai, Ima, and Kimi. Keep one validated default config, read patchable values through `this.config`, and register the same config/version pair for runtime injection and registry validation. Path/storage parsing, Slate input events, long-history scrolling, model matching, export parsing, and asset URL filtering remain imperative code.

**Tech Stack:** TypeScript 5.3, existing SitePack validation/merge APIs, `SiteAdapter`, Plasmo/Vite dual-platform builds.

---

### Task 1: Define the Qianwen built-in configuration

**Files:**

- Create: `src/adapters/qianwen-config.ts`
- Reference: `src/adapters/kimi-config.ts`
- Reference: `src/adapters/declarative/types.ts`

1. Define `QianwenSiteConfig extends BuiltinSiteConfig` with required selector, input, generation, network, model-switcher, export, width, Zen, clean, and site-private fields.
2. Move serializable DOM selectors and declarative values into one factory-derived default config.
3. Export `QIANWEN_CONFIG_VERSION = 1` and the unique `QIANWEN_CONFIG` object.

### Task 2: Make Qianwen consume injected configuration

**Files:**

- Modify: `src/adapters/qianwen.ts`

1. Add `getBuiltinConfig()`, `getBuiltinConfigVersion()`, and `applyMergedConfig()`.
2. Replace patchable selector reads with dynamic `this.config` lookups and clone externally returned arrays/objects.
3. Preserve mixed textarea/Slate input behavior, virtual scrolling, long-history export, model-selection orchestration, Canvas avoidance, attachment parsing, and DOM traversal order.
4. Remove replaced constants and inline host selectors so the adapter has no second selector source.

### Task 3: Register and document the migration

**Files:**

- Modify: `src/core/builtin-config-registry.ts`
- Create: `docs/developer/qianwen-adapter-config-hotfix-matrix.md`

1. Register Qianwen with the shared config/version pair.
2. Document the patchable selector boundary and behaviors that still require an application release.
3. Keep P3-05 in progress because Yuanbao, ChatGLM, and real-site regressions remain outstanding.

### Task 4: Verify and deliver the Qianwen closure

1. Validate the default config with its private-key allowlist and built-in capability requirements.
2. Verify a legal Qianwen patch applies, an unknown private selector key is rejected, and a stale base version is skipped.
3. Run focused Prettier/ESLint, `pnpm typecheck`, `pnpm build`, `pnpm build:userscript`, and `git diff --check`.
4. Review the final diff, excluding the user-owned `.gitignore` change, then commit and push as `refactor(adapter): configure Qianwen selectors`.
