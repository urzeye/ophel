# Quick Start

Ophel is a browser extension that adds a powerful side panel to your favorite AI chat platforms. It gives you outline navigation, conversation organization, a prompt library, and many quality-of-life features — all without leaving the page.

## Supported Platforms

Ophel works on 15 AI platforms:

| Platform              | URL                    |
| --------------------- | ---------------------- |
| **Gemini**            | gemini.google.com      |
| **Gemini Enterprise** | business.gemini.google |
| **AI Studio**         | aistudio.google.com    |
| **ChatGPT**           | chatgpt.com            |
| **Claude**            | claude.ai              |
| **Grok**              | grok.com               |
| **DeepSeek**          | chat.deepseek.com      |
| **Doubao**            | doubao.com       |
| **Kimi**              | kimi.moonshot.cn       |
| **Qwen Studio**       | chat.qwen.ai           |
| **Qianwen**           | tongyi.aliyun.com      |
| **Yuanbao**           | yuanbao.tencent.com    |
| **Z.ai**              | chat.z.ai              |
| **ChatGLM**           | chatglm.cn             |
| **ima**               | ima.qq.com             |

## Installation

### Chrome / Edge (Manual)

1. Go to [GitHub Releases](https://github.com/urzeye/ophel/releases) and download the latest `ophel-vX.X.X-chrome.zip`
2. Unzip it to a folder on your computer
3. Open the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
4. Enable **Developer mode** (top right toggle)
5. Click **Load unpacked** and select the unzipped folder

### Firefox (Manual)

1. Download `ophel-vX.X.X-firefox.zip` from [GitHub Releases](https://github.com/urzeye/ophel/releases)
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select the downloaded zip file

::: warning
Firefox temporary add-ons are removed when you restart the browser. You'll need to reload after each restart.
:::

## First Look

After installing, open any supported AI site. Ophel activates automatically.

**The right side of the page** now has Ophel's panel. By default it shows the **Outline** tab. You'll also see a small group of floating buttons on the side of the screen.

Here's what each part does at a glance:

| Element                            | What it does                                                              |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Side panel                         | Shows outline, conversations, or prompts depending on which tab is active |
| Floating buttons                   | Quick access to scroll, toggle panel, switch theme, open global search    |
| Toolbox (☰ icon in floating group) | Export, move to folder, set tags, toggle scroll lock, model lock          |

## Basic Navigation

- **Switch tabs** in the panel using the tab bar at the top, or shortcuts `Alt+1`, `Alt+2`, `Alt+3`
- **Toggle the panel** with `Alt+P` or by clicking the panel button in the floating group
- **Open settings** with `Alt+,` or the settings button in the toolbox
- **Open global search** with `Ctrl/Cmd+K` (configurable) or by double-pressing `Shift`
- **Switch themes** with `Alt+D`

## Ghost Pass-Through

If the panel ever gets in the way of content you want to click, hold **Ctrl** (Windows/Linux) or **Command** (Mac). After about 0.2 seconds the entire panel becomes transparent and click-through. You can then interact with the AI page behind it. Release the key and the panel returns to normal.

## Edge Snap

When you drag the panel close to the screen edge, it can snap and hide there. Hovering over the edge reveals it again (peek mode). This is useful on smaller screens. Enable it in **Settings → General → Panel → Edge Snap**.

## What's Next

- [Smart Outline](./features/outline) — Navigate long AI responses
- [Conversation Manager](./features/conversation) — Organize your chat history
- [Prompt Library](./features/prompt) — Save and reuse your prompts
- [Enhancements Overview](./enhancements) — All features at a glance
- [Shortcuts](./shortcuts) — Keyboard shortcuts list
- [Appearance](./appearance) — Themes and custom CSS
- [FAQ](./faq) — Common questions
