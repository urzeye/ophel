# SitePack Dynamic Origin Registration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Authorize and dynamically register Ophel's extension content scripts for enabled SitePack origins, with startup reconciliation and clean disable/uninstall behavior.

**Architecture:** Keep PackManager platform-neutral and add an extension-only reconciliation manager driven by installed-pack storage. Discover ISOLATED assets from the runtime manifest and MAIN assets from Plasmo's current scripting registrations, then expose permission and synchronization operations through the existing platform abstraction.

**Tech Stack:** TypeScript 5.3, Chrome MV3 permissions/scripting/windows APIs, Plasmo runtime manifests, React 18, the existing platform storage abstraction, and application i18n resources.

---

### Task 1: Add origin and effective-state primitives

**Files:**

- Modify: `src/adapters/declarative/match-pattern.ts`
- Modify: `src/core/pack-manager.ts`

**Step 1: Add origin-pattern conversion**

Export a helper that converts a validated SitePack match such as `https://duck.ai/chat/*` into `https://duck.ai/*` while preserving a validated wildcard authority when present.

**Step 2: Export effective-enabled semantics**

Expose the existing PackManager predicate used by enabled snapshots so registration and adapter loading cannot drift.

### Task 2: Implement the extension registration manager

**Files:**

- Create: `src/platform/extension/site-pack-registration.ts`

**Step 1: Define strict runtime state**

Add a versioned extension storage record containing only SitePack-managed origin permissions. Reject malformed state explicitly.

**Step 2: Discover script templates**

Read `main` and `ui-entry` descriptors from runtime manifest content scripts. Read `monitor-entry` and `scroll-lock-main` from non-dynamic registered scripts. Normalize and group by world and runAt, preserving JS/CSS order.

**Step 3: Build deterministic origin registrations**

Collapse pack matches to unique origin patterns, hash each origin for stable IDs, and create `persistAcrossSessions: true` registered scripts under the Ophel prefix.

**Step 4: Reconcile scripts and permissions**

Serialize reconciliation, replace stale descriptors, retain only granted desired origins, remove obsolete registrations, and revoke only SitePack-managed origins that are no longer desired.

**Step 5: Ensure a pack's permissions**

Find the installed pack by ID, compute missing origins, call an injected visible permission prompt, verify the result, and record only newly granted missing origins.

### Task 3: Wire background lifecycle and messaging

**Files:**

- Modify: `src/background.ts`
- Modify: `src/utils/messaging.ts`

**Step 1: Instantiate the manager**

Wrap Chrome manifest, scripting, permissions, and extension storage APIs. Implement the visible popup callback and wait for its final permission result.

**Step 2: Add typed messages**

Add messages for ensuring an installed pack's origins and forcing registration reconciliation, with explicit granted/missing-origin responses.

**Step 3: Schedule reconciliation**

Run on background initialization, install, startup, installed-pack storage changes, permission removal, and `<all_urls>` addition. Specific SitePack grants reconcile through their typed authorization request so a disabled pack's new permission is not removed before the UI enables it. Keep failures visible through `console.error`.

**Step 4: Make target tab queries dynamic**

Replace `OPHEL_TARGET_URLS` with the union of runtime manifest content-script matches and current Ophel dynamic registration matches.

### Task 4: Extend the platform abstraction and permission page

**Files:**

- Modify: `src/platform/types.ts`
- Modify: `src/platform/index.ts`
- Modify: `src/platform/extension/index.ts`
- Modify: `src/platform/userscript/index.ts`
- Modify: `src/tabs/perm-request.tsx`

**Step 1: Add SitePack runtime operations**

Expose `ensureOrigins(packId)` and `reconcile()` through `Platform`. The extension delegates to background; userscript returns `unsupported` and performs no registration.

**Step 2: Support arbitrary SitePack origins in the popup**

Parse a dedicated SitePack mode, display the localized pack/origin description, and pass only the sanitized origin list to `chrome.permissions.request()`.

### Task 5: Integrate SitePack lifecycle UI

**Files:**

- Modify: `src/tabs/options/pages/SitePacksPage.tsx`

**Step 1: Gate enabling on permission**

When enabling an installed pack, ensure origins first, then enable and reconcile. On registration failure, restore the disabled state and surface the error.

**Step 2: Activate installs and updates**

After registry or local installation, ensure origins and reconcile before success feedback. If permission is denied, disable the installed pack and show a localized actionable message.

**Step 3: Reconcile disable and uninstall**

Wait for runtime cleanup before reporting the mutation as complete.

### Task 6: Localize and track the feature

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

**Step 1: Add three permission messages in all locales**

Add the SitePack permission title, pack/origin description, and denial feedback together in all eleven application locales.

**Step 2: Mark P1-17 in progress**

Change only P1-17 from `未开始` to `进行中`; real Duck.ai browser acceptance remains P1-13.

### Task 7: Verify, review, commit, and push

**Files:**

- Create temporarily, then delete: `.tmp-site-pack-registration-smoke.ts`
- Verify: all files above

**Step 1: Run focused behavior smoke**

Exercise template discovery, origin collapsing, permission ownership, registration persistence descriptors, dynamic tab matches, disable cleanup, and uninstall permission removal with in-memory fakes.

**Step 2: Verify generated build facts**

Run Chrome build and inspect the production manifest/service worker for runtime ISOLATED paths, MAIN registered paths, `scripting`, and `<all_urls>` web-accessible resources.

**Step 3: Run repository checks**

```powershell
node scripts/compare_locales.js
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

**Step 4: Review and commit**

Confirm no generated files or user `.gitignore` changes are staged, then commit and push:

```powershell
git commit -m "feat(extension): register site pack origins"
git push origin feat/site-adapter-pluginization
```
