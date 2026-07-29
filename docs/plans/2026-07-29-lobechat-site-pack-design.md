# LobeChat Official SitePack Design

## Context

P2-04 adds DOM detection and exact-origin bindings for self-hosted ChatUI packages. P2-05 proves that path with Open WebUI. P2-06 applies the same least-privilege model to LobeChat, whose installations can run on arbitrary origins and whose current canary application has already diverged substantially from the latest stable npm release.

The latest stable package on 2026-07-29 is `@lobehub/chat@1.143.3`, tag commit `d718de7e1af2dd7281c4eaca70f627e4b9deddb1`. Stable evidence came from that fixed source tag and the official `lobehub/lobe-chat:1.143.3` amd64 image. The image contains the production Next.js build and confirms the shipped selector and request literals rather than relying only on development source.

The official cloud entry points `https://lobechat.com/`, `https://lobechat.com/chat`, `https://chat-preview.lobehub.com/`, and `https://app.lobehub.com/` all required authentication. Browser acceptance therefore used the anonymous public share page `https://app.lobehub.com/share/t/RmZwPMEK` for the current application DOM. That page is newer than stable 1.143.3 and read-only, so browser evidence and stable-release evidence are recorded separately instead of being presented as the same runtime.

## Goals

- Add one official `lobechat` SitePack under `registry/sites/`.
- Keep `matches` empty and activate only through a user-bound exact origin plus strong LobeChat DOM detection.
- Keep the package pure JSON, with no executable hook, wildcard authorization, or bundled TypeScript adapter.
- Support both the stable 1.143.3 message DOM and the current public-page message DOM where declarative selectors can do so safely.
- Declare only the core capabilities supported by the existing declarative primitives.
- Provide user-facing metadata for all eleven application locales inside the manifest.
- Preserve extension and userscript behavior through the existing declarative adapter, network monitor, layout manager, and origin-binding contracts.

## Non-goals

- Add a static official-cloud origin or a broad host wildcard to `matches`.
- Auto-discover arbitrary self-hosted origins without the user's explicit binding.
- Add a bundled LobeChat adapter or site-specific runtime branch.
- Claim `conversation-list` or `reading-history`: stable 1.143.3 identifies sessions through `/chat?session=<id>` while the current canary uses `/agent/<agentId>/<topicId>`, and schema v1 only extracts session IDs from `pathname`.
- Claim `stop-generation`: the editor swaps to a stop glyph while streaming but exposes no stable language-independent ID or semantic attribute.
- Claim `width`, `model-lock`, `clean`, or host-theme synchronization without dedicated cross-version browser evidence.
- Export files, citations, reasoning panels, tools, or other structured metadata beyond the rendered Markdown body.
- Change Ophel panel styling, theme variables, Shadow DOM injection, or SitePack management UI.

## Alternatives Considered

### 1. Detect-only, dual-generation pure-JSON SitePack — selected

Ship `matches: []` with strong composer and message-list detection. Stable selectors use the fixed `#chatlist-list`, `[data-index]`, and assistant `data-layout="vertical"` contracts. Current selectors use the public-page `.message-wrapper[data-message-id]` structure and its explicit flex-alignment variables. This preserves the registry-delivered architecture while avoiding a false claim that one DOM generation covers every release.

### 2. Stable-only SitePack

A stable-only package would be simpler, but the official cloud already uses the newer message-wrapper structure. Adding compatible selector branches is still declarative and backed by public browser evidence, so excluding the current structure would create an avoidable immediate maintenance gap. This is rejected.

### 3. Built-in TypeScript adapter

Imperative code could read query-string session IDs and add richer virtual-list handling, but it would bypass the Phase 2 objective of independently updateable self-hosted ChatUI packages. The verified core feature set fits the current manifest surface, so this is rejected.

## Detection and Activation

The package uses four strong `selectorExists` rules:

1. stable chat composer: `/chat` navigation, a Lexical editor, and the shipped 14×14 send glyph on the same page;
2. current composer: the Lobe UI theme root, the Lexical editor, and the same send glyph;
3. stable rendered conversation: `#chatlist-list` containing indexed Markdown messages;
4. current rendered conversation or share page: the Lobe UI theme root containing message wrappers and Markdown articles.

The editor alone is not used as a detector because `data-lexical-editor` is not LobeChat-specific. Neither stable nor current public pages expose a useful `<meta name="generator">`. Because `matches` is empty, these rules grant no host access by themselves; an exact origin must already be authorized and persisted as a detect binding.

## Capability Contract

The package declares exactly:

- `outline`
- `outline-user-queries`
- `export-basic`
- `generation-detect`
- `new-chat`
- `zen`
- `prompt-insert`

Unlisted capabilities remain hidden. The contract intentionally does not imply full-history extraction from LobeChat's virtualized message list: outline and basic export operate on the message turns currently mounted by the host application.

## Selector Design

| Purpose | Stable 1.143.3 | Current public application | Evidence and rationale |
| --- | --- | --- | --- |
| Text editor | `[contenteditable='true'][data-lexical-editor='true']` | Same | `@lobehub/editor` uses Lexical and sets both attributes on its plain-text editor root. |
| Submit action | `button:has(svg[viewBox='0 0 14 14'] > path[d^='M.743 3.773'])` | Same editor contract | The official editor package and production chunk contain the fixed 14×14 send glyph. No localized label or generated class is used. |
| Outline root | `#chatlist-list` | strict overflow container containing message wrappers | Stable source and production output contain the fixed list ID. The public page exposes one virtual-scroll container with `overflow-y: auto` and `contain: strict`. |
| Turn root | `#chatlist-list [data-index]` | `.message-wrapper[data-message-id]` | Both are stable virtual-list item markers and preserve DOM message order. |
| User body | indexed turn without assistant `data-layout="vertical"`, narrowed to `article[data-code-type='markdown']` | wrapper with `--lobe-flex-align: flex-end`, narrowed to the Markdown article | Excludes timestamps, avatars, menus, and message actions. |
| Assistant body | indexed turn containing `data-layout="vertical"`, narrowed to the Markdown article | wrapper with `--lobe-flex-align: flex-start`, narrowed to the Markdown article | The assistant layout attribute is present in stable source and the production chunk; the alignment variable is present in the current browser DOM. |
| New chat | button or explicit button role containing `svg.lucide-message-square-plus` | Same icon contract | Stable source and production output use `MessageSquarePlus`; current source retains the same icon. Group-chat dropdown mode is not claimed. |
| Scroll container | `[data-virtuoso-scroller]` | strict overflow container | Stable uses `react-virtuoso`; the current public page uses a newer virtual scroller without the old data attribute. |

`turnSelector` is populated rather than pairing the two role arrays by index. This preserves an extra assistant-only or tool-related turn in its actual DOM position and avoids shifting all subsequent export roles.

## Prompt Insertion

Stable 1.143.3 and current source both use `@lobehub/editor` with a Lexical contenteditable root. The declarative adapter emits a cancellable `beforeinput` event and then uses `execCommand("insertText")` when needed. LobeChat's editor listens on the contenteditable root and the send control becomes enabled after content is present. The package keeps `submitKey: "Enter"`; normal sending uses the visible enabled button first, so a user's alternate keyboard preference does not become the primary path.

## Generation Detection

Stable source defines the provider request as:

```text
/webapi/chat/{provider}
```

The same literal is present in the official 1.143.3 production chunk. The package monitors only `/webapi/chat/` with a 500 ms silence threshold. It does not depend on the unstable stop glyph and does not add request-body rules because the provider suffix already distinguishes the chat stream route.

## Session Boundary

The manifest deliberately omits `session`:

- stable 1.143.3 uses `/chat?session=<id>` and optional `topic=<id>`;
- current canary uses `/agent/<agentId>/<topicId>`;
- schema v1's declarative session primitive reads only `window.location.pathname`.

Treating every `/chat` page as one conversation or encoding only the canary route would create false session identity. New chat remains available through the verified control, while session-dependent capabilities stay disabled.

## Zen Behavior

Stable Zen targets are derived from fixed source relationships rather than generated antd-style class hashes:

- the global side navigation is identified by containing both `/chat` and `/labs` links while excluding the composer workspace;
- the session panel is identified by the new-agent icon plus `/chat?session=` links while excluding the composer workspace;
- the topic panel is identified through its fixed 280 px, `100vh` inner container while excluding the composer workspace;
- the chat header uses the fixed inline 40 px height and `z-index: 11` contract.

The rules are applied to the host document by the existing `LayoutManager`. They do not modify Ophel's Shadow DOM or theme variables. Current-canary layout targets are not added without an authenticated runtime smoke.

## Metadata Localization

`nameI18n` and `descriptionI18n` contain `zh-CN`, `zh-TW`, `en`, `ja`, `ko`, `it`, `de`, `es`, `fr`, `pt-BR`, and `ru`. The product name remains `LobeChat` in every locale. English is the base manifest fallback, and the existing resolver aliases `pt` to `pt-BR`.

## Runtime and Security Boundary

The manifest uses schema version 1, pack version 1, and `minAppVersion: 1.1.8`. It grants no origin by itself and contains no remote resource or executable field. Registry validation remains authoritative for selector syntax, serialized size, capability requirements, safe network patterns, and built-in ID or origin conflicts.

## Browser and Release Verification

The anonymous current public share page contained:

- one `#lobe-ui-theme-app` root;
- one strict virtual-scroll container;
- eight mounted `.message-wrapper[data-message-id]` turns;
- three user Markdown bodies selected by `flex-end`;
- four assistant Markdown bodies selected by `flex-start`;
- one additional mounted non-Markdown turn, preserved by the turn selector without being exported as fabricated text.

The public page also confirmed that only visible virtual-list messages are mounted. It cannot verify composer, new-chat, generation, or Zen behavior because it is read-only.

Stable verification covered the fixed tag source, `@lobehub/editor@4.19.1` source, `react-layout-kit@2.0.1`, `@lobehub/ui@2.13.2`, and the official 1.143.3 production image. Docker is unavailable in this Windows environment, and the Linux standalone image cannot be represented as a successful Windows runtime smoke; this limitation remains explicit rather than treating source inspection as browser execution.

## Repository Verification

Run registry validation and distribution generation, inspect the generated LobeChat index entry and SHA-256 path, then run format, lint, typecheck, Chrome build, userscript build, and `git diff --check`. Generated `registry/dist/`, extension builds, downloaded release artifacts, Playwright state, and the user's existing `.gitignore` change must not be committed.
