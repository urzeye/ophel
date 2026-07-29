# Site Adapter Wizard and Live Preview Design

## Context

P3-03 turns the P3-01 page element picker and P3-02 stable selector generator into a guided flow that a non-technical user can complete on an authorized site with no active adapter. The flow must remain inside the existing Plasmo/userscript Shadow DOM, validate every selection immediately, and show whether the selected conversation structure can already power an outline and related declarative capabilities.

## Goals

- Expose a visible “create an adapter” launcher only when no adapter is active.
- Guide the user through textarea, submit button, response container, user message, assistant response, optional conversation item, and optional new-chat button selections.
- Generate a selector after each pick while preserving manual editing when generation cannot produce a durable selector.
- Report selector syntax, match count, target identity, expected uniqueness, and response-container relationships immediately.
- Keep an outline preview and capability summary derived from the current DOM and draft selectors.
- Preserve the unfinished draft while the launcher is collapsed during the current page lifetime.
- Keep persistence, SitePack installation, JSON export, and contribution links out of P3-03.

## Non-goals

- Save or install a SitePack, request additional origin permissions, export JSON, or open GitHub.
- Infer the complete `conversation` mapping from one list item. The optional selector is captured for P3-04, but `conversation-list` is not declared until its ID and URL rules exist.
- Hide invalid syntax, disconnected targets, ambiguous selectors, or containment failures behind fallback behavior.
- Add a global store, storage migration, dependency, or second picker/selector implementation.

## Alternatives Considered

### 1. Pure wizard model plus local React state — selected

A core module owns step metadata, target normalization, validation, draft-to-config preview conversion, and outline sampling. A React component owns only the page-lifetime draft, open state, active step, and picker promise. This keeps DOM behavior independently testable and gives P3-04 a stable draft model without introducing persistence early.

### 2. Put validation and preview logic directly in the component

This reduces the initial file count, but selector rules, containment checks, capability derivation, and rendering state become one large component. It would also encourage P3-04 to duplicate logic when serialization is added.

### 3. Persist the draft in Zustand immediately

Persistence would preserve work across reloads, but it requires a new storage key, schema compatibility, backup/restore decisions, and cleanup behavior. Those concerns belong with P3-04’s save/install boundary, not the preview-only milestone.

## Architecture

`src/core/site-adapter-wizard.ts` defines the seven ordered steps and a draft containing each selector, its live picked element, and selector origin. It reuses `validateSelectorForElement()` for syntax, deep match count, and target identity, then uses the existing `DOMToolkit` deep query path only after syntax validation to evaluate containment and preview samples.

`src/components/SiteAdapterWizard.tsx` renders a bottom-right launcher and a floating wizard panel. Starting a pick temporarily hides the panel so the full page remains selectable; the existing overlay remains responsible for capture-phase event isolation and Escape cancellation. A selected element is normalized only for obvious input/click targets, passed to `generateStableSelector()`, and retained even when manual selector entry is required.

`src/components/App.tsx` renders the wizard alongside `ElementPickerOverlay` in the no-adapter branch. Existing adapter pages are unchanged.

## Steps and Validation

The required steps are:

1. `textarea`: must resolve to one selected `textarea` or contenteditable input and match exactly once.
2. `submitButton`: must match the selected control exactly once.
3. `responseContainer`: must match the selected conversation container exactly once.
4. `userQuery`: may match one or many user messages, must include the selected element, and every match must be inside the response container.
5. `assistantResponse`: may match one or many assistant messages, must include the selected element, and every match must be inside the response container.

The optional steps are:

6. `conversationItem`: may match repeated list items. Its selector is retained for P3-04 but does not declare `conversation-list` by itself.
7. `newChatButton`: must match the selected control exactly once and can declare `new-chat`.

Required steps cannot advance while invalid. Optional steps can be skipped; once a value is entered, it must validate before advancing. Manual selector edits always validate against the originally picked element, so a selector that happens to match something else cannot appear successful.

## Preview and Capability Derivation

The live outline preview uses `document.title` (falling back to the current hostname) plus short, whitespace-normalized text samples from current user and assistant matches. It shows an explicit empty state until both message selectors produce contained matches.

The config preview includes only fields supported by valid selections:

- `prompt-insert` from a valid input and submit control, with the detected input mode.
- `outline` and `outline-user-queries` from a valid response container and contained user messages.
- `export-basic` from valid contained user and assistant messages.
- `reading-history` from the same valid message selectors through `selectors.chatContent`.
- `new-chat` only when the optional button is valid.

`export.turnSelector` remains `null`, and `useShadowDOM` reflects whether any selected message lives in an open Shadow Root. Conversation-list capability remains absent until P3-04 has enough information to build the required `conversation` object.

## UI and Theme Behavior

The UI is a preserve-mode floating tool rather than a full-page modal, so users can keep reading the host page while configuring it. It uses existing `--gh-*` colors, borders, shadows, typography, and focus conventions. All interactive nodes carry `gh-interactive`, and picker mode removes the panel from hit testing without altering the host document.

The panel covers desktop and narrow-screen layouts, hover/active/focus-visible/disabled states, valid/error feedback, and `prefers-reduced-motion`. Styles remain in `src/style.css`, which is already injected into both extension and userscript Shadow Roots; no document-head or third-party Shadow Root injection is needed.

## Error Model

Selector syntax and length errors are shown directly. A disconnected picked target, selector that no longer matches the target, unexpected ambiguity for a unique step, unsupported input element, missing response container, or out-of-container message blocks progression. Picker busy errors and stable-generation failures are visible and actionable; cancellation simply restores the panel without changing the previous field value.

No broad `try/catch` converts programmer errors into success. Only expected picker cancellation/busy states and browser selector syntax errors are represented as user-facing states.

## Verification

A temporary Vite browser fixture mounts the real wizard against an unsupported-site DOM. Chromium smoke covers launcher visibility, required-step blocking, picker completion, manual selector edits, multi-match message selectors, containment failure/recovery, optional-step skipping, live outline text, capability summary, close/resume, narrow viewport, and zero console/page errors.

Repository checks run locale parity, formatting, focused ESLint, typecheck, extension build, userscript build, and `git diff --check`. P3-03 can be marked complete after the guided flow passes the browser walk-through; P3-01 and P3-02 can also be completed only if their outstanding unsupported-site integration acceptance is exercised through this entry path.
