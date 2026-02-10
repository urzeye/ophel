/**
 * UI 相关常量
 */
import type React from "react"

import {
  AnchorIcon,
  ConversationIcon,
  ManualAnchorIcon,
  OutlineIcon,
  PromptIcon,
  ScrollBottomIcon,
  ScrollTopIcon,
  ToolsIcon,
} from "~components/icons"

// ==================== Tab ID 常量 ====================
// 用于 Tab 切换判断，避免字符串字面量拼写错误
export const TAB_IDS = {
  PROMPTS: "prompts",
  OUTLINE: "outline",
  CONVERSATIONS: "conversations",
  SETTINGS: "settings",
} as const

export type TabId = (typeof TAB_IDS)[keyof typeof TAB_IDS]

// ==================== Settings Navigation IDs ====================
export const NAV_IDS = {
  GENERAL: "general",
  APPEARANCE: "appearance",
  FEATURES: "features",
  SITE_SETTINGS: "siteSettings",
  SHORTCUTS: "shortcuts",
  BACKUP: "backup",
  PERMISSIONS: "permissions",
  ABOUT: "about",
} as const

// ==================== Features Page Tab IDs ====================
export const FEATURES_TAB_IDS = {
  OUTLINE: "outline",
  CONVERSATIONS: "conversations",
  PROMPTS: "prompts",
  TAB_SETTINGS: "tab",
  CONTENT: "content",
  READING_HISTORY: "readingHistory",
  TOOLBOX: "toolbox",
} as const

// ==================== Appearance Page Tab IDs ====================
export const APPEARANCE_TAB_IDS = {
  PRESETS: "presets",
  CUSTOM: "custom",
} as const

// ==================== Site Settings Page Tab IDs ====================
export const SITE_SETTINGS_TAB_IDS = {
  LAYOUT: "layout",
  MODEL_LOCK: "modelLock",
  // 站点专属 Tab ID 直接使用 SITE_IDS
} as const

// ==================== Settings Deep Link ====================
export interface SettingsNavigateDetail {
  page?: string
  subTab?: string
  settingId?: string
}

interface SettingRoute {
  page: string
  subTab?: string
}

interface SettingRouteRule {
  prefix: string
  route: SettingRoute
}

export const SETTING_ID_ROUTE_MAP: Record<string, SettingRoute> = {
  "appearance-preset-light": {
    page: NAV_IDS.APPEARANCE,
    subTab: APPEARANCE_TAB_IDS.PRESETS,
  },
  "appearance-preset-dark": {
    page: NAV_IDS.APPEARANCE,
    subTab: APPEARANCE_TAB_IDS.PRESETS,
  },
  "appearance-custom-styles": {
    page: NAV_IDS.APPEARANCE,
    subTab: APPEARANCE_TAB_IDS.CUSTOM,
  },
} as const

const SETTING_ID_ROUTE_RULES: SettingRouteRule[] = [
  { prefix: "panel-", route: { page: NAV_IDS.GENERAL, subTab: "panel" } },
  { prefix: "quick-buttons-", route: { page: NAV_IDS.GENERAL, subTab: "shortcuts" } },
  { prefix: "tools-menu-", route: { page: NAV_IDS.GENERAL, subTab: "toolsMenu" } },
  {
    prefix: "layout-",
    route: { page: NAV_IDS.SITE_SETTINGS, subTab: SITE_SETTINGS_TAB_IDS.LAYOUT },
  },
  {
    prefix: "model-lock-",
    route: { page: NAV_IDS.SITE_SETTINGS, subTab: SITE_SETTINGS_TAB_IDS.MODEL_LOCK },
  },
  {
    prefix: "gemini-",
    route: { page: NAV_IDS.SITE_SETTINGS, subTab: "gemini" },
  },
  {
    prefix: "aistudio-",
    route: { page: NAV_IDS.SITE_SETTINGS, subTab: "aistudio" },
  },
  {
    prefix: "chatgpt-",
    route: { page: NAV_IDS.SITE_SETTINGS, subTab: "chatgpt" },
  },
  {
    prefix: "claude-",
    route: { page: NAV_IDS.SITE_SETTINGS, subTab: "claude" },
  },
  {
    prefix: "tab-",
    route: { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.TAB_SETTINGS },
  },
  {
    prefix: "outline-",
    route: { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.OUTLINE },
  },
  {
    prefix: "conversation-",
    route: { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.CONVERSATIONS },
  },
  {
    prefix: "export-",
    route: { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.CONVERSATIONS },
  },
  {
    prefix: "prompt-",
    route: { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.PROMPTS },
  },
  {
    prefix: "reading-history-",
    route: { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.READING_HISTORY },
  },
  {
    prefix: "content-",
    route: { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.CONTENT },
  },
  {
    prefix: "appearance-preset-",
    route: { page: NAV_IDS.APPEARANCE, subTab: APPEARANCE_TAB_IDS.PRESETS },
  },
  {
    prefix: "appearance-custom-",
    route: { page: NAV_IDS.APPEARANCE, subTab: APPEARANCE_TAB_IDS.CUSTOM },
  },
]

export const SETTING_ID_ALIASES: Record<string, string> = {
  "general.panel.defaultOpen": "panel-default-open",
  "general.panel.defaultPosition": "panel-default-position",
  "general.panel.defaultEdgeDistance": "panel-edge-distance",
  "general.panel.width": "panel-width",
  "general.panel.height": "panel-height",
  "general.panel.edgeSnap": "panel-edge-snap",
  "general.panel.edgeSnapThreshold": "panel-edge-snap-threshold",
  "general.panel.autoHide": "panel-auto-hide",
  "general.shortcuts.quickButtonsOpacity": "quick-buttons-opacity",
  "general.toolsMenu": "tools-menu-scrollTop",
  "siteSettings.layout.pageWidth.enabled": "layout-page-width-enabled",
  "siteSettings.layout.pageWidth.value": "layout-page-width-value",
  "siteSettings.layout.userQueryWidth.enabled": "layout-user-query-width-enabled",
  "siteSettings.layout.userQueryWidth.value": "layout-user-query-width-value",
  "siteSettings.modelLock": "model-lock-gemini",
  "features.tab.openInNewTab": "tab-open-new",
  "features.tab.autoRename": "tab-auto-rename",
  "features.outline.autoUpdate": "outline-auto-update",
  "features.outline.inlineBookmarkMode": "outline-inline-bookmark-mode",
  "features.outline.panelBookmarkMode": "outline-panel-bookmark-mode",
  "features.outline.preventAutoScroll": "outline-prevent-auto-scroll",
  "features.readingHistory.persistence": "reading-history-persistence",
  "features.content.formulaCopy": "content-formula-copy",
  "panel.preventAutoScroll": "outline-prevent-auto-scroll",
  "content.markdownFix": "gemini-markdown-fix",
  "content.watermarkRemoval": "gemini-watermark-removal",
  "geminiEnterprise.policyRetry.enabled": "gemini-policy-retry",
  "geminiEnterprise.policyRetry.maxRetries": "gemini-policy-max-retries",
  "aistudio.collapseNavbar": "aistudio-collapse-navbar",
  "aistudio.collapseRunSettings": "aistudio-collapse-run-settings",
  "aistudio.collapseTools": "aistudio-collapse-tools",
  "aistudio.collapseAdvanced": "aistudio-collapse-advanced",
  "aistudio.enableSearch": "aistudio-enable-search",
  "aistudio.removeWatermark": "aistudio-remove-watermark",
  "aistudio.markdownFix": "aistudio-markdown-fix",
  "chatgpt.markdownFix": "chatgpt-markdown-fix",
  "claude.sessionKeys": "claude-session-keys",
  "appearance.presets.light": "appearance-preset-light",
  "appearance.presets.dark": "appearance-preset-dark",
  "appearance.custom.styles": "appearance-custom-styles",
}

export const resolveSettingId = (settingId?: string): string | undefined => {
  const normalized = settingId?.trim()
  if (!normalized) return undefined
  return SETTING_ID_ALIASES[normalized] ?? normalized
}

export const resolveSettingRoute = (settingId?: string): SettingRoute | undefined => {
  const resolvedSettingId = resolveSettingId(settingId)
  if (!resolvedSettingId) return undefined

  if (SETTING_ID_ROUTE_MAP[resolvedSettingId]) {
    return SETTING_ID_ROUTE_MAP[resolvedSettingId]
  }

  return SETTING_ID_ROUTE_RULES.find((rule) => resolvedSettingId.startsWith(rule.prefix))?.route
}

export const resolveSettingsNavigateDetail = (
  detail: SettingsNavigateDetail,
): SettingsNavigateDetail => {
  const resolvedSettingId = resolveSettingId(detail.settingId)
  const route = resolveSettingRoute(resolvedSettingId)

  const resolvedPage = detail.page ?? route?.page
  const resolvedSubTab =
    detail.subTab ?? (detail.page && detail.page !== route?.page ? undefined : route?.subTab)

  return {
    page: resolvedPage,
    subTab: resolvedSubTab,
    settingId: resolvedSettingId,
  }
}

// ==================== Tab 定义 ====================
// Tab 标签的显示配置
export const TAB_DEFINITIONS: Record<
  string,
  {
    label: string
    icon: string
    IconComponent?: React.ComponentType<{ size?: number; color?: string }>
  }
> = {
  [TAB_IDS.PROMPTS]: { label: "tabPrompts", icon: "✏️", IconComponent: PromptIcon },
  [TAB_IDS.CONVERSATIONS]: {
    label: "tabConversations",
    icon: "💬",
    IconComponent: ConversationIcon,
  },
  [TAB_IDS.OUTLINE]: { label: "tabOutline", icon: "📑", IconComponent: OutlineIcon },
  [TAB_IDS.SETTINGS]: { label: "tabSettings", icon: "⚙️" },
}

// ==================== 折叠面板按钮定义 ====================
// isPanelOnly: true 表示仅在面板折叠时显示，false 表示常显
// IconComponent: React 组件形式的图标（优先于 icon）
export const COLLAPSED_BUTTON_DEFS: Record<
  string,
  {
    icon: string
    labelKey: string
    canToggle: boolean
    isPanelOnly: boolean
    isGroup?: boolean
    IconComponent?: React.ComponentType<{ size?: number; color?: string }>
  }
> = {
  scrollTop: {
    icon: "⬆",
    labelKey: "scrollTop",
    canToggle: false,
    isPanelOnly: false,
    IconComponent: ScrollTopIcon,
  },
  panel: {
    icon: "✨",
    labelKey: "panelTitle",
    canToggle: false,
    isPanelOnly: true,
  },
  floatingToolbar: {
    icon: "🧰",
    labelKey: "tools", // Changed from floatingToolbarLabel
    canToggle: true, // This toggle will now open the menu
    isPanelOnly: false,
    IconComponent: ToolsIcon,
  },
  anchor: {
    icon: "⚓",
    canToggle: true,
    labelKey: "showCollapsedAnchorLabel",
    isPanelOnly: false,
    IconComponent: AnchorIcon,
  },
  theme: {
    icon: "☀",
    labelKey: "showCollapsedThemeLabel",
    canToggle: true,
    isPanelOnly: false,
  },
  manualAnchor: {
    icon: "📍",
    labelKey: "manualAnchorLabel",
    canToggle: true,
    isPanelOnly: false,
    isGroup: true,
    IconComponent: ManualAnchorIcon,
  },
  scrollBottom: {
    icon: "⬇",
    labelKey: "scrollBottom",
    canToggle: false,
    isPanelOnly: false,
    IconComponent: ScrollBottomIcon,
  },
}

// ==================== Emoji 预设 ====================
// 扩充的预设 Emoji 库 (64个)
export const PRESET_EMOJIS = [
  // 📂 基础文件夹
  "📁",
  "📂",
  "📥",
  "🗂️",
  "📊",
  "📈",
  "📉",
  "📋",
  // 💼 办公/工作
  "💼",
  "📅",
  "📌",
  "📎",
  "📝",
  "✒️",
  "🔍",
  "💡",
  // 💻 编程/技术
  "💻",
  "⌨️",
  "🖥️",
  "🖱️",
  "🐛",
  "🔧",
  "🔨",
  "⚙️",
  // 🤖 AI/机器人
  "🤖",
  "👾",
  "🧠",
  "⚡",
  "🔥",
  "✨",
  "🎓",
  "📚",
  // 🎨 创意/艺术
  "🎨",
  "🎭",
  "🎬",
  "🎹",
  "🎵",
  "📷",
  "🖌️",
  "🖍️",
  // 🏠 生活/日常
  "🏠",
  "🛒",
  "✈️",
  "🎮",
  "⚽",
  "🍔",
  "☕",
  "❤️",
  // 🌈 颜色/标记
  "🔴",
  "🟠",
  "🟡",
  "🟢",
  "🔵",
  "🟣",
  "⚫",
  "⚪",
  // 其他
  "⭐",
  "🌟",
  "🎉",
  "🔒",
  "🔑",
  "🚫",
  "✅",
  "❓",
]

// ==================== 标签颜色预设 ====================
// 30 色预设网格
export const TAG_COLORS = [
  // 第一行
  "#FF461F",
  "#FF6B6B",
  "#FA8072",
  "#DC143C",
  "#CD5C5C",
  "#FF4500",
  // 第二行
  "#FFA500",
  "#FFB347",
  "#F0E68C",
  "#DAA520",
  "#FFD700",
  "#9ACD32",
  // 第三行
  "#32CD32",
  "#3CB371",
  "#20B2AA",
  "#00CED1",
  "#5F9EA0",
  "#4682B4",
  // 第四行
  "#6495ED",
  "#4169E1",
  "#0000CD",
  "#8A2BE2",
  "#9370DB",
  "#BA55D3",
  // 第五行
  "#DB7093",
  "#C71585",
  "#8B4513",
  "#A0522D",
  "#708090",
  "#2F4F4F",
]

// ==================== Toast 显示时长 ====================
export const TOAST_DURATION = {
  SHORT: 1500,
  MEDIUM: 2000,
  LONG: 3000,
} as const

// ==================== 状态颜色 ====================
export const STATUS_COLORS = {
  SUCCESS: "#10b981", // green-500
  ERROR: "#ef4444", // red-500
  WARNING: "#f59e0b", // amber-500
  INFO: "var(--gh-text-secondary)",
} as const
