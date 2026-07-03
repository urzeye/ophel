/**
 * Ophel - 存储抽象层
 *
 * 使用 local 存储
 */

import { Storage } from "@plasmohq/storage"

import { DEFAULT_SHORTCUTS_SETTINGS, type ShortcutsSettings } from "~constants/shortcuts"
import type { WebDAVProvider } from "~core/webdav-sync"
import { isUserscriptPlatform } from "~platform/utils"

// GM API 类型声明（仅在 userscript 环境使用）
declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_deleteValue(key: string): void

// 油猴脚本环境标识（用于设置默认值）
const isUserscript = isUserscriptPlatform()

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
  PROMPT_CHAINS: "promptChains",
} as const

// 清除全部数据标记（用于跳过首次自动恢复/自动同步）
export const CLEAR_ALL_FLAG_KEY = "ophel:clearAllFlag"
export const CLEAR_ALL_FLAG_TTL_MS = 5 * 1000
export const SKIP_READING_HISTORY_RESTORE_PARAM = "ophel_skip_restore"

// ==================== 类型定义 ====================

// 站点 ID 类型
export type SiteId =
  | "gemini"
  | "gemini-enterprise"
  | "aistudio"
  | "doubao"
  | "ima"
  | "deepseek"
  | "yuanbao"
  | "zai"
  | "_default"

// 主题模式
export type ThemeMode = "light" | "dark" | "system"
export type ExportPackaging = "markdown" | "zip"

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

// 禅模式配置
export interface ZenModeConfig {
  enabled: boolean
  showExitButton?: boolean
}

export interface PanelAvoidanceSettings {
  enabled: boolean
}

// 导出设置
export interface ExportSettings {
  customUserName?: string // 自定义用户名称
  customModelName?: string // 自定义 AI 名称
  exportFilenameTimestamp?: boolean // 导出文件名包含时间戳
  includeThoughts?: boolean // 导出包含思维链
  packaging?: ExportPackaging // 导出打包方式
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

export interface UsageMonitorSettings {
  enabled: boolean
  dailyLimit: number
  autoResetEnabled: boolean
}

export interface QuickButtonConfig {
  id: string
  enabled: boolean
}

export interface QuickButtonsPosition {
  xRatio: number
  yRatio: number
}

export interface QuickButtonsSettings {
  collapsed: QuickButtonConfig[]
  opacity: number
  toolsMenu?: string[]
  floatingToolbar: {
    open: boolean
  }
  position?: QuickButtonsPosition
  /** 面板展开时隐藏整个快捷按钮组（默认 false） */
  hideWhenPanelOpen?: boolean
  /** 感应唤醒距离（像素），鼠标在此范围内自动展开水滴，默认 150；0 = 仅直接悬停才展开 */
  proximityRadius?: number
}

export type FormulaCopyFormat = "latex" | "mathml"

export interface Settings {
  language: string
  hasAgreedToTerms: boolean // 用户是否同意免责声明
  hasSeenOphelAdvancedGuide?: boolean

  // 面板行为
  panel: {
    panelExpanded: boolean // 面板是否展开（未收进快捷按钮组）
    panelMode: "edge-snap" | "floating" // 面板模式
    preventAutoScroll: boolean
    defaultPosition: "left" | "right" // 展开时的默认侧边/吸附兜底侧边
    defaultEdgeDistance: number // 悬浮模式展开时距离屏幕边缘的默认边距
    edgeSnapThreshold: number // 吸附触发距离 (0-400, 默认 30)
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
    assistantMermaid: boolean // AI 回复 Mermaid 渲染增强
    markdownFix: boolean
    watermarkRemoval: boolean
    formulaCopy: boolean
    formulaCopyFormat: FormulaCopyFormat
    formulaDelimiter: boolean
    tableCopy: boolean
    exportImagesToBase64: boolean
    userQueryMarkdown: boolean // 用户提问 Markdown 渲染
  }

  // 导出设置
  export?: ExportSettings

  // 主题（按站点独立 + 共享自定义样式）
  theme: {
    syncNativePageTheme: boolean
    sites: Partial<Record<SiteId, SiteThemeConfig>>
    customStyles: CustomStyle[] // 自定义样式列表
  }

  // 布局设置（页面宽度、用户问题宽度等）
  layout: {
    pageWidth: Record<string, PageWidthConfig>
    userQueryWidth: Record<string, PageWidthConfig>
    zenMode?: Record<string, ZenModeConfig>
    cleanMode?: Record<string, ZenModeConfig>
    panelAvoidance?: Record<string, PanelAvoidanceSettings>
  }

  // 模型锁定（按站点独立）
  modelLock: Record<string, ModelLockConfig>

  // 全局搜索配置
  globalSearch: {
    promptEnterBehavior: "smart" | "locate"
    enableFuzzySearch: boolean
    doubleShift: boolean
  }

  // 高级模型本地计数与额度预估
  usageMonitor: UsageMonitorSettings

  // 功能模块配置
  features: {
    order: string[]
    prompts: {
      enabled: boolean
      doubleClickToSend: boolean
      submitShortcut: "enter" | "ctrlEnter"
      promptQueue: boolean
      quickQuoteEnabled: boolean
    }
    conversations: {
      enabled: boolean
      syncUnpin: boolean
      syncDelete: boolean
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
    hideStatusWhenRead: boolean
    titleFormat: string
    showNotification: boolean
    notificationSound: boolean
    notificationSoundPreset: string
    notificationVolume: number
    notificationRepeatCount: number
    notificationRepeatInterval: number
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

  // 快捷按钮与工具箱配置
  quickButtons: QuickButtonsSettings

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
    provider?: WebDAVProvider // 服务商标识（可选，兼容旧数据）
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
  value: "81",
  unit: "%",
}

// 默认用户问题宽度配置（统一使用百分比，旧版 px 数据在 store 中自动迁移）
const DEFAULT_USER_QUERY_WIDTH: PageWidthConfig = {
  enabled: false,
  value: "81",
  unit: "%",
}

// 默认禅模式配置
const DEFAULT_ZEN_MODE: ZenModeConfig = {
  enabled: false,
  showExitButton: true,
}

const DEFAULT_PANEL_AVOIDANCE: PanelAvoidanceSettings = {
  enabled: true,
}

// 默认净化模式配置
const DEFAULT_CLEAN_MODE: ZenModeConfig = {
  enabled: true,
}

const DEFAULT_COLLAPSED_BUTTONS: QuickButtonConfig[] = [
  { id: "panel", enabled: true },
  { id: "floatingToolbar", enabled: true },
  { id: "globalSearch", enabled: true },
  { id: "theme", enabled: true },
  { id: "zenMode", enabled: true },
  { id: "settings", enabled: true },
  { id: "scrollTop", enabled: true },
  { id: "manualAnchor", enabled: false },
  { id: "anchor", enabled: true },
  { id: "scrollBottom", enabled: true },
]

export const DEFAULT_QUICK_BUTTONS_SETTINGS: QuickButtonsSettings = {
  collapsed: DEFAULT_COLLAPSED_BUTTONS.map((button) => ({ ...button })),
  opacity: 1,
  floatingToolbar: {
    open: true,
  },
  hideWhenPanelOpen: false,
  proximityRadius: 150,
}

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  hasAgreedToTerms: false,
  hasSeenOphelAdvancedGuide: false,

  panel: {
    panelExpanded: true,
    panelMode: "floating",
    preventAutoScroll: false,
    defaultPosition: "right",
    defaultEdgeDistance: 0,
    edgeSnapThreshold: 30,
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
    assistantMermaid: true, // 默认开启，仅对非原生 Mermaid 站点生效
    markdownFix: false,
    // 油猴脚本环境默认开启（GM_xmlhttpRequest 已通过 @grant 声明）
    watermarkRemoval: isUserscript,
    formulaCopy: true,
    formulaCopyFormat: "latex",
    formulaDelimiter: true,
    tableCopy: true,
    exportImagesToBase64: false,
    userQueryMarkdown: true, // 默认开启
  },

  export: {
    customUserName: "",
    customModelName: "",
    exportFilenameTimestamp: false,
    includeThoughts: true,
    packaging: "markdown",
  },

  theme: {
    syncNativePageTheme: true,
    sites: {
      gemini: { ...DEFAULT_SITE_THEME },
      "gemini-enterprise": { ...DEFAULT_SITE_THEME },
      doubao: { ...DEFAULT_SITE_THEME },
      ima: { ...DEFAULT_SITE_THEME },
      deepseek: { ...DEFAULT_SITE_THEME },
      yuanbao: { ...DEFAULT_SITE_THEME },
      zai: { ...DEFAULT_SITE_THEME },
      _default: { ...DEFAULT_SITE_THEME },
    },
    customStyles: [], // 空数组，用户可以添加自定义样式
  },

  layout: {
    pageWidth: {
      gemini: { ...DEFAULT_PAGE_WIDTH },
      "gemini-enterprise": { ...DEFAULT_PAGE_WIDTH },
      grok: { ...DEFAULT_PAGE_WIDTH },
      aistudio: { ...DEFAULT_PAGE_WIDTH },
      chatgpt: { ...DEFAULT_PAGE_WIDTH },
      claude: { ...DEFAULT_PAGE_WIDTH },
      chatglm: { ...DEFAULT_PAGE_WIDTH },
      doubao: { ...DEFAULT_PAGE_WIDTH },
      ima: { ...DEFAULT_PAGE_WIDTH },
      deepseek: { ...DEFAULT_PAGE_WIDTH },
      kimi: { ...DEFAULT_PAGE_WIDTH },
      qianwen: { ...DEFAULT_PAGE_WIDTH },
      qwenai: { ...DEFAULT_PAGE_WIDTH },
      yuanbao: { ...DEFAULT_PAGE_WIDTH },
      zai: { ...DEFAULT_PAGE_WIDTH },
      _default: { ...DEFAULT_PAGE_WIDTH },
    },
    userQueryWidth: {
      gemini: { ...DEFAULT_USER_QUERY_WIDTH },
      "gemini-enterprise": { ...DEFAULT_USER_QUERY_WIDTH },
      grok: { ...DEFAULT_USER_QUERY_WIDTH },
      aistudio: { ...DEFAULT_USER_QUERY_WIDTH },
      chatgpt: { ...DEFAULT_USER_QUERY_WIDTH },
      claude: { ...DEFAULT_USER_QUERY_WIDTH },
      chatglm: { ...DEFAULT_USER_QUERY_WIDTH },
      doubao: { ...DEFAULT_USER_QUERY_WIDTH },
      ima: { ...DEFAULT_USER_QUERY_WIDTH },
      deepseek: { ...DEFAULT_USER_QUERY_WIDTH },
      kimi: { ...DEFAULT_USER_QUERY_WIDTH },
      qianwen: { ...DEFAULT_USER_QUERY_WIDTH },
      qwenai: { ...DEFAULT_USER_QUERY_WIDTH },
      yuanbao: { ...DEFAULT_USER_QUERY_WIDTH },
      zai: { ...DEFAULT_USER_QUERY_WIDTH },
      _default: { ...DEFAULT_USER_QUERY_WIDTH },
    },
    zenMode: {
      gemini: { ...DEFAULT_ZEN_MODE },
      "gemini-enterprise": { ...DEFAULT_ZEN_MODE },
      grok: { ...DEFAULT_ZEN_MODE },
      aistudio: { ...DEFAULT_ZEN_MODE },
      chatgpt: { ...DEFAULT_ZEN_MODE },
      claude: { ...DEFAULT_ZEN_MODE },
      chatglm: { ...DEFAULT_ZEN_MODE },
      doubao: { ...DEFAULT_ZEN_MODE },
      ima: { ...DEFAULT_ZEN_MODE },
      deepseek: { ...DEFAULT_ZEN_MODE },
      kimi: { ...DEFAULT_ZEN_MODE },
      qianwen: { ...DEFAULT_ZEN_MODE },
      qwenai: { ...DEFAULT_ZEN_MODE },
      yuanbao: { ...DEFAULT_ZEN_MODE },
      zai: { ...DEFAULT_ZEN_MODE },
      _default: { ...DEFAULT_ZEN_MODE },
    },
    cleanMode: {
      gemini: { ...DEFAULT_CLEAN_MODE },
      "gemini-enterprise": { ...DEFAULT_CLEAN_MODE },
      aistudio: { ...DEFAULT_CLEAN_MODE },
      chatgpt: { ...DEFAULT_CLEAN_MODE },
      claude: { ...DEFAULT_CLEAN_MODE },
      chatglm: { ...DEFAULT_CLEAN_MODE },
      doubao: { ...DEFAULT_CLEAN_MODE },
      ima: { ...DEFAULT_CLEAN_MODE },
      deepseek: { ...DEFAULT_CLEAN_MODE },
      kimi: { ...DEFAULT_CLEAN_MODE },
      qianwen: { ...DEFAULT_CLEAN_MODE },
      qwenai: { ...DEFAULT_CLEAN_MODE },
      yuanbao: { ...DEFAULT_CLEAN_MODE },
      zai: { ...DEFAULT_CLEAN_MODE },
      _default: { ...DEFAULT_CLEAN_MODE },
    },
    panelAvoidance: {
      gemini: { ...DEFAULT_PANEL_AVOIDANCE },
      "gemini-enterprise": { ...DEFAULT_PANEL_AVOIDANCE },
      grok: { ...DEFAULT_PANEL_AVOIDANCE },
      aistudio: { ...DEFAULT_PANEL_AVOIDANCE },
      chatgpt: { ...DEFAULT_PANEL_AVOIDANCE },
      claude: { ...DEFAULT_PANEL_AVOIDANCE },
      chatglm: { ...DEFAULT_PANEL_AVOIDANCE },
      doubao: { ...DEFAULT_PANEL_AVOIDANCE },
      ima: { ...DEFAULT_PANEL_AVOIDANCE },
      deepseek: { ...DEFAULT_PANEL_AVOIDANCE },
      kimi: { ...DEFAULT_PANEL_AVOIDANCE },
      qianwen: { ...DEFAULT_PANEL_AVOIDANCE },
      qwenai: { ...DEFAULT_PANEL_AVOIDANCE },
      yuanbao: { ...DEFAULT_PANEL_AVOIDANCE },
      zai: { ...DEFAULT_PANEL_AVOIDANCE },
      _default: { ...DEFAULT_PANEL_AVOIDANCE },
    },
  },

  modelLock: {
    gemini: { enabled: false, keyword: "" },
    "gemini-enterprise": { enabled: false, keyword: "" },
    ima: { enabled: false, keyword: "" },
    qwenai: { enabled: false, keyword: "" },
    yuanbao: { enabled: false, keyword: "" },
  },

  globalSearch: {
    promptEnterBehavior: "smart",
    enableFuzzySearch: false,
    doubleShift: false,
  },

  usageMonitor: {
    enabled: false,
    dailyLimit: 100,
    autoResetEnabled: false,
  },

  features: {
    order: ["outline", "conversations", "prompts"],
    prompts: {
      enabled: true,
      doubleClickToSend: false,
      submitShortcut: "enter",
      promptQueue: false,
      quickQuoteEnabled: true,
    },
    conversations: {
      enabled: true,
      syncUnpin: false,
      syncDelete: true,
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
    openInNewTab: false,
    autoRename: true,
    renameInterval: 3,
    showStatus: true,
    hideStatusWhenRead: false,
    titleFormat: "{status}{title}->{model}",
    // 油猴脚本环境默认开启（GM_notification 已通过 @grant 声明）
    showNotification: isUserscript,
    notificationSound: true,
    notificationSoundPreset: "softChime",
    notificationVolume: 0.5,
    notificationRepeatCount: 3,
    notificationRepeatInterval: 2,
    notifyWhenFocused: false,
    autoFocus: false,
    privacyMode: false,
    privacyTitle: "Google",
    customIcon: "default",
  },

  readingHistory: {
    persistence: true,
    autoRestore: true,
    cleanupDays: 3,
  },

  quickButtons: {
    collapsed: DEFAULT_COLLAPSED_BUTTONS.map((button) => ({ ...button })),
    opacity: DEFAULT_QUICK_BUTTONS_SETTINGS.opacity,
    floatingToolbar: {
      ...DEFAULT_QUICK_BUTTONS_SETTINGS.floatingToolbar,
    },
    hideWhenPanelOpen: DEFAULT_QUICK_BUTTONS_SETTINGS.hideWhenPanelOpen,
    proximityRadius: DEFAULT_QUICK_BUTTONS_SETTINGS.proximityRadius,
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
    // 默认关闭
    markdownFix: false,
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
    return pageWidth[siteId]
  }
  return pageWidth?._default ?? DEFAULT_PAGE_WIDTH
}

export function getSiteModelLock(settings: Settings, siteId: string): ModelLockConfig {
  return settings.modelLock?.[siteId] ?? { enabled: false, keyword: "" }
}

export function getSiteUserQueryWidth(settings: Settings, siteId: string): PageWidthConfig {
  const userQueryWidth = settings.layout?.userQueryWidth
  if (userQueryWidth && siteId in userQueryWidth) {
    return userQueryWidth[siteId]
  }
  return userQueryWidth?._default ?? DEFAULT_USER_QUERY_WIDTH
}

export function getSiteZenMode(settings: Settings, siteId: string): ZenModeConfig {
  const zenMode = settings.layout?.zenMode
  if (zenMode && siteId in zenMode) {
    return zenMode[siteId]
  }
  return zenMode?._default ?? DEFAULT_ZEN_MODE
}

export function getSiteCleanMode(settings: Settings, siteId: string): ZenModeConfig {
  const cleanMode = settings.layout?.cleanMode
  if (cleanMode && siteId in cleanMode) {
    return cleanMode[siteId]
  }
  return cleanMode?._default ?? DEFAULT_CLEAN_MODE
}

export function getSitePanelAvoidance(settings: Settings, siteId: string): PanelAvoidanceSettings {
  const panelAvoidance = settings.layout?.panelAvoidance
  if (panelAvoidance && siteId in panelAvoidance) {
    return panelAvoidance[siteId]
  }
  return panelAvoidance?._default ?? DEFAULT_PANEL_AVOIDANCE
}

function getRawStorageValue<T>(key: string): Promise<T | undefined> {
  if (isUserscript) {
    const value = GM_getValue<T | undefined>(key, undefined)
    return Promise.resolve(value ?? undefined)
  }

  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return Promise.resolve(undefined)
  }

  return chrome.storage.local.get(key).then((result) => result[key] as T | undefined)
}

function removeRawStorageValue(key: string): Promise<void> {
  if (isUserscript) {
    GM_deleteValue(key)
    return Promise.resolve()
  }

  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return Promise.resolve()
  }

  return chrome.storage.local.remove(key)
}

let clearAllFlagPromise: Promise<boolean> | null = null

/**
 * 消费"清除全部数据"标记（仅首次返回 true）
 * - 用于在清除后首次加载时跳过自动恢复/自动同步
 * - 多处调用将共享结果，避免竞态
 */
export function consumeClearAllFlag(): Promise<boolean> {
  if (clearAllFlagPromise) {
    return clearAllFlagPromise
  }

  clearAllFlagPromise = (async () => {
    try {
      const rawValue = await getRawStorageValue<number>(CLEAR_ALL_FLAG_KEY)
      if (rawValue === undefined) {
        return false
      }

      const ts = typeof rawValue === "number" ? rawValue : Number(rawValue)
      if (!Number.isFinite(ts)) {
        return true
      }

      const age = Date.now() - ts
      if (age <= CLEAR_ALL_FLAG_TTL_MS) {
        return true
      }

      await removeRawStorageValue(CLEAR_ALL_FLAG_KEY)
      return false
    } catch (error) {
      console.warn("[Ophel] Failed to consume clear all flag:", error)
      return false
    }
  })()

  return clearAllFlagPromise
}

// 恢复备份标记（用于跳过恢复后的自动同步，保持备份文件的干净状态）
export const RESTORE_FLAG_KEY = "ophel:restoreFlag"
export const RESTORE_FLAG_TTL_MS = 10 * 1000

let restoreFlagPromise: Promise<boolean> | null = null

/**
 * 消费"恢复备份"标记（TTL 窗口内返回 true）
 * - 用于在恢复备份后跳过 autoFullSync，保持备份文件的干净状态
 * - 多处调用将共享结果，避免竞态
 */
export function consumeRestoreFlag(): Promise<boolean> {
  if (restoreFlagPromise) {
    return restoreFlagPromise
  }

  restoreFlagPromise = (async () => {
    try {
      const rawValue = await getRawStorageValue<number>(RESTORE_FLAG_KEY)
      if (rawValue === undefined) {
        return false
      }

      const ts = typeof rawValue === "number" ? rawValue : Number(rawValue)
      if (!Number.isFinite(ts)) {
        return true
      }

      const age = Date.now() - ts
      if (age <= RESTORE_FLAG_TTL_MS) {
        // 不立即移除，允许多个标签页在 TTL 窗口内都能读取到恢复标记，避免竞态
        return true
      }

      // 标记过期后清理，防止长期残留
      await removeRawStorageValue(RESTORE_FLAG_KEY)
      return false
    } catch (error) {
      console.warn("[Ophel] Failed to consume restore flag:", error)
      return false
    }
  })()

  return restoreFlagPromise
}

export function consumeSkipReadingHistoryRestoreFlag(): boolean {
  if (typeof window === "undefined") return false

  const url = new URL(window.location.href)
  if (url.searchParams.get(SKIP_READING_HISTORY_RESTORE_PARAM) !== "1") {
    return false
  }

  url.searchParams.delete(SKIP_READING_HISTORY_RESTORE_PARAM)
  const nextPath =
    `${url.pathname}${url.search}${url.hash}` ||
    window.location.pathname + window.location.search + window.location.hash
  window.history.replaceState(window.history.state, "", nextPath)
  return true
}
