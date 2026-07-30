# SitePack User Documentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish a repository-owned VitePress SitePack guide and link it from the SitePack management page.

**Architecture:** A focused VitePress site lives under `docs/site/` and is built by the existing GitHub Pages workflow. The management page opens the deployed guide through the platform abstraction, while the full-product documentation at `ophel.app` remains unchanged.

**Tech Stack:** VitePress 1.6, pnpm, GitHub Pages Actions, React 18, TypeScript, existing Options UI components and i18n resources.

---

### Task 1: Scaffold the VitePress site and deployment

**Files:**

- Modify: `package.json`
- Modify: `.github/workflows/docs.yml`
- Delete: `docs/redirect/index.html`
- Delete: `docs/redirect/404.html`
- Create: `docs/site/.gitignore`
- Create: `docs/site/.vitepress/config.mts`
- Create: `docs/site/index.md`

**Step 1:** Add `docs:dev`, `docs:build`, and `docs:preview` scripts using `vitepress ... docs/site`.

**Step 2:** Configure VitePress title, description, local search, navigation, sidebar, repository link, edit links, and a base path normalized from `DOCS_BASE` with `/ophel/` as the fallback.

**Step 3:** Replace the redirect-only Pages workflow with checkout, pnpm/Node setup, frozen install, VitePress build, artifact upload, and Pages deployment. Pass `steps.pages.outputs.base_path` as `DOCS_BASE`.

**Step 4:** Add a landing page that routes users to installation, authoring, and FAQ content, then remove the unused redirect HTML.

**Step 5:** Run `pnpm docs:build` and require a successful VitePress production build.

### Task 2: Write the P1-14 user documentation

**Files:**

- Create: `docs/site/site-packs/index.md`
- Create: `docs/site/site-packs/installation.md`
- Create: `docs/site/site-packs/authoring.md`
- Create: `docs/site/site-packs/faq.md`

**Step 1:** Document registry installation, local JSON import, extension permission approval, userscript match rules, custom origins, updates, disable, and uninstall flows.

**Step 2:** Use `registry/sites/duck-ai.json` as the authoring example and explain every manifest field it uses: identity/version, localization, matches, capabilities, selectors, input, generation detection, export, Zen mode, and width selectors.

**Step 3:** Document the validation and contribution workflow using `pnpm registry:validate`, `pnpm registry:build`, the schema, registry guide, and review checklist.

**Step 4:** Add an FAQ covering built-in adapters versus SitePacks, permissions, self-hosted origins, userscript limitations, updates, local imports, privacy, and why arbitrary JavaScript is unsupported.

**Step 5:** Run `pnpm docs:build` again so internal links and Markdown rendering are validated by VitePress.

### Task 3: Add the management-page documentation entry

**Files:**

- Modify: `src/tabs/options/pages/SitePacksPage.tsx`
- Modify: `src/styles/settings.css`
- Modify: all eleven `src/locales/*/index.ts` files

**Step 1:** Add one `sitePacksGuideAction` key to zh-CN, zh-TW, en, ja, ko, it, de, es, fr, pt, and ru resources.

**Step 2:** Add a secondary guide button next to the page description, using `ExternalLinkIcon`, `platform.openTab()`, and the public GitHub Pages SitePack URL.

**Step 3:** Add focused layout styles that reuse the existing action-button states and stack on narrow viewports. Do not add theme variables or inline layout styles.

**Step 4:** Run focused ESLint, locale parity, `pnpm typecheck`, and `pnpm format:check`.

### Task 4: Close P1-14 and verify the deliverable

**Files:**

- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`

**Step 1:** Mark P1-14 complete only after the VitePress build and management-page entry exist.

**Step 2:** Run `pnpm docs:build`, `pnpm test`, `pnpm build`, `pnpm build:userscript`, and `git diff --check`.

**Step 3:** Review that `.gitignore`, generated VitePress output, existing `ophel.app` links, and unrelated user files are not staged.

**Step 4:** Commit with `docs(sitepacks): publish user guide` and push the current feature branch.
