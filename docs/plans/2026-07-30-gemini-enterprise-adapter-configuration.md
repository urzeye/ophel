# Gemini Enterprise Adapter Configuration Implementation Plan

**Goal:** Convert Gemini Enterprise into the fifth and final P3-06 configurable built-in adapter without changing its command behavior.

**Architecture:** Keep `GeminiEnterpriseAdapter` imperative and move serializable selectors plus shared configuration into one validated `GeminiEnterpriseSiteConfig`. Runtime injection and registry validation reference the same config/version pair; CID and route handling, numeric conversation filtering, deletion safeguards, multi-stage input events, recursive Shadow DOM traversal, model-name parsing, conversation expansion, and theme orchestration remain code.

### Task 1: Define the Gemini Enterprise configuration

- Create `src/adapters/gemini-enterprise-config.ts`.
- Preserve selector order and derive repeated selectors from stable base values.
- Export `GEMINI_ENTERPRISE_CONFIG_VERSION = 1` and the unique `GEMINI_ENTERPRISE_CONFIG` object.

### Task 2: Make Gemini Enterprise consume injected configuration

- Add the three built-in configuration contract methods.
- Replace patchable selector and pure-config reads with dynamic `this.config` lookups.
- Clone arrays and objects returned to callers.
- Preserve CID, route, deletion, input-event, Shadow DOM, export, model, conversation-expansion, theme, and panel-avoidance control flow.

### Task 3: Register and document the migration

- Register Gemini Enterprise in `src/core/builtin-config-registry.ts` with the shared config/version pair.
- Add a hotfix coverage matrix.
- Keep P3-06 in progress; real-site regression remains outstanding.

### Task 4: Verify and deliver

- Validate defaults, patch application, private-key rejection, and stale-version behavior.
- Audit default equivalence, all 29 private-key usages, remaining direct host selectors, and CID/no-CID conversation URLs.
- Run focused formatting/ESLint, typecheck, full formatting/ESLint, extension and userscript builds, and `git diff --check`.
- Exclude the user-owned `.gitignore`, then commit and push the Gemini Enterprise batch independently.
