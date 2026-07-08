import type { ShortcutsSettings } from "~constants/shortcuts"
import type { WebDAVProvider } from "~types/webdav"

// 站点 ID 类型
export type SiteId =
  | "gemini"
  | "gemini-enterprise"
  | "aistudio"
  | "doubao"
  | "ima"
  | "deepseek"
  | "yuanbao"
  | "zai"
  | "_default"

// 主题模式
export type ThemeMode = "light" | "dark" | "system"
export type ExportPackaging = "markdown" | "zip"

// 站点主题配置
export interface SiteThemeConfig {
  mode: ThemeMode
  lightStyleId: string // 浅色模式样式 ID（内置预设或自定义样式）
  darkStyleId: string // 深色模式样式 ID
}

// 自定义样式
export interface CustomStyle {
  id: string // 唯一 ID（crypto.randomUUID 生成）
  name: string // 用户自定义名称
  css: string // CSS 内容
  mode: "light" | "dark" // 适用的主题模式
}

// 页面宽度配置
export interface PageWidthConfig {
  enabled: boolean
  value: string
  unit: string
}

// 模型锁定配置
export interface ModelLockConfig {
  enabled: boolean
  keyword: string
}

// 禅模式配置
export interface ZenModeConfig {
  enabled: boolean
  showExitButton?: boolean
}

export interface PanelAvoidanceSettings {
  enabled: boolean
}

// 导出设置
export interface ExportSettings {
  customUserName?: string // 自定义用户名称
  customModelName?: string // 自定义 AI 名称
  exportFilenameTimestamp?: boolean // 导出文件名包含时间戳
  includeThoughts?: boolean // 导出包含思维链
  packaging?: ExportPackaging // 导出打包方式
}

// AI Studio 设置
export interface AIStudioSettings {
  // 界面状态
  collapseNavbar?: boolean // 默认折叠侧边栏
  collapseRunSettings?: boolean // 默认收起运行设置面板（整个右侧面板）
  collapseTools?: boolean // 默认收起工具栏（运行设置中的工具栏区域）
  collapseAdvanced?: boolean // 默认收起高级设置

  // 功能开关
  enableSearch?: boolean // 默认启用 Google 搜索工具
  markdownFix?: boolean // 修复响应中未渲染的加粗文本

  // 默认模型
  defaultModel?: string // 模型 ID，如 "models/gemini-3-flash-preview"

  // 缓存的模型列表（从 DOM 动态抓取）
  cachedModels?: Array<{ id: string; name: string }>

  // 去水印开关
  removeWatermark?: boolean
}

// ChatGPT 设置
export interface ChatGPTSettings {
  markdownFix?: boolean // 修复响应中未渲染的加粗文本
}

export interface UsageMonitorSettings {
  enabled: boolean
  dailyLimit: number
  autoResetEnabled: boolean
}

export interface QuickButtonConfig {
  id: string
  enabled: boolean
}

export interface QuickButtonsPosition {
  xRatio: number
  yRatio: number
}

export interface QuickButtonsSettings {
  collapsed: QuickButtonConfig[]
  opacity: number
  toolsMenu?: string[]
  floatingToolbar: {
    open: boolean
  }
  position?: QuickButtonsPosition
  /** 面板展开时隐藏整个快捷按钮组（默认 false） */
  hideWhenPanelOpen?: boolean
  /** 感应唤醒距离（像素），鼠标在此范围内自动展开水滴，默认 150；0 = 仅直接悬停才展开 */
  proximityRadius?: number
}

export type FormulaCopyFormat = "latex" | "mathml"

export interface Settings {
  language: string
  hasAgreedToTerms: boolean // 用户是否同意免责声明
  hasSeenOphelAdvancedGuide?: boolean

  // 面板行为
  panel: {
    panelExpanded: boolean // 面板是否展开（未收进快捷按钮组）
    panelMode: "edge-snap" | "floating" // 面板模式
    edgeTriggerMode: "handle" | "hidden" // 自动吸附收起时的边缘触发方式
    preventAutoScroll: boolean
    defaultPosition: "left" | "right" // 展开时的默认侧边/吸附兜底侧边
    defaultEdgeDistance: number // 悬浮模式展开时距离屏幕边缘的默认边距
    edgeSnapThreshold: number // 吸附触发距离 (0-400, 默认 30)
    height: number // 面板高度 (50-100, 默认 85, 单位 vh)
    width: number // 面板宽度 (200-600, 默认 320, 单位 px)
    resizeOnHover: boolean // 鼠标悬停时临时加宽面板
    hoverWidth: number // 悬停时的临时面板宽度 (240-600, 默认 520, 单位 px)
  }

  // Gemini Enterprise 专属设置
  geminiEnterprise?: {
    policyRetry: {
      enabled: boolean
      maxRetries: number
    }
  }

  // 内容处理（含复制、导出）
  content: {
    assistantMermaid: boolean // AI 回复 Mermaid 渲染增强
    markdownFix: boolean
    watermarkRemoval: boolean
    formulaCopy: boolean
    formulaCopyFormat: FormulaCopyFormat
    formulaDelimiter: boolean
    tableCopy: boolean
    userQueryMarkdown: boolean // 用户提问 Markdown 渲染
  }

  // 导出设置
  export?: ExportSettings

  // 主题（按站点独立 + 共享自定义样式）
  theme: {
    syncNativePageTheme: boolean
    sites: Partial<Record<SiteId, SiteThemeConfig>>
    customStyles: CustomStyle[] // 自定义样式列表
  }

  // 布局设置（页面宽度、用户问题宽度等）
  layout: {
    pageWidth: Record<string, PageWidthConfig>
    userQueryWidth: Record<string, PageWidthConfig>
    zenMode?: Record<string, ZenModeConfig>
    cleanMode?: Record<string, ZenModeConfig>
    panelAvoidance?: Record<string, PanelAvoidanceSettings>
  }

  // 模型锁定（按站点独立）
  modelLock: Record<string, ModelLockConfig>

  // 全局搜索配置
  globalSearch: {
    promptEnterBehavior: "smart" | "locate"
    enableFuzzySearch: boolean
    doubleShift: boolean
  }

  // 高级模型本地计数与额度预估
  usageMonitor: UsageMonitorSettings

  // 功能模块配置
  features: {
    order: string[]
    prompts: {
      enabled: boolean
      doubleClickToSend: boolean
      submitShortcut: "enter" | "ctrlEnter"
      promptQueue: boolean
      quickQuoteEnabled: boolean
    }
    conversations: {
      enabled: boolean
      syncUnpin: boolean
      syncDelete: boolean
      folderRainbow: boolean
    }
    outline: {
      enabled: boolean
      maxLevel: number
      autoUpdate: boolean
      updateInterval: number
      showUserQueries: boolean
      followMode: "current" | "latest" | "manual"
      expandLevel: number
      inlineBookmarkMode: "always" | "hover" | "hidden" // 页内收藏图标显示模式
      panelBookmarkMode: "always" | "hover" | "hidden" // 面板收藏图标显示模式
      showWordCount: boolean
    }
  }

  // 浏览器标签页行为
  tab: {
    openInNewTab: boolean
    autoRename: boolean
    renameInterval: number
    showStatus: boolean
    hideStatusWhenRead: boolean
    titleFormat: string
    showNotification: boolean
    notificationSound: boolean
    notificationSoundPreset: string
    notificationVolume: number
    notificationRepeatCount: number
    notificationRepeatInterval: number
    notifyWhenFocused: boolean
    autoFocus: boolean
    privacyMode: boolean
    privacyTitle: string
    customIcon: string
  }

  // 阅读历史配置
  readingHistory: {
    persistence: boolean
    autoRestore: boolean
    cleanupDays: number
  }

  // 快捷按钮与工具箱配置
  quickButtons: QuickButtonsSettings

  // Claude 专属设置
  claude?: {
    currentKeyId: string // 当前选中的SessionKey ID,空字符串表示使用默认cookie
  }

  //  WebDAV 同步
  webdav?: {
    enabled: boolean
    url: string
    username: string
    password: string
    syncMode: "manual" | "auto"
    syncInterval: number
    remoteDir: string
    provider?: WebDAVProvider // 服务商标识（可选，兼容旧数据）
    dataSources?: Array<"settings" | "conversations" | "prompts" | "claudeSessionKeys"> // 可备份的数据源
    lastSyncTime?: number // 上次同步时间戳
    lastSyncStatus?: "success" | "failed" | "syncing"
  }

  // 快捷键设置
  shortcuts: ShortcutsSettings

  // AI Studio 专属设置
  aistudio?: AIStudioSettings

  // ChatGPT 专属设置
  chatgpt?: ChatGPTSettings
}
