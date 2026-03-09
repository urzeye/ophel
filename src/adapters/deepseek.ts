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

import {
  SiteAdapter,
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
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
const ASSISTANT_MARKDOWN_SELECTOR = ".ds-message:has(.ds-markdown) .ds-markdown"
const USER_MESSAGE_SELECTOR = ".ds-message:not(:has(.ds-markdown))"
const RESPONSE_CONTAINER_SELECTOR =
  'main .ds-scroll-area:has(.ds-message), [role="main"] .ds-scroll-area:has(.ds-message), .ds-scroll-area:has(.ds-message)'
const CHAT_COMPLETION_API_PATTERN = "/api/v0/chat/completion"
const CHAT_DELETE_API_PATH = "/api/v0/chat_session/delete"
const DEEPSEEK_HOME_URL = "https://chat.deepseek.com/"
const DELETE_REFRESH_STORAGE_KEY = "gh.deepseek.delete.refresh"
const STOP_ICON_PATH_PREFIX = "M2 4.88"
const SEND_ICON_PATH =
  "M8.3125 0.981587C8.66767 1.0545 8.97902 1.20558 9.2627 1.43374C9.48724 1.61438 9.73029 1.85933 9.97949 2.10854L14.707 6.83608L13.293 8.25014L9 3.95717V15.0431H7V3.95717L2.70703 8.25014L1.29297 6.83608L6.02051 2.10854C6.26971 1.85933 6.51277 1.61438 6.7373 1.43374C6.97662 1.24126 7.28445 1.04542 7.6875 0.981587C7.8973 0.94841 8.1031 0.956564 8.3125 0.981587Z"

const DEEPSEEK_DELETE_REASON = {
  MISSING_AUTH_TOKEN: "delete_api_missing_auth_token",
  API_REQUEST_FAILED: "delete_api_request_failed",
  API_INVALID_RESPONSE: "delete_api_invalid_response",
  API_BUSINESS_FAILED: "delete_api_business_failed",
} as const

export class DeepSeekAdapter extends SiteAdapter {
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
    if (result.success && target.id === currentSessionId) {
      this.scheduleHomeRefreshAfterDelete()
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

    for (const target of targets) {
      const result = await this.deleteConversationViaApi(target, token)
      results.push(result)
      if (result.success && target.id === currentSessionId) {
        deletedCurrentSession = true
      }
    }

    if (deletedCurrentSession) {
      this.scheduleHomeRefreshAfterDelete()
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
    const firstMessage = document.querySelector(MESSAGE_SELECTOR)
    if (firstMessage) {
      const scrollArea = firstMessage.closest(".ds-scroll-area") as HTMLElement | null
      if (scrollArea && scrollArea.scrollHeight > scrollArea.clientHeight) {
        return scrollArea
      }
    }

    let best: HTMLElement | null = null
    let bestScore = -1
    const candidates = document.querySelectorAll(".ds-scroll-area")

    candidates.forEach((candidate) => {
      const el = candidate as HTMLElement
      if (el.querySelector(CONVERSATION_LINK_SELECTOR)) return
      if (el.querySelector("textarea")) return

      const messageCount = el.querySelectorAll(MESSAGE_SELECTOR).length
      if (messageCount === 0) return

      const score = messageCount * 100000 + el.scrollHeight
      if (score > bestScore) {
        best = el
        bestScore = score
      }
    })

    return best || super.getScrollContainer()
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
    const markdown = element.matches(".ds-markdown")
      ? element
      : element.querySelector(".ds-markdown")
    return markdown ? this.extractTextWithLineBreaks(markdown).trim() : ""
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const container =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    if (!container) return []

    const outline: OutlineItem[] = []
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

        outline.push({
          level: 0,
          text: text.length > 80 ? `${text.slice(0, 80)}...` : text,
          element: message as HTMLElement,
          isUserQuery: true,
          isTruncated: text.length > 80,
          wordCount,
        })
        return
      }

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
          element: heading as HTMLElement,
          wordCount,
        })
      })
    })

    return outline
  }

  getExportConfig(): ExportConfig {
    return {
      userQuerySelector: USER_MESSAGE_SELECTOR,
      assistantResponseSelector: ASSISTANT_MARKDOWN_SELECTOR,
      turnSelector: null,
      useShadowDOM: false,
    }
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

      document.documentElement.classList.toggle("dark", targetMode === "dark")
      document.documentElement.classList.toggle("light", targetMode === "light")
      document.documentElement.setAttribute("data-theme", targetMode)

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
