# Z.ai Config Test Matrix Design

## Context

P0-08 moved Z.ai's public and private selectors into one versioned built-in config so cached patches can update the adapter before first use. The hotfix coverage matrix exists, but no durable test currently proves that the real adapter reads an injected merged config or that every private-selector allowlist entry still has a runtime consumer.

## Goals

- Lock the Z.ai descriptor, config version, built-in config identity, and default public getter mappings.
- Prove a valid version-matched patch changes input selectors, message selectors, generation detection, model selection, export fallback, width, Zen, panel avoidance, and user-query width without reconstructing the adapter.
- Prove public getter results cannot mutate the active config through returned arrays or objects.
- Prove every `sitePrivateSelectors` key has a runtime read in `zai.ts`, preventing dead allowlist keys that validate successfully but do nothing.
- Correct the hotfix matrix to state that only `input.submitKey`, not the input-control algorithm, is patch-consumed by Z.ai.

## Considered Approaches

### Browser-only regression

Required before P0-08 can be marked complete, but it is slow, site-state dependent, and does not directly prove patch coverage or defensive copies.

### Generic merge tests only

The merge suite already protects schema semantics, but it uses fixtures and cannot prove the real Z.ai adapter consumes the merged fields.

### Real adapter plus pure patch resolution

Selected. Resolve a valid patch against `ZAI_CONFIG`, inject the result into a real `ZaiAdapter`, and verify public/DOM-light consumers in Node. Keep the task in progress until the documented live-site checklist is actually run.

## Scope Boundaries

No selector values, UI, CSS, theme system, Shadow DOM injection, i18n copy, registry transport, or startup ordering change. P0-13 owns bootstrap ordering; this matrix only proves that a config delivered by that gate affects the Z.ai instance.

## Completion

This automated batch is complete when the focused and full suites, format, ESLint, typecheck, registry validation, and both builds pass. P0-08 remains `进行中` until the real Z.ai full-function manual regression is recorded.
