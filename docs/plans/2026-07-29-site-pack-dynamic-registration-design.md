# SitePack Dynamic Origin Registration Design

## Context

P1-17 is the final runtime prerequisite for activating a SitePack on a domain that is not already listed in the extension manifest. Pack installation, validation, adapter loading, management UI, registry integrity, and metadata localization already exist, but Chrome only injects Ophel's content scripts into the built-in match list.

The first official Duck.ai pack needs one concrete HTTPS origin. P1-17 therefore implements the minimum extension-side authorization and origin registration loop. Custom origin bindings, detect pools, multi-pack ownership UI, and cross-browser regression remain in Phase 2.

## Spike Findings

The current Plasmo Chrome production build confirms the two distinct script sources described by the technical plan:

- `chrome.runtime.getManifest().content_scripts` contains the compiled ISOLATED-world entries for `main` and `ui-entry`, including the UI CSS asset and their concrete hashed production paths.
- `.plasmo/static/background/main-world-scripts.ts` registers MAIN-world entries through `chrome.scripting.registerContentScripts()`. The production service worker contains separate registrations for the generic `monitor-entry` and `scroll-lock-main` assets, so their current hashed paths can be read with `chrome.scripting.getRegisteredContentScripts()`.
- The generated manifest already includes the required `scripting` permission.
- `web_accessible_resources` uses `matches: ["<all_urls>"]`, so fonts and other declared packaged assets are eligible on a newly authorized SitePack origin. No manifest permission expansion is required.

## Goals

- Convert each validated SitePack match into an origin-level host pattern, discarding path-specific differences for injection.
- Request only the missing origin permissions through the existing visible permission-request page.
- Discover compiled ISOLATED and MAIN script assets from runtime extension metadata rather than hard-coding hashed paths.
- Register one set of grouped scripts per active origin with `persistAcrossSessions: true`.
- Reconcile registrations after startup, install/update, enable/disable, uninstall, registry sync, permission removal, and broad host-permission grants.
- Remove registrations and only the host permissions that Ophel acquired specifically for SitePacks when an origin is no longer active.
- Merge registered SitePack origins into background tab broadcasts without maintaining another hard-coded site list.

## Non-goals

- User-entered custom origins or `sitepacks/origin-bindings` (P2-02).
- Detect-based activation and delayed DOM probing (P2-04).
- User-facing multi-pack reference counts or binding ownership controls (P2-01).
- Userscript `@match` editing guidance (P2-03).
- Firefox-specific permission and registration regression (P2-09).
- Hot-injecting an already open page; the user refreshes after activation.

## Alternatives Considered

### 1. Background reconciliation from installed-pack state — selected

A single extension-only manager reads the validated installed-pack snapshot, computes desired origins, compares them with Ophel-owned dynamic registrations, and applies the difference. Storage and permission events schedule the same reconciliation. This keeps persisted packs as the product truth and makes restart, automatic registry updates, and UI mutations converge on identical behavior.

### 2. Add extension lifecycle callbacks to PackManager

PackManager is shared by the extension and userscript and currently owns only validation and storage mutation. Adding Chrome permission and scripting callbacks would mix platform side effects into the cross-platform lifecycle, complicate failure semantics, and create a second mutation path. This is rejected.

### 3. Register directly from SitePacksPage

The page has the user gesture needed to start authorization, but it is not present during browser startup, background registry synchronization, restore, or other storage changes. Page-owned registration would therefore be incomplete and would duplicate cleanup logic. This is rejected.

## Registration Model

The manager derives active packs from `PackManager.getSnapshot()` using the same effective-enabled rule as adapter loading. Every manifest match is normalized to `https://authority/*`; multiple paths on the same authority collapse to one registration origin.

Script templates are discovered in two groups:

- ISOLATED: runtime manifest entries whose assets belong to `main` or `ui-entry`;
- MAIN: non-Ophel-dynamic registered scripts whose assets belong to `monitor-entry` or `scroll-lock-main`.

Templates are grouped by `world × runAt`. JavaScript and CSS arrays preserve discovery order and are deduplicated. Each desired origin receives deterministic registration IDs under an `ophel-sitepack-` prefix. Current prefixed registrations whose descriptors no longer match are replaced; unrelated Plasmo registrations are never modified.

## Permission Ownership

The optional manifest permission remains `<all_urls>`, but requests use only the concrete missing origin patterns. The manager stores a strict, versioned list of origins that were missing before the SitePack request and were granted by that request. Pre-existing origin grants and a pre-existing `<all_urls>` grant are not marked as SitePack-owned.

During reconciliation, an owned origin is revoked only when no effectively enabled SitePack still needs it. If permission was removed externally, the owned record is pruned and the origin's dynamic scripts are removed. This derived extension runtime state is not user backup data.

## Authorization Flow

SitePacksPage calls the platform abstraction with an installed pack ID. The extension implementation asks background to ensure that pack's origins. Background validates the pack from storage, computes missing origins, and opens `perm-request.html` with the pack name and origin list. The page performs `chrome.permissions.request()` from its own Allow button gesture.

Background waits for either the permission-added event or popup closure, verifies the final permission state, records newly managed origins, and returns `granted` or `denied`. A denied fresh install remains installed but is switched off; enabling it later repeats the explicit request. The userscript platform reports the operation as unsupported and keeps its existing install behavior.

## Reconciliation and Cleanup

- Background schedules reconciliation at service-worker initialization, `runtime.onInstalled`, and `runtime.onStartup`.
- Changes to `sitepacks/installed` schedule reconciliation.
- Permission removals and `<all_urls>` additions schedule reconciliation. A specific SitePack grant is reconciled by its authorization message after checking whether the pack is already effectively enabled, avoiding a race with the UI's disabled-to-enabled transition.
- SitePacksPage explicitly waits for reconciliation after mutations so success feedback reflects the completed runtime state.
- Disable and uninstall remove origin registrations; uninstall also releases SitePack-owned permissions when no active pack needs them.
- Background tab queries combine manifest content-script matches with currently registered SitePack matches.

Reconciliation is serialized. Missing script templates, corrupt runtime state, failed registration, or failed permission removal surface as explicit errors and are logged by the scheduler; they are not converted into successful activation.

## UI and Theme Boundary

The existing SitePack page and permission-request page remain in preserve mode. The implementation reuses current feedback containers, buttons, theme variables, and permission-page layout. No CSS file, theme token, animation, or Shadow DOM injection rule changes.

## Verification

- Pure smoke with mocked storage, permissions, manifest descriptors, scripting registrations, and installed packs.
- Assert origin collapsing, world/runAt grouping, deterministic registration replacement, permission ownership, startup reconciliation, disable/uninstall cleanup, and dynamic match exposure.
- Build the Chrome extension and inspect the generated manifest/service worker for both script sources and `<all_urls>` web-accessible resources.
- Run locale parity, format, lint, typecheck, Chrome build, userscript build, and `git diff --check`.
