# DeclarativeAdapter Direct Mapping Tests Design

## Context

P1-01 introduced an instantiable `DeclarativeAdapter` and explicit mappings from a validated `SitePackManifest` to the existing `SiteAdapter` API. Later tasks have extended the same class with input, outline, conversation, generation, and session behavior, but P1-01 remains open because its original direct-mapping acceptance criterion is protected only by a temporary smoke check rather than durable unit tests.

## Goals

- Instantiate `DeclarativeAdapter` from a comprehensive hand-written SitePack fixture.
- Lock package identity, localized name, theme, capabilities, selectors, and direct configuration mappings.
- Prove callers cannot mutate the adapter's manifest through returned arrays, sets, or nested configuration objects.
- Lock documented defaults for absent optional fields.
- Exercise static `matches` activation without pulling `detect` behavior into P1-01.
- Exercise active-conversation title extraction and document-title fallback.
- Avoid adding a DOM emulation dependency for a small set of structural DOM interactions.

## Selected Approach

Use Vitest's Node environment and test only public adapter methods. Reuse the registry's comprehensive example as the full valid manifest, clone it per test, and provide minimal `window` or `document` fakes only for methods that require location or conversation title access. Spy on the inherited selector lookup method for scroll-container mappings.

This keeps the tests fast and focused while still verifying the adapter boundary. Direct getters run against the real manifest clone, match evaluation runs through the production match-pattern helper, and conversation title tests run through the production title cleanup path.

## Alternatives Considered

### Add jsdom or happy-dom

A complete DOM emulator would simplify element creation, but it would add a dependency and broader environment behavior for tests that need only `location`, `querySelectorAll`, `matches`, and `querySelector`. It is not selected.

### Keep the existing one-off smoke script as evidence

The smoke established initial feasibility but does not run in CI and cannot prevent regressions. It is not sufficient for the task's unit-test acceptance criterion.

## Matrix

### Identity and defaults

- `pack:`-prefixed site ID, localized name, explicit theme, and feature capabilities.
- Neutral theme, empty selectors, nullable configs, `Enter`, `disabled`, `native`, and `false` defaults.

### Selector and config mappings

- Textarea, submit, new-chat, stop, response, chat-content, user-query, scroll, and sidebar selectors.
- Export, network monitor, model switcher, width, Zen, clean, submit-key, Quick Quote, Mermaid, and host-theme-sync configs.

### Defensive copies

- Mutating the original manifest after construction does not affect the adapter.
- Mutating returned arrays, sets, nested metadata, mode styles, or width entries does not affect later reads.

### Browser-facing skeleton behavior

- Exact hosts, wildcard hosts including the apex, optional and explicit ports, HTTPS enforcement, and path wildcards.
- `detect` rules do not activate a non-matching URL.
- Active conversation title uses `activeMatch` plus `titleSelector`; missing active items fall back to the cleaned document title.

## Non-goals

- Retest input mutation, outline extraction, conversation navigation, generation detection, or session parsing owned by P1-02 through P1-05.
- Test dynamic registry loading, installation, or capability-driven UI.
- Introduce runtime changes unless a test exposes a concrete defect.

## Completion

P1-01 can be marked complete when the matrix passes, `DeclarativeAdapter` remains instantiable under typecheck, and both extension and userscript builds stay green.
