# Stable Element Selector Generator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate stable, unique CSS selectors from picked page elements and explicitly request manual input when no durable selector exists.

**Architecture:** A pure browser module ranks local selector candidates, validates them through a cached deep-query context spanning open Shadow Roots, and performs a bounded ancestor-chain search with reduction. A temporary Vite library bundle and Playwright browser smoke exercise the real module against at least ten DOM fixtures without adding a test dependency.

**Tech Stack:** TypeScript 5.3, native DOM/CSS selector APIs, existing `DOMToolkit` depth semantics, shared SitePack selector length limit, Vite, and Playwright CLI.

---

### Task 1: Define stable selector primitives

**Files:**

- Create: `src/core/element-selector-generator.ts`

**Step 1: Add result and validation types**

Define generated/manual-required discriminated results, strategies, failure reasons, selector validation output, root options, and internal ranked segment types.

**Step 2: Implement CSS escaping**

Use `CSS.escape` with the project's established fallback for identifiers. Add a separate quoted-attribute escaping function for backslashes, quotes, and line breaks.

**Step 3: Implement stability filters**

Export `isStableSelectorClassName()`. Add stable ID checks, volatile aria exclusions, CSS-in-JS/hash/utility patterns, length limits, and deterministic token sorting.

### Task 2: Generate and validate local candidates

**Files:**

- Modify: `src/core/element-selector-generator.ts`

**Step 1: Cache deep query roots**

Collect the supplied root plus nested open Shadow Roots once per generation, bounded to the existing DOM toolkit depth. Deduplicate query results by element identity.

**Step 2: Emit candidates in required priority**

Generate data-testid, stable ID, non-state aria, stable one-to-three class combinations, and tag fallback candidates. Deduplicate and sort by quality then length.

**Step 3: Expose manual selector validation**

Return syntax validity, match count, and target inclusion. Preserve browser syntax errors instead of silently treating them as zero matches.

### Task 3: Add bounded ancestor-chain generation

**Files:**

- Modify: `src/core/element-selector-generator.ts`

**Step 1: Validate direct candidates**

Return the first direct candidate that uniquely matches the picked element.

**Step 2: Build stable ancestor options**

Collect up to eight same-tree ancestors and retain their top stable identity candidates, excluding generic tag-only anchors.

**Step 3: Search one- and two-ancestor chains**

Build ordered descendant chains, rank them globally, deduplicate selectors, enforce the shared 500-character limit and an explicit attempt budget, then validate until the best unique chain is known.

**Step 4: Shrink successful chains**

Remove ancestor segments one at a time whenever the shorter selector remains unique for the target. Return `manual-required` for disconnected, out-of-root, ambiguous, or budget-exhausted cases.

### Task 4: Verify with real browser DOM fixtures

**Files:**

- Create temporarily: `.tmp-selector-generator-smoke.html`
- Create temporarily: `.tmp-selector-generator-smoke.ts`
- Create temporarily: `.tmp-selector-vite.config.ts`

**Step 1: Check Playwright CLI prerequisites**

Verify `npx` is available and try the skill wrapper. If the installed package does not expose the documented CLI bin, use the configured Playwright browser tool without adding anything to `package.json`.

**Step 2: Add at least ten fixtures**

Cover unique/duplicate data-testid, stable/generated ID, aria identity versus state, class combinations, hash and utility filtering, unique ancestor scoping, two-ancestor reduction, manual-required ambiguity, open Shadow DOM, invalid selector validation, and a reconstructed DOM preserving the selector.

**Step 3: Run the Vite bundle in Chromium**

Build the smoke entry as a temporary Vite IIFE, inject it into a clean Chromium page with Playwright, snapshot the final result, and require the page to report `selector generator smoke passed` with the fixture count and no console errors.

**Step 4: Remove temporary files and stop the server**

Delete all temporary source/config files with `apply_patch`, close the Playwright page, and remove only the verified `output/p3-02-selector-smoke` bundle directory.

### Task 5: Track, verify, commit, and push

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`
- Verify: all files above

**Step 1: Mark P3-02 in progress**

Change only P3-02 from `未开始` to `进行中`; real unsupported-site refresh acceptance remains open for P3-03.

**Step 2: Run repository checks**

```powershell
node scripts/compare_locales.js
pnpm format:check
pnpm exec eslint src/core/element-selector-generator.ts
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

**Step 3: Review structural boundaries**

Confirm no positional selectors, visible text, duplicate selector-length constant, cross-shadow combinator claim, silent syntax fallback, dependency change, generated artifact, temporary smoke file, or `.gitignore` staging.

**Step 4: Commit and push P3-02 only**

```powershell
git commit -m "feat(wizard): generate stable element selectors"
git push origin feat/site-adapter-pluginization
```
