# Doubao Adapter Configuration Implementation Plan

**Goal:** Convert Doubao into the third P3-06 configurable built-in adapter without changing its command behavior.

**Architecture:** Keep `DoubaoAdapter` imperative and move serializable selectors plus shared configuration into one validated `DoubaoSiteConfig`. Runtime injection and registry validation reference the same config/version pair; route handling, Slate events, virtual outline caching, scroll-sweep export, attachment parsing, UI deletion, and theme behavior remain code.

### Task 1: Define the Doubao configuration

- Create `src/adapters/doubao-config.ts`.
- Preserve selector order and derive combined selectors from stable base values.
- Export `DOUBAO_CONFIG_VERSION = 1` and the unique `DOUBAO_CONFIG` object.

### Task 2: Make Doubao consume injected configuration

- Add the three built-in configuration contract methods.
- Replace patchable selector and pure-config reads with dynamic `this.config` lookups.
- Clone arrays and objects returned to callers.
- Preserve route decisions, Slate input events, virtual-list algorithms, export parsing, deletion timing, and theme control flow.

### Task 3: Register and document the migration

- Register Doubao in `src/core/builtin-config-registry.ts` with the shared config/version pair.
- Add a hotfix coverage matrix.
- Keep P3-06 in progress; real-site regression remains outstanding.

### Task 4: Verify and deliver

- Validate defaults, patch application, private-key rejection, and stale-version behavior.
- Audit default equivalence, private-key usage, and remaining direct host selectors.
- Run focused formatting/ESLint, typecheck, full formatting/ESLint, extension and userscript builds, and `git diff --check`.
- Exclude the user-owned `.gitignore`, then commit and push the Doubao batch independently.
