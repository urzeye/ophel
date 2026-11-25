# Conversation Sync Review Implementation Plan

> Execute the approved scope in this branch; preserve the existing site-delete setting.

**Goal:** Keep conversations missing from a sync, let users review and selectively remove local records, and undo cleanup with metadata intact.

**Architecture:** ConversationManager owns a context-scoped, page-lifetime review snapshot and undo batch. Sync only adds or updates records. The panel provides a nonblocking notice and a user-opened searchable review dialog. Cleanup never calls site deletion.

**Tech Stack:** TypeScript, React 18, Zustand, existing DialogOverlay, CSS theme variables, Vitest.

## 1. Data safety

- Modify `src/core/conversation/manager.ts` and its exports.
- Remove syncDeleted and automatic difference deletion. Only successful, nonempty manual syncs create review candidates from the original local snapshot.
- Exclude records observed again, deleted elsewhere, or outside the active context; reject cleanup during sync or after context changes.
- Add local-only cleanup and full-metadata undo; keep existing storage schema unchanged.
- Verify with `pnpm exec vitest run tests/conversation-sync-review.test.ts`.

## 2. Review interaction

- Modify `src/components/ConversationsTab.tsx` and `src/styles/conversations.css`.
- Add `src/components/ConversationSyncReview.tsx` with a compact notice, persistent reopen affordance, searchable multi-select dialog, safe links, fixed action footer and undo.
- Start with no selections. Select-all and invert-selection affect visible search results; footer counts all selections. Closing keeps records. Handle empty results, reappearance and context invalidation.
- Reuse DialogOverlay; inject scoped portal styles without changing shared dialog behavior.

## 3. Localization

- Update all eleven `src/locales/*/index.ts` files together. Remove obsolete sync-deletion prompts and replace misleading missing/deleted language.
- Verify key and interpolation parity.

## 4. Validation and design review

- Run targeted tests, `pnpm typecheck`, targeted formatting/lint, Chrome, Firefox and userscript builds.
- Exercise actual React components in a local fixture with fake conversation data; inspect light/dark, narrow layouts, long translations, filtering, cleanup/undo, keyboard and cancelled/empty sync states.
- Run Impeccable detector once and obtain an independent finish review. Do not change the project design system.

## Validation evidence

- 28 Vitest cases pass, including eleven-locale key and placeholder parity.
- TypeScript and targeted Prettier pass; targeted ESLint has no errors and retains the pre-existing manager any warning.
- Chrome, Firefox and userscript production builds pass.
- Browser fixture uses actual components and manager with synthetic data and isolated storage; local cleanup, undo, filtering, empty/cancel paths, reappearance, context invalidation and keyboard focus were exercised.
- Captures cover light Chinese and dark German at 1280×800, 390×844 and 320×568, plus both panel notices. Independent Impeccable review requested two fixes (dark placeholder contrast and notice close hit target); both were re-captured and scored resolved, disposition ship at that correction scope. DESIGN.md and PRODUCT.md remain unchanged.
