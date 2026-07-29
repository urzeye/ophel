# Dynamic Site ID Test Matrix Design

## Context

P1-08 widened shared site identifiers to arbitrary strings, introduced `pack:` platform metadata, preserved dynamic settings keys, and replaced built-in-only platform lists with a runtime catalog. P1-15 later added origin-scoped `siteInstanceKey` storage, so this matrix must verify the original general-string boundary without duplicating multi-origin conversation and reading-history migration tests.

## Goals

- Lock `isBuiltinSiteId()` for built-in and `pack:` identifiers.
- Prove installed SitePacks map to ordered platform metadata with localized names, URL matching, favicon URLs, and Unicode-safe initials.
- Lock platform catalog priming, lazy-load singleton behavior, language rebuilds, issue reporting, and built-in fallback after storage failure.
- Prove arbitrary `pack:` settings keys survive normalization and selector reads across theme, width, Zen, clean, panel avoidance, and model lock records.
- Prove settings backup creation and restore planning preserve the complete dynamic key.
- Prove prompt platform filtering accepts exact `pack:` IDs without built-in narrowing.

## Considered Approaches

### One temporary runtime smoke script

Matches the original implementation plan, but leaves no permanent regression protection and mixes unrelated module setup in one executable.

### UI component rendering tests

Would exercise visible consumers but requires a browser/jsdom stack and still would not directly prove normalization or backup key preservation.

### Focused pure and module-state tests

Test platform mapping/catalog state, settings normalization/backup, and prompt matching in their owning modules. Existing builds continue to verify the React consumers compile against the shared catalog.

## Selected Approach

Use three focused Vitest files. Mock only catalog storage/i18n boundaries and prompt-store persistence; use real PackManager mapping, match-pattern logic, settings normalizers/selectors, and backup codec.

## UI and Theme Scope

This is preserve-mode data-flow verification. No component structure, CSS, theme variable, icon layout, Shadow DOM injection, or i18n copy changes are made. Platform metadata tests validate the data consumed by the existing shared `PlatformIcon` component.

## P1-15 Boundary

Origin-scoped `pack:<id>@<origin>` identities, conversation compound keys, reading-history isolation, and legacy migration remain P1-15. P1-08 covers the prerequisite that shared records and platform filters accept arbitrary strings without narrowing or key loss.

## Completion

P1-08 can be marked complete when the three matrices pass, dynamic settings survive a backup/restore round trip, and extension/userscript builds remain green.
