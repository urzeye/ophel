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
import {
  createMarkdownDocumentAssetLink,
  formatExportFileAttachments,
  formatExportImageAttachments,
  isDownloadableExportAssetUrl,
  normalizeExportAssetUrl,
  type ExportAssetCollector,
} from "~utils/export-assets"
import { htmlToMarkdown, type ExportBundle, type ExportMessage } from "~utils/exporter"
import { t } from "~utils/i18n"
import { renderMarkdown } from "~utils/markdown"
import { hashTextForCache } from "~utils/text-hash"

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
} from "./base"

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
const CLAUDE_DOCUMENT_ROOT_SELECTOR = "#wiggle-file-content"
const CLAUDE_DOCUMENT_MARKDOWN_SELECTOR =
  "#wiggle-file-content .standard-markdown, #wiggle-file-content .progressive-markdown"
const CLAUDE_RESPONSE_MARKDOWN_SELECTOR = ".standard-markdown, .progressive-markdown"
const CLAUDE_ARTIFACT_CELL_SELECTOR = ".artifact-block-cell"
const CLAUDE_USER_FILE_THUMBNAIL_SELECTOR = '[data-testid="file-thumbnail"]'
const CLAUDE_THOUGHT_TOGGLE_SELECTOR = "button[aria-expanded]"
const CLAUDE_THOUGHT_STATUS_SELECTOR = 'span[role="status"][aria-live="polite"]'
const CLAUDE_LAYOUT_SCOPE_SELECTOR = "#main-content"
const CLAUDE_CONTENT_WIDTH_SELECTORS = ["#main-content .max-w-3xl", "#main-content .max-w-4xl"]
const CLAUDE_SCROLL_SAFE_AREA_SELECTOR = '#main-content [data-autoscroll-container="true"]'

interface ClaudeExportLifecycleState {
  documentPanelWasOpen: boolean
  documentSignature?: string
  documentTitle?: string | null
  documentArtifactIndex?: number | null
  thoughtContainersExpandedForExport?: HTMLElement[]
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

export class ClaudeAdapter extends SiteAdapter {
  private activeOrganizationId: string | null = null
  private activeOrganizationIdExpiresAt = 0
  private exportDocumentCache: ClaudeDocumentExportCacheEntry[] = []
  private exportIncludeThoughtsOverride: boolean | null = null
  private exportThoughtBlocks = new WeakMap<Element, string[]>()
  private exportThoughtBlocksByAssistantIndex = new Map<number, string[]>()
  private outlineWordCountCache = new WeakMap<Element, ClaudeOutlineWordCountCacheEntry>()

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

  getThemeColors(): { primary: string; secondary: string } {
    // Claude 品牌色 (Terracotta/Orange)
    return { primary: "#d97757", secondary: "#c66045" }
  }

  getQuickQuoteSupportMode() {
    return "native" as const
  }

  getNativeQuotePopoverSelectors(): string[] {
    return ['[data-selection-tooltip="true"]']
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

  // ==================== 会话管理 ====================

  getConversationList(): ConversationInfo[] {
    // 侧边栏会话列表
    // Selector: a[data-dd-action-name="sidebar-chat-item"]
    const items = document.querySelectorAll('a[data-dd-action-name="sidebar-chat-item"]')

    return Array.from(items)
      .map((el) => {
        const href = el.getAttribute("href") || ""
        // href 格式: /chat/c44e44c0-913a-4fbe-b4f8-d346fd0b7eff
        const idMatch = href.match(/\/chat\/([a-f0-9-]+)/)
        const id = idMatch ? idMatch[1] : ""

        // 标题在 span 中
        const titleSpan = el.querySelector("span.truncate")
        const title = titleSpan?.textContent?.trim() || ""

        // 激活状态: 检查是否有激活样式或aria-current (需验证,暂时简单判断URL)
        const isActive = window.location.href.includes(id)

        // 判断是否收藏(Starred):
        // 核心特征:
        // 1. Starred分组的h3没有role="button"(不可折叠)
        // 2. Starred分组的ul有-mx-1.5类
        // 通过语义化属性判断,比纯样式类更稳定,不依赖文字内容,支持国际化
        let isPinned = false
        const groupContainer = el.closest("div.flex.flex-col")
        if (groupContainer) {
          // 检查1: h3是否没有role属性(Starred不可折叠,Recents有role="button")
          const h3 = groupContainer.querySelector("h3")
          const isNonCollapsible = h3 && !h3.hasAttribute("role")

          // 检查2: ul是否有Starred特有的-mx-1.5类
          const ul = groupContainer.querySelector("ul")
          const hasStarredClass = ul?.classList.contains("-mx-1.5")

          // 任一条件满足即为收藏会话
          isPinned = isNonCollapsible || hasStarredClass
        }

        return {
          id,
          title,
          url: href.startsWith("http") ? href : `https://claude.ai${href}`,
          isActive,
          isPinned,
        }
      })
      .filter((c) => c.id)
  }

  getSidebarScrollContainer(): Element | null {
    // 侧边栏导航容器
    const nav = document.querySelector("nav")
    if (nav) {
      // 侧边栏通常在 nav 内的某个可滚动 div 中
      // 根据 structure: nav > div > div > div[class*="overflow-y-auto"]
      const scrollable = nav.querySelector("div.overflow-y-auto")
      return scrollable || nav
    }
    return null
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
          headers: this.buildNativeDeleteHeaders(Boolean(body)),
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

  private buildNativeDeleteHeaders(withBody: boolean): Record<string, string> {
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
    return document.querySelector(
      `a[data-dd-action-name="sidebar-chat-item"][href="/chat/${id}"], a[data-dd-action-name="sidebar-chat-item"][href$="/chat/${id}"], a[data-dd-action-name="sidebar-chat-item"][href*="/chat/${id}?"]`,
    ) as HTMLElement | null
  }

  private async findConversationMenuButton(row: HTMLElement): Promise<HTMLElement | null> {
    const owner = (row.closest("li") || row.parentElement || row) as HTMLElement
    const menuSelector = [
      'button[aria-haspopup="menu"]',
      'button[data-testid*="menu"]',
      'button[aria-label*="more"]',
      'button[aria-label*="More"]',
      'button[aria-label*="options"]',
      'button[aria-label*="Options"]',
      'button[aria-label*="更多"]',
      'button[aria-label*="选项"]',
      'button[aria-label*="選項"]',
    ].join(", ")

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
      document.querySelectorAll('[role="menu"], [data-radix-menu-content], [data-state="open"]'),
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
        ? (Array.from(menuScope.querySelectorAll('[role="menuitem"], button')) as HTMLElement[])
        : (Array.from(
            document.querySelectorAll('[role="menuitem"], [role="menu"] button'),
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
      document.querySelectorAll('[role="dialog"], [aria-modal="true"], [data-state="open"]'),
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
    return ['[contenteditable="true"]', ".ProseMirror", 'div[role="textbox"]']
  }

  getSubmitButtonSelectors(): string[] {
    return [
      'button[aria-label="Send Message"]',
      'button[data-testid="send-button"]',
      'button[aria-label="Send"]',
    ]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (element.offsetParent === null) return false
    if (element.closest(".gh-main-panel")) return false

    const isContentEditable = element.getAttribute("contenteditable") === "true"
    const isProseMirror = element.classList.contains("ProseMirror")
    const isTextbox = element.getAttribute("role") === "textbox"

    return isContentEditable || isProseMirror || isTextbox
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
    // 尝试获取侧边栏激活项的标题
    // Selector: a[data-dd-action-name="sidebar-chat-item"] active??
    // 暂时通过 URL 匹配来找 active
    const currentId = this.getSessionId()
    if (currentId && currentId !== "default") {
      const activeItem = document.querySelector(`a[href*="${currentId}"]`)
      if (activeItem) {
        return activeItem.querySelector("span.truncate")?.textContent?.trim() || null
      }
    }
    return null
  }

  private findClaudeScrollContainer(): HTMLElement | null {
    const conversationAnchor = Array.from(
      document.querySelectorAll('.font-claude-response, [data-testid="user-message"]'),
    ).find((element) => !element.closest(CLAUDE_DOCUMENT_ROOT_SELECTOR)) as HTMLElement | undefined

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

    const selectors = [
      '[data-autoscroll-container="true"]',
      "#main-content .overflow-y-scroll",
      "#root .overflow-y-auto.overflow-x-hidden",
    ]

    for (const selector of selectors) {
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

    if (
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

  getChatContentSelectors(): string[] {
    return ['div[data-testid="user-message"]', "div.font-claude-response"]
  }

  private isClaudeDocumentPanelOpen(): boolean {
    return this.getClaudeDocumentMarkdownElement() !== null
  }

  private getClaudeDocumentRoot(): HTMLElement | null {
    return document.querySelector(CLAUDE_DOCUMENT_ROOT_SELECTOR) as HTMLElement | null
  }

  private getClaudeDocumentMarkdownElement(): Element | null {
    return document.querySelector(CLAUDE_DOCUMENT_MARKDOWN_SELECTOR)
  }

  private getClaudeDocumentTitle(): string | null {
    const title = this.getClaudeDocumentRoot()?.querySelector("h1")?.textContent?.trim() || ""
    return title || null
  }

  private getClaudeArtifactCells(root: ParentNode = document): Element[] {
    return Array.from(root.querySelectorAll(CLAUDE_ARTIFACT_CELL_SELECTOR))
  }

  private getClaudeDocumentArtifactCells(root: ParentNode = document): Element[] {
    return this.getClaudeArtifactCells(root).filter((cell) => this.isMarkdownDocumentArtifact(cell))
  }

  private isMarkdownDocumentArtifact(artifact: Element): boolean {
    return /\bMD\b/i.test(this.getClaudeArtifactMetadata(artifact))
  }

  private getClaudeArtifactMetadata(artifact: Element): string {
    return artifact.querySelector(".text-text-400")?.textContent?.trim() || ""
  }

  private getClaudeArtifactTitle(artifact: Element): string {
    const title = artifact.querySelector(".line-clamp-1")?.textContent?.trim() || ""
    return title || "Document"
  }

  private getClaudeArtifactButton(artifact: Element): HTMLElement | null {
    const container = artifact.closest(".group\\/artifact-block, [class*='group/artifact-block']")
    const button =
      container?.querySelector('button[aria-label="View Document"]') ||
      artifact.querySelector('button[aria-label="View Document"]')
    return button instanceof HTMLElement ? button : null
  }

  private async openClaudeArtifactDocument(artifact: Element): Promise<Element | null> {
    const button = this.getClaudeArtifactButton(artifact)
    if (!button) return null

    const previousSignature = this.getClaudeDocumentSignature()
    button.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" })
    await new Promise((resolve) => setTimeout(resolve, 50))
    this.simulateClick(button)

    return this.waitForClaudeDocumentMarkdown(previousSignature)
  }

  private getClaudeDocumentSignature(markdown = this.getClaudeDocumentMarkdownElement()): string {
    const text = markdown?.textContent?.trim() || ""
    return text ? `${text.length}:${text.slice(0, 160)}:${text.slice(-160)}` : ""
  }

  private async waitForClaudeDocumentMarkdown(
    previousSignature = "",
    timeoutMs = 3000,
  ): Promise<Element | null> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const markdown = this.getClaudeDocumentMarkdownElement()
      const signature = this.getClaudeDocumentSignature()
      if (markdown && signature && signature !== previousSignature) return markdown
      if (markdown && !previousSignature) return markdown
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return this.getClaudeDocumentMarkdownElement()
  }

  private closeClaudeDocumentPanel(): void {
    const backButton = this.findClaudeDocumentPanelButton('button[aria-label="Go back"]')
    if (backButton instanceof HTMLElement) {
      this.simulateClick(backButton)
    }
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
    // 尝试从模型选择器获取
    const selectorBtn = document.querySelector('button[data-testid="model-selector-dropdown"]')
    if (selectorBtn && selectorBtn.textContent) {
      return selectorBtn.textContent.trim()
    }
    return null
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: ['button[data-testid="model-selector-dropdown"]'],
      menuItemSelector: '[role="menuitem"], [role="menuitemradio"]',
      checkInterval: 1000,
      maxAttempts: 20,
      // 语言无关：通过 aria-haspopup 检测子菜单触发器
      subMenuSelector: '[aria-haspopup="menu"]',
      // 文字备选（多语言）
      subMenuTriggers: ["more models", "更多模型"],
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
    const isSubMenuTrigger =
      role === "menuitem" &&
      (element.matches('[aria-haspopup="menu"]') ||
        text.includes("more models") ||
        text.includes("更多模型"))
    if (isSubMenuTrigger) return

    dispatchPointer("pointerdown")
    element.dispatchEvent(new eventWindow.MouseEvent("mousedown", commonInit))
    dispatchPointer("pointerup")
    element.dispatchEvent(new eventWindow.MouseEvent("mouseup", commonInit))
    element.dispatchEvent(new eventWindow.MouseEvent("click", commonInit))
  }

  // ==================== 杂项 ====================

  getNewChatButtonSelectors(): string[] {
    return ['a[data-dd-action-name="sidebar-new-item"]', 'a[href="/new"]']
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
      { id: "conversation", kind: "conversation", label: "对话", available: true },
    ]
    const documentOutline = this.extractClaudeDocumentOutline(6, false)
    if (documentOutline.length > 0) {
      sources.push({
        id: CLAUDE_DOCUMENT_OUTLINE_SOURCE_ID,
        kind: "document",
        label: "文档",
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
    const outline: OutlineItem[] = []
    const outlineRoot = this.getOutlineRoot()

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
      ? Array.from(outlineRoot.querySelectorAll(".font-claude-response")).filter(
          (response) => !response.closest(CLAUDE_DOCUMENT_ROOT_SELECTOR),
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
            ".standard-markdown, .progressive-markdown",
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
        !heading.closest(CLAUDE_DOCUMENT_ROOT_SELECTOR) &&
        heading.closest(".font-claude-response") !== null,
    )

    headings.forEach((h, index) => {
      const level = parseInt(h.tagName[1])
      if (level > maxLevel) return

      // 跳过侧边栏分组标题
      if (h.classList.contains("pointer-events-none")) return

      // 跳过屏幕阅读器专用元素（如 "You said:" / "Claude responded:" 提示文本）
      // 使用类名定位而非文本匹配，以支持多语言
      if (h.classList.contains("sr-only")) return

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
        const responseContainer = h.closest(".font-claude-response")
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
      const userQueries = outlineRoot.querySelectorAll('[data-testid="user-message"]')
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

    return outline
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
    return heading.classList.contains("sr-only") || this.isInRenderedMarkdownContainer(heading)
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

  async resolveOutlineTarget(
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery">,
    queryIndex?: number,
    sourceId = "conversation",
  ): Promise<Element | null> {
    if (sourceId === CLAUDE_DOCUMENT_OUTLINE_SOURCE_ID) {
      return this.findClaudeDocumentHeading(item.level, item.text)
    }

    return super.resolveOutlineTarget(item, queryIndex, sourceId)
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
    // 方法1: 检查 Stop 按钮 (aria-label="Stop response")
    const stopBtn = document.querySelector('button[aria-label="Stop response"]')
    if (stopBtn) return true

    // 方法2: 检查流式输出指示器
    const streaming = document.querySelector('[class*="streaming"], [class*="typing"]')
    if (streaming) return true

    return false
  }

  getStopButtonSelectors(): string[] {
    return ['button[aria-label="Stop response"]']
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
    return {
      // Claude API 请求模式
      // 精确匹配路径以 /completion 结尾的端点（如 /api/organizations/.../chat_conversations/.../completion）
      // 使用 urlPathEndsWith 而非 urlPatterns，避免误匹配 Claude.ai 的后台轮询请求（如 /api/chat_conversations、/api/feature_flags 等）
      // 这些后台轮询 URL 也包含 "/api/"，若用 urlPatterns 的 OR 逻辑会不断触发误通知
      urlPatterns: ["/api/"],
      urlPathEndsWith: ["/completion"],
      silenceThreshold: 500,
    }
  }

  // ==================== 导出功能 ====================

  getExportConfig(): ExportConfig {
    return {
      userQuerySelector: '[data-testid="user-message"]',
      assistantResponseSelector: ".font-claude-response",
      turnSelector: null, // Claude 不使用 turn 容器
      useShadowDOM: false,
    }
  }

  getAssistantMermaidSupportMode() {
    return "native" as const
  }

  getLatestReplyText(): string | null {
    const responses = Array.from(document.querySelectorAll(".font-claude-response")).filter(
      (element) => !element.closest(CLAUDE_DOCUMENT_ROOT_SELECTOR),
    )
    if (responses.length === 0) return null

    const lastResponse = responses[responses.length - 1]

    // 过滤掉Artifact卡片,只提取.standard-markdown或.progressive-markdown
    const markdownContent = lastResponse.querySelector(".standard-markdown, .progressive-markdown")
    if (markdownContent) {
      const markdown = htmlToMarkdown(markdownContent).trim()
      return markdown || markdownContent.textContent?.trim() || null
    }

    // 降级:如果没有markdown容器,返回整个内容(兼容旧版本)
    return lastResponse.textContent?.trim() || null
  }

  getResponseContainerSelector(): string {
    return ".font-claude-response"
  }

  async prepareConversationExport(context: ExportLifecycleContext): Promise<unknown> {
    this.exportIncludeThoughtsOverride = context.includeThoughts
    this.exportDocumentCache = []
    this.exportThoughtBlocks = new WeakMap<Element, string[]>()
    this.exportThoughtBlocksByAssistantIndex = new Map<number, string[]>()

    const thoughtContainersExpandedForExport = context.includeThoughts
      ? await this.expandClaudeThoughtBlocksForExport()
      : []
    if (context.includeThoughts) {
      this.captureClaudeThoughtBlocksForExport()
    }

    const state: ClaudeExportLifecycleState = {
      documentPanelWasOpen: this.isClaudeDocumentPanelOpen(),
      documentSignature: this.getClaudeDocumentSignature(),
      documentTitle: this.getClaudeDocumentTitle(),
      documentArtifactIndex: null,
      thoughtContainersExpandedForExport,
    }

    if (!this.shouldCollectClaudeDocumentsForExport(context)) {
      return state
    }

    this.exportDocumentCache = await this.collectClaudeDocumentArtifacts()

    if (state.documentPanelWasOpen && state.documentSignature) {
      const originalDocument = this.findCachedClaudeDocumentByState(state)
      state.documentArtifactIndex = originalDocument?.index ?? null
    }

    return state
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    state: unknown,
  ): Promise<void> {
    try {
      if (!this.isClaudeExportLifecycleState(state)) return

      if (state.documentPanelWasOpen) {
        await this.restoreClaudeDocumentPanel(state)
        return
      }

      this.closeClaudeDocumentPanel()
    } finally {
      if (this.isClaudeExportLifecycleState(state)) {
        this.restoreClaudeThoughtBlocksAfterExport(state)
      }
      this.exportDocumentCache = []
      this.exportIncludeThoughtsOverride = null
      this.exportThoughtBlocks = new WeakMap<Element, string[]>()
      this.exportThoughtBlocksByAssistantIndex = new Map<number, string[]>()
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
    const artifact =
      originalDocument?.element.isConnected === true
        ? originalDocument.element
        : this.getClaudeDocumentArtifactCells()[originalDocument?.index ?? -1]

    if (artifact) {
      await this.openClaudeArtifactDocument(artifact)
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
    if (!this.hasClaudeExportAssets()) {
      return null
    }

    return this.createExportBundleFromMessages((collector) =>
      this.extractClaudeExportMessages(collector),
    )
  }

  async extractExportMessages(_context: ExportLifecycleContext): Promise<ExportMessage[] | null> {
    if (
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
    return '[data-testid="user-message"]'
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
    const root = this.getOutlineRoot()
    const userMessages = Array.from(root.querySelectorAll(this.getUserQuerySelector()))
    return userMessages.some((message) => this.extractClaudeUserAttachments(message).length > 0)
  }

  extractUserQueryMarkdown(element: Element): string {
    // Claude 对用户输入已经部分渲染了 Markdown（blockquote, ul, pre）
    // 但标题和加粗没有渲染，仍然是纯文本在 <p class="whitespace-pre-wrap"> 中
    // 我们需要提取需要增强的 <p> 元素的文本

    // 检查是否有包含未渲染 Markdown 的 <p> 元素
    const textParagraphs = element.querySelectorAll("p.whitespace-pre-wrap")
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

    const textParagraphs = element.querySelectorAll("p.whitespace-pre-wrap")
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
    const bubble = userMessage.closest('[data-user-message-bubble="true"]')
    if (!bubble) return userMessage

    let best: Element | null = null
    let current = bubble.parentElement
    while (
      current &&
      current !== document.body &&
      !current.matches(".font-claude-response, main, [role='main']")
    ) {
      if (current.querySelectorAll(this.getUserQuerySelector()).length > 1) break
      if (
        current.querySelector(CLAUDE_USER_FILE_THUMBNAIL_SELECTOR) ||
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
        node instanceof HTMLImageElement && !node.closest(CLAUDE_DOCUMENT_ROOT_SELECTOR),
    )

    return images.flatMap((image) => {
      if (image.closest(CLAUDE_USER_FILE_THUMBNAIL_SELECTOR)) return []

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
    const files = Array.from(container.querySelectorAll(CLAUDE_USER_FILE_THUMBNAIL_SELECTOR))

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

  private async collectClaudeDocumentArtifacts(): Promise<ClaudeDocumentExportCacheEntry[]> {
    const results: ClaudeDocumentExportCacheEntry[] = []
    const artifacts = this.getClaudeDocumentArtifactCells()

    for (let index = 0; index < artifacts.length; index += 1) {
      const artifact = artifacts[index]
      const artifactTitle = this.getClaudeArtifactTitle(artifact)
      const markdownRoot = await this.openClaudeArtifactDocument(artifact)
      if (!markdownRoot) continue

      const content = this.extractClaudeDocumentMarkdown(markdownRoot)
      if (!content) continue

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
    if (titleMatches.length === 1) return titleMatches[0]

    return this.exportDocumentCache.length === 1 ? this.exportDocumentCache[0] : null
  }

  private extractClaudeExportMessages(collector?: ExportAssetCollector): ExportMessage[] {
    const messages: ExportMessage[] = []
    const root = this.getOutlineRoot()
    const userMessages = Array.from(root.querySelectorAll(this.getUserQuerySelector()))
    const assistantMessages = Array.from(root.querySelectorAll(".font-claude-response")).filter(
      (element) => !element.closest(CLAUDE_DOCUMENT_ROOT_SELECTOR),
    )

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
      if (block.matches(CLAUDE_ARTIFACT_CELL_SELECTOR)) {
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
    const candidates = Array.from(
      element.querySelectorAll(
        `${CLAUDE_RESPONSE_MARKDOWN_SELECTOR}, ${CLAUDE_ARTIFACT_CELL_SELECTOR}`,
      ),
    ).filter(
      (block) =>
        !block.closest(CLAUDE_DOCUMENT_ROOT_SELECTOR) && !this.isInsideClaudeThoughtBlock(block),
    )

    return candidates.filter((block) => {
      const parentBlock = block.parentElement?.closest(
        `${CLAUDE_RESPONSE_MARKDOWN_SELECTOR}, ${CLAUDE_ARTIFACT_CELL_SELECTOR}`,
      )
      return !parentBlock || !element.contains(parentBlock)
    })
  }

  private prepareClaudeAssistantMarkdownBlockForExport(
    block: Element,
    collector?: ExportAssetCollector,
  ): Element {
    const sourceArtifacts = this.getClaudeArtifactCells(block)
    const clone = block.cloneNode(true) as Element
    const artifacts = Array.from(clone.querySelectorAll(CLAUDE_ARTIFACT_CELL_SELECTOR))

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

  private async expandClaudeThoughtBlocksForExport(): Promise<HTMLElement[]> {
    const buttons = this.getClaudeThoughtToggleButtons(document)
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
      const button = container.querySelector(CLAUDE_THOUGHT_TOGGLE_SELECTOR)
      if (!(button instanceof HTMLElement)) return
      if (button.getAttribute("aria-expanded") !== "true") return
      this.simulateClick(button)
    })
  }

  private getClaudeThoughtToggleButtons(root: ParentNode = document): HTMLElement[] {
    return Array.from(root.querySelectorAll(CLAUDE_THOUGHT_TOGGLE_SELECTOR)).filter(
      (button): button is HTMLElement =>
        button instanceof HTMLElement && this.isClaudeThoughtToggleButton(button),
    )
  }

  private isClaudeThoughtToggleButton(button: HTMLElement): boolean {
    if (!button.closest(".font-claude-response")) return false

    const container = this.getClaudeThoughtBlockContainer(button)
    if (!container) return false

    const statusText = container.querySelector(CLAUDE_THOUGHT_STATUS_SELECTOR)?.textContent?.trim()
    return Boolean(statusText)
  }

  private getClaudeThoughtBlockContainer(element: Element): HTMLElement | null {
    const response = element.closest(".font-claude-response")
    let fallback: HTMLElement | null = null
    let current = element.parentElement

    while (current && current !== response && current !== document.body) {
      const hasStatus = current.querySelector(CLAUDE_THOUGHT_STATUS_SELECTOR) !== null
      const hasToggle = current.querySelector(CLAUDE_THOUGHT_TOGGLE_SELECTOR) !== null
      if (hasStatus && hasToggle) {
        fallback = current
        if (this.isClaudeThoughtRootCandidate(current)) {
          return current
        }
      }
      current = current.parentElement
    }

    return fallback
  }

  private isClaudeThoughtRootCandidate(element: HTMLElement): boolean {
    const className = typeof element.className === "string" ? element.className : ""
    return className.includes("grid-rows") || element.querySelector(".row-start-2") !== null
  }

  private isInsideClaudeThoughtBlock(element: Element): boolean {
    return this.getClaudeThoughtBlockContainer(element) !== null
  }

  private captureClaudeThoughtBlocksForExport(): void {
    const responses = Array.from(document.querySelectorAll(".font-claude-response")).filter(
      (element) => !element.closest(CLAUDE_DOCUMENT_ROOT_SELECTOR),
    )

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
    if (assistantIndex !== undefined) {
      const byIndex = this.exportThoughtBlocksByAssistantIndex.get(assistantIndex)
      if (byIndex) return byIndex
    }

    const cached = this.exportThoughtBlocks.get(element)
    if (cached) return cached

    const response = element.closest(".font-claude-response")
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
    const response = element.matches(".font-claude-response")
      ? element
      : element.closest(".font-claude-response")
    if (!response) return -1

    return Array.from(document.querySelectorAll(".font-claude-response"))
      .filter((candidate) => !candidate.closest(CLAUDE_DOCUMENT_ROOT_SELECTOR))
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
        container.querySelector(CLAUDE_THOUGHT_STATUS_SELECTOR)?.textContent?.trim() || ""
      blocks.push(this.formatAsThoughtBlockquote(markdown, title))
    })

    return blocks
  }

  private extractClaudeThoughtMarkdown(container: Element): string {
    const clone = container.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(`${CLAUDE_THOUGHT_TOGGLE_SELECTOR}, ${CLAUDE_THOUGHT_STATUS_SELECTOR}, svg`)
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

  // ==================== 会话观察器 ====================

  getConversationObserverConfig(): ConversationObserverConfig {
    return {
      selector: 'a[data-dd-action-name="sidebar-chat-item"]',
      shadow: false,
      extractInfo: (el: Element): ConversationInfo | null => {
        const href = el.getAttribute("href") || ""
        const idMatch = href.match(/\/chat\/([a-f0-9-]+)/)
        const id = idMatch ? idMatch[1] : ""
        if (!id) return null

        const titleSpan = el.querySelector("span.truncate")
        const title = titleSpan?.textContent?.trim() || ""

        // 判断是否收藏(与getConversationList逻辑一致)
        let isPinned = false
        const groupContainer = el.closest("div.flex.flex-col")
        if (groupContainer) {
          const h3 = groupContainer.querySelector("h3")
          const isNonCollapsible = h3 && !h3.hasAttribute("role")
          const ul = groupContainer.querySelector("ul")
          const hasStarredClass = ul?.classList.contains("-mx-1.5")
          isPinned = isNonCollapsible || hasStarredClass
        }

        return {
          id,
          title,
          url: `https://claude.ai${href}`,
          isActive: window.location.href.includes(id),
          isPinned,
        }
      },
      getTitleElement: (el: Element): Element | null => {
        return el.querySelector("span.truncate")
      },
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    const targetUrl = url || `https://claude.ai/chat/${id}`
    const link = document.querySelector(`a[href*="${id}"]`) as HTMLAnchorElement
    if (link) {
      link.click()
      return true
    }
    // 降级：直接跳转
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
    return CLAUDE_CONTENT_WIDTH_SELECTORS.map((selector) => ({
      selector,
      property: "max-width",
      transformValue: (width: string) => this.normalizeContentMaxWidth(width),
      extraCss: "width: 100% !important; min-width: 0 !important;",
    }))
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    return {
      scopeSelector: CLAUDE_LAYOUT_SCOPE_SELECTOR,
      widthSelectors: this.getWidthSelectors(),
      insetSelectors: [
        {
          selector: CLAUDE_SCROLL_SAFE_AREA_SELECTOR,
          extraCss: "box-sizing: border-box; width: 100% !important; min-width: 0 !important;",
        },
      ],
      defaultWidth: "768px",
      gap: 16,
    }
  }

  getZenModeConfig() {
    return {
      hide: ['nav:has(a[data-dd-action-name="sidebar-chat-item"])'],
    }
  }

  getCleanModeConfig() {
    return {
      hide: ['[data-disclaimer="true"]'],
    }
  }

  getUserQueryWidthSelectors() {
    return [{ selector: '[data-testid="user-message"]', property: "max-width" }]
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

      // 等待一下看是否生效，如果不行则尝试刷新页面
      await new Promise((r) => setTimeout(r, 300))
      return true
    } catch (error) {
      console.error("[ClaudeAdapter] toggleTheme error:", error)
      return false
    }
  }
}
