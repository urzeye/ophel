/**
 * Gemini 标准版适配器 (gemini.google.com)
 */
import { SITE_IDS } from "~constants"
import { DOMToolkit } from "~utils/dom-toolkit"

import {
  SiteAdapter,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
} from "./base"

export class GeminiAdapter extends SiteAdapter {
  private getUserPathPrefix(): string {
    // Gemini 多账号路径格式：/u/2/app/...
    const match = window.location.pathname.match(/^\/u\/(\d+)(?:\/|$)/)
    // - 若当前 URL 本身没有 /u/ 前缀：保持空前缀（生成 /app/...）
    // - 若带 /u/n ：使用 /u/n
    if (!match) return ""
    const idx = match[1]
    return `/u/${idx}`
  }

  getCurrentCid(): string {
    // gemini 使用 /u/<n> 作为账号隔离标识；无 /u/ 前缀时视为主账号 /u/0。
    const match = window.location.pathname.match(/^\/u\/(\d+)(?:\/|$)/)
    return match ? match[1] : "0"
  }

  match(): boolean {
    return (
      window.location.hostname.includes("gemini.google") &&
      !window.location.hostname.includes("business.gemini.google")
    )
  }

  getSiteId(): string {
    return SITE_IDS.GEMINI
  }

  getName(): string {
    return "Gemini"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#4285f4", secondary: "#34a853" }
  }

  getNewTabUrl(): string {
    return `https://gemini.google.com${this.getUserPathPrefix()}/app`
  }

  isNewConversation(): boolean {
    const path = window.location.pathname.replace(/^\/u\/\d+/, "")
    // 普通新对话
    if (path === "/app" || path === "/app/") return true
    // Gem 相关页面：创建、编辑、使用 gem 新对话
    if (path === "/gems/create" || path === "/gems/create/") return true
    if (path.startsWith("/gems/edit/")) return true
    // /gem/{gem_id} 是使用 gem 新对话，/gem/{gem_id}/{session_id} 是已有对话
    if (path.startsWith("/gem/")) {
      const parts = path.split("/").filter(Boolean) // ["gem", "gem_id"] 或 ["gem", "gem_id", "session_id"]
      return parts.length <= 2 // 只有 gem_id，没有 session_id
    }
    return false
  }

  // ==================== 会话管理 ====================

  getConversationList(): ConversationInfo[] {
    const items = (DOMToolkit.query(".conversation", { all: true }) as Element[]) || []
    const cid = this.getCurrentCid()
    const prefix = this.getUserPathPrefix()
    return Array.from(items)
      .map((el) => {
        const jslog = el.getAttribute("jslog") || ""
        const idMatch = jslog.match(/\["c_([^"]+)"/)
        const id = idMatch ? idMatch[1] : ""
        const title = el.querySelector(".conversation-title")?.textContent?.trim() || ""
        const isPinned = !!el.querySelector('mat-icon[fonticon="push_pin"]')

        return {
          id,
          cid,
          title,
          url: id ? `https://gemini.google.com${prefix}/app/${id}` : "",
          isActive: el.classList.contains("selected"),
          isPinned,
        }
      })
      .filter((c) => c.id)
  }

  getSidebarScrollContainer(): Element | null {
    return (
      (DOMToolkit.query('infinite-scroller[scrollable="true"]') as Element) ||
      (DOMToolkit.query("infinite-scroller") as Element)
    )
  }

  getConversationObserverConfig(): ConversationObserverConfig {
    return {
      selector: ".conversation",
      shadow: false,
      extractInfo: (el) => {
        const jslog = el.getAttribute("jslog") || ""
        const idMatch = jslog.match(/\["c_([^"]+)"/)
        const id = idMatch ? idMatch[1] : ""
        if (!id) return null
        const title = el.querySelector(".conversation-title")?.textContent?.trim() || ""
        const isPinned = !!el.querySelector('mat-icon[fonticon="push_pin"]')
        const cid = this.getCurrentCid()
        const prefix = this.getUserPathPrefix()
        return {
          id,
          cid,
          title,
          url: `https://gemini.google.com${prefix}/app/${id}`,
          isPinned,
        }
      },
      getTitleElement: (el) => el.querySelector(".conversation-title") || el,
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    // 通过 jslog 属性查找侧边栏会话元素
    const sidebarItem = document.querySelector(
      `.conversation[jslog*="${id}"]`,
    ) as HTMLElement | null
    if (sidebarItem) {
      const btn =
        sidebarItem.querySelector("button.list-item") || sidebarItem.querySelector("button")
      if (btn) (btn as HTMLElement).click()
      else sidebarItem.click()
      return true
    }
    // 降级：页面刷新
    return super.navigateToConversation(id, url)
  }

  getSessionName(): string | null {
    const titleEl = document.querySelector(".conversation-title")
    if (titleEl) {
      const name = titleEl.textContent?.trim()
      if (name) return name
    }
    return super.getSessionName()
  }

  getConversationTitle(): string | null {
    // 尝试从侧边栏获取选中项
    const selected = document.querySelector(".conversation.selected .conversation-title")
    if (selected) return selected.textContent?.trim() || null
    return null
  }

  getNewChatButtonSelectors(): string[] {
    return [
      ".new-chat-button",
      ".chat-history-new-chat-button",
      '[aria-label="New chat"]',
      '[aria-label="新对话"]',
      '[aria-label="发起新对话"]',
      '[data-testid="new-chat-button"]',
      '[data-test-id="new-chat-button"]',
      '[data-test-id="expanded-button"]',
      '[data-test-id="temp-chat-button"]',
      'button[aria-label="临时对话"]',
    ]
  }

  getLatestReplyText(): string | null {
    const container = document.querySelector(this.getResponseContainerSelector())
    if (!container) return null

    // 查找所有的 model-response
    const responses = container.querySelectorAll("model-response")
    if (responses.length === 0) return null

    const lastResponse = responses[responses.length - 1]

    // 尝试获取文本容器，避免包含无关 UI
    const textContainer = lastResponse.querySelector(".model-response-text") || lastResponse

    return this.extractTextWithLineBreaks(textContainer)
  }

  // ==================== 页面宽度 ====================

  // ==================== 页面宽度控制 ====================

  getWidthSelectors() {
    return [
      { selector: ".conversation-container", property: "max-width" },
      { selector: ".input-area-container", property: "max-width" },
      // 用户消息右对齐
      {
        selector: "user-query",
        property: "max-width",
        value: "100%",
        noCenter: true,
        extraCss: "display: flex !important; justify-content: flex-end !important;",
      },
      {
        selector: ".user-query-container",
        property: "max-width",
        value: "100%",
        noCenter: true,
        extraCss: "justify-content: flex-end !important;",
      },
    ]
  }

  /** 用户问题宽度选择器 */
  getUserQueryWidthSelectors() {
    return [
      {
        selector: ".user-query-bubble-with-background:not(.edit-mode)",
        property: "max-width",
        noCenter: true, // 用户问题不需要居中
      },
    ]
  }

  // ==================== 输入框操作 ====================

  getTextareaSelectors(): string[] {
    return [
      'div[contenteditable="true"].ql-editor',
      'div[contenteditable="true"]',
      '[role="textbox"]',
      '[aria-label*="Enter a prompt"]',
    ]
  }

  getSubmitButtonSelectors(): string[] {
    return [
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      ".send-button",
      '[data-testid*="send"]',
    ]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (element.offsetParent === null) return false
    const isContentEditable = element.getAttribute("contenteditable") === "true"
    const isTextbox = element.getAttribute("role") === "textbox"
    if (element.closest(".gh-main-panel")) return false
    return isContentEditable || isTextbox || element.classList.contains("ql-editor")
  }

  insertPrompt(content: string): boolean {
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
      document.execCommand("selectAll", false, undefined)
      const success = document.execCommand("insertText", false, content)
      if (!success) throw new Error("execCommand returned false")
    } catch (e) {
      editor.textContent = content
      editor.dispatchEvent(new Event("input", { bubbles: true }))
      editor.dispatchEvent(new Event("change", { bubbles: true }))
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
    if (
      document.activeElement !== this.textarea &&
      !this.textarea.contains(document.activeElement)
    ) {
      return
    }

    document.execCommand("selectAll", false, undefined)
    document.execCommand("delete", false, undefined)
  }

  // ==================== 滚动容器 ====================

  getScrollContainer(): HTMLElement | null {
    if (this.isSharePage()) {
      return document.querySelector("div.content-container") as HTMLElement
    }
    return document.querySelector("infinite-scroller.chat-history") as HTMLElement
  }

  getResponseContainerSelector(): string {
    if (this.isSharePage()) {
      return "div.content-container"
    }
    return "infinite-scroller.chat-history"
  }

  getChatContentSelectors(): string[] {
    return [
      ".model-response-container",
      "model-response",
      ".response-container",
      "[data-message-id]",
      "message-content",
    ]
  }

  // ==================== 大纲提取 ====================

  getUserQuerySelector(): string {
    return "user-query"
  }

  extractUserQueryText(element: Element): string {
    const queryText = element.querySelector(".query-text")
    const target = queryText || element
    return this.extractTextWithLineBreaks(target)
  }

  /**
   * 从用户提问元素中提取原始 Markdown 文本
   * Gemini 标准版：将按行拆分的 .query-text-line 合并为完整 Markdown
   */
  extractUserQueryMarkdown(element: Element): string {
    const lines = element.querySelectorAll(".query-text-line")
    if (lines.length === 0) {
      // 回退：使用 extractUserQueryText
      return this.extractUserQueryText(element)
    }

    const textLines = Array.from(lines).map((line) => {
      // 空行（只有 <br>）
      if (line.querySelector("br") && line.textContent?.trim() === "") {
        return ""
      }
      return line.textContent?.trim() || ""
    })

    return textLines.join("\n")
  }

  /**
   * 将渲染后的 HTML 替换到用户提问元素中
   * Gemini 标准版：隐藏 .query-text 并插入渲染容器
   */
  replaceUserQueryContent(element: Element, html: string): boolean {
    const textContainer = element.querySelector(".query-text")
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
      userQuerySelector: "user-query",
      assistantResponseSelector: "model-response, .model-response-container .markdown",
      turnSelector: ".conversation-turn",
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
        // 排除用户提问渲染容器内的标题
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

      if (tagName === "user-query") {
        let queryText = this.extractUserQueryText(element)
        let isTruncated = false
        if (queryText.length > 30) {
          queryText = queryText.substring(0, 30) + "..."
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
        // 排除用户提问渲染容器内的标题
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
    const stopIcon = document.querySelector('mat-icon[fonticon="stop"]')
    return stopIcon !== null && (stopIcon as HTMLElement).offsetParent !== null
  }

  getModelName(): string | null {
    const switchLabel = document.querySelector(".input-area-switch-label")
    if (switchLabel) {
      const firstSpan = switchLabel.querySelector("span")
      if (firstSpan?.textContent) {
        const text = firstSpan.textContent.trim()
        if (text.length > 0 && text.length <= 20) {
          return text
        }
      }
    }
    return null
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
    return {
      urlPatterns: ["BardFrontendService", "StreamGenerate"],
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
        ".input-area-switch-label",
        ".model-selector",
        '[data-test-id="model-selector"]',
        '[aria-label*="model"]',
        'button[aria-haspopup="menu"]',
      ],
      menuItemSelector: '.mode-title, [role="menuitem"], [role="option"]',
      checkInterval: 1000,
      maxAttempts: 15,
      menuRenderDelay: 300,
    }
  }

  // ==================== 主题切换 ====================

  /**
   * 切换 Gemini 主题
   * 直接修改 localStorage + body.className 实现即时无感切换
   * @param targetMode 目标主题模式
   */
  async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
    try {
      // Gemini 使用 "Bard-Color-Theme" 键存储主题
      // 值域：Bard-Light-Theme / Bard-Dark-Theme
      // 当设置为跟随系统时，localStorage 里没有这个变量
      const themeValue = targetMode === "dark" ? "Bard-Dark-Theme" : "Bard-Light-Theme"
      localStorage.setItem("Bard-Color-Theme", themeValue)

      // 同时更新 body.className（Gemini 使用 body.dark-theme / body.light-theme）
      if (targetMode === "dark") {
        document.body.classList.add("dark-theme")
        document.body.classList.remove("light-theme")
      } else {
        document.body.classList.remove("dark-theme")
        document.body.classList.add("light-theme")
      }

      // 更新 colorScheme
      document.body.style.colorScheme = targetMode

      // 触发 storage 事件
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "Bard-Color-Theme",
          newValue: themeValue,
          storageArea: localStorage,
        }),
      )

      return true
    } catch (error) {
      console.error("[GeminiAdapter] toggleTheme error:", error)
      return false
    }
  }
}
