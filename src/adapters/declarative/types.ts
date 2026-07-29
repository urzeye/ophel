import type {
  ExportConfig,
  ModelSwitcherConfig,
  NetworkMonitorConfig,
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

export interface SiteDetectRule {
  /** 页面存在该选择器即判定命中。 */
  selectorExists?: string
  /** `<meta name="generator">` 的 content 包含该子串即判定命中。 */
  metaGenerator?: string
}

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
  mermaidSupport?: "native" | "fallback"
  quickQuote?: "enabled" | "native" | "disabled"
  /** 缺省 false；由声明式适配器显式选择是否联动宿主页主题。 */
  supportsHostThemeSync?: boolean
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
  /** 允许为空；为空时必须提供 detect，并仅经用户显式域名绑定激活。 */
  matches: string[]
  detect?: SiteDetectRule[]
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
