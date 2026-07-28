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

interface ImaSiteSelectors extends SitePackSelectors {
  textarea: string[]
  responseContainer: string
  chatContent: string[]
  userQuery: string
  assistantResponse: string
  newChatButton: string[]
  stopButton: string[]
}

type ImaPrivateSelectors = SitePrivateSelectors & {
  scrollContainer: string
  userText: string
  assistantBubble: string
  assistantMarkdown: string
  assistantBubbleFallback: string
  thinking: string
  thinkingTitle: string
  inlineReference: string
  exportDecoration: string
  userAttachmentImages: string
  userAttachmentFiles: string[]
  userAttachmentImageCard: string
  assistantGeneratedImages: string
  assistantGeneratedImageCards: string
  tagTextarea: string
  chatInputContainer: string
  inputScope: string
  submitButton: string
  submitDisabled: string
  stopButtonChildren: string[]
  activeHistoryTitle: string
  sidebarScrollContainer: string
  modelText: string
  pageContent: string
  mainArea: string
  newChatContent: string
  chatPageInputContainer: string
  editorContainer: string
  userQueryWidth: string
}

export interface ImaSiteConfig extends BuiltinSiteConfig {
  selectors: ImaSiteSelectors
  input: SitePackInputConfig
  generating: SitePackGeneratingConfig
  networkMonitor: NetworkMonitorConfig
  modelSwitcher: Omit<ModelSwitcherConfig, "targetModelKeyword">
  export: ExportConfig
  zenMode: ZenModeConfig
  cleanMode: ZenModeConfig
  widthSelectors: Omit<WidthSelectorConfig, "transformValue">[]
  sitePrivateSelectors: ImaPrivateSelectors
}

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const IMA_CONFIG_VERSION = 1

const createImaConfig = (): ImaSiteConfig => {
  const scrollContainer = "#scrollContainer"
  const responseContainer = `${scrollContainer} [class*="scrollWrap"]`
  const legacyUserBubbleContainer = 'div[class*="userBubbleContainer"]'
  const userBubbleWrap = 'div[class*="userBubbleWrap"]'
  const userQuery = [legacyUserBubbleContainer, userBubbleWrap].join(", ")
  const legacyUserBubble = `${legacyUserBubbleContainer} [class*="userBubble"]`
  const userMainBubble = '[class*="chatMainBubble"]'
  const userBubble = [legacyUserBubble, `${userBubbleWrap} ${userMainBubble}`].join(", ")
  const userText = [`${legacyUserBubble} [class*="content"]`, userMainBubble].join(", ")
  const assistantResponse = 'div[class*="aiContainer"]'
  const assistantBubble = `${assistantResponse} [class*="bubble"]`
  const markdownContent = '[class*="markdown"]'
  const assistantMarkdown = `${assistantBubble} ${markdownContent}`
  const thinking = '[class*="thinking"]'
  const thinkingTitle = '[class*="tipsWrap"], [class*="thinkingTitle"], [class*="thinkingHeader"]'
  const inlineReference =
    '.system-copy-exclude, [x-noteelement="excluded"], [x-copyelement="copy-exclude"]'
  const exportDecoration = [
    ".gh-root",
    ".gh-user-query-markdown",
    ".gh-inline-bookmark",
    inlineReference,
    "button",
    "[role='button']",
    "svg",
    "[aria-hidden='true']",
    "style",
    "script",
  ].join(", ")
  const userAttachmentContainer = '[class*="attachmentContainer"], [class*="attachmentWrap"]'
  const userAttachmentScope = `:is(${userAttachmentContainer})`
  const userAttachmentImages = [`${userAttachmentScope} img`, '[class*="imgWrap"] img'].join(", ")
  const userAttachmentFiles = [
    `${userAttachmentScope} [class*="itemWrap"]`,
    `${userAttachmentScope} [class*="file"]`,
    `${userAttachmentScope} [class*="doc"]`,
    `${userAttachmentScope} a[href]`,
    `${userAttachmentScope} [data-file-id]`,
    `${userAttachmentScope} [data-doc-id]`,
    `${userAttachmentScope} [data-resource-id]`,
  ]
  const assistantGeneratedImages = [
    `${assistantBubble} [class*="imagesWrapper"] img`,
    `${assistantBubble} [id^="image-toolkit-"] img`,
    `${assistantBubble} [class*="bigImg"] img`,
    `${assistantBubble} ${markdownContent} img`,
  ].join(", ")
  const assistantGeneratedImageCards = [
    '[class*="imagesWrapper"]',
    '[id^="image-toolkit-"]',
    ".t-image__wrapper",
    "picture",
    "img",
  ].join(", ")
  const input =
    '#tagTextarea [contenteditable="true"], [class*="chatInputContainer"] .tiptap.ProseMirror'
  const submitButton = '[class*="sendBtnWrap"]'
  const submitDisabled = '.icon-send-disable-big, [class*="sendDisableIcon"]'
  const stopButtonContainer = 'div[class*="stopButton"], [class*="stopButton"]'
  const stopButton = [
    'div[class*="stopButton"] > div',
    '[class*="stopButton"][role="button"]',
    'button[class*="stopButton"]',
    '[class*="stopButton"]',
  ].join(", ")
  const newChatButton = '[class*="newChatWrap"]'
  const modelText = '[class*="modelSelectionText"]'
  const pageContent = ".expandable-sidebar-panel-sidebar ~ [class*='_content_']"
  const chatInputContainer = '[class*="chatInputContainer"]'
  const newChatContainer =
    '[class*="mainContainer"] > [class*="container"]:has(> [class*="centerContent"])'

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.IMA]],
    selectors: {
      textarea: [input],
      responseContainer,
      chatContent: [userQuery, assistantResponse],
      userQuery,
      assistantResponse,
      newChatButton: [newChatButton],
      stopButton: [stopButton],
    },
    input: { mode: "contenteditable", submitKey: "Enter" },
    generating: { existsSelectors: [stopButtonContainer] },
    networkMonitor: {
      urlPatterns: ["/cgi-bin/assistant/qa"],
      urlPathEndsWith: ["/cgi-bin/assistant/qa"],
      silenceThreshold: 2000,
    },
    modelSwitcher: {
      selectorButtonSelectors: [
        '[class*="currentChoiceWrap"]',
        '[class*="modelSelectionWrap"]',
        modelText,
      ],
      menuItemSelector:
        '.modelDropdown .t-dropdown__item, .modelDropdown [class*="modelOption"], .t-popup .modelDropdown .t-dropdown__item',
      menuRenderDelay: 200,
      checkInterval: 1000,
      maxAttempts: 10,
    },
    export: {
      userQuerySelector: userQuery,
      assistantResponseSelector: assistantResponse,
      turnSelector: null,
      useShadowDOM: false,
    },
    zenMode: { hide: [".expandable-sidebar-panel-sidebar"] },
    cleanMode: {
      hide: [
        '[class*="_downloadContainer_"]',
        '[class*="footTips"]',
        '[class*="_activityBanner"]',
        '[class*="_activityBannerContent"]',
        '[class*="_qaDownloadGuide"]',
      ],
    },
    widthSelectors: [
      {
        selector: scrollContainer,
        property: "max-width",
        extraCss: "width: 100% !important;",
        noCenter: true,
      },
      {
        selector: responseContainer,
        property: "max-width",
        extraCss: "width: 100% !important;",
        noCenter: true,
      },
      {
        selector: '[class*="_chatInputContainer_"] [class*="_editorContainer_"]',
        property: "max-width",
        extraCss: "width: 100vw !important; margin: 0 auto;",
      },
    ],
    sitePrivateSelectors: {
      scrollContainer,
      userText,
      assistantBubble,
      assistantMarkdown,
      assistantBubbleFallback: '[class*="bubble"]',
      thinking,
      thinkingTitle,
      inlineReference,
      exportDecoration,
      userAttachmentImages,
      userAttachmentFiles,
      userAttachmentImageCard: '[class*="imgWrap"], [id^="image-toolkit-"]',
      assistantGeneratedImages,
      assistantGeneratedImageCards,
      tagTextarea: "#tagTextarea",
      chatInputContainer,
      inputScope: `#tagTextarea, ${chatInputContainer}`,
      submitButton,
      submitDisabled,
      stopButtonChildren: [":scope > div", '[class*="container"]'],
      activeHistoryTitle:
        '[class*="historyListWrap"] [class*="itemWrap"][class*="highLight"] [class*="main"]',
      sidebarScrollContainer: "#HistoryScrollContainer",
      modelText,
      pageContent,
      mainArea: '[class*="mainArea"]',
      newChatContent: `${pageContent} ${newChatContainer}`,
      chatPageInputContainer: `body:not(:has([class*="centerContent"])) ${chatInputContainer}`,
      editorContainer: `${chatInputContainer} [class*="editorContainer"]`,
      userQueryWidth: userBubble,
    },
  }
}

export const IMA_CONFIG = createImaConfig()
