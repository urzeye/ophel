/**
 * Ophel - 存储抽象层
 *
 * 使用 local 存储
 */

import { Storage } from "@plasmohq/storage"

import { DEFAULT_SHORTCUTS_SETTINGS, type ShortcutsSettings } from "~constants/shortcuts"

// 构建时注入的平台标识
declare const __PLATFORM__: "extension" | "userscript" | undefined

// 油猴脚本环境标识（用于设置默认值）
const isUserscript = typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"

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
  CLAUDE_SESSION_KEYS: "claudeSessionKeys", // Claude SessionKey管理
} as const

// 清除全部数据标记（用于跳过首次自动恢复/自动同步）
export const CLEAR_ALL_FLAG_KEY = "ophel:clearAllFlag"
export const CLEAR_ALL_FLAG_TTL_MS = 5 * 1000

// ==================== 类型定义 ====================

// 站点 ID 类型
export type SiteId = "gemini" | "gemini-enterprise" | "aistudio" | "_default"

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
  id: string // 唯一 ID（crypto.randomUUID 生成）
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

// 导出设置
export interface ExportSettings {
  customUserName?: string // 自定义用户名称
  customModelName?: string // 自定义 AI 名称
}

// AI Studio 设置
export interface AIStudioSettings {
  // 界面状态
  collapseNavbar?: boolean // 默认折叠侧边栏
  collapseRunSettings?: boolean // 默认收起运行设置面板（整个右侧面板）
  collapseTools?: boolean // 默认收起工具栏（运行设置中的工具栏区域）
  collapseAdvanced?: boolean // 默认收起高级设置

  // 功能开关
  enableSearch?: boolean // 默认启用 Google 搜索工具
  markdownFix?: boolean // 修复响应中未渲染的加粗文本

  // 默认模型
  defaultModel?: string // 模型 ID，如 "models/gemini-3-flash-preview"

  // 缓存的模型列表（从 DOM 动态抓取）
  cachedModels?: Array<{ id: string; name: string }>

  // 去水印开关
  removeWatermark?: boolean
}

// ChatGPT 设置
export interface ChatGPTSettings {
  markdownFix?: boolean // 修复响应中未渲染的加粗文本
}

export interface Settings {
  language: string
  hasAgreedToTerms: boolean // 用户是否同意免责声明

  // 面板行为
  panel: {
    defaultOpen: boolean
    autoHide: boolean
    edgeSnap: boolean
    preventAutoScroll: boolean
    defaultPosition: "left" | "right" // 默认位置
    defaultEdgeDistance: number // 默认边距 (0-400, 默认 25)
    edgeSnapThreshold: number // 吸附触发距离 (10-100, 默认 18)
    height: number // 面板高度 (50-100, 默认 85, 单位 vh)
    width: number // 面板宽度 (200-600, 默认 320, 单位 px)
  }

  // Gemini Enterprise 专属设置
  geminiEnterprise?: {
    policyRetry: {
      enabled: boolean
      maxRetries: number
    }
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

  // 导出设置
  export?: ExportSettings

  // 主题（按站点独立 + 共享自定义样式）
  theme: {
    sites: Partial<Record<SiteId, SiteThemeConfig>>
    customStyles: CustomStyle[] // 自定义样式列表
  }

  // 布局设置（页面宽度、用户问题宽度等）
  layout: {
    pageWidth: Record<SiteId, PageWidthConfig>
    userQueryWidth: Record<SiteId, PageWidthConfig>
  }

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
      inlineBookmarkMode: "always" | "hover" | "hidden" // 页内收藏图标显示模式
      panelBookmarkMode: "always" | "hover" | "hidden" // 面板收藏图标显示模式
      showWordCount: boolean
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
  quickButtonsOpacity: number

  // 工具箱菜单配置 (启用的菜单项 ID 列表，undefined 表示全部显示)
  toolsMenu?: string[]

  floatingToolbar: {
    open: boolean
  }

  // Claude 专属设置
  claude?: {
    currentKeyId: string // 当前选中的SessionKey ID,空字符串表示使用默认cookie
  }

  //  WebDAV 同步
  webdav?: {
    enabled: boolean
    url: string
    username: string
    password: string
    syncMode: "manual" | "auto"
    syncInterval: number
    remoteDir: string
    dataSources?: Array<"settings" | "conversations" | "prompts" | "claudeSessionKeys"> // 可备份的数据源
    lastSyncTime?: number // 上次同步时间戳
    lastSyncStatus?: "success" | "failed" | "syncing"
  }

  // 快捷键设置
  shortcuts: ShortcutsSettings

  // AI Studio 专属设置
  aistudio?: AIStudioSettings

  // ChatGPT 专属设置
  chatgpt?: ChatGPTSettings
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
  value: "1280",
  unit: "px",
}

// 默认用户问题宽度配置（使用 px 防止随页面宽度缩放）
const DEFAULT_USER_QUERY_WIDTH: PageWidthConfig = {
  enabled: false,
  value: "600",
  unit: "px",
}

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  hasAgreedToTerms: false,

  panel: {
    defaultOpen: true,
    autoHide: false,
    edgeSnap: true,
    preventAutoScroll: false,
    defaultPosition: "right",
    defaultEdgeDistance: 25,
    edgeSnapThreshold: 18,
    height: 85,
    width: 320,
  },

  geminiEnterprise: {
    policyRetry: {
      enabled: false,
      maxRetries: 3,
    },
  },

  content: {
    markdownFix: true,
    // 油猴脚本环境默认开启（GM_xmlhttpRequest 已通过 @grant 声明）
    watermarkRemoval: isUserscript,
    formulaCopy: true,
    formulaDelimiter: true,
    tableCopy: true,
    exportImagesToBase64: false,
    userQueryMarkdown: false, // 默认关闭
  },

  export: {
    customUserName: "",
    customModelName: "",
  },

  theme: {
    sites: {
      gemini: { ...DEFAULT_SITE_THEME },
      "gemini-enterprise": { ...DEFAULT_SITE_THEME },
      _default: { ...DEFAULT_SITE_THEME },
    },
    customStyles: [], // 空数组，用户可以添加自定义样式
  },

  layout: {
    pageWidth: {
      gemini: { ...DEFAULT_PAGE_WIDTH },
      "gemini-enterprise": { ...DEFAULT_PAGE_WIDTH },
      aistudio: { ...DEFAULT_PAGE_WIDTH },
      _default: { ...DEFAULT_PAGE_WIDTH },
    },
    userQueryWidth: {
      gemini: { ...DEFAULT_USER_QUERY_WIDTH },
      "gemini-enterprise": { ...DEFAULT_USER_QUERY_WIDTH },
      aistudio: { ...DEFAULT_USER_QUERY_WIDTH },
      _default: { ...DEFAULT_USER_QUERY_WIDTH },
    },
  },

  modelLock: {
    gemini: { enabled: false, keyword: "" },
    "gemini-enterprise": { enabled: false, keyword: "" },
  },

  features: {
    order: ["outline", "conversations", "prompts"],
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
      inlineBookmarkMode: "always",
      panelBookmarkMode: "always", // 默认保持原有行为 (Always Dimmed)
      showWordCount: false,
    },
  },

  tab: {
    openInNewTab: true,
    autoRename: true,
    renameInterval: 3,
    showStatus: true,
    titleFormat: "{status}{title}->{model}",
    // 油猴脚本环境默认开启（GM_notification 已通过 @grant 声明）
    showNotification: isUserscript,
    notificationSound: true,
    notificationVolume: 0.6,
    notifyWhenFocused: false,
    autoFocus: false,
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
    { id: "floatingToolbar", enabled: true },
    { id: "anchor", enabled: true },
    { id: "theme", enabled: true },
    { id: "manualAnchor", enabled: false },
    { id: "scrollBottom", enabled: true },
  ],
  quickButtonsOpacity: 1,
  floatingToolbar: {
    open: true,
  },

  claude: {
    currentKeyId: "", // 空字符串表示使用浏览器默认cookie
  },

  webdav: {
    enabled: false,
    url: "",
    username: "",
    password: "",
    syncMode: "manual",
    syncInterval: 30,
    remoteDir: "ophel",
    dataSources: ["settings", "conversations", "prompts", "claudeSessionKeys"], // 默认包括所有数据
  },

  shortcuts: DEFAULT_SHORTCUTS_SETTINGS,

  aistudio: {
    collapseNavbar: false,
    collapseTools: false,
    collapseAdvanced: false,
    enableSearch: true,
    defaultModel: "", // 空表示不覆盖
    // 油猴脚本环境默认开启
    markdownFix: isUserscript,
    removeWatermark: isUserscript,
  },

  chatgpt: {
    // 默认开启
    markdownFix: true,
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

// Claude SessionKey 管理
export interface ClaudeSessionKey {
  id: string // crypto.randomUUID
  name: string // 用户自定义名称
  key: string // sk-ant-sid01-...
  accountType?: "Free" | "Pro(5x)" | "Pro(20x)" | "API" | "Unknown"
  isValid?: boolean // 最近测试结果
  testedAt?: number // 最近测试时间戳
  createdAt: number
}

export interface ClaudeSessionKeysState {
  keys: ClaudeSessionKey[]
  currentKeyId: string // 空字符串表示使用浏览器默认cookie
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
  const pageWidth = settings.layout?.pageWidth
  if (pageWidth && siteId in pageWidth) {
    return pageWidth[siteId as SiteId]
  }
  return pageWidth?._default ?? DEFAULT_PAGE_WIDTH
}

export function getSiteModelLock(settings: Settings, siteId: string): ModelLockConfig {
  return settings.modelLock?.[siteId] ?? { enabled: false, keyword: "" }
}

export function getSiteUserQueryWidth(settings: Settings, siteId: string): PageWidthConfig {
  const userQueryWidth = settings.layout?.userQueryWidth
  if (userQueryWidth && siteId in userQueryWidth) {
    return userQueryWidth[siteId as SiteId]
  }
  return userQueryWidth?._default ?? DEFAULT_USER_QUERY_WIDTH
}

let clearAllFlagPromise: Promise<boolean> | null = null

/**
 * 消费“清除全部数据”标记（仅首次返回 true）
 * - 用于在清除后首次加载时跳过自动恢复/自动同步
 * - 多处调用将共享结果，避免竞态
 */
export function consumeClearAllFlag(): Promise<boolean> {
  if (clearAllFlagPromise) {
    return clearAllFlagPromise
  }

  clearAllFlagPromise = new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      resolve(false)
      return
    }

    chrome.storage.local.get(CLEAR_ALL_FLAG_KEY, (result) => {
      const rawValue = result?.[CLEAR_ALL_FLAG_KEY]
      const hasFlag = rawValue !== undefined
      if (!hasFlag) {
        resolve(false)
        return
      }

      const ts = typeof rawValue === "number" ? rawValue : Number(rawValue)
      if (!Number.isFinite(ts)) {
        resolve(true)
        return
      }

      const age = Date.now() - ts
      if (age <= CLEAR_ALL_FLAG_TTL_MS) {
        resolve(true)
        return
      }

      chrome.storage.local.remove(CLEAR_ALL_FLAG_KEY, () => resolve(false))
    })
  })

  return clearAllFlagPromise
}
