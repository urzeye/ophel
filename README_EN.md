# Ophel

<p align="center">
  <img src="./assets/icon.png" width="120" height="120" alt="Ophel Logo">
</p>

<p align="center">
  <strong>✨ AI's Benefit, Within Reach ✨</strong><br/>
  <em>AI 之益，触手可及</em>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg" alt="License"></a>
  <img src="https://img.shields.io/github/package-json/v/urzeye/ophel?color=blue" alt="Version">
  <a href="https://github.com/urzeye/ophel/stargazers"><img src="https://img.shields.io/github/stars/urzeye/ophel?style=social" alt="Stars"></a>
  <a href="https://opencollective.com/urzeye-oss"><img src="https://img.shields.io/badge/Sponsor-Open%20Collective-blue?logo=opencollective" alt="Sponsor"></a>
</p>

<p align="center">
  🌐 <strong>English</strong> | <a href="./README.md">简体中文</a>
</p>

---

👋 **Ophel** is a browser extension that enhances your AI experience across **Gemini**, **ChatGPT**, **Claude**, **Grok**, and **AI Studio**.

## 📹 Demo

|                                                          Outline                                                           |                                                       Conversations                                                        |                                                          Features                                                          |
| :------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------: |
| <video src="https://github.com/user-attachments/assets/a40eb655-295e-4f9c-b432-9313c9242c9d" width="280" controls></video> | <video src="https://github.com/user-attachments/assets/a249baeb-2e82-4677-847c-2ff584c3f56b" width="280" controls></video> | <video src="https://github.com/user-attachments/assets/4f0628cc-32f2-4b1a-97a3-0188013bd3c0" width="280" controls></video> |

## ✨ Core Features

- 🧠 **Smart Outline** — Auto-parse user queries & AI responses into navigable structure
- 💬 **Conversation Manager** — Folders, tags, search, batch operations
- ⌨️ **Prompt Library** — Variables, Markdown preview, categories, one-click insert
- 🎨 **Theme Customization** — 20+ dark/light themes, custom CSS
- 🔧 **UI Optimization** — Widescreen mode, page & bubble width control, sidebar layout
- 📖 **Reading Experience** — Scroll lock, reading history restore, Markdown fixes
- ⚡ **Productivity Tools** — Shortcuts, model lock, tab auto-rename, notifications
- 🎭 **Claude Enhancement** — Session Key management, multi-account switching
- 🔒 **Privacy First** — Local storage, WebDAV sync, no data collection

## 🚀 Quick Start

> [!note]
> **We highly recommend using the Browser Extension version** for a more complete feature set, better experience, and higher compatibility. The Userscript version has limitations (e.g., cannot read cookies, no independent popup).

### Web Store

[Chrome](https://chromewebstore.google.com/detail/ophel-ai-%E5%AF%B9%E8%AF%9D%E5%A2%9E%E5%BC%BA%E5%B7%A5%E5%85%B7/lpcohdfbomkgepfladogodgeoppclakd) | [Firefox](https://addons.mozilla.org/zh-CN/firefox/addon/ophel-ai-chat-enhancer) | [Greasy Fork](https://greasyfork.org/zh-CN/scripts/563646-ophel)

### Manual Installation

#### Browser Extension

1. Download & unzip from [Releases](https://github.com/urzeye/ophel/releases)
2. Open browser extensions page, enable **Developer mode**
3. Click **Load unpacked** and select the unzipped folder

#### Userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Download `.user.js` file from [Releases](https://github.com/urzeye/ophel/releases)
3. Drag into browser or click the link to install

### Local Build

<details>
<summary>Click to expand build steps</summary>

**Requirements**: Node.js >= 20.x, pnpm >= 10.x

```bash
git clone https://github.com/urzeye/ophel.git
cd ophel
pnpm install
pnpm dev              # Development mode
pnpm build            # Chrome/Edge production build
pnpm build:firefox    # Firefox production build
pnpm build:userscript # Userscript production build
```

**Tech Stack**: [Plasmo](https://docs.plasmo.com/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Zustand](https://github.com/pmndrs/zustand)

</details>

### Bug Report

For issues or suggestions, please visit [GitHub Issues](https://github.com/urzeye/ophel/issues).

## ⭐ Star History

<a href="https://star-history.com/#urzeye/ophel&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date" />
 </picture>
</a>

## 💖 Support

<p align="center">
  <em>"If you want to go fast, go alone. If you want to go far, go together."</em>
</p>

<p align="center">
  If Ophel helps you, consider supporting:<br/><br/>
  <a href="https://opencollective.com/urzeye-oss">
    <img src="https://opencollective.com/urzeye-oss/donate/button@2x.png?color=blue" width="200" alt="Donate to Open Collective">
  </a>
</p>

<p align="center">
  Made with ❤️ by <a href="https://github.com/urzeye">urzeye</a>
</p>

## 📜 License

This project is licensed under **CC BY-NC-SA 4.0**. See [LICENSE](./LICENSE) for details.

> ⚠️ **Commercial packaging, resale, or unauthorized integration is prohibited.** For commercial licensing: **<igodu.love@gmail.com>**
