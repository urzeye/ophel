/**
 * ChatGPT 适配器 (chatgpt.com)
 */
import { SITE_IDS } from "~constants"
import { DOMToolkit } from "~utils/dom-toolkit"

import {
  SiteAdapter,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type MarkdownFixerConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
} from "./base"

const DEFAULT_TITLE = "ChatGPT"

export class ChatGPTAdapter extends SiteAdapter {
  match(): boolean {
    return window.location.hostname.includes("chatgpt.com")
  }

  getSiteId(): string {
    return SITE_IDS.CHATGPT
  }

  getName(): string {
    return "ChatGPT"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#10a37f", secondary: "#1a7f64" }
  }

  getNewTabUrl(): string {
    return "https://chatgpt.com"
  }

  isNewConversation(): boolean {
    const path = window.location.pathname
    return path === "/" || path === ""
  }

  /**
   * 获取当前账户标识（用于会话隔离）
   * ChatGPT 通过 localStorage._account 区分不同账户/团队
   * 值可能为 "personal" 或团队 UUID
   */
  getCurrentCid(): string | null {
    try {
      const account = localStorage.getItem("_account")
      if (account) {
        // localStorage 存储的值带双引号（如 "personal"），需要 JSON.parse
        return JSON.parse(account)
      }
    } catch (e) {
      // 静默处理解析错误
    }
    return null
  }

  // ==================== 会话管理 ====================

  getConversationList(): ConversationInfo[] {
    // 侧边栏会话列表：#history 内的 a[data-sidebar-item]
    const items = document.querySelectorAll('#history a[data-sidebar-item="true"]') || []
    const cid = this.getCurrentCid() || undefined

    return Array.from(items)
      .map((el) => {
        const href = el.getAttribute("href") || ""
        // href 格式: /c/695df822-1e68-8331-9efb-bf1cc0e8820d
        const idMatch = href.match(/\/c\/([a-f0-9-]+)/)
        const id = idMatch ? idMatch[1] : ""
        const titleEl = el.querySelector("span")
        const title = titleEl?.textContent?.trim() || ""
        const isActive = el.hasAttribute("data-active")

        // 检测置顶：置顶的会话在 trailing 区域有额外的图标
        const trailingPair = el.querySelector(".trailing-pair")
        const trailingIcons = trailingPair?.querySelectorAll(".trailing svg") || []
        const isPinned = trailingIcons.length > 1 // 置顶会话有多个图标

        return {
          id,
          cid,
          title,
          url: id ? `https://chatgpt.com/c/${id}` : "",
          isActive,
          isPinned,
        }
      })
      .filter((c) => c.id)
  }

  getSidebarScrollContainer(): Element | null {
    // 侧边栏滚动容器 - 通过 #history 向上查找最近的 nav 元素
    const history = document.querySelector("#history")
    if (history) {
      const nav = history.closest("nav")
      if (nav) return nav
    }
    return null
  }

  getConversationObserverConfig(): ConversationObserverConfig {
    return {
      selector: '#history a[data-sidebar-item="true"]',
      shadow: false,
      extractInfo: (el) => {
        const href = el.getAttribute("href") || ""
        const idMatch = href.match(/\/c\/([a-f0-9-]+)/)
        const id = idMatch ? idMatch[1] : ""
        if (!id) return null
        const titleEl = el.querySelector("span")
        const title = titleEl?.textContent?.trim() || ""
        const isActive = el.hasAttribute("data-active")
        const cid = this.getCurrentCid() || undefined
        // 检测置顶
        const trailingPair = el.querySelector(".trailing-pair")
        const trailingIcons = trailingPair?.querySelectorAll(".trailing svg") || []
        const isPinned = trailingIcons.length > 1
        return {
          id,
          cid,
          title,
          url: `https://chatgpt.com/c/${id}`,
          isActive,
          isPinned,
        }
      },
      getTitleElement: (el) => el.querySelector("span") || el,
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    // 通过 href 属性查找侧边栏链接
    const sidebarLink = document.querySelector(
      `#history a[href="/c/${id}"], a[data-sidebar-item][href="/c/${id}"]`,
    ) as HTMLElement | null

    if (sidebarLink) {
      sidebarLink.click()
      return true
    }
    // 降级：页面刷新
    return super.navigateToConversation(id, url)
  }

  getSessionName(): string | null {
    // 尝试从页面标题获取
    const title = document.title
    if (title && title !== DEFAULT_TITLE) {
      return title.replace(` | ${DEFAULT_TITLE}`, "").replace(` - ${DEFAULT_TITLE}`, "").trim()
    }
    return super.getSessionName()
  }

  getConversationTitle(): string | null {
    // 从侧边栏获取当前选中项
    const selected = document.querySelector("#history a[data-active] span")
    if (selected) return selected.textContent?.trim() || null
    return null
  }

  getNewChatButtonSelectors(): string[] {
    return [
      '[data-testid="create-new-chat-button"]',
      'a[href="/"]',
      'button[aria-label="New chat"]',
      'button[aria-label="新对话"]',
    ]
  }

  getLatestReplyText(): string | null {
    // TODO: 需要分析 ChatGPT 的回复结构
    const container = document.querySelector(this.getResponseContainerSelector())
    if (!container) return null

    // ChatGPT 的回复通常在 [data-message-author-role="assistant"] 中
    const responses = container.querySelectorAll('[data-message-author-role="assistant"]')
    if (responses.length === 0) return null

    const lastResponse = responses[responses.length - 1]
    return this.extractTextWithLineBreaks(lastResponse)
  }

  // ==================== 页面宽度控制 ====================

  getWidthSelectors() {
    // ChatGPT 使用 CSS 变量 --thread-content-max-width 控制内容宽度
    // 选择器匹配带有该变量的容器
    return [
      { selector: '[class*="thread-content-max-width"]', property: "max-width" },
      { selector: '[style*="--thread-content-max-width"]', property: "max-width" },
    ]
  }

  getUserQueryWidthSelectors() {
    // ChatGPT 用户消息气泡使用 CSS 变量 --user-chat-width 控制宽度
    // 需要在 :root 级别设置变量，然后会自动应用到 .user-message-bubble-color
    return [
      {
        selector: ":root",
        property: "--user-chat-width",
        noCenter: true,
      },
    ]
  }

  getMarkdownFixerConfig(): MarkdownFixerConfig {
    return {
      selector: '[data-message-author-role="assistant"] p',
      fixSpanContent: false,
      shouldSkip: (element) => {
        if (!this.isGenerating()) return false

        // 查找当前元素所属的消息容器
        const messageContainer = element.closest('[data-message-author-role="assistant"]')
        if (!messageContainer) return false

        // 查找页面上最后一个 AI 消息容器（即正在生成的那个）
        const allMessages = document.querySelectorAll(
          this.getChatContentSelectors().find((s) => s.includes("assistant")) ||
            '[data-message-author-role="assistant"]',
        )
        const lastMessage = allMessages[allMessages.length - 1]

        // 如果当前元素位于正在生成的消息中，强制跳过（等待生成结束后通过重试机制修复）
        return messageContainer === lastMessage
      },
    }
  }

  // ==================== 输入框操作 ====================

  getTextareaSelectors(): string[] {
    return ["#prompt-textarea", 'textarea[data-id="root"]', '[contenteditable="true"]']
  }

  getSubmitButtonSelectors(): string[] {
    return [
      '[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="发送"]',
    ]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (element.offsetParent === null) return false
    if (element.closest(".gh-main-panel")) return false
    return element.id === "prompt-textarea" || element.getAttribute("contenteditable") === "true"
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
      // 尝试使用 execCommand
      document.execCommand("selectAll", false, undefined)
      const success = document.execCommand("insertText", false, content)
      if (!success) throw new Error("execCommand returned false")
    } catch (e) {
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
    const container = document.querySelector(
      '[class*="scrollbar-gutter"], [class*="@container/main"] > div',
    ) as HTMLElement
    if (container && container.scrollHeight > container.clientHeight) {
      return container
    }

    // 回退：查找 scrollHeight 最大的可滚动 div
    const allDivs = document.querySelectorAll("div")
    let bestContainer: HTMLElement | null = null
    let maxScrollHeight = 0
    for (const div of Array.from(allDivs)) {
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
    // ChatGPT 聊天内容区域 - #thread 或 main
    return "#thread, main#main"
  }

  getChatContentSelectors(): string[] {
    return [
      '[data-message-author-role="assistant"]',
      '[data-message-author-role="user"]',
      ".markdown",
    ]
  }

  // ==================== 大纲提取 ====================

  getUserQuerySelector(): string {
    return '[data-message-author-role="user"]'
  }

  extractUserQueryText(element: Element): string {
    return this.extractTextWithLineBreaks(element)
  }

  extractUserQueryMarkdown(element: Element): string {
    // ChatGPT 用户消息通常是纯文本
    return element.textContent?.trim() || ""
  }

  /**
   * 检查元素是否应跳过（屏幕阅读器专用元素）
   * ChatGPT 使用 .sr-only 类标记屏幕阅读器辅助文本
   */
  private shouldSkipElement(element: Element): boolean {
    return element.classList.contains("sr-only")
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
    const textContainer = element.querySelector(".whitespace-pre-wrap")
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
    return {
      userQuerySelector: '[data-message-author-role="user"]',
      assistantResponseSelector: '[data-message-author-role="assistant"]',
      turnSelector: '[data-testid^="conversation-turn"]',
      useShadowDOM: false,
    }
  }

  extractOutline(maxLevel = 6, includeUserQueries = false): OutlineItem[] {
    const outline: OutlineItem[] = []
    const container = document.querySelector(this.getResponseContainerSelector())
    if (!container) return outline

    if (!includeUserQueries) {
      const headingSelectors: string[] = []
      for (let i = 1; i <= maxLevel; i++) {
        headingSelectors.push(`h${i}`)
      }

      const headings = container.querySelectorAll(headingSelectors.join(", "))
      headings.forEach((heading) => {
        // 跳过 .sr-only 元素
        if (this.shouldSkipElement(heading)) return
        if (this.isInRenderedMarkdownContainer(heading)) return
        const level = parseInt(heading.tagName.charAt(1), 10)
        if (level <= maxLevel) {
          outline.push({
            level,
            text: heading.textContent?.trim() || "",
            element: heading,
          })
        }
      })
      return outline
    }

    // 包含用户提问的模式
    const userQuerySelector = this.getUserQuerySelector()
    const headingSelectors: string[] = []
    for (let i = 1; i <= maxLevel; i++) {
      headingSelectors.push(`h${i}`)
    }

    const combinedSelector = `${userQuerySelector}, ${headingSelectors.join(", ")}`
    const allElements = container.querySelectorAll(combinedSelector)

    allElements.forEach((element) => {
      const tagName = element.tagName.toLowerCase()
      const isUserQuery = element.matches(userQuerySelector)

      if (isUserQuery) {
        let queryText = this.extractUserQueryText(element)
        let isTruncated = false
        if (queryText.length > 200) {
          queryText = queryText.substring(0, 200)
          isTruncated = true
        }

        outline.push({
          level: 0,
          text: queryText,
          element,
          isUserQuery: true,
          isTruncated,
        })
      } else if (/^h[1-6]$/.test(tagName)) {
        // 跳过 .sr-only 元素
        if (this.shouldSkipElement(element)) return
        if (this.isInRenderedMarkdownContainer(element)) return
        const level = parseInt(tagName.charAt(1), 10)
        if (level <= maxLevel) {
          outline.push({
            level,
            text: element.textContent?.trim() || "",
            element,
          })
        }
      }
    })

    return outline
  }

  // ==================== 生成状态检测 ====================

  isGenerating(): boolean {
    // ChatGPT 生成时会显示 stop 按钮
    const stopBtn = document.querySelector('[data-testid="stop-button"]')
    return stopBtn !== null && (stopBtn as HTMLElement).offsetParent !== null
  }

  getModelName(): string | null {
    // 从模型选择器按钮获取
    const modelBtn = document.querySelector('[data-testid="model-switcher-dropdown-button"]')
    if (modelBtn) {
      // 优先从 aria-label 提取（格式："模型选择器，当前模型为 5.2"）
      const ariaLabel = modelBtn.getAttribute("aria-label")
      if (ariaLabel) {
        const match = ariaLabel.match(/(?:模型为|model is)\s*(.+)/i)
        if (match) return match[1].trim()
      }
      // 回退：获取内部文本
      const versionSpan = modelBtn.querySelector(".text-token-text-tertiary")
      if (versionSpan) return versionSpan.textContent?.trim() || null
      return modelBtn.textContent?.trim() || null
    }
    // 回退：从最新消息的 data-message-model-slug 获取
    const lastMsg = document.querySelector("[data-message-model-slug]")
    if (lastMsg) {
      return lastMsg.getAttribute("data-message-model-slug")
    }
    return null
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
    return {
      urlPatterns: ["conversation", "backend-api"],
      silenceThreshold: 3000,
    }
  }

  // ==================== 模型锁定 ====================

  getDefaultLockSettings(): { enabled: boolean; keyword: string } {
    return { enabled: false, keyword: "" }
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: [
        '[data-testid="model-switcher-dropdown-button"]',
        '[aria-haspopup="menu"][aria-label*="模型"]',
        '[aria-haspopup="menu"][aria-label*="model"]',
      ],
      // ChatGPT 使用 Radix UI，菜单项带有 data-radix-collection-item 属性
      menuItemSelector:
        '[data-radix-collection-item][role="menuitem"], [role="menuitem"], [role="option"]',
      checkInterval: 1000,
      maxAttempts: 15,
      menuRenderDelay: 500, // ChatGPT 菜单渲染较慢，增加延迟
      // 语言无关：通过 aria-haspopup 检测子菜单触发器
      subMenuSelector: '[aria-haspopup="menu"]',
      // 文字备选（多语言）
      subMenuTriggers: ["传统", "legacy", "more"],
    }
  }

  /**
   * 覆盖点击模拟方法
   * ChatGPT 使用 Radix UI，需要完整的 PointerEvent 序列才能触发菜单
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

      // 2. 直接修改 html.className 实现即时视觉变化
      // ChatGPT 通过 html 元素的 class 控制主题：class="dark" 或 class="light"
      document.documentElement.className = targetMode

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
