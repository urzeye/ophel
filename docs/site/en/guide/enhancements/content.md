# Content Enhancements

This group of features layers extra interactivity on top of AI conversation pages — handling your messages, elements inside AI replies, and making reading and writing smoother.

## User Message Markdown Rendering

Markdown syntax you type in the AI input box — `**bold**`, ` ```code``` `, `- list item`, etc. — usually appears as plain text in the message bubble after sending. With this feature enabled, Ophel renders Markdown formatting inside your message bubbles so they're easier to read.

**Settings → Features → Content → Render Markdown in user messages** (default: on)

## Double-Click to Copy LaTeX

When an AI reply contains math, double-click any rendered formula block and Ophel copies the raw LaTeX source to the clipboard — no more digging into source code.

**Settings → Features → Content → Double-click to copy LaTeX** (default: on)

### Formula Delimiter Conversion

When copying LaTeX, Ophel can automatically convert delimiter styles:

- Inline: `$ ... $` ↔ `\( ... \)`
- Block: `$$ ... $$` ↔ `\[ ... \]`

Enable in **Settings → Features → Content → Formula delimiter conversion**. When on, copied LaTeX is converted to `\( \)` / `\[ \]` form, which is more compatible with tools like Obsidian or Typora.

## One-Click Copy Markdown Table

A **Copy** button appears on tables in AI replies. Click it to copy the table as standard Markdown table syntax, ready to paste into any Markdown editor.

**Settings → Features → Content → Copy Markdown tables** (default: on)

## Mermaid Diagram Fallback Rendering

Some AI platforms don't render Mermaid code blocks as diagrams — the content stays as raw code text. Ophel will try to render those Mermaid blocks as diagrams automatically on those platforms.

> This only activates when the platform itself hasn't rendered the Mermaid block. It won't interfere with native rendering.

**Settings → Features → Content → Render Mermaid in AI replies** (default: on)

## Markdown Fix (Gemini / AI Studio / ChatGPT)

Gemini, AI Studio, and ChatGPT sometimes fail to render **bold text** correctly — `**text**` appears as literal characters instead of formatted text. Ophel includes a patch for affected platforms.

Find the toggle in each site's dedicated settings:

- **Settings → Site Settings → Gemini → Markdown fix**
- **Settings → Site Settings → AI Studio → Markdown fix**
- **Settings → Site Settings → ChatGPT → Markdown fix**

## Watermark Removal (Gemini / AI Studio)

Gemini and AI Studio can attach "Created with Gemini" watermarks when exporting or screenshotting certain content. Enabling this removes those watermarks.

This feature requires the optional `<all_urls>` permission (used to fetch images and convert them to base64). The browser will prompt for permission the first time you enable this.

**Settings → Site Settings → Gemini → Remove watermark**

## Export Options

**Settings → Features → Export**:

| Setting                       | Description                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Custom user name              | Replaces "Me" in exported files; leave blank to use the default                                |
| Custom AI name                | Replaces the AI's name in exported files; leave blank to use the platform name                 |
| Include timestamp in filename | Appends a timestamp to the filename to avoid overwriting existing exports                      |
| Include chain of thought      | Whether to include the AI's reasoning content in exports (applies to platforms that expose it) |
