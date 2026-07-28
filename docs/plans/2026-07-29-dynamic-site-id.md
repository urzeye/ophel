# Dynamic Site ID Data Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let `pack:`-prefixed SitePack identities flow through settings, themes, platform filters, usage views, conversation attribution, reading history, and backup normalization without type narrowing, key loss, or built-in-only UI metadata.

**Architecture:** Keep `SITE_IDS` and built-in-specific branches authoritative for native adapters, while widening shared site-key records to arbitrary strings. Convert effective installed packs into `SupportedAiPlatform` metadata through PackManager, publish a bundle-local runtime platform catalog that AdapterRegistry primes during startup, and expose one React hook for content, popup, and Options consumers. Reuse the existing theme/default selectors and add favicon-to-initial icon fallback without changing layout or style injection.

**Tech Stack:** TypeScript 5.3, React 18, Zustand settings normalization, existing PackManager/AdapterRegistry, Plasmo popup/content/Options bundles, userscript platform storage, and existing theme variables/styles.

---

### Task 1: Generalize site identity and match metadata

**Files:**

- Modify: `src/constants/defaults.ts`
- Modify: `src/constants/index.ts`
- Modify: `src/adapters/declarative/match-pattern.ts`
- Modify: `src/adapters/declarative/adapter.ts`
- Modify: `src/core/pack-manager.ts`

**Step 1: Distinguish built-in IDs from general site IDs**

Keep `BuiltinSiteId` as the literal union derived from `SITE_IDS`, add `isBuiltinSiteId(value: string)`, and widen `SupportedAiPlatform.id` to `string`. Replace PackManager's duplicate built-in ID set check with the shared guard.

**Step 2: Share runtime URL matching**

Move the declarative adapter's validated match-pattern URL matcher into the existing pure `match-pattern.ts` module. Let both `DeclarativeAdapter.match()` and supported-platform metadata reuse it, while retaining the existing host-overlap function for conflict checks.

**Step 3: Map installed packs to platform metadata**

Export `getDynamicPlatforms(packs)` from the PackManager module. Preserve effective package installation order; use `pack:${manifest.id}` as the platform ID, the manifest name as its label, the first concrete match origin as its link, `${origin}/favicon.ico` as its optional icon source, and the first display-name character as the final fallback.

### Task 2: Add one runtime supported-platform catalog

**Files:**

- Create: `src/core/platform-catalog.ts`
- Create: `src/hooks/useSupportedAiPlatforms.ts`
- Modify: `src/adapters/index.ts`

**Step 1: Centralize static/dynamic merging**

Maintain one bundle-local dynamic platform snapshot beside immutable `SUPPORTED_AI_PLATFORMS`. Expose synchronous `getSupportedAiPlatforms()`, an AdapterRegistry priming function that accepts successfully constructed packs, and a cached async loader over platform storage for bundles that do not initialize AdapterRegistry.

**Step 2: Prime the catalog with registry startup**

When dynamic adapters load, retain the corresponding installed pack records and prime the catalog only with packages whose `DeclarativeAdapter` construction succeeded. On root load failure, explicitly prime an empty dynamic snapshot so consumers retain built-in platforms.

**Step 3: Expose a React hook**

Initialize from the current bundle snapshot, load once when necessary, and update the component after the shared catalog resolves. Keep load/validation failures explicit in the catalog logs while returning built-in platforms as the usable fallback.

### Task 3: Widen settings records and remove unsafe key assertions

**Files:**

- Modify: `src/types/settings.ts`
- Modify: `src/utils/settings-selectors.ts`
- Modify: `src/utils/settings-normalize.ts`
- Modify: `src/components/App.tsx`
- Modify: `src/tabs/options/pages/AppearancePage.tsx`
- Modify: `src/tabs/options/components/SidebarFooter.tsx`
- Modify: `src/tabs/options/pages/SiteSettingsPage.tsx`

**Step 1: Make theme sites a string-keyed record**

Define general `SiteId` as `string`, store theme sites as `Record<string, SiteThemeConfig>`, and preserve every existing key during normalization. Remove `keyof` casts and continue resolving absent site entries through `_default`.

**Step 2: Reuse settings selectors at consumption points**

Use `getSiteTheme`, width, zen, clean, and panel-avoidance selectors where components currently repeat direct indexing/default logic. Dynamic writes must create only the current `pack:` key and preserve all sibling records.

### Task 4: Merge dynamic platforms into user-facing consumers

**Files:**

- Create: `src/components/PlatformIcon.tsx`
- Delete: `src/components/prompts/PlatformIcon.tsx`
- Modify: `src/components/MainPanel.tsx`
- Modify: `src/components/PromptsTab.tsx`
- Modify: `src/components/prompts/PromptEditorDialog.tsx`
- Modify: `src/components/prompts/PromptPlatformSummary.tsx`
- Modify: `src/tabs/options/pages/FeaturesPage.tsx`
- Modify: `src/tabs/options/pages/AboutPage.tsx`
- Modify: `src/popup.tsx`

**Step 1: Share favicon and initial fallback rendering**

Resolve a built-in embedded icon first, then a dynamic favicon URL, and finally the platform's initial/legacy icon when image loading fails. Preserve the existing component dimensions/classes and do not add CSS or theme variables.

**Step 2: Replace static lists in mixed-platform views**

Use `useSupportedAiPlatforms()` for prompt filtering/editing/summaries, current-platform defaults, usage-history site choices, About counts/listing, popup current-tab detection, and popup quick links. Keep RemoteConfig patch management on the static built-in list because SitePacks cannot receive built-in patches.

### Task 5: Exercise dynamic keys and update tracking

**Files:**

- Create temporarily, then delete: `.tmp-dynamic-site-id-smoke.ts`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Run a focused pure/runtime smoke**

Create the temporary script with `apply_patch`, run it through `pnpm exec tsx`, and cover:

- built-in ID guard true/false behavior;
- SitePack-to-platform ID, URL, path matching, favicon, initial, and installation ordering;
- `pack:` theme/layout/model-lock writes and selector reads;
- normalization preserving dynamic keys through JSON backup/restore round trips;
- prompt platform matching with a `pack:` ID;
- conversation attribution and reading-history key formats retaining the full dynamic ID without colliding with a built-in ID.

Expected output: every assertion passes and the script prints the exercised branch count. Delete the temporary script with `apply_patch` after the smoke.

**Step 2: Keep P1-08 in progress**

Change P1-08 from `未开始` to `进行中`. This task closes general string-key flow and platform metadata; multi-origin `siteInstanceKey` migration remains P1-15 and dynamic content-script registration remains P1-17.

### Task 6: Verify, review, commit, and push

**Files:**

- Verify: all files listed above

**Step 1: Run repository checks**

Run:

```powershell
pnpm registry:validate
pnpm registry:build
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

Expected: all checks and both platform builds pass; Lint has zero errors and may retain existing warnings.

**Step 2: Review the identity boundary**

Confirm built-in-only branches still use `SITE_IDS`, dynamic configuration keys survive normalization/backup, platform consumers share one catalog, invalid packs cannot enter the catalog, no second theme source was introduced, no styles/i18n changed, and the user's `.gitignore` remains unstaged.

**Step 3: Commit and push the closure**

```powershell
git add src docs/developer/site-adapter-pluginization-tasks.csv docs/plans/2026-07-29-dynamic-site-id.md
git commit -m "feat(core): support dynamic site identities"
git push origin feat/site-adapter-pluginization
```
