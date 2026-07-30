# HealthCheckManager Test Matrix Design

## Context

P2-08 already has a storage-backed `HealthCheckManager`, delayed selector evaluation, bounded recovery, configuration refresh, warning-reason classification, a panel notice, and an explicit GitHub issue flow. The implementation was exercised with a temporary TypeScript smoke during development, but that file was intentionally deleted and no durable test now protects the acceptance behavior.

Unlike site-specific adapter migrations, P2-08's acceptance boundary is deterministic: page loads, selector results, storage, configuration refresh, and update outcomes are injected or observable through public APIs. The remaining work is therefore persistent regression coverage, not a live-site selector audit.

## Goals

- Prove one failed page load remains pending and a second load with the same configuration shows a warning.
- Prove repeated checks in one load do not manufacture consecutive failures and a healthy load resets history.
- Prove new-conversation pages are exempt without clearing previous failure evidence.
- Prove late selector recovery avoids a false warning.
- Prove registry-update, local-pack, and general site-change reasons are classified correctly.
- Prove manual and watched configuration updates recover the active warning and clear stored failure state.
- Prove the issue URL is built only from a confirmed failure and excludes route/query/page content.
- Prove the panel notice hides the update action for local packs while keeping the explicit report action.

## Selected Approach

Use black-box Vitest tests around the public manager API with:

- a cloned in-memory `PlatformStorage` that implements real watch callbacks;
- deterministic `loadId`, time, configuration context, selector evaluation, and update callbacks;
- the real stored-state reducer, warning reason resolver, update queue, and issue URL builder;
- fake timers only for the exported bounded-recovery helper;
- React server rendering for warning action visibility without adding a browser DOM dependency.

The tests do not call private methods or duplicate the manager's reducer. Separate manager instances share storage to model distinct page loads.

## Alternatives Considered

### Keep the deleted temporary smoke as the only evidence

This cannot protect later refactors and gives CI no signal when threshold, exemption, recovery, or privacy behavior regresses. It is not selected.

### Add a browser-only fixture

A browser fixture is useful for visual changes, but P2-08's remaining behavior is dominated by deterministic state transitions. React server rendering protects the conditional actions, while existing Shadow DOM CSS and theme code are unchanged. A browser-only suite would be slower and less precise for cross-load storage semantics.

### Expose private storage reducer methods

Direct reducer tests would be concise but could pass while the public manager queues, refreshes, or persists incorrectly. Public-API tests are selected.

## Matrix

### Failure history

- First failed load stores count `1` and returns `pending`.
- Second failed load with the same signature stores count `2` and returns `warning`.
- Rechecking within one `loadId` keeps the same count.
- A healthy load removes the stored record; the next failure starts again at `1`.
- A new-conversation load returns `exempt` and leaves prior evidence intact.

### Recovery and refresh

- `waitForAdapterSelectorRecovery()` resolves healthy during its bounded poll window.
- A successful manual configuration update reruns health evaluation, returns `recovered: true`, and clears the warning.
- A watched remote-config storage change refreshes and recovers an already checked manager.

### Warning semantics and UI

- Registry SitePack with a newer compatible version resolves to `site-pack-update`.
- Local SitePack resolves to `local-site-pack` and renders no update action.
- Built-in or current registry configuration resolves to `site-changed`.
- Both updateable and local warnings retain the explicit report action.

### Report privacy

- Building an issue URL without a confirmed failure throws.
- A confirmed report includes origin, version, and failed selectors but has no page path, query string, DOM, or conversation field.

## Scope Boundaries

- No selector, manager, storage schema, UI, CSS, locale, theme, or Shadow DOM injection behavior changes unless a test exposes a real defect.
- No claim that P0-05's remote transport or P0-11's published registry staging flow is complete.
- No automatic issue submission or telemetry.

## Completion

P2-08 can be marked `已完成` when the focused matrix, full suite, format, focused ESLint, typecheck, Chrome build, userscript build, locale parity, and `git diff --check` all pass. The diff must preserve the current panel structure, 24-theme variable path, Shadow DOM style injection, and the user's unstaged `.gitignore` change.
