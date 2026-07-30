# Anonymous Health Telemetry Evaluation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Complete P4-04 with an evidence-backed privacy and architecture decision for selector-failure health telemetry.

**Architecture:** Treat the existing local-only HealthCheckManager, public zero-data-collection promise, and browser-store consent models as the trust boundary. Compare local diagnostics, user-initiated reports, and default-off background aggregation, then record one explicit decision without adding a telemetry endpoint, event queue, identifier, setting, or permission.

**Tech Stack:** TypeScript health snapshots, Chrome and Firefox extension manifests, Tampermonkey-compatible userscript distribution, Markdown architecture documentation, and the existing SitePack task CSV.

---

### Task 1: Establish the current data boundary

**Files:**

- Read: `src/core/health-check-manager.ts`
- Read: `src/hooks/useAdapterHealthCheck.ts`
- Read: `src/components/SiteAdapterHealthNotice.tsx`
- Read: `src/core/site-adapter-config-runtime.ts`
- Read: `package.json`
- Read: `README.md`
- Read: `docs/plans/2026-07-29-health-check-manager-design.md`

**Steps:**

1. Record which selector-health fields remain local, which fields appear only in the user-previewed GitHub issue, and which remote-config requests contain no user data.
2. Record the current Firefox `data_collection_permissions: none` declaration and the public no-analytics/no-telemetry promise.
3. Confirm that the repository has no Ophel telemetry endpoint, event queue, installation identifier, analytics dependency, or telemetry setting.

### Task 2: Evaluate privacy, policy, and security impact

**Files:**

- Create: `docs/plans/2026-07-30-anonymous-health-telemetry-evaluation-design.md`

**Steps:**

1. Classify site identity, origin, selector strings, failure groups, versions, timestamps, installation identifiers, and transport metadata.
2. Evaluate Firefox built-in data consent, Chrome Web Store disclosure and Limited Use rules, userscript disclosure, public privacy documentation, retention, access, and endpoint-abuse requirements.
3. Compare local-only diagnostics, explicit user-submitted reports, default-off background events, client-side aggregation, and third-party analytics.
4. Make one explicit go/no-go decision and list measurable gates for any future reconsideration.

### Task 3: Align the architecture plan and task ledger

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-plan.md`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Steps:**

1. Update the privacy hard constraint with the P4-04 decision and link the evaluation.
2. Make the Phase 4 summary reflect the completed P4-01 through P4-04 outcomes.
3. Mark P4-04 complete only after the report includes the privacy impact and final recommendation.

### Task 4: Verify and deliver the documentation-only batch

**Files:**

- Review all P4-04 files above.
- Do not stage or modify the user's root `.gitignore` change.

**Steps:**

1. Run `pnpm format:check`.
2. Run `git diff --check` and review the complete diff.
3. Confirm there is no runtime telemetry code, endpoint, setting, locale key, manifest permission, userscript metadata, or privacy-policy behavior change.
4. Commit with `docs(privacy): evaluate health telemetry` and push the current feature branch.
