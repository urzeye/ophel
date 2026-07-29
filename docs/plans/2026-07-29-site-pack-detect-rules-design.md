# SitePack Detect Rules Design

## Context

P2-02 now persists exact-origin bindings and registers a detect origin for every enabled
SitePack that declares `detect`. The adapter registry still treats those packages as ordinary
static `matches`, so a generic self-hosted ChatUI cannot be identified from its DOM and two
packages cannot be compared deterministically.

## Goals

- Evaluate the v1 `selectorExists` and `metaGenerator` primitives only for a `mode: "detect"`
  origin binding.
- Keep built-in adapters ahead of explicit bindings, detect hits, and static dynamic packages.
- Order detect hits by the persisted `installedAt` timestamp (with pack id as a deterministic
  tie breaker).
- Require a package with both `matches` and `detect` to satisfy a URL match and at least one
  detect rule when it is considered in the detect pool; packages with only `matches` retain the
  existing static behavior.
- Retry delayed DOM rendering through a bounded `MutationObserver` loop and expose the result for
  a small in-panel candidate switcher.
- Use the existing origin binding as the only durable selection state. Choosing a detect candidate
  rewrites that binding to `explicit`, reconciles registrations, and reloads the page.

## Non-goals

- No executable SitePack configuration, arbitrary JavaScript predicates, or shadow-root traversal.
- No new persisted “selected detect pack” field.
- No health-check storage or automatic pack installation; those belong to later phases.
- No changes to built-in adapter matching or the extension/userscript style injection chain.

## Detection semantics

`detect` is a disjunction of rules. A rule is a conjunction of the predicates it declares:

- `selectorExists` uses `document.querySelector` against the host document.
- `metaGenerator` scans `meta[name="generator"]` elements and performs a trimmed,
  case-insensitive substring comparison against `content`.

An empty `matches` array means the package is eligible for any bound origin. When `matches` is
non-empty, at least one validated match pattern must match the current URL before its detect rules
are evaluated. Invalid runtime selectors are recorded as detection issues and treated as a miss;
they cannot reject the whole registry.

## Activation and retry flow

The registry first checks built-ins. An explicit binding is authoritative: if its enabled target
cannot be instantiated, no other dynamic package is silently substituted. For a detect binding,
the registry scans enabled detect-capable packages in explicit `installedAt` order. It performs an
immediate scan, then schedules throttled scans from a `MutationObserver`, capped at 5 seconds and
40 attempts, with a short 100 ms settle scan after the first hit. A timeout is logged with origin,
attempt count, and rule issues. After detection, matching candidates are placed before static
dynamic adapters; detect-capable packages without a hit are excluded from the static fallback on
that bound origin, while pure matches-only packages remain unchanged.

## Candidate switching

When more than one detect candidate matches, the panel shows a compact preserve-mode notice. The
notice reads the in-memory detection result, but writes only through `PackManager.setOriginBinding`.
The switch operation verifies that the selected id is one of the current candidates, changes the
binding to `explicit`, reconciles the existing origin registration, rolls back to `detect` if
reconciliation fails, and then reloads the page so every content-script bundle selects the same
adapter.

## Error handling

- Missing or disabled explicit targets produce a structured console error and no dynamic fallback.
- A malformed detect selector is isolated to its rule; other rules and packages still run.
- Mutation observer setup failures fall back to the bounded final scan and are logged.
- Switching failures surface in the panel and leave the detect binding intact whenever rollback is
  possible; rollback failures are reported with both errors.

## Verification

- Pure matcher smoke: selector hit/miss, generator case-insensitive substring, rule AND/list OR,
  URL gating, empty matches, malformed selectors, and matches-only compatibility.
- Registry smoke: built-in > explicit > detect by install time > static priority, stale explicit
  binding isolation, delayed mutation hit, timeout bound, and duplicate candidate elimination.
- Switch smoke: detect-to-explicit persistence, reconciliation rollback, and reload callback.
- Locale-key parity for all new panel strings, `pnpm format:check`, `pnpm lint:check`,
  `pnpm typecheck`, Chrome/userscript builds, and `git diff --check`.
