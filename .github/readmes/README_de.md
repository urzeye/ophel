# Ophel 🚀

<p align="center">
  <img src="../../assets/icon.png" width="120" height="120" alt="Ophel Logo">
</p>

<p align="center">
  <strong>✨ KI-Vorteile, zum Greifen nah ✨</strong><br/>
  <em>AI's Benefit, Within Reach.</em>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg" alt="License"></a>
  <img src="https://img.shields.io/github/package-json/v/urzeye/ophel?color=blue" alt="Version">
  <a href="https://github.com/urzeye/ophel/stargazers"><img src="https://img.shields.io/github/stars/urzeye/ophel?style=social" alt="Stars"></a>
  <a href="https://opencollective.com/urzeye-oss"><img src="https://img.shields.io/badge/Sponsor-Open%20Collective-blue?logo=opencollective" alt="Sponsor"></a>
</p>

<p align="center">
  <a href="#-demo">Demo</a> •
  <a href="#-kernfunktionen">Kernfunktionen</a> •
  <a href="#%EF%B8%8F-technische-architektur">Technische Architektur</a> •
  <a href="#-schnellstart">Schnellstart</a> •
  <a href="#-projekt-unterstützen">Projekt unterstützen</a>
</p>

<p align="center">
  🌐 <a href="../../README_EN.md">English</a> | <a href="../../README.md">简体中文</a> | <a href="./README_zh-TW.md">繁體中文</a> | <a href="./README_ja.md">日本語</a> | <a href="./README_ko.md">한국어</a> | <strong>Deutsch</strong> | <a href="./README_fr.md">Français</a> | <a href="./README_es.md">Español</a> | <a href="./README_pt.md">Português</a> | <a href="./README_ru.md">Русский</a>
</p>

---

👋 **Ophel** ist ein Verbesserungstool für KI-Chat-Seiten, das sowohl **Browser-Erweiterungen** als auch **Userscripts** unterstützt und ein einheitliches interaktives Erlebnis für Mainstream-KI-Plattformen wie **Gemini**, **ChatGPT**, **Claude**, **Grok** und **AI Studio** bietet.

## 📹 Demo

|                                                          Outline                                                           |                                                       Conversations                                                        |                                                          Features                                                          |
| :------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------: |
| <video src="https://github.com/user-attachments/assets/a40eb655-295e-4f9c-b432-9313c9242c9d" width="280" controls></video> | <video src="https://github.com/user-attachments/assets/a249baeb-2e82-4677-847c-2ff584c3f56b" width="280" controls></video> | <video src="https://github.com/user-attachments/assets/6dfca20d-2f88-4844-b3bb-c48321100ff4" width="280" controls></video> |

## ✨ Kernfunktionen

- 🧠 **Smart Outline** — Automatische Analyse von Benutzeranfragen und KI-Antworten zur Erstellung einer navigierbaren Inhaltsstruktur
- 💬 **Konversationsmanagement** — Ordnerorganisation, Tags, Suche, Stapelverarbeitung
- ⌨️ **Prompt-Bibliothek** — Variablenunterstützung, Markdown-Vorschau, Kategorienverwaltung, Ein-Klick-Ausfüllen
- 🎨 **Theme-Anpassung** — Über 20 helle/dunkle Themes, eigenes CSS
- 🔧 **Schnittstellenoptimierung** — Breitbildmodus, Breitenanpassung, Seitenleistensteuerung
- 📖 **Leseerlebnis** — Scroll-Sperre, Wiederherstellung des Leseverlaufs, Markdown-Rendering-Optimierung
- ⚡ **Produktivitätswerkzeuge** — Tastaturkürzel, Modellsperre, automatische Tab-Umbenennung, Benachrichtigungen
- 🎭 **Claude-Erweiterung** — Session-Key-Verwaltung, Multi-Account-Wechsel
- 🔒 **Datenschutz first** — Lokale Speicherung, WebDAV-Synchronisierung, keine Datensammlung

## 🏗️ Technische Architektur

**Tech Stack**: [Plasmo](https://docs.plasmo.com/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Zustand](https://github.com/pmndrs/zustand)

<details>
<summary>📐 Architektur-Diagramm (klicken zum Aufklappen)</summary>

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#6366f1', 'primaryTextColor': '#fff', 'primaryBorderColor': '#4f46e5', 'lineColor': '#94a3b8', 'secondaryColor': '#f1f5f9', 'tertiaryColor': '#e2e8f0', 'background': '#ffffff'}}}%%
flowchart TB
    subgraph Platforms["🚀 Dual-Plattform-Build"]
        direction LR
        EXT["🧩 Browser-Erweiterung<br/><small>Plasmo + Manifest V3</small>"]
        US["🛢️ Userscript<br/><small>Vite + vite-plugin-monkey</small>"]
    end

    subgraph Entry["📦 Einstiegsschicht"]
        direction LR
        CE["Content Script<br/><small>ui-entry.tsx</small>"]
        BG["Background<br/><small>background.ts</small>"]
        OPT["Options Page<br/><small>tabs/options.tsx</small>"]
        USE["Userscript Entry<br/><small>platform/userscript/entry.tsx</small>"]
    end

    subgraph Adapters["🔌 Website-Adapter"]
        direction LR
        GEM["Gemini"]
        GPT["ChatGPT"]
        CLA["Claude"]
        GRK["Grok"]
        AIS["AI Studio"]
        GEE["Gemini<br/>Enterprise"]
    end

    subgraph Core["⚙️ Kernmodule"]
        direction TB
        TM["🎨 Theme Manager<br/><small>Theme-Wechsel · View Transitions</small>"]
        OM["📑 Outline Manager<br/><small>Gliederungserstellung · Navigation</small>"]
        RH["📖 Reading History<br/><small>Leseposition wiederherstellen</small>"]
        ML["🔒 Model Lock<br/><small>Modellsperre</small>"]
        NM["📡 Network Monitor<br/><small>Request-Abfangen · Statuserkennung</small>"]
    end

    subgraph State["💾 Zustandsverwaltung"]
        direction LR
        ZS["Zustand Stores<br/><small>settings · prompts · conversations</small>"]
        CS["Chrome Storage<br/><small>local · sync</small>"]
        GM["GM_* Storage<br/><small>Userscript API</small>"]
    end

    subgraph UI["🎯 UI-Komponenten"]
        direction TB
        APP["App.tsx"]
        MP["MainPanel<br/><small>Seitenleiste</small>"]
        SM["SettingsModal<br/><small>Einstellungsdialog</small>"]
        TABS["Tabs<br/><small>Gliederung · Gespräche · Prompts</small>"]
    end

    subgraph CSS["🎨 Styling-System"]
        direction LR
        SD["Shadow DOM<br/><small>Stilisolierung</small>"]
        TV["CSS Variables<br/><small>Theme-Variablen</small>"]
        TH["Theme Presets<br/><small>20+ Preset-Themes</small>"]
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

## 🚀 Schnellstart

> [!tip]
>
> **Es wird empfohlen, die Browsererweiterung (Extension) zu verwenden.** Sie bietet mehr Funktionen, ein besseres Erlebnis und eine bessere Kompatibilität. Die Userscript-Version (Tampermonkey) ist in ihrer Funktionalität eingeschränkt (z. B. kein Zugriff auf Cookies, keine unabhängigen Popups).

### App Stores

[Chrome](https://chromewebstore.google.com/detail/ophel-ai-%E5%AF%B9%E8%AF%9D%E5%A2%9E%E5%BC%BA%E5%B7%A5%E5%85%B7/lpcohdfbomkgepfladogodgeoppclakd) | [Firefox](https://addons.mozilla.org/zh-CN/firefox/addon/ophel-ai-chat-enhancer) | [Greasy Fork](https://greasyfork.org/zh-CN/scripts/563646-ophel)

### Manuelle Installation

#### Browsererweiterung

1. Laden Sie das Installationspaket von [Releases](https://github.com/urzeye/ophel/releases) herunter und entpacken Sie es.
2. Öffnen Sie die Erweiterungsverwaltungsseite Ihres Browsers und aktivieren Sie den **Entwicklermodus**.
3. Klicken Sie auf **Entpackte Erweiterung laden** und wählen Sie den entpackten Ordner aus.

#### Userscript

1. Installieren Sie das [Tampermonkey](https://www.tampermonkey.net/) Plugin.
2. Laden Sie die `.user.js` Datei von [Releases](https://github.com/urzeye/ophel/releases) herunter.
3. Ziehen Sie sie in den Browser oder klicken Sie auf den Link zur Installation.

### Lokaler Build

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

### 🐛 Feedback

Bei Fragen oder Anregungen freuen wir uns über Feedback in den [GitHub Issues](https://github.com/urzeye/ophel/issues).

## ⭐ Star History

<a href="https://star-history.com/#urzeye/ophel&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=urzeye/ophel&type=Date" />
 </picture>
</a>

## 💖 Projekt unterstützen

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

## 📜 Lizenz

This project is licensed under **CC BY-NC-SA 4.0**. See [LICENSE](../../LICENSE) for details.

> ⚠️ **Commercial packaging, resale, or unauthorized integration is prohibited.** For commercial licensing: **<igodu.love@gmail.com>**
