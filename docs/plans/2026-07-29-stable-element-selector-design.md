# Stable Element Selector Generator Design

## Context

P3-02 turns an element returned by the P3-01 picker into a selector suitable for a declarative SitePack. The selector must favor durable identity signals, remain unique under the same open-Shadow-DOM traversal used by runtime adapters, and explicitly hand control back to manual input when the page does not expose a stable unique path.

## Goals

- Prefer `data-testid`, then stable `id`, then non-state `aria-*`, then stable class combinations.
- Reject generated CSS-Modules, CSS-in-JS, hash-like, and presentation-only utility class tokens.
- Verify selector syntax, target identity, and uniqueness across the document plus reachable open Shadow Roots.
- Use stable ancestors when the target's own selector is not unique.
- Shrink a successful ancestor chain by removing unnecessary segments while preserving uniqueness.
- Return a discriminated `manual-required` result instead of inventing fragile `nth-child` paths.
- Keep the implementation deterministic, dependency-free, and reusable by P3-03's immediate validation UI.

## Non-goals

- Cross a Shadow DOM boundary in one CSS selector; standard CSS cannot express that relationship.
- Inspect closed Shadow Roots or iframe documents.
- Use localized visible text, XPath, pixel geometry, or generated `nth-child`/`nth-of-type` positions.
- Persist selectors or add wizard copy; P3-03 owns the user-facing manual-input step.
- Introduce a DOM emulator or permanent test framework.

## Alternatives Considered

### 1. Ranked candidates plus bounded ancestor search — selected

Generate deterministic local candidates for the target and its ancestors, validate them against a cached set of query roots, then test one- and two-ancestor chains. Successful chains are reduced segment by segment. This directly implements the required priority while bounding work on large chat pages.

### 2. Full CSS path with positional pseudo-classes

A path such as `main > div:nth-child(3) > button:nth-of-type(2)` almost always resolves, but it breaks when wrappers or sibling order change. That conflicts with the task's stability goal and would hide failure instead of prompting manual input.

### 3. Add a selector-generation library

Generic libraries typically optimize for immediate uniqueness and use positional paths or their own heuristics. Adapting them to SitePack priorities, deep open-Shadow querying, and explicit failure would add dependency and bundle cost without reducing project-specific logic.

## Public API

`src/core/element-selector-generator.ts` exposes:

- `generateStableSelector(element, options?)` returning either `generated` with selector metadata or `manual-required` with a concrete reason and attempt count.
- `validateSelectorForElement(element, selector, options?)` returning syntax validity, total deep match count, and whether the picked element is among the matches.
- `isStableSelectorClassName(className)` for deterministic filtering and focused fixture coverage.

The generation root defaults to `element.ownerDocument`. Callers may pass a `Document` or `ShadowRoot` for scoped validation. The result records strategy (`data-testid`, `id`, `aria`, `classes`, `tag`, or `ancestor-chain`) and segment count for future wizard explanation without exposing internal scoring.

## Candidate Rules

Local candidates are emitted in this order:

1. Exact `[data-testid="value"]`, followed by a tag-qualified variant.
2. A stable escaped `#id`; IDs resembling React/Radix runtime IDs, UUIDs, long numeric sequences, or long hash fragments are rejected.
3. Non-empty `aria-*` attributes except volatile state attributes such as `aria-expanded`, `aria-selected`, `aria-checked`, `aria-pressed`, `aria-busy`, `aria-hidden`, and value-state fields. Attribute-only and tag-qualified forms are both considered.
4. Lexically sorted combinations of one to three stable class tokens, with at most six tokens entering the combination set.
5. The element tag as the final local fallback.

Class tokens are rejected when they contain CSS utility syntax (`:`, brackets, slash, leading `!`), known CSS-in-JS prefixes, UUIDs, five-or-more hexadecimal hash fragments, long digit runs, excessive length, Ophel's `gh-` prefix, or a small exact set of presentation-only utilities such as `flex`, `grid`, `hidden`, `relative`, and `w-full`.

All string values are escaped for their CSS context. Selectors longer than the shared `SITE_PACK_MAX_SELECTOR_LENGTH` are not attempted.

## Deep Query and Shadow DOM Semantics

One generation call collects the root document and every reachable open Shadow Root up to the same depth limit used by `DOMToolkit`. Each selector is evaluated once per cached root and results are identity-deduplicated. This avoids repeating a full shadow-tree traversal for every candidate.

Ancestor segments are collected only through `parentElement`, so a chain never claims to cross a Shadow Root boundary. A simple selector inside an open Shadow Root can still succeed if it is globally unique across all collected roots. If identical components in multiple roots make it ambiguous, generation returns `manual-required`; standard SitePack CSS cannot disambiguate those roots safely.

## Ancestor Search and Shrinking

Direct target candidates are validated first. If none is unique, the generator collects up to eight ancestors in the same tree, retaining only their stable identity candidates (no generic `div`/`span` anchors). It then evaluates bounded chains with one ancestor and, if needed, two ordered ancestors.

Chain candidates are sorted by target signal quality, ancestor signal quality, segment count, and selector length. A global attempt budget prevents pathological work. When a chain matches only the target, the reducer removes each ancestor segment in turn and keeps the removal whenever uniqueness remains. The returned selector is therefore no longer than necessary within the stable candidate set.

## Failure and Error Model

- `element-disconnected`: the picked node is no longer connected.
- `element-outside-root`: the supplied root cannot reach the element.
- `no-unique-selector`: all stable candidates are ambiguous or absent.
- `attempt-limit`: the bounded search exhausted its budget.

Generated-selector syntax failures are programmer errors and remain visible. User-entered selector validation catches `DOMException` and reports `validSyntax: false` with the browser message so P3-03 can display it directly.

## Verification

A temporary Vite library build bundles the real TypeScript module as an isolated browser IIFE, which Playwright injects into Chromium. At least ten fixtures cover test IDs, stable and generated IDs, aria state filtering, single and combined classes, hash/utility rejection, ancestor scoping, multi-ancestor chains, duplicate failure, open Shadow DOM uniqueness, invalid manual selectors, and refreshed DOM with the same semantic markers. The temporary sources and bundle are removed after success.

Repository verification then runs format, focused ESLint, typecheck, extension build, userscript build, locale parity, and `git diff --check`. P3-02 remains `进行中` until the selector is exercised through the complete P3-03 wizard on real unsupported sites.
