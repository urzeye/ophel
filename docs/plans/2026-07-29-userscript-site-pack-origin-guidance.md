# Userscript SitePack Origin Guidance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect SitePack origins missing from a userscript manager's effective match rules and guide users through adding persistent custom matches.

**Architecture:** Resolve manager metadata through a small platform utility, reuse the existing SitePack origin-reference graph as the required-origin truth source, and render a userscript-only guidance panel in `SitePacksPage`. Keep extension registration, themes, and the userscript release metadata unchanged.

**Tech Stack:** TypeScript, React 18, GM_info, existing SitePack core utilities, native Clipboard API, shared settings CSS, eleven-locale i18n, pnpm/Plasmo/Vite verification.

---

### Task 1: Add userscript match coverage primitives

**Files:**

- Create: `src/platform/userscript-match-coverage.ts`
- Modify: `src/vite-env.d.ts`

**Step 1:** Define a narrow `GM_info`-compatible input shape and a resolver for manager name plus effective match rules.

**Step 2:** Merge base/original/user rules according to `merge_matches`, deduplicate them, and fall back to metadata text when structured matches are unavailable.

**Step 3:** Add full-origin coverage matching for HTTPS, wildcard scheme/host, apex/subdomain wildcard behavior, optional ports, and `<all_urls>`.

**Step 4:** Run representative fixture assertions through `pnpm exec tsx`.

### Task 2: Render missing-origin guidance

**Files:**

- Modify: `src/tabs/options/pages/SitePacksPage.tsx`
- Modify: `src/styles/settings.css`

**Step 1:** Derive enabled SitePack origin references from installed packs and bindings, then collapse covered origins.

**Step 2:** On userscript only, filter references through the effective match coverage helper.

**Step 3:** Reuse that reference graph for binding status so covered origins are available, uncovered origins request a match rule, and bindings without enabled references stay disabled.

**Step 4:** Replace the unconditional userscript warning with a conditional panel listing missing rules and a copy action.

**Step 5:** Add a three-step manager workflow and explicit clipboard failure feedback.

**Step 6:** Add responsive, focus-visible, light/dark-compatible styles using existing `--gh-*` variables.

### Task 3: Localize and document the workflow

**Files:**

- Modify: `src/locales/zh-CN/index.ts`
- Modify: `src/locales/zh-TW/index.ts`
- Modify: `src/locales/en/index.ts`
- Modify: `src/locales/ja/index.ts`
- Modify: `src/locales/ko/index.ts`
- Modify: `src/locales/it/index.ts`
- Modify: `src/locales/de/index.ts`
- Modify: `src/locales/es/index.ts`
- Modify: `src/locales/fr/index.ts`
- Modify: `src/locales/pt/index.ts`
- Modify: `src/locales/ru/index.ts`
- Modify: `README.md`
- Modify: `README_zh-CN.md`

**Step 1:** Add the status, description, unknown-manager label, and three workflow steps to all eleven application locales.

**Step 2:** Add a concise userscript custom-origin FAQ to English and Simplified Chinese user documentation, covering Tampermonkey, Violentmonkey, and ScriptCat.

### Task 4: Update task state and verify

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1:** Change only P2-03 from `未开始` to `进行中`; cross-manager runtime acceptance remains P2-09.

**Step 2:** Run focused fixture assertions, `pnpm format:check`, `pnpm lint:check`, `pnpm typecheck`, `pnpm build`, `pnpm build:userscript`, and `git diff --check`.

**Step 3:** Inspect the focused diff and generated userscript metadata. Do not stage `.gitignore`, builds, or other generated output.

### Task 5: Commit and push

**Step 1:** Stage only the P2-03 implementation, localization, documentation, plan files, and CSV status.

**Step 2:** Commit with `feat(userscript): guide custom SitePack matches`.

**Step 3:** Push `feat/site-adapter-pluginization` and verify local/remote HEAD equality.

## Completion evidence

- Tampermonkey 5.5.0 on Chrome 150 showed the exact copied rule `https://custom-origin.example.com/*` and the three documented steps.
- Before adding the rule, the binding showed one reference and `Match rule needed`; after saving it under Tampermonkey user matches and loading the custom origin, Ophel injected successfully, the guide disappeared, and the binding showed `Available`.
- The real custom-origin page exposed the userscript host, Shadow Root, app container, and panel root with no page errors.
