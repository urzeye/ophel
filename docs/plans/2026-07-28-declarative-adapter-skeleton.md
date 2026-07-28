# DeclarativeAdapter Skeleton Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the first instantiable `DeclarativeAdapter` that maps a validated `SitePackManifest` onto the existing `SiteAdapter` API without pulling later DSL tasks into P1-01.

**Architecture:** Keep one validated manifest as the adapter's immutable source of truth and implement mappings as explicit methods with defensive copies. Static `matches` patterns activate the adapter in P1-01; detect rules, generic input, outline, conversation-list, generating/session DSL, dynamic registry loading, and capability-driven UI remain in their dedicated follow-up tasks.

**Tech Stack:** TypeScript 5.3, React/Plasmo browser runtime, existing `SiteAdapter` base class and SitePack v1 schema.

---

### Task 1: Add the declarative adapter and static match helper

**Files:**

- Create: `src/adapters/declarative/adapter.ts`
- Reference: `src/adapters/base.ts`
- Reference: `src/adapters/declarative/types.ts`

**Step 1: Enumerate and implement every abstract member**

Implement `match`, `getSiteId`, `getName`, `getThemeColors`, `getTextareaSelectors`, `insertPrompt`, and `getConversationTitle`. `insertPrompt` must return `false` until P1-02 supplies the validated textarea/contenteditable strategies.

**Step 2: Implement static match-pattern evaluation**

Match only `manifest.matches` in P1-01. Support validated exact hosts, `*.` subdomain hosts (including the apex), any port when the pattern omits one, an exact port when explicitly declared, and `*` in the path. Do not evaluate `detect`; P2-04 owns DOM detection and retry semantics.

**Step 3: Implement current-conversation title mapping**

If `conversation.activeMatch` finds an active item, read its `titleSelector` descendant (or the active item itself when no title selector exists). Return normalized non-empty text; otherwise use `getDocumentConversationTitle()` so managed-title filtering and site-name suffix cleanup stay centralized.

### Task 2: Add explicit direct mappings

**Files:**

- Modify: `src/adapters/declarative/adapter.ts`

**Step 1: Map selector and layout getters**

Map textarea, submit, new-chat, stop, response-container, chat-content, user-query, scroll-container, sidebar-scroll-container, and width selectors. Return new arrays/objects so callers cannot mutate the validated manifest.

**Step 2: Map common config getters**

Map export, network monitor, model switcher, Zen, clean, submit key, Quick Quote, Mermaid, and host-theme-sync settings. Clone nested arrays and objects where present. Use the documented defaults: Quick Quote `disabled`, Mermaid `native`, host-theme sync `false`, submit key `Enter`, and a neutral Ophel theme when `theme` is absent.

**Step 3: Preserve future-task boundaries**

Do not implement input mutation, outline extraction, conversation list/observer/navigation, generation visibility, session parsing, delete-on-site, custom export bundle, detect activation, or registry installation/loading.

### Task 3: Export and exercise the skeleton

**Files:**

- Modify: `src/adapters/declarative/index.ts`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Export the adapter**

Export `DeclarativeAdapter` from the declarative barrel without registering an instance in `src/adapters/index.ts`; dynamic loading belongs to P1-06.

**Step 2: Run a focused runtime smoke**

Use `pnpm exec tsx -e` with a hand-written validated manifest and minimal DOM stubs. Assert exact-host and wildcard-host matching, pack-prefixed site ID, defensive-copy getters, direct config mappings, explicit unsupported prompt insertion, active-item title extraction, and document-title fallback.

**Step 3: Update task tracking**

Mark P1-01 as `进行中`. Formal unit tests remain pending until P0-00 provides the test harness, so real completion is not claimed yet.

### Task 4: Verify and deliver the functional closure

**Files:**

- Verify only the files above and the new plan

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

Expected: formatting and type/build checks pass; Lint has no errors and may retain existing repository warnings.

**Step 2: Review scope**

Confirm no dynamic registry changes, no detect implementation, no input/outline/session/generation DSL, no new second source of manifest data, and no staged `.gitignore` change.

**Step 3: Commit and push**

```powershell
git add src/adapters/declarative/adapter.ts src/adapters/declarative/index.ts docs/developer/site-adapter-pluginization-tasks.csv docs/plans/2026-07-28-declarative-adapter-skeleton.md
git commit -m "feat(adapter): add declarative adapter skeleton"
git push origin feat/site-adapter-pluginization
```
