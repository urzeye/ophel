# Declarative Outline Test Matrix Design

## Context

P1-03 implements generic outline extraction inside the manifest-declared response container. It combines user-query and heading candidates, removes Ophel-owned DOM, restores document order, and delegates word counting and inline bookmarks to shared base behavior. The algorithm currently lacks permanent tests.

## Goals

- Prove extraction never broadens beyond the configured response container.
- Lock heading-level clamping, empty-heading removal, and explicit DOM-order sorting.
- Exclude candidates with a `gh-` class on themselves or an ancestor below the response container.
- Keep user queries as turn boundaries even when they are not emitted.
- Lock nested-heading, peer-heading, next-turn, and final-container word-count boundaries.
- Prove inherited inline bookmarks reuse the same outline and filter disconnected elements.
- Avoid a browser DOM dependency.

## Selected Approach

Use structural fake Elements with class lists, parent chains, selector matching, connection state, and `compareDocumentPosition()` flags. A small `DeclarativeAdapter` test subclass supplies the fake response container and records calls to the inherited word-count boundary method; all candidate construction, filtering, sorting, and outline emission remain production code.

Vitest stubs only the two `Node.DOCUMENT_POSITION_*` constants and mocks the eager DOMToolkit singleton needed during module import.

## Matrix

- Missing response selector and missing mounted container.
- Unsorted query results containing user queries, h1-h6, empty headings, out-of-range headings, and self/ancestor `gh-` nodes.
- `maxLevel` lower and upper clamping.
- User-query inclusion on/off, including empty query text retained as a non-rendered boundary.
- Word-count boundaries for user query, top-level heading, nested heading, peer heading, next turn, and final item.
- Inline bookmark output with connected and disconnected candidates.

## Non-goals

- Test the base Range implementation's character counting.
- Test outline rendering, tree construction, scrolling, or real page markup.
- Add message or assistant-response assumptions outside the declared selectors.

## Completion

P1-03 can be marked complete when the production extraction algorithm passes the matrix and both build targets remain green.
