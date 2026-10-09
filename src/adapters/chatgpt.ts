/**
 * ChatGPT 适配器 (chatgpt.com)
 */
import { SITE_IDS } from "~constants"
import {
  chatgptNativeThemeCss,
  ensureChatGPTThemeToggleStyle,
} from "~styles/native-theme-adapters/chatgpt"
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
import {
  parseChatGPTHistoryExport,
  parseChatGPTHistoryPage,
  type ChatGPTHistoryExportMessage,
} from "./chatgpt-history-export"
import {
  CHATGPT_CONFIG,
  CHATGPT_CONFIG_VERSION,
  CHATGPT_HOME_UX_SCOPE,
  CHATGPT_NEW_UX_SCOPE,
  CHATGPT_NEW_UX_WIDTH_SELECTORS,
  type ChatGPTSiteConfig,
} from "./chatgpt-config"

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
// ChatGPT 长对话采用虚拟滚动：滚出视口的消息内容会被卸载，
// 只剩 [data-turn-id-container] 占位符。直接 querySelectorAll 会漏掉这些消息，
// 导致导出内容缺失；而某些情况下旧版本/重生成的消息节点仍残留在 DOM 中，
// 不去重又会让同一条消息出现多次。
// 解决方案：导出前滚动遍历整个对话，按 message-id 去重收集快照，
// 挂载到隐藏 DOM 后切换 ExportConfig 指向快照节点。

const CHATGPT_EXPORT_ROOT_ATTR = "data-gh-chatgpt-export-root"
const CHATGPT_EXPORT_TURN_ATTR = "data-gh-chatgpt-export-turn"
const CHATGPT_EXPORT_ROLE_ATTR = "data-gh-chatgpt-export-role"
const CHATGPT_EXPORT_ROLE_USER = "user"
const CHATGPT_EXPORT_ROLE_ASSISTANT = "assistant"
const CHATGPT_EXPORT_TURN_SELECTOR = `[${CHATGPT_EXPORT_ROOT_ATTR}="1"] [${CHATGPT_EXPORT_TURN_ATTR}="1"]`
const CHATGPT_EXPORT_USER_SELECTOR = `[${CHATGPT_EXPORT_ROOT_ATTR}="1"] [${CHATGPT_EXPORT_ROLE_ATTR}="${CHATGPT_EXPORT_ROLE_USER}"]`
const CHATGPT_EXPORT_ASSISTANT_SELECTOR = `[${CHATGPT_EXPORT_ROOT_ATTR}="1"] [${CHATGPT_EXPORT_ROLE_ATTR}="${CHATGPT_EXPORT_ROLE_ASSISTANT}"]`
// 新版结构：离屏 turn 只剩外层占位 div[data-turn-id-container]，挂载后内层才出现
// section[data-turn][data-testid=conversation-turn-N]。提取内容前要先解析到内层。
// [CHATGPT-TURN-KEY]: 最新结构外层为 div[data-turn-key]，挂载后内层出现
// div[data-content-search-turn-key]，消息单元为 [data-content-search-unit-key]。
const CHATGPT_EXPORT_MOUNTED_TURN_SELECTOR =
  'section[data-turn], [data-testid^="conversation-turn"], [data-content-search-turn-key]'

// conversations 接口导出：每页拉取的 turn 数与分页上限（防止游标链断裂时无限翻页）
const CHATGPT_API_PAGE_TURNS = 100
const CHATGPT_API_EXPORT_MAX_PAGES = 50

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

interface ChatGPTOutlineWordCountCacheEntry {
  signature: string
  count: number
}

export class ChatGPTAdapter extends SiteAdapter {
  protected config: ChatGPTSiteConfig = CHATGPT_CONFIG
  private sessionAccessToken: string | null = null
  private sessionAccessTokenExpiresAt = 0
  private lastModelLockAttemptAt = 0
  private lastModelLockAttemptKeyword = ""
  private cachedModelDisplayNamesBySlug = new Map<string, string>()
  // 菜单打开时读到的当前选中模型 slug，菜单关闭后仍可用于本地化匹配（如 "think" vs "思考"）
  // 绑定 contextKey，切换对话/账号后自动失效；新对话页路径始终为 "/" 无法区分对话，額外用 TTL 兼容
  private lastKnownModelSlug: string | null = null
  private lastKnownModelSlugContextKey = ""
  private lastKnownModelSlugObservedAt = 0
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
    // 自有对话：/c/ID    分享对话：/share/e/ID
    return window.location.pathname.startsWith("/share/")
  }

  isUserConversationPage(): boolean {
    return !this.isSharePage() && /^\/c\/[a-z0-9-]+(?:\/|$)/i.test(window.location.pathname)
  }

  /**
   * 获取当前账户标识（用于对话隔离）
   * ChatGPT 通过 localStorage._account 区分不同账户/团队
   * 个人空间为 "personal"、空或缺失，统一返回 null
   * 团队空间返回工作区 UUID
   */
  getCurrentCid(): string | null {
    try {
      const account = localStorage.getItem("_account")
      if (!account) return null
      let parsed: unknown = account
      try {
        parsed = JSON.parse(account)
      } catch {
        // 静默处理非 JSON 字符串
      }
      if (typeof parsed !== "string" || !parsed || parsed === "personal") {
        return null
      }
      return parsed
    } catch {
      // 静默处理解析错误
    }
    return null
  }

  // ==================== 对话管理 ====================

  private getChatGPTConversationLinks(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>(this.config.conversation.itemSelector),
    ).filter((el): el is HTMLElement => Boolean(this.getChatGPTConversationId(el)))
  }

  private getChatGPTConversationId(el: Element): string | null {
    // [CHATGPT-APP-SHELL]: 优先从新版外层或自身 data-* 属性中提取 conversation ID
    const closestKey =
      typeof el.closest === "function"
        ? el
            .closest("[data-sidebar-chatgpt-conversation-key]")
            ?.getAttribute("data-sidebar-chatgpt-conversation-key") ||
          el
            .closest("[data-pinned-content-tab-drop-key]")
            ?.getAttribute("data-pinned-content-tab-drop-key")
        : null
    const dataKey =
      el.getAttribute("data-sidebar-chatgpt-conversation-key") ||
      el.getAttribute("data-pinned-content-tab-drop-key") ||
      closestKey
    if (dataKey) {
      const match = dataKey.match(/(?:^|:)conversation:([a-z0-9-]+)/i)
      if (match) return match[1]
    }

    // [LEGACY-CHATGPT-V1]: 旧版从 href 属性提取，待新版全量后清理
    const href = el.getAttribute(this.config.conversation.idFrom.attr ?? "href") || ""
    return href.match(new RegExp(this.config.conversation.idFrom.regex, "i"))?.[1] || null
  }

  private getChatGPTConversationPath(id: string): string {
    return this.config.conversation.urlTemplate.replace("{id}", id)
  }

  private getChatGPTConversationTitleElement(el: Element): Element | null {
    // [CHATGPT-APP-SHELL]: 新版在 .sidebar-item 或自身节点上带有 aria-label 标题
    const sidebarItem = el.matches(".sidebar-item") ? el : el.querySelector(".sidebar-item")
    if (sidebarItem?.getAttribute("aria-label")) {
      return sidebarItem
    }
    if (el.getAttribute("aria-label")) {
      return el
    }

    // [CHATGPT-APP-SHELL]: 新版跑马灯内容节点
    const marqueeTitle = el.querySelector('[data-marquee-content="true"] [dir="auto"]')
    if (marqueeTitle) return marqueeTitle

    // [LEGACY-CHATGPT-V1]: 旧版标题选择器，待新版全量后清理
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
    const title = (titleEl?.getAttribute("aria-label") || titleEl?.textContent || "").trim()
    const isActive = this.config.conversation.activeMatch
      ? el.matches(this.config.conversation.activeMatch) ||
        Boolean(el.querySelector(this.config.conversation.activeMatch))
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
    // [CHATGPT-APP-SHELL]: 新版通过 data-pinned-content-tab-drop-key 或取消置顶按钮判断
    const hasPinnedKey =
      Boolean(el.getAttribute("data-pinned-content-tab-drop-key")) ||
      (typeof el.closest === "function" &&
        Boolean(el.closest("[data-pinned-content-tab-drop-key]"))) ||
      Boolean(el.querySelector('button[aria-label*="取消置顶"], button[aria-label*="Unpin" i]'))
    if (hasPinnedKey) {
      return true
    }

    // [LEGACY-CHATGPT-V1]: 旧版置顶项不在 #history 内或含有多个 trailing 图标，待全量后清理
    const privateSelectors = this.config.sitePrivateSelectors
    const historySelector = this.config.selectors.sidebarScrollContainer
    const history = historySelector ? document.querySelector(historySelector) : null
    if (history && !history.contains(el)) {
      return true
    }

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
    // [CHATGPT-APP-SHELL]: 优先匹配新版专用侧边栏滚动容器
    const newSidebarScroll = document.querySelector("div[data-app-action-sidebar-scroll]")
    if (newSidebarScroll) return newSidebarScroll

    // [LEGACY-CHATGPT-V1]: 侧边栏滚动容器 - 通过 #history 向上查找最近的 nav 元素，待全量后清理
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
    // 通过对话 ID 查找侧边栏项
    const sidebarLink = this.findConversationRow(id)

    if (sidebarLink && this.config.conversation.navigationStrategy === "click-item") {
      // [CHATGPT-APP-SHELL]: 如果是新版外层 div 容器，优先点击内部带 role="button" 的 sidebar-item
      const clickable =
        sidebarLink.querySelector<HTMLElement>('.sidebar-item[role="button"]') || sidebarLink
      clickable.click()
      return true
    }
    // 降级：优先 history 导航免刷新（路由响应 popstate，已实测），失败再整页刷新
    if (url && this.navigateViaHistory(url)) return true
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
        this.sessionAccessTokenExpiresAt = this.getAccessTokenCacheExpiresAt(token, now)
        return token
      }

      this.clearSessionAccessToken()
      return null
    } catch {
      this.clearSessionAccessToken()
      return null
    }
  }

  /**
   * access token 的缓存截止：取 JWT payload 的 exp（服务端真实有效期，实测约 10 天），
   * 预留 5 分钟余量避免边界时刻用到将过期 token；解析失败回退 5 分钟短缓存。
   * token 真失效由调用方 401/403 强制刷新重试兜底（fetchConversationApiPage / 删除链路）。
   */
  private getAccessTokenCacheExpiresAt(token: string, now: number): number {
    const fallback = now + 5 * 60 * 1000
    try {
      const payload = token.split(".")[1]
      if (!payload) return fallback
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
      const decoded = JSON.parse(atob(padded)) as { exp?: unknown }
      if (typeof decoded.exp === "number" && decoded.exp > 0) {
        return decoded.exp * 1000 - 5 * 60 * 1000
      }
    } catch {
      // 非 JWT 形态（不透明 token）：回退短缓存
    }
    return fallback
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

  /** 站点原生 backend-api 请求头（删除/导出共用同一认证链路） */
  private buildNativeApiHeaders(
    token: string,
    options?: { json?: boolean },
  ): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "*/*",
      authorization: `Bearer ${token}`,
    }

    if (options?.json) {
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
    const headers = this.buildNativeApiHeaders(token, { json: method === "PATCH" })

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
    // [LEGACY-CHATGPT-V1] li / [CHATGPT-APP-SHELL] [role='listitem']
    const container = row.closest("li, [role='listitem']") || row
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
    // 统一按对话 ID 匹配，兼容相对与绝对两种写法。
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
      // [LEGACY-CHATGPT-V1] li / [CHATGPT-APP-SHELL] [role='listitem']
      row.closest("li, [role='listitem']"),
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
        current.querySelectorAll<HTMLElement>(this.config.conversation.itemSelector),
      )
      // 如果当前节点自身即为匹配项（如 App-Shell 的 div[data-sidebar-chatgpt-conversation-key]）
      if (
        typeof current.matches === "function" &&
        current.matches(this.config.conversation.itemSelector)
      ) {
        links.push(current)
      }
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

      // [LEGACY-CHATGPT-V1]: current.id === "history" 待全量后清理
      // [CHATGPT-APP-SHELL]: data-app-action-sidebar-scroll
      if (
        current.id === "history" ||
        Boolean(current.getAttribute("data-app-action-sidebar-scroll"))
      )
        break
      current = current.parentElement
    }

    // [LEGACY-CHATGPT-V1] li / [CHATGPT-APP-SHELL] [role='listitem']
    return (
      fallback ||
      (row.closest("li, [role='listitem']") as HTMLElement | null) ||
      row.parentElement ||
      row
    )
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

    const targetRow = this.findConversationRow(id)

    // [LEGACY-CHATGPT-V1]: li 待全量后清理
    // [CHATGPT-APP-SHELL]: [role="listitem"]
    const owner = button.closest("li, [role='listitem']")
    if (owner) {
      if (targetRow && (owner === targetRow || owner.contains(targetRow))) {
        return true
      }
      const ownerLinks = Array.from(
        owner.querySelectorAll<HTMLElement>(this.config.conversation.itemSelector),
      )
      if (
        ownerLinks.length === 1 &&
        this.getChatGPTConversationId(ownerLinks[0]) === id &&
        owner.contains(targetRow || button)
      ) {
        return true
      }
    }

    if (targetRow && (container === targetRow || container.contains(targetRow))) {
      return true
    }

    const linksInContainer = Array.from(
      container.querySelectorAll<HTMLElement>(this.config.conversation.itemSelector),
    )
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
    // [CHATGPT-TURN-KEY]: 新结构 aria-current="page" 挂在内层 .sidebar-item 上，
    // 外层会话项自身 matches 不到，需要同时查后代
    const selected = activeMatch
      ? this.getChatGPTConversationLinks().find(
          (link) => link.matches(activeMatch) || link.querySelector(activeMatch),
        )
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
    const container = this.findCurrentResponseContainer()
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
      {
        selector: `${CHATGPT_NEW_UX_SCOPE} [data-user-message-bubble="true"]`,
        property: "--user-chat-width",
        noCenter: true,
      },
    ]
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    const privateSelectors = this.config.sitePrivateSelectors
    return {
      scopeSelector: `:is(${privateSelectors.panelScope}):not(main main)`,
      scopeEachMatch: true,
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
        ...CHATGPT_NEW_UX_WIDTH_SELECTORS,
      ],
      insetSelectors: [
        {
          selector: `${CHATGPT_HOME_UX_SCOPE} [role="main"][class*="[container-name:home-main-content]"]`,
          insetMode: "edge",
          extraCss:
            "box-sizing: border-box !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: `${CHATGPT_NEW_UX_SCOPE} .thread-scroll-container[data-app-action-timeline-scroll]`,
          insetMode: "edge",
          extraCss:
            "box-sizing: border-box !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: `${CHATGPT_NEW_UX_SCOPE} [data-thread-scroll-footer="true"]`,
          leftProperty: "left",
          rightProperty: "right",
          insetMode: "edge",
          extraCss:
            "width: auto !important; max-width: none !important; min-width: 0 !important; box-sizing: border-box !important;",
        },
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
    const { hide, preserveFlow, rootClass, styles } = config
    return {
      ...(hide ? { hide: [...hide] } : {}),
      ...(preserveFlow ? { preserveFlow: [...preserveFlow] } : {}),
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
      // 输入框为空时跳过 selectAll：空选择是全文档样式重算的触发点之一，
      // 长对话页面上单次可达数十毫秒
      const hasExistingContent =
        editor.tagName === "TEXTAREA"
          ? (editor as HTMLTextAreaElement).value.length > 0
          : (editor.textContent?.length ?? 0) > 0
      if (hasExistingContent) {
        document.execCommand("selectAll", false, undefined)
      }
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
    // 保留的旧对话 surface 是 0x0 零尺寸但 scrollHeight 仍大于 clientHeight，
    // 且在 DOM 序上先于当前对话，必须先按可见性过滤，否则会选中旧对话的滚动容器
    const container = this.config.selectors.scrollContainer
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && this.isResponseContainerVisible(element),
      )
      .find((element) => element.scrollHeight > element.clientHeight)
    if (container) {
      return container
    }

    // 回退：查找 scrollHeight 最大的可滚动 div
    const allDivs = document.querySelectorAll("div")
    let bestContainer: HTMLElement | null = null
    let maxScrollHeight = 0
    for (const div of Array.from(allDivs)) {
      if (!this.isResponseContainerVisible(div as HTMLElement)) continue
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

  /**
   * 新版 App-Shell 切换对话后会把上一个对话的 main surface 隐藏保留在 DOM 里，
   * querySelector 首个匹配会命中旧对话容器，导致大纲/导出永远停在第一个对话。
   * 统一从所有匹配中挑第一个可见容器；都不可见时退回首个匹配，保持旧行为兜底。
   */
  private findCurrentResponseContainer(): HTMLElement | null {
    const matches = Array.from(
      document.querySelectorAll(this.getResponseContainerSelector()),
    ).filter((el): el is HTMLElement => el instanceof HTMLElement)
    return matches.find((el) => this.isResponseContainerVisible(el)) ?? matches[0] ?? null
  }

  private isResponseContainerVisible(el: HTMLElement): boolean {
    if (el.closest('[hidden], [aria-hidden="true"], [inert]')) return false
    // 实测：切换对话后旧 surface 以 0x0 零尺寸占位保留（display 仍为 flex），
    // display/visibility 判定无法识别，必须用实际布局尺寸
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    const style = window.getComputedStyle(el)
    return (
      style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse"
    )
  }

  /**
   * 新版界面切换对话会隐藏/替换整个 main surface：观察固定容器会在切换后失效，
   * 改为观察 body（mutation 回调本身有防抖），保证任何容器替换都能触发大纲刷新。
   */
  getObserveTarget(): Element | null {
    return document.body
  }

  private getOutlineExtractionContainer(): Element | null {
    return this.getCodexTaskOutlineContainer() || this.findCurrentResponseContainer()
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

    // 会话页统一优先走 conversations 接口拿全量历史（markdown 源文本，公式/代码
    // 零损耗，无需滚动分页）；接口不可用或无法证明历史完整时回退滚动收集
    const apiMessages = await this.collectApiExportMessageSnapshots(exportAssetCollector)
    if (apiMessages?.length) {
      this.mountExportSnapshot(apiMessages)
      this.exportBundle = {
        messages: apiMessages.map(({ role, content }) => ({ role, content })),
        assets: exportAssetCollector?.assets,
      }
      return { count: apiMessages.length }
    }

    // 接口路径不可用且 DOM 历史未预加载（manager 因 apiFirstExport 跳过了预加载）：
    // 返回 null 让导出流程补做预加载后重试，避免在只加载了部分历史的 DOM 上
    // 滚动采集得到不完整的导出
    if (context.domHistoryPreloaded === false) return null

    const responseRoot = this.findCurrentResponseContainer() || (document.body as HTMLElement)
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
   * 会话页统一优先走 conversations 接口拿全量 markdown（公式/代码零损耗、无需
   * 滚动收集）；接口是纯服务端数据源，与 DOM 世代无关，新老版本均可用。
   * 接口不可用或无法证明历史完整时返回 null，回退滚动收集。
   * 翻页：沿 page_info.start_cursor 向前（cursor 参数），直至 has_previous_page=false。
   */
  private async collectApiExportMessageSnapshots(
    collector?: ExportAssetCollector | null,
  ): Promise<ChatGPTExportMessageSnapshot[] | null> {
    if (!this.isUserConversationPage()) return null
    const cid = this.getSessionId()
    if (!cid) return null

    try {
      const pages: unknown[] = []
      let cursor: string | undefined
      let reachedHistoryStart = false
      for (let pageIndex = 0; pageIndex < CHATGPT_API_EXPORT_MAX_PAGES; pageIndex += 1) {
        const payload = await this.fetchConversationApiPage(cid, cursor)
        if (payload === null) return null
        const page = parseChatGPTHistoryPage(payload)
        if (!page || page.sessionId !== cid) return null
        pages.push(payload)
        if (!page.pageInfo.hasPreviousPage) {
          reachedHistoryStart = true
          break
        }
        cursor = page.pageInfo.startCursor
      }
      // 达到翻页上限仍有更早历史：无法证明历史完整，回退滚动收集而不是静默截断
      if (!reachedHistoryStart) return null

      const parsed = parseChatGPTHistoryExport(pages)
      if (!parsed || parsed.sessionId !== cid) return null

      const snapshots: ChatGPTExportMessageSnapshot[] = []
      for (const [index, message] of parsed.messages.entries()) {
        const blocks: string[] = []
        if (message.text) blocks.push(message.text)
        blocks.push(...(await this.renderApiExportAttachments(message, collector)))
        const content = this.normalizeExportMessageContent(blocks.join("\n\n"))
        if (!content) continue
        snapshots.push({
          role: message.role,
          turnKey: `api:${message.role}:${index}`,
          order: index + 1,
          content,
        })
      }
      return snapshots.length > 0 ? snapshots : null
    } catch (error) {
      console.warn("[ChatGPTAdapter] Failed to collect api export payload:", error)
      return null
    }
  }

  /**
   * 把接口消息里的附件/图片指针渲染为 markdown 块。
   * 指针（file-service:// / sediment://）与附件 id 统一经
   * backend-api/files/{id}/download 换签名下载地址；单个失败只跳过该附件，
   * 不影响整次导出。
   */
  private async renderApiExportAttachments(
    message: ChatGPTHistoryExportMessage,
    collector?: ExportAssetCollector | null,
  ): Promise<string[]> {
    if (message.attachments.length === 0 && message.imageAssetPointers.length === 0) {
      return []
    }

    const siteId = this.getSiteId()
    const blocks: string[] = []
    const imageSources: { source: string; alt: string; extensionHint?: string }[] = []
    const fileAttachments: { kind: "file"; name: string; source?: string; type?: string }[] = []
    const seenFileIds = new Set<string>()

    for (const attachment of message.attachments) {
      if (seenFileIds.has(attachment.id)) continue
      seenFileIds.add(attachment.id)
      const url = await this.fetchChatGPTFileDownloadUrl(attachment.id)
      if (attachment.mimeType.startsWith("image/")) {
        if (url) imageSources.push({ source: url, alt: attachment.name || "image" })
      } else {
        fileAttachments.push({
          kind: "file",
          name: attachment.name || "attachment",
          source: url ?? undefined,
          type: attachment.mimeType || attachment.name,
        })
      }
    }

    for (const item of message.imageAssetPointers) {
      const fileId = this.extractApiFileId(item.pointer)
      if (!fileId || seenFileIds.has(fileId)) continue
      seenFileIds.add(fileId)
      const url = await this.fetchChatGPTFileDownloadUrl(fileId)
      if (url) imageSources.push({ source: url, alt: item.alt, extensionHint: item.mimeType })
    }

    for (const image of imageSources) {
      const markdown = formatExportImageMarkdown(image, collector || undefined, {
        siteId,
        role: message.role,
        category: message.role === "user" ? "uploaded-image" : "generated-image",
        fallbackAlt: message.role === "user" ? "uploaded image" : "generated image",
      })
      if (markdown) blocks.push(markdown)
    }

    if (fileAttachments.length > 0) {
      const fileMarkdown = formatExportFileAttachments(fileAttachments, collector || undefined, {
        siteId,
        role: message.role,
      }).join("\n")
      if (fileMarkdown) blocks.push(`**Attachments:**\n\n${fileMarkdown}`)
    }

    return blocks
  }

  /** file-service://file-XXX / sediment://file_YYY → file id；裸 id 原样返回。 */
  private extractApiFileId(pointer: string): string {
    const schemeEnd = pointer.indexOf("://")
    const raw = schemeEnd >= 0 ? pointer.slice(schemeEnd + 3) : pointer
    return raw.split(/[?#]/)[0].trim()
  }

  /** backend-api/files/{id}/download 换签名下载地址；失败返回 null（调用方跳过该附件）。 */
  private async fetchChatGPTFileDownloadUrl(fileId: string): Promise<string | null> {
    try {
      const response = await this.fetchNativeApiWithAuth(
        `${window.location.origin}/backend-api/files/${encodeURIComponent(fileId)}/download`,
      )
      if (!response?.ok) return null
      const data = (await response.json()) as Record<string, unknown>
      const url = data?.download_url
      return typeof url === "string" && url ? url : null
    } catch {
      return null
    }
  }

  /** 拉取 conversations 接口单页；token 缺失返回 null，HTTP 失败抛错（401/403 强制刷新重试一次） */
  private async fetchConversationApiPage(cid: string, cursor?: string): Promise<unknown | null> {
    const response = await this.fetchNativeApiWithAuth(this.buildConversationApiUrl(cid, cursor))
    if (!response) return null
    if (!response.ok) {
      throw new Error(`conversations api responded ${response.status}`)
    }
    return response.json()
  }

  /** 带认证的站点原生接口 GET；token 缺失返回 null，401/403 强制刷新重试一次。 */
  private async fetchNativeApiWithAuth(url: string): Promise<Response | null> {
    let token = await this.getSessionAccessToken()
    if (!token) return null

    let response = await fetch(url, {
      headers: this.buildNativeApiHeaders(token),
      credentials: "include",
    })
    if (response.status === 401 || response.status === 403) {
      token = await this.getSessionAccessToken(true)
      if (!token) return null
      response = await fetch(url, {
        headers: this.buildNativeApiHeaders(token),
        credentials: "include",
      })
    }
    return response
  }

  private buildConversationApiUrl(cid: string, cursor?: string): string {
    const params = new URLSearchParams({
      num_turns: String(CHATGPT_API_PAGE_TURNS),
      include_has_versions: "true",
    })
    if (cursor) params.set("cursor", cursor)
    return `${window.location.origin}/backend-api/conversations/${encodeURIComponent(cid)}?${params}`
  }

  /**
   * 历史起点未加载完 = DOM 中最早的 conversation-turn-N 仍 N > 1。
   * 复用导出采集依赖的同一锚点（data-testid），不需要额外的加载指示器选择器。
   */
  hasUnloadedConversationHistory(): boolean {
    const turns = this.getAllTurnShellsSorted()
    if (turns.length === 0) return false
    const firstTurnNumber = this.getExportTurnSortIndex(turns[0])
    // 新版结构下离屏 shell（外层占位 div）没有 conversation-turn-N，无法确认起点，
    // 保守视为未加载完，让 catch-up 继续滚顶直到最早 turn 挂载出 N。
    // [CHATGPT-TURN-KEY]: 最新结构彻底移除了 conversation-turn-N（data-turn-key 无序号），
    // 整页都没有 N 时说明是新结构，无法再按序号判断起点；此时若仍返回 true，
    // catch-up 会永远等不到 N 而空转到超时，反而误报"导出可能不完整"。
    if (
      firstTurnNumber === Number.MAX_SAFE_INTEGER &&
      !document.querySelector('[data-testid^="conversation-turn-"]')
    ) {
      return false
    }
    if (firstTurnNumber === Number.MAX_SAFE_INTEGER) return true
    return firstTurnNumber > 1
  }

  /**
   * 会话页可走 conversations 接口导出全量历史（接口与 DOM 世代无关，新老版本
   * 均可用），无需 DOM 预加载；其余页面（首页等）维持导出前的滚顶预加载。
   */
  canSkipExportHistoryPreload(): boolean {
    return super.canSkipExportHistoryPreload() && this.isUserConversationPage()
  }

  /**
   * turn 的稳定 ID：旧结构为 data-turn-id / data-turn-id-container，新结构为 data-turn-key。
   * 传入的可能是 resolveExportTurnElement 解析后的内层挂载节点（data-content-search-turn-key
   * 与外层 data-turn-key 值不同），必须回溯到外层 shell 取 canonical id，
   * 否则导出采集的"已收集 id 集合"与"shell 缺失检测"会对不上，导致重复补抓与快照串键。
   */
  private getExportTurnShellId(turn: HTMLElement): string {
    const direct =
      turn.getAttribute("data-turn-id") ||
      turn.getAttribute("data-turn-id-container") ||
      turn.getAttribute("data-turn-key") ||
      ""
    if (direct) return direct
    // [CHATGPT-TURN-KEY]: 内层挂载节点回溯外层 shell
    const outer = turn.closest("[data-turn-key]")
    return outer?.getAttribute("data-turn-key") || ""
  }

  /** 消息单元的角色：旧结构读 data-message-author-role，新结构读 unit-key 的 :user/:assistant 后缀。 */
  private getChatGPTMessageRole(message: Element): "user" | "assistant" | null {
    const authorRole = message.getAttribute("data-message-author-role")
    if (authorRole === "user" || authorRole === "assistant") return authorRole
    // [CHATGPT-TURN-KEY]: data-content-search-unit-key="<turnKey>:<idx>:<role>"
    const unitKey = message.getAttribute("data-content-search-unit-key") || ""
    if (unitKey.endsWith(":user")) return "user"
    if (unitKey.endsWith(":assistant")) return "assistant"
    return null
  }

  private getAuthorMessageSelector(): string {
    return [this.config.selectors.userQuery, this.config.selectors.assistantResponse].join(", ")
  }

  /**
   * 按 turn shell 目标驱动的快照采集。
   *
   * 关键观察（60 轮样本 + 新版页面实测）：
   * - 所有 turn 的 shell 始终留在 DOM；新版结构中离屏 turn 只剩外层
   *   `<div data-turn-id-container data-is-intersecting="false">` 空壳（带
   *   `--last-known-height` / `--estimated-turn-height` 高度占位），内层
   *   `section[data-turn][data-testid=conversation-turn-N]` 仅挂载后出现；
   * - 离屏 turn 的 `[data-message-author-role]` 节点不在 DOM 里——
   *   仅当滚动到附近 ChatGPT 才会真正挂载内容；
   * - 旧方案按 `scrollTop = top` 步进扫描，受 scroll anchoring 干扰会跳过大量 turn。
   *
   * 因此：先一次性枚举所有 turn shell（querySelectorAll 顺序即 DOM 顺序），
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
      const resolved = this.resolveExportTurnElement(turn)
      recordSnapshots(this.extractTurnExportSnapshots(resolved, null, collector))
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
              const resolved = this.resolveExportTurnElement(turn)
              recordSnapshots(this.extractTurnExportSnapshots(resolved, null, collector))
            } else {
              await settleAndRecord(turn)
            }
          }
        }

        // Retry pass：第一遍没挂载成功的 turn 给更长 timeout 再试一次
        const collectedTurnIds = this.extractCollectedTurnIds(collected)
        const missingTurns = turns.filter((turn) => {
          const turnId = this.getExportTurnShellId(turn)
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

  /** 列出当前 DOM 中所有 turn 的 shell，按 conversation-turn-N 升序（无 N 的离屏壳排在最后，保持稳定 DOM 序）。 */
  private getAllTurnShellsSorted(): HTMLElement[] {
    // scrollContainer 在 ChatGPT 上未必包含 #thread（它可能是后者的祖先 / 兄弟节点），
    // 用响应容器选择器作为查询根更稳。
    const root: ParentNode = this.findCurrentResponseContainer() || document
    const candidates = Array.from(
      root.querySelectorAll(this.config.sitePrivateSelectors.exportTurnContainer),
    ).filter((element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false
      if (element.closest(`[${CHATGPT_EXPORT_ROOT_ATTR}]`)) return false
      if (element.closest(".gh-root, .gh-main-panel")) return false
      // 本地新草稿的占位容器，不是真实 turn
      if (element.getAttribute("data-turn-id-container") === "client-created-root") return false
      return true
    })

    // 嵌套去重：若候选 A 包含另一个候选 B，则保留 B
    const innermost = candidates.filter(
      (candidate) => !candidates.some((other) => other !== candidate && candidate.contains(other)),
    )

    return innermost.sort((a, b) => this.getExportTurnSortIndex(a) - this.getExportTurnSortIndex(b))
  }

  /**
   * 枚举到的 shell 可能是新版结构的外层占位 div；挂载后真实内容在内层
   * section[data-turn] 上（归属判断、conversation-turn-N、data-turn-id 都在内层）。
   * 提取前解析到最内层挂载 turn，取不到就原样返回。
   */
  private resolveExportTurnElement(turn: HTMLElement): HTMLElement {
    if (turn.matches(CHATGPT_EXPORT_MOUNTED_TURN_SELECTOR)) return turn
    const inner = turn.querySelector(CHATGPT_EXPORT_MOUNTED_TURN_SELECTOR)
    return inner instanceof HTMLElement ? inner : turn
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

  private readVisibleExportMessageSnapshots(
    container: ParentNode,
    collector?: ExportAssetCollector | null,
  ): ChatGPTExportMessageSnapshot[] {
    const referenceContainer =
      container instanceof HTMLElement ? container : this.findCurrentResponseContainer()

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
      const turnSnapshots = this.extractTurnExportSnapshots(
        this.resolveExportTurnElement(turn),
        referenceContainer,
        collector,
      )
      snapshots.push(...turnSnapshots)
    }
    return snapshots
  }

  /**
   * 找出当前可见区域内的 turn 容器。
   * 挂载态结构：<section data-turn="user|assistant" data-turn-id="..." data-testid="conversation-turn-N">；
   * 离屏只剩外层 <div data-turn-id-container="..."> 空壳（老版可能只有 [data-testid^="conversation-turn"]）。
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
        const turnId = this.getExportTurnShellId(turn)

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

    const firstRole = this.getChatGPTMessageRole(messages[0])
    const turnRoleAttr = turn.getAttribute("data-turn")
    const role: "user" | "assistant" =
      turnRoleAttr === "user" || firstRole === "user"
        ? CHATGPT_EXPORT_ROLE_USER
        : CHATGPT_EXPORT_ROLE_ASSISTANT

    const turnId = this.getExportTurnShellId(turn)
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
      this.getChatGPTMessageRole(message) === "assistant"
        ? CHATGPT_EXPORT_ROLE_ASSISTANT
        : CHATGPT_EXPORT_ROLE_USER

    const content = this.normalizeExportMessageContent(
      role === CHATGPT_EXPORT_ROLE_ASSISTANT
        ? this.extractAssistantResponseTextFromLiveDom(message)
        : this.extractUserQueryExportContentWithAssets(message, collector) ||
            this.extractUserQueryText(message),
    )
    if (!content) return null

    const messageId = this.getChatGPTMessageId(message) || ""
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
    const turnId = this.getExportTurnShellId(turn)

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
   * ChatGPT 每个 turn 都有 `data-testid="conversation-turn-N"`，N 是该对话内
   * 从开始往后的 1-based 单调序号，**与虚拟滚动当前的滚动状态、shell 高度变化
   * 完全无关**。相比之前用 `scrollTop + rect.top` 算出来的坐标，这个 N 不会
   * 因为 scroll anchoring、shell 卸载、`--last-known-height` 误差而漂移。
   *
   * 拿不到 N（理论上极少见，比如更老的 ChatGPT 或自定义版本）时返回 MAX，
   * 由 collect 层的 first-seen 计数器兜底。
   */
  private getExportTurnSortIndex(turn: HTMLElement): number {
    return (
      this.parseConversationTurnNumber(turn.getAttribute("data-testid")) ?? Number.MAX_SAFE_INTEGER
    )
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

  private getElementWindow(element: Element): Window & typeof globalThis {
    return (element.ownerDocument.defaultView || window) as Window & typeof globalThis
  }

  private getChatGPTTurnId(element: Element | null): string | null {
    if (!element) return null

    const turnElement =
      element.closest("[data-turn-id]") ||
      element.closest("[data-turn-id-container]") ||
      // [CHATGPT-TURN-KEY]: 新结构 turn 外层为 data-turn-key，内层挂载态另有 data-content-search-turn-key
      element.closest("[data-turn-key]") ||
      element.closest("[data-content-search-turn-key]")
    return (
      turnElement?.getAttribute("data-turn-id") ||
      turnElement?.getAttribute("data-turn-id-container") ||
      turnElement?.getAttribute("data-turn-key") ||
      turnElement?.getAttribute("data-content-search-turn-key") ||
      null
    )
  }

  private getChatGPTMessageId(element: Element | null): string | null {
    if (!element) return null

    return (
      element.getAttribute("data-message-id") ||
      element.closest("[data-message-id]")?.getAttribute("data-message-id") ||
      // [CHATGPT-TURN-KEY]: 新结构无 data-message-id，消息单元 id 为 data-content-search-unit-key
      element.getAttribute("data-content-search-unit-key") ||
      element
        .closest("[data-content-search-unit-key]")
        ?.getAttribute("data-content-search-unit-key") ||
      null
    )
  }

  private parseConversationTurnNumber(testid: string | null): number | null {
    const match = /^conversation-turn-(\d+)/.exec(testid || "")
    if (!match) return null
    const value = parseInt(match[1], 10)
    return Number.isNaN(value) ? null : value
  }

  /**
   * 页内收藏只需要当前已挂载的 DOM 元素，纯 DOM 扫描即可覆盖。
   */
  getInlineBookmarkItems(): OutlineItem[] {
    return this.extractOutline(6, true, false).filter((item) => item.element?.isConnected)
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    let outline: OutlineItem[] = []
    const container = this.getOutlineExtractionContainer()
    if (!container) return outline

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
        // startEl 是 AI 回复内的标题，与用户提问元素不存在相等/包含关系，
        // 必须按文档顺序找第一个位于 startEl 之后的用户提问
        const nextUserQuery =
          allUserQueries.find((uq) =>
            Boolean(startEl.compareDocumentPosition(uq) & Node.DOCUMENT_POSITION_FOLLOWING),
          ) || null

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

    return outline
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
      // 真实对话（/c/UUID）：contextKey 匹配即有效；新对话页（/）：contextKey 不唯一，改用 60s TTL 兼容
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

      // 2. 即时视觉变化
      // [LEGACY-CHATGPT-V1]: 旧版通过 html class 控制主题（class="dark" / "light"）
      // [CHATGPT-APP-SHELL]: 新版主题完全由 html 的 data-theme / data-appearance-theme
      // 属性驱动（class 固定为 chatgpt-theme），不存在 .dark class 选择器
      const root = document.documentElement
      if (root.hasAttribute("data-appearance-theme")) {
        // 页面只内联了当前主题的 toggle 规则，需补全另一方向的开关变量才能即时换肤
        ensureChatGPTThemeToggleStyle()
        root.setAttribute("data-theme", targetMode)
        root.setAttribute("data-appearance-theme", targetMode)
      } else {
        root.className = targetMode
      }

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
