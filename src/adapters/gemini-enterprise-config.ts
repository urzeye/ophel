import { SITE_IDS } from "~constants/defaults"

import type {
  ExportConfig,
  ModelSwitcherConfig,
  NetworkMonitorConfig,
  WidthSelectorConfig,
  ZenModeConfig,
} from "./base"
import type {
  BuiltinSiteConfig,
  SitePackConversationConfig,
  SitePackGeneratingConfig,
  SitePackInputConfig,
  SitePackSelectors,
  SitePrivateSelectors,
} from "./declarative"
import { BUILTIN_FEATURE_CAPABILITIES } from "./feature-capabilities"

interface GeminiEnterpriseSiteSelectors extends SitePackSelectors {
  textarea: string[]
  submitButton: string[]
  responseContainer: string
  chatContent: string[]
  userQuery: string
  assistantResponse: string
  newChatButton: string[]
  stopButton: string[]
  scrollContainer: string[]
  sidebarScrollContainer: string
}

type GeminiEnterprisePrivateSelectors = SitePrivateSelectors & {
  srOnly: string
  sidebarScrollFallback: string
  conversationButton: string[]
  conversationMenuButton: string
  conversationMenuButtonFallback: string
  conversationActive: string
  conversationAriaActive: string
  conversationActionButton: string
  conversationMenuIcon: string
  conversationMenuAction: string
  conversationMenuContainer: string
  panelScope: string
  inputArea: string
  userQueryWidth: string[]
  textareaHostExclusion: string
  conversationRoot: string
  conversationMain: string
  markdownHost: string
  markdownDocument: string
  headingMarker: string
  modelName: string[]
  shadowInjectionExclusion: string[]
  showMoreButton: string
  showMoreIcon: string
  showMoreExpandedIcon: string
  themeMenu: string
  settingsButton: string
  themeTab: string
  themeIcon: string
}

export interface GeminiEnterpriseSiteConfig extends BuiltinSiteConfig {
  selectors: GeminiEnterpriseSiteSelectors
  input: SitePackInputConfig
  conversation: SitePackConversationConfig
  generating: SitePackGeneratingConfig
  networkMonitor: NetworkMonitorConfig
  modelSwitcher: Omit<ModelSwitcherConfig, "targetModelKeyword">
  export: ExportConfig
  widthSelectors: Omit<WidthSelectorConfig, "transformValue">[]
  zenMode: ZenModeConfig
  cleanMode: ZenModeConfig
  mermaidSupport: NonNullable<BuiltinSiteConfig["mermaidSupport"]>
  quickQuote: NonNullable<BuiltinSiteConfig["quickQuote"]>
  supportsHostThemeSync: boolean
  sitePrivateSelectors: GeminiEnterprisePrivateSelectors
}

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const GEMINI_ENTERPRISE_CONFIG_VERSION = 1

const createGeminiEnterpriseConfig = (): GeminiEnterpriseSiteConfig => {
  const conversationItem = ".conversation"
  const conversationTitle = ".conversation-title"
  const userQuery = ".question-block"
  const assistantResponse = "ucs-summary"
  const conversationTurn = ".turn"
  const panelScope = "mat-sidenav-content, .main.chat-mode"
  const inputArea = ".input-area-container"
  const stopButton = [
    'button[aria-label*="Stop"]',
    'button[aria-label*="停止"]',
    '[data-test-id="stop-button"]',
    ".stop-button",
    'md-icon-button[aria-label*="Stop"]',
  ]
  const spinner = [
    "mat-spinner",
    "md-spinner",
    ".loading-spinner",
    '[role="progressbar"]',
    ".generating-indicator",
    ".response-loading",
  ]
  const modelTrigger = ["#model-selector-menu-anchor", ".action-model-selector"]
  const createWidthSelector = (
    selector: string,
    value?: string,
    extraCss?: string,
    noCenter = false,
  ): Omit<WidthSelectorConfig, "transformValue"> => ({
    selector,
    globalSelector: `mat-sidenav-content ${selector}`,
    property: "max-width",
    ...(value ? { value } : {}),
    ...(extraCss ? { extraCss } : {}),
    noCenter,
  })

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.GEMINI_ENTERPRISE]],
    selectors: {
      textarea: [
        "div.ProseMirror",
        ".ProseMirror",
        '[contenteditable="true"]:not([type="search"])',
        '[role="textbox"]',
        'textarea:not([type="search"])',
      ],
      submitButton: [
        'button[aria-label*="Submit"]',
        'button[aria-label*="提交"]',
        'button[aria-label*="发送"]',
        'button[aria-label*="Send"]',
        ".send-button",
        '[data-testid*="send"]',
      ],
      responseContainer: ".conversation-container",
      chatContent: [
        ".model-response-container",
        ".message-content",
        "[data-message-id]",
        "ucs-conversation-message",
        ".conversation-message",
      ],
      userQuery,
      assistantResponse,
      newChatButton: [
        ".chat-button.list-item",
        'button[aria-label="New chat"]',
        'button[aria-label="新对话"]',
      ],
      stopButton: [...stopButton],
      scrollContainer: [".chat-mode-scroller"],
      sidebarScrollContainer: ".conversation-list",
    },
    input: { mode: "contenteditable", submitKey: "Enter" },
    conversation: {
      itemSelector: conversationItem,
      idFrom: { attr: "id", regex: "^menu-(\\d+)$" },
      titleSelector: conversationTitle,
      urlTemplate: "/session/{id}",
      navigationStrategy: "click-item",
      shadow: true,
    },
    generating: {
      existsSelectors: [stopButton.join(", "), spinner.join(", ")],
    },
    networkMonitor: {
      urlPatterns: ["widgetStreamAssist"],
      silenceThreshold: 3000,
    },
    modelSwitcher: {
      selectorButtonSelectors: [...modelTrigger],
      menuItemSelector: "md-menu-item",
      checkInterval: 1500,
      maxAttempts: 20,
      menuRenderDelay: 500,
    },
    export: {
      userQuerySelector: userQuery,
      assistantResponseSelector: assistantResponse,
      turnSelector: conversationTurn,
      useShadowDOM: true,
    },
    widthSelectors: [
      createWidthSelector("mat-sidenav-content", "100%", undefined, true),
      createWidthSelector(".main.chat-mode", "100%", undefined, true),
      createWidthSelector(assistantResponse),
      createWidthSelector("ucs-conversation"),
      createWidthSelector("ucs-search-bar"),
      createWidthSelector(".summary-container.expanded"),
      createWidthSelector(".conversation-container"),
      createWidthSelector(inputArea, undefined, "left: 0 !important; right: 0 !important;", true),
    ],
    zenMode: { hide: ["ucs-nav-panel"] },
    cleanMode: { hide: [".disclaimer"] },
    mermaidSupport: "fallback",
    quickQuote: "enabled",
    supportsHostThemeSync: true,
    sitePrivateSelectors: {
      srOnly: ".sr-only",
      sidebarScrollFallback: "mat-sidenav",
      conversationButton: ["button.list-item", "button"],
      conversationMenuButton: ".conversation-action-menu-button",
      conversationMenuButtonFallback: 'button[id^="menu-"]',
      conversationActive: ".selected, .active",
      conversationAriaActive: '[aria-selected="true"]',
      conversationActionButton: [
        ".conversation-action-menu-button",
        'button[id^="menu-"]',
        'button[aria-haspopup="menu"]',
        'button[aria-label*="More"]',
        'button[aria-label*="more"]',
        'button[aria-label*="更多"]',
        'button[title*="More"]',
        'button[title*="more"]',
        "button",
      ].join(", "),
      conversationMenuIcon:
        'mat-icon[fonticon="more_vert"], mat-icon[fonticon="more_horiz"], md-icon',
      conversationMenuAction:
        'md-menu-item, [role="menuitem"], [role="menu"] button, .mat-mdc-menu-panel button',
      conversationMenuContainer:
        'md-menu-surface, .menu[popover], .mat-mdc-menu-panel, [role="menu"]',
      panelScope,
      inputArea,
      userQueryWidth: [".question-block .question-wrapper"],
      textareaHostExclusion: ".main-input",
      conversationRoot: "ucs-conversation",
      conversationMain: ".main",
      markdownHost: "ucs-fast-markdown",
      markdownDocument: ".markdown-document",
      headingMarker: "span[data-markdown-start-index]",
      modelName: [
        ...modelTrigger,
        ".model-selector",
        '[data-test-id="model-selector"]',
        ".current-model",
      ],
      shadowInjectionExclusion: ["mat-sidenav", "mat-drawer", '[class*="bg-sidebar"]'],
      showMoreButton: "button.show-more",
      showMoreIcon: ".show-more-icon",
      showMoreExpandedIcon: ".more-visible",
      themeMenu: '.menu[popover], md-menu-surface, .mat-menu-panel, [role="menu"]',
      settingsButton: ".settings-button",
      themeTab: "md-primary-tab",
      themeIcon: "md-icon",
    },
  }
}

export const GEMINI_ENTERPRISE_CONFIG = createGeminiEnterpriseConfig()
