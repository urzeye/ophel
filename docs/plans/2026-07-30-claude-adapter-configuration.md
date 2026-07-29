# Claude Adapter Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert Claude into the second P3-07 configurable built-in adapter without changing its command behavior or Artifact/document paths.

**Architecture:** Keep `ClaudeAdapter` imperative and move serializable selectors plus shared configuration into one validated `ClaudeSiteConfig`. Runtime injection and registry validation reference the same config/version pair; organization and route handling, native deletion, virtual-scroll collection, Artifact/document orchestration, asset safety, outline caching, thought export, and theme switching remain code.

**Tech Stack:** TypeScript, React 18, Plasmo, Vite, Zustand-backed remote configuration runtime.

---

### Task 1: Define the Claude configuration

- Create `src/adapters/claude-config.ts`.
- Preserve selector order and derive repeated conversation, message, document, Artifact, virtual-list, thought, and layout selectors from stable base values.
- Export `CLAUDE_CONFIG_VERSION = 1` and the unique `CLAUDE_CONFIG` object.
- Verify the full default object with `validateBuiltinSiteConfig()` and the Claude capability/private-key requirements.

### Task 2: Make Claude consume injected configuration

- Add the three built-in configuration contract methods.
- Replace patchable selector and pure-config reads with dynamic `this.config` lookups.
- Consolidate duplicated conversation extraction so list, observer, navigation, title, and deletion use the same configured mapping.
- Clone arrays and nested objects returned to callers.
- Preserve native deletion, ProseMirror input, virtual-scroll outline/export, attachment filtering, Artifact/document restore, thought-block export, theme, and panel-avoidance control flow.

### Task 3: Register and document the migration

- Register Claude in `src/core/builtin-config-registry.ts` with the shared config/version pair.
- Add `docs/developer/claude-adapter-config-hotfix-matrix.md` with hotfixable and release-only boundaries.
- Keep P3-07 in progress because real-site regression remains outstanding.

### Task 4: Verify and deliver

- Validate defaults, patch application, private-key rejection, and stale-version behavior.
- Audit default equivalence, all private-key usages, remaining direct host selectors, and special Artifact/document/thought/virtual-list paths.
- Run focused formatting/ESLint, typecheck, full formatting/ESLint, extension and userscript builds, and `git diff --check`.
- Exclude the user-owned `.gitignore`, then commit and push the Claude batch independently.
