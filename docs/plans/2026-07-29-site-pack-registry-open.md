# SitePack Registry Open Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Open the SitePack registry to contributions with editor Schema support, CI cross-validation, contributor guidance, and verified integrity/compatibility consumption.

**Architecture:** Keep `validateSitePackManifest()` as the runtime and security source of truth. Add a draft-07 JSON Schema as a contributor-facing mirror, compile it with an explicit Ajv development dependency, and require registry pack inputs plus one comprehensive example to pass both validators.

**Tech Stack:** JSON Schema draft-07, Ajv 8, TypeScript/tsx registry scripts, GitHub pull request templates and Actions, Markdown contributor documentation, and the existing RemoteConfigManager/PackManager view model.

---

### Task 1: Publish the SitePack schema and example

**Files:**

- Create: `registry/schema/site-pack.schema.json`
- Create: `registry/examples/site-pack.example.json`
- Modify: `.vscode/settings.json`

**Step 1: Encode the manifest object graph**

Define every key from `SitePackManifest`, `SitePackConfig`, and the reused base configuration interfaces. Set `additionalProperties: false` at every fixed-shape object, use the runtime constants for string/array limits, and require only the fields required by `validateSitePackManifest()`.

**Step 2: Encode cross-field requirements**

Add draft-07 `if`/`then` clauses for empty `matches`, all capability prerequisites, and `outline-user-queries` depending on `outline`. Do not attempt to reproduce safe-regex or normalized CSS analysis in JSON Schema.

**Step 3: Add a comprehensive synthetic example**

Create an `example.com` manifest that covers every optional configuration family and all capabilities without representing a real supported site. Confirm the runtime validator accepts it.

**Step 4: Add editor mapping**

Map `registry/sites/*.json` and `registry/examples/*.json` to the local schema in `.vscode/settings.json`. Keep `$schema` out of manifest JSON because it is not an allowed runtime key.

### Task 2: Cross-validate Schema and runtime inputs

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `registry/scripts/validate.mjs`

**Step 1: Make Ajv explicit**

Run:

```powershell
pnpm add --save-dev ajv@^8.17.1
```

Expected: Ajv appears directly in `devDependencies` and the lockfile records the root importer dependency without unrelated upgrades.

**Step 2: Compile the schema once**

Load `registry/schema/site-pack.schema.json`, compile it with Ajv strict/all-errors settings, and format schema failures with source and JSON-pointer paths.

**Step 3: Validate the example and every pack twice**

Require the example and each registry SitePack to pass the compiled schema and `validateSitePackManifest()` with `safe-regex2`. Leave patch validation and registry policy checks on their existing paths.

**Step 4: Extend registry workflow paths**

Modify `.github/workflows/registry-pr.yml` so schema and example changes trigger the registry validation workflow in addition to SitePack/patch source changes.

### Task 3: Publish contribution and review guidance

**Files:**

- Modify: `registry/README.md`
- Modify: `.github/CONTRIBUTING.md`
- Create: `.github/PULL_REQUEST_TEMPLATE/site-pack.md`
- Create: `docs/developer/site-pack-review-checklist.md`

**Step 1: Document the author workflow**

Explain how to copy the example, choose an ID/version/minimum app version, declare only tested capabilities, use stable selectors, and run `pnpm registry:validate` plus `pnpm registry:build`.

**Step 2: Document validator authority and security boundaries**

State that the JSON Schema is an editor/CI mirror while the TypeScript runtime validator is final. Prohibit script/expression fields, secrets, remote CSS resources, broad match patterns, and changes that overlap built-in sites.

**Step 3: Add the dedicated PR template**

Request source path, site URLs, tested environment, screenshots, per-capability evidence, validation output, stable-selector confirmation, and review-checklist acknowledgement.

**Step 4: Add the maintainer checklist**

Cover automated validation, registry conflicts, selector quality, regex/CSS/path safety, capability-by-capability smoke, compatibility/versioning, evidence, and final publication review.

### Task 4: Track the delivered slices

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1: Update deferred tasks**

Mark P0-03 and P0-12 complete because their concrete Schema/documentation deliverables are now present.

**Step 2: Mark P1-11 in progress**

Change P1-11 from `未开始` to `进行中`. The repository implementation and deterministic acceptance smoke are complete, while a real contributed/official pack and published-registry browser acceptance remain in P1-13/P1-17.

### Task 5: Verify integrity and compatibility acceptance

**Files:**

- Create temporarily, then delete: `.tmp-site-pack-registry-smoke.ts`

**Step 1: Exercise SHA-256 rejection**

Use an in-memory `RemoteConfigStorage`, a deterministic registry index, and a fake transport whose artifact bytes do not match the declared SHA-256. Call `RemoteConfigManager.checkForUpdates({ force: true })` and assert the result is `failed`, the error reports a SHA-256 mismatch, and no active snapshot is installed.

**Step 2: Exercise incompatible-row presentation**

Build a remote state whose index contains a pack requiring a newer Ophel version but whose compatible cache is absent. Pass it to `buildRegistrySitePackViews()` and assert the row remains visible, is classified as `incompatible`, exposes `minAppVersion`, and has no installable version.

**Step 3: Delete the temporary smoke**

Remove `.tmp-site-pack-registry-smoke.ts` with `apply_patch` immediately after it passes.

### Task 6: Verify, review, commit, and push

**Files:**

- Verify: all files above

**Step 1: Run focused registry checks**

```powershell
pnpm registry:validate
pnpm registry:build
```

Expected: the synthetic example passes both validators, the empty source registry validates, and the build creates a valid local empty index under ignored `registry/dist/`.

**Step 2: Run repository checks**

```powershell
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm build
pnpm build:userscript
git diff --check
```

Expected: zero errors; existing lint warnings may remain unchanged.

**Step 3: Review boundaries**

Confirm runtime validation still runs after Schema validation, the example is outside `registry/sites/`, no generated files are staged, no product UI/i18n behavior changed, and `.gitignore` remains unstaged.

**Step 4: Commit and push only P1-11 files**

```powershell
git commit -m "feat(registry): open site pack contributions"
git push origin feat/site-adapter-pluginization
```
