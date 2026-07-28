import {
  SiteAdapter,
  type AssistantMermaidSupportMode,
  type ExportConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type QuickQuoteSupportMode,
  type WidthSelectorConfig,
  type ZenModeConfig,
} from "../base"

import type { SitePackManifest } from "./types"

const DEFAULT_THEME_COLORS = {
  primary: "#2563eb",
  secondary: "#1d4ed8",
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const createWildcardRegExp = (value: string): RegExp =>
  new RegExp(`^${value.split("*").map(escapeRegExp).join(".*")}$`)

const hasExplicitPort = (authority: string): boolean =>
  authority.startsWith("[") ? /\]:\d+$/.test(authority) : /:\d+$/.test(authority)

const matchesAuthority = (url: URL, authority: string): boolean => {
  const normalizedAuthority = authority.toLowerCase()
  const wildcard = normalizedAuthority.startsWith("*.")
  const concreteAuthority = wildcard ? normalizedAuthority.slice(2) : normalizedAuthority
  const baseUrl = new URL(`https://${concreteAuthority}/`)
  const hostname = url.hostname.toLowerCase()
  const baseHostname = baseUrl.hostname.toLowerCase()
  const hostnameMatches = wildcard
    ? hostname === baseHostname || hostname.endsWith(`.${baseHostname}`)
    : hostname === baseHostname
  const portMatches = !hasExplicitPort(concreteAuthority) || url.port === baseUrl.port

  return hostnameMatches && portMatches
}

const matchesSitePackPattern = (url: URL, pattern: string): boolean => {
  if (url.protocol !== "https:") return false

  const match = /^https:\/\/([^/]+)(\/.*)$/.exec(pattern)
  if (!match) return false

  const [, authority, pathPattern] = match
  if (!matchesAuthority(url, authority)) return false

  return createWildcardRegExp(pathPattern).test(`${url.pathname}${url.search}`)
}

const cloneZenModeConfig = (config: ZenModeConfig): ZenModeConfig => {
  const { hide, rootClass, styles } = config
  return {
    ...(hide ? { hide: [...hide] } : {}),
    ...(rootClass ? { rootClass: { ...rootClass } } : {}),
    ...(styles ? { styles: styles.map((style) => ({ ...style })) } : {}),
  }
}

const cloneNetworkMonitorConfig = (config: NetworkMonitorConfig): NetworkMonitorConfig => ({
  urlPatterns: [...config.urlPatterns],
  silenceThreshold: config.silenceThreshold,
  ...(config.urlPathEndsWith ? { urlPathEndsWith: [...config.urlPathEndsWith] } : {}),
  ...(config.requestBodyRules
    ? {
        requestBodyRules: config.requestBodyRules.map((rule) => ({
          ...rule,
          metadata: { ...rule.metadata },
        })),
      }
    : {}),
})

const normalizeElementText = (element: Element | null): string | null => {
  const text = element?.textContent?.replace(/\s+/g, " ").trim()
  return text || null
}

/** 把已通过校验的 SitePack manifest 显式映射到现有 SiteAdapter API。 */
export class DeclarativeAdapter extends SiteAdapter {
  constructor(private readonly manifest: SitePackManifest) {
    super()
  }

  match(): boolean {
    const url = new URL(window.location.href)
    return this.manifest.matches.some((pattern) => matchesSitePackPattern(url, pattern))
  }

  getSiteId(): string {
    return `pack:${this.manifest.id}`
  }

  getName(): string {
    return this.manifest.name
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { ...(this.manifest.theme ?? DEFAULT_THEME_COLORS) }
  }

  getTextareaSelectors(): string[] {
    return [...(this.manifest.selectors.textarea ?? [])]
  }

  insertPrompt(_content: string): boolean {
    return false
  }

  getConversationTitle(): string | null {
    const { conversation } = this.manifest
    if (conversation?.activeMatch) {
      const activeItem = document.querySelector(conversation.activeMatch)
      if (activeItem) {
        const titleElement = conversation.titleSelector
          ? activeItem.matches(conversation.titleSelector)
            ? activeItem
            : activeItem.querySelector(conversation.titleSelector)
          : activeItem
        const title = normalizeElementText(titleElement)
        if (title) return title
      }
    }

    return this.getDocumentConversationTitle()
  }

  getSubmitButtonSelectors(): string[] {
    return [...(this.manifest.selectors.submitButton ?? [])]
  }

  getNewChatButtonSelectors(): string[] {
    return [...(this.manifest.selectors.newChatButton ?? [])]
  }

  getStopButtonSelectors(): string[] {
    return [...(this.manifest.selectors.stopButton ?? [])]
  }

  getResponseContainerSelector(): string {
    return this.manifest.selectors.responseContainer ?? ""
  }

  getChatContentSelectors(): string[] {
    return [...(this.manifest.selectors.chatContent ?? [])]
  }

  getUserQuerySelector(): string | null {
    return this.manifest.selectors.userQuery ?? null
  }

  getScrollContainer(): HTMLElement | null {
    return this.findElementBySelectors(this.manifest.selectors.scrollContainer ?? [])
  }

  getSidebarScrollContainer(): Element | null {
    const selector = this.manifest.selectors.sidebarScrollContainer
    return selector ? this.findElementBySelectors([selector]) : null
  }

  getExportConfig(): ExportConfig | null {
    return this.manifest.export ? { ...this.manifest.export } : null
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig | null {
    return this.manifest.networkMonitor
      ? cloneNetworkMonitorConfig(this.manifest.networkMonitor)
      : null
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    const config = this.manifest.modelSwitcher
    if (!config) return null

    return {
      ...config,
      targetModelKeyword: keyword,
      selectorButtonSelectors: [...config.selectorButtonSelectors],
      subMenuTriggers: config.subMenuTriggers ? [...config.subMenuTriggers] : undefined,
    }
  }

  getWidthSelectors(): WidthSelectorConfig[] {
    return (this.manifest.widthSelectors ?? []).map((selector) => ({ ...selector }))
  }

  getZenModeConfig(): ZenModeConfig | null {
    return this.manifest.zenMode ? cloneZenModeConfig(this.manifest.zenMode) : null
  }

  getCleanModeConfig(): ZenModeConfig | null {
    return this.manifest.cleanMode ? cloneZenModeConfig(this.manifest.cleanMode) : null
  }

  getSubmitKeyConfig(): { key: "Enter" | "Ctrl+Enter" } {
    return { key: this.manifest.input?.submitKey ?? "Enter" }
  }

  getQuickQuoteSupportMode(): QuickQuoteSupportMode {
    return this.manifest.quickQuote ?? "disabled"
  }

  getAssistantMermaidSupportMode(): AssistantMermaidSupportMode {
    return this.manifest.mermaidSupport ?? "native"
  }

  supportsHostThemeSync(): boolean {
    return this.manifest.supportsHostThemeSync ?? false
  }
}
