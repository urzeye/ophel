/**
 * Z.ai 适配器（chat.z.ai）
 *
 * 选择器策略：
 * - 优先使用 ID / data-* / class 等稳定属性
 * - 会话列表缺少稳定 ID，列表解析为 best-effort
 */
import { SITE_IDS } from "~constants"
import {
  formatExportFileAttachments,
  formatExportImageAttachments,
  isDownloadableExportAssetUrl,
  normalizeExportAssetUrl,
  type ExportAssetCollector,
} from "~utils/export-assets"
import { htmlToMarkdown, type ExportBundle, type ExportMessage } from "~utils/exporter"
import { t } from "~utils/i18n"

import {
  SiteAdapter,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportLifecycleContext,
  type ExportConfig,
  type ModelSwitcherConfig,
  type OutlineItem,
  type PanelAvoidanceConfig,
} from "./base"

const HOSTNAME = "chat.z.ai"
const CHAT_PATH_PATTERN = /\/(?:c|s)\/([a-z0-9-]+)(?:\/|$)/i
const SHARE_PATH_PATTERN = /\/s\/([a-z0-9-]+)(?:\/|$)/i
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
const CHAT_MESSAGES_CONTAINER_SELECTOR = `${CHAT_CONTAINER_SELECTOR} #messages-container`
const CHAT_SCROLL_CONTAINER_SELECTOR = [
  CHAT_MESSAGES_CONTAINER_SELECTOR,
  `${CHAT_CONTAINER_SELECTOR} .flex.overflow-y-scroll.flex-col.w-full.h-full`,
  `${CHAT_CONTAINER_SELECTOR} .scrollbar-none.flex.flex-col`,
  `${CHAT_CONTAINER_SELECTOR} [data-pane-id] .overflow-y-scroll`,
  `${CHAT_CONTAINER_SELECTOR} [data-pane-id] .scrollbar-none`,
].join(", ")
const CHAT_MESSAGE_WIDTH_SELECTOR = [
  `${CHAT_CONTAINER_SELECTOR} [class*="max-w-[808px]"]`,
  `${CHAT_CONTAINER_SELECTOR} [class*="max-w-[894px]"]`,
  `${CHAT_CONTAINER_SELECTOR} [class*="max-w-[1000px]"]`,
  `${CHAT_CONTAINER_SELECTOR} [class*="max-w-[960px]"]`,
].join(", ")
const CHAT_INPUT_WIDTH_SELECTOR = [
  `${CHAT_CONTAINER_SELECTOR} .messageInputContainer [class*="max-w-[768px]"]`,
  `${CHAT_CONTAINER_SELECTOR} .messageInputContainer [class*="max-w-[854px]"]`,
].join(", ")
const CHAT_INPUT_SAFE_AREA_SELECTOR = `${CHAT_CONTAINER_SELECTOR}:not(:has([data-pane-id] .placeholder-input)) .messageInputContainer`
const NEW_CHAT_CONTENT_SAFE_AREA_SELECTOR = `${CHAT_CONTAINER_SELECTOR} [data-pane-id]:has(.placeholder-input)`
const USER_QUERY_SELECTOR = [
  '[id^="message-"].user-message',
  ".user-message .chat-user.markdown-prose",
  ".user-message .chat-user",
  `${CHAT_CONTAINER_SELECTOR} .chat-user.markdown-prose`,
  `${CHAT_CONTAINER_SELECTOR} .chat-user`,
  `${CHAT_CONTAINER_SELECTOR} [data-message-author-role="user"]`,
  `${CHAT_CONTAINER_SELECTOR} [data-role="user"]`,
  `${CHAT_CONTAINER_SELECTOR} .message-user`,
  `${CHAT_CONTAINER_SELECTOR} .user-message`,
  `${CHAT_CONTAINER_SELECTOR} .chat-message-user`,
  `${CHAT_CONTAINER_SELECTOR} .message.user`,
].join(", ")
const ASSISTANT_BODY_SELECTOR = [
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
  '[id^="message-"]:not(.user-message) .markdown-prose:not(.chat-user)',
  '[id^="message-"]:not(.user-message) .markdown-body',
  '[id^="message-"]:not(.user-message) [data-markdown]',
].join(", ")
const ASSISTANT_MARKDOWN_SELECTOR = [
  '[id^="message-"]:not(.user-message)',
  ASSISTANT_BODY_SELECTOR,
].join(", ")
const EXPORT_ROLE_ATTR = "data-gh-export-role"
const EXPORT_USER_QUERY_SELECTOR = `[${EXPORT_ROLE_ATTR}="user"]`
const EXPORT_ASSISTANT_SELECTOR = `[${EXPORT_ROLE_ATTR}="assistant"]`
const THINKING_CONTAINER_SELECTOR = ".thinking-chain-container, .thinking-block"
const THINKING_BLOCKQUOTE_SELECTOR =
  "blockquote[slot='content'], .thinking-block blockquote, .thinking-chain-container blockquote"
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
const EXPORT_DECORATION_SELECTOR = [
  ".gh-root",
  ".gh-user-query-markdown",
  "button",
  "[role='button']",
  "svg",
  "[aria-hidden='true']",
  "style",
  "script",
].join(", ")
const ZAI_ATTACHMENT_SOURCE_ATTRS = [
  "href",
  "src",
  "data-src",
  "data-url",
  "data-download-url",
  "data-file-url",
  "data-source-url",
  "data-origin-url",
  "data-original-url",
  "data-thumbnail-url",
  "data-image-url",
  "data-image-src",
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
const MESSAGE_ID_PATTERN = /^message-([a-f0-9-]{36})$/i

interface ZaiApiMessageRef {
  id?: string
  role?: string
  parentId?: string | null
  childrenIds?: string[]
}

interface ZaiShareResponse {
  title?: string
  chat?: {
    history?: {
      messages?: Record<string, ZaiApiMessageRef>
      currentId?: string
    }
  }
}

interface ZaiApiFileMeta {
  name?: string
  content_type?: string
  size?: number
  cdn_url?: string
}

interface ZaiApiFileAttachment {
  type?: string
  id?: string
  url?: string
  name?: string
  size?: number
  media?: string
  file?: {
    id?: string
    filename?: string
    meta?: ZaiApiFileMeta
  }
}

interface ZaiApiMessage {
  id?: string
  role?: string
  files?: ZaiApiFileAttachment[] | null
}

interface ZaiBatchResponse {
  data?: Record<string, ZaiApiMessage>
}

interface ZaiUserAttachment {
  kind: "image" | "file"
  name: string
  source: string
  type: string
  size?: number
}

export class ZaiAdapter extends SiteAdapter {
  private exportIncludeThoughtsOverride: boolean | null = null
  private exportUserAttachmentsByMessageId = new Map<string, ZaiUserAttachment[]>()
  private exportShareTitle: string | null = null

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

  private getConversationContentContainer(options?: {
    allowBodyFallback?: boolean
  }): Element | null {
    const explicitContainer =
      document.querySelector(this.getResponseContainerSelector()) ||
      document.querySelector(CHAT_CONTAINER_SELECTOR)
    if (explicitContainer) return explicitContainer

    const scrollContainer = this.getScrollContainer()
    if (scrollContainer) return scrollContainer

    const hasMessages = Boolean(
      document.body.querySelector(`${USER_QUERY_SELECTOR}, ${ASSISTANT_MARKDOWN_SELECTOR}`),
    )
    if (hasMessages && (this.isSharePage() || options?.allowBodyFallback)) {
      return document.body
    }

    return options?.allowBodyFallback ? document.body : null
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

  extractUserQueryExportContent(element: Element): string {
    return this.extractZaiUserQueryExportContent(element)
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
      userQuerySelector: EXPORT_USER_QUERY_SELECTOR,
      assistantResponseSelector: EXPORT_ASSISTANT_SELECTOR,
      turnSelector: null,
      useShadowDOM: false,
    }
  }

  async prepareConversationExport(context: ExportLifecycleContext): Promise<unknown> {
    this.exportIncludeThoughtsOverride = context.includeThoughts
    this.clearExportMarkers()
    this.clearExportAttachmentCache()

    const container =
      this.getConversationContentContainer({ allowBodyFallback: true }) || document.body
    this.markExportMessages(container)
    await this.prepareExportAttachmentCache(container)
    return null
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    _state: unknown,
  ): Promise<void> {
    this.clearExportMarkers()
    this.exportIncludeThoughtsOverride = null
    this.clearExportAttachmentCache()
  }

  async extractExportMessages(_context: ExportLifecycleContext): Promise<ExportMessage[] | null> {
    const messages = this.extractZaiExportMessages()
    return messages.length > 0 ? messages : null
  }

  async extractExportBundle(_context: ExportLifecycleContext): Promise<ExportBundle | null> {
    return this.createExportBundleFromMessages((collector) =>
      this.extractZaiExportMessages(collector),
    )
  }

  private clearExportMarkers(): void {
    document
      .querySelectorAll(`[${EXPORT_ROLE_ATTR}]`)
      .forEach((node) => node.removeAttribute(EXPORT_ROLE_ATTR))
  }

  private shouldSkipExportElement(element: Element): boolean {
    if (element.closest(".gh-root")) return true
    if (element.closest(".gh-user-query-markdown")) return true
    if (element.closest(THINKING_CONTAINER_SELECTOR)) return true
    return false
  }

  private collectExportMessages(container: Element): {
    users: Element[]
    assistants: Element[]
  } {
    const userCandidates = Array.from(container.querySelectorAll(USER_QUERY_SELECTOR))
    const userTop = this.collectTopLevelBlocks(userCandidates).filter(
      (el) => !this.shouldSkipExportElement(el),
    )

    const assistantCandidates = Array.from(container.querySelectorAll(ASSISTANT_MARKDOWN_SELECTOR))
    const assistantTop = this.collectTopLevelBlocks(assistantCandidates).filter((el) => {
      if (this.shouldSkipExportElement(el)) return false
      if (el.closest(USER_QUERY_SELECTOR)) return false
      return true
    })

    return { users: userTop, assistants: assistantTop }
  }

  private markExportMessages(container: Element): void {
    const { users, assistants } = this.collectExportMessages(container)
    users.forEach((el) => el.setAttribute(EXPORT_ROLE_ATTR, "user"))
    assistants.forEach((el) => el.setAttribute(EXPORT_ROLE_ATTR, "assistant"))
  }

  private extractZaiExportMessages(collector?: ExportAssetCollector): ExportMessage[] {
    const container =
      this.getConversationContentContainer({ allowBodyFallback: true }) || document.body
    const { users, assistants } = this.collectExportMessages(container)
    const ordered = [
      ...users.map((element) => ({ role: "user" as const, element })),
      ...assistants.map((element) => ({ role: "assistant" as const, element })),
    ].sort((left, right) => this.compareDomOrder(left.element, right.element))

    return ordered
      .map(({ role, element }) => {
        const content =
          role === "user"
            ? this.extractZaiUserQueryExportContent(element, collector)
            : this.extractAssistantResponseText(element)
        return { role, content: content.trim() }
      })
      .filter((message) => message.content.length > 0)
  }

  private compareDomOrder(left: Element, right: Element): number {
    if (left === right) return 0
    const position = left.compareDocumentPosition(right)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  }

  private shouldIncludeThoughtsInExport(): boolean {
    if (typeof this.exportIncludeThoughtsOverride === "boolean") {
      return this.exportIncludeThoughtsOverride
    }
    return true
  }

  private formatAsThoughtBlockquote(markdown: string): string {
    // 清理连续空行，避免 blockquote 断裂
    const cleaned = markdown.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n")
    const lines = cleaned.split("\n")
    const quotedLines = lines.map((line) => (line.trim().length > 0 ? `> ${line}` : `>`))
    return ["> **💭 思考过程**", ">", ...quotedLines].join("\n")
  }

  private extractThoughtBlockquotesFromElement(element: Element): {
    blocks: string[]
    removalNodes: Element[]
  } {
    const blocks: string[] = []
    const removalNodes: Element[] = []

    // 辅助函数：将 blockquote/target 的子节点转为 markdown（避免 blockquote 标签自身被加 `>`）
    const extractInnerMarkdown = (target: Element): string => {
      const wrapper = document.createElement("div")
      Array.from(target.childNodes).forEach((child) => wrapper.appendChild(child.cloneNode(true)))
      return htmlToMarkdown(wrapper) || this.extractTextWithLineBreaks(target)
    }

    const blockquoteNodes = Array.from(
      element.querySelectorAll(THINKING_BLOCKQUOTE_SELECTOR),
    ) as Element[]

    if (blockquoteNodes.length > 0) {
      const topLevelQuotes = this.collectTopLevelBlocks(blockquoteNodes)
      for (const blockquote of topLevelQuotes) {
        const markdown = extractInnerMarkdown(blockquote)
        const normalized = markdown.trim()
        if (normalized) {
          blocks.push(this.formatAsThoughtBlockquote(normalized))
        }

        const container =
          blockquote.closest(".thinking-chain-container") ||
          blockquote.closest(".thinking-block") ||
          blockquote
        removalNodes.push(container)
      }

      return {
        blocks,
        removalNodes: this.collectTopLevelBlocks(removalNodes),
      }
    }

    const thoughtNodes = Array.from(element.querySelectorAll(THINKING_CONTAINER_SELECTOR))
    const topLevel = this.collectTopLevelBlocks(thoughtNodes)
    for (const thought of topLevel) {
      const thoughtContent =
        thought.querySelector("blockquote[slot='content']") || thought.querySelector("blockquote")
      const target = thoughtContent || thought
      const markdown = extractInnerMarkdown(target)
      const normalized = markdown.trim()
      if (normalized) {
        blocks.push(this.formatAsThoughtBlockquote(normalized))
      }
      removalNodes.push(thought)
    }

    return {
      blocks,
      removalNodes: this.collectTopLevelBlocks(removalNodes),
    }
  }

  extractAssistantResponseText(element: Element): string {
    const sanitized = element.cloneNode(true) as Element
    const includeThoughts = this.shouldIncludeThoughtsInExport()

    const thoughtResult = this.extractThoughtBlockquotesFromElement(sanitized)
    const thoughtBlocks = includeThoughts ? thoughtResult.blocks : []

    // 无论是否导出思维链，都必须从克隆中移除思维链容器
    // Z.ai 的思维链始终在 DOM 中（CSS h-0 隐藏），不移除会泄漏到 body
    if (thoughtResult.removalNodes.length > 0) {
      thoughtResult.removalNodes.forEach((node) => node.remove())
    }
    // 兜底：再次清理残留的思维链元素
    sanitized.querySelectorAll(THINKING_CONTAINER_SELECTOR).forEach((node) => node.remove())

    const bodyRoot = this.findAssistantBodyRoot(sanitized)
    const bodyClone = bodyRoot.cloneNode(true) as Element
    bodyClone.querySelectorAll(EXPORT_DECORATION_SELECTOR).forEach((node) => node.remove())

    const bodyMarkdown = htmlToMarkdown(bodyClone) || this.extractTextWithLineBreaks(bodyClone)
    const normalizedBody = bodyMarkdown.trim()

    if (thoughtBlocks.length > 0) {
      const thoughtSection = thoughtBlocks.join("\n\n")
      return normalizedBody ? `${thoughtSection}\n\n${normalizedBody}` : thoughtSection
    }

    return normalizedBody
  }

  private findAssistantBodyRoot(element: Element): Element {
    if (this.isAssistantBodyElement(element)) return element

    const candidates = Array.from(element.querySelectorAll(ASSISTANT_BODY_SELECTOR)).filter(
      (candidate) =>
        !candidate.closest(USER_QUERY_SELECTOR) &&
        !candidate.closest(THINKING_CONTAINER_SELECTOR) &&
        !candidate.closest(".gh-root"),
    )
    const topLevel = this.collectTopLevelBlocks(candidates)
    return topLevel[0] || element
  }

  private isAssistantBodyElement(element: Element): boolean {
    return (
      element.matches(ASSISTANT_BODY_SELECTOR) &&
      !element.closest(USER_QUERY_SELECTOR) &&
      !element.closest(THINKING_CONTAINER_SELECTOR)
    )
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const outline: OutlineItem[] = []
    const container = this.getConversationContentContainer()
    if (!container) return outline

    const userQuerySelector = this.getUserQuerySelector()
    if (!userQuerySelector) return outline

    const headingSelectors: string[] = []
    for (let i = 1; i <= maxLevel; i++) {
      headingSelectors.push(`h${i}`)
    }

    const combinedSelector = `${userQuerySelector}, ${headingSelectors.join(", ")}`

    const rawUserQueries = Array.from(container.querySelectorAll(userQuerySelector))
    const userQueries = this.collectTopLevelBlocks(rawUserQueries).filter(
      (element) => !this.shouldSkipOutlineElement(element),
    )
    const userQuerySet = new Set(userQueries)

    const allElements = Array.from(container.querySelectorAll(combinedSelector)).filter(
      (element) => {
        if (element.matches(userQuerySelector)) {
          return userQuerySet.has(element)
        }
        return !this.shouldSkipOutlineElement(element)
      },
    )

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

  getStopButtonSelectors(): string[] {
    return [STOP_BUTTON_SELECTOR]
  }

  getLatestReplyText(): string | null {
    const container =
      this.getConversationContentContainer({ allowBodyFallback: true }) || document.body

    const { assistants } = this.collectExportMessages(container)
    if (assistants.length === 0) return null

    const last = assistants[assistants.length - 1]
    // 复制最新回复时不包含思维链
    const prevOverride = this.exportIncludeThoughtsOverride
    this.exportIncludeThoughtsOverride = false
    const text = this.extractAssistantResponseText(last)
    this.exportIncludeThoughtsOverride = prevOverride
    return text
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

  isSharePage(): boolean {
    return SHARE_PATH_PATTERN.test(window.location.pathname)
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
    if (this.isSharePage()) {
      return this.exportShareTitle || this.getSharePageTitle()
    }

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

  getScrollContainer(): HTMLElement | null {
    const roots = this.collectScrollAnchorRoots()
    const fromMessages = this.pickBestScrollableAncestor(roots)
    if (fromMessages) {
      return fromMessages
    }

    const paneRoots = Array.from(document.querySelectorAll("[data-pane-id]"))
    return this.pickBestScrollableAncestor(paneRoots)
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

  // ==================== 页面宽度控制 ====================

  getWidthSelectors() {
    return [
      {
        selector: CHAT_MESSAGE_WIDTH_SELECTOR,
        property: "max-width",
      },
      {
        selector: CHAT_INPUT_WIDTH_SELECTOR,
        property: "max-width",
      },
    ]
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    return {
      scopeSelector: CHAT_CONTAINER_SELECTOR,
      widthSelectors: [
        {
          selector: CHAT_MESSAGE_WIDTH_SELECTOR,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
      ],
      insetSelectors: [
        {
          selector: CHAT_MESSAGES_CONTAINER_SELECTOR,
          extraCss: "box-sizing: border-box;",
        },
        {
          selector: CHAT_INPUT_SAFE_AREA_SELECTOR,
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: NEW_CHAT_CONTENT_SAFE_AREA_SELECTOR,
          insetMode: "edge",
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
      ],
      defaultWidth: "894px",
      gap: 16,
    }
  }

  getUserQueryWidthSelectors() {
    return [
      {
        selector: `${CHAT_CONTAINER_SELECTOR} .chat-user [class*="max-w-[90%]"]`,
        property: "max-width",
        noCenter: true,
      },
    ]
  }

  getZenModeConfig() {
    return {
      hide: ["#sidebar"],
    }
  }

  private extractConversationTitle(node: Element): string {
    const titleEl = node.querySelector(SIDEBAR_TITLE_SELECTOR)
    return titleEl?.textContent?.trim() || ""
  }

  private getSharePageTitle(): string | null {
    const title = this.getDocumentConversationTitle() || ""
    if (!title) return this.getSessionName()

    const conversationTitle = title.split(" | ")[0]?.trim()
    return conversationTitle || this.getSessionName()
  }

  private collectScrollAnchorRoots(): Element[] {
    const roots = Array.from(
      document.querySelectorAll(`${USER_QUERY_SELECTOR}, ${ASSISTANT_MARKDOWN_SELECTOR}`),
    )
    return this.collectTopLevelBlocks(roots).filter(
      (element) => !element.closest(".gh-root, .gh-table-container"),
    )
  }

  private pickBestScrollableAncestor(elements: Element[]): HTMLElement | null {
    const scored = new Map<HTMLElement, number>()

    for (const element of elements) {
      const ancestor = this.findScrollableAncestor(element)
      if (!ancestor) continue
      const current = scored.get(ancestor) || 0
      scored.set(ancestor, current + this.scoreScrollContainer(ancestor))
    }

    let best: HTMLElement | null = null
    let bestScore = -1

    for (const [candidate, score] of scored.entries()) {
      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    }

    return bestScore > 0 ? best : null
  }

  private findScrollableAncestor(element: Element | null): HTMLElement | null {
    let current = element instanceof HTMLElement ? element : element?.parentElement || null

    while (current && current !== document.body) {
      if (this.isPrimaryScrollContainer(current)) {
        return current
      }
      current = current.parentElement
    }

    return null
  }

  private isPrimaryScrollContainer(element: HTMLElement): boolean {
    if (!element.isConnected) return false

    const style = window.getComputedStyle(element)
    if (!(style.overflowY === "auto" || style.overflowY === "scroll")) {
      return false
    }

    if (element.scrollHeight <= element.clientHeight) {
      return false
    }

    if (element.clientHeight < 220) {
      return false
    }

    const rect = element.getBoundingClientRect()
    if (rect.width < 320 || rect.height < 220) {
      return false
    }

    return true
  }

  private scoreScrollContainer(element: HTMLElement): number {
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
    const rect = element.getBoundingClientRect()
    const userCount = element.querySelectorAll(USER_QUERY_SELECTOR).length
    const assistantCount = element.querySelectorAll(ASSISTANT_MARKDOWN_SELECTOR).length

    let score = 0

    score += Math.min(userCount, 60) * 160
    score += Math.min(assistantCount, 60) * 160

    if (userCount > 0 && assistantCount > 0) {
      score += 700
    }

    if (element.scrollTop > 0) {
      score += 900
    }

    if (rect.height >= viewportHeight * 0.35) {
      score += 500
    }

    if (rect.width >= viewportWidth * 0.45) {
      score += 350
    }

    if (element.closest("[data-pane-id]")) {
      score += 300
    }

    if (element.querySelector("textarea, #chat-input")) {
      score -= 700
    }

    if (element.matches(".scrollbar-none") && element.scrollWidth > element.clientWidth) {
      score -= 400
    }

    return score
  }

  private shouldSkipOutlineElement(element: Element): boolean {
    if (!this.isOutlineElementVisible(element)) return true
    if (element.closest(".gh-root")) return true
    if (this.isInRenderedMarkdownContainer(element)) return true
    if (element.closest(THINKING_CONTAINER_SELECTOR)) return true
    return false
  }

  private isOutlineElementVisible(element: Element): boolean {
    if (!(element instanceof HTMLElement)) return false
    if (!element.isConnected) return false
    if (element.closest("[hidden], [aria-hidden='true']")) return false

    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private clearExportAttachmentCache(): void {
    this.exportUserAttachmentsByMessageId.clear()
    this.exportShareTitle = null
  }

  private async prepareExportAttachmentCache(container: Element): Promise<void> {
    const sessionId = this.getSessionId()
    if (!sessionId) return

    try {
      const ids = await this.collectExportMessageIds(container)
      if (ids.length === 0) return

      const response = await fetch(
        `/api/v1/chats/${encodeURIComponent(sessionId)}/messages/batch`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ ids }),
        },
      )

      if (!response.ok) {
        throw new Error(`messages/batch failed with ${response.status}`)
      }

      const payload = (await response.json()) as ZaiBatchResponse
      const data = payload?.data || {}
      Object.values(data).forEach((message) => {
        if (!message?.id || message.role !== "user") return
        const attachments = this.extractZaiApiUserAttachments(message.files || [])
        if (attachments.length > 0) {
          this.exportUserAttachmentsByMessageId.set(message.id, attachments)
        }
      })
    } catch (error) {
      console.warn("[ZaiAdapter] Failed to load export attachment metadata:", error)
    }
  }

  private async collectExportMessageIds(container: Element): Promise<string[]> {
    const fromShare = this.isSharePage() ? await this.fetchShareMessageIds() : []
    const fromDom = this.collectDomMessageIds(container)
    return Array.from(new Set([...fromShare, ...fromDom]))
  }

  private async fetchShareMessageIds(): Promise<string[]> {
    const shareId = this.getSessionId()
    if (!shareId) return []

    const response = await fetch(`/api/v1/chats/share/${encodeURIComponent(shareId)}`, {
      credentials: "include",
      headers: { accept: "application/json" },
    })

    if (!response.ok) {
      throw new Error(`share metadata failed with ${response.status}`)
    }

    const payload = (await response.json()) as ZaiShareResponse
    this.exportShareTitle = payload?.title || null
    const messages = payload?.chat?.history?.messages || {}
    return Object.keys(messages)
  }

  private collectDomMessageIds(container: Element): string[] {
    const ids: string[] = []
    const nodes = Array.from(container.querySelectorAll('[id^="message-"]'))

    nodes.forEach((node) => {
      const id = this.extractZaiMessageId(node)
      if (id) ids.push(id)
    })

    return ids
  }

  private extractZaiMessageId(element: Element): string {
    const messageRoot = element.id?.startsWith("message-")
      ? element
      : element.closest('[id^="message-"]')
    const id = messageRoot?.id || ""
    const match = id.match(MESSAGE_ID_PATTERN)
    return match?.[1] || ""
  }

  private extractZaiApiUserAttachments(files: ZaiApiFileAttachment[]): ZaiUserAttachment[] {
    return files
      .map((item) => this.extractZaiApiUserAttachment(item))
      .filter((item): item is ZaiUserAttachment => Boolean(item))
  }

  private extractZaiApiUserAttachment(item: ZaiApiFileAttachment): ZaiUserAttachment | null {
    const meta = item.file?.meta
    const rawName = meta?.name || item.file?.filename || item.name || item.id || "attachment"
    const name = this.decodeZaiAttachmentName(rawName) || "attachment"
    const type = meta?.content_type || item.media || item.type || ""
    const source = normalizeExportAssetUrl(meta?.cdn_url || item.url || "")
    const kind = this.isZaiImageAttachment(name, type, source) ? "image" : "file"

    return {
      kind,
      name,
      source: isDownloadableExportAssetUrl(source) ? source : "",
      type,
      size: meta?.size || item.size,
    }
  }

  private extractZaiUserQueryExportContent(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    const body = this.extractUserQueryText(element)
    const attachments = this.extractZaiUserAttachments(element)

    if (attachments.length === 0) {
      return body
    }

    const imageMarkdown = this.formatZaiUserImageAttachments(attachments, collector)
    const fileMarkdown = this.formatZaiUserFileAttachments(attachments, collector)
    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, body].filter(Boolean).join("\n\n")
  }

  private extractZaiUserAttachments(element: Element): ZaiUserAttachment[] {
    const messageId = this.extractZaiMessageId(element)
    const cached = messageId ? this.exportUserAttachmentsByMessageId.get(messageId) || [] : []
    const fromDom = this.extractZaiUserAttachmentsFromDom(element)
    const attachments: ZaiUserAttachment[] = []
    const seen = new Set<string>()

    const add = (attachment: ZaiUserAttachment) => {
      const keys = this.getZaiAttachmentKeys(attachment)
      if (keys.some((key) => seen.has(key))) return
      keys.forEach((key) => seen.add(key))
      attachments.push(attachment)
    }

    cached.forEach(add)
    fromDom.forEach(add)

    return attachments
  }

  private getZaiAttachmentKeys(attachment: ZaiUserAttachment): string[] {
    const keys: string[] = []
    const kind = attachment.kind
    const name = attachment.name.trim().toLowerCase()
    const type = this.getZaiAttachmentTypeKey(attachment)
    const size = attachment.size ? this.formatZaiFileSize(attachment.size).toLowerCase() : ""
    const sourceKey = this.getZaiAttachmentSourceKey(attachment.source)

    if (sourceKey) keys.push(`${kind}:source:${sourceKey}`)
    if (name && type) keys.push(`${kind}:name-type:${name}:${type}`)
    if (name && size) keys.push(`${kind}:name-size:${name}:${size}`)

    return keys.length > 0 ? keys : [`${kind}:fallback:${name}:${type}`]
  }

  private getZaiAttachmentTypeKey(attachment: ZaiUserAttachment): string {
    const filenameExtension = attachment.name.match(/\.([a-z0-9]{1,10})$/i)?.[1]
    if (filenameExtension) return filenameExtension.toLowerCase()

    const normalizedType = attachment.type.trim().toLowerCase()
    const mimeExtension = normalizedType.match(/\/([a-z0-9.+-]+)$/i)?.[1]
    if (mimeExtension) return mimeExtension.replace(/^plain$/, "txt").replace(/^jpeg$/, "jpg")

    return normalizedType
  }

  private getZaiAttachmentSourceKey(source: string): string {
    if (!source) return ""
    if (/^(blob:|data:)/i.test(source)) return source

    try {
      const url = new URL(source, window.location.href)
      return `${url.hostname}${url.pathname}`.toLowerCase()
    } catch {
      return source.split("?")[0].toLowerCase()
    }
  }

  private extractZaiUserAttachmentsFromDom(element: Element): ZaiUserAttachment[] {
    const scope = element.matches(USER_QUERY_SELECTOR)
      ? element
      : element.closest(USER_QUERY_SELECTOR)
    if (!scope) return []

    const cards = Array.from(scope.querySelectorAll("button")).filter((button) => {
      const text = button.textContent?.replace(/\s+/g, " ").trim() || ""
      if (!text) return false
      if (!this.looksLikeZaiAttachmentCard(button, text)) return false
      return !button.closest(".gh-root, .gh-user-query-markdown")
    })

    const attachments: ZaiUserAttachment[] = []
    const seen = new Set<string>()

    cards.forEach((card) => {
      const attachment = this.extractZaiDomUserAttachment(card)
      if (!attachment) return
      const keys = this.getZaiAttachmentKeys(attachment)
      if (keys.some((key) => seen.has(key))) return
      keys.forEach((key) => seen.add(key))
      attachments.push(attachment)
    })

    return attachments
  }

  private looksLikeZaiAttachmentCard(card: Element, text: string): boolean {
    if (card.querySelector("img[data-cy='image'], img.not-prose")) return true
    if (!/\.[A-Za-z0-9]{1,10}\b/.test(text)) return false
    return /\b(?:B|KB|MB|GB|TB)\b/i.test(text) || Boolean(card.querySelector("img[src*='/icons/']"))
  }

  private extractZaiDomUserAttachment(card: Element): ZaiUserAttachment | null {
    const textParts = this.extractZaiCleanTextParts(card)
    const { name, type, sizeLabel } = this.parseZaiAttachmentLabel(textParts)
    const source = this.extractZaiDownloadableSource(card)
    const fallbackName = name || this.extractZaiFilenameFromUrl(source) || "attachment"
    if (!fallbackName && !source) return null

    const kind = this.isZaiImageAttachment(fallbackName, type, source) ? "image" : "file"
    return {
      kind,
      name: fallbackName,
      source,
      type,
      size: this.parseZaiSizeLabel(sizeLabel),
    }
  }

  private parseZaiAttachmentLabel(textParts: string[]): {
    name: string
    type: string
    sizeLabel: string
  } {
    const parts = textParts.map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean)
    const name = parts.find((part) => /\.[A-Za-z0-9]{1,10}$/.test(part)) || parts[0] || ""
    const type =
      parts.find((part) => /^[A-Za-z0-9.+-]{1,16}$/.test(part) && !/\d/.test(part)) ||
      name.match(/\.([A-Za-z0-9]{1,10})$/)?.[1] ||
      ""
    const sizeLabel = parts.find((part) => /^\d+(?:\.\d+)?\s*(?:B|KB|MB|GB|TB)$/i.test(part)) || ""

    return { name, type, sizeLabel }
  }

  private extractZaiCleanTextParts(root: Element): string[] {
    const clone = root.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll("svg, [aria-hidden='true'], style, script")
      .forEach((node) => node.remove())

    const parts: string[] = []
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT)
    let current = walker.nextNode()
    while (current) {
      const text = current.textContent?.replace(/\s+/g, " ").trim()
      if (text && parts[parts.length - 1] !== text) {
        parts.push(text)
      }
      current = walker.nextNode()
    }

    return parts
  }

  private extractZaiDownloadableSource(root: Element): string {
    const image = Array.from(root.querySelectorAll("img")).find(
      (node): node is HTMLImageElement =>
        node instanceof HTMLImageElement &&
        Boolean(
          this.normalizeZaiAttachmentSource(
            node.currentSrc || node.src || node.getAttribute("src") || "",
          ),
        ),
    )

    if (image) {
      const source = this.normalizeZaiAttachmentSource(
        image.currentSrc || image.src || image.getAttribute("src") || "",
      )
      if (source) return source
    }

    const nodes = [root, ...Array.from(root.querySelectorAll("*"))]
    for (const node of nodes) {
      for (const attr of ZAI_ATTACHMENT_SOURCE_ATTRS) {
        const source = this.normalizeZaiAttachmentSource(node.getAttribute(attr) || "")
        if (source) return source
      }
    }

    return ""
  }

  private normalizeZaiAttachmentSource(value: string): string {
    const source = normalizeExportAssetUrl(value)
    if (!source || !isDownloadableExportAssetUrl(source)) return ""

    try {
      const url = new URL(source, window.location.href)
      if (url.hostname === HOSTNAME && /^\/icons\//i.test(url.pathname)) return ""
      if (url.hostname === "z-cdn.chatglm.cn" && /\/z-ai\/static\/logo\.svg$/i.test(url.pathname)) {
        return ""
      }
    } catch {
      return ""
    }

    return source
  }

  private isZaiImageAttachment(name: string, type: string, source: string): boolean {
    const signal = `${name} ${type} ${source}`.toLowerCase()
    return (
      /\bimage\b/.test(signal) ||
      /图片|圖像|图像/.test(signal) ||
      /\.(png|jpe?g|webp|gif|avif|svg)(?:$|[?#\s])/.test(signal) ||
      /^data:image\//i.test(source)
    )
  }

  private formatZaiUserImageAttachments(
    attachments: ZaiUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportImageAttachments(attachments, collector, { siteId: this.getSiteId() })
  }

  private formatZaiUserFileAttachments(
    attachments: ZaiUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportFileAttachments(attachments, collector, {
      siteId: this.getSiteId(),
      getLabel: (attachment) => {
        const sizeLabel = attachment.size ? `, ${this.formatZaiFileSize(attachment.size)}` : ""
        if (!attachment.type) return `${attachment.name}${sizeLabel}`
        if (attachment.name.toLowerCase().endsWith(attachment.type.toLowerCase())) {
          return `${attachment.name}${sizeLabel}`
        }
        return `${attachment.name} (${attachment.type}${sizeLabel})`
      },
    })
  }

  private parseZaiSizeLabel(value: string): number | undefined {
    const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/i)
    if (!match) return undefined
    const amount = Number(match[1])
    if (!Number.isFinite(amount)) return undefined
    const unit = match[2].toUpperCase()
    const multiplier =
      unit === "TB"
        ? 1024 ** 4
        : unit === "GB"
          ? 1024 ** 3
          : unit === "MB"
            ? 1024 ** 2
            : unit === "KB"
              ? 1024
              : 1
    return Math.round(amount * multiplier)
  }

  private formatZaiFileSize(size: number): string {
    if (!Number.isFinite(size) || size <= 0) return ""
    const units = ["B", "KB", "MB", "GB", "TB"]
    let value = size
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex += 1
    }
    const formatted =
      value >= 10 || unitIndex === 0 ? Math.round(value).toString() : value.toFixed(1)
    return `${formatted} ${units[unitIndex]}`
  }

  private extractZaiFilenameFromUrl(source: string): string {
    if (!source) return ""
    try {
      const path = new URL(source, window.location.href).pathname
      return decodeURIComponent(path.split("/").pop() || "")
    } catch {
      return ""
    }
  }

  private decodeZaiAttachmentName(value: string): string {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
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
