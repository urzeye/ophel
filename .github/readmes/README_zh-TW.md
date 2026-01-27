# Ophel 🚀

<p align="center">
  <img src="../../assets/icon.png" width="120" height="120" alt="Ophel Logo">
</p>

<p align="center">
  <strong>✨ AI 之益，觸手可及 ✨</strong><br/>
  <em>AI's Benefit, Within Reach.</em>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg" alt="License"></a>
  <img src="https://img.shields.io/github/package-json/v/urzeye/ophel?color=blue" alt="Version">
  <a href="https://github.com/urzeye/ophel/stargazers"><img src="https://img.shields.io/github/stars/urzeye/ophel?style=social" alt="Stars"></a>
  <a href="https://opencollective.com/urzeye-oss"><img src="https://img.shields.io/badge/Sponsor-Open%20Collective-blue?logo=opencollective" alt="Sponsor"></a>
</p>

<p align="center">
  <a href="#-功能展示">功能展示</a> •
  <a href="#-核心功能">核心功能</a> •
  <a href="#%EF%B8%8F-技術架構">技術架構</a> •
  <a href="#-快速開始">快速開始</a> •
  <a href="#-支持專案">支持專案</a>
</p>

<p align="center">
  🌐 <a href="../../README_EN.md">English</a> | <a href="../../README.md">简体中文</a> | <strong>繁體中文</strong> | <a href="./README_ja.md">日本語</a> | <a href="./README_ko.md">한국어</a> | <a href="./README_de.md">Deutsch</a> | <a href="./README_fr.md">Français</a> | <a href="./README_es.md">Español</a> | <a href="./README_pt.md">Português</a> | <a href="./README_ru.md">Русский</a>
</p>

---

👋 **Ophel** 是一款同時支持 **瀏覽器擴充功能** 和 **油猴腳本** 的 AI 聊天頁面增強工具，為 **Gemini**、**ChatGPT**、**Claude**、**Grok**、**AI Studio** 等主流 AI 平台提供統一的互動體驗。

## 📹 功能展示

|                                                          Outline                                                           |                                                       Conversations                                                        |                                                          Features                                                          |
| :------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------: |
| <video src="https://github.com/user-attachments/assets/a40eb655-295e-4f9c-b432-9313c9242c9d" width="280" controls></video> | <video src="https://github.com/user-attachments/assets/a249baeb-2e82-4677-847c-2ff584c3f56b" width="280" controls></video> | <video src="https://github.com/user-attachments/assets/6dfca20d-2f88-4844-b3bb-c48321100ff4" width="280" controls></video> |

## ✨ 核心功能

- 🧠 **智慧大綱** — 自動解析使用者問題與 AI 回覆，產生可導航的目錄結構
- 💬 **會話管理** — 資料夾分類、標籤、搜尋、批次操作
- ⌨️ **提示詞庫** — 變數支援、Markdown 預覽、分類管理、一鍵填充
- 🎨 **主題自訂** — 20+ 深色/淺色主題，自訂 CSS
- 🔧 **介面最佳化** — 寬螢幕模式、頁面與使用者問題寬度調整、側邊欄版面配置控制
- 📖 **閱讀體驗** — 捲動鎖定、閱讀記錄還原、Markdown 渲染最佳化
- ⚡ **效率工具** — 快速鍵、模型鎖定、標籤頁自動重新命名、完成通知
- 🎭 **Claude 增強** — Session Key 管理、多帳號切換
- 🔒 **隱私優先** — 本地儲存、WebDAV 同步、無資料收集

## 🏗️ 技術架構

**技術棧**：[Plasmo](https://docs.plasmo.com/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Zustand](https://github.com/pmndrs/zustand)

<details>
<summary>📐 架構圖（點擊展開）</summary>

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#6366f1', 'primaryTextColor': '#fff', 'primaryBorderColor': '#4f46e5', 'lineColor': '#94a3b8', 'secondaryColor': '#f1f5f9', 'tertiaryColor': '#e2e8f0', 'background': '#ffffff'}}}%%
flowchart TB
    subgraph Platforms["🚀 雙平台構建"]
        direction LR
        EXT["🧩 瀏覽器擴充功能<br/><small>Plasmo + Manifest V3</small>"]
        US["🛢️ 油猴指令稿<br/><small>Vite + vite-plugin-monkey</small>"]
    end

    subgraph Entry["📦 入口層"]
        direction LR
        CE["Content Script<br/><small>ui-entry.tsx</small>"]
        BG["Background<br/><small>background.ts</small>"]
        OPT["Options Page<br/><small>tabs/options.tsx</small>"]
        USE["Userscript Entry<br/><small>platform/userscript/entry.tsx</small>"]
    end

    subgraph Adapters["🔌 站點適配器"]
        direction LR
        GEM["Gemini"]
        GPT["ChatGPT"]
        CLA["Claude"]
        GRK["Grok"]
        AIS["AI Studio"]
        GEE["Gemini<br/>Enterprise"]
    end

    subgraph Core["⚙️ 核心模組"]
        direction TB
        TM["🎨 Theme Manager<br/><small>主題切換 · View Transitions</small>"]
        OM["📑 Outline Manager<br/><small>大綱生成 · 導航定位</small>"]
        RH["📖 Reading History<br/><small>閱讀位置恢復</small>"]
        ML["🔒 Model Lock<br/><small>模型鎖定</small>"]
        NM["📡 Network Monitor<br/><small>請求攔截 · 狀態檢測</small>"]
    end

    subgraph State["💾 狀態管理"]
        direction LR
        ZS["Zustand Stores<br/><small>settings · prompts · conversations</small>"]
        CS["Chrome Storage<br/><small>local · sync</small>"]
        GM["GM_* Storage<br/><small>油猴 API</small>"]
    end

    subgraph UI["🎯 UI 組件"]
        direction TB
        APP["App.tsx"]
        MP["MainPanel<br/><small>側邊面板</small>"]
        SM["SettingsModal<br/><small>設定彈窗</small>"]
        TABS["Tabs<br/><small>大綱 · 會話 · 提示詞</small>"]
    end

    subgraph CSS["🎨 樣式系統"]
        direction LR
        SD["Shadow DOM<br/><small>樣式隔離</small>"]
        TV["CSS Variables<br/><small>主題變數</small>"]
        TH["Theme Presets<br/><small>20+ 預設主題</small>"]
    end

    EXT --> CE & BG & OPT
    US --> USE
    CE --> Adapters
    USE --> Adapters
    Adapters --> Core
    Core --> State
    CE --> UI
    USE --> UI
    UI --> CSS
    ZS <--> CS
    ZS <-.-> GM

    classDef platform fill:#818cf8,stroke:#6366f1,color:#fff
    classDef entry fill:#34d399,stroke:#10b981,color:#fff
    classDef adapter fill:#fbbf24,stroke:#f59e0b,color:#1f2937
    classDef core fill:#60a5fa,stroke:#3b82f6,color:#fff
    classDef state fill:#f472b6,stroke:#ec4899,color:#fff
    classDef ui fill:#a78bfa,stroke:#8b5cf6,color:#fff
    classDef css fill:#fb923c,stroke:#f97316,color:#fff

    class EXT,US platform
    class CE,BG,OPT,USE entry
    class GEM,GPT,CLA,GRK,AIS,GEE adapter
    class TM,OM,RH,ML,NM core
    class ZS,CS,GM state
    class APP,MP,SM,TABS ui
    class SD,TV,TH css
```

</details>

## 🚀 快速開始

> [!tip]
>
> **推薦使用瀏覽器擴充功能（Extension）版本**，功能更全、體驗更佳、相容性更好。油猴指令碼（Userscript）版本功能受限（如無法讀取 Cookie、無獨立彈出視窗等）。

### 應用程式商店

[Chrome](https://chromewebstore.google.com/detail/ophel-ai-%E5%AF%B9%E8%AF%9D%E5%A2%9E%E5%BC%BA%E5%B7%A5%E5%85%B7/lpcohdfbomkgepfladogodgeoppclakd) | [Firefox](https://addons.mozilla.org/zh-CN/firefox/addon/ophel-ai-chat-enhancer) | [Greasy Fork](https://greasyfork.org/zh-CN/scripts/563646-ophel)

### 手動安裝

#### 瀏覽器擴充功能

1. 從 [Releases](https://github.com/urzeye/ophel/releases) 下載並解壓縮安裝套件
2. 開啟瀏覽器擴充功能管理頁面，開啟 **開發人員模式**
3. 點擊 **載入未封裝擴充功能**，選擇解壓縮的資料夾

#### 油猴指令碼

1. 安裝 [Tampermonkey](https://www.tampermonkey.net/) 外掛程式
2. 從 [Releases](https://github.com/urzeye/ophel/releases) 下載 `.user.js` 檔案
3. 拖入瀏覽器或點擊連結即可安裝

### 本地構建

<details>
<summary>點擊展開構建步驟</summary>

**環境要求**：Node.js >= 20.x, pnpm >= 9.x

```bash
git clone https://github.com/urzeye/ophel.git
cd ophel
pnpm install
pnpm dev              # 開發模式
pnpm build            # Chrome/Edge 生產構建
pnpm build:firefox    # Firefox 生產構建
pnpm build:userscript # 油猴指令碼生產構建
```

**技術棧**：[Plasmo](https://docs.plasmo.com/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Zustand](https://github.com/pmndrs/zustand)

</details>

### 🐛 問題回報

如有問題或建議，歡迎在 [GitHub Issues](https://github.com/urzeye/ophel/issues) 回報。

## ⭐ Star History

<a href="https://star-history.com/#urzeye/ophel&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date" />
 </picture>
</a>

## 💖 支持專案

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

## 📜 授權條款

This project is licensed under **CC BY-NC-SA 4.0**. See [LICENSE](../../LICENSE) for details.

> ⚠️ **Commercial packaging, resale, or unauthorized integration is prohibited.** For commercial licensing: **<igodu.love@gmail.com>**
