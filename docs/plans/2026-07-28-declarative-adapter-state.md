# DeclarativeAdapter State Detection DSL Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Map declarative generating and session configuration to reliable generation, conversation, share-page, and new-tab state methods.

**Architecture:** Compile validated session regular expressions once in the adapter constructor and keep configured patterns authoritative when present, while delegating omitted fields to the existing `SiteAdapter` defaults. Generalize the existing submit-button visibility check into one declarative element visibility helper so prompt insertion and generation detection share connected/style/geometry semantics, and resolve configured new-tab paths against the current origin with an explicit runtime same-origin assertion.

**Tech Stack:** TypeScript 5.3, browser DOM/URL APIs, existing `SiteAdapter` state APIs and validated SitePack v1 generating/session primitives.

---

### Task 1: Centralize declarative state primitives

**Files:**

- Modify: `src/adapters/declarative/adapter.ts`
- Reference: `src/adapters/base.ts`
- Reference: `src/adapters/declarative/types.ts`
- Reference: `src/adapters/declarative/validate.ts`

**Step 1: Compile session patterns once**

Add a nullable regular expression for `session.idFromPathRegex` and a nullable array for `session.newConversationPathPatterns`. Compile configured values in the constructor after manifest validation, preserving the distinction between an omitted pattern array and an explicitly empty array.

**Step 2: Generalize the existing visibility helper**

Rename the submit-specific visibility helper to describe any configured site element and accept `Element`. Keep the existing requirements: the element must be connected, outside Ophel's main/queue panels, not `display: none`, `visibility: hidden`, or fully transparent, and have a positive bounding rectangle. Continue using the same helper for submit-button readiness so P1-02 behavior has one source of truth.

### Task 2: Implement generation and session methods

**Files:**

- Modify: `src/adapters/declarative/adapter.ts`

**Step 1: Implement `isGenerating()`**

Return `true` when any element found through a configured `generating.existsSelectors` selector is visible according to the shared helper. Query through the existing Shadow DOM-aware selector helper, and return `false` when generating configuration is absent or every candidate is hidden, disconnected, or zero-sized.

**Step 2: Implement `getSessionId()`**

When `idFromPathRegex` is omitted, delegate to the base last-path-segment behavior. When configured, execute it against `window.location.pathname`, read capture group `1`, trim it, and return an empty string for an unmatched or empty capture instead of guessing another ID source.

**Step 3: Implement `isNewConversation()`**

When `newConversationPathPatterns` is omitted, delegate to the base default. Otherwise return whether any compiled pattern matches `window.location.pathname`; an explicitly empty array therefore matches no path.

**Step 4: Implement `isSharePage()`**

Use the configured `sharePathPrefix` when present and otherwise retain the base `/share/` prefix behavior. Match only `window.location.pathname` with `startsWith()` as defined by the schema.

**Step 5: Implement `getNewTabUrl()`**

When `newTabPath` is omitted, return the base current-origin URL. Otherwise resolve the configured path against `window.location.origin`, assert that the resolved origin is unchanged, and return its absolute URL. Treat an impossible post-validation cross-origin result as an explicit configuration error rather than silently navigating elsewhere.

### Task 3: Exercise state branches and update tracking

**Files:**

- Create temporarily, then delete: `.tmp-declarative-state-smoke.ts`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Run a focused fake-DOM smoke**

Create the temporary script with `apply_patch`, run it through `pnpm exec tsx`, and cover:

- absent generating configuration and selectors with no matches;
- multiple generating selectors where only a later selector has a visible match;
- connected visible, `display: none`, `visibility: hidden`, zero-opacity, disconnected, and zero-width/height elements;
- Ophel main/queue panel exclusion and Shadow DOM-aware selector routing;
- submit-button readiness continuing to use the shared visibility semantics;
- base session-ID fallback and configured capture success, mismatch, and empty capture;
- omitted, empty, matching, and non-matching new-conversation pattern arrays;
- default and configured share prefixes;
- default origin and configured same-origin new-tab paths, including query/hash preservation;
- runtime rejection of a fabricated cross-origin `newTabPath` that bypasses validation.

Expected output: every assertion passes and the script prints the exercised branch count. Delete the temporary script with `apply_patch` after the smoke.

**Step 2: Keep P1-05 in progress**

Change P1-05 from `未开始` to `进行中`. The declarative algorithms and deterministic smoke close the implementation path, while formal tests and a real SitePack browser regression remain pending on the repository test harness and dynamic pack activation.

### Task 4: Verify, review, commit, and push

**Files:**

- Verify only: `src/adapters/declarative/adapter.ts`
- Verify only: `docs/developer/site-adapter-pluginization-tasks.csv`
- Verify only: `docs/plans/2026-07-28-declarative-adapter-state.md`

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

Confirm generation and submit readiness share one visibility helper, configured regexes are compiled only once, omitted session fields retain base defaults, configured fields do not introduce fallback IDs or path guesses, new-tab resolution remains same-origin, no schema/i18n/UI changes were added, and the user's `.gitignore` change is not staged.

**Step 3: Commit and push the closure**

```powershell
git add src/adapters/declarative/adapter.ts docs/developer/site-adapter-pluginization-tasks.csv docs/plans/2026-07-28-declarative-adapter-state.md
git commit -m "feat(adapter): add declarative state detection"
git push origin feat/site-adapter-pluginization
```
