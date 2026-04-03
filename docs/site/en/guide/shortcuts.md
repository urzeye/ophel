# ⌨️ Shortcut System

This page maps to `ShortcutsPage.tsx` and supports action-level bindings, conflict checks, and one-click reset.

## Page layout

| Section              | Purpose                                                                              |
| -------------------- | ------------------------------------------------------------------------------------ |
| Shortcut Settings    | Global toggle, global URL (extension context), reset defaults                        |
| Independent Settings | Prompt submit behavior (Enter / Ctrl+Enter)                                          |
| Action categories    | Bindings grouped by navigation, panel, outline, conversations, interaction, settings |

## Shortcut Settings

### Global toggle

- `Enable custom shortcuts`: disables all categorized action shortcuts when turned off.

### Global shortcut URL (extension context)

- Configures the URL opened by the browser-level shortcut (default: `https://gemini.google.com`).
- Includes a button to open browser shortcut settings directly (Chrome / Edge / Firefox).

### Reset defaults

- Restores all keybindings to defaults (with confirmation).

## Independent setting (always active)

- Prompt submit behavior: `Enter` or `Ctrl + Enter`
- This setting is not affected by the global shortcut toggle.

## Action categories (code-aligned)

| Category      | Representative actions                                                                     |
| ------------- | ------------------------------------------------------------------------------------------ |
| Navigation    | Scroll top, scroll bottom, return to anchor                                                |
| Panel         | Toggle panel, toggle theme, switch tab 1/2/3                                               |
| Outline       | Refresh, expand/collapse, heading navigation, search, locate, bookmark filters             |
| Conversations | New conversation, refresh list, locate current, previous/next conversation                 |
| Interaction   | Export conversation, copy latest reply, copy last code block, scroll lock, stop generation |
| Settings      | Open settings, open Claude/Gemini/theme/model-lock settings, switch Claude key             |

## Recording and validation rules

- Click an action entry to start recording.
- Modifier-only keys are ignored.
- Without modifiers, only specific function keys are accepted (`Esc`, `F1`–`F12`, etc.).
- Any single binding can be removed (shown as `Not set`).
- Conflicts are detected and shown inline.

## Default examples

- `Alt + ,`: open settings
- `Alt + D`: toggle theme
- `Alt + S`: toggle scroll lock
- `Ctrl + Shift + O`: new conversation
- `Ctrl + Alt + C`: open Claude settings

For the full default set, use the shortcuts page directly.

## Related pages

- [Settings Center Overview](/en/guide/enhancements)
- [Privacy & Data](/en/guide/privacy)
