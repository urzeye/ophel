import { SITE_IDS } from "~constants/defaults"

import type { ExportConfig, NetworkMonitorConfig, WidthSelectorConfig, ZenModeConfig } from "./base"
import type {
  BuiltinSiteConfig,
  SitePackConversationConfig,
  SitePackGeneratingConfig,
  SitePackInputConfig,
  SitePackSelectors,
  SitePrivateSelectors,
} from "./declarative"
import { BUILTIN_FEATURE_CAPABILITIES } from "./feature-capabilities"

interface DeepSeekSiteSelectors extends SitePackSelectors {
  textarea: string[]
  submitButton: string[]
  responseContainer: string
  chatContent: string[]
  userQuery: string
  assistantResponse: string
  newChatButton: string[]
  stopButton: string[]
}

type DeepSeekPrivateSelectors = SitePrivateSelectors & {
  sidebarScrollArea: string
  message: string
  assistantMarkdown: string
  thoughtContainer: string
  iconButton: string
  focusRing: string
  composerButton: string
  selectedModel: string
  newChatLayoutScope: string
  canvasLayoutScope: string
  canvasPreviewSafeArea: string
  panelAvoidanceScope: string
  messageListItems: string
  messageComposer: string
  userMessageContent: string
  nativeOutlineList: string
  nativeOutlineItems: string
  nativeOutlineVisibleItems: string
  nativeOutlineContentRoots: string
  nativeOutlinePaddingScope: string
  nativeOutlineExcludedAncestor: string
  mainRegion: string
  shareTitleMeta: string
}

export interface DeepSeekSiteConfig extends BuiltinSiteConfig {
  selectors: DeepSeekSiteSelectors
  input: SitePackInputConfig
  conversation: SitePackConversationConfig
  generating: SitePackGeneratingConfig
  networkMonitor: NetworkMonitorConfig
  export: ExportConfig
  widthSelectors: Omit<WidthSelectorConfig, "transformValue">[]
  zenMode: ZenModeConfig
  cleanMode: ZenModeConfig
  quickQuote: NonNullable<BuiltinSiteConfig["quickQuote"]>
  sitePrivateSelectors: DeepSeekPrivateSelectors
}

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const DEEPSEEK_CONFIG_VERSION = 1

const createDeepSeekConfig = (): DeepSeekSiteConfig => {
  const conversationLink = 'a[href*="/a/chat/s/"]'
  const sidebarScrollArea = ".ds-scroll-area"
  const message = ".ds-message"
  const assistantMarkdown = ".ds-markdown"
  const assistantResponse = `${message}:has(${assistantMarkdown})`
  const userQuery = `${message}:not(:has(${assistantMarkdown}))`
  const thoughtContainer = ".ds-think-content"
  const responseContainer = [
    `main ${sidebarScrollArea}:has(${message})`,
    `[role="main"] ${sidebarScrollArea}:has(${message})`,
    `${sidebarScrollArea}:has(${message})`,
  ].join(", ")
  const iconButton = ".ds-icon-button"
  const focusRing = ".ds-focus-ring"
  const sendIconPath =
    'svg path[d="M8.3125 0.981587C8.66767 1.0545 8.97902 1.20558 9.2627 1.43374C9.48724 1.61438 9.73029 1.85933 9.97949 2.10854L14.707 6.83608L13.293 8.25014L9 3.95717V15.0431H7V3.95717L2.70703 8.25014L1.29297 6.83608L6.02051 2.10854C6.26971 1.85933 6.51277 1.61438 6.7373 1.43374C6.97662 1.24126 7.28445 1.04542 7.6875 0.981587C7.8973 0.94841 8.1031 0.956564 8.3125 0.981587Z"]'
  const stopIconPath = 'svg path[d^="M2 4.88"]'
  const submitButton = [
    `div[role="button"]${iconButton}:has(${sendIconPath})`,
    `button${iconButton}:has(${sendIconPath})`,
  ]
  const stopButton = [
    `div[role="button"]${iconButton}:has(${stopIconPath})`,
    `button${iconButton}:has(${stopIconPath})`,
  ]
  const messageLayoutWidthScope = ":root"
  const messageLayoutScope = `:is(.ds-virtual-list:has(${message}), .ds-virtual-list:has(textarea${sidebarScrollArea}))`
  const newChatLayoutScope = `#root > div:has(textarea${sidebarScrollArea}):not(:has(${message}))`
  const canvasLayoutScope = '#root > div:has(.ds-virtual-list):has(div[aria-hidden="false"] iframe)'
  const canvasPreviewSafeArea = `div[aria-hidden="false"]:has(iframe) ${sidebarScrollArea}`
  const panelAvoidanceScope = [messageLayoutScope, newChatLayoutScope].join(", ")
  const messageListItems = `${messageLayoutScope} .ds-virtual-list-items`
  const messageComposer = `${messageLayoutScope} > div:has(textarea${sidebarScrollArea})`
  const userMessageContent = [
    `${userQuery} > .gh-inline-bookmark + div`,
    `${userQuery} > div:not(.gh-user-query-raw):not(.gh-user-query-markdown):not(${focusRing})`,
    `${userQuery} > div.gh-user-query-markdown`,
  ].join(", ")
  const nativeOutlineItems = ".ds-virtual-list-items"
  const nativeOutlineVisibleItems = ".ds-virtual-list-visible-items"

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.DEEPSEEK]],
    selectors: {
      textarea: [
        'textarea[placeholder*="DeepSeek"]',
        'textarea[placeholder*="deepseek"]',
        `textarea${sidebarScrollArea}`,
        "form textarea",
      ],
      submitButton,
      responseContainer,
      chatContent: [assistantResponse, userQuery],
      userQuery,
      assistantResponse,
      newChatButton: ['a[href="/a/chat"]', 'a[href="/a/chat/"]'],
      stopButton,
    },
    input: { mode: "textarea", submitKey: "Enter" },
    conversation: {
      itemSelector: conversationLink,
      idFrom: { attr: "href", regex: "/a/chat/s/([a-z0-9-]+)" },
      urlTemplate: "/a/chat/s/{id}",
      activeMatch: '[aria-current="page"]',
      navigationStrategy: "click-item",
      shadow: false,
    },
    generating: { existsSelectors: [...stopButton] },
    networkMonitor: {
      urlPatterns: ["/api/v0/chat/completion"],
      silenceThreshold: 500,
    },
    export: {
      userQuerySelector: userQuery,
      assistantResponseSelector: assistantResponse,
      turnSelector: null,
      useShadowDOM: false,
    },
    widthSelectors: [
      {
        selector: messageLayoutWidthScope,
        property: "--message-list-max-width",
        noCenter: true,
      },
      {
        selector: messageListItems,
        property: "--message-list-max-width",
        noCenter: true,
      },
    ],
    zenMode: { hide: [".dc04ec1d", "._0fcaa63"] },
    cleanMode: { hide: ["._0fcaa63"] },
    quickQuote: "enabled",
    sitePrivateSelectors: {
      sidebarScrollArea,
      message,
      assistantMarkdown,
      thoughtContainer,
      iconButton,
      focusRing,
      composerButton: [
        `div[role="button"]${iconButton}`,
        `button${iconButton}`,
        `${iconButton}[aria-disabled="false"]`,
      ].join(", "),
      selectedModel: ".ds-toggle-button--selected",
      newChatLayoutScope,
      canvasLayoutScope,
      canvasPreviewSafeArea,
      panelAvoidanceScope,
      messageListItems,
      messageComposer,
      userMessageContent,
      nativeOutlineList: ".ds-virtual-list",
      nativeOutlineItems,
      nativeOutlineVisibleItems,
      nativeOutlineContentRoots: `${nativeOutlineItems}, ${nativeOutlineVisibleItems}`,
      nativeOutlinePaddingScope: '[style*="--scroll-nav-page-padding"]',
      nativeOutlineExcludedAncestor: "aside, nav",
      mainRegion: "main, [role='main']",
      shareTitleMeta: 'meta[property="og:title"], meta[name="twitter:title"]',
    },
  }
}

export const DEEPSEEK_CONFIG = createDeepSeekConfig()
