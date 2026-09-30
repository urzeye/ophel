/**
 * Claude.ai 适配器
 */
import { SITE_IDS } from "~constants"
import {
  extractHeadingOutline,
  findHeadingByText,
  findScrollableAncestor,
  scrollElementInContainer,
} from "~core/outline/dom-outline"
import { parseClaudeHistoryOutline, type ClaudeHistoryOutlineData } from "./claude-history-outline"
import {
  parseClaudeHistoryExport,
  type ClaudeHistoryExportDocument,
  type ClaudeHistoryExportMessage,
  type ClaudeHistoryExportUserFile,
} from "./claude-history-export"
import {
  createMarkdownDocumentAssetLink,
  addImageExportAsset,
  addMarkdownDocumentAsset,
  createExportAssetCollector,
  escapeMarkdownLinkText,
  formatExportFileAttachments,
  formatExportImageAttachments,
  isDownloadableExportAssetUrl,
  normalizeExportAssetUrl,
  type ExportAssetCollector,
} from "~utils/export-assets"
import { htmlToMarkdown, type ExportBundle, type ExportMessage } from "~utils/exporter"
import { t } from "~utils/i18n"
import { renderMarkdown } from "~utils/markdown"
import { EVENT_OUTLINE_DATA_UPDATED } from "~utils/messaging"
import { READING_HISTORY_RESTORE_TOKEN_ATTRIBUTE } from "~utils/reading-history-navigation"
import {
  API_OUTLINE_PARSE_FAILURE_LIMIT,
  isApiOutlineStale,
  shouldAttemptApiOutlineFetch,
} from "~utils/outline-api-source"
import { hashTextForCache } from "~utils/text-hash"
import {
  alignScrollTop,
  isClaudeVirtualEdgeSettled,
  settleVirtualScroll,
} from "~utils/virtual-scroll-settle"
import type {
  VirtualOutlinePositionSnapshot,
  VirtualPositionAnchor,
} from "~utils/virtual-outline-position"

import {
  SiteAdapter,
  type AnchorData,
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type ExportLifecycleContext,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type OutlineSource,
  type PanelAvoidanceConfig,
  type SiteDeleteConversationResult,
  type ZenModeConfig,
} from "./base"
import { CLAUDE_CONFIG, CLAUDE_CONFIG_VERSION, type ClaudeSiteConfig } from "./claude-config"
import type { BuiltinSiteConfig } from "./declarative"

const CLAUDE_DELETE_REASON = {
  UI_FAILED: "delete_ui_failed",
  BATCH_ABORTED_AFTER_UI_FAILURE: "delete_batch_aborted_after_ui_failure",
  API_ORG_MISSING: "delete_api_org_missing",
  API_REQUEST_FAILED: "delete_api_request_failed",
  API_NOT_FOUND_BUT_VISIBLE: "delete_api_not_found_but_visible",
} as const

const CLAUDE_DELETE_KEYWORDS = [
  "delete",
  "remove",
  "删除",
  "刪除",
  "削除",
  "삭제",
  "supprimer",
  "eliminar",
  "elimina",
  "löschen",
  "excluir",
  "hapus",
  "हट",
  "मिट",
]

const CLAUDE_CANCEL_KEYWORDS = [
  "cancel",
  "取消",
  "annuler",
  "abbrechen",
  "annulla",
  "キャンセル",
  "취소",
  "batal",
  "cancelar",
]

const ORG_ID_REGEX = /^[a-f0-9-]{36}$/i

const CLAUDE_BLOCK_MATH_PATTERNS = [/(^|[^\\])\$\$[\s\S]+?\$\$/m, /\\\[[\s\S]+?\\\]/m]

const CLAUDE_INLINE_MATH_PATTERNS = [
  /((^|[^\\$])\$[^\s$](?:[^$\n]*[^\s$])?\$(?!\$))/,
  /\\\([^\n]+?\\\)/,
]

const CLAUDE_DOCUMENT_OUTLINE_SOURCE_ID = "document"
const CLAUDE_EXPORT_ROOT_ATTR = "data-gh-claude-export-root"

// 会话接口大纲数据源的拉取冷却与贴底判定（与 deepseek 同值）
const CLAUDE_API_OUTLINE_FETCH_BACKOFF_MS = 10_000
const CLAUDE_API_OUTLINE_BOTTOM_TOLERANCE_PX = 100

/**
 * 大纲文本可调和判定：相等或互为前缀。
 * 200 字截断、KaTeX 重复等渲染/截断差异都表现为一方向另一方的前缀扩展；
 * 互不前缀才视为分支/版本切换产生的真实文本变化。
 */
const isReconcilableOutlineText = (a: string, b: string): boolean =>
  a === b || a.startsWith(b) || b.startsWith(a)

interface ClaudeExportLifecycleState {
  documentPanelWasOpen: boolean
  documentSignature?: string
  documentTitle?: string | null
  documentArtifactIndex?: number | null
  thoughtContainersExpandedForExport?: HTMLElement[]
  /** 本次导出走会话接口数据源：跳过快照/文档面板收集与恢复 */
  usedApiExport?: boolean
}

interface ClaudeDocumentExportCacheEntry {
  element: Element
  index: number
  content: string
  title: string
  artifactTitle: string
  signature: string
}

interface ClaudeUserAttachment {
  kind: "image" | "file"
  name: string
  type?: string
  source?: string
  alt?: string
}

function applyClaudeThemeDomHints(mode: "light" | "dark") {
  const root = document.documentElement
  const body = document.body

  root.classList.toggle("dark", mode === "dark")
  root.classList.remove("light")
  root.style.colorScheme = mode

  if (!body) return

  body.classList.remove("dark", "light")
  body.removeAttribute("data-theme")
  body.style.removeProperty("color-scheme")
}

function getClaudeThemeTabId(): string {
  try {
    const raw = localStorage.getItem("LSS-userThemeMode")
    if (raw) {
      const parsed = JSON.parse(raw) as { tabId?: unknown }
      if (typeof parsed.tabId === "string" && parsed.tabId.trim()) {
        return parsed.tabId
      }
    }
  } catch {}

  return crypto.randomUUID()
}

function stripClaudeCodeContent(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "")
}

function shouldEnhanceClaudeParagraph(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false

  const stripped = stripClaudeCodeContent(normalized)

  return (
    /^#{1,6}\s/m.test(normalized) ||
    /\*\*[^*]+\*\*/.test(normalized) ||
    /(?<!\*)\*(?!\*)[^*]+\*(?!\*)/.test(normalized) ||
    CLAUDE_BLOCK_MATH_PATTERNS.some((pattern) => pattern.test(stripped)) ||
    CLAUDE_INLINE_MATH_PATTERNS.some((pattern) => pattern.test(stripped))
  )
}

interface ClaudeOutlineWordCountCacheEntry {
  signature: string
  count: number
}

interface ClaudeOutlineCacheEntry {
  id: string
  messageIndex: number
  orderInMessage: number
  level: number
  text: string
  isUserQuery: boolean
  isTruncated?: boolean
  wordCount?: number
}

export class ClaudeAdapter extends SiteAdapter {
  protected config: ClaudeSiteConfig = CLAUDE_CONFIG
  private activeOrganizationId: string | null = null
  private activeOrganizationIdExpiresAt = 0
  private exportDocumentCache: ClaudeDocumentExportCacheEntry[] = []
  private exportApiMessages: ExportMessage[] | null = null
  private exportApiBundle: ExportBundle | null = null
  private exportDocumentCollectionRequired = false
  private exportIncludeThoughtsOverride: boolean | null = null
  private exportThoughtBlocks = new WeakMap<Element, string[]>()
  private exportThoughtBlocksByAssistantIndex = new Map<number, string[]>()
  private exportSnapshotRoot: HTMLElement | null = null
  private outlineCacheSessionKey = ""
  private outlineItemCache = new Map<string, ClaudeOutlineCacheEntry>()
  private sortedCachedUserQueries: ClaudeOutlineCacheEntry[] | null = null
  private outlineScannedMessageIndexes = new Set<number>()
  // 全量滚动只用于当前对话的首次缓存回填；后续新增消息由已挂载行增量更新。
  private hasCompletedInitialVirtualOutlineScan = false
  private outlineScanPromise: Promise<void> | null = null
  private isCollectingVirtualOutline = false
  private outlineWordCountCache = new WeakMap<Element, ClaudeOutlineWordCountCacheEntry>()
  // 会话接口大纲数据源（替代全量滚动回填的首选路径）
  private apiOutlineData: ClaudeHistoryOutlineData | null = null
  private apiOutlineFetchPromise: Promise<void> | null = null
  private apiOutlineLastFetchAt = 0
  private apiOutlineFailures = 0
  private apiOutlineSessionId = ""
  private apiOutlineOrgMissing = false
  private apiOutlineWasGenerating = false
  private apiOutlineEntryIds = new Set<string>()
  // 强制重拉信号（粘性，直到一次成功拉取才清除）：
  // 生成/重新生成结束使分支叶变化、挂载行标题与 API 同 id 条目文本不一致（分支切换）
  private apiOutlineForceRefetch = false

  match(): boolean {
    return (
      window.location.hostname.includes("claude.ai") ||
      window.location.hostname.includes("claude.com")
    )
  }

  getSiteId(): string {
    return SITE_IDS.CLAUDE
  }

  getName(): string {
    return "Claude"
  }

  getBuiltinConfig(): ClaudeSiteConfig {
    return CLAUDE_CONFIG
  }

  getBuiltinConfigVersion(): number {
    return CLAUDE_CONFIG_VERSION
  }

  applyMergedConfig(config: BuiltinSiteConfig): void {
    this.config = config as ClaudeSiteConfig
  }

  getThemeColors(): { primary: string; secondary: string } {
    // Claude 品牌色 (Terracotta/Orange)
    return { primary: "#d97757", secondary: "#c66045" }
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
    return "https://claude.ai/new"
  }

  isNewConversation(): boolean {
    return window.location.pathname === "/new" || window.location.pathname === "/"
  }

  isSharePage(): boolean {
    // Claude 分享链接支持两种格式：
    // 旧版：https://claude.ai/public/artifacts/xxx
    // 新版：https://claude.ai/share/xxx
    return (
      window.location.pathname.startsWith("/public/") ||
      window.location.pathname.startsWith("/share/")
    )
  }

  isUserConversationPage(): boolean {
    return !this.isSharePage() && /^\/chat\/[a-f0-9-]+(?:\/|$)/i.test(window.location.pathname)
  }

  /**
   * 隐身对话页（/new?incognito=）：URL 不会随发消息跳转，对话不持久保存。
   * 导出走内存态元数据，不写入对话库（见 resolveConversationForExport）。
   */
  isEphemeralConversationPage(): boolean {
    return this.isIncognitoConversation()
  }

  private isIncognitoConversation(): boolean {
    return (
      window.location.pathname === "/new" &&
      new URLSearchParams(window.location.search).has("incognito")
    )
  }

  getCurrentConversationInfo(): ConversationInfo | null {
    if (!this.isIncognitoConversation()) {
      return super.getCurrentConversationInfo()
    }

    // 基类把隐身对话当新对话页返回 null，导出会报 "Conversation not found: new"；
    // 这里为隐身对话提供内存态元数据，id 随 URL 停留在 "new"。
    return {
      id: this.getSessionId(),
      title: this.getIncognitoConversationTitle(),
      url: window.location.href,
    }
  }

  private getIncognitoConversationTitle(): string {
    // 隐身对话没有侧栏与标题，用首条用户消息兜底导出标题
    const firstUserMessage = document.querySelector(this.getUserQuerySelector())
    const text = firstUserMessage?.textContent?.replace(/\s+/g, " ").trim() || ""
    return text.slice(0, 80)
  }

  // ==================== 对话管理 ====================

  private getClaudeConversationItems(root: ParentNode = document): Element[] {
    return Array.from(root.querySelectorAll(this.config.conversation.itemSelector))
  }

  private getClaudeConversationId(element: Element): string | null {
    const idFrom = this.config.conversation.idFrom
    const rawValue = element.getAttribute(idFrom.attr ?? "href") || ""
    return rawValue.match(new RegExp(idFrom.regex, "i"))?.[1] || null
  }

  private getClaudeConversationTitleElement(element: ParentNode): Element | null {
    const selector = this.config.conversation.titleSelector
    return selector ? element.querySelector(selector) : null
  }

  private getClaudeConversationTitle(element: ParentNode): string {
    const titleElement = this.getClaudeConversationTitleElement(element)
    if (!titleElement) return ""

    // 新 DOM 中重新渲染过的对话项会在标题内嵌套 sr-only 全文副本和 aria-hidden
    // 可见副本，直接读 textContent 会把标题拼成两份；优先取 sr-only 副本。
    const srOnlyCopy = titleElement.querySelector(this.config.sitePrivateSelectors.srOnly)
    return srOnlyCopy?.textContent?.trim() || titleElement.textContent?.trim() || ""
  }

  private isClaudeConversationPinned(element: Element): boolean {
    // dframe 布局：置顶/最近分组有独立 testid，直接判定
    if (element.closest('[data-testid="sidebar-pinned"]')) return true
    if (element.closest('[data-testid="sidebar-recents"]')) return false

    const privateSelectors = this.config.sitePrivateSelectors
    const groupContainer = element.closest(privateSelectors.conversationGroup)
    if (!groupContainer) return false

    const heading = groupContainer.querySelector(privateSelectors.conversationGroupHeading)
    const isNonCollapsible = heading !== null && !heading.hasAttribute("role")
    const list = groupContainer.querySelector(privateSelectors.conversationGroupList)
    const hasPinnedList = list?.matches(privateSelectors.conversationPinnedList) ?? false
    return isNonCollapsible || hasPinnedList
  }

  private getClaudeConversationPath(id: string): string {
    return this.config.conversation.urlTemplate.replace("{id}", id)
  }

  private extractClaudeConversationInfo(element: Element): ConversationInfo | null {
    const id = this.getClaudeConversationId(element)
    if (!id) return null

    const href = element.getAttribute("href") || this.getClaudeConversationPath(id)
    return {
      id,
      title: this.getClaudeConversationTitle(element),
      url: new URL(href, this.getNewTabUrl()).href,
      isActive: window.location.href.includes(id),
      isPinned: this.isClaudeConversationPinned(element),
    }
  }

  getConversationList(): ConversationInfo[] {
    return this.getClaudeConversationItems()
      .map((element) => this.extractClaudeConversationInfo(element))
      .filter((conversation): conversation is ConversationInfo => conversation !== null)
  }

  getSidebarScrollContainer(): Element | null {
    const sidebar = document.querySelector(this.config.selectors.sidebarScrollContainer)
    if (!sidebar) return null

    return sidebar.querySelector(this.config.sitePrivateSelectors.sidebarScrollFallback) || sidebar
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
      const result = await this.deleteConversationOnSiteInternal(targets[index])
      results.push(result)

      // UI 兜底失败时中止剩余批量，防止误删。
      if (!result.success && result.reason === CLAUDE_DELETE_REASON.UI_FAILED) {
        for (let i = index + 1; i < targets.length; i++) {
          results.push({
            id: targets[i].id,
            success: false,
            method: "none",
            reason: CLAUDE_DELETE_REASON.BATCH_ABORTED_AFTER_UI_FAILURE,
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
    const apiResult = await this.tryDeleteViaNativeApi(target)
    if (apiResult.success) {
      return apiResult
    }

    const uiSuccess = await this.deleteConversationViaUi(target.id)
    return {
      id: target.id,
      success: uiSuccess,
      method: uiSuccess ? "ui" : "none",
      reason: uiSuccess ? undefined : apiResult.reason || CLAUDE_DELETE_REASON.UI_FAILED,
    }
  }

  private async tryDeleteViaNativeApi(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    const orgId = await this.getActiveOrganizationId()
    if (!orgId) {
      return {
        id: target.id,
        success: false,
        method: "none",
        reason: CLAUDE_DELETE_REASON.API_ORG_MISSING,
      }
    }

    const endpoint = `/api/organizations/${encodeURIComponent(orgId)}/chat_conversations/${encodeURIComponent(target.id)}`
    const bodies: Array<string | undefined> = [
      undefined,
      JSON.stringify({
        uuid: target.id,
        name: target.title || "",
      }),
    ]

    try {
      let lastStatus = 0

      for (const body of bodies) {
        const response = await fetch(endpoint, {
          method: "DELETE",
          headers: this.buildNativeApiHeaders(Boolean(body)),
          body,
          credentials: "include",
        })
        lastStatus = response.status

        if (response.ok) {
          this.syncSidebarAfterRemoteDelete(target.id)
          return { id: target.id, success: true, method: "api" }
        }

        if (response.status === 404) {
          if (!(await this.isConversationStillVisible(target.id))) {
            this.syncSidebarAfterRemoteDelete(target.id)
            return { id: target.id, success: true, method: "api" }
          }
          continue
        }

        if (response.status === 400 && !body) {
          continue
        }

        return {
          id: target.id,
          success: false,
          method: "api",
          reason: this.toDeleteApiHttpReason(response.status),
        }
      }

      return {
        id: target.id,
        success: false,
        method: "api",
        reason:
          lastStatus === 404
            ? CLAUDE_DELETE_REASON.API_NOT_FOUND_BUT_VISIBLE
            : this.toDeleteApiHttpReason(lastStatus || 0),
      }
    } catch {
      return {
        id: target.id,
        success: false,
        method: "api",
        reason: CLAUDE_DELETE_REASON.API_REQUEST_FAILED,
      }
    }
  }

  // 站点原生 API 请求头（删除、会话拉取共用）
  private buildNativeApiHeaders(withBody = false): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "*/*",
      "anthropic-client-platform": "web_claude_ai",
      "anthropic-client-version": "1.0.0",
    }

    if (withBody) {
      headers["content-type"] = "application/json"
    }

    const anonymousId = this.readAnthropicAnonymousId()
    if (anonymousId) {
      headers["anthropic-anonymous-id"] = anonymousId
    }

    const deviceId = this.readAnthropicDeviceId()
    if (deviceId) {
      headers["anthropic-device-id"] = deviceId
    }

    const clientSha = this.readAnthropicClientSha()
    if (clientSha) {
      headers["anthropic-client-sha"] = clientSha
    }

    return headers
  }

  private toDeleteApiHttpReason(status: number): string {
    switch (status) {
      case 401:
      case 403:
        return "delete_api_unauthorized"
      case 429:
        return "delete_api_rate_limited"
      default:
        return `delete_api_http_${status}`
    }
  }

  private async getActiveOrganizationId(forceRefresh = false): Promise<string | null> {
    const now = Date.now()
    if (
      !forceRefresh &&
      this.activeOrganizationId &&
      this.activeOrganizationIdExpiresAt > now + 5 * 1000
    ) {
      return this.activeOrganizationId
    }

    if (this.isUserscriptRuntime()) {
      const fromApi = await this.fetchOrganizationIdFromApi()
      if (fromApi) {
        this.activeOrganizationId = fromApi
        this.activeOrganizationIdExpiresAt = now + 10 * 60 * 1000
        return fromApi
      }

      const fromStorage = this.getOrganizationIdFromStorage()
      if (fromStorage) {
        this.activeOrganizationId = fromStorage
        this.activeOrganizationIdExpiresAt = now + 10 * 60 * 1000
        return fromStorage
      }

      const fromCookie = this.getCookieValue("lastActiveOrg")
      if (this.isValidOrganizationId(fromCookie)) {
        this.activeOrganizationId = fromCookie
        this.activeOrganizationIdExpiresAt = now + 10 * 60 * 1000
        return fromCookie
      }

      return null
    }

    const fromCookie = this.getCookieValue("lastActiveOrg")
    if (this.isValidOrganizationId(fromCookie)) {
      this.activeOrganizationId = fromCookie
      this.activeOrganizationIdExpiresAt = now + 10 * 60 * 1000
      return fromCookie
    }

    const fromStorage = this.getOrganizationIdFromStorage()
    if (fromStorage) {
      this.activeOrganizationId = fromStorage
      this.activeOrganizationIdExpiresAt = now + 10 * 60 * 1000
      return fromStorage
    }

    const fromApi = await this.fetchOrganizationIdFromApi()
    if (fromApi) {
      this.activeOrganizationId = fromApi
      this.activeOrganizationIdExpiresAt = now + 10 * 60 * 1000
      return fromApi
    }

    return null
  }

  private isUserscriptRuntime(): boolean {
    return typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"
  }

  private async fetchOrganizationIdFromApi(): Promise<string | null> {
    try {
      const response = await fetch("/api/organizations", {
        method: "GET",
        headers: { accept: "application/json, text/plain, */*" },
        credentials: "include",
      })
      if (!response.ok) return null

      const payload = (await response.json()) as unknown
      return this.extractOrganizationId(payload)
    } catch {
      return null
    }
  }

  private getOrganizationIdFromStorage(): string | null {
    const directKeys = [
      "lastActiveOrg",
      "activeOrg",
      "organizationId",
      "lastActiveOrganization",
      "LSS-lastActiveOrg",
    ]

    for (const key of directKeys) {
      const raw = localStorage.getItem(key)
      const orgId = this.extractOrganizationId(raw)
      if (orgId) return orgId
    }

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.toLowerCase().includes("org")) continue
      const raw = localStorage.getItem(key)
      const orgId = this.extractOrganizationId(raw)
      if (orgId) return orgId
    }

    return null
  }

  private extractOrganizationId(payload: unknown): string | null {
    if (!payload) return null

    if (typeof payload === "string") {
      const trimmed = payload.trim().replace(/^"(.*)"$/, "$1")
      if (this.isValidOrganizationId(trimmed)) return trimmed

      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          return this.extractOrganizationId(JSON.parse(trimmed))
        } catch {
          return null
        }
      }

      const match = trimmed.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i)
      return match ? match[0] : null
    }

    if (Array.isArray(payload)) {
      for (const item of payload) {
        const id = this.extractOrganizationId(item)
        if (id) return id
      }
      return null
    }

    if (typeof payload === "object") {
      const record = payload as Record<string, unknown>
      const candidateKeys = [
        "uuid",
        "id",
        "organization_uuid",
        "organization_id",
        "organizationId",
        "org_uuid",
      ]

      for (const key of candidateKeys) {
        const value = record[key]
        if (typeof value === "string" && this.isValidOrganizationId(value)) {
          return value
        }
      }

      for (const nestedKey of [
        "organizations",
        "organization",
        "activeOrganization",
        "currentOrganization",
      ]) {
        const nested = record[nestedKey]
        const id = this.extractOrganizationId(nested)
        if (id) return id
      }
    }

    return null
  }

  private isValidOrganizationId(value: string | null | undefined): boolean {
    return typeof value === "string" && ORG_ID_REGEX.test(value)
  }

  private readAnthropicDeviceId(): string | null {
    return this.getCookieValue("anthropic-device-id")
  }

  private readAnthropicAnonymousId(): string | null {
    return (
      this.getCookieValue("anthropic-anonymous-id") ||
      localStorage.getItem("anthropic-anonymous-id") ||
      localStorage.getItem("anthropicAnonymousId")
    )
  }

  private readAnthropicClientSha(): string | null {
    const fromMeta = document
      .querySelector('meta[name="sentry-release"], meta[name="anthropic-client-sha"]')
      ?.getAttribute("content")
    if (fromMeta) return fromMeta

    const fromGlobal = (window as unknown as Record<string, unknown>).__SENTRY_RELEASE__
    if (typeof fromGlobal === "string" && fromGlobal.length > 0) {
      return fromGlobal
    }

    return null
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

  private syncSidebarAfterRemoteDelete(id: string): void {
    const row = this.findConversationRow(id)
    if (!row) return

    const container = (row.closest("li") || row) as HTMLElement
    container.remove()
  }

  private async deleteConversationViaUi(id: string): Promise<boolean> {
    const row = await this.findConversationRowWithRetry(id)
    if (!row) return false

    const menuButton = await this.findConversationMenuButton(row)
    if (!menuButton) return false

    this.simulateClick(menuButton)

    const deleteMenuItem = await this.waitForDeleteMenuItem(menuButton)
    if (!deleteMenuItem) return false
    this.simulateClick(deleteMenuItem)

    // 某些版本删除后无确认弹窗，先短暂等待一次移除结果。
    if (await this.waitForConversationRemoved(id, 1000)) {
      return true
    }

    const confirmButton = await this.waitForDeleteConfirmButton()
    if (confirmButton) {
      this.simulateClick(confirmButton)
    }

    return this.waitForConversationRemoved(id, 5000)
  }

  private async isConversationStillVisible(id: string): Promise<boolean> {
    const row = await this.findConversationRowWithRetry(id)
    return !!row
  }

  private async findConversationRowWithRetry(id: string): Promise<HTMLElement | null> {
    const first = this.findConversationRow(id)
    if (first) return first

    await this.loadAllConversations()
    await this.sleep(200)
    return this.findConversationRow(id)
  }

  private findConversationRow(id: string): HTMLElement | null {
    return (this.getClaudeConversationItems().find(
      (element) => this.getClaudeConversationId(element) === id,
    ) || null) as HTMLElement | null
  }

  private async findConversationMenuButton(row: HTMLElement): Promise<HTMLElement | null> {
    const owner = (row.closest("li") || row.parentElement || row) as HTMLElement
    const menuSelector = this.config.sitePrivateSelectors.conversationActionButton

    for (let attempt = 0; attempt < 10; attempt++) {
      owner.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
      owner.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
      row.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
      row.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))

      const candidates = Array.from(owner.querySelectorAll(menuSelector)) as HTMLElement[]
      const visibleCandidates = candidates.filter((item) => this.isVisible(item))
      if (visibleCandidates.length > 0) {
        const rightMost = this.pickRightMostElement(visibleCandidates)
        if (rightMost) return rightMost
      }

      const allButtons = Array.from(owner.querySelectorAll("button")) as HTMLElement[]
      const iconButtons = allButtons.filter((item) => this.isVisible(item))
      if (iconButtons.length > 0) {
        const rightMost = this.pickRightMostElement(iconButtons)
        if (rightMost) return rightMost
      }

      await this.sleep(80)
    }

    return null
  }

  private getMenuScopeFromTrigger(trigger: HTMLElement): HTMLElement | null {
    const controlledId = trigger.getAttribute("aria-controls") || trigger.getAttribute("aria-owns")
    if (controlledId) {
      const controlled = document.getElementById(controlledId)
      if (controlled) return controlled
    }

    const menus = Array.from(
      document.querySelectorAll(this.config.sitePrivateSelectors.conversationMenu),
    ) as HTMLElement[]
    const visibleMenus = menus.filter((menu) => this.isVisible(menu))
    if (visibleMenus.length === 0) return null
    return this.pickNearestElement(trigger, visibleMenus)
  }

  private async waitForDeleteMenuItem(
    menuTrigger: HTMLElement,
    timeout = 2500,
  ): Promise<HTMLElement | null> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const menuScope = this.getMenuScopeFromTrigger(menuTrigger)
      const rawItems = menuScope
        ? (Array.from(
            menuScope.querySelectorAll(this.config.sitePrivateSelectors.conversationMenuItem),
          ) as HTMLElement[])
        : (Array.from(
            document.querySelectorAll(
              this.config.sitePrivateSelectors.conversationMenuItemFallback,
            ),
          ) as HTMLElement[])

      for (const item of rawItems) {
        if (!this.isVisible(item)) continue
        const text = this.getSignalText(item)
        if (!this.hasKeyword(text, CLAUDE_DELETE_KEYWORDS)) continue
        if (this.hasKeyword(text, CLAUDE_CANCEL_KEYWORDS)) continue
        return item
      }
      await this.sleep(80)
    }
    return null
  }

  private async waitForDeleteConfirmButton(timeout = 2500): Promise<HTMLElement | null> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const dialog = this.findVisibleDialog()
      const buttons = dialog
        ? (Array.from(dialog.querySelectorAll("button")) as HTMLElement[])
        : (Array.from(document.querySelectorAll("button")) as HTMLElement[])

      for (const button of buttons) {
        if (!this.isVisible(button)) continue
        const text = this.getSignalText(button)
        if (!this.hasKeyword(text, CLAUDE_DELETE_KEYWORDS)) continue
        if (this.hasKeyword(text, CLAUDE_CANCEL_KEYWORDS)) continue
        return button
      }

      await this.sleep(80)
    }
    return null
  }

  private findVisibleDialog(): HTMLElement | null {
    const dialogs = Array.from(
      document.querySelectorAll(this.config.sitePrivateSelectors.conversationDialog),
    ) as HTMLElement[]
    return dialogs.find((dialog) => this.isVisible(dialog)) || null
  }

  private async waitForConversationRemoved(id: string, timeout = 3500): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (!this.findConversationRow(id)) return true
      await this.sleep(80)
    }
    return false
  }

  private pickRightMostElement(elements: HTMLElement[]): HTMLElement | null {
    if (elements.length === 0) return null
    return [...elements].sort(
      (a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right,
    )[0]
  }

  private pickNearestElement(anchor: HTMLElement, elements: HTMLElement[]): HTMLElement | null {
    if (elements.length === 0) return null

    const anchorRect = anchor.getBoundingClientRect()
    const anchorX = anchorRect.left + anchorRect.width / 2
    const anchorY = anchorRect.top + anchorRect.height / 2

    let nearest: HTMLElement | null = null
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const element of elements) {
      const rect = element.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      const distance = Math.hypot(x - anchorX, y - anchorY)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = element
      }
    }

    return nearest
  }

  private getSignalText(element: HTMLElement): string {
    return [
      element.textContent || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.className || "",
    ]
      .join(" ")
      .toLowerCase()
  }

  private hasKeyword(text: string, keywords: string[]): boolean {
    const normalized = text.toLowerCase()
    return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
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

  // ==================== 输入框操作 ====================

  getTextareaSelectors(): string[] {
    return [...this.config.selectors.textarea]
  }

  getSubmitButtonSelectors(): string[] {
    return [...this.config.selectors.submitButton]
  }

  getSubmitKeyConfig(): { key: "Enter" | "Ctrl+Enter" } {
    return { key: this.config.input.submitKey ?? "Enter" }
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (element.offsetParent === null) return false
    if (element.closest(".gh-main-panel")) return false

    return element.matches(this.config.sitePrivateSelectors.validTextarea)
  }

  insertPrompt(content: string): boolean {
    const editor = this.getTextareaElement()
    if (!editor) return false

    editor.focus()

    // Claude 使用 ProseMirror/ContentEditable，execCommand 通常是最稳妥的
    try {
      // 选中已有内容
      document.execCommand("selectAll", false, undefined)
      // 插入新内容
      if (!document.execCommand("insertText", false, content)) {
        throw new Error("execCommand failed")
      }
    } catch {
      // 降级: 直接 DOM 操作
      editor.textContent = content
      editor.dispatchEvent(new Event("input", { bubbles: true }))
    }
    return true
  }

  clearTextarea(): void {
    const editor = this.getTextareaElement()
    if (!editor) return

    editor.focus()
    // 尝试清空
    try {
      document.execCommand("selectAll", false, undefined)
      document.execCommand("delete", false, undefined)
    } catch {
      editor.textContent = ""
    }
    // 触发 input 事件通知 React/框架
    editor.dispatchEvent(new Event("input", { bubbles: true }))
  }

  getConversationTitle(): string | null {
    const currentId = this.getSessionId()
    if (!currentId || currentId === "default") return null

    const activeItem = this.findConversationRow(currentId)
    if (!activeItem) return null
    return this.getClaudeConversationTitle(activeItem) || null
  }

  private findClaudeScrollContainer(): HTMLElement | null {
    const conversationAnchor = Array.from(
      document.querySelectorAll(this.config.selectors.chatContent.join(", ")),
    ).find((element) => !element.closest(this.config.sitePrivateSelectors.documentRoot)) as
      | HTMLElement
      | undefined

    const isScrollable = (element: HTMLElement | null): boolean => {
      if (!element) return false

      const style = window.getComputedStyle(element)
      const overflowY = style.overflowY
      const allowsScroll = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay"

      if (!allowsScroll && element.getAttribute("data-autoscroll-container") !== "true") {
        return false
      }

      return element.scrollHeight > element.clientHeight + 4
    }

    let current: HTMLElement | null = conversationAnchor || null
    while (current && current !== document.body) {
      if (isScrollable(current)) {
        return current
      }
      current = current.parentElement as HTMLElement | null
    }

    for (const selector of this.config.selectors.scrollContainer) {
      const container = document.querySelector(selector) as HTMLElement | null
      if (isScrollable(container)) {
        return container
      }
    }

    return null
  }

  getScrollContainer(): HTMLElement | null {
    const container = this.findClaudeScrollContainer()
    const scrollingElement = document.scrollingElement as HTMLElement | null

    const containerRange = container ? container.scrollHeight - container.clientHeight : -1
    const scrollingRange = scrollingElement
      ? scrollingElement.scrollHeight - scrollingElement.clientHeight
      : -1

    // 对话列表自己滚动时，不要因为外层页面可滚范围更大就改绑 document。
    // 高屏上内层可滚距离变小，误绑后滚动位置会和大纲高亮一起错。
    const conversationScroller =
      container?.getAttribute("data-autoscroll-container") === "true" ||
      container?.querySelector("[data-autoscroll-container='true']") != null

    if (
      !conversationScroller &&
      container &&
      scrollingElement &&
      scrollingRange > containerRange + 100 &&
      scrollingElement.scrollHeight > scrollingElement.clientHeight + 4
    ) {
      return scrollingElement
    }

    if (container) {
      return container
    }

    if (scrollingElement && scrollingElement.scrollHeight > scrollingElement.clientHeight + 4) {
      return scrollingElement
    }

    return super.getScrollContainer()
  }

  override async waitForVirtualListEdge(
    edge: "start" | "end",
    signal?: AbortSignal,
  ): Promise<boolean> {
    // 短对话没有虚拟列表，滚动到边缘就是到位，不能空等第一条虚拟行。
    if (!this.isClaudeVirtualConversation()) return true
    return settleVirtualScroll(
      () => this.getScrollContainer(),
      (container) => isClaudeVirtualEdgeSettled(container, edge),
      (container) => alignScrollTop(container, edge === "start" ? 0 : container.scrollHeight),
      signal,
    )
  }

  getChatContentSelectors(): string[] {
    return [...this.config.selectors.chatContent]
  }

  private isClaudeDocumentPanelOpen(): boolean {
    return this.getClaudeDocumentMarkdownElement() !== null
  }

  private getClaudeDocumentRoot(): HTMLElement | null {
    const privateSelectors = this.config.sitePrivateSelectors
    return (Array.from(document.querySelectorAll(privateSelectors.documentRoot)).find(
      (root) => !root.closest(privateSelectors.hiddenAncestor),
    ) || null) as HTMLElement | null
  }

  private getClaudeDocumentMarkdownElement(): Element | null {
    return (
      this.getClaudeDocumentRoot()?.querySelector(
        this.config.sitePrivateSelectors.responseMarkdown,
      ) || null
    )
  }

  private getClaudeDocumentPanelTitle(): string | null {
    const privateSelectors = this.config.sitePrivateSelectors
    const root = this.getClaudeDocumentRoot()
    const viewer = root?.closest(privateSelectors.documentViewer)
    let current = viewer?.parentElement || null

    while (current && current !== document.body) {
      const panelTitle = current.querySelector(privateSelectors.documentPanelTitle)
      const title =
        panelTitle?.getAttribute("title")?.trim() || panelTitle?.textContent?.trim() || ""
      if (title) return title

      if (current.querySelector(privateSelectors.documentBackButton)) break
      current = current.parentElement
    }

    return null
  }

  private getClaudeDocumentTitle(): string | null {
    const panelTitle = this.getClaudeDocumentPanelTitle()
    if (panelTitle) return panelTitle

    const contentTitle =
      this.getClaudeDocumentRoot()
        ?.querySelector(this.config.sitePrivateSelectors.documentContentTitle)
        ?.textContent?.trim() || ""
    return contentTitle || null
  }

  private getClaudeArtifactCells(root: ParentNode = document): Element[] {
    return Array.from(root.querySelectorAll(this.config.sitePrivateSelectors.artifactCell))
  }

  private getClaudeDocumentArtifactCells(root: ParentNode = document): Element[] {
    return this.getClaudeArtifactCells(root).filter((cell) => this.isMarkdownDocumentArtifact(cell))
  }

  private isMarkdownDocumentArtifact(artifact: Element): boolean {
    return /\bMD\b/i.test(this.getClaudeArtifactMetadata(artifact))
  }

  private getClaudeArtifactMetadata(artifact: Element): string {
    return (
      artifact
        .querySelector(this.config.sitePrivateSelectors.artifactMetadata)
        ?.textContent?.trim() || ""
    )
  }

  private getClaudeArtifactTitle(artifact: Element): string {
    const title =
      artifact.querySelector(this.config.sitePrivateSelectors.artifactTitle)?.textContent?.trim() ||
      ""
    return title || "Document"
  }

  private getClaudeArtifactButton(artifact: Element): HTMLElement | null {
    const privateSelectors = this.config.sitePrivateSelectors
    const container = artifact.closest(privateSelectors.artifactContainer) || artifact.parentElement
    if (!container) return null

    const button =
      Array.from(container.children).find((child) => child.matches("button")) ||
      container.querySelector(privateSelectors.artifactViewButton) ||
      artifact.querySelector(privateSelectors.artifactViewButton)
    return button instanceof HTMLElement ? button : null
  }

  private async resolveClaudeArtifactInteractionTarget(artifact: Element): Promise<Element | null> {
    if (artifact.isConnected && !artifact.closest(`[${CLAUDE_EXPORT_ROOT_ATTR}]`)) {
      return artifact
    }

    const snapshotRow = artifact.closest(this.config.sitePrivateSelectors.virtualRow)
    const messageIndex = snapshotRow ? this.parseClaudeVirtualMessageIndex(snapshotRow) : null
    if (!snapshotRow || messageIndex === null) return null

    const artifactIndex = this.getClaudeDocumentArtifactCells(snapshotRow).indexOf(artifact)
    if (artifactIndex < 0) return null

    const artifactTitle = this.getClaudeArtifactTitle(artifact)
    const findMountedArtifact = (): Element | null => {
      const mountedRow = this.getClaudeVirtualRows().find(
        (row) => this.getClaudeVirtualMessageIndex(row) === messageIndex,
      )
      if (!mountedRow) return null

      const mountedArtifacts = this.getClaudeDocumentArtifactCells(mountedRow)
      const byIndex = mountedArtifacts[artifactIndex]
      if (byIndex && this.getClaudeArtifactTitle(byIndex) === artifactTitle) return byIndex

      const titleMatches = mountedArtifacts.filter(
        (candidate) => this.getClaudeArtifactTitle(candidate) === artifactTitle,
      )
      return titleMatches.length === 1 ? titleMatches[0] : null
    }

    const mountedArtifact = findMountedArtifact()
    if (mountedArtifact) return mountedArtifact

    const scrollContainer = this.getScrollContainer()
    if (!scrollContainer) return null

    const totalMessages = this.getClaudeVirtualMessageCount()
    const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    const estimatedTop =
      totalMessages && totalMessages > 1
        ? (maxScroll * messageIndex) / (totalMessages - 1)
        : scrollContainer.scrollTop
    const positions = this.buildClaudeVirtualScrollPositions(scrollContainer)
    positions.sort((a, b) => Math.abs(a - estimatedTop) - Math.abs(b - estimatedTop))

    for (const top of new Set([estimatedTop, ...positions])) {
      await this.scrollClaudeVirtualContainer(scrollContainer, top)
      const target = findMountedArtifact()
      if (target) return target
    }

    return null
  }

  private async openClaudeArtifactDocument(artifact: Element): Promise<Element | null> {
    const button = this.getClaudeArtifactButton(artifact)
    if (!button) return null

    const previousSignature = this.getClaudeDocumentSignature()
    const expectedTitle = this.getClaudeArtifactTitle(artifact)
    button.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" })
    await new Promise((resolve) => setTimeout(resolve, 50))
    this.simulateClick(button)

    return this.waitForClaudeDocumentMarkdown(previousSignature, expectedTitle)
  }

  private getClaudeDocumentSignature(markdown = this.getClaudeDocumentMarkdownElement()): string {
    const text = markdown?.textContent?.trim() || ""
    if (!text) return ""

    const title = this.getClaudeDocumentTitle()?.replace(/\s+/g, " ").trim() || ""
    return `${title.length}:${title}:${text.length}:${text.slice(0, 160)}:${text.slice(-160)}`
  }

  private async waitForClaudeDocumentMarkdown(
    previousSignature = "",
    expectedTitle = "",
    timeoutMs = 3000,
  ): Promise<Element | null> {
    const startedAt = Date.now()
    let candidateSignature = ""
    let candidateSince = 0

    while (Date.now() - startedAt < timeoutMs) {
      const markdown = this.getClaudeDocumentMarkdownElement()
      const signature = this.getClaudeDocumentSignature()
      const panelTitle = this.getClaudeDocumentPanelTitle()
      const titleMatches = !panelTitle || !expectedTitle || panelTitle === expectedTitle
      const documentChanged = !previousSignature || signature !== previousSignature

      if (markdown && signature && titleMatches && documentChanged) {
        if (signature !== candidateSignature) {
          candidateSignature = signature
          candidateSince = Date.now()
        } else if (Date.now() - candidateSince >= 200) {
          return markdown
        }
      } else {
        candidateSignature = ""
        candidateSince = 0
      }

      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    return null
  }

  private async closeClaudeDocumentPanel(): Promise<void> {
    if (!this.isClaudeDocumentPanelOpen()) return

    const backButton = this.findClaudeDocumentPanelButton(
      this.config.sitePrivateSelectors.documentBackButton,
    )
    if (!(backButton instanceof HTMLElement)) {
      throw new Error("Claude document panel could not be closed: back button not found")
    }

    this.simulateClick(backButton)
    const startedAt = Date.now()
    while (Date.now() - startedAt < 1500) {
      if (!this.isClaudeDocumentPanelOpen()) return
      await this.sleep(50)
    }

    throw new Error("Claude document panel did not close")
  }

  private findClaudeDocumentPanelButton(selector: string): HTMLElement | null {
    const root = this.getClaudeDocumentRoot()
    let current = root?.parentElement || null

    while (current && current !== document.body) {
      const button = current.querySelector(selector)
      if (button instanceof HTMLElement) return button
      current = current.parentElement
    }

    return null
  }

  // ==================== 模型管理 ====================

  getModelName(): string | null {
    for (const selector of this.config.modelSwitcher.selectorButtonSelectors) {
      const selectorButton = document.querySelector(selector)
      const name = selectorButton?.textContent?.trim()
      if (name) return name
    }
    return null
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig {
    return {
      ...this.config.modelSwitcher,
      targetModelKeyword: keyword,
      selectorButtonSelectors: [...this.config.modelSwitcher.selectorButtonSelectors],
      subMenuTriggers: this.config.modelSwitcher.subMenuTriggers
        ? [...this.config.modelSwitcher.subMenuTriggers]
        : undefined,
    }
  }

  /**
   * Claude 使用 Radix UI，可能需要模拟 PointerEvent
   */
  private getElementWindow(element: Element): Window & typeof globalThis {
    return (element.ownerDocument.defaultView || window) as Window & typeof globalThis
  }

  protected simulateClick(element: HTMLElement): void {
    const rect = element.getBoundingClientRect()
    const eventWindow = this.getElementWindow(element)
    const clientX = rect.left + Math.max(1, Math.min(rect.width / 2, Math.max(rect.width - 1, 1)))
    const clientY = rect.top + Math.max(1, Math.min(rect.height / 2, Math.max(rect.height - 1, 1)))
    const commonInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: eventWindow,
      button: 0,
      buttons: 1,
      clientX,
      clientY,
    }
    const dispatchPointer = (type: string) => {
      const PointerEventCtor = eventWindow.PointerEvent
      if (!PointerEventCtor) return
      element.dispatchEvent(
        new PointerEventCtor(type, {
          ...commonInit,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }),
      )
    }
    const dispatchHover = () => {
      dispatchPointer("pointerenter")
      dispatchPointer("pointerover")
      dispatchPointer("pointermove")
      element.dispatchEvent(new eventWindow.MouseEvent("mouseenter", commonInit))
      element.dispatchEvent(new eventWindow.MouseEvent("mouseover", commonInit))
      element.dispatchEvent(new eventWindow.MouseEvent("mousemove", commonInit))
    }

    dispatchHover()

    const role = element.getAttribute("role")
    const text = (element.textContent || "").toLowerCase()
    const subMenuSelector = this.config.modelSwitcher.subMenuSelector
    const subMenuTriggers = this.config.modelSwitcher.subMenuTriggers ?? []
    const isSubMenuTrigger =
      role === "menuitem" &&
      ((subMenuSelector ? element.matches(subMenuSelector) : false) ||
        subMenuTriggers.some((trigger) => text.includes(trigger.toLowerCase())))
    if (isSubMenuTrigger) return

    dispatchPointer("pointerdown")
    element.dispatchEvent(new eventWindow.MouseEvent("mousedown", commonInit))
    dispatchPointer("pointerup")
    element.dispatchEvent(new eventWindow.MouseEvent("mouseup", commonInit))
    element.dispatchEvent(new eventWindow.MouseEvent("click", commonInit))
  }

  // ==================== 杂项 ====================

  getNewChatButtonSelectors(): string[] {
    return [...this.config.selectors.newChatButton]
  }

  getDefaultLockSettings(): { enabled: boolean; keyword: string } {
    return { enabled: false, keyword: "sonnet" }
  }

  private getClaudeChatCandidates(container: ParentNode): HTMLElement[] {
    return Array.from(
      container.querySelectorAll(this.getChatContentSelectors().join(", ")),
    ) as HTMLElement[]
  }

  private getRelativeTop(container: HTMLElement, element: HTMLElement): number {
    const containerRect = container.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    return elementRect.top - containerRect.top + container.scrollTop
  }

  private getOutlineRoot(): HTMLElement | Document {
    return this.getScrollContainer() || this.findClaudeScrollContainer() || document
  }

  private getClaudeVirtualRows(root: ParentNode = document): HTMLElement[] {
    const privateSelectors = this.config.sitePrivateSelectors
    return Array.from(root.querySelectorAll(privateSelectors.virtualRow)).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element.closest(`[${CLAUDE_EXPORT_ROOT_ATTR}]`) === null &&
        element.closest(privateSelectors.virtualSizer) !== null,
    )
  }

  private getClaudeVirtualMessageIndex(element: Element | null): number | null {
    const row = element?.closest(this.config.sitePrivateSelectors.virtualRow)
    if (!row || row.closest(`[${CLAUDE_EXPORT_ROOT_ATTR}]`)) return null

    return this.parseClaudeVirtualMessageIndex(row)
  }

  private parseClaudeVirtualMessageIndex(row: Element): number | null {
    const rawIndex = row.getAttribute("data-rs-index") || row.getAttribute("data-index")
    if (!rawIndex || !/^\d+$/.test(rawIndex)) return null

    const index = Number.parseInt(rawIndex, 10)
    return Number.isSafeInteger(index) ? index : null
  }

  private getClaudeVirtualMessageCount(): number | null {
    for (const row of this.getClaudeVirtualRows()) {
      const article = row.querySelector(this.config.sitePrivateSelectors.virtualArticle)
      const rawSize = article?.getAttribute("aria-setsize")
      if (!rawSize || !/^\d+$/.test(rawSize)) continue

      const size = Number.parseInt(rawSize, 10)
      if (Number.isSafeInteger(size) && size > 0) return size
    }

    return null
  }

  private isClaudeVirtualConversation(): boolean {
    return (
      document.querySelector(this.config.sitePrivateSelectors.virtualSizer) !== null &&
      this.getClaudeVirtualRows().length > 0
    )
  }

  private ensureClaudeOutlineCacheSession(): void {
    const sessionKey = `${this.getSessionId()}:${window.location.pathname}`
    if (sessionKey === this.outlineCacheSessionKey) return

    this.outlineCacheSessionKey = sessionKey
    this.outlineItemCache.clear()
    this.sortedCachedUserQueries = null
    this.outlineScannedMessageIndexes.clear()
    this.hasCompletedInitialVirtualOutlineScan = false
    this.apiOutlineEntryIds.clear()
    this.apiOutlineForceRefetch = false
  }

  private createClaudeOutlineItemId(
    element: Element,
    isUserQuery: boolean,
    orderInMessage: number,
  ): string | null {
    const messageIndex = this.getClaudeVirtualMessageIndex(element)
    if (messageIndex === null) return null

    return isUserQuery
      ? `claude-message:${messageIndex}:user`
      : `claude-message:${messageIndex}:heading:${orderInMessage}`
  }

  private updateClaudeOutlineCache(items: OutlineItem[]): void {
    this.ensureClaudeOutlineCacheSession()
    this.sortedCachedUserQueries = null
    const headingOrderByMessage = new Map<number, number>()

    for (const item of items) {
      const messageIndex = this.getClaudeVirtualMessageIndex(item.element)
      if (messageIndex === null || !item.text.trim()) continue

      const isUserQuery = Boolean(item.isUserQuery)
      const headingOrder = headingOrderByMessage.get(messageIndex) || 0
      const orderInMessage = isUserQuery ? 0 : headingOrder + 1
      if (!isUserQuery) {
        headingOrderByMessage.set(messageIndex, headingOrder + 1)
      }
      const id =
        item.id ||
        this.createClaudeOutlineItemId(item.element as Element, isUserQuery, headingOrder)
      if (!id) continue

      // 分支/版本切换信号：挂载行标题与缓存同 id 条目文本不可调和。
      // 不限于 API 归属条目：挂载行的 < > 版本切换不经过生成态，
      // DOM 归属条目也必须能触发强制重拉
      const existing = this.outlineItemCache.get(id)
      if (
        existing &&
        !existing.isUserQuery &&
        !isReconcilableOutlineText(existing.text, item.text)
      ) {
        this.apiOutlineForceRefetch = true
      }

      item.id = id
      item.navigationId = id
      this.outlineItemCache.set(id, {
        id,
        messageIndex,
        orderInMessage,
        level: item.level,
        text: item.text,
        isUserQuery,
        isTruncated: item.isTruncated,
        wordCount: item.wordCount,
      })
      // 条目被 DOM 精确值精化后转为 DOM 来源，后续 API 重建不再删除/覆盖它
      this.apiOutlineEntryIds.delete(id)
    }
  }

  private mergeCachedClaudeOutlineItems(
    currentItems: OutlineItem[],
    maxLevel: number,
    includeUserQueries: boolean,
    showWordCount: boolean,
  ): OutlineItem[] {
    if (this.outlineItemCache.size === 0) return currentItems

    const currentIds = new Set(
      currentItems.map((item) => item.id).filter((id): id is string => Boolean(id)),
    )
    const merged = [...currentItems]

    for (const entry of this.outlineItemCache.values()) {
      if (currentIds.has(entry.id)) continue
      if (entry.isUserQuery && !includeUserQueries) continue
      if (!entry.isUserQuery && entry.level > maxLevel) continue

      merged.push({
        id: entry.id,
        navigationId: entry.id,
        level: entry.level,
        text: entry.text,
        element: null,
        isUserQuery: entry.isUserQuery,
        isTruncated: entry.isTruncated,
        wordCount: showWordCount ? entry.wordCount : undefined,
      })
    }

    return merged.sort((a, b) => {
      const aEntry = a.id ? this.outlineItemCache.get(a.id) : undefined
      const bEntry = b.id ? this.outlineItemCache.get(b.id) : undefined
      if (!aEntry || !bEntry) return 0
      if (aEntry.messageIndex !== bEntry.messageIndex) {
        return aEntry.messageIndex - bEntry.messageIndex
      }
      return aEntry.orderInMessage - bEntry.orderInMessage
    })
  }

  private scheduleClaudeVirtualOutlineScan(): void {
    if (
      this.hasCompletedInitialVirtualOutlineScan ||
      this.isCollectingVirtualOutline ||
      this.outlineScanPromise ||
      this.isGenerating() ||
      !this.isClaudeVirtualConversation() ||
      // 阅读历史恢复正在探测/对齐虚拟行，扫描的全段滚动会争抢同一容器；
      // 恢复结束后下一次大纲刷新会重新触发调度
      this.isReadingHistoryRestoreActive()
    ) {
      return
    }

    // 会话接口仍可用时不做全量滚动回填：等接口数据到达或明确不可用
    // （orgId 缺失 / 连续失败熔断）再退化为滚动扫描
    if (!this.isApiOutlineUnavailable()) return

    if (this.completeInitialClaudeVirtualOutlineScanIfCovered()) return

    this.outlineScanPromise = this.collectClaudeVirtualOutline(this.outlineCacheSessionKey)
      .catch((error) => {
        console.warn("[ClaudeAdapter] Failed to collect virtual outline:", error)
      })
      .finally(() => {
        this.outlineScanPromise = null
      })
  }

  private hasScannedAllClaudeVirtualMessages(totalMessages: number): boolean {
    for (let index = 0; index < totalMessages; index += 1) {
      if (!this.outlineScannedMessageIndexes.has(index)) return false
    }

    return true
  }

  private completeInitialClaudeVirtualOutlineScanIfCovered(): boolean {
    const totalMessages = this.getClaudeVirtualMessageCount()
    if (totalMessages === null || !this.hasScannedAllClaudeVirtualMessages(totalMessages)) {
      return false
    }

    this.hasCompletedInitialVirtualOutlineScan = true
    return true
  }

  private async collectClaudeVirtualOutline(expectedSessionKey: string): Promise<void> {
    const scrollContainer = this.getScrollContainer()
    if (!scrollContainer) return

    const originalScrollTop = scrollContainer.scrollTop
    const positions = this.buildClaudeVirtualScrollPositions(scrollContainer)
    this.isCollectingVirtualOutline = true

    try {
      for (const top of positions) {
        if (this.outlineCacheSessionKey !== expectedSessionKey) return
        await this.scrollClaudeVirtualContainer(scrollContainer, top)
        if (this.outlineCacheSessionKey !== expectedSessionKey) return
        this.recordMountedClaudeVirtualMessageIndexes(scrollContainer)
        this.extractOutline(6, true, false)
      }
    } finally {
      if (this.outlineCacheSessionKey === expectedSessionKey) {
        // 恢复在扫描中途启动时不再回滚到扫描起点，避免拽走恢复好的位置
        if (!this.isReadingHistoryRestoreActive()) {
          await this.scrollClaudeVirtualContainer(scrollContainer, originalScrollTop)
        }
        this.completeInitialClaudeVirtualOutlineScanIfCovered()
      }
      this.isCollectingVirtualOutline = false
    }
  }

  /** 阅读历史恢复是否进行中（恢复期间会持有 restore token） */
  private isReadingHistoryRestoreActive(): boolean {
    return document.documentElement.hasAttribute(READING_HISTORY_RESTORE_TOKEN_ATTRIBUTE)
  }

  private recordMountedClaudeVirtualMessageIndexes(root: ParentNode): void {
    for (const row of this.getClaudeVirtualRows(root)) {
      const messageIndex = this.getClaudeVirtualMessageIndex(row)
      if (messageIndex !== null) {
        this.outlineScannedMessageIndexes.add(messageIndex)
      }
    }
  }

  // ==================== 大纲缓存（会话接口数据源） ====================

  /**
   * Claude 长对话走 rocksteady 虚拟滚动，离屏回复的标题会从 DOM 卸载。
   * 首选直接请求站点 chat_conversations 接口，从 text 内容块的 markdown 解析
   * 标题与提问回填 outlineItemCache（与 DOM 扫描同一 id 体系，下游归并/定位不变）；
   * 接口不可用（未登录/连续失败）时才退化为全量滚动回填。
   */
  private maybeRefreshApiOutline(): void {
    if (!this.isUserConversationPage()) return
    // 仅虚拟滚动会话需要接口回填：非虚拟会话 DOM 条目没有 data-rs-index，
    // 接口条目写入缓存会导致大纲重复、提问定位被缓存路径劫持
    if (!this.isClaudeVirtualConversation()) return

    const sessionId = this.getSessionId()
    if (sessionId !== this.apiOutlineSessionId) {
      // 会话切换时解除失败熔断与拉取冷却，新会话应立即补齐大纲
      this.apiOutlineSessionId = sessionId
      this.apiOutlineFailures = 0
      this.apiOutlineLastFetchAt = 0
      this.apiOutlineOrgMissing = false
    }

    // 生成结束（含重新生成）后分支叶已变化，位置序号不变，必须强制重拉
    const generating = this.isGenerating()
    if (this.apiOutlineWasGenerating && !generating) {
      this.apiOutlineForceRefetch = true
    }
    this.apiOutlineWasGenerating = generating

    const scrollable = this.getScrollContainer()
    const atBottom = scrollable
      ? scrollable.scrollTop + scrollable.clientHeight >=
        scrollable.scrollHeight - CLAUDE_API_OUTLINE_BOTTOM_TOLERANCE_PX
      : true
    const stale =
      this.apiOutlineForceRefetch ||
      isApiOutlineStale({
        data: this.apiOutlineData,
        sessionId,
        mountedIds: this.collectMountedVirtualMessageIndexes(),
        atBottom,
      })

    if (
      !shouldAttemptApiOutlineFetch({
        now: Date.now(),
        lastFetchAt: this.apiOutlineLastFetchAt,
        backoffMs: CLAUDE_API_OUTLINE_FETCH_BACKOFF_MS,
        parseFailures: this.apiOutlineFailures,
        inFlight: this.apiOutlineFetchPromise !== null,
        generating,
        stale,
      })
    ) {
      return
    }

    // 任何一次实际发起的拉取都记入冷却，成功但数据未变的重拉也不会连续重试
    this.apiOutlineLastFetchAt = Date.now()
    this.apiOutlineFetchPromise = this.fetchApiOutline(sessionId)
      .then((result) => {
        if (result === "parse-failed") {
          this.apiOutlineFailures += 1
          return
        }
        if (result === "no-org") {
          // 未登录态：不计失败（避免误熔断），但标记后滚动回填兜底才会启动
          this.apiOutlineOrgMissing = true
          return
        }
        this.apiOutlineFailures = 0
        this.apiOutlineOrgMissing = false
        if (result === "changed") {
          window.postMessage({ type: EVENT_OUTLINE_DATA_UPDATED }, "*")
        }
      })
      .catch((error) => {
        // 网络/HTTP 失败同样计入熔断：连续失败时滚动回填兜底需要启动
        this.apiOutlineFailures += 1
        console.warn("[ClaudeAdapter] Failed to fetch conversation outline:", error)
      })
      .finally(() => {
        this.apiOutlineFetchPromise = null
      })
  }

  private isApiOutlineUnavailable(): boolean {
    return this.apiOutlineOrgMissing || this.apiOutlineFailures >= API_OUTLINE_PARSE_FAILURE_LIMIT
  }

  private collectMountedVirtualMessageIndexes(): Set<number> {
    const indexes = new Set<number>()
    for (const row of this.getClaudeVirtualRows()) {
      const messageIndex = this.getClaudeVirtualMessageIndex(row)
      if (messageIndex !== null) {
        indexes.add(messageIndex)
      }
    }
    return indexes
  }

  private async fetchApiOutline(
    sessionId: string,
  ): Promise<"changed" | "unchanged" | "parse-failed" | "no-org"> {
    const orgId = await this.getActiveOrganizationId()
    if (!orgId) return "no-org"

    const response = await fetch(this.buildConversationApiUrl(orgId, sessionId), {
      headers: this.buildNativeApiHeaders(),
      credentials: "include",
    })
    if (!response.ok) {
      throw new Error(`chat_conversations responded ${response.status}`)
    }

    const totalMessages = this.getClaudeVirtualMessageCount() ?? undefined
    const parsed = parseClaudeHistoryOutline(await response.json(), 6, totalMessages)
    if (!parsed || parsed.sessionId !== sessionId) return "parse-failed"

    const previous = this.apiOutlineData
    this.apiOutlineData = parsed
    this.apiOutlineForceRefetch = false
    this.rebuildApiOutlineEntries(parsed)
    return !previous ||
      previous.sessionId !== parsed.sessionId ||
      previous.signature !== parsed.signature
      ? "changed"
      : "unchanged"
  }

  private buildConversationApiUrl(orgId: string, sessionId: string): string {
    const params = new URLSearchParams({
      tree: "True",
      rendering_mode: "messages",
      render_all_tools: "true",
      include_inline_comparison: "true",
      consistency: "strong",
    })
    return `${window.location.origin}/api/organizations/${encodeURIComponent(orgId)}/chat_conversations/${encodeURIComponent(sessionId)}?${params}`
  }

  /**
   * 用接口数据重建缓存条目。接口数据是激活分支结构的真值：
   * 不在新分支中的缓存条目（含 DOM 归属）一律清除——编辑/重新生成截断
   * 分支后它们已成为无法跳转的僵尸，仍挂载的行会在下次 extract 由
   * updateClaudeOutlineCache 重建精确值。
   * 同 id 且文本可调和的 DOM 归属条目保留（wordCount 是精确值）；
   * 文本不可调和说明分支/版本已切换，以接口为准替换并转回 API 归属。
   */
  private rebuildApiOutlineEntries(data: ClaudeHistoryOutlineData): void {
    this.ensureClaudeOutlineCacheSession()
    this.sortedCachedUserQueries = null
    const previousApiIds = new Set(this.apiOutlineEntryIds)

    const nextEntries: ClaudeOutlineCacheEntry[] = []
    for (const query of data.userQueries) {
      // 与 DOM 条目同一截断规则：文本截 200，isTruncated 阈值 60
      nextEntries.push({
        id: `claude-message:${query.messageIndex}:user`,
        messageIndex: query.messageIndex,
        orderInMessage: 0,
        level: 0,
        text: query.text.length > 200 ? query.text.slice(0, 200) : query.text,
        isUserQuery: true,
        isTruncated: query.text.length > 60,
        wordCount: data.replyWordCountByMessageIndex.get(query.messageIndex + 1),
      })
    }

    for (const [messageIndex, headings] of data.headingsByMessageIndex) {
      headings.forEach((heading, order) => {
        // id 中标题序号为 0 基（与 createClaudeOutlineItemId 一致），
        // orderInMessage 为 1 基（findClaudeOutlineTargetInMountedRow 按下标 -1 定位）
        nextEntries.push({
          id: `claude-message:${messageIndex}:heading:${order}`,
          messageIndex,
          orderInMessage: order + 1,
          level: heading.level,
          text: heading.text.length > 200 ? heading.text.slice(0, 200) : heading.text,
          isUserQuery: false,
          isTruncated: heading.text.length > 80,
          wordCount: heading.wordCount,
        })
      })
    }

    // 僵尸清理：不在新分支中的条目（含 DOM 归属）全部移除
    const nextIds = new Set(nextEntries.map((entry) => entry.id))
    for (const id of Array.from(this.outlineItemCache.keys())) {
      if (!nextIds.has(id)) this.outlineItemCache.delete(id)
    }
    this.apiOutlineEntryIds.clear()

    for (const entry of nextEntries) {
      const existing = this.outlineItemCache.get(entry.id)
      if (existing && isReconcilableOutlineText(existing.text, entry.text)) {
        // 保留现有条目；若其值仍来自上一轮接口，维持 API 归属记账
        if (previousApiIds.has(entry.id)) this.apiOutlineEntryIds.add(entry.id)
        continue
      }
      this.outlineItemCache.set(entry.id, entry)
      this.apiOutlineEntryIds.add(entry.id)
    }
  }

  private buildClaudeVirtualScrollPositions(scrollContainer: HTMLElement): number[] {
    const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    if (maxScroll === 0) return [scrollContainer.scrollTop]

    const step = Math.max(160, Math.floor(scrollContainer.clientHeight * 0.65))
    const positions = new Set<number>([0, scrollContainer.scrollTop, maxScroll])
    for (let top = 0; top < maxScroll; top += step) {
      positions.add(top)
    }

    return Array.from(positions).sort((a, b) => a - b)
  }

  private async scrollClaudeVirtualContainer(
    scrollContainer: HTMLElement,
    top: number,
  ): Promise<void> {
    scrollContainer.scrollTop = top
    scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
    await this.sleep(100)
  }

  override isVirtualScrollConversation(): boolean {
    return this.isClaudeVirtualConversation()
  }

  override getVirtualAnchorElement(): AnchorData | null {
    if (!this.isClaudeVirtualConversation()) return null
    const container = this.getScrollContainer()
    if (!container) return null
    const rows = this.getClaudeVirtualRows(container)
    if (!rows.length) return null

    // 视口上沿那条已挂载的虚拟行，语义与 getVisibleAnchorElement 一致
    let bestRow: HTMLElement | null = null
    let bestTop = Number.NEGATIVE_INFINITY
    for (const row of rows) {
      const top = this.getRelativeTop(container, row)
      if (top <= container.scrollTop + 100 && top > bestTop) {
        bestRow = row
        bestTop = top
      }
    }
    if (!bestRow) {
      bestRow = rows[0]
      bestTop = this.getRelativeTop(container, bestRow)
    }

    const rowKey = this.getClaudeVirtualMessageIndex(bestRow)
    if (rowKey === null) return null

    return {
      type: "virtual-row",
      rowKey,
      offset: container.scrollTop - bestTop,
      textSignature: (bestRow.textContent || "").trim().substring(0, 50),
    }
  }

  override async restoreVirtualAnchor(anchor: AnchorData, signal?: AbortSignal): Promise<boolean> {
    if (anchor.type !== "virtual-row" || typeof anchor.rowKey !== "number") return false
    const rowKey = anchor.rowKey
    const offset = anchor.offset || 0

    // 虚拟列表的挂载晚于会话 id 就绪，冷加载可能要数秒，有界等待其出现；
    // 期间用户主动滚动会通过 signal 中止等待
    const deadline = Date.now() + 10000
    while (!this.isClaudeVirtualConversation()) {
      if (signal?.aborted) return false
      if (Date.now() >= deadline) {
        console.warn("[Ophel] Reading history restore skipped: Claude message list not ready")
        return false
      }
      await this.sleep(100)
    }

    const scrollContainer = this.getScrollContainer()
    if (!scrollContainer) return false

    const findRow = () =>
      this.getClaudeVirtualRows().find(
        (row) => this.getClaudeVirtualMessageIndex(row) === rowKey,
      ) ?? null

    // 与 resolveCachedClaudeOutlineTarget 同一手法：按序号比例估算落点，
    // 从近到远探测候选位置，直到目标行挂出
    let row = findRow()
    if (!row) {
      const totalMessages = this.getClaudeVirtualMessageCount()
      const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
      const estimatedTop =
        totalMessages && totalMessages > 1
          ? (maxScroll * rowKey) / (totalMessages - 1)
          : scrollContainer.scrollTop
      const positions = this.buildClaudeVirtualScrollPositions(scrollContainer)
      positions.sort((a, b) => Math.abs(a - estimatedTop) - Math.abs(b - estimatedTop))

      for (const top of new Set([estimatedTop, ...positions])) {
        if (signal?.aborted) return false
        await this.scrollClaudeVirtualContainer(scrollContainer, top)
        row = findRow()
        if (row) break
      }
    }
    if (signal?.aborted) return false
    if (!row) {
      console.warn("[Ophel] Reading history restore skipped: Claude message not found", rowKey)
      return false
    }

    // 分支切换/编辑后序号可能指向另一条消息：文本不符宁可不跳，也不跳错
    if (anchor.textSignature) {
      const current = (row.textContent || "").trim().substring(0, 50)
      if (current !== anchor.textSignature) {
        console.warn(
          "[Ophel] Reading history restore skipped: Claude message content changed",
          rowKey,
        )
        return false
      }
    }

    // 落定判定用「行相对容器顶部的视觉位置」而不是 scrollTop 像素：刷新后页面仍在
    // 渲染，文档高度在漂，像素值几秒内稳定不下来；视觉位置才是保存 offset 的本义
    const isAligned = (container: HTMLElement) => {
      const target = findRow()
      if (!target) return false
      const visualOffset =
        target.getBoundingClientRect().top - container.getBoundingClientRect().top
      return Math.abs(visualOffset + offset) <= 24
    }
    const settled = await settleVirtualScroll(
      () => this.getScrollContainer(),
      isAligned,
      (container) => {
        const target = findRow()
        if (target) alignScrollTop(container, this.getRelativeTop(container, target) + offset)
      },
      signal,
      { timeoutMs: 4000 },
    )
    if (!settled && !signal?.aborted) {
      console.warn("[Ophel] Reading history restore incomplete: Claude scroll did not settle")
    }
    return settled
  }

  /**
   * 高亮估算快照：以当前挂载行的 data-rs-index（= 消息序号）做锚点，行顶、行底
   * 各记一个点；边界取 aria-setsize 的消息总数与最大 scrollTop（与大纲高亮同一
   * 内容坐标系）。
   */
  override getVirtualOutlinePositionSnapshot(): VirtualOutlinePositionSnapshot | null {
    if (!this.isClaudeVirtualConversation()) return null
    const container = this.getScrollContainer()
    if (!container) return null
    const totalMessages = this.getClaudeVirtualMessageCount()
    if (!totalMessages || totalMessages <= 0) return null

    const anchors: VirtualPositionAnchor[] = []
    for (const row of this.getClaudeVirtualRows()) {
      const index = this.parseClaudeVirtualMessageIndex(row)
      if (index === null) continue
      const top = this.getRelativeTop(container, row)
      anchors.push({ index, top })
      anchors.push({ index: index + 1, top: top + row.getBoundingClientRect().height })
    }
    if (anchors.length === 0) return null

    return {
      anchors,
      bounds: {
        endSlot: totalMessages,
        endTop: Math.max(0, container.scrollHeight - container.clientHeight),
      },
    }
  }

  override getVirtualOutlineRowIndex(item: OutlineItem): number | null {
    const ref = item.navigationId || item.id
    const match = ref?.match(/^claude-message:(\d+):/)
    if (match) return Number(match[1])
    return this.getClaudeVirtualMessageIndex(item.element)
  }

  getVisibleAnchorElement(): AnchorData | null {
    const container = this.getScrollContainer()
    if (!container) return null

    const candidates = this.getClaudeChatCandidates(container)
    if (!candidates.length) return null

    const scrollTop = container.scrollTop
    let bestElement: HTMLElement | null = null
    let bestTop = Number.NEGATIVE_INFINITY

    candidates.forEach((element) => {
      const top = this.getRelativeTop(container, element)
      if (top <= scrollTop + 100 && top > bestTop) {
        bestElement = element
        bestTop = top
      }
    })

    if (!bestElement) {
      bestElement = candidates[0]
      bestTop = this.getRelativeTop(container, bestElement)
    }

    const offset = scrollTop - bestTop
    const id = bestElement.getAttribute("data-message-id") || bestElement.id

    if (id) {
      let selector = `[data-message-id="${id}"]`
      if (!bestElement.matches(selector)) selector = `#${id}`
      return { type: "selector", selector, offset } as AnchorData
    }

    const index = candidates.indexOf(bestElement)
    if (index === -1) return null

    const textSignature = (bestElement.textContent || "").trim().substring(0, 50)
    return { type: "index", index, offset, textSignature } as AnchorData
  }

  restoreScroll(anchorData: AnchorData): boolean {
    const container = this.getScrollContainer()
    if (!container || !anchorData) return false

    let targetElement: HTMLElement | null = null

    if (anchorData.type === "selector" && anchorData.selector) {
      targetElement = container.querySelector(anchorData.selector) as HTMLElement | null
    } else if (anchorData.type === "index" && typeof anchorData.index === "number") {
      const candidates = this.getClaudeChatCandidates(container)

      if (candidates[anchorData.index]) {
        targetElement = candidates[anchorData.index]

        if (anchorData.textSignature) {
          const currentText = (targetElement.textContent || "").trim().substring(0, 50)
          if (currentText !== anchorData.textSignature) {
            targetElement =
              candidates.find(
                (candidate) =>
                  (candidate.textContent || "").trim().substring(0, 50) ===
                  anchorData.textSignature,
              ) || targetElement
          }
        }
      } else if (anchorData.textSignature) {
        targetElement =
          candidates.find(
            (candidate) =>
              (candidate.textContent || "").trim().substring(0, 50) === anchorData.textSignature,
          ) || null
      }
    }

    if (!targetElement) return false

    const targetTop = this.getRelativeTop(container, targetElement) + (anchorData.offset || 0)
    container.scrollTo({
      top: targetTop,
      behavior: "instant" as ScrollBehavior,
    })
    return true
  }

  // ==================== 大纲功能 ====================

  getOutlineSources(): OutlineSource[] {
    const sources: OutlineSource[] = [
      {
        id: "conversation",
        kind: "conversation",
        label: t("outlineSourceConversation"),
        available: true,
      },
    ]
    const documentOutline = this.extractClaudeDocumentOutline(6, false)
    if (documentOutline.length > 0) {
      sources.push({
        id: CLAUDE_DOCUMENT_OUTLINE_SOURCE_ID,
        kind: "document",
        label: t("outlineSourceDocument"),
        available: true,
        count: documentOutline.length,
      })
    }

    return sources
  }

  supportsDynamicOutlineSources(): boolean {
    return true
  }

  getOutlineSourcesSignature(): string {
    const documentSignature = this.getClaudeDocumentSignature()
    return `conversation:1|${CLAUDE_DOCUMENT_OUTLINE_SOURCE_ID}:${documentSignature || "0"}`
  }

  extractOutlineForSource(
    sourceId: string,
    maxLevel = 6,
    includeUserQueries = false,
    showWordCount = false,
  ): OutlineItem[] {
    if (sourceId === CLAUDE_DOCUMENT_OUTLINE_SOURCE_ID) {
      return this.extractClaudeDocumentOutline(maxLevel, showWordCount)
    }

    return this.extractOutline(maxLevel, includeUserQueries, showWordCount)
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    this.ensureClaudeOutlineCacheSession()
    const outline: OutlineItem[] = []
    const outlineRoot = this.getOutlineRoot()

    // 扫描覆盖与是否生成大纲项无关：用户消息被隐藏、助手回复没有标题时，
    // 这些已挂载行也必须记为已检查，避免消息总数增长后误触发全量回扫。
    this.recordMountedClaudeVirtualMessageIndexes(outlineRoot)

    // 虚拟滚动首选数据源：异步拉取会话接口，补齐离屏回复的标题与提问
    this.maybeRefreshApiOutline()

    // 辅助函数：从文本中移除思维链内容
    const removeThinkingContent = (text: string): string => {
      // Claude 的 extended thinking 是纯文本 <thinking>...</thinking> 标签
      // 可能跨越多行
      return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim()
    }

    // 辅助函数：计算用户提问的字数（统计后续AI回复）
    const userQuerySelector = this.getUserQuerySelector()
    const allUserQueries = showWordCount
      ? Array.from(outlineRoot.querySelectorAll(userQuerySelector))
      : []
    const allResponses = showWordCount
      ? Array.from(outlineRoot.querySelectorAll(this.config.selectors.assistantResponse)).filter(
          (response) => !response.closest(this.config.sitePrivateSelectors.documentRoot),
        )
      : []
    const textSignatureCache = new WeakMap<Node, string>()
    const getTextSignature = (element: Node | null): string => {
      if (!element) return "none"
      const cached = textSignatureCache.get(element)
      if (cached) return cached
      const text =
        element instanceof Document
          ? element.body?.textContent || element.documentElement?.textContent || ""
          : element.textContent || ""
      const signature = hashTextForCache(text)
      textSignatureCache.set(element, signature)
      return signature
    }
    const getCachedWordCount = (
      element: Element,
      signature: string,
      calculate: () => number,
    ): number => {
      const cached = this.outlineWordCountCache.get(element)
      if (cached?.signature === signature) return cached.count
      const count = calculate()
      this.outlineWordCountCache.set(element, { signature, count })
      return count
    }

    const calculateUserQueryWordCount = (startEl: Element): number => {
      // Claude 结构：用户消息和AI回复在同一滚动容器中，不是严格的siblings
      // 需要向下遍历找到下一个用户消息之前的所有AI回复
      const startIndex = allUserQueries.indexOf(startEl)
      if (startIndex === -1) return 0

      // 找到下一个用户消息的位置（用于确定边界）
      const nextUserQuery = allUserQueries[startIndex + 1]
      const signature = [
        "user",
        getTextSignature(startEl),
        getTextSignature(nextUserQuery || null),
        getTextSignature(outlineRoot),
      ].join("|")

      return getCachedWordCount(startEl, signature, () => {
        let totalLength = 0
        for (const response of allResponses) {
          // 检查这个回复是否在当前用户消息之后
          const pos = startEl.compareDocumentPosition(response)
          if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING)) continue

          // 如果有下一个用户消息，检查这个回复是否在它之前
          if (nextUserQuery) {
            const posToNext = nextUserQuery.compareDocumentPosition(response)
            if (posToNext & Node.DOCUMENT_POSITION_FOLLOWING) continue
          }

          // 获取 markdown 内容（排除思维链）
          const markdownContent = response.querySelector(
            this.config.sitePrivateSelectors.responseMarkdown,
          )
          if (markdownContent) {
            const rawText = markdownContent.textContent?.trim() || ""
            const textWithoutThinking = removeThinkingContent(rawText)
            totalLength += textWithoutThinking.length
          }
        }

        return totalLength
      })
    }

    // Claude 对话大纲只收 AI 回复里的标题；侧边栏、导航等页面标题不应进入对话大纲。
    const headings = Array.from(outlineRoot.querySelectorAll("h1, h2, h3, h4, h5, h6")).filter(
      (heading) =>
        !heading.closest(this.config.sitePrivateSelectors.documentRoot) &&
        heading.closest(this.config.selectors.assistantResponse) !== null,
    )

    headings.forEach((h, index) => {
      const level = parseInt(h.tagName[1])
      if (level > maxLevel) return

      // 跳过侧边栏分组标题
      if (h.matches(this.config.sitePrivateSelectors.outlineIgnoredHeading)) return

      // 跳过屏幕阅读器专用元素（如 "You said:" / "Claude responded:" 提示文本）
      // 使用类名定位而非文本匹配，以支持多语言
      if (h.matches(this.config.sitePrivateSelectors.srOnly)) return

      const text = h.textContent?.trim() || ""
      if (!text) return

      const item: OutlineItem = {
        level,
        text: text.length > 200 ? text.slice(0, 200) : text,
        element: h,
        isUserQuery: false,
        isTruncated: text.length > 80,
      }

      // 字数统计
      if (showWordCount) {
        let nextBoundaryEl: Element | null = null
        for (let i = index + 1; i < headings.length; i++) {
          const candidate = headings[i]
          const candidateLevel = parseInt(candidate.tagName[1])
          if (candidateLevel <= level) {
            nextBoundaryEl = candidate
            break
          }
        }

        // 使用 Range 方法计算字数（排除思维链）
        const responseContainer = h.closest(this.config.selectors.assistantResponse)
        if (responseContainer) {
          const signature = [
            "heading",
            getTextSignature(h),
            getTextSignature(nextBoundaryEl),
            getTextSignature(outlineRoot),
          ].join("|")
          const rawCount = getCachedWordCount(h, signature, () =>
            this.calculateRangeWordCount(h, nextBoundaryEl, responseContainer),
          )
          // Range 方法返回的是包含思维链的字数，这里暂时接受
          // 因为思维链不太可能在标题下方的范围内
          item.wordCount = rawCount
        }
      }

      outline.push(item)
    })

    // 可选：包含用户问题
    if (includeUserQueries) {
      const userQueries = outlineRoot.querySelectorAll(this.config.selectors.userQuery)
      userQueries.forEach((el) => {
        const text = el.textContent?.trim() || ""
        if (!text) return

        const item: OutlineItem = {
          level: 0,
          text: text.length > 200 ? text.slice(0, 200) : text,
          element: el,
          isUserQuery: true,
          isTruncated: text.length > 60,
        }

        if (showWordCount) {
          item.wordCount = calculateUserQueryWordCount(el)
        }

        outline.push(item)
      })

      // 按 DOM 顺序排序
      outline.sort((a, b) => {
        if (!a.element || !b.element) return 0
        const pos = a.element.compareDocumentPosition(b.element)
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      })
    }

    this.updateClaudeOutlineCache(outline)
    const merged = this.mergeCachedClaudeOutlineItems(
      outline,
      maxLevel,
      includeUserQueries,
      showWordCount,
    )
    if (!this.isCollectingVirtualOutline) {
      this.scheduleClaudeVirtualOutlineScan()
    }

    return merged
  }

  private extractClaudeDocumentOutline(maxLevel = 6, showWordCount = false): OutlineItem[] {
    const root = this.getClaudeDocumentMarkdownElement()
    if (!(root instanceof Element)) return []

    return extractHeadingOutline(root, {
      maxLevel,
      showWordCount,
      idPrefix: "claude-document",
      shouldSkipHeading: (heading) => this.shouldSkipClaudeDocumentHeading(heading),
      calculateWordCount: (heading, nextBoundary, outlineRoot) => {
        return this.calculateRangeWordCount(heading, nextBoundary, outlineRoot)
      },
    })
  }

  private shouldSkipClaudeDocumentHeading(heading: Element): boolean {
    return (
      heading.matches(this.config.sitePrivateSelectors.srOnly) ||
      this.isInRenderedMarkdownContainer(heading)
    )
  }

  private findClaudeDocumentHeading(level: number, text: string): Element | null {
    const root = this.getClaudeDocumentMarkdownElement()
    if (!root) return null
    return findHeadingByText(root, level, text, (heading) =>
      this.shouldSkipClaudeDocumentHeading(heading),
    )
  }

  getOutlineScrollContainer(sourceId = "conversation"): HTMLElement | null {
    if (sourceId === CLAUDE_DOCUMENT_OUTLINE_SOURCE_ID) {
      const root = this.getClaudeDocumentMarkdownElement()
      return findScrollableAncestor(root) || this.getClaudeDocumentRoot()
    }

    return this.getScrollContainer()
  }

  findUserQueryElement(queryIndex: number, text: string): Element | null {
    this.ensureClaudeOutlineCacheSession()
    const cachedUserQueries =
      this.sortedCachedUserQueries ??
      Array.from(this.outlineItemCache.values())
        .filter((entry) => entry.isUserQuery)
        .sort((a, b) => a.messageIndex - b.messageIndex)
    this.sortedCachedUserQueries = cachedUserQueries
    const entry = cachedUserQueries[queryIndex - 1]

    // 文本校验：序号压缩错位（无任何展示文本的提问不占大纲序号）时缓存条目
    // 与目标文本不可调和，跳过缓存路径交给基类按序号/文本搜索
    if (entry && (!text || isReconcilableOutlineText(entry.text, text))) {
      // 缓存条目可能对应未挂载行（或缓存来自接口回填而非虚拟扫描）：
      // 挂载查找落空时回退基类按序号/文本搜索，而不是直接判失
      return (
        this.findClaudeOutlineTargetInMountedRow(entry) ??
        super.findUserQueryElement(queryIndex, text)
      )
    }

    return super.findUserQueryElement(queryIndex, text)
  }

  async resolveOutlineTarget(
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery" | "id" | "navigationId">,
    queryIndex?: number,
    sourceId = "conversation",
  ): Promise<Element | null> {
    if (sourceId === CLAUDE_DOCUMENT_OUTLINE_SOURCE_ID) {
      return this.findClaudeDocumentHeading(item.level, item.text)
    }

    const cachedId = item.navigationId || item.id
    if (cachedId && this.outlineItemCache.has(cachedId)) {
      const target = await this.resolveCachedClaudeOutlineTarget(cachedId)
      if (target) return target
    }

    return super.resolveOutlineTarget(item, queryIndex, sourceId)
  }

  private async resolveCachedClaudeOutlineTarget(id: string): Promise<Element | null> {
    this.ensureClaudeOutlineCacheSession()
    const entry = this.outlineItemCache.get(id)
    if (!entry) return null

    const mountedTarget = this.findClaudeOutlineTargetInMountedRow(entry)
    if (mountedTarget) return mountedTarget

    const scrollContainer = this.getScrollContainer()
    if (!scrollContainer) return null

    const totalMessages = this.getClaudeVirtualMessageCount()
    const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    const estimatedTop =
      totalMessages && totalMessages > 1
        ? (maxScroll * entry.messageIndex) / (totalMessages - 1)
        : scrollContainer.scrollTop
    const positions = this.buildClaudeVirtualScrollPositions(scrollContainer)
    positions.sort((a, b) => Math.abs(a - estimatedTop) - Math.abs(b - estimatedTop))

    for (const top of [estimatedTop, ...positions]) {
      await this.scrollClaudeVirtualContainer(scrollContainer, top)
      this.extractOutline(6, true, false)
      const target = this.findClaudeOutlineTargetInMountedRow(entry)
      if (target) return target
    }

    return null
  }

  private findClaudeOutlineTargetInMountedRow(entry: ClaudeOutlineCacheEntry): Element | null {
    const row = this.getClaudeVirtualRows().find(
      (candidate) => this.getClaudeVirtualMessageIndex(candidate) === entry.messageIndex,
    )
    if (!row) return null

    if (entry.isUserQuery) {
      return row.querySelector(this.getUserQuerySelector())
    }

    const headings = Array.from(row.querySelectorAll("h1, h2, h3, h4, h5, h6")).filter(
      (heading) =>
        !heading.matches(this.config.sitePrivateSelectors.srOnly) &&
        !heading.closest(this.config.sitePrivateSelectors.documentRoot) &&
        heading.closest(this.config.selectors.assistantResponse) !== null,
    )
    return headings[entry.orderInMessage - 1] || null
  }

  // 动态判定：仅虚拟化长对话需要轮询兜底，无法静态声明为 traits 字段
  usesPeriodicOutlineRefreshFallback(): boolean {
    return this.isClaudeVirtualConversation()
  }

  scrollToOutlineSourceTarget(element: HTMLElement, sourceId = "conversation"): void {
    if (sourceId === CLAUDE_DOCUMENT_OUTLINE_SOURCE_ID) {
      const container = findScrollableAncestor(element) || this.getOutlineScrollContainer(sourceId)
      if (scrollElementInContainer(element, container)) {
        return
      }
    }

    this.scrollToOutlineTarget(element)
  }

  // ==================== 生成状态 ====================

  isGenerating(): boolean {
    return this.config.generating.existsSelectors.some(
      (selector) => document.querySelector(selector) !== null,
    )
  }

  getStopButtonSelectors(): string[] {
    return [...this.config.selectors.stopButton]
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

  // ==================== 导出功能 ====================

  getExportConfig(): ExportConfig {
    return { ...this.config.export }
  }

  getAssistantMermaidSupportMode() {
    return this.config.mermaidSupport
  }

  getLatestReplyText(): string | null {
    const responses = Array.from(
      document.querySelectorAll(this.config.selectors.assistantResponse),
    ).filter((element) => !element.closest(this.config.sitePrivateSelectors.documentRoot))
    if (responses.length === 0) return null

    const lastResponse = responses[responses.length - 1]

    // 过滤掉Artifact卡片,只提取.standard-markdown或.progressive-markdown
    const markdownContent = lastResponse.querySelector(
      this.config.sitePrivateSelectors.responseMarkdown,
    )
    if (markdownContent) {
      const markdown = htmlToMarkdown(markdownContent).trim()
      return markdown || markdownContent.textContent?.trim() || null
    }

    // 降级:如果没有markdown容器,返回整个内容(兼容旧版本)
    return lastResponse.textContent?.trim() || null
  }

  getResponseContainerSelector(): string {
    return this.config.selectors.responseContainer
  }

  /**
   * 会话接口导出数据源：拉全量历史并解析为导出消息序列。
   * 无法证明历史完整的情形（解析器判 null、接口失败、未登录）
   * 都返回 null，调用方回退现有滚动快照收集。
   */
  private async collectApiExportMessages(
    context: ExportLifecycleContext,
    collector?: ExportAssetCollector,
  ): Promise<ExportMessage[] | null> {
    if (!this.isUserConversationPage()) return null
    const sessionId = this.getSessionId()

    try {
      const orgId = await this.getActiveOrganizationId()
      if (!orgId) return null

      const response = await fetch(this.buildConversationApiUrl(orgId, sessionId), {
        headers: this.buildNativeApiHeaders(),
        credentials: "include",
      })
      if (!response.ok) return null

      const parsed = parseClaudeHistoryExport(await response.json())
      if (!parsed || parsed.sessionId !== sessionId) return null

      const messages: ExportMessage[] = []
      for (const message of parsed.messages) {
        if (message.role === "user") {
          const content = this.formatApiUserExportMessage(message, collector)
          if (content) messages.push({ role: "user", content })
          continue
        }

        const parts: string[] = []
        if (context.includeThoughts && message.thinkingMarkdown) {
          parts.push(
            this.formatAsThoughtBlockquote(message.thinkingMarkdown, message.thinkingTitle),
          )
        }
        for (const segment of message.segments) {
          parts.push(
            segment.type === "text"
              ? segment.text
              : this.formatApiDocumentSegment(segment.document, collector),
          )
        }
        const content = parts.filter(Boolean).join("\n\n").trim()
        if (content) {
          messages.push({ role: "assistant", content })
        }
      }

      return messages.length > 0 ? messages : null
    } catch (error) {
      console.warn("[ClaudeAdapter] Failed to collect api export payload:", error)
      return null
    }
  }

  // 与 extractClaudeUserQueryExportContent 同一输出结构：图片、附件列表、正文
  private formatApiUserExportMessage(
    message: ClaudeHistoryExportMessage,
    collector?: ExportAssetCollector,
  ): string {
    // 仅「图片且有可下载地址」按图片嵌入；其余（非图片、缺 preview_url）
    // 一律降级为附件链接行，避免静默丢失或误嵌图片语法
    const isEmbeddableImage = (file: ClaudeHistoryExportUserFile): boolean =>
      file.fileKind === "image" && Boolean(file.previewUrl)
    const imageMarkdown = message.files
      .filter(isEmbeddableImage)
      .map((file) => this.formatApiUserImage(file, collector))
      .filter(Boolean)
    const otherFileLines = message.files
      .filter((file) => !isEmbeddableImage(file))
      .map((file) => {
        const fileName = file.fileName || "file"
        return file.previewUrl
          ? `- [${escapeMarkdownLinkText(fileName)}](${file.previewUrl})`
          : `- ${fileName}`
      })
    const fileLines = message.attachments.map((attachment) => {
      const fileName = attachment.fileName || "file"
      if (collector && attachment.extractedContent.trim()) {
        const asset = addMarkdownDocumentAsset(collector, attachment.extractedContent, {
          // buildMarkdownFilename 固定补 .md 后缀，先去掉文件名里已有的
          title: fileName.replace(/\.md$/i, ""),
          directory: "assets/files",
          idPrefix: "claude-user-file",
        })
        return `- [${escapeMarkdownLinkText(fileName)}](${asset.path})`
      }
      return `- ${fileName}`
    })
    fileLines.push(...otherFileLines)
    const fileBlock =
      fileLines.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileLines.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, message.requestText].filter(Boolean).join("\n\n")
  }

  private formatApiUserImage(
    file: ClaudeHistoryExportUserFile,
    collector?: ExportAssetCollector,
  ): string {
    if (!file.previewUrl) return ""
    const source = file.previewUrl.startsWith("http")
      ? file.previewUrl
      : `${window.location.origin}${file.previewUrl}`
    const alt = file.fileName || "image"
    const assetPath = collector
      ? addImageExportAsset(collector, {
          source,
          alt,
          extensionHint: file.fileName,
          idPrefix: "claude-user-image",
          filenamePrefix: "claude-user-image",
        })
      : source
    return assetPath ? `![${escapeMarkdownLinkText(alt)}](${assetPath})` : ""
  }

  private formatApiDocumentSegment(
    document: ClaudeHistoryExportDocument,
    collector?: ExportAssetCollector,
  ): string {
    // 与 formatClaudeArtifactPlaceholder 同风格的占位符（接口侧无元数据/下载地址）
    if (!document.content) return `[Artifact: ${document.name}]`

    if (document.mimeType === "text/markdown") {
      if (collector) {
        return createMarkdownDocumentAssetLink(collector, document.content, {
          // buildMarkdownFilename 固定补 .md 后缀，先去掉名称里已有的
          title: document.name.replace(/\.md$/i, ""),
          fallbackTitle: "claude-document",
          directory: "assets/documents",
          idPrefix: "claude-document",
        })
      }
      // 与 formatClaudeDocumentInlineContent 同规则
      const trimmed = document.content.trim()
      return /^#{1,6}\s+/m.test(trimmed) ? trimmed : `### ${document.name}\n\n${trimmed}`
    }

    // html 等其他源码：围栏代码块内联（~~~ 避免与正文 ``` 冲突）
    const lang = document.path.split(".").pop() || ""
    return `### ${document.name}\n\n~~~${lang}\n${document.content.trim()}\n~~~`
  }

  async prepareConversationExport(context: ExportLifecycleContext): Promise<unknown> {
    this.ensureClaudeOutlineCacheSession()
    this.exportIncludeThoughtsOverride = context.includeThoughts
    this.exportDocumentCache = []
    this.exportDocumentCollectionRequired = this.shouldCollectClaudeDocumentsForExport(context)
    this.exportThoughtBlocks = new WeakMap<Element, string[]>()
    this.exportThoughtBlocksByAssistantIndex = new Map<number, string[]>()
    this.removeClaudeExportSnapshot()
    this.exportApiBundle = null

    // 常规会话优先走会话接口拿全量 markdown（公式/代码零损耗、无需滚动收集）；
    // 接口不可用或无法证明历史完整时返回 null，回退现有快照收集
    const collector =
      context.format === "markdown" && context.packaging === "zip"
        ? createExportAssetCollector()
        : undefined
    this.exportApiMessages = await this.collectApiExportMessages(context, collector)
    if (this.exportApiMessages) {
      this.exportApiBundle = collector
        ? { messages: this.exportApiMessages, assets: collector.assets }
        : null
      return {
        documentPanelWasOpen: false,
        thoughtContainersExpandedForExport: [],
        usedApiExport: true,
      } satisfies ClaudeExportLifecycleState
    }

    const state: ClaudeExportLifecycleState = {
      documentPanelWasOpen: this.isClaudeDocumentPanelOpen(),
      documentSignature: this.getClaudeDocumentSignature(),
      documentTitle: this.getClaudeDocumentTitle(),
      documentArtifactIndex: null,
      thoughtContainersExpandedForExport: [],
    }

    let pendingSnapshotRoot: HTMLElement | null = null
    let thoughtContainersExpandedForExport: HTMLElement[] = []
    if (this.isClaudeVirtualConversation()) {
      if (this.outlineScanPromise) {
        await this.outlineScanPromise
      }
      const snapshot = await this.collectClaudeVirtualExportSnapshot(context.includeThoughts)
      pendingSnapshotRoot = snapshot.root
      thoughtContainersExpandedForExport = snapshot.expandedThoughtContainers
    } else if (context.includeThoughts) {
      thoughtContainersExpandedForExport = await this.expandClaudeThoughtBlocksForExport()
      this.captureClaudeThoughtBlocksForExport()
    }
    state.thoughtContainersExpandedForExport = thoughtContainersExpandedForExport

    if (!this.shouldCollectClaudeDocumentsForExport(context)) {
      this.mountClaudeExportSnapshot(pendingSnapshotRoot)
      return state
    }

    try {
      this.exportDocumentCache = await this.collectClaudeDocumentArtifacts(
        pendingSnapshotRoot || document,
      )
    } catch (error) {
      await this.restoreConversationAfterExport(context, state)
      throw error
    }

    if (state.documentPanelWasOpen && state.documentSignature) {
      const originalDocument = this.findCachedClaudeDocumentByState(state)
      state.documentArtifactIndex = originalDocument?.index ?? null
    }

    this.mountClaudeExportSnapshot(pendingSnapshotRoot)
    return state
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    state: unknown,
  ): Promise<void> {
    try {
      if (!this.isClaudeExportLifecycleState(state)) return
      if (state.usedApiExport) return

      if (state.documentPanelWasOpen) {
        await this.restoreClaudeDocumentPanel(state)
        return
      }

      await this.closeClaudeDocumentPanel()
    } finally {
      if (this.isClaudeExportLifecycleState(state)) {
        this.restoreClaudeThoughtBlocksAfterExport(state)
      }
      this.exportDocumentCache = []
      this.exportDocumentCollectionRequired = false
      this.exportIncludeThoughtsOverride = null
      this.exportThoughtBlocks = new WeakMap<Element, string[]>()
      this.exportThoughtBlocksByAssistantIndex = new Map<number, string[]>()
      this.removeClaudeExportSnapshot()
      this.exportApiMessages = null
      this.exportApiBundle = null
    }
  }

  private isClaudeExportLifecycleState(state: unknown): state is ClaudeExportLifecycleState {
    return (
      typeof state === "object" &&
      state !== null &&
      "documentPanelWasOpen" in state &&
      typeof (state as ClaudeExportLifecycleState).documentPanelWasOpen === "boolean"
    )
  }

  private shouldCollectClaudeDocumentsForExport(context: ExportLifecycleContext): boolean {
    return context.format === "markdown" || context.format === "clipboard"
  }

  private async restoreClaudeDocumentPanel(state: ClaudeExportLifecycleState): Promise<void> {
    if (!state.documentSignature || this.getClaudeDocumentSignature() === state.documentSignature) {
      return
    }

    const originalDocument = this.findCachedClaudeDocumentByState(state)
    if (!originalDocument) {
      throw new Error("Claude original document could not be matched for restore")
    }

    const artifactSource =
      originalDocument.element ||
      this.getClaudeDocumentArtifactCells()[originalDocument.index] ||
      null
    const artifact = artifactSource
      ? await this.resolveClaudeArtifactInteractionTarget(artifactSource)
      : null
    if (!artifact) {
      throw new Error(`Claude original document could not be mounted: ${originalDocument.title}`)
    }

    const markdownRoot = await this.openClaudeArtifactDocument(artifact)
    if (
      !markdownRoot ||
      this.getClaudeDocumentSignature(markdownRoot) !== state.documentSignature
    ) {
      throw new Error(`Claude original document could not be restored: ${originalDocument.title}`)
    }
  }

  private findCachedClaudeDocumentByState(
    state: ClaudeExportLifecycleState,
  ): ClaudeDocumentExportCacheEntry | null {
    if (state.documentArtifactIndex !== null && state.documentArtifactIndex !== undefined) {
      const byIndex = this.exportDocumentCache.find(
        (item) => item.index === state.documentArtifactIndex,
      )
      if (byIndex) return byIndex
    }

    if (state.documentSignature) {
      const bySignature = this.exportDocumentCache.find(
        (item) => item.signature === state.documentSignature,
      )
      if (bySignature) return bySignature
    }

    if (state.documentTitle) {
      const titleMatches = this.exportDocumentCache.filter(
        (item) => item.title === state.documentTitle,
      )
      if (titleMatches.length === 1) return titleMatches[0]
    }

    return null
  }

  async extractExportBundle(_context: ExportLifecycleContext): Promise<ExportBundle | null> {
    // 接口数据源导出：zip 打包时携带 collector 收集的图片/文档资产
    if (this.exportApiMessages) {
      return this.exportApiBundle
    }

    if (!this.hasClaudeExportAssets()) {
      return null
    }

    return this.createExportBundleFromMessages((collector) =>
      this.extractClaudeExportMessages(collector),
    )
  }

  async extractExportMessages(_context: ExportLifecycleContext): Promise<ExportMessage[] | null> {
    if (this.exportApiMessages) {
      return this.exportApiMessages
    }

    if (
      !this.exportSnapshotRoot &&
      this.exportDocumentCache.length === 0 &&
      !this.isClaudeDocumentPanelOpen() &&
      !this.hasClaudeUserAttachments() &&
      !this.hasClaudeThoughtExportCache()
    ) {
      return null
    }

    return this.extractClaudeExportMessages()
  }

  /**
   * Claude 的大纲根容器是滚动容器，而非单条回复 .font-claude-response，
   * 所以 MutationObserver 也应观察滚动容器，避免漏掉列表头部变更。
   */
  getObserveTarget(): Element | null {
    return this.getScrollContainer()
  }

  // ==================== 用户问题处理 ====================

  getUserQuerySelector(): string {
    return this.config.selectors.userQuery
  }

  extractUserQueryText(element: Element): string {
    return element.textContent?.trim() || ""
  }

  extractUserQueryExportContent(element: Element): string {
    return this.extractClaudeUserQueryExportContent(element)
  }

  private hasClaudeExportAssets(): boolean {
    return this.exportDocumentCache.length > 0 || this.hasClaudeUserAttachments()
  }

  private hasClaudeUserAttachments(): boolean {
    const root = this.exportSnapshotRoot || this.getOutlineRoot()
    const userMessages = Array.from(root.querySelectorAll(this.getUserQuerySelector()))
    return userMessages.some((message) => this.extractClaudeUserAttachments(message).length > 0)
  }

  extractUserQueryMarkdown(element: Element): string {
    // Claude 对用户输入已经部分渲染了 Markdown（blockquote, ul, pre）
    // 但标题和加粗没有渲染，仍然是纯文本在 <p class="whitespace-pre-wrap"> 中
    // 我们需要提取需要增强的 <p> 元素的文本

    // 检查是否有包含未渲染 Markdown 的 <p> 元素
    const textParagraphs = element.querySelectorAll(this.config.sitePrivateSelectors.userQueryText)
    if (textParagraphs.length === 0) {
      return ""
    }

    // 收集需要渲染的段落内容
    const paragraphsToRender: string[] = []
    textParagraphs.forEach((p) => {
      const text = p.textContent || ""
      if (shouldEnhanceClaudeParagraph(text)) {
        paragraphsToRender.push(text)
      }
    })

    // 如果没有需要渲染的段落，返回空
    if (paragraphsToRender.length === 0) {
      return ""
    }

    // 返回一个能通过 looksLikeMarkdown 检查的字符串
    // looksLikeMarkdown 需要：包含换行 + 命中 Markdown 模式
    // 实际渲染逻辑在 replaceUserQueryContent 中处理
    return "# CLAUDE_INCREMENTAL\nplaceholder"
  }

  replaceUserQueryContent(element: Element, _html: string): boolean {
    // Claude 增量增强策略：
    // 只替换 <p class="whitespace-pre-wrap"> 中未渲染的 Markdown
    // 保留 Claude 已渲染的 <blockquote>, <ul>, <pre> 等

    // 检查是否已经处理过
    if (element.querySelector(".gh-claude-enhanced")) {
      return false
    }

    const textParagraphs = element.querySelectorAll(this.config.sitePrivateSelectors.userQueryText)
    if (textParagraphs.length === 0) return false

    let hasChanges = false

    textParagraphs.forEach((p) => {
      const text = p.textContent || ""

      if (!shouldEnhanceClaudeParagraph(text)) {
        return // 这个段落不需要处理
      }

      const html = renderMarkdown(text, false, { enableMath: true })

      // 创建替换元素
      const rendered = document.createElement("div")
      rendered.className =
        "gh-claude-enhanced gh-user-query-markdown gh-markdown-preview whitespace-pre-wrap break-words"
      rendered.innerHTML = html

      // 替换原始 <p> 元素
      p.replaceWith(rendered)
      hasChanges = true
    })

    return hasChanges
  }

  private extractClaudeUserQueryExportContent(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    const textContent = this.extractUserQueryText(element).trim()
    const attachments = this.extractClaudeUserAttachments(element)
    if (attachments.length === 0) return textContent

    const imageMarkdown = this.formatClaudeUserImageAttachments(attachments, collector)
    const fileMarkdown = this.formatClaudeUserFileAttachments(attachments, collector)
    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, textContent].filter(Boolean).join("\n\n")
  }

  private extractClaudeUserAttachments(userMessage: Element): ClaudeUserAttachment[] {
    const container = this.getClaudeUserMessageContainer(userMessage)
    if (!container) return []

    const attachments: ClaudeUserAttachment[] = []
    const seen = new Set<string>()

    this.extractClaudeUserImageAttachments(container).forEach((attachment) => {
      const key = `image:${attachment.source || attachment.name}`
      if (seen.has(key)) return
      seen.add(key)
      attachments.push(attachment)
    })

    this.extractClaudeUserFileAttachments(container).forEach((attachment) => {
      const key = `file:${attachment.source || attachment.name}:${attachment.type || ""}`
      if (seen.has(key)) return
      seen.add(key)
      attachments.push(attachment)
    })

    return attachments
  }

  private getClaudeUserMessageContainer(userMessage: Element): Element | null {
    const privateSelectors = this.config.sitePrivateSelectors
    const bubble = userMessage.closest(privateSelectors.userMessageBubble)
    if (!bubble) return userMessage

    let best: Element | null = null
    let current = bubble.parentElement
    while (
      current &&
      current !== document.body &&
      !current.matches(privateSelectors.userMessageBoundary)
    ) {
      if (current.querySelectorAll(this.getUserQuerySelector()).length > 1) break
      if (
        current.querySelector(privateSelectors.userFileThumbnail) ||
        current.querySelector("img")
      ) {
        best = current
        break
      }
      current = current.parentElement
    }

    return best || bubble
  }

  private extractClaudeUserImageAttachments(container: Element): ClaudeUserAttachment[] {
    const images = Array.from(container.querySelectorAll("img")).filter(
      (node): node is HTMLImageElement =>
        node instanceof HTMLImageElement &&
        !node.closest(this.config.sitePrivateSelectors.documentRoot),
    )

    return images.flatMap((image) => {
      if (image.closest(this.config.sitePrivateSelectors.userFileThumbnail)) return []

      const source = normalizeExportAssetUrl(
        image.currentSrc || image.src || image.getAttribute("src") || "",
      )
      if (!source || !isDownloadableExportAssetUrl(source)) return []

      const alt = (image.alt || "uploaded image").replace(/\s+/g, " ").trim()
      return [
        {
          kind: "image" as const,
          name: alt || "uploaded image",
          alt,
          source,
        },
      ]
    })
  }

  private extractClaudeUserFileAttachments(container: Element): ClaudeUserAttachment[] {
    const files = Array.from(
      container.querySelectorAll(this.config.sitePrivateSelectors.userFileThumbnail),
    )

    return files.flatMap((file) => {
      const name = this.extractClaudeUserFileName(file)
      if (!name) return []

      const type = this.extractClaudeUserFileType(file)
      const source = this.extractClaudeUserFileSource(file)
      return [
        {
          kind: "file" as const,
          name,
          type,
          source,
        },
      ]
    })
  }

  private extractClaudeUserFileName(file: Element): string {
    const visibleTitle = file.querySelector("h1, h2, h3, h4, h5, h6")?.textContent?.trim()
    if (visibleTitle) return visibleTitle

    const ariaLabel = file.querySelector("[aria-label]")?.getAttribute("aria-label") || ""
    return ariaLabel.split(",")[0]?.trim() || ""
  }

  private extractClaudeUserFileType(file: Element): string {
    const badge = Array.from(file.querySelectorAll("p"))
      .map((node) => node.textContent?.trim() || "")
      .find((text) => /^[A-Za-z0-9.+-]{1,12}$/.test(text))
    if (badge) return badge.toLowerCase()

    const ariaLabel = file.querySelector("[aria-label]")?.getAttribute("aria-label") || ""
    return ariaLabel.split(",")[1]?.trim().toLowerCase() || ""
  }

  private extractClaudeUserFileSource(file: Element): string {
    const links = Array.from(file.querySelectorAll("a[href]")).filter(
      (node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement,
    )

    for (const link of links) {
      const href = normalizeExportAssetUrl(link.href || link.getAttribute("href") || "")
      if (isDownloadableExportAssetUrl(href)) return href
    }

    const image = file.querySelector("img")
    if (image instanceof HTMLImageElement) {
      const source = normalizeExportAssetUrl(
        image.currentSrc || image.src || image.getAttribute("src") || "",
      )
      if (isDownloadableExportAssetUrl(source)) return source
    }

    const attributeSource = this.extractClaudeDownloadableAttributeUrl(file)
    if (attributeSource) return attributeSource

    return ""
  }

  private extractClaudeDownloadableAttributeUrl(root: Element): string {
    const attributeNames = [
      "href",
      "src",
      "data-href",
      "data-src",
      "data-url",
      "data-file-url",
      "data-download-url",
    ]
    const nodes = [root, ...Array.from(root.querySelectorAll("*"))]

    for (const node of nodes) {
      for (const name of attributeNames) {
        const value = node.getAttribute(name)
        const source = normalizeExportAssetUrl(value || "")
        if (isDownloadableExportAssetUrl(source)) return source
      }
    }

    return ""
  }

  private formatClaudeUserImageAttachments(
    attachments: ClaudeUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportImageAttachments(attachments, collector, {
      siteId: this.getSiteId(),
      getAlt: (attachment) => attachment.alt || attachment.name || "uploaded image",
    })
  }

  private formatClaudeUserFileAttachments(
    attachments: ClaudeUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportFileAttachments(attachments, collector, {
      siteId: this.getSiteId(),
      getLabel: (attachment) =>
        attachment.type && !this.fileNameEndsWithType(attachment.name, attachment.type)
          ? `${attachment.name} (${attachment.type})`
          : attachment.name,
    })
  }

  private fileNameEndsWithType(name: string, type: string): boolean {
    const normalizedName = name.toLowerCase()
    const normalizedType = type.replace(/^\./, "").toLowerCase()
    return normalizedType ? normalizedName.endsWith(`.${normalizedType}`) : false
  }

  private async collectClaudeDocumentArtifacts(
    root: ParentNode,
  ): Promise<ClaudeDocumentExportCacheEntry[]> {
    const results: ClaudeDocumentExportCacheEntry[] = []
    this.exportDocumentCache = results
    const artifacts = this.getClaudeDocumentArtifactCells(root)

    const openDocument = this.captureOpenClaudeDocument(artifacts)
    if (openDocument) {
      results.push(openDocument)
    }

    for (let index = 0; index < artifacts.length; index += 1) {
      const artifact = artifacts[index]
      if (results.some((item) => item.element === artifact)) continue

      const artifactTitle = this.getClaudeArtifactTitle(artifact)
      const interactionTarget = await this.resolveClaudeArtifactInteractionTarget(artifact)
      if (!interactionTarget) {
        throw new Error(`Claude document artifact could not be mounted: ${artifactTitle}`)
      }

      const markdownRoot = await this.openClaudeArtifactDocument(interactionTarget)
      if (!markdownRoot) {
        throw new Error(`Claude document artifact could not be opened: ${artifactTitle}`)
      }

      const content = this.extractClaudeDocumentMarkdown(markdownRoot)
      if (!content) {
        throw new Error(`Claude document artifact was empty: ${artifactTitle}`)
      }

      results.push({
        element: artifact,
        index,
        content,
        title: this.getClaudeDocumentTitle() || artifactTitle,
        artifactTitle,
        signature: this.getClaudeDocumentSignature(markdownRoot),
      })
    }

    return results
  }

  private captureOpenClaudeDocument(artifacts: Element[]): ClaudeDocumentExportCacheEntry | null {
    const markdownRoot = this.getClaudeDocumentMarkdownElement()
    if (!markdownRoot) return null

    const content = this.extractClaudeDocumentMarkdown(markdownRoot)
    const signature = this.getClaudeDocumentSignature(markdownRoot)
    if (!content || !signature) return null

    const title = this.getClaudeDocumentTitle() || "Document"
    const titleMatches = artifacts
      .map((artifact, index) => ({ artifact, index }))
      .filter(({ artifact }) => this.getClaudeArtifactTitle(artifact) === title)
    const match = titleMatches.length === 1 ? titleMatches[0] : null
    if (!match) return null

    return {
      element: match.artifact,
      index: match.index,
      content,
      title,
      artifactTitle: this.getClaudeArtifactTitle(match.artifact),
      signature,
    }
  }

  private extractClaudeDocumentMarkdown(markdownRoot: Element): string {
    const markdown = htmlToMarkdown(markdownRoot).trim()
    return markdown || markdownRoot.textContent?.trim() || ""
  }

  private findCachedClaudeDocumentForArtifact(
    artifact: Element,
  ): ClaudeDocumentExportCacheEntry | null {
    const cached = this.exportDocumentCache.find((item) => item.element === artifact)
    if (cached) return cached
    if (!this.isMarkdownDocumentArtifact(artifact)) return null

    const artifactIndex = this.getClaudeDocumentArtifactCells().indexOf(artifact)
    if (artifactIndex >= 0) {
      const byIndex = this.exportDocumentCache.find((item) => item.index === artifactIndex)
      if (byIndex) return byIndex
    }

    const artifactTitle = this.getClaudeArtifactTitle(artifact)
    const titleMatches = this.exportDocumentCache.filter(
      (item) => item.artifactTitle === artifactTitle || item.title === artifactTitle,
    )
    return titleMatches.length === 1 ? titleMatches[0] : null
  }

  private async collectClaudeVirtualExportSnapshot(
    includeThoughts: boolean,
  ): Promise<{ root: HTMLElement; expandedThoughtContainers: HTMLElement[] }> {
    const root = document.createElement("div")
    root.setAttribute(CLAUDE_EXPORT_ROOT_ATTR, "1")
    const rows = new Map<number, HTMLElement>()
    const expandedThoughtContainers: HTMLElement[] = []
    const scrollContainer = this.getScrollContainer()
    if (!scrollContainer) return { root, expandedThoughtContainers }

    const originalScrollTop = scrollContainer.scrollTop
    const totalMessages = this.getClaudeVirtualMessageCount()
    this.isCollectingVirtualOutline = true

    try {
      for (let pass = 0; pass < 2; pass += 1) {
        const positions = this.buildClaudeVirtualScrollPositions(scrollContainer)
        for (const top of positions) {
          await this.scrollClaudeVirtualContainer(scrollContainer, top)

          for (const row of this.getClaudeVirtualRows(scrollContainer)) {
            const messageIndex = this.getClaudeVirtualMessageIndex(row)
            if (messageIndex === null) continue

            if (includeThoughts) {
              const expanded = await this.expandClaudeThoughtBlocksForExport(row)
              expandedThoughtContainers.push(...expanded)
            }

            rows.set(messageIndex, row.cloneNode(true) as HTMLElement)
          }

          this.recordMountedClaudeVirtualMessageIndexes(scrollContainer)
          this.extractOutline(6, true, false)
        }

        if (totalMessages === null || rows.size >= totalMessages) break
      }
    } finally {
      await this.scrollClaudeVirtualContainer(scrollContainer, originalScrollTop)
      this.isCollectingVirtualOutline = false
    }

    if (totalMessages !== null && rows.size < totalMessages) {
      this.restoreClaudeThoughtBlocksAfterExport({
        documentPanelWasOpen: false,
        thoughtContainersExpandedForExport: expandedThoughtContainers,
      })
      throw new Error(`Claude virtual export collected ${rows.size} of ${totalMessages} messages`)
    }

    Array.from(rows.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([, row]) => root.appendChild(row))

    return { root, expandedThoughtContainers }
  }

  private mountClaudeExportSnapshot(root: HTMLElement | null): void {
    if (!root || root.childElementCount === 0) return

    root.style.display = "none"
    document.body.appendChild(root)
    this.exportSnapshotRoot = root
  }

  private removeClaudeExportSnapshot(): void {
    this.exportSnapshotRoot?.remove()
    this.exportSnapshotRoot = null
    document.querySelectorAll(`[${CLAUDE_EXPORT_ROOT_ATTR}]`).forEach((node) => node.remove())
  }

  private extractClaudeExportMessages(collector?: ExportAssetCollector): ExportMessage[] {
    if (this.exportSnapshotRoot) {
      return this.extractClaudeVirtualExportMessages(this.exportSnapshotRoot, collector)
    }

    const messages: ExportMessage[] = []
    const root = this.getOutlineRoot()
    const userMessages = Array.from(root.querySelectorAll(this.getUserQuerySelector()))
    const assistantMessages = Array.from(
      root.querySelectorAll(this.config.selectors.assistantResponse),
    ).filter((element) => !element.closest(this.config.sitePrivateSelectors.documentRoot))

    const maxLen = Math.max(userMessages.length, assistantMessages.length)
    for (let index = 0; index < maxLen; index += 1) {
      if (userMessages[index]) {
        const content = this.extractClaudeUserQueryExportContent(
          userMessages[index],
          collector,
        ).trim()
        if (content) messages.push({ role: "user", content })
      }

      if (assistantMessages[index]) {
        const content = this.extractClaudeAssistantResponseTextWithDocuments(
          assistantMessages[index],
          collector,
          index,
        ).trim()
        if (content) messages.push({ role: "assistant", content })
      }
    }

    return messages
  }

  private extractClaudeVirtualExportMessages(
    root: ParentNode,
    collector?: ExportAssetCollector,
  ): ExportMessage[] {
    const messages: ExportMessage[] = []
    const rows = Array.from(root.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    )
    let assistantIndex = 0

    rows.forEach((row) => {
      const userMessage = row.querySelector(this.getUserQuerySelector())
      if (userMessage) {
        const content = this.extractClaudeUserQueryExportContent(userMessage, collector).trim()
        if (content) messages.push({ role: "user", content })
      }

      const assistantMessage = row.querySelector(this.config.selectors.assistantResponse)
      if (
        assistantMessage &&
        !assistantMessage.closest(this.config.sitePrivateSelectors.documentRoot)
      ) {
        const content = this.extractClaudeAssistantResponseTextWithDocuments(
          assistantMessage,
          collector,
          assistantIndex,
        ).trim()
        assistantIndex += 1
        if (content) messages.push({ role: "assistant", content })
      }
    })

    return messages
  }

  private extractClaudeAssistantResponseTextWithDocuments(
    element: Element,
    collector?: ExportAssetCollector,
    assistantIndex?: number,
  ): string {
    const includeThoughts = this.shouldIncludeThoughtsInExport()
    const thoughtBlocks = includeThoughts
      ? this.getClaudeThoughtBlocksForElement(element, assistantIndex)
      : []
    const parts: string[] = []
    const blocks = this.getClaudeAssistantExportBlocks(element)

    blocks.forEach((block) => {
      if (block.matches(this.config.sitePrivateSelectors.artifactCell)) {
        parts.push(this.formatClaudeArtifactExportContent(block, collector))
        return
      }

      const markdown =
        htmlToMarkdown(
          this.prepareClaudeAssistantMarkdownBlockForExport(block, collector),
        ).trim() ||
        block.textContent?.trim() ||
        ""
      parts.push(markdown)
    })

    const body = parts.filter(Boolean).join("\n\n").trim()
    if (includeThoughts && thoughtBlocks.length > 0) {
      const thoughtSection = thoughtBlocks.join("\n\n")
      return body ? `${thoughtSection}\n\n${body}` : thoughtSection
    }

    return body
  }

  private getClaudeAssistantExportBlocks(element: Element): Element[] {
    const privateSelectors = this.config.sitePrivateSelectors
    const contentSelector = `${privateSelectors.responseMarkdown}, ${privateSelectors.artifactCell}`
    const candidates = Array.from(element.querySelectorAll(contentSelector)).filter(
      (block) =>
        !block.closest(privateSelectors.documentRoot) &&
        (block.matches(privateSelectors.artifactCell) || !this.isInsideClaudeThoughtBlock(block)),
    )

    return candidates.filter((block) => {
      const parentBlock = block.parentElement?.closest(contentSelector)
      return !parentBlock || !element.contains(parentBlock)
    })
  }

  private prepareClaudeAssistantMarkdownBlockForExport(
    block: Element,
    collector?: ExportAssetCollector,
  ): Element {
    const sourceArtifacts = this.getClaudeArtifactCells(block)
    const clone = block.cloneNode(true) as Element
    const artifacts = Array.from(
      clone.querySelectorAll(this.config.sitePrivateSelectors.artifactCell),
    )

    artifacts.forEach((artifact, index) => {
      const sourceArtifact = sourceArtifacts[index] || artifact
      const replacement = document.createElement("p")
      replacement.textContent = this.formatClaudeArtifactExportContent(sourceArtifact, collector)
      artifact.replaceWith(replacement)
    })

    return clone
  }

  private shouldIncludeThoughtsInExport(): boolean {
    if (typeof this.exportIncludeThoughtsOverride === "boolean") {
      return this.exportIncludeThoughtsOverride
    }
    return false
  }

  private async expandClaudeThoughtBlocksForExport(
    root: ParentNode = document,
  ): Promise<HTMLElement[]> {
    const buttons = this.getClaudeThoughtToggleButtons(root)
    const expandedContainers: HTMLElement[] = []

    for (const button of buttons) {
      if (button.getAttribute("aria-expanded") === "true") continue

      const container = this.getClaudeThoughtBlockContainer(button)
      if (!container) continue

      const expanded = await this.openClaudeThoughtBlock(button, container)
      if (expanded) {
        expandedContainers.push(container)
      }
    }

    return expandedContainers
  }

  private async openClaudeThoughtBlock(
    button: HTMLElement,
    container: HTMLElement,
  ): Promise<boolean> {
    try {
      button.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
    } catch {
      button.scrollIntoView({ block: "center", inline: "nearest" })
    }

    this.simulateClick(button)
    if (await this.waitForClaudeThoughtBlockExpanded(container, 900)) {
      return true
    }

    if (button.isConnected && button.getAttribute("aria-expanded") !== "true") {
      button.click()
      return this.waitForClaudeThoughtBlockExpanded(container, 1800)
    }

    return this.waitForClaudeThoughtBlockExpanded(container, 1800)
  }

  private async waitForClaudeThoughtBlockExpanded(
    container: HTMLElement,
    timeoutMs: number,
  ): Promise<boolean> {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      if (!container.isConnected) return false
      const markdown = this.extractClaudeThoughtMarkdown(container).trim()
      if (markdown) {
        return true
      }
      await this.sleep(80)
    }

    return false
  }

  private restoreClaudeThoughtBlocksAfterExport(state: ClaudeExportLifecycleState): void {
    state.thoughtContainersExpandedForExport?.forEach((container) => {
      if (!container.isConnected) return
      const button = container.querySelector(this.config.sitePrivateSelectors.thoughtToggle)
      if (!(button instanceof HTMLElement)) return
      if (button.getAttribute("aria-expanded") !== "true") return
      this.simulateClick(button)
    })
  }

  private getClaudeThoughtToggleButtons(root: ParentNode = document): HTMLElement[] {
    return Array.from(root.querySelectorAll(this.config.sitePrivateSelectors.thoughtToggle)).filter(
      (button): button is HTMLElement =>
        button instanceof HTMLElement && this.isClaudeThoughtToggleButton(button),
    )
  }

  private isClaudeThoughtToggleButton(button: HTMLElement): boolean {
    if (!button.closest(this.config.selectors.assistantResponse)) return false

    const container = this.getClaudeThoughtBlockContainer(button)
    if (!container) return false

    const statusText = container
      .querySelector(this.config.sitePrivateSelectors.thoughtStatus)
      ?.textContent?.trim()
    return Boolean(statusText)
  }

  private getClaudeThoughtBlockContainer(element: Element): HTMLElement | null {
    const privateSelectors = this.config.sitePrivateSelectors
    const response = element.closest(this.config.selectors.assistantResponse)
    let current = element.parentElement

    while (current && current !== response && current !== document.body) {
      const hasStatus = Array.from(current.children).some((child) =>
        child.matches(privateSelectors.thoughtStatus),
      )
      const hasToggle = current.querySelector(privateSelectors.thoughtToggle) !== null
      if (hasStatus && hasToggle) {
        return current
      }
      current = current.parentElement
    }

    return null
  }

  private isInsideClaudeThoughtBlock(element: Element): boolean {
    return this.getClaudeThoughtBlockContainer(element) !== null
  }

  private captureClaudeThoughtBlocksForExport(): void {
    const responses = Array.from(
      document.querySelectorAll(this.config.selectors.assistantResponse),
    ).filter((element) => !element.closest(this.config.sitePrivateSelectors.documentRoot))

    responses.forEach((response, index) => {
      const blocks = this.extractClaudeThoughtBlockquotes(response)
      if (blocks.length > 0) {
        this.exportThoughtBlocks.set(response, blocks)
        this.exportThoughtBlocksByAssistantIndex.set(index, blocks)
      }
    })
  }

  private hasClaudeThoughtExportCache(): boolean {
    return this.exportThoughtBlocksByAssistantIndex.size > 0
  }

  private getClaudeThoughtBlocksForElement(element: Element, assistantIndex?: number): string[] {
    if (element.closest(`[${CLAUDE_EXPORT_ROOT_ATTR}]`)) {
      return this.extractClaudeThoughtBlockquotes(element)
    }

    if (assistantIndex !== undefined) {
      const byIndex = this.exportThoughtBlocksByAssistantIndex.get(assistantIndex)
      if (byIndex) return byIndex
    }

    const cached = this.exportThoughtBlocks.get(element)
    if (cached) return cached

    const response = element.closest(this.config.selectors.assistantResponse)
    if (response) {
      const responseCached = this.exportThoughtBlocks.get(response)
      if (responseCached) return responseCached
    }

    const currentIndex = this.getClaudeAssistantResponseIndex(element)
    if (currentIndex >= 0) {
      const byIndex = this.exportThoughtBlocksByAssistantIndex.get(currentIndex)
      if (byIndex) return byIndex
    }

    return this.extractClaudeThoughtBlockquotes(element)
  }

  private getClaudeAssistantResponseIndex(element: Element): number {
    const response = element.matches(this.config.selectors.assistantResponse)
      ? element
      : element.closest(this.config.selectors.assistantResponse)
    if (!response) return -1

    return Array.from(document.querySelectorAll(this.config.selectors.assistantResponse))
      .filter((candidate) => !candidate.closest(this.config.sitePrivateSelectors.documentRoot))
      .indexOf(response)
  }

  private extractClaudeThoughtBlockquotes(element: Element): string[] {
    const buttons = this.getClaudeThoughtToggleButtons(element)
    const blocks: string[] = []
    const seenContainers = new Set<Element>()

    buttons.forEach((button) => {
      const container = this.getClaudeThoughtBlockContainer(button)
      if (!container || seenContainers.has(container)) return
      seenContainers.add(container)

      const markdown = this.extractClaudeThoughtMarkdown(container).trim()
      if (!markdown) return

      const title =
        container
          .querySelector(this.config.sitePrivateSelectors.thoughtStatus)
          ?.textContent?.trim() || ""
      blocks.push(this.formatAsThoughtBlockquote(markdown, title))
    })

    return blocks
  }

  private extractClaudeThoughtMarkdown(container: Element): string {
    const privateSelectors = this.config.sitePrivateSelectors
    const clone = container.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(`${privateSelectors.thoughtToggle}, ${privateSelectors.thoughtStatus}, svg`)
      .forEach((node) => node.remove())

    return htmlToMarkdown(clone).trim() || this.extractTextWithLineBreaks(clone).trim()
  }

  private formatAsThoughtBlockquote(markdown: string, title = ""): string {
    const normalizedTitle = title.replace(/\s+/g, " ").trim()
    const titleLines = normalizedTitle ? [`> **${normalizedTitle}**`, ">"] : []
    const lines = markdown.replace(/\r\n/g, "\n").split("\n")
    const quotedLines = lines.map((line) => (line.trim().length > 0 ? `> ${line}` : ">"))
    return ["> [Thoughts]", ...titleLines, ...quotedLines].join("\n")
  }

  private formatClaudeArtifactExportContent(
    artifact: Element,
    collector?: ExportAssetCollector,
  ): string {
    const title = this.getClaudeArtifactTitle(artifact)
    const cached = this.findCachedClaudeDocumentForArtifact(artifact)

    if (!cached?.content) {
      if (this.exportDocumentCollectionRequired && this.isMarkdownDocumentArtifact(artifact)) {
        throw new Error(`Claude document artifact was not cached: ${title}`)
      }
      return this.formatClaudeArtifactPlaceholder(artifact)
    }

    return collector
      ? createMarkdownDocumentAssetLink(collector, cached.content, {
          title: cached.title || title,
          fallbackTitle: "claude-document",
          directory: "assets/documents",
          idPrefix: "claude-document",
        })
      : this.formatClaudeDocumentInlineContent(cached.content, cached.title || title)
  }

  private formatClaudeDocumentInlineContent(content: string, title: string): string {
    const trimmed = content.trim()
    if (!trimmed) return ""
    if (/^#{1,6}\s+/m.test(trimmed)) return trimmed
    return `### ${title}\n\n${trimmed}`
  }

  private formatClaudeArtifactPlaceholder(artifact: Element, downloadHref = ""): string {
    const title = this.getClaudeArtifactTitle(artifact)
    const metadata = this.getClaudeArtifactMetadata(artifact)
    return `[Artifact: ${title}${metadata ? ` - ${metadata}` : ""}${downloadHref ? ` | Download: ${downloadHref}` : ""}]`
  }

  /**
   * 提取AI回复文本,过滤Artifact卡片但标注其存在
   * Claude特有:Artifacts以卡片形式嵌入在回复中,需要特殊处理
   */
  extractAssistantResponseText(element: Element): string {
    return this.extractClaudeAssistantResponseTextWithDocuments(element)
  }

  // ==================== 对话观察器 ====================

  getConversationObserverConfig(): ConversationObserverConfig {
    return {
      selector: this.config.conversation.itemSelector,
      shadow: this.config.conversation.shadow ?? false,
      extractInfo: (el: Element): ConversationInfo | null => this.extractClaudeConversationInfo(el),
      getTitleElement: (el: Element): Element | null => {
        return this.getClaudeConversationTitleElement(el)
      },
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    const targetUrl = url || new URL(this.getClaudeConversationPath(id), this.getNewTabUrl()).href
    const link = this.findConversationRow(id)
    if (link && this.config.conversation.navigationStrategy === "click-item") {
      link.click()
      return true
    }
    // 降级：优先 history 导航免刷新（路由响应 popstate，已实测），失败再直接跳转
    if (this.navigateViaHistory(targetUrl)) return true
    window.location.href = targetUrl
    return true
  }

  getSessionName(): string | null {
    return this.getConversationTitle()
  }

  // ==================== 页面宽度 ====================

  private normalizeContentMaxWidth(width: string): string {
    const trimmed = width.trim()
    if (!trimmed.endsWith("%")) {
      return trimmed
    }

    const numeric = Number.parseFloat(trimmed)
    if (!Number.isFinite(numeric)) {
      return trimmed
    }

    // Claude has nested max-width containers. Use an absolute viewport-based
    // ceiling so percentage width does not shrink at each nested layer.
    return `min(${numeric}vw, calc(100vw - 32px))`
  }

  getWidthSelectors() {
    return this.config.widthSelectors.map((selector) => ({
      ...selector,
      transformValue: (width: string) => this.normalizeContentMaxWidth(width),
    }))
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    const privateSelectors = this.config.sitePrivateSelectors
    return {
      scopeSelector: privateSelectors.panelScope,
      obstacleSelectors: [privateSelectors.panelObstacle],
      widthSelectors: this.getWidthSelectors(),
      insetSelectors: [
        {
          selector: privateSelectors.panelScrollSafeArea,
          extraCss: "box-sizing: border-box; width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.panelNewChatSafeArea,
          scopeSelector: privateSelectors.layoutScope,
          insetMode: "edge",
          extraCss: "box-sizing: border-box; width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.panelCanvasScope,
          scopeSelector: privateSelectors.panelCanvasScope,
          obstacleSelectors: [],
          applySide: "right",
          insetMode: "edge",
          // 行内还有原生右侧面板占位（Artifacts 侧栏约 384px），安全区需同时
          // 容纳正文最小可读宽度 360 + 侧栏宽度，否则窄视口下正文会被压垮。
          minSafeWidth: 744,
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          // 预览面板宽度由 flex 驱动，只加右 padding 内缩内容，不强制宽度
          selector: privateSelectors.panelFilePreviewScope,
          scopeSelector: privateSelectors.panelFilePreviewScope,
          obstacleSelectors: [],
          applySide: "right",
          insetMode: "edge",
          extraCss: "box-sizing: border-box; min-width: 0 !important;",
        },
      ],
      defaultWidth: "768px",
      gap: 16,
    }
  }

  getZenModeConfig() {
    return this.cloneZenModeConfig(this.config.zenMode)
  }

  getCleanModeConfig() {
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

  getUserQueryWidthSelectors() {
    return [
      {
        selector: this.config.sitePrivateSelectors.userQueryWidth,
        property: "max-width",
      },
    ]
  }

  // ==================== 主题切换 ====================

  async toggleTheme(targetMode: "light" | "dark" | "system"): Promise<boolean> {
    try {
      // Claude 使用 localStorage.LSS-userThemeMode 存储主题
      // 格式: {"value":"dark","tabId":"xxx","timestamp":xxx}
      const previousValue = localStorage.getItem("LSS-userThemeMode")
      const resolvedMode =
        targetMode === "system"
          ? window.matchMedia?.("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : targetMode
      const themeData = {
        value: targetMode === "system" ? "auto" : targetMode,
        tabId: getClaudeThemeTabId(),
        timestamp: Date.now(),
      }
      const nextValue = JSON.stringify(themeData)
      localStorage.setItem("LSS-userThemeMode", nextValue)
      applyClaudeThemeDomHints(resolvedMode)

      // 触发 storage 事件通知其他组件
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "LSS-userThemeMode",
          oldValue: previousValue,
          newValue: nextValue,
          storageArea: localStorage,
        }),
      )

      // 等待 300ms 确保主题样式生效
      await new Promise((r) => setTimeout(r, 300))
      return true
    } catch (error) {
      console.error("[ClaudeAdapter] toggleTheme error:", error)
      return false
    }
  }
}
