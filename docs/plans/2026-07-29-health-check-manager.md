# HealthCheckManager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect repeatedly broken adapter selectors, explain whether a SitePack update is available, and recover the panel warning after compatible configuration updates.

**Architecture:** Add a storage-backed observable `HealthCheckManager` with a delayed scan and bounded late-DOM recovery. Centralize active built-in/SitePack configuration refresh in one core runtime helper, expose safe manifest replacement on `DeclarativeAdapter`, and let a React hook own the manager lifecycle. Render one preserve-mode panel notice from the manager snapshot and open a prefilled issue through the existing platform abstraction.

**Tech Stack:** TypeScript 5.3, React 18 `useSyncExternalStore`, platform storage watchers, existing RemoteConfigManager/PackManager, DOM `MutationObserver`, Plasmo Shadow DOM CSS injection, and temporary `tsx` behavior smokes.

---

### Task 1: Document and track selector health behavior

**Files:**

- Create: `docs/plans/2026-07-29-health-check-manager-design.md`
- Create: `docs/plans/2026-07-29-health-check-manager.md`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv:40`

**Steps:**

1. Record alternatives, selector semantics, durable failure counting, update classification, hot refresh, issue privacy, and UI/theme constraints.
2. Record exact implementation and verification files in this plan.
3. Change only P2-08 from `未开始` to `进行中`.
4. Run `git diff --check` and confirm the user-owned `.gitignore` edit remains unstaged.

### Task 2: Centralize active adapter configuration refresh

**Files:**

- Create: `src/core/site-adapter-config-runtime.ts`
- Modify: `src/adapters/declarative/adapter.ts`
- Modify: `src/adapters/index.ts`

**Steps:**

1. Let `DeclarativeAdapter` expose cloned package metadata and replace only a same-id,
   non-rollback manifest while rebuilding regex/capability state and clearing cached editor state.
2. Pass the installed source through every static, explicit, and detected adapter construction path.
3. Move cached built-in patch resolution/application into one runtime helper used by both adapter
   registry startup and health refresh.
4. Resolve structured metadata for built-ins and SitePacks, including active/config versions,
   source, compatible cached registry version, update availability, and report signature.
5. Run `pnpm typecheck` before adding the health state machine.

### Task 3: Implement the storage-backed HealthCheckManager

**Files:**

- Create: `src/core/health-check-manager.ts`
- Reference: `src/core/site-pack-storage-constants.ts`
- Reference: `src/utils/dom-toolkit.ts`
- Reference: `src/utils/messaging.ts`

**Steps:**

1. Define immutable snapshots, selector failure groups, warning reasons, update results, and the
   schema-versioned `sitepacks/health` state.
2. Implement strict storage parsing and the per-load/per-signature consecutive-failure reducer.
3. Implement new-conversation exemption, configured-group scans, share-page textarea exemption,
   Shadow DOM-aware queries, and a cancellable four-second mutation recovery window.
4. Schedule the first check after DOM readiness plus 8 seconds; reset the schedule on the existing
   page-URL event and cancel all timers/observers on destroy.
5. Watch remote and installed pack storage, debounce refreshes, hot-apply active configuration, and
   recheck without incrementing the same load twice.
6. Implement manual remote update checking and a privacy-limited prefilled issue URL builder.

### Task 4: Add the React lifecycle and panel warning

**Files:**

- Create: `src/hooks/useAdapterHealthCheck.ts`
- Create: `src/components/SiteAdapterHealthNotice.tsx`
- Modify: `src/components/App.tsx`
- Modify: `src/components/MainPanel.tsx`
- Modify: `src/style.css`

**Steps:**

1. Own one manager instance per active adapter, subscribe with `useSyncExternalStore`, start it on
   mount, and destroy it on unmount.
2. Pass only the immutable snapshot and explicit update/report actions into `MainPanel`.
3. Render the warning above tabs with reason-specific copy, localized selector group labels,
   update/report buttons, inline update errors, and success/still-failing toast feedback.
4. Hide the update action for local or unknown-provenance packages.
5. Use existing theme variables and `src/style.css`; add hover, active, focus-visible, disabled,
   error, narrow-panel, and reduced-motion states without a parallel injection path.

### Task 5: Localize all user-visible health text

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

**Steps:**

1. Add title, three reason descriptions, failed-group label/names, actions, recovered and
   still-failing feedback in every application locale.
2. Reuse existing remote-config checking/error strings where their meaning is identical.
3. Run `node scripts/compare_locales.js` and require zero missing keys.

### Task 6: Verify, review, commit, and push

**Files:**

- Create temporarily, then delete: `.tmp-health-check-manager-smoke.ts`

**Steps:**

1. Exercise two-load threshold, same-load deduplication, success reset, new-page exemption, slow DOM
   recovery, registry/latest/local reason derivation, manual and watched update recovery, and issue
   URL prefill assertions.
2. Run:

```powershell
pnpm exec tsx .tmp-health-check-manager-smoke.ts
node scripts/compare_locales.js
pnpm format:check
pnpm exec eslint . --ignore-pattern "output/**"
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

3. Review for one health state source, no duplicate patch/pack resolution, no local-pack update
   misdirection, no user content in reports, no generated-file edits, and preserved `.gitignore`.
4. Commit and push with `feat(core): add adapter health checks`.
