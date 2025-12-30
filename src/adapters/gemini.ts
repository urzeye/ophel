/**
 * Gemini 标准版适配器 (gemini.google.com)
 */
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
  match(): boolean {
    return (
      window.location.hostname.includes("gemini.google") &&
      !window.location.hostname.includes("business.gemini.google")
    )
  }

  getSiteId(): string {
    return "gemini"
  }

  getName(): string {
    return "Gemini"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#4285f4", secondary: "#34a853" }
  }

  getNewTabUrl(): string {
    return "https://gemini.google.com/app"
  }

  isNewConversation(): boolean {
    const path = window.location.pathname
    return path === "/app" || path === "/app/"
  }

  /** 检测是否为分享页面（只读） */
  isSharePage(): boolean {
    return window.location.pathname.startsWith("/share/")
  }

  // ==================== 会话管理 ====================

  getConversationList(): ConversationInfo[] {
    const items = (DOMToolkit.query(".conversation", { all: true }) as Element[]) || []
    return Array.from(items)
      .map((el) => {
        const jslog = el.getAttribute("jslog") || ""
        const idMatch = jslog.match(/\["c_([^"]+)"/)
        const id = idMatch ? idMatch[1] : ""
        const title = el.querySelector(".conversation-title")?.textContent?.trim() || ""
        const isPinned = !!el.querySelector('mat-icon[fonticon="push_pin"]')

        return {
          id,
          title,
          url: id ? `https://gemini.google.com/app/${id}` : "",
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
        return {
          id,
          title,
          url: `https://gemini.google.com/app/${id}`,
          isPinned,
        }
      },
      getTitleElement: (el) => el.querySelector(".conversation-title") || el,
    }
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
    if (element.closest("#chat-helper-panel")) return false
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
      console.warn("[Chat Helper] insertPrompt: focus failed")
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
    if (queryText) {
      return queryText.textContent?.trim() || ""
    }
    return element.textContent?.trim() || ""
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
}
