# Conversation Initial Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve first-run full conversation synchronization while removing redundant loading, showing cancellable progress, and restoring the sidebar afterward.

**Architecture:** A single ConversationManager task owns automatic and manual synchronization, progress, cancellation, persistence, and restoration. Site adapters retain navigation and pagination details, with a shared bounded DOM loader for ID-based convergence. Initial synchronization metadata is stored with conversations by site/account and survives interrupted runs.

**Tech Stack:** TypeScript, React 18, Zustand persist, Plasmo, Vite userscripts, pnpm.

---

### Task 1: Bounded adapter loading

**Files:** `src/utils/conversation-list-loader.ts`, `src/adapters/base.ts`, `src/adapters/gemini.ts`, and the existing custom conversation loaders.

1. Add optional abort/progress options and explicit boolean completion to the adapter loading contract.
2. Implement bounded readiness and ID-based progress detection, with abort-aware waits.
3. Use it in the base/Gemini loaders; scope Gemini loading detection to the chats section and remove mandatory repeated scrolling.
4. Thread cancellation and incremental snapshots through custom dialog/API loaders without changing their navigation mechanisms.
5. Run targeted TypeScript/ESLint checks and inspect every loader call site.

### Task 2: One synchronization task

**Files:** `src/core/conversation/manager.ts`, `src/core/conversation/index.ts`, `src/stores/conversations-store.ts`, and existing data-reset entry points.

1. Replace initial retry/extra-scroll loops with one automatic/manual task and a shared in-flight promise.
2. Subscribe before loading, persist batches, expose stable progress subscriptions, and preserve partial results.
3. Prevent deletion after cancellation, failure, or incomplete loading.
4. Restore automatic runs to the top and manual runs to their prior position after final collection, unless the user takes control.
5. Persist pending/complete first-run state per site/account; preserve legacy data and backup round trips.
6. Run focused regression checks for single invocation, cancellation, partial results, restoration, and first-run resumption.

### Task 3: Visible progress

**Files:** `src/components/ConversationsTab.tsx`, `src/components/ConversationSyncNotice.tsx`, `src/components/App.tsx`, `src/styles/conversations.css`, and all 11 `src/locales/*/index.ts` files.

1. Route manual synchronization through the manager and derive button loading from the shared task.
2. Render a nonblocking page-level status notice, including loaded count and a stop action, even when the conversations tab is closed.
3. Report completed, incomplete, cancelled, and failed outcomes accurately.
4. Follow `DESIGN.md` state/accessibility rules and existing Shadow DOM/theme injection.
5. Check locale parity and responsive/theme styles statically.

### Task 4: Validation, review, and delivery

**Files:** `CHANGELOG.md`, `CHANGELOG.zh-CN.md`, and the focused implementation diff.

1. Use focused temporary regression checks; the repository currently has no committed test suite, so do not introduce test infrastructure.
2. Run `pnpm format:check`, `pnpm lint:check`, `pnpm typecheck`, `pnpm adapters:validate`, `pnpm build`, `pnpm build:userscript`, and `pnpm build:firefox`.
3. Self-review lifecycle cleanup, account scoping, empty/unready distinction, backup compatibility, and partial-list deletion safety.
4. Add one bilingual Unreleased changelog entry, excluding the user-provided HTML snapshot from Git staging.
5. Commit with an English Conventional Commit, push the new branch, and create a Draft PR with validation and limitations.

### Follow-up: Late readiness and full-history entry points

1. Wait for both the list container and real first rows before scrolling; keep readiness and pagination time budgets separate.
2. Preserve pending initialization after a readiness timeout and resume once late DOM rows or API snapshots arrive, with task deduplication and cancellation cleanup.
3. Observe a stable document root during initial loading so replaced sidebar placeholders do not lose late updates.
4. Keep Grok imports inside the full-history dialog and AI Studio imports on `/library`; missing controls or empty table shells must not certify a partial sidebar snapshot as complete.
5. Cover late first rows, deferred resumption, identity refinement, cancellation, and custom adapter entry contracts with focused regression checks.
