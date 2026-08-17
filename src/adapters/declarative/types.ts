import type {
  ExportConfig,
  ModelSwitcherConfig,
  NetworkMonitorConfig,
  PanelAvoidanceConfig,
  WidthSelectorConfig,
  ZenModeConfig,
} from "../base"
import type { SitePackCapability as AdapterFeatureCapability } from "../feature-capabilities"

export const SITE_PACK_SCHEMA_VERSION = 1 as const
export const SITE_CONFIG_PATCH_SCHEMA_VERSION = 1 as const

const SITE_PACK_ID_PATTERN = /^[a-z0-9-]{2,40}$/

export const isValidSitePackId = (value: unknown): value is string =>
  typeof value === "string" && SITE_PACK_ID_PATTERN.test(value)

export type SitePackCapability = AdapterFeatureCapability

export interface SitePackSelectors {
  /** 声明 prompt-insert 能力时必填；纯只读包可省略。 */
  textarea?: string[]
  submitButton?: string[]
  responseContainer?: string
  chatContent?: string[]
  userQuery?: string
  assistantResponse?: string
  newChatButton?: string[]
  stopButton?: string[]
  scrollContainer?: string[]
  sidebarScrollContainer?: string
  /** 大纲提取时需要排除的容器选择器；命中任一选择器的元素及其后代都不参与大纲。 */
  outlineExclude?: string[]
}

export interface SitePackInputConfig {
  mode: "textarea" | "contenteditable"
  submitKey?: "Enter" | "Ctrl+Enter"
}

/** 会话列表字段映射，用受限原语替代站点自定义提取函数。 */
export interface SitePackConversationConfig {
  itemSelector: string
  /** attr 缺省为 href；regex 的第一个捕获组作为会话 id。 */
  idFrom: {
    attr?: string
    regex: string
  }
  /** 缺省读取列表项 textContent。 */
  titleSelector?: string
  /** 以单个 `/` 开头的同源路径模板，支持 `{id}` 占位。 */
  urlTemplate: string
  activeMatch?: string
  navigationStrategy?: "click-item" | "location"
  shadow?: boolean
}

export interface SitePackGeneratingConfig {
  /** 任一选择器存在且可见时视为正在生成。 */
  existsSelectors: string[]
}

export interface SitePackSessionConfig {
  /** 对 pathname 匹配，第一个捕获组作为会话 id。 */
  idFromPathRegex?: string
  newConversationPathPatterns?: string[]
  sharePathPrefix?: string
  /** 以单个 `/` 开头的同源相对路径。 */
  newTabPath?: string
}

/** 面板安全区避让的声明式配置：与运行时结构一致，仅去掉函数字段 transformValue。 */
export type SitePackPanelAvoidanceConfig = Omit<PanelAvoidanceConfig, "widthSelectors"> & {
  widthSelectors: Omit<WidthSelectorConfig, "transformValue">[]
}

/** SitePack 与内置配置共同使用的声明式配置面。 */
export interface SitePackConfig {
  theme?: {
    primary: string
    secondary: string
  }
  /** 未声明的能力在 UI 中不可用。 */
  capabilities: SitePackCapability[]
  selectors: SitePackSelectors
  input?: SitePackInputConfig
  conversation?: SitePackConversationConfig
  generating?: SitePackGeneratingConfig
  session?: SitePackSessionConfig
  networkMonitor?: NetworkMonitorConfig
  modelSwitcher?: Omit<ModelSwitcherConfig, "targetModelKeyword">
  export?: ExportConfig
  zenMode?: ZenModeConfig
  cleanMode?: ZenModeConfig
  widthSelectors?: Omit<WidthSelectorConfig, "transformValue">[]
  /** 声明 panel-avoidance 能力时必填；驱动 Ophel 面板安全区避让布局。 */
  panelAvoidance?: SitePackPanelAvoidanceConfig
  mermaidSupport?: "native" | "fallback"
  quickQuote?: "enabled" | "native" | "disabled"
  /** 缺省 false；由声明式适配器显式选择是否联动宿主页主题。 */
  supportsHostThemeSync?: boolean
  /** 声明后启用 localStorage + html class 机制的宿主页主题联动。 */
  themeSync?: SitePackThemeSyncConfig
  /**
   * 缺省 false。站点在用户真实滚动前持续把对话拉回底部（吸底）时声明：
   * 大纲跳转后补发零增量 wheel 并重试跳转，解除站点吸底。
   */
  scrollPinRelease?: boolean
  outlineReverse?: boolean
}

/**
 * 宿主页主题联动的声明式配置，仅覆盖 “写 localStorage + 换 html class” 机制。
 * 其余机制（body class、data-theme 属性、特殊枚举值、模拟点击等）不支持。
 */
export interface SitePackThemeSyncConfig {
  /** localStorage 键名（如 next-themes 系的 "theme"）。 */
  storageKey: string
  /**
   * 主题值在存储 JSON 对象内的点分隔路径（如 "theme"、"appearance.mode"）。
   * 缺省表示整个键值即主题值（扁平存储）。
   */
  valuePath?: string
  /** 扁平存储时写入值的包装格式：raw 裸字符串；json 经 JSON.stringify 包装。缺省 raw。 */
  valueFormat?: "raw" | "json"
  /** 各模式写入的值。system 缺省时按系统偏好解析为 dark/light 对应值写入。 */
  values: {
    dark: string
    light: string
    system?: string
  }
  /**
   * html 元素上的暗色类名。
   * 与 lightClass 都缺省时不动 DOM 类：仅写存储并派发 storage 事件，
   * 适用于自行监听事件并应用主题的站点（如 LobeChat）。
   */
  darkClass?: string
  /** html 元素上的亮色类名；缺省时亮色仅移除 darkClass。 */
  lightClass?: string
}

/** 顶层站点适配包清单。 */
export interface SitePackManifest extends SitePackConfig {
  schemaVersion: typeof SITE_PACK_SCHEMA_VERSION
  /** 全局唯一；运行时使用 `pack:` 前缀与内置 siteId 隔离。 */
  id: string
  /** 包版本，正整数单调递增。 */
  version: number
  minAppVersion: string
  name: string
  nameI18n?: Record<string, string>
  description?: string
  descriptionI18n?: Record<string, string>
  /** 允许为空；为空时仅经用户显式域名绑定激活。 */
  matches: string[]
}

export type SitePrivateSelectorValue = string | string[]
export type SitePrivateSelectors = Record<string, SitePrivateSelectorValue>

/** L1 内置站点配置；私有选择器只能通过该站点登记的键覆盖。 */
export interface BuiltinSiteConfig extends SitePackConfig {
  sitePrivateSelectors?: SitePrivateSelectors
}

type DeepNullablePatchValue<T> = T extends readonly unknown[]
  ? T | null
  : T extends object
    ? { [K in keyof T]?: DeepNullablePatchValue<T[K]> } | null
    : T | null

/** JSON patch 层：对象递归覆盖，数组整体替换，null 删除键。 */
export type SiteConfigOverride = {
  [K in keyof BuiltinSiteConfig]?: DeepNullablePatchValue<BuiltinSiteConfig[K]>
}

export interface SiteConfigPatch {
  targetSiteId: string
  patchSchemaVersion: typeof SITE_CONFIG_PATCH_SCHEMA_VERSION
  patchVersion: number
  baseConfigVersion: number
  minAppVersion: string
  maxAppVersion?: string
  config: SiteConfigOverride
}
