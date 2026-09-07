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
  SearchIcon,
  ToolsIcon,
  EyeIcon,
  SettingsIcon,
  ThemeSystemIcon,
} from "~components/icons"
import { SparkleIcon } from "~components/icons/SparkleIcon"
import { SHORTCUT_META } from "~constants/shortcuts"

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
  SITE_PACKS: "sitePacks",
  GLOBAL_SEARCH: "globalSearch",
  SHORTCUTS: "shortcuts",
  BACKUP: "backup",
  PERMISSIONS: "permissions",
  ABOUT: "about",
} as const

// 关于页“赞助支持”区块的定位 ID，供设置导航的滚动/高亮机制使用
export const ABOUT_SPONSOR_SETTING_ID = "about-sponsor"

// ==================== Features Page Tab IDs ====================
export const FEATURES_TAB_IDS = {
  OUTLINE: "outline",
  CONVERSATIONS: "conversations",
  PROMPTS: "prompts",
  TAB_SETTINGS: "tab",
  REMINDER: "reminder",
  CONTENT: "content",
  READING_HISTORY: "readingHistory",
  TOOLBOX: "toolbox",
} as const

// ==================== Site Packs Page Tab IDs ====================
export const SITE_PACKS_TAB_IDS = {
  BUILTIN: "builtin",
  INSTALLED: "installed",
  ORIGINS: "origins",
  UPDATES: "updates",
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

// ==================== Backup Page Tab IDs ====================
export const BACKUP_TAB_IDS = {
  LOCAL: "local",
  WEBDAV: "webdav",
} as const

// ==================== Settings Deep Link ====================
export interface SettingsNavigateDetail {
  page?: string
  subTab?: string
  settingId?: string
}

export interface SettingsSearchItem {
  settingId: string
  title: string
  keywords?: string[]
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
  // --- 页面级 Tab (Page) ---
  "page-general": { page: NAV_IDS.GENERAL },
  "page-features": { page: NAV_IDS.FEATURES },
  "page-site-settings": { page: NAV_IDS.SITE_SETTINGS },
  "page-site-packs": { page: NAV_IDS.SITE_PACKS },
  "page-global-search": { page: NAV_IDS.GLOBAL_SEARCH },
  "page-shortcuts": { page: NAV_IDS.SHORTCUTS },
  "page-appearance": { page: NAV_IDS.APPEARANCE },
  "page-backup": { page: NAV_IDS.BACKUP },
  "page-permissions": { page: NAV_IDS.PERMISSIONS },
  "page-about": { page: NAV_IDS.ABOUT },

  // --- 二级子 Tab (SubTab) ---
  "subtab-general-panel": { page: NAV_IDS.GENERAL, subTab: "panel" },
  "subtab-general-tab-order": { page: NAV_IDS.GENERAL, subTab: "tabOrder" },
  "subtab-general-shortcuts": { page: NAV_IDS.GENERAL, subTab: "shortcuts" },
  "subtab-general-tools-menu": { page: NAV_IDS.GENERAL, subTab: "toolsMenu" },
  "subtab-features-outline": { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.OUTLINE },
  "subtab-features-conversations": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.CONVERSATIONS,
  },
  "subtab-features-prompts": { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.PROMPTS },
  "subtab-features-tab-settings": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.TAB_SETTINGS,
  },
  "subtab-features-reminder": { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.REMINDER },
  "subtab-features-content": { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.CONTENT },
  "subtab-features-reading-history": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.READING_HISTORY,
  },
  "subtab-site-settings-layout": {
    page: NAV_IDS.SITE_SETTINGS,
    subTab: SITE_SETTINGS_TAB_IDS.LAYOUT,
  },
  "subtab-site-settings-model-lock": {
    page: NAV_IDS.SITE_SETTINGS,
    subTab: SITE_SETTINGS_TAB_IDS.MODEL_LOCK,
  },
  "subtab-site-settings-gemini": { page: NAV_IDS.SITE_SETTINGS, subTab: "gemini" },
  "subtab-site-settings-aistudio": { page: NAV_IDS.SITE_SETTINGS, subTab: "aistudio" },
  "subtab-site-settings-chatgpt": { page: NAV_IDS.SITE_SETTINGS, subTab: "chatgpt" },
  "subtab-site-settings-claude": { page: NAV_IDS.SITE_SETTINGS, subTab: "claude" },
  "subtab-appearance-presets": {
    page: NAV_IDS.APPEARANCE,
    subTab: APPEARANCE_TAB_IDS.PRESETS,
  },
  "subtab-appearance-custom": { page: NAV_IDS.APPEARANCE, subTab: APPEARANCE_TAB_IDS.CUSTOM },
  "subtab-site-packs-builtin": {
    page: NAV_IDS.SITE_PACKS,
    subTab: SITE_PACKS_TAB_IDS.BUILTIN,
  },
  "subtab-site-packs-installed": {
    page: NAV_IDS.SITE_PACKS,
    subTab: SITE_PACKS_TAB_IDS.INSTALLED,
  },
  "subtab-site-packs-origins": {
    page: NAV_IDS.SITE_PACKS,
    subTab: SITE_PACKS_TAB_IDS.ORIGINS,
  },
  "subtab-site-packs-updates": {
    page: NAV_IDS.SITE_PACKS,
    subTab: SITE_PACKS_TAB_IDS.UPDATES,
  },
  "subtab-backup-local": { page: NAV_IDS.BACKUP, subTab: BACKUP_TAB_IDS.LOCAL },
  "subtab-backup-webdav": { page: NAV_IDS.BACKUP, subTab: BACKUP_TAB_IDS.WEBDAV },

  // --- 设置集合 Card ---
  "panel-settings-card": { page: NAV_IDS.GENERAL, subTab: "panel" },
  "tab-order-card": { page: NAV_IDS.GENERAL, subTab: "tabOrder" },
  "quick-buttons-card": { page: NAV_IDS.GENERAL, subTab: "shortcuts" },
  "toolbox-menu-card": { page: NAV_IDS.GENERAL, subTab: "toolsMenu" },
  "tab-behavior-card": { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.TAB_SETTINGS },
  "tab-privacy-card": { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.TAB_SETTINGS },
  "notification-settings-card": { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.REMINDER },
  "usage-monitor-card": { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.REMINDER },
  "outline-settings-card": { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.OUTLINE },
  "bookmark-settings-card": { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.OUTLINE },
  "scroll-settings-card": { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.OUTLINE },
  "conversations-settings-card": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.CONVERSATIONS,
  },
  "export-settings-card": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.CONVERSATIONS,
  },
  "prompts-settings-card": { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.PROMPTS },
  "quick-quote-settings-card": { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.PROMPTS },
  "reading-history-card": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.READING_HISTORY,
  },
  "content-interaction-card": { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.CONTENT },
  "layout-clean-mode-card": {
    page: NAV_IDS.SITE_SETTINGS,
    subTab: SITE_SETTINGS_TAB_IDS.LAYOUT,
  },
  "backup-export-card": { page: NAV_IDS.BACKUP, subTab: BACKUP_TAB_IDS.LOCAL },
  "backup-import-card": { page: NAV_IDS.BACKUP, subTab: BACKUP_TAB_IDS.LOCAL },
  "backup-reset-card": { page: NAV_IDS.BACKUP, subTab: BACKUP_TAB_IDS.LOCAL },
  "backup-webdav-card": { page: NAV_IDS.BACKUP, subTab: BACKUP_TAB_IDS.WEBDAV },
  "shortcuts-global-card": { page: NAV_IDS.SHORTCUTS },
  "permissions-optional-card": { page: NAV_IDS.PERMISSIONS },
  "permissions-required-card": { page: NAV_IDS.PERMISSIONS },
  [ABOUT_SPONSOR_SETTING_ID]: { page: NAV_IDS.ABOUT },

  // --- 具体设置项 ---
  "appearance-sync-native-page-theme": {
    page: NAV_IDS.APPEARANCE,
  },
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
  "tab-show-notification": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.REMINDER,
  },
  "tab-notification-sound": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.REMINDER,
  },
  "tab-notification-sound-preset": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.REMINDER,
  },
  "tab-notification-volume": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.REMINDER,
  },
  "tab-notification-repeat-count": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.REMINDER,
  },
  "tab-notification-repeat-interval": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.REMINDER,
  },
  "tab-notify-when-focused": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.REMINDER,
  },
  "tab-auto-focus": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.REMINDER,
  },
  "usage-monitor-enabled": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.REMINDER,
  },
  "usage-monitor-daily-limit": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.REMINDER,
  },
  "usage-monitor-auto-reset": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.REMINDER,
  },
  "site-packs-registry": {
    page: NAV_IDS.SITE_PACKS,
    subTab: SITE_PACKS_TAB_IDS.UPDATES,
  },
  "site-pack-custom-origin": {
    page: NAV_IDS.SITE_PACKS,
    subTab: SITE_PACKS_TAB_IDS.ORIGINS,
  },
  "site-packs-local-import": {
    page: NAV_IDS.SITE_PACKS,
    subTab: SITE_PACKS_TAB_IDS.UPDATES,
  },
  "remote-config-status": {
    page: NAV_IDS.SITE_PACKS,
    subTab: SITE_PACKS_TAB_IDS.UPDATES,
  },
  "remote-config-local-patch-import": {
    page: NAV_IDS.SITE_PACKS,
    subTab: SITE_PACKS_TAB_IDS.UPDATES,
  },
  "layout-clean-mode-enabled": {
    page: NAV_IDS.SITE_SETTINGS,
    subTab: SITE_SETTINGS_TAB_IDS.LAYOUT,
  },
  "chatgpt-code-block-batch-mount": {
    page: NAV_IDS.SITE_SETTINGS,
    subTab: "chatgpt",
  },
  "chatgpt-streaming-render-optimize": {
    page: NAV_IDS.SITE_SETTINGS,
    subTab: "chatgpt",
  },
  "chatgpt-disable-backdrop-blur": {
    page: NAV_IDS.SITE_SETTINGS,
    subTab: "chatgpt",
  },
  "export-default-format": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.CONVERSATIONS,
  },
  "export-style": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.CONVERSATIONS,
  },
  "export-show-index": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.CONVERSATIONS,
  },
  "export-show-dialog": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.CONVERSATIONS,
  },
  "export-markdown-divider": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.CONVERSATIONS,
  },
  "permission-item-storage": {
    page: NAV_IDS.PERMISSIONS,
  },
  "permission-item-notifications": {
    page: NAV_IDS.PERMISSIONS,
  },
  "permission-item-cookies": {
    page: NAV_IDS.PERMISSIONS,
  },
  "permission-item-webdav": {
    page: NAV_IDS.PERMISSIONS,
  },
  "backup-webdav-url": {
    page: NAV_IDS.BACKUP,
    subTab: BACKUP_TAB_IDS.WEBDAV,
  },
  "backup-webdav-username": {
    page: NAV_IDS.BACKUP,
    subTab: BACKUP_TAB_IDS.WEBDAV,
  },
  "backup-webdav-password": {
    page: NAV_IDS.BACKUP,
    subTab: BACKUP_TAB_IDS.WEBDAV,
  },
  "backup-webdav-dir": {
    page: NAV_IDS.BACKUP,
    subTab: BACKUP_TAB_IDS.WEBDAV,
  },
  "global-search-matching-card": { page: NAV_IDS.GLOBAL_SEARCH },
  "global-search-prompt-card": { page: NAV_IDS.GLOBAL_SEARCH },
  "collapsed-buttons-order-card": {
    page: NAV_IDS.GENERAL,
    subTab: "shortcuts",
  },
  "shortcuts-prompt-submit-shortcut": {
    page: NAV_IDS.FEATURES,
    subTab: FEATURES_TAB_IDS.PROMPTS,
  },
} as const

const SETTING_ID_ROUTE_RULES: SettingRouteRule[] = [
  {
    prefix: "remote-config-",
    route: { page: NAV_IDS.SITE_PACKS, subTab: SITE_PACKS_TAB_IDS.UPDATES },
  },
  { prefix: "panel-", route: { page: NAV_IDS.GENERAL, subTab: "panel" } },
  { prefix: "quick-buttons-", route: { page: NAV_IDS.GENERAL, subTab: "shortcuts" } },
  { prefix: "tools-menu-", route: { page: NAV_IDS.GENERAL, subTab: "toolsMenu" } },
  { prefix: "shortcuts-", route: { page: NAV_IDS.SHORTCUTS } },
  { prefix: "shortcut-binding-", route: { page: NAV_IDS.SHORTCUTS } },
  {
    prefix: "layout-",
    route: { page: NAV_IDS.SITE_SETTINGS, subTab: SITE_SETTINGS_TAB_IDS.LAYOUT },
  },
  { prefix: "gemini-", route: { page: NAV_IDS.SITE_SETTINGS, subTab: "gemini" } },
  { prefix: "aistudio-", route: { page: NAV_IDS.SITE_SETTINGS, subTab: "aistudio" } },
  { prefix: "chatgpt-", route: { page: NAV_IDS.SITE_SETTINGS, subTab: "chatgpt" } },
  { prefix: "claude-", route: { page: NAV_IDS.SITE_SETTINGS, subTab: "claude" } },
  {
    prefix: "model-lock-",
    route: { page: NAV_IDS.SITE_SETTINGS, subTab: SITE_SETTINGS_TAB_IDS.MODEL_LOCK },
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
  {
    prefix: "permission-item-",
    route: { page: NAV_IDS.PERMISSIONS },
  },
  {
    prefix: "backup-webdav-",
    route: { page: NAV_IDS.BACKUP, subTab: BACKUP_TAB_IDS.WEBDAV },
  },
  {
    prefix: "backup-",
    route: { page: NAV_IDS.BACKUP, subTab: BACKUP_TAB_IDS.LOCAL },
  },
  {
    prefix: "global-search-",
    route: { page: NAV_IDS.GLOBAL_SEARCH },
  },
  {
    prefix: "tab-notification-",
    route: { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.REMINDER },
  },
  {
    prefix: "tab-",
    route: { page: NAV_IDS.FEATURES, subTab: FEATURES_TAB_IDS.TAB_SETTINGS },
  },
]

export const SETTING_ID_ALIASES: Record<string, string> = {
  "remoteConfig.autoUpdate": "remote-config-auto-update",
  "remoteConfig.registrySourceUrl": "remote-config-registry-source",
  "general.panel.panelMode": "panel-mode",
  "general.panel.edgeTriggerMode": "panel-edge-trigger-mode",
  "general.panel.defaultPosition": "panel-default-position",
  "general.panel.defaultEdgeDistance": "panel-edge-distance",
  "general.panel.width": "panel-width",
  "general.panel.resizeOnHover": "panel-resize-on-hover",
  "general.panel.hoverWidth": "panel-hover-width",
  "general.panel.height": "panel-height",
  "general.panel.edgeSnapThreshold": "panel-edge-snap-threshold",
  "general.shortcuts.quickButtonsOpacity": "quick-buttons-opacity",
  "general.toolsMenu": "tools-menu-scrollTop",
  "siteSettings.layout.pageWidth.enabled": "layout-page-width-enabled",
  "siteSettings.layout.pageWidth.value": "layout-page-width-value",
  "siteSettings.layout.panelAvoidance.enabled": "layout-panel-avoidance-enabled",
  "siteSettings.layout.userQueryWidth.enabled": "layout-user-query-width-enabled",
  "siteSettings.layout.userQueryWidth.value": "layout-user-query-width-value",
  "siteSettings.layout.zenMode.enabled": "layout-zen-mode-enabled",
  "siteSettings.layout.zenMode.showExitButton": "layout-zen-mode-exit-button-visible",
  "globalSearch.promptEnterBehavior": "global-search-prompt-enter-behavior",
  "globalSearch.enableFuzzySearch": "global-search-fuzzy-search",
  "globalSearch.doubleShift": "global-search-double-shift",
  "shortcuts.enabled": "shortcuts-enabled",
  "shortcuts.globalUrl": "shortcuts-global-url",
  "features.prompts.submitShortcut": "shortcuts-prompt-submit-shortcut",
  "features.tab.openInNewTab": "tab-open-new",
  "features.tab.autoRename": "tab-auto-rename",
  "usageMonitor.enabled": "usage-monitor-enabled",
  "usageMonitor.dailyLimit": "usage-monitor-daily-limit",
  "usageMonitor.autoResetEnabled": "usage-monitor-auto-reset",
  "features.outline.autoUpdate": "outline-auto-update",
  "features.outline.inlineBookmarkMode": "outline-inline-bookmark-mode",
  "features.outline.panelBookmarkMode": "outline-panel-bookmark-mode",
  "features.outline.preventAutoScroll": "outline-prevent-auto-scroll",
  "features.prompts.promptQueue": "prompt-queue",
  "features.prompts.quickQuoteEnabled": "prompt-quick-quote-enabled",
  "features.export.packaging": "export-packaging",
  "features.export.includeThoughts": "export-include-thoughts",
  "export.packaging": "export-packaging",
  "features.readingHistory.persistence": "reading-history-persistence",
  "features.content.assistantMermaid": "content-assistant-mermaid",
  "features.content.formulaCopy": "content-formula-copy",
  "features.content.formulaCopyFormat": "content-formula-copy-format",
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
  "appearance.syncNativePageTheme": "appearance-sync-native-page-theme",
  "appearance-theme-sync": "appearance-sync-native-page-theme",
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

  const isTabOnlyTarget = Boolean(
    resolvedSettingId?.startsWith("page-") || resolvedSettingId?.startsWith("subtab-"),
  )

  return {
    page: resolvedPage,
    subTab: resolvedSubTab,
    settingId: isTabOnlyTarget ? undefined : resolvedSettingId,
  }
}

const SHORTCUT_SETTINGS_SEARCH_ITEMS: SettingsSearchItem[] = Object.entries(SHORTCUT_META).map(
  ([actionId, meta]) => ({
    settingId: `shortcut-binding-${actionId}`,
    title: `快捷键：${meta.label}`,
    keywords: [
      "shortcut",
      "shortcuts",
      "keybinding",
      "hotkey",
      "keyboard",
      "快捷键",
      "键位",
      "按键",
      meta.label,
      meta.labelKey,
      actionId,
      meta.category,
    ],
  }),
)

const PAGE_TAB_SETTINGS_SEARCH_ITEMS: SettingsSearchItem[] = [
  {
    settingId: "page-general",
    title: "基本设置",
    keywords: ["general", "settings", "通用", "常规", "基本设置", "面板", "侧边栏"],
  },
  {
    settingId: "page-features",
    title: "功能模块",
    keywords: [
      "features",
      "modules",
      "functions",
      "功能",
      "模块",
      "大纲",
      "会话",
      "提示词",
      "标签页",
      "提醒",
      "内容处理",
    ],
  },
  {
    settingId: "page-site-settings",
    title: "站点设置",
    keywords: [
      "site settings",
      "sites",
      "adapter",
      "站点",
      "站点设置",
      "布局",
      "宽度",
      "模型锁定",
      "gemini",
      "chatgpt",
      "claude",
      "aistudio",
    ],
  },
  {
    settingId: "page-site-packs",
    title: "适配中心",
    keywords: [
      "site packs",
      "registry",
      "extensions",
      "适配",
      "适配中心",
      "适配扩展",
      "在线适配库",
      "社区适配",
      "插件",
    ],
  },
  {
    settingId: "page-global-search",
    title: "全局搜索",
    keywords: [
      "global search",
      "search everywhere",
      "search",
      "全局搜索",
      "搜索",
      "全搜",
      "双击 shift",
      "模糊搜索",
    ],
  },
  {
    settingId: "page-shortcuts",
    title: "快捷键位",
    keywords: [
      "shortcuts",
      "keyboard",
      "hotkeys",
      "keybindings",
      "快捷键",
      "键位",
      "快捷键位",
      "热键",
    ],
  },
  {
    settingId: "page-appearance",
    title: "外观主题",
    keywords: [
      "appearance",
      "theme",
      "themes",
      "style",
      "css",
      "外观",
      "主题",
      "配色",
      "深色模式",
      "浅色模式",
      "自定义样式",
    ],
  },
  {
    settingId: "page-backup",
    title: "备份与同步",
    keywords: [
      "backup",
      "sync",
      "webdav",
      "export",
      "import",
      "备份",
      "同步",
      "数据管理",
      "导入导出",
      "云端同步",
      "还原",
    ],
  },
  {
    settingId: "page-permissions",
    title: "权限管理",
    keywords: [
      "permissions",
      "auth",
      "access",
      "权限",
      "权限管理",
      "授权",
      "通知权限",
      "cookie",
      "存储权限",
    ],
  },
  {
    settingId: "page-about",
    title: "关于",
    keywords: [
      "about",
      "version",
      "changelog",
      "release notes",
      "sponsor",
      "关于",
      "版本",
      "更新日志",
      "赞助",
    ],
  },
]

const SUB_TAB_SETTINGS_SEARCH_ITEMS: SettingsSearchItem[] = [
  // 通用
  {
    settingId: "subtab-general-panel",
    title: "面板设置",
    keywords: ["panel", "float", "snap", "面板", "浮动", "吸附", "尺寸", "宽高"],
  },
  {
    settingId: "subtab-general-tab-order",
    title: "Tab 顺序与显隐",
    keywords: ["tab order", "order", "sort", "tab 顺序", "标签顺序", "排序", "显示隐藏"],
  },
  {
    settingId: "subtab-general-shortcuts",
    title: "快捷按钮",
    keywords: ["quick buttons", "float buttons", "快捷按钮", "悬浮按钮", "侧边按钮"],
  },
  {
    settingId: "subtab-general-tools-menu",
    title: "工具箱菜单",
    keywords: ["toolbox menu", "tools menu", "工具箱", "菜单", "工具菜单"],
  },
  // 功能模块
  {
    settingId: "subtab-features-outline",
    title: "大纲",
    keywords: ["outline", "toc", "headings", "大纲", "目录", "标题", "书签", "自动跟随"],
  },
  {
    settingId: "subtab-features-conversations",
    title: "会话",
    keywords: [
      "conversations",
      "chat history",
      "会话",
      "会话管理",
      "对话",
      "额度监控",
      "彩虹文件夹",
    ],
  },
  {
    settingId: "subtab-features-prompts",
    title: "提示词",
    keywords: [
      "prompts",
      "prompt",
      "queue",
      "quick quote",
      "提示词",
      "常用提示词",
      "队列",
      "快捷引用",
      "双击发送",
    ],
  },
  {
    settingId: "subtab-features-tab-settings",
    title: "标签页",
    keywords: [
      "tab settings",
      "browser tabs",
      "tabs",
      "标签页",
      "网页标签",
      "自动重命名",
      "隐私模式",
      "标题格式化",
    ],
  },
  {
    settingId: "subtab-features-reminder",
    title: "提醒",
    keywords: [
      "reminder",
      "alert",
      "sound",
      "notification",
      "提醒",
      "声音",
      "通知",
      "铃声",
      "音量",
      "额度监控",
    ],
  },
  {
    settingId: "subtab-features-content",
    title: "内容交互",
    keywords: [
      "content",
      "formula",
      "latex",
      "math",
      "table",
      "mermaid",
      "export",
      "内容",
      "内容处理",
      "公式",
      "表格",
      "流程图",
      "导出",
    ],
  },
  {
    settingId: "subtab-features-reading-history",
    title: "阅读历史",
    keywords: [
      "reading history",
      "scroll position",
      "progress",
      "阅读历史",
      "进度记录",
      "阅读位置",
      "自动恢复",
    ],
  },
  // 站点设置
  {
    settingId: "subtab-site-settings-layout",
    title: "页面布局",
    keywords: [
      "layout",
      "width",
      "zen mode",
      "clean mode",
      "布局",
      "页面宽度",
      "用户问题宽度",
      "禅模式",
      "净化模式",
    ],
  },
  {
    settingId: "subtab-site-settings-model-lock",
    title: "模型锁定",
    keywords: ["model lock", "lock", "模型锁定", "锁定模型", "默认模型"],
  },
  {
    settingId: "subtab-site-settings-gemini",
    title: "Gemini",
    keywords: [
      "gemini",
      "google gemini",
      "专属",
      "专属设置",
      "gemini 专属",
      "markdown fix",
      "watermark",
      "重试",
    ],
  },
  {
    settingId: "subtab-site-settings-aistudio",
    title: "AI Studio",
    keywords: ["aistudio", "ai studio", "google ai studio", "专属", "专属设置", "折叠面板", "水印"],
  },
  {
    settingId: "subtab-site-settings-chatgpt",
    title: "ChatGPT",
    keywords: [
      "chatgpt",
      "openai",
      "专属",
      "专属设置",
      "markdown fix",
      "代码块",
      "渲染优化",
      "背景虚化",
    ],
  },
  {
    settingId: "subtab-site-settings-claude",
    title: "Claude",
    keywords: ["claude", "anthropic", "session keys", "专属", "专属设置", "claude 专属"],
  },
  // 外观
  {
    settingId: "subtab-appearance-presets",
    title: "主题预设",
    keywords: [
      "presets",
      "themes",
      "light",
      "dark",
      "预设",
      "主题预设",
      "配色方案",
      "深色预设",
      "浅色预设",
    ],
  },
  {
    settingId: "subtab-appearance-custom",
    title: "自定义样式",
    keywords: ["custom styles", "css", "code editor", "自定义样式", "自定义 css", "用户样式"],
  },
  // 适配中心
  {
    settingId: "subtab-site-packs-builtin",
    title: "内置站点",
    keywords: ["builtin sites", "default sites", "内置站点", "原生支持站点"],
  },
  {
    settingId: "subtab-site-packs-installed",
    title: "已安装适配包",
    keywords: ["installed", "installed packs", "已安装", "已安装适配包"],
  },
  {
    settingId: "subtab-site-packs-origins",
    title: "域名覆盖",
    keywords: ["custom origins", "domains", "域名覆盖", "自定义域名", "绑定"],
  },
  {
    settingId: "subtab-site-packs-updates",
    title: "更新与安装",
    keywords: [
      "updates",
      "check updates",
      "registry",
      "在线适配库",
      "更新与安装",
      "检查更新",
      "适配包更新",
    ],
  },
  // 备份与同步
  {
    settingId: "subtab-backup-local",
    title: "本地备份",
    keywords: ["local backup", "export", "import", "本地备份", "备份导出", "备份导入", "恢复"],
  },
  {
    settingId: "subtab-backup-webdav",
    title: "WebDAV 同步",
    keywords: [
      "webdav",
      "cloud sync",
      "cloud backup",
      "webdav 同步",
      "云端同步",
      "坚果云",
      "同步设置",
    ],
  },
]

const SETTING_CARD_SEARCH_ITEMS: SettingsSearchItem[] = [
  {
    settingId: "panel-settings-card",
    title: "面板基础设置",
    keywords: [
      "panel settings",
      "mode",
      "position",
      "size",
      "面板设置",
      "面板模式",
      "默认位置",
      "宽高",
    ],
  },
  {
    settingId: "tab-order-card",
    title: "Tab 顺序与显隐设置",
    keywords: ["tab order", "sort", "visible", "tab 顺序", "标签顺序", "功能开关"],
  },
  {
    settingId: "quick-buttons-card",
    title: "快捷按钮设置",
    keywords: ["quick buttons", "proximity", "opacity", "快捷按钮", "透明度", "悬浮感应"],
  },
  {
    settingId: "collapsed-buttons-order-card",
    title: "折叠按钮顺序设置",
    keywords: ["collapsed buttons order", "quick buttons", "折叠按钮", "按钮排序", "折叠菜单排序"],
  },
  {
    settingId: "toolbox-menu-card",
    title: "工具箱菜单设置",
    keywords: ["toolbox menu", "tools", "工具箱菜单", "快捷操作菜单"],
  },
  {
    settingId: "tab-behavior-card",
    title: "标签页行为设置",
    keywords: ["tab behavior", "auto rename", "open new", "标签页行为", "新标签打开", "自动重命名"],
  },
  {
    settingId: "tab-privacy-card",
    title: "隐私模式设置",
    keywords: ["privacy mode", "hide title", "隐私模式", "隐藏标题", "隐私标题"],
  },
  {
    settingId: "notification-settings-card",
    title: "提醒声音与通知设置",
    keywords: [
      "notification settings",
      "sound",
      "volume",
      "提醒设置",
      "声音提醒",
      "完成提醒",
      "音量",
    ],
  },
  {
    settingId: "usage-monitor-card",
    title: "额度监控与统计",
    keywords: [
      "usage monitor",
      "daily limit",
      "auto reset",
      "额度监控",
      "使用量统计",
      "每日上限",
      "自动重置",
    ],
  },
  {
    settingId: "outline-settings-card",
    title: "大纲设置",
    keywords: [
      "outline settings",
      "auto update",
      "follow mode",
      "大纲设置",
      "自动更新",
      "跟随模式",
    ],
  },
  {
    settingId: "bookmark-settings-card",
    title: "书签模式设置",
    keywords: ["bookmark", "inline bookmark", "书签设置", "内嵌书签", "面板书签"],
  },
  {
    settingId: "scroll-settings-card",
    title: "滚动锁定设置",
    keywords: ["scroll settings", "prevent auto scroll", "滚动设置", "防止自动滚动", "防跳滚"],
  },
  {
    settingId: "conversations-settings-card",
    title: "会话管理设置",
    keywords: [
      "conversations settings",
      "folder rainbow",
      "sync delete",
      "会话设置",
      "彩虹文件夹",
      "同步删除",
    ],
  },
  {
    settingId: "export-settings-card",
    title: "对话导出设置",
    keywords: [
      "export settings",
      "format",
      "style",
      "packaging",
      "导出设置",
      "导出格式",
      "打包方式",
      "导出样式",
    ],
  },
  {
    settingId: "prompts-settings-card",
    title: "提示词设置",
    keywords: [
      "prompt settings",
      "double click send",
      "queue",
      "提示词设置",
      "双击发送",
      "提示词队列",
    ],
  },
  {
    settingId: "quick-quote-settings-card",
    title: "快捷引用设置",
    keywords: ["quick quote", "quote", "快捷引用", "划词引用", "引用设置"],
  },
  {
    settingId: "reading-history-card",
    title: "阅读历史设置",
    keywords: [
      "reading history",
      "auto restore",
      "cleanup",
      "阅读历史",
      "自动恢复进度",
      "历史清理",
    ],
  },
  {
    settingId: "content-interaction-card",
    title: "内容交互与增强设置",
    keywords: [
      "interaction enhance",
      "formula",
      "table",
      "mermaid",
      "交互增强",
      "公式复制",
      "表格复制",
      "图表渲染",
    ],
  },
  {
    settingId: "layout-panel-avoidance-card",
    title: "面板避让设置",
    keywords: ["panel avoidance", "avoidance", "面板避让", "避让侧边栏", "防遮挡"],
  },
  {
    settingId: "layout-page-width-card",
    title: "页面宽度设置",
    keywords: ["page width", "layout", "页面宽度", "自适应宽度", "页面布局"],
  },
  {
    settingId: "layout-user-query-width-card",
    title: "用户问题宽度设置",
    keywords: ["user query width", "query width", "用户问题宽度", "提问宽度", "输入宽度"],
  },
  {
    settingId: "layout-zen-mode-card",
    title: "禅模式设置",
    keywords: ["zen mode", "distraction free", "禅模式", "专注模式", "无干扰"],
  },
  {
    settingId: "layout-clean-mode-card",
    title: "净化模式设置",
    keywords: ["clean mode", "distraction free", "净化模式", "隐藏侧栏", "去杂质"],
  },
  {
    settingId: "gemini-settings-card",
    title: "Gemini 专属",
    keywords: [
      "gemini",
      "google gemini",
      "exclusive",
      "gemini exclusive",
      "专属",
      "专属设置",
      "gemini 专属",
      "markdown fix",
      "watermark",
      "水印",
      "策略重试",
    ],
  },
  {
    settingId: "aistudio-settings-card",
    title: "AI Studio 设置",
    keywords: [
      "aistudio",
      "ai studio",
      "google ai studio",
      "折叠面板",
      "水印",
      "专属",
      "专属设置",
      "navbar",
      "run settings",
    ],
  },
  {
    settingId: "chatgpt-settings-card",
    title: "ChatGPT 设置",
    keywords: [
      "chatgpt",
      "openai",
      "markdown fix",
      "代码块",
      "渲染优化",
      "背景虚化",
      "专属",
      "专属设置",
    ],
  },
  {
    settingId: "site-pack-custom-origin",
    title: "自定义域名覆盖",
    keywords: ["custom origin", "domains", "自定义域名", "域名覆盖", "绑定"],
  },
  {
    settingId: "backup-export-card",
    title: "数据备份导出",
    keywords: [
      "export data",
      "backup export",
      "数据导出",
      "本地备份导出",
      "完整备份",
      "提示词备份",
    ],
  },
  {
    settingId: "backup-import-card",
    title: "数据备份导入",
    keywords: ["import data", "backup restore", "数据导入", "本地恢复", "导入备份"],
  },
  {
    settingId: "backup-reset-card",
    title: "重置所有数据",
    keywords: ["danger zone", "reset all", "clear all", "重置数据", "清除所有数据", "危险操作"],
  },
  {
    settingId: "backup-webdav-card",
    title: "WebDAV 云端同步配置",
    keywords: ["webdav config", "cloud sync", "webdav 配置", "云端备份", "坚果云配置", "同步设置"],
  },
  {
    settingId: "shortcuts-global-card",
    title: "全局快捷键设置",
    keywords: [
      "global shortcuts",
      "enable shortcuts",
      "快捷键全局设置",
      "快捷键总开关",
      "浏览器快捷键",
    ],
  },
  {
    settingId: "permissions-optional-card",
    title: "可选权限管理",
    keywords: [
      "optional permissions",
      "notifications",
      "cookies",
      "webdav",
      "可选权限",
      "通知权限",
      "cookie权限",
      "权限授权",
    ],
  },
  {
    settingId: "permissions-required-card",
    title: "必需权限说明",
    keywords: [
      "required permissions",
      "permissions",
      "必要权限",
      "必需权限",
      "核心权限",
      "基础权限",
    ],
  },
  {
    settingId: ABOUT_SPONSOR_SETTING_ID,
    title: "赞助与支持",
    keywords: ["sponsor", "donate", "afdian", "赞助", "支持", "爱发电", "捐助"],
  },
  {
    settingId: "global-search-matching-card",
    title: "搜索匹配设置",
    keywords: [
      "search matching",
      "fuzzy search",
      "double shift",
      "搜索匹配",
      "模糊搜索",
      "双击shift",
    ],
  },
  {
    settingId: "global-search-prompt-card",
    title: "提示词行为设置",
    keywords: ["prompt behavior", "enter behavior", "提示词行为", "回车行为"],
  },
]

// 卡片层级搜索项 ID 集合，全局搜索据此区分页面/子 Tab/卡片/叶子项的标题权重。
// site-packs-registry 与 remote-config-status 定义在卡片列表之外，但语义上同属卡片层级。
export const SETTING_CARD_LEVEL_SEARCH_IDS: ReadonlySet<string> = new Set([
  ...SETTING_CARD_SEARCH_ITEMS.map((item) => item.settingId),
  "site-packs-registry",
  "remote-config-status",
])

const ADDITIONAL_SETTING_SEARCH_ITEMS: SettingsSearchItem[] = [
  {
    settingId: "tab-notification-sound-preset",
    title: "提示音音效预设",
    keywords: ["notification sound preset", "preset", "sound", "音效", "预设", "提示音"],
  },
  {
    settingId: "tab-notification-repeat-count",
    title: "提示音重复播放次数",
    keywords: ["notification repeat count", "repeat", "重复播放", "播放次数"],
  },
  {
    settingId: "tab-notification-repeat-interval",
    title: "提示音重复间隔时间",
    keywords: ["notification repeat interval", "interval", "重复间隔", "播放间隔"],
  },
  {
    settingId: "export-default-format",
    title: "默认导出格式",
    keywords: ["export default format", "markdown", "html", "txt", "json", "导出格式", "默认格式"],
  },
  {
    settingId: "export-style",
    title: "导出样式风格",
    keywords: ["export style", "theme", "bubble", "document", "导出样式", "对话气泡", "纯文档风格"],
  },
  {
    settingId: "export-show-index",
    title: "导出包含序号",
    keywords: ["export show index", "message index", "序号", "消息序号", "楼层号"],
  },
  {
    settingId: "export-show-dialog",
    title: "导出前显示预览对话框",
    keywords: ["export show dialog", "preview dialog", "导出预览", "确认弹窗"],
  },
  {
    settingId: "export-markdown-divider",
    title: "Markdown 分隔线标记",
    keywords: ["export markdown divider", "divider", "hr", "分隔线", "分割线"],
  },
  {
    settingId: "layout-clean-mode-enabled",
    title: "开启净化模式",
    keywords: ["clean mode", "distraction free", "净化模式", "去杂质", "纯净模式"],
  },
  {
    settingId: "chatgpt-code-block-batch-mount",
    title: "ChatGPT 代码块批量挂载优化",
    keywords: ["chatgpt", "code block", "batch mount", "代码块", "挂载", "性能优化"],
  },
  {
    settingId: "chatgpt-streaming-render-optimize",
    title: "ChatGPT 流式渲染性能优化",
    keywords: ["chatgpt", "streaming render", "optimize", "流式渲染", "性能优化", "卡顿"],
  },
  {
    settingId: "chatgpt-disable-backdrop-blur",
    title: "ChatGPT 禁用背景毛玻璃模糊",
    keywords: ["chatgpt", "backdrop blur", "毛玻璃", "模糊", "背景模糊", "掉帧"],
  },
  {
    settingId: "site-packs-local-import",
    title: "导入本地适配包",
    keywords: ["import site pack", "local pack", "zip", "json", "导入适配包", "本地导入", "安装包"],
  },
  {
    settingId: "remote-config-status",
    title: "适配配置更新状态",
    keywords: ["remote config status", "adapter version", "适配配置", "更新状态", "版本检查"],
  },
  {
    settingId: "remote-config-local-patch-import",
    title: "导入本地适配补丁",
    keywords: ["import patch", "local patch", "适配补丁", "热修复补丁", "导入补丁"],
  },
  {
    settingId: "permission-item-storage",
    title: "存储权限",
    keywords: ["storage permission", "存储", "存储权限", "必须权限"],
  },
  {
    settingId: "permission-item-notifications",
    title: "通知权限",
    keywords: ["notifications permission", "通知", "桌面通知", "消息提示权限"],
  },
  {
    settingId: "permission-item-cookies",
    title: "Cookie 权限",
    keywords: ["cookies permission", "cookie", "凭据权限", "账号权限"],
  },
  {
    settingId: "permission-item-webdav",
    title: "WebDAV 跨域访问权限",
    keywords: ["webdav permission", "all urls", "webdav 权限", "云同步权限", "网络请求权限"],
  },
  {
    settingId: "backup-webdav-provider",
    title: "WebDAV 服务商预设",
    keywords: ["webdav provider", "jianguoyun", "坚果云", "服务商", "webdav 预设"],
  },
  {
    settingId: "backup-webdav-url",
    title: "WebDAV 服务器地址",
    keywords: ["webdav address", "url", "server", "服务器地址", "网盘地址", "坚果云地址"],
  },
  {
    settingId: "backup-webdav-username",
    title: "WebDAV 用户名",
    keywords: ["webdav username", "account", "用户名", "账号", "登录名"],
  },
  {
    settingId: "backup-webdav-password",
    title: "WebDAV 授权密码",
    keywords: ["webdav password", "token", "密码", "应用密码", "授权码"],
  },
  {
    settingId: "backup-webdav-dir",
    title: "WebDAV 备份存储目录",
    keywords: ["webdav dir", "directory", "folder", "存储目录", "备份目录", "文件夹"],
  },
  {
    settingId: "remote-config-registry-source",
    title: "开发 Registry 源",
    keywords: ["registry source", "remote config", "适配仓库源", "自定义源", "注册表"],
  },
]

export const SETTINGS_SEARCH_ITEMS: SettingsSearchItem[] = [
  {
    settingId: "remote-config-auto-update",
    title: "自动更新适配配置",
    keywords: ["remote config", "auto update", "adapter", "自动更新", "适配配置", "热修复"],
  },
  {
    settingId: "remote-config-check-now",
    title: "立即检查适配配置更新",
    keywords: ["remote config", "check now", "manual update", "立即检查", "手动更新"],
  },
  {
    settingId: "remote-config-active-patches",
    title: "重置适配配置",
    keywords: ["remote config", "patch", "reset", "built in", "补丁", "重置", "内置配置"],
  },
  {
    settingId: "site-packs-registry",
    title: "在线适配库",
    keywords: [
      "site pack",
      "registry",
      "community",
      "install",
      "适配包",
      "在线适配库",
      "适配中心",
      "安装",
    ],
  },
  {
    settingId: "panel-mode",
    title: "面板模式",
    keywords: [
      "panel",
      "mode",
      "edge snap",
      "floating",
      "模式",
      "吸附",
      "悬浮",
      "默认打开",
      "自动隐藏",
    ],
  },
  {
    settingId: "panel-edge-trigger-mode",
    title: "边缘触发方式",
    keywords: [
      "panel",
      "edge trigger",
      "hidden edge",
      "visible handle",
      "hover edge",
      "边缘触发",
      "完全隐藏",
      "显示把手",
      "悬停边缘",
    ],
  },
  {
    settingId: "panel-default-position",
    title: "默认位置",
    keywords: ["panel", "left", "right", "默认侧边"],
  },
  {
    settingId: "panel-edge-distance",
    title: "默认边距",
    keywords: ["panel", "edge distance", "margin"],
  },
  {
    settingId: "panel-width",
    title: "面板宽度",
    keywords: ["panel width", "宽度"],
  },
  {
    settingId: "panel-resize-on-hover",
    title: "悬停时加宽",
    keywords: [
      "panel",
      "hover",
      "hover resize",
      "resize on hover",
      "temporary width",
      "悬停",
      "悬停加宽",
      "临时加宽",
      "加宽",
    ],
  },
  {
    settingId: "panel-hover-width",
    title: "悬停宽度",
    keywords: [
      "panel",
      "hover width",
      "hover resize width",
      "temporary width",
      "悬停",
      "悬停宽度",
      "临时宽度",
      "加宽宽度",
    ],
  },
  {
    settingId: "panel-height",
    title: "面板高度",
    keywords: ["panel height", "高度"],
  },
  {
    settingId: "panel-edge-snap-threshold",
    title: "边缘吸附阈值",
    keywords: ["snap threshold", "edge snap", "吸附阈值"],
  },

  {
    settingId: "quick-buttons-opacity",
    title: "快捷按钮透明度",
    keywords: ["quick buttons", "opacity", "透明度"],
  },
  {
    settingId: "quick-buttons-hide-when-panel-open",
    title: "面板展开时隐藏快捷按钮组",
    keywords: ["quick buttons", "hide", "panel open", "快捷按钮", "隐藏", "面板展开"],
  },
  {
    settingId: "quick-buttons-proximity-radius",
    title: "感应唤醒距离",
    keywords: ["quick buttons", "proximity", "radius", "唤醒距离", "感应"],
  },
  {
    settingId: "tools-menu-export",
    title: "工具箱：显示导出按钮",
    keywords: ["tools menu", "export", "工具箱", "导出"],
  },
  {
    settingId: "tools-menu-exportHTML",
    title: "工具箱：显示 HTML 导出",
    keywords: ["tools menu", "html", "export", "工具箱", "导出", "HTML"],
  },
  {
    settingId: "tools-menu-copyMarkdown",
    title: "工具箱：显示复制 Markdown",
    keywords: ["tools menu", "copy", "markdown", "工具箱"],
  },
  {
    settingId: "tools-menu-move",
    title: "工具箱：显示移动按钮",
    keywords: ["tools menu", "move", "folder", "工具箱"],
  },
  {
    settingId: "tools-menu-setTag",
    title: "工具箱：显示标签按钮",
    keywords: ["tools menu", "tag", "标签", "工具箱"],
  },
  {
    settingId: "tools-menu-scrollLock",
    title: "工具箱：显示滚动锁定",
    keywords: ["tools menu", "scroll lock", "锁定滚动", "工具箱"],
  },
  {
    settingId: "tools-menu-modelLock",
    title: "工具箱：显示模型锁定",
    keywords: ["tools menu", "model lock", "模型锁定", "工具箱"],
  },
  {
    settingId: "tools-menu-cleanup",
    title: "工具箱：显示清理按钮",
    keywords: ["tools menu", "cleanup", "清理", "工具箱"],
  },
  {
    settingId: "tools-menu-settings",
    title: "工具箱：显示设置按钮",
    keywords: ["tools menu", "settings", "设置", "工具箱"],
  },
  {
    settingId: "tab-open-new",
    title: "新会话打开方式",
    keywords: ["tab", "new conversation", "open in new tab", "新标签页"],
  },
  {
    settingId: "tab-auto-rename",
    title: "自动重命名标签页",
    keywords: ["tab", "auto rename", "自动命名"],
  },
  {
    settingId: "tab-rename-interval",
    title: "标签页重命名间隔",
    keywords: ["tab", "rename interval", "重命名间隔"],
  },
  {
    settingId: "tab-title-format",
    title: "标签页标题格式",
    keywords: ["tab", "title format", "标题模板"],
  },
  {
    settingId: "tab-show-status",
    title: "显示状态图标",
    keywords: ["tab", "status", "状态图标"],
  },
  {
    settingId: "tab-hide-status-when-read",
    title: "仅在未读时显示完成标记",
    keywords: ["tab", "hide status", "unread", "未读", "完成标记", "✅"],
  },
  {
    settingId: "tab-show-notification",
    title: "启用新消息通知",
    keywords: ["tab", "notification", "消息提醒"],
  },
  {
    settingId: "tab-notification-sound",
    title: "通知音效",
    keywords: ["tab", "notification sound", "声音提醒"],
  },
  {
    settingId: "tab-notification-volume",
    title: "通知音量",
    keywords: ["tab", "notification volume", "音量"],
  },
  {
    settingId: "tab-notify-when-focused",
    title: "标签页聚焦时也提醒",
    keywords: ["tab", "focused", "notify", "聚焦提醒"],
  },
  {
    settingId: "tab-auto-focus",
    title: "自动聚焦到对话页",
    keywords: ["tab", "auto focus", "自动聚焦"],
  },
  {
    settingId: "usage-monitor-enabled",
    title: "启用高级模型对话本地计数与预估",
    keywords: [
      "usage",
      "counter",
      "estimate",
      "token",
      "quota",
      "limit",
      "advanced model",
      "高级模型",
      "本地计数",
      "预估",
    ],
  },
  {
    settingId: "usage-monitor-daily-limit",
    title: "每日对话次数预估上限",
    keywords: ["daily limit", "quota", "limit", "每日上限", "次数上限", "token"],
  },
  {
    settingId: "usage-monitor-auto-reset",
    title: "自动归零",
    keywords: ["auto reset", "reset", "midnight", "自动归零", "重置", "清零"],
  },
  {
    settingId: "tab-privacy-mode",
    title: "隐私模式",
    keywords: ["tab", "privacy", "隐私"],
  },
  {
    settingId: "tab-privacy-title",
    title: "隐私模式标题",
    keywords: ["tab", "privacy title", "隐私标题"],
  },
  {
    settingId: "outline-auto-update",
    title: "自动更新大纲",
    keywords: ["outline", "auto update", "自动刷新"],
  },
  {
    settingId: "outline-update-interval",
    title: "大纲更新间隔",
    keywords: ["outline", "interval", "刷新频率"],
  },
  {
    settingId: "outline-follow-mode",
    title: "自动跟随浏览位置",
    keywords: ["outline", "follow", "自动跟随"],
  },
  {
    settingId: "outline-show-word-count",
    title: "显示字数统计",
    keywords: ["outline", "word count", "字数"],
  },
  {
    settingId: "outline-inline-bookmark-mode",
    title: "内联收藏模式",
    keywords: ["outline", "bookmark", "收藏", "inline"],
  },
  {
    settingId: "outline-panel-bookmark-mode",
    title: "面板收藏模式",
    keywords: ["outline", "bookmark", "收藏", "panel"],
  },
  {
    settingId: "outline-prevent-auto-scroll",
    title: "阻止自动滚动页面",
    keywords: ["outline", "auto scroll", "禁止滚动"],
  },
  {
    settingId: "conversation-folder-rainbow",
    title: "会话文件夹彩虹色",
    keywords: ["conversation", "folder", "rainbow", "文件夹颜色"],
  },
  {
    settingId: "conversation-sync-unpin",
    title: "同步时自动取消置顶",
    keywords: ["conversation", "sync", "unpin", "置顶"],
  },
  {
    settingId: "conversation-sync-delete",
    title: "删除时同步删除云端",
    keywords: ["conversation", "sync", "delete", "cloud", "删除", "云端"],
  },
  {
    settingId: "export-packaging",
    title: "Markdown 导出方式",
    keywords: ["export", "packaging", "markdown", "zip", "assets", "导出", "附件"],
  },
  {
    settingId: "export-custom-user-name",
    title: "导出：自定义用户名称",
    keywords: ["export", "user name", "导出用户名"],
  },
  {
    settingId: "export-custom-model-name",
    title: "导出：自定义模型名称",
    keywords: ["export", "model name", "导出模型名"],
  },
  {
    settingId: "export-filename-timestamp",
    title: "导出文件名包含时间戳",
    keywords: ["export", "filename", "timestamp", "时间戳"],
  },
  {
    settingId: "export-include-thoughts",
    title: "导出包含思维链",
    keywords: ["export", "thoughts", "reasoning", "thinking", "思维链", "思路", "推理"],
  },
  {
    settingId: "prompt-double-click-send",
    title: "提示词双击发送",
    keywords: ["prompt", "double click", "send", "双击发送"],
  },
  {
    settingId: "prompt-queue",
    title: "提示词队列",
    keywords: ["prompt", "queue", "提示词队列", "连续提问"],
  },
  {
    settingId: "prompt-quick-quote-enabled",
    title: "Ophel 选区引用",
    keywords: ["prompt", "quote", "quick quote", "selection", "引用", "选区引用", "悬浮条"],
  },
  {
    settingId: "reading-history-persistence",
    title: "阅读记录持久化",
    keywords: ["reading history", "persistence", "持久化"],
  },
  {
    settingId: "reading-history-auto-restore",
    title: "自动恢复阅读位置",
    keywords: ["reading history", "restore", "恢复位置"],
  },
  {
    settingId: "reading-history-cleanup-days",
    title: "阅读记录清理天数",
    keywords: ["reading history", "cleanup", "days", "清理周期"],
  },
  {
    settingId: "content-assistant-mermaid",
    title: "AI 回复 Mermaid 渲染",
    keywords: ["content", "mermaid", "diagram", "assistant response", "AI 回复"],
  },
  {
    settingId: "content-user-query-markdown",
    title: "用户提问样式优化",
    keywords: ["content", "markdown", "latex", "math", "user query", "用户提问", "数学公式"],
  },
  {
    settingId: "content-formula-copy",
    title: "公式复制增强",
    keywords: ["content", "formula", "copy", "数学公式"],
  },
  {
    settingId: "content-formula-copy-format",
    title: "公式复制格式",
    keywords: [
      "content",
      "formula",
      "copy",
      "format",
      "latex",
      "mathml",
      "复制格式",
      "LaTeX",
      "MathML",
    ],
  },
  {
    settingId: "content-formula-delimiter",
    title: "公式分隔符",
    keywords: ["content", "formula delimiter", "分隔符"],
  },
  {
    settingId: "content-table-copy",
    title: "表格复制增强",
    keywords: ["content", "table copy", "复制表格"],
  },
  {
    settingId: "layout-page-width-enabled",
    title: "页面宽度覆盖",
    keywords: ["layout", "page width", "页面宽度"],
  },
  {
    settingId: "layout-page-width-value",
    title: "页面宽度值",
    keywords: ["layout", "page width value", "页面宽度值"],
  },
  {
    settingId: "layout-panel-avoidance-enabled",
    title: "智能避让 Ophel 面板",
    keywords: ["layout", "panel avoidance", "smart layout", "遮挡", "避让", "面板"],
  },
  {
    settingId: "layout-user-query-width-enabled",
    title: "用户问题宽度覆盖",
    keywords: ["layout", "user query width", "提问宽度"],
  },
  {
    settingId: "layout-user-query-width-value",
    title: "用户问题宽度值",
    keywords: ["layout", "user query width value", "提问宽度值"],
  },
  {
    settingId: "layout-zen-mode-enabled",
    title: "布局：启用禅模式 (Zen Mode)",
    keywords: ["layout", "zen mode", "禅模式", "disclaimer", "免责声明", "隐藏"],
  },
  {
    settingId: "layout-zen-mode-exit-button-visible",
    title: "布局：显示退出禅模式按钮",
    keywords: ["layout", "zen mode", "exit button", "禅模式", "退出按钮", "隐藏"],
  },
  {
    settingId: "gemini-markdown-fix",
    title: "Gemini：Markdown 修复",
    keywords: ["gemini", "markdown", "fix", "修复"],
  },
  {
    settingId: "gemini-watermark-removal",
    title: "Gemini：去水印",
    keywords: ["gemini", "watermark", "去水印"],
  },
  {
    settingId: "gemini-policy-retry",
    title: "Gemini：策略重试",
    keywords: ["gemini", "policy retry", "策略重试"],
  },
  {
    settingId: "gemini-policy-max-retries",
    title: "Gemini：最大重试次数",
    keywords: ["gemini", "max retries", "最大重试"],
  },
  {
    settingId: "aistudio-collapse-navbar",
    title: "AI Studio：折叠左侧导航",
    keywords: ["aistudio", "collapse navbar", "折叠导航"],
  },
  {
    settingId: "aistudio-collapse-run-settings",
    title: "AI Studio：折叠 Run settings",
    keywords: ["aistudio", "run settings", "折叠运行设置"],
  },
  {
    settingId: "aistudio-collapse-tools",
    title: "AI Studio：折叠 Tools",
    keywords: ["aistudio", "tools", "折叠工具"],
  },
  {
    settingId: "aistudio-collapse-advanced",
    title: "AI Studio：折叠 Advanced",
    keywords: ["aistudio", "advanced", "折叠高级选项"],
  },
  {
    settingId: "aistudio-enable-search",
    title: "AI Studio：启用搜索",
    keywords: ["aistudio", "search", "启用搜索"],
  },
  {
    settingId: "aistudio-remove-watermark",
    title: "AI Studio：去水印",
    keywords: ["aistudio", "watermark", "去水印"],
  },
  {
    settingId: "aistudio-markdown-fix",
    title: "AI Studio：Markdown 修复",
    keywords: ["aistudio", "markdown", "fix", "修复"],
  },
  {
    settingId: "chatgpt-markdown-fix",
    title: "ChatGPT：Markdown 修复",
    keywords: ["chatgpt", "markdown", "fix", "修复"],
  },
  {
    settingId: "claude-session-keys",
    title: "Claude：Session Keys",
    keywords: ["claude", "session key", "token", "密钥"],
  },
  {
    settingId: "global-search-prompt-enter-behavior",
    title: "全局搜索：提示词回车行为",
    keywords: ["global search", "prompt", "enter", "全局搜索", "提示词", "回车"],
  },
  {
    settingId: "global-search-fuzzy-search",
    title: "Global Search: Enable fuzzy search",
    keywords: ["global search", "fuzzy", "search everywhere", "matching"],
  },
  {
    settingId: "global-search-double-shift",
    title: "全局搜索：双击 Shift 触发",
    keywords: ["global search", "double shift", "shortcut", "全局搜索", "双击 shift", "快捷键"],
  },
  {
    settingId: "global-search-shortcut-setting-link",
    title: "全局搜索：快捷键设置入口",
    keywords: ["global search", "shortcut", "keybinding", "全局搜索", "快捷键", "键位设置"],
  },
  {
    settingId: "shortcuts-enabled",
    title: "启用自定义快捷键",
    keywords: ["shortcuts", "enable", "快捷键", "自定义", "总开关"],
  },
  {
    settingId: "shortcuts-global-url",
    title: "全局快捷键 URL",
    keywords: ["shortcuts", "global url", "alt+o", "快捷键", "url"],
  },
  {
    settingId: "shortcuts-browser-shortcuts",
    title: "浏览器快捷键设置入口",
    keywords: ["shortcuts", "browser shortcuts", "chrome://extensions/shortcuts", "快捷键"],
  },
  {
    settingId: "shortcuts-prompt-submit-shortcut",
    title: "发送快捷键",
    keywords: ["shortcuts", "submit", "enter", "ctrl+enter", "发送", "快捷键"],
  },
  {
    settingId: "appearance-sync-native-page-theme",
    title: "同步原生页面主题",
    keywords: [
      "appearance",
      "theme",
      "native page theme",
      "sync native page theme",
      "sync page theme",
      "system theme",
      "同步原生页面主题",
      "原生页面主题",
      "同步主题",
      "跟随系统",
      "自适应",
      "亮暗模式联动",
      "宿主页面主题",
    ],
  },
  {
    settingId: "appearance-preset-light",
    title: "浅色主题预设",
    keywords: ["appearance", "theme", "light", "浅色"],
  },
  {
    settingId: "appearance-preset-dark",
    title: "深色主题预设",
    keywords: ["appearance", "theme", "dark", "深色"],
  },
  {
    settingId: "appearance-custom-styles",
    title: "自定义主题样式",
    keywords: ["appearance", "custom style", "主题样式", "css"],
  },
  ...SHORTCUT_SETTINGS_SEARCH_ITEMS,
  ...PAGE_TAB_SETTINGS_SEARCH_ITEMS,
  ...SUB_TAB_SETTINGS_SEARCH_ITEMS,
  ...SETTING_CARD_SEARCH_ITEMS,
  ...ADDITIONAL_SETTING_SEARCH_ITEMS,
]

const SETTING_ID_ALIAS_SEARCH_MAP = Object.entries(SETTING_ID_ALIASES).reduce(
  (collector, [aliasId, targetSettingId]) => {
    if (!collector[targetSettingId]) {
      collector[targetSettingId] = []
    }
    collector[targetSettingId].push(aliasId)
    return collector
  },
  {} as Record<string, string[]>,
)

const normalizeSearchValue = (value: string): string => value.trim().toLowerCase()
const toSearchTokens = (query: string): string[] =>
  normalizeSearchValue(query)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

export const searchSettingsItems = (query: string, limit?: number): SettingsSearchItem[] => {
  const normalizedQuery = normalizeSearchValue(query)
  const tokens = toSearchTokens(normalizedQuery)

  const scoredItems = SETTINGS_SEARCH_ITEMS.map((item, index) => {
    const normalizedTitle = normalizeSearchValue(item.title)
    const normalizedKeywords = normalizeSearchValue((item.keywords || []).join(" "))
    const normalizedSettingId = normalizeSearchValue(item.settingId)
    const normalizedAliasKeywords = normalizeSearchValue(
      (SETTING_ID_ALIAS_SEARCH_MAP[item.settingId] || []).join(" "),
    )
    const searchableText = `${normalizedTitle} ${normalizedKeywords} ${normalizedSettingId} ${normalizedAliasKeywords}`

    if (tokens.some((token) => !searchableText.includes(token))) {
      return null
    }

    let score = 0
    if (!normalizedQuery) {
      score = 1000 - index
    } else {
      if (normalizedTitle === normalizedQuery) score += 200
      if (normalizedTitle.startsWith(normalizedQuery)) score += 120
      if (normalizedTitle.includes(normalizedQuery)) score += 80
      if (normalizedKeywords.includes(normalizedQuery)) score += 70
      if (normalizedSettingId.includes(normalizedQuery)) score += 60
      if (normalizedAliasKeywords.includes(normalizedQuery)) score += 50

      tokens.forEach((token) => {
        if (normalizedTitle.startsWith(token)) score += 16
        if (normalizedTitle.includes(token)) score += 8
        if (normalizedKeywords.includes(token)) score += 6
        if (normalizedSettingId.includes(token)) score += 5
        if (normalizedAliasKeywords.includes(token)) score += 4
      })

      score += Math.max(0, 24 - Math.min(24, normalizedTitle.length))
    }

    return { item, score, index }
  })
    .filter((entry): entry is { item: SettingsSearchItem; score: number; index: number } => !!entry)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.index - right.index
    })

  const items = scoredItems.map(({ item }) => item)

  if (typeof limit === "number" && Number.isFinite(limit)) {
    return items.slice(0, Math.max(0, limit))
  }

  return items
}

// ==================== Tab 定义 ====================
// Tab 标签的显示配置
export const TAB_DEFINITIONS: Record<
  string,
  {
    label: string
    icon: string
    IconComponent?: React.ComponentType<{ size?: number | string; color?: string }>
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
    hideWhenPanelOpen?: boolean
    IconComponent?: React.ComponentType<{ size?: number | string; color?: string }>
  }
> = {
  scrollTop: {
    icon: "⬆",
    labelKey: "scrollTop",
    canToggle: true,
    isPanelOnly: false,
    hideWhenPanelOpen: true,
    IconComponent: ScrollTopIcon,
  },
  panel: {
    icon: "✨",
    labelKey: "panelTitle",
    canToggle: false,
    isPanelOnly: true,
    IconComponent: SparkleIcon,
  },
  floatingToolbar: {
    icon: "🧰",
    labelKey: "tools",
    canToggle: true,
    isPanelOnly: false,
    IconComponent: ToolsIcon,
  },
  globalSearch: {
    icon: "🔎",
    labelKey: "navGlobalSearch",
    canToggle: true,
    isPanelOnly: false,
    IconComponent: SearchIcon,
  },
  anchor: {
    icon: "⚓",
    canToggle: true,
    labelKey: "showCollapsedAnchorLabel",
    isPanelOnly: false,
    hideWhenPanelOpen: true,
    IconComponent: AnchorIcon,
  },
  theme: {
    icon: "☀",
    labelKey: "showCollapsedThemeLabel",
    canToggle: true,
    isPanelOnly: false,
    IconComponent: ThemeSystemIcon,
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
    canToggle: true,
    isPanelOnly: false,
    hideWhenPanelOpen: true,
    IconComponent: ScrollBottomIcon,
  },
  zenMode: {
    icon: "🧘",
    labelKey: "zenModeTitle",
    canToggle: true,
    isPanelOnly: false,
    IconComponent: EyeIcon,
  },
  settings: {
    icon: "⚙️",
    labelKey: "tabSettings",
    canToggle: true,
    isPanelOnly: false,
    IconComponent: SettingsIcon,
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

// ==================== 通知声音预设 ====================
export const NOTIFICATION_SOUND_PRESETS = [
  {
    id: "default",
    labelKey: "notificationSoundPresetDefault",
    fallback: "Default",
  },
  {
    id: "softChime",
    labelKey: "notificationSoundPresetSoftChime",
    fallback: "Soft Chime",
  },
  {
    id: "glassPing",
    labelKey: "notificationSoundPresetGlassPing",
    fallback: "Glass Ping",
  },
  {
    id: "brightAlert",
    labelKey: "notificationSoundPresetBrightAlert",
    fallback: "Bright Alert",
  },
] as const

export type NotificationSoundPresetId = (typeof NOTIFICATION_SOUND_PRESETS)[number]["id"]
