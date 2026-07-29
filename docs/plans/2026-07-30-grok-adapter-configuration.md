# Grok Adapter Configuration Implementation Plan

**Goal:** Convert Grok into the second P3-06 configurable built-in adapter without changing its command behavior.

**Architecture:** Keep `GrokAdapter` imperative and move serializable selectors plus shared configuration into one validated `GrokSiteConfig`. Runtime injection and registry validation reference the same config/version pair; route decisions, native/API deletion, CMDK scanning, attachment/share parsing, Tiptap events, and theme orchestration remain code.

### Task 1: Define the Grok configuration

- Create `src/adapters/grok-config.ts`.
- Preserve selector order and derive combined selectors from stable base values.
- Export `GROK_CONFIG_VERSION = 1` and the unique `GROK_CONFIG` object.

### Task 2: Make Grok consume injected configuration

- Add the three built-in configuration contract methods.
- Replace patchable selector and pure-config reads with dynamic `this.config` lookups.
- Clone arrays and objects returned to callers.
- Preserve input events, path decisions, CMDK scrolling, deletion, export, attachment, theme, and panel-avoidance control flow.

### Task 3: Register and document the migration

- Register Grok in `src/core/builtin-config-registry.ts` with the shared config/version pair.
- Add a hotfix coverage matrix.
- Keep P3-06 in progress; real-site regression remains outstanding.

### Task 4: Verify and deliver

- Validate defaults, patch application, private-key rejection, and stale-version behavior.
- Audit default equivalence, private-key usage, and remaining direct host selectors.
- Run focused formatting/ESLint, typecheck, full formatting/ESLint, extension and userscript builds, and `git diff --check`.
- Exclude the user-owned `.gitignore`, then commit and push the Grok batch independently.
