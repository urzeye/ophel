# Ophel 🚀

<p align="center">
  <img src="../../assets/icon.png" width="120" height="120" alt="Ophel Logo">
</p>

<p align="center">
  <strong>✨ AIの恵みを、手元に ✨</strong><br/>
  <em>AI's Benefit, Within Reach.</em>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg" alt="License"></a>
  <img src="https://img.shields.io/github/package-json/v/urzeye/ophel?color=blue" alt="Version">
  <a href="https://github.com/urzeye/ophel/stargazers"><img src="https://img.shields.io/github/stars/urzeye/ophel?style=social" alt="Stars"></a>
  <a href="https://opencollective.com/urzeye-oss"><img src="https://img.shields.io/badge/Sponsor-Open%20Collective-blue?logo=opencollective" alt="Sponsor"></a>
</p>

<p align="center">
  <a href="#-デモ">デモ</a> •
  <a href="#-主な機能">主な機能</a> •
  <a href="#%EF%B8%8F-技術アーキテクチャ">技術アーキテクチャ</a> •
  <a href="#-今すぐ始める">今すぐ始める</a> •
  <a href="#-プロジェクトを支援">プロジェクトを支援</a>
</p>

<p align="center">
  🌐 <a href="../../README_EN.md">English</a> | <a href="../../README.md">简体中文</a> | <a href="./README_zh-TW.md">繁體中文</a> | <strong>日本語</strong> | <a href="./README_ko.md">한국어</a> | <a href="./README_de.md">Deutsch</a> | <a href="./README_fr.md">Français</a> | <a href="./README_es.md">Español</a> | <a href="./README_pt.md">Português</a> | <a href="./README_ru.md">Русский</a>
</p>

---

👋 **Ophel** は、**ブラウザ拡張機能**と**ユーザースクリプト**の両方をサポートする AI チャットページ強化ツールであり、**Gemini**、**ChatGPT**、**Claude**、**Grok**、**AI Studio** などの主要な AI プラットフォームに統一されたインタラクティブな体験を提供します。

## 📹 デモ

|                                                          Outline                                                           |                                                       Conversations                                                        |                                                          Features                                                          |
| :------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------: |
| <video src="https://github.com/user-attachments/assets/a40eb655-295e-4f9c-b432-9313c9242c9d" width="280" controls></video> | <video src="https://github.com/user-attachments/assets/a249baeb-2e82-4677-847c-2ff584c3f56b" width="280" controls></video> | <video src="https://github.com/user-attachments/assets/6dfca20d-2f88-4844-b3bb-c48321100ff4" width="280" controls></video> |

## ✨ 主な機能

- 🧠 **スマートアウトライン** — ユーザーの質問と AI の回答を自動解析し、ナビゲーション可能な目次を生成
- 💬 **会話管理** — フォルダ分類、タグ付け、検索、一括操作
- ⌨️ **プロンプトライブラリ** — 変数サポート、Markdown プレビュー、分類管理、ワンクリック入力
- 🎨 **テーマカスタマイズ** — 20種類以上のダーク/ライトテーマ、カスタムCSS
- 🔧 **インターフェース最適化** — ワイドスクリーンモード、ページと質問幅の調整、サイドバーレイアウト制御
- 📖 **読書体験** — スクロールロック、読書履歴の復元、Markdown レンダリングの最適化
- ⚡ **効率化ツール** — ショートカットキー、モデルロック、タブ自動リネーム、完了通知
- 🎭 **Claude 拡張** — Session Key 管理、マルチアカウント切り替え
- 🔒 **プライバシー優先** — ローカルストレージ、WebDAV 同期、データ収集なし

## 🏗️ 技術アーキテクチャ

**技術スタック**：[Plasmo](https://docs.plasmo.com/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Zustand](https://github.com/pmndrs/zustand)

<details>
<summary>📐 アーキテクチャ図（クリックして展開）</summary>

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#6366f1', 'primaryTextColor': '#fff', 'primaryBorderColor': '#4f46e5', 'lineColor': '#94a3b8', 'secondaryColor': '#f1f5f9', 'tertiaryColor': '#e2e8f0', 'background': '#ffffff'}}}%%
flowchart TB
    subgraph Platforms["🚀 デュアルプラットフォームビルド"]
        direction LR
        EXT["🧩 ブラウザ拡張機能<br/><small>Plasmo + Manifest V3</small>"]
        US["🛢️ ユーザースクリプト<br/><small>Vite + vite-plugin-monkey</small>"]
    end

    subgraph Entry["📦 エントリーレイヤー"]
        direction LR
        CE["Content Script<br/><small>ui-entry.tsx</small>"]
        BG["Background<br/><small>background.ts</small>"]
        OPT["Options Page<br/><small>tabs/options.tsx</small>"]
        USE["Userscript Entry<br/><small>platform/userscript/entry.tsx</small>"]
    end

    subgraph Adapters["🔌 サイトアダプター"]
        direction LR
        GEM["Gemini"]
        GPT["ChatGPT"]
        CLA["Claude"]
        GRK["Grok"]
        AIS["AI Studio"]
        GEE["Gemini<br/>Enterprise"]
    end

    subgraph Core["⚙️ コアモジュール"]
        direction TB
        TM["🎨 Theme Manager<br/><small>テーマ切り替え · View Transitions</small>"]
        OM["📑 Outline Manager<br/><small>アウトライン生成 · ナビゲーション</small>"]
        RH["📖 Reading History<br/><small>読書位置の復元</small>"]
        ML["🔒 Model Lock<br/><small>モデルロック</small>"]
        NM["📡 Network Monitor<br/><small>リクエストインターセプト · ステータス検出</small>"]
    end

    subgraph State["💾 状態管理"]
        direction LR
        ZS["Zustand Stores<br/><small>settings · prompts · conversations</small>"]
        CS["Chrome Storage<br/><small>local · sync</small>"]
        GM["GM_* Storage<br/><small>ユーザースクリプト API</small>"]
    end

    subgraph UI["🎯 UI コンポーネント"]
        direction TB
        APP["App.tsx"]
        MP["MainPanel<br/><small>サイドパネル</small>"]
        SM["SettingsModal<br/><small>設定ダイアログ</small>"]
        TABS["Tabs<br/><small>アウトライン · 会話 · プロンプト</small>"]
    end

    subgraph CSS["🎨 スタイルシステム"]
        direction LR
        SD["Shadow DOM<br/><small>スタイル分離</small>"]
        TV["CSS Variables<br/><small>テーマ変数</small>"]
        TH["Theme Presets<br/><small>20+ プリセットテーマ</small>"]
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

## 🚀 今すぐ始める

> [!tip]
>
> **ブラウザ拡張機能（Extension）版の使用を推奨します**。機能が充実しており、体験も優れ、互換性も高いです。Tampermonkey（Userscript）版は機能が制限されています（例：Cookieの読み取り不可、独立したポップアップなしなど）。

### アプリストア

[Chrome](https://chromewebstore.google.com/detail/ophel-ai-%E5%AF%B9%E8%AF%9D%E5%A2%9E%E5%BC%BA%E5%B7%A5%E5%85%B7/lpcohdfbomkgepfladogodgeoppclakd) | [Firefox](https://addons.mozilla.org/zh-CN/firefox/addon/ophel-ai-chat-enhancer) | [Greasy Fork](https://greasyfork.org/zh-CN/scripts/563646-ophel)

### 手動インストール

#### ブラウザ拡張機能

1. [Releases](https://github.com/urzeye/ophel/releases) からインストールパッケージをダウンロードして解凍します
2. ブラウザの拡張機能管理ページを開き、**デベロッパーモード**を有効にします
3. **パッケージ化されていない拡張機能を読み込む**をクリックし、解凍したフォルダを選択します

#### Tampermonkey スクリプト

1. [Tampermonkey](https://www.tampermonkey.net/) プラグインをインストールします
2. [Releases](https://github.com/urzeye/ophel/releases) から `.user.js` ファイルをダウンロードします
3. ブラウザにドラッグするか、リンクをクリックしてインストールします

### ローカルビルド

<details>
<summary>Click to expand build steps</summary>

**Requirements**: Node.js >= 20.x, pnpm >= 9.x

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

### 🐛 バグ報告

問題や提案がある場合は、[GitHub Issues](https://github.com/urzeye/ophel/issues) でフィードバックしてください。

## ⭐ Star History

<a href="https://star-history.com/#urzeye/ophel&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date" />
 </picture>
</a>

## 💖 プロジェクトを支援

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

## 📜 ライセンス

This project is licensed under **CC BY-NC-SA 4.0**. See [LICENSE](../../LICENSE) for details.

> ⚠️ **Commercial packaging, resale, or unauthorized integration is prohibited.** For commercial licensing: **<igodu.love@gmail.com>**
