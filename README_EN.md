# Ophel

<p align="center">
  <img src="./assets/icon.png" width="120" height="120" alt="Ophel Logo">
</p>

<p align="center">
  <strong>✨ AI 之益，触手可及 ✨</strong><br/>
  <em>AI's Benefit, Within Reach.</em>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg" alt="License"></a>
  <img src="https://img.shields.io/github/package-json/v/urzeye/ophel?color=blue" alt="Version">
  <a href="https://github.com/urzeye/ophel/stargazers"><img src="https://img.shields.io/github/stars/urzeye/ophel?style=social" alt="Stars"></a>
</p>

<p align="center">
  🌐 <strong>English</strong> | <a href="./README.md">简体中文</a>
</p>

---

👋 **Ophel** is a powerful browser extension designed to provide a smoother and more efficient AI interaction experience. It deeply integrates with major AI platforms like **Gemini**, **AI Studio**, **ChatGPT**, **Grok**, and **Claude**, offering unified outline navigation, conversation management, prompt assistants, and ultimate personalization features.

## ✨ Core Features

### 1. 🧠 Smart Outline

- **Multi-Level Navigation**: Automatically parses user questions and H1-H6 headings to generate a clear conversation structure.
- **Smart Filtering**:
  - **User View**: Toggle to show only user questions to quickly review the conversation flow.
  - **One-Click Copy**: Right-click or click on a node to copy the original user question.
- **Smart Following**:
  - **Current Position**: Automatically highlights the current reading section while scrolling.
  - **Smart Jump**: Click outline items to instantly and smoothly scroll to the content.
  - **Latest Message**: Automatically locks to the bottom during generation.
- **Deep Integration**:
  - Supports Shadow DOM content parsing (perfect for Gemini Enterprise).
  - Renders User Query Markdown for better readability in the outline.

### 2. 💬 Conversation Manager

- **Enhanced Sidebar**: Infinite scroll for history, real-time title search.
- **Organization**:
  - **Tags System**: Add custom tags to conversations for flexible management.
  - **Colorful Folders** (Gemini): Use colored folders to organize different types of conversations.
- **Data Export**:
  - **Multi-Format**: Export a single conversation as **Markdown**, **JSON**, or **TXT**.
  - **Batch Operations**: Bulk selection for management.
- **Sync Optimization**: Supports WebDAV sync while maintaining pin status.

### 3. ⌨️ Prompt Assistant

- **Advanced Features**:
  - **Variables**: Support defining `{{topic}}` variables with auto-popup for filling values.
  - **Markdown Preview**: Real-time preview of how the prompt renders.
  - **Category Management**: Custom categories with auto-assigned colors.
- **Data Management**:
  - **Quick Access**: Pin favorite prompts and view recent history.
  - **Data Migration**: Independent Import/Export features (JSON).

### 4. 🛠️ UX Enhancements

- **Claude Integration**:
  - **Session Key Management**: One-click Session Key switching with multi-account polling support.

- **Interface Customization**:
  - **Widescreen Mode**: Custom maximum page width (supports % and px sets).
  - **Bubble Adjustment**: Independently set the width of user query bubbles.
  - **Sidebar Layout**: Auto-collapse distractions like navbar on AI Studio.
- **Reading Aids**:
  - **Scroll Lock**: Prevents the page from jumping during generation.
  - **Reading History**: Automatically saves and restores the last reading position.
  - **Markdown Optimization**: Fixes Gemini rendering issues and renders user input Markdown in real-time.
- **Content Interaction**:
  - **Formula Copy**: Double-click LaTeX formulas to copy directly.
  - **Table Conversion**: One-click copy tables as Markdown.
  - **Watermark Removal**: Automatically removes invisible watermarks from Gemini/AI Studio images.
- **Model Locker**: Automatically locks default models for all platforms.
- **Tab Management**:
  - **Auto-Rename**: Renames tabs based on conversation content.
  - **Privacy Mode**: One-click obfuscation of page titles to protect privacy.
  - **Notifications**: Desktop notifications or sound alerts when AI responses are complete.
- **Custom Shortcuts**: Customizable keyboard shortcuts, compatible with Windows/macOS.

### 5. 🎨 Appearance

- **Themes**: Built-in curated dark/light themes.
- **Smart Switch**: Follows system settings or manual toggling.
- **Custom CSS**: Built-in code highlighting editor to write and save custom CSS styles.

### 6. 🔒 Data & Privacy

- **Local-First**: All configurations and data are stored locally by default.
- **Permissions Management**: Dedicated permissions panel, request only when needed, protecting privacy.
- **Multi-Device Sync**: Supports **WebDAV** backup (including sensitive data like Claude Session Keys, fully under your control).
- **Full Backup**: Full export or modular export (e.g., just Prompts, just Settings).

## 📹 Demo

> 🚧 **Recording in progress...**

| Outline | Conversations | Features |
|:---:|:---:|:---:|
| Coming Soon | Coming Soon | Coming Soon |

## 📦 Installation

### Web Store

🚧 **Under Review...**

- [Chrome Web Store](#) (Coming Soon)
- [Edge Add-ons](#) (Coming Soon)

### Manual Installation

1. Go to the [Releases](https://github.com/urzeye/ophel/releases) page and download the latest package (`ophel-vX.Y.Z.zip`).
2. Unzip the file to a local folder.
3. Open your browser's extensions management page (Chrome: `chrome://extensions`, Edge: `edge://extensions`).
4. Enable **"Developer mode"** in the top right corner.
5. Click **"Load unpacked"**, and select the folder you just unzipped.

## 🐛 Bug Report

If you have any issues or suggestions, please report them on [GitHub Issues](https://github.com/urzeye/ophel/issues).

## 🛠️ Tech Stack

This project is built with a modern frontend tech stack:

- **Core**: [Plasmo](https://docs.plasmo.com/) (Browser Extension Framework)
- **UI**: [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **State**: [Zustand](https://github.com/pmndrs/zustand)
- **Build**: [Vite](https://vitejs.dev/)

## ⭐ Star History

<a href="https://star-history.com/#urzeye/ophel&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date" />
 </picture>
</a>

## 📜 License

This project is licensed under the **CC BY-NC-SA 4.0** (Attribution-NonCommercial-ShareAlike 4.0 International) license.
See the [LICENSE](./LICENSE) file for details.

> ⚠️ **Commercial packaging, resale, or unauthorized integration is strictly prohibited.**
> For commercial licensing, please contact: **<igodu.love@gmail.com>**

---

<p align="center">
  <em>"If you want to go fast, go alone. If you want to go far, go together."</em>
</p>

<p align="center">
  Made with ❤️ by <a href="https://github.com/urzeye">urzeye</a>
</p>
