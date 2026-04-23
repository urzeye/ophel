import type { ShortcutActionId } from "./shortcuts"

/**
 * 功能技巧数据 —— 全局搜索 `tip:` 前缀帮助模式的数据源
 *
 * highlightTarget: 对应 data-tip-target 属性值，用于点击后高亮对应 UI 元素
 * shortcutIds:    引用 DEFAULT_KEYBINDINGS 中的 key，用于动态显示快捷键
 */

export interface FeatureTip {
  id: string
  /** 语义目标名称，对应 Shadow DOM 内元素的 data-tip-target 属性（可选） */
  highlightTarget?: string
  /** 引用快捷键 ID 列表（对应 DEFAULT_KEYBINDINGS 的 key） */
  shortcutIds?: ShortcutActionId[]
}

export const FEATURE_TIPS: FeatureTip[] = [
  // ---- 快捷键 / 隐式操作 ----
  {
    id: "passthrough",
    // 无 highlightTarget，纯按键操作
  },
  {
    id: "panel-mode-toggle",
    highlightTarget: "header-title",
  },
  {
    id: "shortcuts",
    highlightTarget: "shortcuts-btn",
    shortcutIds: ["showShortcuts"],
  },
  {
    id: "global-search",
    highlightTarget: "search-btn",
    shortcutIds: ["openGlobalSearch"],
  },
  {
    id: "copy-reply",
    shortcutIds: ["copyLatestReply"],
  },
  {
    id: "prev-next-heading",
    highlightTarget: "outline-tab",
    shortcutIds: ["prevHeading", "nextHeading"],
  },
  // ---- 会话 Tab ----
  {
    id: "export-conv",
    highlightTarget: "conversations-tab",
  },
  {
    id: "batch-select",
    highlightTarget: "conversations-tab",
  },
  // ---- 工具箱 ----
  {
    id: "export-markdown",
    highlightTarget: "toolbar-btn",
  },
  // ---- 大纲 ----
  {
    id: "show-user-query",
    highlightTarget: "outline-tab",
  },
  // ---- 通知 ----
  {
    id: "notifications",
    highlightTarget: "settings-btn",
  },
]
