/**
 * DeepSeek 适配器（chat.deepseek.com）
 *
 * 选择器策略：
 * - 优先使用 `ds-*` 语义类名
 * - 会话列表优先使用 `/a/chat/s/{id}` 路由结构
 * - 对用户消息采用“消息容器内不存在 `.ds-markdown`”的结构判断
 *
 * 注意：DeepSeek 页面存在部分 CSS Modules 哈希类名，首版实现尽量避免依赖它们。
 */
import { SITE_IDS } from "~constants"
import { htmlToMarkdown } from "~utils/exporter"

import {
  SiteAdapter,
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type ExportLifecycleContext,
  type NetworkMonitorConfig,
  type OutlineItem,
  type SiteDeleteConversationResult,
} from "./base"

const CHAT_PATH_PATTERN = /\/a\/chat\/s\/([a-z0-9-]+)/i
const TOKEN_STORAGE_PREFIX = "__tea_cache_tokens_"
const THEME_STORAGE_KEY = "__appKit_@deepseek/chat_themePreference"
const USER_TOKEN_STORAGE_KEY = "userToken"
const CONVERSATION_LINK_SELECTOR = 'a[href*="/a/chat/s/"]'
const MESSAGE_SELECTOR = ".ds-message"
const OUTLINE_HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6"
const ASSISTANT_MARKDOWN_SELECTOR = ".ds-message:has(.ds-markdown) .ds-markdown"
const USER_MESSAGE_SELECTOR = ".ds-message:not(:has(.ds-markdown))"
const RESPONSE_CONTAINER_SELECTOR =
  'main .ds-scroll-area:has(.ds-message), [role="main"] .ds-scroll-area:has(.ds-message), .ds-scroll-area:has(.ds-message)'
const CHAT_COMPLETION_API_PATTERN = "/api/v0/chat/completion"
const CHAT_DELETE_API_PATH = "/api/v0/chat_session/delete"
const DEEPSEEK_HOME_URL = "https://chat.deepseek.com/"
const DELETE_REFRESH_STORAGE_KEY = "gh.deepseek.delete.refresh"
const DEEPSEEK_EXPORT_ROOT_ATTR = "data-gh-deepseek-export-root"
const DEEPSEEK_EXPORT_ROLE_ATTR = "data-gh-deepseek-export-role"
const DEEPSEEK_EXPORT_ROLE_USER = "user"
const DEEPSEEK_EXPORT_ROLE_ASSISTANT = "assistant"
const DEEPSEEK_EXPORT_USER_SELECTOR = `[${DEEPSEEK_EXPORT_ROOT_ATTR}="1"] [${DEEPSEEK_EXPORT_ROLE_ATTR}="${DEEPSEEK_EXPORT_ROLE_USER}"]`
const DEEPSEEK_EXPORT_ASSISTANT_SELECTOR = `[${DEEPSEEK_EXPORT_ROOT_ATTR}="1"] [${DEEPSEEK_EXPORT_ROLE_ATTR}="${DEEPSEEK_EXPORT_ROLE_ASSISTANT}"]`
const STOP_ICON_PATH_PREFIX = "M2 4.88"
const SEND_ICON_PATH =
  "M8.3125 0.981587C8.66767 1.0545 8.97902 1.20558 9.2627 1.43374C9.48724 1.61438 9.73029 1.85933 9.97949 2.10854L14.707 6.83608L13.293 8.25014L9 3.95717V15.0431H7V3.95717L2.70703 8.25014L1.29297 6.83608L6.02051 2.10854C6.26971 1.85933 6.51277 1.61438 6.7373 1.43374C6.97662 1.24126 7.28445 1.04542 7.6875 0.981587C7.8973 0.94841 8.1031 0.956564 8.3125 0.981587Z"

const DEEPSEEK_DELETE_REASON = {
  MISSING_AUTH_TOKEN: "delete_api_missing_auth_token",
  API_REQUEST_FAILED: "delete_api_request_failed",
  API_INVALID_RESPONSE: "delete_api_invalid_response",
  API_BUSINESS_FAILED: "delete_api_business_failed",
} as const

interface DeepSeekNativeOutlineEntry {
  text: string
  scrollTop?: number
  batchIndex?: number
}

interface DeepSeekNativeOutlineCache {
  sessionId: string
  snapshot: string
  items: DeepSeekNativeOutlineEntry[]
}

interface DeepSeekExportMessageSnapshot {
  role: "user" | "assistant"
  content: string
}

export class DeepSeekAdapter extends SiteAdapter {
  private nativeOutlineCache: DeepSeekNativeOutlineCache | null = null
  private exportSnapshotRoot: HTMLElement | null = null
  private exportSnapshotActive = false

  match(): boolean {
    const isMatch = window.location.hostname === "chat.deepseek.com"
    if (isMatch) {
      this.consumePendingDeleteRefresh()
    }
    return isMatch
  }

  getSiteId(): string {
    return SITE_IDS.DEEPSEEK
  }

  getName(): string {
    return "DeepSeek"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#4b6bfe", secondary: "#3a5ae0" }
  }

  getTextareaSelectors(): string[] {
    return [
      'textarea[placeholder*="DeepSeek"]',
      'textarea[placeholder*="deepseek"]',
      "textarea.ds-scroll-area",
      "form textarea",
    ]
  }

  insertPrompt(content: string): boolean {
    const el = this.getTextareaElement() as HTMLTextAreaElement | null
    if (!el || !el.isConnected) return false

    el.focus()

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    if (setter) {
      setter.call(el, content)
    } else {
      el.value = content
    }

    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: content }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    el.setSelectionRange(content.length, content.length)
    return true
  }

  clearTextarea(): void {
    const el = this.getTextareaElement() as HTMLTextAreaElement | null
    if (!el || !el.isConnected) return

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    if (setter) {
      setter.call(el, "")
    } else {
      el.value = ""
    }

    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: "" }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    el.setSelectionRange(0, 0)
  }

  getSessionId(): string {
    const match = window.location.pathname.match(CHAT_PATH_PATTERN)
    return match ? match[1] : ""
  }

  isNewConversation(): boolean {
    const path = window.location.pathname
    return (
      path === "/" || path === "/a/chat" || path === "/a/chat/" || !CHAT_PATH_PATTERN.test(path)
    )
  }

  getNewTabUrl(): string {
    return "https://chat.deepseek.com/"
  }

  getSessionName(): string | null {
    const conversationTitle = this.getConversationTitle()
    if (conversationTitle) return conversationTitle

    const title = document.title.trim()
    if (!title || title === "DeepSeek") return null

    return title.replace(/\s*[-|]\s*DeepSeek$/i, "").trim() || null
  }

  getCurrentCid(): string | null {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || !key.startsWith(TOKEN_STORAGE_PREFIX)) continue

        const raw = localStorage.getItem(key)
        if (!raw) continue

        const data = JSON.parse(raw) as Record<string, unknown>
        const uid = data.user_unique_id
        if (typeof uid === "string" && uid) {
          return uid
        }
      }
    } catch {
      // ignore malformed localStorage data
    }

    return null
  }

  getConversationList(): ConversationInfo[] {
    const cid = this.getCurrentCid() || undefined
    const links = document.querySelectorAll(CONVERSATION_LINK_SELECTOR)
    const map = new Map<string, ConversationInfo>()

    links.forEach((link) => {
      const info = this.extractConversationInfo(link, cid)
      if (info) {
        map.set(info.id, info)
      }
    })

    return Array.from(map.values())
  }

  getConversationObserverConfig(): ConversationObserverConfig {
    return {
      selector: CONVERSATION_LINK_SELECTOR,
      shadow: false,
      extractInfo: (el) => this.extractConversationInfo(el, this.getCurrentCid() || undefined),
      getTitleElement: (el) => this.findTitleElement(el),
    }
  }

  async deleteConversationOnSite(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    const currentSessionId = this.getSessionId()
    const token = this.getUserToken()
    if (!token) {
      return {
        id: target.id,
        success: false,
        method: "api",
        reason: DEEPSEEK_DELETE_REASON.MISSING_AUTH_TOKEN,
      }
    }

    const result = await this.deleteConversationViaApi(target, token)
    if (result.success) {
      if (target.id === currentSessionId) {
        this.scheduleHomeRefreshAfterDelete()
      } else {
        this.schedulePageReloadAfterDelete()
      }
    }
    return result
  }

  async deleteConversationsOnSite(
    targets: ConversationDeleteTarget[],
  ): Promise<SiteDeleteConversationResult[]> {
    if (targets.length === 0) {
      return []
    }

    const currentSessionId = this.getSessionId()
    const token = this.getUserToken()
    if (!token) {
      return targets.map((target) => ({
        id: target.id,
        success: false,
        method: "api",
        reason: DEEPSEEK_DELETE_REASON.MISSING_AUTH_TOKEN,
      }))
    }

    const results: SiteDeleteConversationResult[] = []
    let deletedCurrentSession = false
    let hasSuccessfulDeletion = false

    for (const target of targets) {
      const result = await this.deleteConversationViaApi(target, token)
      results.push(result)
      if (result.success) {
        hasSuccessfulDeletion = true
        if (target.id === currentSessionId) {
          deletedCurrentSession = true
        }
      }
    }

    if (hasSuccessfulDeletion) {
      if (deletedCurrentSession) {
        this.scheduleHomeRefreshAfterDelete()
      } else {
        this.schedulePageReloadAfterDelete()
      }
    }

    return results
  }

  getConversationTitle(): string | null {
    const sessionId = this.getSessionId()
    const activeLink =
      (sessionId
        ? document.querySelector(`${CONVERSATION_LINK_SELECTOR}[href*="/a/chat/s/${sessionId}"]`)
        : null) || document.querySelector(`${CONVERSATION_LINK_SELECTOR}[aria-current="page"]`)

    if (!activeLink) return null
    return this.extractConversationTitle(activeLink)
  }

  navigateToConversation(id: string, url?: string): boolean {
    const link = document.querySelector(
      `${CONVERSATION_LINK_SELECTOR}[href*="/a/chat/s/${id}"]`,
    ) as HTMLElement | null

    if (link) {
      link.click()
      return true
    }

    return super.navigateToConversation(id, url || `https://chat.deepseek.com/a/chat/s/${id}`)
  }

  getSidebarScrollContainer(): Element | null {
    const firstLink = document.querySelector(CONVERSATION_LINK_SELECTOR)
    return firstLink?.closest(".ds-scroll-area") || null
  }

  getScrollContainer(): HTMLElement | null {
    const topLevelMessages = Array.from(document.querySelectorAll(MESSAGE_SELECTOR)).filter(
      (message) => !message.parentElement?.closest(MESSAGE_SELECTOR),
    )
    const fromMessages = this.pickBestScrollableAncestor(topLevelMessages)
    if (fromMessages) {
      return fromMessages
    }

    const fallbackRoots = Array.from(
      document.querySelectorAll(`${ASSISTANT_MARKDOWN_SELECTOR}, ${USER_MESSAGE_SELECTOR}`),
    ).filter((element) => !element.closest(".gh-root, .gh-table-container"))
    return this.pickBestScrollableAncestor(fallbackRoots)
  }

  getResponseContainerSelector(): string {
    return RESPONSE_CONTAINER_SELECTOR
  }

  getUserQuerySelector(): string {
    return USER_MESSAGE_SELECTOR
  }

  getChatContentSelectors(): string[] {
    return [ASSISTANT_MARKDOWN_SELECTOR, USER_MESSAGE_SELECTOR]
  }

  extractUserQueryText(element: Element): string {
    if (this.isExportSnapshotElement(element)) {
      return element.textContent?.trim() || ""
    }

    const source = this.findUserContentRoot(element) || element
    const clone = source.cloneNode(true) as HTMLElement

    clone
      .querySelectorAll(
        ".gh-user-query-markdown, button, [role=button], svg, .ds-icon-button, [aria-hidden=true]",
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
      if (inlineStyle) {
        rendered.setAttribute("style", inlineStyle)
      }
    }

    if (contentRoot === element) {
      const rawWrapper = document.createElement("div")
      rawWrapper.className = "gh-user-query-raw"
      while (element.firstChild) {
        rawWrapper.appendChild(element.firstChild)
      }
      rawWrapper.style.display = "none"
      element.appendChild(rawWrapper)
      element.appendChild(rendered)
      return true
    }

    ;(contentRoot as HTMLElement).style.display = "none"
    contentRoot.after(rendered)
    return true
  }

  extractAssistantResponseText(element: Element): string {
    if (this.isExportSnapshotElement(element)) {
      return element.textContent?.trim() || ""
    }

    const markdown = element.matches(".ds-markdown")
      ? element
      : element.querySelector(".ds-markdown")
    if (!markdown) return ""

    const content = htmlToMarkdown(markdown).trim()
    if (content) return content

    return this.extractTextWithLineBreaks(markdown).trim()
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const container =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    if (!container) return []

    const outline: OutlineItem[] = []
    const domUserQueries: OutlineItem[] = []
    const messages = Array.from(container.querySelectorAll(MESSAGE_SELECTOR)).filter(
      (message) => !message.parentElement?.closest(MESSAGE_SELECTOR),
    )

    messages.forEach((message, index) => {
      const markdown = message.querySelector(".ds-markdown")

      if (!markdown) {
        if (!includeUserQueries) return

        const text = this.extractUserQueryMarkdown(message)
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          wordCount =
            this.findNextAssistantMarkdown(messages, index)?.textContent?.trim().length || 0
        }

        const item = this.createUserQueryOutlineItem(text, message as HTMLElement, wordCount)
        domUserQueries.push(item)
        outline.push(item)
        return
      }

      const headings = Array.from(markdown.querySelectorAll(OUTLINE_HEADING_SELECTOR))
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
          element: heading as HTMLElement,
          wordCount,
        })
      })
    })

    if (!includeUserQueries) {
      return outline
    }

    const nativeUserQueries = this.extractNativeUserQueries(domUserQueries)
    if (nativeUserQueries.length <= domUserQueries.length) {
      return outline
    }

    return this.mergeOutlineWithNativeUserQueries(outline, nativeUserQueries)
  }

  async resolveOutlineTarget(
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery">,
    queryIndex?: number,
  ): Promise<Element | null> {
    const directTarget = await super.resolveOutlineTarget(item, queryIndex)
    if (directTarget) {
      return directTarget
    }

    if (!item.isUserQuery || item.level !== 0 || queryIndex === undefined) {
      return null
    }

    const jumped = await this.revealUserQueryThroughNativeOutline(queryIndex, item.text)
    if (!jumped) {
      return null
    }

    return this.waitForUserQueryElement(queryIndex, item.text)
  }

  private createUserQueryOutlineItem(
    text: string,
    element: Element | null,
    wordCount?: number,
  ): OutlineItem {
    const normalizedText = this.normalizeOutlineText(text)
    const isTruncated = normalizedText.length > 80

    return {
      level: 0,
      text: isTruncated ? `${normalizedText.slice(0, 80)}...` : normalizedText,
      element,
      isUserQuery: true,
      isTruncated,
      wordCount,
    }
  }

  getExportConfig(): ExportConfig {
    if (this.exportSnapshotActive) {
      return {
        userQuerySelector: DEEPSEEK_EXPORT_USER_SELECTOR,
        assistantResponseSelector: DEEPSEEK_EXPORT_ASSISTANT_SELECTOR,
        turnSelector: null,
        useShadowDOM: false,
      }
    }

    return {
      userQuerySelector: USER_MESSAGE_SELECTOR,
      assistantResponseSelector: ASSISTANT_MARKDOWN_SELECTOR,
      turnSelector: null,
      useShadowDOM: false,
    }
  }

  async prepareConversationExport(_context: ExportLifecycleContext): Promise<unknown> {
    this.clearExportSnapshot()

    const scrollContainer =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    if (!(scrollContainer instanceof HTMLElement)) {
      return null
    }

    const messages = await this.collectExportMessageSnapshots(scrollContainer)
    if (messages.length === 0) {
      return null
    }

    this.mountExportSnapshot(messages)
    return { count: messages.length }
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    _state: unknown,
  ): Promise<void> {
    this.clearExportSnapshot()
  }

  getLatestReplyText(): string | null {
    const scrollContainer =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    if (scrollContainer instanceof HTMLElement) {
      const originalScrollTop = scrollContainer.scrollTop
      const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)

      try {
        scrollContainer.scrollTop = maxScroll
        scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
        scrollContainer.getBoundingClientRect()

        const latest = this.extractLatestReplyTextFromMarkdowns(
          this.getVisibleAssistantMarkdownElements(scrollContainer),
        )
        if (latest) {
          return latest
        }
      } finally {
        scrollContainer.scrollTop = originalScrollTop
        scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
      }
    }

    return this.extractLatestReplyTextFromMarkdowns(
      this.getVisibleAssistantMarkdownElements(document),
    )
  }

  getLastCodeBlockText(): string | null {
    const scrollContainer =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    if (scrollContainer instanceof HTMLElement) {
      const positions = this.buildBottomUpScanPositions(scrollContainer)
      const originalScrollTop = scrollContainer.scrollTop

      try {
        for (const top of positions) {
          scrollContainer.scrollTop = top
          scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
          scrollContainer.getBoundingClientRect()

          const code = this.extractLastCodeBlockTextFromMarkdowns(
            this.getVisibleAssistantMarkdownElements(scrollContainer),
          )
          if (code) {
            return code
          }
        }
      } finally {
        scrollContainer.scrollTop = originalScrollTop
        scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
      }
    }

    return this.extractLastCodeBlockTextFromMarkdowns(
      this.getVisibleAssistantMarkdownElements(document),
    )
  }

  getSubmitButtonSelectors(): string[] {
    return [
      `div[role="button"].ds-icon-button:has(svg path[d="${SEND_ICON_PATH}"])`,
      `button.ds-icon-button:has(svg path[d="${SEND_ICON_PATH}"])`,
    ]
  }

  findSubmitButton(editor: HTMLElement | null): HTMLElement | null {
    const selector = this.getSubmitButtonSelectors().join(", ")
    if (!selector) return null

    const scopes = [
      editor?.closest("form"),
      editor?.parentElement,
      editor?.closest("div"),
      document.body,
    ].filter(Boolean) as ParentNode[]

    const seen = new Set<HTMLElement>()

    for (const scope of scopes) {
      const buttons = scope.querySelectorAll(selector)
      for (const button of Array.from(buttons)) {
        const element = button as HTMLElement
        if (seen.has(element) || element.offsetParent === null) continue
        seen.add(element)
        return element
      }
    }

    return null
  }

  getNewChatButtonSelectors(): string[] {
    return ['a[href="/a/chat"]', 'a[href="/a/chat/"]']
  }

  getWidthSelectors() {
    return []
  }

  getUserQueryWidthSelectors() {
    return []
  }

  isGenerating(): boolean {
    const buttons = this.findComposerButtons()

    for (const button of buttons) {
      const path = button.querySelector("svg path")
      const d = path?.getAttribute("d") || ""
      if (d.startsWith(STOP_ICON_PATH_PREFIX)) {
        return true
      }
    }

    return false
  }

  getModelName(): string | null {
    const selectedButtons = Array.from(document.querySelectorAll(".ds-toggle-button--selected"))
      .map(
        (button) => (button as HTMLElement).innerText?.trim() || button.textContent?.trim() || "",
      )
      .filter(Boolean)

    if (selectedButtons.length === 0) {
      return "DeepSeek"
    }

    return `DeepSeek (${selectedButtons.join(", ")})`
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
    return {
      // DeepSeek 生成走 SSE 流式接口：/api/v0/chat/completion
      // 只匹配这个接口，避免把会话列表、重命名等普通请求误判为生成任务。
      urlPatterns: [CHAT_COMPLETION_API_PATTERN],
      // 流结束后等待一个很短的静默窗口，让 DOM/标题状态完成收敛。
      silenceThreshold: 500,
    }
  }

  async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
    try {
      const themeData = JSON.stringify({ value: targetMode, __version: "0" })
      localStorage.setItem(THEME_STORAGE_KEY, themeData)

      const body = document.body
      if (body) {
        body.classList.remove("light", "dark")
        body.classList.add("change-theme", targetMode)

        if (targetMode === "dark") {
          body.setAttribute("data-ds-dark-theme", "dark")
        } else {
          body.removeAttribute("data-ds-dark-theme")
        }

        body.style.colorScheme = targetMode

        window.setTimeout(() => {
          if (document.body === body) {
            body.classList.remove("change-theme")
          }
        }, 300)
      }

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_STORAGE_KEY,
          newValue: themeData,
          storageArea: localStorage,
        }),
      )

      return true
    } catch (error) {
      console.error("[DeepSeekAdapter] toggleTheme error:", error)
      return false
    }
  }

  private findComposerButtons(): HTMLElement[] {
    const textarea = this.getTextareaElement()
    const scopes = [
      textarea?.closest("form"),
      textarea?.parentElement,
      textarea?.closest("div"),
      document.body,
    ].filter(Boolean) as HTMLElement[]

    const seen = new Set<HTMLElement>()
    const buttons: HTMLElement[] = []

    for (const scope of scopes) {
      const found = scope.querySelectorAll(
        'div[role="button"].ds-icon-button, button.ds-icon-button, .ds-icon-button[aria-disabled="false"]',
      )
      for (const button of Array.from(found)) {
        const el = button as HTMLElement
        if (el.offsetParent === null || seen.has(el)) continue
        seen.add(el)
        buttons.push(el)
      }

      if (buttons.length > 0) {
        return buttons
      }
    }

    return buttons
  }

  private pickBestScrollableAncestor(elements: Element[]): HTMLElement | null {
    const scored = new Map<HTMLElement, number>()

    for (const element of elements) {
      const ancestor = this.findScrollableAncestor(element)
      if (!ancestor) continue
      const current = scored.get(ancestor) || 0
      scored.set(ancestor, current + this.scoreScrollContainer(ancestor))
    }

    let best: HTMLElement | null = null
    let bestScore = -1

    for (const [candidate, score] of scored.entries()) {
      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    }

    return bestScore > 0 ? best : null
  }

  private findScrollableAncestor(element: Element | null): HTMLElement | null {
    let current = element instanceof HTMLElement ? element : element?.parentElement || null

    while (current && current !== document.body) {
      if (this.isPrimaryScrollContainer(current)) {
        return current
      }
      current = current.parentElement
    }

    return null
  }

  private isPrimaryScrollContainer(element: HTMLElement): boolean {
    if (!element.isConnected) return false

    const style = window.getComputedStyle(element)
    if (!(style.overflowY === "auto" || style.overflowY === "scroll")) {
      return false
    }

    if (element.scrollHeight <= element.clientHeight) {
      return false
    }

    if (element.clientHeight < 220) {
      return false
    }

    const rect = element.getBoundingClientRect()
    if (rect.width < 320 || rect.height < 220) {
      return false
    }

    return true
  }

  private scoreScrollContainer(element: HTMLElement): number {
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
    const rect = element.getBoundingClientRect()
    const messageCount = element.querySelectorAll(MESSAGE_SELECTOR).length
    const userCount = element.querySelectorAll(USER_MESSAGE_SELECTOR).length
    const assistantCount = element.querySelectorAll(ASSISTANT_MARKDOWN_SELECTOR).length

    let score = 0

    score += Math.min(messageCount, 80) * 200
    score += Math.min(userCount, 40) * 120
    score += Math.min(assistantCount, 40) * 120

    if (element.scrollTop > 0) {
      score += 800
    }

    if (rect.height >= viewportHeight * 0.35) {
      score += 500
    }

    if (rect.width >= viewportWidth * 0.45) {
      score += 350
    }

    if (element.matches("main, [role='main']") || element.closest("main, [role='main']")) {
      score += 250
    }

    if (element.querySelector("textarea")) {
      score -= 700
    }

    if (element.querySelector(".gh-table-container")) {
      score -= 250
    }

    return score
  }

  private extractNativeUserQueries(domUserQueries: OutlineItem[]): OutlineItem[] {
    const nativeEntries = this.collectNativeOutlineEntries()
    if (nativeEntries.length === 0) {
      return []
    }

    const outline: OutlineItem[] = []
    const occurrenceMap = new Map<string, number>()
    let domQueryCursor = 0

    nativeEntries.forEach((entry) => {
      const matchIndex = this.findMatchingUserQueryIndex(domUserQueries, entry.text, domQueryCursor)
      const matchedQuery = matchIndex >= 0 ? domUserQueries[matchIndex] : null

      if (matchIndex >= 0) {
        domQueryCursor = matchIndex + 1
      }

      const item = this.createUserQueryOutlineItem(entry.text, matchedQuery?.element || null)
      item.wordCount = matchedQuery?.wordCount

      const occurrenceKey = this.normalizeUserQueryMatchText(entry.text)
      const occurrence = occurrenceMap.get(occurrenceKey) || 0
      occurrenceMap.set(occurrenceKey, occurrence + 1)

      item.id =
        matchedQuery?.id ||
        `deepseek-user-query::${occurrence}::${this.normalizeUserQueryMatchText(entry.text)}`

      outline.push(item)
    })

    return outline
  }

  private mergeOutlineWithNativeUserQueries(
    domOutline: OutlineItem[],
    nativeUserQueries: OutlineItem[],
  ): OutlineItem[] {
    if (!domOutline.some((item) => item.isUserQuery)) {
      return [...nativeUserQueries, ...domOutline]
    }

    const merged: OutlineItem[] = []
    let nativeQueryCursor = 0

    domOutline.forEach((item) => {
      if (!item.isUserQuery) {
        merged.push(item)
        return
      }

      const matchIndex = this.findMatchingNativeUserQueryIndex(
        nativeUserQueries,
        item,
        nativeQueryCursor,
      )
      if (matchIndex < 0) {
        merged.push(item)
        return
      }

      while (nativeQueryCursor <= matchIndex) {
        merged.push(nativeUserQueries[nativeQueryCursor])
        nativeQueryCursor += 1
      }
    })

    while (nativeQueryCursor < nativeUserQueries.length) {
      merged.push(nativeUserQueries[nativeQueryCursor])
      nativeQueryCursor += 1
    }

    return merged
  }

  private collectNativeOutlineEntries(): DeepSeekNativeOutlineEntry[] {
    const sessionId = this.getSessionId()
    const list = this.findNativeOutlineList()

    if (!list) {
      return this.nativeOutlineCache?.sessionId === sessionId
        ? this.nativeOutlineCache.items.map((item) => ({ ...item }))
        : []
    }

    const scrollContainer = this.findNativeOutlineScrollContainer(list)
    const snapshot = this.getNativeOutlineSnapshot(sessionId, list, scrollContainer)

    if (
      this.nativeOutlineCache &&
      this.nativeOutlineCache.sessionId === sessionId &&
      this.nativeOutlineCache.snapshot === snapshot
    ) {
      return this.nativeOutlineCache.items.map((item) => ({ ...item }))
    }

    const scanned = this.scanNativeOutlineEntries(list, scrollContainer)
    if (scanned.length > 0) {
      this.nativeOutlineCache = {
        sessionId,
        snapshot,
        items: scanned.map((item) => ({ ...item })),
      }
    }

    return scanned
  }

  private findNativeOutlineList(): HTMLElement | null {
    const candidates = Array.from(document.querySelectorAll(".ds-virtual-list")).filter(
      (candidate) =>
        candidate instanceof HTMLElement &&
        candidate.querySelector(".ds-virtual-list-items, .ds-virtual-list-visible-items") &&
        !candidate.querySelector(CONVERSATION_LINK_SELECTOR) &&
        !candidate.closest("aside, nav"),
    ) as HTMLElement[]

    let best: HTMLElement | null = null
    let bestScore = -1

    candidates.forEach((candidate) => {
      const rect = candidate.getBoundingClientRect()
      let score = 0

      if (candidate.closest('[style*="--scroll-nav-page-padding"]')) {
        score += 2500
      }

      if (candidate.closest("main, [role='main']")) {
        score += 600
      }

      if (candidate.querySelector(".ds-virtual-list-visible-items")) {
        score += 400
      }

      if (rect.width >= 140 && rect.width <= 420) {
        score += 350
      }

      if (rect.height >= 120) {
        score += 250
      }

      if (candidate.scrollHeight > candidate.clientHeight + 20) {
        score += 300
      }

      if (candidate.querySelector(MESSAGE_SELECTOR)) {
        score -= 1500
      }

      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    })

    return bestScore > 0 ? best : null
  }

  private findNativeOutlineScrollContainer(list: HTMLElement): HTMLElement | null {
    const candidates = [
      list,
      list.closest(".ds-scroll-area"),
      list.parentElement,
      list.closest('[style*="--scroll-nav-page-padding"]')?.querySelector(".ds-scroll-area"),
    ].filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)

    let best: HTMLElement | null = null
    let bestScore = -1

    candidates.forEach((candidate) => {
      const style = window.getComputedStyle(candidate)
      const canScroll =
        candidate.scrollHeight > candidate.clientHeight + 8 ||
        style.overflowY === "auto" ||
        style.overflowY === "scroll" ||
        candidate.classList.contains("ds-virtual-list") ||
        candidate.classList.contains("ds-scroll-area")

      if (!canScroll || candidate.clientHeight <= 0) {
        return
      }

      let score = 0
      if (candidate === list) score += 500
      if (candidate.classList.contains("ds-virtual-list")) score += 350
      if (candidate.classList.contains("ds-scroll-area")) score += 250
      score += Math.min(candidate.scrollHeight - candidate.clientHeight, 2000)

      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    })

    return bestScore > 0 ? best : null
  }

  private getNativeOutlineSnapshot(
    sessionId: string,
    list: HTMLElement,
    scrollContainer: HTMLElement | null,
  ): string {
    const itemsRoot = list.querySelector(".ds-virtual-list-items") as HTMLElement | null
    const visibleRoot = list.querySelector(".ds-virtual-list-visible-items")
    const scrollHost = scrollContainer || list

    return [
      sessionId,
      scrollHost.scrollHeight,
      scrollHost.clientHeight,
      itemsRoot?.scrollHeight || 0,
      visibleRoot?.childElementCount || 0,
    ].join("::")
  }

  private scanNativeOutlineEntries(
    list: HTMLElement,
    scrollContainer: HTMLElement | null,
  ): DeepSeekNativeOutlineEntry[] {
    const visibleOnly = this.readVisibleNativeOutlineEntries(list)
    if (!scrollContainer) {
      return visibleOnly
    }

    const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    if (maxScroll <= 0) {
      return visibleOnly
    }

    const originalScrollTop = scrollContainer.scrollTop
    const step = Math.max(48, Math.floor(scrollContainer.clientHeight * 0.6))
    const positions = new Set<number>([0, maxScroll, originalScrollTop])

    for (let top = 0; top < maxScroll; top += step) {
      positions.add(top)
    }

    let collected: DeepSeekNativeOutlineEntry[] = []

    try {
      Array.from(positions)
        .sort((a, b) => a - b)
        .forEach((top) => {
          scrollContainer.scrollTop = top
          scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))

          // 强制浏览器同步 layout，确保虚拟列表完成本轮渲染。
          scrollContainer.getBoundingClientRect()
          list.getBoundingClientRect()

          const batch = this.readVisibleNativeOutlineEntries(list)
          collected = this.mergeNativeOutlineEntryBatch(collected, batch, top)
        })
    } finally {
      scrollContainer.scrollTop = originalScrollTop
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
    }

    return collected
  }

  private readVisibleNativeOutlineEntries(list: HTMLElement): DeepSeekNativeOutlineEntry[] {
    const visibleRoot =
      (list.querySelector(".ds-virtual-list-visible-items") as HTMLElement | null) ||
      (list.querySelector(".ds-virtual-list-items") as HTMLElement | null)
    if (!visibleRoot) {
      return []
    }

    const entries: DeepSeekNativeOutlineEntry[] = []

    Array.from(visibleRoot.children).forEach((child, index) => {
      if (!(child instanceof HTMLElement)) return

      const text = this.extractNativeOutlineText(child)
      if (!text) return

      entries.push({ text, batchIndex: index })
    })

    return entries
  }

  private extractNativeOutlineText(item: HTMLElement): string {
    const directChildren = Array.from(item.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    )

    for (const child of directChildren) {
      const text = this.normalizeOutlineText(child.innerText || child.textContent || "")
      if (text) {
        return text
      }
    }

    return this.normalizeOutlineText(item.innerText || item.textContent || "")
  }

  private mergeNativeOutlineEntryBatch(
    collected: DeepSeekNativeOutlineEntry[],
    batch: DeepSeekNativeOutlineEntry[],
    scrollTop: number,
  ): DeepSeekNativeOutlineEntry[] {
    if (batch.length === 0) {
      return collected
    }

    if (collected.length === 0) {
      return batch.map((item) => ({
        ...item,
        scrollTop: item.scrollTop ?? scrollTop,
      }))
    }

    const maxOverlap = Math.min(collected.length, batch.length)
    for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
      const collectedTail = collected.slice(-overlap)
      const batchHead = batch.slice(0, overlap)
      if (this.nativeOutlineEntrySequenceEquals(collectedTail, batchHead)) {
        return [
          ...collected,
          ...batch.slice(overlap).map((item) => ({
            ...item,
            scrollTop: item.scrollTop ?? scrollTop,
          })),
        ]
      }
    }

    return [
      ...collected,
      ...batch.map((item) => ({
        ...item,
        scrollTop: item.scrollTop ?? scrollTop,
      })),
    ]
  }

  private nativeOutlineEntrySequenceEquals(
    left: DeepSeekNativeOutlineEntry[],
    right: DeepSeekNativeOutlineEntry[],
  ): boolean {
    if (left.length !== right.length) {
      return false
    }

    return left.every((item, index) => this.nativeOutlineEntryEquals(item, right[index]))
  }

  private nativeOutlineEntryEquals(
    left: DeepSeekNativeOutlineEntry,
    right: DeepSeekNativeOutlineEntry,
  ): boolean {
    return (
      this.normalizeUserQueryMatchText(left.text) === this.normalizeUserQueryMatchText(right.text)
    )
  }

  private findMatchingUserQueryIndex(
    queries: OutlineItem[],
    text: string,
    startIndex: number,
  ): number {
    for (let i = startIndex; i < queries.length; i += 1) {
      if (this.isEquivalentUserQueryText(queries[i].text, text)) {
        return i
      }
    }

    return -1
  }

  private findMatchingNativeUserQueryIndex(
    nativeQueries: OutlineItem[],
    query: OutlineItem,
    startIndex: number,
  ): number {
    for (let i = startIndex; i < nativeQueries.length; i += 1) {
      if (this.isEquivalentUserQueryText(nativeQueries[i].text, query.text)) {
        return i
      }
    }

    return -1
  }

  private isEquivalentUserQueryText(left: string, right: string): boolean {
    const normalizedLeft = this.normalizeUserQueryMatchText(left)
    const normalizedRight = this.normalizeUserQueryMatchText(right)

    return (
      normalizedLeft === normalizedRight ||
      normalizedLeft.startsWith(normalizedRight) ||
      normalizedRight.startsWith(normalizedLeft)
    )
  }

  private normalizeUserQueryMatchText(text: string): string {
    return this.normalizeOutlineText(text).replace(/\.{3}$/, "")
  }

  private normalizeOutlineText(text: string): string {
    return text.replace(/\s+/g, " ").trim()
  }

  private async revealUserQueryThroughNativeOutline(
    queryIndex: number,
    text: string,
  ): Promise<boolean> {
    const list = this.findNativeOutlineList()
    if (!list) {
      return false
    }

    const scrollContainer = this.findNativeOutlineScrollContainer(list)
    if (!scrollContainer) {
      return false
    }

    const entries = this.collectNativeOutlineEntries()
    if (entries.length === 0) {
      return false
    }

    const targetEntry = this.resolveNativeOutlineEntry(entries, queryIndex, text)
    if (!targetEntry) {
      return false
    }

    const candidateScrollTops = this.buildNativeOutlineJumpPositions(
      entries,
      targetEntry,
      queryIndex,
      scrollContainer,
      text,
    )

    for (const top of candidateScrollTops) {
      scrollContainer.scrollTop = top
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
      await this.sleep(80)

      const targetItem = this.findVisibleNativeOutlineItem(list, targetEntry, text)
      if (!targetItem) {
        continue
      }

      this.dispatchNativeOutlineClick(targetItem)
      return true
    }

    return false
  }

  private resolveNativeOutlineEntry(
    entries: DeepSeekNativeOutlineEntry[],
    queryIndex: number,
    text: string,
  ): DeepSeekNativeOutlineEntry | null {
    if (queryIndex > 0 && queryIndex <= entries.length) {
      return entries[queryIndex - 1]
    }

    return entries.find((entry) => this.isEquivalentUserQueryText(entry.text, text)) || null
  }

  private buildNativeOutlineJumpPositions(
    entries: DeepSeekNativeOutlineEntry[],
    targetEntry: DeepSeekNativeOutlineEntry,
    queryIndex: number,
    scrollContainer: HTMLElement,
    text: string,
  ): number[] {
    const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    const estimatedTop =
      entries.length > 1
        ? Math.round((maxScroll * Math.max(queryIndex - 1, 0)) / Math.max(entries.length - 1, 1))
        : 0

    const matchTops = entries
      .filter((entry) => this.isEquivalentUserQueryText(entry.text, text))
      .map((entry) => entry.scrollTop)
      .filter((top): top is number => typeof top === "number")

    const positions = [
      targetEntry.scrollTop,
      estimatedTop,
      estimatedTop - scrollContainer.clientHeight * 0.5,
      estimatedTop + scrollContainer.clientHeight * 0.5,
      ...matchTops,
      0,
      maxScroll,
    ]

    const seen = new Set<number>()

    return positions
      .map((top) => Math.max(0, Math.min(maxScroll, Math.round(top || 0))))
      .filter((top) => {
        if (seen.has(top)) {
          return false
        }
        seen.add(top)
        return true
      })
  }

  private findVisibleNativeOutlineItem(
    list: HTMLElement,
    targetEntry: DeepSeekNativeOutlineEntry,
    text: string,
  ): HTMLElement | null {
    const visibleRoot =
      (list.querySelector(".ds-virtual-list-visible-items") as HTMLElement | null) ||
      (list.querySelector(".ds-virtual-list-items") as HTMLElement | null)
    if (!visibleRoot) {
      return null
    }

    const children = Array.from(visibleRoot.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    )

    if (
      typeof targetEntry.batchIndex === "number" &&
      targetEntry.batchIndex >= 0 &&
      targetEntry.batchIndex < children.length
    ) {
      const indexedChild = children[targetEntry.batchIndex]
      if (this.isEquivalentUserQueryText(this.extractNativeOutlineText(indexedChild), text)) {
        return indexedChild
      }
    }

    return (
      children.find((child) =>
        this.isEquivalentUserQueryText(this.extractNativeOutlineText(child), text),
      ) || null
    )
  }

  private dispatchNativeOutlineClick(element: HTMLElement): void {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }))
    element.click()
  }

  private async waitForUserQueryElement(queryIndex: number, text: string): Promise<Element | null> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const found = this.findUserQueryElement(queryIndex, text)
      if (found) {
        return found
      }

      await this.sleep(80)
    }

    return null
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  private isExportSnapshotElement(element: Element): boolean {
    return element.hasAttribute(DEEPSEEK_EXPORT_ROLE_ATTR)
  }

  private async collectExportMessageSnapshots(
    scrollContainer: HTMLElement,
  ): Promise<DeepSeekExportMessageSnapshot[]> {
    const positions = this.buildExportSnapshotPositions(scrollContainer)
    const originalScrollTop = scrollContainer.scrollTop
    let collected: DeepSeekExportMessageSnapshot[] = []

    try {
      for (const top of positions) {
        scrollContainer.scrollTop = top
        scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
        scrollContainer.getBoundingClientRect()
        await this.sleep(80)

        const batch = this.readVisibleExportMessageSnapshots(scrollContainer)
        collected = this.mergeExportMessageBatch(collected, batch)
      }
    } finally {
      scrollContainer.scrollTop = originalScrollTop
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
    }

    return collected
  }

  private buildExportSnapshotPositions(scrollContainer: HTMLElement): number[] {
    const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    const currentScrollTop = scrollContainer.scrollTop

    if (maxScroll <= 0) {
      return [currentScrollTop]
    }

    const step = Math.max(160, Math.floor(scrollContainer.clientHeight * 0.75))
    const positions = new Set<number>([0, currentScrollTop, maxScroll])

    for (let top = 0; top < maxScroll; top += step) {
      positions.add(top)
    }

    return Array.from(positions).sort((a, b) => a - b)
  }

  private buildBottomUpScanPositions(scrollContainer: HTMLElement): number[] {
    const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    if (maxScroll <= 0) {
      return [scrollContainer.scrollTop]
    }

    const step = Math.max(160, Math.floor(scrollContainer.clientHeight * 0.9))
    const positions: number[] = []

    for (let top = maxScroll; top > 0; top -= step) {
      positions.push(top)
    }

    if (positions[positions.length - 1] !== 0) {
      positions.push(0)
    }

    return positions
  }

  private getVisibleAssistantMarkdownElements(container: ParentNode): HTMLElement[] {
    return Array.from(container.querySelectorAll(ASSISTANT_MARKDOWN_SELECTOR)).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        !element.closest(`[${DEEPSEEK_EXPORT_ROOT_ATTR}]`) &&
        !element.closest(".gh-root"),
    )
  }

  private extractLatestReplyTextFromMarkdowns(markdowns: HTMLElement[]): string | null {
    for (let i = markdowns.length - 1; i >= 0; i -= 1) {
      const text = this.extractTextWithLineBreaks(markdowns[i]).trim()
      if (text) {
        return text
      }
    }

    return null
  }

  private extractLastCodeBlockTextFromMarkdowns(markdowns: HTMLElement[]): string | null {
    for (let i = markdowns.length - 1; i >= 0; i -= 1) {
      const markdownText = this.extractAssistantResponseText(markdowns[i])
      const fromMarkdown = this.extractLastFencedCodeBlock(markdownText)
      if (fromMarkdown) {
        return fromMarkdown
      }

      const fromDom = this.extractLastCodeBlockTextFromDom(markdowns[i])
      if (fromDom) {
        return fromDom
      }
    }

    return null
  }

  private extractLastFencedCodeBlock(markdown: string): string | null {
    if (!markdown) {
      return null
    }

    const pattern = /```[^\n]*\n([\s\S]*?)```/g
    let lastMatch: string | null = null

    for (const match of markdown.matchAll(pattern)) {
      lastMatch = match[1] || null
    }

    if (!lastMatch || !lastMatch.trim()) {
      return null
    }

    return lastMatch.replace(/\r\n/g, "\n").replace(/\n+$/, "")
  }

  private extractLastCodeBlockTextFromDom(markdown: Element): string | null {
    const candidates = Array.from(markdown.querySelectorAll("pre code, pre"))

    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const candidate = candidates[i]
      if (!(candidate instanceof HTMLElement)) continue

      const clone = candidate.cloneNode(true) as HTMLElement
      clone
        .querySelectorAll('button, [role="button"], svg, .ds-icon-button, [aria-hidden="true"]')
        .forEach((node) => node.remove())

      const text = clone.textContent?.replace(/\r\n/g, "\n").replace(/\n+$/, "") || ""
      if (text.trim()) {
        return text
      }
    }

    return null
  }

  private readVisibleExportMessageSnapshots(
    container: ParentNode,
  ): DeepSeekExportMessageSnapshot[] {
    const messages = Array.from(container.querySelectorAll(MESSAGE_SELECTOR)).filter(
      (message): message is HTMLElement =>
        message instanceof HTMLElement &&
        !message.closest(`[${DEEPSEEK_EXPORT_ROOT_ATTR}]`) &&
        !message.parentElement?.closest(MESSAGE_SELECTOR),
    )

    return messages
      .map((message) => this.extractExportMessageSnapshot(message))
      .filter((message): message is DeepSeekExportMessageSnapshot => message !== null)
  }

  private extractExportMessageSnapshot(message: Element): DeepSeekExportMessageSnapshot | null {
    const markdown = message.querySelector(".ds-markdown")
    if (markdown) {
      const content = this.normalizeExportMessageContent(
        this.extractAssistantResponseText(markdown),
      )
      return content
        ? {
            role: DEEPSEEK_EXPORT_ROLE_ASSISTANT,
            content,
          }
        : null
    }

    const content = this.normalizeExportMessageContent(this.extractUserQueryMarkdown(message))
    return content
      ? {
          role: DEEPSEEK_EXPORT_ROLE_USER,
          content,
        }
      : null
  }

  private normalizeExportMessageContent(content: string): string {
    return content
      .replace(/\r\n/g, "\n")
      .replace(/\u00a0/g, " ")
      .trim()
  }

  private mergeExportMessageBatch(
    collected: DeepSeekExportMessageSnapshot[],
    batch: DeepSeekExportMessageSnapshot[],
  ): DeepSeekExportMessageSnapshot[] {
    if (batch.length === 0) {
      return collected
    }

    if (collected.length === 0) {
      return batch.map((item) => ({ ...item }))
    }

    const maxOverlap = Math.min(collected.length, batch.length)
    for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
      const collectedTail = collected.slice(-overlap)
      const batchHead = batch.slice(0, overlap)
      if (this.exportMessageSequenceEquals(collectedTail, batchHead)) {
        return [...collected, ...batch.slice(overlap).map((item) => ({ ...item }))]
      }
    }

    const merged = collected.map((item) => ({ ...item }))
    batch.forEach((item) => {
      if (!this.exportMessageEntryEquals(merged[merged.length - 1], item)) {
        merged.push({ ...item })
      }
    })
    return merged
  }

  private exportMessageSequenceEquals(
    left: DeepSeekExportMessageSnapshot[],
    right: DeepSeekExportMessageSnapshot[],
  ): boolean {
    if (left.length !== right.length) {
      return false
    }

    return left.every((item, index) => this.exportMessageEntryEquals(item, right[index]))
  }

  private exportMessageEntryEquals(
    left: DeepSeekExportMessageSnapshot | undefined,
    right: DeepSeekExportMessageSnapshot | undefined,
  ): boolean {
    if (!left || !right) {
      return false
    }

    return left.role === right.role && left.content === right.content
  }

  private mountExportSnapshot(messages: DeepSeekExportMessageSnapshot[]): void {
    this.clearExportSnapshot()

    const root = document.createElement("div")
    root.setAttribute(DEEPSEEK_EXPORT_ROOT_ATTR, "1")
    root.style.display = "none"

    messages.forEach((message) => {
      const node = document.createElement("div")
      node.setAttribute(DEEPSEEK_EXPORT_ROLE_ATTR, message.role)
      node.textContent = message.content
      root.appendChild(node)
    })

    document.body.appendChild(root)
    this.exportSnapshotRoot = root
    this.exportSnapshotActive = true
  }

  private clearExportSnapshot(): void {
    this.exportSnapshotActive = false
    const root = this.exportSnapshotRoot
    this.exportSnapshotRoot = null

    if (root?.isConnected) {
      root.remove()
    }

    document.querySelectorAll(`[${DEEPSEEK_EXPORT_ROOT_ATTR}]`).forEach((node) => {
      if (node !== root) {
        node.parentNode?.removeChild(node)
      }
    })
  }

  private async deleteConversationViaApi(
    target: ConversationDeleteTarget,
    token: string,
  ): Promise<SiteDeleteConversationResult> {
    try {
      const response = await fetch(CHAT_DELETE_API_PATH, {
        method: "POST",
        headers: this.buildDeleteHeaders(token),
        body: JSON.stringify({ chat_session_id: target.id }),
        credentials: "include",
      })

      if (!response.ok) {
        return {
          id: target.id,
          success: false,
          method: "api",
          reason: this.toDeleteApiHttpReason(response.status),
        }
      }

      const payload = await this.safeParseJson(response)
      if (this.isDeleteSuccessPayload(payload)) {
        return {
          id: target.id,
          success: true,
          method: "api",
        }
      }

      return {
        id: target.id,
        success: false,
        method: "api",
        reason: this.toDeleteApiPayloadReason(payload),
      }
    } catch {
      return {
        id: target.id,
        success: false,
        method: "api",
        reason: DEEPSEEK_DELETE_REASON.API_REQUEST_FAILED,
      }
    }
  }

  private buildDeleteHeaders(token: string): Record<string, string> {
    return {
      accept: "*/*",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-client-platform": "web",
      "x-client-locale": this.getClientLocale(),
      "x-client-timezone-offset": String(-new Date().getTimezoneOffset() * 60),
    }
  }

  private getUserToken(): string | null {
    const raw = localStorage.getItem(USER_TOKEN_STORAGE_KEY)
    if (!raw) return null

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const value = parsed.value
      if (typeof value === "string" && value.trim()) {
        return value.trim()
      }
    } catch {
      // ignore malformed token payload and fall back to raw string
    }

    const normalized = raw.trim().replace(/^"|"$/g, "")
    return normalized || null
  }

  private getClientLocale(): string {
    const lang = document.documentElement.lang || navigator.language || "en-US"
    return lang.replace(/-/g, "_")
  }

  private isDeleteSuccessPayload(payload: unknown): boolean {
    if (!payload || typeof payload !== "object") return false

    const data = payload as Record<string, unknown>
    if (data.code !== 0) return false

    const responseData = data.data
    if (!responseData || typeof responseData !== "object") {
      return true
    }

    const bizCode = (responseData as Record<string, unknown>).biz_code
    return bizCode === undefined || bizCode === 0
  }

  private toDeleteApiPayloadReason(payload: unknown): string {
    if (!payload || typeof payload !== "object") {
      return DEEPSEEK_DELETE_REASON.API_INVALID_RESPONSE
    }

    const data = payload as Record<string, unknown>
    if (typeof data.msg === "string" && data.msg.trim()) {
      return `${DEEPSEEK_DELETE_REASON.API_BUSINESS_FAILED}:${data.msg.trim()}`
    }

    const nested = data.data
    if (nested && typeof nested === "object") {
      const nestedData = nested as Record<string, unknown>
      if (typeof nestedData.biz_msg === "string" && nestedData.biz_msg.trim()) {
        return `${DEEPSEEK_DELETE_REASON.API_BUSINESS_FAILED}:${nestedData.biz_msg.trim()}`
      }
    }

    return DEEPSEEK_DELETE_REASON.API_BUSINESS_FAILED
  }

  private toDeleteApiHttpReason(status: number): string {
    switch (status) {
      case 401:
      case 403:
        return "delete_api_unauthorized"
      case 404:
        return "delete_api_not_found"
      case 429:
        return "delete_api_rate_limited"
      default:
        return `delete_api_http_${status || 0}`
    }
  }

  private async safeParseJson(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch {
      return null
    }
  }

  private scheduleHomeRefreshAfterDelete() {
    try {
      sessionStorage.setItem(DELETE_REFRESH_STORAGE_KEY, "1")
    } catch {
      // ignore storage failures and still try to redirect
    }

    window.location.replace(DEEPSEEK_HOME_URL)
  }

  private schedulePageReloadAfterDelete() {
    window.setTimeout(() => {
      window.location.reload()
    }, 0)
  }

  private consumePendingDeleteRefresh() {
    let shouldRefresh = false

    try {
      shouldRefresh = sessionStorage.getItem(DELETE_REFRESH_STORAGE_KEY) === "1"
      if (!shouldRefresh) return
      sessionStorage.removeItem(DELETE_REFRESH_STORAGE_KEY)
    } catch {
      return
    }

    const isHomePage = window.location.pathname === "/" || window.location.pathname === ""
    if (!isHomePage) {
      try {
        sessionStorage.setItem(DELETE_REFRESH_STORAGE_KEY, "1")
      } catch {
        // ignore storage failures and still try to redirect
      }
      window.location.replace(DEEPSEEK_HOME_URL)
      return
    }

    setTimeout(() => {
      window.location.reload()
    }, 0)
  }

  private findNextAssistantMarkdown(messages: Element[], currentIndex: number): Element | null {
    for (let i = currentIndex + 1; i < messages.length; i++) {
      const markdown = messages[i].querySelector(".ds-markdown")
      if (markdown) {
        return markdown
      }
    }

    return null
  }

  private extractConversationInfo(el: Element, cid?: string): ConversationInfo | null {
    const href = el.getAttribute("href") || ""
    const match = href.match(CHAT_PATH_PATTERN)
    if (!match) return null

    const id = match[1]
    const title = this.extractConversationTitle(el)
    const url = new URL(href, window.location.origin).toString()
    const isActive =
      el.getAttribute("aria-current") === "page" ||
      new URL(url).pathname === window.location.pathname ||
      id === this.getSessionId()

    return {
      id,
      cid,
      title,
      url,
      isActive,
      isPinned: this.isPinnedConversationLink(el),
    }
  }

  private isPinnedConversationLink(link: Element): boolean {
    const group = this.findConversationGroup(link)
    if (!group) return false

    const directChildren = Array.from(group.children)
    const conversationChildren = directChildren.filter((child) => this.isConversationLink(child))
    if (conversationChildren.length === 0) return false

    const firstConversation = conversationChildren[0]
    const firstConversationIndex = directChildren.indexOf(firstConversation)
    if (firstConversationIndex <= 0) return false

    const header = directChildren.find(
      (child, index) => index < firstConversationIndex && !this.isConversationLink(child),
    )
    if (!header) return false

    const hasElementChildren = header.children.length > 0
    const hasFocusRing = header.querySelector(":scope > .ds-focus-ring, .ds-focus-ring") !== null
    const hasSpan = header.querySelector(":scope > span, span") !== null

    return hasElementChildren && hasFocusRing && hasSpan
  }

  private findConversationGroup(link: Element): HTMLElement | null {
    let current = link.parentElement

    while (current && current !== document.body) {
      const directChildren = Array.from(current.children)
      const conversationChildren = directChildren.filter((child) => this.isConversationLink(child))

      if (conversationChildren.length > 0) {
        const firstConversationIndex = directChildren.indexOf(conversationChildren[0])
        const hasHeaderBeforeConversation = directChildren.some(
          (child, index) => index < firstConversationIndex && !this.isConversationLink(child),
        )

        if (hasHeaderBeforeConversation && conversationChildren.some((child) => child === link)) {
          return current
        }
      }

      current = current.parentElement
    }

    return null
  }

  private isConversationLink(element: Element): boolean {
    return element.matches(CONVERSATION_LINK_SELECTOR)
  }

  private extractConversationTitle(el: Element): string {
    const ariaLabel = el.getAttribute("aria-label")?.trim()
    if (ariaLabel) return ariaLabel

    const titleElement = this.findTitleElement(el)
    const titleText =
      (titleElement as HTMLElement | null)?.innerText?.trim() ||
      titleElement?.textContent?.trim() ||
      ""

    if (titleText) {
      return titleText.replace(/\s+/g, " ").trim()
    }

    const linkText = (el as HTMLElement).innerText?.trim() || el.textContent?.trim() || ""
    return linkText.replace(/\s+/g, " ").trim()
  }

  private findTitleElement(el: Element): Element | null {
    const directChildren = Array.from(el.children)
    const directTitleChild = directChildren.find((child) => {
      if (!(child instanceof HTMLElement)) return false
      if (child.classList.contains("ds-focus-ring")) return false
      if (child.querySelector('[role="button"], .ds-icon-button')) return false
      return !!child.innerText?.trim()
    })
    if (directTitleChild) return directTitleChild

    const candidates = el.querySelectorAll("span, p, div")
    for (const candidate of Array.from(candidates)) {
      const text =
        (candidate as HTMLElement).innerText?.trim() || candidate.textContent?.trim() || ""
      if (text) return candidate
    }

    return el
  }

  private findUserContentRoot(element: Element): Element | null {
    if (!element.matches(USER_MESSAGE_SELECTOR) && !element.closest(USER_MESSAGE_SELECTOR)) {
      return null
    }

    const message = element.matches(USER_MESSAGE_SELECTOR)
      ? element
      : (element.closest(USER_MESSAGE_SELECTOR) as Element | null)

    if (!message) return null

    const candidates = Array.from(message.children).filter((child) => {
      if (!(child instanceof HTMLElement)) return false
      if (child.matches("button, [role=button], .ds-icon-button")) return false
      return child.innerText?.trim().length
    })

    return candidates[0] || message
  }
}
