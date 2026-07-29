# Cross-Browser and Userscript Manager Regression Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify SitePack permission, dynamic registration, and cleanup across Chrome, Edge, Firefox, Tampermonkey, Violentmonkey, and ScriptCat, fixing only compatibility defects proven by the regression.

**Architecture:** Use disposable real-browser profiles and the Duck.ai SitePack for one repeatable optional-origin flow. Keep browser-specific automation in ignored evidence files, normalize extension asset paths at the shared script-template discovery boundary, and record exact pass/blocked outcomes in the developer troubleshooting guide.

**Tech Stack:** TypeScript 5.3, Chrome/Edge/Firefox MV3 APIs, Python Playwright, Selenium/Geckodriver, Windows UI Automation, web-ext, Vite userscript output, pnpm verification.

---

### Task 1: Establish the extension regression matrix

**Files:**

- Reference: `build/chrome-mv3-prod/manifest.json`
- Reference: `build/firefox-mv3-prod/manifest.json`
- Evidence: `output/p2-09/chromium_extension_flow.py`
- Evidence: `output/p2-09/firefox_extension_flow.py`

**Step 1:** Record installed browser versions and production manifest permissions.

**Step 2:** Run the Duck.ai missing-permission, authorization, three-registration, and cleanup flow in Edge.

**Step 3:** Run the same flow in Chromium to diagnose the direct message Promise timing.

**Step 4:** Run the same flow in Chrome for Testing from Chrome major 150 and record branded Chrome's unpacked-loading restriction separately.

**Step 5:** Package the Firefox production build with an explicit safe XPI filename and temporarily load it in Firefox 151.

### Task 2: Add a failing Firefox asset-path fixture

**Files:**

- Modify: `src/platform/extension/site-pack-registration.ts:175-218`

**Step 1:** Run an inline `pnpm exec tsx` fixture that passes `moz-extension://` JS and CSS assets to `discoverSitePackScriptTemplates()`.

**Step 2:** Require the fixture to fail because returned registration assets remain absolute.

**Step 3:** Preserve the real Firefox error in the regression notes: `scripting.registerContentScripts` rejects absolute CSS URLs.

### Task 3: Normalize extension-owned script assets

**Files:**

- Modify: `src/platform/extension/site-pack-registration.ts:109-218`

**Step 1:** Add one helper that converts `chrome-extension://` and `moz-extension://` asset URLs to extension-relative paths and normalizes path separators.

**Step 2:** Apply the helper to JS and CSS from both manifest descriptors and registered MAIN-world templates.

**Step 3:** Re-run the focused fixture and require all discovered JS/CSS paths to be relative.

**Step 4:** Re-run the Firefox browser flow and require permission success, three registrations, and full cleanup.

### Task 4: Smoke userscript managers

**Files:**

- Reference: `build/userscript/ophel.user.js`
- Reference: `src/platform/userscript-match-coverage.ts`
- Evidence: `output/p2-09/`

**Step 1:** Assert production metadata contains the expected base matches, grants, required libraries, and resources.

**Step 2:** Run representative `GM_info` fixtures for Tampermonkey, Violentmonkey, and ScriptCat-compatible shapes.

**Step 3:** Install and execute the production userscript in each actual manager that can be launched in a disposable profile.

**Step 4:** Record actual-manager pass, blocked, unavailable, and fixture-only outcomes without upgrading one category into another.

### Task 5: Document conclusions and task state

**Files:**

- Modify: `docs/developer/troubleshooting.md`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`
- Create: `docs/plans/2026-07-29-cross-browser-regression-design.md`
- Create: `docs/plans/2026-07-29-cross-browser-regression.md`

**Step 1:** Add the browser/manager matrix, Firefox permission notes, Chrome automation restriction, Geckodriver warning, and remaining coverage limits to troubleshooting.

**Step 2:** Keep P2-09 `进行中` until the final matrix is evaluated, then mark it consistently with the documented result.

### Task 6: Verify, review, commit, and push

**Files:**

- Modify only the focused P2-09 source and documentation files.

**Step 1:** Run the Firefox asset normalization fixture.

**Step 2:** Run `node scripts/compare_locales.js`, `pnpm format:check`, `pnpm exec eslint . --ignore-pattern "output/**"`, `pnpm typecheck`, `pnpm build`, `pnpm build:firefox`, `pnpm build:userscript`, and `git diff --check`.

**Step 3:** Inspect `git status`, the focused diff, and staged content; exclude `.gitignore`, build output, downloaded tools, profiles, and screenshots.

**Step 4:** Commit with `fix(extension): normalize Firefox script assets` and push `feat/site-adapter-pluginization`.
