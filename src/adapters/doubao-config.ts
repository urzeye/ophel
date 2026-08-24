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

interface DoubaoSiteSelectors extends SitePackSelectors {
  textarea: string[]
  submitButton: string[]
  responseContainer: string
  chatContent: string[]
  userQuery: string
  assistantResponse: string
  newChatButton: string[]
  stopButton: string[]
}

type DoubaoPrivateSelectors = SitePrivateSelectors & {
  nativeQuotePopover: string[]
  slateElement: string
  historyContainer: string
  pinnedConversation: string
  virtualRow: string
  virtualScrollHolder: string
  shareMessageList: string
  messageBlock: string
  messageId: string
  userQueryTextContainer: string
  renderedUserQueryMarkdown: string
  assistantMarkdown: string
  assistantExportDecoration: string
  userAttachmentCard: string
  generatedImageBlock: string
  assistantImageContainers: string
  generatedImageWrapper: string
  generatedImageGridItem: string
  modelName: string
  conversationMarqueeTitle: string
  conversationMenuWrapper: string
  conversationMenuTrigger: string
  conversationMenuInnerButton: string
  conversationMenuGenericTrigger: string
  deleteMenuItem: string
  deleteDangerIndicator: string
  deleteConfirmButton: string
  openDeleteDialog: string
  deleteDialog: string
  openConversationMenu: string
  mainLayoutScope: string
  contentWidthRoot: string
  contentWidth: string
  contentWidthVar: string
  contentColumn: string
  newChatSafeArea: string
  canvasScope: string
  canvasSafeArea: string
  userQueryWidth: string[]
}

export interface DoubaoSiteConfig extends BuiltinSiteConfig {
  selectors: DoubaoSiteSelectors
  input: SitePackInputConfig
  conversation: SitePackConversationConfig
  generating: SitePackGeneratingConfig
  modelSwitcher: Omit<ModelSwitcherConfig, "targetModelKeyword">
  export: ExportConfig
  widthSelectors: Omit<WidthSelectorConfig, "transformValue">[]
  zenMode: ZenModeConfig
  cleanMode: ZenModeConfig
  quickQuote: NonNullable<BuiltinSiteConfig["quickQuote"]>
  supportsHostThemeSync: boolean
  sitePrivateSelectors: DoubaoPrivateSelectors
}

/** 内置修复修改默认配置时必须递增，使旧缓存 patch 自动失效。 */
export const DOUBAO_CONFIG_VERSION = 3

const createDoubaoConfig = (): DoubaoSiteConfig => {
  const sidebarRoot = "#flow_chat_sidebar"
  const conversationItem = `${sidebarRoot} a[id^="conversation_"][href*="/chat/"]`
  const newChatButton = `${sidebarRoot} > div:nth-child(2)`
  const virtualScroll = '[class*="v_list_scroller"]'
  const virtualRow = ".v_list_row"
  const messageBlock = '[data-target-id="message-box-target-id"]'
  const messageId = "[data-message-id]"
  const userQuery = `${messageId}.justify-end`
  const userQueryTextContainers = [
    ".whitespace-pre-wrap.wrap-anywhere:not(.gh-user-query-markdown)",
    ".md-box-root:not(.gh-user-query-markdown)",
  ]
  const userQueryTextContainer = userQueryTextContainers.join(", ")
  const assistantResponse = `${messageId}:not(.justify-end)`
  const assistantMarkdownSelectors = [".flow-markdown-body", ".md-box-root"]
  const assistantMarkdown = assistantMarkdownSelectors.join(", ")
  const assistantContent = assistantMarkdownSelectors
    .map((selector) => `${assistantResponse} ${selector}`)
    .join(", ")
  const userAttachmentBlock = '[data-plugin-identifier="block_type:10052"]'
  const userAttachmentCard = `${userAttachmentBlock} [data-available="true"]`
  const generatedImageBlock = '[data-plugin-identifier="block_type:2074"]'
  const assistantImageContainers =
    '[class*="image-wrapper"], [class*="image-box-grid-item"], [class*="image-box-grid"]'
  const mainLayoutScope = '[data-container-name="main"]'
  const contentWidthRoot = "#chat-route-layout"
  const contentWidth = `${mainLayoutScope} .max-w-\\(--content-max-width\\)`
  const contentWidthVar = `${mainLayoutScope} .max-w-\\[var\\(--content-max-width\\)\\]`
  const contentColumn = `${mainLayoutScope} .flex.h-full.min-h-0.w-full.flex-1.flex-col:has(${virtualScroll}):has([class*="input-content-container"])`
  const newChatSafeArea = `${mainLayoutScope} [class*="-mt-[var(--header-height)]"][class*="flex-grow"][class*="items-center"]:has([class*="input-content-container"])`
  const canvasScope = "aside:has(.code-canvas)"
  // v3 模型切换入口换成 div 形态的 Radix trigger，用语义化的 data-valid-btn 定位
  const modelSelectorButton = '[data-valid-btn="model-select-action-btn"]'
  const dropdownMenuTrigger = 'button[data-slot="dropdown-menu-trigger"][aria-haspopup="menu"]'
  // v3 停止按钮无 testid，退化为 CSS module 前缀匹配
  const stopButtonSelectors = [
    '[data-testid="chat_input_local_break_button"]',
    '[class*="break-btn-"]',
  ]

  return {
    capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.DOUBAO]],
    selectors: {
      textarea: [
        // v3 输入框为 TipTap（ProseMirror）编辑器
        '[data-guidance-input-boundary] [contenteditable="true"][role="textbox"]',
        '.tiptap.ProseMirror[contenteditable="true"]',
        '[data-slate-editor="true"]',
        'textarea[data-testid="chat_input_input"]',
        "textarea.semi-input-textarea",
      ],
      submitButton: [
        "#flow-end-msg-send",
        ".send-btn-wrapper button",
        "[data-testid='chat_input_send_button']",
      ],
      responseContainer: virtualScroll,
      chatContent: [assistantContent, userQuery],
      userQuery,
      assistantResponse,
      newChatButton: [newChatButton],
      stopButton: stopButtonSelectors,
    },
    input: { mode: "contenteditable", submitKey: "Enter" },
    conversation: {
      itemSelector: conversationItem,
      idFrom: { attr: "id", regex: "^conversation_(.+)$" },
      titleSelector:
        '[data-testid="chat_list_item_title"], [class*="overallTitle-"], [class*="title-"]',
      urlTemplate: "/chat/{id}",
      activeMatch: '[aria-current="page"], [class*="active-link-"], .e2e-test-active',
      navigationStrategy: "click-item",
      shadow: false,
    },
    generating: { existsSelectors: stopButtonSelectors },
    modelSwitcher: {
      selectorButtonSelectors: [modelSelectorButton, dropdownMenuTrigger],
      menuItemSelector: 'div[role="menuitem"][data-slot="dropdown-menu-item"]',
      menuRenderDelay: 100,
    },
    export: {
      userQuerySelector: userQuery,
      assistantResponseSelector: assistantResponse,
      turnSelector: messageBlock,
      useShadowDOM: false,
    },
    widthSelectors: [
      { selector: mainLayoutScope, property: "max-width" },
      { selector: ".max-w-\\(--content-max-width\\)", property: "max-width" },
      { selector: ".max-w-\\[var\\(--content-max-width\\)\\]", property: "max-width" },
      { selector: '[style*="--content-max-width"]', property: "--content-max-width" },
      { selector: ".chrome70-container", property: "--center-content-max-width" },
    ],
    zenMode: { hide: ["nav", ".container-qOgFQp", ".container-hzjmF1"] },
    cleanMode: { hide: [".container-qOgFQp", '[aria-label="活动入口"]'] },
    quickQuote: "native",
    supportsHostThemeSync: false,
    sitePrivateSelectors: {
      nativeQuotePopover: [
        '[data-word-selection-toolbar="true"]',
        ".toolContainer-tlVomx",
        ".toolItem-C_B5bD",
      ],
      slateElement: '[data-slate-node="element"]',
      historyContainer: `${sidebarRoot} [data-history-container="true"]`,
      pinnedConversation: '[class*="pin-"]',
      virtualRow,
      virtualScrollHolder: '[data-name="scroll_holder"]',
      shareMessageList: '[class*="message-list-root-"]',
      messageBlock,
      messageId,
      userQueryTextContainer,
      renderedUserQueryMarkdown: userQueryTextContainers[1],
      assistantMarkdown,
      assistantExportDecoration: [
        "button",
        "[role='button']",
        "svg",
        "[aria-hidden='true']",
        "picture",
        "img",
        '[data-foundation-type="receive-message-action-bar"]',
        '[data-foundation-type="receive-message-suggest-foundation"]',
      ].join(", "),
      userAttachmentCard,
      generatedImageBlock,
      assistantImageContainers,
      generatedImageWrapper: '[class*="image-wrapper"]',
      generatedImageGridItem: '[class*="image-box-grid-item"]',
      modelName: ".truncate",
      // v2 侧边栏标题为悬停滚动（marquee）结构，同一标题在 DOM 中重复 3 份；
      // 视口 span 的 title 属性始终是完整标题，取它比 textContent 更可靠
      conversationMarqueeTitle: '[data-testid="conversation-list-v2-item"] span[title]',
      conversationMenuWrapper: '[class*="chat-item-menu-wrapper-"]',
      conversationMenuTrigger: dropdownMenuTrigger,
      conversationMenuInnerButton: 'button[data-dbx-name="button"]',
      conversationMenuGenericTrigger: 'button[aria-haspopup="menu"]',
      deleteMenuItem:
        '[data-radix-popper-content-wrapper] [role="menuitem"][data-slot="dropdown-menu-item"]',
      deleteDangerIndicator: ".text-dbx-function-danger",
      deleteConfirmButton: 'button[class*="bg-dbx-function-danger"]',
      openDeleteDialog: '[role="dialog"][data-state="open"][data-slot="dialog-content"]',
      deleteDialog: '[role="dialog"][aria-modal="true"], [role="dialog"]',
      openConversationMenu:
        '[data-radix-popper-content-wrapper] [role="menu"][data-state="open"], [data-radix-popper-content-wrapper] [role="menu"]',
      mainLayoutScope,
      contentWidthRoot,
      contentWidth,
      contentWidthVar,
      contentColumn,
      newChatSafeArea,
      canvasScope,
      canvasSafeArea: `${canvasScope} .code-canvas`,
      userQueryWidth: [
        `${userQuery} .w-fit[class*="max-w-"]`,
        `${userQuery} [data-plugin-identifier="block_type:10000"] > .bg-g-send-msg-bubble-bg`,
      ],
    },
  }
}

export const DOUBAO_CONFIG = createDoubaoConfig()
