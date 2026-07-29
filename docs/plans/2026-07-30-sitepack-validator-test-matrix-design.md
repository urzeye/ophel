# SitePack Validator Test Matrix Design

## Context

The runtime validator is already the shared security source for local imports, registry validation, remote patches, and built-in selector overrides. P0-02 remains open because its contracts were exercised only through temporary smoke scripts rather than a persistent unit-test matrix.

## Goals

- Lock every validator constraint listed in plan section 8.2 with a valid and invalid case.
- Cover the additional P0-02 acceptance rules for regular expressions, capability requirements, structured errors, and patch reuse.
- Exercise the public validator APIs rather than private helper functions.
- Reuse the registry's comprehensive example as the full-schema positive fixture.
- Keep failures precise by asserting both the JSON path and validation error code.

## Matrix

### Manifest boundary and shape

- Required fields, JSON-compatible types, schema/version ranges, semantic versions, unknown keys, and serialized size.
- Arrays at 50 items and selectors at 500 characters, plus one-over-limit failures.

### Security and navigation constraints

- HTTPS match patterns, forbidden global/wildcard forms, duplicate and count limits, and empty-match detect requirements.
- Same-origin conversation/session paths.
- SitePack IDs and hexadecimal theme colors.
- Safe CSS plus all blocked tokens, comment/escape normalization, and the 2,000-character limit.
- Compilable/length-bounded regular expressions and the injected `safe-regex2` policy.

### Capability contracts

- The comprehensive registry example proves the complete capability set is satisfiable.
- Each declared capability is tested without its required field.
- Unknown and duplicate capability names are rejected.

### Built-in and patch reuse

- Built-in required capabilities and private selector allowlists.
- Partial user overrides, null deletion, and unknown private selectors.
- Valid patches, patch range metadata, and patch config rejection for unknown keys, unsafe CSS, and invalid regex.

## Non-goals

- Test merge ordering or compatibility skip behavior; those belong to P0-04.
- Test registry-only policy such as built-in-domain overlap or duplicate package IDs.
- Test browser or UI behavior.

## Completion

P0-02 can be marked complete when the matrix passes through `pnpm test`, the runtime source remains unchanged unless a test exposes a real defect, and repository checks remain green.
