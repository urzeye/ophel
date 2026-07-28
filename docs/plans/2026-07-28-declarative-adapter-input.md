# DeclarativeAdapter Generic Input Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add validated generic prompt insertion and clearing for declarative textarea/input and contenteditable editors without unsafe DOM fallbacks.

**Architecture:** Keep the strategy inside `DeclarativeAdapter`: validate the configured mode against the resolved element, replace textarea/input content through the native prototype setter, and replace contenteditable content by ordered `beforeinput` then `execCommand("insertText")` attempts. Treat editor readback plus an enabled visible submit button as the only insertion success signal; clearing uses the same editor strategies but validates only that content is empty.

**Tech Stack:** TypeScript 5.3, browser DOM APIs, existing `SiteAdapter` editor cache and declarative SitePack v1 manifest.

---

### Task 1: Add explicit editor and action-state validation

**Files:**

- Modify: `src/adapters/declarative/adapter.ts`
- Reference: `src/adapters/base.ts`
- Reference: `src/adapters/declarative/types.ts`

**Step 1: Resolve only a connected editor with the configured mode**

Use `getTextareaElement()` and reject a missing or disconnected element. For `input.mode: "textarea"`, accept only `HTMLTextAreaElement` or `HTMLInputElement`; for `input.mode: "contenteditable"`, accept only an element whose `isContentEditable` flag is true. A missing input config or mismatched selector result must return failure instead of guessing another strategy.

**Step 2: Centralize readback checks**

Read form controls through `value` and contenteditable elements through `textContent`. Insertion succeeds only when the current content contains the requested text. Clearing succeeds only when content is empty after removing editor zero-width markers; an empty insertion string must not pass through the ordinary `includes("")` shortcut.

**Step 3: Validate the submit action**

Search every configured `selectors.submitButton` selector through the base Shadow DOM-aware query helper. Require at least one connected element that is visibly rendered and is not disabled through its property, `disabled`, `aria-disabled="true"`, or `data-disabled="true"`. Missing selectors, hidden buttons, and disabled buttons keep insertion in the explicit failure path; they do not block `clearTextarea()`.

### Task 2: Implement the textarea/input strategy

**Files:**

- Modify: `src/adapters/declarative/adapter.ts`

**Step 1: Replace content through the correct native setter**

Read the `value` setter from `HTMLTextAreaElement.prototype` or `HTMLInputElement.prototype` according to the actual element. If the native setter is unavailable, return failure rather than assigning through a possibly framework-overridden instance property.

**Step 2: Notify the host and verify**

After the setter runs, dispatch bubbling/composed `input` and bubbling `change` events, then place the selection at the end. Return success only after form-control readback and submit-button validation both pass.

**Step 3: Reuse the strategy for clearing**

Set the value to an empty string with the same setter and events. Verify the form control is empty, but do not require the submit button to remain enabled after clearing.

### Task 3: Implement the contenteditable strategy

**Files:**

- Modify: `src/adapters/declarative/adapter.ts`

**Step 1: Try synthetic `beforeinput` first**

Focus the editor, select all of its current children, and dispatch a cancelable, bubbling, composed `InputEvent` with `inputType: "insertText"` and the requested text. Accept the attempt only if readback and submit-button validation pass.

**Step 2: Retry through `execCommand("insertText")`**

If the first attempt fails, select all children again and call the editor document's `execCommand("insertText", false, content)`. Judge the result by editor/button readback rather than the command's boolean alone.

**Step 3: Keep failure explicit**

If both attempts fail, return `false`. Do not write `textContent`, `innerHTML`, append nodes, synthesize paste, or add any other silent fallback. Existing callers already convert the final `false` into the localized `insertFailed` toast after PromptManager retries.

**Step 4: Clear through the same ordered replacement pipeline**

Run the two contenteditable attempts with an empty replacement and stop once readback is empty. Do not consult submit-button state while clearing.

### Task 4: Exercise the strategy matrix and update tracking

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`
- Create temporarily, then delete: `.tmp-declarative-input-smoke.ts`

**Step 1: Run a focused fake-DOM smoke**

Create the temporary script with `apply_patch`, run it through `pnpm exec tsx`, and cover:

- textarea and input native-setter insertion, event dispatch, selection placement, and clearing;
- textarea/contenteditable mode mismatches;
- contenteditable `beforeinput` success;
- `beforeinput` failure followed by `execCommand` success;
- readback failure plus missing, hidden, and disabled submit-button failures;
- textarea and contenteditable clearing while the submit button is absent or disabled.

Expected output: all assertions pass and the script prints the exercised branch count. Delete the temporary script with `apply_patch` immediately after the smoke.

**Step 2: Keep P1-02 in progress**

Change P1-02 from `未开始` to `进行中`. The implementation and local strategy smoke close the code path, but the acceptance matrix still requires real native contenteditable, Lexical, and ProseMirror site regression after dynamic SitePack activation is available.

### Task 5: Verify, review, commit, and push

**Files:**

- Verify only: `src/adapters/declarative/adapter.ts`
- Verify only: `docs/developer/site-adapter-pluginization-tasks.csv`
- Verify only: `docs/plans/2026-07-28-declarative-adapter-input.md`

**Step 1: Run repository checks**

Run:

```powershell
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

Expected: formatting, typecheck, and both builds pass; Lint has zero errors and may retain the repository's existing warnings.

**Step 2: Review the diff boundary**

Confirm there is no `textContent`/`innerHTML` write in the declarative input path, no change to the base adapter or schema, no new localized text, no formal completion claim before real-site regression, and no staged `.gitignore` change.

**Step 3: Commit and push the closure**

```powershell
git add src/adapters/declarative/adapter.ts docs/developer/site-adapter-pluginization-tasks.csv docs/plans/2026-07-28-declarative-adapter-input.md
git commit -m "feat(adapter): add declarative input strategies"
git push origin feat/site-adapter-pluginization
```
