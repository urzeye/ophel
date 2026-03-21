/**
 * ChatGPT 适配器 (chatgpt.com)
 */
import { SITE_IDS } from "~constants"
import { htmlToMarkdown } from "~utils/exporter"

import {
  SiteAdapter,
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type MarkdownFixerConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type SiteDeleteConversationResult,
} from "./base"

const DEFAULT_TITLE = "ChatGPT"

const DELETE_CONFIRM_KEYWORDS = [
  "delete",
  "remove",
  "删除",
  "刪除",
  "supprimer",
  "eliminar",
  "löschen",
  "削除",
  "삭제",
  "удалить",
  "excluir",
]

const DELETE_REASON = {
  UI_FAILED: "delete_ui_failed",
  BATCH_ABORTED_AFTER_UI_FAILURE: "delete_batch_aborted_after_ui_failure",
  API_TOKEN_MISSING: "delete_api_token_missing",
  API_REQUEST_FAILED: "delete_api_request_failed",
  API_NOT_FOUND_BUT_VISIBLE: "delete_api_not_found_but_visible",
} as const

export class ChatGPTAdapter extends SiteAdapter {
  private sessionAccessToken: string | null = null
  private sessionAccessTokenExpiresAt = 0

  match(): boolean {
    return window.location.hostname.includes("chatgpt.com")
  }

  getSiteId(): string {
    return SITE_IDS.CHATGPT
  }

  getName(): string {
    return "ChatGPT"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#10a37f", secondary: "#1a7f64" }
  }

  getNewTabUrl(): string {
    return "https://chatgpt.com"
  }

  getSessionId(): string {
    const conversationMatch = window.location.pathname.match(/\/c\/([a-z0-9-]+)(?:\/|$)/i)
    if (conversationMatch?.[1]) {
      return conversationMatch[1]
    }
    return super.getSessionId()
  }

  isNewConversation(): boolean {
    const path = window.location.pathname
    return path === "/" || path === ""
  }

  /**
   * 获取当前账户标识（用于会话隔离）
   * ChatGPT 通过 localStorage._account 区分不同账户/团队
   * 值可能为 "personal" 或团队 UUID
   */
  getCurrentCid(): string | null {
    try {
      const account = localStorage.getItem("_account")
      if (account) {
        // localStorage 存储的值带双引号（如 "personal"），需要 JSON.parse
        return JSON.parse(account)
      }
    } catch {
      // 静默处理解析错误
    }
    return null
  }

  // ==================== 会话管理 ====================

  getConversationList(): ConversationInfo[] {
    // 侧边栏会话列表：#history 内的 a[data-sidebar-item]
    const items = document.querySelectorAll('#history a[data-sidebar-item="true"]') || []
    const cid = this.getCurrentCid() || undefined

    return Array.from(items)
      .map((el) => {
        const href = el.getAttribute("href") || ""
        // href 格式: /c/695df822-1e68-8331-9efb-bf1cc0e8820d
        const idMatch = href.match(/\/c\/([a-f0-9-]+)/)
        const id = idMatch ? idMatch[1] : ""
        const titleEl = el.querySelector("span")
        const title = titleEl?.textContent?.trim() || ""
        const isActive = el.hasAttribute("data-active")

        // 检测置顶：置顶的会话在 trailing 区域有额外的图标
        const trailingPair = el.querySelector(".trailing-pair")
        const trailingIcons = trailingPair?.querySelectorAll(".trailing svg") || []
        const isPinned = trailingIcons.length > 1 // 置顶会话有多个图标

        return {
          id,
          cid,
          title,
          url: id ? `https://chatgpt.com/c/${id}` : "",
          isActive,
          isPinned,
        }
      })
      .filter((c) => c.id)
  }

  getSidebarScrollContainer(): Element | null {
    // 侧边栏滚动容器 - 通过 #history 向上查找最近的 nav 元素
    const history = document.querySelector("#history")
    if (history) {
      const nav = history.closest("nav")
      if (nav) return nav
    }
    return null
  }

  getConversationObserverConfig(): ConversationObserverConfig {
    return {
      selector: '#history a[data-sidebar-item="true"]',
      shadow: false,
      extractInfo: (el) => {
        const href = el.getAttribute("href") || ""
        const idMatch = href.match(/\/c\/([a-f0-9-]+)/)
        const id = idMatch ? idMatch[1] : ""
        if (!id) return null
        const titleEl = el.querySelector("span")
        const title = titleEl?.textContent?.trim() || ""
        const isActive = el.hasAttribute("data-active")
        const cid = this.getCurrentCid() || undefined
        // 检测置顶
        const trailingPair = el.querySelector(".trailing-pair")
        const trailingIcons = trailingPair?.querySelectorAll(".trailing svg") || []
        const isPinned = trailingIcons.length > 1
        return {
          id,
          cid,
          title,
          url: `https://chatgpt.com/c/${id}`,
          isActive,
          isPinned,
        }
      },
      getTitleElement: (el) => el.querySelector("span") || el,
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    // 通过 href 属性查找侧边栏链接
    const sidebarLink = document.querySelector(
      `#history a[href="/c/${id}"], a[data-sidebar-item][href="/c/${id}"]`,
    ) as HTMLElement | null

    if (sidebarLink) {
      sidebarLink.click()
      return true
    }
    // 降级：页面刷新
    return super.navigateToConversation(id, url)
  }

  async deleteConversationOnSite(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    return this.deleteConversationOnSiteInternal(target)
  }

  async deleteConversationsOnSite(
    targets: ConversationDeleteTarget[],
  ): Promise<SiteDeleteConversationResult[]> {
    const results: SiteDeleteConversationResult[] = []
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index]
      const result = await this.deleteConversationOnSiteInternal(target)
      results.push(result)

      // Failsafe: if UI fallback failed once, stop batch to avoid cascading wrong deletions.
      if (!result.success && result.reason === DELETE_REASON.UI_FAILED) {
        for (let i = index + 1; i < targets.length; i++) {
          results.push({
            id: targets[i].id,
            success: false,
            method: "none",
            reason: DELETE_REASON.BATCH_ABORTED_AFTER_UI_FAILURE,
          })
        }
        break
      }
    }
    return results
  }

  private async deleteConversationOnSiteInternal(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    const nativeApiResult = await this.tryDeleteViaNativeApi(target.id)
    if (nativeApiResult.success) return nativeApiResult

    const uiSuccess = await this.deleteConversationViaUi(target.id)
    return {
      id: target.id,
      success: uiSuccess,
      method: uiSuccess ? "ui" : "none",
      reason: uiSuccess ? undefined : nativeApiResult.reason || DELETE_REASON.UI_FAILED,
    }
  }

  private clearSessionAccessToken() {
    this.sessionAccessToken = null
    this.sessionAccessTokenExpiresAt = 0
  }

  private async getSessionAccessToken(forceRefresh = false): Promise<string | null> {
    const now = Date.now()
    if (
      !forceRefresh &&
      this.sessionAccessToken &&
      this.sessionAccessTokenExpiresAt > now + 5 * 1000
    ) {
      return this.sessionAccessToken
    }

    try {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
      })
      if (!response.ok) {
        this.clearSessionAccessToken()
        return null
      }

      const data = (await response.json()) as Record<string, unknown>
      const tokenCandidates = [
        data?.accessToken,
        data?.access_token,
        data?.token,
        (data?.user as Record<string, unknown> | undefined)?.accessToken,
      ]
      const token =
        tokenCandidates.find((value) => typeof value === "string" && value.length > 0) || null

      if (typeof token === "string" && token.length > 0) {
        this.sessionAccessToken = token
        this.sessionAccessTokenExpiresAt = now + 5 * 60 * 1000
        return token
      }

      this.clearSessionAccessToken()
      return null
    } catch {
      this.clearSessionAccessToken()
      return null
    }
  }

  private getCookieValue(name: string): string | null {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
    if (!match) return null
    try {
      return decodeURIComponent(match[1])
    } catch {
      return match[1]
    }
  }

  private getChatgptAccountId(): string | null {
    try {
      const raw = localStorage.getItem("_account")
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (typeof parsed !== "string" || !parsed || parsed === "personal") {
        return null
      }
      return parsed
    } catch {
      return null
    }
  }

  private buildNativeDeleteHeaders(
    token: string,
    method: "PATCH" | "DELETE",
  ): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "*/*",
      authorization: `Bearer ${token}`,
    }

    if (method === "PATCH") {
      headers["content-type"] = "application/json"
    }

    const accountId = this.getChatgptAccountId()
    if (accountId) {
      headers["chatgpt-account-id"] = accountId
    }

    const deviceId = this.getCookieValue("oai-did")
    if (deviceId) {
      headers["oai-device-id"] = deviceId
    }

    const language = document.documentElement.lang || navigator.language
    if (language) {
      headers["oai-language"] = language
    }

    return headers
  }

  private async performNativeDeleteRequest(
    endpoint: string,
    token: string,
    method: "PATCH" | "DELETE" = "PATCH",
  ): Promise<Response> {
    const headers = this.buildNativeDeleteHeaders(token, method)

    return fetch(endpoint, {
      method,
      headers,
      body: method === "PATCH" ? JSON.stringify({ is_visible: false }) : undefined,
      credentials: "include",
    })
  }

  private async isConversationAlreadyGone(id: string): Promise<boolean> {
    const row = await this.findConversationRowWithRetry(id)
    return !row
  }

  private syncSidebarAfterRemoteDelete(id: string) {
    const row = this.findConversationRow(id)
    if (!row) return
    const container = row.closest("li") || row
    container.remove()
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
        return `delete_api_http_${status}`
    }
  }

  private async tryDeleteViaNativeApi(id: string): Promise<SiteDeleteConversationResult> {
    let token = await this.getSessionAccessToken()
    if (!token) {
      return {
        id,
        success: false,
        method: "none",
        reason: DELETE_REASON.API_TOKEN_MISSING,
      }
    }

    const requestWithRetry = async (
      endpoint: string,
      method: "PATCH" | "DELETE" = "PATCH",
    ): Promise<Response> => {
      let response = await this.performNativeDeleteRequest(endpoint, token, method)
      if (response.status === 401 || response.status === 403) {
        token = await this.getSessionAccessToken(true)
        if (!token) {
          this.clearSessionAccessToken()
          return response
        }
        response = await this.performNativeDeleteRequest(endpoint, token, method)
      }
      return response
    }

    const encodedId = encodeURIComponent(id)
    const endpoints = [
      `/backend-api/conversation/${encodedId}`,
      `/backend-api/conversations/${encodedId}`,
    ]

    try {
      let lastStatus: number | null = null

      for (const endpoint of endpoints) {
        let response = await requestWithRetry(endpoint, "PATCH")
        lastStatus = response.status

        if (response.ok) {
          this.syncSidebarAfterRemoteDelete(id)
          return { id, success: true, method: "api" }
        }

        if (response.status === 405) {
          response = await requestWithRetry(endpoint, "DELETE")
          lastStatus = response.status
          if (response.ok) {
            this.syncSidebarAfterRemoteDelete(id)
            return { id, success: true, method: "api" }
          }
        }

        if (response.status === 404) {
          continue
        }

        if (response.status === 401 || response.status === 403) {
          this.clearSessionAccessToken()
        }

        return {
          id,
          success: false,
          method: "api",
          reason: this.toDeleteApiHttpReason(response.status),
        }
      }

      if (lastStatus === 404 && (await this.isConversationAlreadyGone(id))) {
        this.syncSidebarAfterRemoteDelete(id)
        return { id, success: true, method: "api" }
      }

      return {
        id,
        success: false,
        method: "api",
        reason:
          lastStatus === 404
            ? DELETE_REASON.API_NOT_FOUND_BUT_VISIBLE
            : this.toDeleteApiHttpReason(lastStatus ?? 0),
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          id,
          success: false,
          method: "api",
          reason: "delete_api_timeout",
        }
      }
      return {
        id,
        success: false,
        method: "api",
        reason: DELETE_REASON.API_REQUEST_FAILED,
      }
    }
  }

  private async deleteConversationViaUi(id: string): Promise<boolean> {
    const row = await this.findConversationRowWithRetry(id)
    if (!row) return false

    const menuButton = await this.findConversationMenuButton(row, id)
    if (!menuButton) return false

    document.body.click()
    await this.sleep(50)
    this.simulateClick(menuButton)

    const deleteMenuItem = await this.waitForDeleteMenuItem(menuButton)
    if (!deleteMenuItem) return false
    this.simulateClick(deleteMenuItem)

    const confirmButton = await this.waitForDeleteConfirmButton()
    if (confirmButton) {
      this.simulateClick(confirmButton)
    }

    return this.waitForConversationRemoved(id, 4000)
  }

  private async findConversationRowWithRetry(id: string): Promise<HTMLElement | null> {
    const firstTry = this.findConversationRow(id)
    if (firstTry) return firstTry

    await this.loadAllConversations()
    await this.sleep(200)
    return this.findConversationRow(id)
  }

  private findConversationRow(id: string): HTMLElement | null {
    return document.querySelector(
      `#history a[data-sidebar-item="true"][href="/c/${id}"]`,
    ) as HTMLElement | null
  }

  private async findConversationMenuButton(
    row: HTMLElement,
    id: string,
  ): Promise<HTMLElement | null> {
    const actionSelectors = [
      'button[aria-haspopup="menu"]',
      'button[aria-label*="More"]',
      'button[aria-label*="more"]',
      'button[aria-label*="更多"]',
      'button[data-testid*="menu"]',
      ".trailing button",
    ].join(", ")

    const itemContainer = this.findConversationItemContainer(row, id)
    const rawCandidates = [
      itemContainer,
      row.closest("li"),
      row.parentElement,
      row,
    ] as Array<Element | null>
    const candidates = rawCandidates.filter(
      (node, index, all) => !!node && all.indexOf(node) === index,
    ) as HTMLElement[]

    for (let attempt = 0; attempt < 8; attempt++) {
      candidates.forEach((element) => {
        element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
        element.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
      })

      for (const candidate of candidates) {
        const button = this.findFirstInScope(candidate, actionSelectors, (el) =>
          this.isMenuButtonForConversation(el, id, itemContainer || candidate),
        )
        if (button) return button
      }
      await this.sleep(100)
    }
    return null
  }

  private findConversationItemContainer(row: HTMLElement, id: string): HTMLElement | null {
    const targetHref = `/c/${id}`
    let current: HTMLElement | null = row
    let fallback: HTMLElement | null = null

    for (let depth = 0; depth < 8 && current; depth++) {
      const links = Array.from(
        current.querySelectorAll('a[data-sidebar-item="true"][href^="/c/"]'),
      ) as HTMLAnchorElement[]
      const hasTargetLink = links.some((link) => link.getAttribute("href") === targetHref)
      if (hasTargetLink) {
        if (!fallback && links.length === 1) {
          fallback = current
        }

        const hasActionButton = !!current.querySelector(
          'button[aria-haspopup="menu"], .trailing button',
        )
        if (links.length === 1 && hasActionButton) {
          return current
        }
      }

      if (current.id === "history") break
      current = current.parentElement
    }

    return fallback || (row.closest("li") as HTMLElement | null) || row.parentElement || row
  }

  private findFirstInScope(
    scope: ParentNode,
    selector: string,
    predicate?: (element: HTMLElement) => boolean,
  ): HTMLElement | null {
    const elements = Array.from(scope.querySelectorAll(selector)) as HTMLElement[]
    for (const element of elements) {
      if (!this.isVisible(element)) continue
      if (predicate && !predicate(element)) continue
      return element
    }
    return null
  }

  private isMenuButtonForConversation(
    button: HTMLElement,
    id: string,
    container: HTMLElement,
  ): boolean {
    if (!container.contains(button)) return false

    const targetHref = `/c/${id}`
    const owner = button.closest("li")
    if (owner) {
      const ownerLinks = Array.from(
        owner.querySelectorAll('a[data-sidebar-item="true"][href^="/c/"]'),
      ) as HTMLAnchorElement[]
      if (
        ownerLinks.length === 1 &&
        ownerLinks[0].getAttribute("href") === targetHref &&
        owner.contains(container.querySelector(`a[data-sidebar-item="true"][href="${targetHref}"]`))
      ) {
        return true
      }
    }

    const linksInContainer = Array.from(
      container.querySelectorAll('a[data-sidebar-item="true"][href^="/c/"]'),
    ) as HTMLAnchorElement[]
    return linksInContainer.length === 1 && linksInContainer[0].getAttribute("href") === targetHref
  }

  private getMenuContainerFromTrigger(trigger: HTMLElement): HTMLElement | null {
    const controlledId = trigger.getAttribute("aria-controls") || trigger.getAttribute("aria-owns")
    if (controlledId) {
      const controlled = document.getElementById(controlledId)
      if (controlled) return controlled
    }

    const visibleMenus = Array.from(document.querySelectorAll('[role="menu"]')) as HTMLElement[]
    let nearest: HTMLElement | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    const triggerRect = trigger.getBoundingClientRect()
    const triggerCenterX = triggerRect.left + triggerRect.width / 2
    const triggerCenterY = triggerRect.top + triggerRect.height / 2

    for (const menu of visibleMenus) {
      if (!this.isVisible(menu)) continue
      const rect = menu.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const distance = Math.hypot(centerX - triggerCenterX, centerY - triggerCenterY)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = menu
      }
    }

    return nearest
  }

  private async waitForDeleteMenuItem(
    menuTrigger: HTMLElement,
    timeout = 2500,
  ): Promise<HTMLElement | null> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const menuScope = this.getMenuContainerFromTrigger(menuTrigger)
      const scopedMenuItems = menuScope
        ? (Array.from(
            menuScope.querySelectorAll(
              '[role="menuitem"], [data-radix-collection-item][role="menuitem"]',
            ),
          ) as HTMLElement[])
        : []
      const fallbackMenuItems = Array.from(
        document.querySelectorAll(
          '[role="menuitem"], [data-radix-collection-item][role="menuitem"]',
        ),
      ) as HTMLElement[]
      const menuItems = scopedMenuItems.length > 0 ? scopedMenuItems : fallbackMenuItems

      for (const item of menuItems) {
        if (!this.isVisible(item)) continue
        const text = (item.textContent || "").trim().toLowerCase()
        if (DELETE_CONFIRM_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()))) {
          return item
        }
      }
      await this.sleep(80)
    }
    return null
  }

  private async waitForDeleteConfirmButton(timeout = 2500): Promise<HTMLElement | null> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const buttons = Array.from(document.querySelectorAll("button")) as HTMLElement[]
      for (const button of buttons) {
        if (!this.isVisible(button)) continue
        const text = (button.textContent || "").trim().toLowerCase()
        if (DELETE_CONFIRM_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()))) {
          return button
        }
      }
      await this.sleep(80)
    }
    return null
  }

  private async waitForConversationRemoved(id: string, timeout = 3000): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (!this.findConversationRow(id)) {
        return true
      }
      await this.sleep(80)
    }
    return false
  }

  private isVisible(element: Element | null): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false
    if (!element.isConnected) return false
    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false
    }
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  getSessionName(): string | null {
    // 尝试从页面标题获取
    const title = document.title
    if (title && title !== DEFAULT_TITLE) {
      return title.replace(` | ${DEFAULT_TITLE}`, "").replace(` - ${DEFAULT_TITLE}`, "").trim()
    }
    return super.getSessionName()
  }

  getConversationTitle(): string | null {
    // 从侧边栏获取当前选中项
    const selected = document.querySelector("#history a[data-active] span")
    const title = selected?.textContent?.trim()
    if (title) return title
    return this.getSessionName()
  }

  getNewChatButtonSelectors(): string[] {
    return [
      '[data-testid="create-new-chat-button"]',
      'a[href="/"]',
      'button[aria-label="New chat"]',
      'button[aria-label="新对话"]',
    ]
  }

  getLatestReplyText(): string | null {
    // TODO: 需要分析 ChatGPT 的回复结构
    const container = document.querySelector(this.getResponseContainerSelector())
    if (!container) return null

    // ChatGPT 的回复通常在 [data-message-author-role="assistant"] 中
    const responses = container.querySelectorAll('[data-message-author-role="assistant"]')
    if (responses.length === 0) return null

    const lastResponse = responses[responses.length - 1]
    const markdownContainer =
      lastResponse.querySelector(".markdown, .prose, [class*='prose']") || lastResponse
    const clone = markdownContainer.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll('.sr-only, button, [role="button"], svg, [aria-hidden="true"]')
      .forEach((node) => node.remove())

    const markdown = htmlToMarkdown(clone).trim()
    if (markdown) {
      return markdown
    }

    return this.extractTextWithLineBreaks(clone)
  }

  // ==================== 页面宽度控制 ====================

  getWidthSelectors() {
    // ChatGPT 使用 CSS 变量 --thread-content-max-width 控制内容宽度
    // 选择器匹配带有该变量的容器
    return [
      { selector: '[class*="thread-content-max-width"]', property: "max-width" },
      { selector: '[style*="--thread-content-max-width"]', property: "max-width" },
    ]
  }

  getUserQueryWidthSelectors() {
    // ChatGPT 用户消息气泡使用 CSS 变量 --user-chat-width 控制宽度
    // 需要在 :root 级别设置变量，然后会自动应用到 .user-message-bubble-color
    return [
      {
        selector: ":root",
        property: "--user-chat-width",
        noCenter: true,
      },
    ]
  }

  getZenModeSelectors() {
    return [{ selector: "div.select-none:has(> .pointer-events-auto)", action: "hide" as const }]
  }

  getMarkdownFixerConfig(): MarkdownFixerConfig {
    return {
      selector: '[data-message-author-role="assistant"] p',
      fixSpanContent: false,
      shouldSkip: (element) => {
        if (!this.isGenerating()) return false

        // 查找当前元素所属的消息容器
        const messageContainer = element.closest('[data-message-author-role="assistant"]')
        if (!messageContainer) return false

        // 查找页面上最后一个 AI 消息容器（即正在生成的那个）
        const allMessages = document.querySelectorAll(
          this.getChatContentSelectors().find((s) => s.includes("assistant")) ||
            '[data-message-author-role="assistant"]',
        )
        const lastMessage = allMessages[allMessages.length - 1]

        // 如果当前元素位于正在生成的消息中，强制跳过（等待生成结束后通过重试机制修复）
        return messageContainer === lastMessage
      },
    }
  }

  // ==================== 输入框操作 ====================

  getTextareaSelectors(): string[] {
    return ["#prompt-textarea", 'textarea[data-id="root"]', '[contenteditable="true"]']
  }

  getSubmitButtonSelectors(): string[] {
    return [
      '[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="发送"]',
    ]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (element.offsetParent === null) return false
    if (element.closest(".gh-main-panel")) return false
    return element.id === "prompt-textarea" || element.getAttribute("contenteditable") === "true"
  }

  insertPrompt(content: string): boolean {
    // ChatGPT 使用 contenteditable div 作为输入框
    const editor = this.textarea
    if (!editor) return false

    if (!editor.isConnected) {
      this.textarea = null
      return false
    }

    editor.focus()
    if (document.activeElement !== editor && !editor.contains(document.activeElement)) {
      console.warn("[Ophel] insertPrompt: focus failed")
      return false
    }

    try {
      // 尝试使用 execCommand
      document.execCommand("selectAll", false, undefined)
      const success = document.execCommand("insertText", false, content)
      if (!success) throw new Error("execCommand returned false")
    } catch {
      // 回退：直接设置内容
      if (editor.tagName === "TEXTAREA") {
        ;(editor as HTMLTextAreaElement).value = content
      } else {
        editor.textContent = content
      }
      editor.dispatchEvent(new Event("input", { bubbles: true }))
    }
    return true
  }

  clearTextarea(): void {
    if (!this.textarea) return
    if (!this.textarea.isConnected) {
      this.textarea = null
      return
    }

    this.textarea.focus()
    if (this.textarea.tagName === "TEXTAREA") {
      ;(this.textarea as HTMLTextAreaElement).value = ""
    } else {
      document.execCommand("selectAll", false, undefined)
      document.execCommand("delete", false, undefined)
    }
    this.textarea.dispatchEvent(new Event("input", { bubbles: true }))
  }

  // ==================== 滚动容器 ====================

  getScrollContainer(): HTMLElement | null {
    // ChatGPT 聊天内容的滚动容器
    // 查找具有 scrollbar-gutter 样式的 div，或父元素带有 @container/main 的子元素
    const container = document.querySelector(
      '[class*="scrollbar-gutter"], [class*="@container/main"] > div',
    ) as HTMLElement
    if (container && container.scrollHeight > container.clientHeight) {
      return container
    }

    // 回退：查找 scrollHeight 最大的可滚动 div
    const allDivs = document.querySelectorAll("div")
    let bestContainer: HTMLElement | null = null
    let maxScrollHeight = 0
    for (const div of Array.from(allDivs)) {
      const style = getComputedStyle(div)
      if (
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        div.scrollHeight > div.clientHeight &&
        div.scrollHeight > maxScrollHeight
      ) {
        // 排除侧边栏（nav）
        if (!div.closest("nav")) {
          maxScrollHeight = div.scrollHeight
          bestContainer = div as HTMLElement
        }
      }
    }
    return bestContainer
  }

  getResponseContainerSelector(): string {
    // ChatGPT 聊天内容区域 - #thread 或 main
    return "#thread, main#main"
  }

  getChatContentSelectors(): string[] {
    return [
      '[data-message-author-role="assistant"]',
      '[data-message-author-role="user"]',
      ".markdown",
    ]
  }

  // ==================== 大纲提取 ====================

  getUserQuerySelector(): string {
    return '[data-message-author-role="user"]'
  }

  extractUserQueryText(element: Element): string {
    return this.extractTextWithLineBreaks(element)
  }

  extractUserQueryMarkdown(element: Element): string {
    // ChatGPT 用户消息通常是纯文本
    return element.textContent?.trim() || ""
  }

  /**
   * 检查元素是否应跳过（屏幕阅读器专用元素）
   * ChatGPT 使用 .sr-only 类标记屏幕阅读器辅助文本
   */
  private shouldSkipElement(element: Element): boolean {
    return element.classList.contains("sr-only")
  }

  /**
   * 覆盖基类：提取文本时过滤掉 .sr-only 元素
   */
  protected extractTextWithLineBreaks(element: Element): string {
    const result: string[] = []
    const blockTags = new Set([
      "div",
      "p",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "pre",
      "blockquote",
      "tr",
      "section",
      "article",
    ])

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || ""
        result.push(text)
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element
        const tag = el.tagName.toLowerCase()

        // 跳过 .sr-only 元素
        if (this.shouldSkipElement(el)) return

        // <br> 直接换行
        if (tag === "br") {
          result.push("\n")
          return
        }

        // 遍历子节点
        for (const child of el.childNodes) {
          walk(child)
        }

        // 块级元素结束后加换行
        if (blockTags.has(tag) && result.length > 0) {
          const lastChar = result[result.length - 1]
          if (!lastChar.endsWith("\n")) {
            result.push("\n")
          }
        }
      }
    }

    walk(element)
    return result
      .join("")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    // ChatGPT 用户消息结构：
    // .user-message-bubble-color > .whitespace-pre-wrap (原文本)
    const textContainer = element.querySelector(".whitespace-pre-wrap")
    if (!textContainer) return false

    // 检查是否已经处理过
    if (textContainer.nextElementSibling?.classList.contains("gh-user-query-markdown")) {
      return false
    }

    // 隐藏原内容
    ;(textContainer as HTMLElement).style.display = "none"

    // 创建渲染容器
    const rendered = document.createElement("div")
    rendered.className = "gh-user-query-markdown gh-markdown-preview"
    rendered.innerHTML = html

    // 插入到原容器后面
    textContainer.after(rendered)
    return true
  }

  getExportConfig(): ExportConfig {
    return {
      userQuerySelector: '[data-message-author-role="user"]',
      assistantResponseSelector: '[data-message-author-role="assistant"]',
      turnSelector: '[data-testid^="conversation-turn"]',
      useShadowDOM: false,
    }
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const outline: OutlineItem[] = []
    const container = document.querySelector(this.getResponseContainerSelector())
    if (!container) return outline

    // 辅助函数：查找最近的消息容器并获取 message-id
    const getMessageId = (el: Element): string | null => {
      const msgContainer = el.closest("[data-message-id]")
      if (msgContainer) {
        return msgContainer.getAttribute("data-message-id")
      }
      return null
    }

    // 辅助函数：生成标题的稳定 ID
    // 格式: msgId::h2-标题文本-0
    // 需要在遍历过程中维护计数器
    const messageHeaderCounts: Record<string, Record<string, number>> = {}
    const generateHeaderId = (msgId: string, tagName: string, text: string): string => {
      if (!messageHeaderCounts[msgId]) {
        messageHeaderCounts[msgId] = {}
      }

      const key = `${tagName}-${text}`
      const count = messageHeaderCounts[msgId][key] || 0
      messageHeaderCounts[msgId][key] = count + 1
      return `${msgId}::${key}::${count}`
    }

    // container 参数用于处理最后一个元素（没有 nextEl 时）
    // isUserQuery 参数用于用户提问的特殊处理（直接获取 AI 回复内容，跳过标签）
    const calculateWordCount = (
      startEl: Element,
      nextEl: Element | null,
      isUserQueryItem: boolean,
    ): number => {
      if (!startEl) return 0
      try {
        // 对于用户提问，直接获取后续 AI 回复的 markdown 内容
        // 这样可以跳过 "ChatGPT 说：" 等标签
        if (isUserQueryItem) {
          // 查找 startEl 与 nextEl 之间的所有 AI 回复内容容器
          const allAssistants = container.querySelectorAll('[data-message-author-role="assistant"]')
          let totalText = ""

          for (const assistant of Array.from(allAssistants)) {
            // 检查这个 AI 回复是否在 startEl 之后
            const positionToStart = startEl.compareDocumentPosition(assistant)
            const isAfterStart = positionToStart & Node.DOCUMENT_POSITION_FOLLOWING

            if (!isAfterStart) continue

            // 检查是否在 nextEl 之前（如果有 nextEl）
            if (nextEl) {
              const positionToEnd = nextEl.compareDocumentPosition(assistant)
              const isBeforeEnd = positionToEnd & Node.DOCUMENT_POSITION_PRECEDING
              if (!isBeforeEnd) continue
            }

            // 获取 markdown 内容容器
            const markdownContent = assistant.querySelector(".markdown, .prose, [class*='prose']")
            if (markdownContent) {
              totalText += markdownContent.textContent || ""
            } else {
              // 回退：获取整个 assistant 的文本，但排除可能的标题
              const clone = assistant.cloneNode(true) as Element
              // 移除可能的发言人标签
              const srOnly = clone.querySelectorAll(".sr-only, [class*='sr-only']")
              srOnly.forEach((el) => el.remove())
              totalText += clone.textContent || ""
            }
          }

          const text = totalText.trim()
          return text.length
        }

        // 对于标题（Heading），使用 Range 方式
        // 当 nextEl 存在时，直接使用基类方法
        if (nextEl) {
          return this.calculateRangeWordCount(startEl, nextEl, container)
        }

        // 如果没有下一个边界元素，需要找到正确的终点
        // 策略：从 startEl 在 DOM 中向后遍历，找到下一个用户提问元素
        const allUserQueries = container.querySelectorAll(userQuerySelector)
        let foundCurrent = false
        let nextUserQuery: Element | null = null

        for (const uq of Array.from(allUserQueries)) {
          if (foundCurrent) {
            nextUserQuery = uq
            break
          }
          if (uq === startEl || uq.contains(startEl) || startEl.contains(uq)) {
            foundCurrent = true
          }
        }

        if (nextUserQuery) {
          // 找到了下一个用户提问，使用它作为边界
          return this.calculateRangeWordCount(startEl, nextUserQuery, container)
        }

        // 真正的最后一个用户提问，找对应的 AI 回复容器末尾
        const allAssistants = container.querySelectorAll('[data-message-author-role="assistant"]')
        if (allAssistants.length > 0) {
          const lastAssistant = allAssistants[allAssistants.length - 1]
          return this.calculateRangeWordCount(startEl, null, lastAssistant)
        }
        return this.calculateRangeWordCount(startEl, null, container)
      } catch {
        return 0
      }
    }

    // 统一处理逻辑：按照文档顺序收集所有相关元素（UserQuery 和 Headings）
    const userQuerySelector = this.getUserQuerySelector()
    const headingSelectors: string[] = []
    for (let i = 1; i <= maxLevel; i++) {
      headingSelectors.push(`h${i}`)
    }

    const combinedSelector = `${userQuerySelector}, ${headingSelectors.join(", ")}`
    // 获取所有潜在的节点（按文档顺序）
    const allElements = Array.from(container.querySelectorAll(combinedSelector))

    allElements.forEach((element, index) => {
      const tagName = element.tagName.toLowerCase()
      const isUserQuery = element.matches(userQuerySelector)
      const isHeading = /^h[1-6]$/.test(tagName)

      // 决定是否收集到大纲中
      let shouldCollect = false
      if (includeUserQueries && isUserQuery) shouldCollect = true
      if (isHeading) {
        // 过滤不可见/无效 heading
        if (!this.shouldSkipElement(element) && !this.isInRenderedMarkdownContainer(element)) {
          const level = parseInt(tagName.charAt(1), 10)
          if (level <= maxLevel) shouldCollect = true
        }
      }

      if (shouldCollect) {
        let item: OutlineItem

        if (isUserQuery) {
          let queryText = this.extractUserQueryText(element)
          let isTruncated = false
          if (queryText.length > 200) {
            queryText = queryText.substring(0, 200)
            isTruncated = true
          }
          item = {
            level: 0,
            text: queryText,
            element,
            isUserQuery: true,
            isTruncated,
          }
        } else {
          // Heading
          const level = parseInt(tagName.charAt(1), 10)
          item = {
            level,
            text: element.textContent?.trim() || "",
            element,
            isUserQuery: false,
          }
        }

        // 添加 ID
        const msgId = getMessageId(element)
        if (msgId) {
          if (isUserQuery) {
            item.id = msgId
          } else {
            item.id = generateHeaderId(msgId, tagName, item.text)
          }
        }

        // --- 字数统计逻辑 ---
        if (showWordCount) {
          // 重新寻找结束节点 (End Node)
          let nextBoundaryEl: Element | null = null

          // 从当前位置向后找
          for (let i = index + 1; i < allElements.length; i++) {
            const candidate = allElements[i]
            const candidateIsUserQuery = candidate.matches(userQuerySelector)

            if (candidateIsUserQuery) {
              // 遇到用户提问，绝对边界（对话结束）
              nextBoundaryEl = candidate
              break
            }

            const candidateTagName = candidate.tagName.toLowerCase()
            if (/^h[1-6]$/.test(candidateTagName)) {
              const candidateLevel = parseInt(candidateTagName.charAt(1), 10)
              // 如果是同级或更高级 (Level 数值更小或相等)，则是边界
              if (candidateLevel <= item.level) {
                nextBoundaryEl = candidate
                break
              }
            }
          }

          // 计算
          item.wordCount = calculateWordCount(element, nextBoundaryEl, isUserQuery)
        }

        outline.push(item)
      }
    })

    return outline
  }

  // ==================== 生成状态检测 ====================

  isGenerating(): boolean {
    // ChatGPT 生成时会显示 stop 按钮
    const stopBtn = document.querySelector('[data-testid="stop-button"]')
    return stopBtn !== null && (stopBtn as HTMLElement).offsetParent !== null
  }

  getModelName(): string | null {
    // 从模型选择器按钮获取
    const modelBtn = document.querySelector('[data-testid="model-switcher-dropdown-button"]')
    if (modelBtn) {
      // 优先从 aria-label 提取（格式："模型选择器，当前模型为 5.2"）
      const ariaLabel = modelBtn.getAttribute("aria-label")
      if (ariaLabel) {
        const match = ariaLabel.match(/(?:模型为|model is)\s*(.+)/i)
        if (match) return match[1].trim()
      }
      // 回退：获取内部文本
      const versionSpan = modelBtn.querySelector(".text-token-text-tertiary")
      if (versionSpan) return versionSpan.textContent?.trim() || null
      return modelBtn.textContent?.trim() || null
    }
    // 回退：从最新消息的 data-message-model-slug 获取
    const lastMsg = document.querySelector("[data-message-model-slug]")
    if (lastMsg) {
      return lastMsg.getAttribute("data-message-model-slug")
    }
    return null
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
    return {
      urlPatterns: ["conversation", "backend-api"],
      silenceThreshold: 3000,
    }
  }

  // ==================== 模型锁定 ====================

  getDefaultLockSettings(): { enabled: boolean; keyword: string } {
    return { enabled: false, keyword: "" }
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: [
        '[data-testid="model-switcher-dropdown-button"]',
        '[aria-haspopup="menu"][aria-label*="模型"]',
        '[aria-haspopup="menu"][aria-label*="model"]',
      ],
      // ChatGPT 使用 Radix UI，菜单项带有 data-radix-collection-item 属性
      menuItemSelector:
        '[data-radix-collection-item][role="menuitem"], [role="menuitem"], [role="option"]',
      checkInterval: 1000,
      maxAttempts: 15,
      menuRenderDelay: 500, // ChatGPT 菜单渲染较慢，增加延迟
      // 语言无关：通过 aria-haspopup 检测子菜单触发器
      subMenuSelector: '[aria-haspopup="menu"]',
      // 文字备选（多语言）
      subMenuTriggers: ["传统", "legacy", "more"],
    }
  }

  /**
   * 覆盖点击模拟方法
   * ChatGPT 使用 Radix UI，需要完整的 PointerEvent 序列才能触发菜单
   */
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

  // ==================== 主题切换 ====================

  /**
   * 切换 ChatGPT 主题
   * 直接修改 localStorage.theme + html.className 实现即时无感切换
   * @param targetMode 目标主题模式
   */
  async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
    try {
      // 1. 修改 localStorage 持久化主题设置
      // ChatGPT 使用 "theme" 键存储主题，值为 "dark" / "light" / "system"
      localStorage.setItem("theme", targetMode)

      // 2. 直接修改 html.className 实现即时视觉变化
      // ChatGPT 通过 html 元素的 class 控制主题：class="dark" 或 class="light"
      document.documentElement.className = targetMode

      // 3. 触发 storage 事件，通知其他可能监听的组件
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "theme",
          newValue: targetMode,
          storageArea: localStorage,
        }),
      )

      return true
    } catch (error) {
      console.error("[ChatGPTAdapter] toggleTheme error:", error)
      return false
    }
  }
}
