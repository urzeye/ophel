# Site Adapter Pack Save, Export, and Contribution Implementation Plan

> **For Codex:** Implement task by task, verify each boundary before continuing, and preserve the user's unrelated `.gitignore` changes.

**Goal:** Turn a completed site-adapter wizard draft into a validated local SitePack, downloadable registry JSON, and a prefilled GitHub contribution flow.

**Architecture:** Extend the pure wizard core with manifest/default/serialization helpers, then keep installation and browser actions in the existing React completion section. Reuse `PackManager`, platform SitePack registration, the exporter utility, and `platform.openTab()`.

**Tech Stack:** TypeScript 5.3, React 18, native DOM/Clipboard APIs, existing declarative SitePack validator and manager, platform abstraction, Shadow DOM CSS, Vite, and Chromium browser automation.

---

### Task 1: Build and validate a complete SitePack manifest

**Files:**

- Modify: `src/core/site-adapter-wizard.ts`

**Step 1: Define publish metadata and result types**

Add editable name, ID, and version metadata plus discriminated build failures for incomplete drafts, unsupported origins, and manifest validation errors.

**Step 2: Generate safe defaults**

Derive a non-private site name from application/site metadata or hostname, generate a stable valid ID from the hostname, default version to 1, and use the running app version as `minAppVersion`.

**Step 3: Construct the manifest**

Require all mandatory wizard steps to remain valid, generate one exact HTTPS origin match, merge the validated config preview, and intentionally omit incomplete conversation-list data.

**Step 4: Validate and serialize once**

Run `validateSitePackManifest()`, return its validated value, serialize with stable two-space JSON plus a trailing newline, and generate `<id>.json`.

**Step 5: Build the GitHub contribution URL**

Create a prefilled `urzeye/ophel/new/main/registry/sites` URL containing the filename, JSON content, and a concise commit proposal message.

### Task 2: Add publish actions to the wizard completion view

**Files:**

- Modify: `src/components/SiteAdapterWizard.tsx`

**Step 1: Initialize and reset metadata**

Create metadata defaults when the wizard first renders, keep user edits through close/resume, and regenerate them only on explicit start-over.

**Step 2: Render editable metadata and validation**

Replace the P3-03 “save later” placeholder with name, ID, version, current-origin, and minimum-version controls. Disable actions while the current draft/metadata cannot produce a valid manifest.

**Step 3: Save through the official runtime path**

Call `PackManager.installLocal()`, request/verify origins with `platform.sitePacks.ensureOrigins()`, reconcile registrations, roll back to disabled on activation-preparation failure, and show a truthful reload-required success state.

**Step 4: Download the exact JSON**

Use `downloadFile()` and report success only when it returns true.

**Step 5: Copy then open GitHub**

Await clipboard success, then call `platform.openTab()` with the prefilled contribution URL. Never open GitHub after a copy failure.

**Step 6: Map expected errors**

Give actionable messages for invalid metadata, HTTPS requirements, version reuse, source/match conflicts, permission denial, download failure, and clipboard failure without swallowing unexpected exceptions.

### Task 3: Style the publish workspace

**Files:**

- Modify: `src/style.css`

**Step 1: Add metadata form layout**

Use the existing wizard card/input/button language, compact labels, read-only facts, and responsive rows without introducing inline visual rules.

**Step 2: Add action and feedback states**

Cover primary/secondary actions, busy/disabled states, success/warning/error banners, reload emphasis, focus-visible, and narrow-screen stacking.

**Step 3: Preserve theme and injection behavior**

Use existing `--gh-*` variables and keep all styles in `src/style.css`, which is already injected through both extension and userscript Shadow DOM entry points.

### Task 4: Localize the publish flow

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

**Step 1: Add metadata and action labels**

Translate name, ID, version, origin, minimum app version, save, download, contribution, reload, and busy labels.

**Step 2: Add validation and operation feedback**

Translate incomplete/invalid metadata, HTTPS-only, save/download/copy/permission/conflict errors, saved/reload-required, downloaded, and copied/opened states.

**Step 3: Verify parity**

Run `node scripts/compare_locales.js` and require no missing or extra keys across all eleven application locales.

### Task 5: Verify runtime and registry compatibility

**Files:**

- Create temporarily: dedicated P3-04 browser fixture files/output
- Create temporarily: dedicated registry validation root
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Exercise the pure output boundary**

Verify generated defaults, exact HTTPS matches, invalid HTTP rejection, deterministic JSON, valid filename, and GitHub URL parameters.

**Step 2: Run the Chromium completion flow**

Complete the real seven-step wizard, edit metadata, confirm invalid states block actions, save through a controlled platform/storage fixture, verify the reload prompt, download JSON, verify clipboard failure does not open GitHub, verify success opens the expected URL, check light/dark and 390 px layouts, and require zero console/page errors.

**Step 3: Run the real registry validator**

Place the exact representative generated manifest into an isolated temporary `registry/sites/` tree and run:

```powershell
pnpm registry:validate -- --registry-root <temporary-registry-root>
```

Require JSON Schema and runtime validation to pass without editing the generated file.

**Step 4: Remove only dedicated temporary artifacts**

Preserve the user's existing `output/`, `.playwright-cli`, `test-results/`, and `.gitignore` changes.

**Step 5: Update task status**

Mark P3-04 complete only after local install preparation, JSON export, copy gating, GitHub prefill, and registry validation all pass.

**Step 6: Run repository checks**

```powershell
node scripts/compare_locales.js
pnpm format:check
pnpm exec eslint src/core/site-adapter-wizard.ts src/components/SiteAdapterWizard.tsx src/components/App.tsx
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

**Step 7: Review and publish the isolated closure**

Check `git status` and `git diff`, exclude `.gitignore` and generated artifacts, then commit and push with:

```powershell
git commit -m "feat(wizard): publish local site packs"
git push origin feat/site-adapter-pluginization
```
