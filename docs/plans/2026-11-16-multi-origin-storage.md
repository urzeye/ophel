# Multi-origin storage simplification

**Goal:** Isolate conversation data by origin while sharing builtin site settings, without
migrating legacy data for Kimi, Doubao/Dola, or Z.ai.

**Architecture:** Runtime origins determine data partitions. Unpartitioned records for these
three adapters remain stored but are excluded from conversation lists, search, reading-position
restoration, and bookmarks. Single-host sites and existing SitePack compatibility retain their
current behavior.

**Tech stack:** TypeScript, Zustand persist, extension and userscript storage adapters.

## Accepted decisions

- There are no released users of this branch's partitioned keys or schema changes.
- Remove primary-host selection, URL-based legacy reassignment, and multi-generation claims.
- Retain the existing conversation schema version and bookmark array format.
- Keep the bookmark `siteId` storage field; new records store the data partition key in it.
- Settings continue to use the shared builtin site ID.
- Legacy conversation metadata, reading positions, and bookmarks are not automatically inherited.
  Conversations can be resynced; server-side conversation content is unaffected.
- Keep legacy records available to backups; restoring a legacy backup does not assign them to a
  new origin.

## Implementation plan

1. Simplify `src/utils/site-identity.ts` and `src/adapters/base.ts`: require a runtime origin for
   partitioned sites, preserve builtin `www` normalization, reject unpartitioned legacy identities,
   and restore the existing legacy-claim eligibility rule.
2. Remove this branch's extra reading-position generation and conversation schema bump in
   `src/core/reading-history.ts`, `src/stores/reading-history-store.ts`, and
   `src/stores/conversations-store.ts`.
3. Remove bookmark migration and field renaming in `src/stores/bookmarks-store.ts`; preserve
   partition-aware queries and existing single-origin SitePack legacy matching.
4. Exclude unpartitioned multi-host builtin conversations in
   `src/components/global-search/useGlobalSearchData.ts`. Retain them in storage and backups.
5. Update both changelogs and PR #1047 to explain the compatibility boundary.

## Verification and delivery

- Statically trace lists, search, mutations, bookmarks, reading progress, backup restoration,
  shared settings, and both platform entry points.
- Run formatting, lint, and TypeScript checks only; do not build, run tests, or simulate behavior.
- Inspect the final diff for remaining primary-host or multi-generation migration logic.
- Append a new commit and push normally to the existing PR branch; do not amend or force push.
