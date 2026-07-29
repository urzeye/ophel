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

interface KimiSiteSelectors extends SitePackSelectors {
  textarea: string[]
  submitButton: string[]
  responseContainer: string
  chatContent: string[]
  userQuery: string
  assistantResponse: string
  newChatButton: string[]
  stopButton: string[]
}

type KimiPrivateSelectors = SitePrivateSelectors & {
  sidebarConversation: string
  historyContainer: string
  historyScrollCandidates: string[]
  nextSidebarBody: string
  conversationHeaderTitle: string
  pinnedConversation: string
  activeConversation: string
  moreHistoryLink: string
  closeHistory: string
  closeButtonContainer: string
  inputScope: string
  editorScope: string
  submitButtonContainer: string
  submitButtonDisabled: string
  shareScrollContainer: string
  chatDetailScrollContainer: string
  chatContentContainer: string
  chatItem: string
  userItem: string
  assistantItem: string
  userContentBox: string
  assistantBodyMarkdown: string
  markdown: string
  thinkingContainer: string
  toolcallContainer: string
  toolcallContentMarkdown: string
  exportDecoration: string
  userAttachmentList: string
  userAttachmentImage: string
  userFileCard: string
  userFileName: string
  userFileType: string
  userFileSize: string
  fileLink: string
  modelName: string
  chatLayoutScope: string
  chatListWidth: string
  chatActionContainer: string
  chatEditor: string
  chatDetailMain: string
  newChatLayoutScope: string
  userQueryWrapper: string
  userContent: string
  userQueryContent: string
  markdownFixerParagraph: string
  lastAssistant: string
}

export interface KimiSiteConfig extends BuiltinSiteConfig {
  selectors: KimiSiteSelectors
  input: SitePackInputConfig
  conversation: SitePackConversationConfig
  generating: SitePackGeneratingConfig
  networkMonitor: NetworkMonitorConfig
  modelSwitcher: Omit<ModelSwitcherConfig, "targetModelKeyword">
  export: ExportConfig
  widthSelectors: Omit<WidthSelectorConfig, "transformValue">[]
  zenMode: ZenModeConfig
  cleanMode: ZenModeConfig
  sitePrivateSelectors: KimiPrivateSelectors
}

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const KIMI_CONFIG_VERSION = 1

const createKimiConfig = (): KimiSiteConfig => {
  const sidebarConversation = "a.chat-info-item, a.next-sidebar-history-item__link"
  const historyConversation = "a.history-link"
  const conversation = `${sidebarConversation}, ${historyConversation}`
  const historyContainer = ".history-part"
  const historyPageList = ".history .group-list-container"
  const conversationTitle = "span.chat-name, .next-sidebar-history-item__title"
  const historyTitle = ".history-chat .title-wrapper .title"
  const nextSidebarBody = ".next-sidebar__body"
  const nextSidebarHistoryList = ".next-sidebar-history-list"
  const nextSidebarHistoryItems = ".next-sidebar-history-list__items"
  const chatList = ".chat-content-list"
  const shareList = ".share-content-list"
  const responseList = `${chatList}, ${shareList}`
  const newChatLayoutScope = "body:not(:has(.chat-detail-content)) #chat-container.layout-content"
  const chatLayoutScope = `.chat-detail-content, ${newChatLayoutScope}`
  const chatDetailMain = ".chat-detail-main"
  const chatContentContainer = ".chat-content-container"
  const chatActionContainer = ".chat-action .bottom-action-container"
  const chatEditor = ".chat-editor"
  const chatListWidth = [
    chatList,
    `${chatList}${chatList}`,
    `${chatList}${chatList}${chatList}`,
    `.chat-detail-content ${chatList}`,
    `.chat-detail-content ${chatList}${chatList}`,
  ].join(", ")
  const chatItem = ".chat-content-item"
  const userItem = ".chat-content-item-user"
  const assistantItem = ".chat-content-item-assistant"
  const userSegment = ".segment.segment-user"
  const assistantSegment = ".segment.segment-assistant"
  const userQueryWrapper = [
    ".segment-user .segment-content",
    `${userItem} .segment-content`,
    ".segment-container:has(.user-content) > .segment-content",
  ].join(", ")
  const userContent = [
    ".segment-user .segment-content-box",
    `${userItem} .segment-content-box`,
    ".segment-content-box:has(> .user-content)",
  ].join(", ")
  const userQueryContent = [
    ".segment-user .user-content",
    `${userItem} .user-content`,
    ".segment-content-box > .user-content",
  ].join(", ")
  const assistantBodyMarkdown = [
    ".segment-assistant .segment-content-box > .markdown-container > .markdown",
    `${assistantItem} .segment-content-box > .markdown-container > .markdown`,
  ].join(", ")
  const submitButtonContainer = ".send-button-container"
  const activeStopButton = `${submitButtonContainer}.stop`
  const stopIcon = `${submitButtonContainer} svg[name="stop"]`

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.KIMI]],
    selectors: {
      textarea: [
        '.chat-input-editor[data-lexical-editor="true"]',
        '.chat-input-editor[contenteditable="true"]',
        '[role="textbox"].chat-input-editor',
      ],
      submitButton: [`${submitButtonContainer}:not(.disabled):not(.stop)`],
      responseContainer: responseList,
      chatContent: [assistantBodyMarkdown, userContent],
      userQuery: userSegment,
      assistantResponse: assistantSegment,
      newChatButton: [
        "a.new-chat-btn",
        'a.new-chat-btn[href="/"]',
        'a.new-chat-btn[href="https://www.kimi.com/"]',
      ],
      stopButton: [activeStopButton, `${submitButtonContainer}:has(svg[name="stop"])`],
    },
    input: { mode: "contenteditable", submitKey: "Enter" },
    conversation: {
      itemSelector: conversation,
      idFrom: { attr: "href", regex: "^/chat/([A-Za-z0-9-]+)(?:/|$)" },
      titleSelector: `${conversationTitle}, ${historyTitle}`,
      urlTemplate: "/chat/{id}",
      activeMatch: ".router-link-active, .router-link-exact-active",
      navigationStrategy: "click-item",
      shadow: false,
    },
    generating: { existsSelectors: [activeStopButton, stopIcon] },
    networkMonitor: {
      urlPatterns: ["apiv2/kimi.gateway.chat.v1.ChatService/Chat"],
      silenceThreshold: 2000,
    },
    modelSwitcher: {
      selectorButtonSelectors: [".current-model.active .model-name", ".current-model .model-name"],
      menuItemSelector: [
        '[role="menuitem"]',
        '[role="option"]',
        ".n-base-select-option",
        ".n-dropdown-option",
        ".model-item",
        ".model-option",
      ].join(", "),
      checkInterval: 1000,
      maxAttempts: 15,
      menuRenderDelay: 350,
    },
    export: {
      userQuerySelector: userSegment,
      assistantResponseSelector: assistantSegment,
      turnSelector: null,
      useShadowDOM: false,
    },
    widthSelectors: [
      {
        selector: chatLayoutScope,
        property: "width",
        value: "100%",
        noCenter: true,
        extraCss: "max-width: 100% !important; min-width: 0 !important;",
      },
      {
        selector: chatContentContainer,
        property: "max-width",
        extraCss: "width: 100% !important; min-width: 0 !important;",
      },
      {
        selector: chatListWidth,
        property: "max-width",
        value: "100%",
        noCenter: true,
        extraCss:
          "width: 100% !important; min-width: 0 !important; padding-left: 0 !important; padding-right: 0 !important;",
      },
      {
        selector: chatListWidth,
        property: "width",
        value: "100%",
        noCenter: true,
      },
      { selector: chatEditor, property: "max-width" },
    ],
    zenMode: {
      hide: [".sidebar-slot.sidebar-slot--interactive"],
      styles: [
        {
          selector: ".app.has-sidebar .main",
          property: "--kimi-sidebar-main-offset",
          value: "6px",
        },
      ],
    },
    cleanMode: {
      hide: [
        ".chat-bottom .legal-footer, .legal-footer",
        ".membership-upgrade",
        ".download-app-btn",
        ".activity-area",
      ],
    },
    sitePrivateSelectors: {
      sidebarConversation,
      historyContainer,
      historyScrollCandidates: [
        historyPageList,
        historyContainer,
        ".history .usage-content",
        ".history .content",
        ".history",
        nextSidebarHistoryItems,
        nextSidebarHistoryList,
        nextSidebarBody,
      ],
      nextSidebarBody,
      conversationHeaderTitle: ".chat-header-content h2",
      pinnedConversation: "svg.pinned, .pinned, .next-sidebar-history-item__pinned",
      activeConversation: `${sidebarConversation}.router-link-active, ${sidebarConversation}.router-link-exact-active`,
      moreHistoryLink: [
        'a.more-history[href*="/chat/history"]',
        'a.nav-item.more-history[href*="/chat/history"]',
        'a.next-sidebar__section-text-action[href*="/chat/history"]',
      ].join(", "),
      closeHistory: [
        ".header-right .close-button-container",
        ".header-right .close-button",
        ".history .header-right .close-button-container",
        ".history .header-right .close-button",
      ].join(", "),
      closeButtonContainer: ".close-button-container",
      inputScope: ".chat-input-editor-container",
      editorScope: chatEditor,
      submitButtonContainer,
      submitButtonDisabled: `${submitButtonContainer}.disabled, ${submitButtonContainer}.stop`,
      shareScrollContainer: ".share-detail",
      chatDetailScrollContainer: ".chat-detail-content",
      chatContentContainer,
      chatItem,
      userItem,
      assistantItem,
      userContentBox: ".segment-content-box",
      assistantBodyMarkdown,
      markdown: ".markdown",
      thinkingContainer: ".toolcall-container.thinking-container, .thinking-container",
      toolcallContainer: ".toolcall-container, .container-block",
      toolcallContentMarkdown: ".markdown-container.toolcall-content-text",
      exportDecoration:
        "button, [role='button'], svg, canvas, [aria-hidden='true'], .segment-avatar, .okc-cards-container",
      userAttachmentList: ".attachment-list",
      userAttachmentImage:
        ".attachment-list-image img, .image-thumbnail img.image-main, .image-wrapper img.image-main",
      userFileCard: ".attachment-list-file .file-card-container",
      userFileName: ".file-card-info-name",
      userFileType: ".file-ext",
      userFileSize: ".file-size",
      fileLink: "a[href]",
      modelName: ".current-model .model-name .name",
      chatLayoutScope,
      chatListWidth,
      chatActionContainer,
      chatEditor,
      chatDetailMain,
      newChatLayoutScope,
      userQueryWrapper,
      userContent,
      userQueryContent,
      markdownFixerParagraph: ".segment-assistant .markdown p",
      lastAssistant: `${assistantItem} .segment-assistant`,
    },
  }
}

export const KIMI_CONFIG = createKimiConfig()
