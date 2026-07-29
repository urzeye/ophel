# Kimi Adapter Configuration Implementation Plan

**Goal:** Convert Kimi into the first P3-05 configurable built-in adapter so cached registry patches can update its site selectors without changing its existing command behavior.

**Architecture:** Follow the established Z.ai and Ima pattern: keep one validated built-in default config at module scope, let `KimiAdapter` read patchable values through `this.config`, and register the same config/version pair for runtime loading and registry validation. Host/path handling, authentication, delete APIs, input events, navigation flow, export parsing, and DOM traversal algorithms remain imperative code.

**Tech Stack:** TypeScript 5.3, existing SitePack validation/merge APIs, `SiteAdapter`, Plasmo/Vite dual-platform builds.

---

### Task 1: Define the Kimi built-in configuration

**Files:**

- Create: `src/adapters/kimi-config.ts`
- Reference: `src/adapters/ima-config.ts`
- Reference: `src/adapters/declarative/types.ts`

1. Define `KimiSiteConfig extends BuiltinSiteConfig` with required selector, input, conversation, generation, network, model-switcher, export, width, Zen, clean, and site-private fields.
2. Move serializable Kimi DOM selectors and declarative values into one factory-derived default config.
3. Export `KIMI_CONFIG_VERSION = 1` and the unique `KIMI_CONFIG` object.

### Task 2: Make Kimi consume injected configuration

**Files:**

- Modify: `src/adapters/kimi.ts`

1. Add the configurable-adapter contract through `getBuiltinConfig()`, `getBuiltinConfigVersion()`, and `applyMergedConfig()`.
2. Replace patchable selector reads with `this.config` lookups and clone externally returned arrays/objects.
3. Preserve session parsing, authentication, delete requests, input events, click/navigation ordering, export asset processing, outline traversal, and other imperative behavior.
4. Remove replaced constants and inline site selectors so the adapter has no second selector source.

### Task 3: Register and document the migration

**Files:**

- Modify: `src/core/builtin-config-registry.ts`
- Create: `docs/developer/kimi-adapter-config-hotfix-matrix.md`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

1. Register Kimi with the shared config/version pair.
2. Document the patchable boundary and the behavior that still requires an application release.
3. Mark P3-05 as in progress; Qianwen, Yuanbao, ChatGLM, and real-site regressions remain outstanding.

### Task 4: Verify and deliver the Kimi closure

1. Validate the default config with the complete private-key allowlist and built-in capability requirements.
2. Verify a legal Kimi patch applies, an unknown private selector key is rejected, and a stale base version is skipped.
3. Run focused Prettier/ESLint, `pnpm typecheck`, `pnpm build`, `pnpm build:userscript`, and `git diff --check`.
4. Review the final diff, excluding the user-owned `.gitignore` change, then commit and push as `refactor(adapter): configure Kimi selectors`.
