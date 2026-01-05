/**
 * Settings Store - Zustand 状态管理
 *
 * 统一管理 settings 状态，替代多处 useStorage 调用
 * 使用 persist 中间件与 chrome.storage.local 同步
 */

import { create } from "zustand"
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware"

import { DEFAULT_SETTINGS, type Settings } from "~utils/storage"

// ==================== Chrome Storage 适配器 ====================

/**
 * chrome.storage.local 适配器
 * 用于 Zustand persist 中间件
 *
 * ⭐ 兼容性处理：
 * - Zustand persist 存储格式: { state: { settings: ... }, version: 0 }
 * - 原始格式（WebDAV 恢复/旧数据）: { themeMode: "light", ... }
 */
const chromeStorageAdapter: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return new Promise((resolve) => {
      chrome.storage.local.get(name, (result) => {
        const value = result[name]
        if (value === undefined) {
          resolve(null)
          return
        }

        // 解析值（可能是字符串或对象）
        let parsed: any = value
        if (typeof value === "string") {
          try {
            parsed = JSON.parse(value)
          } catch {
            // 如果解析失败，保持原始字符串
            resolve(value)
            return
          }
        }

        // ⭐ 检测存储格式（更严格的判断）
        // Zustand 格式: { state: { settings: {...} }, version: 0 }
        // 原始格式: { themeMode: "...", language: "...", ... }
        if (parsed && typeof parsed === "object") {
          // 1. 先检查是否是完整的 Zustand persist 格式
          if (parsed.state && typeof parsed.state === "object" && "settings" in parsed.state) {
            resolve(JSON.stringify(parsed))
          }
          // 2. 再检查是否是原始 Settings 格式（排除残缺的 Zustand 格式）
          else if (
            ("themeMode" in parsed || "language" in parsed || "tabOrder" in parsed) &&
            !("state" in parsed)
          ) {
            // 转换为 Zustand persist 期望的格式
            const zustandFormat = {
              state: { settings: parsed },
              version: 0,
            }
            resolve(JSON.stringify(zustandFormat))
          }
          // 3. 未知格式，尝试直接返回
          else {
            resolve(JSON.stringify(parsed))
          }
        } else {
          resolve(typeof value === "string" ? value : JSON.stringify(value))
        }
      })
    })
  },

  setItem: async (name: string, value: string): Promise<void> => {
    return new Promise((resolve) => {
      // ⭐ 直接存储 JSON 字符串，确保与 Plasmo storage.watch 兼容
      // Plasmo 的 parseValue 会调用 JSON.parse，期望收到字符串
      // 如果存储对象，watch 回调收到对象后 parseValue 会报错：
      // SyntaxError: "[object Object]" is not valid JSON
      chrome.storage.local.set({ [name]: value }, () => {
        resolve()
      })
    })
  },

  removeItem: async (name: string): Promise<void> => {
    return new Promise((resolve) => {
      chrome.storage.local.remove(name, () => {
        resolve()
      })
    })
  },
}

// ==================== Store 类型定义 ====================

interface SettingsState {
  // 状态
  settings: Settings
  _hasHydrated: boolean

  // Actions
  setSettings: (settings: Partial<Settings>) => void
  updateNestedSetting: <K extends keyof Settings>(
    section: K,
    key: keyof Settings[K],
    value: any,
  ) => void
  replaceSettings: (settings: Settings) => void
  resetSettings: () => void
  setHasHydrated: (state: boolean) => void
}

// ==================== Store 创建 ====================

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      _hasHydrated: false,

      /**
       * 合并更新 settings
       */
      setSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      /**
       * 更新嵌套设置项
       * 例如: updateNestedSetting("outline", "enabled", true)
       */
      updateNestedSetting: (section, key, value) =>
        set((state) => ({
          settings: {
            ...state.settings,
            [section]: {
              ...(state.settings[section] as object),
              [key]: value,
            },
          },
        })),

      /**
       * 完全替换 settings（用于 WebDAV 恢复等场景）
       */
      replaceSettings: (settings) =>
        set({
          settings: { ...DEFAULT_SETTINGS, ...settings },
        }),

      /**
       * 重置为默认设置
       */
      resetSettings: () =>
        set({
          settings: DEFAULT_SETTINGS,
        }),

      /**
       * 设置 hydration 状态
       */
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: "settings", // chrome.storage key
      storage: createJSONStorage(() => chromeStorageAdapter),
      // 只持久化 settings，不持久化 _hasHydrated
      partialize: (state) => ({ settings: state.settings }),
      // Hydration 完成回调
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)

// ==================== 便捷 Hook ====================

/**
 * 等待 Store hydration 完成的 Hook
 * 在需要等待数据加载完成的场景使用
 */
export const useSettingsHydrated = () => useSettingsStore((state) => state._hasHydrated)

/**
 * 只订阅 settings 的便捷 Hook
 */
export const useSettings = () => useSettingsStore((state) => state.settings)

// ==================== 非 React 环境使用 ====================

/**
 * 在非 React 环境（如 main.ts）中获取当前 settings
 * 注意：首次调用时可能还未完成 hydration
 */
export const getSettingsState = () => useSettingsStore.getState().settings

/**
 * 在非 React 环境中更新 settings
 */
export const setSettingsState = (settings: Partial<Settings>) =>
  useSettingsStore.getState().setSettings(settings)

/**
 * 订阅 settings 变化（用于 main.ts 等非 React 模块）
 * 返回取消订阅函数
 */
export const subscribeSettings = (listener: (settings: Settings) => void) =>
  useSettingsStore.subscribe((state) => listener(state.settings))
