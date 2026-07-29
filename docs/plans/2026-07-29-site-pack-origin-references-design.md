# SitePack Origin References Design

## Context

P1-17 registers one generic set of extension scripts for every effectively enabled SitePack origin. It already deduplicates identical static match patterns, owns only permissions acquired through the SitePack flow, and reconciles registrations after lifecycle and permission changes.

Phase 2 adds user-level origin bindings. A binding can explicitly select one pack for an exact HTTPS origin or place that origin in the detect pool shared by every enabled pack with detect rules. The current registration manager does not read `sitepacks/origin-bindings`, cannot explain which packs keep an origin alive, and would treat future binding activation as a separate registration path.

## Goals

- Define a strict, versioned `sitepacks/origin-bindings` storage schema with canonical exact HTTPS origins.
- Keep PackManager as the owner of binding reads and mutations, and remove explicit bindings when their pack is uninstalled.
- Derive origin references on every reconciliation from effectively enabled packs plus the binding table.
- Preserve each `packId + source` edge so `referenceCount` is observable without persisting a second source of truth.
- Register one generic script set for each effective registration pattern, even when several packs or bindings reference it.
- Keep registration and SitePack-owned permission state until the final reference disappears.
- Surface explicit bindings whose pack is missing as visible reconciliation issues.
- Reconcile when either installed packs or origin bindings change and when permissions are removed.

## Non-goals

- Settings UI for adding, editing, or authorizing custom domains (P2-02).
- DOM evaluation of detect rules or adapter selection on a bound page (P2-04).
- Userscript manager `@match` guidance (P2-03).
- Persisting reference counts, activation winners, or a second origin ownership table.
- Removing the existing static-match conflict rule between installed packs.

## Alternatives Considered

### 1. Persist an origin-to-count table

Rejected. Counts can drift after restore, interrupted mutations, registry status changes, or manual storage repair. Installed packs and bindings would remain the real inputs, so the count table would become an unnecessary second truth source.

### 2. Register scripts once per pack

Rejected. The injected scripts are generic Ophel entry points rather than pack-specific bundles. Per-pack registrations would execute the same entry points repeatedly on a shared detect origin and make disable/uninstall cleanup depend on registration order.

### 3. Derive a reference graph during every reconciliation — selected

The registration manager reads the validated installed-pack snapshot and strict binding snapshot, derives reference edges, checks permissions, and reconciles the resulting origin-level registrations. Restart, restore, enable/disable, uninstall, binding edits, and permission changes all converge through one path.

## Binding Storage Model

Version 1 stores canonical origins as map keys:

```json
{
  "storageSchemaVersion": 1,
  "bindings": {
    "https://example.com": {
      "mode": "explicit",
      "packId": "open-webui"
    },
    "https://chat.example.com": {
      "mode": "detect"
    }
  }
}
```

An origin must be an exact HTTPS origin with no credentials, path, query, hash, or wildcard. A trailing root slash is accepted by mutation helpers and normalized away; stored keys must already be canonical. Explicit bindings require a raw SitePack manifest ID and detect bindings forbid `packId`. Unknown keys, malformed records, and unsupported schema versions fail explicitly.

PackManager exposes snapshot and mutation operations for later UI work. Creating an explicit binding through PackManager requires the target pack to be installed, while strict storage parsing deliberately preserves a restored stale binding so reconciliation can report it. Uninstall removes every explicit binding targeting that pack; detect bindings remain because they refer to the shared pool rather than one package.

## Derived Reference Graph

The graph contains one entry per desired origin pattern and one edge per unique `packId + source` pair:

- `static`: every static match of an effectively enabled pack, collapsed to its origin pattern;
- `explicit`: the exact bound origin when its selected pack exists and is effectively enabled;
- `detect`: the exact bound origin for every effectively enabled pack with at least one detect rule.

`referenceCount` is always `references.length`. Static path variants from the same pack produce one static edge, while the same pack can retain separate static and binding edges because removing either source must not remove the other. An explicit binding to a missing pack produces a `binding-pack-missing` issue and no reference. A disabled or registry-unavailable pack simply contributes no active edge.

Permission preflight for one pack includes its static origins, explicit bindings targeting it, and every detect binding when the pack has detect rules. This lets the existing enable/install authorization path cover binding-derived origins without changing the registration unit.

## Registration Coverage and Wildcards

Reference patterns remain distinct for ownership and permission lifecycle. Permission checks therefore run before registration-pattern folding. This matters when a static wildcard such as `https://*.example.com/*` overlaps an exact binding such as `https://chat.example.com/*`: an exact grant can still activate the binding even when the wildcard grant is missing.

After permission checks, active patterns are reduced to a minimal covering set. A wildcard covers its base host and subdomains; a no-port pattern covers explicit ports, while an explicit-port pattern covers only the same explicit port scope. If an authorized wildcard covers an authorized exact origin, only the wildcard receives registrations. All original reference edges and managed permissions remain intact, so removing the wildcard reference causes reconciliation to replace it with the exact registration without losing the exact binding.

## Lifecycle and Error Handling

- Background watches both `sitepacks/installed` and `sitepacks/origin-bindings` and schedules the same serialized reconciliation.
- Reconciliation returns active registration patterns, missing-permission patterns, derived reference entries, binding issues, and existing pack issues.
- Disabling or uninstalling one referenced pack changes only its edges. Registrations and managed permissions remain while any edge for that pattern exists.
- When the final edge disappears, reconciliation unregisters the scripts and revokes only SitePack-managed permissions.
- External permission removal removes affected registrations and prunes stale managed ownership on the next reconciliation.
- Corrupt binding storage is not ignored or replaced with an empty table. The error is surfaced by the caller and logged by background scheduling.

## Verification

- Strict schema smoke for canonical origins, explicit/detect shapes, unsupported versions, and stale explicit bindings.
- PackManager smoke for binding CRUD and uninstall cleanup while preserving detect bindings.
- Reference-graph smoke for static, explicit, and detect edges plus missing-pack issues.
- Registration smoke with two detect packs sharing one origin: one script set, count decrement on disable/uninstall, and cleanup only after the last edge disappears.
- Coverage smoke for wildcard plus exact origin under broad-only, exact-only, and both-permission states.
- Permission-removal and startup reconciliation smoke.
- Format, lint, typecheck, Chrome build, userscript build, and `git diff --check`.
