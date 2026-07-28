# SitePack Metadata Localization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consume SitePack localized metadata consistently across adapters, platform catalogs, and the management UI, with live language refresh and the required fallback chain.

**Architecture:** Add one pure declarative-metadata resolver, pass the active language into pure view-model builders, and make the cached dynamic platform catalog rebuild from retained manifests after i18n changes. Keep manifests immutable and keep application UI copy in the existing eleven locale resources.

**Tech Stack:** TypeScript 5.3, React 18 hooks, the existing application/userscript i18n modules, declarative SitePack manifests, and the current platform catalog and options-page view model.

---

### Task 1: Add the shared metadata resolver

**Files:**

- Create: `src/adapters/declarative/localization.ts`

**Step 1: Normalize locale lookup keys**

Match locale keys case-insensitively and normalize `_` to `-` without modifying the source record.

**Step 2: Encode the fallback chain**

Resolve the active locale first, then the Portuguese alias when applicable, then `en`, and finally the base manifest field. Keep description optional.

### Task 2: Localize adapter and platform identities

**Files:**

- Modify: `src/adapters/declarative/adapter.ts`
- Modify: `src/core/pack-manager.ts`
- Modify: `src/core/platform-catalog.ts`
- Modify: `src/hooks/useSupportedAiPlatforms.ts`
- Modify: `src/utils/i18n.ts`

**Step 1: Resolve adapter and platform names**

Use the shared resolver in `DeclarativeAdapter.getName()` and `getDynamicPlatforms()`. Derive the platform initial from the same localized name.

**Step 2: Rebuild cached dynamic rows after language changes**

Retain the enabled pack list in the platform catalog, detect a changed active language, and rebuild only the derived supported-platform array.

**Step 3: Notify mounted platform consumers**

Expose the same i18n change subscription in extension and userscript builds, and update `useSupportedAiPlatforms()` when the active language changes.

### Task 3: Localize the SitePack management page

**Files:**

- Modify: `src/tabs/options/site-pack-manager-view.ts`
- Modify: `src/tabs/options/pages/SitePacksPage.tsx`

**Step 1: Build localized registry rows**

Accept the active language in the pure registry view builder, resolve cached manifest metadata, and sort by the resolved name.

**Step 2: Replace every installed-pack metadata consumer**

Use localized names and descriptions for rows, sorting, switches, operation feedback, import summaries, and uninstall confirmations. Include the language in memo dependencies.

### Task 4: Track and verify P1-12

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`
- Create temporarily, then delete: `.tmp-site-pack-localization-smoke.ts`

**Step 1: Mark P1-12 in progress**

Change the task status from `未开始` to `进行中` while real browser acceptance remains part of the broader SitePack delivery sequence.

**Step 2: Run a focused deterministic smoke**

Cover active-language hits, normalized locale keys, English and base fallbacks, an absent description, Portuguese aliases, localized registry sorting, dynamic platform names/icons, and adapter language refresh.

**Step 3: Verify locale parity**

Run `node scripts/compare_locales.js` and confirm all eleven application locale files contain the same keys.

### Task 5: Verify, review, commit, and push

**Files:**

- Verify: all files above

**Step 1: Run repository checks**

```powershell
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

**Step 2: Review boundaries**

Confirm no resolved strings are persisted, no fallback logic is duplicated, all direct SitePack metadata consumers are migrated, generated files are absent, and the user's `.gitignore` change remains unstaged.

**Step 3: Commit and push only P1-12 files**

```powershell
git commit -m "feat(i18n): localize site pack metadata"
git push origin feat/site-adapter-pluginization
```
