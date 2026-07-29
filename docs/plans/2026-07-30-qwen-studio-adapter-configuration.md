# Qwen Studio Adapter Configuration Implementation Plan

**Goal:** Convert Qwen Studio into the fourth P3-06 configurable built-in adapter without changing its command behavior.

**Architecture:** Keep `QwenAiAdapter` imperative and move serializable selectors plus shared configuration into one validated `QwenStudioSiteConfig`. Runtime injection and registry validation reference the same config/version pair; route and credential parsing, conversation API pagination, textarea events, full-history export, attachment filtering, Mermaid and thought-panel timing, theme control, and multi-stage model selection remain code.

### Task 1: Define the Qwen Studio configuration

- Create `src/adapters/qwen-studio-config.ts`.
- Preserve selector order and derive combined selectors from stable base values.
- Export `QWEN_STUDIO_CONFIG_VERSION = 1` and the unique `QWEN_STUDIO_CONFIG` object.

### Task 2: Make Qwen Studio consume injected configuration

- Add the three built-in configuration contract methods.
- Replace patchable selector and pure-config reads with dynamic `this.config` lookups.
- Clone arrays and objects returned to callers.
- Preserve API, route, input-event, export parsing, Mermaid, thought-panel, theme, and model-menu control flow.

### Task 3: Register and document the migration

- Register Qwen Studio in `src/core/builtin-config-registry.ts` with the shared config/version pair.
- Add a hotfix coverage matrix.
- Keep P3-06 in progress; real-site regression remains outstanding.

### Task 4: Verify and deliver

- Validate defaults, patch application, private-key rejection, and stale-version behavior.
- Audit default equivalence, all 59 private-key usages, and remaining direct host selectors.
- Run focused formatting/ESLint, typecheck, full formatting/ESLint, extension and userscript builds, and `git diff --check`.
- Exclude the user-owned `.gitignore`, then commit and push the Qwen Studio batch independently.
