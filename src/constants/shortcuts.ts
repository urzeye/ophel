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
  keybindings: Record<string, ShortcutBinding | null> // null 表示已移除
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
  TOGGLE_USER_QUERIES: "toggleUserQueries",
  ONLY_USER_QUERIES: "onlyUserQueries",
  TOGGLE_BOOKMARKS: "toggleBookmarks",
  LOCATE_OUTLINE: "locateOutline",
  SEARCH_OUTLINE: "searchOutline",
  REFRESH_OUTLINE: "refreshOutline",
  PREV_HEADING: "prevHeading",
  NEXT_HEADING: "nextHeading",
  TOGGLE_OUTLINE_EXPAND: "toggleOutlineExpand",
  EXPAND_LEVEL_1: "expandLevel1",
  EXPAND_LEVEL_2: "expandLevel2",
  EXPAND_LEVEL_3: "expandLevel3",
  EXPAND_LEVEL_4: "expandLevel4",
  EXPAND_LEVEL_5: "expandLevel5",
  EXPAND_LEVEL_6: "expandLevel6",

  // 会话类
  NEW_CONVERSATION: "newConversation",
  REFRESH_CONVERSATIONS: "refreshConversations",
  LOCATE_CONVERSATION: "locateConversation",
  PREV_CONVERSATION: "prevConversation",
  NEXT_CONVERSATION: "nextConversation",

  // 编辑类
  EXPORT_CONVERSATION: "exportConversation",
  COPY_LATEST_REPLY: "copyLatestReply",
  COPY_LAST_CODE_BLOCK: "copyLastCodeBlock",
  TOGGLE_SCROLL_LOCK: "toggleScrollLock",
  FOCUS_INPUT: "focusInput",
  STOP_GENERATION: "stopGeneration",

  // 帮助类
  SHOW_SHORTCUTS: "showShortcuts",
  SHOW_MODEL_SELECTOR: "showModelSelector",

  // 设置类
  OPEN_CLAUDE_SETTINGS: "openClaudeSettings",
  SWITCH_CLAUDE_KEY: "switchClaudeKey",
  OPEN_GEMINI_SETTINGS: "openGeminiSettings",
  OPEN_THEME_SETTINGS: "openThemeSettings",
  OPEN_MODEL_LOCK_SETTINGS: "openModelLockSettings",
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
  togglePanel: { labelKey: "shortcutTogglePanel", label: "展开/收起面板", category: "panel" },
  toggleTheme: { labelKey: "shortcutToggleTheme", label: "切换主题", category: "panel" },
  switchTab1: { labelKey: "shortcutSwitchTab1", label: "切换到第 1 个标签", category: "panel" },
  switchTab2: { labelKey: "shortcutSwitchTab2", label: "切换到第 2 个标签", category: "panel" },
  switchTab3: { labelKey: "shortcutSwitchTab3", label: "切换到第 3 个标签", category: "panel" },

  // 大纲类
  toggleUserQueries: {
    labelKey: "shortcutToggleUserQueries",
    label: "显示用户问题",
    category: "outline",
  },
  onlyUserQueries: {
    labelKey: "shortcutOnlyUserQueries",
    label: "只显示用户问题",
    category: "outline",
  },
  toggleBookmarks: {
    labelKey: "shortcutToggleBookmarks",
    label: "显示用户收藏",
    category: "outline",
  },
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
  prevHeading: { labelKey: "shortcutPrevHeading", label: "上一个标题", category: "outline" },
  nextHeading: { labelKey: "shortcutNextHeading", label: "下一个标题", category: "outline" },
  refreshOutline: { labelKey: "shortcutRefreshOutline", label: "刷新大纲", category: "outline" },
  toggleOutlineExpand: {
    labelKey: "shortcutToggleOutlineExpand",
    label: "展开/折叠全部",
    category: "outline",
  },
  expandLevel1: { labelKey: "shortcutExpandLevel1", label: "展开到 1 级", category: "outline" },
  expandLevel2: { labelKey: "shortcutExpandLevel2", label: "展开到 2 级", category: "outline" },
  expandLevel3: { labelKey: "shortcutExpandLevel3", label: "展开到 3 级", category: "outline" },
  expandLevel4: { labelKey: "shortcutExpandLevel4", label: "展开到 4 级", category: "outline" },
  expandLevel5: { labelKey: "shortcutExpandLevel5", label: "展开到 5 级", category: "outline" },
  expandLevel6: { labelKey: "shortcutExpandLevel6", label: "展开到 6 级", category: "outline" },

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
  prevConversation: {
    labelKey: "shortcutPrevConversation",
    label: "上一个会话",
    category: "conversation",
  },
  nextConversation: {
    labelKey: "shortcutNextConversation",
    label: "下一个会话",
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
  copyLastCodeBlock: {
    labelKey: "shortcutCopyLastCodeBlock",
    label: "复制最后代码块",
    category: "edit",
  },
  toggleScrollLock: {
    labelKey: "shortcutToggleScrollLock",
    label: "锁定滚动",
    category: "edit",
  },
  focusInput: {
    labelKey: "shortcutFocusInput",
    label: "聚焦输入框",
    category: "edit",
  },
  stopGeneration: {
    labelKey: "shortcutStopGeneration",
    label: "停止生成",
    category: "edit",
  },
  showModelSelector: {
    labelKey: "shortcutShowModelSelector",
    label: "模型选择菜单",
    category: "edit",
  },

  // 设置类
  openSettings: { labelKey: "shortcutOpenSettings", label: "打开设置", category: "settings" },

  // 帮助类
  showShortcuts: {
    labelKey: "shortcutShowShortcuts",
    label: "快捷键一览",
    category: "settings",
  },

  openThemeSettings: {
    labelKey: "shortcutOpenThemeSettings",
    label: "打开外观主题",
    category: "settings",
  },

  openModelLockSettings: {
    labelKey: "shortcutOpenModelLockSettings",
    label: "打开模型锁定",
    category: "settings",
  },

  openGeminiSettings: {
    labelKey: "shortcutOpenGeminiSettings",
    label: "打开 Gemini 专属",
    category: "settings",
  },
  openClaudeSettings: {
    labelKey: "shortcutOpenClaudeSettings",
    label: "打开 Claude 专属",
    category: "settings",
  },
  switchClaudeKey: {
    labelKey: "shortcutSwitchClaudeKey",
    label: "一键切换可用 Claude Key",
    category: "settings",
  },
}

// 分类元数据
export const SHORTCUT_CATEGORIES = {
  navigation: { labelKey: "shortcutCategoryNavigation", label: "导航" },
  panel: { labelKey: "shortcutCategoryPanel", label: "面板" },
  outline: { labelKey: "shortcutCategoryOutline", label: "大纲" },
  conversation: { labelKey: "shortcutCategoryConversation", label: "会话" },
  edit: { labelKey: "shortcutCategoryEdit", label: "编辑" },
  settings: { labelKey: "shortcutCategorySettings", label: "设置" },
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
  switchTab1: { key: "1", alt: true },
  switchTab2: { key: "2", alt: true },
  switchTab3: { key: "3", alt: true },

  // 大纲类
  refreshOutline: { key: "r", alt: true },
  toggleOutlineExpand: { key: "e", alt: true },
  expandLevel1: { key: "1", alt: true, shift: true },
  expandLevel2: { key: "2", alt: true, shift: true },
  expandLevel3: { key: "3", alt: true, shift: true },
  expandLevel4: { key: "4", alt: true, shift: true },
  expandLevel5: { key: "5", alt: true, shift: true },
  expandLevel6: { key: "6", alt: true, shift: true },
  toggleUserQueries: { key: "q", alt: true },
  toggleBookmarks: { key: "c", alt: true },
  onlyUserQueries: { key: "q", alt: true, shift: true },
  prevHeading: { key: "ArrowUp", alt: true },
  nextHeading: { key: "ArrowDown", alt: true },
  locateOutline: { key: "l", alt: true },
  searchOutline: { key: "f", alt: true },

  // 会话类
  newConversation: { key: "o", ctrl: true, shift: true },
  refreshConversations: { key: "r", alt: true, shift: true },
  locateConversation: { key: "l", alt: true, shift: true },
  prevConversation: { key: "[", alt: true },
  nextConversation: { key: "]", alt: true },

  // 编辑类
  exportConversation: { key: "e", ctrl: true, shift: true },
  copyLatestReply: { key: "c", ctrl: true, shift: true },
  copyLastCodeBlock: { key: ";", alt: true },
  toggleScrollLock: { key: "s", alt: true },
  focusInput: { key: "i", alt: true },
  stopGeneration: { key: "k", alt: true },
  showModelSelector: { key: "/", alt: true },

  // 设置类
  showShortcuts: { key: "\\", alt: true },
  openSettings: { key: ",", alt: true },
  openClaudeSettings: { key: "c", ctrl: true, alt: true },
  switchClaudeKey: { key: "s", ctrl: true, alt: true },
  openGeminiSettings: { key: "g", ctrl: true, alt: true },
  openThemeSettings: { key: "t", ctrl: true, alt: true },
  openModelLockSettings: { key: "l", ctrl: true, alt: true },
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
