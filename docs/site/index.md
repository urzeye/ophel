---
layout: home

hero:
  name: Ophel
  text: AI Conversation Enhancer
  tagline: Outline navigation, conversation management, prompt library, global search, themes, shortcuts, and backup sync — all in one panel.
  image:
    src: /logo.png
    alt: Ophel
  actions:
    - theme: brand
      text: Get Started →
      link: /en/guide/getting-started
    - theme: alt
      text: English
      link: /en/
    - theme: alt
      text: 中文文档
      link: /zh/
    - theme: alt
      text: GitHub
      link: https://github.com/urzeye/ophel

features:
  - icon: "📑"
    title: "Smart Outline"
    details: "Auto-parses conversation headings and your questions into a navigable tree. Click to jump. Scroll to follow. Bookmark your favorite sections."
    link: "/en/guide/features/outline"
    linkText: "Learn more"
  - icon: "💬"
    title: "Conversation Manager"
    details: "Folders, tags, pins, filters, and batch operations. Export to Markdown, JSON, or plain text. Sync via WebDAV."
    link: "/en/guide/features/conversation"
    linkText: "Learn more"
  - icon: "✍️"
    title: "Prompt Library"
    details: "Save prompts with variable templates. One click to fill and send. Organize by category, pin favorites, and import/export your collection."
    link: "/en/guide/features/prompt"
    linkText: "Learn more"
  - icon: "🔁"
    title: "Prompt Queue"
    details: "Queue multiple prompts to send automatically one by one while AI generates. Supports batch import and pause/resume."
    link: "/en/guide/features/prompt"
    linkText: "Learn more"
  - icon: "🔎"
    title: "Global Search"
    details: "Press Ctrl/Cmd+K or double-Shift to search across outline, conversations, prompts, and settings in one place."
    link: "/en/guide/enhancements"
    linkText: "Learn more"
  - icon: "🏷️"
    title: "Tab Management & Notifications"
    details: "Auto-rename tabs, play a sound when generation completes, auto-focus window, and mask tab titles with privacy mode."
    link: "/en/guide/enhancements"
    linkText: "Learn more"
  - icon: "🕘"
    title: "Reading History"
    details: "Remembers where you left off in each conversation and restores your scroll position automatically on return."
    link: "/en/guide/enhancements"
    linkText: "Learn more"
  - icon: "📤"
    title: "Conversation Export"
    details: "Export any conversation to JSON, Markdown, or plain text. Customize author names, include reasoning chains, and convert images to Base64."
    link: "/en/guide/features/conversation"
    linkText: "Learn more"
  - icon: "🧰"
    title: "Quick Buttons & Toolbox"
    details: "A floating button group for navigation, theming, search, and tools. Draggable, auto-collapses when idle, and fully configurable."
    link: "/en/guide/enhancements"
    linkText: "Learn more"
  - icon: "👻"
    title: "Ghost Pass-Through"
    details: "Hold Ctrl (Win/Linux) or Command (Mac) to make the panel transparent and click-through — read without obstruction."
    link: "/en/guide/enhancements"
    linkText: "Learn more"
  - icon: "⌨️"
    title: "Shortcut System"
    details: "40+ configurable shortcuts with conflict detection. Navigate headings, switch tabs, export, copy replies, and more."
    link: "/en/guide/shortcuts"
    linkText: "Learn more"
  - icon: "🖥️"
    title: "Layout Control"
    details: "Override page width and question bubble width. Enable Zen Mode to strip away distractions for focused reading."
    link: "/en/guide/enhancements"
    linkText: "Learn more"
  - icon: "🔐"
    title: "Scroll Lock"
    details: "Freeze the page while AI generates so you can read previous content without being pulled to the bottom."
    link: "/en/guide/enhancements"
    linkText: "Learn more"
  - icon: "🎨"
    title: "Theme System"
    details: "24 built-in presets (12 light, 12 dark), light/dark/system modes, per-site settings, and custom CSS editor."
    link: "/en/guide/appearance"
    linkText: "Learn more"
  - icon: "🤖"
    title: "Model Lock"
    details: "Automatically switch to your preferred model whenever you open a supported AI site. No more manual selection."
    link: "/en/guide/enhancements"
    linkText: "Learn more"
  - icon: "📊"
    title: "Usage Counter"
    details: "Track how many times you've used premium AI models today. Set a daily limit and get visual estimates of token usage."
    link: "/en/guide/enhancements"
    linkText: "Learn more"
  - icon: "🔑"
    title: "Claude Session Key 管理"
    details: "支持 Session Key 的导入、校验、切换与状态管理，适配多账号轮换。"
    link: "/zh/guide/enhancements"
    linkText: "查看详情"
  - icon: "🖼️"
    title: "Banana 去水印"
    details: "提供图像水印移除能力，优化生成图片的可用性与后续复用体验。"
    link: "/zh/guide/enhancements"
    linkText: "查看详情"
  - icon: "☁️"
    title: "数据同步与隐私控制"
    details: "支持 WebDAV 备份/恢复、按需授权、本地优先存储与隐私模式。"
    link: "/zh/guide/privacy"
    linkText: "查看详情"
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
