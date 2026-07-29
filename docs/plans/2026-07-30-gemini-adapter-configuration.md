# Gemini Adapter Configuration Implementation Plan

**Goal:** Convert Gemini into the third P3-07 configurable built-in adapter without changing its command behavior or preserve-layout semantics.

**Architecture:** Keep `GeminiAdapter` and its helper/lifecycle algorithms. Add one strongly typed default config, inject the resolved config through the existing built-in configuration latch, and replace site DOM literals with runtime reads from public schema fields or Gemini-only private selector keys.

**Tech Stack:** TypeScript, existing `BuiltinSiteConfig` validation/merge pipeline, React/Plasmo extension and Vite userscript builds.

---

### Task 1: Add the strongly typed Gemini configuration

**Files:**

- Create: `src/adapters/gemini-config.ts`

1. Define required public selector, input, conversation, generation, network, model, export, width, mode and capability fields.
2. Define purpose-named private selector keys for account detection, My Stuff, conversation/delete UI, messages, export assets, Drive, Deep Research, Canvas and preserve layout.
3. Derive repeated selectors from a small set of local constants and export one `GEMINI_CONFIG` plus `GEMINI_CONFIG_VERSION = 1`.
4. Keep every value JSON serializable and within selector/array validation limits.

### Task 2: Make the adapter consume the merged config

**Files:**

- Modify: `src/adapters/gemini.ts`

1. Add the configurable built-in adapter contract and make all public getters return cloned config data where callers may mutate it.
2. Replace top-level selector constants and repeated site DOM literals with per-call `this.config` reads.
3. Pass `getConfig: () => this.config` into `GeminiMyStuffEnhancer`; do not cache selectors in the helper.
4. Preserve route/account parsing, delete orchestration, export safety logic, Canvas bridge, lifecycle timing, outline caching and theme control flow.
5. Keep Ophel-owned selectors, dynamic ID/href selectors and generic DOM traversal primitives in code.

### Task 3: Register and document the built-in descriptor

**Files:**

- Modify: `src/core/builtin-config-registry.ts`
- Create: `docs/developer/gemini-adapter-config-hotfix-matrix.md`

1. Register `SITE_IDS.GEMINI` with the shared default config and version constants.
2. Document patchable areas and behavior that still requires an application release.
3. Leave P3-07 as in progress until Gemini and AI Studio real-site regression is complete.

### Task 4: Verify equivalence and configuration semantics

**Files:**

- Verify: `src/adapters/gemini-config.ts`
- Verify: `src/adapters/gemini.ts`
- Verify: `src/core/builtin-config-registry.ts`

1. Run focused Prettier and ESLint checks, then TypeScript type checking.
2. Validate the default config and representative patch acceptance/rejection through the existing test/build paths available in the repository.
3. Run both `pnpm build` and `pnpm build:userscript` because Gemini uses shared extension/userscript content and main-world Canvas paths.
4. Run `git diff --check`, inspect the final diff, and exclude the user's `.gitignore` change.

### Task 5: Commit and push Gemini independently

1. Confirm only Gemini configuration, adapter, registry and documentation files are staged.
2. Commit as `refactor(adapter): configure Gemini selectors`.
3. Push the current feature branch before starting AI Studio.
