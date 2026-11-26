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
  SitePackGeneratingConfig,
  SitePackInputConfig,
  SitePackSelectors,
  SitePrivateSelectors,
} from "./declarative"
import { BUILTIN_FEATURE_CAPABILITIES } from "./feature-capabilities"

interface ChatGLMSiteSelectors extends SitePackSelectors {
  textarea: string[]
  submitButton: string[]
  responseContainer: string
  chatContent: string[]
  userQuery: string
  assistantResponse: string
  stopButton: string[]
  scrollContainer: string[]
}

type ChatGLMPrivateSelectors = SitePrivateSelectors & {
  nativeQuotePopover: string[]
  themeOptionCandidates: string[]
  themeRootCandidates: string[]
  conversationScope: string
  conversationInner: string
  newChatGuideSafeArea: string
  canvasLayoutScope: string
  canvasPreviewSafeArea: string
  conversationItem: string
  userText: string
  assistantMarkdown: string
  thinkingContainer: string
  exportDecoration: string
  conversationTitle: string
  collapseButton: string
  markdownBody: string
  userAttachmentCandidates: string
  attachmentNameRoot: string
  thoughtContent: string
  avatar: string
  modelName: string[]
  messagesWrapper: string
  chatFooter: string
  submitButton: string
  submitButtonDisabled: string
}

export interface ChatGLMSiteConfig extends BuiltinSiteConfig {
  selectors: ChatGLMSiteSelectors
  input: SitePackInputConfig
  generating: SitePackGeneratingConfig
  networkMonitor: NetworkMonitorConfig
  modelSwitcher: Omit<ModelSwitcherConfig, "targetModelKeyword">
  export: ExportConfig
  widthSelectors: Omit<WidthSelectorConfig, "transformValue">[]
  zenMode: ZenModeConfig
  cleanMode: ZenModeConfig
  quickQuote: NonNullable<BuiltinSiteConfig["quickQuote"]>
  sitePrivateSelectors: ChatGLMPrivateSelectors
}

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const CHATGLM_CONFIG_VERSION = 5

const createChatGLMConfig = (): ChatGLMSiteConfig => {
  const responseContainer = ".chat-list"
  const conversationScope = ".chat-wrapper"
  const conversationInner = ".chat-wrapper"
  const newChatGuideSafeArea = ".init-page .main-chat-guide-container"
  const canvasLayoutScope = "section.el-container:has(> .code-preview-tabs)"
  const canvasPreviewSafeArea = ".code-preview-tabs"
  const conversationItem = ".chat-list__message-row"
  const userQuery = ".user-message-item"
  const userText = ".user-message-item__text-content"
  const assistantResponse = ".assistant-message-item"
  const markdownBody = ".markdown-body"
  const assistantMarkdown = `${assistantResponse} ${markdownBody}`
  const messagesWrapper = ".messages-wrapper"
  const chatFooter = ".chat-footer"
  const thinkingContainer = [
    ".advance-thinking",
    ".advance-thinking-area",
    ".advanced-thinking",
    ".advanced-thinking-data",
    ".text-advance-thinking-content",
    ".thinking-chain-container",
    ".thinking-block",
    ".thinking-content",
    ".thinking-item",
    "[class*='thinking']",
    "[class*='think']",
    "[class*='reason']",
    "[class*='cot']",
  ].join(", ")
  const exportDecoration = [
    ".gh-root",
    ".gh-user-query-markdown",
    ".assistant-name",
    ".interact-container",
    ".code-no-artifacts .top-outer",
    ".code-no-artifacts .copy-button",
    "button",
    "[role='button']",
    "svg",
    "[aria-hidden='true']",
    "style",
    "script",
  ].join(", ")
  const textarea = [
    ".chat-sender textarea.el-textarea__inner",
    ".chat-footer textarea",
    "textarea.el-textarea__inner",
  ]
  const submitButton = ".send-button"
  const submitButtonDisabled = ".send-button--disabled"
  const stopButton = [
    "button.send-button[aria-label*='停止']",
    ".chat-sender [aria-label*='停止']",
    ".stop-generate",
    ".stop-stream-tip",
  ]
  const themePopover = ".theme-popper"
  const themeOption = ".selecttheme-list"

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.CHATGLM]],
    traits: { historyLazyLoad: false },
    selectors: {
      textarea,
      submitButton: [`${submitButton}:not(${submitButtonDisabled})`],
      responseContainer,
      chatContent: [assistantMarkdown, userText],
      userQuery,
      assistantResponse,
      stopButton,
      scrollContainer: [responseContainer],
    },
    input: { mode: "textarea", submitKey: "Enter" },
    generating: { existsSelectors: [...stopButton] },
    networkMonitor: {
      urlPatterns: ["/chatglm/backend-api/assistant/stream"],
      silenceThreshold: 2000,
    },
    modelSwitcher: {
      selectorButtonSelectors: [".think-mode-button"],
      menuItemSelector:
        ".chat-sender-think-popover button, .chat-sender-think-popover [role='menuitem'], .model-select-list .model-select-item",
      menuRenderDelay: 150,
      checkInterval: 1000,
      maxAttempts: 10,
    },
    export: {
      userQuerySelector: userQuery,
      assistantResponseSelector: assistantResponse,
      turnSelector: null,
      useShadowDOM: false,
    },
    widthSelectors: [
      { selector: messagesWrapper, property: "max-width" },
      { selector: chatFooter, property: "max-width" },
      {
        selector: ".markdown-body table",
        property: "width",
        value: "100%",
        extraCss:
          "table-layout: fixed !important; display: table !important; min-width: 100% !important;",
        noCenter: true,
      },
      {
        selector: ".markdown-body table th, .markdown-body table td",
        property: "min-width",
        value: "0",
        noCenter: true,
      },
    ],
    zenMode: { hide: [".app-shell-sidebar-inline"] },
    cleanMode: {
      hide: [".sidebar-login-reward", ".login-reward-card"],
      preserveFlow: [".ai-statement"],
    },
    quickQuote: "native",
    sitePrivateSelectors: {
      nativeQuotePopover: [
        '[class*="quote-button"]',
        '[class*="reference-button"]',
        '[aria-label*="引用"]',
        '[aria-label*="quote"]',
      ],
      themeOptionCandidates: [
        `${themePopover} ${themeOption}`,
        `.selecttheme ${themeOption}`,
        themeOption,
      ],
      themeRootCandidates: ["#app", "[data-v-app]", ".app", ".app-container"],
      conversationScope,
      conversationInner,
      newChatGuideSafeArea,
      canvasLayoutScope,
      canvasPreviewSafeArea,
      conversationItem,
      userText,
      assistantMarkdown,
      thinkingContainer,
      exportDecoration,
      conversationTitle: ".conversation-name",
      collapseButton: ".collapse-button-bg",
      markdownBody,
      userAttachmentCandidates: "a[href], button, [class*='file'], [class*='image-with-text']",
      attachmentNameRoot: "button, a, [class*='file']",
      thoughtContent:
        "blockquote[slot='content'], blockquote, .text-advance-thinking-content .markdown-body, .thinking-content .markdown-body, .advance-thinking-area .markdown-body, .markdown-body",
      avatar: ".user-img, .avatar, .user-avatar, .userInfoBar-header, .conversation-avatar",
      modelName: [
        ".think-mode-button span:not(.think-text)",
        ".think-mode-button span:first-child",
      ],
      messagesWrapper,
      chatFooter,
      submitButton,
      submitButtonDisabled,
    },
  }
}

export const CHATGLM_CONFIG = createChatGLMConfig()
