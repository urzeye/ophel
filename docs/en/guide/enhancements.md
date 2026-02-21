# ⚙️ Settings Center & Advanced Capabilities

This page is a code-aligned map of Ophel settings, so you can quickly jump from a feature name to its exact settings path.

> Source mapping: `src/tabs/options/pages/GeneralPage.tsx`, `FeaturesPage.tsx`, `SiteSettingsPage.tsx`, `GlobalSearchPage.tsx`, `AppearancePage.tsx`, `ShortcutsPage.tsx`, `BackupPage.tsx`, `PermissionsPage.tsx`, `ClaudeSettings.tsx`

## Menu Map

| Top-Level Menu | Tabs / Modules                                                      | What It Controls                                                                            |
| -------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| General        | Panel / Tab Layout / Quick Buttons / Toolbox                        | Panel behavior, tab order, quick-entry controls, toolbox visibility                         |
| Features       | Outline / Conversations / Prompts / Tab / Content / Reading History | Auto rename, notifications, privacy mode, export options, Markdown/LaTeX/table enhancements |
| Site Settings  | Layout / Model Lock / Gemini / AI Studio / ChatGPT / Claude         | Site-specific behavior, model lock, markdown fixes, Session Key workflows                   |
| Global Search  | Search Everywhere                                                   | Unified search across outline, conversations, prompts, and settings                         |
| Appearance     | Presets / Custom Styles                                             | 24 built-in presets, per-site theme mode, custom CSS                                        |
| Shortcuts      | Global switch / Action categories / Independent options             | Shortcut recording, conflict checks, reset, prompt submit key style                         |
| Backup & Sync  | Export / Import / WebDAV                                            | Full or partial backup, JSON import, WebDAV upload/restore                                  |
| Permissions    | Optional / Required permissions                                     | `notifications`, `cookies`, `<all_urls>` grant/revoke                                       |

## Quick Access

- Open settings from panel: `⚙️ Settings` or shortcut `Alt + ,`
- In-page settings modal: includes the `Global Search` menu
- Standalone options page: includes `General / Features / Site Settings / Backup / Permissions / About`

<a id="settings-general"></a>

## General

### Panel

- Default panel open state and default side (left/right)
- Default edge distance, panel width (px), panel height (vh)
- Edge snap and snap threshold
- Auto-hide when clicking outside panel

### Tab Layout

- Drag-and-drop order for panel tabs
- Enable/disable `Outline / Conversations / Prompts` tabs independently

### Quick Buttons

- Drag-and-drop ordering for quick buttons
- Toggle visibility for button groups (anchor/theme/search/toolbox, etc.)
- Global opacity for the quick button group

### Toolbox Menu

You can show/hide these toolbox entries (Settings stays always visible):

- Export
- Copy Markdown
- Move to folder
- Set tag
- Scroll lock
- Model lock
- Cleanup invalid bookmarks

<a id="settings-features"></a>

## Features

### Tab Behavior & Notifications

- Open new conversations in a new tab
- Auto-rename browser tabs
- Rename detection interval (seconds)
- Title format template (`{status}`, `{title}`, `{model}`)
- Show generation status in tab title
- Completion notification flow (desktop, sound, volume, notify when focused)
- Auto-focus window after generation
- Privacy mode and custom masked title

### Outline & Bookmarks

- Auto update and update interval
- Follow mode (`current / latest / manual`)
- Word count in outline hover
- Inline bookmark icon display mode
- Panel bookmark icon display mode
- Prevent auto-scroll behavior

### Conversation Strategy & Export Profile

- Folder rainbow colors
- Unpin on sync
- Sync delete to cloud on supported sites
- Custom export user/model names
- Timestamp in export filename
- Export images as Base64

### Prompts Interaction

- Double-click to send prompt
- Prompt submit style (Enter / Ctrl+Enter in Shortcuts page)

### Reading History

- Persist reading position
- Auto-restore reading position
- Cleanup retention (1/3/7/30/90 days or forever)

### Content Interaction Enhancements

- User query Markdown rendering
- Double-click to copy LaTeX formula source
- Formula delimiter conversion during copy
- Copy Markdown table from table widget

<a id="settings-site-settings"></a>

## Site Settings

### Layout

- Override page width (value + `%/px`)
- Override user-query bubble width (value + `%/px`)

### Model Switch Lock

Per-site model lock support:

- Gemini
- Gemini Enterprise
- AI Studio (model dropdown with refresh)
- ChatGPT
- Claude
- Grok

### Gemini / Gemini Enterprise

- Markdown bold rendering fix
- Image watermark removal (`<all_urls>` required)
- Gemini Enterprise policy retry (enable + max retries)

### AI Studio

- Collapse navbar by default
- Collapse run settings panel by default
- Collapse tools panel by default
- Collapse advanced settings by default
- Enable search tool by default
- Remove watermark (takes effect after page refresh)
- Markdown bold rendering fix

### ChatGPT

- Markdown bold rendering fix

### Claude Session Key Management

- Add / delete Session Keys
- Import current browser Session Key (extension context)
- JSON import / export
- Single-key and batch validity testing
- Current key switching with status display

<a id="settings-global-search"></a>

## Global Search (Search Everywhere)

Unified search across:

- Outline nodes
- Conversations
- Prompts
- Settings

Configurable options:

- Double-Shift trigger
- Fuzzy search toggle
- Prompt Enter behavior (`Smart` or `Locate Only`)

## Site-Specific Enhancements at a Glance

| Site      | Site-Specific Enhancements                                                                      |
| --------- | ----------------------------------------------------------------------------------------------- |
| Gemini    | Markdown fix, image watermark removal, Gemini Enterprise policy retry                           |
| AI Studio | Navbar/run settings/tools/advanced collapse, default search on, watermark removal, markdown fix |
| ChatGPT   | Markdown fix                                                                                    |
| Claude    | Session Key workflows (switch, test, import/export)                                             |

## Related Pages

- [Appearance](/en/guide/appearance)
- [Shortcuts](/en/guide/shortcuts)
- [Privacy & Data](/en/guide/privacy)
