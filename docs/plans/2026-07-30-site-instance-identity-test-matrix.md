# Site Instance Identity Test Matrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add durable regression coverage for P1-15's origin-scoped settings, reading history, conversations, and legacy migrations.

**Architecture:** Exercise pure identity and settings migration helpers directly, run the real persisted stores behind a mocked storage adapter, and use the real `ConversationManager` to verify raw-ID operations translate to instance-scoped storage keys.

**Tech Stack:** TypeScript 5.3, Vitest 3.2.4, Zustand persist, SiteAdapter/DeclarativeAdapter, and the existing settings and conversation stores.

---

### Task 1: Cover identity primitives and adapter legacy ownership

**Files:**

- Create: `src/utils/site-identity.test.ts`
- Modify: `src/adapters/declarative/adapter.test.ts`

1. Cover canonical HTTP(S) origins, invalid-origin rejection, built-in IDs, dynamic instance keys, scoped-key collision resistance, and persisted identity resolution.
2. Prove a declarative pack with one exact origin can claim legacy data.
3. Prove wildcard, multi-origin, explicit, and detected adapters cannot claim shared legacy data.

### Task 2: Cover settings and reading-history isolation

**Files:**

- Create: `src/utils/site-instance-settings.test.ts`
- Create: `src/stores/site-instance-storage.test.ts`

1. Store distinct theme, layout, and model-lock values under two origins of the same pack and assert selectors do not cross-read.
2. Move legacy pack-level settings to one instance, remove every old record key, and preserve any pre-existing instance value.
3. Exercise the real reading-history store with two scoped keys and verify legacy claiming is atomic and does not overwrite current data.

### Task 3: Cover conversation migration and manager isolation

**Files:**

- Extend: `src/stores/site-instance-storage.test.ts`
- Create: `src/core/conversation/manager.test.ts`

1. Migrate version-0 built-in and dynamic conversations, including equal raw IDs on two origins and an unresolved dynamic record.
2. Assert built-in fields are preserved, dynamic records receive distinct composite keys, unresolved data is not exposed, and duplicate resolution keeps the newest record with a warning.
3. Seed two same-ID conversations for two origins, then prove each real `ConversationManager` reads, renames, pins, and deletes only its own instance.

### Task 4: Verify, track, and deliver

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

1. Run the focused tests, then the full suite.
2. Run format, focused ESLint, typecheck, registry validation, extension build, userscript build, and `git diff --check`.
3. Review for pack-level fallback, raw conversation-key mutations, duplicate identity sources, P1-16/P1-17/P2-02 scope leakage, UI/theme/Shadow DOM changes, generated files, and `.gitignore` staging.
4. Mark P1-15 `已完成`, commit with `test(core): cover site instance isolation`, and push.
