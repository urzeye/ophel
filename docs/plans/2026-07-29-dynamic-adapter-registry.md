# Dynamic Adapter Registry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Load validated, effectively enabled SitePacks into the synchronous adapter registry before any UI or core consumer selects the current adapter.

**Architecture:** Extend the existing two-stage registry initialization so cached built-in patches are applied first and PackManager-backed declarative adapters are loaded second. Keep built-in and dynamic adapters in separate ordered lists, preserve built-in-first matching, isolate package-level failures, and make `registryReady()` trigger the same singleton initialization promise used by every bootstrap entry.

**Tech Stack:** TypeScript 5.3, React 18, Plasmo content-script UI, existing `PackManager`, `DeclarativeAdapter`, platform storage abstraction, and extension/userscript bootstrap paths.

---

### Task 1: Load enabled SitePacks into AdapterRegistry

**Files:**

- Modify: `src/adapters/index.ts`
- Reference: `src/core/pack-manager-runtime.ts`
- Reference: `src/core/pack-manager.ts`
- Reference: `src/adapters/declarative/adapter.ts`

**Step 1: Add a separate dynamic adapter list**

Keep the existing built-in adapter array and its order unchanged. Add a dynamic `SiteAdapter[]` that is replaced atomically after a load attempt so partial initialization state is not exposed.

**Step 2: Read effective enabled packages**

Create a runtime PackManager over `platform.storage` and call `getEnabledPacks()` after cached built-in patches have been applied. Preserve the returned installation order, log each structured PackManager issue, and leave the dynamic list empty when the installed-state root cannot be read.

**Step 3: Instantiate packages independently**

Construct one `DeclarativeAdapter` per returned manifest. Catch and log constructor failures per package, skip only the failing package, and keep unrelated dynamic and built-in adapters available.

**Step 4: Preserve synchronous matching priority**

Keep `getAdapter()` synchronous. Scan the unchanged built-in list first, then the dynamic list; return the first match and do not add Phase 2 `explicit` or `detect` activation rules early.

### Task 2: Make the UI registry gate self-contained

**Files:**

- Modify: `src/adapters/index.ts`
- Modify: `src/contents/ui-entry.tsx`
- Verify only: `src/contents/main.ts`
- Verify only: `src/platform/userscript/entry.tsx`
- Verify only: `src/components/App.tsx`

**Step 1: Unify initialization and readiness**

Make `initAdapterRegistry()` create one promise for both built-in patching and dynamic loading. Change `registryReady()` to return `initAdapterRegistry()` so a caller can never observe a resolved readiness promise before initialization has started.

**Step 2: Keep App's first mount behind readiness**

Let the Plasmo UI gate await only `registryReady()` and render `<App />` after it resolves. Preserve the userscript's existing explicit `await initAdapterRegistry()` before adapter selection and mounting, so `App.tsx` can safely retain its empty-dependency `useMemo(() => getAdapter(), [])`.

### Task 3: Exercise registry behavior and update tracking

**Files:**

- Create temporarily, then delete: `.tmp-dynamic-adapter-registry-smoke.ts`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Run a focused runtime smoke**

Create the temporary script with `apply_patch`, run it through `pnpm exec tsx`, and cover:

- `registryReady()` starting initialization without a prior `initAdapterRegistry()` call;
- built-in matching retaining priority over dynamic packages;
- enabled local packages becoming `DeclarativeAdapter` instances;
- disabled and registry-unavailable packages not becoming active;
- PackManager snapshot order being preserved without a second registry sort;
- malformed stored package records being reported and skipped while valid packages load;
- invalid root storage leaving built-in matching usable;
- repeated initialization returning the same promise and not duplicating adapters.

Expected output: every assertion passes and the script prints each exercised scenario. Delete the temporary script with `apply_patch` after the smoke.

**Step 2: Keep P1-06 in progress**

Change P1-06 from `未开始` to `进行中`. The runtime load path and deterministic smoke close the implementation slice, while `explicit`/`detect` activation, dynamic extension registration, management UI, and real-site browser acceptance remain in their dedicated tasks.

### Task 4: Verify, review, commit, and push

**Files:**

- Verify: all files listed above

**Step 1: Run focused and repository checks**

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

Expected: registry checks, formatting, typecheck, and both builds pass; Lint has zero errors and may retain the repository's existing warnings.

**Step 2: Review the startup and data boundaries**

Confirm built-in matching stays first, dynamic adapters have one source of truth in PackManager snapshots, package failures do not reject registry readiness, the Plasmo App never mounts before readiness, extension/userscript style and theme injection paths are unchanged, and the user's `.gitignore` edit is not staged.

**Step 3: Commit and push the closure**

```powershell
git add src/adapters/index.ts src/contents/ui-entry.tsx docs/developer/site-adapter-pluginization-tasks.csv docs/plans/2026-07-29-dynamic-adapter-registry.md
git commit -m "feat(adapter): load installed site packs"
git push origin feat/site-adapter-pluginization
```
