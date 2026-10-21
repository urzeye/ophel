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

interface GrokSiteSelectors extends SitePackSelectors {
  textarea: string[]
  submitButton: string[]
  responseContainer: string
  chatContent: string[]
  userQuery: string
  assistantResponse: string
  newChatButton: string[]
  stopButton: string[]
}

type GrokPrivateSelectors = SitePrivateSelectors & {
  nativeQuotePopover: string[]
  sidebarScrollContainer: string
  mainScrollContainer: string
  fallbackScrollContainers: string
  viewAllButton: string
  cmdkList: string
  cmdkItem: string
  cmdkConversationItem: string
  cmdkTitle: string
  cmdkActiveIndicator: string
  cmdkGroup: string
  sidebarGroup: string
  sidebarMenuButton: string
  sidebarMenuItem: string
  sidebarMenu: string
  sidebarIcon: string
  sidebarTrigger: string
  actionDialog: string
  cmdkRoot: string
  actionIconNodes: string
  conversationTitle: string
  messageBubble: string
  responseMarkdown: string
  responseRoot: string
  exportDecoration: string
  attachmentCardCandidates: string
  inlineCodeSpan: string
  modelName: string
  appLayoutScope: string
  panelAvoidanceScope: string
  chatSafeArea: string
  newChatLogoSafeArea: string
  inputSafeArea: string
  canvasSafeArea: string
}

export interface GrokSiteConfig extends BuiltinSiteConfig {
  selectors: GrokSiteSelectors
  input: SitePackInputConfig
  conversation: SitePackConversationConfig
  generating: SitePackGeneratingConfig
  networkMonitor: NetworkMonitorConfig
  modelSwitcher: Omit<ModelSwitcherConfig, "targetModelKeyword">
  export: ExportConfig
  widthSelectors: Omit<WidthSelectorConfig, "transformValue">[]
  zenMode: ZenModeConfig
  quickQuote: NonNullable<BuiltinSiteConfig["quickQuote"]>
  sitePrivateSelectors: GrokPrivateSelectors
}

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const GROK_CONFIG_VERSION = 7

const createGrokConfig = (): GrokSiteConfig => {
  const sidebarScrollContainer = '[data-sidebar="content"]'
  const conversationItem = 'a[href^="/c/"], a[href^="https://grok.com/c/"]'
  const cmdkItem = "[cmdk-item]"
  const messageBubble = ".message-bubble"
  // 新版页面用 data-testid 区分用户/AI 消息；保留 rounded-br-lg 兼容未改版页面
  const userQuery = `[data-testid="user-message"], ${messageBubble}.rounded-br-lg`
  // 新版用户气泡已无 rounded-br-lg，旧反选必须额外排除用户气泡，
  // 否则会把用户消息误判为 AI 回复
  const assistantResponse = `[data-testid="assistant-message"], ${messageBubble}:not(.rounded-br-lg):not([data-testid="user-message"])`
  const responseMarkdown = ".response-content-markdown"
  const stopButton = ['button[aria-label*="停止"]', 'button[aria-label*="Stop"]']
  const appLayoutScope = "#grok-app-root"
  // 新版布局主区域是 div#grok-content-area[role="main"]，不再渲染 <main>；
  // 选择器优先 id / role 等语义锚点，旧的 main 作用域仅作兼容回退
  const contentAreaScope = "#grok-content-area"
  const legacyMainScope = "main[data-mcp-app-fullscreen-container]"
  const panelAvoidanceScope = `${contentAreaScope}, [role="main"]`
  const contentWidth = '[class*="[--content-max-width:"]'
  const inlineContentWidth = '[style*="--content-max-width"]'

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.GROK]],
    // virtualOutlineFill：长对话虚拟滚动，离屏轮次的提问与回答标题由
    // response-node / load-responses 接口回填
    // apiFirstExport：response-node / load-responses 接口可导出全量历史，
    // 不依赖 DOM 历史预加载；接口失败回退 DOM 时由导出流程补做预加载
    traits: { historyLazyLoad: false, virtualOutlineFill: true, apiFirstExport: true },
    selectors: {
      textarea: [
        ".tiptap.ProseMirror[contenteditable='true']",
        '[contenteditable="true"].ProseMirror',
        ".query-bar [contenteditable='true']",
        "form [contenteditable='true']",
      ],
      submitButton: [
        'button[type="submit"]',
        'form button[type="submit"]',
        '.query-bar button[type="submit"]',
      ],
      responseContainer: "#grok-content-area, [role='main'], main",
      chatContent: ['[class*="prose"]', '[dir="ltr"]'],
      userQuery,
      assistantResponse,
      newChatButton: [
        '[data-testid="new-chat"]',
        'a[href="/"]',
        '[data-sidebar="header"] a',
        'button[aria-label*="新"]',
        'button[aria-label*="New"]',
      ],
      stopButton,
    },
    input: { mode: "contenteditable", submitKey: "Enter" },
    conversation: {
      itemSelector: conversationItem,
      idFrom: { attr: "href", regex: "/c/([a-zA-Z0-9-]+)" },
      titleSelector: "span.flex-1, span.truncate, span",
      urlTemplate: "/c/{id}",
      activeMatch: ".bg-button-ghost-hover",
      shadow: false,
    },
    generating: {
      existsSelectors: [stopButton.join(", "), '[class*="loading"], [class*="animate-pulse"]'],
    },
    networkMonitor: {
      urlPatterns: ["/rest/app-chat/conversations/"],
      urlPathEndsWith: ["/responses"],
      silenceThreshold: 500,
    },
    modelSwitcher: {
      selectorButtonSelectors: ["#model-select-trigger"],
      menuItemSelector: '[role="menuitem"], [role="option"]',
      checkInterval: 1000,
      maxAttempts: 15,
      menuRenderDelay: 500,
    },
    export: {
      userQuerySelector: userQuery,
      // assistantResponse 是逗号并集，必须用 :is() 包裹，
      // 否则后代组合器只作用于最后一个分支
      assistantResponseSelector: `:is(${assistantResponse}) ${responseMarkdown}`,
      turnSelector: null,
      useShadowDOM: false,
    },
    widthSelectors: [
      { selector: contentWidth, property: "--content-max-width" },
      { selector: inlineContentWidth, property: "--content-max-width" },
    ],
    zenMode: {
      hide: [".text-sidebar-foreground", '[data-sidebar="sidebar"]'],
    },
    quickQuote: "native",
    sitePrivateSelectors: {
      nativeQuotePopover: [
        ".absolute.bg-surface-l2.p-1.rounded-full.shadow-lg",
        ".absolute.bg-surface-l2.p-1.rounded-full",
        "button svg.lucide-text-quote",
        ".absolute.bg-surface-l2.p-1.rounded-full button",
      ],
      sidebarScrollContainer,
      // 新版聊天滚动容器带 data-testid（px-gutter 已移至内部行元素）；
      // 保留 overflow-y-auto + px-gutter 与 overflow-auto 兼容旧结构
      mainScrollContainer:
        '[data-testid="chat-transcript-scroller"], [class*="overflow-y-auto"][class*="px-gutter"], [class*="overflow-auto"]',
      fallbackScrollContainers: '[class*="overflow-y-auto"], [class*="overflow-auto"]',
      viewAllButton: "button.w-full.justify-start.text-xs.text-secondary.font-semibold",
      cmdkList: '[cmdk-list-sizer=""], [cmdk-list]',
      cmdkItem,
      cmdkConversationItem: `${cmdkItem}[data-value^="conversation:"]`,
      cmdkTitle: "span.truncate",
      cmdkActiveIndicator: '[class*="border-border-l2"]',
      cmdkGroup: "[cmdk-group]",
      sidebarGroup: '[data-sidebar="group"]',
      sidebarMenuButton: '[data-sidebar="menu-button"]',
      sidebarMenuItem: '[data-sidebar="menu-item"]',
      sidebarMenu: '[data-sidebar="menu"]',
      sidebarIcon: '[data-sidebar="icon"] svg',
      sidebarTrigger: 'button[data-sidebar="trigger"]',
      actionDialog: '[role="dialog"]',
      cmdkRoot: "[cmdk-root]",
      actionIconNodes: "svg, path, use, [data-icon], [class*='icon'], [aria-label]",
      conversationTitle: ".conversation-title",
      messageBubble,
      responseMarkdown,
      responseRoot: '[id^="response-"]',
      exportDecoration: 'button, [role="button"], svg, [aria-hidden="true"]',
      attachmentCardCandidates:
        'a[href], [role="group"], [aria-label], [title], [class*="file"], [class*="attachment"]',
      inlineCodeSpan: "span.rounded-sm.font-mono, span.rounded-sm.\\!font-mono",
      modelName: ".font-semibold",
      appLayoutScope,
      panelAvoidanceScope,
      // chat-transcript-scroller 的 data-testid 全页唯一，不需作用域前缀；
      // px-gutter 分支仅服务旧版 <main> 布局
      chatSafeArea: `[data-testid="chat-transcript-scroller"], ${legacyMainScope} [class*="overflow-y-auto"][class*="px-gutter"]`,
      newChatLogoSafeArea: `${contentAreaScope} .flex.flex-col.items-center.justify-center.w-full.max-w-breakout:has(svg[variant="hero"]), ${legacyMainScope} .flex.flex-col.items-center.justify-center.w-full.max-w-breakout:has(svg[variant="hero"])`,
      inputSafeArea: `${contentAreaScope} .absolute.inset-x-0.bottom-0.mx-auto.max-w-breakout, ${legacyMainScope} .absolute.inset-x-0.bottom-0.mx-auto.max-w-breakout`,
      canvasSafeArea: `${appLayoutScope} aside:has(iframe.w-full.flex-1)`,
    },
  }
}

export const GROK_CONFIG = createGrokConfig()
