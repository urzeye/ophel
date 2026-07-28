# SitePack Manager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a cross-platform settings page that manages installed SitePacks, browses the cached registry, and safely imports local JSON manifests.

**Architecture:** Keep `PackManager` and remote registry storage as the only persistence sources. A small pure view-model module merges installed packs with registry cache state, while one shared React page owns transient loading, feedback, file-selection, and confirmation state for both settings surfaces.

**Tech Stack:** TypeScript 5.3, React 18, PackManager, platform remote-config abstraction, native file APIs, shared settings CSS, and the existing 11-language i18n dictionaries.

---

### Task 1: Add the pure SitePack management view model

**Files:**

- Create: `src/tabs/options/site-pack-manager-view.ts`
- Test temporarily: `.tmp-site-pack-manager-smoke.ts`

**Step 1: Define registry row derivation**

Create a pure `buildRegistrySitePackViews(remoteState, installedPacks)` helper. It must:

- preserve every registry index entry;
- use the cached manifest for name, description, and installable version;
- classify entries as `available`, `disabled`, or `incompatible`;
- associate an installed pack with the same manifest ID;
- sort by display name, then ID.

**Step 2: Define local import parsing**

Create `parseSitePackImport(text, byteSize)` that rejects files over `SITE_PACK_MAX_BYTES`, maps JSON parse errors to path `$`, and returns the exact errors from `validateSitePackManifest()`.

**Step 3: Write and run the failing smoke**

Use `apply_patch` to add `.tmp-site-pack-manager-smoke.ts` with assertions for available/disabled/incompatible catalog rows, installed association, oversized JSON, malformed JSON, and a schema error path.

Run:

```powershell
pnpm exec tsx .tmp-site-pack-manager-smoke.ts
```

Expected before implementation: import/module failure. Expected after implementation: `site pack manager view smoke passed`.

**Step 4: Delete the temporary smoke**

Delete `.tmp-site-pack-manager-smoke.ts` with `apply_patch` after it passes.

### Task 2: Build the shared management page

**Files:**

- Create: `src/tabs/options/pages/SitePacksPage.tsx`
- Modify: `src/tabs/options/pages/index.ts`
- Modify: `src/components/ui/Switch.tsx`

**Step 1: Load installed and registry state independently**

Instantiate `PackManager` once with `createRuntimePackManager(platform.storage)`. Load `getSnapshot()` and `platform.remoteConfig.getState()` with independent error state so the installed list remains usable when registry state fails.

**Step 2: Implement installed-pack actions**

Render version, source, registry status, accessible enable switch, check-update action for registry packs, and uninstall action. Use `setEnabled()`, remote-config refresh plus `syncRegistryPacks()`, and `uninstall()`; reload the view after every action.

**Step 3: Implement registry browsing**

Render cached registry rows from the pure view model. Install or update available rows through `installFromRegistry()`. Disable emergency-disabled and incompatible rows with an explicit status.

**Step 4: Implement safe local import**

Use a hidden JSON file input. Run `parseSitePackImport()` before opening a themed in-tree risk confirmation. On confirmation, call `installLocal()` and expose field-path validation errors or PackManager errors without swallowing them.

**Step 5: Implement confirmations and focus behavior**

Use one local confirmation component for import and uninstall. It must render inside the current tree, use `role="alertdialog"`, focus its primary action, restore focus on close, block duplicate submission, and close on Escape only while idle.

### Task 3: Wire navigation and documentation

**Files:**

- Modify: `src/constants/ui.ts`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/tabs/options.tsx`
- Modify: `docs/developer/options-page-ui.md`

**Step 1: Add the navigation ID and entry**

Add `NAV_IDS.SITE_PACKS = "sitePacks"`. Insert the new navigation item after Site Settings in both settings surfaces and use the existing `JSONFileIcon`.

**Step 2: Render the shared page**

Add a `SitePacksPage` switch case in both settings surfaces. Keep platform filtering unchanged because PackManager and remote-config APIs already have extension/userscript implementations.

**Step 3: Update the settings UI reference**

Document the new navigation item, shared page responsibility, and unchanged storage/Shadow DOM paths in `docs/developer/options-page-ui.md`.

### Task 4: Add theme-compatible states and interaction styling

**Files:**

- Modify: `src/styles/settings.css`

**Step 1: Style the three sections and rows**

Add scoped `settings-pack-*` rules for section headers, list rows, metadata, source/status badges, action groups, validation details, empty states, and loading skeletons.

**Step 2: Style feedback and confirmations**

Use existing `--gh-*` variables for neutral/success/error surfaces and the dialog overlay. Include hover, active, focus-visible, disabled, narrow-layout, and reduced-motion rules.

**Step 3: Confirm both injection paths**

Verify `src/contents/ui-entry.tsx` still injects `settings.css` and `src/tabs/options.css` still imports it; do not add a second stylesheet.

### Task 5: Synchronize copy and task tracking

**Files:**

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
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Add all management-page copy in one locale batch**

Add navigation, section descriptions, source/status labels, empty/error states, action labels, risk/uninstall confirmations, success feedback, and activation guidance to all 11 application dictionaries.

**Step 2: Check locale parity**

Run:

```powershell
node scripts/compare_locales.js
```

Expected: every missing-key list is empty.

**Step 3: Mark P1-10 in progress**

Change only the P1-10 status from `未开始` to `进行中`; P1-11, P1-12, P1-16, and P1-17 remain separate work.

### Task 6: Verify, review, commit, and push

**Files:**

- Verify: all files above

**Step 1: Run focused smoke and source guards**

Exercise a memory-backed `PackManager` for local install, enable/disable, uninstall, registry install, and field-level invalid import reporting. Confirm both navigation surfaces render `SitePacksPage` and no temporary file remains.

**Step 2: Run repository checks**

```powershell
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm registry:validate
pnpm registry:build
pnpm build
pnpm build:userscript
git diff --check
```

Expected: zero errors; existing lint warnings may remain unchanged.

**Step 3: Review UI and data boundaries**

Confirm no Zustand store or duplicate storage key was introduced, local import is validated before confirmation and again by PackManager, registry failures do not hide installed packs, all buttons have complete states, all 11 locales match, and `settings.css` reaches both Shadow DOM and Options.

**Step 4: Commit only P1-10 and push**

Explicitly stage P1-10 files while excluding the user's `.gitignore` modification, then run:

```powershell
git commit -m "feat(settings): manage site packs"
git push origin feat/site-adapter-pluginization
```
