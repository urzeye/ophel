# Userscript Resource Extraction Implementation Plan

**Goal:** Reduce the compressed userscript without changing extension behavior, and commit each optimization separately.

**Architecture:** Keep shared sources as the single source of truth. Userscript-only Vite transforms and aliases replace static data with synchronous GM resource reads. Existing hashed assets, SRI, GitHub `userscript-assets` publication, and commit-pinned CDN URLs distribute the resources.

**Tech Stack:** TypeScript, Vite, vite-plugin-monkey, Vitest, GitHub Actions.

## Decisions

- Use the existing `@resource` pipeline for data and styles; do not add executable vendors for static data.
- Preserve compression, all 24 theme presets, CSS content, animation rules, and the complete custom-style tutorial.
- Keep Plasmo inputs unchanged; resource extraction belongs exclusively to the userscript configuration.
- Fail explicitly if a required resource or vendor interface is missing.

## Local commits

1. Correct Greasy Fork's character-limit documentation and reporting in `vite.userscript.config.ts`.
2. Externalize theme presets through `src/platform/userscript/resource-manifest.ts`, a userscript theme loader, and a Vite-only transform. Test all presets against source data, missing/invalid resources, and release URL pinning.
3. Reuse the Markdown vendor's CSS highlighting through userscript aliases. Verify output against the bundled highlighter and ensure the main bundle no longer contains it.
4. Extract the custom-style starter with a userscript-only build transform. Verify the resource exactly matches the original template, including comments.
5. Extract static inline styles through the same build mechanism. Leave interpolated styles intact and preserve existing injection targets. Test extraction, resource reads, and build output.

Before each commit: inspect the diff, run focused tests and formatting/lint checks, run typecheck for behavior changes, and build the userscript. At completion: build Chrome and Firefox, compare extension artifact hashes with the baseline, exercise local resource serving, and check production metadata/SRI plus commit-pinned URLs. Record character counts after each optimization.

## Release path

`pnpm build:userscript` emits resources into `build/userscript/userscript-assets`. `.github/workflows/release.yml` publishes that entire directory to the `userscript-assets` branch, resolves the published commit, and rewrites metadata/manifest URLs to the immutable jsDelivr commit URL. New resources must enter the existing manifest and SRI loop, so both production releases and `build:userscript:local` discover them automatically.
