# SitePack Registry Open Design

## Context

P1-11 opens `registry/sites/` to community contributions and completes the documentation and integrity-consumption work deferred from P0-03 and P0-12. The runtime already rejects unknown manifest keys, validates all declarative fields, checks downloaded artifacts against the registry SHA-256, and filters packs whose `minAppVersion` exceeds the running Ophel version. The management page already preserves incompatible index entries and renders them as unavailable with an upgrade message.

The missing layer is contributor-facing: a JSON Schema for editor assistance, a checked example, contribution instructions, a dedicated pull request template, and a maintainer review checklist.

## Goals

- Publish a strict JSON Schema for SitePack schema version 1 without weakening or replacing `validateSitePackManifest()`.
- Validate registry SitePacks with both the JSON Schema and the existing runtime validator.
- Keep one comprehensive example manifest that both validators accept, even while `registry/sites/` has no official pack yet.
- Configure repository VS Code settings so SitePack source files receive completion and diagnostics without adding a runtime-rejected `$schema` key to manifests.
- Document the contribution and review process, including capability evidence, stable selectors, safety limits, versioning, and local commands.
- Preserve the existing SHA-256 and `minAppVersion` product behavior and verify those acceptance paths with a focused deterministic smoke.

## Non-goals

- Generate JSON Schema from TypeScript or replace the handwritten runtime validator.
- Add a schema for built-in configuration patches in this task.
- Add the first official SitePack or claim that the synthetic example supports a real site.
- Change dynamic host permission or content-script registration behavior; that remains P1-17.
- Add new SitePack fields, capabilities, UI copy, or localization keys.

## Alternatives Considered

### 1. Hand-maintained schema plus runtime cross-validation — selected

Maintain `registry/schema/site-pack.schema.json` beside the runtime types and validate every registry pack with Ajv and `validateSitePackManifest()`. A comprehensive example exercises every current configuration branch. This gives contributors editor support while leaving all security-sensitive behavior in the already shared runtime validator.

### 2. Generate the schema from TypeScript

Generation could reduce manual field duplication, but the current types do not encode limits, capability dependencies, safe paths, or security semantics. A generator would require extra tooling and annotations while still needing handwritten rules, so it would create more machinery without removing the runtime validator.

### 3. Replace validation with a schema library

Moving TypeScript inference, runtime validation, and JSON Schema generation into one library could reduce drift eventually, but it would change a security-critical, browser-bundled path during a registry documentation task. The bundle and migration cost are outside P1-11.

## Schema Boundary

The JSON Schema mirrors constraints that draft-07 can express without becoming stricter than runtime behavior:

- exact allowed keys and required fields;
- literal schema version, positive integer pack version, ID and hexadecimal color patterns;
- semantic-version syntax, string lengths, array sizes, uniqueness where runtime requires it, and enumerations;
- nested configuration shapes, scalar-only network metadata, and same-origin path prefixes;
- `matches: []` requiring at least one detect rule;
- every capability-to-field dependency, including `outline-user-queries` requiring `outline`.

The schema intentionally does not claim to replace rules that require executable checks: serialized byte size, JavaScript regular-expression compilation, `safe-regex2`, detailed match-host validation, or normalized CSS token blocking. `validateSitePackManifest()` remains mandatory after Schema validation and is the final security truth in CI and at runtime.

## Validation Flow

`registry/scripts/validate.mjs` loads and compiles the schema once with Ajv in strict, all-errors mode. It validates the checked example first so an empty registry still exercises the Schema/runtime agreement. Each `registry/sites/*.json` source then passes:

1. JSON parsing;
2. JSON Schema validation;
3. `validateSitePackManifest()` with `safe-regex2` enabled;
4. registry policy checks for duplicate IDs and match conflicts.

Schema errors use JSON-pointer paths and Ajv keywords; runtime errors retain the existing structured field paths and safety codes. Patch validation remains unchanged and continues to use only the shared runtime validator because this task publishes only the SitePack schema.

Ajv becomes an explicit development dependency. The registry validator must not rely on the transitive copy currently supplied by commitlint.

## Example and Editor Integration

`registry/examples/site-pack.example.json` is synthetic and uses `example.com`. It declares every capability and supplies every optional configuration family with safe placeholder selectors, paths, regexes, CSS, and metadata. It is a contributor starting point and validation fixture, not a published registry entry.

`.vscode/settings.json` maps `registry/sites/*.json` and `registry/examples/*.json` to the local schema. SitePack files must not include `$schema`, because the runtime validator rejects unknown manifest keys by design.

## Contribution and Review Surface

- `registry/README.md` explains file naming, schema/runtime authority, the example workflow, capability requirements, versioning, and local commands.
- `.github/CONTRIBUTING.md` gains a SitePack section linked from its table of contents.
- `.github/PULL_REQUEST_TEMPLATE/site-pack.md` requests site identity, tested origins, declared-capability evidence, screenshots, browser/Ophel versions, and contributor safety checks.
- `docs/developer/site-pack-review-checklist.md` gives maintainers a repeatable static and real-site review sequence. It explicitly rejects script/expression fields, unstable presentation text selectors, secrets, broad host patterns, unsafe CSS, and unverified capability claims.

## Integrity and Compatibility Acceptance

No product change is required for the two runtime acceptance items:

- `RemoteConfigManager` hashes downloaded bytes before JSON parsing and rejects a mismatched artifact without replacing the active snapshot.
- It skips entries above the current `minAppVersion`; the management view retains the index row, classifies a missing compatible cache as `incompatible`, disables installation, and displays the required Ophel version.

A focused in-memory smoke will exercise both paths against the public manager/view-model APIs so P1-11 has reproducible evidence instead of source inspection alone.

## Verification

- Run the registry validator with the example and empty source directories.
- Run the registry build and inspect the generated empty index without committing `registry/dist/`.
- Run a focused smoke for SHA-256 mismatch and incompatible registry-row derivation, then delete the temporary file.
- Run format, lint, typecheck, extension build, userscript build, and `git diff --check`.
- Review the final diff for a second validation truth, an accidentally published example, generated artifacts, or inclusion of the user's `.gitignore` change.
