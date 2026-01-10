/**
 * 快捷键常量定义
 *
 * 定义所有可配置的快捷键及其默认值
 */

export interface ShortcutBinding {
  key: string // 主键 (e.g., "t", "1", ",", "ArrowUp")
  alt?: boolean // Windows Alt / Mac Option
  ctrl?: boolean // Windows Ctrl
  meta?: boolean // Mac Cmd
  shift?: boolean
}

export interface ShortcutsSettings {
  enabled: boolean // 总开关
  globalUrl: string // 全局快捷键打开的 URL
  keybindings: Record<string, ShortcutBinding>
}

// 快捷键动作 ID
export const SHORTCUT_ACTIONS = {
  // 导航类
  SCROLL_TOP: "scrollTop",
  SCROLL_BOTTOM: "scrollBottom",
  GO_TO_ANCHOR: "goToAnchor",

  // 面板类
  TOGGLE_PANEL: "togglePanel",
  TOGGLE_THEME: "toggleTheme",
  OPEN_SETTINGS: "openSettings",
  SWITCH_TAB_1: "switchTab1",
  SWITCH_TAB_2: "switchTab2",
  SWITCH_TAB_3: "switchTab3",

  // 大纲类
  REFRESH_OUTLINE: "refreshOutline",
  TOGGLE_OUTLINE_EXPAND: "toggleOutlineExpand",
  EXPAND_LEVEL_1: "expandLevel1",
  EXPAND_LEVEL_2: "expandLevel2",
  EXPAND_LEVEL_3: "expandLevel3",
  TOGGLE_USER_QUERIES: "toggleUserQueries",
  PREV_HEADING: "prevHeading",
  NEXT_HEADING: "nextHeading",
  LOCATE_OUTLINE: "locateOutline",
  SEARCH_OUTLINE: "searchOutline",

  // 会话类
  NEW_CONVERSATION: "newConversation",
  REFRESH_CONVERSATIONS: "refreshConversations",
  LOCATE_CONVERSATION: "locateConversation",

  // 编辑类
  EXPORT_CONVERSATION: "exportConversation",
  COPY_LATEST_REPLY: "copyLatestReply",
  TOGGLE_SCROLL_LOCK: "toggleScrollLock",
} as const

export type ShortcutActionId = (typeof SHORTCUT_ACTIONS)[keyof typeof SHORTCUT_ACTIONS]

// 快捷键元数据（用于 UI 显示）
export const SHORTCUT_META: Record<
  ShortcutActionId,
  { labelKey: string; label: string; category: string }
> = {
  // 导航类
  scrollTop: { labelKey: "shortcutScrollTop", label: "去顶部", category: "navigation" },
  scrollBottom: { labelKey: "shortcutScrollBottom", label: "去底部", category: "navigation" },
  goToAnchor: { labelKey: "shortcutGoToAnchor", label: "返回锚点", category: "navigation" },

  // 面板类
  togglePanel: { labelKey: "shortcutTogglePanel", label: "切换面板", category: "panel" },
  toggleTheme: { labelKey: "shortcutToggleTheme", label: "切换主题", category: "panel" },
  openSettings: { labelKey: "shortcutOpenSettings", label: "打开设置", category: "panel" },
  switchTab1: { labelKey: "shortcutSwitchTab1", label: "切换到第 1 个标签", category: "panel" },
  switchTab2: { labelKey: "shortcutSwitchTab2", label: "切换到第 2 个标签", category: "panel" },
  switchTab3: { labelKey: "shortcutSwitchTab3", label: "切换到第 3 个标签", category: "panel" },

  // 大纲类
  refreshOutline: { labelKey: "shortcutRefreshOutline", label: "刷新大纲", category: "outline" },
  toggleOutlineExpand: {
    labelKey: "shortcutToggleOutlineExpand",
    label: "展开/折叠全部",
    category: "outline",
  },
  expandLevel1: { labelKey: "shortcutExpandLevel1", label: "展开到 1 级", category: "outline" },
  expandLevel2: { labelKey: "shortcutExpandLevel2", label: "展开到 2 级", category: "outline" },
  expandLevel3: { labelKey: "shortcutExpandLevel3", label: "展开到 3 级", category: "outline" },
  toggleUserQueries: {
    labelKey: "shortcutToggleUserQueries",
    label: "显示用户问题",
    category: "outline",
  },
  prevHeading: { labelKey: "shortcutPrevHeading", label: "上一个标题", category: "outline" },
  nextHeading: { labelKey: "shortcutNextHeading", label: "下一个标题", category: "outline" },
  locateOutline: {
    labelKey: "shortcutLocateOutline",
    label: "定位大纲",
    category: "outline",
  },
  searchOutline: {
    labelKey: "shortcutSearchOutline",
    label: "搜索大纲",
    category: "outline",
  },

  // 会话类
  newConversation: {
    labelKey: "shortcutNewConversation",
    label: "新会话",
    category: "conversation",
  },
  refreshConversations: {
    labelKey: "shortcutRefreshConversations",
    label: "刷新会话列表",
    category: "conversation",
  },
  locateConversation: {
    labelKey: "shortcutLocateConversation",
    label: "定位当前会话",
    category: "conversation",
  },

  // 编辑类
  exportConversation: {
    labelKey: "shortcutExportConversation",
    label: "导出对话",
    category: "edit",
  },
  copyLatestReply: {
    labelKey: "shortcutCopyLatestReply",
    label: "复制最新回复",
    category: "edit",
  },
  toggleScrollLock: {
    labelKey: "shortcutToggleScrollLock",
    label: "锁定滚动",
    category: "edit",
  },
}

// 分类元数据
export const SHORTCUT_CATEGORIES = {
  navigation: { labelKey: "shortcutCategoryNavigation", label: "导航" },
  panel: { labelKey: "shortcutCategoryPanel", label: "面板" },
  outline: { labelKey: "shortcutCategoryOutline", label: "大纲" },
  conversation: { labelKey: "shortcutCategoryConversation", label: "会话" },
  edit: { labelKey: "shortcutCategoryEdit", label: "编辑" },
}

// 默认快捷键配置
export const DEFAULT_KEYBINDINGS: Record<ShortcutActionId, ShortcutBinding> = {
  // 导航类
  scrollTop: { key: "t", alt: true },
  scrollBottom: { key: "b", alt: true },
  goToAnchor: { key: "z", alt: true },

  // 面板类
  togglePanel: { key: "p", alt: true },
  toggleTheme: { key: "d", alt: true },
  openSettings: { key: ",", alt: true },
  switchTab1: { key: "1", alt: true },
  switchTab2: { key: "2", alt: true },
  switchTab3: { key: "3", alt: true },

  // 大纲类
  refreshOutline: { key: "r", alt: true },
  toggleOutlineExpand: { key: "e", alt: true },
  expandLevel1: { key: "1", alt: true, shift: true },
  expandLevel2: { key: "2", alt: true, shift: true },
  expandLevel3: { key: "3", alt: true, shift: true },
  toggleUserQueries: { key: "q", alt: true },
  prevHeading: { key: "ArrowUp", alt: true },
  nextHeading: { key: "ArrowDown", alt: true },
  locateOutline: { key: "l", alt: true },
  searchOutline: { key: "f", alt: true },

  // 会话类
  newConversation: { key: "o", ctrl: true, shift: true },
  refreshConversations: { key: "r", alt: true, shift: true },
  locateConversation: { key: "l", alt: true, shift: true },

  // 编辑类
  exportConversation: { key: "e", ctrl: true, shift: true },
  copyLatestReply: { key: "c", ctrl: true, shift: true },
  toggleScrollLock: { key: "s", alt: true },
}

// 默认快捷键设置
export const DEFAULT_SHORTCUTS_SETTINGS: ShortcutsSettings = {
  enabled: true,
  globalUrl: "https://gemini.google.com",
  keybindings: DEFAULT_KEYBINDINGS,
}

/**
 * 将快捷键配置转换为用于显示的字符串
 */
export function formatShortcut(binding: ShortcutBinding, isMac = false): string {
  const parts: string[] = []

  if (binding.ctrl) {
    parts.push(isMac ? "⌘" : "Ctrl")
  }
  if (binding.meta && isMac) {
    parts.push("⌘")
  }
  if (binding.alt) {
    parts.push(isMac ? "⌥" : "Alt")
  }
  if (binding.shift) {
    parts.push(isMac ? "⇧" : "Shift")
  }

  // 特殊键名映射
  const keyMap: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    ",": ",",
  }

  const displayKey = keyMap[binding.key] || binding.key.toUpperCase()
  parts.push(displayKey)

  return parts.join(isMac ? "" : "+")
}

/**
 * 检测当前是否为 Mac 系统
 */
export function isMacOS(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}
