# SitePack User Data Lifecycle Design

## Context

P1-16 closes the remaining lifecycle gaps around SitePack user data. Installed pack bodies are persisted outside Zustand, future origin bindings and user overrides will use their own platform-storage keys, and extension runtime registration state is derived from browser permissions and registered scripts. The current local-backup and WebDAV implementations duplicate hydration logic, read different data on extension and userscript builds, and restore every non-Zustand object as a JSON string. That last behavior can corrupt `sitepacks/installed`, whose manager requires a native object.

The lifecycle also has two runtime gaps. Restoring an enabled pack on another browser cannot restore Chrome host permissions, while clearing all data currently removes storage before explicitly unregistering SitePack scripts and revoking SitePack-owned origins.

## Goals

- Define one versioned backup codec used by local files and WebDAV.
- Back up all known user-owned data on both extension and userscript builds, including installed packs, future origin bindings, and future user overrides.
- Exclude registry caches, extension registration state, transient flags, and other reproducible UI/runtime state.
- Restore backup versions 1 through 3 into the new version-4 storage shapes without corrupting native-object keys.
- Preserve the current WebDAV connection when restoring a WebDAV backup.
- Derive missing SitePack permissions from installed enabled packs and actual browser permissions, then provide an explicit reauthorization action.
- Unregister dynamic scripts, revoke SitePack-owned origins, and delete registration runtime state before clearing storage.

## Non-goals

- Implementing `sitepacks/origin-bindings` UI or detect-mode semantics; those remain P2-02 and P2-04.
- Migrating Chrome permissions in a backup. Browser authorization is intentionally non-transferable.
- Backing up registry index/cache data or extension registration bookkeeping.
- Introducing a general database or transaction layer for platform storage.
- Redesigning the Backup or SitePack pages.

## Alternatives Considered

### 1. Patch the two existing backup implementations independently

Rejected. Local backup and WebDAV already contain slightly different hydration/dehydration branches. Adding SitePack keys to both would preserve duplicate schema logic and make the next storage-shape change drift again.

### 2. Keep a raw storage snapshot and exclude only known runtime keys

Rejected. Extension `chrome.storage.local.get(null)` and the userscript polyfill enumerate different key sets, so the result remains platform-dependent. A denylist also risks leaking new caches into backups, while raw snapshots retain the existing ambiguity between JSON strings, Zustand envelopes, and native objects.

### 3. Use a descriptor-driven user-data allowlist — selected

A shared codec owns the backup schema, the allowed keys, and the storage shape for each key. Both local files and WebDAV read those explicit keys through `platform.storage`, convert them to one canonical JSON representation, and restore them through the inverse mapping. New user-owned storage must be added deliberately; derived state stays excluded by default.

## Backup Schema and Data Ownership

Version 4 keeps the existing top-level structure and makes `type` explicit for every backup:

```json
{
  "version": 4,
  "timestamp": "2026-07-29T00:00:00.000Z",
  "type": "full",
  "data": {}
}
```

The full-backup allowlist is grouped by persisted shape:

- Zustand envelopes: `settings`, `prompts`, `promptChains`, `folders`, `tags`, `conversations`, `readingHistory`, and `claudeSessionKeys`.
- Flat JSON string: `bookmarks`.
- Native platform-storage objects: `ophel:usageMonitor`, `sitepacks/installed`, `sitepacks/origin-bindings`, and `siteconfig/overrides`.

`sitepacks/remote-state` and `sitepacks/extension-runtime` are explicitly excluded. Release-note acknowledgement, restore/clear flags, search nudges, and unknown storage keys are also excluded because they are transient or reproducible rather than user-authored data.

Prompt-only and settings-only exports remain narrow. Restores also enforce the declared backup type, so a settings backup cannot smuggle unrelated storage keys.

## Compatibility and Storage Shapes

The codec accepts versions 1 through 4 and normalizes known historical forms before validation:

- old Zustand envelopes embedded directly in `data` are unwrapped;
- flattened version-3 values are rebuilt into the correct state object;
- prompt chains accept both an array and the multi-property state form;
- legacy conversations and reading history are wrapped under their historical primary property;
- a previously corrupted JSON-string form of a native SitePack object is parsed back to a native object;
- version-1-to-3 documents without `type` are treated as full backups.

Future unsupported versions fail explicitly. Unknown keys from older full-storage snapshots are ignored with a warning rather than written back. Zustand values are persisted with version `0` so each store's existing migration remains the authority for schema upgrades.

WebDAV restore overlays the current WebDAV configuration onto the normalized backup settings before storage writes. It does not call the stale in-memory settings store after the restore, avoiding an overwrite of the newly restored settings.

## Permission Recovery

No persistent “restore needs permissions” flag is introduced. The registration manager already has the authoritative inputs: enabled installed packs and current Chrome permissions. Its `reconcile()` result becomes part of the platform API and returns active and missing origin patterns.

After any restore, background reconciliation runs before content-page reload broadcasts. Backup UI can immediately tell the user when domain access must be granted again. `SitePacksPage` also reconciles on load and after installed-pack changes, maps missing origins back to enabled packs, and shows a preserve-mode notice with one explicit authorization action per affected pack. A successful action uses the existing visible permission popup and refreshes runtime status; denial retains the existing behavior of disabling the pack.

The userscript platform returns an empty runtime status because userscript match permissions are managed by the script manager and P2-03 owns that guidance.

## Clear-All Ordering

Background captures currently targeted tabs before removing registrations so already-open dynamic SitePack pages still receive the in-memory reset message. The serialized registration manager then:

1. unregisters every `ophel-sitepack-*` script;
2. revokes only origins recorded as SitePack-managed and still granted;
3. removes `sitepacks/extension-runtime`.

Only after that succeeds does BackupPage clear local/sync storage. Cleanup failures are returned to the UI and stop the storage clear; they are not swallowed. The userscript clear list is expanded to the same known user-data and cache keys, without extension-only permission work.

## UI and Theme Boundary

BackupPage and SitePacksPage stay in `preserve` mode. The change reuses existing buttons, feedback hierarchy, permission popup, and `--gh-*` theme variables. A small SitePack permission-review layout class is added to the existing settings stylesheet; no theme token, animation, Shadow DOM stylesheet entry, or information architecture changes.

## Verification

- A deterministic TypeScript smoke covers v2/v3/v4 normalization, SitePack native-object restoration, allowlist/denylist behavior, prompt/settings filtering, WebDAV-setting preservation inputs, and userscript-compatible platform storage.
- Registration-manager smoke covers clear ordering, dynamic registration removal, managed-origin revocation, runtime-state deletion, and permission-status reporting.
- Locale parity verifies the two new permission-review messages in all eleven application locales.
- Repository checks follow CI order, plus both extension and userscript builds and `git diff --check`.
