import { DEFAULT_SHORTCUTS_SETTINGS } from "~constants/shortcuts"
import { isUserscriptPlatform } from "~platform/utils"
import type {
  PageWidthConfig,
  PanelAvoidanceSettings,
  QuickButtonConfig,
  QuickButtonsSettings,
  Settings,
  SiteThemeConfig,
  ZenModeConfig,
} from "~types/settings"

// 油猴脚本环境标识（用于设置默认值）
const isUserscript = isUserscriptPlatform()

// 默认站点主题配置
export const DEFAULT_SITE_THEME: SiteThemeConfig = {
  mode: "light",
  lightStyleId: "google-gradient",
  darkStyleId: "classic-dark",
}

// 默认页面宽度配置
export const DEFAULT_PAGE_WIDTH: PageWidthConfig = {
  enabled: false,
  value: "81",
  unit: "%",
}

// 默认用户问题宽度配置（统一使用百分比，旧版 px 数据在 store 中自动迁移）
export const DEFAULT_USER_QUERY_WIDTH: PageWidthConfig = {
  enabled: false,
  value: "81",
  unit: "%",
}

// 默认禅模式配置
export const DEFAULT_ZEN_MODE: ZenModeConfig = {
  enabled: false,
  showExitButton: true,
}

export const DEFAULT_PANEL_AVOIDANCE: PanelAvoidanceSettings = {
  enabled: true,
}

// 默认净化模式配置
export const DEFAULT_CLEAN_MODE: ZenModeConfig = {
  enabled: true,
}

const DEFAULT_COLLAPSED_BUTTONS: QuickButtonConfig[] = [
  { id: "panel", enabled: true },
  { id: "floatingToolbar", enabled: true },
  { id: "globalSearch", enabled: true },
  { id: "theme", enabled: true },
  { id: "zenMode", enabled: true },
  { id: "settings", enabled: true },
  { id: "scrollTop", enabled: true },
  { id: "manualAnchor", enabled: false },
  { id: "anchor", enabled: true },
  { id: "scrollBottom", enabled: true },
]

export const DEFAULT_QUICK_BUTTONS_SETTINGS: QuickButtonsSettings = {
  collapsed: DEFAULT_COLLAPSED_BUTTONS.map((button) => ({ ...button })),
  opacity: 1,
  floatingToolbar: {
    open: true,
  },
  hideWhenPanelOpen: false,
  proximityRadius: 150,
}

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  hasAgreedToTerms: false,
  hasSeenOphelAdvancedGuide: false,

  panel: {
    panelExpanded: true,
    panelMode: "floating",
    edgeTriggerMode: "handle",
    preventAutoScroll: false,
    defaultPosition: "right",
    defaultEdgeDistance: 0,
    edgeSnapThreshold: 30,
    height: 85,
    width: 320,
    resizeOnHover: false,
    hoverWidth: 520,
  },

  geminiEnterprise: {
    policyRetry: {
      enabled: false,
      maxRetries: 3,
    },
  },

  content: {
    assistantMermaid: true, // 默认开启，仅对非原生 Mermaid 站点生效
    markdownFix: false,
    // 油猴脚本环境默认开启（GM_xmlhttpRequest 已通过 @grant 声明）
    watermarkRemoval: isUserscript,
    formulaCopy: true,
    formulaCopyFormat: "latex",
    formulaDelimiter: true,
    tableCopy: true,
    userQueryMarkdown: true, // 默认开启
  },

  export: {
    customUserName: "",
    customModelName: "",
    exportFilenameTimestamp: false,
    includeThoughts: true,
    packaging: "markdown",
  },

  theme: {
    syncNativePageTheme: true,
    sites: {
      gemini: { ...DEFAULT_SITE_THEME },
      "gemini-enterprise": { ...DEFAULT_SITE_THEME },
      doubao: { ...DEFAULT_SITE_THEME },
      ima: { ...DEFAULT_SITE_THEME },
      deepseek: { ...DEFAULT_SITE_THEME },
      yuanbao: { ...DEFAULT_SITE_THEME },
      zai: { ...DEFAULT_SITE_THEME },
      _default: { ...DEFAULT_SITE_THEME },
    },
    customStyles: [], // 空数组，用户可以添加自定义样式
  },

  layout: {
    pageWidth: {
      gemini: { ...DEFAULT_PAGE_WIDTH },
      "gemini-enterprise": { ...DEFAULT_PAGE_WIDTH },
      grok: { ...DEFAULT_PAGE_WIDTH },
      aistudio: { ...DEFAULT_PAGE_WIDTH },
      chatgpt: { ...DEFAULT_PAGE_WIDTH },
      claude: { ...DEFAULT_PAGE_WIDTH },
      chatglm: { ...DEFAULT_PAGE_WIDTH },
      doubao: { ...DEFAULT_PAGE_WIDTH },
      ima: { ...DEFAULT_PAGE_WIDTH },
      deepseek: { ...DEFAULT_PAGE_WIDTH },
      kimi: { ...DEFAULT_PAGE_WIDTH },
      qianwen: { ...DEFAULT_PAGE_WIDTH },
      qwenai: { ...DEFAULT_PAGE_WIDTH },
      yuanbao: { ...DEFAULT_PAGE_WIDTH },
      zai: { ...DEFAULT_PAGE_WIDTH },
      _default: { ...DEFAULT_PAGE_WIDTH },
    },
    userQueryWidth: {
      gemini: { ...DEFAULT_USER_QUERY_WIDTH },
      "gemini-enterprise": { ...DEFAULT_USER_QUERY_WIDTH },
      grok: { ...DEFAULT_USER_QUERY_WIDTH },
      aistudio: { ...DEFAULT_USER_QUERY_WIDTH },
      chatgpt: { ...DEFAULT_USER_QUERY_WIDTH },
      claude: { ...DEFAULT_USER_QUERY_WIDTH },
      chatglm: { ...DEFAULT_USER_QUERY_WIDTH },
      doubao: { ...DEFAULT_USER_QUERY_WIDTH },
      ima: { ...DEFAULT_USER_QUERY_WIDTH },
      deepseek: { ...DEFAULT_USER_QUERY_WIDTH },
      kimi: { ...DEFAULT_USER_QUERY_WIDTH },
      qianwen: { ...DEFAULT_USER_QUERY_WIDTH },
      qwenai: { ...DEFAULT_USER_QUERY_WIDTH },
      yuanbao: { ...DEFAULT_USER_QUERY_WIDTH },
      zai: { ...DEFAULT_USER_QUERY_WIDTH },
      _default: { ...DEFAULT_USER_QUERY_WIDTH },
    },
    zenMode: {
      gemini: { ...DEFAULT_ZEN_MODE },
      "gemini-enterprise": { ...DEFAULT_ZEN_MODE },
      grok: { ...DEFAULT_ZEN_MODE },
      aistudio: { ...DEFAULT_ZEN_MODE },
      chatgpt: { ...DEFAULT_ZEN_MODE },
      claude: { ...DEFAULT_ZEN_MODE },
      chatglm: { ...DEFAULT_ZEN_MODE },
      doubao: { ...DEFAULT_ZEN_MODE },
      ima: { ...DEFAULT_ZEN_MODE },
      deepseek: { ...DEFAULT_ZEN_MODE },
      kimi: { ...DEFAULT_ZEN_MODE },
      qianwen: { ...DEFAULT_ZEN_MODE },
      qwenai: { ...DEFAULT_ZEN_MODE },
      yuanbao: { ...DEFAULT_ZEN_MODE },
      zai: { ...DEFAULT_ZEN_MODE },
      _default: { ...DEFAULT_ZEN_MODE },
    },
    cleanMode: {
      gemini: { ...DEFAULT_CLEAN_MODE },
      "gemini-enterprise": { ...DEFAULT_CLEAN_MODE },
      aistudio: { ...DEFAULT_CLEAN_MODE },
      chatgpt: { ...DEFAULT_CLEAN_MODE },
      claude: { ...DEFAULT_CLEAN_MODE },
      chatglm: { ...DEFAULT_CLEAN_MODE },
      doubao: { ...DEFAULT_CLEAN_MODE },
      ima: { ...DEFAULT_CLEAN_MODE },
      deepseek: { ...DEFAULT_CLEAN_MODE },
      kimi: { ...DEFAULT_CLEAN_MODE },
      qianwen: { ...DEFAULT_CLEAN_MODE },
      qwenai: { ...DEFAULT_CLEAN_MODE },
      yuanbao: { ...DEFAULT_CLEAN_MODE },
      zai: { ...DEFAULT_CLEAN_MODE },
      _default: { ...DEFAULT_CLEAN_MODE },
    },
    panelAvoidance: {
      gemini: { ...DEFAULT_PANEL_AVOIDANCE },
      "gemini-enterprise": { ...DEFAULT_PANEL_AVOIDANCE },
      grok: { ...DEFAULT_PANEL_AVOIDANCE },
      aistudio: { ...DEFAULT_PANEL_AVOIDANCE },
      chatgpt: { ...DEFAULT_PANEL_AVOIDANCE },
      claude: { ...DEFAULT_PANEL_AVOIDANCE },
      chatglm: { ...DEFAULT_PANEL_AVOIDANCE },
      doubao: { ...DEFAULT_PANEL_AVOIDANCE },
      ima: { ...DEFAULT_PANEL_AVOIDANCE },
      deepseek: { ...DEFAULT_PANEL_AVOIDANCE },
      kimi: { ...DEFAULT_PANEL_AVOIDANCE },
      qianwen: { ...DEFAULT_PANEL_AVOIDANCE },
      qwenai: { ...DEFAULT_PANEL_AVOIDANCE },
      yuanbao: { ...DEFAULT_PANEL_AVOIDANCE },
      zai: { ...DEFAULT_PANEL_AVOIDANCE },
      _default: { ...DEFAULT_PANEL_AVOIDANCE },
    },
  },

  modelLock: {
    gemini: { enabled: false, keyword: "" },
    "gemini-enterprise": { enabled: false, keyword: "" },
    ima: { enabled: false, keyword: "" },
    qwenai: { enabled: false, keyword: "" },
    yuanbao: { enabled: false, keyword: "" },
  },

  globalSearch: {
    promptEnterBehavior: "smart",
    enableFuzzySearch: false,
    doubleShift: false,
  },

  usageMonitor: {
    enabled: false,
    dailyLimit: 100,
    autoResetEnabled: false,
  },

  features: {
    order: ["outline", "conversations", "prompts"],
    prompts: {
      enabled: true,
      doubleClickToSend: false,
      submitShortcut: "enter",
      promptQueue: false,
      quickQuoteEnabled: true,
    },
    conversations: {
      enabled: true,
      syncUnpin: false,
      syncDelete: true,
      folderRainbow: true,
    },
    outline: {
      enabled: true,
      maxLevel: 6,
      autoUpdate: true,
      updateInterval: 2,
      showUserQueries: true,
      followMode: "current",
      expandLevel: 6,
      inlineBookmarkMode: "always",
      panelBookmarkMode: "always", // 默认保持原有行为 (Always Dimmed)
      showWordCount: false,
    },
  },

  tab: {
    openInNewTab: false,
    autoRename: true,
    renameInterval: 3,
    showStatus: true,
    hideStatusWhenRead: false,
    titleFormat: "{status}{title}->{model}",
    // 油猴脚本环境默认开启（GM_notification 已通过 @grant 声明）
    showNotification: isUserscript,
    notificationSound: true,
    notificationSoundPreset: "softChime",
    notificationVolume: 0.5,
    notificationRepeatCount: 3,
    notificationRepeatInterval: 2,
    notifyWhenFocused: false,
    autoFocus: false,
    privacyMode: false,
    privacyTitle: "Google",
    customIcon: "default",
  },

  readingHistory: {
    persistence: true,
    autoRestore: true,
    cleanupDays: 3,
  },

  quickButtons: {
    collapsed: DEFAULT_COLLAPSED_BUTTONS.map((button) => ({ ...button })),
    opacity: DEFAULT_QUICK_BUTTONS_SETTINGS.opacity,
    floatingToolbar: {
      ...DEFAULT_QUICK_BUTTONS_SETTINGS.floatingToolbar,
    },
    hideWhenPanelOpen: DEFAULT_QUICK_BUTTONS_SETTINGS.hideWhenPanelOpen,
    proximityRadius: DEFAULT_QUICK_BUTTONS_SETTINGS.proximityRadius,
  },

  claude: {
    currentKeyId: "", // 空字符串表示使用浏览器默认cookie
  },

  webdav: {
    enabled: false,
    url: "",
    username: "",
    password: "",
    syncMode: "manual",
    syncInterval: 30,
    remoteDir: "ophel",
    dataSources: ["settings", "conversations", "prompts", "claudeSessionKeys"], // 默认包括所有数据
  },

  shortcuts: DEFAULT_SHORTCUTS_SETTINGS,

  aistudio: {
    collapseNavbar: false,
    collapseTools: false,
    collapseAdvanced: false,
    enableSearch: true,
    defaultModel: "", // 空表示不覆盖
    // 油猴脚本环境默认开启
    markdownFix: isUserscript,
    removeWatermark: isUserscript,
  },

  chatgpt: {
    // 默认关闭
    markdownFix: false,
  },
}
