# Site Adapter AI Draft Prototype Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add a privacy-preserving, provider-neutral AI selector draft round trip to the existing Site Adapter Wizard.

**Architecture:** A pure core module creates a bounded sanitized DOM candidate snapshot, frames the LLM prompt, strictly parses selector-only JSON, and applies resolvable selectors to the existing wizard draft model. The React Wizard adds a collapsed optional copy/paste section and continues to rely on the current selector, containment, capability, and SitePack validation pipeline.

**Tech Stack:** TypeScript 5.3, React 18, native DOM and Clipboard APIs, existing `DOMToolkit` and selector heuristics, Vitest, Playwright Chromium smoke, project i18n, Shadow DOM CSS variables.

---

### Task 1: Lock the response and prompt contracts

**Files:**

- Create: `src/core/site-adapter-ai-draft.test.ts`
- Create: `src/core/site-adapter-ai-draft.ts`

**Step 1: Write failing strict-parser tests**

Cover direct JSON, a sole fenced JSON block, partial selectors, null optional selectors, unknown keys, wrong schema versions, wrong selector types, empty selector sets, oversized responses, and selector-length limits.

**Step 2: Write failing prompt-framing tests**

Given a prebuilt sanitized snapshot string and existing selector map, require the prompt to state the exact output schema, uniqueness/repetition rules, stable-selector preferences, prohibited syntax, manual-review requirement, and no-auto-upload privacy boundary.

**Step 3: Implement minimal pure parsing and framing**

Keep errors typed and explicit. Do not add a provider client, network call, API-key setting, or permissive JSON repair.

**Step 4: Run focused tests**

Run: `pnpm test -- src/core/site-adapter-ai-draft.test.ts`

Expected: PASS for all pure response and prompt cases.

### Task 2: Build the bounded sanitized DOM snapshot and apply path

**Files:**

- Modify: `src/core/element-selector-generator.ts`
- Modify: `src/core/site-adapter-wizard.ts`
- Modify: `src/core/site-adapter-ai-draft.ts`

**Step 1: Reuse selector stability heuristics**

Export the existing stable ID/attribute helpers needed by snapshot generation rather than duplicating hash, UUID, generated-ID, and utility-class rules.

**Step 2: Collect candidate records**

Traverse the document and open Shadow Roots with explicit element, depth, candidate, and character limits. Exclude Ophel UI and unsafe tags; record only whitelisted attributes, stable classes, bounded ancestor paths, Shadow DOM presence, and duplicate counts.

**Step 3: Preserve privacy invariants**

Never read `textContent`, input `value`, `href`, `src`, inline style, event attributes, storage, or closed Shadow Roots. Surface truncation in snapshot metadata.

**Step 4: Resolve and apply imported selectors**

Validate standard CSS syntax, perform the existing deep query, normalize the selected target, retain previous work for rejected fields, mark accepted selections as `ai`, and return applied/valid/review/rejected counts. Existing wizard validation remains the sole acceptance source.

### Task 3: Add the optional AI section to the Wizard

**Files:**

- Modify: `src/components/SiteAdapterWizard.tsx`
- Modify: `src/style.css`

**Step 1: Add page-lifetime AI state**

Track response text and copy/apply feedback locally. Do not persist prompts or AI responses.

**Step 2: Add the collapsed assist section**

Place a native-details-based optional section under the header. Explain the no-network behavior and snapshot exclusions before the copy action.

**Step 3: Implement copy and apply actions**

Build the snapshot at click time, copy the framed prompt, parse pasted JSON, apply resolvable selectors, move focus/progress to the first required field needing review, and keep errors local to the AI section.

**Step 4: Cover interaction states**

Style hover, active, focus-visible, disabled, empty, copied, applied, partial-review, and error states. Add narrow-screen and reduced-motion compatibility without new theme variables.

### Task 4: Localize all user-facing copy

**Files:**

- Modify all 11 `src/locales/*/index.ts` files.

**Step 1: Add AI section labels and privacy copy**

Translate title, optional badge, description, privacy boundary, copy action, response label/placeholder, apply action, source label, and manual-review reminder.

**Step 2: Add result and error copy**

Translate clipboard failure, copied status, invalid JSON/schema, response-too-large, no selectors, selector rejection, and applied/review count feedback.

**Step 3: Verify parity**

Compare locale key sets and require all 11 languages to remain aligned.

### Task 5: Demonstrate and evaluate the prototype in a real browser

**Files:**

- Create temporarily: dedicated P4-02 browser fixture and Playwright script under a verified temporary directory.
- Create: `docs/plans/2026-07-30-site-adapter-ai-draft-evaluation.md`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Exercise privacy and bounds**

Use a fixture containing conversation text, input values, links, noisy classes, repeated messages, and an open Shadow Root. Assert the copied prompt omits sensitive values and remains within configured limits.

**Step 2: Exercise the round trip**

Apply direct and fenced JSON drafts, verify AI source labels and live validation, then cover partial, invalid, and non-matching responses without losing existing manual selections.

**Step 3: Inspect UI states**

Check default/collapsed, expanded, copied, partial-review, error, disabled, focus-visible, narrow viewport, light, dark, and reduced-motion states with zero console errors.

**Step 4: Record the evaluation honestly**

Report snapshot coverage, selector resolution, wizard acceptance, manual correction, privacy observations, provider-cost conclusion, and the limits of the fixture matrix. Do not claim broad model accuracy without a named external model run.

**Step 5: Mark P4-02 complete**

Update the CSV only after the prototype loop and evaluation report exist.

### Task 6: Verify, review, commit, and push

**Files:**

- Review all P4-02 files above.
- Do not stage or modify the user's `.gitignore` changes.

**Step 1: Run repository checks**

1. `pnpm test`
2. `pnpm format:check`
3. focused ESLint for changed source files
4. `pnpm typecheck`
5. locale parity check
6. `pnpm build`
7. `pnpm build:userscript`
8. `git diff --check`

**Step 2: Review privacy and architecture**

Confirm no automatic network call, API-key storage, raw HTML/text leakage, second selector validator, silent AI acceptance, new theme source, host-page CSS, generated artifacts, or unrelated user changes.

**Step 3: Commit and push**

Stage only the P4-02 implementation, tests, all 11 locale files, CSS, design/evaluation documents, and task CSV. Commit with `feat(wizard): add AI selector drafts` and push the current feature branch.
