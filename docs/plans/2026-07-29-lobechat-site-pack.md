# LobeChat Official SitePack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish a pure-JSON LobeChat SitePack for user-bound self-hosted origins, with stable-release selectors and compatible current-page message extraction.

**Architecture:** Add one schema-v1 manifest with `matches: []` and strong DOM detection, then rely exclusively on the existing exact-origin binding, declarative adapter, network monitor, export manager, and layout manager. Keep query-string session identity and other unverified features absent so capability gating remains truthful.

**Tech Stack:** JSON Schema draft-07, TypeScript runtime validation, Playwright against an official public share page, fixed-tag and production-image inspection for LobeChat 1.143.3, pnpm registry scripts, React/Plasmo extension build, and Vite userscript build.

---

### Task 1: Record the LobeChat design and Phase 2 slice

**Files:**

- Create: `docs/plans/2026-07-29-lobechat-site-pack-design.md`
- Create: `docs/plans/2026-07-29-lobechat-site-pack.md`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Mark P2-06 in progress**

Change only the P2-06 status from `未开始` to `进行中`. Final milestone completion remains tied to registry and release acceptance beyond this source slice.

**Step 2: Record split-version evidence**

Document the detect-only origin model, stable 1.143.3 source and image evidence, current public-share browser evidence, dual-generation selector branches, virtual-list limitation, excluded capabilities, network route, omitted session identity, and stable Zen targets.

### Task 2: Add the LobeChat manifest

**Files:**

- Create: `registry/sites/lobechat.json`

**Step 1: Add localized metadata and detect-only activation**

Use `id: "lobechat"`, `version: 1`, `minAppVersion: "1.1.8"`, all eleven metadata locales, `matches: []`, and only the strong composer or rendered-message detection rules.

**Step 2: Add the verified capability contract**

Declare exactly `outline`, `outline-user-queries`, `export-basic`, `generation-detect`, `new-chat`, `zen`, and `prompt-insert`. Do not add conversation, history, stop, width, model, clean, or host-theme capabilities.

**Step 3: Add cross-version selectors**

Use the Lexical editor and fixed send glyph, stable `#chatlist-list/[data-index]` turns, current `.message-wrapper[data-message-id]` turns, narrowed Markdown articles, the MessageSquarePlus new-chat icon, and both virtual-scroll contracts. Configure contenteditable input with Enter submission.

**Step 4: Add generation, export, and Zen configuration**

Monitor only `/webapi/chat/`, keep export ordered through a turn selector, omit the incompatible stable/canary session models, and hide only source-derived stable navigation, session, topic, and header targets.

**Step 5: Run the focused registry validator**

Run:

```powershell
pnpm registry:validate
```

Expected: JSON Schema and TypeScript runtime validation accept the detect-only manifest, selector lists, capability requirements, and network pattern.

### Task 3: Verify official release and browser evidence

**Files:**

- Store ignored research: `output/playwright/lobechat/`

**Step 1: Verify the stable tag and production image**

Confirm `@lobehub/chat@1.143.3`, tag commit `d718de7e1af2dd7281c4eaca70f627e4b9deddb1`, the official image package version, fixed message-list ID, virtual-list item marker, assistant layout attribute, Lexical attribute, send glyph, new-chat icon, and `/webapi/chat/{provider}` route.

**Step 2: Verify the current public page**

On `https://app.lobehub.com/share/t/RmZwPMEK`, confirm the theme root, strict virtual container, message-wrapper turn marker, role alignment variables, Markdown-body narrowing, and mounted-message counts. Record that the page is read-only and cannot validate composer or layout behavior.

### Task 4: Verify registry publication output

**Files:**

- Generate temporarily: `registry/dist/index.json`
- Generate temporarily: `registry/dist/packs/lobechat/1.json`

**Step 1: Build the registry distribution**

Run:

```powershell
pnpm registry:build
```

Expected: the distribution contains one enabled LobeChat entry and immutable version path `packs/lobechat/1.json`.

**Step 2: Inspect the generated entry**

Read the LobeChat index row and independently recompute the SHA-256 digest of the generated manifest bytes. Do not stage `registry/dist/`.

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

Confirm the manifest contains no static origin, executable field, localized selector, false session model, unstable generated class, unnecessary duplicate data source, or generated file. Confirm `.gitignore` remains unstaged.

### Task 6: Commit and push the completed slice

**Files:**

- Stage only: the LobeChat manifest, two plan documents, and P2-06 CSV status.

**Step 1: Check the final worktree**

Run `git status --short` and verify that only the intended source files plus the user's pre-existing `.gitignore` modification remain.

**Step 2: Commit**

```powershell
git commit -m "feat(registry): add LobeChat site pack"
```

**Step 3: Push**

```powershell
git push origin feat/site-adapter-pluginization
```

Expected: the remote branch contains the complete P2-06 source slice while the working tree retains only the user's pre-existing `.gitignore` modification.
