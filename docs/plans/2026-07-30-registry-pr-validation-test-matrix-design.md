# Registry PR Validation Test Matrix Design

## Context

P0-07 already has a trusted-base `pull_request_target` workflow and a registry validator that reuses the runtime SitePack validator. The remaining gap is durable evidence that PR candidate files are checked through the registry entry point, policy conflicts are reported with field paths, and the workflow keeps the untrusted PR checkout isolated from executable code.

## Goals

- Prove a minimal valid registry root passes through `loadValidatedRegistrySources()`.
- Lock JSON Schema diagnostics and the runtime validator's field-located safety errors at the registry boundary.
- Cover duplicate pack IDs, built-in ID conflicts, built-in match conflicts, and inter-pack match conflicts.
- Prove unsafe regular expressions, escaped unsafe CSS, and missing capability fields are rejected through the shared validator.
- Exercise the actual CLI once to lock its non-zero exit status and readable stderr contract.
- Lock the workflow's trusted-base checkout, detached PR worktree, candidate `--registry-root`, PR comment, and final failure gate.

## Considered Approaches

### Export policy helpers and unit-test them

Fast and narrow, but it would couple tests to private implementation and skip JSON loading, schema compilation, shared validation, CLI output, and workflow routing.

### Spawn the registry CLI for every case

Closest to CI, but repeatedly starting `tsx` would make the suite slow and make failures harder to isolate.

### Temporary registry integration matrix with one CLI contract test

Create an isolated registry root per test, copy only the schema and example, write focused candidate packs, and call the public registry loader. Use one child process for the CLI contract and read the workflow as a small static security contract. This covers the complete validator path while keeping the suite deterministic and quick.

## Selected Approach

Use the temporary-registry integration matrix. Extend Vitest's include list to colocate the JavaScript test with `registry/scripts/validate.mjs`, avoiding TypeScript declarations for the executable `.mjs` module. The test owns all temporary files under the operating-system temp directory and removes them after each case.

## Non-goals

- Re-test every primitive rule already exhaustively covered by `src/adapters/declarative/validate.test.ts`.
- Create an external GitHub PR or mutate GitHub comments.
- Test registry-dist publishing or CDN availability.
- Change production validation behavior unless the matrix exposes a defect.

## Completion

P0-07 can be marked complete when the integration matrix, CLI failure contract, and workflow security contract pass, the existing registry validates, and project checks remain green.
