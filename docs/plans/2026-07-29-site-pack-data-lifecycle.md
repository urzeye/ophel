# SitePack User Data Lifecycle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make local and WebDAV backups preserve SitePack user data across extension and userscript builds, guide restored extension users through host reauthorization, and remove all dynamic SitePack runtime state before clearing storage.

**Architecture:** Add one descriptor-driven backup codec over `platform.storage`, with schema version 4 and compatibility normalization for versions 1 through 3. Extend the extension registration manager with runtime status and serialized clear-all cleanup, then let SitePacksPage render permission recovery directly from reconciled browser state.

**Tech Stack:** TypeScript 5.3, React 18, Zustand persist envelopes, Chrome MV3 permissions/scripting APIs, Plasmo, Vite userscript storage polyfills, WebDAV, and existing application i18n/CSS.

---

### Task 1: Centralize SitePack storage identities

**Files:**

- Create: `src/core/site-pack-storage-constants.ts`
- Modify: `src/core/pack-manager.ts`
- Modify: `src/core/remote-config-storage-constants.ts`
- Modify: `src/platform/extension/site-pack-registration.ts`

**Steps:**

1. Define one source for `sitepacks/installed`, `sitepacks/origin-bindings`, `sitepacks/remote-state`, `sitepacks/extension-runtime`, and `siteconfig/overrides`.
2. Preserve existing public exports for installed-pack and remote-config constants so current consumers do not change unnecessarily.
3. Keep schema-version constants in their owning modules; only storage key identity moves.

### Task 2: Implement the shared backup codec

**Files:**

- Create: `src/core/backup-codec.ts`
- Modify: `src/constants/defaults.ts`
- Modify: `src/utils/backup-validator.ts`

**Steps:**

1. Add backup schema version 4, explicit `full`/`prompts`/`settings` types, the full user-data allowlist, and the runtime/cache exclusion list.
2. Add canonical hydration for single-property Zustand stores, multi-property Zustand stores, flat bookmark JSON, and native-object storage.
3. Add compatibility normalization for backup versions 1 through 3, including embedded persist envelopes and stringified native SitePack objects.
4. Add inverse dehydration that writes Zustand strings, bookmark JSON strings, and native SitePack objects in their required shapes.
5. Read and write explicit keys through `PlatformStorage`, return restored/ignored keys, and warn when historical snapshots contain excluded unknown keys.
6. Extend `ZUSTAND_KEYS` to include `claudeSessionKeys` and keep multi-property definitions accurate.
7. Route the existing backup validator through the codec's compatibility-aware validation without adding new user-facing validation copy.

### Task 3: Replace duplicate local and WebDAV serialization

**Files:**

- Modify: `src/tabs/options/pages/BackupPage.tsx`
- Modify: `src/core/webdav-sync.ts`
- Modify: `src/platform/userscript/entry.tsx`

**Steps:**

1. Replace BackupPage's three export branches with `createBackupDocument()` and replace manual import rehydration with `restoreBackupDocument()`.
2. Make restore notifications explicit: set the restore flag, require a successful background response on extension builds, and surface missing SitePack permissions in the success feedback.
3. Replace WebDAV upload/download hydration with the same codec and emit a version-4 full backup.
4. Overlay the current WebDAV configuration and final sync status into normalized restored settings before writing; do not persist stale in-memory settings after restore.
5. Expand the userscript known/clearable key lists from the shared backup keys so installed packs, bookmarks, usage data, future bindings, and overrides participate consistently.

### Task 4: Add registration status and destructive cleanup

**Files:**

- Modify: `src/platform/extension/site-pack-registration.ts`
- Modify: `src/platform/types.ts`
- Modify: `src/platform/extension/index.ts`
- Modify: `src/platform/userscript/index.ts`
- Modify: `src/utils/messaging.ts`
- Modify: `src/background.ts`

**Steps:**

1. Change platform reconciliation to return active and missing-permission origins on both platforms.
2. Add a serialized registration-manager `clearAll()` operation that unregisters prefixed scripts, revokes still-granted managed origins, and removes runtime state in that order.
3. Type clear/restore background responses, including missing SitePack permissions after restore.
4. For clear-all, capture target tabs first, run SitePack cleanup, then broadcast the in-memory reset; BackupPage may clear storage only after this response succeeds.
5. For restore, reconcile SitePack registrations before broadcasting reload and return the derived missing-origin list.

### Task 5: Guide reauthorization in SitePacksPage

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

**Steps:**

1. Load reconciled runtime status with installed packs and refresh it after pack mutations or storage changes.
2. Map missing origin patterns back to effectively enabled packs using the declarative match-pattern helper.
3. Render a themed, accessible permission-review notice with one existing permission-popup action per affected pack.
4. Reuse existing denial behavior and generic permission-granted feedback; do not add a persistent pending marker.
5. Add the permission-review title and description in all eleven locales.

### Task 6: Complete in-memory clear behavior and task tracking

**Files:**

- Modify: `src/tabs/options/pages/BackupPage.tsx`
- Modify: `src/contents/main.ts`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Steps:**

1. Reset bookmark and Claude session-key stores alongside the existing settings, prompt, folder, tag, conversation, and reading-history stores.
2. Keep the usage manager destruction path and rely on storage clearing for its persisted event history.
3. Change only P1-16 from `未开始` to `进行中`; cross-browser restore acceptance remains a manual Phase-1 verification item.

### Task 7: Verify, review, commit, and push

**Files:**

- Create temporarily, then delete: `.tmp-site-pack-data-lifecycle-smoke.ts`
- Verify all files above and both P1-16 plan documents.

**Steps:**

1. Run a temporary `tsx` smoke for v2/v3/v4 backup compatibility, partial-type filtering, native-object storage, unknown-key exclusion, userscript storage behavior, runtime status, and clear-all cleanup.
2. Remove the temporary smoke with `apply_patch` after all assertions pass.
3. Verify locale parity with an inline read-only key comparison.
4. Run:

```powershell
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

5. Review `git status` and `git diff`; leave the user's `.gitignore` modification unstaged and exclude generated files.
6. Commit only P1-16 with `feat(core): close site pack data lifecycle` and push `feat/site-adapter-pluginization`.
