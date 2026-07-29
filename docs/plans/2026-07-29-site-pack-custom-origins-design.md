# SitePack Custom Origins Design

## Context

P2-01 already stores a strict `sitepacks/origin-bindings` table and derives origin references during extension reconciliation. The remaining user-facing gap is the ability to add an exact HTTPS origin, authorize it, choose an installed SitePack (explicit mode) or the shared detect pool, and remove the binding without leaving registrations or SitePack-owned permissions behind.

## Goals

- Let the SitePacks settings page create, update, list, and remove exact HTTPS origin bindings.
- Request only the exact origin pattern needed for the new binding on the extension platform.
- Keep authorization, registration, permission ownership, and rollback on the existing background reconciler path.
- Activate an explicit binding before static dynamic-pack matches while keeping built-in adapters highest priority.
- Save bindings on userscript even though runtime permission expansion is unsupported.
- Keep all existing static-pack install and authorization flows unchanged.

## Non-goals

- Evaluating `detect` DOM rules or choosing between multiple detect hits; that is P2-04.
- Userscript `@match` manager instructions; that is P2-03.
- Adding a second origin ownership/count store.
- Changing the theme system or Shadow DOM injection chain.

## Design

### Binding and authorization flow

The page canonicalizes the entered origin with the existing strict binding codec and constructs an `explicit` or `detect` binding. Before persisting a new or replacement binding, it calls `platform.sitePacks.ensureBindingOrigin(origin, binding)`. The extension implementation validates the target pack or detect pool, checks `https://authority/*`, opens the existing permission request page only for that missing pattern, and records newly granted permission ownership through the registration manager. A denial leaves the previous binding untouched. On userscript the method returns `unsupported`; the page still persists the binding and reports that script-manager matching remains a separate concern.

After persistence the page reconciles immediately. If persistence or reconciliation fails, it restores the previous binding (or removes a newly created one), reconciles again, and surfaces the original error. Removing a binding follows the same rollback discipline. The reconciler unregisters scripts and revokes an owned origin only when no static, explicit, or detect reference remains.

### Adapter activation

`loadDynamicAdapters()` reads bindings beside the enabled-pack snapshot. On the current page origin, an enabled explicit binding creates a `DeclarativeAdapter` with an `explicitOrigin` override and is placed in a separate list before ordinary dynamic adapters. `DeclarativeAdapter.match()` returns true for that exact origin in explicit mode; `canClaimLegacySiteData()` returns false for the override. Built-in adapters remain first. Detect bindings are persisted and authorized here but do not alter matching until P2-04 supplies DOM detection.

### Settings UI

The existing SitePacks page gains a preserve-mode card between installed packs and the registry. It contains an exact-origin input, a mode dropdown, an installed-pack dropdown for explicit mode, and a save/update action. A list below shows each binding's origin, mode, selected pack or detect pool, reference count, permission/activation status, and remove action. The page watches both installed-pack and origin-binding storage keys and uses `runtimeStatus.originReferences` rather than static manifest matches for permission review. Existing buttons, inputs, `--gh-*` variables, focus states, responsive breakpoints, and Shadow DOM style injection remain in use.

## Error handling

- Invalid/noncanonical origins and missing explicit packs are rejected by the existing strict codecs and shown as operation feedback.
- A denied extension permission does not write a new binding or overwrite an old one.
- Any post-write failure triggers a best-effort state rollback and a second reconciliation; rollback failure is reported explicitly.
- Stale explicit bindings remain visible through `bindingIssues` rather than being silently discarded.

## Verification

- Focused smoke for binding authorization success/denial, replacement/removal rollback, ownership cleanup, and explicit adapter precedence.
- Locale-key parity across all 11 application languages.
- `pnpm format:check`, `pnpm lint:check`, `pnpm typecheck`, Chrome/userscript builds, and `git diff --check`.
- Minimal options-page browser smoke when a runtime browser is available: add, update, remove, denied permission, and disabled detect option states.
