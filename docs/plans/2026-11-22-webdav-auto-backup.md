# WebDAV Automatic Backup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add opt-in single-direction scheduled WebDAV snapshots, excluding reading history, with manual restore and seven automatic backups per device.

**Architecture:** Keep the existing backup format and manual full backups. A small shared backup service persists the next attempt before upload, serializes backup/restore operations, and prunes only this device's automatic files after a successful upload. Extension scheduling lives in background alarms; userscript scheduling uses a shared live-tab lock. No change detection, hashing, incremental protocol, remote polling, or data merge.

**Tech Stack:** TypeScript, React, Zustand, Chrome alarms, GM APIs, Vitest, existing CSS components.

---

### Task 1: Snapshot and service regression tests

- Create `tests/webdav-backup.test.ts` for default-off scheduling, 1/6/24 hour normalization, restart deadlines, failed-attempt throttling, concurrent operation rejection, automatic history exclusion, manual history inclusion, restore preservation and retention isolation.
- Extend `src/core/backup-codec.ts` with an explicit `excludeKeys` option; keep existing callers unchanged.
- Run `pnpm exec vitest run tests/webdav-backup.test.ts` and observe missing behavior before implementation.

### Task 2: Shared backup execution

- Add leaf settings/result types in `src/types/webdav.ts`.
- Add `src/core/webdav-backup.ts`: read persisted settings directly, preserve unrelated settings when writing status, persist device identity/deadlines outside backup data, run one backup/restore operation, retain seven files only after PUT succeeds.
- Refactor `src/core/webdav-sync.ts` to accept explicit runtime dependencies, share transport through platform interfaces, and remove unused interval code.
- Keep existing manual timestamped backups and backup schema version compatible.

### Task 3: Platform scheduling and transport

- Add WebDAV transport/action interfaces to `src/platform/types.ts` and implementations under `src/platform/extension/` and `src/platform/userscript/`.
- Add a typed background action message in `src/utils/messaging.ts`.
- Wire `src/background.ts` to one-shot alarms and fresh persisted settings; initialize and reconcile existing deadlines without extra startup uploads.
- Wire `src/platform/userscript/entry.tsx` to live-tab scheduling; use GM tab locking and shared persisted deadlines to avoid one timer uploading per tab. Update GM grants in `vite.userscript.config.ts`.
- Add focused transport/scheduler tests, including timeouts, permissions and disabled behavior.

### Task 4: Options and translations

- Reuse ToggleRow and SelectDropdown in `src/tabs/options/pages/BackupPage.tsx` for automatic backup and interval. Apply only after save, request WebDAV host permission when enabling, show failure/running state, explain excluded history, retention and manual restore.
- Preserve unsaved connection fields when only backup status changes.
- Update `src/constants/default-settings.ts`, `docs/developer/settings-schema.json`, search labels and all 11 application locale files.
- Review in light/dark themes and exercise enable/save/disable/manual backup/restore with local mocked WebDAV.

### Task 5: Validation and delivery

- Run focused Vitest tests, `pnpm format:check`, `pnpm lint:check`, `pnpm typecheck`, `pnpm build`, `pnpm build:firefox`, `pnpm build:userscript`.
- Run Impeccable's changed-UI detector; inspect the rendered Options flow and browser errors.
- Add one feature entry to both changelogs under Unreleased; confirm #246 and use the actual PR number only after creation.
- Review `git status`/`git diff`, commit as `feat(webdav): add scheduled automatic backups`, push the branch and open a Draft PR targeting main with test evidence and limitations.

### Validation record

- 26 focused Vitest tests passed, including a real local HTTP WebDAV backup/restore round trip, GM cross-tab contention, restart/failure deadlines and retention with tied timestamps.
- Formatting, TypeScript and Chrome/Firefox/userscript production builds passed; full ESLint completed with zero errors and existing warnings, and focused changed-feature lint had no warnings.
- Disposable Chromium profile loaded the built extension: default-off and saved 24-hour schedule, no upload on enable, browser-restart deadline preservation, alarm-triggered upload, seven own backups retained, unrelated files untouched, full manual backup, manual restore preserving local history/config, unsaved field preservation, interval save, keyboard toggle and disabling/alarm removal were exercised.
- Light/dark and 520px layouts were rendered and inspected; page console had no warnings or errors. Screenshots are local ignored artifacts under `output/playwright/`.
- The UI detector reported only an unchanged existing 16px remote-backup heading advisory.
- Userscript coordination/transport were tested with GM API doubles; no real Tampermonkey/Violentmonkey browser installation was used.
