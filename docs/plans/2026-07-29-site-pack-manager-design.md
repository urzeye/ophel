# SitePack Manager UI Design

## Context

P1-10 adds the first user-facing management surface for declarative SitePacks. The core lifecycle already exists in `PackManager`, while registry cache refresh is exposed through `platform.remoteConfig`. The new UI must work in both the Shadow DOM settings modal and the standalone Options page without creating a second persisted state source.

## Goals

- List installed packs with version, source, desired enabled state, registry health, update action, and uninstall action.
- Browse the cached registry and install or update an available pack.
- Import a local JSON file only after byte-size, JSON, and schema validation plus an explicit risk confirmation.
- Show useful loading, empty, success, and error states, including field paths for invalid manifests.
- Preserve the existing settings information architecture, theme system, and extension/userscript platform abstraction.

## Non-goals

- Dynamic origin permission registration (P1-17).
- SitePack name/description locale fallback (P1-12).
- Registry contribution schema and documentation (P1-11).
- Removing per-site settings or conversation data during uninstall (P1-16).
- Hot-swapping the adapter used by an already mounted page.

## Alternatives Considered

### 1. One page with three stacked sections — selected

The page shows Installed, Community Registry, and Local Import in one vertical flow. This keeps all lifecycle actions visible, works well when the registry is empty, and matches the existing high-density settings card pattern.

### 2. Installed / Registry / Import subtabs

Subtabs scale to a very large catalog but add navigation overhead and hide empty/error context. Phase 1 has no catalog entries yet, so the extra hierarchy is premature.

### 3. Modal-first manager

A modal could keep the sidebar shorter, but it makes scanning, persistent error display, and standalone Options parity worse. Destructive and risk-sensitive confirmations remain dialogs; the manager itself stays a page.

## Information Architecture

Add a top-level `sitePacks` navigation item immediately after Site Settings in both settings surfaces.

The page contains:

1. **Installed packs** — rows with identity, version/source metadata, status, enable switch, registry update action, and uninstall action.
2. **Community registry** — cached registry entries with availability state and install/update action; a refresh action explicitly checks the remote registry.
3. **Local JSON import** — explanation, file picker action, and validation feedback.
4. **Activation note** — enabled-state changes are persisted immediately, while target pages may require permission and reload before the adapter is active.

## Data Flow

- Create one `PackManager` instance per mounted page with `createRuntimePackManager(platform.storage)`.
- Load installed data with `PackManager.getSnapshot()`.
- Load registry data with `platform.remoteConfig.getState()` and derive a view model from the active index, cached manifests, and installed packs.
- Refreshing the registry calls `platform.remoteConfig.checkForUpdates()`, then `PackManager.syncRegistryPacks()`, then reloads both views.
- Install, update, enable/disable, and uninstall operations call only `PackManager`; the page reloads its view after each mutation.
- No Zustand store is added. Platform storage remains the sole persisted source.

## Local Import Safety

1. Reject files larger than `SITE_PACK_MAX_BYTES` before parsing.
2. Parse JSON and surface parse failures at `$`.
3. Run `validateSitePackManifest()` and render every `path — message` error.
4. For a valid manifest, show its name, ID, version, and declared match count in a themed in-tree confirmation dialog.
5. Explain that a pack can change page styles and Ophel behavior on matched sites and should only be imported from a trusted source.
6. On confirmation, call `PackManager.installLocal()`, which revalidates compatibility and conflicts before writing.

## State and Error Model

- Initial installed and registry loads fail independently so an unavailable registry does not hide installed packs.
- `PackManagerSnapshot.issues` remain visible as a dedicated warning list; valid records still render.
- Action feedback uses an inline `aria-live` status/alert instead of `alert()` or silent failure.
- Per-pack actions use a stable busy key so unrelated rows remain usable.
- Empty states explain both why the section is empty and the next available action.

## Visual and Accessibility Rules

- Preserve existing `settings-card`, typography, spacing, and sidebar structure.
- Add scoped `settings-pack-*` classes in `src/styles/settings.css`, using only existing `--gh-*` variables and `color-mix()`.
- The same stylesheet already reaches the Shadow DOM through `ui-entry.tsx` and standalone Options through `options.css`.
- Buttons include hover, active, focus-visible, disabled, and reduced-motion behavior.
- The enable switch receives an accessible name.
- Confirmation dialogs render inside the current React tree so 24 theme variables remain available; they focus the primary action, close on Escape when idle, and restore focus on close.

## Verification

- Pure smoke coverage for registry view derivation, local file parsing, field-level validation, and the PackManager local/registry lifecycle.
- Locale key comparison across all 11 application languages.
- `format:check`, `lint:check`, `typecheck`, registry validation/build, extension build, userscript build, and `git diff --check`.
- Browser smoke when available: both settings surfaces, loading/empty/error states, import confirmation, switch focus, and light/dark theme contrast.
