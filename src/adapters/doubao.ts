/**
 * 豆包适配器（www.doubao.com）
 *
 * 选择器策略：
 * - 侧边栏基于新结构的稳定根节点 `#flow_chat_sidebar`
 * - 历史会话基于 `a[id^="conversation_"]`
 * - 文本与按钮仅在必要时使用哈希 class 的局部模糊匹配
 *
 * 主题机制：
 * - <html data-theme="light">，仅支持浅色模式
 * - 使用 Semi Design 组件库（semi-* class 前缀）
 *
 * 路由兼容：
 * - /chat/{id} 和 /code/chat/{id} 指向同一会话
 * - 统一使用 chatPathPattern 提取会话 ID
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
  type OutlineItem,
  type AnchorData,
  type SiteDeleteConversationResult,
  type ZenModeConfig,
} from "./base"

/** 匹配 /chat/{id} 或 /code/chat/{id}，捕获会话 ID */
const chatPathPattern = /^(?:\/code)?\/chat\/([^/?#]+)/
const SIDEBAR_ROOT_SELECTOR = "#flow_chat_sidebar"
const SIDEBAR_HISTORY_SELECTOR = `${SIDEBAR_ROOT_SELECTOR} [data-history-container="true"]`
const CONVERSATION_ROW_SELECTOR = `${SIDEBAR_ROOT_SELECTOR} a[id^="conversation_"][href*="/chat/"]`
const CONVERSATION_TITLE_SELECTOR = '[class*="overallTitle-"], [class*="title-"]'
const NEW_CHAT_BUTTON_SELECTOR = `${SIDEBAR_ROOT_SELECTOR} > div:nth-child(2)`
const VIRTUAL_SCROLL_SELECTOR = '[class*="v_list_scroller"]'
const VIRTUAL_ROW_SELECTOR = ".v_list_row"
const VIRTUAL_SCROLL_HOLDER_SELECTOR = '[data-name="scroll_holder"]'
const MESSAGE_BLOCK_SELECTOR = '[data-target-id="message-box-target-id"]'
const USER_QUERY_SELECTOR = "[data-message-id].justify-end"
const RAW_USER_QUERY_TEXT_SELECTOR =
  ".whitespace-pre-wrap.wrap-anywhere:not(.gh-user-query-markdown)"
const USER_QUERY_TEXT_SELECTOR = `${USER_QUERY_SELECTOR} ${RAW_USER_QUERY_TEXT_SELECTOR}`
const ASSISTANT_MESSAGE_SELECTOR = "[data-message-id]:not(.justify-end)"
const ASSISTANT_MARKDOWN_SELECTORS = [".flow-markdown-body", ".md-box-root"] as const
const ASSISTANT_MARKDOWN_SELECTOR = ASSISTANT_MARKDOWN_SELECTORS.join(", ")
const ASSISTANT_CONTENT_SELECTOR = ASSISTANT_MARKDOWN_SELECTORS.map(
  (selector) => `${ASSISTANT_MESSAGE_SELECTOR} ${selector}`,
).join(", ")
const DOUBAO_DELETE_REASON = {
  UI_FAILED: "delete_ui_failed",
  BATCH_ABORTED_AFTER_UI_FAILURE: "delete_batch_aborted_after_ui_failure",
} as const
const DOUBAO_OUTLINE_CACHE_MAX_ITEMS = 1200

interface DoubaoVirtualMessageMeta {
  messageId: string | null
  rowIndex: number
}

interface DoubaoOutlineCacheEntry {
  id: string
  level: number
  text: string
  messageId: string | null
  rowIndex: number
  scrollTop: number
  orderInMessage: number
  headingMatchIndex?: number
  isUserQuery?: boolean
  isTruncated?: boolean
  wordCount?: number
}

export class DoubaoAdapter extends SiteAdapter {
  private outlineCacheSessionKey = ""
  private outlineCacheTransitionEndAt = 0
  private outlineItemCache = new Map<string, DoubaoOutlineCacheEntry>()

  // ===== 必选抽象方法 =====

  match(): boolean {
    return window.location.hostname === "www.doubao.com"
  }

  getSiteId(): string {
    return SITE_IDS.DOUBAO
  }

  getName(): string {
    return "豆包"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#315efb", secondary: "#0f6eff" }
  }

  getTextareaSelectors(): string[] {
    return [
      '[data-slate-editor="true"]',
      'textarea[data-testid="chat_input_input"]',
      "textarea.semi-input-textarea",
    ]
  }

  insertPrompt(content: string): boolean {
    const el = this.getTextareaElement() as HTMLElement | null
    if (!el || !el.isConnected) return false
    el.focus()

    if (el instanceof HTMLTextAreaElement) {
      // Semi Design textarea 是 React controlled component，需通过 prototype setter 绕过
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      if (setter) {
        setter.call(el, content)
      } else {
        el.value = content
      }
      el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: content }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
      el.setSelectionRange(content.length, content.length)
    } else if (el.isContentEditable) {
      // 对于 Slate.js 或其他 contenteditable 编辑器
      const selection = window.getSelection()
      if (selection) {
        // 先确保焦点在元素内
        el.focus()
        // 尝试选中已有内容以便替换
        selection.selectAllChildren(el)
        selection.collapseToEnd()

        // 如果选取依旧没能落入文本节点，某些富文本会拒绝 paste
        // Slate.js 的 placeholder 使用 data-slate-placeholder="true"
        // 它的空状态真正可输入的位置是 data-slate-zero-width="n" 的兄弟或直接在 element 下
        const slateNode = el.querySelector('[data-slate-node="element"]')
        if (slateNode && selection.rangeCount > 0) {
          const range = document.createRange()
          range.selectNodeContents(slateNode)
          range.collapse(false)
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }

      // 豆包 /code/chat 的 Slate 编辑器依靠 paste 事件更新状态和插入内容
      // 使用 execCommand 会导致内容被插入两次（一次 native，一次 React 响应 paste）
      const dataTransfer = new DataTransfer()
      dataTransfer.setData("text/plain", content)
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dataTransfer,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      )
    }

    return true
  }

  clearTextarea(): void {
    const el = this.getTextareaElement() as HTMLElement | null
    if (!el || !el.isConnected) return

    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      if (setter) {
        setter.call(el, "")
      } else {
        el.value = ""
      }
      el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: "" }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
    } else if (el.isContentEditable) {
      el.focus()

      // 使用 execCommand("selectAll") 能更好地触发 React 的 selectionchange
      document.execCommand("selectAll", false)

      // Slate 极度依赖 keydown 事件来处理删除和光标状态
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Backspace",
          code: "Backspace",
          keyCode: 8,
          bubbles: true,
          composed: true,
        }),
      )

      // 原生删除兜底，确保 DOM 确实被清空
      document.execCommand("delete", false)

      el.dispatchEvent(
        new InputEvent("input", {
          inputType: "deleteContentBackward",
          bubbles: true,
          composed: true,
        }),
      )

      el.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Backspace",
          code: "Backspace",
          keyCode: 8,
          bubbles: true,
          composed: true,
        }),
      )
    }
  }

  private extractConversationId(link: HTMLAnchorElement): string | null {
    const rowId = link.id.match(/^conversation_(.+)$/)?.[1]
    if (rowId) return rowId

    const href = link.getAttribute("href") || ""
    const idMatch = href.match(chatPathPattern)
    return idMatch?.[1] || null
  }

  private extractConversationTitle(link: HTMLAnchorElement): string {
    const titleElement =
      (link.querySelector(CONVERSATION_TITLE_SELECTOR) as HTMLElement | null) ||
      Array.from(link.querySelectorAll("span")).find((span) => span.textContent?.trim()) ||
      null

    return titleElement?.textContent?.trim() || ""
  }

  private getConversationRows(root: ParentNode = document): HTMLAnchorElement[] {
    return Array.from(root.querySelectorAll(CONVERSATION_ROW_SELECTOR)) as HTMLAnchorElement[]
  }

  private getHistoryContainer(): HTMLElement | null {
    return document.querySelector(SIDEBAR_HISTORY_SELECTOR) as HTMLElement | null
  }

  private findScrollableAncestor(start: Element | null): HTMLElement | null {
    let current = start as HTMLElement | null
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current)
      if (
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        current.clientHeight > 0
      ) {
        return current
      }
      current = current.parentElement
    }
    return null
  }

  private getActiveConversationRow(): HTMLAnchorElement | null {
    const currentSessionId = this.getSessionId()
    const rows = this.getConversationRows()

    return (
      rows.find((row) => row.getAttribute("aria-current") === "page") ||
      rows.find(
        (row) =>
          row.className.includes("active-link-") || row.className.includes("e2e-test-active"),
      ) ||
      rows.find((row) => this.extractConversationId(row) === currentSessionId) ||
      null
    )
  }

  private getVirtualScrollContainer(): HTMLElement | null {
    const candidates = Array.from(
      document.querySelectorAll(VIRTUAL_SCROLL_SELECTOR),
    ) as HTMLElement[]

    return (
      candidates.find((candidate) => {
        if (!candidate.isConnected) return false

        const hasVirtualList =
          candidate.querySelector(VIRTUAL_SCROLL_HOLDER_SELECTOR) ||
          candidate.querySelector(VIRTUAL_ROW_SELECTOR) ||
          candidate.querySelector(MESSAGE_BLOCK_SELECTOR)
        if (!hasVirtualList) return false

        const style = window.getComputedStyle(candidate)
        const isScrollable =
          style.overflowY === "auto" ||
          style.overflowY === "scroll" ||
          style.overflow === "auto" ||
          style.overflow === "scroll" ||
          candidate.scrollHeight > candidate.clientHeight

        return isScrollable && candidate.clientHeight > 0
      }) || null
    )
  }

  private getAssistantContentRoots(root: ParentNode): HTMLElement[] {
    const roots: HTMLElement[] = []

    if (root instanceof HTMLElement && root.matches(ASSISTANT_MARKDOWN_SELECTOR)) {
      roots.push(root)
    }

    Array.from(root.querySelectorAll(ASSISTANT_MARKDOWN_SELECTOR)).forEach((node) => {
      if (node instanceof HTMLElement && !roots.includes(node)) {
        roots.push(node)
      }
    })

    return roots
  }

  private getAssistantContentRoot(element: Element): Element {
    if (element.matches(ASSISTANT_MARKDOWN_SELECTOR)) {
      return element
    }

    return element.querySelector(ASSISTANT_MARKDOWN_SELECTOR) || element
  }

  getConversationTitle(): string | null {
    const activeLink = this.getActiveConversationRow()
    if (!activeLink) return null
    return this.extractConversationTitle(activeLink) || null
  }

  // ===== 会话与路由 =====

  getSessionId(): string {
    const m = window.location.pathname.match(chatPathPattern)
    if (!m || m[1] === "new") return ""
    return m[1]
  }

  isNewConversation(): boolean {
    return /^(?:\/code)?\/chat\/(new\/?)?$/.test(window.location.pathname)
  }

  isSharePage(): boolean {
    // 自有会话：/chat/ID 或 /code/chat/ID    分享会话：/thread/ID
    return window.location.pathname.startsWith("/thread/")
  }

  getNewTabUrl(): string {
    const prefix = window.location.pathname.startsWith("/code/") ? "/code" : ""
    return `https://www.doubao.com${prefix}/chat/`
  }

  supportsNewTab(): boolean {
    return true
  }

  // ===== 会话列表 =====

  getConversationList(): ConversationInfo[] {
    const links = this.getConversationRows()
    if (!links.length) return []
    const conversationMap = new Map<string, ConversationInfo>()

    links.forEach((linkEl) => {
      const link = linkEl as HTMLAnchorElement
      const id = this.extractConversationId(link)
      if (!id || id === "new") return

      const title = this.extractConversationTitle(link)
      const isActive =
        link.getAttribute("aria-current") === "page" ||
        link.className.includes("active-link-") ||
        link.className.includes("e2e-test-active")
      const isPinned = !!link.querySelector('[class*="pin-"]')

      conversationMap.set(id, {
        id,
        title,
        url: `https://www.doubao.com/chat/${id}`,
        isActive,
        isPinned,
      })
    })

    return Array.from(conversationMap.values())
  }

  navigateToConversation(id: string, url?: string): boolean {
    const link = document.querySelector(
      `#conversation_${id}, ${CONVERSATION_ROW_SELECTOR}[href*="/chat/${id}"]`,
    ) as HTMLElement | null
    if (link) {
      link.click()
      return true
    }
    window.location.href = url || `https://www.doubao.com/chat/${id}`
    return true
  }

  async loadAllConversations(): Promise<void> {
    const container = this.getSidebarScrollContainer() as HTMLElement
    if (!container) return

    let lastCount = 0
    let stableRounds = 0
    const maxStableRounds = 3

    while (stableRounds < maxStableRounds) {
      container.scrollTop = container.scrollHeight
      await new Promise((r) => setTimeout(r, 500))

      const links = container.querySelectorAll(CONVERSATION_ROW_SELECTOR)
      const currentCount = links.length
      if (currentCount === lastCount) {
        stableRounds++
      } else {
        lastCount = currentCount
        stableRounds = 0
      }
    }
  }

  getSidebarScrollContainer(): Element | null {
    const historyContainer = this.getHistoryContainer()
    return this.findScrollableAncestor(historyContainer) || historyContainer
  }

  getZenModeConfig() {
    return {
      hide: ["nav", ".container-qOgFQp"],
    }
  }

  getCleanModeConfig(): ZenModeConfig | null {
    return {
      hide: [".container-qOgFQp", '[aria-label="活动入口"]'],
    }
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    return {
      selector: CONVERSATION_ROW_SELECTOR,
      shadow: false,
      extractInfo: (el: Element): ConversationInfo | null => {
        const link = el as HTMLAnchorElement
        const id = this.extractConversationId(link)
        if (!id || id === "new") return null

        const title = this.extractConversationTitle(link)

        return {
          id,
          title,
          url: `https://www.doubao.com/chat/${id}`,
          isActive:
            link.getAttribute("aria-current") === "page" ||
            link.className.includes("active-link-") ||
            link.className.includes("e2e-test-active"),
          isPinned: !!link.querySelector('[class*="pin-"]'),
        }
      },
      getTitleElement: (el: Element): Element | null => {
        return (
          el.querySelector(CONVERSATION_TITLE_SELECTOR) ||
          Array.from(el.querySelectorAll("span")).find((span) => span.textContent?.trim()) ||
          null
        )
      },
    }
  }

  async deleteConversationOnSite(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    const success = await this.deleteConversationViaUi(target.id)
    return {
      id: target.id,
      success,
      method: success ? "ui" : "none",
      reason: success ? undefined : DOUBAO_DELETE_REASON.UI_FAILED,
    }
  }

  async deleteConversationsOnSite(
    targets: ConversationDeleteTarget[],
  ): Promise<SiteDeleteConversationResult[]> {
    const results: SiteDeleteConversationResult[] = []

    for (let index = 0; index < targets.length; index += 1) {
      const result = await this.deleteConversationOnSite(targets[index])
      results.push(result)

      if (!result.success && result.reason === DOUBAO_DELETE_REASON.UI_FAILED) {
        for (let i = index + 1; i < targets.length; i += 1) {
          results.push({
            id: targets[i].id,
            success: false,
            method: "none",
            reason: DOUBAO_DELETE_REASON.BATCH_ABORTED_AFTER_UI_FAILURE,
          })
        }
        break
      }
    }

    return results
  }

  getScrollContainer(): HTMLElement | null {
    return this.getVirtualScrollContainer()
  }

  getObserveTarget(): Element | null {
    return this.getVirtualScrollContainer() || super.getObserveTarget()
  }

  getResponseContainerSelector(): string {
    return VIRTUAL_SCROLL_SELECTOR
  }

  getUserQuerySelector(): string | null {
    return USER_QUERY_SELECTOR
  }

  getChatContentSelectors(): string[] {
    return [ASSISTANT_CONTENT_SELECTOR, USER_QUERY_TEXT_SELECTOR]
  }

  private extractAssistantMarkdown(element: Element): string {
    const target = this.getAssistantContentRoot(element).cloneNode(true) as HTMLElement

    target
      .querySelectorAll(
        [
          "button",
          "[role='button']",
          "svg",
          "[aria-hidden='true']",
          '[data-foundation-type="receive-message-action-bar"]',
          '[data-foundation-type="receive-message-suggest-foundation"]',
        ].join(", "),
      )
      .forEach((node) => node.remove())

    const content = htmlToMarkdown(target).trim()
    if (content) {
      return content
    }

    return this.extractTextWithLineBreaks(target).trim()
  }

  getLatestReplyText(): string | null {
    const responses = document.querySelectorAll(ASSISTANT_MESSAGE_SELECTOR)
    if (responses.length === 0) return null

    const last = responses[responses.length - 1]
    const text = this.extractAssistantMarkdown(last)
    return text || null
  }

  private getUserMessageTextContainer(element: Element): HTMLElement | null {
    if (element.matches(RAW_USER_QUERY_TEXT_SELECTOR)) {
      return element as HTMLElement
    }

    if (element.matches(USER_QUERY_SELECTOR)) {
      return element.querySelector(RAW_USER_QUERY_TEXT_SELECTOR) as HTMLElement | null
    }

    return (
      (element.querySelector(USER_QUERY_TEXT_SELECTOR) as HTMLElement | null) ||
      (element.querySelector(RAW_USER_QUERY_TEXT_SELECTOR) as HTMLElement | null)
    )
  }

  extractUserQueryText(element: Element): string {
    const textContainer = this.getUserMessageTextContainer(element)
    return textContainer ? this.extractTextWithLineBreaks(textContainer).trim() : ""
  }

  extractUserQueryMarkdown(element: Element): string {
    const textContainer = this.getUserMessageTextContainer(element)
    return textContainer ? this.extractTextWithLineBreaks(textContainer).trim() : ""
  }

  extractUserQueryExportContent(element: Element): string {
    const textContainer = this.getUserMessageTextContainer(element)
    if (!textContainer) {
      return this.extractUserQueryText(element)
    }

    // 豆包会保留一份隐藏的原始用户输入文本，导出时直接读取这份源文本，
    // 避免从我们注入的渲染结果反推 Markdown，减少回归风险。
    const rawText = textContainer.textContent?.trim()
    return rawText || this.extractUserQueryText(textContainer)
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    const textContainer = this.getUserMessageTextContainer(element)
    if (!textContainer) return false

    if (textContainer.nextElementSibling?.classList.contains("gh-user-query-markdown")) {
      return false
    }

    const rendered = document.createElement("div")
    rendered.className =
      `${textContainer.className} gh-user-query-markdown gh-markdown-preview`.trim()
    rendered.innerHTML = html

    // 复用原始容器的内联样式，避免站点字体大小变量丢失
    const inlineStyle = textContainer.getAttribute("style")
    if (inlineStyle) {
      rendered.setAttribute("style", inlineStyle)
    }

    textContainer.style.display = "none"
    textContainer.after(rendered)
    return true
  }

  // ===== 模型切换 =====

  /**
   * 在页面上所有 dropdown-menu-trigger 按钮中，精准定位模型选择器按钮。
   *
   * 豆包页面存在大量同属性的 Radix UI 下拉按钮（聊天列表三点菜单、用户头像菜单等），
   * 但只有模型切换按钮同时满足：
   *   1. 可见（offsetParent !== null）
   *   2. 内部包含 .truncate 子元素（模型名称的文本容器）
   */
  private findModelSelectorButton(): HTMLElement | null {
    const selector = 'button[data-slot="dropdown-menu-trigger"][aria-haspopup="menu"]'
    const buttons = document.querySelectorAll(selector)
    for (const btn of buttons) {
      const el = btn as HTMLElement
      if (el.offsetParent !== null) {
        const truncate = el.querySelector(".truncate")
        // 模型选择器的 .truncate 里有模型名（如"快速"），而附件上传按钮的 .truncate 为空
        if (truncate && truncate.textContent?.trim()) {
          return el
        }
      }
    }
    return null
  }

  getModelSwitcherConfig(_keyword: string): ModelSwitcherConfig | null {
    return {
      targetModelKeyword: _keyword,
      selectorButtonSelectors: ['button[data-slot="dropdown-menu-trigger"][aria-haspopup="menu"]'],
      menuItemSelector: 'div[role="menuitem"][data-slot="dropdown-menu-item"]',
      menuRenderDelay: 100,
    }
  }

  getModelName(): string | null {
    const button = this.findModelSelectorButton()
    if (!button) return null

    // 使用 innerText 而非 textContent：
    // innerText 只返回页面上可见的文本，Radix UI 的 popper 弹出层
    // 在菜单关闭时被包裹在 h-0 w-0 容器中（不可见），会被自动排除。
    // 取第一行以防万一有描述文字泄漏
    const text = (button as HTMLElement).innerText?.trim()
    return text ? text.split("\n")[0].trim() : null
  }

  /**
   * 覆写基类方法：使用 findModelSelectorButton 精准定位，
   * 避免基类 findElementBySelectors 取到第一个不可见按钮后直接返回 false
   */
  clickModelSelector(): boolean {
    const btn = this.findModelSelectorButton()
    if (btn) {
      this.simulateClick(btn)
      return true
    }
    return false
  }

  /**
   * 覆写点击模拟：豆包使用 Radix UI，需要完整的 PointerEvent 序列才能触发下拉菜单
   * 同时补发 hover 相关事件，兼容侧边栏 hover 后才显示操作按钮的交互
   */
  protected simulateClick(element: HTMLElement): void {
    const rect = element.getBoundingClientRect()
    const clientX = rect.left + Math.max(1, Math.min(rect.width / 2, rect.width - 1))
    const clientY = rect.top + Math.max(1, Math.min(rect.height / 2, rect.height - 1))
    const commonInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX,
      clientY,
    }

    element.dispatchEvent(
      new PointerEvent("pointerenter", {
        ...commonInit,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      }),
    )
    element.dispatchEvent(
      new PointerEvent("pointerover", {
        ...commonInit,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      }),
    )
    element.dispatchEvent(new MouseEvent("mouseenter", commonInit))
    element.dispatchEvent(new MouseEvent("mouseover", commonInit))
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        ...commonInit,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      }),
    )
    element.dispatchEvent(new MouseEvent("mousedown", commonInit))
    element.dispatchEvent(
      new PointerEvent("pointerup", {
        ...commonInit,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      }),
    )
    element.dispatchEvent(new MouseEvent("mouseup", commonInit))
    element.dispatchEvent(new MouseEvent("click", commonInit))
  }

  private async deleteConversationViaUi(id: string): Promise<boolean> {
    const row = await this.findConversationRowWithRetry(id)
    if (!row) {
      return false
    }

    const menuOpened = await this.openConversationMenu(row, id)
    if (!menuOpened) {
      return false
    }

    const deleteMenuItem = await this.waitForDeleteMenuItem(2500)
    if (!deleteMenuItem) {
      return false
    }
    this.simulateClick(deleteMenuItem)

    // The confirmation dialog is optional: try to find and click the confirm button;
    // if it does not appear (e.g. future versions with no confirm step) but the
    // conversation disappears anyway, treat it as success.
    const confirmButton = await this.waitForDeleteConfirmButton(2500)
    if (confirmButton) {
      this.simulateClick(confirmButton)
    }

    return this.waitForConversationRemoved(id, 7000)
  }

  private async findConversationRowWithRetry(id: string): Promise<HTMLElement | null> {
    const firstTry = this.findConversationRow(id)
    if (firstTry) return firstTry

    await this.loadAllConversations()
    await this.sleep(200)
    return this.findConversationRow(id)
  }

  private findConversationRow(id: string): HTMLElement | null {
    return document.querySelector(`#conversation_${id}`) as HTMLElement | null
  }

  private getConversationMenuButtons(row: HTMLElement): HTMLElement[] {
    const visibleButtons: HTMLElement[] = []
    const hiddenButtons: HTMLElement[] = []
    const seen = new Set<HTMLElement>()

    const push = (element: HTMLElement | null) => {
      if (!element) return
      if (seen.has(element)) return
      seen.add(element)

      if (this.isVisible(element)) {
        visibleButtons.push(element)
      } else {
        hiddenButtons.push(element)
      }
    }

    const actionRoot = row.querySelector('[class*="chat-item-menu-wrapper-"]') as HTMLElement | null
    if (!actionRoot) return []

    const trigger = actionRoot.querySelector(
      'button[data-slot="dropdown-menu-trigger"][aria-haspopup="menu"]',
    ) as HTMLElement | null
    const innerButton = actionRoot.querySelector(
      'button[data-dbx-name="button"]',
    ) as HTMLElement | null
    const genericTrigger = actionRoot.querySelector(
      'button[aria-haspopup="menu"]',
    ) as HTMLElement | null

    push(trigger)
    push(innerButton)
    push(genericTrigger)
    return [...visibleButtons, ...hiddenButtons]
  }

  private async openConversationMenu(row: HTMLElement, _id: string): Promise<boolean> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      row.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
      row.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))

      const candidates = this.getConversationMenuButtons(row)
      if (candidates.length === 0) {
        await this.sleep(80)
        continue
      }

      for (const candidate of candidates) {
        document.body.click()
        await this.sleep(50)
        const opened = await this.tryActivateConversationAction(row, candidate)
        if (opened) {
          return true
        }
      }

      await this.sleep(100)
    }

    return false
  }

  private async waitForDeleteMenuItem(timeout = 2500): Promise<HTMLElement | null> {
    const start = Date.now()

    while (Date.now() - start < timeout) {
      const items = Array.from(
        document.querySelectorAll(
          '[data-radix-popper-content-wrapper] [role="menuitem"][data-slot="dropdown-menu-item"]',
        ),
      ) as HTMLElement[]

      for (const item of items) {
        if (!this.isVisible(item)) continue

        // Primary: the delete item is styled in danger/red color (text-dbx-function-danger)
        // This is the most reliable signal after data-testid attributes were removed from the new DOM
        if (item.querySelector(".text-dbx-function-danger")) {
          return item
        }

        // Fallback: text-based matching (Chinese "删除" or English "delete")
        const signalText = this.getSignalText(item)
        if (
          signalText.includes("删除") ||
          signalText.includes("刪除") ||
          signalText.includes("delete")
        ) {
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
      const dialog = this.findVisibleDeleteDialog()
      if (dialog) {
        // Primary: the confirm button has bg-dbx-function-danger (danger/red background)
        // This is reliable regardless of locale (works for Simplified, Traditional, English)
        const dangerBtn = dialog.querySelector(
          'button[class*="bg-dbx-function-danger"]',
        ) as HTMLElement | null
        if (this.isVisible(dangerBtn)) {
          return dangerBtn
        }

        // Fallback: text-based matching for Simplified (\u5220\u9664), Traditional (\u5220\u9664 / \u522a\u9664) or English
        const buttons = Array.from(dialog.querySelectorAll("button")) as HTMLElement[]
        for (const button of buttons) {
          if (!this.isVisible(button)) continue
          const signalText = this.getSignalText(button)
          if (
            signalText.includes("\u5220\u9664") || // 删除 (Simplified)
            signalText.includes("\u522a\u9664") || // 刪除 (Traditional)
            signalText.includes("delete")
          ) {
            return button
          }
        }
      }

      await this.sleep(80)
    }

    return null
  }

  private findVisibleDeleteDialog(): HTMLElement | null {
    // Primary: match by the new Radix dialog slot attribute and open state
    const newDialogs = Array.from(
      document.querySelectorAll('[role="dialog"][data-state="open"][data-slot="dialog-content"]'),
    ) as HTMLElement[]
    const newDialog = newDialogs.find((dialog) => this.isVisible(dialog))
    if (newDialog) return newDialog

    // Fallback: legacy structure — match by text content for Simplified, Traditional or English
    const dialogs = Array.from(
      document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="dialog"]'),
    ) as HTMLElement[]
    return (
      dialogs.find((dialog) => {
        if (!this.isVisible(dialog)) return false
        const text = this.getSignalText(dialog)
        return (
          text.includes("\u5220\u9664") || // 删除 (Simplified)
          text.includes("\u522a\u9664") || // 刪除 (Traditional)
          text.includes("delete")
        )
      }) || null
    )
  }

  private async waitForConversationRemoved(id: string, timeout = 3500): Promise<boolean> {
    const start = Date.now()

    while (Date.now() - start < timeout) {
      if (!this.findConversationRow(id)) {
        return true
      }

      if (this.getSessionId() !== id && !window.location.pathname.includes(`/chat/${id}`)) {
        return true
      }

      await this.sleep(80)
    }

    return false
  }

  private async tryActivateConversationAction(
    row: HTMLElement,
    button: HTMLElement,
  ): Promise<boolean> {
    if (!button.isConnected) {
      return false
    }

    row.scrollIntoView({ block: "nearest", inline: "nearest" })
    button.scrollIntoView({ block: "nearest", inline: "nearest" })

    const hoverTarget = button.closest('[class*="chat-item-menu-wrapper-"]') as HTMLElement | null
    hoverTarget?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
    hoverTarget?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    button.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
    button.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))

    button.focus()
    this.simulateClick(button)
    if (await this.waitForConversationMenuOpen(350)) {
      return true
    }

    button.click()
    if (await this.waitForConversationMenuOpen(350)) {
      return true
    }

    const keyboardEvents = [
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
      new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }),
      new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }),
      new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true, cancelable: true }),
    ]

    for (const event of keyboardEvents) {
      button.dispatchEvent(event)
      if (await this.waitForConversationMenuOpen(200)) {
        return true
      }
    }

    return false
  }

  private async waitForConversationMenuOpen(timeout = 500): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const menus = Array.from(
        document.querySelectorAll(
          '[data-radix-popper-content-wrapper] [role="menu"][data-state="open"], [data-radix-popper-content-wrapper] [role="menu"]',
        ),
      ) as HTMLElement[]

      if (menus.some((menu) => this.isVisible(menu))) {
        return true
      }

      await this.sleep(50)
    }

    return false
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

  // ==================== 大纲缓存（虚拟滚动兜底） ====================

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
    this.outlineCacheTransitionEndAt = isFirstSession ? 0 : Date.now() + 1200
  }

  private isInOutlineCacheTransition(): boolean {
    return Date.now() < this.outlineCacheTransitionEndAt
  }

  private getVirtualRow(element: Element | null): HTMLElement | null {
    return (element?.closest(VIRTUAL_ROW_SELECTOR) as HTMLElement | null) || null
  }

  private getVirtualRowIndex(row: HTMLElement | null, fallbackIndex: number): number {
    if (!row) return fallbackIndex

    const clsValue = row.style.getPropertyValue("--cls") || row.getAttribute("style") || ""
    const match = clsValue.match(/r-(\d+)-/)
    return match ? Number.parseInt(match[1], 10) : fallbackIndex
  }

  private getVirtualRowScrollTop(row: HTMLElement | null, fallbackTop: number): number {
    if (!row) return fallbackTop

    const propValue =
      row.style.getPropertyValue("--vlist-row-transform-y") || row.getAttribute("style") || ""
    const match = propValue.match(/--vlist-row-transform-y:\s*(-?\d+(?:\.\d+)?)px/)
    if (match) return Math.max(0, Number.parseFloat(match[1]))

    const directValue = Number.parseFloat(propValue)
    return Number.isFinite(directValue) ? Math.max(0, directValue) : fallbackTop
  }

  private getVirtualMessageMeta(
    unit: HTMLElement,
    fallbackIndex: number,
  ): DoubaoVirtualMessageMeta {
    const row = this.getVirtualRow(unit)
    const observedRow = row?.getAttribute("data-observe-row") || ""
    const rowMessageId = observedRow.match(/^block_(.+)$/)?.[1] || null
    const messageElement = unit.matches("[data-message-id]")
      ? unit
      : (unit.querySelector("[data-message-id]") as HTMLElement | null)

    return {
      messageId: rowMessageId || messageElement?.getAttribute("data-message-id") || null,
      rowIndex: this.getVirtualRowIndex(row, fallbackIndex),
    }
  }

  private getOutlineMessageKey(meta: DoubaoVirtualMessageMeta): string {
    return meta.messageId || `row:${meta.rowIndex}`
  }

  private getElementVirtualScrollTop(container: HTMLElement, element: HTMLElement): number {
    const row = this.getVirtualRow(element)
    const fallbackTop = Math.max(
      0,
      container.scrollTop +
        element.getBoundingClientRect().top -
        container.getBoundingClientRect().top,
    )
    const rowTop = this.getVirtualRowScrollTop(row, fallbackTop)
    if (!row) return rowTop

    const elementOffsetInRow = element.getBoundingClientRect().top - row.getBoundingClientRect().top
    return Math.max(0, rowTop + elementOffsetInRow)
  }

  private hashOutlineText(value: string): string {
    let hash = 5381
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0
    }
    return hash.toString(16)
  }

  private buildOutlineItemId(
    meta: DoubaoVirtualMessageMeta,
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery">,
    headingMatchIndex = 0,
  ): string {
    const messageKey = this.getOutlineMessageKey(meta)
    if (item.isUserQuery) return `doubao:${messageKey}:user`
    return `doubao:${messageKey}:h${item.level}:${headingMatchIndex}:${this.hashOutlineText(
      item.text,
    )}`
  }

  private trimOutlineCache(): void {
    if (this.outlineItemCache.size <= DOUBAO_OUTLINE_CACHE_MAX_ITEMS) return

    const entries = Array.from(this.outlineItemCache.values()).sort((a, b) => {
      if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex
      return a.orderInMessage - b.orderInMessage
    })

    const keep = new Set(entries.slice(-DOUBAO_OUTLINE_CACHE_MAX_ITEMS).map((entry) => entry.id))
    for (const id of this.outlineItemCache.keys()) {
      if (!keep.has(id)) this.outlineItemCache.delete(id)
    }
  }

  private clearOutlineCacheForMeta(meta: DoubaoVirtualMessageMeta): void {
    for (const [id, entry] of this.outlineItemCache) {
      if (meta.messageId && entry.messageId === meta.messageId) {
        this.outlineItemCache.delete(id)
      } else if (!entry.messageId && entry.rowIndex === meta.rowIndex) {
        this.outlineItemCache.delete(id)
      }
    }
  }

  private mergeCachedOutlineItems(
    currentItems: OutlineItem[],
    currentIds: Set<string>,
    maxLevel: number,
    includeUserQueries: boolean,
    showWordCount: boolean,
  ): OutlineItem[] {
    if (this.outlineItemCache.size === 0) return currentItems

    const merged: OutlineItem[] = [...currentItems]

    for (const entry of this.outlineItemCache.values()) {
      if (currentIds.has(entry.id)) continue
      if (entry.isUserQuery && !includeUserQueries) continue
      if (!entry.isUserQuery && entry.level > maxLevel) continue
      if (!entry.text.trim()) continue

      merged.push({
        level: entry.level,
        text: entry.text,
        element: null,
        id: entry.id,
        isUserQuery: entry.isUserQuery,
        isTruncated: entry.isTruncated,
        wordCount: showWordCount ? entry.wordCount : undefined,
        scrollTop: entry.scrollTop,
      } as OutlineItem & { scrollTop: number })
    }

    return merged
      .map((item, originalIndex) => {
        const entry = item.id ? this.outlineItemCache.get(item.id) : undefined
        return {
          item,
          originalIndex,
          rowIndex: entry?.rowIndex ?? Number.MAX_SAFE_INTEGER,
          orderInMessage: entry?.orderInMessage ?? originalIndex,
        }
      })
      .sort((a, b) => {
        if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex
        if (a.orderInMessage !== b.orderInMessage) return a.orderInMessage - b.orderInMessage
        return a.originalIndex - b.originalIndex
      })
      .map(({ item }) => item)
  }

  private escapeAttributeValue(value: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value)
    }
    return value.replace(/["\\]/g, "\\$&")
  }

  private findMessageElementByCacheEntry(
    container: HTMLElement,
    entry: DoubaoOutlineCacheEntry,
  ): HTMLElement | null {
    if (entry.messageId) {
      const escaped = this.escapeAttributeValue(entry.messageId)
      const messageElement = container.querySelector(
        `[data-message-id="${escaped}"]`,
      ) as HTMLElement | null
      if (messageElement) return messageElement
    }

    const rows = Array.from(container.querySelectorAll(VIRTUAL_ROW_SELECTOR)) as HTMLElement[]
    const row = rows.find((candidate) => this.getVirtualRowIndex(candidate, -1) === entry.rowIndex)
    return (row?.querySelector("[data-message-id]") as HTMLElement | null) || null
  }

  private findHeadingInsideMessage(
    messageElement: Element,
    entry: DoubaoOutlineCacheEntry,
  ): Element | null {
    if (entry.isUserQuery) return messageElement

    const headings = Array.from(messageElement.querySelectorAll(`h${entry.level}`))
    const targetMatchIndex = entry.headingMatchIndex ?? 0
    let matched = 0

    for (const heading of headings) {
      if ((heading.textContent || "").trim() !== entry.text) continue
      if (matched === targetMatchIndex) return heading
      matched += 1
    }

    return null
  }

  private resolveCachedDoubaoOutlineTarget(id: string | undefined): Element | null {
    if (!id) return null

    this.ensureOutlineCacheSession()

    const entry = this.outlineItemCache.get(id)
    if (!entry) return null

    const container = this.getVirtualScrollContainer()
    if (!container) return null

    const messageElement = this.findMessageElementByCacheEntry(container, entry)
    if (!messageElement) return null

    if (entry.isUserQuery) return messageElement
    return this.findHeadingInsideMessage(messageElement, entry)
  }

  private scrollVirtualContainerTo(container: HTMLElement, scrollTop: number): void {
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const top = Math.max(0, Math.min(scrollTop, maxScrollTop))

    container.scrollTo({
      top,
      behavior: "instant",
      __bypassLock: true,
    } as any)
    container.dispatchEvent(new Event("scroll", { bubbles: true }))
  }

  private async waitForCachedDoubaoOutlineTargetMount(
    id: string | undefined,
    timeoutMs = 1500,
  ): Promise<Element | null> {
    if (!id) return null

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const target = this.resolveCachedDoubaoOutlineTarget(id)
      if (target) return target
      await this.sleep(60)
    }

    return null
  }

  async resolveOutlineTarget(
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery" | "id">,
    queryIndex?: number,
  ): Promise<Element | null> {
    this.ensureOutlineCacheSession()

    if (item.id && this.outlineItemCache.has(item.id)) {
      const visibleTarget = this.resolveCachedDoubaoOutlineTarget(item.id)
      if (visibleTarget) return visibleTarget

      const entry = this.outlineItemCache.get(item.id)
      const container = this.getVirtualScrollContainer()
      if (!entry || !container) return null

      this.scrollVirtualContainerTo(container, entry.scrollTop)
      const revivedTarget = await this.waitForCachedDoubaoOutlineTargetMount(item.id)
      return revivedTarget || super.resolveOutlineTarget(item, queryIndex)
    }

    return super.resolveOutlineTarget(item, queryIndex)
  }

  // ===== 大纲提取 =====

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const items: OutlineItem[] = []
    const container = this.getVirtualScrollContainer()
    if (!container) return items

    this.ensureOutlineCacheSession()

    const currentIds = new Set<string>()
    const isInTransition = this.isInOutlineCacheTransition()
    const refreshedCacheKeys = new Set<string>()

    const prepareCacheRefresh = (meta: DoubaoVirtualMessageMeta) => {
      if (isInTransition) return

      const key = this.getOutlineMessageKey(meta)
      if (refreshedCacheKeys.has(key)) return

      refreshedCacheKeys.add(key)
      this.clearOutlineCacheForMeta(meta)
    }

    const cacheCurrentItem = (
      item: OutlineItem,
      meta: DoubaoVirtualMessageMeta,
      scrollTop: number,
      orderInMessage: number,
      headingMatchIndex?: number,
    ) => {
      const id = this.buildOutlineItemId(meta, item, headingMatchIndex)
      item.id = id
      ;(item as OutlineItem & { scrollTop: number }).scrollTop = scrollTop
      currentIds.add(id)

      if (isInTransition) return

      prepareCacheRefresh(meta)
      this.outlineItemCache.set(id, {
        id,
        level: item.level,
        text: item.text,
        messageId: meta.messageId,
        rowIndex: meta.rowIndex,
        scrollTop,
        orderInMessage,
        headingMatchIndex,
        isUserQuery: item.isUserQuery,
        isTruncated: item.isTruncated,
        wordCount: item.wordCount,
      })
    }

    const collectHeadings = (
      root: ParentNode,
      meta: DoubaoVirtualMessageMeta,
      headingCounts: Map<string, number>,
      nextOrderInMessage: () => number,
      parentBlock?: Element | null,
    ) => {
      const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      headings.forEach((heading, index) => {
        const level = parseInt(heading.tagName[1], 10)
        if (level > maxLevel) return
        const text = heading.textContent?.trim() || ""
        if (!text) return

        const headingKey = `${level}:${text}`
        const headingMatchIndex = headingCounts.get(headingKey) || 0
        headingCounts.set(headingKey, headingMatchIndex + 1)

        let wordCount: number | undefined
        if (showWordCount) {
          let nextBoundaryEl: Element | null = null
          // Find the next heading of the SAME or HIGHER level (smaller number) as the boundary
          for (let i = index + 1; i < headings.length; i++) {
            const candidate = headings[i]
            const candidateLevel = parseInt(candidate.tagName[1], 10)
            if (candidateLevel <= level) {
              nextBoundaryEl = candidate
              break
            }
          }
          wordCount = this.calculateRangeWordCount(
            heading,
            nextBoundaryEl,
            parentBlock || container,
          )
        }

        const item: OutlineItem = {
          level,
          text,
          element: heading as HTMLElement,
          wordCount,
        }
        cacheCurrentItem(
          item,
          meta,
          this.getElementVirtualScrollTop(container, heading as HTMLElement),
          nextOrderInMessage(),
          headingMatchIndex,
        )
        items.push(item)
      })
    }

    const messageBlocks = Array.from(container.querySelectorAll(MESSAGE_BLOCK_SELECTOR)).filter(
      (block): block is HTMLElement => block instanceof HTMLElement,
    )

    let pendingUserQuery: {
      element: HTMLElement
      text: string
      meta: DoubaoVirtualMessageMeta
      scrollTop: number
    } | null = null

    const orderedUnits =
      messageBlocks.length > 0
        ? messageBlocks
        : Array.from(
            container.querySelectorAll(`${USER_QUERY_SELECTOR}, ${ASSISTANT_MESSAGE_SELECTOR}`),
          ).filter((message): message is HTMLElement => message instanceof HTMLElement)

    orderedUnits.forEach((unit, unitIndex) => {
      const meta = this.getVirtualMessageMeta(unit, unitIndex)
      const userMessage = unit.matches(USER_QUERY_SELECTOR)
        ? unit
        : (unit.querySelector(USER_QUERY_SELECTOR) as HTMLElement | null) ?? null

      if (userMessage) {
        const text = this.extractUserQueryMarkdown(userMessage)
        pendingUserQuery = text
          ? {
              element: userMessage,
              text,
              meta,
              scrollTop: this.getElementVirtualScrollTop(container, userMessage),
            }
          : null
      }

      const assistantRoots = this.getAssistantContentRoots(unit)
      if (assistantRoots.length === 0) {
        return
      }
      prepareCacheRefresh(meta)

      const aiWordCount = showWordCount
        ? assistantRoots.reduce((sum, root) => sum + (root.textContent?.length || 0), 0)
        : undefined

      if (pendingUserQuery) {
        const userItem: OutlineItem = {
          level: 0,
          text:
            pendingUserQuery.text.length > 80
              ? pendingUserQuery.text.slice(0, 80) + "..."
              : pendingUserQuery.text,
          element: pendingUserQuery.element,
          isUserQuery: true,
          isTruncated: pendingUserQuery.text.length > 80,
          wordCount: aiWordCount,
        }
        cacheCurrentItem(userItem, pendingUserQuery.meta, pendingUserQuery.scrollTop, 0)
        if (includeUserQueries) {
          items.push(userItem)
        }
      }

      const headingCounts = new Map<string, number>()
      let headingOrder = 0
      assistantRoots.forEach((root) =>
        collectHeadings(root, meta, headingCounts, () => headingOrder++, root),
      )
      pendingUserQuery = null
    })

    if (isInTransition) return items

    this.trimOutlineCache()
    return this.mergeCachedOutlineItems(
      items,
      currentIds,
      maxLevel,
      includeUserQueries,
      showWordCount,
    )
  }

  // ===== 导出配置 =====

  getExportConfig(): ExportConfig | null {
    return {
      userQuerySelector: USER_QUERY_SELECTOR,
      assistantResponseSelector: ASSISTANT_MESSAGE_SELECTOR,
      turnSelector: MESSAGE_BLOCK_SELECTOR,
      useShadowDOM: false,
    }
  }

  // ===== 主题 =====

  toggleTheme(): Promise<boolean> {
    return Promise.resolve(false)
  }

  // ===== 其他 =====

  isGenerating(): boolean {
    const stopBtn = document.querySelector('[data-testid="chat_input_local_break_button"]')
    return stopBtn !== null && (stopBtn as HTMLElement).offsetParent !== null
  }

  getStopButtonSelectors(): string[] {
    return ['[data-testid="chat_input_local_break_button"]']
  }

  getNewChatButtonSelectors(): string[] {
    return [NEW_CHAT_BUTTON_SELECTOR]
  }

  getSubmitButtonSelectors(): string[] {
    return [
      "[data-testid='chat_input_send_button']",
      "#flow-end-msg-send",
      ".send-btn-wrapper button",
    ]
  }

  getWidthSelectors(): Array<{ selector: string; property: string }> {
    return [
      { selector: '[data-container-name="main"]', property: "max-width" },
      // 兼容豆包不同版本的 Tailwind 转义类名
      { selector: ".max-w-\\(--content-max-width\\)", property: "max-width" },
      { selector: ".max-w-\\[var\\(--content-max-width\\)\\]", property: "max-width" },
      // 输入框区域会从上层 style 继承 --content-max-width，需要同步覆盖变量本身
      { selector: '[style*="--content-max-width"]', property: "--content-max-width" },
      // /code/chat 专用结构
      { selector: ".chrome70-container", property: "--center-content-max-width" },
    ]
  }

  getUserQueryWidthSelectors(): Array<{ selector: string; property: string }> {
    return [
      // 匹配豆包用户提问气泡本身的 max-width
      // 必须加上 .w-fit 限制，否则 [class*="max-w-"] 会错误匹配到外层的 .max-w-full 导致气泡右对齐布局崩溃
      {
        selector: `${USER_QUERY_SELECTOR} .w-fit[class*="max-w-"]`,
        property: "max-width",
      },
    ]
  }

  // ===== 专用滚动补偿与历史隔离机制 =====

  // 豆包新版采用虚拟列表，基类的 offsetTop 记录与恢复策略容易失效。
  // 因此我们独立覆写历史记录读取和恢复方法：
  // 1. 获取屏幕最顶部的一个可见对话段落，记录其前 50 字为特征签名
  // 2. 恢复时，在页面重寻此段落并将其对齐至屏幕顶部。
  getVisibleAnchorElement(): AnchorData | null {
    const container = this.getScrollContainer()
    if (!container) return null

    const selectors = this.getChatContentSelectors()
    if (!selectors.length) return null

    const candidates = Array.from(container.querySelectorAll(selectors.join(", ")))
    if (!candidates.length) return null

    const containerRect = container.getBoundingClientRect()
    let bestElement: Element | null = null

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i] as HTMLElement
      const rect = el.getBoundingClientRect()

      // 寻找顶部边缘正好在滚动容器可视区内（或略上方交界）的元素
      if (rect.top >= containerRect.top - 50 && rect.bottom <= containerRect.bottom + 50) {
        bestElement = el
        break
      } else if (rect.top <= containerRect.top && rect.bottom >= containerRect.top) {
        bestElement = el
        break
      }
    }

    if (!bestElement) {
      // 如果屏幕内全都是一个超长元素的内部，直接取处于可视区的该元素
      for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i] as HTMLElement
        const rect = el.getBoundingClientRect()
        if (rect.top < containerRect.top && rect.bottom > containerRect.bottom) {
          bestElement = el
          break
        }
      }
    }

    if (bestElement) {
      const globalIndex = candidates.indexOf(bestElement)
      if (globalIndex !== -1) {
        const textSignature = (bestElement.textContent || "").trim().substring(0, 50)
        // 在豆包的隔离策略中，忽略 offset，全靠元素对齐
        return { type: "index", index: globalIndex, offset: 0, textSignature }
      }
    }
    return null
  }

  scrollToOutlineTarget(element: HTMLElement): void {
    const container = this.getScrollContainer()
    if (!container) {
      super.scrollToOutlineTarget(element)
      return
    }

    const containerRect = container.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const targetScrollTop = container.scrollTop + elementRect.top - containerRect.top
    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: "instant",
      __bypassLock: true,
    } as any)
  }

  restoreScroll(anchorData: AnchorData): boolean {
    const container = this.getScrollContainer()
    if (!container || !anchorData) return false

    let targetElement: Element | null = null

    if (anchorData.type === "index" && typeof anchorData.index === "number") {
      const selectors = this.getChatContentSelectors()
      const candidates = Array.from(container.querySelectorAll(selectors.join(", ")))

      if (candidates[anchorData.index]) {
        targetElement = candidates[anchorData.index]
        if (anchorData.textSignature) {
          const currentText = (targetElement.textContent || "").trim().substring(0, 50)
          if (currentText !== anchorData.textSignature) {
            const found = candidates.find(
              (c) => (c.textContent || "").trim().substring(0, 50) === anchorData.textSignature,
            )
            if (found) targetElement = found
          }
        }
      } else if (anchorData.textSignature) {
        const found = candidates.find(
          (c) => (c.textContent || "").trim().substring(0, 50) === anchorData.textSignature,
        )
        if (found) targetElement = found
      }
    }

    if (targetElement) {
      this.scrollToOutlineTarget(targetElement as HTMLElement)
      return true
    }
    return false
  }
}
