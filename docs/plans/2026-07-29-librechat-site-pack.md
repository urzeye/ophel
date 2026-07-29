# LibreChat Official SitePack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish a pure-JSON LibreChat SitePack for user-bound self-hosted origins with stable core chat selectors, generation controls, session paths, and localized metadata.

**Architecture:** Add one schema-v1 manifest with `matches: []` and a strong composer detector, then rely only on the existing declarative adapter, origin binding, generation state, export manager, session manager, and layout manager. Keep sidebar history and other unverified features absent so capability gating stays truthful.

**Tech Stack:** JSON Schema draft-07, TypeScript runtime validation, fixed LibreChat v0.8.7 source and e2e inspection, read-only official demo bundle inspection, pnpm registry scripts, React/Plasmo extension build, and Vite userscript build.

---

### Task 1: Record the LibreChat evidence and P2-07 slice

**Files:**

- Create: `docs/plans/2026-07-29-librechat-site-pack-design.md`
- Create: `docs/plans/2026-07-29-librechat-site-pack.md`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Mark P2-07 in progress**

Change only P2-07 from `未开始` to `进行中`. Keep the task open because the official demo disables registration and cannot provide an authenticated chat smoke in this slice.

**Step 2: Record fixed and deployed evidence**

Document tag `v0.8.7`, commit `9e74cc0e57b395926122bd4062c1fcedc48ed465`, the stable selectors and routes, the official demo login restriction, `/api/config` build information, deployed bundle literals, excluded capabilities, and the remaining acceptance limitation.

### Task 2: Add the LibreChat manifest

**Files:**

- Create: `registry/sites/librechat.json`

**Step 1: Add localized metadata and detect-only activation**

Use `id: "librechat"`, `version: 1`, `minAppVersion: "1.1.8"`, all eleven metadata locales, `matches: []`, and the composer-form detector.

**Step 2: Add the verified capability contract**

Declare `outline`, `outline-user-queries`, `export-basic`, `generation-detect`, `new-chat`, `stop-generation`, `zen`, and `prompt-insert`. Do not declare conversation history, width, model, clean, quick-quote, Mermaid, or host-theme capabilities.

**Step 3: Add selectors and session paths**

Use the stable test IDs for the textarea, send, stop, and new-chat controls; semantic message/role/content classes for outline and export; `/c/<id>`, `/c/new`, and `/share/` for session boundaries; and source-derived desktop/mobile navigation targets for Zen.

**Step 4: Run focused validation**

Run:

```powershell
pnpm registry:validate
```

Expected: schema and runtime validation accept the detect-only package, selector syntax, safe regexes, and capability requirements.

### Task 3: Verify the official release and deployment evidence

**Files:**

- Read ignored source: `output/research/p2-07/librechat/LibreChat-9e74cc0e57b395926122bd4062c1fcedc48ed465/`

**Step 1: Verify fixed source and upstream tests**

Confirm the input, send, stop, new-chat, message wrapper, role, content, scroll, route, and e2e selector contracts.

**Step 2: Verify the official demo read-only**

Confirm the login redirect, disabled registration, deployed build metadata, and selector literals in the deployed application bundle. Do not create an external account or present this as an authenticated runtime smoke.

### Task 4: Verify registry publication output

**Files:**

- Generate temporarily: `registry/dist/index.json`
- Generate temporarily: `registry/dist/packs/librechat/1.json`

**Step 1: Build the registry distribution**

Run:

```powershell
pnpm registry:build
```

Expected: the index contains an enabled LibreChat entry with immutable path `packs/librechat/1.json`.

**Step 2: Verify the digest**

Recompute the SHA-256 digest of the generated pack bytes and compare it with the index entry. Do not stage `registry/dist/`.

### Task 5: Run repository checks

**Files:**

- Verify: all files above

**Step 1: Run static and build checks**

```powershell
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

Expected: format and typecheck pass; lint has no errors; both builds succeed; diff check is clean.

**Step 2: Review the focused diff**

Confirm the package adds no static host, executable field, localized selector, false history capability, duplicate state source, or generated file. Keep `.gitignore` unstaged.

### Task 6: Commit and push the P2-07 slice

**Files:**

- Stage: both P2-07 manifests, four plan documents, and the P2-07 CSV status only

**Step 1: Check the worktree**

Run `git status --short` and verify the user's `.gitignore` change remains unstaged.

**Step 2: Commit**

```powershell
git commit -m "feat(registry): add LibreChat and NextChat site packs"
```

**Step 3: Push**

```powershell
git push origin feat/site-adapter-pluginization
```

Expected: the remote branch contains the complete P2-07 source slice while the local worktree retains only the user's pre-existing `.gitignore` modification.
