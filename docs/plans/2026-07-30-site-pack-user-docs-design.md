# SitePack User Documentation Design

## Status

Accepted for P1-14 implementation.

## Context

The SitePack runtime, registry, management page, custom-origin flow, official Duck.ai pack, contribution schema, and review checklist already exist. What is missing is the user-facing documentation promised by P1-14: installation, a field-by-field authoring tutorial, an FAQ that explains the boundary between built-in adapters and SitePacks, and a direct entry from the SitePack management page.

The repository already depends on VitePress, but it does not contain a VitePress site or build scripts. The current GitHub Pages workflow only uploads a redirect page to the external `ophel.app` documentation. The new documentation must be maintainable from this repository without attempting to replace the existing full-product documentation hosted elsewhere.

## Decision

Create a focused VitePress site under `docs/site/` and deploy it through the existing GitHub Pages workflow.

The site contains:

- a compact SitePack landing page;
- an installation and management guide covering registry install, local JSON import, extension permissions, userscript match rules, custom origins, updates, disabling, and uninstalling;
- an authoring tutorial that explains every field used by the official `registry/sites/duck-ai.json` pack and links back to the runtime schema and contributor checks;
- an FAQ covering built-in adapters versus SitePacks, permissions, local imports, self-hosted instances, update behavior, privacy, and unsupported JavaScript plugins.

The existing `ophel.app` links in README files remain unchanged because they point to the full product documentation. The new site is the repository-owned SitePack guide and is linked directly from the SitePack management page.

## Deployment

`docs/site/.vitepress/config.mts` uses a default `/ophel/` base for local production builds. The `.mts` extension keeps the VitePress config ESM-compatible without changing the repository-wide package module type. The GitHub Pages workflow passes the base path reported by `actions/configure-pages`, so forks and custom Pages domains can build the same source without hard-coding a deployment prefix.

The workflow installs the existing pnpm lockfile, runs `pnpm docs:build`, and uploads `docs/site/.vitepress/dist`. The obsolete redirect artifacts are removed once the VitePress deployment path is active.

## Management Page Entry

The SitePack page keeps its existing information architecture. A secondary “Open SitePack guide” action sits beside the page description and opens the deployed guide in a new tab through the existing platform abstraction.

The action:

- uses the existing `Button` and `ExternalLinkIcon` components;
- includes all eleven application locales;
- uses existing theme variables and SitePack action states;
- stacks below the description on narrow layouts;
- adds no setting, storage key, permission, or theme variable.

## Alternatives Considered

### Add pages to the external Mintlify site

Rejected because the source for that site is not present in this repository, so the task could not be maintained or verified here.

### Add Markdown files only

Rejected because it would not satisfy the explicit VitePress and published-site acceptance criteria.

### Replace the full product documentation

Rejected because P1-14 is specifically about SitePacks. Duplicating all existing `ophel.app` documentation would create a second truth source and expand the task far beyond the CSV requirement.

## Verification

- `pnpm docs:build` must complete with no broken internal links.
- The generated site must contain the landing, installation, authoring, and FAQ pages under the configured base path.
- TypeScript and focused ESLint must pass for the management-page change.
- All eleven locale resources must contain the new guide action key.
- Extension and userscript builds remain the final cross-platform safety check because the shared settings page is rendered in both environments.

## References

- `docs/developer/site-adapter-pluginization-tasks.csv` P1-14
- `registry/sites/duck-ai.json`
- `registry/README.md`
- `registry/schema/site-pack.schema.json`
- `docs/developer/site-pack-review-checklist.md`
- `DESIGN.md` sections 0, 1, 2, 5, 7, 9, 11, and 12
