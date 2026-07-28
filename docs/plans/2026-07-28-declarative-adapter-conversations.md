# DeclarativeAdapter Conversation DSL Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Map the declarative conversation primitives to conversation-list extraction, observation, active-title lookup, and safe click/location navigation.

**Architecture:** Centralize conversation item querying and `id/title/url/active` extraction inside `DeclarativeAdapter`, then reuse those helpers from `getConversationList()`, `getConversationObserverConfig()`, `getConversationTitle()`, and `navigateToConversation()`. Honor the configured Shadow DOM flag at the query boundary, build every stored/navigation URL from the validated same-origin `urlTemplate`, and default the optional navigation strategy to `click-item` with a location fallback.

**Tech Stack:** TypeScript 5.3, browser DOM/URL APIs, existing `SiteAdapter` conversation interfaces and SitePack v1 conversation primitives.

---

### Task 1: Centralize declarative conversation extraction

**Files:**

- Modify: `src/adapters/declarative/adapter.ts`
- Reference: `src/adapters/base.ts`
- Reference: `src/adapters/declarative/types.ts`
- Reference: `src/adapters/declarative/validate.ts`

**Step 1: Query configured items with the declared Shadow DOM mode**

Return no items when `manifest.conversation` is absent. For `shadow: false` or omitted, use `document.querySelectorAll(itemSelector)` so nested third-party shadows are not scanned accidentally; for `shadow: true`, use the base Shadow DOM-aware query helper.

**Step 2: Extract the conversation ID once**

Read `idFrom.attr`, defaulting to `href`, run the validated regular expression, and use capture group `1` after trimming. Missing attributes, unmatched patterns, or missing/empty capture groups make that item invalid instead of falling back to text or another attribute.

**Step 3: Resolve the title element and text once**

When `titleSelector` is absent, use the item itself. When present, accept the item if it matches the selector; otherwise query a descendant. Normalize whitespace through the existing element-text helper and allow an empty title so the observer can fill it after delayed rendering.

**Step 4: Build same-origin URLs from the template**

Replace every `{id}` occurrence with `encodeURIComponent(id)`, construct the URL against `window.location.origin`, and require the resulting origin to equal the current origin. A failed origin assertion invalidates extraction/navigation even though the validator already rejects protocol-relative paths; this keeps the runtime security boundary explicit.

**Step 5: Evaluate active state from the item**

When `activeMatch` exists, set `isActive` from `item.matches(activeMatch)`. Do not search descendants or localized text because the schema defines the active selector as an item matcher.

### Task 2: Implement list and observer mappings

**Files:**

- Modify: `src/adapters/declarative/adapter.ts`

**Step 1: Implement `getConversationList()`**

Extract every configured item through the shared helper, discard invalid entries, and de-duplicate by conversation ID while preserving the first DOM occurrence and order.

**Step 2: Implement `getConversationObserverConfig()`**

Return `null` without conversation configuration. Otherwise map `itemSelector`, the boolean Shadow DOM flag, `extractInfo` to the shared extraction helper, and `getTitleElement` to the shared title-element resolver. This keeps initial scans, MutationObserver additions, polling, and delayed-title monitoring consistent.

**Step 3: Reuse the same item semantics for `getConversationTitle()`**

Find the first configured item matching `activeMatch`, including Shadow DOM items when requested, and read its configured title element. Keep the existing document-title fallback when no active item or non-empty title is available.

### Task 3: Implement safe navigation strategies

**Files:**

- Modify: `src/adapters/declarative/adapter.ts`

**Step 1: Default to `click-item`**

For `navigationStrategy: "click-item"` or an omitted strategy, find the first configured item whose extracted ID equals the requested ID. If it is an `HTMLElement`, invoke the base `simulateClick()` and return success.

**Step 2: Fall back to location navigation**

When no matching clickable item exists, or when the strategy is explicitly `location`, build the same-origin URL from `urlTemplate` and delegate to the base location navigation. Ignore an arbitrary caller-provided URL as an authority source; the validated pack template remains the single source of navigation truth.

**Step 3: Fail explicitly**

Return `false` for empty IDs, absent conversation configuration, invalid regex extraction, unsafe template resolution, or a missing click target plus unusable location URL. Do not guess a selector, synthesize an ID, or navigate cross-origin.

### Task 4: Exercise the DSL and update tracking

**Files:**

- Create temporarily, then delete: `.tmp-declarative-conversation-smoke.ts`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Run a focused fake-DOM smoke**

Create the temporary script with `apply_patch`, run it through `pnpm exec tsx`, and cover:

- default `href` plus explicit alternate attributes and capture-group extraction;
- title descendant, title-on-item, whitespace normalization, empty delayed title, and active item state;
- invalid/missing ID data and duplicate-ID de-duplication in DOM order;
- non-shadow document queries versus configured Shadow DOM queries;
- observer config fields and closures matching list extraction;
- active conversation title plus document-title fallback;
- URL template encoding for `/`, `?`, `#`, and spaces;
- default click success, missing-item location fallback, explicit location strategy, and unsafe-origin rejection;
- absent conversation configuration returning empty list/null observer/failed navigation.

Expected output: all assertions pass and the script prints the branch count. Delete the temporary script with `apply_patch` after the smoke.

**Step 2: Keep P1-04 in progress**

Change P1-04 from `未开始` to `进行中`. The shared DSL and deterministic smoke close the implementation path, while formal tests and a real SitePack sidebar regression remain pending on the dynamic registry/test harness.

### Task 5: Verify, review, commit, and push

**Files:**

- Verify only: `src/adapters/declarative/adapter.ts`
- Verify only: `docs/developer/site-adapter-pluginization-tasks.csv`
- Verify only: `docs/plans/2026-07-28-declarative-adapter-conversations.md`

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

Confirm list/title/observer/navigation all share the same extraction helpers, Shadow DOM scanning follows only the manifest flag, URL construction has one same-origin source, no schema or i18n changes were added, and the user's `.gitignore` change is not staged.

**Step 3: Commit and push the closure**

```powershell
git add src/adapters/declarative/adapter.ts docs/developer/site-adapter-pluginization-tasks.csv docs/plans/2026-07-28-declarative-adapter-conversations.md
git commit -m "feat(adapter): add declarative conversation dsl"
git push origin feat/site-adapter-pluginization
```
