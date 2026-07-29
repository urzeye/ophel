# LibreChat Official SitePack Design

## Context

P2-07 adds official LibreChat and NextChat packages after the detect-only origin path was established for other self-hosted ChatUI projects. LibreChat can run on any operator-controlled origin, so a static host list would either miss most installations or require an unacceptable wildcard.

GitHub does not expose a usable `releases/latest` response for LibreChat. The fixed stable reference for this slice is tag `v0.8.7`, commit `9e74cc0e57b395926122bd4062c1fcedc48ed465`. Selector evidence comes from that source tree and its upstream browser tests.

The official `https://demo.librechat.ai/` instance redirects to `/login`, reports `registrationEnabled: false`, and identifies its deployed build as dev commit `9c95bf445f646fdb29db996720a4f1d4eaa0bf86` from 2026-07-28. An authenticated chat smoke could therefore not be performed without creating or receiving an external account. The deployed JavaScript bundle was still inspected read-only and contains the same stable input, send, stop, new-chat, message-role, message-content, scroll-container, and `/c/new` literals used by the fixed source.

## Goals

- Add one official `librechat` SitePack under `registry/sites/`.
- Keep `matches` empty and activate only after the user authorizes an exact origin and LibreChat's composer is detected.
- Keep the package pure JSON with no executable hook or bundled site-specific adapter.
- Declare only capabilities supported by stable IDs, test attributes, semantic classes, routes, or upstream tests.
- Provide all eleven application metadata locales in the manifest.
- Preserve the existing extension and userscript origin-binding, declarative adapter, export, session, generation, and layout contracts.

## Non-goals

- Add `demo.librechat.ai`, `chat.librechat.ai`, or a wildcard deployment host to `matches`.
- Auto-discover arbitrary origins before the user explicitly authorizes them.
- Add a TypeScript LibreChat adapter or a LibreChat-specific runtime branch.
- Claim `conversation-list` or `reading-history`; the current manifest primitives cannot safely model the complete sidebar and project variants from source evidence alone.
- Claim `width`, `model-lock`, `clean`, Mermaid overrides, quick quote, or host-theme synchronization without dedicated runtime acceptance.
- Export attachments, citations, tool calls, thinking blocks, or other structured metadata beyond the rendered basic message body.
- Treat the login-page bundle inspection as an authenticated browser smoke.

## Alternatives Considered

### 1. Detect-only pure-JSON SitePack — selected

Use `matches: []` and one composer-form detector built from `data-testid="text-input"` and `#send-button`. This fits arbitrary self-hosted origins while keeping authorization explicit and reusing the existing declarative runtime.

### 2. Static official-host matches

The official demo is only one deployment, registration is disabled, and most LibreChat installations are self-hosted elsewhere. Static matches would not solve the general case and would grant access to hosts that are not required for a bound installation. This is rejected.

### 3. Built-in TypeScript adapter

Imperative code could add richer conversation-list and structured-content handling, but the verified core feature set already fits schema v1. A bundled adapter would weaken the registry-delivered Phase 2 objective without a corresponding user benefit. This is rejected.

## Detection and Activation

The package uses one detector:

```css
form:has([data-testid='text-input']):has(#send-button)
```

The two child markers are shipped by the stable source and used by upstream browser tests. Requiring both controls inside one form is stronger than detecting a generic textarea or product title. Because `matches` is empty, the detector grants no host access by itself; the exact origin must already be authorized and stored as a detect binding.

## Capability Contract

The package declares exactly:

- `outline`
- `outline-user-queries`
- `export-basic`
- `generation-detect`
- `new-chat`
- `stop-generation`
- `zen`
- `prompt-insert`

Generation and stop are included because LibreChat exposes the language-independent `data-testid="stop-generation-button"` while submitting, and the rendered response body also receives the stable `submitting` class. Other capabilities stay hidden.

## Selector Design

| Purpose | Selector | Evidence and rationale |
| --- | --- | --- |
| Text input | `[data-testid='text-input']` | Stable textarea marker used directly by LibreChat's upstream e2e suite. |
| Send action | `[data-testid='send-button']` | Stable button marker and `#send-button` ID; becomes enabled after the React textarea state updates. |
| Outline root | `main[role='main'] .scrollbar-gutter-stable:has(.message-render)` | Narrows the shared scroll utility class to the chat message viewport and excludes prompt/settings scroll areas. |
| Turn root | `main[role='main'] .message-render` | Stable message wrapper used by LibreChat's message navigation and e2e tests. |
| User body | `.message-render > .user-turn .message-content` | Uses the explicit role class and rendered content class while excluding avatar, label, timestamp, and actions. |
| Assistant body | `.message-render > .agent-turn .message-content` | Uses the explicit assistant role class and rendered content class. |
| New chat | `[data-testid='new-chat-button']` | Stable anchor/button test marker in the unified sidebar. |
| Stop action | `[data-testid='stop-generation-button']` | Stable language-independent control rendered only while stop is available. |

Basic export uses each `.message-render` as the ordered turn. Inside the turn, structural role-body selectors capture the complete content region before the sibling/action row, avoiding duplicate exports when an assistant message renders multiple `.message-content` descendants.

## Prompt Insertion

LibreChat v0.8.7 renders a controlled textarea. The declarative adapter uses the native value setter and dispatches an input event so React observes the change. The existing prompt manager retry window covers the short interval before the send button updates. `submitKey` remains `Enter`, while normal queued sending still prefers the configured submit button.

## Generation and Stop

Generation detection uses two DOM signals:

- `[data-testid='stop-generation-button']` while the visible stop control is mounted;
- `main[role='main'] .message-content.submitting` while the latest assistant body is submitting.

No network pattern is declared. LibreChat routes requests differently across normal, assistants, and agents endpoints, while the DOM state already supplies a smaller and more stable contract. Stop clicks the same dedicated test-marked control.

## Session Boundary

Stable routes use `/c/new` for a draft conversation and `/c/<conversationId>` for persisted conversations. Shared conversations use `/share/<shareId>`. The manifest therefore extracts IDs from `^/c/([^/?#]+)$`, treats `/` and `/c/new` as new-conversation paths, uses `/share/` as the share prefix, and opens new tabs at `/c/new`.

The session primitive does not imply conversation-list support; it only gives existing session-aware core modules an honest path boundary.

## Zen Behavior

Zen Mode hides only source-derived navigation chrome:

- the desktop `aside` containing LibreChat's new-chat marker;
- the mobile fixed sidebar containing both new-chat and close-sidebar markers;
- the absolute top header inside the chat `main` region.

The message viewport and composer remain visible. These rules target the host document through the existing layout manager and do not change Ophel's Shadow DOM, theme variables, or panel styles.

## Metadata Localization

`nameI18n` and `descriptionI18n` contain `zh-CN`, `zh-TW`, `en`, `ja`, `ko`, `it`, `de`, `es`, `fr`, `pt-BR`, and `ru`. The product name remains `LibreChat` in every locale, and English remains the base fallback.

## Browser and Release Verification

Fixed-source verification covered:

- tag `v0.8.7`, commit `9e74cc0e57b395926122bd4062c1fcedc48ed465`;
- the textarea, send, stop, new-chat, message wrapper, role, content, scroll, and route implementations;
- upstream e2e references for `text-input`, `send-button`, `new-chat-button`, `.message-render`, `.user-turn`, and `.agent-turn`.

Official-demo verification covered:

- redirect to `https://demo.librechat.ai/login`;
- `/api/config` reporting registration disabled and dev build commit `9c95bf4`;
- the deployed 879,839-byte application bundle containing `text-input`, `send-button`, `stop-generation-button`, `new-chat-button`, `message-render`, `user-turn`, `agent-turn`, `message-content`, `scrollbar-gutter-stable`, and `/c/new`.

The login wall prevents a complete authenticated interaction smoke, so P2-07 remains in progress rather than presenting bundle evidence as full runtime acceptance.

## Repository Verification

Run registry validation and distribution generation, inspect the generated immutable pack entry and digest, then run format, lint, typecheck, Chrome build, userscript build, and `git diff --check`. Generated registry output, downloaded source archives, Playwright state, and the user's existing `.gitignore` modification must not be committed.
