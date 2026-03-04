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

import {
  SiteAdapter,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type ModelSwitcherConfig,
  type OutlineItem,
} from "./base"

/** 匹配 /chat/{id} 或 /code/chat/{id}，捕获会话 ID */
const chatPathPattern = /^(?:\/code)?\/chat\/([^/?#]+)/

export class DoubaoAdapter extends SiteAdapter {
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
    return ['textarea[data-testid="chat_input_input"]', "textarea.semi-input-textarea"]
  }

  insertPrompt(content: string): boolean {
    const el = this.getTextareaElement() as HTMLTextAreaElement | null
    if (!el || !el.isConnected) return false
    el.focus()
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
    return true
  }

  getConversationTitle(): string | null {
    const activeNode = document.querySelector('#chat_list_wrapper a[class*="active-"]')
    if (!activeNode) return null
    const activeLink =
      activeNode instanceof HTMLAnchorElement
        ? activeNode
        : (activeNode.closest("a") as HTMLAnchorElement | null)
    if (!activeLink) return null
    const title = activeLink.querySelector(
      '#chat_list_item_title, [class^="section-item-title-"], [class*="section-item-title-"]',
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
    const wrapper = document.querySelector("#chat_list_wrapper")
    if (!wrapper) return []
    const links = wrapper.querySelectorAll('a[href*="/chat/"]')
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
            '#chat_list_item_title, [class^="section-item-title-"], [class*="section-item-title-"]',
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
      `#chat_list_wrapper a[href*="/chat/${id}"]`,
    ) as HTMLElement | null
    if (link) {
      link.click()
      return true
    }
    window.location.href = url || `https://www.doubao.com/chat/${id}`
    return true
  }

  getSidebarScrollContainer(): Element | null {
    return document.querySelector("#chat_list_wrapper")
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    return {
      selector: '#chat_list_wrapper a[href*="/chat/"]',
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
              '#chat_list_item_title, [class^="section-item-title-"], [class*="section-item-title-"]',
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
          '#chat_list_item_title, [class^="section-item-title-"], [class*="section-item-title-"]',
        )
      },
    }
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
    return '[data-testid="send_message"]'
  }

  getChatContentSelectors(): string[] {
    return [
      '[data-testid="receive_message"] .flow-markdown-body',
      '[data-testid="message_text_content"]',
    ]
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
   * 与 ChatGPT 适配器相同的策略
   */
  protected simulateClick(element: HTMLElement): void {
    const eventTypes = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]
    for (const type of eventTypes) {
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 1,
        }),
      )
    }
  }

  // ===== 大纲提取 =====

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const items: OutlineItem[] = []
    const container = document.querySelector('[data-testid="message-list"]')
    if (!container) return items

    const collectHeadings = (root: ParentNode) => {
      root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading) => {
        const level = parseInt(heading.tagName[1], 10)
        if (level > maxLevel) return
        const text = heading.textContent?.trim() || ""
        if (!text) return
        items.push({
          level,
          text,
          element: heading,
          wordCount: showWordCount ? text.length : undefined,
        })
      })
    }

    const messageBlocks = container.querySelectorAll('[data-testid="union_message"]')

    // union_message 不存在时的 fallback：直接从消息列表中提取
    if (messageBlocks.length === 0) {
      if (includeUserQueries) {
        const userMessages = container.querySelectorAll('[data-testid="send_message"]')
        userMessages.forEach((userMsg) => {
          const text =
            userMsg.querySelector('[data-testid="message_text_content"]')?.textContent?.trim() || ""
          if (!text) return
          items.push({
            level: 0,
            text: text.length > 80 ? text.slice(0, 80) + "..." : text,
            element: userMsg,
            isUserQuery: true,
            isTruncated: text.length > 80,
            wordCount: showWordCount ? text.length : undefined,
          })
        })
      }
      container
        .querySelectorAll('[data-testid="receive_message"] .flow-markdown-body')
        .forEach((md) => collectHeadings(md))
      return items
    }

    messageBlocks.forEach((block) => {
      if (includeUserQueries) {
        const userMsg = block.querySelector('[data-testid="send_message"]')
        if (userMsg) {
          const text =
            userMsg.querySelector('[data-testid="message_text_content"]')?.textContent?.trim() || ""
          if (text) {
            items.push({
              level: 0,
              text: text.length > 80 ? text.slice(0, 80) + "..." : text,
              element: userMsg,
              isUserQuery: true,
              isTruncated: text.length > 80,
              wordCount: showWordCount ? text.length : undefined,
            })
          }
        }
      }

      const aiMsg = block.querySelector('[data-testid="receive_message"]')
      if (!aiMsg) return
      const markdown = aiMsg.querySelector(".flow-markdown-body")
      if (!markdown) return
      collectHeadings(markdown)
    })

    return items
  }

  // ===== 导出配置 =====

  getExportConfig(): ExportConfig | null {
    return {
      userQuerySelector: '[data-testid="send_message"]',
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
    return [{ selector: '[data-container-name="main"]', property: "max-width" }]
  }
}
