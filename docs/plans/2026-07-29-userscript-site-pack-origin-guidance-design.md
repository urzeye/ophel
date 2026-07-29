# Userscript SitePack Origin Guidance Design

## Context

Browser extensions can request host permission and dynamically register the Ophel content scripts for SitePack origins. Userscript managers cannot extend the installed script's `@match` metadata at runtime. P2-02 already lets users save exact-origin bindings on both platforms, but the userscript UI currently shows only a generic warning after every binding and cannot tell which enabled SitePack origins are actually missing from the manager's effective match rules.

P2-03 closes that gap without changing the userscript metadata automatically. Tampermonkey and Violentmonkey expose the script's base and user-overridden match rules through `GM_info`; ScriptCat exposes a compatible subset. The UI can compare those effective rules with the same enabled-pack and origin-binding reference graph already used by extension registration.

## Goals

- Detect enabled SitePack origins that are not covered by the current userscript manager's effective `@match` rules.
- Show guidance only when uncovered origins exist.
- Give each missing origin a copyable origin-level match rule.
- Present a three-step Tampermonkey workflow that survives script updates because it uses manager-side user matches.
- Document the Tampermonkey, Violentmonkey, and ScriptCat differences.
- Preserve the existing SitePacks information architecture, themes, Shadow DOM injection, and extension behavior.

## Non-goals

- Rewrite or download a modified userscript.
- Mutate userscript-manager settings programmatically.
- Add wildcard or HTTP SitePack origins.
- Treat a path-limited match rule as complete origin coverage.
- Replace the extension's permission and dynamic-registration flow.

## Alternatives Considered

### 1. Compare effective manager rules with the SitePack origin graph — selected

Read `GM_info`, resolve base plus user-overridden match rules, derive required origin patterns from enabled packs and bindings, and show only the difference. This keeps one origin truth source and avoids warning users whose manager is already configured.

### 2. Keep an unconditional warning and add a copy button

This is simpler but cannot satisfy the CSV requirement to detect uncovered installed-pack domains. It also remains noisy after the user fixes the manager settings, so it is rejected.

### 3. Generate a patched `.user.js`

The generated file would diverge from the release artifact and could lose custom metadata on update. It also creates a second distribution path and broader security responsibility, so it is rejected.

## Runtime Design

`src/platform/userscript-match-coverage.ts` provides two explicit platform-bound primitives:

1. resolve the current manager name and effective match patterns from a `GM_info`-shaped value, including `options.override.use_matches`, `orig_matches`, and `merge_matches` where available;
2. determine whether a userscript match pattern covers an entire HTTPS origin pattern.

The matcher supports exact hosts, `*.` hosts, `*` scheme/host, `<all_urls>`, and optional ports. A path-limited rule does not count as full coverage because Ophel must initialize on every route of the bound ChatUI origin.

`SitePacksPage` derives required origins with `deriveSitePackOriginReferences()` and `collapseCoveredSitePackOriginPatterns()`. That preserves enabled-state, explicit binding, detect binding, and duplicate-reference semantics already used by extension registration. On the userscript platform it subtracts origins covered by `GM_info`; extension rendering remains unchanged.

## UI Design

The existing custom-origin card remains intact. When uncovered patterns exist, a compact warning panel appears below the binding form and before the binding list. It contains:

- a direct status heading and the detected manager name;
- one row per missing origin-level rule with a copy button;
- an ordered three-step workflow: open the manager's script settings, add the copied rules under user matches/custom match rules, then save and reload the target site.

The component reuses the existing button, icon, card, and `--gh-*` theme vocabulary. Styles stay in `src/styles/settings.css`, which is already imported by the standalone Options page, injected into the extension Shadow DOM by `ui-entry.tsx`, and bundled into the userscript style resource. No ThemeManager or new Shadow DOM injection path is required.

## Error Handling

- If `GM_info` is unexpectedly unavailable, required origins remain visible as uncovered rather than being silently marked ready.
- Clipboard failure produces the existing explicit error feedback.
- Unknown or malformed manager metadata is ignored field-by-field; only validated non-empty string patterns participate.
- The UI does not claim that editing manager rules succeeded. Coverage is recomputed on the next userscript load.

## Documentation and Localization

All new application copy is added to the eleven locale resources. The user documentation records:

- Tampermonkey: use Settings → Includes/Excludes → User matches;
- Violentmonkey: use the script Settings/custom match rules;
- ScriptCat: use the script's user match settings where available, with UI labels varying by version;
- manager-side custom rules are preferred to editing the release metadata because updates retain them.

## Verification

- Exercise the pure resolver with representative Tampermonkey, Violentmonkey, ScriptCat-compatible, wildcard, port, override, and path-limited fixtures.
- Run format, lint, typecheck, extension build, userscript build, and `git diff --check`.
- Inspect the generated userscript metadata to confirm the built-in match list is unchanged.
- Keep generated builds and the user's existing `.gitignore` modification out of the commit.
