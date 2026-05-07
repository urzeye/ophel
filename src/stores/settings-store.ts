/**
 * Settings Store - Zustand 状态管理
 *
 * 统一管理 settings 状态，替代多处 useStorage 调用
 * 使用 persist 中间件与 chrome.storage.local 同步
 */

import { create } from "zustand"
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware"

import { LAYOUT_CONFIG } from "~constants"
import { normalizeShortcutsSettings } from "~constants/shortcuts"
import {
  DEFAULT_QUICK_BUTTONS_SETTINGS,
  DEFAULT_SETTINGS,
  type PageWidthConfig,
  type QuickButtonConfig,
  type QuickButtonsPosition,
  type Settings,
} from "~utils/storage"

import { chromeStorageAdapter } from "./chrome-adapter"

let isUpdatingFromStorage = false
let skippedPersistWrites = 0

const releaseSkippedPersistWrite = () => {
  const release = () => {
    skippedPersistWrites = Math.max(0, skippedPersistWrites - 1)
  }

  if (typeof queueMicrotask === "function") {
    queueMicrotask(release)
    return
  }

  void Promise.resolve().then(release)
}

const runWithoutPersist = <T>(callback: () => T): T => {
  skippedPersistWrites += 1

  try {
    return callback()
  } finally {
    releaseSkippedPersistWrite()
  }
}

type LegacyQuickButtonsSettings = {
  collapsedButtons?: QuickButtonConfig[]
  quickButtonsOpacity?: number
  toolsMenu?: string[]
  floatingToolbar?: {
    open?: boolean
  }
}

type SettingsInput = Omit<Partial<Settings>, "quickButtons"> & {
  quickButtons?: Partial<Settings["quickButtons"]>
} & LegacyQuickButtonsSettings

const ensureQuickButton = (
  buttons: QuickButtonConfig[],
  button: QuickButtonConfig,
  insertAfterId?: string,
): QuickButtonConfig[] => {
  if (buttons.some((item) => item.id === button.id)) return buttons

  const nextButtons = [...buttons]
  const insertIndex = insertAfterId
    ? nextButtons.findIndex((item) => item.id === insertAfterId) + 1
    : nextButtons.length

  nextButtons.splice(insertIndex > 0 ? insertIndex : nextButtons.length, 0, button)
  return nextButtons
}

const normalizeQuickButtonsPosition = (
  position?: Partial<QuickButtonsPosition> | null,
): QuickButtonsPosition | undefined => {
  if (!position) return undefined

  const xRatio = Number(position.xRatio)
  const yRatio = Number(position.yRatio)

  if (!Number.isFinite(xRatio) || !Number.isFinite(yRatio)) return undefined

  return {
    xRatio: Math.min(1, Math.max(0, xRatio)),
    yRatio: Math.min(1, Math.max(0, yRatio)),
  }
}

const normalizeQuickButtons = (settings: SettingsInput): Settings["quickButtons"] => {
  const legacyCollapsed = Array.isArray(settings.collapsedButtons) ? settings.collapsedButtons : []
  const quickButtons = settings.quickButtons || {}
  const collapsedSource = quickButtons.collapsed ?? legacyCollapsed

  let collapsed =
    collapsedSource.length > 0
      ? collapsedSource
          .filter((button): button is QuickButtonConfig => Boolean(button?.id))
          .map((button) => ({
            id: button.id,
            enabled: button.enabled !== false,
          }))
      : DEFAULT_QUICK_BUTTONS_SETTINGS.collapsed.map((button) => ({ ...button }))

  collapsed = ensureQuickButton(collapsed, { id: "floatingToolbar", enabled: true }, "panel")
  collapsed = ensureQuickButton(collapsed, { id: "globalSearch", enabled: true }, "floatingToolbar")
  collapsed = ensureQuickButton(collapsed, { id: "zenMode", enabled: true }, "theme")
  collapsed = ensureQuickButton(collapsed, { id: "settings", enabled: true }, "zenMode")

  return {
    collapsed,
    opacity:
      quickButtons.opacity ??
      settings.quickButtonsOpacity ??
      DEFAULT_QUICK_BUTTONS_SETTINGS.opacity,
    hideWhenPanelOpen:
      quickButtons.hideWhenPanelOpen ?? DEFAULT_QUICK_BUTTONS_SETTINGS.hideWhenPanelOpen,
    toolsMenu: quickButtons.toolsMenu ?? settings.toolsMenu,
    floatingToolbar: {
      ...DEFAULT_QUICK_BUTTONS_SETTINGS.floatingToolbar,
      ...(settings.floatingToolbar || {}),
      ...(quickButtons.floatingToolbar || {}),
    },
    position: normalizeQuickButtonsPosition(quickButtons.position),
  }
}

type WidthConfigKind = "PAGE_WIDTH" | "USER_QUERY_WIDTH"

type SiteThemeRecord = NonNullable<Settings["theme"]["sites"]>
type SiteConfigRecord<T> = Record<string, Partial<T>>

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const normalizePercentWidthConfig = (
  config: Partial<PageWidthConfig> | undefined,
  kind: WidthConfigKind,
): PageWidthConfig => {
  const layoutDefaults = LAYOUT_CONFIG[kind]
  const defaultPercent = Number.parseInt(layoutDefaults.DEFAULT_PERCENT, 10)
  const defaultPx = Number.parseInt(layoutDefaults.DEFAULT_PX, 10)
  const rawValue = Number.parseInt(String(config?.value ?? layoutDefaults.DEFAULT_PERCENT), 10)
  const sourceUnit = config?.unit === "px" ? "px" : "%"

  let nextValue = Number.isNaN(rawValue) ? defaultPercent : rawValue

  // 兼容旧版 px 数据：按旧默认值与新默认百分比的比例换算到百分比区间。
  if (sourceUnit === "px") {
    nextValue = Math.round((nextValue / defaultPx) * defaultPercent)
  }

  return {
    enabled: config?.enabled ?? false,
    value: String(clamp(nextValue, layoutDefaults.MIN_PERCENT, layoutDefaults.MAX_PERCENT)),
    unit: "%",
  }
}

const normalizeWidthRecord = (
  record: Record<string, Partial<PageWidthConfig>> | undefined,
  kind: WidthConfigKind,
  fallback: Record<string, PageWidthConfig>,
): Record<string, PageWidthConfig> => {
  const result: Record<string, PageWidthConfig> = { ...fallback }
  const siteIds = new Set([...Object.keys(fallback), ...Object.keys(record ?? {})])

  // 归一化时同时保留已保存的站点键，避免新增/未列入默认表的站点配置被覆盖丢失。
  siteIds.forEach((siteId) => {
    result[siteId] = normalizePercentWidthConfig(record?.[siteId] ?? fallback[siteId], kind)
  })

  return result
}

const normalizeSiteThemeRecord = (record: SiteThemeRecord | undefined): SiteThemeRecord => {
  const result: SiteThemeRecord = { ...DEFAULT_SETTINGS.theme.sites }
  const siteIds = new Set([
    ...Object.keys(DEFAULT_SETTINGS.theme.sites),
    ...Object.keys(record ?? {}),
  ])

  siteIds.forEach((siteId) => {
    result[siteId as keyof SiteThemeRecord] = {
      ...(DEFAULT_SETTINGS.theme.sites[siteId as keyof SiteThemeRecord] ??
        DEFAULT_SETTINGS.theme.sites._default),
      ...(record?.[siteId as keyof SiteThemeRecord] ?? {}),
    }
  })

  return result
}

const normalizeSiteConfigRecord = <T extends object>(
  record: SiteConfigRecord<T> | undefined,
  fallback: Record<string, T>,
): Record<string, T> => {
  const result: Record<string, T> = { ...fallback }
  const siteIds = new Set([...Object.keys(fallback), ...Object.keys(record ?? {})])

  siteIds.forEach((siteId) => {
    result[siteId] = {
      ...(fallback[siteId] ?? fallback._default ?? {}),
      ...(record?.[siteId] ?? {}),
    } as T
  })

  return result
}

const normalizePanelSettings = (panel?: Partial<Settings["panel"]>): Settings["panel"] => {
  const defaults = DEFAULT_SETTINGS.panel

  return {
    panelExpanded: panel?.panelExpanded ?? defaults.panelExpanded,
    panelMode:
      panel?.panelMode === "edge-snap" || panel?.panelMode === "floating"
        ? panel.panelMode
        : defaults.panelMode,
    preventAutoScroll: panel?.preventAutoScroll ?? defaults.preventAutoScroll,
    defaultPosition:
      panel?.defaultPosition === "left" || panel?.defaultPosition === "right"
        ? panel.defaultPosition
        : defaults.defaultPosition,
    defaultEdgeDistance: panel?.defaultEdgeDistance ?? defaults.defaultEdgeDistance,
    edgeSnapThreshold: panel?.edgeSnapThreshold ?? defaults.edgeSnapThreshold,
    height: panel?.height ?? defaults.height,
    width: panel?.width ?? defaults.width,
  }
}

const normalizeSettings = (settings: SettingsInput): Settings => {
  const {
    collapsedButtons: _legacyCollapsedButtons,
    quickButtonsOpacity: _legacyQuickButtonsOpacity,
    toolsMenu: _legacyToolsMenu,
    floatingToolbar: _legacyFloatingToolbar,
    quickButtons: _quickButtons,
    ...rest
  } = settings

  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    panel: normalizePanelSettings(settings.panel),
    content: {
      ...DEFAULT_SETTINGS.content,
      ...settings.content,
    },
    theme: {
      ...DEFAULT_SETTINGS.theme,
      ...settings.theme,
      sites: normalizeSiteThemeRecord(settings.theme?.sites),
      customStyles: settings.theme?.customStyles ?? DEFAULT_SETTINGS.theme.customStyles,
    },
    layout: {
      ...DEFAULT_SETTINGS.layout,
      ...settings.layout,
      pageWidth: normalizeWidthRecord(
        settings.layout?.pageWidth,
        "PAGE_WIDTH",
        DEFAULT_SETTINGS.layout.pageWidth,
      ),
      userQueryWidth: normalizeWidthRecord(
        settings.layout?.userQueryWidth,
        "USER_QUERY_WIDTH",
        DEFAULT_SETTINGS.layout.userQueryWidth,
      ),
      zenMode: normalizeSiteConfigRecord(settings.layout?.zenMode, DEFAULT_SETTINGS.layout.zenMode),
      cleanMode: normalizeSiteConfigRecord(
        settings.layout?.cleanMode,
        DEFAULT_SETTINGS.layout.cleanMode,
      ),
    },
    modelLock: normalizeSiteConfigRecord(settings.modelLock, DEFAULT_SETTINGS.modelLock),
    globalSearch: {
      ...DEFAULT_SETTINGS.globalSearch,
      ...settings.globalSearch,
    },
    usageMonitor: {
      ...DEFAULT_SETTINGS.usageMonitor,
      ...settings.usageMonitor,
    },
    features: {
      ...DEFAULT_SETTINGS.features,
      ...settings.features,
      outline: {
        ...DEFAULT_SETTINGS.features.outline,
        ...settings.features?.outline,
      },
      prompts: {
        ...DEFAULT_SETTINGS.features.prompts,
        ...settings.features?.prompts,
      },
      conversations: {
        ...DEFAULT_SETTINGS.features.conversations,
        ...settings.features?.conversations,
      },
    },
    tab: {
      ...DEFAULT_SETTINGS.tab,
      ...settings.tab,
    },
    readingHistory: {
      ...DEFAULT_SETTINGS.readingHistory,
      ...settings.readingHistory,
    },
    export: {
      ...DEFAULT_SETTINGS.export,
      ...settings.export,
    },
    geminiEnterprise: {
      ...DEFAULT_SETTINGS.geminiEnterprise,
      ...settings.geminiEnterprise,
      policyRetry: {
        ...DEFAULT_SETTINGS.geminiEnterprise?.policyRetry,
        ...settings.geminiEnterprise?.policyRetry,
      },
    },
    webdav: {
      ...DEFAULT_SETTINGS.webdav,
      ...settings.webdav,
    },
    aistudio: {
      ...DEFAULT_SETTINGS.aistudio,
      ...settings.aistudio,
    },
    chatgpt: {
      ...DEFAULT_SETTINGS.chatgpt,
      ...settings.chatgpt,
    },
    shortcuts: normalizeShortcutsSettings(settings.shortcuts) || DEFAULT_SETTINGS.shortcuts,
    quickButtons: normalizeQuickButtons(settings),
  }
}

const sortedStringify = (obj: unknown): string => {
  if (typeof obj !== "object" || obj === null) return JSON.stringify(obj)
  if (Array.isArray(obj)) return JSON.stringify(obj.map(sortedStringify))
  return JSON.stringify(
    Object.keys(obj)
      .sort()
      .reduce<Record<string, string>>((result, key) => {
        result[key] = sortedStringify((obj as Record<string, unknown>)[key])
        return result
      }, {}),
  )
}

// 包装 adapter 以支持防循环写入
const storageAdapter: StateStorage = {
  ...chromeStorageAdapter,
  setItem: async (name, value) => {
    if (isUpdatingFromStorage || skippedPersistWrites > 0) {
      return
    }
    return chromeStorageAdapter.setItem(name, value)
  },
}

// ==================== Store 类型定义 ====================

interface SettingsState {
  // 状态
  settings: Settings
  persistedSettings: Settings
  previewSettings: Partial<Settings> | null
  _hasHydrated: boolean
  _syncVersion: number // 跨上下文同步版本号，每次同步时递增，用于强制 React 重渲染

  // Actions
  setSettings: (settings: Partial<Settings>) => void
  setPreviewSettings: (settings: Partial<Settings> | null) => void
  clearPreviewSettings: () => void
  updateNestedSetting: <K extends keyof Settings>(
    section: K,
    key: keyof Settings[K],
    value: unknown,
  ) => void
  updateDeepSetting: (
    section: keyof Settings,
    subsection: string,
    key: string,
    value: unknown,
  ) => void
  replaceSettings: (settings: Settings) => void
  resetSettings: () => void
  setHasHydrated: (state: boolean) => void
}

// ==================== Store 创建 ====================

const buildEffectiveSettings = (
  persistedSettings: Settings,
  previewSettings: Partial<Settings> | null,
): Settings =>
  previewSettings
    ? normalizeSettings({ ...persistedSettings, ...previewSettings })
    : persistedSettings

// Captured set for safe hydration (avoids referencing store variable before assignment in sync hydration)
let _hydrationSet: ((partial: Partial<SettingsState>) => void) | null = null

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, _get) => (
      (_hydrationSet = set),
      {
        settings: DEFAULT_SETTINGS,
        persistedSettings: DEFAULT_SETTINGS,
        previewSettings: null,
        _hasHydrated: false,
        _syncVersion: 0,

        /**
         * 合并更新 settings
         */
        setSettings: (newSettings) =>
          set((state) => {
            const nextPersistedSettings = normalizeSettings({
              ...state.persistedSettings,
              ...newSettings,
            })

            return {
              persistedSettings: nextPersistedSettings,
              previewSettings: null,
              settings: nextPersistedSettings,
            }
          }),

        /**
         * 设置临时预览 settings（不持久化）
         */
        setPreviewSettings: (previewSettings) =>
          runWithoutPersist(() =>
            set((state) => ({
              previewSettings,
              settings: buildEffectiveSettings(state.persistedSettings, previewSettings),
            })),
          ),

        /**
         * 清除临时预览 settings
         */
        clearPreviewSettings: () =>
          runWithoutPersist(() =>
            set((state) => ({
              previewSettings: null,
              settings: state.persistedSettings,
            })),
          ),

        /**
         * 更新嵌套设置项
         * 例如: updateNestedSetting("tab", "autoRename", true)
         */
        updateNestedSetting: (section, key, value) =>
          set((state) => {
            const nextPersistedSettings = normalizeSettings({
              ...state.persistedSettings,
              [section]: {
                ...(state.persistedSettings[section] as object),
                [key]: value,
              },
            })

            return {
              persistedSettings: nextPersistedSettings,
              previewSettings: null,
              settings: nextPersistedSettings,
            }
          }),

        /**
         * 更新深层嵌套设置项（三层）
         * 例如: updateDeepSetting("features", "outline", "enabled", true)
         */
        updateDeepSetting: (section, subsection, key, value) =>
          set((state) => {
            const sectionObj = state.persistedSettings[section] as Record<string, unknown>
            const subsectionObj = (sectionObj?.[subsection] || {}) as Record<string, unknown>
            const nextPersistedSettings = normalizeSettings({
              ...state.persistedSettings,
              [section]: {
                ...sectionObj,
                [subsection]: {
                  ...subsectionObj,
                  [key]: value,
                },
              },
            })

            return {
              persistedSettings: nextPersistedSettings,
              previewSettings: null,
              settings: nextPersistedSettings,
            }
          }),

        /**
         * 完全替换 settings（用于 WebDAV 恢复等场景）
         */
        replaceSettings: (settings) =>
          set(() => {
            const nextPersistedSettings = normalizeSettings({ ...DEFAULT_SETTINGS, ...settings })

            return {
              persistedSettings: nextPersistedSettings,
              previewSettings: null,
              settings: nextPersistedSettings,
            }
          }),

        /**
         * 重置为默认设置
         */
        resetSettings: () =>
          set(() => {
            const nextPersistedSettings = normalizeSettings(DEFAULT_SETTINGS)

            return {
              persistedSettings: nextPersistedSettings,
              previewSettings: null,
              settings: nextPersistedSettings,
            }
          }),

        /**
         * 设置 hydration 状态
         */
        setHasHydrated: (state) => runWithoutPersist(() => set({ _hasHydrated: state })),
      }
    ),
    {
      name: "settings", // chrome.storage key
      storage: createJSONStorage(() => storageAdapter),
      // 只持久化 settings，不持久化 _hasHydrated
      partialize: (state) => ({ settings: state.persistedSettings }),
      // 自定义 merge，确保 hydration 后 settings / persistedSettings 同步一致，
      // 避免默认浅合并让 persistedSettings 暂时回落到 DEFAULT_SETTINGS。
      merge: (persistedState, currentState) => {
        try {
          const persistedSettings = (persistedState as { settings?: SettingsInput } | undefined)
            ?.settings
          const normalizedSettings = normalizeSettings(
            persistedSettings ?? currentState.persistedSettings,
          )

          return {
            ...currentState,
            settings: normalizedSettings,
            persistedSettings: normalizedSettings,
            previewSettings: null,
          }
        } catch (e) {
          console.error("[ophel] settings merge THREW:", e)
          throw e
        }
      },
      // Hydration 完成回调
      onRehydrateStorage: () => {
        return (state, _error) => {
          runWithoutPersist(() => {
            if (state) {
              const normalizedSettings = normalizeSettings(state.settings)
              _hydrationSet?.({
                persistedSettings: normalizedSettings,
                previewSettings: null,
                settings: normalizedSettings,
                _hasHydrated: true,
              })
              return
            }

            // 首次空存储时，persist 可能不会把 state 实例传入回调。
            // 这里直接用 captured set 兜底，确保 userscript / extension 都能结束 hydration。
            _hydrationSet?.({ _hasHydrated: true })
          })
        }
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

/**
 * 只订阅已持久化的 settings（不包含预览态）
 */
export const usePersistedSettings = () => useSettingsStore((state) => state.persistedSettings)

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
        const normalizedIncomingSettings = normalizeSettings(newSettings)
        const currentState = useSettingsStore.getState()
        const currentPersistedSettings = currentState.persistedSettings
        // 仅当设置确实发生变化时更新（避免循环更新）

        if (
          sortedStringify(currentPersistedSettings) !== sortedStringify(normalizedIncomingSettings)
        ) {
          // 标记为来自 Storage 的更新，防止回写导致死循环
          isUpdatingFromStorage = true

          try {
            // 同时更新 settings 和递增 _syncVersion
            // _syncVersion 变化会强制触发所有订阅它的 React 组件重渲染
            useSettingsStore.setState({
              persistedSettings: normalizedIncomingSettings,
              settings: buildEffectiveSettings(
                normalizedIncomingSettings,
                currentState.previewSettings,
              ),
              _syncVersion: currentState._syncVersion + 1,
            })
          } finally {
            // 恢复标记 (setTimeout 确保在 persist 异步写入之后)
            setTimeout(() => {
              isUpdatingFromStorage = false
            }, 100)
          }

          // 同步更新 i18n 模块的语言设置
          if (
            normalizedIncomingSettings.language &&
            normalizedIncomingSettings.language !== currentPersistedSettings.language
          ) {
            import("~utils/i18n")
              .then(({ setLanguage }) => {
                setLanguage(normalizedIncomingSettings.language)
              })
              .catch(() => {
                // ignore
              })
          }

          // console.log("[SettingsStore] 跨上下文同步完成, version:", currentState._syncVersion + 1)
        }
      }
    } catch (err) {
      console.error("[SettingsStore] 解析跨上下文设置变更失败:", err)
    }
  })
}
