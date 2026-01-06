/**
 * Ophel - 存储抽象层
 *
 * 使用 local 存储
 */

import { Storage } from "@plasmohq/storage"

// 本地存储 - 用于非 Zustand 管理的数据
export const localStorage = new Storage({ area: "local" })

// ==================== 存储键定义 ====================

export const STORAGE_KEYS = {
  // Zustand 存储的 keys (统一在 local)
  SETTINGS: "settings",
  FOLDERS: "folders",
  TAGS: "tags",
  PROMPTS: "prompts",
  CONVERSATIONS: "conversations",
  READING_HISTORY: "readingHistory",
} as const

// ==================== 类型定义 ====================

// 站点 ID 类型
export type SiteId = "gemini" | "gemini-enterprise" | "_default"

// 主题模式
export type ThemeMode = "light" | "dark"

// 站点主题配置
export interface SiteThemeConfig {
  mode: ThemeMode
  lightStyleId: string // 浅色模式样式 ID（内置预设或自定义样式）
  darkStyleId: string // 深色模式样式 ID
}

// 自定义样式
export interface CustomStyle {
  id: string // 唯一 ID（nanoid 生成）
  name: string // 用户自定义名称
  css: string // CSS 内容
  mode: "light" | "dark" // 适用的主题模式
}

// 页面宽度配置
export interface PageWidthConfig {
  enabled: boolean
  value: string
  unit: string
}

// 模型锁定配置
export interface ModelLockConfig {
  enabled: boolean
  keyword: string
}

export interface Settings {
  language: string

  // 面板行为
  panel: {
    defaultOpen: boolean
    autoHide: boolean
    edgeSnap: boolean
    preventAutoScroll: boolean
  }

  // 内容处理（含复制、导出）
  content: {
    markdownFix: boolean
    watermarkRemoval: boolean
    formulaCopy: boolean
    formulaDelimiter: boolean
    tableCopy: boolean
    exportImagesToBase64: boolean
    userQueryMarkdown: boolean // 用户提问 Markdown 渲染
  }

  // 主题（按站点独立 + 共享自定义样式）
  theme: {
    sites: Partial<Record<SiteId, SiteThemeConfig>>
    customStyles: CustomStyle[] // 自定义样式列表
  }

  // 页面宽度（按站点独立）
  pageWidth: Record<SiteId, PageWidthConfig>

  // 模型锁定（按站点独立）
  modelLock: Record<string, ModelLockConfig>

  // 功能模块配置
  features: {
    order: string[]
    prompts: {
      enabled: boolean
    }
    conversations: {
      enabled: boolean
      syncUnpin: boolean
      folderRainbow: boolean
    }
    outline: {
      enabled: boolean
      maxLevel: number
      autoUpdate: boolean
      updateInterval: number
      showUserQueries: boolean
      followMode: "current" | "latest" | "manual"
      expandLevel: number
    }
  }

  // 浏览器标签页行为
  tab: {
    openInNewTab: boolean
    autoRename: boolean
    renameInterval: number
    showStatus: boolean
    titleFormat: string
    showNotification: boolean
    notificationSound: boolean
    notificationVolume: number
    notifyWhenFocused: boolean
    autoFocus: boolean
    privacyMode: boolean
    privacyTitle: string
    customIcon: string
  }

  // 阅读历史配置
  readingHistory: {
    persistence: boolean
    autoRestore: boolean
    cleanupDays: number
  }

  // 快捷按钮配置
  collapsedButtons: Array<{ id: string; enabled: boolean }>

  // WebDAV 同步
  webdav?: {
    enabled: boolean
    url: string
    username: string
    password: string
    syncMode: "manual" | "auto"
    syncInterval: number
    remoteDir: string
    lastSyncTime?: number
    lastSyncStatus?: "success" | "failed" | "syncing"
  }
}

// 默认站点主题配置
const DEFAULT_SITE_THEME: SiteThemeConfig = {
  mode: "light",
  lightStyleId: "google-gradient",
  darkStyleId: "classic-dark",
}

// 默认页面宽度配置
const DEFAULT_PAGE_WIDTH: PageWidthConfig = {
  enabled: false,
  value: "81",
  unit: "%",
}

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",

  panel: {
    defaultOpen: true,
    autoHide: false,
    edgeSnap: true,
    preventAutoScroll: false,
  },

  content: {
    markdownFix: true,
    watermarkRemoval: true,
    formulaCopy: true,
    formulaDelimiter: true,
    tableCopy: true,
    exportImagesToBase64: false,
    userQueryMarkdown: false, // 默认关闭
  },

  theme: {
    sites: {
      gemini: { ...DEFAULT_SITE_THEME },
      "gemini-enterprise": { ...DEFAULT_SITE_THEME },
      _default: { ...DEFAULT_SITE_THEME },
    },
    customStyles: [], // 空数组，用户可以添加自定义样式
  },

  pageWidth: {
    gemini: { ...DEFAULT_PAGE_WIDTH },
    "gemini-enterprise": { ...DEFAULT_PAGE_WIDTH },
    _default: { ...DEFAULT_PAGE_WIDTH },
  },

  modelLock: {
    gemini: { enabled: false, keyword: "" },
    "gemini-enterprise": { enabled: false, keyword: "" },
  },

  features: {
    order: ["prompts", "conversations", "outline"],
    prompts: {
      enabled: true,
    },
    conversations: {
      enabled: true,
      syncUnpin: false,
      folderRainbow: true,
    },
    outline: {
      enabled: true,
      maxLevel: 6,
      autoUpdate: true,
      updateInterval: 2,
      showUserQueries: true,
      followMode: "current",
      expandLevel: 6,
    },
  },

  tab: {
    openInNewTab: true,
    autoRename: true,
    renameInterval: 3,
    showStatus: true,
    titleFormat: "{status}{title}->{model}",
    showNotification: true,
    notificationSound: true,
    notificationVolume: 0.6,
    notifyWhenFocused: false,
    autoFocus: true,
    privacyMode: false,
    privacyTitle: "Google",
    customIcon: "default",
  },

  readingHistory: {
    persistence: true,
    autoRestore: true,
    cleanupDays: 30,
  },

  collapsedButtons: [
    { id: "scrollTop", enabled: true },
    { id: "panel", enabled: true },
    { id: "anchor", enabled: true },
    { id: "theme", enabled: true },
    { id: "manualAnchor", enabled: true },
    { id: "scrollBottom", enabled: true },
  ],

  webdav: {
    enabled: false,
    url: "",
    username: "",
    password: "",
    syncMode: "manual",
    syncInterval: 30,
    remoteDir: "ophel",
  },
}

export interface Folder {
  id: string
  name: string
  icon: string
  isDefault?: boolean
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Prompt {
  id: string
  title: string
  content: string
  category: string
  pinned?: boolean // 是否置顶
  lastUsedAt?: number // 最近使用时间戳
}

// ==================== 工具函数 ====================

/**
 * 获取站点配置，如果不存在则返回默认配置
 */
export function getSiteTheme(settings: Settings, siteId: string): SiteThemeConfig {
  const sites = settings.theme?.sites
  if (sites && siteId in sites) {
    return sites[siteId as SiteId]
  }
  return sites?._default ?? DEFAULT_SITE_THEME
}

export function getSitePageWidth(settings: Settings, siteId: string): PageWidthConfig {
  const pageWidth = settings.pageWidth
  if (pageWidth && siteId in pageWidth) {
    return pageWidth[siteId as SiteId]
  }
  return pageWidth?._default ?? DEFAULT_PAGE_WIDTH
}

export function getSiteModelLock(settings: Settings, siteId: string): ModelLockConfig {
  return settings.modelLock?.[siteId] ?? { enabled: false, keyword: "" }
}
