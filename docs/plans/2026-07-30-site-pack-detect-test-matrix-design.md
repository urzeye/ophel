# SitePack Detect Test Matrix Design

## Context

P2-04 already implements declarative `selectorExists` and `metaGenerator` rules, URL gating, bounded mutation retries, adapter-registry precedence, immutable in-memory candidate state, and rollback-safe detect-to-explicit switching. Development used a temporary TypeScript smoke, while the durable suite currently protects schema validation and one registry-order scenario only.

The remaining acceptance boundary is deterministic and local. DOM rule results, timers, observer callbacks, installed-pack order, origin bindings, permission outcomes, reconciliation, and panel rendering can all be driven through public APIs without a real account or remote site.

## Goals

- Prove selector and generator hit/miss behavior, rule-field AND, rule-list OR, case-insensitive generator matching, and invalid-selector isolation.
- Prove empty-match detect packs, URL-gated detect packs, and matches-only packs keep distinct semantics.
- Prove delayed mutation hits, settle scans, timeout, attempt limits, observer-unavailable behavior, and issue deduplication.
- Preserve existing registry evidence for built-in > explicit > detect-by-install-time > static precedence and pure matches compatibility.
- Prove detection state is ordered, cloned, and non-persistent.
- Prove candidate selection validates the active detect state, requests the exact origin, writes one explicit binding, reconciles, and rolls back on failure.
- Prove the multi-candidate notice renders only when needed and remains wired to selection plus page reload.

## Selected Approach

Use three focused Vitest files:

1. a fake-document harness for `src/adapters/declarative/detect.ts`, using real rule/scanner functions and deterministic fake timers;
2. hoisted module mocks around `src/adapters/site-pack-detection.ts`, exercising its public state and selection APIs against a mocked PackManager/platform boundary;
3. React server rendering plus source checks for the existing detection notice and App reload wiring.

The existing `src/adapters/index.test.ts` remains the registry-precedence proof and runs in the focused batch. Tests do not expose private methods, add DOM emulators, or duplicate the production rule evaluator.

## Alternatives Considered

### Restore a temporary smoke script

This would reproduce the original evidence but disappear again after delivery. It is not selected because CI needs durable coverage.

### Add jsdom or another DOM dependency

The detect module uses only `querySelector`, generator meta attributes, `documentElement`, timers, and an injected observer factory. A small typed fake document covers that surface without increasing dependencies or browser bundle risk.

### Test switching through a full browser extension

That would mix P2-04 with P2-02 permission UI and P2-09 cross-browser regression. Mocking the explicit platform boundary gives deterministic success, denial, stale-binding, and rollback coverage; existing production builds still verify static wiring.

## Matrix

### Rule and package evaluation

- Selector hit and miss.
- Generator name/content matching with trimmed case-insensitive substring semantics.
- Selector plus generator in one rule require both predicates.
- Multiple rules match when any one complete rule matches.
- Invalid selector records pack/rule context and does not block a later valid rule.
- Empty `matches` permits detect eligibility on a bound origin.
- Non-empty `matches` must match the URL before DOM evaluation.
- No `detect` rules means the package is not part of the detect pool.

### Bounded scanning

- Immediate hit returns `matched` after the configured settle scan.
- A mutation schedules one throttled scan and resolves a delayed hit.
- No observer records `observer-unavailable` and performs a bounded final scan.
- Timeout and attempt-limit return distinct statuses and disconnect observers/timers.
- Repeated identical issues are deduplicated.

### Registry, state, and switching

- Existing index tests keep built-ins first, explicit bindings authoritative, detect candidates ordered by installation time, and static matches last.
- Recorded matches sort by `installedAt` then pack ID and returned snapshots cannot mutate runtime state.
- Unknown candidates, stale non-detect bindings, and denied origin permission fail before persistence.
- Successful selection writes `{ mode: "explicit", packId }` and reconciles once.
- Reconciliation failure restores the previous detect binding and reconciles again; rollback failure reports both errors.

### Panel and wiring

- Zero/one candidate renders no notice.
- Multiple candidates render the active pack, selector, disabled initial switch action, and theme-prefixed classes.
- `App` awaits selection before reloading the page.
- Existing `src/style.css` remains injected through `data-text:~style.css` with focus, disabled, error, and reduced-motion rules.

## Scope Boundaries

- No detect schema, timeout, precedence, storage, permission, UI, CSS, locale, or platform behavior change unless a test exposes a real defect.
- No claim that P2-02's full visible authorization flow or P2-09's browser-manager matrix is rerun here.
- No new persisted selected-candidate state or fallback around explicit bindings.

## Completion

P2-04 can be marked `已完成` when the focused detect/index/state/UI matrix, full suite, format, focused ESLint, locale parity, typecheck, Chrome build, userscript build, and `git diff --check` pass. The diff must preserve the single origin-binding truth, current Shadow DOM/theme injection, and the user's unstaged `.gitignore` change.
