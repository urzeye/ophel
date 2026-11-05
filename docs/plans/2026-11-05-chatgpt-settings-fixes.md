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

### Task 4: Address review regressions

**Files:** `src/core/tab-manager.ts`, `src/adapters/chatgpt-config.ts`, `tests/tab-manager.test.ts`.

1. Add failing tests for sidebar-first navigation and privacy mode with auto-rename disabled; run `pnpm exec vitest run` to confirm the regressions.
2. Keep title management active for either auto-rename or privacy mode. Capture native provenance before adapter reads clear stale route markers.
3. Change the legacy width scope to `:where(...)` so new-layout normalization retains priority; compare nested widths in Chromium.
4. Run tests, formatting, lint, typecheck and Chrome/Firefox/userscript builds. Review the diff, commit and push to the existing Draft PR.
