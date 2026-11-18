# Prompt Editor Compatibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix prompt insertion side effects and surface clearing failures while preserving existing site behavior.

**Architecture:** Keep the existing framework pipelines, restore the native-first ProseMirror insertion default, and allow SitePacks to explicitly choose a native or paste insertion strategy. Propagate declarative clearing results through the existing adapter API without changing built-in implementations; guard asynchronous edits against later edits and navigation.

**Tech Stack:** TypeScript, React 18, SitePack JSON Schema, existing i18n and Toast utilities.

---

### Task 1: Declare the insertion policy

- Update `src/adapters/declarative/types.ts`, `src/adapters/declarative/validate.ts`, and `registry/schema/site-pack.schema.json` with optional `input.insertStrategy: "native" | "paste"`, limited to contenteditable inputs.
- Document the default and compatibility boundary in `registry/README.md`.
- Keep cached manifests compatible: ProseMirror defaults to its previous native-first insertion even without the new field. Slate, Lexical, Draft.js, plain contenteditable, and textarea defaults retain their current paths.

### Task 2: Restore safe ProseMirror insertion

- Update `src/adapters/declarative/adapter.ts` to choose the insertion sequence from the optional policy before framework defaults.
- The native sequence must never dispatch paste. Do not alter framework deletion sequences or host theme synchronization.
- Explicit native insertion must not bypass the existing model protection for Slate, Lexical, or Draft.js.

### Task 3: Expose clearing results

- Widen `src/adapters/base.ts` clearing return type to `void | Promise<boolean>` so built-in overrides remain compatible.
- Return actual clearing success from the declarative adapter.
- Cancel stale asynchronous edits after a newer operation or editor detachment, and abort pending clears on navigation; recursive cleanup belongs to the original operation. Insertion itself may legitimately create a new conversation URL, so a URL change alone must not reject insertion.
- Coordinate `src/core/prompt-manager.ts` retries with clearing and newer insert requests so an aborted low-level edit cannot restart through the outer retry loop.

### Task 4: Reflect clearing outcomes in the UI

- Update `src/components/App.tsx` to await manual clearing before removing the selected prompt, prevent duplicate clears, and ignore stale completions.
- Keep route-change prompt dismissal immediate and handle any clearing failure without restoring the old prompt into the new conversation.
- Add `promptClearFailed` to all 11 application locales, using the existing Toast UI with no layout, theme, or style changes.

### Task 5: Static self-review

- Read the complete diff and all clearing call sites; compare the per-framework default sequences with the branch and pre-PR implementation.
- Review full and partial validation, JSON Schema parity, all locale keys, stale edit cancellation, built-in `void` callers, and both extension/userscript module boundaries.
- Respect the user's static-only constraint: do not run builds, tests, validators, or browser simulations. After the final review, create the local commit requested by the user; do not push or modify the PR.

### Static self-review outcome

- Implemented the changes and reviewed the final source diff and every `clearTextarea` call site.
- ProseMirror restores the pre-PR native-first insertion path, including cached packs. Other framework defaults and all built-in editor implementations are unchanged.
- Checked that clearing results reach the UI, duplicate manual clears are ignored, stale completions cannot remove a newly selected prompt, and new editor elements are preserved on navigation.
- Found and fixed an outer retry issue during review: a cancelled insertion must not restart through PromptManager after clearing or a newer insertion.
- Kept normal insertion compatible with sites that create a conversation URL while inserting; navigation aborts pending clears rather than treating every URL change as insertion failure.
- Matched the optional strategy enum and contenteditable restriction across types, runtime validation, and JSON Schema; added failure text in all 11 locales.
- No runtime checks were performed, per the user's static-only requirement. Static review does not establish live-site compatibility.
- Re-reviewed the final diff before the requested local commit, including built-in synchronous overrides, the asynchronous Kimi insertion caller, queue failure handling, and all clearing call sites. No new blocking issue was identified statically.
