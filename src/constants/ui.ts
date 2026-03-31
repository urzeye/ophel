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
  SparkleIcon,
  ToolsIcon,
} from "~components/icons"
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
  GLOBAL_SEARCH: "globalSearch",
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
  REMINDER: "reminder",
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
} as const

const SETTING_ID_ROUTE_RULES: SettingRouteRule[] = [
  { prefix: "panel-", route: { page: NAV_IDS.GENERAL, subTab: "panel" } },
  { prefix: "quick-buttons-", route: { page: NAV_IDS.GENERAL, subTab: "shortcuts" } },
  { prefix: "tools-menu-", route: { page: NAV_IDS.GENERAL, subTab: "toolsMenu" } },
  { prefix: "shortcuts-", route: { page: NAV_IDS.SHORTCUTS } },
  { prefix: "shortcut-binding-", route: { page: NAV_IDS.SHORTCUTS } },
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
    prefix: "global-search-",
    route: { page: NAV_IDS.GLOBAL_SEARCH },
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
  "siteSettings.layout.zenMode.enabled": "layout-zen-mode-enabled",
  "siteSettings.modelLock": "model-lock-gemini",
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
  "features.export.includeThoughts": "export-include-thoughts",
  "features.readingHistory.persistence": "reading-history-persistence",
  "features.content.assistantMermaid": "content-assistant-mermaid",
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

export const SETTINGS_SEARCH_ITEMS: SettingsSearchItem[] = [
  {
    settingId: "panel-default-open",
    title: "默认显示面板",
    keywords: ["panel", "default open", "默认打开"],
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
    settingId: "panel-height",
    title: "面板高度",
    keywords: ["panel height", "高度"],
  },
  {
    settingId: "panel-edge-snap",
    title: "边缘自动吸附",
    keywords: ["snap", "edge", "吸附"],
  },
  {
    settingId: "panel-edge-snap-threshold",
    title: "边缘吸附阈值",
    keywords: ["snap threshold", "edge snap", "吸附阈值"],
  },
  {
    settingId: "panel-auto-hide",
    title: "自动隐藏面板",
    keywords: ["auto hide", "panel"],
  },
  {
    settingId: "quick-buttons-opacity",
    title: "快捷按钮透明度",
    keywords: ["quick buttons", "opacity", "透明度"],
  },
  {
    settingId: "tools-menu-export",
    title: "工具箱：显示导出按钮",
    keywords: ["tools menu", "export", "工具箱", "导出"],
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
    settingId: "export-images-base64",
    title: "导出时将图片转 Base64",
    keywords: ["export", "image", "base64", "图片"],
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
    title: "用户问题复制为 Markdown",
    keywords: ["content", "markdown", "user query", "用户问题"],
  },
  {
    settingId: "content-formula-copy",
    title: "公式复制增强",
    keywords: ["content", "formula", "copy", "数学公式"],
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
    settingId: "model-lock-gemini",
    title: "模型锁定：Gemini",
    keywords: ["model lock", "gemini", "模型锁定"],
  },
  {
    settingId: "model-lock-gemini-enterprise",
    title: "模型锁定：Gemini Enterprise",
    keywords: ["model lock", "gemini enterprise", "模型锁定"],
  },
  {
    settingId: "model-lock-aistudio",
    title: "模型锁定：AI Studio",
    keywords: ["model lock", "aistudio", "模型锁定"],
  },
  {
    settingId: "model-lock-chatgpt",
    title: "模型锁定：ChatGPT",
    keywords: ["model lock", "chatgpt", "模型锁定"],
  },
  {
    settingId: "model-lock-claude",
    title: "模型锁定：Claude",
    keywords: ["model lock", "claude", "模型锁定"],
  },
  {
    settingId: "model-lock-grok",
    title: "模型锁定：Grok",
    keywords: ["model lock", "grok", "模型锁定"],
  },
  {
    settingId: "model-lock-qianwen",
    title: "模型锁定：Qianwen",
    keywords: ["model lock", "qianwen", "tongyi", "通义千问", "模型锁定"],
  },
  {
    settingId: "model-lock-qwenai",
    title: "模型锁定：QwenAI",
    keywords: ["model lock", "qwenai", "chat.qwen.ai", "国际版千问", "模型锁定"],
  },
  {
    settingId: "model-lock-yuanbao",
    title: "模型锁定：Yuanbao",
    keywords: ["model lock", "yuanbao", "腾讯元宝", "模型锁定"],
  },
  {
    settingId: "model-lock-ima",
    title: "模型锁定：ima",
    keywords: ["model lock", "ima", "ima.qq.com", "腾讯 ima", "模型锁定"],
  },
  {
    settingId: "model-lock-zai",
    title: "模型锁定：Z.ai",
    keywords: ["model lock", "z.ai", "zai", "模型锁定"],
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
    keywords: ["shortcuts", "global url", "alt+g", "快捷键", "url"],
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
    IconComponent: SparkleIcon,
  },
  floatingToolbar: {
    icon: "🧰",
    labelKey: "tools", // Changed from floatingToolbarLabel
    canToggle: true, // This toggle will now open the menu
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
