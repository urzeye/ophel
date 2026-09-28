/**
 * Grok 适配器（grok.com 独立站点）
 *
 * 选择器策略：
 * - 使用 data-* 属性（如 data-sidebar）- 稳定
 * - 使用语义化 CSS 类名（如 .tiptap.ProseMirror）- 稳定，Tailwind 命名
 * - 使用元素 ID（如 #model-select-trigger）- 稳定
 * - 使用标准 HTML 属性（如 contenteditable, type="submit"）
 *
 * 主题机制：
 * - localStorage.getItem("theme") 存储 "light" | "dark" | "system"
 * - document.documentElement.classList 包含 "light" 或 "dark"
 * - document.documentElement.style.colorScheme 同步
 */
import { SITE_IDS } from "~constants"
import { grokNativeThemeCss } from "~styles/native-theme-adapters/grok"
import {
  formatExportFileAttachments,
  formatExportImageAttachments,
  formatExportImageMarkdown,
  isDownloadableExportAssetUrl,
  normalizeExportAssetUrl,
  type ExportAssetCollector,
} from "~utils/export-assets"
import { htmlToMarkdown, type ExportBundle, type ExportMessage } from "~utils/exporter"
import { t } from "~utils/i18n"
import { EVENT_OUTLINE_DATA_UPDATED } from "~utils/messaging"
import { hashOutlineText } from "~utils/outline-heading-cache"
import {
  API_OUTLINE_PARSE_FAILURE_LIMIT,
  isApiOutlineStale,
  mergeByBranchMessageOrder,
  shouldAttemptApiOutlineFetch,
} from "~utils/outline-api-source"
import {
  alignScrollTop,
  settleVirtualScroll,
  waitForVirtualScrollQuiet,
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
  type PanelAvoidanceConfig,
  type SiteDeleteConversationResult,
} from "./base"
import { GROK_CONFIG, GROK_CONFIG_VERSION, type GrokSiteConfig } from "./grok-config"
import type { BuiltinSiteConfig } from "./declarative"
import { parseGrokHistoryExport, type GrokHistoryExportData } from "./grok-history-export"
import {
  parseGrokHistoryOutline,
  parseGrokResponseTree,
  type GrokHistoryOutlineData,
  type GrokResponseTree,
} from "./grok-history-outline"

const API_OUTLINE_FETCH_BACKOFF_MS = 10_000
const API_OUTLINE_BOTTOM_TOLERANCE_PX = 100
/** load-responses 批量拉取的单批条数（页面自身的可视窗口批次约 10 条） */
const LOAD_RESPONSES_BATCH_SIZE = 20
const VIRTUAL_ROW_PROBE_MAX_ATTEMPTS = 8
const VIRTUAL_ROW_PROBE_SETTLE_MS = 60
const OUTLINE_HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6"
/** 虚拟行内消息元素的 id 前缀（id="response-<uuid>"） */
const RESPONSE_ID_PREFIX = "response-"

const PIN_ICON_PATH_SIGNATURES = [
  "M13 21L12 23L11 21V16H4.5V13.7129L4.65234 13.4697L6.95801 9.78027L6.41797 5.99512C6.11675 3.8866 7.75289 2 9.88281 2H14.1172C16.2471 2 17.8832 3.8866 17.582 5.99512L17.041 9.78027L19.5 13.7129V16H13V21Z",
].map((path) => path.replace(/\s+/g, ""))

// 提示词按行转为 ProseMirror/Tiptap 段落 HTML，必须先转义再拼接，
// 否则提示词中的 < > & 会被解析为 DOM，多行文本也会丢失分段
const escapeHtmlForInsert = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const buildParagraphHtml = (content: string): string =>
  content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => `<p>${line === "" ? "<br>" : escapeHtmlForInsert(line)}</p>`)
    .join("")

const DELETE_REASON = {
  UI_FAILED: "delete_ui_failed",
  BATCH_ABORTED_AFTER_UI_FAILURE: "delete_batch_aborted_after_ui_failure",
  API_REQUEST_FAILED: "delete_api_request_failed",
  API_NOT_FOUND_BUT_VISIBLE: "delete_api_not_found_but_visible",
} as const

const DELETE_KEYWORDS = [
  "delete",
  "remove",
  "删除",
  "刪除",
  "supprimer",
  "eliminar",
  "löschen",
  "削除",
  "삭제",
  "удал",
  "excluir",
]

const CONFIRM_KEYWORDS = ["confirm", "ok", "yes", "确定", "確認", "确认", "確定", "check"]

interface GrokUserAttachment {
  kind: "image" | "file"
  name: string
  source: string
  type: string
  size: string
}

interface GrokFileAttachmentMetadata {
  fileMetadataId?: unknown
  fileMimeType?: unknown
  fileName?: unknown
  fileUri?: unknown
}

interface GrokShareResponseItem {
  responseId?: unknown
  fileAttachmentsMetadata?: unknown
}

export class GrokAdapter extends SiteAdapter {
  protected config: GrokSiteConfig = GROK_CONFIG

  match(): boolean {
    // 匹配 grok.com 独立站点
    const hostname = window.location.hostname
    return hostname === "grok.com" || hostname.endsWith(".grok.com")
  }

  getSiteId(): string {
    return SITE_IDS.GROK
  }

  getName(): string {
    return "Grok"
  }

  getBuiltinConfig(): GrokSiteConfig {
    return GROK_CONFIG
  }

  getBuiltinConfigVersion(): number {
    return GROK_CONFIG_VERSION
  }

  applyMergedConfig(config: BuiltinSiteConfig): void {
    this.config = config as GrokSiteConfig
  }

  getThemeColors(): { primary: string; secondary: string } {
    // Grok 官方主题色
    return { primary: "#f39c12", secondary: "#1e1f22" }
  }

  getNativeThemeCss(): string | null {
    return grokNativeThemeCss
  }

  getQuickQuoteSupportMode() {
    return this.config.quickQuote
  }

  getNativeQuotePopoverSelectors(): string[] {
    return [...this.config.sitePrivateSelectors.nativeQuotePopover]
  }

  getNewTabUrl(): string {
    return "https://grok.com/"
  }

  isNewConversation(): boolean {
    const path = window.location.pathname
    // 根路径是新对话页面
    return path === "/" || path === ""
  }

  isSharePage(): boolean {
    // 自有对话：/c/ID    分享对话：/share/ID
    return window.location.pathname.startsWith("/share/")
  }

  isUserConversationPage(): boolean {
    return !this.isSharePage() && /^\/c\/[^/?#]+(?:\/|$)/i.test(window.location.pathname)
  }

  // 缓存弹窗中的对话数据（用于同步时弹窗已关闭的情况）
  private cachedDialogConversations: Map<string, ConversationInfo> | null = null

  private exportUserAttachmentsByResponseId: Map<string, GrokUserAttachment[]> | null = null

  private reloadScheduled = false

  // ==================== API 数据源大纲（虚拟滚动回填） ====================

  private apiOutlineData: GrokHistoryOutlineData | null = null
  private apiOutlineFetchPromise: Promise<void> | null = null
  private apiOutlineLastFetchAt = 0
  private apiOutlineFailures = 0
  private apiOutlineSessionId = ""
  private apiOutlineForceRefetch = false
  private apiOutlineWasGenerating = false
  private apiOutlineRevealRequestId = 0
  /** 导出链路缓存的接口全量数据（prepareConversationExport 拉取，导出结束清空） */
  private exportApiData: GrokHistoryExportData | null = null

  async loadAllConversations(): Promise<void> {
    // 侧边栏折叠（icon 模式）时对话列表不渲染，先主动展开再加载，
    // 否则同步会扫不到任何对话
    await this.ensureSidebarExpanded()

    const sidebar = document.querySelector(this.config.sitePrivateSelectors.sidebarScrollContainer)
    if (!sidebar) return

    // 使用 CSS 类特征定位"查看全部"按钮，避免依赖文本
    // 特征：button, w-full, justify-start, text-xs, text-secondary
    // 这些 Tailwind 类名描述了按钮的视觉样式（全宽、左对齐、小字体、次要颜色），相对稳定
    const viewAllBtn = sidebar.querySelector(this.config.sitePrivateSelectors.viewAllButton)

    if (viewAllBtn) {
      // 显示同步提示
      const { showToast } = await import("~utils/toast")
      const { t } = await import("~utils/i18n")
      showToast(t("grokSyncingConversations"))
      ;(viewAllBtn as HTMLElement).click()

      // 轮询等待对话框出现（最多 3 秒）
      let cmdkList: Element | null = null
      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        cmdkList = document.querySelector(this.config.sitePrivateSelectors.cmdkList)
        if (cmdkList) break
      }

      // 多次滚动，确保虚拟列表加载全部内容
      if (cmdkList) {
        let prevHeight = 0
        let stableCount = 0
        const maxAttempts = 15

        for (let i = 0; i < maxAttempts; i++) {
          cmdkList.scrollTop = cmdkList.scrollHeight
          await new Promise((resolve) => setTimeout(resolve, 400))

          const currentHeight = cmdkList.scrollHeight
          if (currentHeight === prevHeight) {
            stableCount++
            // 连续3次高度不变，认为已加载完毕
            if (stableCount >= 3) break
          } else {
            stableCount = 0
            prevHeight = currentHeight
          }
        }
      }

      // 在关闭弹窗之前，缓存弹窗中的所有对话
      // 这样 getConversationList 在弹窗关闭后仍然可以返回这些数据
      this.cacheDialogConversations()

      // 自动关闭弹窗：模拟按下 ESC 键（避免 target 不是元素导致快捷键处理报错）
      this.dispatchEscapeKey()

      // 5 秒后清除缓存，确保后续调用使用实时数据
      setTimeout(() => {
        this.cachedDialogConversations = null
      }, 5000)

      return
    }
  }

  /**
   * 侧边栏折叠时点击 trigger 展开，并有界等待对话列表挂载。
   * 折叠（icon 模式）下 content 容器仍在 DOM 但不渲染对话条目，
   * 不展开直接扫描会误判为"侧边栏无对话"。
   * 折叠态以 shadcn 侧栏的状态容器为准（trigger 的 data-state 不可靠，
   * 展开页也可能命中 closed 状态的同名按钮），且只点容器内的 trigger。
   */
  private async ensureSidebarExpanded(): Promise<void> {
    const collapsedRoot = document.querySelector('[data-collapsible][data-state="collapsed"]')
    if (!collapsedRoot) return
    const trigger = collapsedRoot.querySelector<HTMLElement>(
      this.config.sitePrivateSelectors.sidebarTrigger,
    )
    if (!trigger) return

    trigger.click()

    // 展开后站点异步渲染对话列表，有界等待其出现（含"查看全部"入口）
    const containerSelector = this.config.sitePrivateSelectors.sidebarScrollContainer
    const itemSelector = this.config.conversation.itemSelector
    const viewAllSelector = this.config.sitePrivateSelectors.viewAllButton
    for (let i = 0; i < 30; i++) {
      await this.sleep(100)
      const sidebar = document.querySelector(containerSelector)
      if (sidebar?.querySelector(itemSelector) || sidebar?.querySelector(viewAllSelector)) return
    }
  }

  /** 缓存弹窗中的对话数据 */
  private cacheDialogConversations(): void {
    const cache = new Map<string, ConversationInfo>()
    const conversation = this.config.conversation

    // 扫描所有 cmdk 对话框中的对话链接
    const allLinks = document.querySelectorAll(conversation.itemSelector)
    allLinks.forEach((link) => {
      if (this.isCmdkActionItem(link)) return

      const href = link.getAttribute(conversation.idFrom.attr ?? "href")
      if (!href) return

      const id = this.extractConversationIdFromHref(href)
      if (!id) return
      if (cache.has(id)) return

      let title = "New Chat"
      let isActive = false
      const isPinned = false

      // 识别 cmdk 对话框项
      const cmdkItem = link.closest(this.config.sitePrivateSelectors.cmdkItem)
      if (cmdkItem) {
        const titleSpan = cmdkItem.querySelector(this.config.sitePrivateSelectors.cmdkTitle)
        title = titleSpan?.textContent?.trim() || title
        isActive =
          cmdkItem.querySelector(this.config.sitePrivateSelectors.cmdkActiveIndicator) !== null
      } else {
        title = link.textContent?.trim() || title
      }

      cache.set(id, {
        id,
        title,
        url: href,
        isPinned,
        isActive,
      })
    })

    this.cachedDialogConversations = cache
  }

  // ==================== 对话管理 ====================

  getConversationList(): ConversationInfo[] {
    const conversationMap = new Map<string, ConversationInfo>()
    const conversation = this.config.conversation
    const privateSelectors = this.config.sitePrivateSelectors

    // 1. 优先扫描侧边栏（获取置顶状态）
    const sidebar = document.querySelector(privateSelectors.sidebarScrollContainer)
    if (sidebar) {
      const groups = sidebar.querySelectorAll(privateSelectors.sidebarGroup)
      groups.forEach((group) => {
        // 侧边栏中的链接
        const links = group.querySelectorAll(conversation.itemSelector)
        if (links.length === 0) return

        links.forEach((link) => {
          const href = link.getAttribute(conversation.idFrom.attr ?? "href")
          if (!href) return

          const id = this.extractConversationIdFromHref(href)
          if (!id) return
          // 侧边栏标题提取：a > span
          const titleSpan = conversation.titleSelector
            ? link.querySelector(conversation.titleSelector)
            : null
          const title = titleSpan?.textContent?.trim() || link.textContent?.trim() || "New Chat"
          const isActive = conversation.activeMatch ? link.matches(conversation.activeMatch) : false
          const isPinned = this.isPinnedSidebarConversation(link)

          conversationMap.set(id, {
            id,
            title,
            url: href,
            isPinned,
            isActive,
          })
        })
      })
    }

    // 2. 扫描所有对话链接（补充对话框中的对话）
    // 这能捕获"查看全部"对话框中的对话，无论选择器细节如何
    const allLinks = document.querySelectorAll(conversation.itemSelector)
    allLinks.forEach((link) => {
      if (this.isCmdkActionItem(link)) return

      const href = link.getAttribute(conversation.idFrom.attr ?? "href")
      if (!href) return

      const id = this.extractConversationIdFromHref(href)
      if (!id) return
      if (conversationMap.has(id)) return // 已从侧边栏获取，跳过

      // 处理对话框（或其他位置）的对话
      let title = "New Chat"
      let isActive = false
      const isPinned = false // 侧边栏以外默认不置顶

      // 尝试识别 cmdk 对话框项
      // 结构: div[cmdk-item] > a (empty) + div > ... > span.truncate
      const cmdkItem = link.closest(privateSelectors.cmdkItem)
      if (cmdkItem) {
        // 对话框标题提取：cmdk-item 内部查找
        const titleSpan = cmdkItem.querySelector(privateSelectors.cmdkTitle)
        title = titleSpan?.textContent?.trim() || title
        // 对话框激活状态：检查 current 标签
        isActive = cmdkItem.querySelector(privateSelectors.cmdkActiveIndicator) !== null
      } else {
        // 其他情况的回退提取
        title = link.textContent?.trim() || title
      }

      conversationMap.set(id, {
        id,
        title,
        url: href,
        isPinned,
        isActive,
      })
    })

    // 3. 合并缓存的弹窗对话数据（用于弹窗已关闭但缓存未过期的情况）
    if (this.cachedDialogConversations) {
      this.cachedDialogConversations.forEach((conv, id) => {
        if (!conversationMap.has(id)) {
          conversationMap.set(id, conv)
        }
      })
    }

    return Array.from(conversationMap.values())
  }

  getSidebarScrollContainer(): Element | null {
    return document.querySelector(this.config.sitePrivateSelectors.sidebarScrollContainer)
  }

  getZenModeConfig() {
    const { hide, preserveFlow, rootClass, styles } = this.config.zenMode
    return {
      ...(hide ? { hide: [...hide] } : {}),
      ...(preserveFlow ? { preserveFlow: [...preserveFlow] } : {}),
      ...(rootClass ? { rootClass: { ...rootClass } } : {}),
      ...(styles ? { styles: styles.map((style) => ({ ...style })) } : {}),
    }
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    const conversation = this.config.conversation
    const privateSelectors = this.config.sitePrivateSelectors
    const sidebarSelector = privateSelectors.sidebarScrollContainer
    const itemSelector = `:is(${conversation.itemSelector})`

    return {
      // 同时匹配侧边栏和 cmdk 对话框中的对话链接
      // - 侧边栏：[data-sidebar="content"] a[href^="/c/"]
      // - 对话框：[cmdk-item][data-value^="conversation:"] a[href^="/c/"]
      selector: `${sidebarSelector} ${itemSelector}, ${privateSelectors.cmdkConversationItem} ${itemSelector}`,
      shadow: false,
      extractInfo: (el: Element) => {
        const href = el.getAttribute(conversation.idFrom.attr ?? "href")
        if (!href) return null
        const id = this.extractConversationIdFromHref(href)
        if (!id) return null

        // 判断来源：侧边栏还是对话框
        const isFromSidebar = !!el.closest(sidebarSelector)
        const isFromCmdk = !!el.closest(privateSelectors.cmdkItem)

        let title = ""
        let isPinned = false

        if (isFromSidebar) {
          const titleSpan = conversation.titleSelector
            ? el.querySelector(conversation.titleSelector)
            : null
          title = titleSpan?.textContent?.trim() || el.textContent?.trim() || ""
          // 通过左侧置顶图标判断（未置顶项没有 icon）
          isPinned = this.isPinnedSidebarConversation(el)
        } else if (isFromCmdk) {
          const cmdkItem = el.closest(privateSelectors.cmdkItem)
          const titleSpan = cmdkItem?.querySelector(privateSelectors.cmdkTitle)
          title = titleSpan?.textContent?.trim() || ""
          isPinned = false // 对话框中无法判断置顶
        }

        return { id, title, url: href, isPinned }
      },
      getTitleElement: (el: Element) => {
        // 优先从对话框 cmdk-item 中找
        const cmdkItem = el.closest(privateSelectors.cmdkItem)
        if (cmdkItem) {
          return cmdkItem.querySelector(privateSelectors.cmdkTitle) || el
        }
        // 否则从侧边栏找
        return (conversation.titleSelector && el.querySelector(conversation.titleSelector)) || el
      },
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    const targetUrl =
      url || this.config.conversation.urlTemplate.replace("{id}", encodeURIComponent(id))
    // Grok 路由响应 popstate，优先用 history 导航免刷新切换（已实测验证）
    if (this.navigateViaHistory(targetUrl)) return true
    // 降级：整页跳转
    window.location.href = targetUrl
    return true
  }

  async deleteConversationOnSite(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    const result = await this.deleteConversationOnSiteInternal(target)
    if (result.success) {
      this.scheduleFullReloadAfterDelete([target.id])
    }
    return result
  }

  async deleteConversationsOnSite(
    targets: ConversationDeleteTarget[],
  ): Promise<SiteDeleteConversationResult[]> {
    const results: SiteDeleteConversationResult[] = []
    const deletedIds: string[] = []

    for (let index = 0; index < targets.length; index++) {
      const result = await this.deleteConversationOnSiteInternal(targets[index])
      results.push(result)
      if (result.success) {
        deletedIds.push(targets[index].id)
      }

      // UI fallback failsafe: avoid cascading wrong deletions during batch actions.
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

    if (deletedIds.length > 0) {
      this.scheduleFullReloadAfterDelete(deletedIds)
    }

    return results
  }

  private async deleteConversationOnSiteInternal(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    const apiResult = await this.tryDeleteViaNativeApi(target.id)
    if (apiResult.success) {
      return apiResult
    }

    const uiSuccess = await this.deleteConversationViaUi(target.id)
    if (uiSuccess) {
      return {
        id: target.id,
        success: true,
        method: "ui",
      }
    }

    return {
      id: target.id,
      success: false,
      method: "none",
      reason: apiResult.reason || DELETE_REASON.UI_FAILED,
    }
  }

  private async tryDeleteViaNativeApi(id: string): Promise<SiteDeleteConversationResult> {
    const endpoint = `/rest/app-chat/conversations/soft/${encodeURIComponent(id)}`

    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: this.buildNativeDeleteHeaders(),
        credentials: "include",
      })

      if (response.ok) {
        this.syncConversationListAfterDelete(id)
        return {
          id,
          success: true,
          method: "api",
        }
      }

      if (response.status === 404) {
        if (!this.isConversationVisible(id)) {
          this.syncConversationListAfterDelete(id)
          return {
            id,
            success: true,
            method: "api",
          }
        }

        return {
          id,
          success: false,
          method: "api",
          reason: DELETE_REASON.API_NOT_FOUND_BUT_VISIBLE,
        }
      }

      return {
        id,
        success: false,
        method: "api",
        reason: this.toDeleteApiHttpReason(response.status),
      }
    } catch {
      return {
        id,
        success: false,
        method: "api",
        reason: DELETE_REASON.API_REQUEST_FAILED,
      }
    }
  }

  private buildNativeDeleteHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "*/*",
      "x-xai-request-id": this.generateRequestId(),
    }

    const statsigId = this.getStatsigId()
    if (statsigId) {
      headers["x-statsig-id"] = statsigId
    }

    return headers
  }

  private getStatsigId(): string | null {
    const directKeys = ["x-statsig-id", "statsig.stableID", "statsig.stable_id", "statsigStableId"]
    for (const key of directKeys) {
      const value = localStorage.getItem(key)
      if (typeof value === "string" && value.length > 0) {
        return value
      }
    }

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || !key.toLowerCase().includes("statsig")) continue
        const raw = localStorage.getItem(key)
        if (!raw) continue

        if (raw.startsWith("{")) {
          try {
            const parsed = JSON.parse(raw) as Record<string, unknown>
            const candidate = parsed?.stableID || parsed?.stableId || parsed?.id
            if (typeof candidate === "string" && candidate.length > 0) {
              return candidate
            }
          } catch {
            // ignore invalid JSON payload
          }
        }

        if (raw.length > 0) return raw
      }
    } catch {
      // ignore storage access issues
    }

    return null
  }

  private generateRequestId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
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

  private syncConversationListAfterDelete(id: string): void {
    this.cachedDialogConversations?.delete(id)
    const anchors = this.findConversationAnchors(id)
    for (const anchor of anchors) {
      const item = this.getConversationItemContainer(anchor)
      item.remove()
    }
  }

  private scheduleFullReloadAfterDelete(deletedIds: string[]): void {
    if (this.reloadScheduled || deletedIds.length === 0) return

    const currentId = this.extractConversationIdFromHref(window.location.pathname)
    if (currentId && deletedIds.includes(currentId)) {
      try {
        window.history.replaceState(window.history.state, "", "/")
      } catch {
        // ignore routing errors
      }
    }

    this.reloadScheduled = true
    window.setTimeout(() => {
      window.location.reload()
    }, 120)
  }

  private async deleteConversationViaUi(id: string): Promise<boolean> {
    let openedDialogByUs = false

    try {
      let anchor = await this.findConversationAnchorWithRetry(id, 400)

      if (!anchor) {
        openedDialogByUs = await this.openConversationDialogIfNeeded()
        if (this.getCmdkListElement()) {
          await this.scrollCmdkListToLoadAll()
        }
        anchor = await this.findConversationAnchorWithRetry(id, 1200)
      }

      if (!anchor) return false

      const item = this.getConversationItemContainer(anchor)
      this.revealConversationActions(item, anchor)

      const deleteButton = await this.waitForDeleteButton(item, 2000)
      if (!deleteButton) return false

      this.simulateClick(deleteButton)

      const confirmButton = await this.waitForConfirmButton(item, 2200)
      if (!confirmButton) return false

      this.simulateClick(confirmButton)

      const removed = await this.waitForConversationRemoved(id, 4000)
      if (removed) {
        this.syncConversationListAfterDelete(id)
      }

      return removed
    } finally {
      if (openedDialogByUs) {
        this.closeConversationDialog()
      }
    }
  }

  private async openConversationDialogIfNeeded(): Promise<boolean> {
    if (this.getCmdkListElement()) return false

    const viewAllButton = this.getViewAllButton()
    if (!viewAllButton) return false

    this.simulateClick(viewAllButton)

    const start = Date.now()
    while (Date.now() - start < 2500) {
      if (this.getCmdkListElement()) return true
      await this.sleep(80)
    }

    return false
  }

  private getViewAllButton(): HTMLElement | null {
    const sidebar = document.querySelector(this.config.sitePrivateSelectors.sidebarScrollContainer)
    if (!sidebar) return null

    return sidebar.querySelector(
      this.config.sitePrivateSelectors.viewAllButton,
    ) as HTMLElement | null
  }

  private getCmdkListElement(): HTMLElement | null {
    return document.querySelector(this.config.sitePrivateSelectors.cmdkList) as HTMLElement | null
  }

  private closeConversationDialog(): void {
    this.dispatchEscapeKey()
  }

  private dispatchEscapeKey(): void {
    const dispatchTarget =
      (document.activeElement as HTMLElement | null) || document.body || document.documentElement
    if (!dispatchTarget) return

    try {
      const escEvent = new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      })
      dispatchTarget.dispatchEvent(escEvent)
    } catch {
      dispatchTarget.dispatchEvent(
        new Event("keydown", {
          bubbles: true,
          cancelable: true,
        }),
      )
    }
  }

  private async scrollCmdkListToLoadAll(): Promise<void> {
    const list = this.getCmdkListElement()
    if (!list) return

    let previousHeight = -1
    let stableCount = 0

    for (let i = 0; i < 16; i++) {
      list.scrollTop = list.scrollHeight
      await this.sleep(300)

      const currentHeight = list.scrollHeight
      if (currentHeight === previousHeight) {
        stableCount++
        if (stableCount >= 3) {
          break
        }
      } else {
        previousHeight = currentHeight
        stableCount = 0
      }
    }
  }

  private async findConversationAnchorWithRetry(
    id: string,
    timeoutMs: number,
  ): Promise<HTMLAnchorElement | null> {
    const immediate = this.findConversationAnchors(id)[0]
    if (immediate) return immediate

    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      await this.sleep(80)
      const found = this.findConversationAnchors(id)[0]
      if (found) return found
    }

    return null
  }

  private findConversationAnchors(id: string): HTMLAnchorElement[] {
    const elements = Array.from(document.querySelectorAll("a")).filter(
      (element): element is HTMLAnchorElement => element instanceof HTMLAnchorElement,
    )
    const sourceAttribute = this.config.conversation.idFrom.attr ?? "href"
    return elements.filter(
      (element) => this.extractConversationIdFromHref(element.getAttribute(sourceAttribute)) === id,
    )
  }

  private getConversationItemContainer(anchor: HTMLAnchorElement): HTMLElement {
    const privateSelectors = this.config.sitePrivateSelectors
    const candidates = [
      anchor.closest(privateSelectors.cmdkItem),
      anchor.closest(privateSelectors.sidebarMenuButton),
      anchor.closest(privateSelectors.sidebarMenuItem),
      anchor.closest("li"),
      anchor.parentElement,
      anchor,
    ]

    for (const candidate of candidates) {
      if (candidate instanceof HTMLElement) {
        return candidate
      }
    }

    return anchor
  }

  private revealConversationActions(item: HTMLElement, anchor?: HTMLAnchorElement): void {
    try {
      item.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "instant" as ScrollBehavior,
      })
    } catch {
      // ignore
    }

    item.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
    item.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    item.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))

    if (anchor) {
      anchor.focus()
      anchor.dispatchEvent(new FocusEvent("focus", { bubbles: true }))
    }
  }

  private async waitForDeleteButton(
    item: HTMLElement,
    timeout: number,
  ): Promise<HTMLElement | null> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      this.revealConversationActions(item)

      const primaryButtons = this.findButtonsInScopes([item])
      let button = this.pickDeleteButton(primaryButtons, { allowIconOnlyFallback: true })
      if (!button) {
        const expandedButtons = this.findButtonsInScopes(this.getScopedActionContainers(item))
        button = this.pickDeleteButton(expandedButtons, { allowIconOnlyFallback: false })
      }
      if (button) return button

      await this.sleep(80)
    }

    return null
  }

  private async waitForConfirmButton(
    item: HTMLElement,
    timeout: number,
  ): Promise<HTMLElement | null> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const primaryButtons = this.findButtonsInScopes([item])
      let button = this.pickConfirmButton(primaryButtons, { allowIconOnlyFallback: true })
      if (!button) {
        const expandedButtons = this.findButtonsInScopes(this.getScopedActionContainers(item))
        button = this.pickConfirmButton(expandedButtons, { allowIconOnlyFallback: false })
      }
      if (button) return button

      await this.sleep(80)
    }

    return null
  }

  private getScopedActionContainers(item: HTMLElement): ParentNode[] {
    const result: ParentNode[] = [item]
    const privateSelectors = this.config.sitePrivateSelectors
    const maybeContainers = [
      item.parentElement,
      item.closest(privateSelectors.cmdkItem),
      item.closest(privateSelectors.actionDialog),
      item.closest(privateSelectors.cmdkRoot),
      this.getCmdkListElement(),
    ]

    for (const container of maybeContainers) {
      if (!container) continue
      if (result.includes(container)) continue
      result.push(container)
    }

    return result
  }

  private pickDeleteButton(
    buttons: HTMLElement[],
    options?: { allowIconOnlyFallback?: boolean },
  ): HTMLElement | null {
    for (const button of buttons) {
      if (this.hasKeyword(this.getElementSignal(button), DELETE_KEYWORDS)) {
        return button
      }
    }

    for (const button of buttons) {
      if (this.hasKeyword(this.getIconSignal(button), DELETE_KEYWORDS)) {
        return button
      }
    }

    if (options?.allowIconOnlyFallback !== false) {
      const iconOnlyButtons = buttons.filter(
        (button) => button.querySelector("svg") && !(button.textContent || "").trim(),
      )
      const rightMost = this.pickRightMostButton(iconOnlyButtons)
      if (rightMost) {
        return rightMost
      }
    }

    return null
  }

  private pickConfirmButton(
    buttons: HTMLElement[],
    options?: { allowIconOnlyFallback?: boolean },
  ): HTMLElement | null {
    for (const button of buttons) {
      if (this.hasKeyword(this.getElementSignal(button), CONFIRM_KEYWORDS)) {
        return button
      }
    }

    for (const button of buttons) {
      if (this.hasKeyword(this.getIconSignal(button), CONFIRM_KEYWORDS)) {
        return button
      }
    }

    for (const button of buttons) {
      if (this.hasKeyword(this.getElementSignal(button), DELETE_KEYWORDS)) {
        return button
      }
    }

    if (options?.allowIconOnlyFallback !== false) {
      const iconOnlyButtons = buttons.filter(
        (button) => button.querySelector("svg") && !(button.textContent || "").trim(),
      )
      const rightMost = this.pickRightMostButton(iconOnlyButtons)
      if (rightMost) {
        return rightMost
      }
    }

    return null
  }

  private pickRightMostButton(buttons: HTMLElement[]): HTMLElement | null {
    if (buttons.length === 0) return null
    const sorted = [...buttons].sort(
      (a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right,
    )
    return sorted[0] || null
  }

  private findButtonsInScopes(scopes: ParentNode[]): HTMLElement[] {
    const unique = new Set<HTMLElement>()
    const result: HTMLElement[] = []

    for (const scope of scopes) {
      const buttons = Array.from(scope.querySelectorAll("button")) as HTMLElement[]
      for (const button of buttons) {
        if (unique.has(button)) continue
        if (!this.isVisible(button)) continue
        unique.add(button)
        result.push(button)
      }
    }

    return result
  }

  private getElementSignal(element: HTMLElement): string {
    const parts = [
      element.textContent || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.getAttribute("data-testid") || "",
      element.className || "",
    ]

    return parts.join(" ").toLowerCase()
  }

  private getIconSignal(element: HTMLElement): string {
    const iconNodes = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.actionIconNodes),
    ) as HTMLElement[]

    const parts = iconNodes.map((node) => {
      const attrs = [
        node.getAttribute("aria-label") || "",
        node.getAttribute("data-icon") || "",
        node.getAttribute("name") || "",
        node.className || "",
      ]
      return attrs.join(" ")
    })

    return parts.join(" ").toLowerCase()
  }

  private hasKeyword(signal: string, keywords: string[]): boolean {
    const normalized = signal.toLowerCase()
    return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  }

  private async waitForConversationRemoved(id: string, timeoutMs: number): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (!this.isConversationVisible(id)) {
        return true
      }
      await this.sleep(80)
    }
    return false
  }

  private isConversationVisible(id: string): boolean {
    return this.findConversationAnchors(id).some(
      (anchor) => anchor.isConnected && this.isVisible(anchor),
    )
  }

  private extractConversationIdFromHref(href: string | null): string | null {
    if (!href) return null

    const match = href.match(new RegExp(this.config.conversation.idFrom.regex))
    return match ? match[1] : null
  }

  private isPinnedSidebarConversation(element: Element): boolean {
    if (!element.closest(this.config.sitePrivateSelectors.sidebarScrollContainer)) return false

    const anchor = element.closest(this.config.conversation.itemSelector) ?? element
    if (!this.hasPinnedIcon(anchor)) return false

    const item = anchor.closest(this.config.sitePrivateSelectors.sidebarMenuItem)
    const menu = anchor.closest(this.config.sitePrivateSelectors.sidebarMenu)
    if (!item || !menu) return true

    return this.isPinnedSectionItem(item)
  }

  private hasPinnedIcon(anchor: Element): boolean {
    const icon = anchor.querySelector(this.config.sitePrivateSelectors.sidebarIcon)
    if (!icon) return false
    if (!this.isDomElementVisible(icon)) return false

    const paths = Array.from(icon.querySelectorAll("path"))
    if (paths.length === 0) return false

    return paths.some((path) => {
      const data = (path.getAttribute("d") || "").replace(/\s+/g, "")
      if (!data) return false
      return PIN_ICON_PATH_SIGNATURES.some((signature) => data === signature)
    })
  }

  private isPinnedSectionItem(item: Element): boolean {
    let sibling = item.previousElementSibling
    while (sibling) {
      if (!sibling.matches(this.config.sitePrivateSelectors.sidebarMenuItem)) {
        return false
      }
      sibling = sibling.previousElementSibling
    }
    return true
  }

  private isCmdkActionItem(element: Element): boolean {
    const cmdkItem = element.closest(this.config.sitePrivateSelectors.cmdkItem)
    if (!cmdkItem) return false

    const itemValue = (cmdkItem.getAttribute("data-value") || "").toLowerCase()
    if (itemValue.startsWith("action:")) return true

    const group = cmdkItem.closest(this.config.sitePrivateSelectors.cmdkGroup)
    if (!group) return false

    const groupValue = (group.getAttribute("data-value") || "").replace(/\s+/g, "").toLowerCase()
    if (groupValue === "actionsshowall" || groupValue.startsWith("actions")) return true

    return false
  }

  private isDomElementVisible(element: Element | null): boolean {
    if (!element) return false
    if (!element.isConnected) return false

    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private isVisible(element: Element | null): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false
    return this.isDomElementVisible(element)
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private getCurrentConversationTitleFromSources(): string | null {
    const sessionId = this.extractConversationIdFromHref(window.location.pathname)
    if (!sessionId) return null

    const matched = this.getConversationList().find((item) => item.id === sessionId)
    if (matched?.title?.trim()) {
      return matched.title.trim()
    }

    const anchors = this.findConversationAnchors(sessionId)
    const activeLink =
      anchors.find((anchor) =>
        anchor.closest(this.config.sitePrivateSelectors.sidebarScrollContainer),
      ) || anchors[0]
    if (!activeLink) return null

    const title = this.config.conversation.titleSelector
      ? activeLink.querySelector(this.config.conversation.titleSelector)?.textContent?.trim()
      : ""
    return title || activeLink.textContent?.trim() || null
  }

  private getConversationTitleFromPage(): string | null {
    const titleEl = document.querySelector(this.config.sitePrivateSelectors.conversationTitle)
    const name = titleEl?.textContent?.trim()
    return name || null
  }

  getSessionName(): string | null {
    return (
      this.getCurrentConversationTitleFromSources() ||
      this.getConversationTitleFromPage() ||
      this.getCleanedDocumentTitle()
    )
  }

  getConversationTitle(): string | null {
    return (
      this.getCurrentConversationTitleFromSources() ||
      this.getConversationTitleFromPage() ||
      this.getCleanedDocumentTitle()
    )
  }

  /** 从 document.title 提取并去掉 Grok 特有后缀（分享页 " | Shared Grok Conversation" 等） */
  private getCleanedDocumentTitle(): string | null {
    const rawTitle = super.getSessionName()
    if (!rawTitle) return null
    const cleaned = rawTitle
      .replace(/\s*[|]\s*Shared Grok Conversation$/i, "")
      .replace(/\s*[|]\s*Grok$/i, "")
      .trim()
    return cleaned || null
  }

  getNewChatButtonSelectors(): string[] {
    return [...this.config.selectors.newChatButton]
  }

  getLatestReplyText(): string | null {
    const aiMessages = document.querySelectorAll(this.config.selectors.assistantResponse)
    if (aiMessages.length === 0) return null

    // 获取最后一个 AI 回复
    const lastMessage = aiMessages[aiMessages.length - 1]

    const contentContainer = lastMessage.querySelector(
      this.config.sitePrivateSelectors.responseMarkdown,
    )
    if (contentContainer) {
      const clone = contentContainer.cloneNode(true) as HTMLElement
      clone.querySelectorAll(this.config.sitePrivateSelectors.exportDecoration).forEach((node) => {
        node.remove()
      })

      const markdown = htmlToMarkdown(clone).trim()
      if (markdown) {
        return markdown
      }

      return this.extractTextWithLineBreaks(clone)
    }

    return this.extractTextWithLineBreaks(lastMessage)
  }

  // ==================== 页面宽度控制 ====================

  private normalizeContentMaxWidth(width: string): string {
    const trimmed = width.trim()
    if (!trimmed.endsWith("%")) {
      return trimmed
    }

    const numeric = Number.parseFloat(trimmed)
    if (!Number.isFinite(numeric)) {
      return trimmed
    }

    // Grok 会在多个嵌套节点上消费 --content-max-width。
    // 若直接写入百分比，max-width 会按父容器层层递减，导致最新消息明显更窄。
    // 这里转成基于视口的绝对长度，避免嵌套百分比叠缩。
    return `min(${numeric}vw, calc(100vw - 32px))`
  }

  getWidthSelectors() {
    // Grok 使用 CSS 变量 --content-max-width 控制主内容区域宽度
    // 该变量定义在包含响应式断点的外层容器上。
    // 不能命中内部的 max-w-[--content-max-width] 消费节点，否则会造成最新消息宽度异常收缩。
    return this.config.widthSelectors.map((selector) => ({
      ...selector,
      transformValue: (width: string) => this.normalizeContentMaxWidth(width),
    }))
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    const privateSelectors = this.config.sitePrivateSelectors
    return {
      scopeSelector: privateSelectors.panelAvoidanceScope,
      widthSelectors: this.getWidthSelectors(),
      insetSelectors: [
        {
          selector: privateSelectors.chatSafeArea,
          extraCss: "box-sizing: border-box; width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.newChatLogoSafeArea,
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.inputSafeArea,
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.canvasSafeArea,
          scopeSelector: privateSelectors.appLayoutScope,
          applySide: "right",
          insetMode: "edge",
          extraCss:
            "box-sizing: border-box !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
      ],
      defaultWidth: "768px",
      gap: 16,
    }
  }

  getUserQueryWidthSelectors() {
    // Grok 用户消息气泡（选择器见 config.selectors.userQuery）
    // 默认有 max-w-[100%] 和响应式 @sm/mainview:max-w-[90%]
    return [
      {
        selector: this.config.selectors.userQuery,
        property: "max-width",
        // LayoutManager 默认会为用户提问追加左右 auto 居中。
        // Grok 的用户气泡需要保持右对齐，否则加宽后会跑到中间。
        noCenter: true,
        extraCss: "margin-left: auto !important; margin-right: 0 !important;",
      },
    ]
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
    // 必须是 contenteditable 的元素
    return element.getAttribute("contenteditable") === "true"
  }

  insertPrompt(content: string): boolean {
    const editor = this.textarea
    if (!editor) return false

    if (!editor.isConnected) {
      this.textarea = null
      return false
    }

    editor.focus()

    // Tiptap 编辑器使用 contenteditable
    if (editor.getAttribute("contenteditable") === "true") {
      // 清空现有内容并插入新内容
      editor.innerHTML = buildParagraphHtml(content)
      // 触发 input 事件通知 Tiptap
      editor.dispatchEvent(new Event("input", { bubbles: true }))
      // 将光标移到末尾
      const selection = window.getSelection()
      if (selection) {
        const range = document.createRange()
        range.selectNodeContents(editor)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
      }
      return true
    }

    return false
  }

  clearTextarea(): void {
    if (!this.textarea) return
    if (!this.textarea.isConnected) {
      this.textarea = null
      return
    }

    this.textarea.focus()
    if (this.textarea.getAttribute("contenteditable") === "true") {
      // 清空 Tiptap 编辑器
      this.textarea.innerHTML =
        '<p class="is-empty is-editor-empty"><br class="ProseMirror-trailingBreak"></p>'
      this.textarea.dispatchEvent(new Event("input", { bubbles: true }))
    }
  }

  // ==================== 滚动容器 ====================

  getScrollContainer(): HTMLElement | null {
    // 主内容区域的滚动容器
    const main = document.querySelector(this.config.selectors.responseContainer)
    if (main) {
      // 查找可滚动的子元素
      const scrollable = main.querySelector(
        this.config.sitePrivateSelectors.mainScrollContainer,
      ) as HTMLElement
      if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
        return scrollable
      }
      // 或者 main 本身可滚动
      if (main.scrollHeight > main.clientHeight) {
        return main as HTMLElement
      }
    }

    // 回退：查找任何大的可滚动容器
    const containers = document.querySelectorAll(
      this.config.sitePrivateSelectors.fallbackScrollContainers,
    )
    for (const container of Array.from(containers)) {
      const el = container as HTMLElement
      if (el.scrollHeight > el.clientHeight + 100) {
        return el
      }
    }

    return null
  }

  getResponseContainerSelector(): string {
    return this.config.selectors.responseContainer
  }

  getChatContentSelectors(): string[] {
    return [...this.config.selectors.chatContent]
  }

  // ==================== 大纲提取 ====================

  getUserQuerySelector(): string {
    return this.config.selectors.userQuery
  }

  private cloneUserQuerySource(element: Element): HTMLElement | null {
    const markdownContainer = element.querySelector(
      this.config.sitePrivateSelectors.responseMarkdown,
    )
    if (!markdownContainer) {
      return null
    }

    const originalWrapper = markdownContainer.querySelector(".gh-user-query-original")
    const source = (originalWrapper || markdownContainer).cloneNode(true) as HTMLElement
    source.querySelectorAll(".gh-user-query-markdown").forEach((node) => node.remove())
    return source
  }

  private isLikelyInlineCodeSpan(element: HTMLElement): boolean {
    if (element.childElementCount > 0) {
      return false
    }

    return element.matches(this.config.sitePrivateSelectors.inlineCodeSpan)
  }

  private normalizeUserQueryMarkdownSource(source: HTMLElement): HTMLElement {
    source.querySelectorAll("span").forEach((node) => {
      const span = node as HTMLElement
      if (!this.isLikelyInlineCodeSpan(span)) {
        return
      }

      const code = (source.ownerDocument || document).createElement("code")
      code.textContent = span.textContent || ""
      span.replaceWith(code)
    })

    return source
  }

  private extractUserQueryMarkdownFromSource(source: HTMLElement): string {
    const normalizedSource = this.normalizeUserQueryMarkdownSource(source)
    return htmlToMarkdown(normalizedSource).trim()
  }

  extractUserQueryText(element: Element): string {
    const source = this.cloneUserQuerySource(element)
    if (!source) {
      return this.extractTextWithLineBreaks(element).trim()
    }

    return this.extractTextWithLineBreaks(source).trim()
  }

  extractUserQueryMarkdown(element: Element): string {
    const source = this.cloneUserQuerySource(element)
    if (source) {
      const markdown = this.extractUserQueryMarkdownFromSource(source)
      if (markdown) {
        return markdown
      }
    }

    return element.textContent?.trim() || ""
  }

  extractUserQueryExportContent(element: Element): string {
    return this.extractGrokUserQueryExportContent(element)
  }

  private extractGrokExportMessages(collector?: ExportAssetCollector): ExportMessage[] {
    const root = document.querySelector(this.getResponseContainerSelector()) || document.body
    const items = this.getGrokExportMessageItems(root)
    const messages: ExportMessage[] = []

    for (const item of items) {
      const userRoot = this.findGrokUserMessageRoot(item)
      if (userRoot) {
        const content = this.extractGrokUserQueryExportContent(userRoot, collector, item).trim()
        if (content) {
          messages.push({ role: "user", content })
        }
        continue
      }

      const assistantRoot = this.findGrokAssistantMessageRoot(item)
      if (assistantRoot) {
        const content = this.extractGrokAssistantExportContent(assistantRoot, collector).trim()
        if (content) {
          messages.push({ role: "assistant", content })
        }
      }
    }

    return messages
  }

  private getGrokExportMessageItems(root: ParentNode): Element[] {
    const privateSelectors = this.config.sitePrivateSelectors
    const responseContainers = Array.from(
      root.querySelectorAll(privateSelectors.responseRoot),
    ).filter(
      (element) =>
        element.querySelector(privateSelectors.messageBubble) && !element.closest(".gh-main-panel"),
    )
    if (responseContainers.length > 0) {
      return responseContainers
    }

    return Array.from(root.querySelectorAll(privateSelectors.messageBubble)).filter(
      (element) => !element.closest(".gh-main-panel"),
    )
  }

  private findGrokUserMessageRoot(element: Element): Element | null {
    const selector = this.getUserQuerySelector()
    if (element.matches(selector)) return element
    return element.querySelector(selector)
  }

  private findGrokAssistantMessageRoot(element: Element): Element | null {
    const selector = this.config.selectors.assistantResponse
    if (element.matches(selector)) return element
    return element.querySelector(selector)
  }

  private extractGrokUserQueryExportContent(
    element: Element,
    collector?: ExportAssetCollector,
    attachmentScope?: Element,
  ): string {
    const attachments = this.extractGrokUserAttachments(element, attachmentScope)
    const body = this.extractGrokUserBodyMarkdown(element)

    if (attachments.length === 0) {
      return body || this.extractUserQueryText(element)
    }

    const imageMarkdown = this.formatGrokUserImageAttachments(attachments, collector)
    const fileMarkdown = this.formatGrokUserFileAttachments(attachments, collector)
    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, body].filter(Boolean).join("\n\n")
  }

  private extractGrokUserBodyMarkdown(element: Element): string {
    const source = this.cloneUserQuerySource(element)
    if (!source) {
      return this.extractUserQueryText(element)
    }

    this.removeGrokUserAttachmentNodes(source)
    this.removeGrokExportDecorations(source, { removeImages: true })
    const markdown = this.extractUserQueryMarkdownFromSource(source)
    return markdown || this.extractTextWithLineBreaks(source).trim()
  }

  private extractGrokAssistantExportContent(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    const body = this.extractGrokAssistantBodyMarkdown(element)
    const imageMarkdown = this.extractGrokImageMarkdown(element, collector, "generated image")

    return [body, imageMarkdown.join("\n\n")].filter(Boolean).join("\n\n")
  }

  private extractGrokAssistantBodyMarkdown(element: Element): string {
    const responseMarkdown = this.config.sitePrivateSelectors.responseMarkdown
    const source = element.matches(responseMarkdown)
      ? element
      : element.querySelector(responseMarkdown) || element
    const clone = source.cloneNode(true) as HTMLElement

    this.removeGrokExportDecorations(clone, { removeImages: true })

    const markdown = htmlToMarkdown(clone).trim()
    if (markdown) return markdown

    return this.extractTextWithLineBreaks(clone).trim()
  }

  private removeGrokExportDecorations(
    root: HTMLElement,
    options: { removeImages?: boolean } = {},
  ): void {
    const selectors = [this.config.sitePrivateSelectors.exportDecoration, ".gh-user-query-markdown"]
    if (options.removeImages) {
      selectors.push("img", "picture", "video")
    }

    root.querySelectorAll(selectors.join(", ")).forEach((node) => node.remove())
  }

  private removeGrokUserAttachmentNodes(root: HTMLElement): void {
    const candidates = Array.from(
      root.querySelectorAll(this.config.sitePrivateSelectors.attachmentCardCandidates),
    )

    candidates.forEach((node) => {
      if (this.isLikelyGrokAttachmentCard(node, root)) {
        node.remove()
      }
    })
  }

  private extractGrokUserAttachments(
    element: Element,
    attachmentScope?: Element,
  ): GrokUserAttachment[] {
    const message = this.resolveGrokUserAttachmentScope(element, attachmentScope)
    if (!message) return []

    const attachments: GrokUserAttachment[] = []
    const seen = new Set<string>()

    const addAttachment = (attachment: GrokUserAttachment): void => {
      if (this.hasEquivalentGrokAttachment(attachments, attachment)) return

      const key = this.getGrokAttachmentDedupKey(attachment)
      if (seen.has(key)) return
      seen.add(key)
      attachments.push(attachment)
    }

    this.getCachedGrokUserAttachments(message).forEach(addAttachment)
    this.extractGrokUserImageAttachments(message).forEach(addAttachment)
    this.extractGrokUserFileAttachments(message).forEach(addAttachment)

    return attachments
  }

  private getGrokAttachmentDedupKey(attachment: GrokUserAttachment): string {
    const assetId = this.extractGrokAssetIdFromSource(attachment.source)
    if (assetId) return `${attachment.kind}:asset:${assetId}`

    const normalizedName = attachment.name.toLowerCase()
    if (normalizedName) return `${attachment.kind}:name:${normalizedName}`

    return `${attachment.kind}:${attachment.source}:${attachment.type}:${attachment.size}`
  }

  private hasEquivalentGrokAttachment(
    attachments: GrokUserAttachment[],
    candidate: GrokUserAttachment,
  ): boolean {
    const candidateAssetId = this.extractGrokAssetIdFromSource(candidate.source)
    const candidateName = candidate.name.toLowerCase()

    return attachments.some((attachment) => {
      if (attachment.kind !== candidate.kind) return false

      const assetId = this.extractGrokAssetIdFromSource(attachment.source)
      if (assetId && candidateAssetId && assetId === candidateAssetId) return true

      return Boolean(candidateName && attachment.name.toLowerCase() === candidateName)
    })
  }

  private getCachedGrokUserAttachments(message: Element): GrokUserAttachment[] {
    if (!this.exportUserAttachmentsByResponseId) return []

    const responseId = this.extractGrokResponseId(message)
    if (!responseId) return []

    return this.exportUserAttachmentsByResponseId.get(responseId) || []
  }

  private extractGrokResponseId(element: Element): string {
    const response = element.closest(this.config.sitePrivateSelectors.responseRoot)
    const id = response?.id || (element.id.startsWith("response-") ? element.id : "")
    return id.replace(/^response-/, "")
  }

  private resolveGrokUserAttachmentScope(
    element: Element,
    attachmentScope?: Element,
  ): HTMLElement | null {
    if (attachmentScope instanceof HTMLElement) {
      return attachmentScope
    }

    const responseContainer = element.closest(this.config.sitePrivateSelectors.responseRoot)
    if (responseContainer instanceof HTMLElement) {
      return responseContainer
    }

    const nearestMessageContainer = element.closest(
      this.config.sitePrivateSelectors.messageBubble,
    )?.parentElement
    if (nearestMessageContainer instanceof HTMLElement) {
      return nearestMessageContainer
    }

    const message = element.closest(this.getUserQuerySelector())
    return message instanceof HTMLElement ? message : null
  }

  private extractGrokUserImageAttachments(message: Element): GrokUserAttachment[] {
    const images = this.getGrokExportImages(message).filter(
      (image) => !image.closest(".gh-user-query-markdown"),
    )

    return images.flatMap((image) => {
      const source = this.getGrokImageExportSource(image)
      if (!this.isExportableGrokImageSource(source)) return []

      const name = this.extractGrokImageAlt(image, source, "uploaded image")
      return [
        {
          kind: "image" as const,
          name,
          source,
          type: this.extractFileTypeFromName(name) || "image",
          size: "",
        },
      ]
    })
  }

  private extractGrokUserFileAttachments(message: Element): GrokUserAttachment[] {
    const cards = Array.from(
      message.querySelectorAll(this.config.sitePrivateSelectors.attachmentCardCandidates),
    ).filter((node) => this.isLikelyGrokAttachmentCard(node, message))

    return cards.flatMap((card) => {
      const name = this.extractGrokAttachmentCardName(card)
      if (!name) return []

      const source = this.extractGrokAttachmentCardSource(card)
      const type = this.extractFileTypeFromName(name)
      const kind = this.isImageAttachmentName(name, type) ? "image" : "file"

      return [
        {
          kind,
          name,
          source,
          type,
          size: this.extractGrokAttachmentCardSize(card),
        },
      ]
    })
  }

  private isLikelyGrokAttachmentCard(card: Element, message: Element): boolean {
    if (card === message) return false
    if (card.closest(".gh-user-query-markdown")) return false
    if (card.closest("pre, code")) return false
    if (card.closest(`${this.config.sitePrivateSelectors.responseMarkdown} p`)) return false

    const name = this.extractGrokAttachmentCardName(card)
    if (!name) return false

    return Boolean(
      card.querySelector("a[href], img, svg") ||
        card.matches("a[href]") ||
        this.extractGrokAttachmentCardSource(card),
    )
  }

  private extractGrokImageMarkdown(
    element: Element,
    collector: ExportAssetCollector | undefined,
    fallbackAlt: string,
  ): string[] {
    const seenSources = new Set<string>()
    const imageMarkdown: string[] = []

    for (const image of this.getGrokExportImages(element)) {
      const source = this.getGrokImageExportSource(image)
      if (!this.isExportableGrokImageSource(source) || seenSources.has(source)) continue

      seenSources.add(source)
      const alt = this.extractGrokImageAlt(image, source, fallbackAlt)
      const markdown = formatExportImageMarkdown({ source, alt, extensionHint: alt }, collector, {
        siteId: this.getSiteId(),
        role: "assistant",
        category: "generated-image",
        fallbackAlt,
      })

      if (markdown) imageMarkdown.push(markdown)
    }

    return imageMarkdown
  }

  private getGrokExportImages(element: Element): HTMLImageElement[] {
    return Array.from(element.querySelectorAll("img")).filter(
      (node): node is HTMLImageElement => node instanceof HTMLImageElement,
    )
  }

  private getGrokImageExportSource(image: HTMLImageElement): string {
    const candidates = [
      image.currentSrc || "",
      image.src || "",
      image.getAttribute("src") || "",
      image.closest("a[href]")?.getAttribute("href") || "",
    ]

    for (const candidate of candidates) {
      const source = normalizeExportAssetUrl(candidate)
      if (source) return source
    }

    return ""
  }

  private isExportableGrokImageSource(source: string): boolean {
    if (!source) return false
    if (source.startsWith("data:image/svg+xml")) return false
    if (/\/images\/(?:favicon|apple-touch-icon|android-chrome)/i.test(source)) return false
    return isDownloadableExportAssetUrl(source) || source.startsWith("data:image/")
  }

  private extractGrokImageAlt(image: HTMLImageElement, source: string, fallback: string): string {
    const candidates = [
      image.alt || "",
      image.getAttribute("title") || "",
      image.getAttribute("aria-label") || "",
      this.extractFilenameFromUrl(source),
      fallback,
    ]

    return candidates.map((value) => this.normalizeAttachmentText(value)).find(Boolean) || fallback
  }

  private formatGrokUserImageAttachments(
    attachments: GrokUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportImageAttachments(attachments, collector, { siteId: this.getSiteId() })
  }

  private formatGrokUserFileAttachments(
    attachments: GrokUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportFileAttachments(attachments, collector, {
      siteId: this.getSiteId(),
      includeAttachment: (attachment) => attachment.kind !== "image" || !attachment.source,
      getLabel: (attachment) => this.formatGrokAttachmentLabel(attachment),
    })
  }

  private formatGrokAttachmentLabel(attachment: GrokUserAttachment): string {
    const details = this.formatGrokAttachmentDetails(attachment)
    return details ? `${attachment.name} (${details})` : attachment.name
  }

  private formatGrokAttachmentDetails(attachment: GrokUserAttachment): string {
    return [
      attachment.type && !this.fileNameEndsWithExtension(attachment.name, attachment.type)
        ? attachment.type
        : "",
      attachment.size,
    ]
      .filter(Boolean)
      .join(", ")
  }

  private extractGrokAttachmentCardName(card: Element): string {
    const candidates = [
      ...this.extractGrokAttachmentLeafTexts(card),
      card.getAttribute("aria-label") || "",
      card.getAttribute("title") || "",
      card instanceof HTMLAnchorElement ? card.download || "" : "",
      card.textContent || "",
      this.extractFilenameFromUrl(this.extractGrokAttachmentCardSource(card)),
    ]

    for (const candidate of candidates) {
      const filename = this.extractFilenameFromText(candidate)
      if (filename) return filename
    }

    return ""
  }

  private extractGrokAttachmentLeafTexts(card: Element): string[] {
    return Array.from(card.querySelectorAll("div, span, p"))
      .filter((node) => node.children.length === 0 && !node.querySelector("svg, img"))
      .map((node) => this.normalizeAttachmentText(node.textContent || ""))
      .filter(Boolean)
  }

  private extractGrokAttachmentCardSource(card: Element): string {
    const candidates: string[] = []

    if (card instanceof HTMLAnchorElement) {
      candidates.push(card.getAttribute("href") || card.href || "")
    }

    const closestLink = card.closest("a[href]")
    if (closestLink instanceof HTMLAnchorElement) {
      candidates.push(closestLink.getAttribute("href") || closestLink.href || "")
    }

    card.querySelectorAll("a[href]").forEach((node) => {
      if (node instanceof HTMLAnchorElement) {
        candidates.push(node.getAttribute("href") || node.href || "")
      }
    })

    for (const attr of ["data-url", "data-src", "data-file-url", "data-download-url"]) {
      candidates.push((card as HTMLElement).getAttribute(attr) || "")
    }

    const image = card.querySelector("img")
    if (image instanceof HTMLImageElement) {
      candidates.push(this.getGrokImageExportSource(image))
    }

    for (const candidate of candidates) {
      const source = normalizeExportAssetUrl(candidate)
      if (isDownloadableExportAssetUrl(source) || source.startsWith("data:")) {
        return source
      }
    }

    return ""
  }

  private extractGrokAttachmentCardSize(card: Element): string {
    const text = this.normalizeAttachmentText(card.textContent || "")
    return text.match(/\b\d+(?:\.\d+)?\s*[KMGT]?B\b/i)?.[0] || ""
  }

  private extractFilenameFromText(value: string): string {
    const normalized = this.normalizeAttachmentText(value)
      .replace(/^(attached\s+file|attachment|file|附件|文件)[:：]?\s+/i, "")
      .trim()
    if (!normalized || this.isFileMetaText(normalized)) return ""

    if (/^[^/\\]+\.[A-Za-z0-9]{1,10}$/.test(normalized)) {
      return normalized
    }

    const match = normalized.match(/(?:^|[\s([{])([^/\\]+?\.[A-Za-z0-9]{1,10})(?=$|[\s)\]}])/)
    return match?.[1]?.trim() || ""
  }

  private isFileMetaText(value: string): boolean {
    return /^[A-Za-z0-9.+-]{1,12}\s+\d+(?:\.\d+)?\s*[KMGT]?B$/i.test(value)
  }

  private isImageAttachmentName(name: string, type: string): boolean {
    const extension = (this.extractFileTypeFromName(name) || type).toLowerCase()
    return ["avif", "gif", "jpg", "jpeg", "png", "svg", "webp"].includes(extension)
  }

  private extractFileTypeFromName(name: string): string {
    return name.match(/\.([A-Za-z0-9]{1,10})$/)?.[1]?.toUpperCase() || ""
  }

  private extractFilenameFromUrl(value: string): string {
    try {
      const url = new URL(value, window.location.href)
      const filename = url.searchParams.get("filename") || url.searchParams.get("file_name")
      if (filename?.trim()) return filename.trim()

      return decodeURIComponent(url.pathname).split("/").pop()?.trim() || ""
    } catch {
      return ""
    }
  }

  private extractGrokAssetIdFromSource(value: string): string {
    if (!value) return ""

    try {
      const pathname = new URL(value, window.location.href).pathname
      const segments = pathname.split("/").filter(Boolean)
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

      return segments.reverse().find((segment) => uuidPattern.test(segment)) || ""
    } catch {
      return ""
    }
  }

  private normalizeAttachmentText(value: string): string {
    return value.replace(/\s+/g, " ").trim()
  }

  private fileNameEndsWithExtension(name: string, extension: string): boolean {
    const normalizedExtension = extension.toLowerCase().replace(/^\./, "").trim()
    if (!normalizedExtension) return false
    return name.toLowerCase().endsWith(`.${normalizedExtension}`)
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    // Grok 用户消息结构：
    // [data-testid="user-message"] > div.relative > .response-content-markdown
    // 内部直接是 <p> 标签，没有 .whitespace-pre-wrap 容器
    const markdownContainer = element.querySelector(
      this.config.sitePrivateSelectors.responseMarkdown,
    )
    if (!markdownContainer) return false

    // 检查是否已经处理过
    if (markdownContainer.querySelector(".gh-user-query-markdown")) {
      return false
    }

    // 保存原始内容的引用（用于恢复）
    const originalContent = Array.from(markdownContainer.children)

    // 创建原内容包装器并隐藏
    const originalWrapper = document.createElement("div")
    originalWrapper.className = "gh-user-query-original"
    originalWrapper.style.display = "none"
    originalContent.forEach((child) => {
      originalWrapper.appendChild(child)
    })
    markdownContainer.appendChild(originalWrapper)

    // 创建渲染容器
    const rendered = document.createElement("div")
    rendered.className = "gh-user-query-markdown gh-markdown-preview"
    rendered.innerHTML = html

    // 插入到 markdownContainer 开头
    markdownContainer.insertBefore(rendered, originalWrapper)
    return true
  }

  getExportConfig(): ExportConfig | null {
    return { ...this.config.export }
  }

  async prepareConversationExport(_context: ExportLifecycleContext): Promise<unknown> {
    this.exportUserAttachmentsByResponseId = await this.collectGrokShareUserAttachments()
    // 常规会话优先走接口拿全量历史（虚拟列表只挂载可视窗口，DOM 收集不全）；
    // 失败返回 null，extractExportMessages 回退 DOM 路径
    this.exportApiData = await this.fetchApiExportData()
    return null
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    _state: unknown,
  ): Promise<void> {
    this.exportUserAttachmentsByResponseId = null
    this.exportApiData = null
  }

  /**
   * 常规会话的接口导出数据源：response-node 骨架 + load-responses 全文。
   * 完整性门槛严于大纲（见 parseGrokHistoryExport），无法证明完整时返回 null。
   */
  private async fetchApiExportData(): Promise<GrokHistoryExportData | null> {
    if (!this.isUserConversationPage()) return null
    const sessionId = this.getSessionId()
    if (!sessionId) return null

    try {
      const treeResult = await this.fetchResponseTree(sessionId)
      if (!treeResult) return null
      const responses = await this.fetchBranchResponses(sessionId, treeResult.tree)
      if (!responses) return null
      return parseGrokHistoryExport(
        treeResult.treePayload,
        { responses },
        sessionId,
        this.getUrlLeafResponseId(),
      )
    } catch (error) {
      console.warn("[GrokAdapter] Failed to collect api export payload:", error)
      return null
    }
  }

  /** 把接口导出素材格式化为导出消息（与 DOM 路径同一套附件/图片格式化） */
  private formatApiExportMessages(
    data: GrokHistoryExportData,
    collector?: ExportAssetCollector,
  ): ExportMessage[] {
    const messages: ExportMessage[] = []

    for (const message of data.messages) {
      if (message.role === "user") {
        const attachments = message.fileAttachmentsMetadata
          .map((metadata) => this.parseGrokFileAttachmentMetadata(metadata))
          .filter((attachment): attachment is GrokUserAttachment => attachment !== null)
        const imageMarkdown = this.formatGrokUserImageAttachments(attachments, collector)
        const fileMarkdown = this.formatGrokUserFileAttachments(attachments, collector)
        const fileBlock =
          fileMarkdown.length > 0
            ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}`
            : ""
        const content = [imageMarkdown.join("\n\n"), fileBlock, message.requestText]
          .filter(Boolean)
          .join("\n\n")
          .trim()
        if (content) {
          messages.push({ role: "user", content })
        }
        continue
      }

      const imageMarkdown: string[] = []
      for (const url of message.generatedImageUrls) {
        const source = this.buildGrokAssetSource(url)
        if (!this.isExportableGrokImageSource(source)) continue
        const alt = this.extractFilenameFromUrl(source) || "generated image"
        const markdown = formatExportImageMarkdown({ source, alt, extensionHint: alt }, collector, {
          siteId: this.getSiteId(),
          role: "assistant",
          category: "generated-image",
          fallbackAlt: "generated image",
        })
        if (markdown) imageMarkdown.push(markdown)
      }

      const content = [message.responseMarkdown, imageMarkdown.join("\n\n")]
        .filter(Boolean)
        .join("\n\n")
        .trim()
      if (content) {
        messages.push({ role: "assistant", content })
      }
    }

    return messages
  }

  private async collectGrokShareUserAttachments(): Promise<Map<
    string,
    GrokUserAttachment[]
  > | null> {
    const shareId = this.extractGrokShareId()
    if (!shareId) return null

    try {
      const response = await fetch(`/rest/app-chat/share_links/${encodeURIComponent(shareId)}`, {
        credentials: "include",
        headers: { accept: "application/json" },
      })
      if (!response.ok) {
        console.warn("[GrokAdapter] Failed to load share attachment metadata:", response.status)
        return null
      }

      return this.parseGrokShareUserAttachments(await response.json())
    } catch (error) {
      console.warn("[GrokAdapter] Failed to load share attachment metadata:", error)
      return null
    }
  }

  private extractGrokShareId(): string {
    const match = window.location.pathname.match(/^\/share\/([^/?#]+)/)
    return match?.[1] ? decodeURIComponent(match[1]) : ""
  }

  private parseGrokShareUserAttachments(
    payload: unknown,
  ): Map<string, GrokUserAttachment[]> | null {
    const record = this.toGrokRecord(payload)
    const responses = record?.responses
    if (!Array.isArray(responses)) return null

    const attachmentsByResponseId = new Map<string, GrokUserAttachment[]>()
    for (const item of responses) {
      const response = this.toGrokRecord(item) as GrokShareResponseItem | null
      const responseId = this.readGrokString(response?.responseId)
      if (!responseId) continue

      const metadataItems = response?.fileAttachmentsMetadata
      if (!Array.isArray(metadataItems)) continue

      const attachments = metadataItems
        .map((metadata) => this.parseGrokFileAttachmentMetadata(metadata))
        .filter((attachment): attachment is GrokUserAttachment => attachment !== null)
      if (attachments.length > 0) {
        attachmentsByResponseId.set(responseId, attachments)
      }
    }

    return attachmentsByResponseId.size > 0 ? attachmentsByResponseId : null
  }

  private parseGrokFileAttachmentMetadata(metadata: unknown): GrokUserAttachment | null {
    const record = this.toGrokRecord(metadata) as GrokFileAttachmentMetadata | null
    if (!record) return null

    const name =
      this.readGrokString(record.fileName) || this.readGrokString(record.fileMetadataId) || "file"
    const type = this.readGrokString(record.fileMimeType) || this.extractFileTypeFromName(name)
    const source = this.buildGrokAssetSource(this.readGrokString(record.fileUri))
    const kind =
      type.toLowerCase().startsWith("image/") || this.isImageAttachmentName(name, type)
        ? "image"
        : "file"

    return {
      kind,
      name,
      source,
      type,
      size: "",
    }
  }

  private buildGrokAssetSource(value: string): string {
    const source = value.trim()
    if (!source) return ""
    if (/^(blob:|data:|https?:\/\/)/i.test(source)) return normalizeExportAssetUrl(source)
    if (source.startsWith("//")) return `https:${source}`
    if (source.startsWith("assets.grok.com/")) return `https://${source}`
    const path = source.replace(/^\/+/, "")
    if (/^(users|generated)\//i.test(path)) {
      return `https://assets.grok.com/${path}`
    }

    return normalizeExportAssetUrl(source)
  }

  private toGrokRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null
  }

  private readGrokString(value: unknown): string {
    return typeof value === "string" ? value.trim() : ""
  }

  async extractExportMessages(_context: ExportLifecycleContext): Promise<ExportMessage[] | null> {
    // 接口数据可用时优先（虚拟列表 DOM 只有挂载窗口，长对话必然不全）
    if (this.exportApiData) {
      const apiMessages = this.formatApiExportMessages(this.exportApiData)
      if (apiMessages.length > 0) return apiMessages
    }
    const messages = this.extractGrokExportMessages()
    return messages.length > 0 ? messages : null
  }

  async extractExportBundle(_context: ExportLifecycleContext): Promise<ExportBundle | null> {
    return this.createExportBundleFromMessages((collector) => {
      if (this.exportApiData) {
        const apiMessages = this.formatApiExportMessages(this.exportApiData, collector)
        if (apiMessages.length > 0) return apiMessages
      }
      return this.extractGrokExportMessages(collector)
    })
  }

  getAssistantMermaidSupportMode() {
    return "native" as const
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    // 虚拟滚动回填：异步拉取 response-node / load-responses 接口，
    // 补齐离屏轮次的提问与回答标题
    this.maybeRefreshApiOutline()

    const outline = this.extractDomOutline(maxLevel, includeUserQueries, showWordCount)

    // 接口数据可用：DOM 条目与接口回填条目按分支位置序号统一归并
    const apiData = this.apiOutlineData
    if (!apiData || apiData.sessionId !== this.getSessionId()) return outline
    return this.mergeOutlineByBranchOrder(outline, apiData, {
      maxLevel,
      includeUserQueries,
      showWordCount,
    })
  }

  private extractDomOutline(
    maxLevel = 6,
    includeUserQueries = false,
    showWordCount = false,
  ): OutlineItem[] {
    const outline: OutlineItem[] = []
    const container = document.querySelector(this.getResponseContainerSelector())
    if (!container) return outline

    // 辅助：获取消息 ID (Response ID)
    const getResponseId = (el: Element): string | null => {
      // 往上找 id 以 response- 开头的 div
      const responseDiv = el.closest(this.config.sitePrivateSelectors.responseRoot)
      if (responseDiv) {
        return responseDiv.id
      }
      return null
    }

    // 辅助：生成标题 ID
    const msgHeaderCounts: Record<string, Record<string, number>> = {}
    const generateHeaderId = (msgId: string, tagName: string, text: string): string => {
      if (!msgHeaderCounts[msgId]) msgHeaderCounts[msgId] = {}
      const key = `${tagName}-${text}`
      const count = msgHeaderCounts[msgId][key] || 0
      msgHeaderCounts[msgId][key] = count + 1
      return `${msgId}::${key}::${count}`
    }

    // 计算用户提问的字数（统计后续 AI 回复）
    const userQuerySelector = this.getUserQuerySelector()
    const calculateUserQueryWordCount = (startEl: Element): number => {
      // Grok 结构：用户消息和 AI 消息各自在独立的 #response-{id} 容器中
      // 需要先找到父容器，然后遍历父容器的 siblings
      const parentContainer = startEl.closest(this.config.sitePrivateSelectors.responseRoot)
      if (!parentContainer) return 0

      let current = parentContainer.nextElementSibling
      let totalLength = 0

      while (current) {
        // 检查是否是下一个用户消息的容器
        const userQueryInThis = current.querySelector(userQuerySelector)
        if (userQueryInThis) {
          break // 遇到下一个用户提问的容器，结束
        }

        // 查找 AI 回复内容（选择器见 config.selectors.assistantResponse）
        const aiMessage = current.querySelector(this.config.selectors.assistantResponse)
        if (aiMessage) {
          const markdownContent = aiMessage.querySelector(
            this.config.sitePrivateSelectors.responseMarkdown,
          )
          if (markdownContent) {
            totalLength += markdownContent.textContent?.trim().length || 0
          }
        }

        current = current.nextElementSibling
      }

      // Fallback：如果没有找到任何内容（可能是最后一条消息正在生成中）
      // 尝试从整个 container 中查找跟在当前用户消息之后的 AI 回复
      if (totalLength === 0) {
        // nextElementSibling 是紧随的 AI 回复而非下一个用户消息，
        // 必须在全容器内按文档顺序找 startEl 之后的第一个用户提问
        const nextUserQuery =
          Array.from(container.querySelectorAll(userQuerySelector)).find((uq) =>
            Boolean(startEl.compareDocumentPosition(uq) & Node.DOCUMENT_POSITION_FOLLOWING),
          ) || null

        const allAiMessages = container.querySelectorAll(this.config.selectors.assistantResponse)
        for (const aiMsg of Array.from(allAiMessages)) {
          // 检查这个 AI 消息是否在 startEl 之后
          const positionToStart = startEl.compareDocumentPosition(aiMsg)
          const isAfterStart = positionToStart & Node.DOCUMENT_POSITION_FOLLOWING
          if (!isAfterStart) continue

          // 检查是否在下一个用户消息之前
          if (nextUserQuery) {
            const positionToEnd = nextUserQuery.compareDocumentPosition(aiMsg)
            const isBeforeEnd = positionToEnd & Node.DOCUMENT_POSITION_PRECEDING
            if (!isBeforeEnd) continue
          }

          const markdownContent = aiMsg.querySelector(
            this.config.sitePrivateSelectors.responseMarkdown,
          )
          if (markdownContent) {
            totalLength += markdownContent.textContent?.trim().length || 0
          }
        }
      }

      return totalLength
    }

    // 不包含用户提问时，只提取标题
    if (!includeUserQueries) {
      const headingSelectors: string[] = []
      for (let i = 1; i <= maxLevel; i++) {
        headingSelectors.push(`h${i}`)
      }

      const headings = Array.from(container.querySelectorAll(headingSelectors.join(", ")))
      headings.forEach((heading, index) => {
        if (this.isInRenderedMarkdownContainer(heading)) return
        const level = parseInt(heading.tagName.charAt(1), 10)
        if (level <= maxLevel) {
          const item: OutlineItem = {
            level,
            text: heading.textContent?.trim() || "",
            element: heading,
          }

          // Stable ID for Headings
          const msgId = getResponseId(heading)
          if (msgId) {
            const tagName = heading.tagName.toLowerCase()
            item.id = generateHeaderId(msgId, tagName, item.text)
          }

          // 字数统计
          if (showWordCount) {
            let nextBoundaryEl: Element | null = null
            for (let i = index + 1; i < headings.length; i++) {
              const candidate = headings[i]
              const candidateLevel = parseInt(candidate.tagName.charAt(1), 10)
              if (candidateLevel <= level) {
                nextBoundaryEl = candidate
                break
              }
            }
            // 查找所属的 response container
            const responseContainer = heading.closest(this.config.sitePrivateSelectors.responseRoot)
            item.wordCount = this.calculateRangeWordCount(
              heading,
              nextBoundaryEl,
              responseContainer || container,
            )
          }

          outline.push(item)
        }
      })
      return outline
    }

    // 包含用户提问的模式：按 DOM 顺序遍历用户提问和标题
    const headingSelectors: string[] = []
    for (let i = 1; i <= maxLevel; i++) {
      headingSelectors.push(`h${i}`)
    }

    const combinedSelector = `${userQuerySelector}, ${headingSelectors.join(", ")}`
    const allElements = Array.from(container.querySelectorAll(combinedSelector))

    allElements.forEach((element, index) => {
      const tagName = element.tagName.toLowerCase()
      const isUserQuery = element.matches(userQuerySelector)

      if (isUserQuery) {
        let queryText = this.extractUserQueryText(element)
        let isTruncated = false
        if (queryText.length > 200) {
          queryText = queryText.substring(0, 200)
          isTruncated = true
        }

        const item: OutlineItem = {
          level: 0,
          text: queryText,
          element,
          isUserQuery: true,
          isTruncated,
        }

        // Stable ID for User Query
        const msgId = getResponseId(element)
        if (msgId) {
          item.id = msgId
        }

        if (showWordCount) {
          item.wordCount = calculateUserQueryWordCount(element)
        }

        outline.push(item)
      } else if (/^h[1-6]$/.test(tagName)) {
        if (this.isInRenderedMarkdownContainer(element)) return
        const level = parseInt(tagName.charAt(1), 10)
        if (level <= maxLevel) {
          const item: OutlineItem = {
            level,
            text: element.textContent?.trim() || "",
            element,
          }

          // Stable ID for Headings
          const msgId = getResponseId(element)
          if (msgId) {
            item.id = generateHeaderId(msgId, tagName, item.text)
          }

          if (showWordCount) {
            let nextBoundaryEl: Element | null = null
            for (let i = index + 1; i < allElements.length; i++) {
              const candidate = allElements[i]
              const candidateTagName = candidate.tagName.toLowerCase()

              if (candidate.matches(userQuerySelector)) {
                nextBoundaryEl = candidate
                break
              }

              if (/^h[1-6]$/.test(candidateTagName)) {
                const candidateLevel = parseInt(candidateTagName.charAt(1), 10)
                if (candidateLevel <= item.level) {
                  nextBoundaryEl = candidate
                  break
                }
              }
            }

            const responseContainer = element.closest(this.config.sitePrivateSelectors.responseRoot)
            item.wordCount = this.calculateRangeWordCount(
              element,
              nextBoundaryEl,
              responseContainer || container,
            )
          }

          outline.push(item)
        }
      }
    })

    return outline
  }

  // ==================== API 数据源大纲（虚拟滚动回填） ====================

  /**
   * Grok 消息列表是 plane 虚拟列表（absolute + translateY，只挂可视窗口），
   * 离屏轮次的标题会从 DOM 卸载。这里直接请求站点的 response-node（全量
   * 分支骨架）+ load-responses（按 responseId 批量取正文）接口，从回复
   * markdown 解析标题，作为大纲标题的完整数据源。
   */
  private maybeRefreshApiOutline(): void {
    if (!this.isUserConversationPage()) return
    // 仅虚拟滚动会话需要接口回填：内容不足一屏时 DOM 本身就是完整的
    if (!this.isVirtualScrollConversation()) return

    const sessionId = this.getSessionId()
    if (sessionId !== this.apiOutlineSessionId) {
      // 会话切换时解除解析失败熔断与拉取冷却，新会话应立即补齐大纲
      this.apiOutlineSessionId = sessionId
      this.apiOutlineFailures = 0
      this.apiOutlineLastFetchAt = 0
      this.apiOutlineForceRefetch = false
    }

    // 生成结束（含中断）后强制重拉：生成期间被闸门跳过，且流式完成后树
    // 签名不再变化，仅靠签名比对会漏掉正文补全
    const generating = this.isGenerating()
    if (this.apiOutlineWasGenerating && !generating) {
      this.apiOutlineForceRefetch = true
    }
    this.apiOutlineWasGenerating = generating

    const scrollable = this.getScrollContainer()
    const atBottom = scrollable
      ? scrollable.scrollTop + scrollable.clientHeight >=
        scrollable.scrollHeight - API_OUTLINE_BOTTOM_TOLERANCE_PX
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
        backoffMs: API_OUTLINE_FETCH_BACKOFF_MS,
        parseFailures: this.apiOutlineFailures,
        inFlight: this.apiOutlineFetchPromise !== null,
        generating,
        stale,
      })
    ) {
      return
    }

    // 任何一次实际发起的拉取都记入冷却：签名未变的成功重拉也不会连续重试
    this.apiOutlineLastFetchAt = Date.now()
    this.apiOutlineFetchPromise = this.fetchApiOutline(sessionId)
      .then((result) => {
        if (result === "parse-failed") {
          this.apiOutlineFailures += 1
          return
        }
        this.apiOutlineFailures = 0
        if (result === "changed") {
          window.postMessage({ type: EVENT_OUTLINE_DATA_UPDATED }, "*")
        }
      })
      .catch((error) => {
        // 网络/HTTP 失败同样计入熔断
        this.apiOutlineFailures += 1
        console.warn("[GrokAdapter] Failed to fetch conversation outline:", error)
      })
      .finally(() => {
        this.apiOutlineFetchPromise = null
      })
  }

  /**
   * 收集挂载窗口内消息行的分支位置序号。DOM 行携带 responseId
   * （id="response-<uuid>"），经接口缓存映射为分支位置；未入库的新行
   * （刚发送/生成中/分支切换残留）统一映射为 maxMessageId + 1，
   * 让过期判定按「出现更大 id」触发重拉。
   */
  private collectMountedVirtualMessageIndexes(): Set<number> {
    const indexes = new Set<number>()
    const container =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    if (!container) return indexes

    const data = this.apiOutlineData
    const fallback = data ? data.maxMessageId + 1 : 0
    container.querySelectorAll(this.config.sitePrivateSelectors.responseRoot).forEach((element) => {
      const position = data?.positionByResponseId.get(element.id.slice(RESPONSE_ID_PREFIX.length))
      indexes.add(position ?? fallback)
    })
    return indexes
  }

  private getUrlLeafResponseId(): string | null {
    const rid = new URLSearchParams(window.location.search).get("rid")
    return rid && /^[0-9a-f-]{36}$/i.test(rid) ? rid : null
  }

  private async fetchApiOutline(
    sessionId: string,
  ): Promise<"changed" | "unchanged" | "parse-failed"> {
    const treeResult = await this.fetchResponseTree(sessionId)
    if (!treeResult) return "parse-failed"
    const { tree } = treeResult

    // 树签名未变且非强制重拉：正文不可能变化（编辑/重新生成都会产生新节点），
    // 跳过 load-responses 的全文拉取
    const previous = this.apiOutlineData
    if (
      !this.apiOutlineForceRefetch &&
      previous &&
      previous.sessionId === sessionId &&
      previous.signature === tree.signature
    ) {
      return "unchanged"
    }

    const responses = await this.fetchBranchResponses(sessionId, tree)
    if (!responses) return "parse-failed"

    const parsed = parseGrokHistoryOutline(tree, { responses })
    if (!parsed || parsed.sessionId !== sessionId) return "parse-failed"

    this.apiOutlineData = parsed
    this.apiOutlineForceRefetch = false
    return "changed"
  }

  /**
   * 拉取 response-node 骨架并解析激活分支（大纲与导出共用）。
   * HTTP 失败抛出（调用方按各自语义处理），结构解析失败返回 null。
   */
  private async fetchResponseTree(sessionId: string): Promise<{
    treePayload: unknown
    tree: GrokResponseTree
  } | null> {
    const treeResponse = await fetch(
      `${window.location.origin}/rest/app-chat/conversations/${encodeURIComponent(sessionId)}/response-node`,
      { credentials: "include" },
    )
    if (!treeResponse.ok) {
      throw new Error(`response-node responded ${treeResponse.status}`)
    }

    const treePayload: unknown = await treeResponse.json()
    const tree = parseGrokResponseTree(treePayload, sessionId, this.getUrlLeafResponseId())
    if (!tree) return null
    return { treePayload, tree }
  }

  /** 分批拉取激活分支全文（load-responses）；HTTP 失败抛出，结构非法返回 null */
  private async fetchBranchResponses(
    sessionId: string,
    tree: GrokResponseTree,
  ): Promise<unknown[] | null> {
    const responses: unknown[] = []
    for (let i = 0; i < tree.branchResponseIds.length; i += LOAD_RESPONSES_BATCH_SIZE) {
      const chunk = tree.branchResponseIds.slice(i, i + LOAD_RESPONSES_BATCH_SIZE)
      const contentResponse = await fetch(
        `${window.location.origin}/rest/app-chat/conversations/${encodeURIComponent(sessionId)}/load-responses`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ responseIds: chunk }),
        },
      )
      if (!contentResponse.ok) {
        throw new Error(`load-responses responded ${contentResponse.status}`)
      }
      const payload: unknown = await contentResponse.json()
      const list =
        payload && typeof payload === "object"
          ? (payload as { responses?: unknown }).responses
          : null
      if (!Array.isArray(list)) return null
      responses.push(...list)
    }

    return responses
  }

  /**
   * 统一归并：DOM 条目与接口回填条目按分支位置序号归并。挂载项以 DOM 为准
   * （文本真实、元素在手），接口只补未挂载的提问与回复标题。
   * Grok DOM 条目的 id 本身携带 responseId（response-<uuid>），天然稳定，
   * 无需像 DeepSeek 那样按未截断文本重算收藏签名。
   */
  private mergeOutlineByBranchOrder(
    domItems: OutlineItem[],
    data: GrokHistoryOutlineData,
    options: { maxLevel: number; includeUserQueries: boolean; showWordCount: boolean },
  ): OutlineItem[] {
    const { maxLevel, includeUserQueries, showWordCount } = options
    const mountedIndexes = this.collectMountedVirtualMessageIndexes()

    const domEntries = domItems.map((item) => ({
      messageId: this.getMountedRowMessageIndex(item.element),
      item,
    }))

    const fillEntries: { messageId: number; item: OutlineItem }[] = []

    if (includeUserQueries) {
      for (const query of data.userQueries) {
        if (mountedIndexes.has(query.messageIndex)) continue
        let wordCount: number | undefined
        if (showWordCount) {
          // 提问条目的字数口径 = 对应回复的文本长度，未挂载时取接口估算值
          const assistantIndex = data.assistantIndexByQueryIndex.get(query.queryIndex)
          wordCount =
            assistantIndex !== undefined
              ? data.replyWordCountByMessageIndex.get(assistantIndex) ?? 0
              : 0
        }
        const responseId = data.branchResponseIds[query.messageIndex]
        fillEntries.push({
          messageId: query.messageIndex,
          item: {
            level: 0,
            text: query.text.length > 200 ? query.text.substring(0, 200) : query.text,
            isUserQuery: true,
            isTruncated: query.text.length > 200,
            element: null,
            // id 与 DOM 挂载后的条目一致（response-<uuid>），挂载切换时收藏不失效
            id: responseId ? `${RESPONSE_ID_PREFIX}${responseId}` : undefined,
            navigationId: `grok:api-u:${query.messageIndex}`,
            wordCount,
          },
        })
      }
    }

    for (const [messageIndex, headings] of data.headingsByMessageIndex) {
      if (mountedIndexes.has(messageIndex)) continue
      headings.forEach((heading, orderInMessage) => {
        if (heading.level > maxLevel) return
        const id = `grok:api-h:${messageIndex}:${heading.level}:${orderInMessage}:${hashOutlineText(heading.text)}`
        fillEntries.push({
          messageId: messageIndex,
          item: {
            level: heading.level,
            text: heading.text,
            element: null,
            id,
            navigationId: id,
            wordCount: showWordCount ? heading.wordCount : undefined,
          },
        })
      })
    }

    return mergeByBranchMessageOrder(data.branchMessageIds, domEntries, fillEntries)
  }

  private getMountedRowMessageIndex(element: Element | null): number | null {
    const data = this.apiOutlineData
    if (!data || !element) return null
    const row = element.closest(this.config.sitePrivateSelectors.responseRoot)
    if (!row) return null
    return data.positionByResponseId.get(row.id.slice(RESPONSE_ID_PREFIX.length)) ?? null
  }

  private parseApiOutlineItemId(
    id?: string,
  ): { messageIndex: number; level: number; orderInMessage: number } | null {
    if (!id) return null
    const match = id.match(/^grok:api-h:(\d+):(\d+):(\d+):[0-9a-f]+$/)
    if (!match) return null
    return {
      messageIndex: Number(match[1]),
      level: Number(match[2]),
      orderInMessage: Number(match[3]),
    }
  }

  private parseApiUserQueryItemId(id?: string): number | null {
    if (!id) return null
    const match = id.match(/^grok:api-u:(\d+)$/)
    return match ? Number(match[1]) : null
  }

  async resolveOutlineTarget(
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery" | "id" | "navigationId">,
    queryIndex?: number,
    sourceId = "conversation",
  ): Promise<Element | null> {
    // 接口回填的离屏条目：优先按分支位置挂载目标行精确定位，而非全局文本匹配
    const ref = item.navigationId || item.id
    const apiHeadingRef = this.parseApiOutlineItemId(ref)
    if (apiHeadingRef) {
      const apiTarget = await this.resolveApiOutlineTarget(apiHeadingRef, item.text)
      if (apiTarget) return apiTarget
    } else {
      const apiQueryIndex = this.parseApiUserQueryItemId(ref)
      if (apiQueryIndex !== null) {
        const apiTarget = await this.resolveApiUserQueryTarget(apiQueryIndex)
        if (apiTarget) return apiTarget
      }
    }

    return super.resolveOutlineTarget(item, queryIndex, sourceId)
  }

  private async resolveApiOutlineTarget(
    ref: { messageIndex: number; level: number; orderInMessage: number },
    text: string,
  ): Promise<Element | null> {
    const row = await this.mountApiRow(ref.messageIndex)
    return row ? this.findApiHeadingInRow(row, ref, text) : null
  }

  private async resolveApiUserQueryTarget(messageIndex: number): Promise<Element | null> {
    const row = await this.mountApiRow(messageIndex)
    const message = row?.querySelector(this.config.selectors.userQuery)
    return message instanceof HTMLElement ? message : null
  }

  /**
   * 把分支位置对应的消息行挂载出来：先查已挂载行，未挂载则滚动探测。
   * 探测会移动滚动位置；彻底失败时复原，避免把用户甩到无关位置。
   */
  private async mountApiRow(messageIndex: number): Promise<Element | null> {
    const data = this.apiOutlineData
    if (!data || data.sessionId !== this.getSessionId()) return null
    const responseId = data.branchResponseIds[messageIndex]
    if (!responseId) return null

    const container = this.getScrollContainer()
    if (!container) return null

    const findRow = () => container.querySelector(`[id="response-${responseId}"]`)
    const mounted = findRow()
    if (mounted) return mounted

    const requestId = ++this.apiOutlineRevealRequestId
    const entryScrollTop = container.scrollTop
    const row = await this.probeMountVirtualRow(
      responseId,
      messageIndex,
      container,
      data,
      requestId,
    )
    if (row) return row

    if (requestId === this.apiOutlineRevealRequestId) {
      container.scrollTop = entryScrollTop
    }
    return null
  }

  private findApiHeadingInRow(
    row: Element,
    ref: { level: number; orderInMessage: number },
    text: string,
  ): Element | null {
    const headings = Array.from(row.querySelectorAll(OUTLINE_HEADING_SELECTOR)).filter(
      (heading) => !this.isInRenderedMarkdownContainer(heading),
    )
    const direct = headings[ref.orderInMessage]
    if (direct && (direct.textContent || "").trim() === text) return direct

    // setext/引用块/原生 HTML 标题会渲染进 DOM 但不参与 ATX 序号，序号可能
    // 错位：先用「层级+文本」精确命中真正的目标，避免层级巧合跳错标题
    const precise = headings.find(
      (heading) =>
        Number(heading.tagName.charAt(1)) === ref.level &&
        (heading.textContent || "").trim() === text,
    )
    if (precise) return precise

    // 渲染差异导致文本无法精确比对时，才采信同层级的序号命中
    if (direct && Number(direct.tagName.charAt(1)) === ref.level) return direct
    return null
  }

  /**
   * 直接滚动探测聊天虚拟列表，把目标分支位置的行挂载出来。
   * scrollTop 与挂载窗口的位置区间单调对应，每次用真实挂载行做锚点闭环逼近，
   * 通常 1-3 次收敛；失败回退二分（不依赖行高估算）。
   */
  private async probeMountVirtualRow(
    responseId: string,
    position: number,
    container: HTMLElement,
    data: GrokHistoryOutlineData,
    requestId: number | null,
    signal?: AbortSignal,
  ): Promise<Element | null> {
    if (container.scrollHeight <= container.clientHeight) {
      return container.querySelector(`[id="response-${responseId}"]`)
    }

    const findRow = () => container.querySelector(`[id="response-${responseId}"]`)

    let prevSignature = ""
    for (let attempt = 0; attempt < VIRTUAL_ROW_PROBE_MAX_ATTEMPTS; attempt += 1) {
      const existing = findRow()
      if (existing) return existing
      // requestId 为 null 表示非大纲链路调用（阅读历史恢复），不参与大纲请求失效判断
      if (requestId !== null && requestId !== this.apiOutlineRevealRequestId) return null
      if (signal?.aborted) return null

      const rows = this.readMountedVirtualRows(container, data)
      if (rows.length === 0) return null

      const signature = `${rows[0].key}:${rows[rows.length - 1].key}:${Math.round(container.scrollTop)}`
      if (signature === prevSignature) {
        // 窗口无变化：重挂载可能是异步的，给一帧时间
        await this.sleep(VIRTUAL_ROW_PROBE_SETTLE_MS)
      }
      prevSignature = signature

      const first = rows[0]
      const last = rows[rows.length - 1]
      let deltaRows = 0
      if (position < first.key) {
        deltaRows = position - first.key
      } else if (position > last.key) {
        deltaRows = position - last.key
      }

      if (deltaRows === 0) {
        // 目标落在窗口位置区间内却未挂载（挂载滞后）
        await this.sleep(VIRTUAL_ROW_PROBE_SETTLE_MS)
        continue
      }

      const spanRows = Math.max(1, last.key - first.key)
      const spanPx = last.top - first.top
      const pxPerRow =
        spanPx > 0 ? spanPx / spanRows : container.clientHeight / Math.max(1, rows.length)
      if (!(pxPerRow > 0)) return null

      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
      // 至少移动一行，避免小步长在原地打转
      const deltaPx = Math.sign(deltaRows) * Math.max(Math.abs(deltaRows) * pxPerRow, pxPerRow)
      const nextTop = Math.min(maxScroll, Math.max(0, container.scrollTop + deltaPx))
      if (nextTop === container.scrollTop && (nextTop === 0 || nextTop === maxScroll)) {
        // 已到滚动边界仍未挂载：目标行不存在（可能被删除）
        return null
      }

      container.scrollTop = nextTop
      container.dispatchEvent(new Event("scroll", { bubbles: true }))
      // 强制同步 layout，促使虚拟列表本轮完成重挂载
      container.getBoundingClientRect()
    }

    return this.bisectMountVirtualRow(position, container, findRow, requestId, signal)
  }

  /**
   * probeMountVirtualRow 的兜底：启发式逼近依赖行高估算，行高不均时会过冲
   * 震荡。挂载窗口的位置区间随 scrollTop 单调移动，二分不依赖行高，对长对
   * 话 log 级收敛。
   */
  private async bisectMountVirtualRow(
    position: number,
    container: HTMLElement,
    findRow: () => Element | null,
    requestId: number | null,
    signal?: AbortSignal,
  ): Promise<Element | null> {
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
    let lo = 0
    let hi = maxScroll
    let mid = Math.min(maxScroll, Math.max(0, container.scrollTop))

    for (let attempt = 0; attempt < 14; attempt += 1) {
      const existing = findRow()
      if (existing) return existing
      if (requestId !== null && requestId !== this.apiOutlineRevealRequestId) return null
      if (signal?.aborted) return null

      const rows = this.readMountedVirtualRows(container, this.apiOutlineData)
      if (rows.length === 0) return null

      const firstKey = rows[0].key
      const lastKey = rows[rows.length - 1].key
      if (position < firstKey) {
        hi = mid
      } else if (position > lastKey) {
        lo = mid
      } else {
        // 目标落在窗口区间内却未挂载：等几拍排除挂载滞后
        for (let wait = 0; wait < 3; wait += 1) {
          await this.sleep(VIRTUAL_ROW_PROBE_SETTLE_MS)
          const mounted = findRow()
          if (mounted) return mounted
        }
        return null
      }
      if (hi - lo <= 2) return null

      mid = Math.round((lo + hi) / 2)
      container.scrollTop = mid
      container.dispatchEvent(new Event("scroll", { bubbles: true }))
      container.getBoundingClientRect()
      await this.sleep(VIRTUAL_ROW_PROBE_SETTLE_MS)
    }

    return findRow()
  }

  /** 读取挂载窗口内的消息行：key 为分支位置序号，top 为视口坐标 */
  private readMountedVirtualRows(
    container: HTMLElement,
    data: GrokHistoryOutlineData | null,
  ): { key: number; top: number }[] {
    const rows: { key: number; top: number }[] = []
    if (!data) return rows
    container.querySelectorAll(this.config.sitePrivateSelectors.responseRoot).forEach((element) => {
      const position = data.positionByResponseId.get(element.id.slice(RESPONSE_ID_PREFIX.length))
      if (position === undefined) return
      rows.push({ key: position, top: element.getBoundingClientRect().top })
    })
    return rows.sort((a, b) => a.key - b.key)
  }

  // ==================== 虚拟滚动会话 ====================

  override async waitForVirtualListEdge(
    edge: "start" | "end",
    signal?: AbortSignal,
  ): Promise<boolean> {
    return settleVirtualScroll(
      () => this.getScrollContainer(),
      (container) => this.isVirtualEdgeSettled(container, edge),
      (container) => alignScrollTop(container, edge === "start" ? 0 : container.scrollHeight),
      signal,
    )
  }

  private isVirtualEdgeSettled(container: HTMLElement, edge: "start" | "end"): boolean {
    const rows = Array.from(container.querySelectorAll("[data-plane-row]"))
    if (rows.length === 0) return true

    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
    if (edge === "start") {
      if (container.scrollTop > 40) return false
      // 最上方挂载行的 translateY 贴近 0 才算真正到顶
      const firstOffset = Math.min(...rows.map((row) => this.readRowTranslateY(row)))
      return firstOffset <= 80
    }

    if (maxScroll <= 40) return true
    if (container.scrollTop < maxScroll - 80) return false
    const containerRect = container.getBoundingClientRect()
    return rows.some((row) => {
      const rect = row.getBoundingClientRect()
      return rect.bottom > containerRect.top + 1 && rect.top < containerRect.bottom - 1
    })
  }

  private readRowTranslateY(row: Element): number {
    const style = row instanceof HTMLElement ? row.style.transform || "" : ""
    const match = /translateY\(\s*([-\d.]+)px\s*\)/.exec(style)
    if (!match) return 0
    const value = Number(match[1])
    return Number.isFinite(value) ? value : 0
  }

  override isVirtualScrollConversation(): boolean {
    const container = this.getScrollContainer()
    if (!container) return false
    return container.querySelector("[data-plane-row]") !== null
  }

  /**
   * 高亮估算快照：以当前挂载窗口的分支位置序号做锚点，行顶、行底各记一个点；
   * 边界取分支消息总数与最大 scrollTop（与大纲高亮同一内容坐标系）。
   */
  override getVirtualOutlinePositionSnapshot(): VirtualOutlinePositionSnapshot | null {
    const container = this.getScrollContainer()
    if (!container || !this.isVirtualScrollConversation()) return null
    const data = this.apiOutlineData
    if (!data || data.sessionId !== this.getSessionId()) return null

    const containerRect = container.getBoundingClientRect()
    const anchors: VirtualPositionAnchor[] = []
    container.querySelectorAll(this.config.sitePrivateSelectors.responseRoot).forEach((element) => {
      const position = data.positionByResponseId.get(element.id.slice(RESPONSE_ID_PREFIX.length))
      if (position === undefined) return
      const rect = element.getBoundingClientRect()
      const top = rect.top - containerRect.top + container.scrollTop
      anchors.push({ index: position, top })
      anchors.push({ index: position + 1, top: top + rect.height })
    })
    if (anchors.length === 0) return null

    return {
      anchors,
      bounds: {
        endSlot: data.branchMessageIds.length,
        endTop: Math.max(0, container.scrollHeight - container.clientHeight),
      },
    }
  }

  override getVirtualOutlineRowIndex(item: OutlineItem): number | null {
    const data = this.apiOutlineData
    if (!data || data.sessionId !== this.getSessionId()) return null

    const ref = item.navigationId || item.id
    const headingRef = this.parseApiOutlineItemId(ref)
    if (headingRef) return headingRef.messageIndex
    const queryIndex = this.parseApiUserQueryItemId(ref)
    if (queryIndex !== null) return queryIndex

    return this.getMountedRowMessageIndex(item.element)
  }

  /**
   * 虚拟滚动会话的阅读锚点：行身份用 responseId（uuid），跨编辑/重排稳定。
   * 像素与窗口序号都不是全局位置，不存。
   */
  override getVirtualAnchorElement(): AnchorData | null {
    if (!this.isVirtualScrollConversation()) return null
    const data = this.apiOutlineData
    if (!data || data.sessionId !== this.getSessionId()) {
      // 接口数据只在大纲面板激活时随 extractOutline 加载；用户未开面板时
      // 这里补一次触发（内部有冷却/单飞闸门），让后续保存能拿到分支位置
      this.maybeRefreshApiOutline()
      return null
    }
    const container = this.getScrollContainer()
    if (!container) return null

    const rows: { responseId: string; top: number; element: Element }[] = []
    container.querySelectorAll(this.config.sitePrivateSelectors.responseRoot).forEach((element) => {
      const responseId = element.id.slice(RESPONSE_ID_PREFIX.length)
      if (!data.positionByResponseId.has(responseId)) return
      rows.push({ responseId, top: element.getBoundingClientRect().top, element })
    })
    if (rows.length === 0) return null
    rows.sort((a, b) => a.top - b.top)

    // 视口上沿那条已挂载的行
    const containerRect = container.getBoundingClientRect()
    const viewportLine = containerRect.top + 100
    let best = rows[0]
    for (const row of rows) {
      if (row.top <= viewportLine && row.top > best.top) {
        best = row
      }
    }

    const rowTop = best.top - containerRect.top + container.scrollTop
    return {
      type: "virtual-row",
      rowKey: best.responseId,
      offset: container.scrollTop - rowTop,
      textSignature: (best.element.textContent || "").trim().substring(0, 50),
    }
  }

  override async restoreVirtualAnchor(anchor: AnchorData, signal?: AbortSignal): Promise<boolean> {
    if (anchor.type !== "virtual-row" || typeof anchor.rowKey !== "string") return false
    const responseId = anchor.rowKey
    const offset = anchor.offset || 0

    // 虚拟窗口的挂载晚于会话 id 就绪，冷加载可能要数秒，有界等待其出现；
    // 期间用户主动滚动会通过 signal 中止等待
    const deadline = Date.now() + 10000
    while (!this.isVirtualScrollConversation()) {
      if (signal?.aborted) return false
      if (Date.now() >= deadline) {
        console.warn("[Ophel] Reading history restore skipped: Grok message list not ready")
        return false
      }
      await this.sleep(100)
    }

    const container = this.getScrollContainer()
    if (!container) return false

    // 等站点自己的开场滚动（自动去底部、渲染引发的调整）安静下来再动手，
    // 否则恢复期间会被站点反复拽走，永远无法落定
    const quiet = await waitForVirtualScrollQuiet(() => this.getScrollContainer(), signal)
    if (signal?.aborted) return false
    if (!quiet) {
      console.warn("[Ophel] Reading history restore skipped: Grok page kept scrolling")
      return false
    }

    // responseId 本身不含位置信息，滚动估计需要接口缓存的分支位置
    const data = await this.ensureApiOutlineData(signal)
    if (!data || signal?.aborted) return false
    const position = data.positionByResponseId.get(responseId)
    if (position === undefined) {
      console.warn("[Ophel] Reading history restore skipped: Grok message not found", responseId)
      return false
    }

    const row = await this.probeMountVirtualRow(responseId, position, container, data, null, signal)
    if (signal?.aborted) return false
    if (!row) {
      console.warn("[Ophel] Reading history restore skipped: Grok message not found", responseId)
      return false
    }

    // key 是 responseId，天然稳定；文本签名兜底防极端错位
    if (anchor.textSignature) {
      const current = (row.textContent || "").trim().substring(0, 50)
      if (current !== anchor.textSignature) {
        console.warn(
          "[Ophel] Reading history restore skipped: Grok message content changed",
          responseId,
        )
        return false
      }
    }

    const findRow = (c: HTMLElement) => c.querySelector(`[id="response-${responseId}"]`)
    const docTop = (c: HTMLElement, el: Element) => {
      const cRect = c.getBoundingClientRect()
      const rRect = el.getBoundingClientRect()
      return rRect.top - cRect.top + c.scrollTop
    }

    // 落定判定用「行相对容器顶部的视觉位置」而不是 scrollTop 像素：刷新后页面仍在
    // 渲染，文档高度在漂，像素值几秒内稳定不下来；视觉位置才是保存 offset 的本义
    const samples: string[] = []
    let lastAlignedTop: number | null = null
    const isAligned = (c: HTMLElement) => {
      const target = findRow(c)
      if (!target) {
        samples.push("row-unmounted")
        return false
      }
      const visualOffset = target.getBoundingClientRect().top - c.getBoundingClientRect().top
      samples.push(`vo=${Math.round(visualOffset + offset)} st=${Math.round(c.scrollTop)}`)
      return Math.abs(visualOffset + offset) <= 24
    }
    const settled = await settleVirtualScroll(
      () => this.getScrollContainer(),
      isAligned,
      (c) => {
        // 上一拍对准之后 scrollTop 又被改动：站点自己的滚动在与恢复竞争
        if (lastAlignedTop !== null && Math.abs(c.scrollTop - lastAlignedTop) > 2) {
          samples.push(`external-scroll=${Math.round(c.scrollTop)}`)
        }
        const target = findRow(c)
        if (target) {
          alignScrollTop(c, docTop(c, target) + offset)
          lastAlignedTop = c.scrollTop
        }
      },
      signal,
      { timeoutMs: 4000 },
    )
    if (settled || signal?.aborted) return settled

    // 收敛失败但行仍在目标附近（渲染抖动导致始终差几像素）则接受现状；
    // 行已不在 DOM（被站点拽走）才算失败
    const finalContainer = this.getScrollContainer()
    const finalRow = finalContainer ? findRow(finalContainer) : null
    if (finalContainer && finalRow) {
      const visualOffset =
        finalRow.getBoundingClientRect().top - finalContainer.getBoundingClientRect().top
      if (Math.abs(visualOffset + offset) <= 240) {
        console.warn(
          "[Ophel] Reading history restore accepted with loose alignment",
          samples.slice(-12),
        )
        return true
      }
    }
    console.warn(
      "[Ophel] Reading history restore incomplete: Grok scroll did not settle",
      samples.slice(-12),
    )
    return false
  }

  /** 阅读历史恢复链路用：有界等待接口大纲数据就绪（按需触发一次拉取） */
  private async ensureApiOutlineData(signal?: AbortSignal): Promise<GrokHistoryOutlineData | null> {
    const sessionId = this.getSessionId()
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      if (signal?.aborted) return null
      const data = this.apiOutlineData
      if (data && data.sessionId === sessionId) return data
      // 连续解析失败已熔断，等下去也不会再有数据
      if (this.apiOutlineFailures >= API_OUTLINE_PARSE_FAILURE_LIMIT) return null
      if (!this.apiOutlineFetchPromise) {
        this.maybeRefreshApiOutline()
      }
      await this.sleep(100)
    }
    return this.apiOutlineData?.sessionId === sessionId ? this.apiOutlineData : null
  }

  // ==================== 生成状态检测 ====================

  isGenerating(): boolean {
    for (const selector of this.config.generating.existsSelectors) {
      const indicator = document.querySelector(selector)
      if (indicator && (indicator as HTMLElement).offsetParent !== null) {
        return true
      }
    }

    return false
  }

  getStopButtonSelectors(): string[] {
    return [...this.config.selectors.stopButton]
  }

  getModelName(): string | null {
    const modelBtn = document.querySelector(
      this.config.modelSwitcher.selectorButtonSelectors.join(", "),
    )
    if (modelBtn) {
      const span = modelBtn.querySelector(this.config.sitePrivateSelectors.modelName)
      if (span) {
        return span.textContent?.trim() || null
      }
      return modelBtn.textContent?.trim() || null
    }
    return null
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig | null {
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

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    const { selectorButtonSelectors, menuItemSelector, subMenuTriggers, ...config } =
      this.config.modelSwitcher
    return {
      ...config,
      targetModelKeyword: keyword,
      selectorButtonSelectors: [...selectorButtonSelectors],
      menuItemSelector,
      ...(subMenuTriggers ? { subMenuTriggers: [...subMenuTriggers] } : {}),
    }
  }

  /**
   * 覆盖点击模拟方法
   * Grok 使用 Radix UI，需要完整的 PointerEvent 序列才能触发菜单
   */
  protected simulateClick(element: HTMLElement): void {
    const eventTypes = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]
    let dispatched = false
    for (const type of eventTypes) {
      try {
        if (typeof PointerEvent === "function") {
          element.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 1,
            }),
          )
        } else {
          element.dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
            }),
          )
        }
        dispatched = true
      } catch {
        try {
          element.dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
            }),
          )
          dispatched = true
        } catch {
          // ignore and fallback below
        }
      }
    }

    if (!dispatched) {
      element.click()
    }
  }

  // ==================== 主题切换 ====================

  /**
   * 切换 Grok 主题
   * Grok 使用 localStorage("theme") 和 document.documentElement.classList 控制主题
   * 注意：不要向当前文档派发合成 storage 事件，Grok 会响应它并把主题回弹为内部状态，
   * 与 ThemeManager 的宿主监听形成回写循环导致页面卡死；真实 setItem 已会通知其他标签页。
   * @param targetMode 目标主题模式
   */
  async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
    try {
      // 更新 localStorage
      localStorage.setItem("theme", targetMode)

      // 更新 document.documentElement 的类
      document.documentElement.classList.remove("light", "dark")
      document.documentElement.classList.add(targetMode)

      // 更新 color-scheme
      document.documentElement.style.colorScheme = targetMode

      return true
    } catch (error) {
      console.error("[GrokAdapter] toggleTheme error:", error)
      return false
    }
  }
}
