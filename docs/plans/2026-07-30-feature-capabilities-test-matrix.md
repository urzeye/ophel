# Feature Capabilities Test Matrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add durable regression coverage for P1-09's feature-capability contract and UI visibility boundaries.

**Architecture:** Exercise the real shared matrix, base adapter API, declarative descriptors, locale resources, and theme presets in Vitest. Use focused source-boundary assertions for the large React consumers so no browser-only dependency or new UI test stack is introduced.

**Tech Stack:** TypeScript 5.3, Vitest 3.2.4, React 18 source boundaries, Plasmo Shadow DOM style injection, and the existing theme/i18n resources.

---

### Task 1: Cover the capability contract and built-in matrix

**Files:**

- Create: `src/adapters/feature-capabilities.test.ts`

1. Assert the canonical vocabulary has 13 unique entries and signature round trips are stable.
2. Assert each of the 15 built-in sites equals the full vocabulary minus its documented omissions.
3. Assert returned built-in sets are defensive, unknown sites resolve empty, and `SiteAdapter.getCapabilities()` remains independent.
4. Assert every built-in config descriptor exposes the same capability list as the shared matrix.

### Task 2: Cover panel and settings UI boundaries

**Files:**

- Create: `src/components/feature-capabilities-ui.test.ts`

1. Guard MainPanel's community-only enforcement, tab mappings, hidden-tab fallback, shortcut/numeric navigation, header actions, and tabpanel rendering.
2. Guard QuickButtons' collapsed/menu mappings and Zen-to-Clean capability check.
3. Guard ConversationsTab's shared capability lookup and removal of `unsupportedSiteLabels`.
4. Guard SiteSettingsPage/SettingsModal/ModelLockSettingsContent capability filters, active-tab normalization, instance-scoped model-lock row, and community notice.
5. Assert the two new notice keys are non-empty in all 11 locales.
6. Assert all 24 presets provide the notice variables and `settings.css` reaches both Shadow DOM and Options paths.

### Task 3: Verify, track, and deliver

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

1. Run the two focused tests, then the full suite.
2. Run format, focused ESLint, typecheck, registry validation, extension build, userscript build, and `git diff --check`.
3. Review for a second capability source, built-in gating regressions, hidden navigation paths, missing locales, theme-variable gaps, style-injection drift, generated files, and `.gitignore` staging.
4. Mark P1-09 `已完成`, commit with `test(adapter): cover feature capability gating`, and push.
