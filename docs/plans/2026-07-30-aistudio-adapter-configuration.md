# AI Studio Adapter Configuration Implementation Plan

**Goal:** Convert AI Studio into the final P3-07 configurable built-in adapter without changing its command behavior, export state machine, or three-column layout semantics.

**Architecture:** Keep `AIStudioAdapter` and its Library, model, delete, attachment, outline, and virtual-content algorithms. Add one strongly typed default config, inject the resolved config through the existing built-in configuration latch, and replace site DOM literals with per-call reads from public schema fields or AI Studio-only private selector keys.

**Tech Stack:** TypeScript, existing `BuiltinSiteConfig` validation/merge pipeline, React/Plasmo extension and Vite userscript builds.

---

### Task 1: Add the strongly typed AI Studio configuration

**Files:**

- Create: `src/adapters/aistudio-config.ts`

1. Define required public selector, input, conversation, generation, model, export, width, mode and capability fields.
2. Define purpose-named private selector keys for timeline navigation, titles, layout, model sidebar, Library/delete UI, message chunks, attachments, Thought/Markdown normalization, export mounting, and theme events.
3. Derive repeated selectors from a small set of local constants and export one `AISTUDIO_CONFIG` plus `AISTUDIO_CONFIG_VERSION = 1`.
4. Keep every value JSON serializable and within selector/array validation limits.

### Task 2: Make the adapter consume the merged config

**Files:**

- Modify: `src/adapters/aistudio.ts`

1. Add the configurable built-in adapter contract and make public getters return cloned config data where callers may mutate it.
2. Replace module-level host selector constants and repeated AI Studio DOM literals with per-call `this.config` reads.
3. Preserve route/session parsing, user submit-key preference, Library navigation/cache, RPC/delete orchestration, model panel timing, attachment URL safety, Thought formatting, virtual-content mounting/retry, snapshot ordering, and theme control flow.
4. Keep Ophel-owned snapshot attributes, dynamic ID/href selectors, generic DOM traversal primitives, and non-selector constants in code.
5. Leave `aistudio-preload.ts` unchanged as L1 document-start behavior; do not add a Flutter iframe path that AI Studio does not currently own.

### Task 3: Register and document the built-in descriptor

**Files:**

- Modify: `src/core/builtin-config-registry.ts`
- Create: `docs/developer/aistudio-adapter-config-hotfix-matrix.md`

1. Register `SITE_IDS.AISTUDIO` with the shared default config and version constants.
2. Document patchable areas and behavior that still requires an application release.
3. Leave P3-07 as in progress until all four large sites pass real-site regression.

### Task 4: Verify equivalence and configuration semantics

**Files:**

- Verify: `src/adapters/aistudio-config.ts`
- Verify: `src/adapters/aistudio.ts`
- Verify: `src/core/builtin-config-registry.ts`

1. Confirm every private selector key has at least one runtime read and no old host selector constant remains as a second source.
2. Validate the default config, representative legal patch, unknown/deleted private key rejection, and old `baseConfigVersion` skip behavior.
3. Run focused Prettier and ESLint checks, then `pnpm typecheck`.
4. Run both `pnpm build` and `pnpm build:userscript` because the adapter and document-start settings path are shared across extension/userscript delivery.
5. Run `git diff --check`, inspect the final diff, and exclude the user's `.gitignore` change.

### Task 5: Commit and push AI Studio independently

1. Confirm only AI Studio configuration, adapter, registry and documentation files are staged.
2. Commit as `refactor(adapter): configure AI Studio selectors`.
3. Push the current feature branch.
