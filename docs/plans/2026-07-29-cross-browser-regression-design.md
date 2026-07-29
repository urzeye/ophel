# Cross-Browser and Userscript Manager Regression Design

## Context

P2-09 closes the runtime acceptance gap left by dynamic SitePack registration, origin reference counting, custom origins, and userscript match guidance. The regression must distinguish product behavior from browser automation constraints: branded Chrome no longer honors command-line unpacked-extension loading, Firefox exposes different MV3 host-permission behavior, and userscript managers differ in installation UI and `GM_info` shape.

The regression uses the enabled Duck.ai local SitePack as one concrete optional origin. Every extension run starts from a fresh profile, observes the missing permission, accepts the browser-owned permission prompt, verifies all three Ophel script groups, removes the installed pack, and verifies both registration and permission cleanup.

## Goals

- Verify authorization, dynamic registration, and uninstall cleanup on Chrome, Edge, and Firefox.
- Confirm the extension message Promise resolves independently of the permission page's delayed self-close.
- Record Firefox MV3 host-permission and scripting API differences without hiding failures behind browser-specific fallbacks.
- Smoke the built userscript in Tampermonkey, Violentmonkey, and ScriptCat where an actual manager runtime can be launched.
- Record exact coverage, tooling limits, and known issues in `docs/developer/troubleshooting.md`.

## Non-Goals

- Add a permanent browser E2E framework to the repository.
- Change the SitePack permission UX or userscript metadata.
- Treat an automation-side extension loading restriction as a product defect.
- Claim a real-manager pass from `GM_info` fixtures alone.

## Extension Regression Flow

Each browser run performs the same observable sequence:

1. load the production browser build in a fresh profile;
2. install an enabled local Duck.ai SitePack record;
3. reconcile and require `https://duck.ai/*` to appear only in `missingPermissionOrigins`;
4. start `ENSURE_SITE_PACK_ORIGINS` from an extension page and accept the browser-owned prompt;
5. require the Promise response to report `granted: true`;
6. require three dynamic registrations for Duck.ai: `ISOLATED/document_idle`, `MAIN/document_idle`, and `MAIN/document_start`;
7. remove the installed pack and reconcile;
8. require zero SitePack registrations and no remaining Duck.ai permission.

Chrome coverage uses Chrome for Testing from the same installed major version because branded Chrome 150 ignores `--load-extension`. Edge uses the installed stable executable. Firefox uses an unsigned temporary XPI in a disposable WebDriver profile; a Geckodriver warning that it cannot remove its temporary XPI copy is recorded separately when the extension page and runtime remain available.

## Firefox Compatibility Boundary

Firefox 151 returns extension content-script assets from runtime manifest data as `moz-extension://...` URLs, while `scripting.registerContentScripts()` requires `js` and `css` entries to be extension-relative paths. Chrome returns relative paths, so forwarding browser output unchanged creates a Firefox-only registration failure after permission has already been granted.

Normalize both manifest and registered-template assets inside `discoverSitePackScriptTemplates()`, the single boundary that converts browser-owned descriptors into Ophel registration templates. Accept `chrome-extension://` and `moz-extension://` URLs, preserve nested paths, strip the leading slash, and leave already-relative paths relative. Do not add a Firefox branch to the runtime manager and do not remove CSS from the registration.

The focused fixture passes absolute Firefox-style `main`, `ui-entry`, `monitor-entry`, and `scroll-lock-main` assets into discovery and asserts that every returned `js` and `css` path is relative. The full Firefox browser run then proves the normalized templates are accepted by the real scripting API.

## Userscript Manager Matrix

The production userscript metadata is checked once for its base `@match`, `@grant`, `@require`, and `@resource` entries. Runtime smoke then uses the actual manager installation UI and a supported site when the manager can be launched safely in a disposable browser profile.

- Tampermonkey: use the locally installed Chrome/Firefox manager package where practical.
- Violentmonkey: use an official release package in a disposable Chromium profile.
- ScriptCat: use an official release package in a disposable Chromium profile.

For every manager, distinguish these outcomes explicitly: installed and injected, manager UI reached but injection blocked, manager unavailable, or fixture-only. The existing pure `GM_info` resolver fixtures remain supporting evidence for metadata shape differences, not a substitute for runtime smoke.

## Evidence and Documentation

Disposable profiles, downloaded browser tools, screenshots, and diagnostic scripts remain under ignored `output/p2-09/`. Tracked changes stay limited to the Firefox compatibility fix, the P2-09 design/plan, task status, and troubleshooting conclusions. The user's existing `.gitignore` modification remains unstaged.

P2-09 moves to `进行中` when work begins and remains there unless all required browser and manager coverage is either passed or explicitly accepted as a documented known limitation.
