import { SITE_IDS } from "~constants/defaults"

import type { ExportConfig, ModelSwitcherConfig, WidthSelectorConfig, ZenModeConfig } from "./base"
import type {
  BuiltinSiteConfig,
  SitePackConversationConfig,
  SitePackGeneratingConfig,
  SitePackInputConfig,
  SitePackSelectors,
  SitePrivateSelectors,
} from "./declarative"
import { BUILTIN_FEATURE_CAPABILITIES } from "./feature-capabilities"

interface AIStudioSiteSelectors extends SitePackSelectors {
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

type AIStudioPrivateSelectors = SitePrivateSelectors & {
  scrollbarButton: string
  activeScrollbarButton: string
  pageHeading: string
  sidebarTitleLink: string
  validTextarea: string
  layoutScope: string
  editorScope: string
  modelSidebar: string
  panelChatContentWidth: string
  panelChatTurnWidth: string
  panelPromptBoxWidth: string
  panelTableWidth: string
  panelChatSafeArea: string
  panelPromptSafeArea: string
  markdownFixerTarget: string
  modelNameMarker: string
  runSettingsToggleButton: string
  runSettingsCloseButton: string
  modelCategoryButton: string
  modelCardName: string
  modelSidebarCloseButton: string
  libraryNavigationLink: string[]
  libraryRoot: string
  libraryTable: string
  libraryMobileCards: string
  libraryTableWrapper: string
  libraryCard: string
  libraryEmptyState: string
  sidebarConversationLink: string
  conversationVisibilityLink: string
  conversationRemovalContainer: string[]
  libraryRow: string[]
  conversationMenuButton: string
  conversationMenuItem: string
  conversationDialog: string
  turn: string
  turnContent: string
  userContentNoise: string
  assistantContentNoise: string
  userContentChunk: string[]
  userPromptContainer: string
  userImageAttachment: string
  userFileAttachment: string
  userFileName: string
  userFileAriaLabel: string
  userFileDetails: string
  userFileLink: string
  outlineContainer: string
  outlineAssistantContainer: string
  markdownNode: string
  thoughtChunk: string
  inlineCode: string
  katex: string
  katexAnnotation: string
  codeBlock: string
  codeBlockContent: string[]
  codeBlockLanguage: string
  assistantFragment: string
  chatSession: string
  promptChunk: string
  mountedContent: string
  textChunk: string
  runButton: string
  generationTextStopIndicator: string
  modelNameText: string[]
  themeEventTarget: string
}

export interface AIStudioSiteConfig extends BuiltinSiteConfig {
  selectors: AIStudioSiteSelectors
  input: SitePackInputConfig
  conversation: SitePackConversationConfig
  generating: SitePackGeneratingConfig
  modelSwitcher: Omit<ModelSwitcherConfig, "targetModelKeyword">
  export: ExportConfig
  widthSelectors: Omit<WidthSelectorConfig, "transformValue">[]
  zenMode: ZenModeConfig
  cleanMode: ZenModeConfig
  mermaidSupport: NonNullable<BuiltinSiteConfig["mermaidSupport"]>
  quickQuote: NonNullable<BuiltinSiteConfig["quickQuote"]>
  supportsHostThemeSync: boolean
  sitePrivateSelectors: AIStudioPrivateSelectors
}

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const AISTUDIO_CONFIG_VERSION = 1

const createAIStudioConfig = (): AIStudioSiteConfig => {
  const turn = "ms-chat-turn"
  const userQuery = ".chat-turn-container.user"
  const assistantResponse = ".chat-turn-container.model"
  const assistantFragment = `${assistantResponse}, .model-prompt-container`
  const thoughtChunk = "ms-thought-chunk"
  const libraryRoot = "ms-library-table"
  const libraryConversationLink = [
    `${libraryRoot} table a[href*="/prompts/"]:not([href*="new_chat"])`,
    `${libraryRoot} .prompt-card a[href*="/prompts/"]:not([href*="new_chat"])`,
  ].join(", ")
  const libraryMobileCards = `${libraryRoot} .prompt-cards-container`
  const layoutScope = ".chunk-editor-main"
  const editorScope = "ms-chunk-editor"
  const promptBoxWidth = `${layoutScope} footer ms-prompt-box`
  const modelSidebar = [
    ".ms-sliding-right-panel-dialog",
    "mat-dialog-container.mat-mdc-dialog-container",
  ].join(", ")
  const generationTextStopIndicator = 'button .material-symbols-outlined:not([class*="keyboard"])'

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.AISTUDIO]],
    selectors: {
      textarea: [
        "textarea.textarea",
        "textarea.cdk-textarea-autosize",
        'textarea[placeholder*="prompt"]',
        'textarea[placeholder*="Start typing"]',
      ],
      submitButton: [
        'ms-run-button button[type="submit"]',
        'ms-run-button.supports-add-instead-of-run button[type="submit"]',
        'button[ms-button][type="submit"]',
        'button.ms-button-primary[type="submit"]',
      ],
      responseContainer: ".chat-container, main",
      chatContent: [".chat-turn-container", '[class*="message"]', '[class*="response"]'],
      userQuery,
      assistantResponse,
      newChatButton: [
        'button[iconname="add"]',
        'button[data-test-clear="outside"]',
        'button .material-symbols-outlined[aria-hidden="true"]',
      ],
      stopButton: [
        "ms-stop-button",
        'button:has(mat-icon[fonticon="stop"])',
        'button mat-icon[fonticon="stop"]',
      ],
      scrollContainer: [
        ".chat-container",
        ".virtual-scroll-container",
        '[class*="scroll"]',
        'main [style*="overflow"]',
        'main [class*="overflow"]',
      ],
      sidebarScrollContainer: "ms-navbar-v2",
    },
    input: { mode: "textarea", submitKey: "Enter" },
    conversation: {
      itemSelector: libraryConversationLink,
      idFrom: { attr: "href", regex: "/prompts/([^/?#]+)" },
      urlTemplate: "/prompts/{id}",
      navigationStrategy: "click-item",
      shadow: false,
    },
    generating: {
      existsSelectors: [
        "ms-stop-button",
        'button mat-icon[fonticon="stop"]',
        generationTextStopIndicator,
        ".mat-progress-spinner",
        ".mat-progress-bar",
      ],
    },
    modelSwitcher: {
      selectorButtonSelectors: ["button.model-selector-card", ".model-selector-card"],
      menuItemSelector: ".model-options-container button.content-button",
      checkInterval: 1000,
      maxAttempts: 10,
      menuRenderDelay: 300,
    },
    export: {
      userQuerySelector: userQuery,
      assistantResponseSelector: assistantResponse,
      turnSelector: null,
      useShadowDOM: false,
    },
    widthSelectors: [
      { selector: ".chat-session-content", property: "max-width" },
      { selector: ".chat-turn-container", property: "max-width" },
      {
        selector: promptBoxWidth,
        property: "max-width",
        extraCss: "width: 100% !important; min-width: 0 !important;",
      },
      {
        selector: ".table-container > table",
        property: "width",
        value: "100%",
        noCenter: true,
        extraCss: "min-width: 100% !important;",
      },
    ],
    zenMode: {
      hide: ["ms-navbar", "ms-navbar-v2", "ms-right-side-panel"],
    },
    cleanMode: {
      hide: ["ms-hallucinations-disclaimer"],
    },
    mermaidSupport: "fallback",
    quickQuote: "disabled",
    supportsHostThemeSync: false,
    sitePrivateSelectors: {
      scrollbarButton: [
        "ms-items-scrollbar button[aria-controls]",
        "ms-items-scrollbar button[data-test-item-id]",
        "ms-prompt-scrollbar button[aria-controls]",
        "ms-prompt-scrollbar button[data-test-item-id]",
      ].join(", "),
      activeScrollbarButton: '[aria-pressed="true"], .ms-button-active',
      pageHeading: "h1[class*='mode-title'], h1.page-title, .page-title h1",
      sidebarTitleLink: 'a.prompt-link[href*="/prompts/"], a.name-btn[href*="/prompts/"]',
      validTextarea: "textarea",
      layoutScope,
      editorScope,
      modelSidebar,
      panelChatContentWidth: `${layoutScope} .chat-session-content`,
      panelChatTurnWidth: `${layoutScope} .chat-turn-container`,
      panelPromptBoxWidth: promptBoxWidth,
      panelTableWidth: `${layoutScope} .table-container > table`,
      panelChatSafeArea: `${layoutScope} .chat-container .chat-view-container`,
      panelPromptSafeArea: `${layoutScope} footer`,
      markdownFixerTarget: "ms-cmark-node span.ng-star-inserted",
      modelNameMarker: '[data-test-id="model-name"]',
      runSettingsToggleButton: 'button[aria-label="Toggle run settings panel"]',
      runSettingsCloseButton: 'button[aria-label="Close run settings panel"]',
      modelCategoryButton: "[data-test-category-button]",
      modelCardName: "div > div > div > span:first-child",
      modelSidebarCloseButton: "button[data-test-close-button]",
      libraryNavigationLink: ['ms-navbar-v2 a[href="/library"]', 'a[href="/library"]'],
      libraryRoot,
      libraryTable: `${libraryRoot} table`,
      libraryMobileCards,
      libraryTableWrapper: `${libraryRoot} .lib-table-wrapper`,
      libraryCard: ".prompt-card",
      libraryEmptyState: [
        `${libraryRoot} .empty-state`,
        `${libraryRoot} [class*="empty" i]`,
        `${libraryRoot} [class*="no-results" i]`,
        `${libraryRoot} [class*="no-prompts" i]`,
        `${libraryRoot} [data-test-id*="empty" i]`,
        `${libraryRoot} [aria-label*="empty" i]`,
      ].join(", "),
      sidebarConversationLink: 'a[href*="/prompts/"]',
      conversationVisibilityLink: [
        'a.prompt-link[href*="/prompts/"]',
        'a.name-btn[href*="/prompts/"]',
        'a.name-link[href*="/prompts/"]',
        'a[href*="/prompts/"]',
      ].join(", "),
      conversationRemovalContainer: ["tr", "li", "mat-row", ".prompt-card"],
      libraryRow: ["tr", "mat-row", ".prompt-card"],
      conversationMenuButton: [
        'button[aria-haspopup="menu"]',
        'button[aria-label*="More"]',
        'button[aria-label*="more"]',
        'button[aria-label*="更多"]',
        'button[aria-label*="更多选项"]',
        'button[aria-label*="选项"]',
        'button[title*="More"]',
        'button[title*="more"]',
      ].join(", "),
      conversationMenuItem: '[role="menuitem"], [role="menu"] button, .mat-mdc-menu-panel button',
      conversationDialog: '[role="dialog"], mat-dialog-container, .mat-mdc-dialog-container',
      turn,
      turnContent: ".turn-content",
      userContentNoise:
        '.author-label, .actions-container, button, [role="button"], svg, [aria-hidden="true"], ms-image-chunk, ms-file-chunk',
      assistantContentNoise:
        '.author-label, .actions-container, button, [role="button"], svg, [aria-hidden="true"]',
      userContentChunk: [
        "ms-text-chunk",
        "ms-prompt-chunk.text-chunk",
        "ms-prompt-chunk",
        "ms-cmark-node.cmark-node.user-chunk",
      ],
      userPromptContainer: ".user-prompt-container",
      userImageAttachment: "ms-image-chunk img",
      userFileAttachment: "ms-file-chunk",
      userFileName: ".name",
      userFileAriaLabel: "[aria-label]",
      userFileDetails: ".token-count",
      userFileLink: "a[href]",
      outlineContainer: ".chat-container",
      outlineAssistantContainer: `${assistantResponse}, .chat-turn-container:not(.user)`,
      markdownNode: "ms-cmark-node",
      thoughtChunk,
      inlineCode: ".inline-code",
      katex: "ms-katex",
      katexAnnotation: 'annotation[encoding="application/x-tex"]',
      codeBlock: "ms-code-block",
      codeBlockContent: ["pre code", "pre"],
      codeBlockLanguage: ".mat-expansion-panel-header-title .ng-star-inserted:last-child",
      assistantFragment,
      chatSession: "ms-chat-session",
      promptChunk: "ms-prompt-chunk",
      mountedContent: "ms-text-chunk, ms-thought-chunk, ms-image-chunk, ms-file-chunk, img",
      textChunk: "ms-text-chunk",
      runButton: "ms-run-button",
      generationTextStopIndicator,
      modelNameText: ["span.title", "span"],
      themeEventTarget: "app-root, ms-app, body",
    },
  }
}

export const AISTUDIO_CONFIG = createAIStudioConfig()
