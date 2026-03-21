/**
 * Gemini Enterprise 适配器 (business.gemini.google)
 */
import { SITE_IDS } from "~constants"
import { DOMToolkit } from "~utils/dom-toolkit"
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

const GEMINI_ENTERPRISE_DELETE_REASON = {
  UI_FAILED: "delete_ui_failed",
  BATCH_ABORTED_AFTER_UI_FAILURE: "delete_batch_aborted_after_ui_failure",
} as const

const GEMINI_ENTERPRISE_DELETE_KEYWORDS = [
  "delete",
  "remove",
  "删除",
  "删掉",
  "移除",
  "supprimer",
  "eliminar",
  "löschen",
  "삭제",
  "削除",
  "hapus",
  "удал",
]

const GEMINI_ENTERPRISE_CANCEL_KEYWORDS = [
  "cancel",
  "取消",
  "annuler",
  "abbrechen",
  "취소",
  "キャンセル",
  "batal",
  "отмен",
]

export class GeminiEnterpriseAdapter extends SiteAdapter {
  // 存储 clearOnInit 配置
  private clearOnInit = false

  match(): boolean {
    return window.location.hostname.includes("business.gemini.google")
  }

  getSiteId(): string {
    return SITE_IDS.GEMINI_ENTERPRISE
  }

  getName(): string {
    return "Gemini Enterprise"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#4285f4", secondary: "#34a853" }
  }

  getNewTabUrl(): string {
    return "https://business.gemini.google"
  }

  isNewConversation(): boolean {
    return !window.location.pathname.includes("/session/")
  }

  /** 检测是否为分享页面 - Gemini Enterprise 特殊路径 */
  isSharePage(): boolean {
    // Gemini Enterprise 分享链接格式：/home/cid/{cid}/r/share/{id}
    return window.location.pathname.includes("/r/share/")
  }

  supportsTabRename(): boolean {
    return true
  }

  /** 获取当前的团队 CID */
  getCurrentCid(): string {
    const currentPath = window.location.pathname
    const cidMatch = currentPath.match(/\/home\/cid\/([^/]+)/)
    return cidMatch ? cidMatch[1] : ""
  }

  // ==================== 会话管理 ====================

  getSessionName(): string | null {
    const conversations = DOMToolkit.query(".conversation", {
      all: true,
      shadow: true,
    }) as Element[]

    for (const conv of conversations) {
      const button = conv.querySelector("button.list-item") || conv.querySelector("button")
      if (!button) continue

      const isActive =
        button.classList.contains("selected") ||
        button.classList.contains("active") ||
        button.getAttribute("aria-selected") === "true"

      if (isActive) {
        const titleEl = button.querySelector(".conversation-title")
        if (titleEl) {
          const name = titleEl.textContent?.trim()
          if (name) return name
        }
      }
    }

    return super.getSessionName()
  }

  getConversationTitle(): string | null {
    const items = DOMToolkit.query(".conversation", {
      all: true,
      shadow: true,
    }) as Element[]
    for (const el of items) {
      const button = el.querySelector("button.list-item") || el.querySelector("button")
      if (
        button &&
        (button.classList.contains("selected") || button.classList.contains("active"))
      ) {
        return button.querySelector(".conversation-title")?.textContent?.trim() || null
      }
    }
    return null
  }

  getConversationList(): ConversationInfo[] {
    const items = DOMToolkit.query(".conversation", {
      all: true,
      shadow: true,
    }) as Element[]
    const cid = this.getCurrentCid()

    return Array.from(items)
      .map((el) => {
        const button = el.querySelector("button.list-item") || el.querySelector("button")
        if (!button) return null

        // 从操作菜单按钮 ID 提取 Session ID
        // 会话格式: menu-8823153884416423953 (纯数字)
        // 智能体格式: menu-deep_research (包含字母/下划线)
        const menuBtn = button.querySelector(".conversation-action-menu-button")
        let id = ""
        if (menuBtn && menuBtn.id && menuBtn.id.startsWith("menu-")) {
          id = menuBtn.id.replace("menu-", "")
        }

        // 关键过滤：真正的会话 ID 是纯数字，智能体 ID 包含字母
        if (!id || !/^\d+$/.test(id)) return null

        const titleEl = button.querySelector(".conversation-title")
        const title = titleEl ? titleEl.textContent?.trim() || "" : ""

        const isActive =
          button.classList.contains("selected") ||
          button.classList.contains("active") ||
          button.getAttribute("aria-selected") === "true"

        // 构建完整 URL
        let url = `https://business.gemini.google/session/${id}`
        if (cid) {
          url = `https://business.gemini.google/home/cid/${cid}/r/session/${id}`
        }

        return {
          id,
          cid,
          title,
          url,
          isActive,
        }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null) as ConversationInfo[]
  }

  getLatestReplyText(): string | null {
    // 1. 找到 ucs-conversation 元素
    const ucsConversation = DOMToolkit.query("ucs-conversation", { shadow: true }) as Element | null
    if (!ucsConversation || !ucsConversation.shadowRoot) return null

    // 2. 在 Shadow Root 中查找 .main
    const main = ucsConversation.shadowRoot.querySelector(".main")
    if (!main) return null

    // 3. 查找所有轮次
    const turns = main.querySelectorAll(".turn")
    if (turns.length === 0) return null

    // 4. 获取最后一个轮次
    const lastTurn = turns[turns.length - 1]

    // 5. 查找 AI 回复容器 (ucs-summary)
    const ucsSummary = lastTurn.querySelector("ucs-summary")
    if (!ucsSummary) return null

    // 6. 提取 Markdown 文档元素
    const markdownDoc = this.extractSummaryContent(ucsSummary)
    if (!markdownDoc) {
      // 降级：直接提取文本
      return this.extractTextWithLineBreaks(ucsSummary)
    }

    const markdown = htmlToMarkdown(markdownDoc).trim()
    if (markdown) {
      return markdown
    }

    return this.extractTextWithLineBreaks(markdownDoc)
  }

  getSidebarScrollContainer(): Element | null {
    return (
      (DOMToolkit.query(".conversation-list", { shadow: true }) as Element) ||
      (DOMToolkit.query("mat-sidenav", { shadow: true }) as Element)
    )
  }

  getConversationObserverConfig(): ConversationObserverConfig {
    return {
      selector: ".conversation",
      shadow: true,
      extractInfo: (el) => {
        const button = el.querySelector("button.list-item") || el.querySelector("button")
        if (!button) return null

        // 从操作菜单按钮 ID 提取 Session ID（与 getConversationList 保持一致）
        const menuBtn = button.querySelector(".conversation-action-menu-button")
        if (!menuBtn || !menuBtn.id?.startsWith("menu-")) return null

        const id = menuBtn.id.replace("menu-", "")
        if (!/^\d+$/.test(id)) return null // 排除智能体（ID 包含字母）

        const titleEl = button.querySelector(".conversation-title")
        const title = titleEl?.textContent?.trim() || ""
        const cid = this.getCurrentCid()

        return {
          id,
          cid,
          title,
          url: `https://business.gemini.google/home/cid/${cid}/r/session/${id}`,
        }
      },
      getTitleElement: (el) => {
        const button = el.querySelector("button.list-item") || el.querySelector("button")
        return button?.querySelector(".conversation-title") || el
      },
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    // 通过菜单按钮 ID 查找侧边栏会话元素
    const conversations = DOMToolkit.query(".conversation", {
      all: true,
      shadow: true,
    }) as Element[] | null

    if (conversations) {
      for (const convEl of Array.from(conversations)) {
        const menuBtn =
          convEl.querySelector(`#menu-${id}`) ||
          convEl.querySelector(`.conversation-action-menu-button[id="menu-${id}"]`)
        if (menuBtn) {
          const btn = convEl.querySelector("button.list-item") || convEl.querySelector("button")
          if (btn) (btn as HTMLElement).click()
          else (convEl as HTMLElement).click()
          return true
        }
      }
    }
    // 降级：页面刷新
    return super.navigateToConversation(id, url)
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

      // Stop the remaining batch when UI deletion fails once,
      // to prevent accidental wrong-item deletions.
      if (!result.success && result.reason === GEMINI_ENTERPRISE_DELETE_REASON.UI_FAILED) {
        for (let i = index + 1; i < targets.length; i++) {
          results.push({
            id: targets[i].id,
            success: false,
            method: "none",
            reason: GEMINI_ENTERPRISE_DELETE_REASON.BATCH_ABORTED_AFTER_UI_FAILURE,
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
    const uiSuccess = await this.deleteConversationViaUi(target.id)
    return {
      id: target.id,
      success: uiSuccess,
      method: uiSuccess ? "ui" : "none",
      reason: uiSuccess ? undefined : GEMINI_ENTERPRISE_DELETE_REASON.UI_FAILED,
    }
  }

  private async deleteConversationViaUi(id: string): Promise<boolean> {
    const row = await this.findConversationRowWithRetry(id)
    if (!row) return false

    row.scrollIntoView({ block: "center", behavior: "auto" })
    this.revealConversationActions(row)

    const menuButton = await this.findConversationMenuButton(row)
    if (!menuButton) return false

    const menuRoot = await this.openConversationMenu(row, menuButton)
    if (!menuRoot) return false

    const deleteItem = await this.waitForDeleteMenuItem(menuButton, 2500, menuRoot)
    if (!deleteItem) {
      document.body.click()
      return false
    }
    this.simulateClick(deleteItem)

    // Optimistically remove current row from DOM to prevent observer from re-adding
    // the just-deleted item back into local store before remote UI finishes syncing.
    this.removeConversationRowElement(row, id)

    // Gemini Enterprise deletes immediately after clicking delete (no second confirm dialog).
    const removed = await this.waitForConversationRemoved(id, 5200)
    const menuClosed = await this.waitForMenuClosed(1200)
    const success = removed || menuClosed
    if (success) {
      this.syncConversationListAfterDelete(id)
    }
    return success
  }

  private async openConversationMenu(
    row: HTMLElement,
    initialTrigger: HTMLElement,
  ): Promise<HTMLElement | null> {
    let trigger: HTMLElement | null = initialTrigger

    for (let attempt = 0; attempt < 4; attempt++) {
      document.body.click()
      await this.sleep(60)
      this.revealConversationActions(row)

      if (!trigger || !trigger.isConnected) {
        trigger = await this.findConversationMenuButton(row)
      }
      if (!trigger) return null

      this.simulateClick(trigger)
      const menu = await this.waitForMenuOpen(trigger, 900)
      if (menu) return menu
    }

    return null
  }

  private async waitForMenuOpen(trigger: HTMLElement, timeout = 900): Promise<HTMLElement | null> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const controlled = this.getMenuContainerFromTrigger(trigger)
      if (controlled && this.isVisible(controlled)) return controlled

      const fallback = this.findVisibleMenuContainer()
      if (fallback) return fallback

      await this.sleep(80)
    }
    return null
  }

  private async findConversationRowWithRetry(id: string): Promise<HTMLElement | null> {
    const firstTry = this.findConversationRow(id)
    if (firstTry) return firstTry

    await this.loadAllConversations()
    await this.sleep(250)
    return this.findConversationRow(id)
  }

  private findConversationRow(id: string): HTMLElement | null {
    const expected = id.trim()
    const rows = this.findAllElementsBySelector(".conversation") as HTMLElement[]
    for (const row of rows) {
      const rowId = this.extractConversationIdFromElement(row)
      if (rowId && rowId === expected) {
        return row
      }
    }

    const hrefCandidates = [
      `a[href*="/session/${expected}"]`,
      `a[href$="/session/${expected}"]`,
      `a[href*="/r/session/${expected}"]`,
      `a[href$="/r/session/${expected}"]`,
    ]

    for (const selector of hrefCandidates) {
      const anchor = DOMToolkit.query(selector, { shadow: true }) as HTMLElement | null
      if (!anchor) continue
      const container = (anchor.closest(".conversation") ||
        anchor.closest("li") ||
        anchor.parentElement) as HTMLElement | null
      if (container) return container
    }

    return null
  }

  private extractConversationIdFromElement(element: Element | null): string {
    if (!element) return ""

    const menuBtn = element.querySelector(
      '.conversation-action-menu-button[id^="menu-"], button[id^="menu-"]',
    ) as HTMLElement | null
    if (!menuBtn?.id?.startsWith("menu-")) return ""

    const id = menuBtn.id.replace("menu-", "")
    return /^\d+$/.test(id) ? id : ""
  }

  private async findConversationMenuButton(row: HTMLElement): Promise<HTMLElement | null> {
    const actionSelectors = [
      ".conversation-action-menu-button",
      'button[id^="menu-"]',
      'button[aria-haspopup="menu"]',
      'button[aria-label*="More"]',
      'button[aria-label*="more"]',
      'button[aria-label*="更多"]',
      'button[title*="More"]',
      'button[title*="more"]',
      "button",
    ].join(", ")

    const rowId = this.extractConversationIdFromElement(row)

    for (let attempt = 0; attempt < 10; attempt++) {
      const scopes = this.getMenuSearchScopes(row)
      scopes.forEach((scope) => this.revealConversationActions(scope))

      const allCandidates = scopes.flatMap(
        (scope) => Array.from(scope.querySelectorAll(actionSelectors)) as HTMLElement[],
      )
      const candidates = allCandidates.filter((candidate) => {
        if (candidate instanceof HTMLButtonElement && candidate.disabled) return false
        return true
      })

      if (candidates.length > 0) {
        if (rowId) {
          const exact = candidates.find((candidate) => candidate.id === `menu-${rowId}`)
          if (exact) return exact
        }

        const menuIconCandidate = candidates.find((candidate) => {
          return (
            candidate.querySelector(
              'mat-icon[fonticon="more_vert"], mat-icon[fonticon="more_horiz"], md-icon',
            ) !== null
          )
        })
        if (menuIconCandidate) return menuIconCandidate

        const fallbackVisible = candidates
          .filter((candidate) => this.isVisible(candidate))
          .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0]
        if (fallbackVisible) return fallbackVisible
      }

      await this.sleep(90)
    }

    return null
  }

  private getMenuSearchScopes(row: HTMLElement): HTMLElement[] {
    const scopes = [
      row,
      row.parentElement,
      row.parentElement?.parentElement,
      row.closest("li"),
    ].filter((item): item is HTMLElement => item instanceof HTMLElement)

    const unique = new Set<HTMLElement>()
    const deduplicated: HTMLElement[] = []
    for (const scope of scopes) {
      if (unique.has(scope)) continue
      unique.add(scope)
      deduplicated.push(scope)
    }
    return deduplicated
  }

  private revealConversationActions(scope: HTMLElement): void {
    const events: Array<keyof GlobalEventHandlersEventMap> = [
      "mouseenter",
      "mouseover",
      "mousemove",
    ]

    for (const eventName of events) {
      scope.dispatchEvent(
        new MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      )
    }
  }

  private async waitForDeleteMenuItem(
    trigger: HTMLElement,
    timeout = 2500,
    menuRoot?: HTMLElement | null,
  ): Promise<HTMLElement | null> {
    const start = Date.now()
    let lastVisibleItems: HTMLElement[] = []

    while (Date.now() - start < timeout) {
      const candidates = this.getMenuActionCandidates(trigger, menuRoot || null)
      for (const item of candidates) {
        if (!this.isVisible(item)) continue

        const text = this.getSignalText(item)
        if (!this.hasKeyword(text, GEMINI_ENTERPRISE_DELETE_KEYWORDS)) continue
        if (this.hasKeyword(text, GEMINI_ENTERPRISE_CANCEL_KEYWORDS)) continue
        return item
      }

      const visibleItems = candidates.filter((item) => this.isVisible(item))
      if (visibleItems.length > 0) {
        lastVisibleItems = visibleItems
      }

      await this.sleep(80)
    }

    if (lastVisibleItems.length > 0) {
      const fallback = lastVisibleItems[lastVisibleItems.length - 1]
      const text = this.getSignalText(fallback)
      if (!this.hasKeyword(text, GEMINI_ENTERPRISE_CANCEL_KEYWORDS)) {
        return fallback
      }
    }

    return null
  }

  private getMenuActionCandidates(
    trigger: HTMLElement,
    menuRoot?: HTMLElement | null,
  ): HTMLElement[] {
    const selectors =
      'md-menu-item, [role="menuitem"], [role="menu"] button, .mat-mdc-menu-panel button'
    const results: HTMLElement[] = []

    if (menuRoot) {
      results.push(...(Array.from(menuRoot.querySelectorAll(selectors)) as HTMLElement[]))
    }

    const controlled = this.getMenuContainerFromTrigger(trigger)
    if (controlled) {
      results.push(...(Array.from(controlled.querySelectorAll(selectors)) as HTMLElement[]))
    }

    const visibleMenu = this.findVisibleMenuContainer()
    if (visibleMenu) {
      results.push(...(Array.from(visibleMenu.querySelectorAll(selectors)) as HTMLElement[]))
    }

    results.push(...(this.findAllElementsBySelector(selectors) as HTMLElement[]))

    const unique = new Set<HTMLElement>()
    const deduplicated: HTMLElement[] = []
    for (const item of results) {
      if (unique.has(item)) continue
      unique.add(item)
      deduplicated.push(item)
    }

    return deduplicated
  }

  private getMenuContainerFromTrigger(trigger: HTMLElement): HTMLElement | null {
    const controlledId = trigger.getAttribute("aria-controls") || trigger.getAttribute("aria-owns")
    if (!controlledId) return null

    const safeId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(controlledId)
        : controlledId
    return (DOMToolkit.query(`#${safeId}`, { shadow: true }) as HTMLElement | null) || null
  }

  private findVisibleMenuContainer(): HTMLElement | null {
    const menus = this.findAllElementsBySelector(
      'md-menu-surface, .menu[popover], .mat-mdc-menu-panel, [role="menu"]',
    ) as HTMLElement[]
    const visible = menus.filter((menu) => this.isVisible(menu))
    if (visible.length === 0) return null
    return visible[visible.length - 1]
  }

  private async waitForMenuClosed(timeout = 1200): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (!this.findVisibleMenuContainer()) return true
      await this.sleep(80)
    }
    return false
  }

  private removeConversationRowElement(row: HTMLElement, id: string): void {
    const candidates = [
      row,
      row.closest("li") as HTMLElement | null,
      this.findConversationRow(id),
    ].filter((item): item is HTMLElement => item instanceof HTMLElement)

    const unique = new Set<HTMLElement>()
    for (const candidate of candidates) {
      if (unique.has(candidate)) continue
      unique.add(candidate)
      if (candidate.isConnected) {
        candidate.remove()
      }
    }
  }

  private async waitForConversationRemoved(id: string, timeout = 5200): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (!this.findConversationRow(id)) return true
      await this.sleep(90)
    }
    return false
  }

  private syncConversationListAfterDelete(id: string): void {
    const row = this.findConversationRow(id)
    if (!row) return
    row.remove()
  }

  private scheduleFullReloadAfterDelete(deletedIds: string[]): void {
    if (deletedIds.length === 0) return

    const currentId = this.getCurrentConversationIdFromPath()
    if (currentId && deletedIds.includes(currentId)) {
      const cid = this.getCurrentCid()
      const fallback = cid ? `/home/cid/${cid}/r` : "/"
      try {
        window.history.replaceState(window.history.state, "", fallback)
      } catch {
        // ignore route state failures
      }
    }
  }

  private getCurrentConversationIdFromPath(): string | null {
    const match = window.location.pathname.match(/\/session\/([^/?#]+)/)
    return match?.[1] || null
  }

  private getSignalText(element: HTMLElement): string {
    return [
      element.textContent || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.getAttribute("data-test-id") || "",
      element.getAttribute("data-testid") || "",
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

  getNewChatButtonSelectors(): string[] {
    return [
      ".chat-button.list-item",
      'button[aria-label="New chat"]',
      'button[aria-label="新对话"]',
    ]
  }

  // ==================== 页面宽度控制 ====================

  getWidthSelectors() {
    // 辅助函数：生成带 scoped globalSelector 的配置
    const config = (selector: string, value?: string, extraCss?: string, noCenter = false) => ({
      selector,
      globalSelector: `mat-sidenav-content ${selector}`, // 全局样式只针对主内容区
      property: "max-width",
      value,
      extraCss,
      noCenter,
    })

    return [
      // 容器强制 100%，不需要居中（它们应该填充可用空间）
      config("mat-sidenav-content", "100%", undefined, true),
      config(".main.chat-mode", "100%", undefined, true),

      // 内容区域跟随配置（需要居中）
      config("ucs-summary"),
      config("ucs-conversation"),
      config("ucs-search-bar"),
      config(".summary-container.expanded"),
      config(".conversation-container"),

      // 输入框容器：不居中，使用 left/right 定位
      config(".input-area-container", undefined, "left: 0 !important; right: 0 !important;", true),
    ]
  }

  /** 用户问题宽度选择器（Shadow DOM 内部，需要高优先级覆盖 :host([spk2])）*/
  getUserQueryWidthSelectors() {
    return [
      {
        // 使用与原始样式相同的 :host([spk2]) 模式以获得相同优先级
        selector: ".question-block .question-wrapper",
        property: "max-width",
        noCenter: true,
      },
    ]
  }

  getZenModeSelectors() {
    return [{ selector: ".disclaimer", action: "hide" as const }]
  }

  // ==================== 输入框操作 ====================

  getTextareaSelectors(): string[] {
    return [
      "div.ProseMirror",
      ".ProseMirror",
      '[contenteditable="true"]:not([type="search"])',
      '[role="textbox"]',
      'textarea:not([type="search"])',
    ]
  }

  getSubmitButtonSelectors(): string[] {
    return [
      'button[aria-label*="Submit"]',
      'button[aria-label*="提交"]',
      'button[aria-label*="发送"]',
      'button[aria-label*="Send"]',
      ".send-button",
      '[data-testid*="send"]',
    ]
  }

  isValidTextarea(element: HTMLElement): boolean {
    // 排除搜索框
    if ((element as HTMLInputElement).type === "search") return false
    if (element.classList.contains("main-input")) return false
    if (element.getAttribute("aria-label")?.includes("搜索")) return false
    if ((element as HTMLInputElement).placeholder?.includes("搜索")) return false
    // 排除脚本自己的 UI
    if (element.classList.contains("prompt-search-input")) return false
    if (element.id === "prompt-search") return false
    if (element.closest(".gh-main-panel")) return false
    // 排除队列 overlay 及其他扩展 UI 的输入框
    if (element.closest(".gh-queue-panel")) return false
    if (
      Array.from(element.classList).some(
        (cls) => cls.startsWith("gh-queue-") || cls.startsWith("gh-"),
      )
    )
      return false

    // 必须是 contenteditable 或者 ProseMirror
    const isVisible = element.offsetParent !== null
    const isContentEditable = element.getAttribute("contenteditable") === "true"
    const isProseMirror = element.classList.contains("ProseMirror")
    return isVisible && (isContentEditable || isProseMirror || element.tagName === "TEXTAREA")
  }

  /** 覆盖基类：使用 DOMToolkit 在 Shadow DOM 中查找输入框 */
  findTextarea(): HTMLElement | null {
    const element = DOMToolkit.query(this.getTextareaSelectors(), {
      shadow: true,
      filter: (el) => this.isValidTextarea(el as HTMLElement),
    }) as HTMLElement | null

    if (element) {
      this.textarea = element
      return element
    }
    return super.findTextarea()
  }

  /** 覆盖基类：清空输入框（插入零宽字符修复中文输入首字母问题）*/
  clearTextarea(): void {
    if (!this.textarea) return
    if (!this.textarea.isConnected) {
      this.textarea = null
      return
    }

    this.textarea.focus()
    // Shadow DOM 场景：不做严格的焦点检查

    document.execCommand("selectAll", false, undefined)
    // 插入零宽空格替换旧内容（修复中文输入首字母问题）
    document.execCommand("insertText", false, "\u200B")
  }

  /** 普通清空（不插入零宽字符）*/
  clearTextareaNormal(): void {
    if (!this.textarea) return
    if (!this.textarea.isConnected) {
      this.textarea = null
      return
    }

    this.textarea.focus()
    document.execCommand("selectAll", false, undefined)
    document.execCommand("delete", false, undefined)
  }

  /** 覆盖基类：向输入框插入内容 */
  insertPrompt(content: string): boolean {
    // 重新获取一下，以防切页面后元素失效
    const editor = this.textarea || this.findTextarea()

    if (!editor) {
      console.warn("[GeminiEnterpriseAdapter] Editor not found during insert.")
      return false
    }

    if (!editor.isConnected) {
      this.textarea = null
      return false
    }

    this.textarea = editor
    editor.click()
    editor.focus()

    // 辅助：检查编辑器是否包含目标内容（排除零宽字符等）
    const hasContent = () => {
      const text = editor.textContent?.replace(/[\u200B\u200C\u200D\uFEFF]/g, "") || ""
      return text.includes(content)
    }

    // 第 1 步：尝试通过原生的 Paste 事件，这是欺骗复杂编辑器（ProseMirror、Draft.js）的绝佳途径
    try {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData("text/plain", content)
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      })

      editor.dispatchEvent(pasteEvent)

      if (hasContent()) {
        editor.dispatchEvent(new Event("input", { bubbles: true }))
        editor.dispatchEvent(new Event("change", { bubbles: true }))
        editor.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: " ", code: "Space" }),
        )
        editor.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " ", code: "Space" }))
        return true
      }
    } catch {
      // 忽略 Paste 失败
    }

    // 第 2 步：常规的 DOM execCommand 降级
    try {
      document.execCommand("selectAll", false, undefined)
      const success = document.execCommand("insertText", false, content)
      if (success && hasContent()) {
        editor.dispatchEvent(new Event("input", { bubbles: true }))
        editor.dispatchEvent(new Event("change", { bubbles: true }))
        return true
      }
    } catch {
      // execCommand 失败
    }

    // 第 3 步：beforeinput 事件（现代 ProseMirror 支持）
    try {
      editor.focus()
      const sel = editor.ownerDocument.getSelection()
      if (sel) {
        sel.selectAllChildren(editor)
        sel.collapseToEnd()
      }

      const beforeInputEvent = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: content,
      })
      editor.dispatchEvent(beforeInputEvent)

      const inputEvent = new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: content,
      })
      editor.dispatchEvent(inputEvent)

      if (hasContent()) {
        return true
      }
    } catch {
      // beforeinput 失败
    }

    // 第 4 步：直接操作 DOM（最后手段，ProseMirror 可能不认）
    try {
      let p = editor.querySelector("p")
      let isNewP = false
      if (!p) {
        p = document.createElement("p")
        editor.appendChild(p)
        isNewP = true
      }

      p.textContent = content

      if (isNewP || content) {
        editor.dispatchEvent(new Event("input", { bubbles: true }))
        editor.dispatchEvent(new Event("change", { bubbles: true }))
      }

      // 事件轰炸收尾
      editor.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: content,
        }),
      )
      editor.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " ", code: "Space" }))
      editor.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " ", code: "Space" }))
      editor.dispatchEvent(new Event("change", { bubbles: true }))

      if (hasContent()) {
        return true
      }
    } catch {
      // DOM 操作失败
    }

    // 所有策略都失败了
    console.warn("[GeminiEnterpriseAdapter] All insert strategies failed for content insertion.")
    return false
  }

  // ==================== 滚动容器 ====================

  getScrollContainer(): HTMLElement | null {
    // 使用 .chat-mode-scroller 精确选择器，排除侧边栏
    const container = DOMToolkit.query(".chat-mode-scroller", { shadow: true }) as HTMLElement

    if (container && container.scrollHeight > container.clientHeight) {
      return container
    }

    // 回退到基类
    return super.getScrollContainer()
  }

  getResponseContainerSelector(): string {
    return ".conversation-container"
  }

  getChatContentSelectors(): string[] {
    return [
      ".model-response-container",
      ".message-content",
      "[data-message-id]",
      "ucs-conversation-message", // 企业版特定
      ".conversation-message",
    ]
  }

  // ==================== 大纲提取 ====================

  /** Gemini Enterprise: .question-block 是用户提问的容器 */
  getUserQuerySelector(): string {
    return ".question-block"
  }

  /**
   * 从用户提问元素中提取文本
   * Gemini Enterprise: 文本在 ucs-fast-markdown 的 Shadow DOM 中
   */
  extractUserQueryText(element: Element): string {
    // 查找 ucs-fast-markdown 元素
    const markdown = element.querySelector("ucs-fast-markdown")
    if (!markdown || !markdown.shadowRoot) {
      return this.extractTextWithLineBreaks(element)
    }

    // 在 Shadow DOM 中查找完整文本
    const markdownDoc = markdown.shadowRoot.querySelector(".markdown-document")
    if (markdownDoc) {
      return this.extractTextWithLineBreaks(markdownDoc)
    }

    return this.extractTextWithLineBreaks(element)
  }

  /**
   * 从用户提问元素中提取原始 Markdown 文本
   * Gemini Enterprise：.markdown-document 内部每行是一个 <p> 标签
   * 需要按段落提取并用换行符连接还原原始 Markdown
   */
  extractUserQueryMarkdown(element: Element): string {
    const markdown = element.querySelector("ucs-fast-markdown")
    if (!markdown || !markdown.shadowRoot) {
      return element.textContent?.trimEnd() || ""
    }

    const markdownDoc = markdown.shadowRoot.querySelector(".markdown-document")
    if (!markdownDoc) {
      return element.textContent?.trimEnd() || ""
    }

    // 按段落（p 标签）提取，用换行符连接
    const paragraphs = markdownDoc.querySelectorAll("p")
    if (paragraphs.length === 0) {
      return markdownDoc.textContent?.trimEnd() || ""
    }

    const lines = Array.from(paragraphs).map((p) => p.textContent || "")
    return lines.join("\n").trimEnd()
  }

  /**
   * 将渲染后的 HTML 替换到用户提问元素中
   * Gemini Enterprise：在 Shadow DOM 中隐藏原内容并插入渲染容器
   */
  replaceUserQueryContent(element: Element, html: string): boolean {
    const markdown = element.querySelector("ucs-fast-markdown")
    if (!markdown || !markdown.shadowRoot) return false

    const markdownDoc = markdown.shadowRoot.querySelector(".markdown-document")
    if (!markdownDoc) return false

    // 检查是否已经处理过
    if (markdownDoc.nextElementSibling?.classList.contains("gh-user-query-markdown")) {
      return false
    }

    // 隐藏原内容
    ;(markdownDoc as HTMLElement).style.display = "none"

    // 创建渲染容器并插入到 Shadow DOM 中
    const rendered = document.createElement("div")
    rendered.className = "gh-user-query-markdown gh-markdown-preview"
    rendered.innerHTML = html

    markdownDoc.after(rendered)
    return true
  }

  /**
   * Gemini Enterprise 使用 Shadow DOM 渲染用户提问
   */
  usesShadowDOM(): boolean {
    return true
  }

  /**
   * 从 ucs-summary 元素中提取可用于 htmlToMarkdown 的 DOM 元素
   * Gemini Enterprise 使用多层 Shadow DOM，需要递归查找
   */
  extractSummaryContent(ucsSummary: Element): Element | null {
    const findMarkdownDocument = (root: Element | ShadowRoot, depth = 0): Element | null => {
      if (depth > 10 || !root) return null

      // 如果 root 本身有 shadowRoot，先进入它
      const shadowRoot = (root as Element).shadowRoot || (root.nodeType === 11 ? root : null)
      const searchRoot = shadowRoot || root

      // 在当前层级查找 .markdown-document
      if ("querySelector" in searchRoot) {
        const markdownDoc = searchRoot.querySelector(".markdown-document")
        if (markdownDoc) return markdownDoc
      }

      // 递归搜索子元素的 Shadow DOM
      const elements = "querySelectorAll" in searchRoot ? searchRoot.querySelectorAll("*") : []
      for (const el of Array.from(elements)) {
        if (el.shadowRoot) {
          const found = findMarkdownDocument(el.shadowRoot, depth + 1)
          if (found) return found
        }
      }

      return null
    }

    return findMarkdownDocument(ucsSummary)
  }

  /** 在 Shadow DOM 中递归查找标题 */
  private findHeadingsInShadowDOM(
    root: Element | Document | ShadowRoot,
    outline: OutlineItem[],
    maxLevel: number,
    depth: number,
    turnId?: string,
    messageHeaderCounts: Record<string, number> = {},
  ): void {
    if (depth > 15) return

    // 如果传入的是一个有 shadowRoot 的元素，先进入其 Shadow Root
    if ("shadowRoot" in root && (root as Element).shadowRoot) {
      this.findHeadingsInShadowDOM(
        (root as Element).shadowRoot!,
        outline,
        maxLevel,
        depth + 1,
        turnId,
        messageHeaderCounts,
      )
      return
    }

    // 在当前层级查找标题（h1-h6）
    if (root !== document && "querySelectorAll" in root) {
      const headingSelector = Array.from({ length: maxLevel }, (_, i) => `h${i + 1}`).join(", ")
      try {
        const headings = root.querySelectorAll(headingSelector)
        headings.forEach((heading) => {
          // 排除用户提问渲染容器内的标题
          if (this.isInRenderedMarkdownContainer(heading)) return

          // 只匹配包含 data-markdown-start-index 的标题（排除 logo 等非 AI 回复内容）
          const spans = heading.querySelectorAll("span[data-markdown-start-index]")
          if (spans.length > 0) {
            const level = parseInt(heading.tagName[1], 10)
            const text = Array.from(spans)
              .map((s) => s.textContent?.trim())
              .join("")
            if (text) {
              const item: OutlineItem = { level, text, element: heading }

              // 如果有 Turn ID，生成稳定 ID
              if (turnId) {
                const tagName = heading.tagName.toLowerCase()
                // ID 格式: TurnID::tagName-text-count
                // e.g. 7038_5593::h3-标题内容-0
                const key = `${tagName}-${text}`
                const count = messageHeaderCounts[key] || 0
                messageHeaderCounts[key] = count + 1
                item.id = `${turnId}::${key}::${count}`
              }

              outline.push(item)
            }
          }
        })
      } catch {
        // 忽略选择器错误
      }
    }

    // 递归查找 Shadow DOM
    if ("querySelectorAll" in root) {
      const allElements = root.querySelectorAll("*")
      for (const el of Array.from(allElements)) {
        if (el.shadowRoot) {
          this.findHeadingsInShadowDOM(
            el.shadowRoot,
            outline,
            maxLevel,
            depth + 1,
            turnId,
            messageHeaderCounts,
          )
        }
      }
    }
  }

  /**
   * 从页面提取大纲（使用递归 Shadow DOM 搜索）
   */
  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const outline: OutlineItem[] = []

    // 辅助函数：从 ucs-summary 元素中提取文本字数（穿透 Shadow DOM）
    const extractSummaryWordCount = (ucsSummary: Element): number => {
      const markdownDoc = this.extractSummaryContent(ucsSummary)
      if (markdownDoc) {
        return markdownDoc.textContent?.trim().length || 0
      }
      return ucsSummary.textContent?.trim().length || 0
    }

    if (!includeUserQueries) {
      // 原有逻辑：只提取标题（使用递归 Shadow DOM 搜索）
      this.findHeadingsInShadowDOM(document, outline, maxLevel, 0)

      // 如果需要字数统计，遍历 outline 并为每个标题计算字数
      if (showWordCount) {
        outline.forEach((item, index) => {
          if (!item.element) return

          // 找到标题所在的 .markdown-document 容器
          const markdownDoc = item.element.closest(".markdown-document")
          if (markdownDoc) {
            // 找到下一个同级或更高级别的标题作为边界
            let nextBoundaryEl: Element | null = null
            for (let i = index + 1; i < outline.length; i++) {
              if (outline[i].level <= item.level) {
                nextBoundaryEl = outline[i].element || null
                break
              }
            }
            item.wordCount = this.calculateRangeWordCount(item.element, nextBoundaryEl, markdownDoc)
          }
        })
      }

      return outline
    }

    // 开启用户提问分组模式
    // 策略：按轮次遍历。结构为 ucs-conversation -> shadowRoot -> .main -> .turn
    // 每个 .turn 包含 .question-block（用户提问）和 ucs-summary（AI 回复）

    // 1. 找到 ucs-conversation 元素
    const ucsConversation = DOMToolkit.query("ucs-conversation", { shadow: true }) as Element | null
    if (!ucsConversation || !ucsConversation.shadowRoot) {
      // 回退：如果找不到 ucs-conversation，使用原有逻辑
      this.findHeadingsInShadowDOM(document, outline, maxLevel, 0)
      return outline
    }

    // 2. 在 ucs-conversation 的 Shadow Root 中查找 .main 下的所有 .turn
    const main = ucsConversation.shadowRoot.querySelector(".main")
    if (!main) {
      this.findHeadingsInShadowDOM(document, outline, maxLevel, 0)
      return outline
    }

    const turnContainers = main.querySelectorAll(".turn")

    // 3. 遍历每个轮次
    turnContainers.forEach((turn) => {
      // 3.0 提取轮次 ID (Turn ID)
      // jslog="257629;track:impressionasVeMetadata:[null,null,null,&quot;7038012297388346599_5593580960293487735&quot;];"
      const jslog = turn.getAttribute("jslog") || ""
      // 提取 ID: 匹配连续的 digits_digits 格式
      // 简化正则以兼容 HTML 实体编码 (&quot;) 和普通引号
      const idMatch = jslog.match(/(\d+_\d+)/)
      const turnId = idMatch ? idMatch[1] : undefined

      // 3.1 在轮次中查找用户提问 (.question-block)
      const questionBlock = turn.querySelector(".question-block")
      const ucsSummary = turn.querySelector("ucs-summary")

      if (questionBlock) {
        let queryText = this.extractUserQueryText(questionBlock)
        let isTruncated = false
        if (queryText.length > 200) {
          queryText = queryText.substring(0, 200)
          isTruncated = true
        }

        const item: OutlineItem = {
          level: 0,
          text: queryText,
          element: questionBlock,
          isUserQuery: true,
          isTruncated,
          id: turnId, // Assign Turn ID to User Query
        }

        // 计算字数：统计此轮次的 AI 回复
        if (showWordCount && ucsSummary) {
          item.wordCount = extractSummaryWordCount(ucsSummary)
        }

        outline.push(item)
      }

      // 3.2 在轮次的 ucs-summary 中查找标题（递归进入 Shadow DOM）
      if (ucsSummary) {
        const turnHeadings: OutlineItem[] = []
        // Pass Turn ID as context for generating heading IDs
        this.findHeadingsInShadowDOM(ucsSummary, turnHeadings, maxLevel, 0, turnId)

        // 为标题计算字数
        if (showWordCount) {
          const markdownDoc = this.extractSummaryContent(ucsSummary)
          turnHeadings.forEach((h, index) => {
            if (!h.element) return

            // 找到下一个边界
            let nextBoundaryEl: Element | null = null
            for (let i = index + 1; i < turnHeadings.length; i++) {
              if (turnHeadings[i].level <= h.level) {
                nextBoundaryEl = turnHeadings[i].element || null
                break
              }
            }

            h.wordCount = this.calculateRangeWordCount(
              h.element,
              nextBoundaryEl,
              markdownDoc || ucsSummary,
            )
          })
        }

        turnHeadings.forEach((h) => outline.push(h))
      }
    })

    return outline
  }

  /**
   * 覆盖基类方法：使用 DOMToolkit 穿透 Shadow DOM 查找标题元素
   */
  findElementByHeading(level: number, text: string): Element | null {
    // 使用 DOMToolkit 穿透 Shadow DOM 查找所有匹配的 h{level} 元素
    const headings = DOMToolkit.query(`h${level}`, {
      all: true,
      shadow: true,
    }) as Element[]

    for (const h of headings) {
      if (h.textContent?.trim() === text) {
        return h
      }
    }
    return null
  }

  getExportConfig(): ExportConfig {
    return {
      userQuerySelector: ".question-block",
      assistantResponseSelector: "ucs-summary",
      turnSelector: ".turn",
      useShadowDOM: true,
    }
  }

  // ==================== 生成状态检测 ====================

  /** 检测 AI 是否正在生成响应（递归 Shadow DOM 搜索）*/
  isGenerating(): boolean {
    const findInShadow = (root: Document | ShadowRoot, depth = 0): boolean => {
      if (depth > 10) return false

      // 检查当前层级
      const stopButton = root.querySelector(
        'button[aria-label*="Stop"], button[aria-label*="停止"], ' +
          '[data-test-id="stop-button"], .stop-button, md-icon-button[aria-label*="Stop"]',
      )
      if (stopButton && (stopButton as HTMLElement).offsetParent !== null) {
        return true
      }

      const spinner = root.querySelector(
        'mat-spinner, md-spinner, .loading-spinner, [role="progressbar"], ' +
          ".generating-indicator, .response-loading",
      )
      if (spinner && (spinner as HTMLElement).offsetParent !== null) {
        return true
      }

      // 递归搜索 Shadow DOM
      const elements = root.querySelectorAll("*")
      for (const el of Array.from(elements)) {
        if (el.shadowRoot) {
          if (findInShadow(el.shadowRoot, depth + 1)) {
            return true
          }
        }
      }
      return false
    }

    return findInShadow(document)
  }

  /** 获取当前使用的模型名称（递归 Shadow DOM 搜索）*/
  getModelName(): string | null {
    const findInShadow = (root: Document | ShadowRoot, depth = 0): string | null => {
      if (depth > 10) return null

      // 检查模型选择器
      const modelSelectors = [
        "#model-selector-menu-anchor",
        ".action-model-selector",
        ".model-selector",
        '[data-test-id="model-selector"]',
        ".current-model",
      ]

      for (const selector of modelSelectors) {
        const el = root.querySelector(selector)
        if (el && el.textContent) {
          const text = el.textContent.trim()
          // 提取模型关键字
          const modelMatch = text.match(/(\d+\.?\d*\s*)?(Pro|Flash|Ultra|Nano|Gemini|auto|自动)/i)
          if (modelMatch) {
            return modelMatch[0].trim()
          }
          if (text.length <= 20 && text.length > 0) {
            return text
          }
        }
      }

      // 递归搜索 Shadow DOM
      const elements = root.querySelectorAll("*")
      for (const el of Array.from(elements)) {
        if (el.shadowRoot) {
          const result = findInShadow(el.shadowRoot, depth + 1)
          if (result) return result
        }
      }
      return null
    }

    return findInShadow(document)
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
    return {
      urlPatterns: ["widgetStreamAssist"],
      silenceThreshold: 3000,
    }
  }

  // ==================== 生命周期 ====================

  /** 覆盖基类：页面加载完成后执行 */
  afterPropertiesSet(
    options: {
      modelLockConfig?: { enabled: boolean; keyword: string }
      clearOnInit?: boolean
    } = {},
  ): void {
    // 保存配置状态供其他方法使用
    this.clearOnInit = options.clearOnInit || false

    // 调用基类通用逻辑（处理模型锁定）
    super.afterPropertiesSet(options)

    // 处理企业版特有的初始化清除
    if (this.clearOnInit) {
      this.clearTextarea()
    }
  }

  /** 覆盖基类：处理锁定后的清理（已废弃的清空逻辑已移除）*/
  lockModel(keyword: string, onSuccess: (() => void) | null = null): void {
    super.lockModel(keyword, onSuccess ?? undefined)
  }

  /** 排除侧边栏中的 Shadow DOM 样式注入 */
  shouldInjectIntoShadow(host: Element): boolean {
    return !(
      host.closest("mat-sidenav") ||
      host.closest("mat-drawer") ||
      host.closest('[class*="bg-sidebar"]')
    )
  }

  /** 覆盖基类：通过点击“展开”按钮加载更多会话 */
  async loadAllConversations(): Promise<void> {
    const maxIterations = 20 // 防止无限循环

    for (let i = 0; i < maxIterations; i++) {
      // 查找所有按钮（穿透 Shadow DOM）
      const allBtns =
        (DOMToolkit.query("button.show-more", { all: true, shadow: true }) as Element[]) || []

      // 过滤出未展开的按钮（icon 没有 more-visible class）
      const expandBtns = allBtns.filter((btn) => {
        const icon = btn.querySelector(".show-more-icon")
        // 已展开的按钮 icon 有 more-visible class
        return icon && !icon.classList.contains("more-visible")
      })

      if (expandBtns.length === 0) {
        break // 没有更多需要展开的按钮
      }

      // 点击所有展开按钮
      for (const btn of expandBtns) {
        ;(btn as HTMLElement).click()
      }

      // 等待会话加载
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  // ==================== 模型锁定 ====================

  getDefaultLockSettings(): { enabled: boolean; keyword: string } {
    return { enabled: true, keyword: "3 Pro" }
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig {
    return {
      targetModelKeyword: keyword || "3 Pro",
      selectorButtonSelectors: ["#model-selector-menu-anchor", ".action-model-selector"],
      menuItemSelector: "md-menu-item",
      checkInterval: 1500,
      maxAttempts: 20,
      menuRenderDelay: 500,
    }
  }

  // ==================== 主题切换 ====================

  /**
   * 模拟点击原生设置切换主题 (针对 Gemini Enterprise)
   * @param targetMode 目标主题模式
   */
  async toggleTheme(targetMode: "light" | "dark" | "system"): Promise<boolean> {
    // 1. 启动暴力隐身模式 (JS 每一帧强制隐藏)
    // CSS 注入可能因优先级或 Shadow DOM 隔离失效，JS 强制修改内联样式是最稳妥的
    let stopSuppression = false
    const suppressMenu = () => {
      if (stopSuppression) return

      // 查找所有可能的菜单容器
      try {
        const menus = DOMToolkit.query(
          '.menu[popover], md-menu-surface, .mat-menu-panel, [role="menu"]',
          {
            all: true,
            shadow: true,
          },
        ) as Element[]
        menus.forEach((el) => {
          const htmlEl = el as HTMLElement
          // 强制隐藏，不留余地
          if (htmlEl.style.opacity !== "0") {
            htmlEl.style.setProperty("opacity", "0", "important")
            htmlEl.style.setProperty("visibility", "hidden", "important")
            htmlEl.style.setProperty("pointer-events", "none", "important")
          }
        })
      } catch {
        // Ignore errors during suppression
      }

      requestAnimationFrame(suppressMenu)
    }
    suppressMenu()

    // 全局也加一个保险
    document.body.classList.add("gh-stealth-mode")

    try {
      // 2. 找到并点击设置按钮
      let settingsBtn = DOMToolkit.query(".settings-button", { shadow: true }) as HTMLElement

      if (!settingsBtn) {
        console.error("[GeminiEnterpriseAdapter] Settings button not found (.settings-button)")
        return false
      } else {
        if (typeof settingsBtn.click === "function") {
          settingsBtn.click()
        } else {
          settingsBtn.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
            }),
          )
        }
      }

      // 3. 等待菜单弹出并点击目标
      let attempts = 0
      const findAndClickOption = (): boolean => {
        const targetIcon =
          targetMode === "system" ? "computer" : targetMode === "dark" ? "dark_mode" : "light_mode"

        // Query all md-primary-tab in the document
        const tabs = DOMToolkit.query("md-primary-tab", { all: true, shadow: true }) as Element[]

        for (const tab of tabs) {
          const icon =
            tab.querySelector("md-icon") ||
            (DOMToolkit.query("md-icon", {
              parent: tab,
              shadow: true,
            }) as Element)
          if (icon && icon.textContent?.trim() === targetIcon) {
            ;(tab as HTMLElement).click()
            return true
          }
        }
        return false
      }

      return await new Promise((resolve) => {
        const interval = setInterval(() => {
          attempts++
          if (findAndClickOption()) {
            clearInterval(interval)
            resolve(true)
          } else if (attempts > 20) {
            // Timeout 2s
            clearInterval(interval)
            console.error("[GeminiEnterpriseAdapter] Target theme option not found")
            resolve(false)
            // Try clicking settings again to close if failed
            if (settingsBtn && typeof settingsBtn.click === "function") settingsBtn.click()
          }
        }, 100)
      })
    } finally {
      // 停止暴力抑制
      stopSuppression = true
      // 延迟移除隐身模式
      setTimeout(() => {
        document.body.classList.remove("gh-stealth-mode")
      }, 200)
    }
  }
}
