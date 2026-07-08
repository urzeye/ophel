/**
 * Ophel - 存储抽象层
 *
 * 使用 local 存储
 */

import { Storage } from "@plasmohq/storage"

import { isUserscriptPlatform } from "~platform/utils"

// GM API 类型声明（仅在 userscript 环境使用）
declare function GM_getValue<T>(key: string, defaultValue?: T): T
declare function GM_deleteValue(key: string): void

// 油猴脚本环境标识（用于设置默认值）
const isUserscript = isUserscriptPlatform()

// 本地存储 - 用于非 Zustand 管理的数据
export const localStorage = new Storage({ area: "local" })

export { DEFAULT_QUICK_BUTTONS_SETTINGS, DEFAULT_SETTINGS } from "~constants/default-settings"
export type {
  AIStudioSettings,
  ChatGPTSettings,
  CustomStyle,
  ExportPackaging,
  ExportSettings,
  FormulaCopyFormat,
  ModelLockConfig,
  PageWidthConfig,
  PanelAvoidanceSettings,
  QuickButtonConfig,
  QuickButtonsPosition,
  QuickButtonsSettings,
  Settings,
  SiteId,
  SiteThemeConfig,
  ThemeMode,
  UsageMonitorSettings,
  ZenModeConfig,
} from "~types/settings"

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

// Settings 类型与默认值在独立文件维护；本文件保留兼容导出。

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

export {
  getSiteCleanMode,
  getSiteModelLock,
  getSitePageWidth,
  getSitePanelAvoidance,
  getSiteTheme,
  getSiteUserQueryWidth,
  getSiteZenMode,
} from "~utils/settings-selectors"

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
