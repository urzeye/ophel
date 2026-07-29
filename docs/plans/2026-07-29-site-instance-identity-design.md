# Site Instance Identity Design

## Context

P1-08 allowed dynamic `pack:` site IDs to flow through the application, but one SitePack can eventually serve multiple origins. Treating `pack:open-webui` as both the adapter identity and the persisted data key would make those origins share themes, layout settings, reading positions, and conversations. The current conversations store also keys records by the raw conversation ID, so equal IDs from different sites can overwrite each other.

P1-15 separates implementation identity from data-partition identity without changing built-in adapter behavior.

## Considered approaches

### 1. Include the origin in `getSiteId()`

Rejected. `siteId` is already the stable identity used by capability tables, installed-pack metadata, update lookup, platform filters, and built-in-specific branches. Making it origin-specific would duplicate one installed pack into multiple apparent adapters and break those consumers.

### 2. Change only the conversations record key

Rejected. It prevents direct conversation overwrites but leaves themes, layout settings, model lock, and reading history shared. It also provides no explicit ownership field for migration and filtering.

### 3. Add an explicit `siteInstanceKey` and scoped storage keys

Selected. `getSiteId()` remains the adapter/pack identity. `getSiteInstanceKey()` is the data partition key: built-in adapters return their existing site ID, while SitePacks combine `pack:<id>` with the canonical current origin. Conversation records retain the raw conversation ID and pack-level `siteId`, add `siteInstanceKey`, and use a versioned encoded composite key in the persisted record.

## Identity model

| Identity | Example | Purpose |
| --- | --- | --- |
| `siteId` / pack identity | `pack:open-webui` | Adapter behavior, capability lookup, installation and updates |
| `siteInstanceKey` | `pack:open-webui@https://chat.example.com` | Theme, layout, model-lock, reading-history, and conversation partition |
| scoped storage key | `v1:<encoded instance>:<encoded conversation id>` | Collision-free persisted conversation/read-history key |

`SiteAdapter.getSiteInstanceKey()` is the only runtime source of the current partition key. Its base implementation returns `getSiteId()` for built-ins and derives the canonical HTTP(S) origin for `pack:` adapters. Invalid or unavailable origins fail explicitly because silently falling back to the pack ID would recreate cross-origin sharing.

## Settings and runtime data flow

Core bootstrap keeps both identities in `ModulesContext`:

- `siteId` remains available for built-in behavior branches and usage/platform attribution.
- `siteInstanceKey` is used for all per-site settings selectors and writes.

The content-panel settings modal, theme synchronization, layout toggles, model lock, and shortcuts use the instance key. The Options page continues to use `_default`, so its global defaults remain unchanged. For a SitePack whose validated matches all resolve to one exact origin, bootstrap atomically moves any old pack-level settings to that instance key and removes the old key. Multi-origin or wildcard packs cannot claim legacy settings, so no fallback can silently share data across origins.

Reading history switches to the same versioned scoped-key helper. Restore first reads the instance key. If absent, it may claim the legacy `siteId:sessionId` entry only when the adapter proves that the current origin is the pack's sole exact origin, then rewrites it under the instance key. Built-in adapters can always claim their unchanged site identity.

No CSS, theme variables, or Shadow DOM injection paths change. ThemeManager remains the single theme source; only the persisted lookup key changes.

## Conversation storage and migration

The conversations Zustand store moves to persistence version 1. Every new conversation stores:

- raw `id`, used for site navigation and export;
- pack-level `siteId`, used for platform attribution;
- `siteInstanceKey`, used for ownership;
- a record key produced from `siteInstanceKey + id`.

At hydration, version-0 records are migrated deterministically:

1. Built-in records use `siteId` as the instance key.
2. Dynamic records derive the instance key from their conversation URL origin.
3. Records already carrying `siteInstanceKey` are normalized to the new composite key.
4. Records whose dynamic origin cannot be derived are preserved under their existing key and logged; they are not exposed to every origin.
5. If two legacy entries resolve to the same composite key, the most recently updated record wins and the conflict is logged. This avoids silent nondeterministic overwrite.

ConversationManager exposes a current-instance view keyed by raw conversation ID, so UI and adapter navigation APIs remain unchanged. All store mutations translate the raw ID to the composite key at the manager boundary. Global tag/folder maintenance continues to operate on the full store.

## Verification

A deterministic TypeScript smoke will cover:

- built-in and dynamic instance-key generation, origin normalization, and invalid-origin rejection;
- collision-free scoped keys;
- version-0 conversation migration for built-in, two dynamic origins with equal raw IDs, and an unresolved legacy record;
- single-origin legacy settings migration and exact instance-key selection;
- reading-history legacy claim and rewrite;
- ConversationManager isolation for two adapters sharing a pack ID.

Repository verification follows the project CI order, plus both extension and userscript builds because bootstrap and shared module initialization change.
