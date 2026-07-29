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

interface QianwenSiteSelectors extends SitePackSelectors {
  textarea: string[]
  submitButton: string[]
  responseContainer: string
  chatContent: string[]
  userQuery: string
  assistantResponse: string
  newChatButton: string[]
  stopButton: string[]
}

type QianwenPrivateSelectors = SitePrivateSelectors & {
  chatInput: string
  slateEditor: string
  submitButtonCandidates: string
  submitButtonClickable: string
  messageList: string
  messageListArea: string
  scrollRootCandidates: string[]
  scrollContent: string
  questionCard: string
  questionTextCard: string
  bubble: string
  turn: string
  userTextCard: string
  userImageCard: string
  userFileCard: string
  attachmentImage: string
  assistantContent: string
  assistantGeneratedImage: string
  assistantExportDecoration: string
  userTextDecoration: string
  cleanTextDecoration: string
  thinking: string
  thinkingContent: string
  thinkingDecoration: string
  assistantPlainTextDecoration: string
  chatLayoutScope: string
  canvasLayoutScope: string
  canvasPanel: string
  chatContent: string
  messageCenter: string
  sidebar: string
  modelDialog: string
  modelTrigger: string
  modelExpandToggle: string
  markdownFixerParagraph: string
}

export interface QianwenSiteConfig extends BuiltinSiteConfig {
  selectors: QianwenSiteSelectors
  input: SitePackInputConfig
  generating: SitePackGeneratingConfig
  networkMonitor: NetworkMonitorConfig
  modelSwitcher: Omit<ModelSwitcherConfig, "targetModelKeyword">
  export: ExportConfig
  widthSelectors: Omit<WidthSelectorConfig, "transformValue">[]
  zenMode: ZenModeConfig
  cleanMode: ZenModeConfig
  sitePrivateSelectors: QianwenPrivateSelectors
}

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const QIANWEN_CONFIG_VERSION = 1

const createQianwenConfig = (): QianwenSiteConfig => {
  const questionItem =
    '[class*="questionItem"], .chat-question-wrap, [class*="message-select-wrapper-question"]'
  const questionLayout = '[class*="questionItem"], .chat-question-wrap'
  const questionCard = "[data-chat-question-wrap]"
  const answerItem = '[class*="answerItem"], [data-chat-answers-wrap], .chat-answers-card-wrap'
  const bubble = '[class*="bubble"]'
  const questionCardInner = [
    `${questionCard} .message-card-wrap.question`,
    `${questionCard} .question-text-card`,
  ].join(", ")
  const userCard = ".message-card-wrap.question"
  const userTextCard = ".question-text-card"
  const userImageCard = `${userCard}[data-mt*="image"]`
  const userFileCard = [
    `${userCard}[data-mt*="doc"]`,
    `${userCard}[data-mt*="file"]`,
    `${userCard}[data-mt*="office"]`,
    `${userCard}:has([class*="office-card"])`,
  ].join(", ")
  const assistantContent = [
    ".answer-common-card .qk-markdown",
    ".markdown-pc-special-class .qk-markdown",
    "#qk-markdown-react",
    ".answer-common-card",
  ].join(", ")
  const assistantGeneratedImage = [
    '[data-card-type="ai_generate_image_list"] img',
    ".card_card_ai_generate_image img",
    '[data-tpl*="card_ai_generate_image"] img',
    'img[data-image-menu-items*="download"]',
    'img[class*="image-"][data-image-resource-id]',
  ].join(", ")
  const assistantGeneratedImageCard = [
    '[data-card-type="ai_generate_image_list"]',
    ".card_card_ai_generate_image",
    '[data-tpl*="card_ai_generate_image"]',
  ].join(", ")
  const exportDecoration = [
    ".gh-root",
    ".gh-user-query-markdown",
    "button",
    "[role='button']",
    "svg",
    "[aria-hidden='true']",
    ".qk-md-table-action",
    ".qk-md-copy-icon",
    "[class*='answerToolsContent']",
    "[class*='functionArea']",
    "[class*='recommend-query']",
    ".q-item",
    ".qs-bottom",
    "style",
    "script",
  ].join(", ")
  const chatInput = [
    '[class*="chatInput"]',
    '[data-chat-input-shell="true"]',
    '[data-qw-chat-input-position="chat"]',
  ].join(", ")
  const chatTextarea = '[class*="chatTextarea"]'
  const slateEditor = '[data-slate-editor="true"]'
  const messageList = ".message-list-scroll-container, #message-list-scroller"
  const messageListArea = "#qwen-message-list-area"
  const responseContainer = `${messageListArea}, ${messageList}`
  const chatLayoutScope = "#qianwen-left-panel"
  const canvasLayoutScope = ".splitCardContainer:has(#qianwen-left-panel)"
  const canvasPanel = [
    `${canvasLayoutScope} > div:has([data-log-params*="canvas_panel"])`,
    `${canvasLayoutScope} > div:has(.monaco-editor)`,
    `${canvasLayoutScope} > div:has([data-preview-list="true"])`,
  ].join(", ")
  const chatContent = "#qw-chat-content"
  const chatInputWidth = '[data-text-area-width-container="true"], [class*="inputMotionCarrier"]'
  const messageCenter = "#pc-center-wrapper, [class*='auto-center-wrapper']"
  const pageScrollContainer = [
    '[class*="page-content-"]',
    '[class*="pageContent"]',
    chatContent,
    '[class*="scrollOutWrapper"]',
  ].join(", ")
  const sidebar = "aside#new-nav-tab-wrapper"
  const thinking =
    '.qc-thinking-header, [class*="thinkingWrap"], [class*="thinkingContent"], [class*="thinkingHeader"], [class*="thinkingTitle"]'
  const stopButton = '[class*="stop-"], [class*="stopBtn"], div[class*="stop"]'
  const modelDialog = '[role="dialog"], [data-radix-popper-content-wrapper]'
  const modelDialogItem = [
    '[role="dialog"] [id="tongyi-for-guide-model"]',
    '[role="dialog"] .group.rounded-8',
    '[data-radix-popper-content-wrapper] [id="tongyi-for-guide-model"]',
    "[data-radix-popper-content-wrapper] .group.rounded-8",
  ].join(", ")
  const messageListWidthVarsCss = [
    "width: 100% !important;",
    "min-width: 0 !important;",
    "--max-message-list-width: 100% !important;",
    "--min-message-list-width: 0px !important;",
  ].join(" ")
  const inputWidthCss = [
    "width: 100% !important;",
    "min-width: 0 !important;",
    "box-sizing: border-box !important;",
    "--chat-input-visible-shell-width: 100% !important;",
    "--chat-input-visible-shell-max-width: 100% !important;",
    "--chat-input-visible-shell-side-gutter: 0px !important;",
  ].join(" ")

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.QIANWEN]],
    selectors: {
      textarea: [
        chatTextarea,
        `${chatInput} [contenteditable="true"]`,
        `${slateEditor}[contenteditable="true"]`,
        'div[role="textbox"][contenteditable="true"]',
        "textarea",
      ],
      submitButton: [
        '[class*="operateBtn"]',
        '[data-icon-type="qwpcicon-sendChat"]',
        "button[type='submit']",
      ],
      responseContainer,
      chatContent: [questionItem, answerItem],
      userQuery: questionItem,
      assistantResponse: answerItem,
      newChatButton: ['[class*="newChatButton"]'],
      stopButton: [stopButton],
    },
    input: { mode: "contenteditable", submitKey: "Enter" },
    generating: { existsSelectors: [stopButton] },
    networkMonitor: {
      urlPatterns: ["api/v2/chat", "api/v1/chat/snap"],
      silenceThreshold: 2000,
    },
    modelSwitcher: {
      selectorButtonSelectors: [
        `${messageListArea} [aria-haspopup="dialog"]`,
        '[aria-haspopup="dialog"][aria-controls][data-state]',
      ],
      menuItemSelector: modelDialogItem,
      checkInterval: 1000,
      maxAttempts: 10,
      menuRenderDelay: 300,
    },
    export: {
      userQuerySelector: questionItem,
      assistantResponseSelector: answerItem,
      turnSelector: null,
      useShadowDOM: false,
    },
    widthSelectors: [
      {
        selector: '[class*="scrollOutWrapper"]',
        property: "max-width",
        extraCss: "width: 100% !important;",
        noCenter: true,
      },
      {
        selector: messageListArea,
        property: "max-width",
        extraCss: "width: 100% !important;",
        noCenter: true,
      },
      { selector: messageCenter, property: "max-width", extraCss: messageListWidthVarsCss },
      { selector: messageList, property: "--message-content-width", noCenter: true },
      { selector: chatInputWidth, property: "max-width", extraCss: inputWidthCss },
      {
        selector: '[class*="inputOutWrap"]',
        property: "max-width",
        value: "100%",
        extraCss: "width: 100% !important;",
      },
      { selector: '[class*="answerItem"] [class*="containerWrap"]', property: "max-width" },
      {
        selector: answerItem,
        property: "max-width",
        extraCss: "width: 100% !important; min-width: 0 !important;",
      },
      {
        selector: questionLayout,
        property: "width",
        extraCss: "margin-right: 0 !important",
      },
      {
        selector: questionCardInner,
        property: "width",
        value: "100%",
        extraCss: "max-width: 100% !important; box-sizing: border-box !important;",
        noCenter: true,
      },
    ],
    zenMode: { hide: [sidebar] },
    cleanMode: { hide: ["#ice-container .root-G6nVVr"] },
    sitePrivateSelectors: {
      chatInput,
      slateEditor,
      submitButtonCandidates: '[class*="operateBtn"], [data-icon-type="qwpcicon-sendChat"]',
      submitButtonClickable: '[class*="operateBtn"], button, [role="button"]',
      messageList,
      messageListArea,
      scrollRootCandidates: [messageList, messageListArea, pageScrollContainer],
      scrollContent: `${responseContainer}, ${questionItem}, ${answerItem}`,
      questionCard,
      questionTextCard: userTextCard,
      bubble,
      turn: ".chat-round[data-chat], [data-chat-list-key]",
      userTextCard,
      userImageCard,
      userFileCard,
      attachmentImage: "img",
      assistantContent,
      assistantGeneratedImage,
      assistantExportDecoration: [
        exportDecoration,
        assistantGeneratedImageCard,
        "picture",
        "img",
      ].join(", "),
      userTextDecoration:
        ".gh-user-query-markdown, button, [role='button'], svg, [aria-hidden='true']",
      cleanTextDecoration: "button, [role='button'], svg, [aria-hidden='true'], style, script",
      thinking,
      thinkingContent: '[class*="thinkingContent"]',
      thinkingDecoration:
        '[class*="thinkingTitle"], [class*="thinkingHeader"], .qc-thinking-header, button, svg, [aria-hidden="true"]',
      assistantPlainTextDecoration: `${thinking}, .qc-thinking-header, [class*="thinkingWrap"], [class*="thinkingContent"], button, [role='button'], svg, .qk-md-table-action, .qk-md-copy-icon, [aria-hidden='true'], [class*="answerToolsContent"], [class*="functionArea"]`,
      chatLayoutScope,
      canvasLayoutScope,
      canvasPanel,
      chatContent,
      messageCenter,
      sidebar,
      modelDialog,
      modelTrigger: '[aria-haspopup="dialog"][aria-controls], [aria-haspopup="dialog"][data-state]',
      modelExpandToggle: "button, div, span",
      markdownFixerParagraph: `${answerItem} .qk-md-paragraph`,
    },
  }
}

export const QIANWEN_CONFIG = createQianwenConfig()
