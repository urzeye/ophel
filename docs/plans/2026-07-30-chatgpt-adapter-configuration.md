# ChatGPT Adapter Configuration Implementation Plan

**Goal:** Convert ChatGPT into the first P3-07 configurable built-in adapter without changing its command behavior or special UI paths.

**Architecture:** Keep `ChatGPTAdapter` imperative and move serializable selectors plus shared configuration into one validated `ChatGPTSiteConfig`. Runtime injection and registry validation reference the same config/version pair; account and route handling, native deletion, virtual-scroll export, asset safety, native TOC orchestration, outline caching, model parsing/click orchestration, and theme switching remain code.

### Task 1: Define the ChatGPT configuration

- Create `src/adapters/chatgpt-config.ts`.
- Preserve selector order and derive repeated conversation, message, model, Canvas, and library-shell selectors from stable base values.
- Export `CHATGPT_CONFIG_VERSION = 1` and the unique `CHATGPT_CONFIG` object.

### Task 2: Make ChatGPT consume injected configuration

- Add the three built-in configuration contract methods.
- Replace patchable selector and pure-config reads with dynamic `this.config` lookups.
- Clone arrays and nested objects returned to callers.
- Preserve deletion, virtual-scroll export, attachment filtering, native TOC, outline cache, model-lock, theme, Canvas, Deep Research, and fullscreen-shell control flow.

### Task 3: Register and document the migration

- Register ChatGPT in `src/core/builtin-config-registry.ts` with the shared config/version pair.
- Add a hotfix coverage matrix.
- Move P3-07 to in progress; P3-06 remains in progress because real-site regression is still outstanding.

### Task 4: Verify and deliver

- Validate defaults, patch application, private-key rejection, and stale-version behavior.
- Audit default equivalence, all 47 private-key usages, remaining direct host selectors, and special Canvas/Codex/Deep Research/library paths.
- Run focused formatting/ESLint, typecheck, full formatting/ESLint, extension and userscript builds, and `git diff --check`.
- Exclude the user-owned `.gitignore`, then commit and push the ChatGPT batch independently.
