# Frequently Asked Questions

## Supported Platforms

Which AI sites does Ophel support?

| Platform          | URL                    |
| ----------------- | ---------------------- |
| Gemini            | gemini.google.com      |
| Gemini Enterprise | business.gemini.google |
| AI Studio         | aistudio.google.com    |
| ChatGPT           | chatgpt.com            |
| Claude            | claude.ai              |
| Grok              | grok.com               |
| DeepSeek          | chat.deepseek.com      |
| Doubao            | www.doubao.com         |
| Kimi              | www.kimi.com           |
| Qwen Studio       | chat.qwen.ai           |
| Qianwen           | www.qianwen.com        |
| Yuanbao           | yuanbao.tencent.com    |
| Z.ai              | chat.z.ai              |
| ChatGLM           | chatglm.cn             |
| ima               | ima.qq.com             |

## Installation & Setup

**The panel is not appearing on the AI site.**

1. Confirm you installed the extension and it is enabled (check the browser toolbar)
2. Hard-reload the page (`Ctrl+Shift+R` or `Cmd+Shift+R`)
3. Check that the site is in the [supported list above](#supported-platforms)
4. If the panel was closed, press `Alt+P` (Mac: `Option+P`) or click the floating show/hide button

**How do I open the panel if the floating buttons are not visible?**

Press `Alt+P` (Mac: `Option+P`). This toggles the panel regardless of whether the floating buttons are visible.

**The extension shows "Click to enable" for some sites.**

Some URLs require you to explicitly grant the extension permission to run. Click the extension icon in the browser toolbar and allow access to the current site.

## Panel Behavior

**The panel is covering part of the page I need to click.**

Hold **Ctrl** (Windows/Linux) or **Command** (Mac) alone for about 0.2 seconds. The panel becomes transparent and click-through (ghost mode). Release the key to return to normal.

**The floating buttons disappeared.**

They auto-collapse after 5 seconds of inactivity into a compact pill shape. Move your mouse within ~150px of them and they will expand again. If they are completely missing, press `Alt+P` (Mac: `Option+P`) to open the panel — the buttons appear alongside it.

**The panel snapped to the edge and I cannot move it.**

When the panel is in edge-snap mode, hover over the screen edge and it will slide out. Drag it away from the edge to undock it. You can disable edge snap entirely in Settings → General → Panel.

## Outline

**The outline is empty even though the conversation has content.**

Try pressing `Alt+R` (Mac: `Option+R`) to refresh the outline manually. Some platforms update the DOM asynchronously and the outline may not populate immediately on page load.

**The outline is not tracking my scroll position.**

Make sure "Sync outline with scroll" is enabled in Settings → Features → Outline.

## Conversations

**My conversations are not showing in the Conversations tab.**

The Conversations tab reads from the AI platform's own sidebar. If the platform's sidebar is not loaded, Ophel cannot see the conversations. Try scrolling the native sidebar to load more items.

**What does WebDAV sync actually back up?**

WebDAV syncs your Ophel metadata only: conversation titles, folder assignments, tags, pins, and notes you added in Ophel. It does not upload the actual conversation messages (those belong to the AI platform).

## Prompts / Queue

**How does the Prompt Queue work?**

1. Enable the queue in Settings → Features → Prompts → Queue
2. Open the queue overlay (`Alt+J`, Mac: `Option+J`)
3. Add prompts one by one or batch-import a list
4. Start the queue — Ophel will automatically send each prompt after the AI finishes responding

**The queue is not sending the next prompt.**

Ophel waits until the AI page looks idle (no generation spinner) for 2 consecutive polling intervals (~2 seconds). If the AI page uses an unusual loading indicator that Ophel cannot detect, the queue may stall. Click the manual "Send next" button in the queue overlay as a workaround.

## Claude

**What are Session Keys?**

A Claude session key is an authentication token from your browser session on claude.ai. By adding multiple keys (from different accounts), you can rotate between accounts when one hits its usage limit. Ophel intercepts outgoing requests and swaps in the active key.

**Is it safe to store session keys in Ophel?**

Keys are stored locally in `chrome.storage.local` on your machine. They are not uploaded anywhere by Ophel. WebDAV backup can optionally include session keys — be careful when sharing backup files.

## Permissions

**Why does Ophel ask for `<all_urls>`?**

This permission is only needed for the watermark-removal feature (fetching and converting images to base64). It is optional — if you do not use that feature, you can deny or revoke it in Settings → Permissions.

**Can I revoke permissions after granting them?**

Yes. Go to Settings → Permissions and click **Revoke** next to any permission.

## Privacy

**Does Ophel send my conversation data anywhere?**

No. Ophel runs entirely in your browser. Conversation data, prompts, and settings stay on your device (or your own WebDAV server if you configure sync). See the [Privacy page](./privacy) for details.

## Other

**How do I reset everything to defaults?**

Settings → Backup & Sync → **Clear all data**. This removes all Ophel data including prompts, conversations metadata, folders, and settings.

**Something is broken and restarting did not help.**

1. Check if the issue reproduces in a fresh incognito window with only Ophel enabled
2. Check the browser DevTools console for errors (right-click → Inspect → Console)
3. Report the issue on the GitHub issues page with browser version, extension version, and the console output
