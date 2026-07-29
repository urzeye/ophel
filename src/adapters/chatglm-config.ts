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
  newChatButton: string[]
  stopButton: string[]
  scrollContainer: string[]
}

type ChatGLMPrivateSelectors = SitePrivateSelectors & {
  nativeQuotePopover: string[]
  themeUserMenuButtons: string[]
  themeEntry: string
  themeOptionCandidates: string[]
  themeClickable: string[]
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
  messageWidth: string
  markdownWidth: string
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
export const CHATGLM_CONFIG_VERSION = 1

const createChatGLMConfig = (): ChatGLMSiteConfig => {
  const responseContainer = ".conversation-list"
  const conversationScope = ".conversation-container"
  const conversationInner = ".conversation-inner"
  const newChatGuideSafeArea = ".init-page .main-chat-guide-container"
  const canvasLayoutScope = "section.el-container:has(> .code-preview-tabs)"
  const canvasPreviewSafeArea = ".code-preview-tabs"
  const conversationItem = ".conversation-item"
  const userQuery = ".conversation.question"
  const userText = ".question-txt"
  const assistantResponse = ".answer-content-wrap"
  const markdownBody = ".markdown-body"
  const assistantMarkdown = `${assistantResponse} ${markdownBody}`
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
    "#search-input-box textarea",
    ".main-chat-search #search-input-box textarea",
    ".main-chat-search textarea",
  ]
  const submitButton = ".enter-icon-container"
  const submitButtonDisabled = ".empty"
  const stopButton = [
    ".enter.searching .enter-icon-container",
    ".stop-generate",
    ".stop-stream-tip",
    ".answer-content-wrap .generating-icon",
    ".enter-icon-container.stop",
    ".enter.searching",
    ".enter.is-main-chat.searching",
  ]
  const messageWidth = [
    ".dialogue .detail .item",
    ".dialogue .detail .item.item",
    ".dialogue .detail .item.item.item",
  ].join(", ")
  const markdownWidth = [
    markdownBody,
    `${markdownBody}${markdownBody}`,
    `${assistantResponse} ${markdownBody}`,
  ].join(", ")
  const codeBlockStretchCss = [
    "width: 100% !important;",
    "margin-left: 0 !important;",
    "margin-right: 0 !important;",
    "box-sizing: border-box !important;",
  ].join(" ")
  const themePopover = ".theme-popper"
  const themeOption = ".selecttheme-list"

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.CHATGLM]],
    selectors: {
      textarea,
      submitButton: [`${submitButton}:not(${submitButtonDisabled})`],
      responseContainer,
      chatContent: [assistantMarkdown, userText],
      userQuery,
      assistantResponse,
      newChatButton: [".new-session", 'div[class~="new-session"]'],
      stopButton,
      scrollContainer: [responseContainer, ".chatScrollContainer"],
    },
    input: { mode: "textarea", submitKey: "Enter" },
    generating: { existsSelectors: [...stopButton] },
    networkMonitor: {
      urlPatterns: ["/chatglm/backend-api/assistant/stream"],
      silenceThreshold: 2000,
    },
    modelSwitcher: {
      selectorButtonSelectors: [
        ".wrapper-title",
        ".wrapper-title .showHideText",
        ".model-select-icon-container",
        ".selected-model-info",
        ".model-select-container",
      ],
      menuItemSelector: ".model-select-list .model-select-item",
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
      { selector: conversationScope, property: "max-width" },
      { selector: conversationInner, property: "max-width" },
      { selector: responseContainer, property: "max-width" },
      { selector: messageWidth, property: "max-width" },
      { selector: markdownWidth, property: "max-width" },
      {
        selector: ".code-no-artifacts .markdown-body.md-code, .code-no-artifacts .md-code",
        property: "max-width",
        value: "100%",
        extraCss: codeBlockStretchCss,
        noCenter: true,
      },
      {
        selector:
          ".code-no-artifacts .markdown-body.md-code > .language, .code-no-artifacts .markdown-body.md-code pre",
        property: "max-width",
        value: "100%",
        extraCss: "width: 100% !important; box-sizing: border-box !important;",
        noCenter: true,
      },
      {
        selector: ".markdown-body table, .answer-content-wrap .markdown-body table",
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
      { selector: responseContainer, property: "width", value: "100%" },
      {
        selector: ".conversation-bottom",
        property: "max-width",
        extraCss: "flex: 1 !important;",
      },
      { selector: ".component-box-new", property: "max-width" },
    ],
    zenMode: { hide: [".el-aside"] },
    cleanMode: {
      hide: [".policy-wrap, .policy-wrap *", ".vip-btn", ".slogan-banner"],
    },
    quickQuote: "native",
    sitePrivateSelectors: {
      nativeQuotePopover: [
        '[class*="quote-button"]',
        '[class*="reference-button"]',
        '[aria-label*="引用"]',
        '[aria-label*="quote"]',
      ],
      themeUserMenuButtons: [
        ".userInfoBar-header .me-icon",
        ".userInfoBar-header .me",
        ".userInfoBar-header img.avatar",
      ],
      themeEntry: ".themes",
      themeOptionCandidates: [
        `${themePopover} ${themeOption}`,
        `.selecttheme ${themeOption}`,
        themeOption,
      ],
      themeClickable: [".me-icon", ".me", ".userInfoBar-header"],
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
      avatar: ".user-img, .avatar, .user-avatar, .userInfoBar-header",
      modelName: [
        ".wrapper-title .showHideText",
        ".wrapper-title .wrapper-title-innerText",
        ".wrapper-title",
        ".selected-model-info .model-select-name",
        ".model-select-container .model-select-name",
        ".model-select-list .model-select-item.selected .model-select-name",
        ".model-select-name",
      ],
      messageWidth,
      markdownWidth,
      submitButton,
      submitButtonDisabled,
    },
  }
}

export const CHATGLM_CONFIG = createChatGLMConfig()
