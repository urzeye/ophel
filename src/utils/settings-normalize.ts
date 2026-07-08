import { LAYOUT_CONFIG } from "~constants"
import { normalizeShortcutsSettings } from "~constants/shortcuts"
import { DEFAULT_QUICK_BUTTONS_SETTINGS, DEFAULT_SETTINGS } from "~constants/default-settings"
import type {
  PageWidthConfig,
  PanelAvoidanceSettings,
  QuickButtonConfig,
  QuickButtonsPosition,
  Settings,
} from "~types/settings"

type LegacyQuickButtonsSettings = {
  collapsedButtons?: QuickButtonConfig[]
  quickButtonsOpacity?: number
  toolsMenu?: string[]
  floatingToolbar?: {
    open?: boolean
  }
}

export type SettingsInput = Omit<Partial<Settings>, "quickButtons"> & {
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
    proximityRadius: (() => {
      const n = Number(quickButtons.proximityRadius)
      return Number.isFinite(n)
        ? Math.min(300, Math.max(0, n))
        : DEFAULT_QUICK_BUTTONS_SETTINGS.proximityRadius
    })(),
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
    edgeTriggerMode:
      panel?.edgeTriggerMode === "hidden" || panel?.edgeTriggerMode === "handle"
        ? panel.edgeTriggerMode
        : defaults.edgeTriggerMode,
    preventAutoScroll: panel?.preventAutoScroll ?? defaults.preventAutoScroll,
    defaultPosition:
      panel?.defaultPosition === "left" || panel?.defaultPosition === "right"
        ? panel.defaultPosition
        : defaults.defaultPosition,
    defaultEdgeDistance: panel?.defaultEdgeDistance ?? defaults.defaultEdgeDistance,
    edgeSnapThreshold: panel?.edgeSnapThreshold ?? defaults.edgeSnapThreshold,
    height: panel?.height ?? defaults.height,
    width: panel?.width ?? defaults.width,
    resizeOnHover: panel?.resizeOnHover ?? defaults.resizeOnHover,
    hoverWidth: panel?.hoverWidth ?? defaults.hoverWidth,
  }
}

const normalizeExportSettings = (
  exportSettings?: Partial<Settings["export"]>,
): Settings["export"] => {
  const defaults = DEFAULT_SETTINGS.export
  const packaging =
    exportSettings?.packaging === "zip" || exportSettings?.packaging === "markdown"
      ? exportSettings.packaging
      : defaults.packaging

  return {
    ...defaults,
    ...exportSettings,
    packaging,
  }
}

const normalizeContentSettings = (
  contentSettings?: Partial<Settings["content"]>,
): Settings["content"] => {
  const defaults = DEFAULT_SETTINGS.content
  const formulaCopyFormat =
    contentSettings?.formulaCopyFormat === "mathml" ||
    contentSettings?.formulaCopyFormat === "latex"
      ? contentSettings.formulaCopyFormat
      : defaults.formulaCopyFormat

  return {
    assistantMermaid: contentSettings?.assistantMermaid ?? defaults.assistantMermaid,
    markdownFix: contentSettings?.markdownFix ?? defaults.markdownFix,
    watermarkRemoval: contentSettings?.watermarkRemoval ?? defaults.watermarkRemoval,
    formulaCopy: contentSettings?.formulaCopy ?? defaults.formulaCopy,
    formulaCopyFormat,
    formulaDelimiter: contentSettings?.formulaDelimiter ?? defaults.formulaDelimiter,
    tableCopy: contentSettings?.tableCopy ?? defaults.tableCopy,
    userQueryMarkdown: contentSettings?.userQueryMarkdown ?? defaults.userQueryMarkdown,
  }
}

export const normalizeSettings = (settings: SettingsInput): Settings => {
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
    content: normalizeContentSettings(settings.content),
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
      panelAvoidance: normalizeSiteConfigRecord<PanelAvoidanceSettings>(
        settings.layout?.panelAvoidance,
        DEFAULT_SETTINGS.layout.panelAvoidance,
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
    export: normalizeExportSettings(settings.export),
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
