# Site Adapter Pack Save, Export, and Contribution Design

## Context

P3-04 turns the validated P3-03 page-lifetime draft into a complete `SitePackManifest`. The result must use the same validator, storage, origin-permission, runtime-registration, download, and navigation paths as imported SitePacks. A generated file must be valid registry input without requiring the user to repair metadata or remove wizard-only fields.

The wizard is rendered only on a page where no adapter is active. The content UI can update after a local install, but `contents/main.ts` initializes the adapter and core modules once during page bootstrap. Replacing only the React adapter would leave theme, layout, reading-history, and other module state partially initialized, so P3-04 must present a truthful reload boundary instead of claiming hot activation.

## Goals

- Build a deterministic, editable manifest from the current HTTPS origin and the validated wizard draft.
- Validate the complete manifest with `validateSitePackManifest()` before every save, download, copy, or GitHub action.
- Install through `PackManager.installLocal()`, prepare the platform runtime through `platform.sitePacks`, and explicitly request a page reload for activation.
- Download the exact validated JSON through the existing exporter utility.
- Copy the exact JSON before opening a GitHub contribution page prefilled with the registry filename and file contents.
- Keep incomplete conversation-list information out of the manifest.
- Preserve all existing Shadow DOM, theme, narrow-screen, and extension/userscript behavior.

## Non-goals

- Hot-swap the adapter and reinitialize every core module on the current page.
- Add a second SitePack store, installer, validator, serializer, download helper, or URL-opening abstraction.
- Infer `conversation.idFrom`, `conversation.urlTemplate`, or active/navigation behavior from one selected conversation item.
- Persist unfinished DOM element references across reloads.
- Automatically submit a GitHub commit or PR on the user's behalf.

## Alternatives Considered

### 1. Pure manifest builder plus existing install/platform actions — selected

A core wizard helper owns metadata defaults, exact-origin match generation, manifest construction, validation, stable JSON serialization, filename generation, and the GitHub contribution URL. The React component owns user edits and executes save/export/copy actions through existing services.

This keeps schema logic out of JSX, makes exported bytes identical across actions, and ensures local installation and imported packs converge on `PackManager` as the single storage truth.

### 2. Serialize and install directly inside the React component

This would minimize the initial file count, but metadata rules, validation mapping, JSON ordering, and contribution URL construction would become UI implementation details. It would also make registry-CI fixture verification harder and encourage future callers to duplicate the format.

### 3. Hot-reload the adapter after installation

Reloading `dynamicAdapters` and changing the React adapter is insufficient. `contents/main.ts` has already skipped `afterPropertiesSet()`, `initCoreModules()`, settings subscriptions, URL observers, and background message handlers on an unsupported page. Recreating that lifecycle safely requires a larger structural task, so P3-04 stores and prepares the pack immediately, then provides an explicit reload action.

## Manifest Construction

The builder accepts the current wizard draft, editable metadata, current page URL, and current application version.

- `schemaVersion`: current `SITE_PACK_SCHEMA_VERSION`.
- `id`: generated once from the exact hostname by removing a leading `www`, converting non-alphanumeric runs to `-`, trimming, and limiting the result to 40 characters. The field remains editable and must match `^[a-z0-9-]{2,40}$`.
- `version`: defaults to `1`, remains editable as a positive integer, and supports subsequent local/registry revisions without manual JSON editing.
- `minAppVersion`: the running `APP_VERSION`, which is the earliest version this wizard can truthfully claim to have validated.
- `name`: generated once from application-name/site-name metadata when available, otherwise from the hostname. It remains editable and never defaults to the current conversation title.
- `matches`: one exact HTTPS origin pattern, `https://<host>/*`. Non-HTTPS pages are rejected explicitly because runtime bindings and registry packs are HTTPS-only.
- configuration fields: copied from `buildSiteAdapterWizardConfigPreview()` only after all required wizard selections remain valid.

The optional conversation item selector remains visible as captured draft information but is not serialized. The manifest declares `conversation-list` only when `itemSelector`, `idFrom`, and `urlTemplate` are all known; P3-04 does not have enough evidence to derive those fields safely.

The constructed object is passed to `validateSitePackManifest()`. The validated value is the only object serialized, installed, downloaded, copied, or sent to GitHub. Serialization uses two-space JSON indentation plus one trailing newline, and the filename is `<id>.json`.

## Action Flow

### Save locally

1. Rebuild and validate the manifest from current UI state.
2. Call `createRuntimePackManager(platform.storage).installLocal(manifest)`.
3. Call `platform.sitePacks.ensureOrigins(packId)` so extension origin permission and dynamic registration follow the normal SitePack path. Userscript returns `unsupported`, which is acceptable because the current page already proves script coverage.
4. Reconcile runtime registrations.
5. If origin authorization is denied or reconciliation fails, disable the just-installed pack and surface the failure. Do not report activation success.
6. Show a saved state with a primary reload button. Reloading lets both content entry points initialize the newly installed declarative adapter from page bootstrap.

An identical same-version manifest is an idempotent save. If content changes while the same ID/version is already installed, the existing `version-reuse` error remains explicit and the UI asks the user to increment the version.

### Download JSON

Build the same validated JSON and call the existing `downloadFile()` utility with `application/json;charset=utf-8`. A false result is shown as failure; no success state is emitted before the browser accepts the download action.

### Copy and open GitHub

1. Require `navigator.clipboard.writeText` and await copying the exact validated JSON.
2. Only after the copy succeeds, build a URL under `https://github.com/urzeye/ophel/new/main/registry/sites` with the filename and JSON content prefilled.
3. Open it through `platform.openTab()`.

If clipboard access fails, GitHub is not opened and the UI reports the copy failure. The page is a prefilled registry file contribution flow; GitHub handles authentication, fork creation, commit proposal, and PR creation.

## UI and State

The existing completion section becomes a compact publish workspace rather than a new modal. It contains name, ID, version, exact-origin, and minimum-version fields followed by three actions: save locally, download JSON, and copy/open GitHub.

The component tracks one busy action and one explicit feedback state. Buttons cover idle, hover, focus-visible, disabled, busy, success, warning, and error states. Saving does not destroy the draft, so users can still export the exact installed manifest. Reset clears both draft and metadata defaults.

Styles stay in `src/style.css`, already injected into extension and userscript Shadow Roots. Colors, borders, inputs, and status tones reuse `--gh-*` variables; no new theme source or document-head style is introduced.

## Registry Compatibility Boundary

Runtime validation guarantees schema shape, field constraints, capability requirements, selector lengths, and JSON safety. The generated exact origin also avoids broad wildcard policy failures. Development verification places a representative generated file in a temporary registry root and runs the real `registry/scripts/validate.mjs`, proving the emitted structure passes both JSON Schema and runtime validation.

Repository-wide ID and match uniqueness can change after a user opens the wizard. The GitHub contribution review/CI remains the final authority for concurrent registry conflicts; the wizard does not claim it can reserve an ID or origin.

## Error Model

- Invalid or disconnected required selections return the user to the affected wizard step.
- Invalid name, ID, version, app version, origin, or capability configuration blocks all publish actions.
- `PackManagerError` codes remain available for targeted messages such as version reuse, source conflict, installed match conflict, or app incompatibility.
- Clipboard, download, permission, registration, and tab-opening failures are not converted into success.
- Expected failures are displayed in the publish section; programmer errors still surface through the existing error boundary/console path.

## Verification

- Pure helper checks cover metadata defaults, exact-origin matches, invalid HTTP origins, deterministic JSON, filename, GitHub URL, and validation failures.
- Chromium smoke extends the real unsupported-site wizard flow through completion, metadata edits, invalid ID/version states, local save, reload prompt, JSON download, clipboard gating, GitHub URL, light/dark themes, and a 390 px viewport.
- A temporary registry root validates a representative generated JSON through the real registry CI script.
- Repository checks cover locale parity, formatting, focused ESLint, typecheck, extension build, userscript build, and `git diff --check`.
