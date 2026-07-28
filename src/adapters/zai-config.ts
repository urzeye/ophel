import { SITE_IDS } from "~constants/defaults"

import type { ExportConfig, ModelSwitcherConfig, WidthSelectorConfig, ZenModeConfig } from "./base"
import type {
  BuiltinSiteConfig,
  SitePackGeneratingConfig,
  SitePackInputConfig,
  SitePackSelectors,
  SitePrivateSelectors,
} from "./declarative"
import { BUILTIN_FEATURE_CAPABILITIES } from "./feature-capabilities"

interface ZaiSiteSelectors extends SitePackSelectors {
  textarea: string[]
  responseContainer: string
  chatContent: string[]
  userQuery: string
  newChatButton: string[]
  stopButton: string[]
}

type ZaiPrivateSelectors = SitePrivateSelectors & {
  chatContainer: string
  chatMessagesContainer: string
  chatMessageWidth: string
  chatInputSafeArea: string
  newChatContentSafeArea: string
  userQueryWidth: string
  submitButton: string
  assistantMarkdown: string[]
  assistantBody: string[]
  thinkingChainContainer: string
  thinkingBlock: string
  thinkingContent: string
  blockquote: string
  thinkingContainer: string
  thinkingBlockquote: string
  userContentCandidates: string[]
  exportDecoration: string
  sidebarItem: string
  sidebarTitle: string
  sidebarItemTrigger: string
  sidebarScrollContainer: string
  paneRoot: string
  inputWithinScrollContainer: string
  horizontalScrollContainer: string
  themeMeta: string
  messageRoot: string
  attachmentCards: string
  attachmentImages: string
  attachmentIconImages: string
}

export interface ZaiSiteConfig extends BuiltinSiteConfig {
  selectors: ZaiSiteSelectors
  input: SitePackInputConfig
  generating: SitePackGeneratingConfig
  modelSwitcher: Omit<ModelSwitcherConfig, "targetModelKeyword">
  export: ExportConfig
  zenMode: ZenModeConfig
  widthSelectors: Omit<WidthSelectorConfig, "transformValue">[]
  sitePrivateSelectors: ZaiPrivateSelectors
}

export const ZAI_EXPORT_ROLE_ATTR = "data-gh-export-role"
const EXPORT_USER_QUERY_SELECTOR = `[${ZAI_EXPORT_ROLE_ATTR}="user"]`
const EXPORT_ASSISTANT_SELECTOR = `[${ZAI_EXPORT_ROLE_ATTR}="assistant"]`

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const ZAI_CONFIG_VERSION = 1

const createZaiConfig = (): ZaiSiteConfig => {
  const chatContainer = "#chat-container"
  const chatMessagesContainer = `${chatContainer} #messages-container`
  const chatScrollContainer = [
    chatMessagesContainer,
    `${chatContainer} .flex.overflow-y-scroll.flex-col.w-full.h-full`,
    `${chatContainer} .scrollbar-none.flex.flex-col`,
    `${chatContainer} [data-pane-id] .overflow-y-scroll`,
    `${chatContainer} [data-pane-id] .scrollbar-none`,
  ].join(", ")
  const chatMessageWidth = [
    `${chatContainer} [class*="max-w-[808px]"]`,
    `${chatContainer} [class*="max-w-[894px]"]`,
    `${chatContainer} [class*="max-w-[1000px]"]`,
    `${chatContainer} [class*="max-w-[960px]"]`,
  ].join(", ")
  const chatInputWidth = [
    `${chatContainer} .messageInputContainer [class*="max-w-[768px]"]`,
    `${chatContainer} .messageInputContainer [class*="max-w-[854px]"]`,
  ].join(", ")
  const userQuery = [
    '[id^="message-"].user-message',
    ".user-message .chat-user.markdown-prose",
    ".user-message .chat-user",
    `${chatContainer} .chat-user.markdown-prose`,
    `${chatContainer} .chat-user`,
    `${chatContainer} [data-message-author-role="user"]`,
    `${chatContainer} [data-role="user"]`,
    `${chatContainer} .message-user`,
    `${chatContainer} .user-message`,
    `${chatContainer} .chat-message-user`,
    `${chatContainer} .message.user`,
  ].join(", ")
  const assistantBody = [
    `${chatContainer} .markdown-prose:not(.chat-user)`,
    `${chatContainer} [data-message-author-role="assistant"]`,
    `${chatContainer} [data-role="assistant"]`,
    `${chatContainer} .message-assistant`,
    `${chatContainer} .assistant-message`,
    `${chatContainer} .chat-message-assistant`,
    `${chatContainer} .markdown`,
    `${chatContainer} .markdown-body`,
    `${chatContainer} .prose`,
    `${chatContainer} article`,
    `${chatContainer} [data-markdown]`,
    '[id^="message-"]:not(.user-message) .markdown-prose:not(.chat-user)',
    '[id^="message-"]:not(.user-message) .markdown-body',
    '[id^="message-"]:not(.user-message) [data-markdown]',
  ]
  const assistantMarkdown = ['[id^="message-"]:not(.user-message)', ...assistantBody]
  const stopButton = [
    'div[aria-label="停止"] button',
    "button:has(span.rounded-xs):has(span.size-3)",
    "button:has(span.rounded-xs):has(span.block)",
  ].join(", ")
  const thinkingChainContainer = ".thinking-chain-container"
  const thinkingBlock = ".thinking-block"
  const thinkingContent = "blockquote[slot='content']"
  const blockquote = "blockquote"

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.ZAI]],
    selectors: {
      textarea: ["#chat-input", "textarea#chat-input"],
      responseContainer: chatScrollContainer,
      chatContent: [userQuery, ...assistantMarkdown],
      userQuery,
      newChatButton: ["#sidebar-new-chat-button", "#new-chat-button"],
      stopButton: [stopButton],
    },
    input: { mode: "textarea", submitKey: "Enter" },
    generating: { existsSelectors: [stopButton] },
    modelSwitcher: {
      selectorButtonSelectors: [
        "button.modelSelectorButton",
        'button[id^="model-selector-"][id$="-button"]',
        "#model-selector-glm-5-button",
        "button[data-melt-dropdown-menu-trigger][data-menu-trigger].modelSelectorButton",
      ],
      menuItemSelector: 'button[aria-label="model-item"], button[data-melt-collapsible-trigger]',
      checkInterval: 1000,
      maxAttempts: 12,
      menuRenderDelay: 400,
      subMenuSelector: "button[data-melt-collapsible-trigger]",
      subMenuTriggers: ["更多模型", "more"],
    },
    export: {
      userQuerySelector: EXPORT_USER_QUERY_SELECTOR,
      assistantResponseSelector: EXPORT_ASSISTANT_SELECTOR,
      turnSelector: null,
      useShadowDOM: false,
    },
    zenMode: { hide: ["#sidebar"] },
    widthSelectors: [
      { selector: chatMessageWidth, property: "max-width" },
      { selector: chatInputWidth, property: "max-width" },
    ],
    sitePrivateSelectors: {
      chatContainer,
      chatMessagesContainer,
      chatMessageWidth,
      chatInputSafeArea: `${chatContainer}:not(:has([data-pane-id] .placeholder-input)) .messageInputContainer`,
      newChatContentSafeArea: `${chatContainer} [data-pane-id]:has(.placeholder-input)`,
      userQueryWidth: `${chatContainer} .chat-user [class*="max-w-[90%]"]`,
      submitButton: "#send-message-button",
      assistantMarkdown,
      assistantBody,
      thinkingChainContainer,
      thinkingBlock,
      thinkingContent,
      blockquote,
      thinkingContainer: `${thinkingChainContainer}, ${thinkingBlock}`,
      thinkingBlockquote: `${thinkingContent}, ${thinkingBlock} ${blockquote}, ${thinkingChainContainer} ${blockquote}`,
      userContentCandidates: [
        ".gh-user-query-raw",
        ".rounded-xl.whitespace-pre-wrap",
        ".rounded-xl",
        ".whitespace-pre-wrap",
        "[data-user-content]",
        ".message-content",
        ".chat-message-content",
        ".user-message-content",
        ".content",
        'div[dir="auto"]',
        "p",
      ],
      exportDecoration: [
        ".gh-root",
        ".gh-user-query-markdown",
        "button",
        "[role='button']",
        "svg",
        "[aria-hidden='true']",
        "style",
        "script",
      ].join(", "),
      sidebarItem: "#sidebar .w-full.mb-1.relative.group",
      sidebarTitle: 'div[dir="auto"]',
      sidebarItemTrigger: "button",
      sidebarScrollContainer: "#sidebar .overflow-y-auto",
      paneRoot: "[data-pane-id]",
      inputWithinScrollContainer: "textarea, #chat-input",
      horizontalScrollContainer: ".scrollbar-none",
      themeMeta: 'meta[name="theme-color"]',
      messageRoot: '[id^="message-"]',
      attachmentCards: "button",
      attachmentImages: "img[data-cy='image'], img.not-prose",
      attachmentIconImages: "img[src*='/icons/']",
    },
  }
}

export const ZAI_CONFIG = createZaiConfig()
