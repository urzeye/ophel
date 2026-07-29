# SitePack Custom Origins Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a complete custom HTTPS origin binding workflow for installed SitePacks, including extension authorization, explicit adapter activation, and settings UI management.

**Architecture:** Reuse the v1 binding codec and origin-reference graph from P2-01. Add one serialized registration-manager operation for authorizing a binding origin, expose it through the existing background/platform boundary, load explicit bindings into a higher-priority dynamic adapter list, and keep the SitePacks page as the cross-platform owner of binding CRUD with rollback around reconciliation.

**Tech Stack:** TypeScript 5.3, React 18, Zustand/platform storage, Chrome MV3 permissions and scripting APIs, Plasmo, existing `settings.css` theme variables, and temporary `tsx` behavior smokes.

---

### Task 1: Document and track the feature

**Files:**

- Create: `docs/plans/2026-07-29-site-pack-custom-origins-design.md`
- Create: `docs/plans/2026-07-29-site-pack-custom-origins.md`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv:34`

**Step 1:** Add the validated architecture, authorization order, rollback behavior, adapter precedence, UI boundary, and verification criteria to the two plan documents.

**Step 2:** Change only P2-02's status from `未开始` to `进行中`.

**Step 3:** Run `git diff --check` and confirm `.gitignore` remains the only unrelated user change.

### Task 2: Add binding-origin authorization to the extension boundary

**Files:**

- Modify: `src/platform/extension/site-pack-registration.ts`
- Modify: `src/platform/extension/site-pack-registration-runtime.ts`
- Modify: `src/utils/messaging.ts`
- Modify: `src/background.ts`
- Modify: `src/platform/types.ts`
- Modify: `src/platform/extension/index.ts`
- Modify: `src/platform/userscript/index.ts`

**Step 1:** Generalize permission-request context from a concrete pack to a display-name context while preserving the existing install/enable flow.

**Step 2:** Implement `ensureBindingOrigin(origin, binding)` in the serialized registration manager. Validate exact origin and binding, verify the explicit target or detect-capable installed pool, request only `https://authority/*`, persist SitePack-owned permission state, and return the existing granted/missing result shape.

**Step 3:** Add a typed `ENSURE_SITE_PACK_BINDING_ORIGIN` message and background handler, then expose `platform.sitePacks.ensureBindingOrigin()`; userscript returns `unsupported` without mutating storage.

**Step 4:** Run `pnpm typecheck` and the focused registration smoke before touching UI.

### Task 3: Activate explicit bindings in adapter selection

**Files:**

- Modify: `src/adapters/declarative/adapter.ts`
- Modify: `src/adapters/index.ts`

**Step 1:** Add an optional `explicitOrigin` constructor setting. Make `match()` claim only that exact origin when set and prevent legacy-data claiming for the explicit override.

**Step 2:** Load the binding snapshot with enabled packs, create explicit adapters for the current origin, and order adapters as built-in, explicit binding, then ordinary static dynamic packs.

**Step 3:** Keep detect bindings persisted/authorized but leave DOM detect evaluation to P2-04.

**Step 4:** Run a temporary `tsx` smoke asserting built-in > explicit > static precedence and non-explicit behavior unchanged.

### Task 4: Build custom-origin management UI and styles

**Files:**

- Modify: `src/tabs/options/pages/SitePacksPage.tsx`
- Modify: `src/styles/settings.css`
- Modify: `src/locales/zh-CN/index.ts`
- Modify: `src/locales/zh-TW/index.ts`
- Modify: `src/locales/en/index.ts`
- Modify: `src/locales/ja/index.ts`
- Modify: `src/locales/ko/index.ts`
- Modify: `src/locales/it/index.ts`
- Modify: `src/locales/de/index.ts`
- Modify: `src/locales/es/index.ts`
- Modify: `src/locales/fr/index.ts`
- Modify: `src/locales/pt/index.ts`
- Modify: `src/locales/ru/index.ts`

**Step 1:** Load/watch `sitepacks/origin-bindings`, add form state, and derive installed pack/detect options plus binding status from `runtimeStatus.originReferences`, `missingPermissionOrigins`, and `bindingIssues`.

**Step 2:** Add add/update flow with strict canonicalization, extension authorization before persistence, userscript unsupported-save behavior, immediate reconciliation, and rollback to the previous binding on failure.

**Step 3:** Add remove flow with the same rollback discipline, refresh installed/runtime/binding state, and preserve existing permission-review behavior for static and binding-derived references.

**Step 4:** Render the custom-origin card between installed packs and registry. Reuse `Input`, `SelectDropdown`, `Button`, existing feedback and focus conventions.

**Step 5:** Add only the required `settings-pack-binding-*` styles, including focus, disabled, responsive, and reduced-motion-compatible states; keep `--gh-*` fallbacks and the current style injection chain.

**Step 6:** Add every new key to all 11 locale files and run a locale-key parity check.

### Task 5: Verify the complete workflow

**Files:**

- Create temporarily, then delete: `.tmp-site-pack-custom-origins-smoke.ts`

**Step 1:** Exercise extension authorization success/denial, explicit and detect validation, permission ownership cleanup after remove, update rollback, userscript unsupported save, and explicit adapter precedence.

**Step 2:** Run:

```powershell
pnpm exec tsx .tmp-site-pack-custom-origins-smoke.ts
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

Expected: the smoke and all checks exit successfully; existing lint warnings may remain but no new errors are introduced.

**Step 3:** If a browser runtime is available, perform a minimal Options-page smoke for add, update, remove, denied permission, and no-detect-pack disabled state. Otherwise report that limitation explicitly.

### Task 6: Review, commit, and push

**Files:** All files above.

**Step 1:** Review `git status` and `git diff`; verify no generated files or unrelated `.gitignore` content is staged, no second data source was introduced, and explicit/detect behavior is clearly separated.

**Step 2:** Commit and push:

```powershell
git add docs/plans/2026-07-29-site-pack-custom-origins-design.md docs/plans/2026-07-29-site-pack-custom-origins.md docs/developer/site-adapter-pluginization-tasks.csv src
git commit -m "feat(options): manage custom site pack origins"
git push origin feat/site-adapter-pluginization
```

Expected: the feature commit is on the remote branch and the user's `.gitignore` edit remains unstaged.
