# ChatGPT settings fixes Implementation Plan

**Goal:** Keep ChatGPT settings layout intact and prevent managed tab titles accumulating decorations across disable/enable cycles.

**Architecture:** Restrict ChatGPT width selectors to conversation/composer surfaces. Restore the native document title when TabManager releases ownership, preserving title provenance across reinjection without stripping user-authored emoji.

**Tech Stack:** TypeScript, CSS selectors, Vitest, Chromium.

### Task 1: Confirm regressions

- Inspect `chatgpt-settings.html`, `src/adapters/chatgpt-config.ts`, `src/core/tab-manager.ts`, and `src/utils/conversation-title.ts`.
- Exercise title lifecycle with a document-title fallback adapter, including custom formats and privacy mode.
- Check width selectors against settings and conversation fixtures in Chromium.

### Task 2: Fix ownership boundaries

- Scope legacy and new ChatGPT width rules to chat surfaces and increment config version relative to v1.3.0.
- Preserve the native title before managed writes and restore it on stop, without replacing newer site titles.
- Add focused lifecycle regression tests in `tests/tab-manager.test.ts`.

### Task 3: Verify and deliver

- Run targeted tests, formatting, lint, typecheck, Chrome, Firefox and userscript builds.
- Review the diff, excluding the user-provided HTML snapshot.
- Commit and push `fix/chatgpt-settings-width-title`, then create an English Draft PR.
