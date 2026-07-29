# NextChat Official SitePack Design

## Context

P2-07 also adds a NextChat package. NextChat is commonly self-hosted and stores its conversations in client-side state, so an installation may appear on any operator-controlled origin and does not expose a stable conversation ID in the page pathname.

The fixed release reference is `v2.16.1`, published 2025-07-29, tag commit `557a2cce357749c6fb3176d42e03ff6f7de4d355`. Browser acceptance used the official Web App link `https://app.nextchat.club/`. Its `meta[name="config"]` reports version `v2.16.1` and hosted commit `706a18b95b714ab29b2a4842d3b9ff4f887935d5`, so the fixed tag and current hosted build are recorded separately rather than assumed to be byte-identical. The older `https://app.nextchat.dev/` deployment is paused with HTTP 402.

## Goals

- Add one official `nextchat` SitePack under `registry/sites/`.
- Keep `matches` empty and require an authorized exact origin plus strong DOM detection.
- Keep the implementation pure JSON and reuse the existing declarative adapter.
- Support stable prompt insertion, outline, basic export, new chat, and Zen behavior.
- Use language-independent IDs, metadata, structure, and CSS-module semantic stems where the application exposes no data attributes.
- Provide all eleven application metadata locales.

## Non-goals

- Add official-cloud or wildcard host matches.
- Claim conversation-list, reading-history, or session identity; NextChat selects local sessions without encoding their IDs in the route.
- Claim generation detection or stop-generation without a successful public-instance streaming smoke across provider modes.
- Claim width, model lock, clean mode, quick quote, Mermaid overrides, or host-theme synchronization.
- Treat localized button text or accessibility labels as selector contracts.
- Export local session metadata, images, audio, tool state, or timestamps beyond the rendered basic message body.

## Alternatives Considered

### 1. Detect-only pure-JSON SitePack — selected

Use `matches: []` with the stable `meta[name="config"]`, `#app-body`, `#chat-input`, and send-control structure. This supports arbitrary self-hosted origins while keeping authorization explicit.

### 2. Match only the official Web App

This would make the public instance easier to activate but would not cover the primary self-hosted use case. It would also create a second activation model for the same application. This is rejected.

### 3. Built-in adapter for local session state

An imperative adapter could inspect NextChat's persisted Zustand store, but that would couple Ophel to private client storage and create a second data source for conversation identity. Core interaction does not require it, so this is rejected.

## Detection and Activation

The package uses one detector:

```css
html:has(head meta[name='config']):has(body #app-body #chat-input):has(body #app-body [class*='_chat-input-send__'])
```

`meta[name="config"]`, `#app-body`, and `#chat-input` are fixed source contracts. The send control has no ID or data attribute, so the detector also requires its CSS Modules semantic stem. CSS Modules changes the hash suffix but preserves `_chat-input-send__`. The combined selector was unique on the official Web App.

## Capability Contract

The package declares exactly:

- `outline`
- `outline-user-queries`
- `export-basic`
- `new-chat`
- `zen`
- `prompt-insert`

Generation-related capabilities stay absent. Source exposes a localized per-message stop action and a semantic streaming-status class, but the public instance could not complete a model request without external credentials or account state. Capability gating therefore remains conservative.

## Selector Design

| Purpose | Selector | Evidence and rationale |
| --- | --- | --- |
| Text input | `#chat-input` | Fixed textarea ID in source and one matching element in the official Web App. |
| Send action | `#app-body [class*='_chat-input-send__']` | Narrows the stable CSS Modules class stem to the application body and resolves one button. |
| Outline root | `#app-body [class*='_chat-body__']` | Matches the scrollable message viewport without matching `chat-body-container` or title stems. |
| User body | `[class*='_chat-message-user__'] [class*='_chat-message-item__']` | Uses the explicit user wrapper and content item stems, excluding avatar, actions, and date. |
| Assistant body | `[class*='_chat-message__']:not([class*='_chat-message-user__']) [class*='_chat-message-item__']` | Selects assistant/system wrappers while excluding the user variant. |
| New chat | `[class*='_sidebar-tail__'] > [class*='_sidebar-actions__']:last-child button` | Uses the fixed sidebar-tail structure instead of localized text. |

The export turn selector combines the assistant and user wrapper stems. These selectors are disjoint because `_chat-message__` does not match `_chat-message-user__`, preserving DOM order without pairing arrays by index.

## Prompt Insertion

NextChat renders a controlled `<textarea id="chat-input">`. The declarative adapter's native value setter plus input event updates the public application immediately; browser acceptance confirmed the exact inserted value and a ready button selected by `_chat-input-send__`. `submitKey` remains `Enter`, matching the default NextChat setting, while normal queued sending prefers the visible submit button.

## New Chat and Session Boundary

The verified selector resolved exactly one new-chat button and clicking it navigated the official Web App to `/#/new-chat`. NextChat uses a hash router and keeps individual session IDs only in local client state. Schema v1 derives session IDs from `pathname`, so the manifest intentionally omits `session`, `conversation-list`, and `reading-history` rather than treating every `/chat` route as the same conversation.

## Zen Behavior

Zen Mode hides:

- the sidebar sibling immediately before `#app-body`, narrowed by the `_sidebar__` stem;
- the stable global `.window-header` inside `#app-body`.

The chat viewport and input panel remain visible. The rules do not change the host's CSS variables, Ophel's Shadow DOM, or the theme system.

## Metadata Localization

`nameI18n` and `descriptionI18n` contain `zh-CN`, `zh-TW`, `en`, `ja`, `ko`, `it`, `de`, `es`, `fr`, `pt-BR`, and `ru`. The product name remains `NextChat` in every locale.

## Browser and Release Verification

Fixed-source verification covered release `v2.16.1`, tag commit `557a2cce357749c6fb3176d42e03ff6f7de4d355`, the textarea, CSS-module class stems, role wrappers, new-chat structure, hash routes, local session store, and provider-specific request implementations.

Official Web App verification covered:

- `meta[name="config"]` reporting `v2.16.1` and hosted commit `706a18b9`;
- exactly one detect match, textarea, send control, message viewport, assistant body, turn, new-chat control, sidebar, and header;
- textarea insertion through the real controlled input;
- new-chat navigation to `/#/new-chat` and successful browser return;
- no streaming-status element in the idle state and no credential-free path to a real generation smoke.

The public application currently has no user message in its default session, so the user selector is additionally backed by the fixed source role branch. P2-07 remains in progress until the remaining LibreChat authenticated smoke and broader release acceptance are completed.

## Repository Verification

Run registry validation and distribution generation, inspect both immutable pack entries and hashes, then run format, lint, typecheck, Chrome build, userscript build, and `git diff --check`. Do not stage generated registry output, downloaded research artifacts, Playwright state, or the user's `.gitignore` modification.
