# SitePack Detect Rules Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Activate detected SitePacks on user-bound origins with deterministic precedence, bounded DOM retries, and an explicit candidate switcher.

**Architecture:** Add a pure declarative detect evaluator plus a bounded observer-driven scanner. Extend the adapter registry to classify explicit, detected, and static candidates while keeping built-ins first. Expose an in-memory detection snapshot and a rollback-safe helper that converts a selected detect binding to the existing explicit binding; render only a small panel notice for multi-hit pages.

**Tech Stack:** TypeScript 5.3, React 18, existing PackManager/platform storage, DOM `MutationObserver`, Plasmo Shadow DOM style injection, and temporary `tsx` behavior smokes.

---

### Task 1: Document and track detect activation

**Files:**

- Create: `docs/plans/2026-07-29-site-pack-detect-rules-design.md`
- Create: `docs/plans/2026-07-29-site-pack-detect-rules.md`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv:36`

**Steps:**

1. Record rule composition, URL gating, retry bounds, precedence, switch rollback, and UI/theme constraints in the design document.
2. Record file-level implementation and verification tasks in this plan.
3. Change only P2-04 from `未开始` to `进行中`.
4. Run `git diff --check` and confirm `.gitignore` remains unrelated and unstaged.

### Task 2: Implement pure detect primitives and bounded retry

**Files:**

- Create: `src/adapters/declarative/detect.ts`
- Reference: `src/adapters/declarative/types.ts`
- Reference: `src/adapters/declarative/match-pattern.ts`

**Steps:**

1. Add typed rule-evaluation results that isolate selector errors and use case-insensitive generator content matching.
2. Implement URL gating plus rule-array OR/rule-field AND semantics for validated manifests.
3. Implement immediate scan plus throttled `MutationObserver` retry with 5,000 ms/40-attempt bounds and a 100 ms settle scan; return matches, attempts, timeout state, and issues.
4. Run a temporary pure-function smoke covering hit/miss, malformed selector, URL gating, and matches-only behavior.

### Task 3: Integrate registry precedence and detection state

**Files:**

- Modify: `src/adapters/index.ts`
- Create: `src/adapters/site-pack-detection.ts`
- Modify: `src/adapters/declarative/adapter.ts` (only shared URL/detect metadata helpers if required)

**Steps:**

1. Load bindings and enabled packs, preserve built-in precedence, and explicitly sort detect candidates by `installedAt` then id.
2. Treat an explicit binding as authoritative and exclude its duplicate static entry.
3. For detect bindings, await the bounded scanner, place all hits before static adapters, and exclude non-hit detect-capable packages from the bound-origin static fallback.
4. Store an immutable in-memory detection snapshot and expose candidate metadata plus a getter for UI/smokes.
5. Log timeout and isolated rule issues without rejecting unrelated packages.
6. Run a registry smoke for all priority branches, delayed mutation activation, timeout, and stale explicit binding.

### Task 4: Add rollback-safe candidate switching and panel notice

**Files:**

- Modify: `src/adapters/site-pack-detection.ts`
- Create: `src/components/SitePackDetectionNotice.tsx`
- Modify: `src/components/App.tsx`
- Modify: `src/components/MainPanel.tsx`
- Modify: `src/style.css`
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

**Steps:**

1. Add a helper that verifies a candidate, rewrites the current detect binding to explicit, reconciles, and restores detect on failure.
2. Add a compact semantic notice only when multiple candidates match; use the existing `SelectDropdown`, `Button`, `--gh-*` variables, and complete focus/disabled/reduced-motion states.
3. On successful selection reload the current page so main/UI bundles converge on the explicit binding.
4. Add and parity-check all new locale keys across the 11 application languages.
5. Run a component/type smoke and inspect light/dark/custom-theme style paths.

### Task 5: Verify, review, commit, and push

**Files:**

- Create temporarily, then delete: `.tmp-site-pack-detect-smoke.ts`

**Steps:**

1. Exercise matcher, registry, timeout, delayed mutation, multi-hit ordering, stale explicit, and switch rollback scenarios.
2. Run:

```powershell
pnpm exec tsx .tmp-site-pack-detect-smoke.ts
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

3. Review for one binding source, no generated-file edits, no manifest permission expansion, and preserved `.gitignore` changes.
4. Commit and push with `feat(adapter): activate detected site packs`.
