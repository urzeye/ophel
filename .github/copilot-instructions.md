# Ophel — Copilot Repository Instructions

## Language
When performing a code review, respond in Chinese (Simplified). All review comments, suggestions, and explanations must be written in Simplified Chinese.

## Project Overview
Ophel is a cross-platform browser extension (Plasmo MV3, Chrome + Firefox) and userscript that adds structured navigation, conversation management, and a prompt library to AI chat sites (Gemini, ChatGPT, Claude, DeepSeek, Grok, and 10 others). Stack: TypeScript 5.3 strict, React 18, Zustand 5, pnpm 9.

## CI Pipeline (must all pass on every PR to `main`)
- `pnpm format:check` — Prettier formatting
- `pnpm lint:check` — ESLint (flat config, strict TypeScript rules)
- `pnpm typecheck` — TypeScript strict mode
- `pnpm build` — Full Plasmo production build

## Code Review Guidelines

### TypeScript
- No `any` types; use proper generics or `unknown` with type guards.
- All exported symbols and new functions must have explicit return types.
- Avoid non-null assertions (`!`) without a clear justification comment.

### Adapter Pattern
- New site adapters must extend `SiteAdapter` (`src/adapters/base.ts`) and implement all abstract methods.
- Register new adapters in `src/adapters/index.ts`.
- Do not duplicate logic already present in the base class default implementations.

### Internationalization (i18n)
- Any new user-facing text must be added to `src/locales/resources.ts` for **all 11 languages**: zh-CN, zh-TW, en, ja, ko, it, de, es, fr, pt-BR, ru.
- Always use `t('key')` from `~utils/i18n`; never hardcode UI strings.

### Platform Compatibility
- Storage, permissions, and network calls must go through the `src/platform/` abstraction layer; never call `chrome.*` or `GM_*` APIs directly in shared code.
- Cross-origin requests must use the `MSG_PROXY_FETCH` message to `background.ts`.

### State Management (Zustand)
- New settings must be added to `DEFAULT_SETTINGS` in the settings store and documented.
- Never mutate Zustand state directly; always use store actions.
- New stores must use the `persist` middleware with `chrome.storage.local` (or the platform abstraction).

### CSS & Shadow DOM
- All injected CSS class names must use the `gh-` prefix to avoid conflicts with host pages.
- No CSS-in-JS; use external `.css` files or the inline `style` prop for dynamic values.
- The panel UI runs in a Shadow DOM. Use `DOMToolkit` (`src/utils/dom-toolkit.ts`) for queries; never use `document.querySelector` directly from panel code.

### Security
- No hardcoded secrets or API keys anywhere in the codebase.
- User-controlled data written to the DOM must never use `innerHTML` without sanitization.
- Cross-origin fetches must go through the background proxy; never expose credentials to content scripts.

## Commit Message Format
All commits must follow Conventional Commits (English only, header ≤ 100 chars):
`type(scope): subject`
Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `deps`, `ux`

## IDE-Specific (VS Code Copilot Chat only)
When used in VS Code chat (not code review), call the `#askQuestions` tool after every response to clarify requirements before implementing changes.
