/**
 * Perplexity 适配器（www.perplexity.ai）
 *
 * 设计目标：
 * - 优先依赖相对稳定的 id / data-testid / 路由结构
 * - 输入框与消息区域使用多重选择器兜底，兼容首页与线程页
 * - 会话列表优先从侧边栏 DOM 读取，必要时用线程 API 预拉取做缓存
 */
import { SITE_IDS } from "~constants"
import { DOMToolkit } from "~utils/dom-toolkit"
import { htmlToMarkdown } from "~utils/exporter"

import {
  SiteAdapter,
  type ConversationInfo,
  type ConversationDeleteTarget,
  type ConversationObserverConfig,
  type ExportConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type SiteDeleteConversationResult,
  type ZenModeConfig,
} from "./base"

const HOSTNAMES = new Set(["www.perplexity.ai", "perplexity.ai"])
const THREAD_PATH_PATTERN = /^\/(?:search|page)\/([^/?#]+)(?:\/|$)/i
const NEW_THREAD_PATH_PATTERN = /^\/search\/new(?:\/|$)/i

const TEXTAREA_SELECTORS = [
  "#ask-input",
  'div[contenteditable="true"][role="textbox"]:not([id])',
  'div[contenteditable="true"][g_editable="true"]',
  'div[contenteditable="true"][data-lexical-editor="true"]',
  'div[contenteditable="true"][role="textbox"]',
]

const SUBMIT_BUTTON_SELECTOR = 'button[data-testid="submit-button"], button[type="submit"]'
const STOP_BUTTON_SELECTOR =
  'button[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="stop"]'
const NEW_CHAT_BUTTON_SELECTORS = [
  'a[href="/"]',
  'a[href="/search/new"]',
  'button[data-testid="new-thread-button"]',
]

const USER_QUERY_SELECTOR = [
  ".group\\/query",
  "[role='tabpanel'] .group.relative.flex.items-end.mb-xs",
].join(", ")

const USER_QUERY_CONTENT_SELECTOR = [
  ".group\\/query .whitespace-pre-wrap",
  ".group\\/query [dir='auto']",
  ".group\\/query p",
  ".group\\/query [data-lexical-text='true']",
  "[role='tabpanel'] .group.relative.flex.items-end.mb-xs .whitespace-pre-wrap",
  "[role='tabpanel'] .group.relative.flex.items-end.mb-xs [dir='auto']",
  "[role='tabpanel'] .group.relative.flex.items-end.mb-xs p",
  "[role='tabpanel'] .group.relative.flex.items-end.mb-xs [data-lexical-text='true']",
].join(", ")

const ASSISTANT_MESSAGE_SELECTOR = [
  "div[id*='markdown-content-']",
  "div[id*='Markdown-Content-']",
].join(", ")

const RESPONSE_CONTAINER_SELECTOR = [
  "[role='tabpanel']",
  "main [class*='overflow-y-auto']",
  "main [class*='overflow-auto']",
  "main",
].join(", ")

const SIDEBAR_LINK_SELECTOR = "a[href^='/search/'], a[href^='/page/']"
const SIDEBAR_ITEM_CONTAINER_SELECTORS = [
  ".group\\/sidebar-submenu",
  "[data-title-hover='true']",
  "[data-testid='sidebar-item']",
  "li",
  "[role='listitem']",
].join(", ")
const SIDEBAR_SCROLL_CONTAINER_SELECTORS = [".group\\/sidebar", "aside", "nav"]
const THREAD_TITLE_SELECTOR =
  ".h-headerHeight.fixed.z-10 .cursor-pointer.transition.duration-300.hover\\:opacity-70, input[placeholder='Untitled']"

const QUERY_EDIT_BUTTON_SELECTOR = 'button[data-testid="edit-query-button"]'
const THREAD_LIST_ENDPOINT_PATH = "/rest/thread/list_ask_threads?version=2.18&source=default"
const THREAD_LIST_PAGE_SIZE = 100
const THREAD_LIST_MAX_PAGES = 5
const THREAD_LIST_CACHE_TTL_MS = 5 * 60 * 1000
const THREAD_LIST_REQUEST_TIMEOUT_MS = 10_000
const DELETE_FLOW_TIMEOUT_MS = 5_000

const THREAD_ACTION_BUTTON_SELECTORS = [
  'button[aria-label="Thread actions"]',
  'button[aria-label*="Thread actions" i]',
  'button[aria-label*="More" i]',
  'button[title*="More" i]',
  'button[aria-haspopup="menu"]',
  '[role="button"][aria-haspopup="menu"]',
  'button[aria-label*="话题"]',
  'button[aria-label*="对话"]',
  'button[aria-label*="线程"]',
]

const DELETE_MENU_ITEM_LABELS = ["Delete", "删除", "删除问题", "Delete question", "Delete thread"]
const RENAME_MENU_ITEM_LABELS = ["Rename", "重命名", "Edit title", "编辑问题标题"]
const CONFIRM_BUTTON_LABELS = ["Confirm", "确认", "确定", "Delete", "删除", "Yes", "OK"]
const CANCEL_BUTTON_LABELS = ["Cancel", "取消", "No"]
const SAVE_BUTTON_LABELS = ["Save", "保存"]
const RENAME_DIALOG_TITLE_LABELS = [
  "编辑问题标题",
  "Rename",
  "Rename thread",
  "Edit title",
  "Edit question title",
]

const THREAD_ACTION_LABELS = ["Thread actions", "话题操作", "对话操作", "线程操作"]
const THREAD_ACTION_SIGNAL_LABELS = [
  ...THREAD_ACTION_LABELS,
  "More",
  "更多",
  "菜单",
  "menu",
  "...",
  "…",
]
const MODEL_MENU_HINTS = [
  "best",
  "sonar",
  "gpt",
  "claude",
  "gemini",
  "nemotron",
  "o1",
  "o3",
  "o4",
  "r1",
  "最佳",
  "模型",
]
const MODEL_SELECTOR_PRIMARY_HINTS = [
  "best",
  "sonar",
  "gpt",
  "claude",
  "gemini",
  "nemotron",
  "o1",
  "o3",
  "o4",
  "r1",
  "最佳",
]
const MODEL_SELECTOR_BUTTON_SELECTORS = [
  'button[aria-label="模型"][aria-haspopup="menu"]',
  'button[aria-label*="模型"][aria-haspopup="menu"]',
  'button[aria-label*="GPT"][aria-haspopup="menu"]',
  'button[aria-label*="Gemini"][aria-haspopup="menu"]',
  'button[aria-label*="Claude"][aria-haspopup="menu"]',
  'button[aria-label*="Sonar"][aria-haspopup="menu"]',
]
const MODEL_SELECTOR_EXCLUDE_PATTERNS = [
  /线程操作|讨论线程的操作|更多操作|下载|改写问题|添加文件或工具|分享|深度研究|连接器和来源|上传文件或图片|模型委员会|附件|来源|研究/i,
]

const ZEN_MODE_HIDE_SELECTORS = [
  ".group\\/sidebar",
  "aside",
  'nav:has(a[href^="/search/"])',
  'nav:has(a[href^="/page/"])',
]
const CLEAN_MODE_HIDE_SELECTORS = [
  "footer",
  "[data-testid='disclaimer']",
  "[data-testid='assistant-disclaimer']",
  "[data-testid='legal-disclaimer']",
]

const EXPORT_ROLE_ATTR = "data-gh-perplexity-export-role"
const EXPORT_USER_SELECTOR = `[${EXPORT_ROLE_ATTR}="user"]`
const EXPORT_ASSISTANT_SELECTOR = `[${EXPORT_ROLE_ATTR}="assistant"]`

interface PerplexityThreadListEntry {
  slug?: unknown
  thread_url_slug?: unknown
  link?: unknown
  title?: unknown
  uuid?: unknown
  context_uuid?: unknown
  id?: unknown
}

interface PerplexityThreadIdentifiers {
  slug: string
  apiIds: string[]
}

function getPerplexityOrigin(): string {
  if (typeof window !== "undefined" && HOSTNAMES.has(window.location.hostname)) {
    return window.location.origin
  }

  return "https://www.perplexity.ai"
}

function buildPerplexityUrl(pathname: string): string {
  return new URL(pathname, getPerplexityOrigin()).toString()
}

export class PerplexityAdapter extends SiteAdapter {
  private threadListCache: ConversationInfo[] = []
  private threadListCacheExpiresAt = 0
  private loadAllConversationsPromise: Promise<void> | null = null
  private lastManualModelSelectorToggleAt = 0
  private zenCalibrationTimer: ReturnType<typeof setTimeout> | null = null
  private zenCalibrationFollowupTimers: Array<ReturnType<typeof setTimeout>> = []
  private zenCalibrationRaf: number | null = null
  private zenCalibrationObserver: MutationObserver | null = null
  private zenCalibrationResizeObserver: ResizeObserver | null = null
  private zenCorrectionTargets: HTMLElement[] = []
  private zenCorrectionPx = 0

  match(): boolean {
    return HOSTNAMES.has(window.location.hostname)
  }

  getSiteId(): string {
    return SITE_IDS.PERPLEXITY
  }

  getName(): string {
    return "Perplexity"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#1fb8cd", secondary: "#1597aa" }
  }

  getSessionId(): string {
    const match = window.location.pathname.match(THREAD_PATH_PATTERN)
    const slug = match?.[1]?.trim() || ""
    return slug === "new" ? "" : slug
  }

  isNewConversation(): boolean {
    const path = window.location.pathname.replace(/\/+$/, "") || "/"
    return path === "/" || NEW_THREAD_PATH_PATTERN.test(path) || !THREAD_PATH_PATTERN.test(path)
  }

  getNewTabUrl(): string {
    return buildPerplexityUrl("/")
  }

  getSessionName(): string | null {
    const title = document.title.trim()
    if (!title) return null

    const cleaned = title
      .replace(/\s*[-|]\s*Perplexity$/i, "")
      .replace(/\s*[-|]\s*Perplexity AI$/i, "")
      .trim()

    if (!cleaned || /^perplexity(?:\s+ai)?$/i.test(cleaned)) {
      return null
    }

    return cleaned
  }

  getConversationTitle(): string | null {
    const sessionId = this.getSessionId()
    if (sessionId) {
      const sidebarTitle = this.getSidebarConversationTitle(sessionId)
      if (sidebarTitle) return sidebarTitle
    }

    const titleElement = document.querySelector(THREAD_TITLE_SELECTOR)
    const title =
      titleElement instanceof HTMLInputElement
        ? titleElement.value.trim()
        : titleElement?.textContent?.trim() || ""

    return title || null
  }

  getCurrentConversationInfo(): ConversationInfo | null {
    const id = this.getSessionId()
    if (!id || this.isNewConversation()) {
      return null
    }

    return {
      id,
      title: this.getConversationTitle() || id,
      url: window.location.href,
      cid: this.getCurrentCid() || undefined,
    }
  }

  getTextareaSelectors(): string[] {
    return [...TEXTAREA_SELECTORS]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (!super.isValidTextarea(element)) return false

    if (element.id === "ask-input") return true
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return true

    return (
      element.isContentEditable &&
      (element.getAttribute("role") === "textbox" ||
        element.getAttribute("g_editable") === "true" ||
        element.closest("form") !== null)
    )
  }

  insertPrompt(content: string): boolean {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return false

    editor.focus()

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      this.setTextEntryValue(editor, content)
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, composed: true, data: content }),
      )
      editor.dispatchEvent(new Event("change", { bubbles: true }))
      if (editor instanceof HTMLTextAreaElement) {
        editor.setSelectionRange(content.length, content.length)
      }
      return true
    }

    const richEditor = editor as HTMLElement
    this.selectEditorContents(richEditor)

    try {
      document.execCommand("delete", false)
    } catch {
      // ignore legacy API failure and continue with fallbacks
    }

    try {
      if (document.execCommand("insertText", false, content)) {
        this.dispatchEditorInputEvents(richEditor, content, "insertText")
        this.placeCaretAtEnd(richEditor)
        return true
      }
    } catch {
      // fallback below
    }

    if (this.dispatchPasteEvent(richEditor, content)) {
      this.placeCaretAtEnd(richEditor)
      return true
    }

    richEditor.textContent = content
    this.dispatchEditorInputEvents(richEditor, content, "insertText")
    this.placeCaretAtEnd(richEditor)
    return true
  }

  clearTextarea(): void {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return

    editor.focus()

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      this.setTextEntryValue(editor, "")
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: "" }))
      editor.dispatchEvent(new Event("change", { bubbles: true }))
      if (editor instanceof HTMLTextAreaElement) {
        editor.setSelectionRange(0, 0)
      }
      return
    }

    const richEditor = editor as HTMLElement
    this.selectEditorContents(richEditor)

    try {
      document.execCommand("delete", false)
    } catch {
      // fallback below
    }

    richEditor.textContent = ""
    this.dispatchEditorInputEvents(richEditor, "", "deleteContentBackward")
    this.placeCaretAtEnd(richEditor)
  }

  getSubmitButtonSelectors(): string[] {
    return [`${SUBMIT_BUTTON_SELECTOR}:not([disabled])`]
  }

  findSubmitButton(editor: HTMLElement | null): HTMLElement | null {
    const scopes = [
      editor?.closest("form"),
      editor?.parentElement,
      editor?.closest(".grow.block"),
      document.body,
    ].filter(Boolean) as ParentNode[]

    for (const scope of scopes) {
      const candidates = scope.querySelectorAll(SUBMIT_BUTTON_SELECTOR)
      for (const candidate of Array.from(candidates)) {
        const button = candidate as HTMLElement
        if (!this.isVisibleElement(button) || this.isDisabledActionButton(button)) continue
        return button
      }
    }

    return super.findSubmitButton(editor)
  }

  getUsageCounterMountAnchor(
    editor: HTMLElement,
    submitButton: HTMLElement | null,
  ): HTMLElement | null {
    const candidates = [
      editor.closest(".grow.block"),
      submitButton?.closest(".grow.block") || null,
      DOMToolkit.closestComposed(editor, ".grow.block"),
      submitButton ? DOMToolkit.closestComposed(submitButton, ".grow.block") : null,
      editor.closest("[role='tabpanel']"),
      submitButton?.closest("[role='tabpanel']") || null,
    ].filter(Boolean) as HTMLElement[]

    for (const candidate of candidates) {
      const safeAnchor = this.promoteUsageCounterAnchor(candidate)
      if (safeAnchor?.parentElement) {
        return safeAnchor
      }
    }

    return null
  }

  getStopButtonSelectors(): string[] {
    return [STOP_BUTTON_SELECTOR]
  }

  isGenerating(): boolean {
    const stopButton = this.findVisibleElementBySelectors(this.getStopButtonSelectors())
    return Boolean(stopButton)
  }

  getNewChatButtonSelectors(): string[] {
    return [...NEW_CHAT_BUTTON_SELECTORS]
  }

  getScrollContainer(): HTMLElement | null {
    const selectors = RESPONSE_CONTAINER_SELECTOR.split(",").map((selector) => selector.trim())

    for (const selector of selectors) {
      const candidates = document.querySelectorAll(selector)
      for (const candidate of Array.from(candidates)) {
        const element = candidate as HTMLElement
        if (element.scrollHeight > element.clientHeight + 40) {
          return element
        }
      }
    }

    return document.scrollingElement as HTMLElement | null
  }

  getSidebarScrollContainer(): Element | null {
    for (const selector of SIDEBAR_SCROLL_CONTAINER_SELECTORS) {
      const candidate = document.querySelector(selector)
      if (!(candidate instanceof HTMLElement)) continue

      const scrollable = this.findScrollableParent(candidate)
      if (scrollable) return scrollable
      return candidate
    }

    return document.scrollingElement
  }

  getConversationList(): ConversationInfo[] {
    const domList = this.collectConversationListFromDom()
    const cachedList = this.getCachedThreadList()
    const currentConversation = this.getCurrentConversationInfo()
    const currentList = currentConversation ? [currentConversation] : []

    if (domList.length === 0 && cachedList.length === 0) return currentList
    if (domList.length === 0) return this.mergeConversationInfos(cachedList, currentList)
    if (cachedList.length === 0) return this.mergeConversationInfos(domList, currentList)

    return this.mergeConversationInfos(cachedList, domList, currentList)
  }

  hasAuthoritativeConversationList(): boolean {
    return Date.now() <= this.threadListCacheExpiresAt
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    return {
      selector: SIDEBAR_LINK_SELECTOR,
      shadow: false,
      enablePolling: true,
      pollIntervalMs: 1500,
      extractInfo: (element) => this.extractConversationInfo(element),
      extractRemovedInfo: (element) =>
        this.extractConversationInfo(element, { allowDisconnected: true }),
      getTitleElement: (element) => this.findConversationItemContainer(element) || element,
    }
  }

  async deleteConversationsOnSite(
    targets: ConversationDeleteTarget[],
  ): Promise<SiteDeleteConversationResult[]> {
    const results: SiteDeleteConversationResult[] = []
    const deletedSlugs = new Set<string>()
    let deletedViaApi = false

    for (const target of targets) {
      const slug =
        this.parseThreadSlugFromUrl(target.url || "") ||
        this.parseThreadSlugFromUrl(target.id) ||
        target.id
      const result = await this.deleteConversationOnSite(target)
      results.push(result)

      if (result.success && slug) {
        deletedSlugs.add(slug)
        if (result.method === "api") {
          deletedViaApi = true
        }
      }
    }

    this.refreshPageAfterNativeApiDelete(deletedSlugs, deletedViaApi)
    return results
  }

  async deleteConversationOnSite(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    const identifiers = await this.resolveThreadIdentifiers(target.id, target.url)
    const apiResult = await this.deleteConversationViaNativeApi(target.id, identifiers)
    if (apiResult.success) {
      this.syncConversationListAfterDelete(identifiers.slug)
      if (identifiers.slug !== target.id) {
        this.syncConversationListAfterDelete(target.id)
      }
      return {
        id: target.id,
        success: true,
        method: "api",
      }
    }

    const result = await this.deleteConversationViaUi(identifiers.slug)

    return {
      id: target.id,
      success: result.success,
      method: result.success ? "ui" : apiResult.method,
      reason: result.success ? undefined : result.reason || apiResult.reason,
    }
  }

  async renameConversationOnSite(
    target: { id: string; title?: string; url?: string },
    newTitle: string,
  ): Promise<{ success: boolean; method: "api" | "ui" | "none"; reason?: string }> {
    const identifiers = await this.resolveThreadIdentifiers(target.id, target.url)
    const apiResult = await this.renameConversationViaNativeApi(identifiers, newTitle)
    if (apiResult.success) {
      this.syncConversationListAfterRename(identifiers.slug, newTitle)
      if (identifiers.slug !== target.id) {
        this.syncConversationListAfterRename(target.id, newTitle)
      }
      return {
        success: true,
        method: "api",
      }
    }

    const result = await this.renameConversationViaUi(identifiers.slug, newTitle)
    return {
      success: result.success,
      method: "ui",
      reason: result.success ? undefined : result.reason || apiResult.reason,
    }
  }

  async loadAllConversations(): Promise<void> {
    if (this.loadAllConversationsPromise) {
      return this.loadAllConversationsPromise
    }

    this.loadAllConversationsPromise = (async () => {
      try {
        const apiThreads = await this.fetchThreadsViaApi()
        this.cacheThreadList(apiThreads)
      } catch {
        // Thread-list preloading is best-effort. Perplexity can return 403 on login
        // pages, and navigation can abort fetches; visible-sidebar sync remains active.
      } finally {
        this.loadAllConversationsPromise = null
      }
    })()

    return this.loadAllConversationsPromise
  }

  navigateToConversation(id: string, url?: string): boolean {
    return super.navigateToConversation(id, url || buildPerplexityUrl(`/search/${id}`))
  }

  getResponseContainerSelector(): string {
    return RESPONSE_CONTAINER_SELECTOR
  }

  getChatContentSelectors(): string[] {
    return [USER_QUERY_SELECTOR, ASSISTANT_MESSAGE_SELECTOR]
  }

  getUserQuerySelector(): string | null {
    return USER_QUERY_SELECTOR
  }

  getLatestReplyText(): string | null {
    const responses = this.collectTopLevelBlocks(
      Array.from(document.querySelectorAll(ASSISTANT_MESSAGE_SELECTOR)).filter(
        (element) =>
          !this.shouldSkipExportElement(element) && !element.closest(USER_QUERY_SELECTOR),
      ),
    )
    const last = responses[responses.length - 1]
    return last ? this.extractAssistantResponseText(last) : null
  }

  extractUserQueryText(element: Element): string {
    const source = (this.findUserContentRoot(element) || element).cloneNode(true) as HTMLElement
    source
      .querySelectorAll(
        ".gh-user-query-markdown, button, [role='button'], svg, [aria-hidden='true'], [data-testid]",
      )
      .forEach((node) => node.remove())

    return this.extractTextWithLineBreaks(source).trim()
  }

  extractUserQueryMarkdown(element: Element): string {
    return this.extractUserQueryText(element)
  }

  extractUserQueryExportContent(element: Element): string {
    return this.extractUserQueryMarkdown(element)
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    const contentRoot = this.findUserContentRoot(element)
    if (!contentRoot) return false
    if (element.querySelector(".gh-user-query-markdown")) return false

    const rendered = document.createElement("div")
    rendered.className =
      `${contentRoot.className || ""} gh-user-query-markdown gh-markdown-preview`.trim()
    rendered.innerHTML = html

    const inlineStyle = contentRoot.getAttribute("style")
    if (inlineStyle) {
      rendered.setAttribute("style", inlineStyle)
    }

    contentRoot.classList.add("gh-user-query-raw")
    contentRoot.style.display = "none"
    contentRoot.after(rendered)
    return true
  }

  extractAssistantResponseText(element: Element): string {
    const clone = element.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(
        "button, [role='button'], svg, [aria-hidden='true'], .gh-user-query-markdown, [data-testid='copy-code-button']",
      )
      .forEach((node) => node.remove())

    const markdown = htmlToMarkdown(clone) || this.extractTextWithLineBreaks(clone)
    return markdown.trim()
  }

  getAssistantMermaidSupportMode(): "native" | "fallback" | "unsupported" {
    return "fallback"
  }

  getExportConfig(): ExportConfig {
    return {
      userQuerySelector: EXPORT_USER_SELECTOR,
      assistantResponseSelector: EXPORT_ASSISTANT_SELECTOR,
      turnSelector: null,
      useShadowDOM: false,
    }
  }

  async prepareConversationExport(): Promise<unknown> {
    this.clearExportMarkers()
    const container =
      document.querySelector("[role='tabpanel']") || document.querySelector("main") || document.body
    this.markExportMessages(container)
    return null
  }

  async restoreConversationAfterExport(): Promise<void> {
    this.clearExportMarkers()
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const outline: OutlineItem[] = []
    const container = this.getOutlineContainer()
    if (!container) return outline

    const userQuerySelector = this.getUserQuerySelector()
    if (!userQuerySelector) return outline

    const rawUserQueries = Array.from(container.querySelectorAll(userQuerySelector))
    const userQueries = this.dedupeUserQueries(
      this.collectTopLevelBlocks(rawUserQueries).filter(
        (element) =>
          !this.shouldSkipOutlineElement(element) && this.isValidUserQueryCandidate(element),
      ),
      container,
    )
    const assistantRoots = this.collectAssistantRoots(container)
    const userQueryKeyCounts = new Map<string, number>()
    let currentGroupId = "preamble"

    const blocks = [...userQueries, ...assistantRoots].sort((left, right) =>
      this.compareElementsByDocumentOrder(left, right),
    )

    blocks.forEach((element, index) => {
      const isUserQuery = element.matches(userQuerySelector)

      if (isUserQuery) {
        if (!includeUserQueries) return

        const fullText = this.extractUserQueryText(element)
        if (!fullText) return

        const item: OutlineItem = {
          level: 0,
          text: this.truncateText(fullText, 80),
          element,
          isUserQuery: true,
          isTruncated: fullText.length > 80,
        }
        item.id = this.buildOutlineOccurrenceId(
          "query",
          this.normalizeUiText(fullText),
          userQueryKeyCounts,
        )
        currentGroupId = item.id

        if (showWordCount) {
          const nextUserQuery =
            blocks.slice(index + 1).find((candidate) => candidate.matches(userQuerySelector)) ||
            null
          item.wordCount = this.calculateAssistantWordCountBetween(
            container,
            element,
            nextUserQuery,
          )
        }

        outline.push(item)
        return
      }

      const assistantItems = this.collectAssistantOutlineItems(
        element,
        currentGroupId,
        maxLevel,
        showWordCount,
      )

      if (assistantItems.length > 0) {
        outline.push(...assistantItems)
      }
    })

    return outline
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig | null {
    return {
      urlPatterns: ["/rest/sse/perplexity_ask"],
      silenceThreshold: 2500,
    }
  }

  getWidthSelectors(): Array<{ selector: string; property: string }> {
    return [
      { selector: "[role='tabpanel'] .mx-auto", property: "maxWidth" },
      { selector: "main .mx-auto", property: "maxWidth" },
    ]
  }

  getUserQueryWidthSelectors(): Array<{ selector: string; property: string }> {
    return [{ selector: USER_QUERY_SELECTOR, property: "maxWidth" }]
  }

  getZenModeConfig(): ZenModeConfig | null {
    return {
      rootClass: {
        selector: "body",
        className: "ophel-perplexity-zen-mode",
      },
      hide: [...ZEN_MODE_HIDE_SELECTORS],
      styles: [
        { selector: ":root", property: "--sidebar-pinned-width", value: "0px" },
        {
          selector: "html, body, body *",
          property: "--sidebar-pinned-width",
          value: "0px",
        },
        {
          selector: "body.ophel-perplexity-zen-mode",
          property: "--sidebar-pinned-width",
          value: "0px",
          extraCss:
            "--ophel-perplexity-zen-correction: 0px !important; --ophel-perplexity-zen-edge-gap: clamp(16px, 3dvw, 32px) !important; --ophel-perplexity-zen-content-width: min(1120px, calc(100dvw - (var(--ophel-perplexity-zen-edge-gap) * 2))) !important; overflow-x: hidden !important;",
        },
        {
          selector: "body.ophel-perplexity-zen-mode :is(#root, #__next, [data-nextjs-root])",
          property: "margin-left",
          value: "0px",
          extraCss:
            "left: 0 !important; right: 0 !important; transform: none !important; padding-left: 0 !important; padding-right: 0 !important; width: 100dvw !important; max-width: 100dvw !important;",
        },
        {
          selector: "body.ophel-perplexity-zen-mode main",
          property: "margin-left",
          value: "0px",
          extraCss:
            "margin-right: 0 !important; left: 0 !important; right: 0 !important; transform: none !important; padding-left: 0 !important; padding-right: 0 !important; width: 100dvw !important; max-width: 100dvw !important; min-width: 0 !important; box-sizing: border-box !important;",
        },
        {
          selector:
            "body.ophel-perplexity-zen-mode :is(main, [role='tabpanel'], .fixed, .sticky, [class*='fixed'], [class*='sticky']):has(#ask-input), body.ophel-perplexity-zen-mode :is(main, [role='tabpanel'], .fixed, .sticky, [class*='fixed'], [class*='sticky']):has([contenteditable='true'][role='textbox'])",
          property: "margin-left",
          value: "0px",
          extraCss:
            "margin-right: 0 !important; left: 0 !important; right: 0 !important; transform: none !important; padding-left: 0 !important; padding-right: 0 !important; width: 100dvw !important; max-width: 100dvw !important; min-width: 0 !important; box-sizing: border-box !important;",
        },
        {
          selector:
            "body.ophel-perplexity-zen-mode :is(div, section, footer):has(> form:has(#ask-input)), body.ophel-perplexity-zen-mode :is(div, section, footer):has(> form:has([contenteditable='true'][role='textbox']))",
          property: "margin-left",
          value: "calc(50% - 50dvw)",
          extraCss:
            "margin-right: calc(50% - 50dvw) !important; left: auto !important; right: auto !important; transform: none !important; padding-left: var(--ophel-perplexity-zen-edge-gap) !important; padding-right: var(--ophel-perplexity-zen-edge-gap) !important; width: 100dvw !important; max-width: 100dvw !important; min-width: 0 !important; box-sizing: border-box !important; display: block !important;",
        },
        {
          selector: "body.ophel-perplexity-zen-mode [role='tabpanel']",
          property: "max-width",
          value: "none",
          extraCss:
            "width: 100dvw !important; margin-left: 0 !important; margin-right: 0 !important; padding-left: 0 !important; padding-right: 0 !important; box-sizing: border-box !important;",
        },
        {
          selector: "body.ophel-perplexity-zen-mode main .mx-auto",
          property: "max-width",
          value: "var(--ophel-perplexity-zen-content-width)",
          extraCss:
            "width: min(100%, var(--ophel-perplexity-zen-content-width)) !important; margin-left: auto !important; margin-right: auto !important; box-sizing: border-box !important;",
        },
        {
          selector:
            "body.ophel-perplexity-zen-mode form:has(#ask-input), body.ophel-perplexity-zen-mode form:has([contenteditable='true'][role='textbox'])",
          property: "max-width",
          value: "var(--ophel-perplexity-zen-content-width)",
          extraCss:
            "width: min(100%, var(--ophel-perplexity-zen-content-width)) !important; margin-left: auto !important; margin-right: auto !important; box-sizing: border-box !important;",
        },
        {
          selector:
            "body.ophel-perplexity-zen-mode .ophel-perplexity-zen-center-target, body.ophel-perplexity-zen-mode .ophel-perplexity-zen-composer-center-target",
          property: "translate",
          value: "var(--ophel-perplexity-zen-correction, 0px) 0",
          extraCss: "will-change: translate !important;",
        },
        {
          selector:
            "body.ophel-perplexity-zen-mode :is(#ask-input, [contenteditable='true'][role='textbox'])",
          property: "max-width",
          value: "100%",
          extraCss: "box-sizing: border-box !important;",
        },
      ],
    }
  }

  onZenModeChanged(enabled: boolean): void {
    if (enabled) {
      this.startZenCenterCalibration()
    } else {
      this.stopZenCenterCalibration()
    }
  }

  getCleanModeConfig(): ZenModeConfig | null {
    return {
      hide: [...CLEAN_MODE_HIDE_SELECTORS],
    }
  }

  private startZenCenterCalibration(): void {
    this.stopZenCenterCalibration({ keepCorrection: false })
    this.scheduleZenCenterCalibration(0)
    this.zenCalibrationFollowupTimers = [80, 240, 600, 1200, 2200].map((delay) =>
      setTimeout(() => this.scheduleZenCenterCalibration(0), delay),
    )

    if (typeof MutationObserver !== "undefined" && document.body) {
      this.zenCalibrationObserver = new MutationObserver(() =>
        this.scheduleZenCenterCalibration(80),
      )
      this.zenCalibrationObserver.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
      })
    }

    if (typeof ResizeObserver !== "undefined") {
      this.zenCalibrationResizeObserver = new ResizeObserver(() =>
        this.scheduleZenCenterCalibration(40),
      )
      this.zenCalibrationResizeObserver.observe(document.documentElement)
      if (document.body) this.zenCalibrationResizeObserver.observe(document.body)
    }

    window.addEventListener("resize", this.handleZenCalibrationResize, { passive: true })
  }

  private stopZenCenterCalibration(options: { keepCorrection?: boolean } = {}): void {
    if (this.zenCalibrationTimer) {
      clearTimeout(this.zenCalibrationTimer)
      this.zenCalibrationTimer = null
    }

    this.zenCalibrationFollowupTimers.forEach((timer) => clearTimeout(timer))
    this.zenCalibrationFollowupTimers = []

    if (this.zenCalibrationRaf !== null) {
      cancelAnimationFrame(this.zenCalibrationRaf)
      this.zenCalibrationRaf = null
    }

    this.zenCalibrationObserver?.disconnect()
    this.zenCalibrationObserver = null
    this.zenCalibrationResizeObserver?.disconnect()
    this.zenCalibrationResizeObserver = null
    window.removeEventListener("resize", this.handleZenCalibrationResize)

    if (!options.keepCorrection) {
      this.zenCorrectionPx = 0
      this.applyZenCorrectionVariable(0, { remove: true })
    }

    this.clearZenCorrectionTargets()
  }

  private handleZenCalibrationResize = () => {
    this.scheduleZenCenterCalibration(40)
  }

  private scheduleZenCenterCalibration(delayMs: number): void {
    if (!document.body?.classList.contains("ophel-perplexity-zen-mode")) return

    if (this.zenCalibrationTimer) {
      clearTimeout(this.zenCalibrationTimer)
    }

    this.zenCalibrationTimer = setTimeout(() => {
      this.zenCalibrationTimer = null
      if (this.zenCalibrationRaf !== null) {
        cancelAnimationFrame(this.zenCalibrationRaf)
      }
      this.zenCalibrationRaf = requestAnimationFrame(() => {
        this.zenCalibrationRaf = null
        this.calibrateZenCenterFromComposer()
      })
    }, delayMs)
  }

  private calibrateZenCenterFromComposer(): void {
    if (!document.body?.classList.contains("ophel-perplexity-zen-mode")) return

    const target = this.getZenComposerMeasurementTarget()
    if (!target) {
      this.clearZenCorrectionTargets()
      return
    }

    this.markZenCorrectionTargets(this.getZenCorrectionTargets(target))

    const rect = target.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const leftGap = rect.left
    const rightGap = window.innerWidth - rect.right
    const diff = leftGap - rightGap
    if (Math.abs(diff) <= 2) return

    const nextCorrection = this.clampZenCorrection(this.zenCorrectionPx - diff / 2)
    if (Math.abs(nextCorrection - this.zenCorrectionPx) <= 0.5) return

    this.zenCorrectionPx = nextCorrection
    this.applyZenCorrectionVariable(nextCorrection)

    // Let layout settle and re-measure once; this handles late composer hydration.
    this.scheduleZenCenterCalibration(80)
  }

  private getZenComposerMeasurementTarget(): HTMLElement | null {
    const editor = this.getTextareaElement()
    const pageColumn = editor ? this.findZenHomeContentColumn(editor) : null
    if (pageColumn) {
      return pageColumn
    }

    const shell = editor ? this.findZenComposerShell(editor) : null
    if (shell) {
      return shell
    }

    const form = editor?.closest("form")
    if (form instanceof HTMLElement && this.isVisibleElement(form)) {
      return form
    }

    const fallback =
      document.querySelector("form:has(#ask-input)") ||
      document.querySelector("form:has([contenteditable='true'][role='textbox'])")
    if (fallback instanceof HTMLElement && this.isVisibleElement(fallback)) {
      return fallback
    }

    return editor instanceof HTMLElement && this.isVisibleElement(editor) ? editor : null
  }

  private findZenHomeContentColumn(editor: HTMLElement): HTMLElement | null {
    const viewportWidth = Math.max(window.innerWidth, 1)
    const viewportHeight = Math.max(window.innerHeight, 1)
    const candidates: Array<{ element: HTMLElement; score: number }> = []

    let current: HTMLElement | null = editor
    while (current && current !== document.body && current !== document.documentElement) {
      if (this.isVisibleElement(current)) {
        const rect = current.getBoundingClientRect()
        const containsEditor = current === editor || current.contains(editor)
        const widthOk = rect.width >= 640 && rect.width <= viewportWidth - 24
        const heightOk = rect.height >= 120 && rect.height <= Math.max(viewportHeight, 360)

        if (containsEditor && widthOk && heightOk) {
          const signal = this.getZenHomeContentSignal(current)
          let score = 0
          if (signal.hasTopCategories) score += 120
          if (signal.hasPerplexityPro) score += 90
          if (signal.hasComputerCard) score += 70
          if (signal.hasModelControl) score += 25
          if (rect.width >= 900) score += 30
          if (rect.height >= 420) score += 30
          score += Math.min(this.getElementDepthFrom(editor, current), 24) * 3

          if (score >= 120) {
            candidates.push({ element: current, score })
          }
        }
      }

      current = current.parentElement
    }

    candidates.sort((a, b) => b.score - a.score)
    return candidates[0]?.element || null
  }

  private getZenHomeContentSignal(element: HTMLElement): {
    hasTopCategories: boolean
    hasPerplexityPro: boolean
    hasComputerCard: boolean
    hasModelControl: boolean
  } {
    const text = this.normalizeUiText(element.textContent || "")
    return {
      hasTopCategories:
        /发现/.test(text) && /金融/.test(text) && /健康/.test(text) && /学术/.test(text),
      hasPerplexityPro: /perplexity\s*pro/i.test(text),
      hasComputerCard: /让电脑开始工作|尝试电脑|computer/i.test(text),
      hasModelControl: /(gpt|gemini|claude|sonar|模型)/i.test(text),
    }
  }

  private findZenComposerShell(editor: HTMLElement): HTMLElement | null {
    const viewportWidth = Math.max(window.innerWidth, 1)
    const viewportHeight = Math.max(window.innerHeight, 1)
    const candidates: Array<{ element: HTMLElement; score: number }> = []

    let current: HTMLElement | null = editor
    while (current && current !== document.body && current !== document.documentElement) {
      if (this.isVisibleElement(current)) {
        const rect = current.getBoundingClientRect()
        const widthOk = rect.width >= 420 && rect.width <= viewportWidth - 24
        const heightOk = rect.height >= 44 && rect.height <= Math.max(260, viewportHeight * 0.45)
        const containsEditor = current === editor || current.contains(editor)

        if (containsEditor && widthOk && heightOk) {
          const signal = this.getZenComposerShellSignal(current)
          const style = window.getComputedStyle(current)
          const borderRadius = Number.parseFloat(style.borderTopLeftRadius || "0")
          const hasBorder =
            style.borderTopStyle !== "none" ||
            style.borderRightStyle !== "none" ||
            style.borderBottomStyle !== "none" ||
            style.borderLeftStyle !== "none"
          const hasSurface =
            hasBorder ||
            style.boxShadow !== "none" ||
            borderRadius >= 8 ||
            /rgb|hsl|color|var\(/i.test(style.backgroundColor)

          let score = 0
          if (current instanceof HTMLFormElement) score += 40
          if (signal.hasSubmitControl) score += 80
          if (signal.hasModelControl) score += 70
          if (signal.hasAttachmentControl) score += 30
          if (hasSurface) score += 35
          if (borderRadius >= 12) score += 20
          score += Math.min(rect.width, 1120) / 40
          score -= Math.abs(rect.height - 96) / 4
          score -= this.getElementDepthFrom(editor, current) * 2

          if (score >= 70) {
            candidates.push({ element: current, score })
          }
        }
      }

      current = current.parentElement
    }

    candidates.sort((a, b) => b.score - a.score)
    return candidates[0]?.element || null
  }

  private getZenComposerShellSignal(element: HTMLElement): {
    hasModelControl: boolean
    hasSubmitControl: boolean
    hasAttachmentControl: boolean
  } {
    const buttons = Array.from(
      element.querySelectorAll<HTMLElement>("button, [role='button'], [aria-haspopup='menu']"),
    )

    let hasModelControl = false
    let hasSubmitControl = false
    let hasAttachmentControl = false

    for (const button of buttons) {
      const signal = this.normalizeUiText(
        [
          button.textContent || "",
          button.getAttribute("aria-label") || "",
          button.getAttribute("title") || "",
          button.getAttribute("data-testid") || "",
          button.getAttribute("data-test-id") || "",
          button.className || "",
        ].join(" "),
      )

      if (/(model|gpt|gemini|claude|sonar|nemotron|模型)/i.test(signal)) {
        hasModelControl = true
      }
      if (/(submit|send|voice|audio|mic|microphone|arrow|提交|发送|語音|语音)/i.test(signal)) {
        hasSubmitControl = true
      }
      if (
        /(attach|upload|file|connector|computer|add|附件|文件|上传|連接器|连接器)/i.test(signal)
      ) {
        hasAttachmentControl = true
      }
    }

    return { hasModelControl, hasSubmitControl, hasAttachmentControl }
  }

  private getElementDepthFrom(descendant: HTMLElement, ancestor: HTMLElement): number {
    let depth = 0
    let current: HTMLElement | null = descendant
    while (current && current !== ancestor) {
      depth += 1
      current = current.parentElement
    }
    return depth
  }

  private getZenCorrectionTargets(measurementTarget: HTMLElement): HTMLElement[] {
    const targets = [measurementTarget]
    targets.push(...this.findZenHomeLandmarkCorrectionTargets(measurementTarget))
    return this.dedupeZenCorrectionTargets(targets)
  }

  private findZenHomeLandmarkCorrectionTargets(measurementTarget: HTMLElement): HTMLElement[] {
    const scope = document.querySelector("main") || document.body
    if (!scope) return []

    const candidates = Array.from(
      scope.querySelectorAll<HTMLElement>(
        "h1, h2, header, nav, section, div, [role='heading'], [role='tablist']",
      ),
    )
    const targets: HTMLElement[] = []
    const landmarkPatterns = [
      /perplexity\s*pro/i,
      /发现.*金融.*健康.*学术|发现.*金融.*健康|金融.*健康.*学术.*专利/,
    ]
    const viewportWidth = Math.max(window.innerWidth, 1)

    for (const candidate of candidates) {
      if (!this.isVisibleElement(candidate)) continue
      if (candidate.closest("#gh-zen-mode-exit-host, .ophel-root, [data-ophel-root]")) continue
      if (measurementTarget.contains(candidate)) continue

      const text = this.normalizeUiText(candidate.textContent || "")
      if (!landmarkPatterns.some((pattern) => pattern.test(text))) continue

      const target = this.getZenLandmarkCorrectionTarget(candidate)
      if (!target || measurementTarget.contains(target)) continue

      const rect = target.getBoundingClientRect()
      if (rect.width <= 0 || rect.width > viewportWidth - 24 || rect.height > 260) continue

      targets.push(target)
    }

    return targets
  }

  private getZenLandmarkCorrectionTarget(element: HTMLElement): HTMLElement | null {
    const viewportWidth = Math.max(window.innerWidth, 1)
    let target: HTMLElement = element
    let current = element.parentElement
    let climbed = 0

    while (
      current &&
      current !== document.body &&
      current !== document.documentElement &&
      climbed < 4 &&
      this.isVisibleElement(current)
    ) {
      const rect = current.getBoundingClientRect()
      if (rect.width > viewportWidth - 24 || rect.height > 260) break
      target = current
      current = current.parentElement
      climbed += 1
    }

    return target
  }

  private dedupeZenCorrectionTargets(targets: HTMLElement[]): HTMLElement[] {
    const unique: HTMLElement[] = []
    for (const target of targets) {
      if (!target.isConnected) continue
      if (unique.some((existing) => existing === target || existing.contains(target))) continue

      for (let index = unique.length - 1; index >= 0; index -= 1) {
        if (target.contains(unique[index])) {
          unique.splice(index, 1)
        }
      }

      unique.push(target)
    }

    return unique
  }

  private clampZenCorrection(value: number): number {
    return Math.max(-320, Math.min(320, value))
  }

  private markZenCorrectionTargets(targets: HTMLElement[]): void {
    const current = this.zenCorrectionTargets
    if (
      current.length === targets.length &&
      current.every((target, index) => target === targets[index])
    ) {
      return
    }

    this.clearZenCorrectionTargets()
    this.zenCorrectionTargets = targets
    for (const target of targets) {
      target.classList.add("ophel-perplexity-zen-center-target")
      target.classList.add("ophel-perplexity-zen-composer-center-target")
    }
  }

  private clearZenCorrectionTargets(): void {
    for (const target of this.zenCorrectionTargets) {
      target.classList.remove("ophel-perplexity-zen-center-target")
      target.classList.remove("ophel-perplexity-zen-composer-center-target")
    }
    this.zenCorrectionTargets = []
  }

  private applyZenCorrectionVariable(value: number, options: { remove?: boolean } = {}): void {
    const propertyName = "--ophel-perplexity-zen-correction"
    if (options.remove) {
      document.documentElement.style.removeProperty(propertyName)
      document.body?.style.removeProperty(propertyName)
      return
    }

    const propertyValue = `${value.toFixed(2)}px`
    document.documentElement.style.setProperty(propertyName, propertyValue, "important")
    document.body?.style.setProperty(propertyName, propertyValue, "important")
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: [
        'button[aria-label="Select AI model"]',
        'button[aria-label*="Select AI model" i]',
        'button[aria-label*="model" i]',
        'button[aria-label*="模型"]',
      ],
      menuItemSelector: "[role='menuitemradio'], [role='menuitemcheckbox'], [role='menuitem']",
      checkInterval: 1000,
      maxAttempts: 12,
      menuRenderDelay: 200,
    }
  }

  getModelLockCheckText(selectorBtn?: HTMLElement | null): string {
    return this.getCurrentPerplexityModelText() || super.getModelLockCheckText(selectorBtn)
  }

  isModelSelectorOpen(): boolean {
    const selectorBtn = this.findPerplexityModelSelectorButton()
    if (selectorBtn) {
      const expanded = (selectorBtn.getAttribute("aria-expanded") || "").toLowerCase()
      const state = (selectorBtn.getAttribute("data-state") || "").toLowerCase()
      if (expanded === "true" || state === "open") {
        return true
      }
    }

    return this.findPerplexityModelMenuRoots(selectorBtn || null).length > 0
  }

  isModelLockUiReady(): boolean {
    return this.findPerplexityModelSelectorButton() !== null
  }

  usesPersistentModelLockMonitor(): boolean {
    return true
  }

  getModelLockMonitorInterval(): number {
    return 1200
  }

  getModelLockMonitorRoot(): Node | null {
    return (
      this.getTextareaElement()?.closest("form") || document.querySelector("main") || document.body
    )
  }

  getModelLockMutationDebounce(): number {
    return 80
  }

  clickModelSelector(): boolean {
    const button = this.findPerplexityModelSelectorButton()
    if (!button) {
      void this.showPerplexityDebugToast(
        "[Perplexity Debug] model selector button not found",
        "perplexity-model-selector-missing",
      )
      return false
    }

    this.lastManualModelSelectorToggleAt = Date.now()
    void this.togglePerplexityModelSelector(button)
    return true
  }

  lockModel(keyword: string, onSuccess?: () => void): void {
    const target = this.normalizeUiText(keyword)
    if (!target) return

    void (async () => {
      const manualToggleCooldownMs = 900
      const elapsedSinceManualToggle = Date.now() - this.lastManualModelSelectorToggleAt
      if (elapsedSinceManualToggle >= 0 && elapsedSinceManualToggle < manualToggleCooldownMs) {
        return
      }

      let lastFailureReason = "unknown"

      for (let attempt = 0; attempt < 5; attempt += 1) {
        this.logPerplexityModelLockDebug("attempt_start", {
          keyword,
          normalizedKeyword: target,
          attempt: attempt + 1,
        })

        const selectorBtn = await this.waitForValue(
          () => this.findPerplexityModelSelectorButton(),
          3_000,
        )
        if (!selectorBtn) {
          lastFailureReason = "selector_button_not_found"
          this.logPerplexityModelLockDebug("selector_missing", {
            keyword,
            attempt: attempt + 1,
          })
          break
        }

        this.logPerplexityModelLockDebug("selector_found", {
          keyword,
          attempt: attempt + 1,
          text: selectorBtn.textContent || "",
          ariaLabel: selectorBtn.getAttribute("aria-label"),
          dataState: selectorBtn.getAttribute("data-state"),
          ariaExpanded: selectorBtn.getAttribute("aria-expanded"),
          rect: this.getDebugRect(selectorBtn),
        })

        const currentModel = this.getCurrentPerplexityModelText()
        if (currentModel.includes(target) || this.isTargetModelChecked(target)) {
          this.logPerplexityModelLockDebug("already_on_target", {
            keyword,
            currentText: currentModel,
          })
          onSuccess?.()
          return
        }

        if (!this.isModelSelectorOpen()) {
          const opened = this.openPerplexityModelSelector()
          if (!opened) {
            lastFailureReason = "click_model_selector_failed"
            this.logPerplexityModelLockDebug("click_model_selector_failed", {
              keyword,
              attempt: attempt + 1,
            })
            await this.sleep(250)
            continue
          }
        }
        await this.sleep(300)

        const menuItems = await this.waitForValue(() => {
          const items = this.collectPerplexityOpenModelMenuItemsStrict(selectorBtn)
          return items.length > 0 ? items : null
        }, 3_000)

        if (!menuItems || menuItems.length === 0) {
          lastFailureReason = "click_model_selector_failed"
          this.logPerplexityModelLockDebug("menu_scan_empty", {
            keyword,
            attempt: attempt + 1,
          })
          lastFailureReason = "first_menu_scan_empty"
          this.openPerplexityModelSelector()
          await this.sleep(350)
          const retryItems = this.collectPerplexityOpenModelMenuItemsStrict(selectorBtn)
          if (retryItems.length === 0) {
            lastFailureReason = "retry_menu_scan_empty"
            this.logPerplexityModelLockDebug("menu_retry_empty", {
              keyword,
              attempt: attempt + 1,
              rootCount: this.findPerplexityModelMenuRoots(selectorBtn).length,
              checkedItems: this.getCheckedModelItemTexts(),
            })
            document.body.click()
            await this.sleep(300)
            continue
          }
        }

        const effectiveItems =
          menuItems && menuItems.length > 0
            ? menuItems
            : this.collectPerplexityOpenModelMenuItemsStrict(selectorBtn)

        if (!effectiveItems || effectiveItems.length === 0) {
          lastFailureReason = "effective_menu_items_empty"
          this.logPerplexityModelLockDebug("effective_items_empty", {
            keyword,
            attempt: attempt + 1,
          })
          document.body.click()
          await this.sleep(300)
          continue
        }

        this.logPerplexityModelLockDebug("menu_items_found", {
          keyword,
          attempt: attempt + 1,
          count: effectiveItems.length,
          items: effectiveItems.slice(0, 10).map((item) => ({
            text: this.normalizeUiText(item.textContent || ""),
            role: item.getAttribute("role"),
            ariaChecked: item.getAttribute("aria-checked"),
            dataState: item.getAttribute("data-state"),
            rect: this.getDebugRect(item),
          })),
        })

        const matchedItem = this.findPerplexityModelMenuItemStrict(effectiveItems, target)
        if (!matchedItem) {
          lastFailureReason = "matched_item_not_found"
          const preview = effectiveItems
            .slice(0, 8)
            .map((item) => this.normalizeUiText(item.textContent || "").slice(0, 32))
            .filter(Boolean)
            .join(" | ")
          this.logPerplexityModelLockDebug("matched_item_missing", {
            keyword,
            attempt: attempt + 1,
            menuPreview: preview,
          })
          void this.showPerplexityDebugToast(
            `[Perplexity Debug] target model not found: ${keyword}${preview ? ` | menu: ${preview}` : ""}`,
            "perplexity-model-lock-not-found",
          )
          document.body.click()
          return
        }

        this.logPerplexityModelLockDebug("matched_item_found", {
          keyword,
          attempt: attempt + 1,
          text: this.normalizeUiText(matchedItem.textContent || ""),
          role: matchedItem.getAttribute("role"),
          rect: this.getDebugRect(matchedItem),
        })

        this.activatePerplexityModelMenuItem(matchedItem)

        const switched = await this.waitForCondition(() => {
          if (this.getCurrentPerplexityModelText().includes(target)) return true
          return this.isTargetModelChecked(target)
        }, 3_500)

        await this.closePerplexityModelSelector(selectorBtn)

        if (switched) {
          this.logPerplexityModelLockDebug("switch_confirmed", {
            keyword,
            attempt: attempt + 1,
            checkedItems: this.getCheckedModelItemTexts(),
          })
          onSuccess?.()
          return
        }

        lastFailureReason = "switch_not_confirmed"
        this.logPerplexityModelLockDebug("switch_not_confirmed", {
          keyword,
          attempt: attempt + 1,
          checkedItems: this.getCheckedModelItemTexts(),
          selectorText: this.findPerplexityModelSelectorButton()?.textContent || "",
        })
        await this.closePerplexityModelSelector(selectorBtn)
        await this.sleep(300)
      }

      this.logPerplexityModelLockDebug("lock_failed", {
        keyword,
        reason: lastFailureReason,
        checkedItems: this.getCheckedModelItemTexts(),
      })
      void this.showPerplexityDebugToast(
        `[Perplexity Debug] model selection failed for "${keyword}" | ${lastFailureReason}`,
        "perplexity-model-lock-menu",
      )
    })()
  }

  async toggleTheme(targetMode: "light" | "dark" | "system"): Promise<boolean> {
    try {
      const root = document.documentElement
      const resolvedMode =
        targetMode === "system"
          ? window.matchMedia?.("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : targetMode

      root.setAttribute("data-color-scheme", resolvedMode)
      document.body.setAttribute("data-color-scheme", resolvedMode)

      root.classList.toggle("dark", resolvedMode === "dark")
      root.classList.toggle("light", resolvedMode === "light")
      document.body.classList.toggle("dark", resolvedMode === "dark")
      document.body.classList.toggle("light", resolvedMode === "light")
      root.style.colorScheme = resolvedMode

      try {
        localStorage.setItem("theme", targetMode)
        localStorage.setItem("appearance", targetMode)
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "theme",
            newValue: targetMode,
            storageArea: localStorage,
          }),
        )
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "appearance",
            newValue: targetMode,
            storageArea: localStorage,
          }),
        )
      } catch {
        // ignore localStorage access issues
      }

      return true
    } catch (error) {
      console.error("[PerplexityAdapter] toggleTheme error:", error)
      return false
    }
  }

  private selectEditorContents(editor: HTMLElement): void {
    const selection = window.getSelection()
    if (!selection) return

    const range = document.createRange()
    range.selectNodeContents(editor)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  private placeCaretAtEnd(editor: HTMLElement): void {
    const selection = window.getSelection()
    if (!selection) return

    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  private dispatchEditorInputEvents(
    editor: HTMLElement,
    data: string,
    inputType: InputEvent["inputType"],
  ): void {
    try {
      editor.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          composed: true,
          data,
          inputType,
        }),
      )
    } catch {
      // ignore browsers that reject synthetic beforeinput
    }

    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        data,
        inputType,
      }),
    )
    editor.dispatchEvent(new Event("change", { bubbles: true }))
  }

  private dispatchPasteEvent(editor: HTMLElement, content: string): boolean {
    if (typeof DataTransfer === "undefined" || typeof ClipboardEvent === "undefined") {
      return false
    }

    try {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData("text/plain", content)

      return editor.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          composed: true,
          clipboardData: dataTransfer,
        }),
      )
    } catch {
      return false
    }
  }

  private async resolveThreadIdentifiers(
    id: string,
    targetUrl?: string,
  ): Promise<PerplexityThreadIdentifiers> {
    const slug =
      this.parseThreadSlugFromUrl(targetUrl || "") || this.parseThreadSlugFromUrl(id) || id.trim()

    const apiIds = new Set<string>()
    this.addThreadApiIdCandidate(apiIds, slug)
    this.addThreadApiIdCandidate(apiIds, id)

    const metadata = await this.fetchThreadMetadata(slug)
    if (metadata) {
      this.collectThreadApiIdsFromPayload(metadata).forEach((candidate) =>
        this.addThreadApiIdCandidate(apiIds, candidate),
      )
    }

    return {
      slug,
      apiIds: Array.from(apiIds),
    }
  }

  private async deleteConversationViaNativeApi(
    resultId: string,
    identifiers: PerplexityThreadIdentifiers,
  ): Promise<SiteDeleteConversationResult> {
    let lastReason = "delete_api_not_attempted"

    for (const apiId of identifiers.apiIds) {
      const attempts: Array<{ endpoint: string; body: Record<string, unknown> }> = [
        {
          endpoint: "/rest/thread",
          body: {
            entry_uuids: [apiId],
            read_write_token: "",
          },
        },
        {
          endpoint: "/rest/thread/delete_thread_by_entry_uuid",
          body: {
            entry_uuid: apiId,
            read_write_token: "",
          },
        },
      ]

      for (const attempt of attempts) {
        try {
          const response = await fetch(buildPerplexityUrl(attempt.endpoint), {
            method: "DELETE",
            credentials: "include",
            headers: this.buildPerplexityJsonHeaders(),
            body: JSON.stringify(attempt.body),
          })

          if (response.ok) {
            return { id: resultId, success: true, method: "api" }
          }

          lastReason = this.toPerplexityApiHttpReason("delete", response.status)
        } catch {
          lastReason = "delete_api_request_failed"
        }
      }
    }

    return {
      id: resultId,
      success: false,
      method: "api",
      reason: lastReason,
    }
  }

  private async renameConversationViaNativeApi(
    identifiers: PerplexityThreadIdentifiers,
    newTitle: string,
  ): Promise<{ success: boolean; reason?: string }> {
    const normalizedTitle = newTitle.trim()
    if (!normalizedTitle) {
      return { success: false, reason: "empty_title" }
    }

    let lastReason = "rename_api_not_attempted"
    for (const apiId of identifiers.apiIds) {
      try {
        const response = await fetch(buildPerplexityUrl("/rest/thread/set_thread_title"), {
          method: "POST",
          credentials: "include",
          headers: this.buildPerplexityJsonHeaders(),
          body: JSON.stringify({
            context_uuid: apiId,
            title: normalizedTitle,
            read_write_token: "",
          }),
        })

        if (response.ok) {
          return { success: true }
        }

        lastReason = this.toPerplexityApiHttpReason("rename", response.status)
      } catch {
        lastReason = "rename_api_request_failed"
      }
    }

    return { success: false, reason: lastReason }
  }

  private buildPerplexityJsonHeaders(): Record<string, string> {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
    }
  }

  private toPerplexityApiHttpReason(action: "delete" | "rename", status: number): string {
    switch (status) {
      case 401:
      case 403:
        return `${action}_api_unauthorized`
      case 404:
        return `${action}_api_not_found`
      case 429:
        return `${action}_api_rate_limited`
      default:
        return `${action}_api_http_${status || 0}`
    }
  }

  private async fetchThreadMetadata(identifier: string): Promise<unknown | null> {
    if (!identifier) return null

    try {
      const url = new URL(`/rest/thread/${encodeURIComponent(identifier)}`, getPerplexityOrigin())
      url.searchParams.set("with_parent_info", "false")
      url.searchParams.set("with_schematized_response", "true")
      url.searchParams.set("version", "2.18")
      url.searchParams.set("source", "default")
      url.searchParams.set("limit", "0")
      url.searchParams.set("offset", "0")
      url.searchParams.set("from_first", "false")

      const response = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      })
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  private collectThreadApiIdsFromPayload(payload: unknown): string[] {
    const candidates: string[] = []
    const seen = new Set<unknown>()
    const keyPattern =
      /^(context_uuid|contextuuid|uuid|entry_uuid|entryuuid|backend_uuid|backenduuid|id)$/i

    const walk = (value: unknown, depth: number): void => {
      if (!value || depth > 5 || seen.has(value)) return
      if (typeof value !== "object") return
      seen.add(value)

      if (Array.isArray(value)) {
        value.slice(0, 20).forEach((item) => walk(item, depth + 1))
        return
      }

      Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
        if (typeof child === "string" && keyPattern.test(key)) {
          candidates.push(child)
        }
        walk(child, depth + 1)
      })
    }

    walk(payload, 0)
    return candidates
  }

  private addThreadApiIdCandidate(candidates: Set<string>, value: string | null | undefined): void {
    const normalized = (value || "").trim()
    if (!normalized || normalized === "new") return
    if (/[\s/?#]/.test(normalized)) return
    candidates.add(normalized)
  }

  private async deleteConversationViaUi(
    id: string,
  ): Promise<{ success: boolean; reason?: string }> {
    let sidebarReason: string | undefined
    const sidebarLink = await this.findSidebarConversationLinkWithScroll(id, 1_200)
    if (sidebarLink) {
      this.ensureElementVisible(sidebarLink)
      const container = this.findConversationItemContainer(sidebarLink)
      const actionButton = await this.openThreadActionMenu({
        preferredContainer: container,
        triggerScope: container || sidebarLink,
      })

      if (actionButton) {
        const result = await this.confirmDeleteFromOpenMenu(id, false, actionButton)
        if (result.success) {
          this.syncConversationListAfterDelete(id)
          return { success: true }
        }

        sidebarReason = result.reason
      } else {
        sidebarReason = "sidebar_action_button_not_found"
      }
    }

    if (this.getSessionId() !== id) {
      return {
        success: false,
        reason: sidebarReason || "target_not_visible_and_api_failed",
      }
    }

    const actionButton = await this.openThreadActionMenu({
      preferredContainer: document.querySelector(
        ".h-headerHeight.fixed.z-10",
      ) as HTMLElement | null,
      triggerScope: document.body,
    })
    if (!actionButton) {
      void this.showPerplexityDebugToast(
        `[Perplexity Debug] conversation action button not found: ${id}`,
        "perplexity-delete-action-button",
      )
      return { success: false, reason: sidebarReason || "action_button_not_found" }
    }

    const deleted = await this.confirmDeleteFromOpenMenu(id, true, actionButton)
    if (deleted.success) {
      this.syncConversationListAfterDelete(id)
      return { success: true }
    }

    return { success: false, reason: deleted.reason || sidebarReason || "deletion_not_observed" }
  }

  private async renameConversationViaUi(
    id: string,
    newTitle: string,
  ): Promise<{ success: boolean; reason?: string }> {
    const normalizedTitle = newTitle.trim()
    if (!normalizedTitle) {
      return { success: false, reason: "empty_title" }
    }

    const sidebarResult = await this.tryRenameConversationFromSidebar(id, normalizedTitle)
    if (sidebarResult.success) {
      this.syncConversationListAfterRename(id, normalizedTitle)
      return { success: true }
    }

    if (this.getSessionId() !== id) {
      return {
        success: false,
        reason: sidebarResult.reason || "target_not_visible_and_api_failed",
      }
    }

    const actionButton = await this.openThreadActionMenu({
      preferredContainer: this.getConversationHeaderContainer(),
      triggerScope: document.body,
      menuOpenedCheck: (button) => this.findOpenRenameMenuItem(button) !== null,
    })
    if (!actionButton) {
      void this.showPerplexityDebugToast(
        `[Perplexity Debug] rename action button not found on active conversation: ${id}`,
        "perplexity-rename-active-action-button",
      )
      return {
        success: false,
        reason: sidebarResult.reason || "rename_action_button_not_found",
      }
    }

    const renameResult = await this.completeRenameFromOpenMenu(id, normalizedTitle, actionButton)
    if (renameResult.success) {
      this.syncConversationListAfterRename(id, normalizedTitle)
      return { success: true }
    }

    return {
      success: false,
      reason: renameResult.reason || sidebarResult.reason || "rename_not_observed",
    }
  }

  private async tryRenameConversationFromSidebar(
    id: string,
    normalizedTitle: string,
  ): Promise<{ success: boolean; reason?: string }> {
    const sidebarLink = await this.findSidebarConversationLinkWithScroll(id, 2_500)
    if (!sidebarLink) {
      return { success: false, reason: "sidebar_link_not_found" }
    }

    this.ensureElementVisible(sidebarLink)
    const container = this.findConversationItemContainer(sidebarLink)
    const actionButton = await this.openThreadActionMenu({
      preferredContainer: container,
      triggerScope: container || sidebarLink,
      menuOpenedCheck: () => this.findOpenRenameMenuItem(sidebarLink) !== null,
    })
    if (!actionButton) {
      void this.showPerplexityDebugToast(
        `[Perplexity Debug] rename action button not found: ${id}`,
        "perplexity-rename-action-button",
      )
      return { success: false, reason: "rename_action_button_not_found" }
    }

    return this.completeRenameFromOpenMenu(id, normalizedTitle, actionButton)
  }

  private async completeRenameFromOpenMenu(
    id: string,
    normalizedTitle: string,
    actionButton: HTMLElement,
  ): Promise<{ success: boolean; reason?: string }> {
    const renameItem = await this.waitForValue(
      () => this.findOpenRenameMenuItem(actionButton),
      DELETE_FLOW_TIMEOUT_MS,
    )
    if (!renameItem) {
      void this.showPerplexityDebugToast(
        `[Perplexity Debug] rename menu item not found: ${id}`,
        "perplexity-rename-menu-item",
      )
      return { success: false, reason: "rename_menu_item_not_found" }
    }

    this.simulateClick(renameItem)

    const dialog = await this.waitForValue(() => this.findRenameDialog(), 2_000)
    if (!dialog) {
      void this.showPerplexityDebugToast(
        `[Perplexity Debug] rename dialog not found: ${id}`,
        "perplexity-rename-dialog",
      )
      return { success: false, reason: "rename_dialog_not_found" }
    }

    const editor = this.findRenameDialogEditor(dialog)
    if (!editor) {
      void this.showPerplexityDebugToast(
        `[Perplexity Debug] rename editor not found: ${id}`,
        "perplexity-rename-editor",
      )
      return { success: false, reason: "rename_editor_not_found" }
    }

    this.setRenameDialogValue(editor, normalizedTitle)

    const saveButton = await this.waitForValue(() => this.findRenameSaveButton(dialog), 1_500)
    if (!saveButton) {
      void this.showPerplexityDebugToast(
        `[Perplexity Debug] rename save button not found: ${id}`,
        "perplexity-rename-save-button",
      )
      return { success: false, reason: "rename_save_button_not_found" }
    }

    this.simulateClick(saveButton)

    const renamed = await this.waitForCondition(
      () => this.hasConversationTitleSignal(id, normalizedTitle),
      3_000,
    )

    if (!renamed) {
      void this.showPerplexityDebugToast(
        `[Perplexity Debug] rename was not observed on site: ${id}`,
        "perplexity-rename-not-observed",
      )
      return { success: false, reason: "rename_not_observed" }
    }

    return { success: true }
  }

  private findScrollableParent(element: Element | null): HTMLElement | null {
    let current = element instanceof HTMLElement ? element : element?.parentElement || null

    while (current && current !== document.body) {
      if (current.scrollHeight > current.clientHeight + 20) {
        return current
      }
      current = current.parentElement
    }

    return null
  }

  private syncConversationListAfterDelete(id: string): void {
    this.threadListCache = this.threadListCache.filter((item) => item.id !== id)
    this.threadListCacheExpiresAt = 0

    this.getNativeSidebarConversationLinks().forEach((anchor) => {
      if (this.parseThreadSlugFromUrl(anchor.getAttribute("href") || anchor.href || "") !== id)
        return

      const container = this.findConversationItemContainer(anchor)
      ;(container || anchor).remove()
    })
  }

  private refreshPageAfterNativeApiDelete(deletedSlugs: Set<string>, deletedViaApi: boolean): void {
    if (deletedSlugs.size === 0 || !deletedViaApi) return

    window.setTimeout(() => {
      const currentSlug = this.getSessionId()
      if (currentSlug && deletedSlugs.has(currentSlug)) {
        window.location.assign(buildPerplexityUrl("/"))
        return
      }

      window.location.reload()
    }, 250)
  }

  private syncConversationListAfterRename(id: string, title: string): void {
    this.threadListCache = this.threadListCache.map((item) =>
      item.id === id ? { ...item, title } : item,
    )
    this.threadListCacheExpiresAt = Math.min(this.threadListCacheExpiresAt, Date.now() + 10_000)

    const link = this.findSidebarConversationLink(id)
    if (link) {
      this.applyConversationTitleToDom(link, id, title)
    }
  }

  private parseThreadSlugFromUrl(url: string): string {
    try {
      const parsed = new URL(url, window.location.origin)
      const match = parsed.pathname.match(THREAD_PATH_PATTERN)
      const slug = match?.[1]?.trim() || ""
      return slug === "new" ? "" : slug
    } catch {
      return ""
    }
  }

  private extractConversationInfo(
    element: Element,
    options: { allowDisconnected?: boolean } = {},
  ): ConversationInfo | null {
    const anchor = (
      element instanceof HTMLAnchorElement
        ? element
        : element.closest("a") || element.querySelector("a[href^='/search/'], a[href^='/page/']")
    ) as HTMLAnchorElement | null
    if (!anchor) return null
    if (!options.allowDisconnected && !this.isNativeSidebarConversationLink(anchor)) return null
    if (options.allowDisconnected && this.isElementInsideOphel(anchor)) return null

    const slug = this.parseThreadSlugFromUrl(anchor.href || anchor.getAttribute("href") || "")
    if (!slug) return null

    const title = this.extractConversationTitle(anchor, slug)

    return {
      id: slug,
      title,
      url: new URL(anchor.getAttribute("href") || anchor.href, window.location.origin).toString(),
      isActive: slug === this.getSessionId(),
    }
  }

  private collectConversationListFromDom(): ConversationInfo[] {
    const result = new Map<string, ConversationInfo>()

    this.getNativeSidebarConversationLinks().forEach((link) => {
      const info = this.extractConversationInfo(link)
      if (!info) return
      result.set(info.id, info)
    })

    return Array.from(result.values())
  }

  private findSidebarConversationLink(id: string): HTMLAnchorElement | null {
    const links = this.getNativeSidebarConversationLinks()
    for (const anchor of links) {
      const slug = this.parseThreadSlugFromUrl(anchor.getAttribute("href") || anchor.href || "")
      if (slug === id) {
        return anchor
      }
    }

    return null
  }

  private getSidebarConversationTitle(id: string): string | null {
    const sidebarLink = this.findSidebarConversationLink(id)
    if (!sidebarLink) return null

    const sidebarTitle = this.extractConversationTitle(sidebarLink, id)
    return sidebarTitle || null
  }

  private async findSidebarConversationLinkWithScroll(
    id: string,
    timeoutMs: number,
  ): Promise<HTMLAnchorElement | null> {
    const immediate = this.findSidebarConversationLink(id)
    if (immediate) return immediate

    const scrollRoot = this.getSidebarScrollContainer()
    if (!(scrollRoot instanceof HTMLElement)) {
      return this.waitForValue(() => this.findSidebarConversationLink(id), timeoutMs)
    }

    const startedAt = Date.now()
    const originalTop = scrollRoot.scrollTop
    let nextRatio = 0

    while (Date.now() - startedAt < timeoutMs) {
      const found = this.findSidebarConversationLink(id)
      if (found) {
        this.ensureElementVisible(found)
        return found
      }

      const maxTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight)
      const nextTop = Math.round(maxTop * nextRatio)
      scrollRoot.scrollTop = nextTop
      scrollRoot.dispatchEvent(new Event("scroll", { bubbles: true }))
      nextRatio += 0.2
      if (nextRatio > 1) nextRatio = 0

      await this.sleep(100)
    }

    scrollRoot.scrollTop = originalTop
    scrollRoot.dispatchEvent(new Event("scroll", { bubbles: true }))
    return this.findSidebarConversationLink(id)
  }

  private findPerplexityModelSelectorButton(): HTMLElement | null {
    const editor = this.getTextareaElement()
    const scopes = [
      editor?.closest("form"),
      editor?.parentElement,
      editor?.closest("main"),
      document.querySelector("main"),
      document.body,
    ].filter(Boolean) as ParentNode[]

    let best: { element: HTMLElement; score: number } | null = null

    for (const scope of scopes) {
      for (const selector of MODEL_SELECTOR_BUTTON_SELECTORS) {
        const exactCandidates = scope.querySelectorAll(selector)
        for (const candidate of Array.from(exactCandidates)) {
          if (!(candidate instanceof HTMLElement)) continue
          if (
            candidate.closest(
              "[role='menu'], [role='listbox'], [data-radix-popper-content-wrapper], [data-radix-portal]",
            )
          ) {
            continue
          }
          if (this.isElementInsideOphel(candidate)) continue
          if (!this.isVisibleElement(candidate) || this.isDisabledActionButton(candidate)) continue
          if (!this.isPerplexityModelSelectorCandidate(candidate)) continue
          const score = this.scorePerplexityModelSelectorCandidate(candidate, editor) + 200
          if (!best || score > best.score) {
            best = { element: candidate, score }
          }
        }
      }

      const candidates = scope.querySelectorAll(
        'button, [role="button"], [role="combobox"], [aria-haspopup="menu"], [aria-haspopup="listbox"], [aria-haspopup="dialog"]',
      )
      for (const candidate of Array.from(candidates)) {
        if (!(candidate instanceof HTMLElement)) continue
        if (
          candidate.closest(
            "[role='menu'], [role='listbox'], [data-radix-popper-content-wrapper], [data-radix-portal]",
          )
        ) {
          continue
        }
        if (this.isElementInsideOphel(candidate)) continue
        if (!this.isVisibleElement(candidate) || this.isDisabledActionButton(candidate)) continue
        if (candidate.matches(SUBMIT_BUTTON_SELECTOR) || candidate.matches(STOP_BUTTON_SELECTOR)) {
          continue
        }
        if (!this.isPerplexityModelSelectorCandidate(candidate)) continue

        const score = this.scorePerplexityModelSelectorCandidate(candidate, editor)
        if (!best || score > best.score) {
          best = { element: candidate, score }
        }
      }
    }

    return best?.element || null
  }

  private isPerplexityModelSelectorCandidate(candidate: HTMLElement): boolean {
    const signal = this.getUiSignalText(candidate)
    if (!this.looksLikePerplexityModelSelector(candidate)) return false
    if (MODEL_SELECTOR_EXCLUDE_PATTERNS.some((pattern) => pattern.test(signal))) return false

    const hasExplicitModelLabel =
      signal.includes("模型") ||
      MODEL_SELECTOR_PRIMARY_HINTS.some((hint) => signal.includes(this.normalizeUiText(hint)))

    return hasExplicitModelLabel
  }

  private findConversationItemContainer(anchor: Element | null): HTMLElement | null {
    if (!(anchor instanceof HTMLElement)) return null

    return (anchor.closest(SIDEBAR_ITEM_CONTAINER_SELECTORS) ||
      anchor.closest("li") ||
      anchor.closest("[role='listitem']") ||
      anchor.closest(".group") ||
      anchor.parentElement) as HTMLElement | null
  }

  private getCachedThreadList(): ConversationInfo[] {
    if (Date.now() > this.threadListCacheExpiresAt) {
      return []
    }
    return [...this.threadListCache]
  }

  private cacheThreadList(list: ConversationInfo[]): void {
    this.threadListCache = list
    this.threadListCacheExpiresAt = Date.now() + THREAD_LIST_CACHE_TTL_MS
  }

  private mergeConversationInfos(...lists: ConversationInfo[][]): ConversationInfo[] {
    const merged = new Map<string, ConversationInfo>()
    const currentSessionId = this.getSessionId()

    for (const list of lists) {
      for (const item of list) {
        const existing = merged.get(item.id)
        const preferredTitle = this.pickPreferredConversationTitle(
          existing?.title,
          item.title,
          item.id,
        )
        merged.set(item.id, {
          ...existing,
          ...item,
          title: preferredTitle,
          url: item.url || existing?.url || buildPerplexityUrl(`/search/${item.id}`),
          isActive: currentSessionId ? item.id === currentSessionId : false,
        })
      }
    }

    return Array.from(merged.values())
  }

  private async fetchThreadsViaApi(): Promise<ConversationInfo[]> {
    const results: ConversationInfo[] = []
    const seen = new Set<string>()
    const currentSessionId = this.getSessionId()

    for (let page = 0; page < THREAD_LIST_MAX_PAGES; page += 1) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), THREAD_LIST_REQUEST_TIMEOUT_MS)

      let responseText = ""

      try {
        const response = await fetch(buildPerplexityUrl(THREAD_LIST_ENDPOINT_PATH), {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            limit: THREAD_LIST_PAGE_SIZE,
            offset: page * THREAD_LIST_PAGE_SIZE,
            search_term: "",
            with_temporary_threads: false,
          }),
          signal: controller.signal,
        })

        responseText = await response.text()

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new Error(`Thread list request timed out after ${THREAD_LIST_REQUEST_TIMEOUT_MS}ms`)
        }

        throw error
      } finally {
        clearTimeout(timeoutId)
      }

      let data: PerplexityThreadListEntry[]
      try {
        data = JSON.parse(responseText) as PerplexityThreadListEntry[]
      } catch {
        const preview = responseText.replace(/\s+/g, " ").trim().slice(0, 160)
        throw new Error(`Invalid thread list response JSON${preview ? `: ${preview}` : ""}`)
      }

      if (!Array.isArray(data) || data.length === 0) break

      for (const entry of data) {
        const slug = this.extractThreadListSlug(entry)
        if (!slug || slug === "new" || seen.has(slug)) continue

        seen.add(slug)
        results.push({
          id: slug,
          title: this.normalizeConversationTitle(
            typeof entry?.title === "string" ? entry.title : "",
            slug,
          ),
          url: buildPerplexityUrl(`/search/${slug}`),
          isActive: slug === currentSessionId,
        })
      }

      if (data.length < THREAD_LIST_PAGE_SIZE) {
        break
      }

      await new Promise((resolve) => setTimeout(resolve, 150))
    }

    return results
  }

  private extractThreadListSlug(entry: PerplexityThreadListEntry): string {
    const directCandidates = [entry?.slug, entry?.thread_url_slug]
    for (const candidate of directCandidates) {
      if (typeof candidate !== "string") continue
      const slug = candidate.trim()
      if (slug) return slug
    }

    if (typeof entry?.link === "string") {
      return this.parseThreadSlugFromUrl(entry.link)
    }

    return ""
  }

  private getNativeSidebarConversationLinks(): HTMLAnchorElement[] {
    const root = this.getNativeSidebarRoot()
    if (!root) return []

    const links = root.querySelectorAll(SIDEBAR_LINK_SELECTOR)
    const results: HTMLAnchorElement[] = []
    const seen = new Set<HTMLAnchorElement>()

    for (const link of Array.from(links)) {
      if (!(link instanceof HTMLAnchorElement)) continue
      if (seen.has(link)) continue
      if (!this.isNativeSidebarConversationLink(link)) continue
      seen.add(link)
      results.push(link)
    }

    return results
  }

  private getNativeSidebarRoot(): ParentNode | null {
    const explicitRoots = [
      this.getSidebarScrollContainer(),
      document.querySelector(".group\\/sidebar"),
      document.querySelector("aside"),
      document.querySelector("nav"),
    ].filter(Boolean) as Element[]

    for (const root of explicitRoots) {
      if (this.isElementInsideOphel(root)) continue
      if (
        root.querySelector(
          ".group\\/sidebar-submenu a[href^='/search/'], .group\\/sidebar-submenu a[href^='/page/']",
        )
      ) {
        return root
      }
    }

    const item = document.querySelector(".group\\/sidebar-submenu")
    if (item && !this.isElementInsideOphel(item)) {
      return item.parentElement || item
    }

    return null
  }

  private isNativeSidebarConversationLink(
    anchor: HTMLAnchorElement | null,
  ): anchor is HTMLAnchorElement {
    if (!(anchor instanceof HTMLAnchorElement)) return false
    if (!anchor.isConnected) return false
    if (this.isElementInsideOphel(anchor)) return false

    const href = anchor.getAttribute("href") || anchor.href || ""
    const slug = this.parseThreadSlugFromUrl(href)
    if (!slug) return false

    const row = anchor.closest(SIDEBAR_ITEM_CONTAINER_SELECTORS)
    if (row && !this.isElementInsideOphel(row as Element)) {
      return true
    }

    const root = this.getNativeSidebarRoot()
    return Boolean(root && root.contains(anchor))
  }

  private isElementInsideOphel(element: Element | null): boolean {
    return Boolean(element?.closest(".gh-root"))
  }

  private findPerplexityModelMenuRoots(anchor: HTMLElement | null): HTMLElement[] {
    const candidates = document.querySelectorAll(
      "[role='menu'], [role='listbox'], [data-radix-popper-content-wrapper], [data-radix-portal], [data-state='open']",
    )
    const roots: Array<{ element: HTMLElement; score: number }> = []
    const seen = new Set<HTMLElement>()

    for (const candidate of Array.from(candidates)) {
      if (!(candidate instanceof HTMLElement)) continue
      if (seen.has(candidate)) continue
      if (!this.isVisibleElement(candidate)) continue
      if (this.isElementInsideOphel(candidate)) continue

      const score =
        (candidate.getAttribute("role") === "menu" ? 80 : 0) +
        (candidate.getAttribute("role") === "listbox" ? 60 : 0) +
        this.getOverlayProximityScore(candidate, anchor)

      roots.push({ element: candidate, score })
      seen.add(candidate)
    }

    roots.sort((left, right) => right.score - left.score)
    return roots.map(({ element }) => element)
  }

  private collectVisibleModelMenuItems(anchor: HTMLElement | null = null): HTMLElement[] {
    const menus = this.findPerplexityModelMenuRoots(anchor)
    const items: HTMLElement[] = []
    const seen = new Set<HTMLElement>()

    const addCandidate = (candidate: HTMLElement) => {
      if (!this.isVisibleElement(candidate)) return
      if (seen.has(candidate)) return
      if (this.isElementInsideOphel(candidate)) return
      if (!this.looksLikePerplexityModelMenuItem(candidate, anchor)) return
      seen.add(candidate)
      items.push(candidate)
    }

    const pushCandidates = (root: ParentNode, selector?: string) => {
      const candidates = root.querySelectorAll(
        selector ||
          "button, [role='button'], [role='menuitemradio'], [role='menuitemcheckbox'], [role='menuitem'], [role='option'], [data-radix-collection-item], [tabindex]",
      )
      for (const candidate of Array.from(candidates)) {
        if (!(candidate instanceof HTMLElement)) continue
        addCandidate(candidate)
      }
    }

    for (const menu of menus) {
      pushCandidates(menu)
    }

    if (items.length === 0) {
      // Some Perplexity builds render the floating panel as a generic fixed overlay
      // while only the individual rows expose role="menuitemradio".
      pushCandidates(
        document.body,
        "[role='menuitemradio'], [role='menuitemcheckbox'], [role='menuitem'], [role='option'], [data-radix-collection-item], [aria-checked]",
      )
    }

    if (items.length === 0) {
      // Last-resort fallback aligned to the observed Perplexity structure:
      // visible radio items inside the floating model menu.
      const directItems = document.querySelectorAll(
        "[role='menuitemradio'], [role='menuitemcheckbox'], [role='option']",
      )
      for (const candidate of Array.from(directItems)) {
        if (!(candidate instanceof HTMLElement)) continue
        addCandidate(candidate)
      }
    }

    return items.sort(
      (left, right) =>
        this.scorePerplexityModelMenuItem(right, anchor) -
        this.scorePerplexityModelMenuItem(left, anchor),
    )
  }

  private collectDirectVisibleModelMenuItems(anchor: HTMLElement | null = null): HTMLElement[] {
    const items = Array.from(
      document.querySelectorAll(
        "[role='menuitemradio'], [role='menuitemcheckbox'], [role='option']",
      ),
    ).filter((item): item is HTMLElement => item instanceof HTMLElement)

    return items
      .filter((item) => this.isVisibleElement(item))
      .filter((item) => !this.isElementInsideOphel(item))
      .filter((item) => this.looksLikePerplexityModelMenuItem(item, anchor))
      .sort(
        (left, right) =>
          this.scorePerplexityModelMenuItem(right, anchor) -
          this.scorePerplexityModelMenuItem(left, anchor),
      )
  }

  private findPerplexityModelSelectorButtonStrict(): HTMLElement | null {
    const editor = this.getTextareaElement()
    const editorRect = editor?.getBoundingClientRect() || null
    const scopes = [
      editor?.closest("form"),
      editor?.parentElement,
      editor?.closest("main"),
      document.querySelector("main"),
      document.body,
    ].filter(Boolean) as ParentNode[]

    let best: { element: HTMLElement; score: number } | null = null
    const seen = new Set<HTMLElement>()

    for (const scope of scopes) {
      const candidates = scope.querySelectorAll(
        'button[aria-haspopup="menu"], [role="button"][aria-haspopup="menu"], [role="combobox"]',
      )
      for (const candidate of Array.from(candidates)) {
        if (!(candidate instanceof HTMLElement)) continue
        if (seen.has(candidate)) continue
        seen.add(candidate)
        if (
          candidate.closest(
            "[role='menu'], [role='listbox'], [data-radix-popper-content-wrapper], [data-radix-portal]",
          )
        ) {
          continue
        }
        if (this.isElementInsideOphel(candidate)) continue
        if (!this.isVisibleElement(candidate) || this.isDisabledActionButton(candidate)) continue
        if (candidate.matches(SUBMIT_BUTTON_SELECTOR) || candidate.matches(STOP_BUTTON_SELECTOR))
          continue

        const signal = this.getUiSignalText(candidate)
        if (MODEL_SELECTOR_EXCLUDE_PATTERNS.some((pattern) => pattern.test(signal))) {
          continue
        }

        const rect = candidate.getBoundingClientRect()
        let score = this.scorePerplexityModelSelectorCandidate(candidate, editor) + 200

        if (editor && candidate.closest("form") === editor.closest("form")) score += 500
        if (editorRect) {
          const distanceY = Math.abs(rect.top - editorRect.top)
          const distanceX = Math.abs(rect.right - editorRect.right)
          score -= distanceY * 0.8
          score -= distanceX * 0.2
          if (rect.top < editorRect.top - 200) score -= 400
          if (rect.bottom > editorRect.bottom + 160) score -= 150
          if (rect.left >= editorRect.left - 120 && rect.right <= editorRect.right + 80)
            score += 120
        }

        if (signal.includes("模型")) score += 80
        if (
          MODEL_SELECTOR_PRIMARY_HINTS.some((hint) => signal.includes(this.normalizeUiText(hint)))
        ) {
          score += 180
        }

        if (!best || score > best.score) {
          best = { element: candidate, score }
        }
      }
    }

    return best?.element || null
  }

  private collectPerplexityOpenModelMenuItemsStrict(anchor: HTMLElement | null): HTMLElement[] {
    const roots = Array.from(
      document.querySelectorAll(
        "[role='menu'][data-state='open'], [role='menu'], [data-radix-portal] [role='menu']",
      ),
    ).filter(
      (root): root is HTMLElement =>
        root instanceof HTMLElement &&
        this.isVisibleElement(root) &&
        !this.isElementInsideOphel(root),
    )

    const items: HTMLElement[] = []
    const seen = new Set<HTMLElement>()

    for (const root of roots) {
      const candidates = root.querySelectorAll("[role='menuitemradio'], [role='menuitemcheckbox']")
      for (const candidate of Array.from(candidates)) {
        if (!(candidate instanceof HTMLElement)) continue
        if (!this.isVisibleElement(candidate)) continue
        if (this.isElementInsideOphel(candidate)) continue
        if (seen.has(candidate)) continue
        seen.add(candidate)
        items.push(candidate)
      }
    }

    if (items.length === 0) {
      return this.collectDirectVisibleModelMenuItems(anchor)
    }

    return items.sort(
      (left, right) =>
        this.scorePerplexityModelMenuItem(right, anchor) -
        this.scorePerplexityModelMenuItem(left, anchor),
    )
  }

  private findPerplexityModelMenuItemStrict(
    menuItems: HTMLElement[],
    target: string,
  ): HTMLElement | null {
    const normalizedTarget = this.normalizeUiText(target)
    const normalizedItems = menuItems.map((item) => {
      const text = this.normalizeUiText(item.textContent || "")
      return { item, text }
    })

    const exact = normalizedItems.find(({ text }) => text === normalizedTarget)
    if (exact) return exact.item

    const startsWith = normalizedItems.find(({ text }) => text.startsWith(normalizedTarget))
    if (startsWith) return startsWith.item

    const includes = normalizedItems.find(({ text }) => text.includes(normalizedTarget))
    if (includes) return includes.item

    return null
  }

  private findBestPerplexityModelMenuItem(
    menuItems: HTMLElement[],
    target: string,
  ): HTMLElement | null {
    const normalizedTarget = this.normalizeUiText(target)
    const normalizedItems = menuItems.map((item) => {
      const text = this.normalizeUiText(item.textContent || "")
      const firstLine = text.split("\n")[0]?.trim() || text
      return { item, text, firstLine }
    })

    const exact = normalizedItems.find(
      ({ text, firstLine }) => firstLine === normalizedTarget || text === normalizedTarget,
    )
    if (exact) return exact.item

    const suffix = normalizedItems.find(({ firstLine }) => firstLine.endsWith(normalizedTarget))
    if (suffix) return suffix.item

    const startsWith = normalizedItems.find(({ firstLine }) =>
      firstLine.startsWith(normalizedTarget),
    )
    if (startsWith) return startsWith.item

    const fuzzy = normalizedItems.find(({ text }) => text.includes(normalizedTarget))
    return fuzzy?.item || null
  }

  private async openThreadActionMenu({
    preferredContainer,
    triggerScope,
    menuOpenedCheck,
  }: {
    preferredContainer: HTMLElement | null
    triggerScope: ParentNode
    menuOpenedCheck?: (actionButton: HTMLElement) => boolean
  }): Promise<HTMLElement | null> {
    if (preferredContainer) {
      this.revealConversationActions(preferredContainer)
    }

    const actionButton = await this.waitForValue(
      () => this.findThreadActionButton(preferredContainer, triggerScope),
      1500,
    )
    if (!actionButton) return null

    this.simulateClick(actionButton)

    const opened = await this.waitForCondition(
      () =>
        menuOpenedCheck?.(actionButton) ||
        this.isThreadActionMenuOpen(actionButton) ||
        this.findOpenDeleteMenuItem(actionButton) !== null,
      DELETE_FLOW_TIMEOUT_MS,
    )
    return opened ? actionButton : null
  }

  private revealConversationActions(container: HTMLElement): void {
    this.ensureElementVisible(container)
    const events = [
      new PointerEvent("pointerenter", { bubbles: true, composed: true }),
      new MouseEvent("mouseenter", { bubbles: true, composed: true }),
      new MouseEvent("mouseover", { bubbles: true, composed: true }),
      new PointerEvent("pointermove", { bubbles: true, composed: true }),
      new MouseEvent("mousemove", { bubbles: true, composed: true }),
    ]

    events.forEach((event) => container.dispatchEvent(event))
  }

  private getConversationHeaderContainer(): HTMLElement | null {
    return (
      (document.querySelector(".h-headerHeight.fixed.z-10") as HTMLElement | null) ||
      (document.querySelector("header") as HTMLElement | null)
    )
  }

  private findThreadActionButton(
    preferredContainer: HTMLElement | null,
    triggerScope: ParentNode,
  ): HTMLElement | null {
    const scopes = [preferredContainer, triggerScope].filter(Boolean) as ParentNode[]

    for (const scope of scopes) {
      for (const selector of THREAD_ACTION_BUTTON_SELECTORS) {
        const candidates = scope.querySelectorAll(selector)
        for (const candidate of Array.from(candidates)) {
          if (!(candidate instanceof HTMLElement)) continue
          if (!this.isVisibleElement(candidate)) continue
          if (this.matchesUiLabel(candidate, THREAD_ACTION_SIGNAL_LABELS)) {
            return candidate
          }
        }
      }
    }

    return this.findScoredThreadActionButton(
      preferredContainer,
      triggerScope,
      !preferredContainer && triggerScope === document.body,
    )
  }

  private async confirmDeleteFromOpenMenu(
    id: string,
    expectSessionChange: boolean,
    anchor: HTMLElement | null = null,
  ): Promise<{ success: boolean; reason?: string }> {
    const deleteItem = await this.waitForValue(
      () => this.findOpenDeleteMenuItem(anchor),
      DELETE_FLOW_TIMEOUT_MS,
    )
    if (!deleteItem) {
      void this.showPerplexityDebugToast(
        `[Perplexity Debug] delete menu item not found: ${id}`,
        "perplexity-delete-menu-item",
      )
      return { success: false, reason: "delete_menu_item_not_found" }
    }

    this.simulateClick(deleteItem)

    const confirmButton = await this.waitForValue(() => this.findConfirmationButton(), 1_500)

    if (confirmButton) {
      this.simulateClick(confirmButton)
    }

    const deleted = await this.waitForConversationDeletion(id, expectSessionChange)
    if (!deleted) {
      void this.showPerplexityDebugToast(
        `[Perplexity Debug] delete was not observed on site: ${id}${confirmButton ? "" : " | confirm button not found"}`,
        "perplexity-delete-not-observed",
      )
      return {
        success: false,
        reason: confirmButton
          ? "deletion_not_observed"
          : "confirm_button_not_found_or_delete_not_observed",
      }
    }

    return { success: true }
  }

  private findOpenDeleteMenuItem(anchor: HTMLElement | null = null): HTMLElement | null {
    const candidates = document.querySelectorAll(
      "button, [role='button'], [role='menuitem'], [role='menuitemradio'], [role='option'], [data-radix-collection-item], [tabindex]",
    )
    let best: { element: HTMLElement; score: number } | null = null

    for (const candidate of Array.from(candidates)) {
      if (!(candidate instanceof HTMLElement)) continue
      if (!this.isVisibleElement(candidate)) continue
      if (candidate.closest(".gh-root")) continue

      const signal = this.getUiSignalText(candidate)
      const classSignal = this.normalizeUiText(candidate.className || "")
      const matchesDelete =
        this.matchesUiLabel(candidate, DELETE_MENU_ITEM_LABELS) ||
        /(danger|destructive|theme-error)/.test(classSignal)

      if (!matchesDelete) continue

      let score = 0
      if (this.matchesUiLabel(candidate, DELETE_MENU_ITEM_LABELS)) score += 120
      if (/(danger|destructive|theme-error)/.test(classSignal)) score += 60
      if (candidate.getAttribute("role")?.includes("menuitem")) score += 50
      if (candidate.hasAttribute("data-radix-collection-item")) score += 25
      if (anchor) score += this.getOverlayProximityScore(candidate, anchor)
      if (/rename|重命名/.test(signal)) score = Number.NEGATIVE_INFINITY
      if (!Number.isFinite(score)) continue

      if (!best || score > best.score) {
        best = { element: candidate, score }
      }
    }

    return best?.element || null
  }

  private findOpenRenameMenuItem(anchor: HTMLElement | null = null): HTMLElement | null {
    const candidates = document.querySelectorAll(
      "button, [role='button'], [role='menuitem'], [role='menuitemradio'], [role='option'], [data-radix-collection-item], [tabindex]",
    )
    let best: { element: HTMLElement; score: number } | null = null

    for (const candidate of Array.from(candidates)) {
      if (!(candidate instanceof HTMLElement)) continue
      if (!this.isVisibleElement(candidate)) continue
      if (candidate.closest(".gh-root")) continue
      if (!this.matchesUiLabel(candidate, RENAME_MENU_ITEM_LABELS)) continue

      let score = 0
      if (candidate.getAttribute("role")?.includes("menuitem")) score += 80
      if (candidate.hasAttribute("data-radix-collection-item")) score += 30
      if (anchor) score += this.getOverlayProximityScore(candidate, anchor)

      if (!best || score > best.score) {
        best = { element: candidate, score }
      }
    }

    return best?.element || null
  }

  private findConfirmationButton(): HTMLElement | null {
    const dialogs = document.querySelectorAll("[role='dialog'], [data-radix-portal]")
    let best: { element: HTMLElement; score: number } | null = null
    for (const dialog of Array.from(dialogs)) {
      const buttons = dialog.querySelectorAll("button, [role='button']")
      for (const button of Array.from(buttons)) {
        if (!(button instanceof HTMLElement)) continue
        if (!this.isVisibleElement(button)) continue
        if (this.matchesUiLabel(button, CANCEL_BUTTON_LABELS)) continue
        if (this.matchesUiLabel(button, CONFIRM_BUTTON_LABELS)) {
          const score =
            (/(danger|destructive|theme-error)/.test(this.normalizeUiText(button.className || ""))
              ? 60
              : 0) + (button.closest("[role='dialog']") ? 30 : 0)
          if (!best || score > best.score) {
            best = { element: button, score }
          }
        }
      }
    }

    if (best) return best.element

    const fallbackButtons = document.querySelectorAll("button, [role='button']")
    for (const button of Array.from(fallbackButtons)) {
      if (!(button instanceof HTMLElement)) continue
      if (!this.isVisibleElement(button)) continue
      if (button.closest(".gh-root")) continue
      if (this.matchesUiLabel(button, CANCEL_BUTTON_LABELS)) continue
      if (this.matchesUiLabel(button, CONFIRM_BUTTON_LABELS)) {
        return button
      }
    }

    return null
  }

  private findRenameDialog(): HTMLElement | null {
    const candidates = document.querySelectorAll(
      "[role='dialog'], [data-radix-portal], .fixed.inset-0, .fixed.inset-x-0, .fixed",
    )
    let best: { element: HTMLElement; score: number } | null = null

    for (const candidate of Array.from(candidates)) {
      if (!(candidate instanceof HTMLElement)) continue
      if (!this.isVisibleElement(candidate)) continue
      if (candidate.closest(".gh-root")) continue

      const signal = this.getUiSignalText(candidate)
      const hasTitleHint = RENAME_DIALOG_TITLE_LABELS.some((label) =>
        signal.includes(this.normalizeUiText(label)),
      )
      const hasSaveButton = this.findRenameSaveButton(candidate) !== null
      const hasEditor = this.findRenameDialogEditor(candidate) !== null
      if (!hasEditor || (!hasTitleHint && !hasSaveButton)) continue

      let score = 0
      if (hasTitleHint) score += 100
      if (hasSaveButton) score += 60
      if (hasEditor) score += 60

      if (!best || score > best.score) {
        best = { element: candidate, score }
      }
    }

    return best?.element || null
  }

  private findRenameDialogEditor(dialog: ParentNode): HTMLElement | null {
    const candidates = dialog.querySelectorAll(
      "textarea, input[type='text'], [contenteditable='true'][role='textbox'], [contenteditable='true']",
    )

    for (const candidate of Array.from(candidates)) {
      if (!(candidate instanceof HTMLElement)) continue
      if (!this.isVisibleElement(candidate)) continue
      if (candidate.matches("#ask-input")) continue
      return candidate
    }

    return null
  }

  private findRenameSaveButton(dialog: ParentNode): HTMLElement | null {
    const buttons = dialog.querySelectorAll("button, [role='button']")
    for (const button of Array.from(buttons)) {
      if (!(button instanceof HTMLElement)) continue
      if (!this.isVisibleElement(button)) continue
      if (this.matchesUiLabel(button, SAVE_BUTTON_LABELS)) {
        return button
      }
    }

    return null
  }

  private setRenameDialogValue(editor: HTMLElement, value: string): void {
    editor.focus()

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      this.setTextEntryValue(editor, value)
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: value }))
      editor.dispatchEvent(new Event("change", { bubbles: true }))
      if (editor instanceof HTMLTextAreaElement) {
        editor.setSelectionRange(value.length, value.length)
      }
      return
    }

    this.selectEditorContents(editor)
    try {
      document.execCommand("delete", false)
    } catch {
      // ignore
    }

    if (this.dispatchPasteEvent(editor, value)) {
      this.placeCaretAtEnd(editor)
      return
    }

    editor.textContent = value
    this.dispatchEditorInputEvents(editor, value, "insertText")
    this.placeCaretAtEnd(editor)
  }

  private findVisibleDialog(): HTMLElement | null {
    const dialogs = document.querySelectorAll("[role='dialog'], [data-radix-portal]")
    for (const dialog of Array.from(dialogs)) {
      if (dialog instanceof HTMLElement && this.isVisibleElement(dialog)) {
        return dialog
      }
    }

    return null
  }

  private async waitForConversationDeletion(
    id: string,
    expectSessionChange: boolean,
  ): Promise<boolean> {
    const start = Date.now()
    let apiChecked = false

    while (Date.now() - start < DELETE_FLOW_TIMEOUT_MS) {
      if (this.isConversationDeletionSettled(id, expectSessionChange)) {
        return true
      }

      if (!apiChecked && Date.now() - start >= 1_000) {
        apiChecked = true
        if (await this.verifyConversationMissingViaApi(id)) {
          return true
        }
      }

      await this.sleep(120)
    }

    return this.verifyConversationMissingViaApi(id)
  }

  private isConversationDeletionSettled(id: string, expectSessionChange: boolean): boolean {
    const sessionChanged = !expectSessionChange || this.getSessionId() !== id
    const sidebarLink = this.findSidebarConversationLink(id)
    const sidebarRemoved = !sidebarLink || !sidebarLink.isConnected
    const dialogClosed = this.findVisibleDialog() === null

    return sessionChanged && dialogClosed && sidebarRemoved
  }

  private async verifyConversationMissingViaApi(id: string): Promise<boolean> {
    try {
      const conversations = await this.fetchThreadsViaApi()
      return !conversations.some((item) => item.id === id)
    } catch {
      return false
    }
  }

  private findScoredThreadActionButton(
    preferredContainer: HTMLElement | null,
    triggerScope: ParentNode,
    includeBodyFallback = false,
  ): HTMLElement | null {
    const scopes = [preferredContainer, triggerScope]
      .concat(includeBodyFallback ? [document.body] : [])
      .filter(Boolean) as ParentNode[]
    let best: { element: HTMLElement; score: number } | null = null

    for (const scope of scopes) {
      const candidates = scope.querySelectorAll(
        'button, [role="button"], [aria-haspopup="menu"], [aria-haspopup="dialog"], [aria-haspopup="listbox"]',
      )
      for (const candidate of Array.from(candidates)) {
        if (!(candidate instanceof HTMLElement)) continue
        const score = this.scoreThreadActionButtonCandidate(candidate, preferredContainer)
        if (!Number.isFinite(score)) continue
        if (!best || score > best.score) {
          best = { element: candidate, score }
        }
      }
    }

    return best?.element || null
  }

  private isPerplexityModelMenuOpen(selectorBtn: HTMLElement | null): boolean {
    if (!selectorBtn) return false

    const expanded = (selectorBtn.getAttribute("aria-expanded") || "").toLowerCase()
    const state = (selectorBtn.getAttribute("data-state") || "").toLowerCase()
    if (expanded === "true" || state === "open") {
      return true
    }

    return this.collectVisibleModelMenuItems(selectorBtn).length > 0
  }

  private isThreadActionMenuOpen(actionButton: HTMLElement | null): boolean {
    if (!actionButton) return false

    const expanded = (actionButton.getAttribute("aria-expanded") || "").toLowerCase()
    const state = (actionButton.getAttribute("data-state") || "").toLowerCase()
    if (expanded === "true" || state === "open") {
      return true
    }

    return this.findOpenDeleteMenuItem(actionButton) !== null
  }

  private getOverlayProximityScore(candidate: HTMLElement, anchor: HTMLElement | null): number {
    if (!anchor) return 0

    const candidateRect = candidate.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    const candidateCenterX = candidateRect.left + candidateRect.width / 2
    const candidateCenterY = candidateRect.top + candidateRect.height / 2
    const anchorCenterX = anchorRect.left + anchorRect.width / 2
    const anchorCenterY = anchorRect.top + anchorRect.height / 2
    const distanceX = Math.abs(candidateCenterX - anchorCenterX)
    const distanceY = Math.abs(candidateCenterY - anchorCenterY)

    let score = 0
    score -= distanceX * 0.2
    score -= distanceY * 0.12
    if (candidateRect.bottom <= anchorRect.top + 16) score += 50
    if (candidateRect.top >= anchorRect.bottom - 16) score += 35
    if (
      candidateRect.left >= anchorRect.left - 80 &&
      candidateRect.right <= anchorRect.right + 280
    ) {
      score += 45
    }

    return score
  }

  private ensureElementVisible(element: Element | null): void {
    if (!(element instanceof HTMLElement)) return

    try {
      element.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "auto",
      })
    } catch {
      try {
        element.scrollIntoView({ block: "center", inline: "nearest" })
      } catch {
        // ignore
      }
    }
  }

  private scoreThreadActionButtonCandidate(
    candidate: HTMLElement,
    preferredContainer: HTMLElement | null,
  ): number {
    if (!this.isVisibleElement(candidate) || this.isDisabledActionButton(candidate)) {
      return Number.NEGATIVE_INFINITY
    }
    if (this.isElementInsideOphel(candidate)) return Number.NEGATIVE_INFINITY
    if (candidate.matches("input, textarea, label")) return Number.NEGATIVE_INFINITY
    if (candidate.matches(SUBMIT_BUTTON_SELECTOR) || candidate.matches(STOP_BUTTON_SELECTOR)) {
      return Number.NEGATIVE_INFINITY
    }

    const signal = this.getUiSignalText(candidate)
    let score = 0

    if (candidate.getAttribute("aria-haspopup")) score += 120
    if (THREAD_ACTION_SIGNAL_LABELS.some((label) => signal.includes(this.normalizeUiText(label)))) {
      score += 100
    }
    if (/(ellipsis|menu|more|更多|菜单|\.{3}|…)/.test(signal)) score += 80
    if (preferredContainer && candidate.closest("li") === preferredContainer.closest("li"))
      score += 40
    if (preferredContainer && candidate.closest(".h-headerHeight.fixed.z-10")) score += 25
    if (candidate.matches("button, [role='button']")) score += 10

    const rect = candidate.getBoundingClientRect()
    score += Math.max(0, rect.right) * 0.05
    score -= Math.max(0, rect.top) * 0.02

    return score
  }

  private findUserContentRoot(element: Element): HTMLElement | null {
    const candidates = Array.from(element.querySelectorAll(USER_QUERY_CONTENT_SELECTOR)).filter(
      (candidate) => candidate instanceof HTMLElement,
    ) as HTMLElement[]

    let best: HTMLElement | null = null
    let bestScore = 0

    for (const candidate of candidates) {
      const root =
        candidate.matches("[data-lexical-text='true']") && candidate.parentElement
          ? candidate.parentElement
          : candidate
      const text = (root.innerText || root.textContent || "").trim()
      if (!text) continue

      if (text.length > bestScore) {
        best = root as HTMLElement
        bestScore = text.length
      }
    }

    return best
  }

  private clearExportMarkers(): void {
    document
      .querySelectorAll(`[${EXPORT_ROLE_ATTR}]`)
      .forEach((node) => node.removeAttribute(EXPORT_ROLE_ATTR))
  }

  private markExportMessages(container: Element): void {
    const users = this.collectTopLevelBlocks(
      Array.from(container.querySelectorAll(USER_QUERY_SELECTOR)).filter(
        (element) => !this.shouldSkipExportElement(element),
      ),
    )
    const assistants = this.collectTopLevelBlocks(
      Array.from(container.querySelectorAll(ASSISTANT_MESSAGE_SELECTOR)).filter(
        (element) =>
          !this.shouldSkipExportElement(element) && !element.closest(USER_QUERY_SELECTOR),
      ),
    )

    users.forEach((element) => element.setAttribute(EXPORT_ROLE_ATTR, "user"))
    assistants.forEach((element) => element.setAttribute(EXPORT_ROLE_ATTR, "assistant"))
  }

  private shouldSkipExportElement(element: Element): boolean {
    return (
      element.closest(".gh-root") !== null ||
      element.closest(".gh-user-query-markdown") !== null ||
      element.matches(QUERY_EDIT_BUTTON_SELECTOR)
    )
  }

  private shouldSkipOutlineElement(element: Element): boolean {
    const userQueryAncestor = element.closest(USER_QUERY_SELECTOR)

    return (
      element.closest(".gh-root") !== null ||
      element.closest(".gh-user-query-markdown") !== null ||
      (userQueryAncestor !== null && !element.matches(USER_QUERY_SELECTOR))
    )
  }

  private setTextEntryValue(editor: HTMLTextAreaElement | HTMLInputElement, value: string): void {
    const prototype =
      editor instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set

    if (setter) {
      setter.call(editor, value)
    } else {
      editor.value = value
    }
  }

  private collectTopLevelBlocks<T extends Element>(elements: T[]): T[] {
    return elements.filter(
      (element) => !elements.some((other) => other !== element && other.contains(element)),
    )
  }

  private dedupeUserQueries<T extends Element>(elements: T[], container: Element): T[] {
    if (elements.length <= 1) return elements

    const sorted = [...elements].sort((left, right) =>
      this.compareElementsByDocumentOrder(left, right),
    )
    const deduped: T[] = []

    for (const element of sorted) {
      const previous = deduped[deduped.length - 1]
      if (!previous) {
        deduped.push(element)
        continue
      }

      const previousText = this.normalizeUiText(this.extractUserQueryText(previous))
      const currentText = this.normalizeUiText(this.extractUserQueryText(element))
      if (
        previousText &&
        previousText === currentText &&
        !this.hasAssistantResponseBetween(container, previous, element)
      ) {
        deduped[deduped.length - 1] = element
        continue
      }

      deduped.push(element)
    }

    return deduped
  }

  private collectOutlineHeadingCandidates(container: Element, maxLevel: number): Element[] {
    const selectors = Array.from({ length: maxLevel }, (_, index) => {
      const level = index + 1
      return [`h${level}`, `[role='heading'][aria-level='${level}']`]
    }).flat()

    const candidates = Array.from(new Set(container.querySelectorAll(selectors.join(", "))))
    return this.collectTopLevelBlocks(
      candidates.filter((element) => this.isOutlineHeadingCandidate(element, maxLevel)),
    )
  }

  private getOutlineContainer(): Element | null {
    const main = document.querySelector("main")
    if (main) return main

    const panelTabs = Array.from(document.querySelectorAll("[role='tabpanel']")).filter((element) =>
      element.closest("main"),
    )
    if (panelTabs.length > 0) {
      return panelTabs[panelTabs.length - 1]
    }

    return document.querySelector(this.getResponseContainerSelector())
  }

  private collectAssistantRoots(container: Element): Element[] {
    return this.collectTopLevelBlocks(
      Array.from(container.querySelectorAll(ASSISTANT_MESSAGE_SELECTOR)).filter(
        (element) =>
          !this.shouldSkipExportElement(element) && !element.closest(USER_QUERY_SELECTOR),
      ),
    )
  }

  private collectAssistantOutlineItems(
    assistantRoot: Element,
    groupId: string,
    maxLevel: number,
    showWordCount: boolean,
  ): OutlineItem[] {
    const assistantId = this.getAssistantOutlineScopeId(assistantRoot)
    const occurrenceCounts = new Map<string, number>()
    const realHeadings = this.collectOutlineHeadingCandidates(assistantRoot, maxLevel)

    if (realHeadings.length > 0) {
      return realHeadings.flatMap((element, index) => {
        const level = this.getOutlineHeadingLevel(element)
        const text = element.textContent?.trim() || ""
        if (level === null || !text) return []

        const item: OutlineItem = {
          level,
          text,
          element,
        }
        item.id = this.buildOutlineOccurrenceId(
          `heading::${groupId}::${assistantId}::${level}`,
          this.normalizeUiText(text),
          occurrenceCounts,
        )

        if (showWordCount) {
          let nextBoundary: Element | null = null
          for (let i = index + 1; i < realHeadings.length; i += 1) {
            const candidate = realHeadings[i]
            const candidateLevel = this.getOutlineHeadingLevel(candidate)
            if (candidateLevel !== null && candidateLevel <= level) {
              nextBoundary = candidate
              break
            }
          }

          item.wordCount = this.calculateRangeWordCount(element, nextBoundary, assistantRoot)
        }

        return [item]
      })
    }

    return this.extractOutlineFromAssistantMarkdown(
      assistantRoot,
      groupId,
      assistantId,
      maxLevel,
      showWordCount,
    )
  }

  private extractOutlineFromAssistantMarkdown(
    assistantRoot: Element,
    groupId: string,
    assistantId: string,
    maxLevel: number,
    showWordCount: boolean,
  ): OutlineItem[] {
    const markdown = this.extractAssistantResponseText(assistantRoot)
    const headings = markdown ? this.parseMarkdownHeadings(markdown, maxLevel) : []
    if (headings.length > 0) {
      const occurrenceCounts = new Map<string, number>()
      return headings.map((heading, index) => {
        const item: OutlineItem = {
          level: heading.level,
          text: heading.text,
          element: assistantRoot,
          context: `markdown-line:${heading.line}`,
        }
        item.id = this.buildOutlineOccurrenceId(
          `heading::${groupId}::${assistantId}::${heading.level}`,
          this.normalizeUiText(heading.text),
          occurrenceCounts,
        )

        if (showWordCount) {
          const nextLine = headings[index + 1]?.line ?? null
          item.wordCount = this.countMarkdownSectionLength(markdown, heading.line, nextLine)
        }

        return item
      })
    }

    const codeMarkdown = this.extractMarkdownFromCodeBlocks(assistantRoot)
    if (!codeMarkdown) return []

    const codeHeadings = this.parseMarkdownHeadings(codeMarkdown, maxLevel)
    if (codeHeadings.length === 0) return []

    const occurrenceCounts = new Map<string, number>()
    return codeHeadings.map((heading, index) => {
      const item: OutlineItem = {
        level: heading.level,
        text: heading.text,
        element: assistantRoot,
        context: `code-markdown-line:${heading.line}`,
      }
      item.id = this.buildOutlineOccurrenceId(
        `heading::${groupId}::${assistantId}::${heading.level}`,
        this.normalizeUiText(heading.text),
        occurrenceCounts,
      )

      if (showWordCount) {
        const nextLine = codeHeadings[index + 1]?.line ?? null
        item.wordCount = this.countMarkdownSectionLength(codeMarkdown, heading.line, nextLine)
      }

      return item
    })
  }

  private isOutlineHeadingCandidate(element: Element, maxLevel: number): boolean {
    if (this.shouldSkipOutlineElement(element)) return false
    if (element.closest("nav, aside, header, footer, [role='dialog'], button, [role='button']")) {
      return false
    }

    const level = this.getOutlineHeadingLevel(element)
    if (level === null || level > maxLevel) return false

    const text = element.textContent?.trim() || ""
    return Boolean(text)
  }

  private getOutlineHeadingLevel(element: Element): number | null {
    const tagName = element.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tagName)) {
      const level = parseInt(tagName.charAt(1), 10)
      return Number.isNaN(level) ? null : level
    }

    if (element.getAttribute("role") === "heading") {
      const rawLevel = parseInt(element.getAttribute("aria-level") || "", 10)
      return Number.isNaN(rawLevel) ? null : rawLevel
    }

    return null
  }

  private getAssistantOutlineScopeId(element: Element): string {
    const id = (element as HTMLElement).id?.trim()
    if (id) return id

    const labelledBy = element.getAttribute("aria-labelledby")?.trim()
    if (labelledBy) return labelledBy

    return this.normalizeUiText(element.textContent || "").slice(0, 80) || "assistant"
  }

  private compareElementsByDocumentOrder(left: Element, right: Element): number {
    if (left === right) return 0

    const position = left.compareDocumentPosition(right)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  }

  private hasAssistantResponseBetween(
    container: Element,
    startElement: Element,
    endElement: Element,
  ): boolean {
    const assistants = this.collectTopLevelBlocks(
      Array.from(container.querySelectorAll(ASSISTANT_MESSAGE_SELECTOR)).filter(
        (element) =>
          !this.shouldSkipExportElement(element) && !element.closest(USER_QUERY_SELECTOR),
      ),
    )

    return assistants.some((assistant) => {
      const afterStart = Boolean(
        startElement.compareDocumentPosition(assistant) & Node.DOCUMENT_POSITION_FOLLOWING,
      )
      if (!afterStart) return false

      const beforeEnd = Boolean(
        endElement.compareDocumentPosition(assistant) & Node.DOCUMENT_POSITION_PRECEDING,
      )
      return beforeEnd
    })
  }

  private buildOutlineOccurrenceId(
    prefix: string,
    key: string,
    counts: Map<string, number>,
  ): string {
    const safeKey = key || "untitled"
    const currentCount = counts.get(`${prefix}::${safeKey}`) || 0
    const nextCount = currentCount + 1
    counts.set(`${prefix}::${safeKey}`, nextCount)
    return `${prefix}::${safeKey}::${nextCount}`
  }

  private parseMarkdownHeadings(
    markdown: string,
    maxLevel: number,
  ): Array<{ level: number; text: string; line: number }> {
    const lines = markdown.split(/\r?\n/)
    const headings: Array<{ level: number; text: string; line: number }> = []
    let inFence = false

    lines.forEach((line, index) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence
        return
      }
      if (inFence) return

      const match = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/)
      if (!match) return

      const level = match[1].length
      if (level > maxLevel) return

      const text = match[2].trim()
      if (!text) return

      headings.push({ level, text, line: index })
    })

    return headings
  }

  private extractMarkdownFromCodeBlocks(assistantRoot: Element): string | null {
    const codeBlocks = Array.from(assistantRoot.querySelectorAll("pre code, pre"))
      .map((element) => (element.textContent || "").replace(/\r\n/g, "\n").trim())
      .filter(Boolean)

    for (const block of codeBlocks) {
      const normalized = this.normalizeCodeBlockMarkdown(block)
      if (!normalized) continue
      if (this.parseMarkdownHeadings(normalized, 6).length > 0) {
        return normalized
      }
    }

    return null
  }

  private normalizeCodeBlockMarkdown(source: string): string | null {
    const lines = source.split("\n")
    if (lines.length === 0) return null

    const firstLine = this.normalizeUiText(lines[0])
    const body = lines.slice(1).join("\n").trim()

    if (["text", "markdown", "md", "txt"].includes(firstLine) && body) {
      return body
    }

    return source.trim() || null
  }

  private countMarkdownSectionLength(
    markdown: string,
    startLine: number,
    nextLine: number | null,
  ): number {
    const lines = markdown.split(/\r?\n/)
    const endLine = nextLine ?? lines.length
    return lines
      .slice(startLine + 1, endLine)
      .join("\n")
      .replace(/\s+/g, " ")
      .trim().length
  }

  private isValidUserQueryCandidate(element: Element): boolean {
    if (
      element.closest(
        ".h-headerHeight.fixed.z-10, header, nav, aside, [role='dialog'], .fixed, .sticky",
      )
    ) {
      return false
    }

    if (element.closest(ASSISTANT_MESSAGE_SELECTOR)) {
      return false
    }

    return Boolean(this.extractUserQueryText(element))
  }

  private calculateAssistantWordCountBetween(
    container: Element,
    startElement: Element,
    nextUserQuery: Element | null,
  ): number {
    let total = 0
    const assistants = Array.from(container.querySelectorAll(ASSISTANT_MESSAGE_SELECTOR))

    for (const assistant of assistants) {
      const afterStart = Boolean(
        startElement.compareDocumentPosition(assistant) & Node.DOCUMENT_POSITION_FOLLOWING,
      )
      if (!afterStart) continue

      if (nextUserQuery) {
        const beforeEnd = Boolean(
          nextUserQuery.compareDocumentPosition(assistant) & Node.DOCUMENT_POSITION_PRECEDING,
        )
        if (!beforeEnd) continue
      }

      total += this.extractAssistantResponseText(assistant).length
    }

    return total
  }

  private promoteUsageCounterAnchor(candidate: HTMLElement | null): HTMLElement | null {
    let current = candidate

    for (let depth = 0; current && depth < 4; depth += 1) {
      if (!current.parentElement) return null

      const parent = current.parentElement
      const parentStyle = window.getComputedStyle(parent)
      const isRowFlex =
        parentStyle.display.includes("flex") && !parentStyle.flexDirection.startsWith("column")

      if (!isRowFlex) {
        return current
      }

      current = parent
    }

    return candidate
  }

  private extractConversationTitle(anchor: HTMLAnchorElement, slug: string): string {
    const candidates: Array<{ text: string; score: number }> = []
    const row =
      anchor.closest("li") ||
      anchor.closest("[role='listitem']") ||
      anchor.closest(".group") ||
      anchor.parentElement

    const addCandidate = (value: string | null | undefined, bonus: number) => {
      const normalized = this.normalizeConversationTitle(value || "", slug)
      if (!normalized) return
      candidates.push({
        text: normalized,
        score: this.scoreConversationTitleCandidate(normalized, slug) + bonus,
      })
    }

    const scopedElements = [anchor, row].filter(Boolean) as Element[]
    const scopedSelectors = ["[data-testid*='title']", "[dir='auto']", ".truncate", "span", "div"]

    for (const scope of scopedElements) {
      for (const selector of scopedSelectors) {
        scope.querySelectorAll(selector).forEach((candidate) => {
          const visibleBonus =
            candidate instanceof HTMLElement && this.isVisibleElement(candidate) ? 130 : 70
          addCandidate(candidate.textContent || "", visibleBonus)
        })
      }
    }

    addCandidate(anchor.textContent, 110)
    addCandidate(row?.textContent || null, 40)

    // Native Perplexity rename can update visible text before title/aria attributes.
    // Keep attributes as fallback signals, but do not let stale attributes beat visible text.
    addCandidate(anchor.getAttribute("title"), 25)
    addCandidate(anchor.getAttribute("aria-label"), 25)
    addCandidate(row instanceof HTMLElement ? row.getAttribute("title") : null, 10)
    addCandidate(row instanceof HTMLElement ? row.getAttribute("aria-label") : null, 10)

    candidates.sort((left, right) => right.score - left.score)
    return candidates[0]?.text || slug
  }

  private hasConversationTitleSignal(id: string, title: string): boolean {
    const normalizedTarget = this.normalizeConversationTitle(title, id)
    if (!normalizedTarget) return false

    const sidebarLink = this.findSidebarConversationLink(id)
    if (sidebarLink) {
      const sidebarTitle = this.extractConversationTitle(sidebarLink, id)
      if (this.normalizeConversationTitle(sidebarTitle, id) === normalizedTarget) {
        return true
      }
    }

    if (this.getSessionId() === id) {
      const currentTitle = this.getConversationTitle() || ""
      if (this.normalizeConversationTitle(currentTitle, id) === normalizedTarget) {
        return true
      }
    }

    const cachedItem = this.getCachedThreadList().find((item) => item.id === id)
    if (cachedItem && this.normalizeConversationTitle(cachedItem.title, id) === normalizedTarget) {
      return true
    }

    return false
  }

  private applyConversationTitleToDom(
    anchor: HTMLAnchorElement,
    slug: string,
    title: string,
  ): void {
    const currentTitle = this.extractConversationTitle(anchor, slug)

    anchor.setAttribute("title", title)
    anchor.setAttribute("aria-label", title)

    const row = this.findConversationItemContainer(anchor)
    row?.setAttribute("title", title)
    row?.setAttribute("aria-label", title)

    const scopes = [anchor, row].filter(Boolean) as Element[]
    for (const scope of scopes) {
      const candidates = scope.querySelectorAll(
        "[data-testid*='title'], [dir='auto'], .truncate, span",
      )
      for (const candidate of Array.from(candidates)) {
        if (!(candidate instanceof HTMLElement)) continue
        const candidateTitle = this.normalizeConversationTitle(candidate.textContent || "", slug)
        if (!candidateTitle || candidateTitle !== currentTitle) continue
        candidate.textContent = title
        return
      }
    }
  }

  private normalizeConversationTitle(rawTitle: string, slug: string): string {
    const normalized = rawTitle
      .replace(/\s+/g, " ")
      .replace(
        /(?:Rename|Delete|More|\u91cd\u547d\u540d|\u5220\u9664|\u66f4\u591a|\u83dc\u5355)+$/giu,
        "",
      )
      .trim()
    if (!normalized) return ""
    if (normalized === "/" || normalized === "..." || normalized === "···") return ""
    if (/^\(\d+\)$/.test(normalized)) return ""
    if (normalized === slug) return slug
    return normalized
  }

  private pickPreferredConversationTitle(
    existingTitle: string | undefined,
    incomingTitle: string | undefined,
    slug: string,
  ): string {
    const existing = this.normalizeConversationTitle(existingTitle || "", slug)
    const incoming = this.normalizeConversationTitle(incomingTitle || "", slug)

    if (!incoming) return existing || slug
    if (!existing) return incoming || slug
    if (existing === incoming) return incoming

    const existingIsSlug = this.isLikelySlugTitle(existing, slug)
    const incomingIsSlug = this.isLikelySlugTitle(incoming, slug)

    if (existingIsSlug && !incomingIsSlug) return incoming
    if (!existingIsSlug && incomingIsSlug) return existing

    return incoming
  }

  private scoreConversationTitleCandidate(title: string, slug: string): number {
    let score = 0

    if (!this.isLikelySlugTitle(title, slug)) score += 100
    if (/[\u3400-\u9fff]/.test(title)) score += 40
    if (/\s/.test(title)) score += 15
    if (title.length >= 6) score += Math.min(title.length, 60)
    if (title.length > 120) score -= 20
    if (/^(answer|share|thread|search)$/i.test(title)) score -= 80

    return score
  }

  private isLikelySlugTitle(title: string, slug?: string): boolean {
    const normalized = title.trim().toLowerCase()
    const normalizedSlug = slug?.trim().toLowerCase() || ""

    if (!normalized) return true
    if (/[\u3400-\u9fff]/.test(normalized)) return false
    if (normalizedSlug && normalized === normalizedSlug) return true
    if (normalized.includes(" ") && !/^[a-z0-9][a-z0-9 -]*$/i.test(normalized)) return false

    return /^[a-z0-9]+(?:-[a-z0-9]+){2,}(?:-[a-z0-9_-]{4,})?$/i.test(normalized)
  }

  private truncateText(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  }

  private isVisibleElement(element: HTMLElement | null): boolean {
    if (!element) return false
    if (element.offsetParent !== null) return true

    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private isDisabledActionButton(element: HTMLElement | null): boolean {
    if (!element) return true
    return (
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-disabled") === "true" ||
      element.classList.contains("disabled")
    )
  }

  private matchesUiLabel(element: HTMLElement, labels: string[]): boolean {
    const text = this.getUiSignalText(element)

    return labels.some((label) => {
      const normalized = this.normalizeUiText(label)
      return Boolean(normalized) && text.includes(normalized)
    })
  }

  private normalizeUiText(value: string): string {
    return value.replace(/\s+/g, " ").trim().toLowerCase()
  }

  protected simulateClick(element: HTMLElement): void {
    const rect = element.getBoundingClientRect()
    const clientX = rect.left + Math.max(1, Math.min(rect.width / 2, Math.max(1, rect.width - 1)))
    const clientY = rect.top + Math.max(1, Math.min(rect.height / 2, Math.max(1, rect.height - 1)))
    const eventWindow = element.ownerDocument.defaultView || window
    const mouseInit: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 1,
      clientX,
      clientY,
    }
    const pointerInit: PointerEventInit = {
      ...mouseInit,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }
    const MouseEventCtor =
      eventWindow.MouseEvent || (typeof MouseEvent !== "undefined" ? MouseEvent : null)
    const PointerEventCtor =
      eventWindow.PointerEvent || (typeof PointerEvent !== "undefined" ? PointerEvent : null)
    const EventCtor = eventWindow.Event || Event

    const dispatchSyntheticEvent = (type: string, preferPointer = false) => {
      let event: Event | null = null

      try {
        if (preferPointer && PointerEventCtor) {
          event = new PointerEventCtor(type, pointerInit)
        } else if (MouseEventCtor) {
          event = new MouseEventCtor(type, mouseInit)
        }
      } catch {
        event = null
      }

      if (!event && MouseEventCtor) {
        try {
          event = new MouseEventCtor(type, mouseInit)
        } catch {
          event = null
        }
      }

      if (!event) {
        event = new EventCtor(type, { bubbles: true, cancelable: true, composed: true })
      }

      element.dispatchEvent(event)
    }

    try {
      element.focus?.({ preventScroll: true })
    } catch {
      element.focus?.()
    }

    dispatchSyntheticEvent("pointerenter", true)
    dispatchSyntheticEvent("pointerover", true)
    dispatchSyntheticEvent("mouseenter")
    dispatchSyntheticEvent("mouseover")
    dispatchSyntheticEvent("pointerdown", true)
    dispatchSyntheticEvent("mousedown")
    dispatchSyntheticEvent("pointerup", true)
    dispatchSyntheticEvent("mouseup")
    dispatchSyntheticEvent("click")
  }

  private getUiSignalText(element: HTMLElement): string {
    return this.normalizeUiText(
      [
        element.textContent || "",
        element.getAttribute("aria-label") || "",
        element.getAttribute("title") || "",
        element.getAttribute("data-testid") || "",
        element.getAttribute("data-test-id") || "",
        element.id || "",
        element.className || "",
      ].join(" "),
    )
  }

  private looksLikePerplexityModelSelector(element: HTMLElement): boolean {
    const signal = this.getUiSignalText(element)

    if (!signal) return false
    if (this.matchesUiLabel(element, THREAD_ACTION_SIGNAL_LABELS)) return false
    if (/(share|分享|attach|附件|upload|上传|search|搜索|submit|send)/.test(signal)) return false

    if (
      MODEL_SELECTOR_PRIMARY_HINTS.some((keyword) => signal.includes(this.normalizeUiText(keyword)))
    ) {
      return true
    }

    if (signal.includes("模型")) {
      return true
    }

    const hasPopup = ["menu", "listbox", "dialog"].includes(
      (element.getAttribute("aria-haspopup") || "").toLowerCase(),
    )
    return hasPopup && signal.length <= 32
  }

  private scorePerplexityModelSelectorCandidate(
    element: HTMLElement,
    editor: HTMLElement | null,
  ): number {
    let score = 0
    const signal = this.getUiSignalText(element)

    const hasPrimaryHint = MODEL_SELECTOR_PRIMARY_HINTS.some((keyword) =>
      signal.includes(this.normalizeUiText(keyword)),
    )
    const isGenericModelLabel =
      signal === "模型" || signal.endsWith(" 模型") || signal.includes("aria-label 模型")

    if (hasPrimaryHint) score += 220
    else if (signal.includes("模型")) score += 60
    if (element.getAttribute("aria-haspopup")) score += 50
    if (editor && element.closest("form") === editor.closest("form")) score += 60
    if (isGenericModelLabel) score -= 40

    const rect = element.getBoundingClientRect()
    score += Math.max(0, rect.top)
    score -= Math.abs(rect.right - window.innerWidth) * 0.15

    return score
  }

  private looksLikePerplexityModelMenuItem(
    element: HTMLElement,
    anchor: HTMLElement | null = null,
  ): boolean {
    const signal = this.getUiSignalText(element)
    if (!signal) return false
    if (this.matchesUiLabel(element, CANCEL_BUTTON_LABELS)) return false
    if (anchor && (element === anchor || anchor.contains(element) || element.contains(anchor))) {
      return false
    }

    const hasModelHint = MODEL_MENU_HINTS.some((keyword) =>
      signal.includes(this.normalizeUiText(keyword)),
    )
    if (!hasModelHint) return false

    if (element.getAttribute("role")?.includes("menuitem")) return true
    if (element.getAttribute("role") === "option") return true
    if (element.hasAttribute("data-radix-collection-item")) return true
    if (
      element.closest(
        "[role='menu'], [role='listbox'], [data-radix-popper-content-wrapper], [data-radix-portal]",
      )
    ) {
      return true
    }

    return anchor ? this.getOverlayProximityScore(element, anchor) > -120 : true
  }

  private scorePerplexityModelMenuItem(
    element: HTMLElement,
    anchor: HTMLElement | null = null,
  ): number {
    const signal = this.getUiSignalText(element)
    let score = 0

    if (element.getAttribute("role")?.includes("menuitem")) score += 80
    if (element.getAttribute("role") === "option") score += 60
    if (element.hasAttribute("data-radix-collection-item")) score += 35
    if (/gpt|claude|gemini|sonar|nemotron|best|最佳/.test(signal)) score += 100
    if (/max|pro|sonnet|opus|super|thinking|reasoning/.test(signal)) score += 15
    score += this.getOverlayProximityScore(element, anchor)

    const rect = element.getBoundingClientRect()
    score -= Math.max(0, rect.width - 360) * 0.05

    return score
  }

  private async activatePerplexityModelSelector(button: HTMLElement): Promise<void> {
    const expandedBefore = (button.getAttribute("aria-expanded") || "").toLowerCase()
    const stateBefore = (button.getAttribute("data-state") || "").toLowerCase()

    button.click()
    await this.sleep(120)

    const expandedAfter = (button.getAttribute("aria-expanded") || "").toLowerCase()
    const stateAfter = (button.getAttribute("data-state") || "").toLowerCase()
    if (
      expandedAfter === "true" ||
      stateAfter === "open" ||
      expandedAfter !== expandedBefore ||
      stateAfter !== stateBefore ||
      this.findPerplexityModelMenuRoots(button).length > 0
    ) {
      return
    }

    // Fallback for builds that rely on pointer events rather than click.
    this.simulateClick(button)
  }

  private activatePerplexityModelMenuItem(item: HTMLElement): void {
    item.click()
    const checkedAfterClick = (item.getAttribute("aria-checked") || "").toLowerCase()
    if (checkedAfterClick === "true") {
      return
    }

    this.simulateClick(item)
  }

  private async togglePerplexityModelSelector(button: HTMLElement): Promise<void> {
    const expandedBefore = (button.getAttribute("aria-expanded") || "").toLowerCase()
    const stateBefore = (button.getAttribute("data-state") || "").toLowerCase()
    const wasOpen =
      expandedBefore === "true" ||
      stateBefore === "open" ||
      this.findPerplexityModelMenuRoots(button).length > 0

    button.click()
    await this.sleep(110)

    const expandedAfter = (button.getAttribute("aria-expanded") || "").toLowerCase()
    const stateAfter = (button.getAttribute("data-state") || "").toLowerCase()
    const isOpenNow =
      expandedAfter === "true" ||
      stateAfter === "open" ||
      this.findPerplexityModelMenuRoots(button).length > 0

    if (wasOpen !== isOpenNow) {
      return
    }

    this.simulateClick(button)
  }

  private openPerplexityModelSelector(): boolean {
    const button = this.findPerplexityModelSelectorButton()
    if (!button) return false
    if (this.isModelSelectorOpen()) return true
    void this.activatePerplexityModelSelector(button)
    return true
  }

  private async closePerplexityModelSelector(button: HTMLElement | null): Promise<void> {
    if (!button) return

    const isOpen = () => {
      const expanded = (button.getAttribute("aria-expanded") || "").toLowerCase()
      const state = (button.getAttribute("data-state") || "").toLowerCase()
      return (
        expanded === "true" ||
        state === "open" ||
        this.findPerplexityModelMenuRoots(button).length > 0
      )
    }

    if (!isOpen()) return

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    )
    await this.sleep(80)
    if (!isOpen()) return

    document.body.click()
    await this.sleep(80)
    if (!isOpen()) return

    button.click()
  }

  private getCheckedModelItemTexts(): string[] {
    const checkedItems = document.querySelectorAll(
      "[role='menuitemradio'][aria-checked='true'], [role='option'][aria-selected='true'], [role='menuitemcheckbox'][aria-checked='true']",
    )

    return Array.from(checkedItems)
      .filter(
        (item): item is HTMLElement => item instanceof HTMLElement && this.isVisibleElement(item),
      )
      .map((item) => this.normalizeUiText(item.textContent || ""))
      .filter(Boolean)
  }

  private doesCurrentModelMatchTarget(target: string): boolean {
    const normalizedTarget = this.normalizeUiText(target)
    const editor = this.getTextareaElement()
    const scopes = [
      editor?.closest("form"),
      editor?.parentElement,
      editor?.closest("main"),
      document.querySelector("main"),
    ].filter(Boolean) as ParentNode[]

    for (const scope of scopes) {
      const candidates = scope.querySelectorAll(
        "button[aria-haspopup='menu'], [role='button'][aria-haspopup='menu'], [role='combobox']",
      )
      for (const candidate of Array.from(candidates)) {
        if (!(candidate instanceof HTMLElement)) continue
        if (!this.isVisibleElement(candidate) || this.isElementInsideOphel(candidate)) continue
        const signal = this.getUiSignalText(candidate)
        if (
          !MODEL_SELECTOR_PRIMARY_HINTS.some((hint) => signal.includes(this.normalizeUiText(hint)))
        ) {
          continue
        }
        if (signal.includes(normalizedTarget)) {
          return true
        }
      }
    }

    return false
  }

  private getCurrentPerplexityModelText(): string {
    const looseButton = this.findPerplexityModelSelectorButton()
    if (looseButton) {
      return this.normalizeUiText(super.getModelLockCheckText(looseButton))
    }

    const strictButton = this.findPerplexityModelSelectorButtonStrict()
    if (strictButton) {
      return this.normalizeUiText(
        strictButton.textContent || strictButton.getAttribute("aria-label") || "",
      )
    }

    return ""
  }

  private getDebugRect(element: HTMLElement): { x: number; y: number; w: number; h: number } {
    const rect = element.getBoundingClientRect()
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    }
  }

  private logPerplexityModelLockDebug(stage: string, payload: Record<string, unknown>): void {
    if (!this.isPerplexityLockDebugEnabled()) return
    try {
      console.info("[Perplexity Lock Debug]", stage, payload)
    } catch {
      // ignore debug log failures
    }
  }

  private isPerplexityLockDebugEnabled(): boolean {
    try {
      return localStorage.getItem("ophel:perplexity-lock-debug") === "1"
    } catch {
      return false
    }
  }

  private isTargetModelChecked(target: string): boolean {
    const normalizedTarget = this.normalizeUiText(target)
    const checkedItems = document.querySelectorAll(
      "[role='menuitemradio'][aria-checked='true'], [role='option'][aria-selected='true'], [role='menuitemcheckbox'][aria-checked='true']",
    )

    for (const item of Array.from(checkedItems)) {
      if (!(item instanceof HTMLElement)) continue
      if (!this.isVisibleElement(item)) continue
      const text = this.normalizeUiText(item.textContent || "")
      if (text.includes(normalizedTarget)) {
        return true
      }
    }

    return false
  }

  private async showPerplexityDebugToast(message: string, key: string): Promise<void> {
    try {
      const { showToastThrottled } = await import("~utils/toast")
      showToastThrottled(message, 3000, { maxWidth: 520 }, 1800, key)
    } catch {
      // ignore debug toast failures
    }
  }

  private async waitForValue<T>(getter: () => T | null, timeoutMs: number): Promise<T | null> {
    const start = Date.now()

    while (Date.now() - start < timeoutMs) {
      const value = getter()
      if (value) return value
      await this.sleep(80)
    }

    return null
  }

  private async waitForCondition(check: () => boolean, timeoutMs: number): Promise<boolean> {
    const start = Date.now()

    while (Date.now() - start < timeoutMs) {
      if (check()) return true
      await this.sleep(80)
    }

    return false
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}
