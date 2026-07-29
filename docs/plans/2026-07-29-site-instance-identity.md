# Site Instance Identity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Partition SitePack settings, themes, reading history, and conversations by runtime origin while preserving stable pack identity and migrating existing built-in conversation data without loss.

**Architecture:** Add one pure site-identity module and expose `SiteAdapter.getSiteInstanceKey()` as the runtime source of data ownership. Keep `siteId` for adapter behavior, pass both identities through bootstrap, and migrate the conversations Zustand store to versioned composite keys while ConversationManager retains raw conversation IDs at its public boundary.

**Tech Stack:** TypeScript 5.3, React 18, Zustand persist migrations, Plasmo content scripts, Vite userscript build, and existing settings selectors/stores.

---

### Task 1: Add the pure identity primitives

**Files:**

- Create: `src/utils/site-identity.ts`
- Modify: `src/adapters/base.ts`
- Modify: `src/utils/storage.ts`

**Steps:**

1. Add helpers for canonical HTTP(S) origins, dynamic instance keys, versioned scoped keys, and legacy dynamic-record resolution.
2. Add `SiteAdapter.getSiteInstanceKey()` with built-in identity preservation and explicit dynamic-origin validation.
3. Re-export the helpers through the existing storage/utils surface used by core modules.

### Task 2: Split behavior identity from settings identity

**Files:**

- Modify: `src/core/modules-init.ts`
- Modify: `src/contents/main.ts`
- Modify: `src/platform/userscript/entry.tsx`
- Modify: `src/utils/settings-selectors.ts`
- Modify: `src/stores/settings-store.ts`

**Steps:**

1. Add `siteInstanceKey` to `ModulesContext` while keeping `siteId` for built-in branches.
2. Use the instance key for theme, page width, user-query width, zen, clean, panel avoidance, and model-lock reads.
3. Give settings persistence an explicit schema version and preserve version-0 settings through normalization.
4. Atomically move legacy pack-level settings only when the adapter proves that its current origin is the sole exact match; never add a shared pack-level fallback.

### Task 3: Update content-panel settings consumers

**Files:**

- Modify: `src/components/App.tsx`
- Modify: `src/components/MainPanel.tsx`
- Modify: `src/components/QuickButtons.tsx`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/core/layout-manager.ts`
- Modify: `src/hooks/useShortcuts.ts`

**Steps:**

1. Keep feature/platform behavior keyed by `siteId`.
2. Use `siteInstanceKey` for theme, layout, model-lock, and current-site settings writes.
3. Pass the instance key only to settings pages that edit per-site persisted data; preserve the existing information architecture and ThemeManager/Shadow DOM injection path.

### Task 4: Version reading-history keys

**Files:**

- Modify: `src/core/reading-history.ts`
- Modify: `src/stores/reading-history-store.ts`

**Steps:**

1. Generate reading-history keys from `siteInstanceKey` and session ID.
2. Add a store action that atomically moves a legacy entry to the new key.
3. During restore, claim the old `siteId:sessionId` entry only if the instance-scoped key is absent.
4. Add persistence version 1 while preserving existing history records for lazy migration.

### Task 5: Migrate conversations to composite keys

**Files:**

- Modify: `src/core/conversation/types.ts`
- Modify: `src/stores/conversations-store.ts`
- Modify: `src/core/conversation/manager.ts`

**Steps:**

1. Add `siteInstanceKey` to new conversation records.
2. Implement and export a pure version-0 migration that rekeys resolvable records and preserves unresolved records explicitly.
3. Set conversations persistence to version 1 with the migration.
4. Make ConversationManager expose only the current instance under raw IDs and translate every mutation to the composite storage key.
5. Keep built-in Gemini migration, folder/tag operations, UI selection, navigation, and exports behaviorally unchanged.

### Task 6: Exercise migration and isolation

**Files:**

- Create temporarily, then delete: `.tmp-site-instance-smoke.ts`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Steps:**

1. Add a temporary `tsx` smoke covering identity helpers, settings fallback, conversation migration, equal raw IDs across two origins, reading-history lazy migration, and current-instance filtering.
2. Run the smoke and require all assertions to pass.
3. Remove the temporary file with `apply_patch`.
4. Change P1-15 from `未开始` to `进行中`; formal migration tests and two-origin browser acceptance remain pending on the repository test harness and P2 binding UI.

### Task 7: Verify, review, commit, and push

**Files:**

- Verify all files above plus the two P1-15 plan documents.

**Steps:**

1. Run `pnpm format:check`, `pnpm lint:check`, `pnpm typecheck`, `pnpm build`, `pnpm build:userscript`, and `git diff --check`.
2. Confirm built-in behavior branches still use `siteId`, all persisted per-site writes use `siteInstanceKey`, ThemeManager remains the only theme source, both platform bootstraps pass both identities, and no unresolved dynamic record is shared silently.
3. Review `git status` and `git diff`; leave the user's `.gitignore` modification unstaged.
4. Commit only this batch with `feat(core): isolate site pack instances` and push `feat/site-adapter-pluginization`.
