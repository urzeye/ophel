/**
 * Settings Store - Zustand 状态管理
 *
 * 统一管理 settings 状态，替代多处 useStorage 调用
 * 使用 persist 中间件与 chrome.storage.local 同步
 */

import { create } from "zustand"
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware"

import { DEFAULT_SETTINGS, type Settings } from "~utils/storage"

import { chromeStorageAdapter } from "./chrome-adapter"

let isUpdatingFromStorage = false

// 包装 adapter 以支持防循环写入
const storageAdapter: StateStorage = {
  ...chromeStorageAdapter,
  setItem: async (name, value) => {
    if (isUpdatingFromStorage) {
      return
    }
    return chromeStorageAdapter.setItem(name, value)
  },
}

// ==================== Store 类型定义 ====================

interface SettingsState {
  // 状态
  settings: Settings
  _hasHydrated: boolean
  _syncVersion: number // 跨上下文同步版本号，每次同步时递增，用于强制 React 重渲染

  // Actions
  setSettings: (settings: Partial<Settings>) => void
  updateNestedSetting: <K extends keyof Settings>(
    section: K,
    key: keyof Settings[K],
    value: any,
  ) => void
  updateDeepSetting: (section: keyof Settings, subsection: string, key: string, value: any) => void
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
      _syncVersion: 0,

      /**
       * 合并更新 settings
       */
      setSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      /**
       * 更新嵌套设置项
       * 例如: updateNestedSetting("tab", "autoRename", true)
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
       * 更新深层嵌套设置项（三层）
       * 例如: updateDeepSetting("features", "outline", "enabled", true)
       */
      updateDeepSetting: (section, subsection, key, value) =>
        set((state) => {
          const sectionObj = state.settings[section] as Record<string, unknown>
          const subsectionObj = (sectionObj?.[subsection] || {}) as Record<string, unknown>
          return {
            settings: {
              ...state.settings,
              [section]: {
                ...sectionObj,
                [subsection]: {
                  ...subsectionObj,
                  [key]: value,
                },
              },
            },
          }
        }),

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
      storage: createJSONStorage(() => storageAdapter),
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

// 构建时注入的平台标识
declare const __PLATFORM__: "extension" | "userscript"

/**
 * 监听 chrome.storage.onChanged 事件（仅浏览器扩展环境）
 * 当其他上下文（如 Options 页面）更新 settings 时，自动同步到当前 store
 * 实现设置的实时生效
 */
const isExtension =
  (typeof __PLATFORM__ === "undefined" || __PLATFORM__ !== "userscript") &&
  typeof chrome !== "undefined" &&
  chrome.storage?.onChanged

if (isExtension) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return
    if (!changes.settings) return

    const newValue = changes.settings.newValue
    if (!newValue) return

    try {
      // 解析 Zustand persist 格式的数据
      const parsed = typeof newValue === "string" ? JSON.parse(newValue) : newValue
      const newSettings = parsed?.state?.settings

      if (newSettings) {
        const currentState = useSettingsStore.getState()
        const currentSettings = currentState.settings
        // 仅当设置确实发生变化时更新（避免循环更新）
        // 使用 sortedStringify 进行稳定比较
        const sortedStringify = (obj: any): string => {
          if (typeof obj !== "object" || obj === null) return JSON.stringify(obj)
          if (Array.isArray(obj)) return JSON.stringify(obj.map(sortedStringify))
          return JSON.stringify(
            Object.keys(obj)
              .sort()
              .reduce((result: any, key) => {
                result[key] = sortedStringify(obj[key])
                return result
              }, {}),
          )
        }

        if (sortedStringify(currentSettings) !== sortedStringify(newSettings)) {
          // 标记为来自 Storage 的更新，防止回写导致死循环
          isUpdatingFromStorage = true

          try {
            // 同时更新 settings 和递增 _syncVersion
            // _syncVersion 变化会强制触发所有订阅它的 React 组件重渲染
            useSettingsStore.setState({
              settings: newSettings,
              _syncVersion: currentState._syncVersion + 1,
            })
          } finally {
            // 恢复标记 (setTimeout 确保在 persist 异步写入之后)
            setTimeout(() => {
              isUpdatingFromStorage = false
            }, 100)
          }

          // 同步更新 i18n 模块的语言设置
          if (newSettings.language && newSettings.language !== currentSettings.language) {
            import("~utils/i18n")
              .then(({ setLanguage }) => {
                setLanguage(newSettings.language)
              })
              .catch(() => {
                // ignore
              })
          }

          console.log("[SettingsStore] 跨上下文同步完成, version:", currentState._syncVersion + 1)
        }
      }
    } catch (err) {
      console.error("[SettingsStore] 解析跨上下文设置变更失败:", err)
    }
  })
}
