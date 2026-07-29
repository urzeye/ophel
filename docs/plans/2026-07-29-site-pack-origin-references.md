# SitePack Origin References Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Derive SitePack origin reference counts from enabled packs and user bindings so shared origins receive one extension script set and are cleaned up only after their final reference disappears.

**Architecture:** Add a strict core binding codec and a pure reference-graph derivation module, then make PackManager own binding lifecycle operations. Extend the existing extension registration reconciler to consume the graph, fold only authorized overlapping registration patterns, and expose references and binding issues through the current background/platform status path.

**Tech Stack:** TypeScript 5.3, Chrome MV3 permissions and scripting APIs, Plasmo, platform storage, and temporary `tsx` behavior smokes.

---

### Task 1: Define origin bindings and reference derivation

**Files:**

- Create: `src/core/site-pack-origin-bindings.ts`
- Create: `src/core/site-pack-origin-references.ts`
- Modify: `src/adapters/declarative/match-pattern.ts`
- Modify: `src/adapters/declarative/types.ts`
- Modify: `src/adapters/declarative/validate.ts`

**Step 1: Write the binding schema**

Define schema version 1, explicit/detect discriminated unions, canonical exact-origin validation, strict parse/serialize helpers, and deterministic cloning. Reuse the manifest ID predicate from declarative types, and reject unknown keys and noncanonical stored keys.

**Step 2: Add directional origin-pattern coverage**

Export a helper that decides whether one HTTPS origin-level match fully covers another, including wildcard host and explicit-port semantics.

**Step 3: Derive references and issues**

Implement pure helpers returning stable entries shaped as `{ originPattern, referenceCount, references }`, with reference sources `static`, `explicit`, and `detect`. Return `binding-pack-missing` issues for stale explicit bindings and a per-pack origin helper for permission preflight.

### Task 2: Make PackManager own binding lifecycle

**Files:**

- Modify: `src/core/pack-manager.ts`

**Step 1: Add binding snapshot and mutation methods**

Expose `getOriginBindings()`, `setOriginBinding(origin, binding)`, and `removeOriginBinding(origin)` through the existing serialized mutation queue. Explicit mutations must target an installed valid pack.

**Step 2: Clean explicit bindings during uninstall**

Load and validate bindings before changing installed state, remove only explicit records targeting the uninstalled pack, persist the filtered binding table, and report removed binding origins in the mutation result.

### Task 3: Reconcile registrations from the reference graph

**Files:**

- Modify: `src/platform/extension/site-pack-registration.ts`
- Modify: `src/background.ts`

**Step 1: Extend permission preflight**

Read the binding snapshot and include static, explicit, and detect origins relevant to the requested pack.

**Step 2: Replace static-origin derivation**

Build the reference graph from the PackManager and binding snapshots. Check permission for every referenced pattern, fold only the authorized patterns to a minimal covering registration set, and retain managed permissions against the unfurled desired reference patterns.

**Step 3: Expose reference state and binding issues**

Return reference entries and binding issues from reconciliation. Log binding issues in scheduled background reconciliation and watch `SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY` alongside installed packs.

### Task 4: Carry reference status through the platform boundary

**Files:**

- Modify: `src/platform/types.ts`
- Modify: `src/utils/messaging.ts`
- Modify: `src/platform/extension/index.ts`
- Modify: `src/platform/userscript/index.ts`
- Modify: `src/tabs/options/pages/SitePacksPage.tsx`

**Step 1: Extend typed runtime status**

Add `originReferences` and `bindingIssues` to `SitePackRuntimeStatus` and the reconciliation background response without changing existing active/missing-origin semantics.

Initialize the existing SitePacksPage runtime snapshot with empty arrays for the new status fields; do not render new controls or change layout in P2-01.

**Step 2: Keep userscript behavior explicit**

Return empty reference and binding-issue arrays because dynamic extension registration is unsupported there; P2-03 owns userscript domain guidance.

### Task 5: Track and verify P2-01

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`
- Create temporarily, then delete: `.tmp-site-pack-origin-references-smoke.ts`

**Step 1: Mark the task in progress**

Change only P2-01 from `未开始` to `进行中`; real cross-browser acceptance remains P2-09.

**Step 2: Run the focused behavior smoke**

Exercise strict binding parsing, PackManager binding cleanup, missing-pack issues, two detect packs sharing one origin, disable/uninstall reference decrement, final cleanup, wildcard/exact registration folding, and external permission removal.

Run:

```powershell
pnpm exec tsx .tmp-site-pack-origin-references-smoke.ts
```

Expected: all assertions pass and the temporary file is then removed with `apply_patch`.

**Step 3: Run repository checks**

```powershell
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

Expected: all commands exit successfully; existing lint warnings may remain but no new errors are introduced.

### Task 6: Review, commit, and push

**Files:**

- Review all files above and both P2-01 plan documents.

**Step 1: Review the focused diff**

Confirm reference counts are derived rather than stored, there is one registration path, stale bindings are visible, generated files are excluded, and the user's `.gitignore` change remains unstaged.

**Step 2: Commit and push**

```powershell
git commit -m "feat(extension): derive site pack origin references"
git push origin feat/site-adapter-pluginization
```

Expected: the feature commit is present on the remote branch and `.gitignore` is still the only unrelated working-tree modification.
