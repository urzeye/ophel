# Open WebUI Official SitePack Design

## Context

P2-04 adds declarative `detect` rules and delayed activation for exact origins that users bind in detect mode. P2-05 uses that path for the first official self-hosted ChatUI package: Open WebUI installations can run on arbitrary domains, so they cannot be covered by a least-privilege static `matches` list.

The public `https://demo.openwebui.com/` endpoint closed the connection during verification, and the official website did not expose another public chat instance. Browser acceptance therefore used the official PyPI `open-webui` distribution, version 0.11.0, on `http://127.0.0.1:18080` with authentication disabled and a local OpenAI-compatible streaming model. The package's shipped source maps were also inspected to confirm the selector contracts and the `/c/[id]` and `/s/[id]` routes.

## Goals

- Add one official `open-webui` SitePack under `registry/sites/`.
- Keep `matches` empty and activate the package only through a user-bound exact origin plus DOM detection.
- Keep the package pure JSON, with no executable hook, wildcard host authorization, or built-in TypeScript adapter.
- Declare only the core capabilities verified against the official Open WebUI v0.11.0 browser DOM.
- Exclude accessibility labels, timestamps, and floating response actions from outline and export content.
- Provide user-facing metadata for all eleven application locales inside the manifest.
- Preserve extension and userscript behavior by using the existing declarative adapter, network monitor, layout manager, and origin-binding contracts.

## Non-goals

- Add a public Open WebUI hostname or a top-level wildcard to `matches`.
- Auto-discover arbitrary origins without the user's explicit origin binding.
- Add a bundled Open WebUI adapter or any Open WebUI-specific runtime branch.
- Claim `stop-generation`: the current stop action has no stable language-independent ID or attribute and exposes only a localized `aria-label` while streaming.
- Claim `conversation-list`, `reading-history`, `width`, `model-lock`, or `clean` without dedicated cross-state browser evidence.
- Export Open WebUI citations, files, code executions, or structured-output metadata beyond the rendered basic response body.
- Change Ophel panel styling, theme variables, Shadow DOM injection, or the SitePack manager UI.

## Alternatives Considered

### 1. Detect-only pure-JSON SitePack — selected

Ship `matches: []` with one strong composer-structure detect rule. Users bind their exact Open WebUI origin in detect mode; P2-04 activates the package only after the DOM feature is present. This covers arbitrary self-hosted domains while preserving explicit authorization and the declarative security boundary.

### 2. Built-in TypeScript adapter

A bundled adapter could add custom extraction and stop-button logic, but the verified core feature set fits the existing declarative primitives. Adding imperative code would bypass the Phase 2 goal of proving that self-hosted ChatUIs can remain registry-delivered and independently updateable. This is rejected.

### 3. Static or wildcard host matching

Open WebUI has no single application origin, and `https://*/*` is intentionally forbidden. Adding the official marketing site or a small list of hosted providers would not cover private installations and would broaden authorization without detecting the chat application. This is rejected.

## Detection and Activation

The package uses one `selectorExists` rule:

```css
form:has(#chat-input-container #chat-input):has(#input-menu-button)
```

The rule combines three shipped Open WebUI IDs inside the same composer form. It is stronger than detecting `#chat-input` alone and contains no localized label or generated class. The official build does not provide a useful `<meta name="generator">`, so a second, weaker rule would only increase false-positive risk.

Because `matches` is empty, the package cannot activate through static URL matching. The origin must already be authorized and persisted as a detect binding. Built-in adapters and explicit bindings retain the precedence defined by P2-04.

## Capability Contract

The package declares exactly these capabilities:

- `outline`
- `outline-user-queries`
- `export-basic`
- `generation-detect`
- `new-chat`
- `zen`
- `prompt-insert`

Capability presence remains a user-interface contract. Unlisted features stay hidden even if Open WebUI exposes related controls.

## Selector Design

| Purpose | Selector | Evidence and rationale |
| --- | --- | --- |
| Text editor | `#chat-input` | A unique visible `DIV` with `contenteditable="true"`; the declarative `execCommand("insertText")` path updated its ProseMirror paragraph. |
| Submit action | `#send-message-button` | Appears visible and enabled after the editor update settles. `PromptManager` already retries insertion after 80 ms, covering Open WebUI's asynchronous Svelte render. |
| Outline root | `#messages-container [role='log']` | A unique semantic `UL` containing only message turns. Using `#messages-container` directly would also include the localized screen-reader H2 `#chat-conversation`. |
| User content | `.user-message .chat-user .markdown-prose, .user-message .chat-user .whitespace-pre-wrap` | Selects the shipped Markdown and plain-text render paths while excluding the sibling timestamp and action row. |
| Assistant body | `#response-content-container > div:first-child` | Selects the `ContentRenderer` body, including structured content, while excluding the sibling floating action container whose ID starts with `floating-buttons-`. |
| Expanded-sidebar new chat | `a#sidebar-new-chat-button` | The shipped source renders this stable link when the sidebar is expanded. The hidden compatibility button with the same ID is excluded by the `a` type selector. |
| Collapsed-sidebar new chat | `#sidebar > button a[href='/']` | Present in the collapsed navigation and successfully navigated the tested conversation back to `/`. |

The final browser check returned one outline root; exactly the expected H1, H2, and H3; one user body without its timestamp; and one assistant body without the floating “Ask/Explain” actions.

Schema v1 requires the user-content selector in both `selectors.userQuery` for outline extraction and `export.userQuerySelector` for export pairing. The manifest keeps those two required values byte-identical and introduces no separate runtime branch.

## Prompt Insertion

Open WebUI uses a ProseMirror contenteditable editor. The declarative adapter first emits `beforeinput`, then falls back to `execCommand("insertText")`. In the browser, that path inserted the complete prompt and Open WebUI mounted `#send-message-button` on the following render tick. The first synchronous adapter check can therefore miss the button, but the existing `PromptManager.insertPrompt()` retry sequence (`0`, `80`, `120`, `180`, and `240` ms) rechecks the already inserted text and ready submit action and returns success without site-specific code.

The pack keeps `submitKey: "Enter"`. Queue sending additionally waits up to two seconds for a missing submit button before falling back to the configured keyboard path.

## Generation Detection

The tested chat request was:

```text
POST /api/chat/completions
```

The pack uses both a substring pattern and an exact pathname suffix for that route, with a 500 ms silence threshold. This avoids localized stop-button detection and lets the existing main-world network monitor observe the complete response stream in both extension and userscript builds. Request-body metadata rules are omitted because they annotate events rather than filter requests and are unnecessary for this endpoint.

## Session Boundary

An active conversation navigated to `/c/<uuid>`, and clicking new chat returned to `/` with zero message, user-message, and response-content nodes while retaining the composer. The package therefore declares:

- `idFromPathRegex: ^/c/([^/?#]+)$`
- `newConversationPathPatterns: ["^/$"]`
- `sharePathPrefix: /s/`, matching the shipped `/s/[id]` route
- `newTabPath: /`

These fields improve per-conversation identity without enabling the unverified conversation-list or reading-history capabilities.

## Zen Behavior

Zen mode hides:

- `#sidebar`
- `nav:has(#navbar-bg-gradient-to-b)`

Both targets were present and visible before the smoke, computed to `display: none` after applying the same rule emitted by `LayoutManager`, and returned to their original visible `flex` state after removal. The styles act in the host document; no Ophel Shadow DOM or theme variable path changes.

## Metadata Localization

`nameI18n` and `descriptionI18n` contain `zh-CN`, `zh-TW`, `en`, `ja`, `ko`, `it`, `de`, `es`, `fr`, `pt-BR`, and `ru`. The product name remains `Open WebUI` in every locale. English is the base manifest fallback, and the existing resolver aliases `pt` to `pt-BR`.

## Runtime and Security Boundary

The manifest uses schema version 1, pack version 1, and `minAppVersion: 1.1.8`. It grants no origin by itself, contains no remote resource or executable field, and depends on an exact user-approved binding. Registry validation remains authoritative for selector syntax, safe regular expressions, serialized size, capability requirements, and built-in ID or origin conflicts.

## Browser Verification

The Open WebUI v0.11.0 acceptance covered:

- detect-form presence on the new-chat page;
- contenteditable prompt insertion and the delayed ready submit action;
- one user body without its timestamp and one assistant body without floating actions;
- rendered H1/H2/H3 elements in message-log DOM order, excluding the screen-reader heading;
- the streamed `POST /api/chat/completions` request;
- the `/c/<uuid>` session path and `/` new-chat boundary;
- collapsed-sidebar new-chat navigation and complete message clearing;
- Zen target hiding and full restoration.

Screenshots and the local mock environment were stored under ignored `output/playwright/` storage during acceptance, then removed before commit. They are not registry source files.

## Repository Verification

Run registry validation and distribution generation, inspect the generated Open WebUI index entry and SHA-256 path, then run format, lint, typecheck, Chrome build, userscript build, and `git diff --check`. Generated `registry/dist/`, extension builds, Playwright artifacts, local Open WebUI data, and the user's existing `.gitignore` change must not be committed.
