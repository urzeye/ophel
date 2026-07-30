# Userscript L3 Code Plugin Evaluation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Complete P4-01 with an evidence-backed go/no-go decision for userscript-only imperative adapter plugins.

**Architecture:** Treat the current production userscript metadata and storage model as the trust boundary, compare every proposed loading mechanism against Tampermonkey, Violentmonkey, ScriptCat, distribution-policy, and L1 promotion requirements, then record one explicit decision. This task changes documentation only; it must not add a runtime loader, executable schema field, or new userscript grant.

**Tech Stack:** Vite userscript build, vite-plugin-monkey, Tampermonkey/Violentmonkey/ScriptCat metadata models, Markdown architecture documentation, existing SitePack task CSV.

---

### Task 1: Establish the current privilege and data boundary

**Files:**

- Read: `vite.userscript.config.ts`
- Read: `src/platform/userscript/entry.tsx`
- Read: `src/platform/userscript/index.ts`
- Read: `src/platform/userscript/resource-manifest.ts`
- Read: `src/types/settings.ts`
- Read: `src/core/backup-codec.ts`
- Read: `src/adapters/declarative/validate.ts`

**Step 1:** Record the production userscript's match scope, document-start timing, `@grant` list, `@connect *`, and existing `@require` execution model.

**Step 2:** Record the data reachable from the same userscript context, including page DOM, GM storage, WebDAV credentials, Claude session keys, cookies, and arbitrary cross-origin requests.

**Step 3:** Contrast the executable-code boundary with L2 SitePacks, whose unknown keys, unsafe CSS, expressions, and JavaScript URLs are rejected by the shared validator.

### Task 2: Compare loading and isolation approaches

**Files:**

- Create: `docs/plans/2026-07-30-userscript-l3-plugin-evaluation-design.md`

**Step 1:** Evaluate build-time or remote `@require`, user-pasted/fetched code with `eval` or `Function`, page-world script injection, Worker/iframe isolation, separately installed companion userscripts, and full source self-builds.

**Step 2:** For every approach, assess privilege separation, integrity and updates, manager portability, DOM access, failure containment, reviewability, and distribution-policy impact.

**Step 3:** Classify concrete risks by severity and state which assets each risk exposes.

**Step 4:** Make one explicit overall decision and list measurable gates for any future reconsideration.

### Task 3: Align the architecture plan and task ledger

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-plan.md`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1:** Update the three-layer architecture and hard constraints to state that in-process/runtime-loaded L3 plugins are rejected, while source self-builds and L1 pull requests remain available.

**Step 2:** Link the P4-01 evaluation from the Phase 4 backlog summary.

**Step 3:** Mark P4-01 complete only after the report contains the risk list and go/no-go recommendation.

### Task 4: Verify and deliver the documentation-only batch

**Files:**

- Review all P4-01 files above.
- Do not stage or modify the user's root `.gitignore` change.

**Step 1:** Run `pnpm format:check`.

Expected: all Markdown and CSV files match repository formatting.

**Step 2:** Run `git diff --check` and review the complete diff.

Expected: no whitespace errors, executable loader, userscript metadata change, permission expansion, or unrelated file appears.

**Step 3:** Commit with `docs(userscript): evaluate L3 code plugins` and push the current feature branch.
