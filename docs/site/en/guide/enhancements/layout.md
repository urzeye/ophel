# Layout & Zen Mode

Ophel provides two layout enhancements: custom page content width and zen mode for distraction-free reading. Both are configured per site independently.

## Page Width

**Settings → Site Settings → [Select site] → Layout → Page Width**

Many AI platforms cap their content area to a narrow width, leaving large empty margins on wide screens. When enabled, you can set a custom maximum width for the content area:

- **Unit**: Percentage (% relative to viewport width)
- **How to adjust**: Drag the slider; range is 50%–100%

Changes take effect immediately — no page refresh needed. Disable the option at any time to revert to the platform's default.

## User Message Width

**Settings → Site Settings → [Select site] → Layout → User Message Width**

Independently controls the maximum width of your outgoing message bubbles. Doesn't affect the overall content area. Useful for making your message bubbles wider to reduce whitespace in wide-screen conversations.

## Zen Mode

Zen mode hides UI elements on the AI page that aren't part of the conversation — sidebars, top navigation bars, etc. — so your attention stays on the content.

**How to enable (any of these):**

- Floating button → Zen mode icon
- Shortcut `Ctrl+Shift+Z` (Cmd+Shift+Z on Mac)
- **Settings → Site Settings → [Select site] → Layout → Zen Mode** (persistent)

Zen mode is saved per site. When enabled in settings, Ophel automatically enters zen mode every time you open that site. When toggled with a button or shortcut, the state is temporary and may not persist after a refresh.

> Zen mode relies on Ophel's knowledge of the current platform's DOM structure. The hiding effect may be incomplete on some sites.

## Ghost Pass-Through

When the panel overlaps content you need to click, you don't have to close the panel first.

Hold **Ctrl** (Cmd on Mac) for about 0.2 seconds — without pressing any other keys — and the panel becomes semi-transparent and click-through. You can now click anything behind it. Release the key to restore the panel.

No configuration needed; this works at any time.

## Panel Size & Position

**Settings → General → Panel**:

| Setting        | Description                                                             | Default |
| -------------- | ----------------------------------------------------------------------- | ------- |
| Default open   | Whether the panel opens automatically on supported sites                | Yes     |
| Default side   | Left or right side of the screen                                        | Right   |
| Edge distance  | Default distance from the screen edge (px)                              | 25 px   |
| Panel width    | Panel width (200–600 px)                                                | 320 px  |
| Panel height   | Panel height as a percentage of viewport (50–100 vh)                    | 85 vh   |
| Auto-hide      | Collapse the panel when you click outside it                            | No      |
| Edge snap      | Snap to screen edge when dragged near it; hover to preview when snapped | On      |
| Snap threshold | Distance from edge that triggers snapping (10–100 px)                   | 18 px   |

Drag the panel's title bar to move it. When snapped, hover over the corresponding screen edge to pop the panel out for a preview; drag it away from the edge to unsnap.
