# NextChat Official SitePack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish a pure-JSON NextChat SitePack for user-bound deployments with verified prompt insertion, outline, basic export, new-chat, and Zen behavior.

**Architecture:** Add one schema-v1 manifest with `matches: []` and a detector combining NextChat's config metadata, application body, textarea ID, and semantic send-control class stem. Reuse the existing declarative adapter and omit private local-session inspection and unverified generation capabilities.

**Tech Stack:** JSON Schema draft-07, TypeScript runtime validation, fixed NextChat v2.16.1 source inspection, Playwright against `https://app.nextchat.club/`, pnpm registry scripts, React/Plasmo extension build, and Vite userscript build.

---

### Task 1: Record the NextChat design evidence

**Files:**

- Create: `docs/plans/2026-07-29-nextchat-site-pack-design.md`
- Create: `docs/plans/2026-07-29-nextchat-site-pack.md`

**Step 1: Record release and hosted-build identity**

Document release `v2.16.1`, tag commit `557a2cce357749c6fb3176d42e03ff6f7de4d355`, the official Web App metadata reporting hosted commit `706a18b95b714ab29b2a4842d3b9ff4f887935d5`, and the paused `app.nextchat.dev` deployment.

**Step 2: Record the conservative capability boundary**

Document why local session identity, generation detection, stop, width, model, clean, quick quote, Mermaid, and host-theme capabilities remain absent.

### Task 2: Add the NextChat manifest

**Files:**

- Create: `registry/sites/nextchat.json`

**Step 1: Add localized metadata and detect-only activation**

Use `id: "nextchat"`, `version: 1`, `minAppVersion: "1.1.8"`, all eleven metadata locales, `matches: []`, and the combined config/body/composer detector.

**Step 2: Add the verified capability contract**

Declare only `outline`, `outline-user-queries`, `export-basic`, `new-chat`, `zen`, and `prompt-insert`.

**Step 3: Add semantic selectors**

Use `#chat-input`, `#app-body`, CSS Modules class stems for the send control, message viewport, role wrappers, message body, sidebar tail, and sidebar shell, plus the global `.window-header`. Omit session configuration because NextChat uses hash routes and local store indexes.

**Step 4: Run focused validation**

Run:

```powershell
pnpm registry:validate
```

Expected: schema and runtime validation accept the class-fragment selectors, empty matches, capabilities, and Zen targets.

### Task 3: Verify the official Web App

**Files:**

- Store ignored browser state only under `.playwright-mcp/`

**Step 1: Verify selector cardinality**

Confirm one match for the detector, textarea, send control, message viewport, assistant body, turn, new-chat button, sidebar, and header. Confirm the default session has no user message and retain fixed-source evidence for that branch.

**Step 2: Verify prompt insertion**

Fill `#chat-input`, confirm the controlled value updates, and confirm the semantic send-control selector resolves a ready button. Clear the input afterward.

**Step 3: Verify new-chat navigation**

Click the language-independent sidebar-tail selector and confirm navigation to `/#/new-chat`, then return to the original route. Do not submit a model request or create external account state.

### Task 4: Verify registry publication output

**Files:**

- Generate temporarily: `registry/dist/index.json`
- Generate temporarily: `registry/dist/packs/nextchat/1.json`

**Step 1: Build the registry distribution**

Run:

```powershell
pnpm registry:build
```

Expected: the index contains an enabled NextChat entry with immutable path `packs/nextchat/1.json`.

**Step 2: Verify the digest**

Recompute the SHA-256 digest of the generated pack bytes and compare it with the index entry. Do not stage generated output.

### Task 5: Run repository checks and review

**Files:**

- Verify: both P2-07 packages and documentation

**Step 1: Run repository checks**

```powershell
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

Expected: checks pass, lint has no errors, and both target builds succeed.

**Step 2: Review the final diff**

Confirm the package has no official-host grant, localized selector, false pathname session model, private-store dependency, unverified generation capability, generated artifact, or unrelated formatting change.

### Task 6: Commit and push with LibreChat

**Files:**

- Stage: the two manifests, four P2-07 plan documents, and the P2-07 CSV status

**Step 1: Commit the combined task**

```powershell
git commit -m "feat(registry): add LibreChat and NextChat site packs"
```

**Step 2: Push the branch**

```powershell
git push origin feat/site-adapter-pluginization
```

Expected: the remote branch contains both official packs as one P2-07 delivery slice, while `.gitignore` remains a local user change.
