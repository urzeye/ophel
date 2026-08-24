/**
 * ChatGPT 适配器 (chatgpt.com)
 */
import { SITE_IDS } from "~constants"
import { chatgptNativeThemeCss } from "~styles/native-theme-adapters/chatgpt"
import {
  createExportAssetCollector,
  escapeMarkdownLinkText,
  formatExportFileAttachments,
  formatExportImageMarkdown,
  isDownloadableExportAssetUrl,
  normalizeExportAssetUrl,
  type ExportAssetCollector,
} from "~utils/export-assets"
import { htmlToMarkdown, type ExportBundle } from "~utils/exporter"
import { hashTextForCache } from "~utils/text-hash"

import {
  SiteAdapter,
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportCollectionReport,
  type ExportConfig,
  type ExportLifecycleContext,
  type MarkdownFixerConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type PanelAvoidanceConfig,
  type SiteDeleteConversationResult,
  type ZenModeConfig,
} from "./base"
import type { BuiltinSiteConfig } from "./declarative"
import { CHATGPT_CONFIG, CHATGPT_CONFIG_VERSION, type ChatGPTSiteConfig } from "./chatgpt-config"

const DEFAULT_TITLE = "ChatGPT"

// Firefox insertText 修复：把纯文本按行转为 ProseMirror 可解析的段落 HTML
const escapeHtmlForInsert = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const buildParagraphHtml = (content: string): string =>
  content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => `<p>${line === "" ? "<br>" : escapeHtmlForInsert(line)}</p>`)
    .join("")

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

const KNOWN_LANGUAGES = new Set([
  "yaml",
  "yml",
  "json",
  "js",
  "javascript",
  "ts",
  "typescript",
  "py",
  "python",
  "bash",
  "sh",
  "shell",
  "html",
  "css",
  "sql",
  "cpp",
  "c++",
  "c",
  "cs",
  "csharp",
  "java",
  "go",
  "rust",
  "php",
  "rb",
  "ruby",
  "pl",
  "perl",
  "swift",
  "kotlin",
  "scala",
  "xml",
  "md",
  "markdown",
  "diff",
  "dockerfile",
  "ini",
  "toml",
  "powershell",
  "ps1",
  "r",
  "dart",
  "groovy",
  "haskell",
  "lua",
  "objectivec",
  "objc",
  "ocaml",
  "tex",
  "latex",
  "vhdl",
  "verilog",
  "wasm",
])

const CHATGPT_MODEL_LOCK_REENTRY_COOLDOWN_MS = 1_200

// ==================== 导出快照 ====================
// ChatGPT 长会话采用虚拟滚动：滚出视口的消息内容会被卸载，
// 只剩 [data-turn-id-container] 占位符。直接 querySelectorAll 会漏掉这些消息，
// 导致导出内容缺失；而某些情况下旧版本/重生成的消息节点仍残留在 DOM 中，
// 不去重又会让同一条消息出现多次。
// 解决方案：导出前滚动遍历整个会话，按 message-id 去重收集快照，
// 挂载到隐藏 DOM 后切换 ExportConfig 指向快照节点。

const CHATGPT_EXPORT_ROOT_ATTR = "data-gh-chatgpt-export-root"
const CHATGPT_EXPORT_TURN_ATTR = "data-gh-chatgpt-export-turn"
const CHATGPT_EXPORT_ROLE_ATTR = "data-gh-chatgpt-export-role"
const CHATGPT_EXPORT_ROLE_USER = "user"
const CHATGPT_EXPORT_ROLE_ASSISTANT = "assistant"
const CHATGPT_EXPORT_TURN_SELECTOR = `[${CHATGPT_EXPORT_ROOT_ATTR}="1"] [${CHATGPT_EXPORT_TURN_ATTR}="1"]`
const CHATGPT_EXPORT_USER_SELECTOR = `[${CHATGPT_EXPORT_ROOT_ATTR}="1"] [${CHATGPT_EXPORT_ROLE_ATTR}="${CHATGPT_EXPORT_ROLE_USER}"]`
const CHATGPT_EXPORT_ASSISTANT_SELECTOR = `[${CHATGPT_EXPORT_ROOT_ATTR}="1"] [${CHATGPT_EXPORT_ROLE_ATTR}="${CHATGPT_EXPORT_ROLE_ASSISTANT}"]`
const CHATGPT_NATIVE_TOC_ID_PREFIX = "chatgpt-native-user-query::"
const CHATGPT_NATIVE_TOC_ID_RE = /^chatgpt-native-user-query::(\d+)::/
const CHATGPT_NATIVE_TOC_PROMPT_LABEL_RE = /^Prompt\s+\d+$/i

interface ChatGPTExportMessageSnapshot {
  role: "user" | "assistant"
  /** 去重键：优先用 turnId */
  turnKey: string
  /**
   * 排序键：优先用 ChatGPT 自带的 `data-testid="conversation-turn-N"` 的 N
   * （全局单调、虚拟滚动期间也不变）；缺失时为 Number.MAX_SAFE_INTEGER，
   * 由 collect 阶段的 first-seen 兜底计数器二次排序。
   */
  order: number
  content: string
}

interface ChatGPTOutlineCacheEntry {
  id: string
  level: number
  text: string
  turnId: string | null
  /** turn 在本次会话内首次出现的全局序号（单调递增） */
  firstSeenTurnIndex: number
  orderInTurn: number
  isUserQuery?: boolean
  isTruncated?: boolean
  wordCount?: number
}

interface ChatGPTTurnAnchor {
  element: Element
  index: number
}

interface ChatGPTNativeTocEntry {
  index: number
  text: string
  button: HTMLElement
  element: Element | null
  isActive: boolean
}

interface ChatGPTOutlineSortEntry {
  item: OutlineItem
  order: number
}

interface ChatGPTOutlineWordCountCacheEntry {
  signature: string
  count: number
}

export class ChatGPTAdapter extends SiteAdapter {
  private config: ChatGPTSiteConfig = CHATGPT_CONFIG
  private sessionAccessToken: string | null = null
  private sessionAccessTokenExpiresAt = 0
  private lastModelLockAttemptAt = 0
  private lastModelLockAttemptKeyword = ""
  private cachedModelDisplayNamesBySlug = new Map<string, string>()
  // 菜单打开时读到的当前选中模型 slug，菜单关闭后仍可用于本地化匹配（如 "think" vs "思考"）
  // 绑定 contextKey，切换对话/账号后自动失效；新对话页路径始终为 "/" 无法区分会话，額外用 TTL 兼容
  private lastKnownModelSlug: string | null = null
  private lastKnownModelSlugContextKey = ""
  private lastKnownModelSlugObservedAt = 0
  private outlineCacheSessionKey = ""
  private outlineItemCache = new Map<string, ChatGPTOutlineCacheEntry>()
  // turn 首次出现的 DOM 顺序，用于 turn-shell 被完全卸载后仍能维持稳定排序
  private outlineTurnFirstSeenIndex = new Map<string, number>()
  private outlineTurnFirstSeenCounter = 0
  // SPA 切换会话后的过渡期截止时刻：在此之前 extractOutline 不写 cache 也不
  // merge cache，避免把上一个会话残留的 DOM 内容污染到新会话的 cache 里。
  private outlineCacheTransitionEndAt = 0
  private nativeTocTextCache: string[] = []
  private nativeTocButtonElementSignatureCache = ""
  private nativeTocRevealAttemptedSignature = ""
  private nativeTocRefreshScheduled = false
  private nativeTocButtonElementIds = new WeakMap<HTMLElement, number>()
  private nativeTocButtonElementIdCounter = 0
  private outlineWordCountCache = new WeakMap<Element, ChatGPTOutlineWordCountCacheEntry>()

  // 导出快照（参考 deepseek / aistudio 方案）：避免虚拟滚动导致漏抓或重复抓取
  private exportSnapshotRoot: HTMLElement | null = null
  private exportSnapshotActive = false
  private exportBundle: ExportBundle | null = null
  // 导出采集完整性报告（通过 getExportCollectionReport 暴露给 manager）
  private exportCollectionReport: ExportCollectionReport | null = null
  // turnKey 内容兜底的唯一后缀：避免无 turnId 且内容前缀相同的 turn 在去重 Map 中互相覆盖
  private exportTurnFallbackIds = new WeakMap<HTMLElement, number>()
  private exportTurnFallbackIdCounter = 0

  match(): boolean {
    return window.location.hostname.includes("chatgpt.com")
  }

  getSiteId(): string {
    return SITE_IDS.CHATGPT
  }

  getName(): string {
    return "ChatGPT"
  }

  getBuiltinConfig(): ChatGPTSiteConfig {
    return CHATGPT_CONFIG
  }

  getBuiltinConfigVersion(): number {
    return CHATGPT_CONFIG_VERSION
  }

  applyMergedConfig(config: BuiltinSiteConfig): void {
    this.config = config as ChatGPTSiteConfig
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#10a37f", secondary: "#1a7f64" }
  }

  getNativeThemeCss(): string | null {
    return chatgptNativeThemeCss
  }

  getQuickQuoteSupportMode() {
    return this.config.quickQuote
  }

  getNativeQuotePopoverSelectors(): string[] {
    return [...this.config.sitePrivateSelectors.nativeQuotePopover]
  }

  supportsHostThemeSync(): boolean {
    return this.config.supportsHostThemeSync
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

  isSharePage(): boolean {
    // 自有会话：/c/ID    分享会话：/share/e/ID
    return window.location.pathname.startsWith("/share/")
  }

  isUserConversationPage(): boolean {
    return !this.isSharePage() && /^\/c\/[a-z0-9-]+(?:\/|$)/i.test(window.location.pathname)
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

  private getChatGPTConversationLinks(): HTMLAnchorElement[] {
    return Array.from(document.querySelectorAll(this.config.conversation.itemSelector)).filter(
      (el): el is HTMLAnchorElement =>
        el.tagName.toLowerCase() === "a" && Boolean(this.getChatGPTConversationId(el)),
    )
  }

  private getChatGPTConversationId(el: Element): string | null {
    const href = el.getAttribute(this.config.conversation.idFrom.attr ?? "href") || ""
    return href.match(new RegExp(this.config.conversation.idFrom.regex, "i"))?.[1] || null
  }

  private getChatGPTConversationPath(id: string): string {
    return this.config.conversation.urlTemplate.replace("{id}", id)
  }

  private getChatGPTConversationTitleElement(el: Element): Element | null {
    const primarySelector = this.config.conversation.titleSelector
    if (primarySelector) {
      const primary = el.querySelector(primarySelector)
      if (primary) return primary
    }

    for (const selector of this.config.sitePrivateSelectors.conversationTitleFallback) {
      const fallback = el.querySelector(selector)
      if (fallback) return fallback
    }

    return null
  }

  private extractConversationInfoFromLink(el: Element, cid?: string): ConversationInfo | null {
    const id = this.getChatGPTConversationId(el)
    if (!id) return null

    const titleEl = this.getChatGPTConversationTitleElement(el)
    const title = titleEl?.textContent?.trim() || ""
    const isActive = this.config.conversation.activeMatch
      ? el.matches(this.config.conversation.activeMatch)
      : false
    const path = this.getChatGPTConversationPath(id)

    return {
      id,
      cid,
      title,
      url: new URL(path, this.getNewTabUrl()).href,
      isActive,
      isPinned: this.isChatGPTConversationPinned(el),
    }
  }

  private isChatGPTConversationPinned(el: Element): boolean {
    const privateSelectors = this.config.sitePrivateSelectors
    const historySelector = this.config.selectors.sidebarScrollContainer
    const history = historySelector ? document.querySelector(historySelector) : null
    if (history && !history.contains(el)) {
      return true
    }

    // 旧版 ChatGPT：置顶项仍在 #history 内，但 trailing 区域会多一个置顶图标。
    const trailingPair = el.querySelector(privateSelectors.conversationPinnedTrailingPair)
    const trailingIcons =
      trailingPair?.querySelectorAll(privateSelectors.conversationPinnedTrailingIcon) || []
    return trailingIcons.length > 1
  }

  getConversationList(): ConversationInfo[] {
    const cid = this.getCurrentCid() || undefined
    const seenIds = new Set<string>()
    const conversations: ConversationInfo[] = []

    this.getChatGPTConversationLinks().forEach((el) => {
      const info = this.extractConversationInfoFromLink(el, cid)
      if (!info || seenIds.has(info.id)) return
      seenIds.add(info.id)
      conversations.push(info)
    })

    return conversations
  }

  getSidebarScrollContainer(): Element | null {
    // 侧边栏滚动容器 - 通过 #history 向上查找最近的 nav 元素
    const historySelector = this.config.selectors.sidebarScrollContainer
    const history = historySelector ? document.querySelector(historySelector) : null
    if (history) {
      const nav = history.closest("nav")
      if (nav) return nav
    }
    const conversationLink = this.getChatGPTConversationLinks()[0]
    const nav = conversationLink?.closest("nav")
    if (nav) return nav
    return null
  }

  getConversationObserverConfig(): ConversationObserverConfig {
    return {
      selector: this.config.conversation.itemSelector,
      shadow: this.config.conversation.shadow ?? false,
      extractInfo: (el) => {
        const cid = this.getCurrentCid() || undefined
        return this.extractConversationInfoFromLink(el, cid)
      },
      getTitleElement: (el) => this.getChatGPTConversationTitleElement(el) || el,
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    // 通过 href 属性查找侧边栏链接
    const sidebarLink = this.findConversationRow(id)

    if (sidebarLink && this.config.conversation.navigationStrategy === "click-item") {
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
    // 新版侧边栏的 href 可能是绝对 URL（https://chatgpt.com/c/...），
    // 统一按会话 ID 匹配，兼容相对与绝对两种写法。
    return (
      this.getChatGPTConversationLinks().find(
        (link) => this.getChatGPTConversationId(link) === id,
      ) || null
    )
  }

  private async findConversationMenuButton(
    row: HTMLElement,
    id: string,
  ): Promise<HTMLElement | null> {
    const actionSelectors = this.config.sitePrivateSelectors.conversationActionButton

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
    let current: HTMLElement | null = row
    let fallback: HTMLElement | null = null

    for (let depth = 0; depth < 8 && current; depth++) {
      const links = Array.from(
        current.querySelectorAll(this.config.conversation.itemSelector),
      ) as HTMLAnchorElement[]
      const hasTargetLink = links.some((link) => this.getChatGPTConversationId(link) === id)
      if (hasTargetLink) {
        if (!fallback && links.length === 1) {
          fallback = current
        }

        const hasActionButton = !!current.querySelector(
          this.config.sitePrivateSelectors.conversationActionIndicator,
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

    const owner = button.closest("li")
    if (owner) {
      const ownerLinks = Array.from(
        owner.querySelectorAll(this.config.conversation.itemSelector),
      ) as HTMLAnchorElement[]
      if (
        ownerLinks.length === 1 &&
        this.getChatGPTConversationId(ownerLinks[0]) === id &&
        owner.contains(this.findConversationRow(id))
      ) {
        return true
      }
    }

    const linksInContainer = Array.from(
      container.querySelectorAll(this.config.conversation.itemSelector),
    ) as HTMLAnchorElement[]
    return (
      linksInContainer.length === 1 && this.getChatGPTConversationId(linksInContainer[0]) === id
    )
  }

  private getMenuContainerFromTrigger(trigger: HTMLElement): HTMLElement | null {
    const controlledId = trigger.getAttribute("aria-controls") || trigger.getAttribute("aria-owns")
    if (controlledId) {
      const controlled = document.getElementById(controlledId)
      if (controlled) return controlled
    }

    const visibleMenus = Array.from(
      document.querySelectorAll(this.config.sitePrivateSelectors.conversationMenu),
    ) as HTMLElement[]
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
            menuScope.querySelectorAll(this.config.sitePrivateSelectors.conversationMenuItem),
          ) as HTMLElement[])
        : []
      const fallbackMenuItems = Array.from(
        document.querySelectorAll(this.config.sitePrivateSelectors.conversationMenuItem),
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
    const title = this.getDocumentConversationTitle(DEFAULT_TITLE)
    if (title && title !== DEFAULT_TITLE) {
      return title.replace(` | ${DEFAULT_TITLE}`, "").replace(` - ${DEFAULT_TITLE}`, "").trim()
    }
    return super.getSessionName()
  }

  getConversationTitle(): string | null {
    // 从侧边栏获取当前选中项
    const activeMatch = this.config.conversation.activeMatch
    const selected = activeMatch
      ? this.getChatGPTConversationLinks().find((link) => link.matches(activeMatch))
      : undefined
    const title = selected
      ? this.getChatGPTConversationTitleElement(selected)?.textContent?.trim()
      : null
    if (title) return title
    return this.getSessionName()
  }

  getNewChatButtonSelectors(): string[] {
    return [...this.config.selectors.newChatButton]
  }

  getLatestReplyText(): string | null {
    const container = document.querySelector(this.getResponseContainerSelector())
    if (!container) return null

    // ChatGPT 的回复通常在 [data-message-author-role="assistant"] 中
    const responses = container.querySelectorAll(this.config.selectors.assistantResponse)
    if (responses.length === 0) return null

    const lastResponse = responses[responses.length - 1]
    const markdownContainer =
      lastResponse.querySelector(this.config.sitePrivateSelectors.assistantMarkdown) || lastResponse
    const clone = markdownContainer.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.exportCleanup)
      .forEach((node) => node.remove())

    const markdown = htmlToMarkdown(clone).trim()
    if (markdown) {
      return markdown
    }

    return this.extractTextWithLineBreaks(clone)
  }

  // ==================== 页面宽度控制 ====================

  getWidthSelectors() {
    return this.config.widthSelectors.map((selector) => ({ ...selector }))
  }

  getUserQueryWidthSelectors() {
    // ChatGPT 用户消息气泡使用 CSS 变量 --user-chat-width 控制宽度
    // 需要在 :root 级别设置变量，然后会自动应用到 .user-message-bubble-color
    return [
      {
        selector: this.config.sitePrivateSelectors.userQueryWidthRoot,
        property: "--user-chat-width",
        noCenter: true,
      },
    ]
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    const privateSelectors = this.config.sitePrivateSelectors
    return {
      scopeSelector: privateSelectors.panelScope,
      obstacleSelectors: [...privateSelectors.panelObstacle],
      widthSelectors: [
        {
          selector: privateSelectors.panelThreadContentWidth,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.panelThreadLegacyWidth,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.panelComposerFormWidth,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.panelLibraryComposerFormWidth,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
      ],
      insetSelectors: [
        {
          selector: privateSelectors.panelNewChatHeadingInset,
          insetMode: "edge",
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.panelThreadInset,
          insetMode: "edge",
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.panelCanvasDialogInset,
          applySide: "right",
          insetMode: "edge",
          extraCss: "box-sizing: border-box !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.panelLibraryShellInset,
          insetMode: "edge",
          extraCss: "box-sizing: border-box !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.panelLibraryComposerWrapperInset,
          leftProperty: "left",
          rightProperty: "right",
          insetMode: "edge",
          extraCss:
            "translate: none !important; transform: none !important; width: auto !important; max-width: none !important; min-width: 0 !important; box-sizing: border-box !important;",
        },
      ],
      defaultWidth: "768px",
      gap: 16,
    }
  }

  getZenModeConfig() {
    return this.cloneZenModeConfig(this.config.zenMode)
  }

  getCleanModeConfig(): ZenModeConfig | null {
    return this.cloneZenModeConfig(this.config.cleanMode)
  }

  private cloneZenModeConfig(config: ZenModeConfig): ZenModeConfig {
    const { hide, rootClass, styles } = config
    return {
      ...(hide ? { hide: [...hide] } : {}),
      ...(rootClass ? { rootClass: { ...rootClass } } : {}),
      ...(styles ? { styles: styles.map((style) => ({ ...style })) } : {}),
    }
  }

  getMarkdownFixerConfig(): MarkdownFixerConfig {
    return {
      selector: this.config.sitePrivateSelectors.markdownFixerParagraph,
      fixSpanContent: false,
      shouldSkip: (element) => {
        if (!this.isGenerating()) return false

        // 查找当前元素所属的消息容器
        const messageContainer = element.closest(this.config.selectors.assistantResponse)
        if (!messageContainer) return false

        // 查找页面上最后一个 AI 消息容器（即正在生成的那个）
        const allMessages = document.querySelectorAll(this.config.selectors.assistantResponse)
        const lastMessage = allMessages[allMessages.length - 1]

        // 如果当前元素位于正在生成的消息中，强制跳过（等待生成结束后通过重试机制修复）
        return messageContainer === lastMessage
      },
    }
  }

  // ==================== 输入框操作 ====================

  getTextareaSelectors(): string[] {
    return [...this.config.selectors.textarea]
  }

  getSubmitKeyConfig(): { key: "Enter" | "Ctrl+Enter" } {
    return { key: this.config.input.submitKey ?? "Enter" }
  }

  getSubmitButtonSelectors(): string[] {
    return [...this.config.selectors.submitButton]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (element.offsetParent === null) return false
    if (element.closest(".gh-main-panel")) return false
    return element.matches(this.config.sitePrivateSelectors.validTextarea)
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
      document.execCommand("selectAll", false, undefined)
      // Firefox 的 insertText 不会把 \n 拆成段落节点，ProseMirror 重新解析 DOM 时换行会被折叠丢失，
      // 改为显式插入 <p> 段落结构；Chrome 的 insertText 行为正常，保持原路径避免回归
      const isFirefox = /firefox/i.test(navigator.userAgent)
      const success =
        isFirefox && editor.tagName !== "TEXTAREA"
          ? document.execCommand("insertHTML", false, buildParagraphHtml(content))
          : document.execCommand("insertText", false, content)
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
    const container = this.config.selectors.scrollContainer
      .map((selector) => document.querySelector(selector))
      .find((element): element is HTMLElement => element instanceof HTMLElement)
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
    return this.config.selectors.responseContainer
  }

  getChatContentSelectors(): string[] {
    return [...this.config.selectors.chatContent]
  }

  // ==================== 大纲提取 ====================

  getUserQuerySelector(): string {
    if (this.isCodexTaskPage()) {
      return `${this.config.selectors.userQuery}, ${this.config.sitePrivateSelectors.codexTaskUserQuery}`
    }

    return this.config.selectors.userQuery
  }

  private isCodexTaskPage(): boolean {
    return /^\/(?:s\/cd_[^/]+|codex\/cloud\/tasks\/task_[^/]+)/i.test(window.location.pathname)
  }

  private getCodexTaskOutlineContainer(): Element | null {
    if (!this.isCodexTaskPage()) return null

    const markdown = document.querySelector(this.config.sitePrivateSelectors.codexTaskMarkdown)
    if (!markdown) return null

    const parent = markdown.parentElement
    if (parent?.querySelector(this.config.sitePrivateSelectors.codexTaskUserQuery)) {
      return parent
    }

    return markdown
  }

  private getOutlineExtractionContainer(): Element | null {
    return (
      this.getCodexTaskOutlineContainer() ||
      document.querySelector(this.getResponseContainerSelector())
    )
  }

  extractUserQueryText(element: Element): string {
    const userQueryTextSelector = this.config.sitePrivateSelectors.userQueryText
    const textContainer = element.matches(userQueryTextSelector)
      ? element
      : element.querySelector(userQueryTextSelector)

    if (textContainer) {
      return this.extractTextWithLineBreaks(textContainer).trim()
    }

    return this.extractTextWithLineBreaks(element).trim()
  }

  extractUserQueryMarkdown(element: Element): string {
    const textContainer = element.querySelector(this.config.sitePrivateSelectors.userQueryText)
    if (!textContainer) {
      return this.extractUserQueryText(element).trim()
    }

    const clone = textContainer.cloneNode(true) as HTMLElement
    clone.querySelectorAll(this.config.sitePrivateSelectors.srOnly).forEach((node) => node.remove())

    // 纠正 ChatGPT 官方对用户问题中代码块的不规范渲染：
    // 新版 ChatGPT 可能会把 ```yaml 渲染为 <code>yaml\nflag: false</code> 且无 language-* 类名。
    clone.querySelectorAll("pre code").forEach((codeEl) => {
      if (codeEl.className.includes("language-")) {
        return
      }

      const text = codeEl.textContent || ""
      const lines = text.split("\n")
      if (lines.length > 1) {
        const firstLine = lines[0].trim().toLowerCase()
        const secondLine = lines[1].trim().toLowerCase()

        // 首行是已知语言，且第二行不是已知语言（为了防范列举语言的普通列表如 python\njava\njs 被误伤）
        if (KNOWN_LANGUAGES.has(firstLine) && !KNOWN_LANGUAGES.has(secondLine)) {
          codeEl.className = `language-${firstLine}`
          codeEl.textContent = lines.slice(1).join("\n")
        }
      }
    })

    const markdown = htmlToMarkdown(clone).trim()
    if (markdown) {
      return markdown
    }

    return this.extractUserQueryText(textContainer).trim()
  }

  extractUserQueryExportContent(element: Element): string {
    if (this.isExportSnapshotElement(element)) {
      return element.textContent?.trim() || ""
    }
    const markdown = this.extractUserQueryMarkdown(element).trim()
    return markdown || this.extractUserQueryText(element)
  }

  /**
   * 覆盖基类的助手回复提取：导出快照模式下直接返回保存的文本，
   * 避免再走 htmlToMarkdown 把已经是 markdown 的内容二次转换。
   */
  extractAssistantResponseText(element: Element): string {
    if (this.isExportSnapshotElement(element)) {
      return element.textContent?.trim() || ""
    }
    return super.extractAssistantResponseText(element)
  }

  private isExportSnapshotElement(element: Element): boolean {
    return element.hasAttribute(CHATGPT_EXPORT_ROLE_ATTR)
  }

  /**
   * 检查元素是否应跳过（屏幕阅读器专用元素）
   * ChatGPT 使用 .sr-only 类标记屏幕阅读器辅助文本
   */
  private shouldSkipElement(element: Element): boolean {
    return element.matches(this.config.sitePrivateSelectors.srOnly)
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
    const textContainer = element.querySelector(this.config.sitePrivateSelectors.userQueryText)
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
    if (this.exportSnapshotActive) {
      return {
        userQuerySelector: CHATGPT_EXPORT_USER_SELECTOR,
        assistantResponseSelector: CHATGPT_EXPORT_ASSISTANT_SELECTOR,
        turnSelector: CHATGPT_EXPORT_TURN_SELECTOR,
        useShadowDOM: false,
      }
    }

    return { ...this.config.export }
  }

  getAssistantMermaidSupportMode() {
    return this.config.mermaidSupport
  }

  // ==================== 导出生命周期 ====================

  async prepareConversationExport(context: ExportLifecycleContext): Promise<unknown> {
    this.clearExportSnapshot()
    this.exportBundle = null
    this.exportCollectionReport = null

    const exportAssetCollector =
      context.format === "markdown" && context.packaging === "zip"
        ? createExportAssetCollector()
        : null

    const responseRoot =
      (document.querySelector(this.getResponseContainerSelector()) as HTMLElement | null) ||
      (document.body as HTMLElement)
    const scrollContainer = this.getScrollContainer() || responseRoot

    let messages =
      scrollContainer instanceof HTMLElement
        ? await this.collectExportMessageSnapshots(scrollContainer, exportAssetCollector)
        : this.readVisibleExportMessageSnapshots(responseRoot, exportAssetCollector)

    if (messages.length === 0 && scrollContainer !== responseRoot) {
      messages = this.readVisibleExportMessageSnapshots(responseRoot, exportAssetCollector)
    }

    if (messages.length === 0 && responseRoot !== document.body) {
      messages = this.readVisibleExportMessageSnapshots(document, exportAssetCollector)
    }

    if (messages.length === 0) {
      return null
    }

    this.mountExportSnapshot(messages)

    this.exportBundle = {
      messages: messages.map(({ role, content }) => ({ role, content })),
      assets: exportAssetCollector?.assets,
    }

    return { count: messages.length }
  }

  async extractExportBundle(_context: ExportLifecycleContext): Promise<ExportBundle | null> {
    return this.exportBundle
  }

  async extractExportMessages(_context: ExportLifecycleContext) {
    return this.exportBundle?.messages ?? null
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    _state: unknown,
  ): Promise<void> {
    this.clearExportSnapshot()
    this.exportBundle = null
  }

  getExportCollectionReport(): ExportCollectionReport | null {
    return this.exportCollectionReport
  }

  /**
   * 历史起点未加载完 = DOM 中最早的 conversation-turn-N 仍 N > 1。
   * 复用导出采集依赖的同一锚点（data-testid），不需要额外的加载指示器选择器。
   */
  hasUnloadedConversationHistory(): boolean {
    const turns = this.getAllTurnShellsSorted()
    if (turns.length === 0) return false
    const firstTurnNumber = this.getExportTurnSortIndex(turns[0])
    return firstTurnNumber > 1 && firstTurnNumber !== Number.MAX_SAFE_INTEGER
  }

  private getAuthorMessageSelector(): string {
    return [this.config.selectors.userQuery, this.config.selectors.assistantResponse].join(", ")
  }

  /**
   * 按 turn shell 目标驱动的快照采集。
   *
   * 关键观察（参考 new4.html，一段约 60 轮的会话有 135 个 turn 全部在 DOM 里）：
   * - 即便是离屏 turn，ChatGPT 也保留它的 `<section data-turn data-testid="conversation-turn-N">` 占位
   *   以及外层 `data-is-intersecting="false"` + `--last-known-height` 的高度占位 div；
   * - 离屏 turn 的 section **是空的**，`[data-message-author-role]` 节点不在 DOM 里——
   *   仅当用户滚动到附近 ChatGPT 才会真正挂载内容。
   * - 旧方案按 `scrollTop = top` 步进扫描，受 scroll anchoring 干扰会跳过大量 turn
   *   （60 轮的会话只抓到 30 条 user 提问就是这样来的）。
   *
   * 因此改成：先一次性把所有 turn shell 拉出来按 conversation-turn-N 排序，
   * 然后逐个 `scrollIntoView({ block: "center" })` 触发挂载，每个 turn 单独等待
   * 内容出现再抓取。已挂载的 turn 跳过滚动直接抓，把 N 次滚动开销摊平到不滚的部分。
   */
  private async collectExportMessageSnapshots(
    scrollContainer: HTMLElement,
    collector?: ExportAssetCollector | null,
  ): Promise<ChatGPTExportMessageSnapshot[]> {
    const originalScrollTop = scrollContainer.scrollTop
    const collected = new Map<string, ChatGPTExportMessageSnapshot>()
    // 兜底排序键：仅在某 turn 缺少 conversation-turn-N（snapshot.order === MAX_SAFE_INTEGER）时使用
    const firstSeenOrder = new Map<string, number>()
    let firstSeenCounter = 0

    const recordSnapshots = (snapshots: ChatGPTExportMessageSnapshot[]): void => {
      for (const snapshot of snapshots) {
        if (!firstSeenOrder.has(snapshot.turnKey)) {
          firstSeenOrder.set(snapshot.turnKey, firstSeenCounter++)
        }
        const existing = collected.get(snapshot.turnKey)
        if (!existing) {
          collected.set(snapshot.turnKey, snapshot)
          continue
        }
        const order = Math.min(existing.order, snapshot.order)
        if (snapshot.content.length > existing.content.length) {
          collected.set(snapshot.turnKey, { ...snapshot, order })
        } else if (order !== existing.order) {
          collected.set(snapshot.turnKey, { ...existing, order })
        }
      }
    }

    // 内容挂载后仍在分块渲染（textContent 持续增长）时立即提取会得到截断内容；
    // 仅对本次刚滚出来的 turn 额外等一个稳定帧，命中预算上限仍在增长则记为疑似截断。
    let truncationSuspects = 0
    const settleAndRecord = async (turn: HTMLElement): Promise<void> => {
      if (!(await this.waitForTurnContentSettled(turn))) {
        truncationSuspects += 1
      }
      recordSnapshots(this.extractTurnExportSnapshots(turn, null, collector))
      this.absorbTurnIntoOutlineCache(turn)
    }

    try {
      const turns = this.getAllTurnShellsSorted()

      if (turns.length === 0) {
        // 罕见兜底：连一个 turn shell 都找不到（站点结构变更/旧版）。退回到当前可见快照。
        recordSnapshots(this.readVisibleExportMessageSnapshots(scrollContainer, collector))
      } else {
        // First pass：按 conversation-turn-N 顺序逐个滚动 / 抓取
        for (const turn of turns) {
          const wasMounted = this.turnHasMountedMessage(turn)
          if (!wasMounted) {
            this.scrollTurnIntoView(turn)
            scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
            await this.waitForTurnMessageMounted(turn, 900)
          }
          if (this.turnHasMountedMessage(turn)) {
            if (wasMounted) {
              recordSnapshots(this.extractTurnExportSnapshots(turn, null, collector))
              // **关键**：每个 turn 在挂载状态下立即把 user / heading 写入大纲缓存，
              // 不能等到全部 collect 完再统一抓——ChatGPT 在抓取过程中会 mount + unmount，
              // 等到 finally 时大量 turn 已经被卸载，extractOutline 抓不到了。
              this.absorbTurnIntoOutlineCache(turn)
            } else {
              await settleAndRecord(turn)
            }
          }
        }

        // Retry pass：第一遍没挂载成功的 turn 给更长 timeout 再试一次
        const collectedTurnIds = this.extractCollectedTurnIds(collected)
        const missingTurns = turns.filter((turn) => {
          const turnId =
            turn.getAttribute("data-turn-id") || turn.getAttribute("data-turn-id-container") || ""
          return turnId.length > 0 && !collectedTurnIds.has(turnId)
        })

        if (missingTurns.length > 0) {
          // 给 ChatGPT 喘口气；连续快速滚动可能让 IntersectionObserver 处理不过来
          await this.sleep(200)
          for (const turn of missingTurns) {
            this.scrollTurnIntoView(turn)
            scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
            await this.waitForTurnMessageMounted(turn, 1800)
            if (this.turnHasMountedMessage(turn)) {
              await settleAndRecord(turn)
            }
          }
        }

        // 连续性补抓：conversation-turn-N 是连续整数，缺号即漏抓（含起始 N > 1 的
        // 历史未加载场景）。对仍能定位到 shell 的缺口定向补一轮；补不回的进报告。
        const missingNumbers = this.findMissingExportTurnNumbers(collected)
        if (missingNumbers.length > 0) {
          const missingSet = new Set(missingNumbers)
          const gapTurns = turns.filter((turn) => missingSet.has(this.getExportTurnSortIndex(turn)))
          for (const turn of gapTurns) {
            this.scrollTurnIntoView(turn)
            scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
            await this.waitForTurnMessageMounted(turn, 1800)
            if (this.turnHasMountedMessage(turn)) {
              await settleAndRecord(turn)
            }
          }
        }
      }

      this.exportCollectionReport = this.buildExportCollectionReport(
        collected,
        truncationSuspects > 0,
      )
    } finally {
      // 退出前主动让大纲缓存吸收一次本轮被 mount 过的所有 turn——
      // 我们刚滚过每个 turn 的内容，这是最完整的状态；恢复 scrollTop 后 ChatGPT 会
      // 重新卸载远端 turn，下一次 OutlineManager extract 时仅靠当前 DOM 又会变少，
      // 这里主动跑一次 extractOutline 让 outlineItemCache 把每个 turn 的 user 提问 /
      // heading 都记下来，大纲就能在导出后立即显示完整内容。
      // includeUserQueries=true：写入所有 user query；mergeCachedChatGPTOutlineItems
      // 会按调用方传入的 includeUserQueries 过滤渲染，所以不会污染显示。
      try {
        this.extractOutline(6, true, false)
      } catch {
        /* 不影响导出主流程 */
      }
      scrollContainer.scrollTop = originalScrollTop
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
    }

    // 排序：先按 conversation-turn-N（snapshot.order）；两个 turn 同 N（不应发生）
    // 或都缺失 N 时，用 first-seen 计数器兜底。
    return Array.from(collected.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order
      const aFallback = firstSeenOrder.get(a.turnKey) ?? Number.MAX_SAFE_INTEGER
      const bFallback = firstSeenOrder.get(b.turnKey) ?? Number.MAX_SAFE_INTEGER
      return aFallback - bFallback
    })
  }

  /** 列出当前 DOM 中所有 turn 的 section，按 conversation-turn-N 升序。 */
  private getAllTurnShellsSorted(): HTMLElement[] {
    // scrollContainer 在 ChatGPT 上未必包含 #thread（它可能是后者的祖先 / 兄弟节点），
    // 用响应容器选择器作为查询根更稳。
    const root: ParentNode = document.querySelector(this.getResponseContainerSelector()) || document
    const candidates = Array.from(
      root.querySelectorAll(this.config.sitePrivateSelectors.exportTurnContainer),
    ).filter((element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false
      if (element.closest(`[${CHATGPT_EXPORT_ROOT_ATTR}]`)) return false
      if (element.closest(".gh-root, .gh-main-panel")) return false
      return true
    })

    // 嵌套去重：若候选 A 包含另一个候选 B，则保留 B
    const innermost = candidates.filter(
      (candidate) => !candidates.some((other) => other !== candidate && candidate.contains(other)),
    )

    return innermost.sort((a, b) => this.getExportTurnSortIndex(a) - this.getExportTurnSortIndex(b))
  }

  /** turn 是否已挂载真实内容（不是只剩 shell）。 */
  private turnHasMountedMessage(turn: HTMLElement): boolean {
    const message = turn.querySelector(this.config.sitePrivateSelectors.exportMountedMessage)
    if (message instanceof HTMLElement) {
      if (message.textContent && message.textContent.trim()) {
        return true
      }

      if (this.hasExportableChatGPTImage(message)) {
        return true
      }
    }

    if (this.hasExportableChatGPTImage(turn)) return true

    return this.getDeepResearchIframe(turn) !== null
  }

  /** scrollIntoView 触发后轮询等待 turn 内的真实 message 节点挂载好。 */
  private async waitForTurnMessageMounted(turn: HTMLElement, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (this.turnHasMountedMessage(turn)) return true
      await this.sleep(50)
    }
    return false
  }

  /**
   * 内容挂载确认后再等一个"稳定帧"：长 markdown 会分块渲染，textContent 仍在增长时
   * 立即提取会得到截断内容。最多轮询 3 轮（约 360ms），返回 false 表示到上限仍在增长
   * （疑似截断，计入完整性报告的 hasTruncated）。
   */
  private async waitForTurnContentSettled(turn: HTMLElement): Promise<boolean> {
    let lastLength = -1
    for (let round = 0; round < 3; round += 1) {
      const length = turn.textContent?.length ?? 0
      if (length === lastLength) return true
      lastLength = length
      await this.sleep(120)
    }
    return (turn.textContent?.length ?? 0) === lastLength
  }

  /** 已收集快照中的 conversation-turn-N 序号集合（忽略无 N 的兜底项）。 */
  private getCollectedTurnNumbers(
    collected: Map<string, ChatGPTExportMessageSnapshot>,
  ): Set<number> {
    const numbers = new Set<number>()
    for (const snapshot of collected.values()) {
      if (snapshot.order !== Number.MAX_SAFE_INTEGER) numbers.add(snapshot.order)
    }
    return numbers
  }

  /** turn-N 连续性缺口：起始 N > 1 说明历史分页未加载完；中间缺号说明采集丢失。 */
  private findMissingExportTurnNumbers(
    collected: Map<string, ChatGPTExportMessageSnapshot>,
  ): number[] {
    const numbers = this.getCollectedTurnNumbers(collected)
    if (numbers.size === 0) return []
    let max = 0
    for (const n of numbers) max = Math.max(max, n)
    const missing: number[] = []
    for (let n = 1; n <= max; n += 1) {
      if (!numbers.has(n)) missing.push(n)
    }
    return missing
  }

  /** 把连续缺号压缩成区间描述，避免历史未加载时产生几百条锚点记录。 */
  private compressMissingTurnNumbers(missing: number[]): string[] {
    if (missing.length === 0) return []
    const ranges: string[] = []
    let start = missing[0]
    let prev = missing[0]
    const flush = (): void => {
      ranges.push(start === prev ? `turn-${start}` : `turn-${start}..turn-${prev}`)
    }
    for (let i = 1; i < missing.length; i += 1) {
      const n = missing[i]
      if (n === prev + 1) {
        prev = n
        continue
      }
      flush()
      start = n
      prev = n
    }
    flush()
    return ranges
  }

  private buildExportCollectionReport(
    collected: Map<string, ChatGPTExportMessageSnapshot>,
    hasTruncated: boolean,
  ): ExportCollectionReport {
    const numbers = this.getCollectedTurnNumbers(collected)
    if (numbers.size === 0) {
      return {
        expectedCount: null,
        collectedCount: collected.size,
        missingAnchors: [],
        hasTruncated,
      }
    }
    let max = 0
    for (const n of numbers) max = Math.max(max, n)
    return {
      expectedCount: max,
      collectedCount: numbers.size,
      missingAnchors: this.compressMissingTurnNumbers(this.findMissingExportTurnNumbers(collected)),
      hasTruncated,
    }
  }

  /** 无 turnId 时给内容兜底 key 追加按元素稳定、跨 turn 唯一的后缀，避免同内容前缀的 turn 互相覆盖。 */
  private getExportTurnFallbackId(turn: HTMLElement): number {
    let id = this.exportTurnFallbackIds.get(turn)
    if (id === undefined) {
      id = this.exportTurnFallbackIdCounter++
      this.exportTurnFallbackIds.set(turn, id)
    }
    return id
  }

  /** 容错地把 turn 滚到视口中央。 */
  private scrollTurnIntoView(turn: HTMLElement): void {
    try {
      turn.scrollIntoView({
        block: "center",
        behavior: "instant",
      } as ScrollIntoViewOptions)
    } catch {
      turn.scrollIntoView({ block: "center" })
    }
  }

  /** 从已 collected 的 snapshot.turnKey（形如 `user:turn:<id>` / `assistant:turn:<id>`）反查出 turnId 集合。 */
  private extractCollectedTurnIds(
    collected: Map<string, ChatGPTExportMessageSnapshot>,
  ): Set<string> {
    const ids = new Set<string>()
    for (const key of collected.keys()) {
      const match = /^(?:user|assistant):turn:(.+)$/.exec(key)
      if (match) ids.add(match[1])
    }
    return ids
  }

  /**
   * 把当前 turn 的用户提问 / 标题节点写入 OutlineManager 共享的缓存。
   *
   * 关键点：必须在每个 turn 仍处于挂载状态时立刻写入，**不能等到 collect 全部
   * 结束后再统一 extractOutline()**。ChatGPT 在 collect 流程中会一边 mount
   * 我们刚滚到的 turn、一边 unmount 上一个 turn；等遍历完，大部分 turn 的真实
   * message 节点已经被卸载到只剩空 section 占位，extractOutline 抓不到，
   * 大纲就缺一大段（用户报告的"导出后仍少 13 轮"由此而来）。
   * 写进 outlineItemCache 之后，OutlineManager 下次 refresh 时通过
   * mergeCachedChatGPTOutlineItems 就能拼回完整大纲。
   */
  private absorbTurnIntoOutlineCache(turn: HTMLElement): void {
    const turnId =
      turn.getAttribute("data-turn-id") || turn.getAttribute("data-turn-id-container") || null

    if (turnId && !this.outlineTurnFirstSeenIndex.has(turnId)) {
      this.outlineTurnFirstSeenIndex.set(turnId, this.outlineTurnFirstSeenCounter++)
    }
    const firstSeenTurnIndex =
      turnId && this.outlineTurnFirstSeenIndex.has(turnId)
        ? (this.outlineTurnFirstSeenIndex.get(turnId) as number)
        : Number.MAX_SAFE_INTEGER

    // user query：用 data-message-id 作为缓存 key，与 extractOutline 同结构
    const userMessages = Array.from(turn.querySelectorAll(this.config.selectors.userQuery)).filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    )
    for (const message of userMessages) {
      const msgId =
        message.getAttribute("data-message-id") ||
        message.closest("[data-message-id]")?.getAttribute("data-message-id") ||
        ""
      if (!msgId) continue
      const rawText = this.extractUserQueryText(message).trim()
      if (!rawText) continue
      let text = rawText
      let isTruncated = false
      if (text.length > 200) {
        text = text.substring(0, 200)
        isTruncated = true
      }
      this.outlineItemCache.set(msgId, {
        id: msgId,
        level: 0,
        text,
        turnId,
        firstSeenTurnIndex,
        orderInTurn: 0,
        isUserQuery: true,
        isTruncated,
      })
    }

    // assistant 内的 heading：ID 形如 `msgId::tag-text::count`
    const assistantMessages = Array.from(
      turn.querySelectorAll(this.config.selectors.assistantResponse),
    ).filter((element): element is HTMLElement => element instanceof HTMLElement)
    for (const message of assistantMessages) {
      const msgId =
        message.getAttribute("data-message-id") ||
        message.closest("[data-message-id]")?.getAttribute("data-message-id") ||
        ""
      if (!msgId) continue

      const headings = Array.from(message.querySelectorAll("h1,h2,h3,h4,h5,h6"))
      const counts: Record<string, number> = {}
      let orderInTurn = 0
      for (const heading of headings) {
        if (this.shouldSkipElement(heading)) continue
        if (this.isInRenderedMarkdownContainer(heading)) continue
        const tagName = heading.tagName.toLowerCase()
        const text = (heading.textContent || "").trim()
        if (!text) continue

        const key = `${tagName}-${text}`
        const count = counts[key] || 0
        counts[key] = count + 1
        const headingId = `${msgId}::${key}::${count}`
        this.outlineItemCache.set(headingId, {
          id: headingId,
          level: parseInt(tagName.charAt(1), 10),
          text,
          turnId,
          firstSeenTurnIndex,
          orderInTurn: orderInTurn++,
          isUserQuery: false,
        })
      }
    }
  }

  private readVisibleExportMessageSnapshots(
    container: ParentNode,
    collector?: ExportAssetCollector | null,
  ): ChatGPTExportMessageSnapshot[] {
    const referenceContainer =
      container instanceof HTMLElement
        ? container
        : (document.querySelector(this.getResponseContainerSelector()) as HTMLElement | null)

    const turns = this.findExportTurnContainers(container)
    if (turns.length === 0) {
      // 极端兜底：找不到 turn 包装层时按扁平 message 抓取（最少不会漏内容）
      return Array.from(container.querySelectorAll(this.getAuthorMessageSelector()))
        .filter((element): element is HTMLElement => {
          if (!(element instanceof HTMLElement)) return false
          if (element.closest(`[${CHATGPT_EXPORT_ROOT_ATTR}]`)) return false
          if (element.closest(".gh-root, .gh-main-panel")) return false
          return true
        })
        .map((message) => this.extractExportMessageSnapshot(message, referenceContainer, collector))
        .filter((message): message is ChatGPTExportMessageSnapshot => message !== null)
    }

    const snapshots: ChatGPTExportMessageSnapshot[] = []
    for (const turn of turns) {
      const turnSnapshots = this.extractTurnExportSnapshots(turn, referenceContainer, collector)
      snapshots.push(...turnSnapshots)
    }
    return snapshots
  }

  /**
   * 找出当前可见区域内的 turn 容器。
   * ChatGPT 新版结构：<section data-turn="user|assistant" data-turn-id="..." data-testid="conversation-turn-N">。
   * 老版可能只有 [data-testid^="conversation-turn"]。
   */
  private findExportTurnContainers(container: ParentNode): HTMLElement[] {
    const candidates = Array.from(
      container.querySelectorAll(this.config.sitePrivateSelectors.exportTurnContainer),
    ).filter((element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false
      if (element.closest(`[${CHATGPT_EXPORT_ROOT_ATTR}]`)) return false
      if (element.closest(".gh-root, .gh-main-panel")) return false
      return true
    })

    // 去除嵌套：若候选 A 包含另一个候选 B，则去掉 A（保留更内层）
    return candidates.filter((candidate) => {
      return !candidates.some((other) => other !== candidate && candidate.contains(other))
    })
  }

  /**
   * 抓取一个 turn 内的消息快照。
   *
   * ChatGPT 新版结构：单个 assistant turn 内可能并列多个 [data-message-author-role="assistant"]，
   * 中间用一个独立 div 包着 "已思考 Ns" 折叠按钮做分隔。
   * 关键点：按钮前后两侧的 message **都是 ChatGPT 真正想给用户看的正文**——
   * 模型会先输出一段引子、再展开深度思考、再回到正文。**真正的"思考内容"在右侧 side rail，
   * 根本不会出现在主 DOM 的 turn 子树里**，所以我们也无需识别/过滤。
   *
   * 因此策略简化为：把 turn 内所有 assistant message 的文本按 DOM 顺序拼成一条 snapshot。
   * 折叠按钮（普通 <button> 元素）已经在 extractAssistantResponseTextFromLiveDom
   * 的 'button, [role="button"]' 过滤中被排除，不会污染合并结果。
   *
   * turnKey 用 turnId 而非 messageId，让虚拟滚动多次抓取稳定去重。
   */
  private extractTurnExportSnapshots(
    turn: HTMLElement,
    _referenceContainer: HTMLElement | null,
    collector?: ExportAssetCollector | null,
  ): ChatGPTExportMessageSnapshot[] {
    const messages = this.collectOwnAuthorMessagesForTurn(turn)
    if (messages.length === 0) {
      const imageParts = this.extractChatGPTImageMarkdown(turn, collector, {
        fallbackAlt: "generated image",
      })
        .map((content) => this.normalizeExportMessageContent(content))
        .filter((text) => text.length > 0)

      if (imageParts.length > 0) {
        const content = imageParts.join("\n\n")
        const turnId =
          turn.getAttribute("data-turn-id") || turn.getAttribute("data-turn-id-container") || ""

        return [
          {
            role: CHATGPT_EXPORT_ROLE_ASSISTANT,
            turnKey: turnId
              ? `assistant:turn:${turnId}`
              : `assistant:images:${content.replace(/\s+/g, " ").slice(0, 120)}#f${this.getExportTurnFallbackId(turn)}`,
            order: this.getExportTurnSortIndex(turn),
            content,
          },
        ]
      }

      return this.extractDeepResearchTurnExportSnapshot(turn)
    }

    const firstRole = messages[0].getAttribute("data-message-author-role")
    const turnRoleAttr = turn.getAttribute("data-turn")
    const role: "user" | "assistant" =
      turnRoleAttr === "user" || firstRole === "user"
        ? CHATGPT_EXPORT_ROLE_USER
        : CHATGPT_EXPORT_ROLE_ASSISTANT

    const turnId =
      turn.getAttribute("data-turn-id") || turn.getAttribute("data-turn-id-container") || ""
    const order = this.getExportTurnSortIndex(turn)

    if (role === CHATGPT_EXPORT_ROLE_USER) {
      // user turn：通常一条；若有多条同样按顺序拼接
      const parts = messages
        .map((message) =>
          this.normalizeExportMessageContent(
            this.extractUserQueryExportContentWithAssets(message, collector) ||
              this.extractUserQueryText(message),
          ),
        )
        .filter((text) => text.length > 0)
      if (parts.length === 0) return []

      const content = parts.join("\n\n")
      return [
        {
          role: CHATGPT_EXPORT_ROLE_USER,
          turnKey: turnId
            ? `user:turn:${turnId}`
            : `user:content:${content.replace(/\s+/g, " ").slice(0, 120)}#f${this.getExportTurnFallbackId(turn)}`,
          order,
          content,
        },
      ]
    }

    // assistant turn：把 turn 内所有 message 按 DOM 顺序合并
    const parts = messages
      .map((message) =>
        this.normalizeExportMessageContent(this.extractAssistantResponseTextFromLiveDom(message)),
      )
      .filter((text) => text.length > 0)
    parts.push(
      ...this.extractChatGPTImageMarkdown(turn, collector, {
        fallbackAlt: "generated image",
        onlyOutsideAuthorMessages: true,
      })
        .map((content) => this.normalizeExportMessageContent(content))
        .filter((text) => text.length > 0),
    )
    if (parts.length === 0) return []

    const combinedContent = parts.join("\n\n")
    const turnKey = turnId
      ? `assistant:turn:${turnId}`
      : `assistant:content:${combinedContent.replace(/\s+/g, " ").slice(0, 120)}#f${this.getExportTurnFallbackId(turn)}`

    return [
      {
        role: CHATGPT_EXPORT_ROLE_ASSISTANT,
        turnKey,
        order,
        content: combinedContent,
      },
    ]
  }

  /**
   * 收集这个 turn 直接归属的 author-role 节点（不包含嵌套子 turn 的节点）。
   */
  private collectOwnAuthorMessagesForTurn(turn: HTMLElement): HTMLElement[] {
    return Array.from(turn.querySelectorAll(this.getAuthorMessageSelector())).filter(
      (element): element is HTMLElement => {
        if (!(element instanceof HTMLElement)) return false
        if (element.closest(`[${CHATGPT_EXPORT_ROOT_ATTR}]`)) return false
        if (element.closest(".gh-root, .gh-main-panel")) return false
        // 仅保留祖先链中最近的 turn 就是当前 turn 的元素
        const innerTurn = element.closest(this.config.sitePrivateSelectors.exportTurnContainer)
        return innerTurn === turn
      },
    )
  }

  private extractExportMessageSnapshot(
    message: HTMLElement,
    _referenceContainer: HTMLElement | null,
    collector?: ExportAssetCollector | null,
  ): ChatGPTExportMessageSnapshot | null {
    const role =
      message.getAttribute("data-message-author-role") === "assistant"
        ? CHATGPT_EXPORT_ROLE_ASSISTANT
        : CHATGPT_EXPORT_ROLE_USER

    const content = this.normalizeExportMessageContent(
      role === CHATGPT_EXPORT_ROLE_ASSISTANT
        ? this.extractAssistantResponseTextFromLiveDom(message)
        : this.extractUserQueryExportContentWithAssets(message, collector) ||
            this.extractUserQueryText(message),
    )
    if (!content) return null

    const messageId =
      message.getAttribute("data-message-id") ||
      message.closest("[data-message-id]")?.getAttribute("data-message-id") ||
      ""
    const turnKey = messageId
      ? `${role}:${messageId}`
      : `${role}:content:${content.replace(/\s+/g, " ").slice(0, 120)}`

    // 从父链中找最近的 conversation-turn-N 作为稳定排序键
    const ownerTurn = message.closest(
      this.config.sitePrivateSelectors.exportTurnContainer,
    ) as HTMLElement | null
    const order = ownerTurn ? this.getExportTurnSortIndex(ownerTurn) : Number.MAX_SAFE_INTEGER

    return {
      role,
      turnKey,
      order,
      content,
    }
  }

  /**
   * 用于实时 DOM 的助手回复提取（避免与 extractAssistantResponseText 的快照分支互相递归）。
   */
  private extractAssistantResponseTextFromLiveDom(element: Element): string {
    // 优先抓 .markdown / .prose 容器的内容
    const markdownContainer =
      element.querySelector(this.config.sitePrivateSelectors.assistantMarkdown) || element
    const clone = markdownContainer.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.exportCleanup)
      .forEach((node) => node.remove())

    const markdown = htmlToMarkdown(clone).trim()
    if (markdown) return markdown
    return this.extractTextWithLineBreaks(clone)
  }

  private extractUserQueryExportContentWithAssets(
    element: Element,
    collector?: ExportAssetCollector | null,
  ): string {
    const parts = [
      ...this.extractUserQueryImageMarkdown(element, collector),
      ...this.extractUserQueryFileMarkdown(element, collector),
    ]
    const body = this.extractUserQueryMarkdown(element).trim()
    if (body) parts.push(body)
    return parts.join("\n\n").trim()
  }

  private extractUserQueryImageMarkdown(
    element: Element,
    collector?: ExportAssetCollector | null,
  ): string[] {
    return this.extractChatGPTImageMarkdown(element, collector, {
      fallbackAlt: "uploaded image",
      role: "user",
      category: "image",
    })
  }

  private extractChatGPTImageMarkdown(
    element: Element,
    collector?: ExportAssetCollector | null,
    options: {
      fallbackAlt: string
      onlyOutsideAuthorMessages?: boolean
      role?: "user" | "assistant"
      category?: string
    } = {
      fallbackAlt: "image",
    },
  ): string[] {
    const images = this.getChatGPTExportImages(element).filter((node): node is HTMLImageElement => {
      if (!(node instanceof HTMLImageElement)) return false
      if (!this.isExportableChatGPTImage(node)) return false
      if (
        options.onlyOutsideAuthorMessages &&
        node.closest(this.config.sitePrivateSelectors.exportMountedMessage)
      ) {
        return false
      }
      return true
    })
    const seenSources = new Set<string>()
    const imageMarkdown: string[] = []

    for (const image of images) {
      const source = this.getChatGPTImageExportSource(image)
      if (!source || seenSources.has(source)) continue

      seenSources.add(source)
      const alt = (image.alt || image.getAttribute("aria-label") || options.fallbackAlt)
        .replace(/\s+/g, " ")
        .trim()
      const markdown = formatExportImageMarkdown({ source, alt }, collector || undefined, {
        siteId: this.getSiteId(),
        role: options.role || "assistant",
        category: options.category || "generated-image",
        fallbackAlt: options.fallbackAlt,
      })

      if (markdown) imageMarkdown.push(markdown)
    }

    return imageMarkdown
  }

  private getChatGPTExportImages(element: Element): HTMLImageElement[] {
    const imagegenImages = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.exportImageContainer),
    )
      .map((container) => {
        const images = Array.from(container.querySelectorAll("img")).filter(
          (node): node is HTMLImageElement => node instanceof HTMLImageElement,
        )
        return (
          images.find((image) => {
            const className = image.className || ""
            return !className.includes("absolute") && !className.includes("blur")
          }) ||
          images.find((image) => image.width > 0 && image.height > 0) ||
          images[0] ||
          null
        )
      })
      .filter((image): image is HTMLImageElement => image instanceof HTMLImageElement)

    if (imagegenImages.length > 0) return imagegenImages

    return Array.from(element.querySelectorAll("img")).filter(
      (node): node is HTMLImageElement => node instanceof HTMLImageElement,
    )
  }

  private extractUserQueryFileMarkdown(
    element: Element,
    collector?: ExportAssetCollector | null,
  ): string[] {
    const fileTiles = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.exportFileTile),
    ).filter((node): node is HTMLElement => node instanceof HTMLElement)
    const seenFiles = new Set<string>()
    const fileMarkdown: string[] = []

    for (const tile of fileTiles) {
      const name = this.extractChatGPTFileName(tile)
      if (!name) continue

      const href = this.extractChatGPTFileHref(tile)
      const markdown = formatExportFileAttachments(
        [{ kind: "file", name, source: href, type: name }],
        collector || undefined,
        {
          siteId: this.getSiteId(),
          getLabel: () => name,
          getMimeHint: () => name,
        },
      )[0]

      if (seenFiles.has(markdown)) continue

      seenFiles.add(markdown)
      fileMarkdown.push(markdown)
    }

    return fileMarkdown.length > 0 ? ["**Attachments:**\n\n" + fileMarkdown.join("\n")] : []
  }

  private extractDeepResearchTurnExportSnapshot(turn: HTMLElement): ChatGPTExportMessageSnapshot[] {
    const iframe = this.getDeepResearchIframe(turn)
    if (!iframe) return []

    const source = iframe.getAttribute("src") || iframe.src || ""
    const rawTitle = iframe.getAttribute("title") || ""
    const title =
      rawTitle && !rawTitle.startsWith("internal://") ? rawTitle : "ChatGPT Deep Research"
    const content = source ? `[${escapeMarkdownLinkText(title)}](${source})` : title
    const turnId =
      turn.getAttribute("data-turn-id") || turn.getAttribute("data-turn-id-container") || ""

    return [
      {
        role: CHATGPT_EXPORT_ROLE_ASSISTANT,
        turnKey: turnId ? `assistant:turn:${turnId}` : `assistant:deep-research:${source}`,
        order: this.getExportTurnSortIndex(turn),
        content,
      },
    ]
  }

  private getDeepResearchIframe(root: Element): HTMLIFrameElement | null {
    const iframe = root.querySelector(this.config.sitePrivateSelectors.deepResearchIframe)
    return iframe instanceof HTMLIFrameElement ? iframe : null
  }

  private isExportableChatGPTImage(image: HTMLImageElement): boolean {
    const source = this.getChatGPTImageExportSource(image)
    if (!source) return false
    if (source.includes("/cdn/assets/")) return false
    if (source.startsWith("data:image/svg+xml")) return false
    return isDownloadableExportAssetUrl(source) || source.startsWith("data:image/")
  }

  private hasExportableChatGPTImage(root: Element): boolean {
    return this.getChatGPTExportImages(root).some((node) => this.isExportableChatGPTImage(node))
  }

  private getChatGPTImageExportSource(image: HTMLImageElement): string {
    const candidates = [image.currentSrc || "", image.src || "", image.getAttribute("src") || ""]

    for (const candidate of candidates) {
      const source = normalizeExportAssetUrl(candidate)
      if (source) return source
    }

    return ""
  }

  private extractChatGPTFileName(tile: Element): string {
    const candidates = [
      tile.getAttribute("aria-label") || "",
      tile
        .querySelector(this.config.sitePrivateSelectors.exportFileLabel)
        ?.getAttribute("aria-label") || "",
      tile.querySelector(this.config.sitePrivateSelectors.exportFileName)?.textContent || "",
      tile.textContent || "",
    ]
      .map((value) => value.replace(/\s+/g, " ").trim())
      .filter(Boolean)

    const filename = candidates.find((value) => /\.[A-Za-z0-9]{1,10}(\s|$)/.test(value))
    return filename?.match(/[^/\\]+?\.[A-Za-z0-9]{1,10}/)?.[0] || ""
  }

  private extractChatGPTFileHref(tile: Element): string {
    const links = Array.from(tile.querySelectorAll("a[href]")).filter(
      (node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement,
    )

    for (const link of links) {
      const href = normalizeExportAssetUrl(link.getAttribute("href") || link.href || "")
      if (isDownloadableExportAssetUrl(href)) return href
    }

    return ""
  }

  /**
   * 解析 turn 的稳定全局排序键。
   *
   * ChatGPT 每个 turn 都有 `data-testid="conversation-turn-N"`，N 是该会话内
   * 从开始往后的 1-based 单调序号，**与虚拟滚动当前的滚动状态、shell 高度变化
   * 完全无关**。相比之前用 `scrollTop + rect.top` 算出来的坐标，这个 N 不会
   * 因为 scroll anchoring、shell 卸载、`--last-known-height` 误差而漂移。
   *
   * 拿不到 N（理论上极少见，比如更老的 ChatGPT 或自定义版本）时返回 MAX，
   * 由 collect 层的 first-seen 计数器兜底。
   */
  private getExportTurnSortIndex(turn: HTMLElement): number {
    const testid = turn.getAttribute("data-testid") || ""
    const match = /^conversation-turn-(\d+)/.exec(testid)
    return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER
  }

  private normalizeExportMessageContent(content: string): string {
    return content
      .replace(/\r\n/g, "\n")
      .replace(/\u00a0/g, " ")
      .trim()
  }

  private mountExportSnapshot(messages: ChatGPTExportMessageSnapshot[]): void {
    this.clearExportSnapshot()

    const root = document.createElement("div")
    root.setAttribute(CHATGPT_EXPORT_ROOT_ATTR, "1")
    root.style.display = "none"

    messages.forEach((message) => {
      const turn = document.createElement("div")
      turn.setAttribute(CHATGPT_EXPORT_TURN_ATTR, "1")

      const node = document.createElement("div")
      node.setAttribute(CHATGPT_EXPORT_ROLE_ATTR, message.role)
      node.textContent = message.content
      turn.appendChild(node)
      root.appendChild(turn)
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

    document.querySelectorAll(`[${CHATGPT_EXPORT_ROOT_ATTR}]`).forEach((node) => {
      if (node !== root) {
        node.parentNode?.removeChild(node)
      }
    })
  }

  // ==================== 大纲缓存（虚拟滚动兜底） ====================

  private normalizeNativeTocText(text: string): string {
    return text.replace(/\s+/g, " ").trim()
  }

  private isCompatibleNativeTocText(source: string, target: string): boolean {
    const normalizedSource = this.normalizeNativeTocText(source)
    const normalizedTarget = this.normalizeNativeTocText(target)
    if (!normalizedSource || !normalizedTarget) return false
    if (normalizedSource === normalizedTarget) return true

    const shorterLength = Math.min(normalizedSource.length, normalizedTarget.length)
    if (shorterLength < 200) return false

    return (
      normalizedSource.startsWith(normalizedTarget) || normalizedTarget.startsWith(normalizedSource)
    )
  }

  private isNativeTocOutlineId(id: string | undefined): boolean {
    return Boolean(id?.startsWith(CHATGPT_NATIVE_TOC_ID_PREFIX))
  }

  private getNativeTocOutlineIndex(id: string | undefined): number | null {
    const idMatch = (id || "").match(CHATGPT_NATIVE_TOC_ID_RE)
    if (!idMatch?.[1]) return null

    const index = Number.parseInt(idMatch[1], 10)
    return Number.isNaN(index) ? null : index
  }

  private getNativeTocButtonIndex(button: HTMLElement, fallbackIndex: number): number {
    const match = /^Prompt\s+(\d+)$/i.exec((button.getAttribute("aria-label") || "").trim())
    if (!match?.[1]) return fallbackIndex

    const parsed = Number.parseInt(match[1], 10)
    return Number.isNaN(parsed) ? fallbackIndex : Math.max(0, parsed - 1)
  }

  private isNativeTocButton(button: Element): button is HTMLElement {
    if (!(button instanceof HTMLElement)) return false
    const label = this.normalizeNativeTocText(button.getAttribute("aria-label") || "")
    return Boolean(label) && button.matches(this.config.sitePrivateSelectors.nativeTocButton)
  }

  private getNativeTocButtons(): HTMLElement[] {
    const privateSelectors = this.config.sitePrivateSelectors
    const rails = Array.from(document.querySelectorAll(privateSelectors.nativeTocRail))
    const railButtons = rails
      .map((rail) =>
        Array.from(rail.querySelectorAll(privateSelectors.nativeTocButton)).filter(
          (button): button is HTMLElement => this.isNativeTocButton(button),
        ),
      )
      .filter((buttons) => buttons.length > 0)
      .sort((left, right) => right.length - left.length)[0]

    const buttons = railButtons || []

    return buttons
      .map((button, fallbackIndex) => ({
        button,
        index: this.getNativeTocButtonIndex(button, fallbackIndex),
      }))
      .sort((left, right) => left.index - right.index)
      .map(({ button }) => button)
  }

  private getNativeTocHoverTargets(buttons: HTMLElement[]): HTMLElement[] {
    const firstButton = buttons[0]
    if (!firstButton) return []

    const privateSelectors = this.config.sitePrivateSelectors
    const rail = firstButton.closest(privateSelectors.nativeTocRail)
    const ancestors = privateSelectors.nativeTocHoverAncestor.map((selector) =>
      firstButton.closest(selector),
    )
    return [rail, rail?.parentElement, ...ancestors, firstButton].filter(
      (element, index, all): element is HTMLElement => {
        return element instanceof HTMLElement && all.indexOf(element) === index
      },
    )
  }

  private getNativeTocButtonElementSignature(buttons: HTMLElement[]): string {
    return buttons
      .map((button) => {
        let id = this.nativeTocButtonElementIds.get(button)
        if (id === undefined) {
          id = this.nativeTocButtonElementIdCounter
          this.nativeTocButtonElementIdCounter += 1
          this.nativeTocButtonElementIds.set(button, id)
        }
        return id
      })
      .join("|")
  }

  private cacheNativeTocTexts(buttons: HTMLElement[], texts: string[]): void {
    this.nativeTocTextCache = texts
    this.nativeTocButtonElementSignatureCache = this.getNativeTocButtonElementSignature(buttons)
  }

  private hasUsableNativeTocTextCache(buttons: HTMLElement[]): boolean {
    if (this.nativeTocTextCache.length !== buttons.length) return false

    const buttonSignature = this.getNativeTocButtonElementSignature(buttons)
    return (
      buttonSignature.length > 0 && buttonSignature === this.nativeTocButtonElementSignatureCache
    )
  }

  private getElementWindow(element: Element): Window & typeof globalThis {
    return (element.ownerDocument.defaultView || window) as Window & typeof globalThis
  }

  private revealNativeTocTextLayer(buttons: HTMLElement[]): void {
    const targets = this.getNativeTocHoverTargets(buttons)

    targets.forEach((target) => {
      const rect = target.getBoundingClientRect()
      const eventWindow = this.getElementWindow(target)
      const eventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: eventWindow,
        clientX: Math.round(rect.left + rect.width / 2),
        clientY: Math.round(rect.top + rect.height / 2),
      }

      const PointerEventCtor = eventWindow.PointerEvent
      if (PointerEventCtor) {
        target.dispatchEvent(
          new PointerEventCtor("pointerover", {
            ...eventInit,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          }),
        )
        target.dispatchEvent(
          new PointerEventCtor("pointerenter", {
            ...eventInit,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          }),
        )
      }

      const MouseEventCtor = eventWindow.MouseEvent
      target.dispatchEvent(new MouseEventCtor("mouseover", eventInit))
      target.dispatchEvent(new MouseEventCtor("mouseenter", eventInit))
      target.dispatchEvent(new MouseEventCtor("mousemove", eventInit))
    })
  }

  private concealNativeTocTextLayer(buttons: HTMLElement[]): void {
    const targets = this.getNativeTocHoverTargets(buttons)

    targets.forEach((target) => {
      const rect = target.getBoundingClientRect()
      const eventWindow = this.getElementWindow(target)
      const eventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: eventWindow,
        clientX: Math.max(0, Math.round(rect.left - 8)),
        clientY: Math.max(0, Math.round(rect.top - 8)),
      }

      const PointerEventCtor = eventWindow.PointerEvent
      if (PointerEventCtor) {
        target.dispatchEvent(
          new PointerEventCtor("pointerout", {
            ...eventInit,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          }),
        )
        target.dispatchEvent(
          new PointerEventCtor("pointerleave", {
            ...eventInit,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          }),
        )
      }

      const MouseEventCtor = eventWindow.MouseEvent
      target.dispatchEvent(new MouseEventCtor("mouseout", eventInit))
      target.dispatchEvent(new MouseEventCtor("mouseleave", eventInit))
    })
  }

  private readNativeTocButtonLabels(buttons: HTMLElement[]): string[] {
    const labels = buttons
      .map((button) => this.normalizeNativeTocText(button.getAttribute("aria-label") || ""))
      .filter((label) => label && !CHATGPT_NATIVE_TOC_PROMPT_LABEL_RE.test(label))

    return labels.length === buttons.length ? labels : []
  }

  private scheduleNativeTocRefresh(buttons: HTMLElement[]): void {
    if (this.nativeTocRefreshScheduled) return

    const scheduledSessionKey = this.outlineCacheSessionKey
    const scheduledButtonSignature = this.getNativeTocButtonElementSignature(buttons)
    this.nativeTocRefreshScheduled = true
    window.setTimeout(() => {
      try {
        if (
          scheduledSessionKey !== this.outlineCacheSessionKey ||
          scheduledSessionKey !== this.getOutlineCacheSessionKey()
        ) {
          return
        }

        const latestButtons = this.getNativeTocButtons()
        const latestButtonSignature = this.getNativeTocButtonElementSignature(latestButtons)
        if (latestButtonSignature !== scheduledButtonSignature) return

        const texts = this.readNativeTocButtonLabels(latestButtons)
        if (texts.length === latestButtons.length && texts.length > 0) {
          this.cacheNativeTocTexts(latestButtons, texts)
          window.dispatchEvent(new CustomEvent("ophel:refreshOutline"))
        }
      } finally {
        this.concealNativeTocTextLayer(buttons.filter((button) => button.isConnected))
        this.nativeTocRefreshScheduled = false
      }
    }, 250)
  }

  private getNativeTocTexts(buttons: HTMLElement[]): string[] {
    const labels = this.readNativeTocButtonLabels(buttons)
    if (labels.length === buttons.length) {
      this.cacheNativeTocTexts(buttons, labels)
      return labels
    }

    const buttonSignature = this.getNativeTocButtonElementSignature(buttons)
    if (
      !this.hasUsableNativeTocTextCache(buttons) &&
      this.nativeTocRevealAttemptedSignature !== buttonSignature
    ) {
      this.nativeTocRevealAttemptedSignature = buttonSignature
      this.revealNativeTocTextLayer(buttons)

      const revealedLabels = this.readNativeTocButtonLabels(buttons)
      if (revealedLabels.length === buttons.length) {
        this.cacheNativeTocTexts(buttons, revealedLabels)
        this.concealNativeTocTextLayer(buttons)
        return revealedLabels
      }

      this.scheduleNativeTocRefresh(buttons)
    }

    const firstButton = buttons[0]
    const privateSelectors = this.config.sitePrivateSelectors
    const scope =
      firstButton?.closest(privateSelectors.nativeTocRail)?.parentElement ||
      privateSelectors.nativeTocHoverAncestor
        .map((selector) => firstButton?.closest(selector))
        .find((element): element is Element => element instanceof Element)
    const titleElements = scope
      ? Array.from(scope.querySelectorAll(privateSelectors.nativeTocTitleElement.join(", ")))
      : []
    const seen = new Set<Element>()
    const uniqueTitleElements = titleElements.filter((element) => {
      if (seen.has(element)) return false
      seen.add(element)
      return element instanceof HTMLElement
    })

    const texts = uniqueTitleElements
      .map((element) =>
        this.normalizeNativeTocText(element.getAttribute("title") || element.textContent || ""),
      )
      .filter((text) => text.length > 0)

    if (texts.length === buttons.length) {
      this.cacheNativeTocTexts(buttons, texts)
      return texts
    }

    if (this.hasUsableNativeTocTextCache(buttons)) {
      return this.nativeTocTextCache
    }

    return texts
  }

  private getNativeTocEntries(): ChatGPTNativeTocEntry[] {
    const buttons = this.getNativeTocButtons()
    if (buttons.length === 0) return []

    const texts = this.getNativeTocTexts(buttons)
    if (texts.length !== buttons.length) return []

    const textCounts = new Map<string, number>()
    texts.forEach((text) => {
      const normalized = this.normalizeNativeTocText(text)
      textCounts.set(normalized, (textCounts.get(normalized) || 0) + 1)
    })

    const hasPrefixConflict = (text: string): boolean => {
      const normalized = this.normalizeNativeTocText(text)
      if (!normalized) return true

      return texts.some((otherText) => {
        const other = this.normalizeNativeTocText(otherText)
        if (!other || other === normalized) return false
        return normalized.startsWith(other) || other.startsWith(normalized)
      })
    }

    const visibleUserQueriesByText = new Map<string, Element[]>()
    Array.from(document.querySelectorAll(this.getUserQuerySelector())).forEach((element) => {
      const normalized = this.normalizeNativeTocText(this.extractUserQueryText(element))
      if (!normalized) return

      const queries = visibleUserQueriesByText.get(normalized) || []
      queries.push(element)
      visibleUserQueriesByText.set(normalized, queries)
    })

    const entries: ChatGPTNativeTocEntry[] = []
    buttons.forEach((button, fallbackIndex) => {
      const text = texts[fallbackIndex]
      if (!text) return
      const normalizedText = this.normalizeNativeTocText(text)
      const visibleCandidates = visibleUserQueriesByText.get(normalizedText) || []
      const canBindElement =
        textCounts.get(normalizedText) === 1 &&
        !hasPrefixConflict(text) &&
        visibleCandidates.length === 1

      entries.push({
        index: this.getNativeTocButtonIndex(button, fallbackIndex),
        text,
        button,
        element: canBindElement ? visibleCandidates[0] : null,
        isActive: button.matches(this.config.sitePrivateSelectors.nativeTocActive),
      })
    })

    return entries
  }

  private getNativeTocButtonEntryForIndex(index: number): ChatGPTNativeTocEntry | null {
    const buttons = this.getNativeTocButtons()
    const button = buttons.find(
      (candidate, fallbackIndex) =>
        this.getNativeTocButtonIndex(candidate, fallbackIndex) === index,
    )
    if (!button) return null

    return {
      index,
      text: "",
      button,
      element: null,
      isActive: button.matches(this.config.sitePrivateSelectors.nativeTocActive),
    }
  }

  private getActiveNativeTocIndex(): number | null {
    const buttons = this.getNativeTocButtons()
    const activeButton = buttons.find((button) =>
      button.matches(this.config.sitePrivateSelectors.nativeTocActive),
    )
    if (!activeButton) return null

    const fallbackIndex = buttons.indexOf(activeButton)
    return this.getNativeTocButtonIndex(activeButton, fallbackIndex)
  }

  findActiveOutlineItemId(): string | null {
    const activeIndex = this.getActiveNativeTocIndex()
    return activeIndex === null ? null : `chatgpt-native-user-query::${activeIndex}::`
  }

  private createNativeTocUserQueryOutlineItem(
    entry: ChatGPTNativeTocEntry,
    wordCount?: number,
  ): OutlineItem {
    let text = entry.element ? this.extractUserQueryText(entry.element) : entry.text
    let isTruncated = false
    if (text.length > 200) {
      text = text.substring(0, 200)
      isTruncated = true
    }
    const navigationId = `chatgpt-native-user-query::${entry.index}::${this.normalizeNativeTocText(entry.text)}`
    const messageId = this.getChatGPTMessageId(entry.element)

    return {
      level: 0,
      text,
      element: entry.element,
      isUserQuery: true,
      isTruncated,
      id: messageId || navigationId,
      navigationId,
      wordCount,
    }
  }

  private resolveNativeTocEntryForOutlineItem(
    item: Pick<OutlineItem, "id" | "navigationId">,
  ): ChatGPTNativeTocEntry | null {
    const index = this.getNativeTocOutlineIndex(item.navigationId || item.id)
    if (index !== null) {
      return this.getNativeTocButtonEntryForIndex(index)
    }

    return null
  }

  private async waitForNativeTocUserQuery(
    entry: ChatGPTNativeTocEntry,
    text: string,
    timeoutMs = 1600,
  ): Promise<Element | null> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      await this.sleep(80)
      const candidate = this.findNativeTocUserQueryCandidate(
        text || entry.text,
        this.getActiveNativeTocIndex() === entry.index,
      )
      if (candidate) return candidate
    }

    return null
  }

  private findNativeTocUserQueryCandidate(
    text: string,
    activeIndexMatched: boolean,
  ): Element | null {
    const container =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    const candidates = Array.from(document.querySelectorAll(this.getUserQuerySelector())).filter(
      (element) => this.isVisible(element) && this.isElementInViewport(element, container),
    )

    if (candidates.length === 0) return null

    const textMatches = candidates.filter((element) =>
      this.isCompatibleNativeTocText(this.extractUserQueryText(element), text),
    )
    if (textMatches.length === 0) return null

    if (activeIndexMatched) {
      return this.getClosestVisibleElementToViewportCenter(textMatches, container)
    }

    return textMatches.length === 1 ? textMatches[0] : null
  }

  private isElementInViewport(element: Element, container: Element | null): boolean {
    const rect = element.getBoundingClientRect()
    const viewportTop = container instanceof HTMLElement ? container.getBoundingClientRect().top : 0
    const viewportBottom =
      container instanceof HTMLElement
        ? container.getBoundingClientRect().bottom
        : window.innerHeight

    return rect.bottom > viewportTop && rect.top < viewportBottom
  }

  private getClosestVisibleElementToViewportCenter(
    elements: Element[],
    container: Element | null,
  ): Element | null {
    const viewportRect = container instanceof HTMLElement ? container.getBoundingClientRect() : null
    const viewportCenter = viewportRect
      ? viewportRect.top + viewportRect.height / 2
      : window.innerHeight / 2

    return (
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return {
            element,
            distance: Math.abs(rect.top + rect.height / 2 - viewportCenter),
          }
        })
        .sort((left, right) => left.distance - right.distance)[0]?.element || null
    )
  }

  private getElementRenderOrder(element: Element, container: Element): number {
    const target = (
      this.getChatGPTTurnId(element)
        ? element.closest("[data-turn-id], [data-turn-id-container]") || element
        : element
    ) as HTMLElement
    const targetRect = target.getBoundingClientRect()

    if (container instanceof HTMLElement) {
      const containerRect = container.getBoundingClientRect()
      return container.scrollTop + (targetRect.top - containerRect.top)
    }

    return window.scrollY + targetRect.top
  }

  private getOutlineCacheSessionKey(): string {
    const cid = this.getCurrentCid() || "default"
    const sessionId = this.getSessionId() || "default"
    return `${cid}:${sessionId}:${window.location.pathname}`
  }

  private ensureOutlineCacheSession(): void {
    const sessionKey = this.getOutlineCacheSessionKey()
    if (sessionKey === this.outlineCacheSessionKey) return

    const isFirstSession = this.outlineCacheSessionKey === ""
    this.outlineCacheSessionKey = sessionKey
    this.outlineItemCache.clear()
    this.outlineTurnFirstSeenIndex.clear()
    this.outlineTurnFirstSeenCounter = 0
    this.nativeTocTextCache = []
    this.nativeTocButtonElementSignatureCache = ""
    this.nativeTocRevealAttemptedSignature = ""
    this.nativeTocRefreshScheduled = false
    this.nativeTocButtonElementIds = new WeakMap()
    this.nativeTocButtonElementIdCounter = 0
    // SPA 切换会话时（不是首次初始化）进入过渡期：ChatGPT 的 URL 同步切换、但
    // DOM 替换是异步的；此时 extractOutline 抓到的仍是上一个会话的残留节点，
    // 若立刻当成"新会话 cache"写进去，等 DOM 完成切换、新会话内容到位时再做
    // merge 就会把上一个会话的条目追加到末尾。
    // 过渡期内 extractOutline 跳过 cache 写入与合并，只返回 DOM 实时内容；
    // 等过了过渡期再恢复正常的"虚拟滚动兜底"行为。
    this.outlineCacheTransitionEndAt = isFirstSession ? 0 : Date.now() + 2000
  }

  private isInOutlineCacheTransition(): boolean {
    return Date.now() < this.outlineCacheTransitionEndAt
  }

  private getChatGPTTurnId(element: Element | null): string | null {
    if (!element) return null

    const turnElement =
      element.closest("[data-turn-id]") || element.closest("[data-turn-id-container]")
    return (
      turnElement?.getAttribute("data-turn-id") ||
      turnElement?.getAttribute("data-turn-id-container") ||
      null
    )
  }

  private getChatGPTMessageId(element: Element | null): string | null {
    if (!element) return null

    return (
      element.getAttribute("data-message-id") ||
      element.closest("[data-message-id]")?.getAttribute("data-message-id") ||
      null
    )
  }

  private getOrderedChatGPTTurnAnchors(container: Element): Map<string, ChatGPTTurnAnchor> {
    const anchors = new Map<string, ChatGPTTurnAnchor>()
    let index = 0

    const addAnchor = (element: Element): void => {
      const turnId =
        element.getAttribute("data-turn-id-container") || element.getAttribute("data-turn-id")
      if (!turnId || anchors.has(turnId)) return

      anchors.set(turnId, { element, index })
      index += 1
    }

    container.querySelectorAll("[data-turn-id-container], [data-turn-id]").forEach(addAnchor)

    return anchors
  }

  /**
   * 记录每个出现过的 turn 的 first-seen DOM 顺序。
   * 即使后续 turn-shell 也被虚拟滚动卸载，仍能依靠这个稳定序号排序。
   */
  private recordTurnDocumentOrders(turnAnchors: Map<string, ChatGPTTurnAnchor>): void {
    if (turnAnchors.size === 0) return

    // 收集本次还未记录的 turn 并按当前 DOM 顺序入册
    const newTurns: string[] = []
    turnAnchors.forEach((_anchor, turnId) => {
      if (!this.outlineTurnFirstSeenIndex.has(turnId)) {
        newTurns.push(turnId)
      }
    })

    if (newTurns.length === 0) return

    // 如果之前已经有记录，且首次出现的 turn 位于已知 turn 之前（比如用户向上滚动揭示出更早的 turn），
    // 把新 turn 插入到对应位置之前。简单实现：用 turnAnchors 当前的 anchor.index 作为相对序，
    // 但为保持全局单调性，统一在尾部追加，靠 anchor.index 的当前值作为合并排序时的次要键。
    for (const turnId of newTurns) {
      this.outlineTurnFirstSeenIndex.set(turnId, this.outlineTurnFirstSeenCounter++)
    }
  }

  private getTurnSortIndex(
    turnId: string | null,
    turnAnchors: Map<string, ChatGPTTurnAnchor>,
  ): number {
    if (!turnId) return Number.MAX_SAFE_INTEGER
    const anchor = turnAnchors.get(turnId)
    if (anchor) return anchor.index
    const firstSeen = this.outlineTurnFirstSeenIndex.get(turnId)
    return typeof firstSeen === "number" ? firstSeen + 1_000_000 : Number.MAX_SAFE_INTEGER
  }

  private updateChatGPTOutlineCache(
    outline: OutlineItem[],
    turnAnchors: Map<string, ChatGPTTurnAnchor>,
  ): void {
    const orderByTurn = new Map<string, number>()

    for (const item of outline) {
      if (!item.id) continue
      if (this.isNativeTocOutlineId(item.id)) continue

      const turnId = this.getChatGPTTurnId(item.element)
      const orderKey = turnId || item.id
      const orderInTurn = orderByTurn.get(orderKey) || 0
      orderByTurn.set(orderKey, orderInTurn + 1)

      const firstSeenTurnIndex =
        turnId && this.outlineTurnFirstSeenIndex.has(turnId)
          ? (this.outlineTurnFirstSeenIndex.get(turnId) as number)
          : turnAnchors.get(turnId || "")?.index ?? Number.MAX_SAFE_INTEGER
      const cached = this.outlineItemCache.get(item.id)

      this.outlineItemCache.set(item.id, {
        id: item.id,
        level: item.level,
        text: item.text,
        turnId,
        firstSeenTurnIndex,
        orderInTurn,
        isUserQuery: item.isUserQuery,
        isTruncated: item.isTruncated,
        wordCount: item.wordCount ?? cached?.wordCount,
      })
    }
  }

  private mergeCachedChatGPTOutlineItems(
    outline: OutlineItem[],
    turnAnchors: Map<string, ChatGPTTurnAnchor>,
    maxLevel: number,
    includeUserQueries: boolean,
    showWordCount: boolean,
    hasNativeTocEntries = false,
  ): OutlineItem[] {
    if (this.outlineItemCache.size === 0) return outline

    const currentIds = new Set(outline.map((item) => item.id).filter((id): id is string => !!id))
    const hasNativeTocUserQueries =
      hasNativeTocEntries || outline.some((item) => this.isNativeTocOutlineId(item.id))
    let appended = 0
    const merged: OutlineItem[] = [...outline]

    for (const entry of this.outlineItemCache.values()) {
      if (this.isNativeTocOutlineId(entry.id)) continue
      if (currentIds.has(entry.id)) continue
      if (entry.isUserQuery && (!includeUserQueries || hasNativeTocUserQueries)) continue
      if (!entry.isUserQuery && entry.level > maxLevel) continue
      // 二次防御：缓存里若残留空文本条目（例如来自更早版本写入的脏数据），不要再回填到大纲
      if (!entry.text || !entry.text.trim()) continue

      merged.push({
        level: entry.level,
        text: entry.text,
        element: null,
        isUserQuery: entry.isUserQuery,
        isTruncated: entry.isTruncated,
        id: entry.id,
        wordCount: showWordCount ? entry.wordCount : undefined,
      })
      appended += 1
    }

    if (appended === 0) return outline

    return merged
      .map((item, originalIndex) => {
        const cached = item.id ? this.outlineItemCache.get(item.id) : undefined
        const turnId = cached?.turnId || this.getChatGPTTurnId(item.element)
        const nativeTocIndex = this.getNativeTocOutlineIndex(item.navigationId || item.id)
        const turnIndex =
          nativeTocIndex !== null ? nativeTocIndex * 2 : this.getTurnSortIndex(turnId, turnAnchors)
        return {
          item,
          originalIndex,
          orderInTurn: nativeTocIndex !== null ? 0 : cached?.orderInTurn ?? originalIndex,
          turnIndex,
        }
      })
      .sort((a, b) => {
        if (a.turnIndex !== b.turnIndex) return a.turnIndex - b.turnIndex
        if (a.orderInTurn !== b.orderInTurn) return a.orderInTurn - b.orderInTurn
        return a.originalIndex - b.originalIndex
      })
      .map(({ item }) => item)
  }

  /**
   * 通过缓存的 message-id 反查跳转目标。
   * 若真实节点已挂载 → 直接返回该节点；
   * 若仅有 turn-shell  → 返回 shell（点击后 ChatGPT 会重新挂载真实内容）；
   * 若两者都不在 DOM → 由调用方走兜底逻辑。
   */
  private resolveCachedChatGPTOutlineTarget(id: string | undefined): Element | null {
    if (!id) return null

    this.ensureOutlineCacheSession()

    const entry = this.outlineItemCache.get(id)
    if (!entry) return null

    const container = document.querySelector(this.getResponseContainerSelector())
    if (!container) return null

    // 1) message-id 是稳定的；先尝试用它找到真实节点
    const messageId = this.extractMessageIdFromCachedId(entry)
    if (messageId) {
      const escaped = this.escapeAttributeValue(messageId)
      const messageElement = container.querySelector(`[data-message-id="${escaped}"]`)
      if (messageElement) {
        if (entry.isUserQuery) {
          return messageElement
        }
        const heading = this.findHeadingInsideMessage(messageElement, entry)
        if (heading) return heading
        // 真实消息已挂载但 heading 尚未渲染完成，先返回消息容器，由调用方触发滚动后再二次定位
        return messageElement
      }
    }

    // 2) 退而求其次：返回 turn-shell
    if (entry.turnId) {
      const shell = this.getOrderedChatGPTTurnAnchors(container).get(entry.turnId)?.element
      if (shell) return shell
    }

    return null
  }

  private extractMessageIdFromCachedId(entry: ChatGPTOutlineCacheEntry): string | null {
    if (!entry.id) return null
    if (entry.isUserQuery) return entry.id
    // 标题 id 形如 msgId::tag-text::count；text 内可能含 "::"，所以只截首段
    const firstSep = entry.id.indexOf("::")
    return firstSep > 0 ? entry.id.slice(0, firstSep) : null
  }

  private escapeAttributeValue(value: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value)
    }
    return value.replace(/["\\]/g, "\\$&")
  }

  private findHeadingInsideMessage(
    messageElement: Element,
    entry: ChatGPTOutlineCacheEntry,
  ): Element | null {
    // id 形如 msgId::tag-text::count；text 可能含 "::"，所以从两端定位分隔符
    const firstSep = entry.id.indexOf("::")
    const lastSep = entry.id.lastIndexOf("::")
    if (firstSep <= 0 || lastSep <= firstSep) return null

    const tagAndText = entry.id.slice(firstSep + 2, lastSep)
    const countStr = entry.id.slice(lastSep + 2)

    const dashIndex = tagAndText.indexOf("-")
    if (dashIndex <= 0) return null

    const tagName = tagAndText.slice(0, dashIndex).toLowerCase()
    const expectedText = tagAndText.slice(dashIndex + 1)
    if (!/^h[1-6]$/.test(tagName)) return null

    const targetCount = Number.parseInt(countStr, 10) || 0
    const headings = Array.from(messageElement.querySelectorAll(tagName))
    let matched = 0
    for (const heading of headings) {
      if ((heading.textContent || "").trim() !== expectedText) continue
      if (matched === targetCount) return heading
      matched += 1
    }
    return null
  }

  async resolveOutlineTarget(
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery" | "id" | "navigationId">,
    queryIndex?: number,
  ): Promise<Element | null> {
    if (item.isUserQuery && item.level === 0) {
      const nativeTocEntry = this.resolveNativeTocEntryForOutlineItem(item)
      if (nativeTocEntry) {
        if (nativeTocEntry.element) return nativeTocEntry.element

        nativeTocEntry.button.scrollIntoView({ block: "nearest", inline: "nearest" })
        nativeTocEntry.button.click()

        const resolvedTarget = await this.waitForNativeTocUserQuery(nativeTocEntry, item.text)
        if (resolvedTarget) return resolvedTarget
      }
    }

    const cachedTarget = this.resolveCachedChatGPTOutlineTarget(item.id)
    if (cachedTarget) {
      // 若拿到的是 turn-shell 而非真实消息节点，主动滚动让 ChatGPT 重新挂载真实内容，
      // 然后再尝试拿到真实节点。避免点击后只跳到一个空占位符且没办法高亮真实标题。
      const isShell =
        cachedTarget instanceof HTMLElement && cachedTarget.hasAttribute("data-turn-id-container")
      if (isShell) {
        this.scrollIntoViewForRevive(cachedTarget)
        const remounted = await this.waitForCachedChatGPTOutlineTargetRemount(item.id)
        if (remounted) return remounted
      }
      return cachedTarget
    }

    return super.resolveOutlineTarget(item, queryIndex)
  }

  private scrollIntoViewForRevive(element: HTMLElement): void {
    try {
      element.scrollIntoView({ block: "center", behavior: "instant" } as ScrollIntoViewOptions)
    } catch {
      // 旧浏览器不支持 instant
      element.scrollIntoView({ block: "center" })
    }
  }

  private async waitForCachedChatGPTOutlineTargetRemount(
    id: string | undefined,
    timeoutMs = 1500,
  ): Promise<Element | null> {
    if (!id) return null
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      await this.sleep(60)
      const target = this.resolveCachedChatGPTOutlineTarget(id)
      if (
        target &&
        !(target instanceof HTMLElement && target.hasAttribute("data-turn-id-container"))
      ) {
        return target
      }
    }
    return null
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    let outline: OutlineItem[] = []
    const container = this.getOutlineExtractionContainer()
    if (!container) return outline

    this.ensureOutlineCacheSession()

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

    const userQuerySelector = this.getUserQuerySelector()
    const allUserQueries = showWordCount
      ? Array.from(container.querySelectorAll(userQuerySelector))
      : []
    const allAssistants = showWordCount
      ? Array.from(container.querySelectorAll(this.config.selectors.assistantResponse))
      : []
    const textSignatureCache = new WeakMap<Element, string>()
    const getTextSignature = (element: Element | null): string => {
      if (!element) return "none"
      const cached = textSignatureCache.get(element)
      if (cached) return cached
      const signature = hashTextForCache(element.textContent || "")
      textSignatureCache.set(element, signature)
      return signature
    }

    // container 参数用于处理最后一个元素（没有 nextEl 时）
    // isUserQuery 参数用于用户提问的特殊处理（直接获取 AI 回复内容，跳过标签）
    const calculateWordCount = (
      startEl: Element,
      nextEl: Element | null,
      isUserQueryItem: boolean,
    ): number => {
      if (!startEl) return 0
      const signature = [
        isUserQueryItem ? "user" : "heading",
        getTextSignature(startEl),
        getTextSignature(nextEl),
        getTextSignature(container),
      ].join("|")
      const cached = this.outlineWordCountCache.get(startEl)
      if (cached?.signature === signature) return cached.count

      try {
        // 对于用户提问，直接获取后续 AI 回复的 markdown 内容
        // 这样可以跳过 "ChatGPT 说：" 等标签
        if (isUserQueryItem) {
          // 查找 startEl 与 nextEl 之间的所有 AI 回复内容容器
          let totalText = ""

          for (const assistant of allAssistants) {
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
            const markdownContent = assistant.querySelector(
              this.config.sitePrivateSelectors.assistantMarkdown,
            )
            if (markdownContent) {
              totalText += markdownContent.textContent || ""
            } else {
              // 回退：获取整个 assistant 的文本，但排除可能的标题
              const clone = assistant.cloneNode(true) as Element
              // 移除可能的发言人标签
              const srOnly = clone.querySelectorAll(
                [
                  this.config.sitePrivateSelectors.srOnly,
                  this.config.sitePrivateSelectors.srOnlyFallback,
                ].join(", "),
              )
              srOnly.forEach((el) => el.remove())
              totalText += clone.textContent || ""
            }
          }

          if (!totalText && this.isCodexTaskPage()) {
            totalText =
              container.querySelector(this.config.sitePrivateSelectors.codexTaskMarkdown)
                ?.textContent || ""
          }

          const text = totalText.trim()
          const count = text.length
          this.outlineWordCountCache.set(startEl, { signature, count })
          return count
        }

        // 对于标题（Heading），使用 Range 方式
        // 当 nextEl 存在时，直接使用基类方法
        if (nextEl) {
          const count = this.calculateRangeWordCount(startEl, nextEl, container)
          this.outlineWordCountCache.set(startEl, { signature, count })
          return count
        }

        // 如果没有下一个边界元素，需要找到正确的终点
        // 策略：从 startEl 在 DOM 中向后遍历，找到下一个用户提问元素
        let foundCurrent = false
        let nextUserQuery: Element | null = null

        for (const uq of allUserQueries) {
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
          const count = this.calculateRangeWordCount(startEl, nextUserQuery, container)
          this.outlineWordCountCache.set(startEl, { signature, count })
          return count
        }

        // 真正的最后一个用户提问，找对应的 AI 回复容器末尾
        if (allAssistants.length > 0) {
          const lastAssistant = allAssistants[allAssistants.length - 1]
          const count = this.calculateRangeWordCount(startEl, null, lastAssistant)
          this.outlineWordCountCache.set(startEl, { signature, count })
          return count
        }
        const count = this.calculateRangeWordCount(startEl, null, container)
        this.outlineWordCountCache.set(startEl, { signature, count })
        return count
      } catch {
        return 0
      }
    }

    // 统一处理逻辑：按照文档顺序收集所有相关元素（UserQuery 和 Headings）
    const headingSelectors: string[] = []
    for (let i = 1; i <= maxLevel; i++) {
      headingSelectors.push(`h${i}`)
    }

    const combinedSelector = `${userQuerySelector}, ${headingSelectors.join(", ")}`
    // 获取所有潜在的节点（按文档顺序）
    const allElements = Array.from(container.querySelectorAll(combinedSelector))

    const nativeTocEntries = includeUserQueries ? this.getNativeTocEntries() : []

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
          const headingText = (element.textContent || "").trim()
          const level = parseInt(tagName.charAt(1), 10)
          // 跳过空文本 heading：ChatGPT 流式生成时会先渲染空 <h2></h2> 占位再填文本，
          // 抓到的瞬间会污染缓存——之后 text 写入后 ID 因为带 text 而变化，
          // 老空 entry 仍残留在缓存里，merge 时就会把"空白条目"加回到大纲。
          if (headingText && level <= maxLevel) shouldCollect = true
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
        const msgId = this.getChatGPTMessageId(element)
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

    if (nativeTocEntries.length > 0) {
      const sortedEntries: ChatGPTOutlineSortEntry[] = []
      const lastNativeTocIndex = nativeTocEntries.reduce(
        (maxIndex, entry) => Math.max(maxIndex, entry.index),
        -1,
      )
      const calculateNativeTocWordCount = (entry: ChatGPTNativeTocEntry): number | undefined => {
        if (!showWordCount || !entry.element) return undefined

        const nextEntry = nativeTocEntries.find((candidate) => candidate.index > entry.index)
        if (nextEntry?.element) {
          return calculateWordCount(entry.element, nextEntry.element, true)
        }

        if (!nextEntry && entry.index === lastNativeTocIndex) {
          return calculateWordCount(entry.element, null, true)
        }

        return undefined
      }
      const visibleUserAnchors = nativeTocEntries
        .filter((entry): entry is ChatGPTNativeTocEntry & { element: Element } =>
          Boolean(entry.element),
        )
        .map((entry) => ({
          index: entry.index,
          renderOrder: this.getElementRenderOrder(entry.element, container),
        }))
        .sort((left, right) => left.renderOrder - right.renderOrder)

      const activeTocEntry = nativeTocEntries.find((entry) => entry.isActive)
      const estimateUserOrderForElement = (element: Element): number => {
        const elementOrder = this.getElementRenderOrder(element, container)
        let previousAnchor: { index: number; renderOrder: number } | undefined
        let nextAnchor: { index: number; renderOrder: number } | undefined

        for (const anchor of visibleUserAnchors) {
          if (anchor.renderOrder <= elementOrder) {
            previousAnchor = anchor
          } else {
            nextAnchor = anchor
            break
          }
        }

        if (previousAnchor) return previousAnchor.index
        if (nextAnchor) return Math.max(0, nextAnchor.index - 1)
        return activeTocEntry?.index ?? 0
      }

      nativeTocEntries.forEach((entry) => {
        sortedEntries.push({
          item: this.createNativeTocUserQueryOutlineItem(entry, calculateNativeTocWordCount(entry)),
          order: entry.index * 100000,
        })
      })

      outline
        .filter((item) => !item.isUserQuery)
        .forEach((item, index) => {
          const orderBase = item.element ? estimateUserOrderForElement(item.element) : 0
          sortedEntries.push({
            item,
            order: orderBase * 100000 + 50000 + index,
          })
        })

      outline = sortedEntries
        .sort((left, right) => left.order - right.order)
        .map(({ item }) => item)
    }

    const turnAnchors = this.getOrderedChatGPTTurnAnchors(container)

    // SPA 切换过渡期：跳过 cache 写入与合并，仅返回当前 DOM 真实可见的内容。
    // ChatGPT 在 URL 改变后还会异步把旧会话的 DOM 替换为新会话的，提前写 cache
    // 会把旧会话节点污染进新会话；提前 merge 又会把上次留存的 cache（如果有）
    // 追加到末尾。等过渡期结束再让 cache 介入即可。
    if (this.isInOutlineCacheTransition()) {
      return outline
    }

    this.recordTurnDocumentOrders(turnAnchors)
    this.updateChatGPTOutlineCache(outline, turnAnchors)

    // 始终尝试与缓存合并：虚拟滚动可能让 shell 数量也缩水，仅靠"shell > role 数"
    // 的判定会漏掉只剩当前视口可见的极端情况。合并函数自身在没有可追加项时是 no-op。
    return this.mergeCachedChatGPTOutlineItems(
      outline,
      turnAnchors,
      maxLevel,
      includeUserQueries,
      showWordCount,
      nativeTocEntries.length > 0,
    )
  }

  // ==================== 生成状态检测 ====================

  isGenerating(): boolean {
    return this.findVisibleElementBySelectors([...this.config.generating.existsSelectors]) !== null
  }

  getStopButtonSelectors(): string[] {
    return [...this.config.selectors.stopButton]
  }

  private findModelSelectorButton(): HTMLElement | null {
    return this.findElementBySelectors([...this.config.modelSwitcher.selectorButtonSelectors])
  }

  private getModelStateContextKey(): string {
    const cid = this.getCurrentCid() || "default"
    const sessionId = this.getSessionId() || window.location.pathname || "root"
    return `${cid}::${sessionId}`
  }

  private getLatestMessageModelSlug(): string | null {
    const nodes = document.querySelectorAll(this.config.sitePrivateSelectors.modelMessageSlug)
    const lastMsg = nodes[nodes.length - 1]
    return lastMsg?.getAttribute("data-message-model-slug")?.trim() || null
  }

  private readModelStateFromOpenMenu(): { name: string | null; slug: string | null } | null {
    const privateSelectors = this.config.sitePrivateSelectors
    const menu = document.querySelector(privateSelectors.modelMenu)
    if (!this.isVisible(menu)) return null

    const items = Array.from(document.querySelectorAll(privateSelectors.modelMenuItem))
    if (items.length === 0) return null

    let selectedName: string | null = null
    let selectedSlug: string | null = null

    for (const item of items) {
      // slug：从 data-testid 提取（如 "model-switcher-gpt-5-3" → "gpt-5-3"）
      const dataTestId = item.getAttribute("data-testid") || ""
      const slug = dataTestId.startsWith("model-switcher-")
        ? dataTestId.replace(/^model-switcher-/, "").trim()
        : ""

      // 名称：菜单项结构为 <span class="flex min-w-0 ...">Instant<span ...></span></span>
      // 模型名是 .min-w-0 span 的直接文本节点，不能直接用 textContent（会包含子 span 文本）
      const nameSpan = item.querySelector(privateSelectors.modelNameContainer)
      const name = nameSpan
        ? Array.from(nameSpan.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent?.trim())
            .find(Boolean) ||
          nameSpan.textContent?.replace(/\s+/g, " ").trim() ||
          ""
        : item.textContent?.replace(/\s+/g, " ").trim() || ""

      if (slug && name) {
        this.cachedModelDisplayNamesBySlug.set(slug, name)
      }

      // 选中判断：依次尝试多种 Radix / 自定义指示器
      const isSelected =
        Boolean(item.querySelector(privateSelectors.modelSelectedIndicator)) ||
        item.getAttribute("data-state") === "checked" ||
        item.getAttribute("aria-checked") === "true" ||
        item.getAttribute("aria-selected") === "true"

      if (isSelected) {
        selectedName = name || null
        selectedSlug = slug || null
      }
    }

    // 菜单关闭后仍需要 slug 来做本地化匹配，持久化到字段
    if (selectedSlug) {
      this.lastKnownModelSlug = selectedSlug
      this.lastKnownModelSlugContextKey = this.getModelStateContextKey()
      this.lastKnownModelSlugObservedAt = Date.now()
    }

    return {
      name: selectedName,
      slug: selectedSlug,
    }
  }

  private extractModelNameFromSelectorButton(modelBtn: HTMLElement): string | null {
    // Pill 按钮直接在 truncate span 中显示当前模型名（如 "Instant", "Thinking"）
    return (
      modelBtn
        .querySelector(this.config.sitePrivateSelectors.modelSelectorName)
        ?.textContent?.trim() || null
    )
  }

  private getReliableCurrentModelSignals(): string[] {
    const selectedModelFromMenu = this.readModelStateFromOpenMenu()
    const selectorBtn = this.findModelSelectorButton()
    const signals = [
      selectedModelFromMenu?.name,
      selectedModelFromMenu?.slug,
      selectorBtn ? this.extractModelNameFromSelectorButton(selectorBtn) : null,
    ]

    return signals.filter((value): value is string => Boolean(value && value.trim()))
  }

  private getCurrentModelSignalsForLockCheck(): string[] {
    const selectedModelFromMenu = this.readModelStateFromOpenMenu()
    const selectorBtn = this.findModelSelectorButton()
    const signals = [
      selectedModelFromMenu?.name,
      selectedModelFromMenu?.slug,
      // 菜单关闭后仍保留 slug，解决本地化名称（如"思考"）与关键词（如"think"）不匹配的循环
      // 真实会话（/c/UUID）：contextKey 匹配即有效；新对话页（/）：contextKey 不唯一，改用 60s TTL 兼容
      this.lastKnownModelSlug &&
      (this.isNewConversation()
        ? Date.now() - this.lastKnownModelSlugObservedAt < 60_000
        : this.lastKnownModelSlugContextKey === this.getModelStateContextKey())
        ? this.lastKnownModelSlug
        : null,
      // 最新消息的模型 slug（对话中已有消息时可用）
      this.getLatestMessageModelSlug(),
      selectorBtn ? this.extractModelNameFromSelectorButton(selectorBtn) : null,
    ]

    return signals.filter((value): value is string => Boolean(value && value.trim()))
  }

  getModelName(): string | null {
    const selectedModelFromMenu = this.readModelStateFromOpenMenu()
    if (selectedModelFromMenu?.name) {
      return selectedModelFromMenu.name
    }

    const messageModel = this.getLatestMessageModelSlug()
    if (messageModel) {
      return this.cachedModelDisplayNamesBySlug.get(messageModel) || messageModel
    }

    const modelBtn = this.findModelSelectorButton()
    if (modelBtn) {
      const selectorModel = this.extractModelNameFromSelectorButton(modelBtn)
      if (selectorModel) {
        return selectorModel
      }
    }

    return null
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
    const { urlPatterns, urlPathEndsWith, requestBodyRules, ...config } = this.config.networkMonitor
    return {
      ...config,
      urlPatterns: [...urlPatterns],
      ...(urlPathEndsWith ? { urlPathEndsWith: [...urlPathEndsWith] } : {}),
      ...(requestBodyRules
        ? {
            requestBodyRules: requestBodyRules.map((rule) => ({
              ...rule,
              metadata: { ...rule.metadata },
            })),
          }
        : {}),
    }
  }

  // ==================== 模型锁定 ====================

  getDefaultLockSettings(): { enabled: boolean; keyword: string } {
    return { enabled: false, keyword: "" }
  }

  getModelLockCheckText(_selectorBtn?: HTMLElement | null): string {
    return this.getCurrentModelSignalsForLockCheck().join(" ")
  }

  findElementBySelectors(selectors: string[]): HTMLElement | null {
    for (const selector of selectors) {
      const candidates = Array.from(document.querySelectorAll(selector))
      for (const candidate of candidates) {
        if (this.isVisible(candidate)) {
          return candidate
        }
      }
    }
    return super.findElementBySelectors(selectors)
  }

  lockModel(keyword: string, onSuccess?: () => void): void {
    const normalizedKeyword = keyword.trim()
    if (!normalizedKeyword) return

    const normalizedTarget = normalizedKeyword.toLowerCase()
    const currentModelSignals = this.getReliableCurrentModelSignals().join(" ").toLowerCase().trim()

    if (currentModelSignals.includes(normalizedTarget)) {
      onSuccess?.()
      return
    }

    const selectorBtn = this.findModelSelectorButton()
    const isMenuOpen =
      selectorBtn?.getAttribute("aria-expanded") === "true" ||
      Boolean(this.readModelStateFromOpenMenu())
    const isRapidRepeat =
      this.lastModelLockAttemptKeyword === normalizedKeyword &&
      Date.now() - this.lastModelLockAttemptAt < CHATGPT_MODEL_LOCK_REENTRY_COOLDOWN_MS

    if (isMenuOpen || isRapidRepeat) {
      return
    }

    this.lastModelLockAttemptKeyword = normalizedKeyword
    this.lastModelLockAttemptAt = Date.now()

    super.lockModel(normalizedKeyword, () => {
      this.lastModelLockAttemptAt = 0
      onSuccess?.()
    })
  }

  clickModelSelector(): boolean {
    const button = this.findModelSelectorButton()
    if (!button) {
      return false
    }
    this.simulateClick(button)
    return true
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig {
    const config = this.config.modelSwitcher
    return {
      targetModelKeyword: keyword,
      ...config,
      selectorButtonSelectors: [...config.selectorButtonSelectors],
      ...(config.subMenuTriggers ? { subMenuTriggers: [...config.subMenuTriggers] } : {}),
    }
  }

  /**
   * 覆盖点击模拟方法
   * ChatGPT 新版模型菜单对重复事件较敏感。
   * 优先使用原生 click，必要时再补 pointerdown，避免一次调用里把菜单打开又关闭。
   */
  protected simulateClick(element: HTMLElement): void {
    const isModelSelectorTrigger = element.matches(
      this.config.modelSwitcher.selectorButtonSelectors.join(", "),
    )

    if (isModelSelectorTrigger) {
      const expandedBeforeClick = element.getAttribute("aria-expanded")
      element.click()

      const expandedAfterClick = element.getAttribute("aria-expanded")
      if (expandedAfterClick === "true" || expandedAfterClick !== expandedBeforeClick) {
        return
      }

      const eventWindow = this.getElementWindow(element)
      const PointerEventCtor = eventWindow.PointerEvent
      if (PointerEventCtor) {
        element.dispatchEvent(
          new PointerEventCtor("pointerdown", {
            bubbles: true,
            cancelable: true,
            view: eventWindow,
            pointerId: 1,
            button: 0,
            buttons: 1,
            pointerType: "mouse",
            isPrimary: true,
          }),
        )
      } else {
        element.dispatchEvent(
          new eventWindow.MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            view: eventWindow,
            button: 0,
            buttons: 1,
          }),
        )
      }
      return
    }

    element.click()
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
