---
layout: home

hero:
  name: Ophel
  text: AI Conversation Enhancement
  tagline: A unified enhancement workspace covering outlines, conversations, prompts, search, themes, shortcuts, backup, and sync
  image:
    src: /logo.png
    alt: Ophel
  actions:
    - theme: brand
      text: Get Started →
      link: /en/guide/getting-started
    - theme: alt
      text: Features
      link: /en/guide/features/
    - theme: alt
      text: GitHub
      link: https://github.com/urzeye/ophel

features:
  - icon: "📑"
    title: "Live Outline Navigation"
    details: "Continuously parses conversation structure and updates navigation with locate, follow modes, and bookmarks."
    link: "/en/guide/features/outline"
    linkText: "Learn More"
  - icon: "💬"
    title: "Conversation Management"
    details: "Organize folders, tags, pinning, filters, and batch actions for efficient multi-conversation maintenance."
    link: "/en/guide/features/conversation"
    linkText: "Learn More"
  - icon: "✍️"
    title: "Prompt Library"
    details: "Complete prompt workflow with categories, variable templates, pinning, import/export, and double-click send."
    link: "/en/guide/features/prompt"
    linkText: "Learn More"
  - icon: "🔎"
    title: "Global Search"
    details: "Use Ctrl/Cmd + K or double Shift to search outline, conversations, prompts, and settings in one place."
    link: "/en/guide/enhancements"
    linkText: "Learn More"
  - icon: "🏷️"
    title: "Tab Management & Notifications"
    details: "Includes auto rename, completion notifications, auto focus, and privacy mode for better parallel-tab control."
    link: "/en/guide/enhancements"
    linkText: "Learn More"
  - icon: "🕘"
    title: "Reading History Restore"
    details: "Records reading position per conversation and restores it automatically with configurable retention cleanup."
    link: "/en/guide/enhancements"
    linkText: "Learn More"
  - icon: "📤"
    title: "Conversation Export"
    details: "Export single conversations to JSON, Markdown, or TXT with configurable naming and content options."
    link: "/en/guide/enhancements"
    linkText: "Learn More"
  - icon: "🧪"
    title: "Content Interaction Enhancements"
    details: "Enhances user-query Markdown rendering and adds quick copy for LaTeX formulas and Markdown tables."
    link: "/en/guide/enhancements"
    linkText: "Learn More"
  - icon: "🧰"
    title: "Quick Buttons & Toolbox"
    details: "Provides configurable quick-entry and toolbox actions with ordering and visibility controls."
    link: "/en/guide/enhancements"
    linkText: "Learn More"
  - icon: "⌨️"
    title: "Shortcut System"
    details: "Supports multi-action key bindings with conflict detection for personalized high-frequency workflows."
    link: "/en/guide/shortcuts"
    linkText: "Learn More"
  - icon: "🖥️"
    title: "Immersive Layout Controls"
    details: "Supports wide/full layout and content-width tuning for long-context reading continuity."
    link: "/en/guide/enhancements"
    linkText: "Learn More"
  - icon: "🔐"
    title: "Scroll Lock"
    details: "Locks reading position during generation to prevent auto-jump-to-bottom interruptions."
    link: "/en/guide/enhancements"
    linkText: "Learn More"
  - icon: "🎨"
    title: "Preset Theme System"
    details: "Built-in 24 presets with light/dark/system modes plus custom CSS layering."
    link: "/en/guide/appearance"
    linkText: "Learn More"
  - icon: "🤖"
    title: "Model Lock"
    details: "Per-site model keyword locking automatically switches to your target model on page entry."
    link: "/en/guide/enhancements"
    linkText: "Learn More"
  - icon: "🧩"
    title: "Markdown Rendering Fixes"
    details: "Compatibility fixes for common markdown rendering issues on Gemini, ChatGPT, and AI Studio."
    link: "/en/guide/enhancements"
    linkText: "Learn More"
  - icon: "🔑"
    title: "Claude Session Key Management"
    details: "Import, validate, switch, and manage Session Keys for reliable multi-account rotation."
    link: "/en/guide/enhancements"
    linkText: "Learn More"
  - icon: "🖼️"
    title: "Banana Watermark Removal"
    details: "Provides image watermark removal to improve usability and downstream reuse of generated images."
    link: "/en/guide/enhancements"
    linkText: "Learn More"
  - icon: "☁️"
    title: "Data Sync & Privacy Controls"
    details: "WebDAV backup/restore, on-demand permissions, local-first storage, and privacy mode controls."
    link: "/en/guide/privacy"
    linkText: "Learn More"
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #4285f4 30%, #ea4335);
  --vp-home-hero-image-background-image: linear-gradient(-45deg, #4285f4 50%, #ea4335 50%);
  --vp-home-hero-image-filter: blur(44px);
}

.VPHome .VPHero {
  padding-top: calc(var(--vp-nav-height) + var(--vp-layout-top-height, 0px) + 14px) !important;
  padding-bottom: 10px !important;
}

.VPHome .VPHero .name,
.VPHome .VPHero .text {
  max-width: none !important;
  line-height: 1.08 !important;
  font-size: clamp(32px, 3.4vw, 44px) !important;
}

.VPHome .VPHero .tagline {
  max-width: 960px !important;
  padding-top: 8px !important;
  line-height: 1.4 !important;
  font-size: clamp(15px, 1.05vw, 17px) !important;
}

.VPHome .VPHero .actions {
  margin: -4px !important;
  padding-top: 8px !important;
}

.VPHome .VPHero .action {
  padding: 4px !important;
}

@media (min-width: 960px) {
  .VPHome .VPHero .image {
    display: none !important;
  }

  .VPHome .VPHero .main,
  .VPHome .VPHero.has-image .main {
    width: 100% !important;
    max-width: none !important;
  }

  .VPHome .VPHero.has-image .container {
    text-align: left !important;
  }
}

.VPHome .VPHomeFeatures {
  padding-top: 8px !important;
  padding-bottom: 0 !important;
}

.VPHome .VPFeatures .container {
  max-width: 1440px !important;
}

.VPHome .VPFeatures .items {
  display: grid !important;
  margin: 0 !important;
  gap: 12px !important;
  align-items: stretch;
}

.VPHome .VPFeatures .item {
  width: auto !important;
  min-width: 0;
  padding: 0 !important;
}

.VPHome .VPFeature {
  height: 100% !important;
  border-radius: 14px !important;
}

.VPHome .VPFeature .box {
  height: 100% !important;
  padding: 16px 16px 14px !important;
  border: 1px solid var(--vp-c-divider) !important;
}

.VPHome .VPFeature .icon {
  width: 38px !important;
  height: 38px !important;
  margin-bottom: 10px !important;
  font-size: 22px !important;
}

.VPHome .VPFeature .title {
  margin: 0 !important;
  line-height: 1.22 !important;
  font-size: 16px !important;
  font-weight: 600;
  white-space: normal;
}

.VPHome .VPFeature .details {
  display: -webkit-box;
  overflow: hidden;
  padding-top: 8px !important;
  line-height: 1.36 !important;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  font-size: 13px !important;
  color: var(--vp-c-text-2);
}

.VPHome .VPFeature .link-text {
  margin-top: 8px !important;
  font-size: 12px !important;
}

@media (min-width: 1400px) {
  .VPHome .VPFeatures .items {
    grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
    grid-template-rows: repeat(3, minmax(0, 1fr)) !important;
    height: clamp(500px, calc(100svh - 280px), 660px);
  }
}

@media (min-width: 1100px) and (max-width: 1399px) {
  .VPHome .VPFeatures .items {
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
    grid-template-rows: repeat(4, minmax(0, 1fr)) !important;
    height: clamp(560px, calc(100svh - 260px), 760px);
  }

  .VPHome .VPFeature .title {
    font-size: 15px !important;
  }
}

@media (min-width: 760px) and (max-width: 1099px) {
  .VPHome .VPFeatures .items {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    grid-template-rows: repeat(6, minmax(0, 1fr)) !important;
    height: auto;
  }
}

@media (max-width: 759px) {
  .VPHome .VPFeatures .items {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    grid-template-rows: auto !important;
    height: auto;
  }

  .VPHome .VPFeature .title {
    font-size: 15px !important;
  }

  .VPHome .VPFeature .details {
    -webkit-line-clamp: 3;
  }
}
</style>
