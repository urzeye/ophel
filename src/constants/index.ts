/**
 * 常量统一导出
 */

// UI 相关
export {
  TAB_IDS,
  TAB_DEFINITIONS,
  COLLAPSED_BUTTON_DEFS,
  NAV_IDS,
  FEATURES_TAB_IDS,
  APPEARANCE_TAB_IDS,
  SITE_SETTINGS_TAB_IDS,
  SETTING_ID_ROUTE_MAP,
  SETTING_ID_ALIASES,
  SETTINGS_SEARCH_ITEMS,
  resolveSettingId,
  resolveSettingRoute,
  resolveSettingsNavigateDetail,
  searchSettingsItems,
  PRESET_EMOJIS,
  NOTIFICATION_SOUND_PRESETS,
  TAG_COLORS,
  TOAST_DURATION,
  STATUS_COLORS,
  type NotificationSoundPresetId,
  type SettingsNavigateDetail,
  type SettingsSearchItem,
  type TabId,
} from "./ui"

// 快捷键
export {
  SHORTCUT_ACTIONS,
  SHORTCUT_CATEGORIES,
  DEFAULT_KEYBINDINGS as SHORTCUT_DEFAULT_BINDINGS,
} from "./shortcuts"

// 默认值
export {
  getDefaultPrompts,
  DEFAULT_FOLDERS,
  ZUSTAND_KEYS,
  MULTI_PROP_STORES,
  LAYOUT_CONFIG,
  VALIDATION_PATTERNS,
  BATCH_TEST_CONFIG,
  SITE_IDS,
  type Folder,
} from "./defaults"

// 提示词模块
export { VIRTUAL_CATEGORY, type VirtualCategoryType } from "./prompts"

// 工具箱菜单
export {
  TOOLS_MENU_IDS,
  TOOLS_MENU_ITEMS,
  getDefaultToolsMenuIds,
  type ToolsMenuItem,
  type ToolsMenuId,
} from "./tools-menu"
