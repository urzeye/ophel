# Userscript L3 Code Plugin Evaluation

## Status

Accepted for P4-01.

**Decision: No-Go for loading third-party adapter code inside the official Ophel userscript at runtime.** Ophel must not add remote `@require` plugins, a paste-and-run editor, fetched code executed with `eval`/`Function`, dynamic page-world script injection, or an in-process code-plugin registry.

The supported paths remain:

1. use an L2 declarative SitePack when the validated configuration model is sufficient;
2. contribute imperative adapter code through a reviewed pull request so it ships as L1;
3. maintain a private fork and build the complete userscript from source.

A separately installed companion userscript may be reconsidered only as a new, isolated proof-of-concept. It is not approved as an Ophel-managed L3 plugin system by this decision.

## Scope

P4-01 asks whether userscript distribution can safely provide imperative adapters that are not possible in the declarative SitePack DSL. The evaluation covers:

- loading code through `@require`;
- letting a user paste code or fetching code and executing it dynamically;
- injecting a plugin into the page world;
- isolating code in a Worker or sandboxed iframe;
- installing each adapter as a separate companion userscript;
- keeping imperative customization as a full source build;
- promoting community code into the reviewed L1 adapter set.

The browser-extension build remains out of scope. Its MV3 remote-code prohibition already makes runtime L3 code incompatible with store policy.

## Current Trust Boundary

The production userscript is a high-privilege application, not a narrow adapter host:

- `vite.userscript.config.ts` runs it at `document-start` across the supported AI sites and grants GM storage, cross-origin requests, notifications, cookie access, `unsafeWindow`, and window focus.
- `@connect *` is required by user-configured WebDAV servers, so code in the same userscript context can request arbitrary hosts.
- existing `@require` dependencies execute before the main script. They are application dependencies selected by maintainers, not isolated child principals.
- the entry point exposes page-world bridges and builds its Chrome storage compatibility layer directly over GM storage.
- GM storage includes the persisted settings object, which can contain WebDAV usernames and passwords, plus the Claude session-key store and other user data.
- the active page exposes conversation text, prompts, non-HttpOnly cookies, local/session storage, and application JavaScript objects through DOM access and `unsafeWindow`.
- the explicit `GM_cookie` grant can expose cookie capabilities beyond normal page JavaScript in managers that implement it.

An in-process plugin would therefore inherit the authority of the entire Ophel userscript. There is no existing per-plugin principal, grant list, storage namespace, network allowlist, or process boundary.

L2 SitePacks deliberately have a different boundary. Their JSON is size-limited and schema-validated; unknown keys are rejected, regexes are bounded, CSS is normalized and screened, capabilities require their supporting fields, and executable expressions or JavaScript URLs are not part of the format. Extending that DSL with a script field would erase the principal security property that makes remote SitePacks acceptable.

## Non-Functional Requirements

Any productized L3 design would need all of the following:

- **Least privilege:** one adapter cannot read unrelated GM storage, cookies, or credentials and cannot contact undeclared hosts.
- **Explicit consent:** installation presents the adapter's exact origins, grants, network destinations, source, and update authority.
- **Integrity:** executable bytes are immutable, authenticated, reproducible, and reviewable before execution.
- **Failure containment:** one adapter can be disabled or rolled back without breaking Ophel or other adapters.
- **Portability:** the same security boundary holds in Tampermonkey, Violentmonkey, and ScriptCat instead of silently falling back to a weaker context.
- **Compatibility:** the adapter declares and enforces a versioned Ophel API contract.
- **Maintainability:** imperative community code has an accountable owner and a path into the main test and review process.

The current userscript-manager primitives do not jointly satisfy these requirements.

## Threat Model

### Protected assets

- private conversation DOM, prompts, attachments, and generated content;
- WebDAV credentials and backup destinations stored in settings;
- Claude session keys and page authentication state;
- all Ophel GM storage, including conversations, folders, prompts, and settings;
- page cookies, local storage, session storage, and JavaScript application objects;
- the user's browsing session on every matched AI origin;
- arbitrary outbound network access available through `GM_xmlhttpRequest` and `@connect *`.

### Adversaries and failure sources

- a malicious plugin author;
- compromise of a plugin repository, CDN, release account, or update URL;
- a benign plugin update that is incompatible with the installed Ophel version;
- a copied plugin whose source does not match the displayed metadata;
- a target site that observes or tampers with a page-world bridge;
- manager-specific sandbox fallback that grants more access than the design assumes.

## Security Findings

### Critical

1. **Privilege inheritance exposes all Ophel authority.** Code executed through main-script `@require`, `eval`, `Function`, or an equivalent loader runs without a per-plugin grant boundary. It can reach GM storage, `unsafeWindow`, cookie APIs, page DOM, and Ophel runtime objects available in that context.
2. **Arbitrary exfiltration is already permitted by the host script.** Because Ophel requires `@connect *`, a malicious plugin can transmit page content or persisted secrets directly through `GM_xmlhttpRequest`. A warning dialog cannot reduce authority after the plugin starts.
3. **A plugin can persist or replace behavior before Ophel initializes.** `@require` code executes before the main userscript, allowing it to monkey-patch globals, intercept storage/network calls, falsify adapter results, or disable later safety checks.

### High

1. **Remote-code integrity and update ownership are inseparable.** A mutable plugin URL lets the remote publisher change executable code without an Ophel release. Pinning an SRI hash prevents silent change but also requires a new trusted metadata release for every update, removing the main benefit of a runtime plugin registry.
2. **Sandbox semantics are not portable.** Tampermonkey's `@sandbox` modes may fall back between page and userscript worlds; Violentmonkey uses `@inject-into` with page/content/auto behavior; ScriptCat defaults to page injection, does not implement Violentmonkey's automatic CSP selection, and documents different API behavior. No shared metadata setting creates an independent plugin principal with its own grants.
3. **Page-world injection is not a safe substitute.** It may remove direct GM API access, but it gives the plugin the target application's JavaScript context and conversation DOM, is subject to site CSP and timing differences, and still needs a privileged bridge to call Ophel. Compromise of either side compromises the bridge contract.
4. **Crash and compatibility isolation are absent.** A plugin can patch shared prototypes, register long-lived observers, throw during document-start, or retain stale references across SPA navigation. Disabling it after the fact cannot reliably undo arbitrary mutations.

### Medium

1. **Paste-and-run code is not meaningfully reviewable.** Users cannot realistically audit an imperative adapter with access to credentials and conversations. It also creates support ambiguity because installed code is not represented by the repository commit or released artifact.
2. **Distribution rules constrain external execution.** Greasy Fork treats `@require`, downloaded-and-evaluated code, dynamic script tags, and remote updates as external code paths that require inspectability and approved integrity mechanisms. A general plugin loader would make policy review and source correspondence substantially harder.
3. **A broad plugin API would recreate an unsafe DSL.** Exposing storage, network, page globals, or core managers makes the plugin fully privileged. Restricting it to a small message API is safer, but adapters that fit such an API should be represented as validated declarative fields instead of executable code.

## Approaches Considered

| Approach | Security boundary | Operational properties | Decision |
| --- | --- | --- | --- |
| Add plugin URLs to the main script's `@require` list | Same sandbox and full host grants; code runs before Ophel | Metadata is fixed at installation; SRI can pin bytes, but updates require changing trusted metadata | **No-Go** |
| Fetch or paste code and execute with `eval`, `Function`, or dynamic import | Same userscript authority; no independent grant or storage boundary | Easy to update, but difficult to inspect, sign, roll back, or support; external-code policy risk | **No-Go** |
| Inject a remote `<script>` into the page world | Full target-page authority; CSP-dependent; privileged bridge still required | Loses consistent GM access and behaves differently across sites/managers | **No-Go** |
| Run code in a Worker or sandboxed iframe | Can isolate computation, but cannot directly implement DOM adapters | A bridge capable of arbitrary DOM operations recreates full privilege; a narrow bridge reduces to a DSL | **No-Go** |
| Install each adapter as a separate companion userscript | Separate installation and metadata can provide narrower matches/grants | Still trusts the adapter with page content; requires versioned cross-script protocol and manager-specific validation | **Future PoC only** |
| Fork Ophel and build the complete userscript from source | Code is included in one reviewable, reproducible artifact | Highest maintenance cost and no automatic upstream compatibility | **Go as the current private-code escape hatch** |
| Contribute code to L1 | Full code review, CI, release versioning, and shared maintenance | Slower than remote updates and requires maintainer acceptance | **Go for community imperative adapters** |

## Decision

Ophel will not implement an in-app L3 code-plugin manager or registry for the official userscript.

The following are explicit architectural constraints:

- do not add executable fields to the SitePack schema;
- do not expose `platform`, storage, adapters, or core managers as a global plugin API;
- do not download and execute adapter JavaScript after installation;
- do not provide a code editor whose output is evaluated by the main userscript;
- do not silently add third-party `@require` entries to generated builds;
- do not describe page-world injection as a sandbox or security boundary.

Imperative third-party adapters must either enter L1 through normal source review or remain part of a user-maintained source build. This keeps the trust decision aligned with the artifact the user installs.

## Conditional Companion-Script Track

A separate companion userscript is the only L3 direction worth a future proof-of-concept because the manager can present it as a distinct installation with its own metadata. That is not approval to ship it. A new proposal must prove all of these gates first:

1. each adapter has exact `@match` entries and the minimum possible `@grant`/`@connect` set;
2. it has no access to Ophel GM storage, WebDAV credentials, Claude session keys, or the main script's platform object;
3. executable artifacts use immutable version URLs, strong integrity hashes, readable source, and reproducible builds;
4. users see the source, origins, grants, network destinations, update URL, and maintainer before installation;
5. communication uses a narrow, versioned, schema-validated protocol with timeouts, size limits, and no arbitrary object or function transfer;
6. Tampermonkey, Violentmonkey, and ScriptCat tests prove the same boundary instead of accepting manager fallback;
7. the plugin can be disabled, upgraded, downgraded, and removed without leaving patched globals or observers;
8. Greasy Fork and other intended distribution channels accept the source/update model;
9. a new security review finds no path from the companion protocol to main-script secrets or unrestricted capabilities.

If the protocol becomes expressive enough to perform common adapter work without arbitrary code, its safe fields should be promoted into L2 instead.

## L1 Promotion Path

A companion or private adapter is not automatically trusted because it works locally. Promotion to L1 requires:

- source code in the main repository with no remote executable dependency;
- a stable site identity and least-privilege host coverage;
- focused unit tests for reusable logic and configuration boundaries;
- real-site evidence for declared behavior and special paths;
- extension and userscript production builds;
- all eleven locales for new user-facing text;
- an explicit maintainer for future site changes.

Once promoted, updates follow the normal reviewed release or declarative selector-patch path.

## Consequences

### Positive

- the official userscript does not become a host for code with inherited access to user credentials and conversations;
- L2 retains a clear data-only security boundary;
- installed executable code continues to correspond to a reviewed Ophel or user-built artifact;
- cross-manager differences do not silently weaken the claimed sandbox;
- support, rollback, and compatibility remain tied to normal releases.

### Negative

- complex new sites still require a source contribution or private fork;
- community adapters cannot update imperative logic independently of Ophel releases;
- some users will consider the L2 capability subset too restrictive.

### Neutral

- future L2 schema additions remain possible when they are declarative, bounded, and validated;
- the separate companion-script idea remains research backlog, not a committed product feature.

## References

### Repository evidence

- `vite.userscript.config.ts` userscript metadata (`match`, `grant`, `connect`, `require`)
- `src/platform/userscript/entry.tsx` GM-backed storage compatibility and page bridges
- `src/platform/userscript/index.ts` cross-origin requests, notifications, and session-key behavior
- `src/platform/userscript/resource-manifest.ts` userscript resource/update locations
- `src/types/settings.ts` persisted WebDAV credential shape
- `src/core/backup-codec.ts` persisted user-data and Claude session-key coverage
- `src/adapters/declarative/validate.ts` L2 validation boundary
- `docs/developer/site-adapter-pluginization-plan.md` sections 3 and 4

### Manager and distribution documentation

- [Tampermonkey `@require`](https://www.tampermonkey.net/documentation.php?locale=en&q=externals#meta:require)
- [Tampermonkey `@grant`](https://www.tampermonkey.net/documentation.php?locale=en&q=grant#meta:grant)
- [Tampermonkey `@connect`](https://www.tampermonkey.net/documentation.php?locale=en&q=connect#meta:connect)
- [Tampermonkey `@sandbox`](https://www.tampermonkey.net/documentation.php?locale=en&q=sandbox#meta:sandbox)
- [Violentmonkey metadata block](https://violentmonkey.github.io/api/metadata-block/)
- [ScriptCat metadata](https://docs.scriptcat.org/docs/dev/meta/)
- [ScriptCat API behavior](https://docs.scriptcat.org/docs/dev/api/)
- [Greasy Fork external script policy](https://greasyfork.org/en/help/external-scripts)
- [Chrome extensions remote hosted code guidance](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)
