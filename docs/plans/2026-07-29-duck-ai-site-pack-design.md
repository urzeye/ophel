# Duck.ai Official SitePack Design

## Context

P1-13 delivers the first official declarative SitePack and responds to issue #184. The registry, runtime validator, declarative adapter, feature-capability gating, metadata localization, pack management, and dynamic origin registration prerequisites are already present. Duck.ai is therefore the Phase 1 acceptance site for proving that an unbundled, pure-JSON adapter can be reviewed, installed with SHA-256 integrity, authorized for one origin, and activated without adding a built-in adapter.

The Duck.ai example in `docs/developer/site-adapter-pluginization-plan.md` is explicitly hypothetical. Its two-host match list and placeholder selectors were not reused. The configuration below is based on an anonymous real-browser session on `https://duck.ai/` on 2026-07-29.

## Goals

- Add one official `duck-ai` SitePack under `registry/sites/`.
- Request only `https://duck.ai/*`; do not include DuckDuckGo search or account surfaces.
- Keep the pack fully declarative, with no script, expression, remote resource, or custom origin binding.
- Declare only capabilities exercised against the current browser DOM.
- Provide user-facing metadata for all eleven application locales inside the manifest.
- Preserve extension and userscript behavior by using only the existing declarative adapter and layout-manager contracts.

## Non-goals

- Support `duckduckgo.com` or wildcard DuckDuckGo hosts.
- Expose Duck.ai's sidebar conversations through `conversation-list`.
- Claim `reading-history`: Duck.ai keeps both new and active conversations at `/`, so the current schema cannot derive a stable per-conversation session ID.
- Claim `model-lock`, `clean`, Quick Quote, Mermaid fallback, or host-theme synchronization without dedicated browser evidence.
- Add `detect` rules, custom-domain bindings, imperative hooks, or executable configuration.
- Change Ophel panel styling, theme variables, Shadow DOM injection, or the SitePack management UI.

## Alternatives Considered

### 1. Minimal single-origin SitePack — selected

Ship a manifest matching only `https://duck.ai/*`, using stable `data-testid` attributes and semantic structural relationships. This is the least-privilege option and directly exercises the new registry and dynamic registration path.

### 2. Add Duck.ai as a built-in TypeScript adapter

A built-in adapter could express more site-specific logic, but it would not validate the SitePack architecture that P1-13 exists to prove. It would also move a currently declarative integration back into the bundled release cycle. This is rejected.

### 3. Match both Duck.ai and DuckDuckGo

The historical design example included `https://duckduckgo.com/*`, but no Duck.ai chat surface on that origin was verified. Adding it would broaden host authorization and increase overlap risk without a user-visible capability. This is rejected.

## Capability Contract

The pack declares these capabilities:

- `outline`
- `outline-user-queries`
- `export-basic`
- `generation-detect`
- `new-chat`
- `stop-generation`
- `width`
- `zen`
- `prompt-insert`

`conversation-list`, `reading-history`, `model-lock`, and `clean` remain absent. Capability presence is treated as a user-interface contract, not as descriptive metadata.

## Selector Design

| Purpose | Selector | Evidence and rationale |
| --- | --- | --- |
| Text input | `textarea[name='user-prompt']` | Unique semantic textarea; native setter plus `input`/`change` events enabled the submit button and clearing disabled it again. |
| Submit | `[data-testid='duckai-chat-input'] button[type='submit']` | Unique action scoped to the stable input test ID. |
| Response container | `section:has([data-testid='duckai-chat-input'])` | Unique main chat section containing the complete message stream and composer. |
| User query | `[data-testid='user-message']` | Present once for every tested user turn. |
| Assistant body | `[data-activeresponse='true'] > :nth-child(2)` | The body was the second direct child in all three tested assistant responses; this excludes the model label and feedback controls. |
| New chat | `[data-testid='duckai-sidebar'] > div > div:has([role='search']) + div button[type='button']` | Unique button located by the stable sidebar test ID and semantic search-region adjacency, avoiding localized labels. |
| Stop generation | `[data-testid='duckai-chat-input'] div:has(> button[type='submit']) + div > button[type='button']` | Unique action adjacent to the submit group; hidden and disabled while idle, visible and enabled while streaming. |

The assistant-body selector is the narrowest current stable hook available. Its positional dependency is recorded as the primary future maintenance risk; a first-party body attribute should replace it if Duck.ai adds one.

## Width and Zen Behavior

Page widening targets the repeated turn wrapper and composer form. Each rule uses `max-width` as the setting-controlled property and adds only `width: 100%` plus `box-sizing: border-box`. The existing layout manager supplies centering and the user's configured percentage.

In the browser smoke, a representative 90% width changed the message wrappers from `938px` to about `1016px` and the composer from `938px` to about `1030px`; removing the style restored both to `938px`.

Zen mode hides both `[data-testid='duckai-sidebar']` and `[data-testid='duckai-top-toolbar']`. Hiding the sidebar expanded the chat section from `1144px` to `1444px` at the tested viewport. Hiding the top toolbar prevents the sidebar reopen control from appearing in responsive states. Removing the rules restored the original layout. These styles are injected into the host document through the existing `LayoutManager`; no Plasmo Shadow DOM or theme path changes.

## Session Boundary

Duck.ai keeps `location.pathname` at `/` before a prompt, during an active conversation, and after opening a saved conversation. The pack therefore omits `session` rather than asserting that every `/` page is a new conversation or inventing a shared session ID. New-chat remains available through the verified button selector, while session-dependent capabilities stay disabled.

## Metadata Localization

`nameI18n` and `descriptionI18n` contain `zh-CN`, `zh-TW`, `en`, `ja`, `ko`, `it`, `de`, `es`, `fr`, `pt-BR`, and `ru`. The product name remains `Duck.ai` in every locale. English is the base manifest fallback; the existing resolver aliases `pt` and `pt-BR`.

## Runtime and Security Boundary

The manifest uses schema version 1, pack version 1, and `minAppVersion: 1.1.8`, the first application version containing the required SitePack runtime. Dynamic registration collapses the match to the same concrete origin and requests only that host. Registry validation rejects unknown keys, unsafe CSS, oversized content, selector conflicts, or built-in-origin overlap. Failures remain explicit and prevent publication or installation.

## Browser Verification

The real-browser acceptance covered:

- three user turns and three assistant bodies with equal export counts;
- user queries plus rendered `h1`/`h2`/`h3` elements in DOM order for outline extraction;
- native prompt insertion and clearing with submit-state transitions;
- Enter submission;
- generation detection through the stop action changing from `0×0`, disabled, opacity `0.4` to `28×28`, enabled, opacity `1`;
- clicking stop and observing the input become enabled again;
- clicking new chat and observing zero message nodes while remaining on `/`;
- width and zen application plus full restoration.

Screenshots are stored under the ignored `output/playwright/` directory as review evidence and are not registry source files.

## Repository Verification

Run registry validation and distribution generation, inspect the generated index entry and SHA-256 path, then run format, lint, typecheck, Chrome build, userscript build, and `git diff --check`. Generated `registry/dist/`, extension builds, Playwright artifacts, and the user's existing `.gitignore` change must not be committed.
