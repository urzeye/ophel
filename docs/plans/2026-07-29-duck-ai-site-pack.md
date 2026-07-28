# Duck.ai Official SitePack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish the first official pure-JSON SitePack for Duck.ai with localized metadata and only real-browser-verified capabilities.

**Architecture:** Add one schema-v1 manifest under `registry/sites/` and rely exclusively on the existing declarative adapter, metadata resolver, registry integrity builder, and dynamic origin registration manager. Keep session-dependent and unverified features absent so the manifest remains least-privilege and truthful.

**Tech Stack:** JSON Schema draft-07, TypeScript runtime validation, Playwright real-browser smoke, pnpm registry scripts, React/Plasmo extension build, and Vite userscript build.

---

### Task 1: Add the Duck.ai manifest

**Files:**

- Create: `registry/sites/duck-ai.json`
- Delete: `registry/sites/.gitkeep`

**Step 1: Add localized metadata and the single match**

Use `id: "duck-ai"`, `version: 1`, `minAppVersion: "1.1.8"`, all eleven metadata locales, and only `https://duck.ai/*`.

**Step 2: Add the verified capability contract**

Declare exactly `outline`, `outline-user-queries`, `export-basic`, `generation-detect`, `new-chat`, `stop-generation`, `width`, `zen`, and `prompt-insert`. Do not add conversation or session-dependent capabilities.

**Step 3: Add selectors and layout configuration**

Use the browser-verified `data-testid`, semantic adjacency, and direct-child selectors documented in the design. Configure textarea input with Enter submission, DOM generation detection, export pairs, two `max-width` targets, and sidebar/top-toolbar zen hiding.

**Step 4: Run the focused registry validator**

Run:

```powershell
pnpm registry:validate
```

Expected: the Duck.ai manifest passes both JSON Schema and TypeScript runtime validation with no overlap or unsafe-CSS errors.

### Task 2: Track the Phase 1 slice

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`
- Create: `docs/plans/2026-07-29-duck-ai-site-pack-design.md`
- Create: `docs/plans/2026-07-29-duck-ai-site-pack.md`

**Step 1: Mark P1-13 in progress**

Change only the P1-13 status from `未开始` to `进行中`. Final completion remains tied to installation and release acceptance beyond the source slice.

**Step 2: Record design decisions and evidence**

Document the least-privilege host boundary, excluded capabilities, selector rationale, session limitation, width/zen injection path, and browser evidence.

### Task 3: Verify registry publication output

**Files:**

- Generate temporarily: `registry/dist/index.json`
- Generate temporarily: `registry/dist/packs/duck-ai/1.json`

**Step 1: Build the registry distribution**

Run:

```powershell
pnpm registry:build
```

Expected: the distribution contains one enabled Duck.ai entry, immutable version path `packs/duck-ai/1.json`, and a SHA-256 digest matching the generated manifest bytes.

**Step 2: Inspect the generated entry**

Read the Duck.ai index row and independently recompute the SHA-256 value. Do not stage `registry/dist/`.

### Task 4: Run browser capability acceptance

**Files:**

- Store ignored evidence: `output/playwright/duck-ai-conversation.png`
- Store ignored evidence: `output/playwright/duck-ai-layout.png`
- Store ignored evidence: `output/playwright/duck-ai-new-chat.png`

**Step 1: Verify prompt and message selectors**

Use the native textarea value setter plus `input` and `change` events. Confirm inserted text appears, the submit button enables, clearing succeeds, and the submit button disables again.

**Step 2: Verify outline and export selectors**

Confirm user queries and rendered headings are returned in DOM order, and that user/assistant selector counts match across multiple turns.

**Step 3: Verify generation controls**

Submit a long response, confirm the stop selector becomes visible and enabled, click it, and confirm the input is enabled while the stop action returns to its idle hidden state.

**Step 4: Verify new chat, width, and zen**

Confirm new chat clears the message stream. Apply representative generated layout CSS, measure wider turn/composer containers and expanded chat area, then remove it and confirm exact restoration.

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

Confirm the manifest contains no second origin, executable field, unverified capability, session assertion, hard-coded theme behavior, or generated file. Confirm `.gitignore` remains unstaged.

### Task 6: Commit and push the completed slice

**Files:**

- Stage only the Duck.ai manifest, removed placeholder, two plan documents, and P1-13 CSV status.

**Step 1: Commit**

```powershell
git commit -m "feat(registry): add Duck.ai site pack"
```

**Step 2: Push**

```powershell
git push origin feat/site-adapter-pluginization
```

Expected: the remote branch contains the complete P1-13 source slice and the working tree retains only the user's pre-existing `.gitignore` modification.
