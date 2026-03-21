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
import { htmlToMarkdown } from "~utils/exporter"

import {
  SiteAdapter,
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type SiteDeleteConversationResult,
} from "./base"

const DEFAULT_TITLE = "Grok"
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

export class GrokAdapter extends SiteAdapter {
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

  getThemeColors(): { primary: string; secondary: string } {
    // Grok 官方主题色
    return { primary: "#f39c12", secondary: "#1e1f22" }
  }

  getNewTabUrl(): string {
    return "https://grok.com/"
  }

  isNewConversation(): boolean {
    const path = window.location.pathname
    // 根路径是新对话页面
    return path === "/" || path === ""
  }

  // 缓存弹窗中的会话数据（用于同步时弹窗已关闭的情况）
  private cachedDialogConversations: Map<string, ConversationInfo> | null = null

  private reloadScheduled = false

  async loadAllConversations(): Promise<void> {
    const sidebar = document.querySelector('[data-sidebar="content"]')
    if (!sidebar) return

    // 使用 CSS 类特征定位"查看全部"按钮，避免依赖文本
    // 特征：button, w-full, justify-start, text-xs, text-secondary
    // 这些 Tailwind 类名描述了按钮的视觉样式（全宽、左对齐、小字体、次要颜色），相对稳定
    const viewAllBtn = sidebar.querySelector(
      "button.w-full.justify-start.text-xs.text-secondary.font-semibold",
    )

    if (viewAllBtn) {
      // 显示同步提示
      const { showToast } = await import("~utils/toast")
      const { t } = await import("~utils/i18n")
      showToast(t("grokSyncingConversations") || "正在同步会话，请稍候...")
      ;(viewAllBtn as HTMLElement).click()

      // 轮询等待对话框出现（最多 3 秒）
      let cmdkList: Element | null = null
      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        cmdkList = document.querySelector('[cmdk-list-sizer=""], [cmdk-list]')
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

    // 扫描所有 cmdk 对话框中的会话链接
    const allLinks = document.querySelectorAll('a[href^="/c/"]')
    allLinks.forEach((link) => {
      if (this.isCmdkActionItem(link)) return

      const href = link.getAttribute("href")
      if (!href) return

      const id = this.extractConversationIdFromHref(href)
      if (!id) return
      if (cache.has(id)) return

      let title = "New Chat"
      let isActive = false
      const isPinned = false

      // 识别 cmdk 对话框项
      const cmdkItem = link.closest("[cmdk-item]")
      if (cmdkItem) {
        const titleSpan = cmdkItem.querySelector("span.truncate")
        title = titleSpan?.textContent?.trim() || title
        isActive = cmdkItem.querySelector('[class*="border-border-l2"]') !== null
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

    // 1. 优先扫描侧边栏（获取置顶状态）
    const sidebar = document.querySelector('[data-sidebar="content"]')
    if (sidebar) {
      const groups = sidebar.querySelectorAll('[data-sidebar="group"]')
      groups.forEach((group) => {
        // 侧边栏中的链接
        const links = group.querySelectorAll('a[href^="/c/"]')
        if (links.length === 0) return

        links.forEach((link) => {
          const href = link.getAttribute("href")
          if (!href) return

          const id = this.extractConversationIdFromHref(href)
          if (!id) return
          // 侧边栏标题提取：a > span
          const titleSpan = link.querySelector("span.flex-1, span.truncate, span")
          const title = titleSpan?.textContent?.trim() || link.textContent?.trim() || "New Chat"
          const isActive = link.classList.contains("bg-button-ghost-hover")
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
    const allLinks = document.querySelectorAll('a[href^="/c/"]')
    allLinks.forEach((link) => {
      if (this.isCmdkActionItem(link)) return

      const href = link.getAttribute("href")
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
      const cmdkItem = link.closest("[cmdk-item]")
      if (cmdkItem) {
        // 对话框标题提取：cmdk-item 内部查找
        const titleSpan = cmdkItem.querySelector("span.truncate")
        title = titleSpan?.textContent?.trim() || title
        // 对话框激活状态：检查 current 标签
        isActive = cmdkItem.querySelector('[class*="border-border-l2"]') !== null
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
    // 侧边栏内容区域使用 data-sidebar="content" 属性
    return document.querySelector('[data-sidebar="content"]')
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    return {
      // 同时匹配侧边栏和 cmdk 对话框中的会话链接
      // - 侧边栏：[data-sidebar="content"] a[href^="/c/"]
      // - 对话框：[cmdk-item][data-value^="conversation:"] a[href^="/c/"]
      selector:
        '[data-sidebar="content"] a[href^="/c/"], [cmdk-item][data-value^="conversation:"] a[href^="/c/"]',
      shadow: false,
      extractInfo: (el: Element) => {
        const href = el.getAttribute("href")
        if (!href) return null
        const id = this.extractConversationIdFromHref(href)
        if (!id) return null

        // 判断来源：侧边栏还是对话框
        const isFromSidebar = !!el.closest('[data-sidebar="content"]')
        const isFromCmdk = !!el.closest("[cmdk-item]")

        let title = ""
        let isPinned = false

        if (isFromSidebar) {
          const titleSpan = el.querySelector("span.flex-1, span.truncate, span")
          title = titleSpan?.textContent?.trim() || el.textContent?.trim() || ""
          // 通过左侧置顶图标判断（未置顶项没有 icon）
          isPinned = this.isPinnedSidebarConversation(el)
        } else if (isFromCmdk) {
          const cmdkItem = el.closest("[cmdk-item]")
          const titleSpan = cmdkItem?.querySelector("span.truncate")
          title = titleSpan?.textContent?.trim() || ""
          isPinned = false // 对话框中无法判断置顶
        }

        return { id, title, url: href, isPinned }
      },
      getTitleElement: (el: Element) => {
        // 优先从对话框 cmdk-item 中找
        const cmdkItem = el.closest("[cmdk-item]")
        if (cmdkItem) {
          return cmdkItem.querySelector("span.truncate") || el
        }
        // 否则从侧边栏找
        return el.querySelector("span.flex-1, span.truncate, span") || el
      },
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    if (url) {
      window.location.href = url
      return true
    }
    // 使用正确的 /c/ 路径格式
    window.location.href = `/c/${id}`
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
    const sidebar = document.querySelector('[data-sidebar="content"]')
    if (!sidebar) return null

    return sidebar.querySelector(
      "button.w-full.justify-start.text-xs.text-secondary.font-semibold",
    ) as HTMLElement | null
  }

  private getCmdkListElement(): HTMLElement | null {
    return document.querySelector('[cmdk-list-sizer=""], [cmdk-list]') as HTMLElement | null
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
    const selector = [`a[href="/c/${id}"]`, `a[href$="/c/${id}"]`, `a[href*="/c/${id}?"]`].join(
      ", ",
    )

    const elements = Array.from(document.querySelectorAll(selector)) as HTMLAnchorElement[]
    return elements.filter(
      (element) => this.extractConversationIdFromHref(element.getAttribute("href")) === id,
    )
  }

  private getConversationItemContainer(anchor: HTMLAnchorElement): HTMLElement {
    const candidates = [
      anchor.closest("[cmdk-item]"),
      anchor.closest('[data-sidebar="menu-button"]'),
      anchor.closest('[data-sidebar="menu-item"]'),
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
    const maybeContainers = [
      item.parentElement,
      item.closest("[cmdk-item]"),
      item.closest('[role="dialog"]'),
      item.closest("[cmdk-root]"),
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
      element.querySelectorAll("svg, path, use, [data-icon], [class*='icon'], [aria-label]"),
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

    const match = href.match(/\/c\/([a-zA-Z0-9-]+)/)
    return match ? match[1] : null
  }

  private isPinnedSidebarConversation(element: Element): boolean {
    if (!element.closest('[data-sidebar="content"]')) return false

    const anchor = element.closest('a[href^="/c/"]') ?? element
    if (!this.hasPinnedIcon(anchor)) return false

    const item = anchor.closest('[data-sidebar="menu-item"]')
    const menu = anchor.closest('[data-sidebar="menu"]')
    if (!item || !menu) return true

    return this.isPinnedSectionItem(item)
  }

  private hasPinnedIcon(anchor: Element): boolean {
    const icon = anchor.querySelector('[data-sidebar="icon"] svg')
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
      if (!sibling.matches('[data-sidebar="menu-item"]')) {
        return false
      }
      sibling = sibling.previousElementSibling
    }
    return true
  }

  private isCmdkActionItem(element: Element): boolean {
    const cmdkItem = element.closest("[cmdk-item]")
    if (!cmdkItem) return false

    const itemValue = (cmdkItem.getAttribute("data-value") || "").toLowerCase()
    if (itemValue.startsWith("action:")) return true

    const group = cmdkItem.closest("[cmdk-group]")
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

  getSessionName(): string | null {
    // 从页面标题获取
    const title = document.title
    if (title && title !== DEFAULT_TITLE) {
      return title.replace(` - ${DEFAULT_TITLE}`, "").trim()
    }
    return super.getSessionName()
  }

  getConversationTitle(): string | null {
    // 尝试从页面标题获取
    const title = document.title
    if (title && title !== DEFAULT_TITLE) {
      return title.replace(` - ${DEFAULT_TITLE}`, "").trim()
    }
    return null
  }

  getNewChatButtonSelectors(): string[] {
    // 新对话按钮通常在侧边栏顶部
    return [
      'a[href="/"]',
      '[data-sidebar="header"] a',
      'button[aria-label*="新"]',
      'button[aria-label*="New"]',
    ]
  }

  getLatestReplyText(): string | null {
    // AI 回复：没有 rounded-br-lg 的 .message-bubble（用户消息有此类）
    const aiMessages = document.querySelectorAll(".message-bubble:not(.rounded-br-lg)")
    if (aiMessages.length === 0) return null

    // 获取最后一个 AI 回复
    const lastMessage = aiMessages[aiMessages.length - 1]

    // 从 .response-content-markdown 提取内容
    const contentContainer = lastMessage.querySelector(".response-content-markdown")
    if (contentContainer) {
      const clone = contentContainer.cloneNode(true) as HTMLElement
      clone
        .querySelectorAll('button, [role="button"], svg, [aria-hidden="true"]')
        .forEach((node) => node.remove())

      const markdown = htmlToMarkdown(clone).trim()
      if (markdown) {
        return markdown
      }

      return this.extractTextWithLineBreaks(clone)
    }

    return this.extractTextWithLineBreaks(lastMessage)
  }

  // ==================== 页面宽度控制 ====================

  // ==================== 页面宽度控制 ====================

  getWidthSelectors() {
    // Grok 使用 CSS 变量 --content-max-width 控制主内容区域宽度
    // 该变量定义在包含响应式断点的容器上
    return [
      {
        selector: '[class*="--content-max-width"]',
        property: "--content-max-width",
      },
    ]
  }

  getUserQueryWidthSelectors() {
    // Grok 用户消息气泡使用 .message-bubble.rounded-br-lg 类
    // 默认有 max-w-[100%] 和响应式 @sm/mainview:max-w-[90%]
    return [
      {
        selector: ".message-bubble.rounded-br-lg",
        property: "max-width",
      },
    ]
  }

  // ==================== 输入框操作 ====================

  getTextareaSelectors(): string[] {
    // Grok 使用 Tiptap 富文本编辑器
    return [
      ".tiptap.ProseMirror[contenteditable='true']",
      '[contenteditable="true"].ProseMirror',
      ".query-bar [contenteditable='true']",
      "form [contenteditable='true']",
    ]
  }

  getSubmitButtonSelectors(): string[] {
    // 发送按钮是 type="submit" 的按钮
    return [
      'button[type="submit"]',
      'form button[type="submit"]',
      '.query-bar button[type="submit"]',
    ]
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
    const main = document.querySelector("main")
    if (main) {
      // 查找可滚动的子元素
      const scrollable = main.querySelector('[class*="overflow-auto"]') as HTMLElement
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
      '[class*="overflow-y-auto"], [class*="overflow-auto"]',
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
    return "main"
  }

  getChatContentSelectors(): string[] {
    // 消息内容使用 prose 类名
    return ['[class*="prose"]', '[dir="ltr"]']
  }

  // ==================== 大纲提取 ====================

  getUserQuerySelector(): string {
    // 用户消息气泡特征：.message-bubble 且有右下角圆角 rounded-br-lg
    // 这是区分用户消息和 AI 消息的关键特征
    return ".message-bubble.rounded-br-lg"
  }

  extractUserQueryText(element: Element): string {
    return this.extractTextWithLineBreaks(element)
  }

  extractUserQueryMarkdown(element: Element): string {
    // Grok 用户消息结构：
    // .message-bubble.rounded-br-lg > div.relative > div.relative > .response-content-markdown
    // 内部直接是 <p> 标签，需要提取文本并还原 Markdown
    const markdownContainer = element.querySelector(".response-content-markdown")
    if (markdownContainer) {
      // 提取所有 <p> 标签的文本，用换行连接
      const paragraphs = markdownContainer.querySelectorAll("p")
      if (paragraphs.length > 0) {
        return Array.from(paragraphs)
          .map((p) => p.textContent?.trim() || "")
          .filter((text) => text.length > 0)
          .join("\n\n")
      }
    }
    return element.textContent?.trim() || ""
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    // Grok 用户消息结构：
    // .message-bubble.rounded-br-lg > div.relative > div.relative > .response-content-markdown
    // 内部直接是 <p> 标签，没有 .whitespace-pre-wrap 容器
    const markdownContainer = element.querySelector(".response-content-markdown")
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
    // 配置导出功能
    // 注意：这里的选择器是基于推测的，后续可能需要根据实际 DOM 调整
    return {
      userQuerySelector: this.getUserQuerySelector(),
      // AI 回复：没有 rounded-br-lg 的 .message-bubble（用户消息有此类）
      assistantResponseSelector: ".message-bubble:not(.rounded-br-lg) .response-content-markdown",
      turnSelector: "", // 不使用 turn 选择器，直接通过 user/assistant 选择器匹配
      useShadowDOM: false,
    }
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const outline: OutlineItem[] = []
    const container = document.querySelector(this.getResponseContainerSelector())
    if (!container) return outline

    // 辅助：获取消息 ID (Response ID)
    const getResponseId = (el: Element): string | null => {
      // 往上找 id 以 response- 开头的 div
      const responseDiv = el.closest('[id^="response-"]')
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
      const parentContainer = startEl.closest('[id^="response-"]')
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
        const aiMessage = current.querySelector(".message-bubble:not(.rounded-br-lg)")
        if (aiMessage) {
          const markdownContent = aiMessage.querySelector(".response-content-markdown")
          if (markdownContent) {
            totalLength += markdownContent.textContent?.trim().length || 0
          }
        }

        current = current.nextElementSibling
      }

      // Fallback：如果没有找到任何内容（可能是最后一条消息正在生成中）
      // 尝试从整个 container 中查找跟在当前用户消息之后的 AI 回复
      if (totalLength === 0) {
        const allAiMessages = container.querySelectorAll(".message-bubble:not(.rounded-br-lg)")
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

          const markdownContent = aiMsg.querySelector(".response-content-markdown")
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
            const responseContainer = heading.closest('[id^="response-"]')
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

            const responseContainer = element.closest('[id^="response-"]')
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
    // 检查是否有停止按钮可见
    const stopButton = document.querySelector(
      'button[aria-label*="停止"], button[aria-label*="Stop"]',
    )
    if (stopButton && (stopButton as HTMLElement).offsetParent !== null) {
      return true
    }

    // 检查是否有加载动画
    const loading = document.querySelector('[class*="loading"], [class*="animate-pulse"]')
    if (loading && (loading as HTMLElement).offsetParent !== null) {
      return true
    }

    return false
  }

  getModelName(): string | null {
    // 使用稳定的模型选择器按钮 ID
    const modelBtn = document.querySelector("#model-select-trigger")
    if (modelBtn) {
      // 模型名称在按钮内部的 span 中
      const span = modelBtn.querySelector(".font-semibold")
      if (span) {
        return span.textContent?.trim() || null
      }
      return modelBtn.textContent?.trim() || null
    }
    return null
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig | null {
    // 精准匹配 Grok 的流式 API 路径
    // 接口格式：/rest/app-chat/conversations/{id}/responses
    // 该接口使用 NDJSON 流式输出，通过 isSoftStop: true 标记生成结束
    return {
      urlPatterns: ["rest/app-chat/conversations"],
      silenceThreshold: 500,
    }
  }

  // ==================== 模型锁定 ====================

  getDefaultLockSettings(): { enabled: boolean; keyword: string } {
    return { enabled: false, keyword: "" }
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: ["#model-select-trigger"],
      menuItemSelector: '[role="menuitem"], [role="option"]',
      checkInterval: 1000,
      maxAttempts: 15,
      menuRenderDelay: 500,
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
