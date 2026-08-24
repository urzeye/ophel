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

interface ChatGPTSiteSelectors extends SitePackSelectors {
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

type ChatGPTPrivateSelectors = SitePrivateSelectors & {
  nativeQuotePopover: string[]
  conversationTitleFallback: string[]
  conversationPinnedTrailingPair: string
  conversationPinnedTrailingIcon: string
  conversationActionButton: string
  conversationActionIndicator: string
  conversationMenu: string
  conversationMenuItem: string
  codexTaskMarkdown: string
  codexTaskUserQuery: string
  validTextarea: string
  userQueryText: string
  srOnly: string
  srOnlyFallback: string
  assistantMarkdown: string
  exportCleanup: string
  exportTurnContainer: string
  exportMountedMessage: string
  exportImageContainer: string
  exportFileTile: string
  exportFileLabel: string
  exportFileName: string
  deepResearchIframe: string
  markdownFixerParagraph: string
  userQueryWidthRoot: string
  panelScope: string
  panelObstacle: string[]
  panelThreadContentWidth: string
  panelThreadLegacyWidth: string
  panelComposerFormWidth: string
  panelLibraryComposerFormWidth: string
  panelNewChatHeadingInset: string
  panelThreadInset: string
  panelCanvasDialogInset: string
  panelLibraryShellInset: string
  panelLibraryComposerWrapperInset: string
  nativeTocRail: string
  nativeTocButton: string
  nativeTocHoverAncestor: string[]
  nativeTocTitleElement: string[]
  nativeTocActive: string
  modelMenu: string
  modelMenuItem: string
  modelMessageSlug: string
  modelNameContainer: string
  modelSelectedIndicator: string
  modelSelectorName: string
}

export interface ChatGPTSiteConfig extends BuiltinSiteConfig {
  selectors: ChatGPTSiteSelectors
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
  sitePrivateSelectors: ChatGPTPrivateSelectors
}

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const CHATGPT_CONFIG_VERSION = 2

const createChatGPTConfig = (): ChatGPTSiteConfig => {
  const userMessage = '[data-message-author-role="user"]'
  const assistantMessage = '[data-message-author-role="assistant"]'
  const userQueryText = ".whitespace-pre-wrap"
  const srOnly = ".sr-only"
  const codexTaskMarkdown = ".markdown.markdown-new-styling"
  const codexTaskUserQuery = `.self-end.bg-token-bg-tertiary ${userQueryText}`
  // 新版侧边栏会话链接可能输出绝对 URL（https://chatgpt.com/c/...），这里同时兼容相对 /c/... 写法。
  const conversationItem =
    'a[data-sidebar-item="true"][href^="/c/"], a[data-sidebar-item="true"][href*="chatgpt.com/c/"]'
  const stopButton = [
    '[data-testid="stop-button"]',
    'form[data-type="unified-composer"] #composer-submit-button[aria-label*="Stop"]',
    'form[data-type="unified-composer"] #composer-submit-button[aria-label*="停止"]',
    'form[data-type="unified-composer"] button.composer-submit-btn[aria-label*="Stop"]',
    'form[data-type="unified-composer"] button.composer-submit-btn[aria-label*="停止"]',
  ]
  const modelSelectorButton = ['button[class*="__composer-pill"][aria-haspopup="menu"]']
  const modelMenu = '[data-radix-popper-content-wrapper] [role="menu"][data-radix-menu-content]'
  const deepResearchIframe =
    'iframe[title="internal://deep-research"], iframe[src*="connector_openai_deep_research"]'
  const libraryDialog = '[role="dialog"]:has([data-testid="fullscreen-shell-body"])'
  const libraryShell = `${libraryDialog} [data-testid="fullscreen-shell-body"]`
  const libraryEditor = `${libraryShell} div:has(> .ProseMirror.markdown.prose)`
  const libraryComposerWrapper = `${libraryDialog} div.fixed[class*="start-1/2"]:has(> form[class*="group/composer"])`
  const libraryComposerForm = `${libraryShell} ~ * form[class*="group/composer"]`

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.CHATGPT]],
    selectors: {
      textarea: ["#prompt-textarea", 'textarea[data-id="root"]', '[contenteditable="true"]'],
      submitButton: [
        '[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label="发送"]',
      ],
      responseContainer: `#thread, main#main, ${codexTaskMarkdown}`,
      chatContent: [assistantMessage, userMessage, ".markdown"],
      userQuery: userMessage,
      assistantResponse: assistantMessage,
      newChatButton: [
        '[data-testid="create-new-chat-button"]',
        'a[href="/"]',
        'button[aria-label="New chat"]',
        'button[aria-label="新对话"]',
      ],
      stopButton: [...stopButton],
      scrollContainer: ['[class*="scrollbar-gutter"], [class*="@container/main"] > div'],
      sidebarScrollContainer: "#history",
    },
    input: { mode: "contenteditable", submitKey: "Enter" },
    conversation: {
      itemSelector: conversationItem,
      idFrom: {
        attr: "href",
        regex: "(?:^|/)c/([a-z0-9-]+)(?:[/?#]|$)",
      },
      titleSelector: ".truncate [dir='auto']",
      urlTemplate: "/c/{id}",
      activeMatch: "[data-active]",
      navigationStrategy: "click-item",
      shadow: false,
    },
    generating: { existsSelectors: [...stopButton] },
    networkMonitor: {
      urlPatterns: ["backend-api/f/conversation"],
      urlPathEndsWith: ["backend-api/f/conversation"],
      silenceThreshold: 3000,
      requestBodyRules: [
        {
          type: "json-field-exists",
          field: "thinking_effort",
          metadata: {
            domCompletionRequired: true,
          },
        },
      ],
    },
    modelSwitcher: {
      selectorButtonSelectors: [...modelSelectorButton],
      menuItemSelector:
        '[data-radix-collection-item][data-testid^="model-switcher-"], [role="menuitemradio"][data-testid^="model-switcher-"], [role="menuitem"][data-testid^="model-switcher-"]',
      checkInterval: 1000,
      maxAttempts: 15,
      menuRenderDelay: 500,
    },
    export: {
      userQuerySelector: userMessage,
      assistantResponseSelector: assistantMessage,
      turnSelector: '[data-testid^="conversation-turn"]',
      useShadowDOM: false,
    },
    widthSelectors: [
      { selector: '[class*="thread-content-max-width"]', property: "max-width" },
      { selector: '[style*="--thread-content-max-width"]', property: "max-width" },
      {
        selector: libraryEditor,
        property: "max-width",
        extraCss: "width: 100% !important; min-width: 0 !important;",
      },
      {
        selector: libraryComposerWrapper,
        property: "width",
        extraCss: "max-width: calc(100vw - 32px) !important; min-width: 0 !important;",
      },
    ],
    zenMode: {
      hide: [
        "#stage-slideover-sidebar",
        "div.select-none:has(> .pointer-events-auto)",
        "[data-testid='thread-disclaimer']",
      ],
    },
    cleanMode: {
      hide: [
        "div.select-none:has(> .pointer-events-auto)",
        "[data-testid='thread-disclaimer']",
        'div.border-token-border-default.border-t.py-4.text-sm:has(button[aria-label="Ad options"]):has([role="link"][tabindex="0"])',
      ],
    },
    mermaidSupport: "native",
    quickQuote: "native",
    supportsHostThemeSync: true,
    sitePrivateSelectors: {
      nativeQuotePopover: [
        'div[aria-live="polite"].start-0.top-0.select-none.absolute',
        'div[style*="transform: translate3d"] .shadow-long',
        "button.btn-secondary.rounded-none.border-none",
      ],
      conversationTitleFallback: [".truncate span", ".truncate", "span"],
      conversationPinnedTrailingPair: ".trailing-pair",
      conversationPinnedTrailingIcon: ".trailing svg",
      conversationActionButton: [
        'button[aria-haspopup="menu"]',
        'button[aria-label*="More"]',
        'button[aria-label*="more"]',
        'button[aria-label*="更多"]',
        'button[data-testid*="menu"]',
        ".trailing button",
      ].join(", "),
      conversationActionIndicator: 'button[aria-haspopup="menu"], .trailing button',
      conversationMenu: '[role="menu"]',
      conversationMenuItem: '[role="menuitem"], [data-radix-collection-item][role="menuitem"]',
      codexTaskMarkdown,
      codexTaskUserQuery,
      validTextarea: '#prompt-textarea, [contenteditable="true"]',
      userQueryText,
      srOnly,
      srOnlyFallback: "[class*='sr-only']",
      assistantMarkdown: ".markdown, .prose, [class*='prose']",
      exportCleanup: `${srOnly}, button, [role="button"], svg, [aria-hidden="true"]`,
      exportTurnContainer:
        'section[data-turn], [data-testid^="conversation-turn"], [data-turn-id-container]',
      exportMountedMessage: "[data-message-author-role]",
      exportImageContainer: '[class*="imagegen-image"], [data-testid*="image-gen"]',
      exportFileTile: '[role="group"][aria-label], [class*="file-tile"]',
      exportFileLabel: "[aria-label]",
      exportFileName: ".truncate.font-semibold",
      deepResearchIframe,
      markdownFixerParagraph: `${assistantMessage} p`,
      userQueryWidthRoot: ":root",
      panelScope: "main#main",
      panelObstacle: [[deepResearchIframe, "#stage-slideover-sidebar"].join(", ")],
      panelThreadContentWidth:
        '#thread [class*="thread-content-max-width"]:not(:has(form[data-type="unified-composer"]))',
      panelThreadLegacyWidth:
        '#thread [style*="--thread-content-max-width"]:not(:has(form[data-type="unified-composer"]))',
      panelComposerFormWidth: 'main#main form[data-type="unified-composer"]',
      panelLibraryComposerFormWidth: libraryComposerForm,
      panelNewChatHeadingInset:
        "#thread .relative.basis-auto.flex-col.shrink.flex.justify-end:has(h1)",
      panelThreadInset:
        '#thread [class*="--thread-content-margin:"][class*="px-(--thread-content-margin)"]',
      panelCanvasDialogInset:
        'main#main [role="dialog"][class*="fixed"][class*="inset-0"]:has(.cm-editor)',
      panelLibraryShellInset: libraryShell,
      panelLibraryComposerWrapperInset: libraryComposerWrapper,
      nativeTocRail: "div:has(> button[data-toc-item-index])",
      nativeTocButton: "button[data-toc-item-index]",
      nativeTocHoverAncestor: [".relative.flex.items-start", ".fixed"],
      nativeTocTitleElement: [
        "button[data-fill] [title]",
        'button[class*="__menu-item"] [title]',
        "ul button [title]",
        "[role='menu'] [title]",
        ".absolute [title]",
      ],
      nativeTocActive: "[data-toc-active]",
      modelMenu,
      modelMenuItem: `${modelMenu} [data-testid^="model-switcher-"]`,
      modelMessageSlug: "[data-message-model-slug]",
      modelNameContainer: ".min-w-0",
      modelSelectedIndicator: ".trailing svg, .trailing use",
      modelSelectorName: "span.truncate, span[class*='truncate']",
    },
  }
}

export const CHATGPT_CONFIG = createChatGPTConfig()
