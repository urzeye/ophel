/**
 * 豆包适配器（www.doubao.com）
 *
 * 选择器策略：
 * - 优先使用 data-testid 属性 - 稳定，不受 CSS Modules 哈希影响
 * - 使用元素 ID（如 #chat_list_wrapper）- 稳定
 * - class 前缀匹配仅作兜底（如 [class^="section-item-title-"]）
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
} from "./base"

/** 匹配 /chat/{id} 或 /code/chat/{id}，捕获会话 ID */
const chatPathPattern = /^(?:\/code)?\/chat\/([^/?#]+)/
const LEGACY_USER_QUERY_SELECTOR = '[data-testid="send_message"]'
const NEW_USER_QUERY_SELECTOR = '[data-testid="message_content"].justify-end'
const USER_QUERY_SELECTOR = `${LEGACY_USER_QUERY_SELECTOR}, ${NEW_USER_QUERY_SELECTOR}`
const USER_QUERY_TEXT_SELECTOR = '[data-testid="message_text_content"]'
const DOUBAO_DELETE_REASON = {
  UI_FAILED: "delete_ui_failed",
  BATCH_ABORTED_AFTER_UI_FAILURE: "delete_batch_aborted_after_ui_failure",
} as const

export class DoubaoAdapter extends SiteAdapter {
  // 滚动补偿状态记录
  private lastScrollHeight = 0
  private lastScrollTop = 0

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

  getConversationTitle(): string | null {
    const activeNode = document.querySelector(
      'a[data-testid="chat_list_thread_item"][class*="active-"]',
    )
    if (!activeNode) return null
    const activeLink =
      activeNode instanceof HTMLAnchorElement
        ? activeNode
        : (activeNode.closest("a") as HTMLAnchorElement | null)
    if (!activeLink) return null
    const title = activeLink.querySelector(
      '[data-testid="chat_list_item_title"], [class^="section-item-title-"], [class*="section-item-title-"]',
    )
    return title?.textContent?.trim() || null
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

  getNewTabUrl(): string {
    const prefix = window.location.pathname.startsWith("/code/") ? "/code" : ""
    return `https://www.doubao.com${prefix}/chat/`
  }

  supportsNewTab(): boolean {
    return true
  }

  // ===== 会话列表 =====

  getConversationList(): ConversationInfo[] {
    const links = document.querySelectorAll('a[data-testid="chat_list_thread_item"]')
    if (!links.length) return []
    const conversationMap = new Map<string, ConversationInfo>()

    links.forEach((linkEl) => {
      const link = linkEl as HTMLAnchorElement
      const href = link.getAttribute("href") || ""
      const idMatch = href.match(chatPathPattern)
      const id = idMatch?.[1]
      if (!id || id === "new") return

      const title =
        link
          .querySelector(
            '[data-testid="chat_list_item_title"], [class^="section-item-title-"], [class*="section-item-title-"]',
          )
          ?.textContent?.trim() || ""

      const isActive = link.className.includes("active-")
      const isPinned = !!link.querySelector(
        '[id="chat_list_item_pin_icon"], [class^="pin-"], [class*="pin-"]',
      )

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
      `a[data-testid="chat_list_thread_item"][href*="/chat/${id}"]`,
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

      const links = container.querySelectorAll('a[data-testid="chat_list_thread_item"]')
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
    return document.querySelector('[data-testid="chat_list_wrapper"]')
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    return {
      selector: 'a[data-testid="chat_list_thread_item"]',
      shadow: false,
      extractInfo: (el: Element): ConversationInfo | null => {
        const link = el as HTMLAnchorElement
        const href = link.getAttribute("href") || ""
        const idMatch = href.match(chatPathPattern)
        const id = idMatch?.[1]
        if (!id || id === "new") return null

        const title =
          link
            .querySelector(
              '[data-testid="chat_list_item_title"], [class^="section-item-title-"], [class*="section-item-title-"]',
            )
            ?.textContent?.trim() || ""

        return {
          id,
          title,
          url: `https://www.doubao.com/chat/${id}`,
          isActive: link.className.includes("active-"),
          isPinned: !!link.querySelector(
            '[id="chat_list_item_pin_icon"], [class^="pin-"], [class*="pin-"]',
          ),
        }
      },
      getTitleElement: (el: Element): Element | null => {
        return el.querySelector(
          '[data-testid="chat_list_item_title"], [class^="section-item-title-"], [class*="section-item-title-"]',
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
    // 根据豆包的 DOM 结构，真正的滚动容器是一个有 scrollable=* 类的 div，其父级或者自身可能是 data-testid="scroll_view"
    // 但它的 class 带有随机哈希，如 .scrollable-Se7zNt
    // 我们使用稳定的选择器：带有 [scrollable="true"] 属性或者 [data-testid="scroll_view"] 内的第一个带有可滚动 class 的元素

    // 策略 1：根据特征选择（豆包现在的结构：带有特定前缀 class 并且是 column-reverse 的节点）
    const messageList = document.querySelector('[data-testid="message-list"]')
    if (messageList) {
      // 向上寻找具有 overflow-y: scroll 且 height > 0 的容器
      let current: HTMLElement | null = messageList.parentElement
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current)
        if (
          (style.overflowY === "scroll" || style.overflowY === "auto") &&
          current.scrollHeight > current.clientHeight
        ) {
          return current
        }
        current = current.parentElement
      }
    }

    // 策略 2：基于具有 column-reverse 特征的随机 class 前缀匹配（不太稳定但可作降级）
    const scrollContainers = document.querySelectorAll('[class^="scrollable-"]')
    for (const el of scrollContainers) {
      const style = window.getComputedStyle(el)
      if (style.flexDirection === "column-reverse" && el.scrollHeight > el.clientHeight) {
        return el as HTMLElement
      }
    }

    return document.querySelector('[data-testid="scroll_view"]') as HTMLElement | null
  }

  getResponseContainerSelector(): string {
    return '[data-testid="message-list"]'
  }

  getUserQuerySelector(): string | null {
    return USER_QUERY_SELECTOR
  }

  getChatContentSelectors(): string[] {
    return ['[data-testid="receive_message"] .flow-markdown-body', USER_QUERY_TEXT_SELECTOR]
  }

  private extractAssistantMarkdown(element: Element): string {
    const markdown = element.matches(".flow-markdown-body")
      ? element
      : element.querySelector(".flow-markdown-body")
    const target = (markdown || element).cloneNode(true) as HTMLElement

    target
      .querySelectorAll('button, [role="button"], svg, [aria-hidden="true"]')
      .forEach((node) => node.remove())

    const content = htmlToMarkdown(target).trim()
    if (content) {
      return content
    }

    return this.extractTextWithLineBreaks(target).trim()
  }

  getLatestReplyText(): string | null {
    const responses = document.querySelectorAll('[data-testid="receive_message"]')
    if (responses.length === 0) return null

    const last = responses[responses.length - 1]
    const text = this.extractAssistantMarkdown(last)
    return text || null
  }

  private getUserMessageTextContainer(element: Element): HTMLElement | null {
    if (element.matches(USER_QUERY_TEXT_SELECTOR)) {
      return element as HTMLElement
    }
    return element.querySelector(USER_QUERY_TEXT_SELECTOR) as HTMLElement | null
  }

  extractUserQueryMarkdown(element: Element): string {
    const textContainer = this.getUserMessageTextContainer(element)
    return textContainer?.textContent?.trim() || ""
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

    const confirmButton = await this.waitForDeleteConfirmButton(2500)
    if (!confirmButton) {
      return false
    }
    this.simulateClick(confirmButton)

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
    return document.querySelector(
      `#conversation_${id}, a[data-testid="chat_list_thread_item"][href*="/chat/${id}"]`,
    ) as HTMLElement | null
  }

  private getConversationMenuButtons(row: HTMLElement, id: string): HTMLElement[] {
    const actionSelector = `[data-testid="chat_list_item_setting_more_${id}"]`
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

    const actionRoot = row.querySelector(actionSelector) as HTMLElement | null
    if (!actionRoot) return []

    const trigger = actionRoot.querySelector(
      'button[data-slot="dropdown-menu-trigger"][aria-haspopup="menu"]',
    ) as HTMLElement | null
    const innerButton = actionRoot.querySelector(
      'button[data-dbx-name="button"]',
    ) as HTMLElement | null
    const entry = actionRoot.querySelector(
      '[data-testid="chat_item_dropdown_entry"]',
    ) as HTMLElement | null
    const entryButton = entry?.closest("button") as HTMLElement | null

    push(trigger)
    push(innerButton)
    push(entryButton)
    push(actionRoot)

    return [...visibleButtons, ...hiddenButtons]
  }

  private async openConversationMenu(row: HTMLElement, id: string): Promise<boolean> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      row.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
      row.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))

      const candidates = this.getConversationMenuButtons(row, id)
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
      const direct = document.querySelector(
        '[data-radix-popper-content-wrapper] [data-testid="chat_item_menu_remove_icon"]',
      ) as HTMLElement | null
      const directItem = direct?.closest(
        '[role="menuitem"][data-slot="dropdown-menu-item"]',
      ) as HTMLElement | null
      if (this.isVisible(directItem)) {
        return directItem
      }

      const items = Array.from(
        document.querySelectorAll(
          '[data-radix-popper-content-wrapper] [role="menuitem"][data-slot="dropdown-menu-item"]',
        ),
      ) as HTMLElement[]

      for (const item of items) {
        if (!this.isVisible(item)) continue
        if (this.getSignalText(item).includes("删除")) {
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
        const explicit = dialog.querySelector('button[aria-label="confirm"]') as HTMLElement | null
        if (this.isVisible(explicit)) {
          return explicit
        }

        const buttons = Array.from(dialog.querySelectorAll("button")) as HTMLElement[]
        for (const button of buttons) {
          if (!this.isVisible(button)) continue
          if (this.getSignalText(button).includes("删除")) {
            return button
          }
        }
      }

      await this.sleep(80)
    }

    return null
  }

  private findVisibleDeleteDialog(): HTMLElement | null {
    const dialogs = Array.from(
      document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="dialog"]'),
    ) as HTMLElement[]
    return (
      dialogs.find(
        (dialog) => this.isVisible(dialog) && this.getSignalText(dialog).includes("删除"),
      ) || null
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

    const hoverTarget = button.closest(
      `[data-testid^="chat_list_item_setting_more_"]`,
    ) as HTMLElement | null
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

  // ===== 大纲提取 =====

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const items: OutlineItem[] = []
    const container = document.querySelector('[data-testid="message-list"]')
    if (!container) return items

    const collectHeadings = (root: ParentNode, parentBlock?: Element | null) => {
      const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      headings.forEach((heading, index) => {
        const level = parseInt(heading.tagName[1], 10)
        if (level > maxLevel) return
        const text = heading.textContent?.trim() || ""
        if (!text) return

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

        items.push({
          level,
          text,
          element: heading as HTMLElement,
          wordCount,
        })
      })
    }

    const messageBlocks = container.querySelectorAll('[data-testid="union_message"]')

    // union_message 不存在时的 fallback：直接从消息列表中提取
    if (messageBlocks.length === 0) {
      if (includeUserQueries) {
        const userMessages = container.querySelectorAll(USER_QUERY_SELECTOR)
        userMessages.forEach((userMsg) => {
          const text = this.extractUserQueryMarkdown(userMsg)
          if (!text) return

          let wordCount: number | undefined
          if (showWordCount) {
            // Find the immediate next receive_message manually in fallback mode
            let nextRoot = userMsg.nextElementSibling
            while (nextRoot && !nextRoot.querySelector('[data-testid="receive_message"]')) {
              nextRoot = nextRoot.nextElementSibling
            }
            if (nextRoot) {
              const md = nextRoot.querySelector(".flow-markdown-body")
              wordCount = md?.textContent?.length || 0
            }
          }

          items.push({
            level: 0,
            text: text.length > 80 ? text.slice(0, 80) + "..." : text,
            element: userMsg as HTMLElement,
            isUserQuery: true,
            isTruncated: text.length > 80,
            wordCount,
          })
        })
      }
      container
        .querySelectorAll('[data-testid="receive_message"] .flow-markdown-body')
        .forEach((md) => collectHeadings(md))
      return items
    }

    messageBlocks.forEach((block) => {
      let aiWordCount = 0
      const aiMsg = block.querySelector('[data-testid="receive_message"]')
      const markdown = aiMsg?.querySelector(".flow-markdown-body")
      if (markdown && showWordCount) {
        aiWordCount = markdown.textContent?.length || 0
      }

      if (includeUserQueries) {
        const userMsg = block.querySelector(USER_QUERY_SELECTOR)
        if (userMsg) {
          const text = this.extractUserQueryMarkdown(userMsg)
          if (text) {
            items.push({
              level: 0,
              text: text.length > 80 ? text.slice(0, 80) + "..." : text,
              element: userMsg as HTMLElement,
              isUserQuery: true,
              isTruncated: text.length > 80,
              wordCount: showWordCount ? aiWordCount : undefined,
            })
          }
        }
      }

      if (markdown) {
        collectHeadings(markdown, markdown)
      }
    })

    return items
  }

  // ===== 导出配置 =====

  getExportConfig(): ExportConfig | null {
    return {
      userQuerySelector: USER_QUERY_SELECTOR,
      assistantResponseSelector: '[data-testid="receive_message"]',
      turnSelector: null,
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

  getNewChatButtonSelectors(): string[] {
    return ["#create_conversation_button"]
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
      // 匹配豆包新的 DOM 结构里限制对话区宽度的容器
      {
        selector: '[data-testid="message-block-container"]',
        property: "--message-block-container-inline-width",
      },
      { selector: ".max-w-\\(--content-max-width\\)", property: "max-width" },
      // /code/chat 专用结构
      { selector: ".chrome70-container", property: "--center-content-max-width" },
    ]
  }

  getUserQueryWidthSelectors(): Array<{ selector: string; property: string }> {
    return [
      // 匹配豆包用户提问气泡本身的 max-width
      // 必须加上 .w-fit 限制，否则 [class*="max-w-"] 会错误匹配到外层的 .max-w-full 导致气泡右对齐布局崩溃
      {
        selector: '[data-testid="send_message"] .w-fit[class*="max-w-"]',
        property: "max-width",
      },
      {
        selector:
          '[data-testid="message_content"].justify-end [data-testid="message_text_content"].w-fit[class*="max-w-"]',
        property: "max-width",
      },
    ]
  }

  // ===== 专用滚动补偿与历史隔离机制 (针对豆包 column-reverse 特殊处理) =====

  // 豆包采用 column-reverse 逆向布局，基类的 scrollTop 与 offsetTop 记录与恢复策略全盘失效。
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
      targetElement.scrollIntoView({ block: "start", behavior: "instant" })

      // 因为豆包反向滚动的复杂性，执行 scrollIntoView 后立刻同步历史高度避免 ResizeObserver 误报
      setTimeout(() => {
        this.lastScrollHeight = container.scrollHeight
        this.lastScrollTop = container.scrollTop
      }, 50)
      return true
    }
    return false
  }
}
