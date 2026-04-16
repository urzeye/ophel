# Smart Outline

![Smart Outline — live conversation table of contents](/images/features/outline.png)

The Smart Outline automatically reads your AI conversation and builds a live, clickable table of contents in the side panel. The longer the conversation, the more useful it becomes.

## How It Works

Every time the AI finishes a reply, Ophel scans the conversation and builds an outline tree from:

- **Your questions** — each user message becomes a first-level entry
- **AI response headings** — Markdown headings (`#`, `##`, `###`, etc.) inside AI replies become nested entries under the question that prompted them

Example:

```
You: Explain React core concepts
  ├── # React Introduction
  │   ├── ## What is React
  │   └── ## Why use React
  ├── # Core Concepts
  │   ├── ## Components
  │   ├── ## Props and State
  │   └── ## Lifecycle
  └── # Summary
```

Click any entry to jump to that part of the conversation.

## Scroll Following

As you scroll the page, the outline highlights which section you are currently reading. This works as a real-time position indicator so you always know where you are in a long conversation.

## Filter Modes

Three filter buttons sit above the outline list:

| Button             | What it shows                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **All** (default)  | Everything — user questions and AI headings                                              |
| **Questions only** | Hides AI headings, shows only your messages — useful for reviewing the conversation flow |
| **Bookmarks only** | Shows only the headings you have starred                                                 |

You can also toggle these with shortcuts: `Alt+Q` (Mac: `Option+Q`) (questions only), `Alt+Shift+Q` (Mac: `Option+Shift+Q`) (all), `Alt+C` (Mac: `Option+C`) (bookmarks).

## Bookmarks

Hover over any outline entry to see a star icon. Click it to bookmark (save) that heading. Bookmarks persist across page reloads. You can view only bookmarks using the filter button, or jump between them without leaving the outline panel.

If a bookmarked heading gets deleted from the conversation (e.g. the AI regenerates), it becomes a "ghost" bookmark. The toolbox has a cleanup option to remove these.

## Expand by Level

Right-click on any outline node, or use shortcuts `Alt+Shift+1` through `Alt+Shift+6` (Mac: `Option+Shift+1` through `Option+Shift+6`), to expand the tree to a specific heading depth. `Alt+E` (Mac: `Option+E`) toggles all nodes expanded or collapsed.

## Word Count on Hover

Hover over an outline entry to see a small tooltip showing the approximate character count of that section.

## Copy Node Text

Each user question entry has a copy icon on hover. Click it to copy the original question text to the clipboard — handy for re-asking in a new conversation.

## Locate

Press `Alt+L` (Mac: `Option+L`) to scroll the outline panel to highlight the entry for your current reading position, even if you have scrolled the outline list away from it.

## Settings

Go to **Settings → Features → Outline** to configure:

| Setting              | Description                                                                        |
| -------------------- | ---------------------------------------------------------------------------------- |
| Auto update          | Whether the outline refreshes automatically after each AI reply                    |
| Update interval      | How often it checks for changes (seconds)                                          |
| Follow mode          | Whether the outline tracks your scroll position (`current`, `latest`, or `manual`) |
| Inline bookmark icon | When to show the bookmark star in the conversation text itself                     |
| Panel bookmark icon  | When to show the bookmark star in the outline panel entries                        |
| Show word count      | Show character count on hover                                                      |
| Prevent auto-scroll  | Stop the outline panel from scrolling itself when you navigate                     |

## Shortcuts

> Mac users: **Alt** = **Option**.

| Shortcut         | Action                              |
| ---------------- | ----------------------------------- |
| `Alt+R`          | Refresh outline                     |
| `Alt+E`          | Expand / collapse all               |
| `Alt+Q`          | Toggle questions-only filter        |
| `Alt+Shift+Q`    | Show all (clear filter)             |
| `Alt+C`          | Toggle bookmarks filter             |
| `Alt+L`          | Locate current position in outline  |
| `Alt+F`          | Search within outline               |
| `Alt+Up`         | Jump to previous heading            |
| `Alt+Down`       | Jump to next heading                |
| `Alt+Shift+1..6` | Expand outline to heading level 1–6 |

All shortcuts are customizable in **Settings → Shortcuts**.
