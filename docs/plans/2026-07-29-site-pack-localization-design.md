# SitePack Metadata Localization Design

## Context

P1-12 completes the localization surface introduced by the SitePack manifest. The schema and runtime validator already accept `nameI18n` and `descriptionI18n`, and the management page copy already exists in all eleven application locales, but every product consumer still reads the base `name` and `description` fields directly.

The affected consumers are the declarative adapter name, the dynamic supported-platform catalog, the installed/registry management lists, operation feedback, accessibility labels, and import/uninstall confirmations.

## Goals

- Resolve SitePack names and descriptions through one shared fallback implementation.
- Apply the exact fallback order: current language, English, then the base manifest field.
- Match locale keys case-insensitively and treat `_` and `-` as equivalent.
- Treat `pt` and `pt-BR` as aliases because the application locale is `pt` while contributed manifests may use `pt-BR`.
- Refresh visible pack metadata, list sorting, adapter names, and dynamic platform names after a language change.
- Preserve all existing management-page layouts, themes, states, and Shadow DOM style injection.

## Non-goals

- Require every SitePack to provide all eleven translations.
- Persist resolved strings or mutate the validated manifest.
- Add a second locale registry beside the existing application i18n resources.
- Change built-in platform names or introduce new management-page copy.
- Modify CSS, theme variables, animation, or Shadow DOM injection.

## Resolution Boundary

`src/adapters/declarative/localization.ts` is the single source of truth for SitePack metadata fallback. It accepts a validated manifest and an explicit language, normalizes locale keys only for lookup, and returns the original stored string without changing the manifest.

For each field, lookup proceeds as follows:

1. the active language;
2. the `pt`/`pt-BR` counterpart when the active language is Portuguese;
3. `en`;
4. the base `name` or `description` field.

Case differences and `_` versus `-` do not create additional fallback levels; they are equivalent spellings of the same locale key. When both exact and normalized spellings exist, the exact key wins.

## Runtime Refresh

The declarative adapter resolves its name when `getName()` is called, so it always observes the current language. The platform catalog retains the enabled pack manifests rather than only the previously resolved platform rows. It rebuilds dynamic rows when `getCurrentLang()` changes, and `useSupportedAiPlatforms()` subscribes to i18n changes so mounted consumers receive the new array.

The SitePack management page reads the active language during render and includes it in the installed-list and registry-view memo dependencies. This updates displayed metadata and sorting without reloading or rewriting stored packs. Confirmation dialogs derive names during render; operation feedback resolves the name at the time the result is produced.

## Locale Completeness

P1-10 introduced the management-page, badge, confirmation, and feedback keys in all eleven application resource files: `zh-CN`, `zh-TW`, `en`, `ja`, `ko`, `it`, `de`, `es`, `fr`, `pt`, and `ru`. P1-12 verifies that parity again but does not duplicate or rename those keys.

## Verification

- Exercise direct locale lookup, normalized locale lookup, English fallback, base-field fallback, missing descriptions, and `pt`/`pt-BR` aliases.
- Verify registry rows sort by localized names and dynamic platform names/icons use the localized name.
- Verify `DeclarativeAdapter.getName()` follows a language change.
- Confirm every direct management-page name/description consumer uses the shared resolver.
- Run locale comparison, focused formatting/lint/type checks, extension build, userscript build, and `git diff --check`.
