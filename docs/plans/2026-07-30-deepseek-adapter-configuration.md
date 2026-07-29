# DeepSeek Adapter Configuration Implementation Plan

**Goal:** Convert DeepSeek into the first P3-06 configurable built-in adapter without changing its command behavior.

**Architecture:** Keep `DeepSeekAdapter` imperative and move serializable selectors plus shared configuration into one validated `DeepSeekSiteConfig`. Runtime injection and registry validation reference the same config/version pair; route parsing, virtual-list algorithms, share export, attachment parsing, delete API, and theme orchestration remain code.

### Task 1: Define the DeepSeek configuration

- Create `src/adapters/deepseek-config.ts`.
- Preserve selector order and derive combined selectors from stable base values.
- Export `DEEPSEEK_CONFIG_VERSION = 1` and the unique `DEEPSEEK_CONFIG` object.

### Task 2: Make DeepSeek consume injected configuration

- Add the three built-in configuration contract methods.
- Replace patchable selector and pure-config reads with dynamic `this.config` lookups.
- Clone arrays and objects returned to callers.
- Preserve input events, path parsing, virtual scrolling, export, attachment, deletion, theme, and panel-avoidance control flow.

### Task 3: Register and document the migration

- Register DeepSeek in `src/core/builtin-config-registry.ts` with the shared config/version pair.
- Add a hotfix coverage matrix.
- Mark P3-06 as in progress; real-site regression remains outstanding.

### Task 4: Verify and deliver

- Validate defaults, patch application, private-key rejection, and stale-version behavior.
- Audit default equivalence, private-key usage, and remaining direct host selectors.
- Run focused formatting/ESLint, typecheck, full formatting/ESLint, extension and userscript builds, and `git diff --check`.
- Exclude the user-owned `.gitignore`, then commit and push the DeepSeek batch independently.
