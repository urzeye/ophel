# DeclarativeAdapter Generic Outline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract declarative conversation outlines from configured response containers with ordered user-query and heading items, hierarchical word counts, and inline-bookmark compatibility.

**Architecture:** Build one DOM-ordered candidate sequence from the configured user-query selector plus `h1` through the requested maximum level. User queries remain in the candidate sequence even when hidden from the returned outline so they can delimit conversation turns; heading word counts stop at the next same-or-higher heading or user query, while user-query counts stop at the next user query. Reuse the base `calculateRangeWordCount()` and inherited `getInlineBookmarkItems()` instead of creating parallel outline or bookmark logic.

**Tech Stack:** TypeScript 5.3, browser DOM APIs, existing `SiteAdapter` outline APIs and declarative SitePack v1 selectors.

---

### Task 1: Build a scoped declarative outline candidate sequence

**Files:**

- Modify: `src/adapters/declarative/adapter.ts`
- Reference: `src/adapters/base.ts`
- Reference: `src/core/outline/dom-outline.ts`

**Step 1: Resolve the configured response container**

Read `selectors.responseContainer` and resolve its first matching element through the base Shadow DOM-aware selector helper. Return an empty outline when the selector is absent or no container is mounted; do not fall back to `document`, `body`, or a scroll container because that would broaden the pack's declared scope.

**Step 2: Query user and heading candidates together**

Clamp the requested heading level to `1..6`, build `h1` through `hN`, and add `selectors.userQuery` when present. Query once inside the response container, classify user-query matches as level `0`, and parse heading levels from their tag names.

**Step 3: Exclude Ophel-owned DOM**

Reject a candidate when it or an ancestor up to the response container has any class beginning with `gh-`. This excludes the panel, rendered user-query helpers, queue UI, bookmark decorations, and future Ophel containers without hard-coding each component class.

**Step 4: Sort explicitly by DOM order**

Sort accepted candidates with `compareDocumentPosition()` and `Node.DOCUMENT_POSITION_FOLLOWING/PRECEDING`. Keep user-query candidates with empty text as non-rendered turn boundaries; reject empty heading text because it cannot produce a navigable outline item.

### Task 2: Produce outline items and hierarchical word counts

**Files:**

- Modify: `src/adapters/declarative/adapter.ts`

**Step 1: Emit user queries only when requested**

Read user-query text through the base `extractUserQueryText()` so line-break handling and later `findUserQueryElement()` matching stay aligned. Emit `{ level: 0, isUserQuery: true }` only when `includeUserQueries` is true and the extracted text is non-empty; do not invent a second truncation policy that is absent from the SitePack schema.

**Step 2: Emit headings through the configured maximum level**

Read trimmed heading `textContent` and emit the parsed heading level, text, and original element. Preserve the flat DOM sequence so `OutlineManager` can build its existing user-query/heading tree without adapter-specific metadata.

**Step 3: Calculate word counts from the shared candidate boundaries**

When `showWordCount` is true, call `calculateRangeWordCount(current, boundary, container)`:

- a user query ends at the next user query, covering its full assistant turn;
- a heading ends at the next user query or the next heading whose level is less than or equal to the current heading;
- the final item falls back to the response-container end.

Do not calculate or attach `wordCount` when the option is false.

### Task 3: Verify inline-bookmark compatibility and edge cases

**Files:**

- Create temporarily, then delete: `.tmp-declarative-outline-smoke.ts`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Run a focused fake-DOM smoke**

Create the temporary script with `apply_patch`, run it with `pnpm exec tsx`, and use a `DeclarativeAdapter` test subclass that supplies a fake response container and records `calculateRangeWordCount()` boundaries. Cover:

- deliberately unsorted user-query and `h1..h6` query results returning in real DOM order;
- `maxLevel` filtering and empty heading omission;
- `.gh-*` self/ancestor exclusion;
- user-query inclusion on/off without losing turn boundaries;
- user-query, nested-heading, peer-heading, next-turn, and final-container word-count boundaries;
- missing response container and missing user-query selector;
- inherited `getInlineBookmarkItems()` returning connected headings and user queries while filtering disconnected elements.

Expected output: every assertion passes and the script prints the exercised branch count. Delete the temporary script with `apply_patch` after the smoke.

**Step 2: Keep P1-03 in progress**

Change P1-03 from `未开始` to `进行中`. The implementation and deterministic DOM smoke close the generic algorithm, while formal unit tests remain pending on the repository test harness and a real SitePack page can be regressed after dynamic pack activation lands.

### Task 4: Verify, review, commit, and push

**Files:**

- Verify only: `src/adapters/declarative/adapter.ts`
- Verify only: `docs/developer/site-adapter-pluginization-tasks.csv`
- Verify only: `docs/plans/2026-07-28-declarative-adapter-outline.md`

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

Confirm the implementation never queries outside `responseContainer`, does not duplicate the base inline-bookmark implementation, does not add message-block or assistant-response assumptions, does not add schema/i18n changes, and does not stage the user's `.gitignore` change.

**Step 3: Commit and push the closure**

```powershell
git add src/adapters/declarative/adapter.ts docs/developer/site-adapter-pluginization-tasks.csv docs/plans/2026-07-28-declarative-adapter-outline.md
git commit -m "feat(adapter): add declarative outline extraction"
git push origin feat/site-adapter-pluginization
```
