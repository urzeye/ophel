/**
 * Kimi 适配器（www.kimi.com）
 *
 * 选择器策略：
 * - 优先使用语义化 class（如 .chat-info-item、.chat-input-editor、.segment-assistant）
 * - 避免依赖 data-v-* 等构建时生成属性
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
  type NetworkMonitorConfig,
  type OutlineItem,
} from "./base"

const CHAT_PATH_PATTERN = /^\/chat\/([a-z0-9-]+)(?:\/|$)/i
const NON_CHAT_PATH_PREFIXES = ["/docs/", "/website/", "/table/"]
const TOKEN_STORAGE_PREFIX = "__tea_cache_tokens_"

const SIDEBAR_CONVERSATION_SELECTOR = "a.chat-info-item"
const HISTORY_PAGE_CONVERSATION_SELECTOR = "a.history-link"
const CONVERSATION_SELECTOR = `${SIDEBAR_CONVERSATION_SELECTOR}, ${HISTORY_PAGE_CONVERSATION_SELECTOR}`
const HISTORY_CONTAINER_SELECTOR = ".history-part"
const HISTORY_PAGE_LIST_SELECTOR = ".history .group-list-container"
const CONVERSATION_TITLE_SELECTOR = "span.chat-name"
const HISTORY_TITLE_SELECTOR = ".history-chat .title-wrapper .title"

const CHAT_LIST_SELECTOR = ".chat-content-list"
const CHAT_ITEM_SELECTOR = ".chat-content-item"
const USER_ITEM_SELECTOR = ".chat-content-item-user"
const ASSISTANT_ITEM_SELECTOR = ".chat-content-item-assistant"
const USER_SEGMENT_SELECTOR = ".segment.segment-user"
const USER_CONTENT_SELECTOR = ".segment-user .segment-content-box"
const ASSISTANT_MARKDOWN_SELECTOR = ".segment-assistant .markdown"

const THEME_STORAGE_KEY = "CUSTOM_THEME"

export class KimiAdapter extends SiteAdapter {
  match(): boolean {
    return window.location.hostname === "www.kimi.com"
  }

  getSiteId(): string {
    return SITE_IDS.KIMI
  }

  getName(): string {
    return "Kimi"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#7C3AED", secondary: "#6D28D9" }
  }

  getNewTabUrl(): string {
    return "https://www.kimi.com/"
  }

  getSessionId(): string {
    const path = window.location.pathname
    if (path === "/chat/history" || path.startsWith("/chat/history/")) {
      return ""
    }
    const normalized = path.endsWith("/") ? path : `${path}/`
    if (NON_CHAT_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
      return ""
    }

    const match = path.match(CHAT_PATH_PATTERN)
    return match ? match[1] : ""
  }

  isNewConversation(): boolean {
    const path = window.location.pathname
    return (
      path === "/" || path === "" || path === "/chat/history" || path.startsWith("/chat/history/")
    )
  }

  isSharePage(): boolean {
    return window.location.pathname.startsWith("/kimiplus/")
  }

  getSessionName(): string | null {
    const conversationTitle = this.getConversationTitle()
    if (conversationTitle) return conversationTitle

    const title = document.title.trim()
    if (!title || title === "Kimi") return null

    const normalized = title.replace(/\s*-\s*Kimi$/i, "").trim()
    return normalized || null
  }

  getCurrentCid(): string | null {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || !key.startsWith(TOKEN_STORAGE_PREFIX)) continue

        const raw = localStorage.getItem(key)
        if (!raw) continue

        const parsed = JSON.parse(raw) as Record<string, unknown>
        const uid = parsed.user_unique_id
        if (typeof uid === "string" && uid.trim()) {
          return uid.trim()
        }
      }
    } catch {
      // ignore malformed storage data
    }

    return null
  }

  getConversationList(): ConversationInfo[] {
    const links = document.querySelectorAll(CONVERSATION_SELECTOR)
    if (links.length === 0) return []

    const cid = this.getCurrentCid() || undefined
    const map = new Map<string, ConversationInfo>()

    links.forEach((el) => {
      const info = this.extractConversationInfo(el, cid)
      if (!info) return

      const existing = map.get(info.id)
      if (!existing) {
        map.set(info.id, info)
        return
      }

      map.set(info.id, {
        ...existing,
        title: existing.title || info.title,
        isActive: existing.isActive || info.isActive,
        isPinned: existing.isPinned || info.isPinned,
      })
    })

    return Array.from(map.values())
  }

  getConversationObserverConfig(): ConversationObserverConfig {
    return {
      selector: CONVERSATION_SELECTOR,
      shadow: false,
      extractInfo: (el) => this.extractConversationInfo(el, this.getCurrentCid() || undefined),
      getTitleElement: (el) =>
        el.querySelector(`${CONVERSATION_TITLE_SELECTOR}, ${HISTORY_TITLE_SELECTOR}`) || el,
    }
  }

  getSidebarScrollContainer(): Element | null {
    const candidates = [
      document.querySelector(HISTORY_PAGE_LIST_SELECTOR),
      document.querySelector(HISTORY_CONTAINER_SELECTOR),
      document.querySelector(".history .usage-content"),
      document.querySelector(".history .content"),
      document.querySelector(".history"),
    ].filter(Boolean) as Element[]

    for (const candidate of candidates) {
      const scrollable = this.findScrollableParent(candidate)
      if (scrollable) return scrollable
      if (candidate instanceof HTMLElement && candidate.scrollHeight > candidate.clientHeight) {
        return candidate
      }
    }

    return null
  }

  async loadAllConversations(): Promise<void> {
    await this.openMoreHistoryView()

    try {
      let lastCount = 0
      let stableRounds = 0
      const maxStableRounds = 4

      while (stableRounds < maxStableRounds) {
        const container = this.getSidebarScrollContainer() as HTMLElement | null
        if (!container) return

        container.scrollTop = container.scrollHeight
        container.dispatchEvent(new Event("scroll", { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 500))

        const count = document.querySelectorAll(CONVERSATION_SELECTOR).length
        if (count === lastCount) {
          stableRounds++
        } else {
          lastCount = count
          stableRounds = 0
        }
      }
    } finally {
      await this.closeMoreHistoryView()
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    const selector = `${CONVERSATION_SELECTOR}[href*="/chat/${id}"]`
    const link = document.querySelector(selector) as HTMLElement | null
    if (link) {
      link.click()
      return true
    }

    return super.navigateToConversation(id, url || `https://www.kimi.com/chat/${id}`)
  }

  getConversationTitle(): string | null {
    const headerTitle = document.querySelector(".chat-header-content h2")?.textContent?.trim()
    if (headerTitle) return headerTitle

    const activeLink = this.getActiveConversationLink()
    if (activeLink) {
      const title = this.extractConversationTitle(activeLink)
      if (title) return title
    }

    const sessionId = this.getSessionId()
    if (sessionId) {
      const currentLink = document.querySelector(
        `${CONVERSATION_SELECTOR}[href*="/chat/${sessionId}"]`,
      )
      if (currentLink) {
        const title = this.extractConversationTitle(currentLink)
        if (title) return title
      }
    }

    return null
  }

  getTextareaSelectors(): string[] {
    return [
      '.chat-input-editor[data-lexical-editor="true"]',
      '.chat-input-editor[contenteditable="true"]',
      '[role="textbox"].chat-input-editor',
    ]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (element.offsetParent === null) return false
    if (!element.isContentEditable) return false
    if (element.closest(".gh-main-panel") || element.closest(".gh-queue-panel")) return false
    return !!element.closest(".chat-input-editor-container")
  }

  insertPrompt(content: string): boolean {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return false

    editor.focus()
    if (document.activeElement !== editor && !editor.contains(document.activeElement)) {
      return false
    }

    const insertedByExec = this.insertByExecCommand(editor, content)
    if (insertedByExec) return true

    const insertedByPaste = this.insertByPasteEvent(editor, content)
    if (insertedByPaste) return true

    editor.textContent = content
    editor.dispatchEvent(new Event("input", { bubbles: true }))
    editor.dispatchEvent(new Event("change", { bubbles: true }))
    return true
  }

  clearTextarea(): void {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return

    editor.focus()
    if (document.activeElement !== editor && !editor.contains(document.activeElement)) {
      return
    }

    const cleared = this.clearByExecCommand(editor)
    if (cleared) return

    editor.textContent = ""
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "deleteContentBackward",
      }),
    )
    editor.dispatchEvent(new Event("change", { bubbles: true }))
  }

  getSubmitButtonSelectors(): string[] {
    return [".send-button-container:not(.disabled):not(.stop)"]
  }

  findSubmitButton(editor: HTMLElement | null): HTMLElement | null {
    const scopes = [
      editor?.closest(".chat-editor"),
      editor?.closest(".chat-input-editor-container"),
      editor?.parentElement,
      document.body,
    ].filter(Boolean) as ParentNode[]

    const seen = new Set<HTMLElement>()
    for (const scope of scopes) {
      const buttons = scope.querySelectorAll(".send-button-container")
      for (const btn of Array.from(buttons)) {
        const button = btn as HTMLElement
        if (seen.has(button)) continue
        seen.add(button)
        if (button.offsetParent === null) continue
        if (button.classList.contains("disabled") || button.classList.contains("stop")) continue
        return button
      }
    }

    return null
  }

  getScrollContainer(): HTMLElement | null {
    const detail = document.querySelector(".chat-detail-content") as HTMLElement | null
    if (detail && detail.scrollHeight > detail.clientHeight) {
      return detail
    }

    const content = document.querySelector(".chat-content-container")
    const scrollable = this.findScrollableParent(content)
    if (scrollable && !scrollable.closest(HISTORY_CONTAINER_SELECTOR)) {
      return scrollable
    }

    return super.getScrollContainer()
  }

  getResponseContainerSelector(): string {
    return CHAT_LIST_SELECTOR
  }

  getChatContentSelectors(): string[] {
    return [ASSISTANT_MARKDOWN_SELECTOR, USER_CONTENT_SELECTOR]
  }

  getUserQuerySelector(): string {
    return USER_SEGMENT_SELECTOR
  }

  extractUserQueryText(element: Element): string {
    const contentBox = element.querySelector(".segment-content-box")
    return this.extractTextWithLineBreaks(contentBox || element).trim()
  }

  extractUserQueryMarkdown(element: Element): string {
    return this.extractUserQueryText(element)
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    if (element.querySelector(".gh-user-query-markdown")) {
      return false
    }

    const contentBox = element.querySelector(".segment-content-box") as HTMLElement | null
    if (!contentBox) return false

    const rendered = document.createElement("div")
    rendered.className = `${contentBox.className} gh-user-query-markdown gh-markdown-preview`.trim()
    rendered.innerHTML = html

    const inlineStyle = contentBox.getAttribute("style")
    if (inlineStyle) {
      rendered.setAttribute("style", inlineStyle)
    }

    contentBox.style.display = "none"
    contentBox.after(rendered)
    return true
  }

  extractAssistantResponseText(element: Element): string {
    const markdown = element.matches(".markdown") ? element : element.querySelector(".markdown")
    if (!markdown) return ""
    const content = htmlToMarkdown(markdown).trim()
    if (content) return content
    return this.extractTextWithLineBreaks(markdown).trim()
  }

  getLatestReplyText(): string | null {
    const replies = document.querySelectorAll(ASSISTANT_MARKDOWN_SELECTOR)
    if (replies.length === 0) return null
    const last = replies[replies.length - 1]
    const markdown = last.matches(".markdown") ? last : last.querySelector(".markdown")
    if (!markdown) return null
    return this.extractTextWithLineBreaks(markdown).trim()
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const container = document.querySelector(CHAT_LIST_SELECTOR)
    if (!container) return []

    const outline: OutlineItem[] = []
    const items = this.getChatItems(container)

    items.forEach((item, itemIndex) => {
      const isUserItem =
        item.matches(USER_ITEM_SELECTOR) || item.querySelector(USER_SEGMENT_SELECTOR)

      if (isUserItem) {
        if (!includeUserQueries) return

        const userRoot = item.querySelector(USER_SEGMENT_SELECTOR) || item
        const text = this.extractUserQueryMarkdown(userRoot)
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          const nextAssistantMarkdown = this.findNextAssistantMarkdown(items, itemIndex)
          wordCount = nextAssistantMarkdown?.textContent?.trim().length || 0
        }

        outline.push({
          level: 0,
          text: text.length > 80 ? `${text.slice(0, 80)}...` : text,
          element: userRoot,
          isUserQuery: true,
          isTruncated: text.length > 80,
          wordCount,
        })
        return
      }

      if (
        !item.matches(ASSISTANT_ITEM_SELECTOR) &&
        !item.querySelector(ASSISTANT_MARKDOWN_SELECTOR)
      ) {
        return
      }

      const markdown = item.querySelector(".markdown")
      if (!markdown) return

      const headings = Array.from(markdown.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      headings.forEach((heading, headingIndex) => {
        const level = Number.parseInt(heading.tagName.slice(1), 10)
        if (Number.isNaN(level) || level > maxLevel) return

        const text = heading.textContent?.trim() || ""
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          let nextBoundary: Element | null = null
          for (let i = headingIndex + 1; i < headings.length; i++) {
            const candidate = headings[i]
            const candidateLevel = Number.parseInt(candidate.tagName.slice(1), 10)
            if (!Number.isNaN(candidateLevel) && candidateLevel <= level) {
              nextBoundary = candidate
              break
            }
          }
          wordCount = this.calculateRangeWordCount(heading, nextBoundary, markdown)
        }

        outline.push({
          level,
          text,
          element: heading,
          wordCount,
        })
      })
    })

    return outline
  }

  getExportConfig(): ExportConfig {
    return {
      userQuerySelector: USER_SEGMENT_SELECTOR,
      assistantResponseSelector: ASSISTANT_MARKDOWN_SELECTOR,
      turnSelector: null,
      useShadowDOM: false,
    }
  }

  isGenerating(): boolean {
    const stopButtons = document.querySelectorAll(".send-button-container.stop")
    for (const btn of Array.from(stopButtons)) {
      if ((btn as HTMLElement).offsetParent !== null) return true
    }

    const stopIcons = document.querySelectorAll('.send-button-container svg[name="stop"]')
    for (const icon of Array.from(stopIcons)) {
      const container = icon.closest(".send-button-container") as HTMLElement | null
      if (container && container.offsetParent !== null) return true
    }

    return false
  }

  getModelName(): string | null {
    const el = document.querySelector(".current-model .model-name .name")
    return el?.textContent?.trim() || null
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: [".current-model.active .model-name", ".current-model .model-name"],
      menuItemSelector: [
        '[role="menuitem"]',
        '[role="option"]',
        ".n-base-select-option",
        ".n-dropdown-option",
        ".model-item",
        ".model-option",
      ].join(", "),
      checkInterval: 1000,
      maxAttempts: 15,
      menuRenderDelay: 350,
    }
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
    return {
      urlPatterns: ["chat/completion", "api/chat"],
      silenceThreshold: 2000,
    }
  }

  async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, targetMode)

      const html = document.documentElement
      html.classList.remove("light", "dark")
      html.classList.add(targetMode)

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_STORAGE_KEY,
          newValue: targetMode,
          storageArea: localStorage,
        }),
      )
      return true
    } catch (error) {
      console.error("[KimiAdapter] toggleTheme error:", error)
      return false
    }
  }

  getNewChatButtonSelectors(): string[] {
    return [
      "a.new-chat-btn",
      'a.new-chat-btn[href="/"]',
      'a.new-chat-btn[href="https://www.kimi.com/"]',
    ]
  }

  getWidthSelectors() {
    return [
      { selector: ".chat-content-container", property: "max-width" },
      {
        // 不依赖 Vue scoped data-v-*，通过提高 class 选择器优先级覆盖站点限宽规则
        selector:
          ".chat-content-list, .chat-content-list.chat-content-list, .chat-content-list.chat-content-list.chat-content-list, .chat-detail-content .chat-content-list.chat-content-list",
        property: "max-width",
      },
      {
        // 同步覆盖 width，避免仅修改 max-width 仍被布局约束
        selector:
          ".chat-content-list, .chat-content-list.chat-content-list, .chat-content-list.chat-content-list.chat-content-list, .chat-detail-content .chat-content-list.chat-content-list",
        property: "width",
        value: "100%",
        noCenter: true,
      },
    ]
  }

  getZenModeSelectors() {
    return [{ selector: ".chat-bottom .legal-footer, .legal-footer", action: "hide" as const }]
  }

  getMarkdownFixerConfig(): MarkdownFixerConfig {
    return {
      selector: ".segment-assistant .markdown p",
      fixSpanContent: false,
      shouldSkip: (element: HTMLElement) => {
        if (!this.isGenerating()) return false

        const currentAssistant = element.closest(".segment-assistant")
        if (!currentAssistant) return false

        const allAssistants = document.querySelectorAll(
          `${ASSISTANT_ITEM_SELECTOR} .segment-assistant`,
        )
        const lastAssistant = allAssistants[allAssistants.length - 1]
        return currentAssistant === lastAssistant
      },
    }
  }

  protected simulateClick(element: HTMLElement): void {
    const eventTypes = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]
    for (const type of eventTypes) {
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 1,
        }),
      )
    }
  }

  private extractConversationInfo(el: Element, cid?: string): ConversationInfo | null {
    const href = el.getAttribute("href") || ""
    const id = this.extractConversationIdFromHref(href)
    if (!id) return null

    const title = this.extractConversationTitle(el)
    const isActive =
      el.classList.contains("router-link-active") ||
      el.classList.contains("router-link-exact-active")
    const isPinned = !!el.querySelector("svg.pinned, .pinned")

    return {
      id,
      cid,
      title,
      url: `https://www.kimi.com/chat/${id}`,
      isActive,
      isPinned,
    }
  }

  private extractConversationTitle(el: Element): string {
    const title =
      el.querySelector(CONVERSATION_TITLE_SELECTOR)?.textContent?.trim() ||
      el.querySelector(HISTORY_TITLE_SELECTOR)?.textContent?.trim() ||
      ""
    if (title) return title

    const fallback = el.textContent?.replace(/\s+/g, " ").trim() || ""
    return fallback.length > 120 ? `${fallback.slice(0, 120)}...` : fallback
  }

  private extractConversationIdFromHref(href: string): string | null {
    if (!href) return null

    try {
      const url = new URL(href, window.location.origin)
      const match = url.pathname.match(CHAT_PATH_PATTERN)
      return match ? match[1] : null
    } catch {
      return null
    }
  }

  private findScrollableParent(element: Element | null): HTMLElement | null {
    let current = element as HTMLElement | null
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current)
      if (
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        current.scrollHeight > current.clientHeight
      ) {
        return current
      }
      current = current.parentElement
    }
    return null
  }

  private getActiveConversationLink(): Element | null {
    const activeLink = document.querySelector(
      `${SIDEBAR_CONVERSATION_SELECTOR}.router-link-active, ${SIDEBAR_CONVERSATION_SELECTOR}.router-link-exact-active`,
    )
    if (activeLink) return activeLink

    const currentPath = window.location.pathname
    const normalized = currentPath.endsWith("/") ? currentPath.slice(0, -1) : currentPath
    if (!normalized) return null

    return document.querySelector(`${SIDEBAR_CONVERSATION_SELECTOR}[href="${normalized}"]`)
  }

  private isHistoryPath(pathname = window.location.pathname): boolean {
    return pathname === "/chat/history" || pathname.startsWith("/chat/history/")
  }

  private async openMoreHistoryView(): Promise<void> {
    if (this.isHistoryPath()) return

    const moreHistoryLink = document.querySelector(
      'a.more-history[href*="/chat/history"], a.nav-item.more-history[href*="/chat/history"]',
    ) as HTMLElement | null
    if (!moreHistoryLink) return

    const beforePath = window.location.pathname
    const beforeCount = document.querySelectorAll(SIDEBAR_CONVERSATION_SELECTOR).length

    moreHistoryLink.click()

    const timeoutAt = Date.now() + 3000
    while (Date.now() < timeoutAt) {
      const currentPath = window.location.pathname
      const currentCount = document.querySelectorAll(SIDEBAR_CONVERSATION_SELECTOR).length
      if (currentPath !== beforePath || currentCount > beforeCount) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
  }

  private async closeMoreHistoryView(): Promise<void> {
    if (!this.isHistoryPath()) return

    const closeTarget = document.querySelector(
      [
        ".header-right .close-button-container",
        ".header-right .close-button",
        ".history .header-right .close-button-container",
        ".history .header-right .close-button",
      ].join(", "),
    ) as HTMLElement | null
    if (!closeTarget) return

    const clickable =
      (closeTarget.closest(".close-button-container") as HTMLElement | null) || closeTarget

    this.simulateClick(clickable)
    if (!this.isHistoryPath()) return

    clickable.click()
    if (!this.isHistoryPath()) return

    const timeoutAt = Date.now() + 3000
    while (Date.now() < timeoutAt) {
      if (!this.isHistoryPath()) return
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
  }

  private selectEditorAll(editor: HTMLElement): void {
    const selection = window.getSelection()
    if (!selection) return

    const range = document.createRange()
    range.selectNodeContents(editor)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  private insertByExecCommand(editor: HTMLElement, content: string): boolean {
    try {
      this.selectEditorAll(editor)
      const inserted = document.execCommand("insertText", false, content)
      if (inserted) return true
    } catch {
      // ignore and fallback
    }
    return false
  }

  private insertByPasteEvent(editor: HTMLElement, content: string): boolean {
    try {
      if (typeof DataTransfer === "undefined") return false

      const before = editor.textContent || ""
      const dataTransfer = new DataTransfer()
      dataTransfer.setData("text/plain", content)

      const notCanceled = editor.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dataTransfer,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      )
      if (!notCanceled) return true

      const after = editor.textContent || ""
      return after !== before || content.length === 0
    } catch {
      return false
    }
  }

  private clearByExecCommand(editor: HTMLElement): boolean {
    try {
      this.selectEditorAll(editor)
      return document.execCommand("delete", false, undefined)
    } catch {
      return false
    }
  }

  private getChatItems(container: Element): Element[] {
    const directItems = Array.from(container.querySelectorAll(CHAT_ITEM_SELECTOR)).filter(
      (item) => !item.parentElement?.closest(CHAT_ITEM_SELECTOR),
    )
    if (directItems.length > 0) return directItems

    return Array.from(container.children).filter(
      (child) =>
        child.matches(USER_ITEM_SELECTOR) ||
        child.matches(ASSISTANT_ITEM_SELECTOR) ||
        child.querySelector(USER_SEGMENT_SELECTOR) !== null ||
        child.querySelector(ASSISTANT_MARKDOWN_SELECTOR) !== null,
    )
  }

  private findNextAssistantMarkdown(items: Element[], fromIndex: number): Element | null {
    for (let i = fromIndex + 1; i < items.length; i++) {
      const markdown = items[i].querySelector(".markdown")
      if (markdown) return markdown
    }
    return null
  }
}
