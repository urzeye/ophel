// @ts-nocheck
import { defineConfig } from "vitepress"

// 中文配置
const zhConfig = {
  label: "简体中文",
  lang: "zh-CN",
  link: "/zh/",
  themeConfig: {
    nav: [
      { text: "入门", items: [
        { text: "快速上手", link: "/zh/guide/getting-started" },
        { text: "面板概览", link: "/zh/guide/panel" },
        { text: "浮动按钮", link: "/zh/guide/enhancements/quick-buttons" },
      ]},
      {
        text: "功能",
        items: [
          { text: "功能概览", link: "/zh/guide/features/" },
          { text: "智能大纲", link: "/zh/guide/features/outline" },
          { text: "会话管理", link: "/zh/guide/features/conversation" },
          { text: "提示词库", link: "/zh/guide/features/prompt" },
        ],
      },
      {
        text: "设置",
        items: [
          { text: "全局搜索", link: "/zh/guide/enhancements/global-search" },
          { text: "布局与禅模式", link: "/zh/guide/enhancements/layout" },
          { text: "内容增强", link: "/zh/guide/enhancements/content" },
          { text: "阅读历史与滚动锁定", link: "/zh/guide/enhancements/reading-history" },
          { text: "用量统计", link: "/zh/guide/site/usage-monitor" },
          { text: "外观与主题", link: "/zh/guide/appearance" },
          { text: "标签页与通知", link: "/zh/guide/tab-notifications" },
          { text: "备份与同步", link: "/zh/guide/sync" },
          { text: "模型锁定", link: "/zh/guide/site/model-lock" },
          { text: "Claude 账号管理", link: "/zh/guide/site/claude" },
          { text: "站点专属设置", link: "/zh/guide/site/site-settings" },
        ],
      },
      { text: "常见问题", link: "/zh/guide/faq" },
      {
        text: "下载",
        items: [
          { text: "GitHub Releases", link: "https://github.com/urzeye/ophel/releases" },
          { text: "Chrome Web Store", link: "https://chrome.google.com/webstore" },
          { text: "Edge Add-ons", link: "https://microsoftedge.microsoft.com/addons" },
          { text: "Firefox Add-ons", link: "https://addons.mozilla.org" },
        ],
      },
    ],
    sidebar: {
      "/zh/guide/": [
        {
          text: "入门",
          items: [{ text: "快速上手", link: "/zh/guide/getting-started" }, { text: "面板概览", link: "/zh/guide/panel" }, { text: "浮动按钮", link: "/zh/guide/enhancements/quick-buttons" }],
        },
        {
          text: "核心功能",
          items: [
            { text: "功能概览", link: "/zh/guide/features/" },
            { text: "智能大纲", link: "/zh/guide/features/outline" },
            { text: "会话管理", link: "/zh/guide/features/conversation" },
            { text: "提示词库", link: "/zh/guide/features/prompt" },
          ],
        },
        {
          text: "增强功能",
          items: [
            { text: "全局搜索", link: "/zh/guide/enhancements/global-search" },,
            { text: "布局与禅模式", link: "/zh/guide/enhancements/layout" },
            { text: "内容增强", link: "/zh/guide/enhancements/content" },
            { text: "阅读历史与滚动锁定", link: "/zh/guide/enhancements/reading-history" },
            { text: "用量统计", link: "/zh/guide/site/usage-monitor" },
          ],
        },
        {
          text: "外观",
          items: [{ text: "外观与主题", link: "/zh/guide/appearance" }],
        },
        {
          text: "标签页与通知",
          items: [{ text: "标签页与通知", link: "/zh/guide/tab-notifications" }],
        },
        {
          text: "站点配置",
          items: [
            { text: "模型锁定", link: "/zh/guide/site/model-lock" },
            { text: "Claude 账号管理", link: "/zh/guide/site/claude" },
            { text: "站点专属设置", link: "/zh/guide/site/site-settings" },
          ],
        },
        {
          text: "备份与同步",
          items: [{ text: "备份与同步", link: "/zh/guide/sync" }],
        },
        {
          text: "参考",
          items: [
            { text: "快捷键", link: "/zh/guide/shortcuts" },
            { text: "常见问题", link: "/zh/guide/faq" },
            { text: "隐私政策", link: "/zh/guide/privacy" },
          ],
        },
      ],
    },
    docFooter: { prev: "上一页", next: "下一页" },
    outline: { label: "页面导航", level: [2, 3] },
    lastUpdated: { text: "最后更新于" },
    returnToTopLabel: "回到顶部",
    sidebarMenuLabel: "菜单",
    darkModeSwitchLabel: "主题",
    lightModeSwitchTitle: "切换到浅色模式",
    darkModeSwitchTitle: "切换到深色模式",
    editLink: {
      pattern: "https://github.com/urzeye/ophel/edit/main/docs/site/:path",
      text: "在 GitHub 上编辑此页",
    },
  },
}

// 英文配置
const enConfig = {
  label: "English",
  lang: "en-US",
  link: "/en/",
  themeConfig: {
    nav: [
      { text: "Getting Started", items: [
        { text: "Quick Start", link: "/en/guide/getting-started" },
        { text: "Panel Overview", link: "/en/guide/panel" },
        { text: "Quick Buttons", link: "/en/guide/enhancements/quick-buttons" },
      ]},
      {
        text: "Features",
        items: [
          { text: "Overview", link: "/en/guide/features/" },
          { text: "Smart Outline", link: "/en/guide/features/outline" },
          { text: "Conversation Manager", link: "/en/guide/features/conversation" },
          { text: "Prompt Library", link: "/en/guide/features/prompt" },
        ],
      },
      {
        text: "Settings",
        items: [
          { text: "Global Search", link: "/en/guide/enhancements/global-search" },
          { text: "Layout & Zen Mode", link: "/en/guide/enhancements/layout" },
          { text: "Content Enhancements", link: "/en/guide/enhancements/content" },
          { text: "Reading History", link: "/en/guide/enhancements/reading-history" },
          { text: "Usage Monitor", link: "/en/guide/site/usage-monitor" },
          { text: "Appearance", link: "/en/guide/appearance" },
          { text: "Tab & Notifications", link: "/en/guide/tab-notifications" },
          { text: "Backup & Sync", link: "/en/guide/sync" },
          { text: "Model Lock", link: "/en/guide/site/model-lock" },
          { text: "Claude Accounts", link: "/en/guide/site/claude" },
          { text: "Site Settings", link: "/en/guide/site/site-settings" },
        ],
      },
      { text: "FAQ", link: "/en/guide/faq" },
      {
        text: "Download",
        items: [
          { text: "GitHub Releases", link: "https://github.com/urzeye/ophel/releases" },
          { text: "Chrome Web Store", link: "https://chrome.google.com/webstore" },
          { text: "Edge Add-ons", link: "https://microsoftedge.microsoft.com/addons" },
          { text: "Firefox Add-ons", link: "https://addons.mozilla.org" },
        ],
      },
    ],
    sidebar: {
      "/en/guide/": [
        {
          text: "Getting Started",
          items: [{ text: "Quick Start", link: "/en/guide/getting-started" }, { text: "Panel Overview", link: "/en/guide/panel" }, { text: "Quick Buttons", link: "/en/guide/enhancements/quick-buttons" }],
        },
        {
          text: "Core Features",
          items: [
            { text: "Overview", link: "/en/guide/features/" },
            { text: "Smart Outline", link: "/en/guide/features/outline" },
            { text: "Conversation Manager", link: "/en/guide/features/conversation" },
            { text: "Prompt Library", link: "/en/guide/features/prompt" },
          ],
        },
        {
          text: "Enhancements",
          items: [
            { text: "Global Search", link: "/en/guide/enhancements/global-search" },
            { text: "Layout & Zen Mode", link: "/en/guide/enhancements/layout" },
            { text: "Content Enhancements", link: "/en/guide/enhancements/content" },
            { text: "Reading History & Scroll Lock", link: "/en/guide/enhancements/reading-history" },
            { text: "Usage Monitor", link: "/en/guide/site/usage-monitor" },
          ],
        },
        {
          text: "Appearance",
          items: [{ text: "Appearance & Themes", link: "/en/guide/appearance" }],
        },
        {
          text: "Tab & Notifications",
          items: [{ text: "Tab & Notifications", link: "/en/guide/tab-notifications" }],
        },
        {
          text: "Site Settings",
          items: [
            { text: "Model Lock", link: "/en/guide/site/model-lock" },
            { text: "Claude Accounts", link: "/en/guide/site/claude" },
            { text: "Site-Specific Settings", link: "/en/guide/site/site-settings" },
          ],
        },
        {
          text: "Backup & Sync",
          items: [{ text: "Backup & Sync", link: "/en/guide/sync" }],
        },
        {
          text: "Reference",
          items: [
            { text: "Shortcuts", link: "/en/guide/shortcuts" },
            { text: "FAQ", link: "/en/guide/faq" },
            { text: "Privacy", link: "/en/guide/privacy" },
          ],
        },
      ],
    },
    docFooter: { prev: "Previous", next: "Next" },
    outline: { label: "On this page", level: [2, 3] },
    lastUpdated: { text: "Last updated" },
    returnToTopLabel: "Back to top",
    sidebarMenuLabel: "Menu",
    darkModeSwitchLabel: "Theme",
    lightModeSwitchTitle: "Switch to light mode",
    darkModeSwitchTitle: "Switch to dark mode",
    editLink: {
      pattern: "https://github.com/urzeye/ophel/edit/main/docs/site/:path",
      text: "Edit this page on GitHub",
    },
  },
}

export default defineConfig({
  title: "Ophel",
  description: "AI Conversation Enhancement - Gemini / AI Studio / Grok / ChatGPT / Claude",

  head: [
    ["link", { rel: "icon", href: "/ophel/logo.png" }],
    [
      "meta",
      {
        name: "google-site-verification",
        content: "kZpWtKdWmStJ_vaL2dPQR9S3knmmRGCSy11w6fTyQ5g",
      },
    ],
  ],
  base: "/ophel/",

  locales: {
    zh: zhConfig,
    en: enConfig,
  },

  themeConfig: {
    logo: "/logo.png",
    socialLinks: [{ icon: "github", link: "https://github.com/urzeye/ophel" }],
    footer: {
      message: "Released under the CC BY-NC-SA 4.0 License.",
      copyright: "Copyright © 2024-present Ophel",
    },
    search: { provider: "local" },

    // 默认使用英文配置
    ...enConfig.themeConfig,
  },

  markdown: {
    lineNumbers: true,
  },

  vite: {
    server: {
      host: "127.0.0.1",
    },
  },
})
