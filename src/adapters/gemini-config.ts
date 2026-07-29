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

interface GeminiSiteSelectors extends SitePackSelectors {
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

type GeminiPrivateSelectors = SitePrivateSelectors & {
  accountIdentity: string[]
  myStuffMediaHost: string
  myStuffMediaCard: string
  myStuffMediaCardContainer: string
  myStuffDocumentHost: string
  myStuffJslogHost: string
  myStuffTitle: string
  myStuffThumbnail: string
  deepResearchPanel: string
  canvasCodePanel: string
  canvasDocumentPanel: string
  panelToolbarActions: string
  deepResearchPanelExportButton: string
  deepResearchPanelCloseButton: string
  canvasPanelDownloadButton: string
  panelThinking: string
  panelToolbarTitle: string
  canvasPanelTitle: string
  canvasPanelCloseButton: string
  chatsExpandableSection: string
  chatsExpandableSectionFallback: string
  chatsExpandableSectionHost: string
  conversationList: string
  historyLoadingSpinner: string
  conversationAnchor: string
  conversationPinnedIcon: string
  conversationActiveTitle: string
  shareTitle: string
  conversationActionButton: string
  conversationMoreIcon: string
  conversationDeleteIcon: string
  conversationMenuAction: string
  conversationMenuContainer: string
  conversationConfirmButton: string
  conversationDialog: string
  shareResponseContainer: string
  markdownFixerParagraph: string
  markdownFixerSource: string[]
  validTextarea: string
  visuallyHidden: string
  userQueryText: string
  userQueryLine: string
  exportMessageSource: string
  immersivePanel: string
  exportImageScope: string[]
  userQueryImage: string[]
  uploadedFile: string
  sharePage: string
  shareTurn: string
  shareAssistantMarkdown: string
  assistantExportNoise: string[]
  decorativeImage: string[]
  generatedImageControls: string[]
  generatedImageButton: string
  driveViewer: string
  driveViewerOwner: string
  driveViewerTextContent: string
  driveViewerError: string
  driveViewerTextCandidate: string
  driveViewerName: string
  driveActiveItemInfo: string
  driveViewerCloseButton: string
  uploadedFileName: string[]
  uploadedFileAriaAction: string
  uploadedFileType: string
  uploadedFileIcon: string
  deepResearchDocumentShare: string
  deepResearchArtifactShare: string
  deepResearchConfirmation: string
  deepResearchPanelMarkdown: string[]
  deepResearchAppDocumentMarkdown: string[]
  deepResearchAppTrigger: string
  deepResearchIcon: string[]
  deepResearchConfirmationTitle: string
  deepResearchConfirmationSteps: string
  deepResearchStepDescription: string
  deepResearchStepTitle: string
  canvasCodeIcon: string[]
  canvasDocumentIcon: string[]
  canvasCard: string
  canvasShareArtifact: string
  canvasArtifactContainer: string
  canvasEntryChip: string
  canvasCodeTab: string
  canvasTabGroup: string
  canvasTabToggle: string
  canvasCodeBlock: string
  canvasCodeEditor: string
  canvasDocumentMarkdown: string[]
  canvasTabButton: string
  canvasTabRadio: string
  canvasTabSelected: string
  canvasHidden: string
  canvasCodeContent: string
  canvasMonacoEditor: string
  canvasMonacoTextarea: string
  canvasMonacoScrollable: string
  canvasMonacoLine: string
  canvasMonacoContentHeight: string
  canvasTitle: string
  canvasNestedTitle: string
  canvasCodeLanguage: string
  canvasMode: string
  outlineMessageContent: string
  outlineUserMetadataButton: string
  outlineAssistantMarkdown: string
  outlineThoughts: string
  modelName: string
  layoutScope: string
  immersiveLayout: string
  chatColumnScope: string
  messageSafeArea: string
  inputSafeArea: string
  newChatInputSafeArea: string
  userQueryWidth: string
}

export interface GeminiSiteConfig extends BuiltinSiteConfig {
  selectors: GeminiSiteSelectors
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
  sitePrivateSelectors: GeminiPrivateSelectors
}

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const GEMINI_CONFIG_VERSION = 1

const createGeminiConfig = (): GeminiSiteConfig => {
  const userQuery = "user-query"
  const assistantResponse = "model-response"
  const responseContainer = "infinite-scroller.chat-history"
  const shareResponseContainer = "div.content-container"
  const conversationItem = 'gem-nav-list-item[data-test-id="conversation"]'
  const conversationList = 'conversations-list[data-test-id="all-conversations"]'
  const conversationTitle = ".title-text"
  const immersivePanel = "immersive-panel"
  const sharePage = "share-landing-page"
  const visuallyHidden = ".cdk-visually-hidden"
  const canvasCard = '[data-test-id="gem-processing-card"]'
  const canvasEntryChip = "immersive-entry-chip"
  const deepResearchPanel = "immersive-panel deep-research-immersive-panel"
  const canvasCodePanel = "immersive-panel code-immersive-panel"
  const canvasDocumentPanel = "immersive-panel extended-response-panel:has(canvas-create-button)"
  const shareAssistantMarkdown = "message-content .markdown"
  const deepResearchDocumentShare = `${sharePage} immersive-share-landing-page structured-content-container[data-test-id="deep-research-block"]`
  const deepResearchArtifactShare = `${sharePage} structured-content-container[data-test-id="immersive-artifact-content"]`
  const canvasArtifactContainer = ".immersive-artifact-container"
  const canvasCodeBlock = "code-block"
  const canvasCodeEditor = 'xap-code-editor[data-test-id="code-editor"]'
  const messageWidth = ".conversation-container"
  const inputWidth = ".input-area-container"
  const layoutScope = "bard-sidenav-content, body:not(:has(bard-sidenav-content)) main.chat-app"
  const markdownFixerSourceAttributeKeywords = [
    "source",
    "sources",
    "citation",
    "citations",
    "reference",
    "references",
    "grounding",
    "footnote",
    "link",
    "fonte",
    "fontes",
    "fuente",
    "fuentes",
    "quelle",
    "quellen",
    "referencia",
    "referencias",
    "referência",
    "referências",
    "riferimento",
    "riferimenti",
    "来源",
    "引用",
    "链接",
    "出典",
    "参照",
    "출처",
    "참조",
    "источник",
    "источники",
    "ссылка",
    "ссылки",
  ]

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.GEMINI]],
    selectors: {
      textarea: [
        'div[contenteditable="true"].ql-editor',
        'div[contenteditable="true"]',
        '[role="textbox"]',
        '[aria-label*="Enter a prompt"]',
      ],
      submitButton: [
        'button[aria-label*="Send"]',
        'button[aria-label*="发送"]',
        ".send-button",
        '[data-testid*="send"]',
      ],
      responseContainer,
      chatContent: [
        ".model-response-container",
        assistantResponse,
        ".response-container",
        "[data-message-id]",
        "message-content",
      ],
      userQuery,
      assistantResponse,
      newChatButton: [
        'gem-nav-list-item[data-test-id="new-chat-button"] a',
        '[aria-label="New chat"]',
        '[aria-label="新对话"]',
        '[aria-label="发起新对话"]',
        '[data-testid="new-chat-button"]',
        '[data-test-id="new-chat-button"]',
        '[data-test-id="expanded-button"]',
        '[data-test-id="temp-chat-button"]',
        'button[aria-label="临时对话"]',
      ],
      stopButton: ['button:has(mat-icon[fonticon="stop"])', 'mat-icon[fonticon="stop"]'],
      scrollContainer: [responseContainer],
      sidebarScrollContainer: conversationList,
    },
    input: { mode: "contenteditable", submitKey: "Enter" },
    conversation: {
      itemSelector: conversationItem,
      idFrom: { attr: "jslog", regex: '\\["c_([^"]+)"' },
      titleSelector: conversationTitle,
      urlTemplate: "/app/{id}",
      activeMatch: "a.mdc-list-item--activated",
      navigationStrategy: "click-item",
      shadow: false,
    },
    generating: {
      existsSelectors: ['mat-icon[fonticon="stop"]'],
    },
    networkMonitor: {
      urlPatterns: ["BardFrontendService", "StreamGenerate"],
      silenceThreshold: 3000,
    },
    modelSwitcher: {
      selectorButtonSelectors: [
        ".input-area-switch-label",
        ".model-selector",
        '[data-test-id="model-selector"]',
        '[aria-label*="model"]',
        'button[aria-haspopup="menu"]',
      ],
      menuItemSelector: '.mode-title, [role="menuitem"], [role="option"]',
      checkInterval: 1000,
      maxAttempts: 15,
      menuRenderDelay: 300,
    },
    export: {
      userQuerySelector: userQuery,
      assistantResponseSelector: `${assistantResponse}, .model-response-container .markdown`,
      turnSelector: ".conversation-turn",
      useShadowDOM: false,
    },
    widthSelectors: [
      {
        selector: messageWidth,
        property: "max-width",
        extraCss: "width: 100% !important; min-width: 0 !important;",
      },
      {
        selector: inputWidth,
        property: "max-width",
        extraCss: "width: 100% !important; min-width: 0 !important;",
      },
      {
        selector: ".table-block.new-table-style",
        property: "max-width",
        value: "100%",
        noCenter: true,
        extraCss: "width: 100% !important;",
      },
      {
        selector: userQuery,
        property: "max-width",
        value: "100%",
        noCenter: true,
        extraCss: "display: flex !important; justify-content: flex-end !important;",
      },
      {
        selector: ".user-query-container",
        property: "max-width",
        value: "100%",
        noCenter: true,
        extraCss: "justify-content: flex-end !important;",
      },
    ],
    zenMode: {
      hide: ["bard-sidenav", "div.sidenav-with-history-container"],
    },
    cleanMode: {
      hide: [
        "hallucination-disclaimer",
        "g1-dynamic-upsell-button",
        ".share-viewer_footer_disclaimer",
        'share-landing-page immersive-share-landing-page .page:has(structured-content-container[data-test-id="deep-research-block"]) > .footer',
      ],
    },
    mermaidSupport: "fallback",
    quickQuote: "enabled",
    supportsHostThemeSync: true,
    sitePrivateSelectors: {
      accountIdentity: [
        "[data-email]",
        '[data-identifier*="@"]',
        '[aria-label*="@"]',
        '[title*="@"]',
      ],
      myStuffMediaHost: "library-item-card",
      myStuffMediaCard: ".library-item-card",
      myStuffMediaCardContainer: ".library-item-card-container",
      myStuffDocumentHost: "library-list-item",
      myStuffJslogHost: "[jslog]",
      myStuffTitle: ".title, .gds-title-m, .text-content .title",
      myStuffThumbnail: "img",
      deepResearchPanel,
      canvasCodePanel,
      canvasDocumentPanel,
      panelToolbarActions: "toolbar .action-buttons",
      deepResearchPanelExportButton: '[data-test-id="export-menu-button"]',
      deepResearchPanelCloseButton: `${deepResearchPanel} [data-test-id="close-button"], ${immersivePanel} [data-test-id="close-button"]`,
      canvasPanelDownloadButton: '[data-test-id="download-preview-button"]',
      panelThinking: "thinking-panel",
      panelToolbarTitle: "toolbar h2.title-text",
      canvasPanelTitle: "toolbar h2.title-text, .title-text",
      canvasPanelCloseButton: 'toolbar [data-test-id="close-button"]',
      chatsExpandableSection: 'expandable-section[data-test-id="chats-expandable-section"]',
      chatsExpandableSectionFallback: 'expandable-section[storagekey="chats"]',
      chatsExpandableSectionHost: "expandable-section",
      conversationList,
      historyLoadingSpinner: '[data-test-id="loading-history-spinner"]',
      conversationAnchor: "a",
      conversationPinnedIcon: 'mat-icon[fonticon="push_pin"]',
      conversationActiveTitle: `a.mdc-list-item--activated ${conversationTitle}`,
      shareTitle: "h1.headline, h1[class*='headline']",
      conversationActionButton: [
        'button[aria-haspopup="menu"]',
        'button[aria-label*="More"]',
        'button[aria-label*="more"]',
        'button[aria-label*="更多"]',
        'button[aria-label*="选项"]',
        'button[title*="More"]',
        'button[title*="more"]',
        'button[data-test-id*="menu"]',
        'button[data-testid*="menu"]',
        "button",
      ].join(", "),
      conversationMoreIcon: 'mat-icon[fonticon="more_vert"], mat-icon[fonticon="more_horiz"]',
      conversationDeleteIcon: 'mat-icon[fonticon="delete"], mat-icon[data-mat-icon-name="delete"]',
      conversationMenuAction: '[role="menuitem"], [role="menu"] button, .mat-mdc-menu-panel button',
      conversationMenuContainer: '[role="menu"], .mat-mdc-menu-panel, .mat-menu-panel',
      conversationConfirmButton:
        'button[data-test-id="confirm-button"], button[data-testid="confirm-button"]',
      conversationDialog: '[role="dialog"], mat-dialog-container, .mat-mdc-dialog-container',
      shareResponseContainer,
      markdownFixerParagraph: "message-content p",
      markdownFixerSource: [
        [
          "source-chip",
          "source-card",
          "source-footnote",
          "citation-source",
          "citation-chip",
          "citation-marker",
          "grounding-chip",
          "grounding-source",
          "web-source",
          "[data-source]",
          "[data-source-id]",
          "[data-citation]",
          "[data-citation-id]",
          "[data-ved]",
          "[decode-data-ved]",
        ].join(", "),
        [
          "[cdkoverlayorigin]",
          "[mattooltip]",
          "[data-mdc-tooltip]",
          "mat-icon[fonticon]",
          "mat-icon[data-mat-icon-name]",
          "[fonticon*='link' i]",
          "[data-mat-icon-name*='link' i]",
          "sup a",
          "sup button",
          "sup [role='button']",
        ].join(", "),
        ...markdownFixerSourceAttributeKeywords.map((keyword) =>
          [
            `[aria-label*='${keyword}' i]`,
            `[title*='${keyword}' i]`,
            `[data-test-id*='${keyword}' i]`,
          ].join(", "),
        ),
      ],
      validTextarea: '[contenteditable="true"], [role="textbox"], .ql-editor',
      visuallyHidden,
      userQueryText: ".query-text",
      userQueryLine: ".query-text-line",
      exportMessageSource: "message-content, .conversation-turn",
      immersivePanel,
      exportImageScope: [
        ".attachment-container.generated-images",
        "response-element",
        "generated-image",
        "single-image.generated-image",
        ".image-container.replace-fife-images-at-export",
        "[data-image-attachment-index]",
      ],
      userQueryImage: ["img[data-test-id='uploaded-img']", ".preview-image"],
      uploadedFile: '[data-test-id="uploaded-file"]',
      sharePage,
      shareTurn: `${sharePage} .share-turn-viewer`,
      shareAssistantMarkdown,
      assistantExportNoise: [
        visuallyHidden,
        "model-thoughts",
        canvasEntryChip,
        "gem-processing-card",
        canvasCard,
        '[data-test-id="time-estimation-message"]',
        ".time-estimation-message",
        "source-footnote",
        "sources-carousel-inline",
        "sources-carousel",
        "mat-icon",
        "share-button",
        "copy-button",
        "download-generated-image-button",
        ".generated-image-controls",
        ".loader",
      ],
      decorativeImage: [
        "img.katex-svg",
        "img.favicon",
        "img.google-icon",
        'img[data-test-id="favicon"]',
        'img[data-test-id="file-icon"]',
        'img[data-test-id="luminous-file-icon"]',
        'img[src*="faviconV2"]',
        'img[src*="drive-thirdparty.googleusercontent.com/32/type/"]',
        'img[src*="google_logo_icon"]',
      ],
      generatedImageControls: [
        "share-button",
        "copy-button",
        "download-generated-image-button",
        ".generated-image-controls",
        ".loader",
      ],
      generatedImageButton: "button.image-button",
      driveViewer: `${immersivePanel} .drive-viewer`,
      driveViewerOwner: ".drive-viewer",
      driveViewerTextContent: ".drive-viewer-text-content",
      driveViewerError: ".drive-viewer-msg-error",
      driveViewerTextCandidate: ".drive-viewer-text-content pre, .drive-viewer-text-content",
      driveViewerName: ".drive-viewer-toolstrip-name",
      driveActiveItemInfo: '[id="drive-active-item-info"], div[style*="display:none"]',
      driveViewerCloseButton: ".drive-viewer-close-button",
      uploadedFileName: ['[data-test-id="filename-label"]', ".filename-label", ".new-file-name"],
      uploadedFileAriaAction: "a[aria-label], button[aria-label]",
      uploadedFileType: ".new-file-type",
      uploadedFileIcon: '[data-test-id="luminous-file-icon"]',
      deepResearchDocumentShare,
      deepResearchArtifactShare,
      deepResearchConfirmation: "deep-research-confirmation-widget",
      deepResearchPanelMarkdown: ["#extended-response-markdown-content", shareAssistantMarkdown],
      deepResearchAppDocumentMarkdown: [
        `${deepResearchPanel} #extended-response-markdown-content`,
        `${deepResearchPanel} ${shareAssistantMarkdown}`,
      ],
      deepResearchAppTrigger: `${assistantResponse} ${canvasCard}, ${assistantResponse} ${canvasEntryChip}`,
      deepResearchIcon: [
        'mat-icon[data-mat-icon-name="travel_explore"]',
        'mat-icon[fonticon="travel_explore"]',
      ],
      deepResearchConfirmationTitle: '[data-test-id="title"]',
      deepResearchConfirmationSteps: '[data-test-id="research-steps"] .research-step',
      deepResearchStepDescription: ".research-step-description",
      deepResearchStepTitle: ".research-step-title",
      canvasCodeIcon: [
        'mat-icon[fonticon="code_blocks"]',
        'mat-icon[data-mat-icon-name="code_blocks"]',
      ],
      canvasDocumentIcon: [
        'mat-icon[fonticon="article"]',
        'mat-icon[data-mat-icon-name="article"]',
      ],
      canvasCard,
      canvasShareArtifact: `${sharePage} ${canvasArtifactContainer}`,
      canvasArtifactContainer,
      canvasEntryChip,
      canvasCodeTab: 'mat-button-toggle[value="code"]',
      canvasTabGroup: "mat-button-toggle-group.tab-group",
      canvasTabToggle: "mat-button-toggle",
      canvasCodeBlock,
      canvasCodeEditor,
      canvasDocumentMarkdown: [
        "#extended-response-markdown-content .ProseMirror",
        'immersive-editor[data-test-id="immersive-editor"] .ProseMirror',
        "immersive-editor .ProseMirror",
        "#extended-response-markdown-content",
      ],
      canvasTabButton: "button",
      canvasTabRadio: "button[role='radio']",
      canvasTabSelected: ".mat-button-toggle-checked",
      canvasHidden: ".hidden",
      canvasCodeContent: '[data-test-id="code-content"], pre code, code',
      canvasMonacoEditor: ".monaco-editor",
      canvasMonacoTextarea: "textarea.inputarea",
      canvasMonacoScrollable: ".monaco-scrollable-element",
      canvasMonacoLine: ".view-lines .view-line",
      canvasMonacoContentHeight: ".view-lines, .margin, .lines-content",
      canvasTitle: ".title-text, .card-title",
      canvasNestedTitle: ".title-text",
      canvasCodeLanguage: ".code-block-decoration span",
      canvasMode: "[data-mode-id]",
      outlineMessageContent: "message-content",
      outlineUserMetadataButton: 'button[jslog*="BardVeMetadataKey"]',
      outlineAssistantMarkdown: ".model-response-text, message-content",
      outlineThoughts: "model-thoughts",
      modelName: ".input-area-switch-label",
      layoutScope,
      immersiveLayout: "chat-window.immersives-mode:not(.mobile-device)",
      chatColumnScope: "chat-window .chat-container",
      messageSafeArea: responseContainer,
      inputSafeArea: "input-container",
      newChatInputSafeArea: "chat-window.center-input-layout .input-area-container.is-zero-state",
      userQueryWidth: ".user-query-bubble-with-background:not(.edit-mode)",
    },
  }
}

export const GEMINI_CONFIG = createGeminiConfig()
