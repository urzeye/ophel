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

interface YuanbaoSiteSelectors extends SitePackSelectors {
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

type YuanbaoPrivateSelectors = SitePrivateSelectors & {
  inputContainer: string
  primarySubmitButton: string
  conversationPinned: string
  conversationFallbackId: string
  agentId: string[]
  userText: string
  assistantMarkdown: string
  userAttachmentImage: string
  userAttachmentFile: string
  userImageContainer: string
  assistantGeneratedImage: string
  thoughtMarkdown: string
  thoughtContainer: string
  assistantReasonerBody: string[]
  dropdownMenu: string
  dropdownItem: string
  conversationMenuTrigger: string
  dialog: string
  dialogButton: string
  layoutScope: string
  chatColumnScope: string
  canvasPane: string
  chatContent: string
  userTextDecoration: string
  assistantExportDecoration: string
  cleanTextDecoration: string
  assistantPlainTextDecoration: string
  headingDecoration: string
  thoughtDecoration: string
  assistantSpeechText: string
  bubbleContent: string
  assetCard: string
  conversationActionExclusion: string
  conversationActionIcon: string
  sendIcon: string
  stopIcon: string
}

export interface YuanbaoSiteConfig extends BuiltinSiteConfig {
  selectors: YuanbaoSiteSelectors
  input: SitePackInputConfig
  conversation: SitePackConversationConfig
  generating: SitePackGeneratingConfig
  networkMonitor: NetworkMonitorConfig
  modelSwitcher: Omit<ModelSwitcherConfig, "targetModelKeyword">
  export: ExportConfig
  widthSelectors: Omit<WidthSelectorConfig, "transformValue">[]
  zenMode: ZenModeConfig
  cleanMode: ZenModeConfig
  sitePrivateSelectors: YuanbaoPrivateSelectors
}

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const YUANBAO_CONFIG_VERSION = 1

const createYuanbaoConfig = (): YuanbaoSiteConfig => {
  const inputContainer = ".agent-dialogue__content--common__input"
  const textarea = [
    `${inputContainer} .ql-editor[contenteditable="true"]`,
    '#search-bar .ql-editor[contenteditable="true"]',
    '.ql-editor[contenteditable="true"]',
  ].join(", ")
  const primarySubmitButton = "#yuanbao-send-btn"
  const submitButton = `${primarySubmitButton}, a.style__send-btn___RwTm5`
  const newChatButton = '.yb-common-nav__trigger[data-desc="new-chat"]'
  const stopButton = "a.style__send-btn___RwTm5"

  const sidebarScrollContainer = ".yb-nav__content"
  const conversationItem = ".yb-recent-conv-list__item"
  const conversationTitle = [
    ".yb-recent-conv-list__item-name[data-item-name]",
    ".yb-recent-conv-list__item-name",
    "[data-item-id][data-item-name]",
  ].join(", ")
  const conversationPinned = [
    ".yb-recent-conv-list__item-name.isTop",
    ".yb-recent-conv-list__chat-top .icon-yb-ic_pin_16",
  ].join(", ")

  const responseScroll = [
    "#chat-content .agent-chat__list__content-wrapper",
    ".agent-chat__list__content-wrapper",
  ].join(", ")
  const responseContainer = [
    "#chat-content .agent-chat__list__content",
    ".agent-chat__list__content",
  ].join(", ")
  const userMessage = ".agent-chat__list__item--human"
  const assistantMessage = ".agent-chat__list__item--ai"
  const userText = [
    ".agent-chat__bubble--human .hyc-content-text",
    ".agent-chat__bubble--human .agent-chat__bubble__content",
  ].join(", ")
  const assistantMarkdown = [
    `${assistantMessage} .hyc-common-markdown-style`,
    `${assistantMessage} .hyc-content-md-done`,
  ].join(", ")
  const assistantToolbar = [
    ".agent-chat__toolbar",
    ".agent-chat__toolbar_new",
    ".agent-chat__question-toolbar",
    ".hyc-common-markdown__code__hd__r",
  ].join(", ")
  const assistantDecoration = [
    ".hyc-card-box-process-list",
    ".hyc-common-markdown__replace-appCard",
  ].join(", ")
  const userAttachmentImage = [
    ".hyc-component-multi-modal__image img",
    ".agent-chat__bubble--human .hyc-content-img img",
  ].join(", ")
  const userAttachmentFile = [
    ".hyc-component-multi-modal__file",
    ".hyc-component-multi-modal__doc",
    ".hyc-component-multi-modal__document",
    ".hyc-content-file",
    ".hyc-content-doc",
    ".hyc-file-card",
    ".hyc-doc-card",
    "[data-file-id]",
    "[data-doc-id]",
    "[data-resource-id]",
    "a[href*='/api/resource/download']",
    ".agent-chat__bubble--human [class*='file']",
    ".agent-chat__bubble--human [class*='doc']",
  ].join(", ")
  const assistantGeneratedImage = [
    '[data-card-type="image"] img',
    '[data-box-type="loadingImage"] img',
    ".hyc-media-box--loadingImage img",
    ".loading-image-box img",
  ].join(", ")
  const assistantGeneratedImageCard = [
    '[data-card-type="image"]',
    '[data-box-type="loadingImage"]',
    ".hyc-media-box--loadingImage",
    ".loading-image-box",
  ].join(", ")

  const modelButton = ".ybc-model-select-button"
  const modelText = `${modelButton} .t-button__text`
  const modelMenuItem = [
    ".ybc-model-select-dropdown-popup .t-dropdown__item",
    ".ybc-model-select-dropdown .t-dropdown__item",
    ".t-popup .t-dropdown__item",
  ].join(", ")
  const thoughtMarkdown = [
    ".hyc-component-reasoner__think-content .hyc-common-markdown-style",
    ".hyc-component-deepsearch-cot__think__content__item .hyc-common-markdown-style",
    ".hyc-common-markdown-style-cot",
  ].join(", ")
  const thoughtContainer = [
    ".hyc-component-reasoner__think",
    ".hyc-component-deepsearch-cot__think",
    ".hyc-common-markdown-style-cot",
  ].join(", ")
  const assistantReasonerBody = [
    ".hyc-component-reasoner__text .hyc-common-markdown-style",
    ".hyc-component-reasoner__text .hyc-content-md-done",
    ".hyc-component-reasoner__text",
  ]
  const dropdownMenu = [
    ".t-dropdown__menu",
    ".t-dropdown__submenu",
    ".t-dropdown",
    ".t-popup",
    ".t-popup__content",
    ".t-popup__content__inner",
    '[role="menu"]',
    '[role="listbox"]',
  ].join(", ")
  const dropdownItem = [
    ".t-dropdown__item",
    ".yb-dropdown__item",
    '[role="menuitem"]',
    '[role="option"]',
  ].join(", ")
  const conversationMenuTrigger = [
    '[aria-haspopup="menu"]',
    '[aria-haspopup="listbox"]',
    ".icon-yb-ic_ellipsis",
    ".icon-yb-ic_more_vert",
    ".icon-yb-ic_more_vert_16",
    ".icon-yb-ic_delete",
    ".icon-yb-ic_delete_16",
    ".icon-yb-ic_delete_20",
    ".icon-more",
    ".icon-del",
    ".icon-delete",
    ".icon-menu",
    "button",
    '[role="button"]',
  ].join(", ")
  const dialog = '.t-dialog, [role="dialog"]'
  const dialogButton = [
    ".t-dialog button",
    '.t-dialog [role="button"]',
    '[role="dialog"] button',
    '[role="dialog"] [role="button"]',
  ].join(", ")

  const splitPane = ".agent-dialogue__content-split-pane--show"
  const layoutScope = [".yb-layout__content", ".yb-layout__content-skeleton", splitPane].join(", ")
  const chatColumnScope = [`${splitPane} > .Pane1`, ".agent-dialogue__content--common"].join(", ")
  const canvasPane = `${splitPane} > .Pane2:has(#yuanbao-canvas-container)`
  const chatContent = ".agent-dialogue__content--common__content"
  const widthMaxVar = "--hunyuan-chat-list-max-width"
  const widthVar = "--hunyuan-chat-list-width"

  const genericControls = "button, [role='button'], svg"
  const userTextDecoration = `.gh-user-query-markdown, ${genericControls}, input, label`
  const assistantExportDecoration = [
    assistantDecoration,
    assistantToolbar,
    assistantGeneratedImageCard,
    genericControls,
  ].join(", ")
  const cleanTextDecoration = [
    ".gh-user-query-markdown",
    genericControls,
    "[aria-hidden='true']",
    "style",
    "script",
  ].join(", ")
  const assistantPlainTextDecoration = [
    assistantDecoration,
    assistantToolbar,
    genericControls,
  ].join(", ")
  const thoughtDecoration = `${assistantToolbar}, ${genericControls}, [aria-hidden='true']`

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.YUANBAO]],
    selectors: {
      textarea: [textarea],
      submitButton: [submitButton],
      responseContainer,
      chatContent: [userMessage, assistantMessage],
      userQuery: userMessage,
      assistantResponse: assistantMessage,
      newChatButton: [newChatButton],
      stopButton: [stopButton],
      scrollContainer: [responseScroll, responseContainer, "#chat-content"],
      sidebarScrollContainer,
    },
    input: { mode: "contenteditable", submitKey: "Enter" },
    conversation: {
      itemSelector: conversationItem,
      idFrom: { attr: "dt-cid", regex: "^(.+)$" },
      titleSelector: conversationTitle,
      urlTemplate: "/chat/{id}",
      activeMatch: ".active",
      navigationStrategy: "click-item",
      shadow: false,
    },
    generating: { existsSelectors: [stopButton] },
    networkMonitor: {
      urlPatterns: ["/api/chat/"],
      silenceThreshold: 2000,
    },
    modelSwitcher: {
      selectorButtonSelectors: [modelButton, modelText],
      menuItemSelector: modelMenuItem,
      checkInterval: 1000,
      maxAttempts: 10,
      menuRenderDelay: 200,
    },
    export: {
      userQuerySelector: userMessage,
      assistantResponseSelector: assistantMessage,
      turnSelector: null,
      useShadowDOM: false,
    },
    widthSelectors: [
      {
        selector: ":root",
        property: widthMaxVar,
        noCenter: true,
      },
      {
        selector: ":root",
        property: widthVar,
        value: `min(100%, var(${widthMaxVar}))`,
        noCenter: true,
      },
    ],
    zenMode: {
      hide: [".yb-nav__content-wrapper", ".yb-nav-fixed.yb-nav-fixed--pc-ctx"],
      styles: [
        {
          selector: ".agent-dialogue__content--common__input-box",
          property: "padding-bottom",
          value: "0",
        },
        {
          selector:
            ".yb-nav--push.yb-nav--open~.yb-layout__content, .yb-nav--push.yb-nav--open~.yb-layout__content-skeleton",
          property: "margin-left",
          value: "0",
        },
      ],
    },
    cleanMode: {
      hide: [".agent-dialogue__content-copyright", ".yb__pc_download", ".agent-dialogue__tool"],
    },
    sitePrivateSelectors: {
      inputContainer,
      primarySubmitButton,
      conversationPinned,
      conversationFallbackId: "[data-item-id]",
      agentId: [`${conversationItem}[dt-agent-id]`, "[dt-agent-id]"],
      userText,
      assistantMarkdown,
      userAttachmentImage,
      userAttachmentFile,
      userImageContainer: ".hyc-component-multi-modal__image, .hyc-content-img",
      assistantGeneratedImage,
      thoughtMarkdown,
      thoughtContainer,
      assistantReasonerBody,
      dropdownMenu,
      dropdownItem,
      conversationMenuTrigger,
      dialog,
      dialogButton,
      layoutScope,
      chatColumnScope,
      canvasPane,
      chatContent,
      userTextDecoration,
      assistantExportDecoration,
      cleanTextDecoration,
      assistantPlainTextDecoration,
      headingDecoration: genericControls,
      thoughtDecoration,
      assistantSpeechText: ".agent-chat__speech-text",
      bubbleContent: ".agent-chat__bubble__content",
      assetCard: "[data-card-url]",
      conversationActionExclusion: ".t-checkbox, [role='checkbox']",
      conversationActionIcon: ".iconfont-yb, .yb-icon, svg",
      sendIcon: "span.icon-send, .icon-send",
      stopIcon: "rect",
    },
  }
}

export const YUANBAO_CONFIG = createYuanbaoConfig()
