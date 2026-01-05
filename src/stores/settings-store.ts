/**
 * Settings Store - Zustand 状态管理
 *
 * 统一管理 settings 状态，替代多处 useStorage 调用
 * 使用 persist 中间件与 chrome.storage.local 同步
 */

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { DEFAULT_SETTINGS, type Settings } from "~utils/storage"

import { chromeStorageAdapter } from "./chrome-adapter"

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
