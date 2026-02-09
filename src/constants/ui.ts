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

// ==================== Site Settings Page Tab IDs ====================
export const SITE_SETTINGS_TAB_IDS = {
  LAYOUT: "layout",
  MODEL_LOCK: "modelLock",
  // 站点专属 Tab ID 直接使用 SITE_IDS
} as const

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
