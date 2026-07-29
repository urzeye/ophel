# Element Picker Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the reusable page-level element picker overlay required by the SitePack adaptation wizard.

**Architecture:** A singleton TypeScript controller owns the picker request and exposes an external-store snapshot. A React overlay in the existing App Shadow Root owns capture-phase DOM events and renders viewport geometry, while adapter-less extension/userscript mounts keep only this minimal overlay available.

**Tech Stack:** TypeScript 5.3, React 18, `useSyncExternalStore`, native Pointer/Keyboard/Scroll APIs, Plasmo Shadow DOM, existing `--gh-*` theme variables, and the 11 application locale dictionaries.

---

### Task 1: Add the single-source picker controller

**Files:**

- Create: `src/core/element-picker-controller.ts`
- Test temporarily: `.tmp-element-picker-controller-smoke.ts`

**Step 1: Define result and snapshot types**

Add selected/cancelled discriminated results, cancellation reasons, immutable viewport geometry, hover kind, idle/picking snapshots, and a dedicated busy error.

**Step 2: Implement the controller lifecycle**

Implement stable `subscribe`/`getSnapshot` methods plus `start`, `setHoveredElement`, `clearHoveredElement`, `select`, and `cancel`. Reset to one frozen idle snapshot after every terminal action and reject concurrent starts.

**Step 3: Run a focused smoke**

Create a temporary TSX smoke that asserts initial state, busy rejection, immutable geometry copying, selected result identity, Escape cancellation, and a successful restart.

Run:

```powershell
pnpm exec tsx .tmp-element-picker-controller-smoke.ts
```

Expected: `element picker controller smoke passed`.

**Step 4: Remove the temporary smoke**

Delete `.tmp-element-picker-controller-smoke.ts` with `apply_patch` after it passes.

### Task 2: Build capture-phase overlay interaction

**Files:**

- Create: `src/components/ElementPickerOverlay.tsx`

**Step 1: Subscribe to the controller**

Use `useSyncExternalStore` directly against the singleton controller. Render nothing for the idle snapshot.

**Step 2: Resolve targets safely**

Use `event.composedPath()` to obtain the first host-page `Element`. Reject paths belonging to the current Ophel Shadow Root and classify `HTMLIFrameElement` as unsupported.

**Step 3: Coalesce hover geometry**

Keep the latest candidate in refs and schedule at most one `requestAnimationFrame`. Refresh the current rectangle on capture scroll and window resize; clear disconnected or empty-rect targets.

**Step 4: Isolate host interaction**

Capture `pointerdown`, `click`, and `contextmenu`. Prevent default and immediate propagation for host targets; complete selection on the primary click only. Capture Escape to cancel. Add and remove every listener and animation frame in one effect lifecycle.

**Step 5: Render iframe protection**

Place a transparent interactive guard over hovered iframe geometry, block its pointer/click/context-menu events, and keep the picker active with the unsupported message.

### Task 3: Preserve a minimal mount without an adapter

**Files:**

- Modify: `src/components/App.tsx`
- Modify: `src/platform/userscript/entry.tsx`

**Step 1: Mount the overlay in App**

Import `ElementPickerOverlay`, render it in the normal `.gh-root`, and replace the final manager-missing `return null` with a minimal `.gh-root` containing only the overlay.

**Step 2: Mount userscript UI before adapter initialization exits**

Remove the pre-mount unmatched-adapter return. Initialize the adapter only when present, mount the shared App in all configured/custom matches, register mount cleanup, then return before store/core initialization when no adapter exists.

**Step 3: Confirm extension behavior remains bounded**

Keep static extension matches unchanged. Dynamically authorized origins continue to receive the existing generic `main` and `ui-entry` registrations; no new host permission or content script is added.

### Task 4: Add theme-compatible visuals and localization

**Files:**

- Modify: `src/style.css`
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

**Step 1: Style the overlay states**

Add scoped `gh-element-picker-*` rules for the viewport layer, highlight, iframe guard, instruction card, tag label, and reduced-motion behavior. Use only existing theme variables.

**Step 2: Add all picker copy in one locale batch**

Add keys for the selection instruction, Escape cancellation hint, and iframe unsupported explanation in every application dictionary.

**Step 3: Check locale parity**

Run:

```powershell
node scripts/compare_locales.js
```

Expected: every missing-key list is empty.

### Task 5: Update tracking and verify the complete slice

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`
- Verify: all files above

**Step 1: Mark P3-01 in progress**

Change only P3-01 from `未开始` to `进行中`. Keep the three-site manual acceptance open until P3-03 exposes the formal entry path.

**Step 2: Run repository checks**

```powershell
node scripts/compare_locales.js
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

Expected: zero errors; pre-existing warnings may remain unchanged.

**Step 3: Review behavior and boundaries**

Confirm one controller is the only picker truth, capture listeners exist only while active, click completion cannot leak to the host, iframe clicks stay in the parent document, adapter-backed UI is unchanged, both style paths include `style.css`, and no generated files or unrelated `.gitignore` changes are staged.

**Step 4: Commit and push P3-01 only**

Stage the P3-01 files explicitly, then run:

```powershell
git commit -m "feat(wizard): add element picker overlay"
git push origin feat/site-adapter-pluginization
```
