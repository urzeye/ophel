# Declarative State Detection Test Matrix Design

## Context

P1-05 maps `generating` and `session` fields from a SitePack manifest to `DeclarativeAdapter` state methods. The implementation already centralizes element visibility and precompiles regular expressions, but its four-state acceptance criterion is backed only by a deleted temporary smoke script.

## Goals

- Prove generation detection requires at least one connected, visible, non-Ophel, positive-size element.
- Prove every configured selector is queried through the adapter's Shadow DOM-aware lookup boundary.
- Lock configured and default session ID behavior.
- Lock omitted, empty, matching, and non-matching new-conversation pattern behavior.
- Lock default and configured share-page prefixes.
- Lock default and configured new-tab URLs, including query/hash preservation and the runtime same-origin assertion.
- Keep tests independent of a full DOM emulator.

## Selected Approach

Use Vitest's Node environment with a mocked DOMToolkit module, public adapter methods, a selector-lookup spy, and small structural element/window fakes. Each fake element supplies only the fields consumed by the production visibility helper: connectivity, `closest()`, computed style, and bounding rectangle.

This exercises the real compiled regexes and state methods while avoiding a new jsdom dependency or access to private helpers.

## Matrix

### Generation state

- Missing generating config and selectors with no candidates return idle.
- A visible candidate on a later selector returns generating.
- `display: none`, `visibility: hidden`, opacity zero, disconnected nodes, zero width, zero height, and Ophel panel descendants remain idle.

### Session state

- Omitted ID regex uses the base last-path-segment fallback.
- Configured ID regex covers capture, mismatch, and empty capture.
- Omitted and empty new-conversation patterns return false; configured patterns cover match and miss.
- Default `/share/` and a custom share prefix are authoritative in their respective modes.

### Navigation state

- Omitted `newTabPath` returns the current origin.
- A same-origin configured path resolves to an absolute URL and preserves query/hash.
- A fabricated cross-origin value throws explicitly.

## Non-goals

- Retest prompt insertion, conversation lists, outline extraction, or dynamic pack activation.
- Test browser layout or real third-party editors.
- Change production behavior unless a concrete defect is exposed.

## Completion

P1-05 can be marked complete when the matrix passes and both extension and userscript builds remain green.
