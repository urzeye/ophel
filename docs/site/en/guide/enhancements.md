# All Features & Settings

This page covers every feature in Ophel that is not part of the three main tabs. It also serves as a reference for the Settings pages.

## Floating Quick Buttons

A small group of buttons floats on the side of the screen. By default they are on the same side as the panel. You can:

- **Drag** the group anywhere on screen (long-press to start dragging)
- **Auto-collapse** — after 5 seconds of inactivity the buttons shrink into a compact pill. They expand when your mouse comes within ~150px
- **Opacity** — set a lower opacity so the buttons fade into the background (Settings → General → Quick Buttons)

The default buttons and what they do:

| Button        | Action                                             |
| ------------- | -------------------------------------------------- |
| Panel         | Toggle the side panel open/closed                  |
| Toolbox       | Open/close the toolbox popup menu                  |
| Global Search | Open the global search overlay                     |
| Theme         | Switch between light and dark mode                 |
| Zen Mode      | Toggle zen mode (hides clutter on the AI page)     |
| Scroll Top    | Load full conversation history and jump to the top |
| Anchor        | Return to your last saved position                 |
| Scroll Bottom | Jump to the bottom of the conversation             |

You can reorder, show, or hide each button in **Settings → General → Quick Buttons**.

### Return Anchor

When you click **Scroll Top** or **Scroll Bottom**, Ophel saves your current position as an anchor. Click the **Anchor** button again to jump back. Clicking Anchor a second time swaps the positions (toggle between anchor and current), so you can bounce back and forth.

## Toolbox Menu

Click the toolbox button (☰) in the floating group to open a small popup with these actions:

- **Export** — export the current conversation to file
- **Copy Markdown** — copy the conversation as Markdown to clipboard
- **Move to folder** — assign the current conversation to a folder
- **Set tag** — add or change tags on the current conversation
- **Scroll lock** (toggle) — freeze scroll position while AI generates
- **Model lock** (toggle) — lock to a specific model (see Model Lock section)
- **Clean up bookmarks** — remove ghost bookmarks (outline bookmarks whose content no longer exists)
- **Settings** — open the settings panel

Which items appear in the toolbox is configurable in **Settings → General → Toolbox Menu**.

## Ghost Pass-Through

If the panel overlaps content you need to click, hold **Ctrl** on Windows/Linux or **Command** on Mac. After ~0.2 seconds, the panel becomes fully transparent and click-through. Everything on the AI page behind the panel becomes reachable. Release the key and the panel returns.

This only activates when you hold _only_ the modifier key — not when you press it as part of a shortcut.

## Panel Behavior

Settings → General → Panel:

| Setting               | Description                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| Default open          | Whether the panel opens automatically when you visit a supported site    |
| Default side          | Left or right side of the screen                                         |
| Default edge distance | How far from the screen edge the panel sits (px)                         |
| Panel width           | Width of the panel in pixels (200–600)                                   |
| Panel height          | Height of the panel as a percentage of viewport (50–100 vh)              |
| Auto-hide             | Close the panel when you click outside it                                |
| Edge snap             | Snap the panel to the screen edge when dragged close; hover edge to peek |
| Edge snap threshold   | How close (px) the panel needs to get to trigger a snap                  |

## Global Search

Press **Ctrl+K** (or your configured shortcut, or double-Shift) to open the global search overlay. It searches across:

- Outline nodes in the current conversation
- Conversations (by title, tag, or folder)
- Prompts (by title or content)
- Settings (by name or keyword)

**Syntax filters** let you narrow results:

- `folder:work` — conversations in the "work" folder
- `tag:research` — conversations with the "research" tag
- `site:claude` — conversations from Claude

Navigate results with arrow keys, press Enter to go to a result, or Escape to close.

Settings for global search are in **Settings → Global Search**:

- Enable/disable double-Shift trigger
- Toggle fuzzy search
- Control what happens when you press Enter on a prompt search result (insert or just locate)

## Layout Control

Settings → Site Settings → Layout:

**Page width override** — set a custom maximum width for the AI page content area (% or px). Useful for ultra-wide monitors where the default layout stretches too far.

**User question bubble width** — set a custom maximum width for your question bubbles (% or px).

**Zen Mode** — collapses sidebars, hides banners, and removes visual noise from the AI page. Toggle with the zen mode button in the floating group, or use a keyboard shortcut.

## Scroll Lock

When enabled, the page does not auto-scroll to the bottom as the AI generates. You stay where you are reading. Toggle from the toolbox or with the shortcut (default `Alt+S`).

## Reading History

Ophel remembers where you were in each conversation. When you revisit a conversation, it can automatically scroll back to where you left off.

Settings → Features → Reading History:

- **Persist reading position** — enable recording
- **Auto-restore** — automatically scroll to the saved position when opening a conversation
- **Cleanup after X days** — how long to keep history (1/3/7/30/90 days or forever)

## Tab Management

Settings → Features → Tab (and the Reminder sub-tab):

| Setting                 | Description                                                           |
| ----------------------- | --------------------------------------------------------------------- |
| Open in new tab         | Open new conversations in a new browser tab                           |
| Auto-rename tab         | Keep the browser tab title in sync with the conversation title        |
| Rename interval         | How often to check for title changes (seconds)                        |
| Title format            | Template for the tab title; supports `{title}`, `{status}`, `{model}` |
| Show status icon        | Add a spinner/checkmark to the tab title while generating             |
| Completion notification | Show a desktop notification when AI finishes generating               |
| Notification sound      | Play a sound on completion                                            |
| Sound preset            | Choose from several built-in notification sounds                      |
| Volume                  | Notification volume (0–100%)                                          |
| Repeat count & interval | How many times to repeat the sound and how far apart                  |
| Notify when focused     | Whether to notify even when the tab is already the active tab         |
| Auto-focus window       | Bring the browser window to focus after generation completes          |
| Privacy mode            | Replace the tab title with a custom masked title                      |
| Masked title            | The text to show when privacy mode is on                              |

## Usage Counter

For AI models that have a limited number of free "advanced" uses (like Gemini Advanced), Ophel can track your usage locally.

Settings → Features → Reminder → Usage Monitor:

- **Enable** — turns on the counter widget
- **Daily limit** — set how many uses you expect (for the progress visualization)
- **Auto-reset** — resets the count at midnight each day

The counter shows total uses today, estimated token counts (input, output, and round-trip), and a progress bar when a limit is set. It appears near the input box on supported sites.

## Model Lock

Automatically switch to a specific model every time you open an AI site, without having to do it manually.

Settings → Site Settings → Model Lock:

Pick a site and enter the model you want. Ophel will switch to it whenever you load the page. If the model is not available, nothing happens.

Supported: Gemini, Gemini Enterprise, AI Studio, ChatGPT, Claude, Grok, Qianwen, Qwen Studio, Yuanbao, ima, Z.ai.

## Content Enhancements

Settings → Features → Content:

| Setting                      | Description                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| User question Markdown       | Render Markdown in your own question bubbles (bold, code, lists, etc.)                       |
| Double-click to copy LaTeX   | Double-click a math formula to copy its source LaTeX                                         |
| Formula delimiter conversion | On copy, convert `$$...$$` delimiters to `$...$` (or vice versa)                             |
| Copy Markdown table          | Add a copy button to tables in AI responses                                                  |
| AI reply Mermaid rendering   | Try to render Mermaid diagrams in AI responses that are not already rendered by the platform |

## Site-Specific Settings

Settings → Site Settings → (pick a site):

### Gemini / Gemini Enterprise

- **Markdown fix** — fix bold text not rendering correctly
- **Watermark removal** — remove the "Created with Gemini" watermark from exported images (requires the `<all_urls>` permission)
- **Policy retry** (Enterprise only) — automatically retry requests that are blocked by enterprise content policy; set the maximum retries

### AI Studio

- **Collapse left navbar** — collapse the navigation sidebar on load
- **Collapse Run Settings panel** — collapse the right-side run settings on load
- **Collapse Tools panel** — collapse the tools section within run settings on load
- **Collapse Advanced panel** — collapse the advanced options on load
- **Enable search tool by default** — turn on Google Search tool when opening a new project
- **Watermark removal** — remove watermark from generated images
- **Markdown fix** — fix bold text rendering

### ChatGPT

- **Markdown fix** — fix bold text not rendering correctly

### Claude — Session Key Management

Claude has usage limits per account. Ophel lets you add multiple Session Keys (one per account) and switch between them with a shortcut, so you can rotate accounts when you hit a limit.

In Settings → Site Settings → Claude:

- Add session keys manually or import the current browser session with one click
- Test validity of individual keys or batch-test all at once
- Export/import your key list as JSON (for backup)
- Set which key is active; the extension intercepts requests and injects the chosen key

Switch to the next available valid key any time with the **Switch Claude Key** shortcut.

## Backup & Sync

Settings → Backup & Sync:

**Export** — saves all Ophel data (conversations metadata, prompts, folders, tags, settings, Claude session keys) as a JSON file.

**Import** — restores from a previously exported JSON file. You can choose which data sources to include.

**WebDAV** — sync data to a WebDAV server automatically or manually. Configure URL, username, password, sync mode (manual/auto), sync interval, and which data to include.

## Permissions

Settings → Permissions shows which optional browser permissions Ophel has requested and which are not yet granted:

- `notifications` — required for desktop completion notifications
- `cookies` — required for Claude session key injection
- `<all_urls>` — required for image watermark removal (fetches and converts images)

You can grant or revoke each permission from this page.

## Related Pages

- [Appearance & Themes](./appearance)
- [Keyboard Shortcuts](./shortcuts)
- [Privacy & Data](./privacy)
