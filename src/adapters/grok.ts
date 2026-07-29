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

import {
  SiteAdapter,
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

const PIN_ICON_PATH_SIGNATURES = [
  "M13 21L12 23L11 21V16H4.5V13.7129L4.65234 13.4697L6.95801 9.78027L6.41797 5.99512C6.11675 3.8866 7.75289 2 9.88281 2H14.1172C16.2471 2 17.8832 3.8866 17.582 5.99512L17.041 9.78027L19.5 13.7129V16H13V21Z",
].map((path) => path.replace(/\s+/g, ""))

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
  private config: GrokSiteConfig = GROK_CONFIG

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
    // 自有会话：/c/ID    分享会话：/share/ID
    return window.location.pathname.startsWith("/share/")
  }

  isUserConversationPage(): boolean {
    return !this.isSharePage() && /^\/c\/[^/?#]+(?:\/|$)/i.test(window.location.pathname)
  }

  // 缓存弹窗中的会话数据（用于同步时弹窗已关闭的情况）
  private cachedDialogConversations: Map<string, ConversationInfo> | null = null

  private exportUserAttachmentsByResponseId: Map<string, GrokUserAttachment[]> | null = null

  private reloadScheduled = false

  async loadAllConversations(): Promise<void> {
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

      // 在关闭弹窗之前，缓存弹窗中的所有会话
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

  /** 缓存弹窗中的会话数据 */
  private cacheDialogConversations(): void {
    const cache = new Map<string, ConversationInfo>()
    const conversation = this.config.conversation

    // 扫描所有 cmdk 对话框中的会话链接
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

  // ==================== 会话管理 ====================

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

    // 2. 扫描所有会话链接（补充对话框中的会话）
    // 这能捕获"查看全部"对话框中的会话，无论选择器细节如何
    const allLinks = document.querySelectorAll(conversation.itemSelector)
    allLinks.forEach((link) => {
      if (this.isCmdkActionItem(link)) return

      const href = link.getAttribute(conversation.idFrom.attr ?? "href")
      if (!href) return

      const id = this.extractConversationIdFromHref(href)
      if (!id) return
      if (conversationMap.has(id)) return // 已从侧边栏获取，跳过

      // 处理对话框（或其他位置）的会话
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

    // 3. 合并缓存的弹窗会话数据（用于弹窗已关闭但缓存未过期的情况）
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
    const { hide, rootClass, styles } = this.config.zenMode
    return {
      ...(hide ? { hide: [...hide] } : {}),
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
      // 同时匹配侧边栏和 cmdk 对话框中的会话链接
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
    if (url) {
      window.location.href = url
      return true
    }
    window.location.href = this.config.conversation.urlTemplate.replace(
      "{id}",
      encodeURIComponent(id),
    )
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
    // Grok 用户消息气泡使用 .message-bubble.rounded-br-lg 类
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
      editor.innerHTML = `<p>${content}</p>`
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
    // .message-bubble.rounded-br-lg > div.relative > div.relative > .response-content-markdown
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
    return null
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    _state: unknown,
  ): Promise<void> {
    this.exportUserAttachmentsByResponseId = null
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
    const messages = this.extractGrokExportMessages()
    return messages.length > 0 ? messages : null
  }

  async extractExportBundle(_context: ExportLifecycleContext): Promise<ExportBundle | null> {
    return this.createExportBundleFromMessages((collector) =>
      this.extractGrokExportMessages(collector),
    )
  }

  getAssistantMermaidSupportMode() {
    return "native" as const
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
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

        // 查找 AI 回复内容：没有 rounded-br-lg 的 message-bubble
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
        const allAiMessages = container.querySelectorAll(this.config.selectors.assistantResponse)
        for (const aiMsg of Array.from(allAiMessages)) {
          // 检查这个 AI 消息是否在 startEl 之后
          const positionToStart = startEl.compareDocumentPosition(aiMsg)
          const isAfterStart = positionToStart & Node.DOCUMENT_POSITION_FOLLOWING
          if (!isAfterStart) continue

          // 检查是否在下一个用户消息之前
          const nextUserQuery =
            startEl.parentElement?.nextElementSibling?.querySelector(userQuerySelector)
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

      // 触发 storage 事件以通知其他可能监听的代码
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "theme",
          newValue: targetMode,
          storageArea: localStorage,
        }),
      )

      return true
    } catch (error) {
      console.error("[GrokAdapter] toggleTheme error:", error)
      return false
    }
  }
}
