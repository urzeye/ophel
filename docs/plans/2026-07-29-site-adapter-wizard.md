# Site Adapter Wizard and Live Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Provide a guided, immediately validated element-selection flow with a live outline and capability preview on authorized sites that have no active adapter.

**Architecture:** A pure TypeScript wizard module models steps, validation, containment, and draft-derived preview data. A local-state React component composes the existing picker and selector generator, while the no-adapter App branch exposes it through the existing extension/userscript Shadow DOM mount.

**Tech Stack:** TypeScript 5.3, React 18, native DOM APIs, existing `DOMToolkit`, P3-01 picker controller, P3-02 selector generator, project i18n, CSS theme variables, Vite, and Chromium browser automation.

---

### Task 1: Model the wizard and validation rules

**Files:**

- Create: `src/core/site-adapter-wizard.ts`

**Step 1: Define ordered steps and draft types**

Add required and optional step IDs, selector source metadata, page-lifetime picked element references, input mode, and an empty-draft factory.

**Step 2: Normalize obvious pick targets**

Resolve input descendants to their textarea/contenteditable root and click-control descendants to the nearest button/link/role-button without changing message or container selections.

**Step 3: Validate selector identity and cardinality**

Reuse `validateSelectorForElement()`. Require unique matches for input, submit, response container, and new-chat fields; permit repeated matches for user messages, assistant responses, and conversation items.

**Step 4: Validate conversation containment**

After syntax succeeds, query through the existing open-Shadow-DOM path and require every user/assistant match to be composed-tree descendants of the selected response container.

**Step 5: Derive preview data**

Return short user/assistant text samples, detected title, valid capability IDs, and a schema-compatible config preview containing only fully supported fields. Do not emit `conversation-list` without a complete conversation mapping.

### Task 2: Build the guided React flow

**Files:**

- Create: `src/components/SiteAdapterWizard.tsx`
- Modify: `src/components/App.tsx`

**Step 1: Add the unsupported-site launcher**

Render a themed `gh-interactive` launcher in the no-adapter branch. Keep the existing element picker overlay mounted first.

**Step 2: Render step progress and selector controls**

Show the current required/optional step, pick/reselect action, editable selector, match/uniqueness/containment feedback, Back/Next/Skip controls, and disabled progression for invalid required values.

**Step 3: Integrate the picker and selector generator**

Hide the panel during `startElementPicker()`, normalize the selected element, call `generateStableSelector()`, fill generated selectors, retain the target for manual entry on generation failure, and restore the panel on selection or cancellation.

**Step 4: Add live preview and completion**

Render outline samples and capabilities from the current draft on every selector edit. The final step confirms captured optional mappings and states explicitly that save/export arrives in the next stage.

**Step 5: Preserve and reset local progress**

Closing the panel keeps the draft in component state; reopening resumes it. An explicit start-over action clears all fields after the user reaches the completion view.

### Task 3: Add themed responsive styles

**Files:**

- Modify: `src/style.css`

**Step 1: Style launcher and floating panel**

Use `--gh-*` variables, a compact bottom-right launcher, a bounded floating panel, clear type hierarchy, and no host-page selectors.

**Step 2: Style controls and validation states**

Cover hover, active, focus-visible, disabled, valid, error, match-count badges, selector input, step rail, outline preview, capability list, and picker-hidden state.

**Step 3: Add narrow-screen and reduced-motion behavior**

Fit the panel within safe-area insets below 520px, preserve scroll access, and remove nonessential transitions under `prefers-reduced-motion`.

### Task 4: Localize the complete flow

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

**Step 1: Add shared wizard labels and feedback**

Translate launcher, title, progress, required/optional, picker actions, selector/match states, validation issues, navigation, preview, completion, and reset copy.

**Step 2: Add seven step titles and descriptions**

Keep instructions task-oriented and understandable without CSS or DOM terminology where possible.

**Step 3: Verify parity**

Run `node scripts/compare_locales.js` and require no missing or extra keys.

### Task 5: Browser walk-through and repository verification

**Files:**

- Create temporarily: `.tmp-site-adapter-wizard-smoke.tsx`
- Create temporarily: `.tmp-site-adapter-wizard-vite.config.ts`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Bundle a temporary unsupported-site fixture**

Mount the real component and overlay in a clean page containing textarea, submit button, response container, repeated user/assistant messages, conversation links, a new-chat control, and an outside-message containment trap.

**Step 2: Run the Chromium flow**

Verify launcher open/close/resume, every required pick, generated/manual selector updates, required-step blocking, repeated match counts, containment error/recovery, optional skip, preview text, capability list, completion, narrow viewport, and zero console/page errors.

**Step 3: Remove temporary files and generated smoke output**

Delete only the verified temporary sources and their dedicated output directory. Preserve the user’s existing `output/` research files and `.gitignore` change.

**Step 4: Update task status**

Mark P3-03 complete after walk-through acceptance. Mark P3-01/P3-02 complete only if this run also exercises their formal unsupported-site entry and refresh-stable selector behavior.

**Step 5: Run repository checks**

```powershell
node scripts/compare_locales.js
pnpm format:check
pnpm exec eslint src/core/site-adapter-wizard.ts src/components/SiteAdapterWizard.tsx src/components/App.tsx
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

**Step 6: Review and commit the isolated closure**

Confirm no storage write, pack installation, incomplete conversation capability, duplicate selector engine, host-page CSS leakage, generated artifacts, unrelated formatting, or `.gitignore` staging. Commit and push with:

```powershell
git commit -m "feat(wizard): guide site adapter setup"
git push origin feat/site-adapter-pluginization
```
