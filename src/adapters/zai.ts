/**
 * Z.ai 适配器（chat.z.ai）
 *
 * 选择器策略：
 * - 优先使用 ID / data-* / class 等稳定属性
 * - 会话列表缺少稳定 ID，列表解析为 best-effort
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

const HOSTNAME = "chat.z.ai"
const CHAT_PATH_PATTERN = /\/c\/([a-z0-9-]+)(?:\/|$)/i
const TEXTAREA_SELECTORS = ["#chat-input", "textarea#chat-input"]
const SUBMIT_BUTTON_SELECTOR = "#send-message-button"
const NEW_CHAT_BUTTON_SELECTORS = ["#sidebar-new-chat-button", "#new-chat-button"]
const MODEL_SELECTOR_BUTTON_SELECTORS = [
  "button.modelSelectorButton",
  'button[id^="model-selector-"][id$="-button"]',
  "#model-selector-glm-5-button",
  "button[data-melt-dropdown-menu-trigger][data-menu-trigger].modelSelectorButton",
]
const MODEL_MENU_ITEM_SELECTOR =
  'button[aria-label="model-item"], button[data-melt-collapsible-trigger]'
const MODEL_SUB_MENU_SELECTOR = "button[data-melt-collapsible-trigger]"
const CHAT_CONTAINER_SELECTOR = "#chat-container"
const CHAT_SCROLL_CONTAINER_SELECTOR = [
  `${CHAT_CONTAINER_SELECTOR} .flex.overflow-y-scroll.flex-col.w-full.h-full`,
  `${CHAT_CONTAINER_SELECTOR} .scrollbar-none.flex.flex-col`,
  `${CHAT_CONTAINER_SELECTOR} [data-pane-id] .overflow-y-scroll`,
  `${CHAT_CONTAINER_SELECTOR} [data-pane-id] .scrollbar-none`,
].join(", ")
const USER_QUERY_SELECTOR = [
  `${CHAT_CONTAINER_SELECTOR} .chat-user.markdown-prose`,
  `${CHAT_CONTAINER_SELECTOR} .chat-user`,
  `${CHAT_CONTAINER_SELECTOR} [data-message-author-role="user"]`,
  `${CHAT_CONTAINER_SELECTOR} [data-role="user"]`,
  `${CHAT_CONTAINER_SELECTOR} .message-user`,
  `${CHAT_CONTAINER_SELECTOR} .user-message`,
  `${CHAT_CONTAINER_SELECTOR} .chat-message-user`,
  `${CHAT_CONTAINER_SELECTOR} .message.user`,
].join(", ")
const ASSISTANT_MARKDOWN_SELECTOR = [
  `${CHAT_CONTAINER_SELECTOR} .markdown-prose:not(.chat-user)`,
  `${CHAT_CONTAINER_SELECTOR} [data-message-author-role="assistant"]`,
  `${CHAT_CONTAINER_SELECTOR} [data-role="assistant"]`,
  `${CHAT_CONTAINER_SELECTOR} .message-assistant`,
  `${CHAT_CONTAINER_SELECTOR} .assistant-message`,
  `${CHAT_CONTAINER_SELECTOR} .chat-message-assistant`,
  `${CHAT_CONTAINER_SELECTOR} .markdown`,
  `${CHAT_CONTAINER_SELECTOR} .markdown-body`,
  `${CHAT_CONTAINER_SELECTOR} .prose`,
  `${CHAT_CONTAINER_SELECTOR} article`,
  `${CHAT_CONTAINER_SELECTOR} [data-markdown]`,
].join(", ")
const THINKING_CONTAINER_SELECTOR = ".thinking-chain-container, .thinking-block"
const USER_CONTENT_CANDIDATE_SELECTORS = [
  ".gh-user-query-raw",
  ".rounded-xl.whitespace-pre-wrap",
  ".rounded-xl",
  ".whitespace-pre-wrap",
  "[data-user-content]",
  ".message-content",
  ".chat-message-content",
  ".user-message-content",
  ".content",
  'div[dir="auto"]',
  "p",
]
const STOP_BUTTON_SELECTOR = [
  'div[aria-label="停止"] button',
  "button:has(span.rounded-xs):has(span.size-3)",
  "button:has(span.rounded-xs):has(span.block)",
].join(", ")
const SIDEBAR_ITEM_SELECTOR = "#sidebar .w-full.mb-1.relative.group"
const SIDEBAR_TITLE_SELECTOR = 'div[dir="auto"]'
const CID_STORAGE_KEY = "_arms_uid"
const MODEL_STORAGE_KEY = "selectedModels"
const THEME_STORAGE_KEY = "theme"
const META_THEME_SELECTOR = 'meta[name="theme-color"]'
const THEME_COLORS = {
  light: "#F4F6F8",
  dark: "#141618",
}
const CONVERSATION_ID_PATTERN = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i

export class ZaiAdapter extends SiteAdapter {
  match(): boolean {
    return window.location.hostname === HOSTNAME
  }

  getSiteId(): string {
    return SITE_IDS.ZAI
  }

  getName(): string {
    return "Z.ai"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#0881F0", secondary: "#0B6ED8" }
  }

  getTextareaSelectors(): string[] {
    return [...TEXTAREA_SELECTORS]
  }

  insertPrompt(content: string): boolean {
    const el = this.getTextareaElement() as HTMLTextAreaElement | null
    if (!el || !el.isConnected) return false
    el.focus()

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

  clearTextarea(): void {
    const el = this.getTextareaElement() as HTMLTextAreaElement | null
    if (!el || !el.isConnected) return

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    if (setter) {
      setter.call(el, "")
    } else {
      el.value = ""
    }

    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: "" }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    el.setSelectionRange(0, 0)
  }

  getSubmitButtonSelectors(): string[] {
    return [`${SUBMIT_BUTTON_SELECTOR}:not([disabled])`]
  }

  findSubmitButton(): HTMLElement | null {
    const button = document.querySelector(SUBMIT_BUTTON_SELECTOR) as HTMLElement | null
    if (!button || button.hasAttribute("disabled")) return null
    if (button.offsetParent === null) return null
    return button
  }

  // ===== 导出与大纲 =====

  getResponseContainerSelector(): string {
    return CHAT_SCROLL_CONTAINER_SELECTOR
  }

  getChatContentSelectors(): string[] {
    return [USER_QUERY_SELECTOR, ASSISTANT_MARKDOWN_SELECTOR]
  }

  getUserQuerySelector(): string | null {
    return USER_QUERY_SELECTOR
  }

  extractUserQueryText(element: Element): string {
    const contentRoot = this.findUserContentRoot(element)
    if (!contentRoot) return ""

    const clone = contentRoot.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(".gh-user-query-markdown, button, [role=button], svg, [aria-hidden=true]")
      .forEach((node) => node.remove())

    return this.extractTextWithLineBreaks(clone).trim()
  }

  extractUserQueryMarkdown(element: Element): string {
    return this.extractUserQueryText(element)
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    const contentRoot = this.findUserContentRoot(element)
    if (!contentRoot) return false
    if (element.querySelector(".gh-user-query-markdown")) return false

    const rendered = document.createElement("div")
    rendered.className =
      `${contentRoot instanceof HTMLElement ? contentRoot.className : ""} gh-user-query-markdown gh-markdown-preview`.trim()
    rendered.innerHTML = html

    if (contentRoot instanceof HTMLElement) {
      const inlineStyle = contentRoot.getAttribute("style")
      if (inlineStyle) {
        rendered.setAttribute("style", inlineStyle)
      }
    }

    if (contentRoot === element) {
      const rawWrapper = document.createElement("div")
      rawWrapper.className = "gh-user-query-raw"
      while (element.firstChild) {
        rawWrapper.appendChild(element.firstChild)
      }
      rawWrapper.style.display = "none"
      element.appendChild(rawWrapper)
      element.appendChild(rendered)
      return true
    }

    ;(contentRoot as HTMLElement).style.display = "none"
    contentRoot.after(rendered)
    return true
  }

  getExportConfig(): ExportConfig {
    return {
      userQuerySelector: USER_QUERY_SELECTOR,
      assistantResponseSelector: ASSISTANT_MARKDOWN_SELECTOR,
      turnSelector: null,
      useShadowDOM: false,
    }
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const outline: OutlineItem[] = []
    const container =
      document.querySelector(this.getResponseContainerSelector()) ||
      document.querySelector(CHAT_CONTAINER_SELECTOR)
    if (!container) return outline

    const userQuerySelector = this.getUserQuerySelector()
    if (!userQuerySelector) return outline

    const headingSelectors: string[] = []
    for (let i = 1; i <= maxLevel; i++) {
      headingSelectors.push(`h${i}`)
    }

    const combinedSelector = `${userQuerySelector}, ${headingSelectors.join(", ")}`
    const allElements = Array.from(container.querySelectorAll(combinedSelector))

    const calculateWordCount = (
      startEl: Element,
      nextEl: Element | null,
      isUserQueryItem: boolean,
    ): number => {
      if (!startEl) return 0
      try {
        if (isUserQueryItem) {
          const allAssistants = container.querySelectorAll(ASSISTANT_MARKDOWN_SELECTOR)
          let totalText = ""

          for (const assistant of Array.from(allAssistants)) {
            const positionToStart = startEl.compareDocumentPosition(assistant)
            const isAfterStart = positionToStart & Node.DOCUMENT_POSITION_FOLLOWING
            if (!isAfterStart) continue

            if (nextEl) {
              const positionToEnd = nextEl.compareDocumentPosition(assistant)
              const isBeforeEnd = positionToEnd & Node.DOCUMENT_POSITION_PRECEDING
              if (!isBeforeEnd) continue
            }

            const clone = assistant.cloneNode(true) as HTMLElement
            clone
              .querySelectorAll(`${THINKING_CONTAINER_SELECTOR}, .gh-user-query-markdown`)
              .forEach((node) => node.remove())
            totalText += clone.textContent || ""
          }

          return totalText.trim().length
        }

        if (nextEl) {
          return this.calculateRangeWordCount(startEl, nextEl, container)
        }

        const allUserQueries = container.querySelectorAll(userQuerySelector)
        let foundCurrent = false
        let nextUserQuery: Element | null = null

        for (const uq of Array.from(allUserQueries)) {
          if (foundCurrent) {
            nextUserQuery = uq
            break
          }
          if (uq === startEl || uq.contains(startEl) || startEl.contains(uq)) {
            foundCurrent = true
          }
        }

        if (nextUserQuery) {
          return this.calculateRangeWordCount(startEl, nextUserQuery, container)
        }

        const allAssistants = container.querySelectorAll(ASSISTANT_MARKDOWN_SELECTOR)
        if (allAssistants.length > 0) {
          const lastAssistant = allAssistants[allAssistants.length - 1]
          return this.calculateRangeWordCount(startEl, null, lastAssistant)
        }

        return this.calculateRangeWordCount(startEl, null, container)
      } catch {
        return 0
      }
    }

    allElements.forEach((element, index) => {
      const tagName = element.tagName.toLowerCase()
      const isUserQuery = element.matches(userQuerySelector)
      const isHeading = /^h[1-6]$/.test(tagName)

      let shouldCollect = false
      if (includeUserQueries && isUserQuery) shouldCollect = true
      if (isHeading) {
        if (!this.shouldSkipOutlineElement(element)) {
          const level = parseInt(tagName.charAt(1), 10)
          if (!Number.isNaN(level) && level <= maxLevel) {
            shouldCollect = true
          }
        }
      }

      if (!shouldCollect) return

      let item: OutlineItem
      if (isUserQuery) {
        let queryText = this.extractUserQueryText(element)
        let isTruncated = false
        if (queryText.length > 200) {
          queryText = queryText.substring(0, 200)
          isTruncated = true
        }
        item = {
          level: 0,
          text: queryText,
          element,
          isUserQuery: true,
          isTruncated,
        }
      } else {
        const level = parseInt(tagName.charAt(1), 10)
        item = {
          level,
          text: element.textContent?.trim() || "",
          element,
          isUserQuery: false,
        }
      }

      if (showWordCount) {
        let nextBoundaryEl: Element | null = null

        for (let i = index + 1; i < allElements.length; i++) {
          const candidate = allElements[i]
          const candidateIsUserQuery = candidate.matches(userQuerySelector)

          if (candidateIsUserQuery) {
            nextBoundaryEl = candidate
            break
          }

          const candidateTagName = candidate.tagName.toLowerCase()
          if (/^h[1-6]$/.test(candidateTagName)) {
            if (this.shouldSkipOutlineElement(candidate)) continue
            const candidateLevel = parseInt(candidateTagName.charAt(1), 10)
            if (!Number.isNaN(candidateLevel) && candidateLevel <= item.level) {
              nextBoundaryEl = candidate
              break
            }
          }
        }

        item.wordCount = calculateWordCount(element, nextBoundaryEl, isUserQuery)
      }

      outline.push(item)
    })

    return outline
  }

  // ===== 生成状态检测 =====

  isGenerating(): boolean {
    const stopButton = document.querySelector(STOP_BUTTON_SELECTOR) as HTMLElement | null
    if (stopButton && stopButton.offsetParent !== null) return true
    return false
  }

  getNewChatButtonSelectors(): string[] {
    return [...NEW_CHAT_BUTTON_SELECTORS]
  }

  getNewTabUrl(): string {
    return "https://chat.z.ai/"
  }

  getSessionId(): string {
    const match = window.location.pathname.match(CHAT_PATH_PATTERN)
    return match?.[1] || ""
  }

  isNewConversation(): boolean {
    const path = window.location.pathname
    return path === "/" || path === "" || !CHAT_PATH_PATTERN.test(path)
  }

  getCurrentCid(): string | null {
    try {
      const raw = localStorage.getItem(CID_STORAGE_KEY)
      if (!raw) return null
      const trimmed = raw.trim()
      if (!trimmed) return null
      if (trimmed.startsWith('"')) {
        const parsed = JSON.parse(trimmed)
        return typeof parsed === "string" ? parsed : null
      }
      return trimmed
    } catch {
      return null
    }
  }

  getConversationTitle(): string | null {
    const sessionId = this.getSessionId()
    if (!sessionId) return null
    const list = this.getConversationList()
    const matched = list.find((item) => item.id === sessionId)
    return matched?.title || null
  }

  getConversationList(): ConversationInfo[] {
    const nodes = document.querySelectorAll(SIDEBAR_ITEM_SELECTOR)
    if (!nodes.length) return []
    const cid = this.getCurrentCid() || undefined
    const list: ConversationInfo[] = []

    nodes.forEach((node) => {
      const id = this.extractConversationId(node)
      if (!id) return
      const title = this.extractConversationTitle(node)
      if (!title) return
      list.push({
        id,
        cid,
        title,
        url: `https://chat.z.ai/c/${id}`,
        isActive: id === this.getSessionId(),
      })
    })

    return list
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    return {
      selector: SIDEBAR_ITEM_SELECTOR,
      shadow: false,
      extractInfo: (el) => {
        const id = this.extractConversationId(el)
        if (!id) return null
        const title = this.extractConversationTitle(el)
        if (!title) return null
        return {
          id,
          title,
          url: `https://chat.z.ai/c/${id}`,
          cid: this.getCurrentCid() || undefined,
          isActive: id === this.getSessionId(),
        }
      },
      getTitleElement: (el) => el.querySelector(SIDEBAR_TITLE_SELECTOR) || el,
    }
  }

  getSidebarScrollContainer(): Element | null {
    return document.querySelector("#sidebar .overflow-y-auto")
  }

  navigateToConversation(id: string, url?: string): boolean {
    const nodes = document.querySelectorAll(SIDEBAR_ITEM_SELECTOR)
    for (const node of Array.from(nodes)) {
      if (this.extractConversationId(node) !== id) continue
      const button = node.querySelector("button") as HTMLElement | null
      if (button) {
        button.click()
        return true
      }
    }
    return super.navigateToConversation(id, url || `https://chat.z.ai/c/${id}`)
  }

  getModelName(): string | null {
    const stored = this.getSelectedModelFromStorage()
    if (stored) return stored

    const button = this.findElementBySelectors(MODEL_SELECTOR_BUTTON_SELECTORS)
    const text = button?.textContent?.trim()
    return text || null
  }

  lockModel(keyword: string, onSuccess?: () => void): void {
    if (!this.isNewConversation()) return
    super.lockModel(keyword, onSuccess)
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    if (!this.isNewConversation()) return null
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: [...MODEL_SELECTOR_BUTTON_SELECTORS],
      menuItemSelector: MODEL_MENU_ITEM_SELECTOR,
      checkInterval: 1000,
      maxAttempts: 12,
      menuRenderDelay: 400,
      subMenuSelector: MODEL_SUB_MENU_SELECTOR,
      subMenuTriggers: ["更多模型", "more"],
    }
  }

  async toggleTheme(targetMode: "light" | "dark" | "system"): Promise<boolean> {
    try {
      const prefersDark =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      const resolvedMode = targetMode === "system" ? (prefersDark ? "dark" : "light") : targetMode

      localStorage.setItem(THEME_STORAGE_KEY, targetMode)

      document.documentElement.classList.remove("light", "dark")
      document.documentElement.classList.add(resolvedMode)
      document.documentElement.style.colorScheme = resolvedMode
      document.body.style.colorScheme = resolvedMode

      const meta = document.querySelector(META_THEME_SELECTOR)
      if (meta) {
        meta.setAttribute("content", THEME_COLORS[resolvedMode])
      }

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_STORAGE_KEY,
          newValue: targetMode,
          storageArea: localStorage,
        }),
      )

      return true
    } catch (error) {
      console.error("[ZaiAdapter] toggleTheme error:", error)
      return false
    }
  }

  private extractConversationTitle(node: Element): string {
    const titleEl = node.querySelector(SIDEBAR_TITLE_SELECTOR)
    return titleEl?.textContent?.trim() || ""
  }

  private shouldSkipOutlineElement(element: Element): boolean {
    if (this.isInRenderedMarkdownContainer(element)) return true
    if (element.closest(THINKING_CONTAINER_SELECTOR)) return true
    return false
  }

  private findUserContentRoot(element: Element): Element | null {
    const messageRoot = element.matches(USER_QUERY_SELECTOR)
      ? element
      : element.closest(USER_QUERY_SELECTOR)
    const scope = messageRoot || element

    for (const selector of USER_CONTENT_CANDIDATE_SELECTORS) {
      const candidate = scope.querySelector(selector)
      if (!candidate) continue
      if (candidate.closest(".gh-user-query-markdown")) continue
      if (candidate.closest("button, [role=button]")) continue
      const text = candidate.textContent?.trim()
      if (!text) continue
      return candidate
    }
    return scope
  }

  private collectTopLevelBlocks(blocks: Element[]): Element[] {
    if (blocks.length <= 1) return blocks
    return blocks.filter(
      (block) => !blocks.some((other) => other !== block && other.contains(block)),
    )
  }

  private extractConversationId(node: Element): string {
    const attrKeys = [
      "data-conversation-id",
      "data-chat-id",
      "data-session-id",
      "data-cid",
      "data-id",
    ]

    for (const key of attrKeys) {
      const direct = this.matchConversationId(node.getAttribute(key))
      if (direct) return direct
      const child = node.querySelector(`[${key}]`)
      const childValue = this.matchConversationId(child?.getAttribute(key))
      if (childValue) return childValue
    }

    const ariaControls = node.getAttribute("aria-controls")
    const ariaMatch = this.matchConversationId(ariaControls)
    if (ariaMatch) return ariaMatch

    return ""
  }

  private matchConversationId(value: string | null | undefined): string {
    if (!value) return ""
    const match = value.match(CONVERSATION_ID_PATTERN)
    return match?.[0] || ""
  }

  private getSelectedModelFromStorage(): string | null {
    try {
      const raw = localStorage.getItem(MODEL_STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && typeof parsed[0] === "string") {
        return parsed[0]
      }
      return typeof parsed === "string" ? parsed : null
    } catch {
      return null
    }
  }
}
