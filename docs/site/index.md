---
layout: home

hero:
  name: Ophel
  text: AI Conversation Enhancement
  tagline: "Outline · Conversations · Prompts · Search · Themes · Shortcuts · Sync"
  image:
    src: /logo.png
    alt: Ophel
  actions:
    - theme: brand
      text: 中文文档 →
      link: /zh/
    - theme: alt
      text: English Docs →
      link: /en/
    - theme: alt
      text: GitHub
      link: https://github.com/urzeye/ophel

features:
  - icon: "📑"
    title: "智能大纲 · Smart Outline"
    details: "实时解析对话结构，定位、跟随与书签。Auto-parses headings into a navigable tree with locate, follow, and bookmark modes."
    link: "/zh/guide/features/outline"
    linkText: "查看详情 / Learn more"
  - icon: "💬"
    title: "会话管理 · Conversation Manager"
    details: "文件夹、标签、置顶与批量操作，支持导出与同步。Folders, tags, pins, bulk actions, export, and WebDAV sync."
    link: "/zh/guide/features/conversation"
    linkText: "查看详情 / Learn more"
  - icon: "✍️"
    title: "提示词库 · Prompt Library"
    details: "变量模板、一键发送、分类管理、导入导出。Variable templates, one-click send, category management, import/export."
    link: "/zh/guide/features/prompt"
    linkText: "查看详情 / Learn more"
  - icon: "🔎"
    title: "全局搜索 · Global Search"
    details: "Ctrl+K 统一搜索大纲、会话、提示词与设置。Unified search across outline, conversations, prompts, and settings."
    link: "/zh/guide/enhancements/global-search"
    linkText: "查看详情 / Learn more"
  - icon: "🎨"
    title: "主题系统 · Theme System"
    details: "24 套内置主题，支持浅色/深色/系统模式与自定义 CSS。24 built-in presets, light/dark/system modes, custom CSS."
    link: "/zh/guide/appearance"
    linkText: "查看详情 / Learn more"
  - icon: "⌨️"
    title: "快捷键 · Shortcuts"
    details: "40+ 可配置快捷键，冲突检测，高频操作零鼠标。40+ configurable shortcuts with conflict detection."
    link: "/zh/guide/shortcuts"
    linkText: "查看详情 / Learn more"
  - icon: "🏷️"
    title: "标签页与通知 · Tabs & Alerts"
    details: "自动重命名标签页，生成完成时桌面通知与音效提醒。Auto-rename tabs, desktop notifications, and sound alerts on completion."
    link: "/zh/guide/tab-notifications"
    linkText: "查看详情 / Learn more"
  - icon: "🤖"
    title: "模型锁定 · Model Lock"
    details: "打开站点时自动切换到目标模型，无需手动选择。Auto-switch to your preferred model on every page load."
    link: "/zh/guide/site/model-lock"
    linkText: "查看详情 / Learn more"
  - icon: "🔑"
    title: "Claude 账号管理 · Claude Accounts"
    details: "存储多个 Session Key，达到限额时一键切换账号。Store multiple Session Keys and switch instantly when one account hits its limit."
    link: "/zh/guide/site/claude"
    linkText: "查看详情 / Learn more"
  - icon: "🖥️"
    title: "布局控制 · Layout Control"
    details: "自定义页面宽度、禅模式，面板吸附与穿透。Page width override, zen mode, edge snap, and ghost pass-through."
    link: "/zh/guide/enhancements/layout"
    linkText: "查看详情 / Learn more"
  - icon: "🕘"
    title: "阅读历史 · Reading History"
    details: "记录并自动恢复每个对话的阅读位置。Records and auto-restores your scroll position per conversation."
    link: "/zh/guide/enhancements/reading-history"
    linkText: "查看详情 / Learn more"
  - icon: "☁️"
    title: "备份与同步 · Backup & Sync"
    details: "本地导出与 WebDAV 多端同步，数据本地优先。Local export and WebDAV sync, local-first storage."
    link: "/zh/guide/sync"
    linkText: "查看详情 / Learn more"
---

<script setup>
import { onMounted } from 'vue'

onMounted(() => {
  window.location.replace('/ophel/en/')
})
</script>
