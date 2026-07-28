# SitePack PackManager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Provide validated, idempotent SitePack installation, monotonic updates, enable/disable, uninstall, and registry-cache synchronization across extension and userscript storage.

**Architecture:** Keep `sitepacks/installed` as the user-owned installed-package source of truth containing each runnable manifest plus source and lifecycle metadata, while `sitepacks/remote-state` remains the RemoteConfigManager-owned registry catalog/cache. Registry packages reconcile from the validated remote cache after successful checks and before adapter startup; local imports never reconcile automatically. Runtime conflict checks share the same host-overlap primitive as registry CI so built-in domains and overlapping installed packages cannot create a second activation truth.

**Tech Stack:** TypeScript 5.3, existing declarative SitePack validator, platform storage abstraction, RemoteConfigManager cache/state, extension background service worker, and userscript GM storage.

---

### Task 1: Share match-conflict semantics between CI and runtime

**Files:**

- Create: `src/adapters/declarative/match-pattern.ts`
- Modify: `src/adapters/declarative/index.ts`
- Modify: `registry/scripts/validate.mjs`

**Step 1: Extract host parsing and overlap detection**

Move the validated HTTPS match-pattern host parser and wildcard/subdomain overlap predicate out of the registry script into a zero-browser-dependency TypeScript module. Keep the current policy: equal hosts overlap, a wildcard overlaps its root and subdomains, and path differences do not make the same host safe for two adapters.

**Step 2: Reuse the shared helper in registry validation**

Import the shared function from the registry script and delete its local duplicate. Preserve all existing registry error messages and built-in/pack-to-pack conflict behavior.

### Task 2: Define installed-pack storage and validation boundaries

**Files:**

- Create: `src/core/pack-manager.ts`
- Modify: `src/core/remote-config-types.ts`
- Reference: `src/core/remote-config-state.ts`
- Reference: `src/constants/defaults.ts`

**Step 1: Define versioned installed storage**

Use key `sitepacks/installed` with `storageSchemaVersion: 1` and a record keyed by manifest ID. Each installed entry stores the validated manifest, source (`registry` or `local`), `installedAt`, `updatedAt`, user `enabled` state, and registry availability (`available`, `disabled`, or `unavailable`) for registry packages. The schema-version boundary is the migration hook; unknown versions fail explicitly instead of being reinterpreted.

**Step 2: Parse records independently**

Validate the root strictly, then parse each pack independently. Check metadata shape, timestamps, ID/key agreement, full `validateSitePackManifest()` output, app-version compatibility, built-in ID/domain conflicts, and conflicts with earlier installed packs in installation order. Return structured issues for invalid entries while keeping unrelated valid packs usable; preserve invalid raw entries during unrelated mutations so a single bad record is neither silently trusted nor silently deleted.

**Step 3: Expose explicit errors and immutable snapshots**

Add typed `PackManagerError` codes for invalid manifests, incompatible app versions, storage schema failures, source conflicts, version rollback/reuse, built-in conflicts, installed-pack conflicts, and unavailable registry artifacts. Clone manifests and records at public boundaries so callers cannot mutate persisted state out of band.

Keep RemoteConfig state/type imports pointed directly at the pure declarative type and validation modules rather than the adapter barrel, so PackManager and registry tooling never initialize DOM-dependent adapter code.

### Task 3: Implement idempotent lifecycle operations

**Files:**

- Modify: `src/core/pack-manager.ts`

**Step 1: Install or update local manifests explicitly**

Validate before mutation. A new ID installs enabled with one timestamp; re-importing the identical version/content is a no-op; a higher version updates the manifest while preserving installation time and enabled state; lower versions or changed content under the same version fail explicitly. A local operation cannot silently replace a registry-source package.

**Step 2: Install from the active registry cache**

Resolve an ID from `RemoteConfigState.active.packs`, revalidate the cached manifest and index metadata, require app compatibility and an active index entry, then apply the same monotonic upsert rules with source `registry`. Missing, disabled, malformed, or incompatible cache entries fail without changing installed state.

**Step 3: Enable, disable, and uninstall**

Make repeated enable/disable calls no-ops, reject enabling invalid or remotely unavailable registry packs, and leave registry availability separate from the user's enabled preference. Uninstall deletes only the installed package record; registry catalog cache remains RemoteConfigManager-owned and reusable. Repeated uninstall returns no change.

**Step 4: Return effective enabled packages**

Expose snapshots for all packages and effective enabled packages. A registry package is effective only when the user enabled it and its registry status is `available`; local packages depend only on the user setting. Preserve installation ordering for later detect-priority rules.

### Task 4: Reconcile registry packages without affecting local imports

**Files:**

- Modify: `src/core/pack-manager.ts`
- Create: `src/core/pack-manager-runtime.ts`

**Step 1: Synchronize registry-source records**

Read the active remote snapshot and process installed registry packages independently:

- active valid higher versions replace the installed manifest while preserving user state;
- identical versions/content are no-ops;
- version rollback/reuse, invalid cache data, or new match conflicts produce issues and preserve the installed last-known-good body;
- an index kill switch sets registry status to `disabled` without overwriting the user preference;
- a removed/missing active artifact sets status to `unavailable`;
- a later valid active version returns status to `available` and becomes effective again if the user had left it enabled;
- local-source records are never changed.

**Step 2: Add the runtime factory**

Create a small dependency-injection factory that supplies `APP_VERSION` while accepting platform storage. Do not import the global platform singleton from PackManager itself; each extension/userscript bundle owns its own manager instance over the shared storage abstraction.

### Task 5: Link RemoteConfigManager checks to installed packages

**Files:**

- Modify: `src/background.ts`
- Modify: `src/platform/userscript/remote-config.ts`

**Step 1: Synchronize after successful extension checks**

After a non-failed background RemoteConfigManager check, reconcile installed registry packs. Log structured sync issues with `console.warn` but keep the remote check result intact so one bad installed package does not break patch updates or other packages.

**Step 2: Synchronize after userscript checks**

Apply the same behavior to startup, throttled, and manual userscript checks. Keep GM storage access through the existing platform adapter and do not introduce a Promise wrapper around raw synchronous GM APIs.

### Task 6: Exercise lifecycle behavior and update tracking

**Files:**

- Create temporarily, then delete: `.tmp-pack-manager-smoke.ts`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Run a focused in-memory-storage smoke**

Create the temporary script with `apply_patch`, run it through `pnpm exec tsx`, and cover:

- valid local install, identical reinstall, higher-version update, rollback, and version reuse;
- validation and min-app-version rejection without storage mutation;
- built-in ID/domain and installed-pack match conflicts;
- source-conflict rejection;
- enable/disable idempotence, effective enabled filtering, and repeated uninstall;
- one malformed stored record being reported/skipped while valid records remain usable;
- unsupported storage schema rejection;
- registry install from a valid cache, higher-version reconciliation, kill-switch disable, missing-artifact unavailability, and later recovery;
- invalid/rollback registry updates preserving installed last-known-good;
- local packages remaining unchanged during registry reconciliation.

Expected output: every assertion passes and the script prints the exercised branch count. Delete the temporary script with `apply_patch` after the smoke.

**Step 2: Keep P1-07 in progress**

Change P1-07 from `未开始` to `进行中`. The core lifecycle and deterministic smoke close the functional path, while the formal Vitest suite, management UI, dynamic permission cleanup, backup lifecycle, and real registry pack flow remain in their dedicated tasks.

### Task 7: Verify, review, commit, and push

**Files:**

- Verify: all files listed above

**Step 1: Run focused and repository checks**

Run:

```powershell
pnpm registry:validate
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

Expected: registry policy behavior remains unchanged; formatting, typecheck, and both builds pass; Lint has zero errors and may retain existing warnings.

**Step 2: Review the data boundary**

Confirm installed state and remote cache remain separate, local packs never auto-update, invalid entries are isolated rather than trusted, all mutations are monotonic/idempotent, registry kill switches affect effective activation without erasing user preference, and no UI/i18n/settings schema changes were introduced.

**Step 3: Commit and push the closure**

```powershell
git add src/adapters/declarative/match-pattern.ts src/adapters/declarative/index.ts registry/scripts/validate.mjs src/core/pack-manager.ts src/core/pack-manager-runtime.ts src/core/remote-config-types.ts src/background.ts src/platform/userscript/remote-config.ts docs/developer/site-adapter-pluginization-tasks.csv docs/plans/2026-07-29-site-pack-manager.md
git commit -m "feat(core): add site pack manager"
git push origin feat/site-adapter-pluginization
```
