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

interface ClaudeSiteSelectors extends SitePackSelectors {
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

type ClaudePrivateSelectors = SitePrivateSelectors & {
  nativeQuotePopover: string[]
  validTextarea: string
  sidebarScrollFallback: string
  conversationGroup: string
  conversationGroupHeading: string
  conversationGroupList: string
  conversationPinnedList: string
  conversationActionButton: string
  conversationMenu: string
  conversationMenuItem: string
  conversationMenuItemFallback: string
  conversationDialog: string
  documentRoot: string
  hiddenAncestor: string
  responseMarkdown: string
  documentViewer: string
  documentPanelTitle: string
  documentBackButton: string
  documentContentTitle: string
  artifactCell: string
  artifactMetadata: string
  artifactTitle: string
  artifactContainer: string
  artifactViewButton: string
  virtualSizer: string
  virtualRow: string
  virtualArticle: string
  outlineIgnoredHeading: string
  srOnly: string
  userQueryText: string
  userMessageBubble: string
  userMessageBoundary: string
  userFileThumbnail: string
  thoughtToggle: string
  thoughtStatus: string
  layoutScope: string
  panelScope: string
  panelObstacle: string
  panelScrollSafeArea: string
  panelNewChatSafeArea: string
  panelCanvasScope: string
  userQueryWidth: string
}

export interface ClaudeSiteConfig extends BuiltinSiteConfig {
  selectors: ClaudeSiteSelectors
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
  sitePrivateSelectors: ClaudePrivateSelectors
}

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const CLAUDE_CONFIG_VERSION = 4

const createClaudeConfig = (): ClaudeSiteConfig => {
  // dframe 布局中侧栏列表容器是 div#frame-peek-popover（不再是 nav），
  // 用标签无关的 [data-testid="sidebar"] 同时覆盖新旧两代结构
  const conversationItem = '[data-testid="sidebar"] a[href*="/chat/"]'
  const userQuery = '[data-testid="user-message"]'
  const assistantResponse = ".font-claude-response"
  const documentRoot = "#wiggle-file-content"
  const responseMarkdown = ".standard-markdown, .progressive-markdown"
  const artifactCell = ".artifact-block-cell"
  const userFileThumbnail = '[data-testid="file-thumbnail"]'
  const thoughtToggle = "button[aria-expanded]"
  const thoughtStatus = 'span[role="status"][aria-live="polite"]'
  const stopButton = ['button[aria-label="Stop response"]']
  // 新版 dframe 布局主容器为 main[data-perf-region="main"]，#main-content 已被移除；
  // 用 :is() 同时兼容新旧主容器，保证下游 "${layoutScope} xxx" 和
  // "${layoutScope}:not(...)" 两种插值方式语义都正确。
  const layoutScope = ':is(main[data-perf-region="main"], #main-content)'
  // 灰度后 data-autoscroll-container 不再是 page-header 的直接子节点，而是下移一层；
  // 用后代 has() 匹配新结构，同时保留直接子选择器兼容旧结构。
  const chatColumnScope = [
    // dframe 布局：page-header 更名为 chat-header
    `${layoutScope} div:has(> [data-testid="chat-header"]):has([data-autoscroll-container="true"])`,
    `${layoutScope} div:has(> [data-testid="page-header"]):has([data-autoscroll-container="true"])`,
    `${layoutScope} div:has(> [data-testid="page-header"]):has(> [data-autoscroll-container="true"])`,
  ].join(", ")
  const panelScope = [
    chatColumnScope,
    `${layoutScope}:not(:has([data-autoscroll-container="true"]))`,
  ].join(", ")
  const panelCanvasScope = [
    `${layoutScope} [data-testid="chat-stale-nav-frame"] > div > div:not([aria-hidden="true"]):has([data-skill-file-viewer="true"])`,
    `${layoutScope} [data-testid="chat-stale-nav-inert"] > div > div:not([aria-hidden="true"]):has([data-skill-file-viewer="true"])`,
  ].join(", ")
  const panelObstacle = [
    documentRoot,
    '[data-testid="artifact-panel"]',
    '[data-testid="artifact-sidebar"]',
  ].join(", ")

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.CLAUDE]],
    selectors: {
      textarea: ['[contenteditable="true"]', ".ProseMirror", 'div[role="textbox"]'],
      submitButton: [
        'button[aria-label="Send Message"]',
        'button[aria-label="Send message"]',
        'button[data-testid="send-button"]',
        'button[aria-label="Send"]',
      ],
      responseContainer: assistantResponse,
      chatContent: [`div${userQuery}`, `div${assistantResponse}`],
      userQuery,
      assistantResponse,
      newChatButton: ['a[aria-label="New chat"]', 'a[href*="/new"]'],
      stopButton: [...stopButton],
      scrollContainer: [
        '[data-autoscroll-container="true"]',
        `${layoutScope} .overflow-y-scroll`,
        "#root .overflow-y-auto.overflow-x-hidden",
      ],
      sidebarScrollContainer: '[data-testid="sidebar"], nav',
    },
    input: { mode: "contenteditable", submitKey: "Enter" },
    conversation: {
      itemSelector: conversationItem,
      idFrom: { attr: "href", regex: "/chat/([a-f0-9-]+)" },
      // dframe 布局标题为 .dframe-fade-label（无 truncate 类），旧结构保留 span.truncate
      titleSelector: ".dframe-fade-label, span.truncate",
      urlTemplate: "/chat/{id}",
      navigationStrategy: "click-item",
      shadow: false,
    },
    generating: {
      existsSelectors: [
        ...stopButton,
        '[data-is-streaming="true"]',
        '[class*="streaming"], [class*="typing"]',
      ],
    },
    networkMonitor: {
      urlPatterns: ["/api/"],
      urlPathEndsWith: ["/completion"],
      silenceThreshold: 500,
    },
    modelSwitcher: {
      selectorButtonSelectors: ['button[data-testid="model-selector-dropdown"]'],
      menuItemSelector: '[role="menuitem"], [role="menuitemradio"]',
      checkInterval: 1000,
      maxAttempts: 20,
      subMenuSelector: '[aria-haspopup="menu"]',
      subMenuTriggers: ["more models", "更多模型"],
    },
    export: {
      userQuerySelector: userQuery,
      assistantResponseSelector: assistantResponse,
      turnSelector: null,
      useShadowDOM: false,
    },
    widthSelectors: [
      {
        // dframe 布局新增的最外层宽度约束（max-w-[50.5rem]），
        // transcript 与输入框都在其内部，必须一起放宽
        selector: `${layoutScope} [data-testid="chat-column"]`,
        property: "max-width",
        extraCss: "width: 100% !important; min-width: 0 !important;",
      },
      {
        selector: `${layoutScope} .max-w-screen-md`,
        property: "max-width",
        extraCss: "width: 100% !important; min-width: 0 !important;",
      },
      {
        selector: `${layoutScope} .max-w-3xl`,
        property: "max-width",
        extraCss: "width: 100% !important; min-width: 0 !important;",
      },
      {
        selector: `${layoutScope} .max-w-4xl`,
        property: "max-width",
        extraCss: "width: 100% !important; min-width: 0 !important;",
      },
    ],
    zenMode: {
      // dframe 布局侧栏外壳为 aside.dframe-sidebar，列表在 [data-testid="sidebar"] 内
      hide: ["aside.dframe-sidebar", '[data-testid="sidebar"]'],
      styles: [
        {
          // dframe 布局的侧栏是 position:absolute，宽度靠 .dframe-content-inner 的
          // padding-left（--df-sidebar-clearance）预留；隐藏侧栏后归还这块空间
          selector: 'main[data-perf-region="main"] .dframe-content-inner',
          property: "padding-left",
          value: "var(--df-content-gutter, 8px)",
        },
      ],
    },
    cleanMode: {
      hide: ['[data-disclaimer="true"]'],
    },
    mermaidSupport: "native",
    quickQuote: "native",
    supportsHostThemeSync: true,
    sitePrivateSelectors: {
      nativeQuotePopover: ['[data-selection-tooltip="true"]'],
      validTextarea: '[contenteditable="true"], .ProseMirror, [role="textbox"]',
      sidebarScrollFallback: "div.overflow-y-auto",
      conversationGroup: "[class*='group/nsh'], div.flex.flex-col",
      conversationGroupHeading: "span[role=button], h3",
      conversationGroupList: "ul",
      conversationPinnedList: "ul.-mx-1\\.5",
      conversationActionButton: [
        'button[aria-haspopup="menu"]',
        'button[data-testid*="menu"]',
        'button[aria-label*="more"]',
        'button[aria-label*="More"]',
        'button[aria-label*="options"]',
        'button[aria-label*="Options"]',
        'button[aria-label*="更多"]',
        'button[aria-label*="选项"]',
        'button[aria-label*="選項"]',
      ].join(", "),
      conversationMenu: '[role="menu"], [data-radix-menu-content], [data-state="open"]',
      conversationMenuItem: '[role="menuitem"], button',
      conversationMenuItemFallback: '[role="menuitem"], [role="menu"] button',
      conversationDialog: '[role="dialog"], [aria-modal="true"], [data-state="open"]',
      documentRoot,
      hiddenAncestor: '[aria-hidden="true"]',
      responseMarkdown,
      documentViewer: '[data-skill-file-viewer="true"]',
      documentPanelTitle: "h2[title]",
      documentBackButton: 'button[aria-label="Go back"]',
      documentContentTitle: "h1",
      artifactCell,
      artifactMetadata: ".text-text-400",
      artifactTitle: ".line-clamp-1",
      artifactContainer: ".group\\/artifact-block, [class*='group/artifact-block']",
      artifactViewButton: 'button[aria-label="View Document"]',
      virtualSizer: "[data-rocksteady-sizer]",
      virtualRow: "[data-rs-index][data-index]",
      virtualArticle: '[role="article"][aria-setsize]',
      outlineIgnoredHeading: ".pointer-events-none",
      srOnly: ".sr-only",
      userQueryText: "p.whitespace-pre-wrap",
      userMessageBubble: "[data-cds='UserMessage'], [data-user-message-bubble='true']",
      userMessageBoundary: `${assistantResponse}, main, [role='main']`,
      userFileThumbnail,
      thoughtToggle,
      thoughtStatus,
      layoutScope,
      panelScope,
      panelObstacle,
      panelScrollSafeArea: `${layoutScope} [data-autoscroll-container="true"]`,
      panelNewChatSafeArea: `${layoutScope}:has(.ProseMirror):not(:has([data-autoscroll-container="true"]))`,
      panelCanvasScope,
      userQueryWidth: userQuery,
    },
  }
}

export const CLAUDE_CONFIG = createClaudeConfig()
