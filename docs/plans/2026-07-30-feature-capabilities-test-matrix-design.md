# Feature Capabilities Test Matrix Design

## Context

P1-09 introduced an independent feature-capability contract, an explicit 15-site built-in matrix, and capability-driven visibility across the Shadow DOM panel and shared site settings. The implementation predates the current durable Vitest coverage, so the task still needs regression tests that prove community packs cannot expose undeclared controls while built-in UI remains unchanged.

## Goals

- Lock the 13-entry capability vocabulary, canonical signatures, defensive copies, and the separation from layout `getCapabilities()`.
- Prove every built-in config consumes the one shared 15-site matrix.
- Preserve the five built-in conversation-list omissions, Grok/Z.ai clean omissions, and DeepSeek model-lock omission while requiring every other built-in capability explicitly.
- Lock panel tab/header gating, hidden-tab fallback and shortcut boundaries, quick-button/tool-menu mappings, conversation unsupported handling, site-settings cards/tabs, and the dynamic model-lock row.
- Prove the community-pack notice is localized in all 11 application languages.
- Prove its shared CSS uses existing theme variables supplied by all 24 presets and reaches both the Plasmo Shadow DOM and standalone Options page.

## Considered Approaches

### Browser-only community-pack acceptance

This would exercise final rendering, but dynamic-origin registration belongs to P1-17 and would make P1-09 depend on permissions, a live site, and browser state that are unrelated to the deterministic visibility rules.

### Add a jsdom component stack

This would expand the repository test platform and require extensive mocks for large stateful components. The resulting tests would be slower and more coupled to markup than the capability contract itself.

### Contract tests plus source-boundary guards

Selected. Exercise the real adapter matrix and built-in descriptors, then guard the small set of React integration boundaries with source assertions. Existing typecheck and both production builds continue to compile the complete component trees.

## UI and Theme Scope

This is preserve-mode verification. No component structure, CSS, copy, theme variable, or style-injection behavior is changed. The test matrix verifies the existing community notice against all 12 light and 12 dark presets and confirms `settings.css` is injected through `ui-entry.tsx` and imported by `options.css`.

## Completion

P1-09 can be marked complete when the capability contract and UI-boundary matrices pass, all 11 locales remain complete, all 24 themes provide the variables consumed by the notice, and extension/userscript builds remain green.
