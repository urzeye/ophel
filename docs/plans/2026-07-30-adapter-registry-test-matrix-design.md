# Adapter Registry Test Matrix Design

## Context

P1-06 loads cached built-in patches and enabled SitePacks behind one initialization promise, keeps synchronous built-in-first adapter selection, and prevents the Plasmo panel from mounting before registry readiness. Later phases added explicit-origin and detect-origin activation, so the permanent matrix must protect the current priority rules without loading real site adapter implementations in Node.

## Goals

- Prove `registryReady()` starts the same singleton initialization used by `initAdapterRegistry()`.
- Lock cached built-in patching before PackManager reads and prevent repeated initialization or duplicate adapters.
- Prove built-in adapters retain priority over all dynamic activation modes.
- Lock effective-enabled filtering, installation ordering, PackManager issue reporting, and dynamic platform priming.
- Isolate individual `DeclarativeAdapter` constructor failures and root storage failures without breaking built-in matching.
- Cover explicit binding, missing explicit binding without fallback, detect selection, and static fallback ordering.
- Lock the Plasmo `registryReady()` render gate and both extension/userscript bootstrap awaits.

## Considered Approaches

### Refactor registry logic into dependency-injected pure functions

This would simplify tests but introduce production structure solely for testability and risk creating a second registry abstraction.

### Check source text only

Useful for the React and bootstrap wiring, but unable to prove promise identity, initialization order, adapter priority, or failure isolation.

### Import the real registry module with mocked boundaries

Mock built-in adapter modules, PackManager runtime, platform storage, detect runtime, and declarative adapter construction. Each test resets the module cache so the real registry singleton and control flow execute from a clean state. Use source contracts only for the UI/bootstrap code that cannot run in the Node test environment.

## Selected Approach

Use the real-module test. A shared hoisted state supplies deterministic fake built-in and declarative adapters, mutable PackManager snapshots, origin bindings, detect results, and event recording. The production `src/adapters/index.ts` remains unchanged unless the matrix exposes a defect.

## UI and Theme Scope

This is a preserve-mode content-panel mount gate. No markup, styling, theme variables, Shadow DOM injection, motion, or accessibility behavior changes. The test only locks that `<App />` remains absent until registry readiness resolves.

## Non-goals

- Exercise real site adapter DOM matching.
- Re-test PackManager parsing and migrations already covered by `pack-manager.test.ts`.
- Render React with jsdom or add a browser testing dependency.
- Validate dynamic content-script registration or host permissions from P1-17/P2-01.

## Completion

P1-06 can be marked complete when the registry matrix and bootstrap contracts pass, all current `getAdapter()` consumers remain unchanged, and extension/userscript builds stay green.
