/**
 * 工具箱菜单配置
 *
 * 定义工具箱弹出菜单中的所有按钮及其配置
 */

import React from "react"

import {
  CleanupIcon,
  CopyIcon,
  ExportIcon,
  FolderMoveIcon,
  ModelLockIcon,
  ScrollLockIcon,
  SettingsIcon,
  TagIcon,
} from "~components/icons"

/**
 * 工具菜单项配置接口
 */
export interface ToolsMenuItem {
  /** 唯一标识符 */
  id: string
  /** 国际化翻译键 */
  labelKey: string
  /** 默认文案 (无翻译 fallback) */
  defaultLabel: string
  /** 图标组件 */
  IconComponent: React.ComponentType<{ size?: number }>
  /** 是否是开关类按钮 (有 active 状态) */
  isToggle?: boolean
  /** 是否渲染在分隔线之后 (危险操作区) */
  isDanger?: boolean
  /** 是否渲染在最后分隔线之后 (系统区) */
  isSystem?: boolean
  /** 默认是否显示 */
  defaultVisible?: boolean
}

/**
 * 工具菜单按钮 ID 常量
 */
export const TOOLS_MENU_IDS = {
  EXPORT: "export",
  COPY_MARKDOWN: "copyMarkdown",
  MOVE: "move",
  SET_TAG: "setTag",
  SCROLL_LOCK: "scrollLock",
  MODEL_LOCK: "modelLock",
  CLEANUP: "cleanup",
  SETTINGS: "settings",
} as const

export type ToolsMenuId = (typeof TOOLS_MENU_IDS)[keyof typeof TOOLS_MENU_IDS]

/**
 * 工具菜单项定义 (按默认顺序)
 *
 * 注意：Settings 按钮始终显示，用户不可关闭
 */
export const TOOLS_MENU_ITEMS: ToolsMenuItem[] = [
  {
    id: TOOLS_MENU_IDS.EXPORT,
    labelKey: "export",
    defaultLabel: "Export",
    IconComponent: ExportIcon,
    defaultVisible: true,
  },
  {
    id: TOOLS_MENU_IDS.COPY_MARKDOWN,
    labelKey: "exportToClipboard",
    defaultLabel: "Copy Markdown",
    IconComponent: CopyIcon,
    defaultVisible: true,
  },
  {
    id: TOOLS_MENU_IDS.MOVE,
    labelKey: "conversationsMoveTo",
    defaultLabel: "Move",
    IconComponent: FolderMoveIcon,
    defaultVisible: true,
  },
  {
    id: TOOLS_MENU_IDS.SET_TAG,
    labelKey: "conversationsSetTag",
    defaultLabel: "Set Tag",
    IconComponent: TagIcon,
    defaultVisible: true,
  },
  {
    id: TOOLS_MENU_IDS.SCROLL_LOCK,
    labelKey: "shortcutToggleScrollLock",
    defaultLabel: "Scroll Lock",
    IconComponent: ScrollLockIcon,
    isToggle: true,
    defaultVisible: true,
  },
  {
    id: TOOLS_MENU_IDS.MODEL_LOCK,
    labelKey: "modelLockTitle",
    defaultLabel: "Model Lock",
    IconComponent: ModelLockIcon,
    isToggle: true,
    defaultVisible: true,
  },
  {
    id: TOOLS_MENU_IDS.CLEANUP,
    labelKey: "cleanup",
    defaultLabel: "Cleanup",
    IconComponent: CleanupIcon,
    isDanger: true,
    defaultVisible: true,
  },
  {
    id: TOOLS_MENU_IDS.SETTINGS,
    labelKey: "tabSettings",
    defaultLabel: "Settings",
    IconComponent: SettingsIcon,
    isSystem: true,
    defaultVisible: true, // 始终显示，不可关闭
  },
]

/**
 * 获取默认启用的工具菜单项 ID 列表
 */
export function getDefaultToolsMenuIds(): ToolsMenuId[] {
  return TOOLS_MENU_ITEMS.filter((item) => item.defaultVisible).map(
    (item) => item.id as ToolsMenuId,
  )
}
