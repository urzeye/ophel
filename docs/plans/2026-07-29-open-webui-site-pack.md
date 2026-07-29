# Open WebUI Official SitePack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish a pure-JSON Open WebUI SitePack that activates on user-bound self-hosted origins and provides only real-browser-verified core capabilities.

**Architecture:** Add one schema-v1 manifest with `matches: []` and a strong composer DOM detect rule, then rely exclusively on the existing exact-origin binding, declarative adapter, network monitor, session primitives, and layout manager. Keep unstable or unverified controls absent so capability gating remains truthful and least-privilege.

**Tech Stack:** JSON Schema draft-07, TypeScript runtime validation, Playwright CLI against official Open WebUI v0.11.0, pnpm registry scripts, React/Plasmo extension build, and Vite userscript build.

---

### Task 1: Record the Open WebUI design and Phase 2 slice

**Files:**

- Create: `docs/plans/2026-07-29-open-webui-site-pack-design.md`
- Create: `docs/plans/2026-07-29-open-webui-site-pack.md`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Mark P2-05 in progress**

Change only the P2-05 status from `未开始` to `进行中`. Final milestone completion remains tied to registry/release acceptance beyond this source slice.

**Step 2: Record alternatives and browser evidence**

Document the detect-only origin model, excluded capabilities, selector narrowing, asynchronous prompt insertion, network route, session paths, Zen behavior, official-demo unavailability, and the official PyPI v0.11.0 substitute environment.

### Task 2: Add the Open WebUI manifest

**Files:**

- Create: `registry/sites/open-webui.json`

**Step 1: Add localized metadata and detect-only activation**

Use `id: "open-webui"`, `version: 1`, `minAppVersion: "1.1.8"`, all eleven metadata locales, `matches: []`, and only the verified composer-form detect selector.

**Step 2: Add the verified capability contract**

Declare exactly `outline`, `outline-user-queries`, `export-basic`, `generation-detect`, `new-chat`, `zen`, and `prompt-insert`. Do not add stop, conversation, history, width, model, or clean capabilities.

**Step 3: Add narrowed selectors**

Use `#chat-input`, `#send-message-button`, the semantic message log as the outline root, content-only user and assistant selectors, and both expanded and collapsed new-chat selectors. Configure contenteditable input with Enter submission and basic export without Shadow DOM traversal.

**Step 4: Add network, session, and Zen configuration**

Monitor only `/api/chat/completions`, derive session IDs from `/c/<id>`, recognize `/` as new chat and `/s/` as sharing, open new tabs at `/`, and hide only the shipped sidebar and top navigation targets.

**Step 5: Run the focused registry validator**

Run:

```powershell
pnpm registry:validate
```

Expected: both JSON Schema and TypeScript runtime validation accept the detect-only manifest, its safe regexes, capability requirements, selectors, and CSS boundary.

### Task 3: Verify browser capability evidence

**Files:**

- Store ignored evidence: `output/playwright/open-webui/open-webui-prompt-insert.png`
- Store ignored evidence: `output/playwright/open-webui/open-webui-streaming.png`
- Store ignored evidence: `output/playwright/open-webui/open-webui-conversation.png`
- Store ignored evidence: `output/playwright/open-webui/open-webui-zen.png`
- Store ignored evidence: `output/playwright/open-webui/open-webui-new-chat.png`

**Step 1: Verify detect and prompt insertion**

Confirm the detect form and all component IDs exist. Exercise the declarative contenteditable insertion algorithm and confirm the existing retry window observes the ready send action.

**Step 2: Verify outline and export selectors**

Confirm the final outline root returns only the rendered H1/H2/H3, the user selector excludes its timestamp, and the assistant selector excludes floating actions.

**Step 3: Verify generation, session, new chat, and Zen**

Confirm the streamed request path, `/c/<id>` navigation, new-chat clearing at `/`, and exact Zen hide/restore states. Record that the stop action remains localized and is intentionally not declared.

### Task 4: Verify registry publication output

**Files:**

- Generate temporarily: `registry/dist/index.json`
- Generate temporarily: `registry/dist/packs/open-webui/1.json`

**Step 1: Build the registry distribution**

Run:

```powershell
pnpm registry:build
```

Expected: the distribution contains one enabled Open WebUI entry and immutable version path `packs/open-webui/1.json`.

**Step 2: Inspect the generated entry**

Read the Open WebUI index row and independently recompute the SHA-256 digest of the generated manifest bytes. Do not stage `registry/dist/`.

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

Confirm the manifest contains no static origin, executable field, localized selector, unverified capability, unnecessary duplicate configuration source, hard-coded Ophel theme behavior, or generated file. Confirm `.gitignore` remains unstaged.

### Task 6: Clean temporary evidence, commit, and push

**Files:**

- Delete locally: temporary Open WebUI mock, acceptance scripts, browser snapshots, local data, and secret-key artifacts
- Stage only: the Open WebUI manifest, two plan documents, and P2-05 CSV status

**Step 1: Check the final worktree**

Run `git status --short` and verify that only the intended source files plus the user's pre-existing `.gitignore` modification remain.

**Step 2: Commit**

```powershell
git commit -m "feat(registry): add Open WebUI site pack"
```

**Step 3: Push**

```powershell
git push origin feat/site-adapter-pluginization
```

Expected: the remote branch contains the complete P2-05 source slice, while the working tree retains only the user's pre-existing `.gitignore` modification.
