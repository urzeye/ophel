# Panel Overview

After installation, open any [supported AI site](./getting-started#supported-platforms) and Ophel will activate automatically — a side panel appears on the right, and a group of floating quick-action buttons appear at the screen edge.

## The Three Tabs

![Ophel side panel — three tabs overview](/images/panel/panel-tabs.png)

Click the tab bar at the top of the panel to switch between:

| Tab               | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| **Outline**       | Live structure tree of the current conversation. Click to jump.   |
| **Conversations** | Aggregated history from all platforms. Supports folders and tags. |
| **Prompts**       | Your personal prompt library. Click to insert instantly.          |

If the panel does not appear automatically, press **Alt+P** (Mac: **Option+P**) to open it.

## Basic Navigation

| Action              | Method                                                                                |
| ------------------- | ------------------------------------------------------------------------------------- |
| Switch tabs         | Click the tab bar, or press `Alt+1` / `Alt+2` / `Alt+3` (Mac: `Option+1` / `2` / `3`) |
| Open / close panel  | `Alt+P` (Mac: `Option+P`), or click the panel toggle in the floating buttons          |
| Global search       | `Ctrl+K` (Mac: `Cmd+K`, or your configured shortcut)                                  |
| Toggle light / dark | `Alt+D` (Mac: `Option+D`), or the theme icon in the floating buttons                  |
| Open settings       | `Alt+,` (Mac: `Option+,`), or the settings item in the toolbox                        |

## Floating Quick Buttons

![Floating quick button group — expanded and pill states](/images/panel/floating-buttons.png)

The floating button group at the screen edge is your fastest access point:

- **Auto-collapses** into a pill shape after 5 seconds of inactivity; expands again when your cursor moves within ~150px
- **Long-press and drag** to reposition it anywhere on screen
- Click **☰ (Toolbox)** to reveal more actions: export conversation, move to folder, set tags, toggle scroll lock, model lock, and more

→ See [Floating Buttons & Toolbox](./enhancements/quick-buttons) for full details

## Ghost Pass-Through Mode

![Ghost pass-through — panel turns semi-transparent](/images/panel/ghost-mode.webp)

Does the panel cover something you need to click? No need to close it first:

Hold **Ctrl** (Windows/Linux) or **Command** (Mac) for about **0.2 seconds** (that key alone). The panel turns semi-transparent and lets mouse clicks pass through — you can click directly on the AI page behind it. Release the key to restore normal mode.

## Edge Snap

![Edge snap — panel snapped to edge, hover to peek](/images/panel/edge-snap.webp)

Drag the panel close to the screen edge and it snaps in and hides. Hover your cursor over the corresponding edge to peek at the panel. Drag it away from the edge to unsnap.

Adjust the snap threshold or disable this feature in **Settings → General → Panel → Edge Snap**.

## Basic Panel Settings

All settings below are in **Settings → General → Panel**:

| Setting        | Description                                                      | Default |
| -------------- | ---------------------------------------------------------------- | ------- |
| Default open   | Whether the panel opens automatically on supported sites         | Yes     |
| Default side   | Left or right side of the screen                                 | Right   |
| Panel width    | Panel width (200–600 px)                                         | 320 px  |
| Panel height   | Panel height as a percentage of viewport (50–100 vh)             | 85 vh   |
| Edge distance  | Initial distance from screen edge                                | 25 px   |
| Auto-hide      | Collapse the panel when you click outside it                     | No      |
| Edge snap      | Snap to edge when dragged near it; hover to preview when snapped | On      |
| Snap threshold | Distance from edge that triggers snapping (10–100 px)            | 18 px   |

Drag the panel’s title bar to move it.

## What's Next

- [Smart Outline](./features/outline) — Navigate long conversations in seconds
- [Conversation Manager](./features/conversation) — Organize your chat history
- [Prompt Library](./features/prompt) — Save and reuse your best prompts
- [Quick Buttons](./enhancements/quick-buttons) — Button config and toolbox details
- [Enhancements Overview](./enhancements) — All enhancement features
- [Shortcuts](./shortcuts) — Full shortcut reference
