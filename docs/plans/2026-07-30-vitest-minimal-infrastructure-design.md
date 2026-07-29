# Minimal Vitest Infrastructure Design

## Context

P0-00 is the remaining prerequisite for the pure SitePack validation and configuration-merge acceptance work. The repository currently validates these paths through temporary smoke scripts and registry commands, but it has no persistent unit-test runner or CI test step.

## Goals

- Add one repeatable `pnpm test` command backed by Vitest.
- Run pure TypeScript tests in a Node environment without introducing DOM emulation.
- Resolve the repository's `~` source alias for future core-module tests.
- Seed the suite with real runtime-validator cases, including one security-sensitive CSS escape case.
- Run the suite in the existing code-quality CI job.

## Non-goals

- Add browser, React, Shadow DOM, or Playwright tests.
- Complete the full P0-02 validator rule matrix or P0-04 merge matrix in this commit.
- Add coverage thresholds, watch services, reporters, or a second test framework.
- Change runtime behavior.

## Design

Use Vitest 3.2.4 because it supports the repository's Node 20 CI runtime and current Vite toolchain. A root `vitest.config.ts` limits discovery to `src/**/*.test.ts`, selects the Node environment, and maps `~...` imports to `src/...`.

The seed suite exercises `validateSitePackManifest()` directly. It accepts a minimal valid manifest, returns a structured error for an unknown key, and rejects a CSS-escaped `url()` token. These are stable public contracts of the validator and form useful groundwork for P0-02 instead of a synthetic arithmetic example.

CI runs `pnpm test` after type checking and before the production build. Test failures remain explicit and block the audit job.

## Completion

P0-00 can be marked complete when `pnpm test` passes locally and the CI workflow contains the same command. P0-02 and P0-04 remain in progress until their complete rule matrices are committed separately.
