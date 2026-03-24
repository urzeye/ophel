/**
 * QwenAI 国际版适配器（chat.qwen.ai）
 *
 * 说明：
 * - 与国内版 qianwen.com 完全独立，避免选择器/路由相互污染
 * - 会话列表优先走官方接口 /api/v2/chats/，DOM 只做补充
 * - 输入框、导出、主题、模型选择器均基于 qwen.html 快照中的稳定类名和结构锚点
 */
import { SITE_IDS } from "~constants"
import { htmlToMarkdown } from "~utils/exporter"

import {
  SiteAdapter,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type MarkdownFixerConfig,
  type ModelSwitcherConfig,
  type OutlineItem,
  type ZenModeRule,
} from "./base"

const QWENAI_CHAT_PATH_PATTERN = /\/c\/([a-f0-9-]+)/i
const QWENAI_THEME_STORAGE_KEY = "theme"
const QWENAI_TOKEN_STORAGE_KEY = "token"
const QWENAI_SIDEBAR_SELECTOR = "#sidebar"
const QWENAI_SIDEBAR_SCROLL_SELECTOR = ".session-list-wrapper"
const QWENAI_SIDEBAR_ITEM_SELECTOR = ".chat-item-drag"
const QWENAI_SIDEBAR_TITLE_SELECTOR = ".chat-item-drag-link-content-tip-text"
const QWENAI_NEW_CHAT_BUTTON_SELECTOR = ".sidebar-entry-fixed-list-content"
const QWENAI_MESSAGE_SCROLL_SELECTOR = "#chat-messages-scroll-container"
const QWENAI_MESSAGE_CONTAINER_SELECTOR = "#chat-message-container"
const QWENAI_USER_MESSAGE_SELECTOR = ".qwen-chat-message-user"
const QWENAI_ASSISTANT_MESSAGE_SELECTOR = ".qwen-chat-message-assistant"
const QWENAI_USER_CONTENT_SELECTOR = ".user-message-content"
const QWENAI_ASSISTANT_CONTENT_SELECTOR = ".response-message-content"
const QWENAI_TEXTAREA_SELECTOR = "textarea.message-input-textarea"
const QWENAI_SEND_BUTTON_SELECTOR = "button.send-button"
const QWENAI_THINKING_CARD_SELECTOR =
  ".qwen-chat-thinking-tool-status-card-wraper, .qwen-chat-thinking-status-card"
const QWENAI_RESPONSE_TOOLBAR_SELECTOR =
  ".response-message-footer, .copy-response-button, .message-hoc-container"
const QWENAI_MODEL_TRIGGER_SELECTOR =
  '#qwen-chat-header-left .ant-dropdown-trigger:has([class*="model-selector-text"])'
const QWENAI_MODEL_TEXT_SELECTOR = '#qwen-chat-header-left [class*="model-selector-text"]'
const QWENAI_MODEL_POPUP_SELECTOR = '[class*="model-selector-popup"]'
const QWENAI_PRIMARY_MODEL_POPUP_SELECTOR =
  '.ant-dropdown:not(.ant-dropdown-hidden) [class*="model-selector-popup"]:not([class*="secondary"])'
const QWENAI_SECONDARY_MODEL_POPUP_SELECTOR =
  '.ant-dropdown:not(.ant-dropdown-hidden) [class*="model-selector-popup"][class*="secondary"]'
const QWENAI_MODEL_ITEM_SELECTOR = [
  `${QWENAI_MODEL_POPUP_SELECTOR} [class*="model-list"] > [class*="model-item___"]`,
  `${QWENAI_MODEL_POPUP_SELECTOR} [class*="model-list"] > [class*="model-item-selected___"]`,
].join(", ")
const QWENAI_MODEL_MORE_TRIGGER_SELECTOR = [
  `${QWENAI_MODEL_POPUP_SELECTOR} .ant-dropdown-trigger:has([class*="view-more-text"])`,
  `${QWENAI_MODEL_POPUP_SELECTOR} .ant-dropdown-trigger:has([class*="view-more-icon"])`,
].join(", ")
const QWENAI_MODEL_MENU_ITEM_SELECTOR = [
  QWENAI_MODEL_ITEM_SELECTOR,
  QWENAI_MODEL_MORE_TRIGGER_SELECTOR,
  '.ant-dropdown [role="menuitem"]',
  ".ant-dropdown .ant-dropdown-menu-item",
  ".ant-dropdown .ant-dropdown-menu-title-content",
  '.ant-select-dropdown [role="option"]',
  ".ant-select-dropdown .ant-select-item-option",
].join(", ")
const QWENAI_MARKDOWN_PARAGRAPH_SELECTOR = ".qwen-markdown-paragraph"
const QWENAI_DISCLAIMER_SELECTOR = ".chat-container-statement"
const QWENAI_CONVERSATION_SNAPSHOT_TTL_MS = 30_000
const QWENAI_FETCH_PAGE_LIMIT = 100
const QWENAI_BOOTSTRAP_PAGE_LIMIT = 5

interface QwenAiConversationApiResponse {
  success?: boolean
  data?: unknown
}

interface QwenAiSettingsUpdateResponse {
  success?: boolean
  data?: unknown
}

type QwenAiModelLockFailureReason = "button_not_found" | "menu_empty" | "not_found"

export class QwenAiAdapter extends SiteAdapter {
  private conversationSnapshot: ConversationInfo[] = []
  private conversationSnapshotFetchedAt = 0
  private conversationSnapshotPromise: Promise<ConversationInfo[]> | null = null

  afterPropertiesSet(
    options: { modelLockConfig?: { enabled: boolean; keyword: string } } = {},
  ): void {
    super.afterPropertiesSet(options)
    void this.refreshConversationSnapshot()
  }

  match(): boolean {
    return window.location.hostname === "chat.qwen.ai"
  }

  getSiteId(): string {
    return SITE_IDS.QWENAI
  }

  getName(): string {
    return "QwenAI"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#4f6bff", secondary: "#3047c7" }
  }

  getSessionId(): string {
    const match = window.location.pathname.match(QWENAI_CHAT_PATH_PATTERN)
    return match?.[1] || super.getSessionId()
  }

  isNewConversation(): boolean {
    const path = window.location.pathname.replace(/\/+$/, "") || "/"
    return path === "/"
  }

  getCurrentCid(): string | null {
    const fromCookie = this.readCookieValue("aui") || this.readCookieValue("cnaui")
    if (fromCookie) return fromCookie
    return this.extractUidFromToken(localStorage.getItem(QWENAI_TOKEN_STORAGE_KEY))
  }

  getSessionName(): string | null {
    const title = document.title.trim()
    if (!title) return null

    const cleaned = title
      .replace(/\s*[-|]\s*Qwen(?:AI| Chat)?$/i, "")
      .replace(/^Qwen(?:AI| Chat)?\s*[-|]\s*/i, "")
      .trim()

    if (!cleaned || /^(qwen(?:ai|\s*chat)?)$/i.test(cleaned)) {
      return null
    }

    return cleaned
  }

  getNewTabUrl(): string {
    return "https://chat.qwen.ai/"
  }

  getConversationTitle(): string | null {
    const sessionId = this.getSessionId()
    if (sessionId && sessionId !== "default") {
      const matched = this.getConversationList().find((item) => item.id === sessionId)
      if (matched?.title) return matched.title
      void this.refreshConversationSnapshot()
    }

    return this.getSessionName()
  }

  getConversationList(): ConversationInfo[] {
    const domList = this.collectConversationListFromDom()
    const snapshot = this.getFreshConversationSnapshot()

    if (domList.length === 0) {
      if (snapshot.length === 0) {
        void this.refreshConversationSnapshot()
      }
      return snapshot
    }

    if (snapshot.length === 0) {
      void this.refreshConversationSnapshot()
      return domList
    }

    return this.mergeConversationInfos(snapshot, domList)
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    return {
      selector: QWENAI_SIDEBAR_ITEM_SELECTOR,
      shadow: false,
      extractInfo: (el) =>
        this.extractSidebarConversationInfo(el, this.getCurrentCid() || undefined),
      getTitleElement: (el) => el.querySelector(QWENAI_SIDEBAR_TITLE_SELECTOR) || el,
    }
  }

  getSidebarScrollContainer(): Element | null {
    return (
      document.querySelector(`${QWENAI_SIDEBAR_SELECTOR} ${QWENAI_SIDEBAR_SCROLL_SELECTOR}`) ||
      document.querySelector(QWENAI_SIDEBAR_SCROLL_SELECTOR) ||
      document.querySelector(QWENAI_SIDEBAR_SELECTOR)
    )
  }

  async loadAllConversations(): Promise<void> {
    await this.refreshConversationSnapshot({ force: true, fetchAllPages: true })
  }

  navigateToConversation(id: string, url?: string): boolean {
    const cid = this.getCurrentCid() || undefined
    const nodes = document.querySelectorAll(QWENAI_SIDEBAR_ITEM_SELECTOR)

    for (const node of Array.from(nodes)) {
      const info = this.extractSidebarConversationInfo(node, cid)
      if (!info || info.id !== id) continue

      const clickable =
        (node.querySelector("a, button, [role='button']") as HTMLElement | null) ||
        (node as HTMLElement)
      this.simulateClick(clickable)
      return true
    }

    return super.navigateToConversation(id, url || `https://chat.qwen.ai/c/${id}`)
  }

  getTextareaSelectors(): string[] {
    return [QWENAI_TEXTAREA_SELECTOR, "textarea"]
  }

  insertPrompt(content: string): boolean {
    const textarea = this.getTextareaElement() as HTMLTextAreaElement | null
    if (!textarea || !textarea.isConnected) return false

    textarea.focus()

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    if (setter) {
      setter.call(textarea, content)
    } else {
      textarea.value = content
    }

    textarea.dispatchEvent(
      new InputEvent("input", { bubbles: true, composed: true, data: content }),
    )
    textarea.dispatchEvent(new Event("change", { bubbles: true }))
    textarea.setSelectionRange(content.length, content.length)
    return true
  }

  clearTextarea(): void {
    const textarea = this.getTextareaElement() as HTMLTextAreaElement | null
    if (!textarea || !textarea.isConnected) return

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    if (setter) {
      setter.call(textarea, "")
    } else {
      textarea.value = ""
    }

    textarea.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: "",
      }),
    )
    textarea.dispatchEvent(new Event("change", { bubbles: true }))
    textarea.setSelectionRange(0, 0)
  }

  getSubmitButtonSelectors(): string[] {
    return [`${QWENAI_SEND_BUTTON_SELECTOR}:not([disabled])`]
  }

  findSubmitButton(): HTMLElement | null {
    const button = document.querySelector(QWENAI_SEND_BUTTON_SELECTOR) as HTMLElement | null
    if (!this.isVisibleActionElement(button)) return null
    if (button.hasAttribute("disabled")) return null
    if (this.isStopLikeButton(button)) return null
    return button
  }

  getNewChatButtonSelectors(): string[] {
    return [QWENAI_NEW_CHAT_BUTTON_SELECTOR]
  }

  getScrollContainer(): HTMLElement | null {
    const container = document.querySelector(QWENAI_MESSAGE_SCROLL_SELECTOR)
    return container instanceof HTMLElement ? container : null
  }

  getResponseContainerSelector(): string {
    return QWENAI_MESSAGE_CONTAINER_SELECTOR
  }

  getChatContentSelectors(): string[] {
    return [QWENAI_USER_MESSAGE_SELECTOR, QWENAI_ASSISTANT_MESSAGE_SELECTOR]
  }

  getUserQuerySelector(): string | null {
    return QWENAI_USER_MESSAGE_SELECTOR
  }

  getLatestReplyText(): string | null {
    const responses = document.querySelectorAll(QWENAI_ASSISTANT_MESSAGE_SELECTOR)
    const last = responses[responses.length - 1]
    return last ? this.extractAssistantResponseText(last) : null
  }

  extractUserQueryText(element: Element): string {
    const contentRoot = this.findUserContentRoot(element)
    if (!contentRoot) return ""

    const clone = contentRoot.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(
        ".gh-user-query-markdown, button, [role='button'], svg, [aria-hidden='true']",
      )
      .forEach((node) => node.remove())

    return this.extractTextWithLineBreaks(clone).trim()
  }

  extractUserQueryMarkdown(element: Element): string {
    return this.extractUserQueryText(element)
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    const contentRoot = this.findUserContentRoot(element)
    if (!contentRoot) return false
    if (element.querySelector(".gh-user-query-markdown")) return false

    const rendered = document.createElement("div")
    rendered.className =
      `${contentRoot instanceof HTMLElement ? contentRoot.className : ""} gh-user-query-markdown gh-markdown-preview`.trim()
    rendered.innerHTML = html

    if (contentRoot instanceof HTMLElement) {
      const inlineStyle = contentRoot.getAttribute("style")
      if (inlineStyle) rendered.setAttribute("style", inlineStyle)
      contentRoot.style.display = "none"
    }

    contentRoot.after(rendered)
    return true
  }

  extractAssistantResponseText(element: Element): string {
    const contentRoot = this.findAssistantContentRoot(element)
    if (!contentRoot) return ""

    const clone = contentRoot.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(
        `${QWENAI_THINKING_CARD_SELECTOR}, ${QWENAI_RESPONSE_TOOLBAR_SELECTOR}, button, [role='button'], svg, [aria-hidden='true']`,
      )
      .forEach((node) => node.remove())

    const markdown = htmlToMarkdown(clone) || this.extractTextWithLineBreaks(clone)
    return markdown.trim()
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const items: OutlineItem[] = []
    const container =
      document.querySelector(QWENAI_MESSAGE_CONTAINER_SELECTOR) ||
      document.querySelector(QWENAI_MESSAGE_SCROLL_SELECTOR)
    if (!container) return items

    const blocks = Array.from(
      container.querySelectorAll(
        `${QWENAI_USER_MESSAGE_SELECTOR}, ${QWENAI_ASSISTANT_MESSAGE_SELECTOR}`,
      ),
    ).filter((el) => !el.closest(".gh-root"))

    blocks.forEach((block, index) => {
      const isUserBlock = block.matches(QWENAI_USER_MESSAGE_SELECTOR)

      if (isUserBlock) {
        if (!includeUserQueries) return

        const text = this.extractUserQueryText(block)
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          const nextAnswer = blocks
            .slice(index + 1)
            .find((el) => el.matches(QWENAI_ASSISTANT_MESSAGE_SELECTOR))
          wordCount = nextAnswer ? this.extractAssistantPlainText(nextAnswer).length : 0
        }

        items.push({
          level: 0,
          text: this.truncateText(text, 80),
          element: block,
          isUserQuery: true,
          isTruncated: text.length > 80,
          wordCount,
        })
        return
      }

      const headings = Array.from(block.querySelectorAll("h1, h2, h3, h4, h5, h6")).filter(
        (heading) =>
          !heading.closest(QWENAI_THINKING_CARD_SELECTOR) &&
          !this.isInRenderedMarkdownContainer(heading),
      )

      headings.forEach((heading, headingIndex) => {
        const level = parseInt(heading.tagName[1], 10)
        if (level > maxLevel) return

        const text = heading.textContent?.trim() || ""
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          let nextBoundary: Element | null = null
          for (let i = headingIndex + 1; i < headings.length; i++) {
            const candidate = headings[i]
            const candidateLevel = parseInt(candidate.tagName[1], 10)
            if (candidateLevel <= level) {
              nextBoundary = candidate
              break
            }
          }
          wordCount = this.calculateRangeWordCount(heading, nextBoundary, block)
        }

        items.push({
          level,
          text,
          element: heading,
          wordCount,
        })
      })
    })

    return items
  }

  getExportConfig(): ExportConfig | null {
    return {
      userQuerySelector: QWENAI_USER_MESSAGE_SELECTOR,
      assistantResponseSelector: QWENAI_ASSISTANT_MESSAGE_SELECTOR,
      turnSelector: null,
      useShadowDOM: false,
    }
  }

  async toggleTheme(targetMode: "light" | "dark" | "system"): Promise<boolean> {
    try {
      const resolvedMode = this.resolveThemeMode(targetMode)
      const updated = await this.updateThemePreference(targetMode)
      if (!updated) return false

      this.syncThemeState(resolvedMode, targetMode)
      return true
    } catch (error) {
      console.error("[QwenAiAdapter] toggleTheme error:", error)
      return false
    }
  }

  getModelName(): string | null {
    const textNode = document.querySelector(QWENAI_MODEL_TEXT_SELECTOR) as HTMLElement | null
    const text = textNode?.innerText?.trim() || textNode?.textContent?.trim() || ""
    return text ? text.split("\n")[0].trim() : null
  }

  getModelLockCheckText(selectorBtn?: HTMLElement | null): string {
    return this.getModelName() || super.getModelLockCheckText(selectorBtn)
  }

  clickModelSelector(): boolean {
    const trigger = this.findModelTrigger()
    if (!trigger) return false
    this.simulateClick(trigger)
    return true
  }

  lockModel(keyword: string, onSuccess?: () => void): void {
    const target = this.normalizeModelKeyword(keyword)
    if (!target) return

    const maxAttempts = 12
    const checkInterval = 1000
    let attempts = 0

    const tryLock = async () => {
      attempts++

      const trigger = this.findModelTrigger()
      if (!trigger) {
        if (attempts >= maxAttempts) {
          void this.showQwenModelLockFailure(keyword, "button_not_found")
          return
        }
        window.setTimeout(tryLock, checkInterval)
        return
      }

      const currentText = this.normalizeModelKeyword(this.getModelLockCheckText(trigger))
      if (currentText.includes(target)) {
        onSuccess?.()
        return
      }

      const result = await this.selectQwenModel(target)
      if (result.success) {
        onSuccess?.()
        return
      }

      void this.showQwenModelLockFailure(keyword, result.reason || "not_found")
    }

    void tryLock()
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: [QWENAI_MODEL_TRIGGER_SELECTOR, QWENAI_MODEL_TEXT_SELECTOR],
      menuItemSelector: QWENAI_MODEL_MENU_ITEM_SELECTOR,
      checkInterval: 1000,
      maxAttempts: 12,
      menuRenderDelay: 400,
      subMenuSelector: QWENAI_MODEL_MORE_TRIGGER_SELECTOR,
      subMenuTriggers: ["展开更多模型", "更多模型", "view more", "more models"],
    }
  }

  isGenerating(): boolean {
    const button = document.querySelector(QWENAI_SEND_BUTTON_SELECTOR) as HTMLElement | null
    return this.isStopLikeButton(button)
  }

  stopGeneration(): boolean {
    const button = document.querySelector(QWENAI_SEND_BUTTON_SELECTOR) as HTMLElement | null
    if (!this.isVisibleActionElement(button)) return false
    if (!this.isStopLikeButton(button)) return false

    this.simulateClick(button)
    return true
  }

  getZenModeSelectors(): ZenModeRule[] {
    return [
      { selector: QWENAI_SIDEBAR_SELECTOR, action: "hide" },
      { selector: QWENAI_DISCLAIMER_SELECTOR, action: "hide" },
    ]
  }

  getMarkdownFixerConfig(): MarkdownFixerConfig | null {
    return {
      selector: `${QWENAI_ASSISTANT_MESSAGE_SELECTOR} ${QWENAI_MARKDOWN_PARAGRAPH_SELECTOR}`,
      fixSpanContent: false,
      shouldSkip: (element) => {
        if (!this.isGenerating()) return false
        const currentMessage = element.closest(QWENAI_ASSISTANT_MESSAGE_SELECTOR)
        if (!currentMessage) return false
        const messages = document.querySelectorAll(QWENAI_ASSISTANT_MESSAGE_SELECTOR)
        return currentMessage === messages[messages.length - 1]
      },
    }
  }

  private getFreshConversationSnapshot(): ConversationInfo[] {
    const isFresh =
      this.conversationSnapshot.length > 0 &&
      Date.now() - this.conversationSnapshotFetchedAt < QWENAI_CONVERSATION_SNAPSHOT_TTL_MS

    if (!isFresh && !this.conversationSnapshotPromise) {
      void this.refreshConversationSnapshot()
    }

    return this.conversationSnapshot.map((item) => ({ ...item }))
  }

  private async refreshConversationSnapshot(
    options: { force?: boolean; fetchAllPages?: boolean } = {},
  ): Promise<ConversationInfo[]> {
    const { force = false, fetchAllPages = false } = options
    const isFresh =
      this.conversationSnapshot.length > 0 &&
      Date.now() - this.conversationSnapshotFetchedAt < QWENAI_CONVERSATION_SNAPSHOT_TTL_MS

    if (!force && isFresh) {
      return this.conversationSnapshot.map((item) => ({ ...item }))
    }

    if (this.conversationSnapshotPromise) {
      return this.conversationSnapshotPromise
    }

    this.conversationSnapshotPromise = (async () => {
      try {
        const list = await this.fetchConversationSnapshot(fetchAllPages)
        if (list.length > 0) {
          this.conversationSnapshot = list
          this.conversationSnapshotFetchedAt = Date.now()
        }
      } catch (error) {
        console.warn("[QwenAiAdapter] Failed to refresh conversation snapshot:", error)
      } finally {
        this.conversationSnapshotPromise = null
      }

      return this.conversationSnapshot.map((item) => ({ ...item }))
    })()

    return this.conversationSnapshotPromise
  }

  private async fetchConversationSnapshot(fetchAllPages: boolean): Promise<ConversationInfo[]> {
    const currentSessionId = this.getSessionId()
    const maxPages = fetchAllPages ? QWENAI_FETCH_PAGE_LIMIT : QWENAI_BOOTSTRAP_PAGE_LIMIT
    const all: ConversationInfo[] = []
    const seen = new Set<string>()

    for (let page = 1; page <= maxPages; page++) {
      const items = await this.fetchConversationPage(page)
      if (items.length === 0) break

      let newCount = 0
      for (const item of items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        all.push(item)
        newCount++
      }

      if (newCount === 0) break
      if (!fetchAllPages && currentSessionId && seen.has(currentSessionId)) break
    }

    return all
  }

  private async fetchConversationPage(page: number): Promise<ConversationInfo[]> {
    const url = new URL("/api/v2/chats/", window.location.origin)
    url.searchParams.set("page", String(page))
    url.searchParams.set("exclude_project", "true")

    const response = await fetch(url.toString(), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-Request-Id": crypto.randomUUID(),
        source: "web",
      },
    })

    if (!response.ok) {
      throw new Error(`fetch conversations failed: ${response.status}`)
    }

    const payload = (await response.json()) as QwenAiConversationApiResponse
    if (payload.success === false) {
      return []
    }

    const data = Array.isArray(payload.data) ? payload.data : []
    const cid = this.getCurrentCid() || undefined
    const items: ConversationInfo[] = []

    data.forEach((entry) => {
      const info = this.normalizeConversationApiItem(entry, cid)
      if (info) items.push(info)
    })

    return items
  }

  private normalizeConversationApiItem(entry: unknown, cid?: string): ConversationInfo | null {
    if (!entry || typeof entry !== "object") return null

    const record = entry as Record<string, unknown>
    const id = typeof record.id === "string" ? record.id.trim() : ""
    const title = typeof record.title === "string" ? record.title.trim() : ""
    if (!id || !title) return null

    return {
      id,
      cid,
      title,
      url: `https://chat.qwen.ai/c/${id}`,
      isPinned: Boolean(record.pinned),
      isActive: id === this.getSessionId(),
    }
  }

  private collectConversationListFromDom(): ConversationInfo[] {
    const nodes = document.querySelectorAll(QWENAI_SIDEBAR_ITEM_SELECTOR)
    if (nodes.length === 0) return []

    const cid = this.getCurrentCid() || undefined
    const list: ConversationInfo[] = []

    nodes.forEach((node) => {
      const info = this.extractSidebarConversationInfo(node, cid)
      if (info) list.push(info)
    })

    return list
  }

  private extractSidebarConversationInfo(element: Element, cid?: string): ConversationInfo | null {
    const id = this.extractConversationIdFromElement(element)
    if (!id) return null

    const titleElement = element.querySelector(QWENAI_SIDEBAR_TITLE_SELECTOR)
    const title = titleElement?.textContent?.trim() || ""
    if (!title) return null

    return {
      id,
      cid,
      title,
      url: `https://chat.qwen.ai/c/${id}`,
      isPinned: !!element.querySelector(".chat-item-title-pined-icon"),
      isActive: id === this.getSessionId(),
    }
  }

  private extractConversationIdFromElement(element: Element): string | null {
    const directLink = element.querySelector('a[href*="/c/"]')
    const directHref = directLink?.getAttribute("href")
    const directId = this.extractConversationIdFromText(directHref)
    if (directId) return directId

    const nodes = [element, ...Array.from(element.querySelectorAll("*"))]
    for (const node of nodes) {
      const attrNames = (node as Element).getAttributeNames?.() || []
      for (const attr of attrNames) {
        const value = (node as Element).getAttribute(attr)
        const id = this.extractConversationIdFromText(value)
        if (id) return id
      }
    }

    return null
  }

  private extractConversationIdFromText(value: string | null | undefined): string | null {
    if (!value) return null
    const match = value.match(QWENAI_CHAT_PATH_PATTERN)
    if (match?.[1]) return match[1]

    const uuidLike = value.match(
      /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i,
    )
    return uuidLike?.[0] || null
  }

  private mergeConversationInfos(...lists: ConversationInfo[][]): ConversationInfo[] {
    const merged = new Map<string, ConversationInfo>()
    for (const list of lists) {
      for (const item of list) {
        const previous = merged.get(item.id)
        merged.set(item.id, { ...previous, ...item })
      }
    }
    return Array.from(merged.values())
  }

  private async updateThemePreference(targetMode: "light" | "dark" | "system"): Promise<boolean> {
    const response = await fetch("/api/v2/users/user/settings/update", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "X-Request-Id": crypto.randomUUID(),
        source: "web",
      },
      body: JSON.stringify({
        ui: { theme: targetMode },
      }),
    })

    if (!response.ok) {
      throw new Error(`update theme failed: ${response.status}`)
    }

    const payload = (await response.json()) as QwenAiSettingsUpdateResponse
    return payload.success !== false
  }

  private syncThemeState(
    resolvedMode: "light" | "dark",
    preference: "light" | "dark" | "system" = resolvedMode,
  ): void {
    localStorage.setItem(QWENAI_THEME_STORAGE_KEY, preference)

    const html = document.documentElement
    html.classList.remove("light", "dark")
    html.classList.add(resolvedMode)
    html.setAttribute("data-theme", resolvedMode)
    html.style.colorScheme = resolvedMode

    if (document.body) {
      document.body.setAttribute("data-theme", resolvedMode)
      document.body.style.colorScheme = resolvedMode
    }

    const meta = document.querySelector('meta[name="color-scheme"]')
    if (meta) {
      meta.setAttribute("content", resolvedMode)
    }

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: QWENAI_THEME_STORAGE_KEY,
        newValue: preference,
        storageArea: localStorage,
      }),
    )
  }

  private resolveThemeMode(targetMode: "light" | "dark" | "system"): "light" | "dark" {
    if (targetMode !== "system") return targetMode

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }

  private async selectQwenModel(
    target: string,
  ): Promise<{ success: boolean; reason?: QwenAiModelLockFailureReason }> {
    const trigger = this.findModelTrigger()
    if (!trigger) return { success: false, reason: "button_not_found" }

    this.simulateClick(trigger)

    const primaryPopup = await this.waitForVisibleQwenModelPopup(
      QWENAI_PRIMARY_MODEL_POPUP_SELECTOR,
    )
    if (!primaryPopup) {
      return { success: false, reason: "menu_empty" }
    }

    const primaryItems = this.getQwenModelItems(primaryPopup)
    const primaryMatch = this.findBestQwenModelItem(primaryItems, target)
    if (primaryMatch) {
      this.clickQwenModelItem(primaryMatch)
      return { success: true }
    }

    const moreTrigger = this.findQwenMoreTrigger(primaryPopup)
    if (!moreTrigger) {
      document.body.click()
      return { success: false, reason: "not_found" }
    }

    const secondaryPopup = await this.openQwenMoreMenu(moreTrigger)
    if (!secondaryPopup) {
      document.body.click()
      return { success: false, reason: "menu_empty" }
    }

    const secondaryItems = this.getQwenModelItems(secondaryPopup)
    const secondaryMatch = this.findBestQwenModelItem(secondaryItems, target)
    if (!secondaryMatch) {
      document.body.click()
      return { success: false, reason: "not_found" }
    }

    this.clickQwenModelItem(secondaryMatch)
    return { success: true }
  }

  private async waitForVisibleQwenModelPopup(
    selector: string,
    maxAttempts = 8,
    delay = 150,
  ): Promise<HTMLElement | null> {
    for (let i = 0; i < maxAttempts; i++) {
      const popup = this.findVisibleQwenModelPopup(selector)
      if (popup) return popup
      await this.sleep(delay)
    }
    return null
  }

  private findVisibleQwenModelPopup(selector: string): HTMLElement | null {
    const nodes = this.findAllElementsBySelector(selector)
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue
      if (!this.isQwenElementVisible(node)) continue
      return node
    }
    return null
  }

  private getQwenModelItems(popup: HTMLElement): HTMLElement[] {
    const items = Array.from(
      popup.querySelectorAll('[class*="model-list"] > [class*="model-item___"]'),
    )

    return items.filter(
      (item): item is HTMLElement => item instanceof HTMLElement && this.isQwenElementVisible(item),
    )
  }

  private findBestQwenModelItem(items: HTMLElement[], target: string): HTMLElement | null {
    const normalizedTarget = this.normalizeModelKeyword(target)
    if (!normalizedTarget) return null

    for (const item of items) {
      const name = this.normalizeModelKeyword(this.getQwenModelItemName(item))
      if (name === normalizedTarget) return item
    }

    for (const item of items) {
      const name = this.normalizeModelKeyword(this.getQwenModelItemName(item))
      if (name.endsWith(normalizedTarget)) return item
    }

    for (const item of items) {
      const name = this.normalizeModelKeyword(this.getQwenModelItemName(item))
      if (name.includes(normalizedTarget)) return item
    }

    return null
  }

  private getQwenModelItemName(item: HTMLElement): string {
    const label =
      item.querySelector('[class*="model-item-name"] > span') ||
      item.querySelector('[class*="model-item-name"]') ||
      item

    return (label.textContent || "").trim()
  }

  private findQwenMoreTrigger(popup: HTMLElement): HTMLElement | null {
    const trigger = popup.querySelector(QWENAI_MODEL_MORE_TRIGGER_SELECTOR)
    if (trigger instanceof HTMLElement && this.isQwenElementVisible(trigger)) {
      return trigger
    }
    return null
  }

  private async openQwenMoreMenu(trigger: HTMLElement): Promise<HTMLElement | null> {
    const targets: HTMLElement[] = [trigger]
    const innerCandidates = [
      trigger.querySelector('[class*="view-more___"]'),
      trigger.querySelector('[class*="view-more-text"]'),
      trigger.querySelector('[class*="view-more-icon"]'),
    ]

    innerCandidates.forEach((node) => {
      if (node instanceof HTMLElement && !targets.includes(node)) {
        targets.push(node)
      }
    })

    for (const target of targets) {
      this.dispatchQwenMoreMenuHover(target)

      let popup = await this.waitForVisibleQwenSecondaryPopup(trigger, 3, 100)
      if (popup) return popup

      this.simulateClick(target)
      popup = await this.waitForVisibleQwenSecondaryPopup(trigger, 4, 120)
      if (popup) return popup
    }

    return this.waitForVisibleQwenSecondaryPopup(trigger, 4, 150)
  }

  private async waitForVisibleQwenSecondaryPopup(
    trigger: HTMLElement,
    maxAttempts = 8,
    delay = 150,
  ): Promise<HTMLElement | null> {
    for (let i = 0; i < maxAttempts; i++) {
      const popup = this.findVisibleQwenSecondaryPopup(trigger)
      if (popup) return popup
      await this.sleep(delay)
    }
    return null
  }

  private findVisibleQwenSecondaryPopup(trigger: HTMLElement): HTMLElement | null {
    const nested = trigger.querySelector(
      '.ant-dropdown:not(.ant-dropdown-hidden) [class*="model-selector-popup"][class*="secondary"]',
    )
    if (nested instanceof HTMLElement && this.isQwenElementVisible(nested)) {
      return nested
    }

    return this.findVisibleQwenModelPopup(QWENAI_SECONDARY_MODEL_POPUP_SELECTOR)
  }

  private dispatchQwenMoreMenuHover(element: HTMLElement): void {
    const rect = element.getBoundingClientRect()
    const eventInit: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      view: window,
    }

    const mouseEvents: Array<keyof GlobalEventHandlersEventMap> = [
      "pointerover",
      "pointerenter",
      "mouseover",
      "mouseenter",
      "mousemove",
    ]

    mouseEvents.forEach((eventName) => {
      try {
        if (eventName.startsWith("pointer") && typeof PointerEvent !== "undefined") {
          element.dispatchEvent(
            new PointerEvent(eventName, {
              ...eventInit,
              pointerType: "mouse",
              isPrimary: true,
            }),
          )
          return
        }

        element.dispatchEvent(new MouseEvent(eventName, eventInit))
      } catch {
        // 静默降级到后续 click
      }
    })
  }

  private clickQwenModelItem(item: HTMLElement): void {
    this.simulateClick(item)
    window.setTimeout(() => {
      document.body.click()
    }, 100)
  }

  private normalizeModelKeyword(text: string): string {
    return (text || "").toLowerCase().replace(/\s+/g, " ").trim()
  }

  private isQwenElementVisible(element: Element | null): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false
    if (!element.isConnected) return false

    const style = window.getComputedStyle(element)
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      parseFloat(style.opacity || "1") === 0
    ) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  private async showQwenModelLockFailure(
    keyword: string,
    reason: QwenAiModelLockFailureReason,
  ): Promise<void> {
    try {
      const { showToast } = await import("~utils/toast")
      const { t } = await import("~utils/i18n")

      let message: string
      switch (reason) {
        case "button_not_found":
          message = t("modelLockFailedNoButton") || "模型选择器未找到"
          break
        case "menu_empty":
          message = t("modelLockFailedMenuEmpty") || "模型菜单加载失败"
          break
        case "not_found":
        default:
          message = (t("modelLockFailedNotFound") || '未找到模型 "{model}"').replace(
            "{model}",
            keyword,
          )
          break
      }

      showToast(message, 3000)
    } catch (error) {
      console.error("[QwenAiAdapter] Failed to show model lock error:", error)
    }
  }

  private readCookieValue(name: string): string | null {
    const pattern = new RegExp(`(?:^|; )${name}=([^;]+)`)
    const matched = document.cookie.match(pattern)
    if (!matched?.[1]) return null

    try {
      return decodeURIComponent(matched[1]).trim() || null
    } catch {
      return matched[1].trim() || null
    }
  }

  private extractUidFromToken(token: string | null): string | null {
    if (!token) return null

    try {
      const payload = token.split(".")[1]
      if (!payload) return null

      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
      const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))
      const parsed = JSON.parse(decoded) as Record<string, unknown>
      const id = parsed.id
      return typeof id === "string" && id.trim() ? id.trim() : null
    } catch {
      return null
    }
  }

  private findUserContentRoot(element: Element): HTMLElement | null {
    if (element.matches(QWENAI_USER_CONTENT_SELECTOR)) return element as HTMLElement
    return (
      (element.querySelector(QWENAI_USER_CONTENT_SELECTOR) as HTMLElement | null) ||
      (element as HTMLElement)
    )
  }

  private findAssistantContentRoot(element: Element): HTMLElement | null {
    if (element.matches(QWENAI_ASSISTANT_CONTENT_SELECTOR)) return element as HTMLElement
    return (
      (element.querySelector(QWENAI_ASSISTANT_CONTENT_SELECTOR) as HTMLElement | null) ||
      (element as HTMLElement)
    )
  }

  private extractAssistantPlainText(element: Element): string {
    const contentRoot = this.findAssistantContentRoot(element)
    if (!contentRoot) return ""

    const clone = contentRoot.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(
        `${QWENAI_THINKING_CARD_SELECTOR}, ${QWENAI_RESPONSE_TOOLBAR_SELECTOR}, button, [role='button'], svg, [aria-hidden='true']`,
      )
      .forEach((node) => node.remove())

    return this.extractTextWithLineBreaks(clone).trim()
  }

  private findModelTrigger(): HTMLElement | null {
    const trigger = document.querySelector(QWENAI_MODEL_TRIGGER_SELECTOR)
    if (trigger instanceof HTMLElement && this.isVisibleActionElement(trigger)) {
      return trigger
    }

    const label = document.querySelector(QWENAI_MODEL_TEXT_SELECTOR) as HTMLElement | null
    if (!label) return null

    const closest = label.closest(".ant-dropdown-trigger, [role='button'], button, [tabindex]")
    return closest instanceof HTMLElement ? closest : label
  }

  private isStopLikeButton(button: HTMLElement | null): boolean {
    if (!button) return false

    const iconUse = button.querySelector("use")
    const iconHref = iconUse?.getAttribute("xlink:href") || iconUse?.getAttribute("href") || ""
    const text = (button.innerText || button.textContent || "").trim().toLowerCase()

    return /stop/i.test(iconHref) || text.includes("stop") || text.includes("停止")
  }

  private isVisibleActionElement(element: HTMLElement | null): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false
    if (!element.isConnected) return false

    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private truncateText(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  }
}
