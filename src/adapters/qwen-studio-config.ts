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

interface QwenStudioSiteSelectors extends SitePackSelectors {
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

type QwenStudioPrivateSelectors = SitePrivateSelectors & {
  sidebarRoot: string
  sidebarScroll: string
  conversationLink: string
  pinnedConversation: string
  layoutScope: string
  messageWidth: string
  inputSafeArea: string
  newChatInputSafeArea: string
  newChatPlaceholder: string
  userMessageRoot: string
  userContent: string
  assistantContent: string
  composerButton: string
  latex: string
  latexDisplay: string
  codeBlock: string
  codeLine: string
  codeBody: string
  codeBodyFallback: string
  mermaidCodeBody: string
  mermaidCodeContent: string[]
  mermaidChart: string
  codeHeader: string
  codeHeaderActions: string
  codeLineNumber: string
  mermaidSwitch: string
  mermaidSwitchItem: string
  mermaidActiveSwitch: string
  thinkingCard: string
  thoughtTrigger: string
  thoughtTitle: string
  thoughtPanel: string
  thoughtPanelContent: string
  thoughtPanelContentFallback: string
  thoughtPanelCards: string
  thoughtCardContent: string
  thoughtMarkdown: string
  thoughtPanelClose: string
  phaseId: string
  responseToolbar: string
  exportDecoration: string
  userImageCard: string
  userFileCard: string
  assistantGeneratedImage: string
  assistantGeneratedImageCard: string
  assistantImageDecoration: string
  messageMarkerRoot: string
  assistantMessageId: string[]
  modelTrigger: string
  modelText: string
  primaryModelPopup: string
  secondaryModelPopup: string
  modelItem: string
  modelItemName: string[]
  modelMoreTrigger: string
  modelMoreInner: string[]
  modelTriggerFallback: string
  markdownParagraph: string
  userQueryWidth: string[]
}

export interface QwenStudioSiteConfig extends BuiltinSiteConfig {
  selectors: QwenStudioSiteSelectors
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
  sitePrivateSelectors: QwenStudioPrivateSelectors
}

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const QWEN_STUDIO_CONFIG_VERSION = 1

const createQwenStudioConfig = (): QwenStudioSiteConfig => {
  const sidebarRoot = "#sidebar"
  const sidebarScroll = ".session-list-wrapper"
  const conversationItem = ".chat-item-drag"
  const conversationTitle = ".chat-item-drag-link-content-tip-text"
  const newChatButton = ".sidebar-entry-fixed-list-content"
  const layoutScope =
    ".chat-left-panel, body:not(:has(.chat-left-panel)) .splitter-container-left-panel"
  const messageScroll = "#chat-messages-scroll-container"
  const messageContainer = "#chat-message-container"
  const messageWidth = ".qwen-chat-message"
  const inputSafeArea = ".chat-layout-input-container"
  const newChatInputSafeArea = "body:not(:has(.chat-left-panel)) .message-input-wrapper"
  const newChatPlaceholder = "body:not(:has(.chat-left-panel)) .placeholder-logo-text"
  const inputWidth = ".message-input-wrapper"
  const userMessageRoot = ".qwen-chat-message-user"
  const userMessage = ".qwen-chat-message-user, .chat-user-message-wrapper"
  const assistantMessage = ".qwen-chat-message-assistant"
  const userContent = ".user-message-content"
  const assistantContent = ".response-message-content"
  const textarea = "textarea.message-input-textarea"
  const composerButton = "button.send-button"
  const stopButton = ["button.stop-button", 'button[class*="stop-button"]', ".stop-button"]
  const codeBlock = "pre.qwen-markdown-code"
  const thinkingCard =
    ".qwen-chat-thinking-tool-status-card-wraper, .qwen-chat-thinking-status-card"
  const thoughtTitle = ".qwen-chat-thinking-status-card-title-text"
  const thoughtPanel = [
    ".splitter-container-right-panel .qwen-chat-thinking-and-sources",
    ".share-layout-right-panel .qwen-chat-thinking-and-sources",
    ".qwen-chat-thinking-and-sources-share",
  ].join(", ")
  const responseToolbar = ".response-message-footer, .copy-response-button, .message-hoc-container"
  const modelPopup = '[class*="model-selector-popup"]'
  const modelTrigger =
    '#qwen-chat-header-left .ant-dropdown-trigger:has([class*="model-selector-text"])'
  const modelText = '#qwen-chat-header-left [class*="model-selector-text"]'
  const modelItemClass = '[class*="model-item___"]'
  const modelItemSelectedClass = '[class*="model-item-selected___"]'
  const modelItem = `[class*="model-list"] > ${modelItemClass}`
  const modelMoreTrigger = [
    `${modelPopup} .ant-dropdown-trigger:has([class*="view-more-text"])`,
    `${modelPopup} .ant-dropdown-trigger:has([class*="view-more-icon"])`,
  ].join(", ")
  const modelMenuItem = [
    `${modelPopup} [class*="model-list"] > :is(${modelItemClass}, ${modelItemSelectedClass})`,
    `${modelPopup} .ant-dropdown-trigger:has(:is([class*="view-more-text"], [class*="view-more-icon"]))`,
    '.ant-dropdown :is([role="menuitem"], .ant-dropdown-menu-item, .ant-dropdown-menu-title-content)',
    '.ant-select-dropdown :is([role="option"], .ant-select-item-option)',
  ].join(", ")

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.QWENAI]],
    selectors: {
      textarea: [textarea, "textarea"],
      submitButton: [`${composerButton}:not([disabled])`],
      responseContainer: messageContainer,
      chatContent: [userMessage, assistantMessage],
      userQuery: userMessage,
      assistantResponse: assistantMessage,
      newChatButton: [newChatButton],
      stopButton: [...stopButton],
      scrollContainer: [messageScroll],
    },
    input: { mode: "textarea", submitKey: "Enter" },
    conversation: {
      itemSelector: conversationItem,
      idFrom: { attr: "href", regex: "/c/([a-fA-F0-9-]+)" },
      titleSelector: conversationTitle,
      urlTemplate: "/c/{id}",
      navigationStrategy: "click-item",
      shadow: false,
    },
    generating: { existsSelectors: [...stopButton] },
    networkMonitor: {
      urlPatterns: ["/api/v2/chat/completions"],
      urlPathEndsWith: ["/chat/completions"],
      silenceThreshold: 2000,
    },
    modelSwitcher: {
      selectorButtonSelectors: [modelTrigger, modelText],
      menuItemSelector: modelMenuItem,
      checkInterval: 1000,
      maxAttempts: 12,
      menuRenderDelay: 400,
      subMenuSelector: modelMoreTrigger,
      subMenuTriggers: ["展开更多模型", "更多模型", "view more", "more models"],
    },
    export: {
      userQuerySelector: userMessage,
      assistantResponseSelector: assistantMessage,
      turnSelector: null,
      useShadowDOM: false,
    },
    widthSelectors: [
      {
        selector: messageWidth,
        property: "max-width",
        extraCss: "width: 100% !important; box-sizing: border-box !important;",
      },
      { selector: inputWidth, property: "max-width" },
    ],
    zenMode: { hide: [sidebarRoot] },
    cleanMode: { hide: [".chat-container-statement"] },
    mermaidSupport: "native",
    quickQuote: "enabled",
    supportsHostThemeSync: true,
    sitePrivateSelectors: {
      sidebarRoot,
      sidebarScroll,
      conversationLink: 'a[href*="/c/"]',
      pinnedConversation: ".chat-item-title-pined-icon",
      layoutScope,
      messageWidth,
      inputSafeArea,
      newChatInputSafeArea,
      newChatPlaceholder,
      userMessageRoot,
      userContent,
      assistantContent,
      composerButton,
      latex: ".qwen-markdown-latex",
      latexDisplay: ".katex-display",
      codeBlock,
      codeLine: ".view-lines .view-line",
      codeBody: ".qwen-markdown-code-body",
      codeBodyFallback: "[data-mode-id]",
      mermaidCodeBody: ".qwen-markdown-code-body.mermaid",
      mermaidCodeContent: [".qwen-markdown-code-body.mermaid > div", "[data-mode-id='mermaid']"],
      mermaidChart: ".qwen-markdown-mermaid-chart-wrapper",
      codeHeader: ".qwen-markdown-code-header",
      codeHeaderActions: ".qwen-markdown-code-header-actions",
      codeLineNumber: ".margin-view-overlays .line-numbers",
      mermaidSwitch: ".artifacts-body-header-switch",
      mermaidSwitchItem:
        ".artifacts-body-header-switch-active, .artifacts-body-header-switch-unactive, .header-switch-status-small",
      mermaidActiveSwitch: '[class*="switch-active"]',
      thinkingCard,
      thoughtTrigger:
        ".qwen-chat-thinking-tool-status-card-wraper .qwen-chat-tool-status-card, .qwen-chat-thinking-tool-status-card-wraper .qwen-chat-thinking-status-card-completed",
      thoughtTitle,
      thoughtPanel,
      thoughtPanelContent: ".qwen-chat-thinking-and-sources-content-thinking-container",
      thoughtPanelContentFallback: ".qwen-chat-thinking-and-sources-content",
      thoughtPanelCards: ".qwen-chat-thinking-status-card",
      thoughtCardContent: ".qwen-chat-thinking-status-card-content",
      thoughtMarkdown: ".qwen-markdown",
      thoughtPanelClose:
        ".qwen-chat-thinking-and-sources-header .anticon, .qwen-chat-thinking-and-sources-header [role='img']",
      phaseId: "[data-phase-id]",
      responseToolbar,
      exportDecoration: [
        ".gh-root",
        ".gh-user-query-markdown",
        thinkingCard,
        responseToolbar,
        "button",
        "[role='button']",
        "svg",
        "[aria-hidden='true']",
        "style",
        "script",
      ].join(", "),
      userImageCard: [
        ".user-image-item",
        ".user-image-list .qwen-image",
        "[class*='file-message-image'] .qwen-image",
        ".qwen-markdown-image:has(img)",
      ].join(", "),
      userFileCard: ".fileitem-btn, [class*='file-message-document'], .file-content-info",
      assistantGeneratedImage: [
        ".chat-response-media-render img",
        ".qwen-chat-response-control-card img",
        ".response-message-content img",
        ".qwen-markdown-image img",
        "img.qwen-image",
      ].join(", "),
      assistantGeneratedImageCard: [
        ".chat-response-media-render",
        ".qwen-chat-response-control-card",
        ".qwen-markdown-image",
        "picture",
        "img",
      ].join(", "),
      assistantImageDecoration: ".response-message-footer, .copy-response-button",
      messageMarkerRoot: ".qwen-chat-message, [data-message-id]",
      assistantMessageId: [
        "[id^='chat-response-message-']",
        "[id^='qwen-chat-message-assistant-']",
      ],
      modelTrigger,
      modelText,
      primaryModelPopup:
        '.ant-dropdown:not(.ant-dropdown-hidden) [class*="model-selector-popup"]:not([class*="secondary"])',
      secondaryModelPopup:
        '.ant-dropdown:not(.ant-dropdown-hidden) [class*="model-selector-popup"][class*="secondary"]',
      modelItem,
      modelItemName: ['[class*="model-item-name"] > span', '[class*="model-item-name"]'],
      modelMoreTrigger,
      modelMoreInner: [
        '[class*="view-more___"]',
        '[class*="view-more-text"]',
        '[class*="view-more-icon"]',
      ],
      modelTriggerFallback: ".ant-dropdown-trigger, [role='button'], button, [tabindex]",
      markdownParagraph: ".qwen-markdown-paragraph",
      userQueryWidth: [
        ".chat-user-message-container .chat-user-message-wrapper .chat-user-message",
      ],
    },
  }
}

export const QWEN_STUDIO_CONFIG = createQwenStudioConfig()
