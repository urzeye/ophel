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
export const CHATGPT_CONFIG_VERSION = 8

export const CHATGPT_NEW_UX_SCOPE =
  'main[data-app-shell-main-surface]:has([data-app-action-timeline-scroll], [data-thread-user-message-navigation-content="true"])'
export const CHATGPT_HOME_COMPOSER_SELECTOR =
  'form[data-composer-placement="home"]:is([data-chatgpt-composer], [data-thread-find-composer="true"])'
export const CHATGPT_HOME_UX_SCOPE = `main[data-app-shell-main-surface]:has(${CHATGPT_HOME_COMPOSER_SELECTOR})`
export const CHATGPT_PAGE_WIDTH_SCOPE = `:is(${CHATGPT_NEW_UX_SCOPE}, ${CHATGPT_HOME_UX_SCOPE})`
// Normalize local width owners after broad legacy rules, which also affect nested rows and their margins.
export const CHATGPT_NEW_UX_WIDTH_SELECTORS: Omit<WidthSelectorConfig, "transformValue">[] = [
  {
    selector: `${CHATGPT_PAGE_WIDTH_SCOPE} [class*="--thread-content-responsive-max-width:"]`,
    property: "max-width",
    value: "none",
    extraCss:
      "--thread-content-responsive-max-width: 100% !important; width: 100% !important; min-width: 0 !important; margin-left: 0 !important; margin-right: 0 !important;",
    noCenter: true,
  },
  {
    selector: `${CHATGPT_PAGE_WIDTH_SCOPE} [class*="thread-content-max-width"]:not([class*="--thread-body-max-width:"])`,
    property: "max-width",
    value: "100%",
    extraCss:
      "--thread-content-max-width: 100% !important; width: 100% !important; min-width: 0 !important; margin-left: 0 !important; margin-right: 0 !important;",
    noCenter: true,
  },
  {
    selector: `${CHATGPT_PAGE_WIDTH_SCOPE} [class*="--thread-body-max-width:"]`,
    property: "max-width",
    extraCss:
      "--thread-content-max-width: 100% !important; --thread-body-max-width: 100% !important; width: 100% !important; min-width: 0 !important;",
  },
  {
    // Project homes have no body-width owner; constrain only the content owner containing the composer.
    selector: `${CHATGPT_HOME_UX_SCOPE} [data-chatgpt-project-conversation-drop-target] [class~="max-w-[var(--thread-content-max-width)]"]:has(${CHATGPT_HOME_COMPOSER_SELECTOR})`,
    property: "max-width",
    extraCss:
      "width: 100% !important; min-width: 0 !important; margin-left: auto !important; margin-right: auto !important;",
  },
]

const createChatGPTConfig = (): ChatGPTSiteConfig => {
  // 消息单元选择器：
  // [LEGACY-CHATGPT-V1] / [CHATGPT-APP-SHELL]: [data-message-author-role="user|assistant"]，待全量后清理
  // [CHATGPT-TURN-KEY]: 新结构无 author-role，改用 data-content-search-unit-key="<turn>:<idx>:<role>"
  const userMessage = '[data-message-author-role="user"], [data-content-search-unit-key$=":user"]'
  const assistantMessage =
    '[data-message-author-role="assistant"], [data-content-search-unit-key$=":assistant"]'
  const userQueryText = ".whitespace-pre-wrap"
  const srOnly = ".sr-only"
  const codexTaskMarkdown = ".markdown.markdown-new-styling"
  const codexTaskUserQuery = `.self-end.bg-token-bg-tertiary ${userQueryText}`
  // 侧边栏对话项选择器：
  // [LEGACY-CHATGPT-V1]: 旧版 Next.js 结构，以 a[data-sidebar-item] 渲染，待全量迁移后清理
  // [CHATGPT-APP-SHELL]: 新版 App-Shell 架构，以带 conversation-key 的 div 渲染
  const conversationItem = [
    'a[data-sidebar-item="true"][href^="/c/"]',
    'a[data-sidebar-item="true"][href*="chatgpt.com/c/"]',
    "div[data-sidebar-chatgpt-conversation-key]",
    "div[data-pinned-content-tab-drop-key]",
  ].join(", ")
  const stopButton = [
    // [LEGACY-CHATGPT-V1]: 旧版停止生成按钮选择器
    '[data-testid="stop-button"]',
    'form[data-type="unified-composer"] #composer-submit-button[aria-label*="Stop"]',
    'form[data-type="unified-composer"] #composer-submit-button[aria-label*="停止"]',
    'form[data-type="unified-composer"] button.composer-submit-btn[aria-label*="Stop"]',
    'form[data-type="unified-composer"] button.composer-submit-btn[aria-label*="停止"]',
    // [CHATGPT-APP-SHELL]: 新版 App-Shell 停止生成按钮选择器
    'form[data-chatgpt-composer] button[aria-label*="Stop"]',
    'form[data-chatgpt-composer] button[aria-label*="停止"]',
    'form[data-thread-find-composer="true"] button[aria-label*="Stop"]',
    'form[data-thread-find-composer="true"] button[aria-label*="停止"]',
  ]
  const modelSelectorButton = [
    // [LEGACY-CHATGPT-V1]: 旧版模型切换胶囊按钮
    'button[class*="__composer-pill"][aria-haspopup="menu"]',
    // [CHATGPT-APP-SHELL]: 新版模型切换/推理强度菜单按钮
    'button[data-composer-navigation-target="reasoning"][aria-haspopup="menu"]',
    'button[data-codex-intelligence-trigger="true"][aria-haspopup="menu"]',
    'button[aria-label*="模型"][aria-haspopup="menu"]',
    'button[aria-label*="Model" i][aria-haspopup="menu"]',
  ]
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
    // 新版 App-Shell 切换对话可能只是 surface 显隐切换、没有 childList 变更，
    // MutationObserver 链路不保证触发；开启周期性保底刷新让大纲收敛到当前对话。
    // apiFirstExport：会话页可走 conversations 接口导出全量历史，
    // 不依赖 DOM 历史预加载（运行时收窄见 canSkipExportHistoryPreload）。
    traits: { periodicOutlineRefresh: true, apiFirstExport: true },
    selectors: {
      textarea: [
        // [LEGACY-CHATGPT-V1]: 旧版输入框
        "#prompt-textarea",
        'textarea[data-id="root"]',
        // [CHATGPT-APP-SHELL]: 新版 ProseMirror 富文本输入框
        'div[data-composer-markdown][contenteditable="true"]',
        'div.ProseMirror[contenteditable="true"]',
        '[contenteditable="true"]',
      ],
      submitButton: [
        // [LEGACY-CHATGPT-V1]: 旧版发送按钮
        '[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label="发送"]',
        // [CHATGPT-APP-SHELL]: 新版表单发送按钮
        'form[data-chatgpt-composer] button[aria-label*="发送"]',
        'form[data-chatgpt-composer] button[aria-label*="Send"]',
        'form[data-thread-find-composer="true"] button[aria-label*="发送"]',
        'form[data-thread-find-composer="true"] button[aria-label*="Send"]',
        "form[data-chatgpt-composer] button.bg-composer-primary",
      ],
      responseContainer: [
        // [LEGACY-CHATGPT-V1]: 旧版消息容器
        "#thread",
        "main#main",
        // [CHATGPT-APP-SHELL]: 新版 App-Shell 页面与滚动容器
        "main[data-app-shell-main-surface]",
        'div[data-app-shell-main-content-layout] [role="main"]',
        'div[role="main"]',
        codexTaskMarkdown,
      ].join(", "),
      chatContent: [assistantMessage, userMessage, ".markdown"],
      userQuery: userMessage,
      assistantResponse: assistantMessage,
      newChatButton: [
        // [LEGACY-CHATGPT-V1]: 旧版新建聊天按钮
        '[data-testid="create-new-chat-button"]',
        'a[href="/"]',
        'button[aria-label="New chat"]',
        'button[aria-label="新对话"]',
        // [CHATGPT-APP-SHELL]: 新版侧边栏新建聊天按钮
        'button.sidebar-item[aria-label*="新聊天"]',
        'button.sidebar-item[aria-label*="New chat" i]',
        "button.sidebar-item:has(.text-fade-truncate)",
      ],
      stopButton: [...stopButton],
      scrollContainer: [
        // [LEGACY-CHATGPT-V1]: 旧版滚动容器
        '[class*="scrollbar-gutter"]',
        '[class*="@container/main"] > div',
        // [CHATGPT-APP-SHELL]: 新版主视口与滚动容器
        'div[role="main"][class*="overflow-y-auto"]',
        'div[data-app-shell-main-content-layout] [role="main"]',
        // [CHATGPT-TURN-KEY]: 新结构会话滚动容器
        "div[data-app-action-timeline-scroll]",
      ],
      // [LEGACY-CHATGPT-V1]: #history 待全量后清理
      // [CHATGPT-APP-SHELL]: div[data-app-action-sidebar-scroll]
      sidebarScrollContainer: "#history, div[data-app-action-sidebar-scroll]",
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
      // [LEGACY-CHATGPT-V1]: [data-active] 待全量后清理
      // [CHATGPT-APP-SHELL]: [data-app-action-sidebar-thread-selected="true"], [aria-current="page"]
      activeMatch:
        '[data-active], [data-app-action-sidebar-thread-selected="true"], [aria-current="page"]',
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
      // [CHATGPT-APP-SHELL]: conversation-turn-N；[CHATGPT-TURN-KEY]: div[data-turn-key]
      turnSelector: '[data-testid^="conversation-turn"], [data-turn-key]',
      useShadowDOM: false,
    },
    widthSelectors: [
      // [LEGACY-CHATGPT-V1]: 旧版宽度限制
      { selector: '[class*="thread-content-max-width"]', property: "max-width" },
      { selector: '[style*="--thread-content-max-width"]', property: "max-width" },
      // [CHATGPT-APP-SHELL]: 新版 Tailwind 变量类
      {
        // [CHATGPT-TURN-KEY]: 响应式宽度变量挂在外层容器上
        selector: '[class*="--thread-content-responsive-max-width:"]',
        property: "max-width",
        extraCss: "--thread-content-responsive-max-width: 100% !important;",
      },
      {
        selector: '[class*="--thread-content-max-width:"]',
        property: "max-width",
        extraCss: "--thread-content-max-width: 100% !important;",
      },
      {
        selector: '[class*="--thread-body-max-width:"]',
        property: "max-width",
        extraCss: "--thread-body-max-width: 100% !important;",
      },
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
      ...CHATGPT_NEW_UX_WIDTH_SELECTORS,
    ],
    zenMode: {
      hide: [
        "#stage-slideover-sidebar",
        // [CHATGPT-APP-SHELL]: 新版侧栏容器。注意不能用 div[data-app-shell-responsive-sidebar]——
        // 那是 app-shell 根 frame（包含 main），隐藏会导致整页消失（实测）
        "aside[data-app-shell-left-panel-appearance]",
      ],
    },
    cleanMode: {
      preserveFlow: ["[data-testid='thread-disclaimer']"],
      hide: [
        "div.select-none:has(> .pointer-events-auto)",
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
      conversationTitleFallback: [
        // [CHATGPT-APP-SHELL]: 新版跑马灯标题容器
        '[data-marquee-content="true"] [dir="auto"]',
        // [LEGACY-CHATGPT-V1]: 旧版截断标题选择器，待全量后清理
        ".truncate span",
        ".truncate",
        "span",
      ],
      conversationPinnedTrailingPair: ".trailing-pair",
      conversationPinnedTrailingIcon: ".trailing svg",
      conversationActionButton: [
        // [CHATGPT-APP-SHELL]: 新版操作菜单按钮
        'button[aria-label="聊天操作"]',
        'button[aria-label*="Chat options" i]',
        // [LEGACY-CHATGPT-V1]: 旧版菜单按钮，待全量后清理
        'button[aria-haspopup="menu"]',
        'button[aria-label*="More"]',
        'button[aria-label*="more"]',
        'button[aria-label*="更多"]',
        'button[data-testid*="menu"]',
        ".trailing button",
      ].join(", "),
      conversationActionIndicator:
        'button[aria-label="聊天操作"], button[aria-haspopup="menu"], .trailing button',
      conversationMenu: '[role="menu"]',
      conversationMenuItem: '[role="menuitem"], [data-radix-collection-item][role="menuitem"]',
      codexTaskMarkdown,
      codexTaskUserQuery,
      // [LEGACY-CHATGPT-V1] & [CHATGPT-APP-SHELL] 有效输入框
      validTextarea:
        '#prompt-textarea, div[data-composer-markdown][contenteditable="true"], div.ProseMirror[contenteditable="true"], [contenteditable="true"]',
      userQueryText,
      srOnly,
      srOnlyFallback: "[class*='sr-only']",
      // [CHATGPT-TURN-KEY]: 新结构助手正文容器为 [data-markdown-text-style="assistant-message"]（MarkdownRoot）
      assistantMarkdown:
        '.markdown, .prose, [class*="prose"], [data-markdown-text-style="assistant-message"]',
      exportCleanup: `${srOnly}, button, [role="button"], svg, [aria-hidden="true"]`,
      exportTurnContainer:
        'section[data-turn], [data-testid^="conversation-turn"], [data-turn-id-container], [data-turn-key]',
      // [CHATGPT-TURN-KEY]: 新结构无 author-role，挂载态消息单元为 [data-content-search-unit-key]
      exportMountedMessage: "[data-message-author-role], [data-content-search-unit-key]",
      exportImageContainer: '[class*="imagegen-image"], [data-testid*="image-gen"]',
      exportFileTile: '[role="group"][aria-label], [class*="file-tile"]',
      exportFileLabel: "[aria-label]",
      exportFileName: ".truncate.font-semibold",
      deepResearchIframe,
      markdownFixerParagraph: [
        '[data-message-author-role="assistant"] p',
        '[data-content-search-unit-key$=":assistant"] p',
      ].join(", "),
      userQueryWidthRoot: ":root",
      // [LEGACY-CHATGPT-V1] main#main 待全量后清理
      // [CHATGPT-APP-SHELL] main[data-app-shell-main-surface], main
      panelScope: "main#main, main[data-app-shell-main-surface], main",
      panelObstacle: [[deepResearchIframe, "#stage-slideover-sidebar"].join(", ")],
      panelThreadContentWidth:
        '#thread [class*="thread-content-max-width"]:not(:has(form[data-type="unified-composer"])), [data-app-shell-main-surface] [class*="--thread-content-max-width:"]',
      panelThreadLegacyWidth:
        '#thread [style*="--thread-content-max-width"]:not(:has(form[data-type="unified-composer"])), [data-app-shell-main-surface] [class*="--thread-body-max-width:"]',
      panelComposerFormWidth:
        'main#main form[data-type="unified-composer"], form[data-chatgpt-composer], form[data-thread-find-composer="true"]',
      panelLibraryComposerFormWidth: libraryComposerForm,
      panelNewChatHeadingInset:
        "#thread .relative.basis-auto.flex-col.shrink.flex.justify-end:has(h1)",
      panelThreadInset:
        '#thread [class*="--thread-content-margin:"][class*="px-(--thread-content-margin)"]',
      panelCanvasDialogInset:
        'main#main [role="dialog"][class*="fixed"][class*="inset-0"]:has(.cm-editor)',
      panelLibraryShellInset: libraryShell,
      panelLibraryComposerWrapperInset: libraryComposerWrapper,
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
