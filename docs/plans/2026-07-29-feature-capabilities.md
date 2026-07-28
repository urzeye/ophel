# Feature Capabilities and UI Gating Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a feature-capability contract beside the existing layout capability API, explicitly describe all 15 built-in adapters, expose declarative SitePack capabilities, and hide undeclared L2 functionality across the panel and site settings without changing built-in UI behavior.

**Architecture:** Define the capability vocabulary and the complete built-in matrix in one adapter module. `SiteAdapter.getFeatureCapabilities()` resolves built-in entries and defaults unknown adapters to an empty set, while `DeclarativeAdapter` returns a defensive copy of the manifest declaration. UI consumers enforce feature gating only for non-built-in adapters so existing built-in controls remain unchanged; `ConversationsTab` consumes the same matrix to replace its five-site hardcoded unsupported list.

**Tech Stack:** TypeScript 5.3, React 18, existing SiteAdapter/DeclarativeAdapter APIs, Plasmo Shadow DOM, shared settings CSS, existing i18n dictionaries, and pnpm repository checks.

---

### Task 1: Centralize the capability vocabulary and built-in matrix

**Files:**

- Create: `src/adapters/feature-capabilities.ts`
- Modify: `src/adapters/declarative/types.ts`
- Modify: `src/adapters/declarative/validate.ts`
- Modify: `src/adapters/ima-config.ts`
- Modify: `src/adapters/zai-config.ts`

**Step 1: Define the shared capability contract**

Move the `SitePackCapability` string union to the new adapter-level module, export the canonical ordered capability list, and re-export the type from `declarative/types.ts` so existing imports remain compatible.

**Step 2: Declare every built-in site explicitly**

Create a `satisfies Record<BuiltinSiteId, readonly SitePackCapability[]>` matrix with all 15 `SITE_IDS` keys written out. Preserve the five known conversation-management omissions (`chatglm`, `zai`, `qianwen`, `qwenai`, `ima`), the current clean-mode omissions (`grok`, `zai`), and the current model-lock omission (`deepseek`); do not derive sites from an “all capabilities” default.

**Step 3: Remove duplicate capability sources**

Build the declarative validator allowlist from the canonical ordered list. Make Ima and Z.ai built-in configs spread their entries from the shared built-in matrix so schema validation and runtime UI use the same source.

### Task 2: Expose the independent adapter API

**Files:**

- Modify: `src/adapters/base.ts`
- Modify: `src/adapters/declarative/adapter.ts`

**Step 1: Add the independent API to SiteAdapter**

Add `getFeatureCapabilities(): Set<SitePackCapability>` beside, not inside, the existing `getCapabilities(): AdapterCapabilities`. Resolve built-in IDs through the centralized matrix, return an empty set for unknown IDs, and add `hasFeatureCapability(capability)` as the common boolean helper.

**Step 2: Return manifest declarations defensively**

Capture the validated SitePack manifest capability list in `DeclarativeAdapter` construction and return a new `Set` from `getFeatureCapabilities()` so callers cannot mutate adapter state.

### Task 3: Gate panel entry points while preserving built-ins

**Files:**

- Modify: `src/components/MainPanel.tsx`
- Modify: `src/components/OutlineTab.tsx`
- Modify: `src/components/QuickButtons.tsx`
- Modify: `src/components/ConversationsTab.tsx`

**Step 1: Filter L2 panel tabs and header actions**

For non-built-in adapters only, require `prompt-insert` for Prompts, `conversation-list` for Conversations, and `outline` for Outline. Require `new-chat` for the new-tab action and `outline-user-queries` for the outline user-query toggle. Derive active-tab initialization, fallback, direct shortcut events, numeric tab switching, keyboard navigation, and tabpanel rendering from the filtered list so a hidden tab cannot remain active.

**Step 2: Filter L2 quick actions**

Hide the Zen quick button without `zen`; hide export/copy/segmented export without `export-basic`; hide move/tag without `conversation-list`; hide model lock without `model-lock`; and hide ghost-bookmark cleanup without `outline`. Keep generic scroll, theme, panel, search, and settings controls unchanged. Only auto-enable Clean Mode from Zen when `clean` is also declared.

**Step 3: Replace the conversation hardcode**

Delete `unsupportedSiteLabels` and derive the existing unsupported mask, sync guard, and display label from `hasFeatureCapability("conversation-list")` plus `adapter.getName()`. This keeps the five built-in unsupported states visually unchanged while using the centralized table.

### Task 4: Gate site settings and identify community packs

**Files:**

- Modify: `src/components/App.tsx`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/ModelLockSettingsContent.tsx`
- Modify: `src/tabs/options/pages/SiteSettingsPage.tsx`
- Modify: `src/styles/settings.css`

**Step 1: Pass the active adapter into shared settings UI**

Thread the already resolved adapter from `App` into `SettingsModal` and `SiteSettingsPage`. Leave the standalone Options page adapter-less so its current `_default` presentation remains unchanged.

**Step 2: Hide undeclared L2 settings**

For non-built-in adapters only, show page width when `width` is declared, show user-query width only when `width` is declared and the adapter exposes user-query selectors, show Zen/Clean cards for their matching capabilities, and show the model-lock tab only for `model-lock`. Keep the independent panel-avoidance allowlist and all built-in UI unchanged. Do not show built-in-specific tabs on community packs.

**Step 3: Support a dynamic model-lock row**

When a community pack declares `model-lock`, add a generic row keyed by its full `pack:` site ID and display name without duplicating an existing built-in row.

**Step 4: Add the L2 tier notice**

At the top of the site settings page, show a “Community adapter pack (core features)” badge, a concise explanation that only declared capabilities are shown, and an external explanation link. Add shared settings styles using existing `--gh-*` variables and confirm the file already reaches both the Plasmo Shadow DOM and standalone Options stylesheet.

### Task 5: Localize, track, and smoke-test the contract

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
- Create temporarily, then delete: `.tmp-feature-capabilities-smoke.ts`

**Step 1: Synchronize all application locales**

Add the community-pack badge and explanation keys to all 11 application locale dictionaries in one change. Reuse the existing `learnMore` key for the link.

**Step 2: Exercise the capability boundary**

Create the temporary smoke with `apply_patch`, run it through `pnpm exec tsx`, and assert:

- the canonical vocabulary has 13 unique entries;
- the built-in matrix has exactly the 15 `SITE_IDS` keys;
- all five legacy unsupported sites omit `conversation-list` and the other ten include it;
- Grok/Z.ai omit `clean`, DeepSeek omits `model-lock`, and representative supported sites retain them;
- returned built-in sets are defensive copies;
- unknown site IDs resolve to an empty set;
- source guards confirm `unsupportedSiteLabels` is gone and the two configured built-ins reuse the shared matrix.

Delete the temporary file with `apply_patch` after it passes.

**Step 3: Mark P1-09 in progress**

Change the task status from `未开始` to `进行中`; broader SitePack management and end-to-end browser QA remain later Phase 1 tasks.

### Task 6: Verify, review, commit, and push

**Files:**

- Verify: all files listed above

**Step 1: Run focused and repository checks**

Run:

```powershell
pnpm exec prettier --check <all changed TypeScript/TSX/CSS/locale/plan files>
pnpm lint:check
pnpm typecheck
pnpm registry:validate
pnpm registry:build
pnpm build
pnpm build:userscript
git diff --check
```

Expected: the smoke and all checks pass; Lint has zero errors and may retain the repository's existing warnings.

**Step 2: Review capability and UI boundaries**

Confirm there is one capability vocabulary, one built-in matrix, no reuse of layout `getCapabilities()`, no built-in UI gate outside `ConversationsTab`, no hidden L2 tab can remain active, all 11 locales are synchronized, settings CSS uses existing theme variables, and both Shadow DOM/Options injection paths remain intact.

**Step 3: Commit only the P1-09 closure and push**

Explicitly stage the changed P1-09 files and exclude the user's `.gitignore` modification, then run:

```powershell
git commit -m "feat(adapter): expose feature capabilities"
git push origin feat/site-adapter-pluginization
```
