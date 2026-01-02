/**
 * Chat Helper - 存储抽象层
 *
 * 区分云同步 (sync) 和本地存储 (local)
 */

import { Storage } from "@plasmohq/storage"

// 云同步存储 - 设置项
export const syncStorage = new Storage({ area: "sync" })

// 本地存储 - 大数据
export const localStorage = new Storage({ area: "local" })

// ==================== 存储键定义 ====================

export const STORAGE_KEYS = {
  // 云同步 (sync) - 设置类 (Monolithic object)
  SETTINGS: "settings",

  // 云同步 (sync) - 尝试同步的轻量数据
  FOLDERS: "folders",
  TAGS: "tags",

  // 本地存储 (local) - 大数据
  LOCAL: {
    PROMPTS: "prompts",
    CONVERSATIONS: "conversations",
    READING_HISTORY: "readingHistory",
  },
} as const

// ==================== 类型定义 ====================

export interface Settings {
  language: string
  markdownFix: boolean
  themeMode: "light" | "dark"
  defaultPanelOpen: boolean
  autoHidePanel: boolean
  edgeSnapHide: boolean // 边缘吸附隐藏
  preventAutoScroll: boolean // 防止自动滚动
  watermarkRemoval: boolean // 水印移除
  pageWidth: { enabled: boolean; value: string; unit: string }
  modelLock: {
    enabled: boolean
    keyword: string
  }
  outline: {
    enabled: boolean
    maxLevel: number
    autoUpdate: boolean
    updateInterval: number // 更新间隔(秒)
    showUserQueries: boolean
    followMode: "current" | "latest" | "manual" // 大纲跟随模式
    expandLevel: number // 展开层级（持久化）
  }
  readingHistory: {
    persistence: boolean
    autoRestore: boolean
    cleanupDays: number
  }
  tabSettings: {
    openInNewTab: boolean
    autoRenameTab: boolean
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
  conversations: {
    enabled: boolean
    syncUnpin: boolean
    folderRainbow: boolean
    exportImagesToBase64: boolean
  }
  prompts: {
    enabled: boolean
  }
  tabOrder: string[]
  collapsedButtonsOrder: Array<{ id: string; enabled: boolean }> // 快捷按钮组配置
  clearTextareaOnSend: boolean // Gemini Business 专属：发送后修复中文输入
  copy: {
    formulaCopyEnabled: boolean
    formulaDelimiterEnabled: boolean
    tableCopyEnabled: boolean
  }
}

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  markdownFix: true,
  themeMode: "light",
  defaultPanelOpen: false,
  autoHidePanel: false,
  edgeSnapHide: false,
  preventAutoScroll: false,
  watermarkRemoval: true,
  pageWidth: { enabled: false, value: "100", unit: "%" },
  modelLock: { enabled: false, keyword: "" },
  outline: {
    enabled: true,
    maxLevel: 6,
    autoUpdate: true,
    updateInterval: 2,
    showUserQueries: true,
    followMode: "current", // 默认跟随当前位置
    expandLevel: 6,
  },
  readingHistory: {
    persistence: true,
    autoRestore: true,
    cleanupDays: 30,
  },
  tabSettings: {
    openInNewTab: true,
    autoRenameTab: false,
    renameInterval: 3,
    showStatus: true,
    titleFormat: "{status}{title}",
    showNotification: true,
    notificationSound: false,
    notificationVolume: 0.5,
    notifyWhenFocused: false,
    autoFocus: false,
    privacyMode: false,
    privacyTitle: "Google",
    customIcon: "default",
  },
  conversations: {
    enabled: true,
    syncUnpin: false,
    folderRainbow: true,
    exportImagesToBase64: false,
  },
  prompts: {
    enabled: true,
  },
  tabOrder: ["prompts", "conversations", "outline", "settings"],
  collapsedButtonsOrder: [
    { id: "scrollTop", enabled: true },
    { id: "panel", enabled: true },
    { id: "anchor", enabled: true },
    { id: "theme", enabled: true },
    { id: "manualAnchor", enabled: true },
    { id: "scrollBottom", enabled: true },
  ],
  clearTextareaOnSend: false, // Gemini Business 专属：发送后修复中文输入
  copy: {
    formulaCopyEnabled: true,
    formulaDelimiterEnabled: true,
    tableCopyEnabled: true,
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
}

// ==================== 通用存储操作 ====================

/**
 * 获取设置项
 */
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const value = await syncStorage.get(key)
  return (value !== undefined ? value : defaultValue) as T
}

/**
 * 保存设置项
 */
export async function setSetting<T>(key: string, value: T): Promise<void> {
  await syncStorage.set(key, value)
}

/**
 * 获取本地数据
 */
export async function getLocalData<T>(key: string, defaultValue: T): Promise<T> {
  const value = await localStorage.get(key)
  return (value !== undefined ? value : defaultValue) as T
}

/**
 * 保存本地数据
 */
export async function setLocalData<T>(key: string, value: T): Promise<void> {
  await localStorage.set(key, value)
}
