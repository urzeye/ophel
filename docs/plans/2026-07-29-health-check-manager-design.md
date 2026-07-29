# HealthCheckManager Design

## Context

SitePack and built-in selector configuration can now be updated independently of an Ophel release,
but a page currently has no active signal when its input, response container, or conversation
content selectors stop matching. A single transient miss is not enough evidence: host applications
hydrate slowly, users can open a new-conversation route with no messages, and self-hosted instances
can have materially different load times.

The main content logic and the Plasmo panel are separate bundles. A module singleton created by
`modules-init.ts` is therefore not a reliable UI state source. The health manager will live in
`src/core/`, but its one runtime instance will be owned by the panel bundle that renders the warning.
Durable failure history, rather than a cross-bundle global, provides continuity across page loads.

## Goals

- Start after DOM readiness and an 8-second activation delay.
- Exempt new-conversation pages from both success and failure accounting.
- Check only configured core selector groups: `textarea`, `responseContainer`, and, on a user
  conversation page, `chatContent`.
- Give a late-rendering page a bounded recovery window before recording a failed load.
- Persist one result per page load/configuration signature and show a warning only after two
  consecutive applicable failed loads.
- Distinguish a registry SitePack with a compatible cached update from a current registry pack, a
  local import, and a built-in adapter.
- Apply newly cached built-in patches or installed SitePack manifests to the active adapter, rerun
  health checks, and clear the warning automatically when the selectors recover.
- Open, but never submit, a prefilled GitHub issue containing the site, Ophel/config versions,
  origin, and failed selector groups.

## Non-goals

- No telemetry, automatic issue submission, or page DOM upload.
- No selector repair, heuristic selector generation, or arbitrary SitePack code execution.
- No new setting or user-dismissed health-warning state; a confirmed warning remains until the
  selector configuration succeeds.
- No backup/WebDAV inclusion for operational health history.
- No second theme or Shadow DOM style-injection path.

## Considered approaches

### 1. UI-local checks without a core manager

This is the smallest JSX change, but it would mix storage mutation, selector evaluation, update
classification, and rendering. It also makes route/config refresh behavior hard to verify and
invites a second source when another consumer needs the state.

### 2. A manager in `modules-init.ts` with a custom event bridge

This centralizes the check in the main content bundle, but the panel is a separately bundled
consumer. A durable event snapshot, replay protocol, and cleanup bridge would be required solely to
move state between bundles, while the UI bundle already has the active adapter and platform storage.

### 3. Core observable manager owned by the panel bundle

This is the selected design. `HealthCheckManager` owns scheduling, persistence, update refresh, and
an immutable observable snapshot. A small React hook owns its lifecycle and `MainPanel` renders only
the snapshot. Storage remains the sole cross-load source, while the manager remains independently
smoke-testable through injected selector/config callbacks.

## Selector semantics and slow-load handling

The manager first checks `adapter.isNewConversation()`. An exempt page neither increments nor clears
the previous record. On other pages it builds checks only for non-empty selector declarations:

- `textarea`: at least one configured selector must resolve to a valid, visible editor outside
  Ophel UI. Share pages skip this writable-editor check.
- `responseContainer`: the configured selector must exist.
- `chatContent`: when `adapter.isUserConversationPage()` is true, at least one configured selector
  must exist.

Queries use the existing Shadow DOM-aware `DOMToolkit` path with caching disabled. If the first scan
after 8 seconds fails, a bounded four-second `MutationObserver` recovery window reruns the scan after
relevant DOM/class/visibility mutations. A recovered page is stored as success; an unresolved page
records one failed load. Observer and timers are always cancelled on route change or destroy.

## Durable failure state

`sitepacks/health` stores a schema-versioned record map keyed by `siteInstanceKey`. Each failure
contains the configuration signature, page-load id, timestamp, failed groups, exact selectors, and
consecutive count. The reducer follows these rules:

- success removes the current instance record;
- the first failure for a signature records count `1` but renders no warning;
- a later page load with the same signature increments the count;
- repeated checks in the same page load update evidence without incrementing the count;
- a changed configuration signature starts again at count `1` if it still fails.

This makes the threshold about page loads rather than polling attempts and prevents manual checks or
SPA navigation from manufacturing a second failure.

## Configuration refresh and warning reason

A shared adapter-config runtime applies cached configuration and returns structured metadata:

- configurable built-ins resolve base config plus the active compatible patch and apply it to the
  current adapter;
- non-configurable built-ins use the bundled Ophel version as their signature;
- declarative adapters expose immutable package metadata and accept only a same-id, non-rollback
  manifest replacement from the installed-pack snapshot.

The manager watches both remote-registry and installed-pack storage keys. After its initial check,
either change triggers a debounced refresh and recheck. Manual “Check configuration updates” first
uses the existing platform remote-config API, which also synchronizes registry packages, then runs
the same refresh/recheck path.

The warning reason is derived from current metadata, not inferred in JSX:

- `site-pack-update`: registry source and the compatible cached package is newer than the active
  manifest;
- `local-site-pack`: local import, which is never presented as automatically updateable;
- `site-changed`: built-in or latest registry configuration still fails.

Local imports omit the update button and explain that a newer JSON can be imported manually.

## Panel and report flow

The preserve-mode warning is inserted between the panel header/notices and tabs. It uses semantic
markup, a compact warning icon, existing `--gh-*` surfaces/text/border variables, visible focus and
disabled states, and the existing `src/style.css` Shadow DOM injection chain. It has no dismiss
button because hiding a confirmed compatibility failure would create false recovery.

“Report issue” builds a GitHub issue-form URL and opens it through `platform.openTab`. Only the page
origin is included; the path, query string, page content, and user data are excluded. The form is
prefilled with Ophel version, platform type, adapter/package version and source, and the failed
selector list. Submission remains an explicit user action on GitHub.

## Error handling

- Invalid health storage is surfaced as a manager error and console error; it is not treated as a
  successful health result.
- A rejected or incompatible cached built-in patch leaves the last valid/base config active and is
  logged with its structured resolution outcome.
- Remote update failures keep the existing warning and expose an inline localized error.
- A missing/disabled installed package never causes a registry-update claim; unknown provenance is
  treated conservatively as non-updateable.
- Destroy and route changes invalidate in-flight checks so stale async results cannot overwrite the
  current page state.

## Verification

- Deterministic TypeScript smoke: first/second load threshold, same-load deduplication, success
  reset, new-page exemption, delayed recovery, update reason, latest reason, local-source reason,
  manual update recovery, storage-watch recovery, and report URL fields.
- Source/UI checks: local packs have no update action; warning uses the existing panel style
  injection path; light/dark/custom themes inherit current variables; focus, disabled, error, and
  reduced-motion states are present.
- Locale parity across all 11 application languages.
- `pnpm format:check`, lint with generated research output excluded, `pnpm typecheck`, Chrome build,
  userscript build, and `git diff --check`.
