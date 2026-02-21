// @ts-nocheck
import { defineConfig } from "vitepress"

// 中文配置
const zhConfig = {
  label: "简体中文",
  lang: "zh-CN",
  link: "/zh/",
  themeConfig: {
    nav: [
      { text: "指南", link: "/zh/guide/getting-started" },
      {
        text: "功能",
        items: [
          { text: "功能概览", link: "/zh/guide/features/" },
          { text: "智能大纲", link: "/zh/guide/features/outline" },
          { text: "会话管理", link: "/zh/guide/features/conversation" },
          { text: "提示词助手", link: "/zh/guide/features/prompt" },
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
          items: [{ text: "快速开始", link: "/zh/guide/getting-started" }],
        },
        {
          text: "核心功能",
          items: [
            { text: "功能概览", link: "/zh/guide/features/" },
            { text: "智能大纲", link: "/zh/guide/features/outline" },
            { text: "会话管理", link: "/zh/guide/features/conversation" },
            { text: "提示词助手", link: "/zh/guide/features/prompt" },
          ],
        },
        {
          text: "设置中心",
          items: [
            { text: "设置总览", link: "/zh/guide/enhancements" },
            { text: "基本设置", link: "/zh/guide/enhancements#settings-general" },
            { text: "功能模块", link: "/zh/guide/enhancements#settings-features" },
            {
              text: "站点设置",
              link: "/zh/guide/enhancements#settings-site-settings",
            },
            {
              text: "全局搜索",
              link: "/zh/guide/enhancements#settings-global-search",
            },
            { text: "外观主题", link: "/zh/guide/appearance" },
            { text: "快捷键系统", link: "/zh/guide/shortcuts" },
            { text: "数据与权限", link: "/zh/guide/privacy" },
          ],
        },
        {
          text: "帮助",
          items: [{ text: "常见问题", link: "/zh/guide/faq" }],
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
      pattern: "https://github.com/urzeye/ophel/edit/main/docs/:path",
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
      { text: "Guide", link: "/en/guide/getting-started" },
      {
        text: "Features",
        items: [
          { text: "Overview", link: "/en/guide/features/" },
          { text: "Smart Outline", link: "/en/guide/features/outline" },
          { text: "Conversation Manager", link: "/en/guide/features/conversation" },
          { text: "Prompt Library", link: "/en/guide/features/prompt" },
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
          items: [{ text: "Quick Start", link: "/en/guide/getting-started" }],
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
          text: "Settings Center",
          items: [
            { text: "Overview", link: "/en/guide/enhancements" },
            { text: "General", link: "/en/guide/enhancements#settings-general" },
            { text: "Features", link: "/en/guide/enhancements#settings-features" },
            { text: "Site Settings", link: "/en/guide/enhancements#settings-site-settings" },
            { text: "Global Search", link: "/en/guide/enhancements#settings-global-search" },
            { text: "Appearance", link: "/en/guide/appearance" },
            { text: "Shortcuts", link: "/en/guide/shortcuts" },
            { text: "Data & Permissions", link: "/en/guide/privacy" },
          ],
        },
        {
          text: "Help",
          items: [{ text: "FAQ", link: "/en/guide/faq" }],
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
      pattern: "https://github.com/urzeye/ophel/edit/main/docs/:path",
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

  // 排除非文档文件（多语言 README 放在 i18n 目录下）
  srcExclude: ["**/i18n/**"],

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

    // 默认使用中文配置
    ...zhConfig.themeConfig,
  },

  markdown: {
    lineNumbers: true,
  },
})
