# Site Instance Identity Test Matrix Design

## Context

P1-15 introduced `siteInstanceKey` and versioned scoped storage keys so one SitePack can serve multiple origins without sharing settings, reading positions, or conversations. The implementation was exercised with a temporary smoke before Vitest existed, but the repository now needs durable regression coverage before the task can be closed.

## Goals

- Lock canonical HTTP(S) origin handling, built-in identity preservation, dynamic instance-key generation, and collision-free scoped keys.
- Prove declarative adapters only claim legacy pack-level data for one exact static origin, never for wildcard, multi-origin, explicit-binding, or detected instances.
- Prove two origins of one pack read independent theme, layout, and model-lock settings.
- Prove single-origin legacy settings move atomically to the instance key without overwriting an existing instance value.
- Prove reading-history keys remain isolated and legacy claims preserve an existing instance-scoped position.
- Prove version-0 conversation migration preserves built-in records, separates equal raw IDs across dynamic origins, and keeps unresolved dynamic records hidden from every resolved instance.
- Prove `ConversationManager` exposes and mutates only the current instance while retaining raw conversation IDs at its public boundary.

## Considered Approaches

### Repeat the temporary smoke

This matches the original implementation batch, but the assertions disappear after delivery and cannot prevent future regressions.

### Browser-only two-origin acceptance

This is useful as a later integration check, but it depends on live sites or binding/permission flows and does not directly expose migration conflict behavior.

### Focused Vitest matrices

Selected. Test the pure identity and migration functions in their owning modules, exercise the real reading-history and conversations stores with an in-memory persistence boundary, and instantiate the real `ConversationManager` for current-instance reads and mutations.

## Scope Boundaries

No UI structure, CSS, theme variables, Shadow DOM injection, i18n copy, permissions, or origin-binding lifecycle changes are included. P1-16 owns backup coverage for installed packs and bindings; P1-17 and P2-02 own dynamic registration and custom-origin authorization.

## Completion

P1-15 can be marked complete when the identity, settings, reading-history, conversation migration, and manager-isolation matrices pass; the full suite, typecheck, registry validation, extension build, and userscript build must remain green.
