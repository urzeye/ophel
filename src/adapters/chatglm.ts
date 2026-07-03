/**
 * ChatGLM 适配器（chatglm.cn）
 *
 * 选择器策略：
 * - 优先使用语义化 class（如 .conversation-list、.conversation-item、.answer-content-wrap）
 * - 避免依赖 data-v-* 等构建时生成属性
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
  type ExportConfig,
  type ExportLifecycleContext,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type PanelAvoidanceConfig,
} from "./base"

const CHATGLM_HOSTS = new Set(["chatglm.cn"])
const SESSION_ID_PARAM = "cid"
const SHARE_SESSION_ID_PARAM = "share_conversation_id"
const SHARE_ID_PARAM = "share_id"
const NEW_TAB_PATH = "/main/alltoolsdetail?lang=zh"
const MAX_OUTLINE_TEXT_LENGTH = 80
const SKIN_MODE_KEY = "SKIN_MODE"
const SKIN_MODE_MAP: Record<"light" | "dark" | "system", string> = {
  light: "1",
  dark: "2",
  system: "3",
}
const USER_MENU_BUTTON_SELECTORS = [
  ".userInfoBar-header .me-icon",
  ".userInfoBar-header .me",
  ".userInfoBar-header img.avatar",
]
const THEME_ENTRY_SELECTOR = ".themes"
const THEME_POPOVER_SELECTOR = ".theme-popper"
const THEME_OPTION_SELECTOR = ".selecttheme-list"

const RESPONSE_CONTAINER_SELECTOR = ".conversation-list"
const CONVERSATION_SCOPE_SELECTOR = ".conversation-container"
const CONVERSATION_INNER_SELECTOR = ".conversation-inner"
const CONVERSATION_ITEM_SELECTOR = ".conversation-item"
const USER_QUERY_SELECTOR = ".conversation.question"
const USER_TEXT_SELECTOR = ".question-txt"
const ASSISTANT_RESPONSE_SELECTOR = ".answer-content-wrap"
const ASSISTANT_MARKDOWN_SELECTOR = ".answer-content-wrap .markdown-body"
const THINKING_CONTAINER_SELECTOR = [
  ".advance-thinking",
  ".advance-thinking-area",
  ".advanced-thinking",
  ".advanced-thinking-data",
  ".text-advance-thinking-content",
  ".thinking-chain-container",
  ".thinking-block",
  ".thinking-content",
  ".thinking-item",
  "[class*='thinking']",
  "[class*='think']",
  "[class*='reason']",
  "[class*='cot']",
].join(", ")
const EXPORT_DECORATION_SELECTOR = [
  ".gh-root",
  ".gh-user-query-markdown",
  ".assistant-name",
  ".interact-container",
  ".code-no-artifacts .top-outer",
  ".code-no-artifacts .copy-button",
  "button",
  "[role='button']",
  "svg",
  "[aria-hidden='true']",
  "style",
  "script",
].join(", ")
const CHATGLM_ATTACHMENT_SOURCE_ATTRS = [
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

const TEXTAREA_SELECTORS = [
  "#search-input-box textarea",
  ".main-chat-search #search-input-box textarea",
  ".main-chat-search textarea",
]

const SUBMIT_BUTTON_SELECTOR = ".enter-icon-container"
const CONVERSATION_MESSAGE_WIDTH_SELECTOR =
  ".dialogue .detail .item, .dialogue .detail .item.item, .dialogue .detail .item.item.item"
const CONVERSATION_MARKDOWN_WIDTH_SELECTOR =
  ".markdown-body, .markdown-body.markdown-body, .answer-content-wrap .markdown-body"

interface ChatGLMApiAttachment {
  file_name?: string
  file_id?: string
  image_url?: string
  file_url?: string
  file_size?: number
  file_type?: string
  type?: string
}

interface ChatGLMApiInputContent {
  type?: string
  text?: string
  image?: ChatGLMApiAttachment[]
  file?: ChatGLMApiAttachment[]
}

interface ChatGLMApiOutputImage {
  image_url?: string
  aspect_ratio?: string
}

interface ChatGLMApiOutputContent {
  answer?: string
  answer_type?: string
  type?: string
  text?: string
  think?: string
  code?: string
  content?: string
  intent_original_output?: string
  image?: ChatGLMApiOutputImage[]
  advancedThinkingData?: ChatGLMApiOutputContent[]
  meta_data?: ChatGLMApiOutputPart["meta_data"]
  tool_calls?: {
    name?: string
    arguments?: string
  }
}

interface ChatGLMApiOutputPart {
  answer?: string
  answer_type?: string
  content?: ChatGLMApiOutputContent[]
  text?: string
  think?: string
  advancedThinkingData?: ChatGLMApiOutputContent[]
  meta_data?: {
    show_type?: string
    engine?: {
      type?: string
      node?: string
      tool_call?: string
    }
    tool_result_extra?: {
      tool_nickname?: string
      tool_call_name?: string
    }
  }
}

interface ChatGLMApiMessage {
  id?: string
  input?: {
    content?: ChatGLMApiInputContent[]
  }
  output?: {
    parts?: ChatGLMApiOutputPart[]
    image_list?: string[]
  }
}

interface ChatGLMShareResponse {
  result?: {
    messages?: ChatGLMApiMessage[]
  }
}

interface ChatGLMExportAttachment {
  kind: "image" | "file"
  name: string
  source: string
  type: string
  size?: number
}

export class ChatGLMAdapter extends SiteAdapter {
  private exportIncludeThoughtsOverride: boolean | null = null
  private exportApiMessages: ChatGLMApiMessage[] | null = null

  match(): boolean {
    return CHATGLM_HOSTS.has(window.location.hostname)
  }

  getSiteId(): string {
    return SITE_IDS.CHATGLM
  }

  getName(): string {
    return "智谱清言"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#2454FF", secondary: "#1F46D6" }
  }

  getQuickQuoteSupportMode() {
    return "native" as const
  }

  getNativeQuotePopoverSelectors(): string[] {
    return [
      // 部分类名匹配（容错，但可能不够精确）
      '[class*="quote-button"]',
      '[class*="reference-button"]',
      // aria-label 匹配（多语言友好，但依赖站点实现）
      '[aria-label*="引用"]',
      '[aria-label*="quote"]',
    ]
  }

  async toggleTheme(targetMode: "light" | "dark" | "system"): Promise<boolean> {
    const nextValue = SKIN_MODE_MAP[targetMode] || SKIN_MODE_MAP.light
    try {
      localStorage.setItem(SKIN_MODE_KEY, nextValue)
      const clicked = await this.applyThemeByClick(targetMode)
      if (clicked) {
        return true
      }

      const prefersDark =
        targetMode === "system" &&
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      const resolvedMode: "light" | "dark" =
        targetMode === "system" ? (prefersDark ? "dark" : "light") : targetMode
      const applyThemeTo = (element: HTMLElement | null) => {
        if (!element) return
        element.classList.toggle("dark-theme", resolvedMode === "dark")
        element.classList.remove("light-theme")
        element.setAttribute("data-theme", resolvedMode)
        element.setAttribute("data-color-scheme", resolvedMode)
        element.style.colorScheme = resolvedMode
      }

      const targets = new Set<HTMLElement>()
      if (document.documentElement) targets.add(document.documentElement)
      if (document.body) targets.add(document.body)

      const rootCandidates = [
        document.querySelector("#app"),
        document.querySelector("[data-v-app]"),
        document.querySelector(".app"),
        document.querySelector(".app-container"),
      ]

      for (const candidate of rootCandidates) {
        if (candidate instanceof HTMLElement) {
          targets.add(candidate)
        }
      }

      for (const element of targets) {
        applyThemeTo(element)
      }

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: SKIN_MODE_KEY,
          newValue: nextValue,
          storageArea: localStorage,
        }),
      )
      return true
    } catch {
      return false
    }
  }

  protected simulateClick(element: HTMLElement): void {
    const eventTypes = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"] as const
    let dispatched = false

    for (const type of eventTypes) {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
      })
      dispatched = element.dispatchEvent(event) || dispatched
    }

    if (!dispatched) {
      element.click()
    }
  }

  private async applyThemeByClick(targetMode: "light" | "dark" | "system"): Promise<boolean> {
    const trigger = this.findVisibleElement(USER_MENU_BUTTON_SELECTORS)
    if (!trigger) return false
    this.simulateClick(trigger)
    await this.delay(120)

    const themeEntry = await this.waitForVisibleElement(THEME_ENTRY_SELECTOR, 1500)
    if (!themeEntry) return false
    this.simulateClick(themeEntry)
    await this.delay(120)

    const option = await this.findThemeOption(targetMode, 1500)
    if (!option) return false
    this.simulateClick(option)
    await this.delay(80)

    return true
  }

  private findVisibleElement(selectors: string[]): HTMLElement | null {
    for (const selector of selectors) {
      const element = document.querySelector(selector) as HTMLElement | null
      if (!element) continue
      if (element.offsetParent === null) continue
      return this.resolveClickable(element)
    }
    return null
  }

  private resolveClickable(element: HTMLElement): HTMLElement {
    const clickable =
      element.closest(".me-icon") ||
      element.closest(".me") ||
      element.closest(".userInfoBar-header")
    return (clickable as HTMLElement) || element
  }

  private async waitForVisibleElement(
    selector: string,
    timeoutMs = 800,
  ): Promise<HTMLElement | null> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const element = document.querySelector(selector) as HTMLElement | null
      if (element && element.offsetParent !== null) {
        return element
      }
      await this.delay(50)
    }
    return null
  }

  private async findThemeOption(
    targetMode: "light" | "dark" | "system",
    timeoutMs = 800,
  ): Promise<HTMLElement | null> {
    const labelMap: Record<typeof targetMode, string[]> = {
      system: ["系统", "System", "Auto"],
      light: ["浅色", "Light", "Light mode"],
      dark: ["深色", "Dark", "Dark mode"],
    }

    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const options = this.collectThemeOptions()
      const option = this.matchThemeOption(options, labelMap[targetMode])
      if (option) return option
      await this.delay(60)
    }

    return null
  }

  private collectThemeOptions(): HTMLElement[] {
    const selectors = [
      `${THEME_POPOVER_SELECTOR} ${THEME_OPTION_SELECTOR}`,
      `.selecttheme ${THEME_OPTION_SELECTOR}`,
      THEME_OPTION_SELECTOR,
    ]
    const options = new Set<HTMLElement>()
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector)
      for (const element of Array.from(elements)) {
        if (!(element instanceof HTMLElement)) continue
        if (element.offsetParent === null) continue
        options.add(element)
      }
      if (options.size > 0) break
    }
    return Array.from(options)
  }

  private matchThemeOption(options: HTMLElement[], labels: string[]): HTMLElement | null {
    const normalizedLabels = labels.map((label) => label.replace(/\s+/g, "").toLowerCase())
    for (const option of options) {
      const text = option.textContent?.replace(/\s+/g, "").toLowerCase() || ""
      if (!text) continue
      if (normalizedLabels.some((label) => text.includes(label))) {
        return option
      }
    }
    return null
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  getTextareaSelectors(): string[] {
    return TEXTAREA_SELECTORS
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

  getSessionId(): string {
    const params = new URLSearchParams(window.location.search)
    if (this.isSharePage()) {
      return (
        params.get(SHARE_SESSION_ID_PARAM)?.trim() ||
        params.get(SHARE_ID_PARAM)?.trim() ||
        window.location.pathname.match(/^\/share\/([^/?#]+)/)?.[1]?.trim() ||
        ""
      )
    }

    const cid = params.get(SESSION_ID_PARAM)
    return cid ? cid.trim() : ""
  }

  isNewConversation(): boolean {
    return !this.getSessionId()
  }

  getNewChatButtonSelectors(): string[] {
    return [".new-session", 'div[class~="new-session"]']
  }

  getNewTabUrl(): string {
    return new URL(NEW_TAB_PATH, window.location.origin).toString()
  }

  isSharePage(): boolean {
    // 自有会话：/chat/...    分享会话：/glmsShare?is_share=1&...
    return (
      window.location.pathname.startsWith("/glmsShare") ||
      window.location.pathname.startsWith("/share/") ||
      new URLSearchParams(window.location.search).get("is_share") === "1"
    )
  }

  isUserConversationPage(): boolean {
    const cid = new URLSearchParams(window.location.search).get(SESSION_ID_PARAM)?.trim()
    return !this.isSharePage() && Boolean(cid) && cid === this.getSessionId()
  }

  getSessionName(): string | null {
    const conversationTitle = this.getConversationTitle()
    if (conversationTitle) return conversationTitle

    const title = this.getDocumentConversationTitle() || ""
    if (!title) return null

    const normalized = title.replace(/\s*[-|]\s*(智谱清言|ChatGLM(?:\s*\d+)?)\s*$/i, "").trim()

    if (!normalized || normalized === "智谱清言" || normalized.toLowerCase() === "chatglm") {
      return null
    }

    return normalized
  }

  getConversationTitle(): string | null {
    // 自有页面：<p class="conversation-name ...">打印hello代码</p>
    const nameEl = document.querySelector(".conversation-name")
    if (nameEl) {
      const name = nameEl.textContent?.trim()
      if (name) return name
    }
    return null
  }

  getSubmitButtonSelectors(): string[] {
    return [`${SUBMIT_BUTTON_SELECTOR}:not(.empty)`]
  }

  findSubmitButton(): HTMLElement | null {
    const button = document.querySelector(SUBMIT_BUTTON_SELECTOR) as HTMLElement | null
    if (!button || button.classList.contains("empty")) return null
    if (button.offsetParent === null) return null
    return button
  }

  getScrollContainer(): HTMLElement | null {
    const list = document.querySelector(RESPONSE_CONTAINER_SELECTOR) as HTMLElement | null
    if (list && list.scrollHeight > list.clientHeight) {
      return list
    }

    const chatScroll = document.querySelector(".chatScrollContainer") as HTMLElement | null
    if (chatScroll && chatScroll.scrollHeight > chatScroll.clientHeight) {
      return chatScroll
    }

    return super.getScrollContainer()
  }

  getResponseContainerSelector(): string {
    return RESPONSE_CONTAINER_SELECTOR
  }

  getChatContentSelectors(): string[] {
    return [ASSISTANT_MARKDOWN_SELECTOR, USER_TEXT_SELECTOR]
  }

  getUserQuerySelector(): string {
    return USER_QUERY_SELECTOR
  }

  extractUserQueryText(element: Element): string {
    const content = element.querySelector(USER_TEXT_SELECTOR) || element
    return this.extractTextWithLineBreaks(content).trim()
  }

  extractUserQueryMarkdown(element: Element): string {
    return this.extractUserQueryText(element)
  }

  extractUserQueryExportContent(element: Element): string {
    return this.extractChatGLMUserQueryExportContent(element)
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    const contentRoot = element.querySelector(USER_TEXT_SELECTOR) as HTMLElement | null
    if (!contentRoot) return false

    if (element.querySelector(".gh-user-query-markdown")) {
      return false
    }

    const rendered = document.createElement("div")
    rendered.className = [...contentRoot.classList, "gh-user-query-markdown", "gh-markdown-preview"]
      .filter((className) => className !== "dots" && className !== "dot-3-line")
      .join(" ")
      .trim()
    rendered.innerHTML = html

    const inlineStyle = contentRoot.getAttribute("style")
    if (inlineStyle) {
      rendered.setAttribute("style", inlineStyle)
    }

    rendered.style.textAlign = "left"
    rendered.style.display = "block"
    rendered.style.width = "100%"

    contentRoot.style.display = "none"

    const collapseButton = element.querySelector(".collapse-button-bg") as HTMLElement | null
    if (collapseButton) {
      collapseButton.style.display = "none"
    }

    contentRoot.after(rendered)
    return true
  }

  extractAssistantResponseText(element: Element): string {
    return this.extractChatGLMAssistantExportContent(element).trim()
  }

  getLatestReplyText(): string | null {
    const container = document.querySelector(RESPONSE_CONTAINER_SELECTOR) || document.body
    const replies = this.collectChatGLMAssistantExportElements(container)
    const last = replies[replies.length - 1]
    if (!last) return null

    const text = this.extractAssistantResponseText(last)
    return text || null
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const container = document.querySelector(RESPONSE_CONTAINER_SELECTOR)
    if (!container) return []

    const outline: OutlineItem[] = []
    const items = Array.from(container.querySelectorAll(CONVERSATION_ITEM_SELECTOR))

    const findNextAssistantMarkdown = (startIndex: number): Element | null => {
      for (let i = startIndex + 1; i < items.length; i++) {
        const candidate = items[i].querySelector(ASSISTANT_MARKDOWN_SELECTOR)
        if (candidate) return candidate
      }
      return null
    }

    items.forEach((item, itemIndex) => {
      const userRoot = item.querySelector(USER_QUERY_SELECTOR)
      if (userRoot) {
        if (includeUserQueries) {
          const text = this.extractUserQueryMarkdown(userRoot)
          if (text) {
            let wordCount: number | undefined
            if (showWordCount) {
              const nextAssistant = findNextAssistantMarkdown(itemIndex)
              wordCount = nextAssistant?.textContent?.trim().length || 0
            }

            outline.push({
              level: 0,
              text:
                text.length > MAX_OUTLINE_TEXT_LENGTH
                  ? `${text.slice(0, MAX_OUTLINE_TEXT_LENGTH)}...`
                  : text,
              element: userRoot,
              isUserQuery: true,
              isTruncated: text.length > MAX_OUTLINE_TEXT_LENGTH,
              wordCount,
            })
          }
        }
      }

      const markdownBlocks = item.querySelectorAll(ASSISTANT_MARKDOWN_SELECTOR)
      if (!markdownBlocks.length) return

      markdownBlocks.forEach((markdown) => {
        const headings = Array.from(markdown.querySelectorAll("h1, h2, h3, h4, h5, h6"))
        headings.forEach((heading, headingIndex) => {
          if (this.isInRenderedMarkdownContainer(heading)) return

          const level = Number.parseInt(heading.tagName.slice(1), 10)
          if (Number.isNaN(level) || level > maxLevel) return

          const text = heading.textContent?.trim() || ""
          if (!text) return

          let wordCount: number | undefined
          if (showWordCount) {
            let nextBoundary: Element | null = null
            for (let i = headingIndex + 1; i < headings.length; i++) {
              const candidate = headings[i]
              const candidateLevel = Number.parseInt(candidate.tagName.slice(1), 10)
              if (!Number.isNaN(candidateLevel) && candidateLevel <= level) {
                nextBoundary = candidate
                break
              }
            }
            wordCount = this.calculateRangeWordCount(heading, nextBoundary, markdown)
          }

          outline.push({
            level,
            text,
            element: heading,
            wordCount,
          })
        })
      })
    })

    return outline
  }

  getExportConfig(): ExportConfig {
    return {
      userQuerySelector: USER_QUERY_SELECTOR,
      assistantResponseSelector: ASSISTANT_RESPONSE_SELECTOR,
      turnSelector: null,
      useShadowDOM: false,
    }
  }

  async prepareConversationExport(context: ExportLifecycleContext): Promise<unknown> {
    this.exportIncludeThoughtsOverride = context.includeThoughts
    this.exportApiMessages = null

    if (this.isSharePage()) {
      this.exportApiMessages = await this.fetchShareApiMessages()
    }

    return null
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    _state: unknown,
  ): Promise<void> {
    this.exportIncludeThoughtsOverride = null
    this.exportApiMessages = null
  }

  async extractExportMessages(_context: ExportLifecycleContext): Promise<ExportMessage[] | null> {
    const messages = this.extractChatGLMExportMessages()
    return messages.length > 0 ? messages : null
  }

  async extractExportBundle(_context: ExportLifecycleContext): Promise<ExportBundle | null> {
    return this.createExportBundleFromMessages((collector) =>
      this.extractChatGLMExportMessages(collector),
    )
  }

  private async fetchShareApiMessages(): Promise<ChatGLMApiMessage[] | null> {
    const shareConversationId = this.getShareConversationId()
    if (!shareConversationId) return null

    try {
      const response = await fetch(
        `/chatglm/share-api/conversation/info/${encodeURIComponent(shareConversationId)}`,
        {
          credentials: "include",
          headers: { accept: "application/json" },
        },
      )

      if (!response.ok) {
        throw new Error(`share conversation info failed with ${response.status}`)
      }

      const payload = (await response.json()) as ChatGLMShareResponse
      const messages = payload?.result?.messages
      return Array.isArray(messages) ? messages : null
    } catch (error) {
      console.warn("[ChatGLMAdapter] Failed to load share export metadata:", error)
      return null
    }
  }

  private getShareConversationId(): string {
    return new URLSearchParams(window.location.search).get(SHARE_SESSION_ID_PARAM)?.trim() || ""
  }

  private extractChatGLMExportMessages(collector?: ExportAssetCollector): ExportMessage[] {
    if (this.exportApiMessages?.length) {
      return this.extractChatGLMApiExportMessages(this.exportApiMessages, collector)
    }

    return this.extractChatGLMDomExportMessages(collector)
  }

  private extractChatGLMApiExportMessages(
    apiMessages: ChatGLMApiMessage[],
    collector?: ExportAssetCollector,
  ): ExportMessage[] {
    const messages: ExportMessage[] = []

    apiMessages.forEach((message) => {
      const userContent = this.extractChatGLMApiUserContent(message, collector).trim()
      if (userContent) {
        messages.push({ role: "user", content: userContent })
      }

      const assistantContent = this.extractChatGLMApiAssistantContent(message, collector).trim()
      if (assistantContent) {
        messages.push({ role: "assistant", content: assistantContent })
      }
    })

    return messages
  }

  private extractChatGLMApiUserContent(
    message: ChatGLMApiMessage,
    collector?: ExportAssetCollector,
  ): string {
    const bodyParts: string[] = []
    const attachments: ChatGLMExportAttachment[] = []

    message.input?.content?.forEach((content) => {
      if (content.type === "text" && content.text?.trim()) {
        bodyParts.push(content.text.trim())
      }

      content.image?.forEach((item) => {
        const attachment = this.createChatGLMApiAttachment(item, "image")
        if (attachment) attachments.push(attachment)
      })

      content.file?.forEach((item) => {
        const attachment = this.createChatGLMApiAttachment(item, "file")
        if (attachment) attachments.push(attachment)
      })
    })

    return this.formatChatGLMUserExportContent(bodyParts.join("\n\n"), attachments, collector)
  }

  private extractChatGLMApiAssistantContent(
    message: ChatGLMApiMessage,
    collector?: ExportAssetCollector,
  ): string {
    const includeThoughts = this.shouldIncludeThoughtsInExport()
    const thoughtBlocks: string[] = []
    const bodyParts: string[] = []
    const imageAttachments: ChatGLMExportAttachment[] = []

    message.output?.parts?.forEach((part) => {
      const partThought = this.extractChatGLMApiThought(part, part)
      if (partThought) {
        if (includeThoughts) {
          thoughtBlocks.push(this.formatAsThoughtBlockquote(partThought))
        }
        return
      }

      part.content?.forEach((content) => {
        const thought = this.extractChatGLMApiThought(content, part)
        if (thought) {
          if (includeThoughts) {
            thoughtBlocks.push(this.formatAsThoughtBlockquote(thought))
          }
          return
        }

        content.image?.forEach((image) => {
          const attachment = this.createChatGLMGeneratedImageAttachment(image.image_url || "")
          if (attachment) imageAttachments.push(attachment)
        })

        const text = this.extractChatGLMApiBodyText(content)
        if (text) bodyParts.push(text)
      })
    })

    message.output?.image_list?.forEach((source) => {
      const attachment = this.createChatGLMGeneratedImageAttachment(source)
      if (attachment) imageAttachments.push(attachment)
    })

    const imageMarkdown = this.formatChatGLMAssistantImageAttachments(imageAttachments, collector)
    return [thoughtBlocks.join("\n\n"), imageMarkdown.join("\n\n"), bodyParts.join("\n\n")]
      .filter(Boolean)
      .join("\n\n")
  }

  private extractChatGLMApiThought(
    content: ChatGLMApiOutputContent | ChatGLMApiOutputPart,
    part: ChatGLMApiOutputPart,
  ): string {
    const thoughtText = this.extractChatGLMApiThoughtText(content)
    if (!thoughtText) return ""

    const contentType = "type" in content ? content.type || "" : ""
    const answerType = content.answer_type || ""
    if (/^(think|text_thinking|advanced_thinking)$/i.test(contentType || answerType)) {
      return thoughtText
    }

    const showType = content.meta_data?.show_type || part.meta_data?.show_type || ""
    const engineType = content.meta_data?.engine?.type || part.meta_data?.engine?.type || ""
    if (/think|thought|reason|cot/i.test(`${showType} ${engineType}`)) {
      return thoughtText
    }

    return ""
  }

  private extractChatGLMApiBodyText(content: ChatGLMApiOutputContent): string {
    if (content.type === "tool_calls") return ""
    if (this.extractChatGLMApiThought(content, { meta_data: content.meta_data })) return ""
    return this.extractChatGLMApiContentText(content)
  }

  private extractChatGLMApiThoughtText(
    content: ChatGLMApiOutputContent | ChatGLMApiOutputPart,
  ): string {
    const advancedThinkingText = content.advancedThinkingData
      ?.map((item) => this.extractChatGLMApiContentText(item))
      .filter(Boolean)
      .join("\n\n")

    return advancedThinkingText || this.extractChatGLMApiContentText(content)
  }

  private extractChatGLMApiContentText(
    content: ChatGLMApiOutputContent | ChatGLMApiOutputPart,
  ): string {
    return (
      content.think?.trim() ||
      content.text?.trim() ||
      content.answer?.trim() ||
      ("content" in content && typeof content.content === "string" ? content.content.trim() : "") ||
      ("intent_original_output" in content ? content.intent_original_output?.trim() || "" : "") ||
      ("type" in content && content.type === "code" ? content.code?.trim() || "" : "")
    )
  }

  private createChatGLMApiAttachment(
    item: ChatGLMApiAttachment,
    fallbackKind: ChatGLMExportAttachment["kind"],
  ): ChatGLMExportAttachment | null {
    const name = this.decodeChatGLMAttachmentName(
      item.file_name || item.file_id || (fallbackKind === "image" ? "uploaded image" : "file"),
    )
    const source = this.normalizeChatGLMAttachmentSource(item.file_url || item.image_url || "")
    const type = item.file_type || item.type || name.match(/\.([A-Za-z0-9]{1,10})$/)?.[1] || ""
    const kind = this.isChatGLMImageAttachment(name, type, source) ? "image" : fallbackKind

    if (!name && !source) return null

    return {
      kind,
      name: name || (kind === "image" ? "uploaded image" : "file"),
      source,
      type,
      size: item.file_size,
    }
  }

  private createChatGLMGeneratedImageAttachment(
    sourceValue: string,
  ): ChatGLMExportAttachment | null {
    const source = this.normalizeChatGLMAttachmentSource(sourceValue)
    if (!source) return null

    return {
      kind: "image",
      name: this.extractChatGLMFilenameFromUrl(source) || "generated image",
      source,
      type: "image",
    }
  }

  private extractChatGLMDomExportMessages(collector?: ExportAssetCollector): ExportMessage[] {
    const container = document.querySelector(RESPONSE_CONTAINER_SELECTOR) || document.body
    const assistantElements = this.collectChatGLMAssistantExportElements(container)
    const blocks = [
      ...Array.from(container.querySelectorAll(USER_QUERY_SELECTOR)).map((element) => ({
        role: "user" as const,
        element,
      })),
      ...assistantElements.map((element) => ({
        role: "assistant" as const,
        element,
      })),
    ]
      .filter(({ element }) => !element.closest(".gh-root, .gh-user-query-markdown"))
      .sort((left, right) => this.compareDomOrder(left.element, right.element))

    const messages: ExportMessage[] = []
    blocks.forEach(({ role, element }) => {
      const content =
        role === "user"
          ? this.extractChatGLMUserQueryExportContent(element, collector)
          : this.extractChatGLMAssistantExportContent(element, collector)
      const normalized = content.trim()
      if (!normalized) return

      const previous = messages[messages.length - 1]
      if (previous?.role === role) {
        previous.content = `${previous.content}\n\n${normalized}`
        return
      }

      messages.push({ role, content: normalized })
    })

    return messages
  }

  private collectChatGLMAssistantExportElements(container: Element): Element[] {
    const elements: Element[] = []
    const seen = new Set<Element>()
    const candidates = Array.from(
      container.querySelectorAll(`${ASSISTANT_RESPONSE_SELECTOR}, ${THINKING_CONTAINER_SELECTOR}`),
    )

    candidates.forEach((candidate) => {
      if (candidate.closest(".gh-root, .gh-user-query-markdown")) return

      const thoughtRoot = this.findChatGLMThoughtRoot(candidate)
      const containingAnswer = thoughtRoot?.closest(ASSISTANT_RESPONSE_SELECTOR)
      if (thoughtRoot && containingAnswer && containingAnswer !== thoughtRoot) return

      const target = thoughtRoot || candidate
      if (!thoughtRoot && candidate.closest(THINKING_CONTAINER_SELECTOR)) return
      if (seen.has(target)) return

      seen.add(target)
      elements.push(target)
    })

    return elements.sort((left, right) => this.compareDomOrder(left, right))
  }

  private findChatGLMThoughtRoot(element: Element): Element | null {
    let root: Element | null = element.matches(THINKING_CONTAINER_SELECTOR)
      ? element
      : element.closest(THINKING_CONTAINER_SELECTOR)
    if (!root) return null

    let parent = root.parentElement?.closest(THINKING_CONTAINER_SELECTOR) || null
    while (parent) {
      root = parent
      parent = root.parentElement?.closest(THINKING_CONTAINER_SELECTOR) || null
    }

    return root
  }

  private compareDomOrder(left: Element, right: Element): number {
    if (left === right) return 0
    const position = left.compareDocumentPosition(right)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  }

  private extractChatGLMUserQueryExportContent(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    const body = this.extractUserQueryMarkdown(element).trim()
    const attachments = this.extractChatGLMUserAttachmentsFromDom(element)
    return this.formatChatGLMUserExportContent(body, attachments, collector)
  }

  private extractChatGLMAssistantExportContent(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    const includeThoughts = this.shouldIncludeThoughtsInExport()
    const isThoughtOnlyElement = element.matches(THINKING_CONTAINER_SELECTOR)
    const clone = element.cloneNode(true) as HTMLElement
    const thoughtResult = this.extractThoughtBlockquotes(clone)
    const thoughtBlocks = includeThoughts ? thoughtResult.blocks : []
    if (isThoughtOnlyElement) return thoughtBlocks.join("\n\n")

    thoughtResult.removalNodes.forEach((node) => node.remove())
    clone.querySelectorAll(THINKING_CONTAINER_SELECTOR).forEach((node) => node.remove())

    const imageMarkdown = this.extractChatGLMAssistantImageMarkdown(element, collector)
    const markdownRoot = clone.matches(ASSISTANT_RESPONSE_SELECTOR)
      ? clone
      : clone.matches(".markdown-body")
        ? clone
        : clone.querySelector(".markdown-body") || clone
    const bodyClone = markdownRoot.cloneNode(true) as HTMLElement
    bodyClone.querySelectorAll(EXPORT_DECORATION_SELECTOR).forEach((node) => node.remove())
    bodyClone.querySelectorAll("img").forEach((node) => {
      if (node instanceof HTMLImageElement && this.isExportableChatGLMImage(node)) {
        node.remove()
      }
    })

    const bodyMarkdown = (
      htmlToMarkdown(bodyClone) || this.extractTextWithLineBreaks(bodyClone)
    ).trim()

    return [thoughtBlocks.join("\n\n"), imageMarkdown.join("\n\n"), bodyMarkdown]
      .filter(Boolean)
      .join("\n\n")
  }

  private formatChatGLMUserExportContent(
    body: string,
    attachments: ChatGLMExportAttachment[],
    collector?: ExportAssetCollector,
  ): string {
    if (attachments.length === 0) return body

    const uniqueAttachments = this.dedupeChatGLMAttachments(attachments)
    const imageMarkdown = this.formatChatGLMUserImageAttachments(uniqueAttachments, collector)
    const fileMarkdown = this.formatChatGLMUserFileAttachments(uniqueAttachments, collector)
    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, body].filter(Boolean).join("\n\n")
  }

  private extractChatGLMUserAttachmentsFromDom(element: Element): ChatGLMExportAttachment[] {
    const scope = element.matches(USER_QUERY_SELECTOR)
      ? element
      : element.closest(USER_QUERY_SELECTOR)
    if (!scope) return []

    const attachments: ChatGLMExportAttachment[] = []

    Array.from(scope.querySelectorAll("img")).forEach((image) => {
      if (!(image instanceof HTMLImageElement)) return
      const source = this.extractChatGLMImageSource(image)
      if (!source) return
      const name =
        this.extractChatGLMAttachmentNameFromElement(image) || image.alt || "uploaded image"
      attachments.push({
        kind: "image",
        name,
        source,
        type: name.match(/\.([A-Za-z0-9]{1,10})$/)?.[1] || "image",
      })
    })

    const candidates = Array.from(
      scope.querySelectorAll("a[href], button, [class*='file'], [class*='image-with-text']"),
    )
    candidates.forEach((candidate) => {
      if (candidate.closest(".gh-root, .gh-user-query-markdown")) return
      const attachment = this.extractChatGLMDomAttachment(candidate)
      if (attachment) attachments.push(attachment)
    })

    return this.dedupeChatGLMAttachments(attachments)
  }

  private extractChatGLMDomAttachment(element: Element): ChatGLMExportAttachment | null {
    const text = this.extractTextWithLineBreaks(element).replace(/\s+/g, " ").trim()
    const source = this.extractChatGLMDownloadableSource(element)
    const name =
      this.extractChatGLMAttachmentNameFromText(text) || this.extractChatGLMFilenameFromUrl(source)
    if (!name) return null

    const type = name.match(/\.([A-Za-z0-9]{1,10})$/)?.[1] || ""
    const kind = this.isChatGLMImageAttachment(name, type, source) ? "image" : "file"
    return {
      kind,
      name,
      source,
      type,
      size: this.parseChatGLMSizeLabel(text),
    }
  }

  private extractChatGLMAttachmentNameFromElement(element: Element): string {
    const text = this.extractTextWithLineBreaks(
      element.closest("button, a, [class*='file']") || element,
    )
    return this.extractChatGLMAttachmentNameFromText(text)
  }

  private extractChatGLMAttachmentNameFromText(text: string): string {
    const normalized = text.replace(/\s+/g, " ").trim()
    return normalized.match(/[^\s/\\]+\.[A-Za-z0-9]{1,10}/)?.[0] || ""
  }

  private extractChatGLMAssistantImageMarkdown(
    element: Element,
    collector?: ExportAssetCollector,
  ): string[] {
    const attachments = Array.from(element.querySelectorAll("img"))
      .filter(
        (node): node is HTMLImageElement =>
          node instanceof HTMLImageElement && this.isExportableChatGLMImage(node),
      )
      .map((image) => ({
        kind: "image" as const,
        name:
          image.alt ||
          this.extractChatGLMFilenameFromUrl(this.extractChatGLMImageSource(image)) ||
          "generated image",
        source: this.extractChatGLMImageSource(image),
        type: "image",
      }))

    return this.formatChatGLMAssistantImageAttachments(attachments, collector)
  }

  private formatChatGLMUserImageAttachments(
    attachments: ChatGLMExportAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportImageAttachments(attachments, collector, { siteId: this.getSiteId() })
  }

  private formatChatGLMAssistantImageAttachments(
    attachments: ChatGLMExportAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportImageAttachments(this.dedupeChatGLMAttachments(attachments), collector, {
      siteId: this.getSiteId(),
      role: "assistant",
      category: "generated-image",
      fallbackAlt: "generated image",
    })
  }

  private formatChatGLMUserFileAttachments(
    attachments: ChatGLMExportAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportFileAttachments(attachments, collector, {
      siteId: this.getSiteId(),
      getLabel: (attachment) => {
        const sizeLabel = attachment.size ? `, ${this.formatChatGLMFileSize(attachment.size)}` : ""
        if (!attachment.type) return `${attachment.name}${sizeLabel}`
        if (attachment.name.toLowerCase().endsWith(attachment.type.toLowerCase())) {
          return `${attachment.name}${sizeLabel}`
        }
        return `${attachment.name} (${attachment.type}${sizeLabel})`
      },
    })
  }

  private dedupeChatGLMAttachments(
    attachments: ChatGLMExportAttachment[],
  ): ChatGLMExportAttachment[] {
    const seen = new Set<string>()
    const unique: ChatGLMExportAttachment[] = []

    attachments.forEach((attachment) => {
      const sourceKey = this.getChatGLMAttachmentSourceKey(attachment.source)
      const nameKey = `${attachment.kind}:${attachment.name.trim().toLowerCase()}:${attachment.type.trim().toLowerCase()}`
      const key = sourceKey ? `${attachment.kind}:source:${sourceKey}` : nameKey
      if (seen.has(key)) return
      seen.add(key)
      unique.push(attachment)
    })

    return unique
  }

  private extractThoughtBlockquotes(element: Element): {
    blocks: string[]
    removalNodes: Element[]
  } {
    const candidates = [
      ...(element.matches(THINKING_CONTAINER_SELECTOR) ? [element] : []),
      ...Array.from(element.querySelectorAll(THINKING_CONTAINER_SELECTOR)),
    ]
    const thoughtNodes = candidates.filter(
      (node) => !node.parentElement?.closest(THINKING_CONTAINER_SELECTOR),
    )

    const blocks: string[] = []
    const removalNodes: Element[] = []

    thoughtNodes.forEach((node) => {
      const target =
        node.querySelector(
          "blockquote[slot='content'], blockquote, .text-advance-thinking-content .markdown-body, .thinking-content .markdown-body, .advance-thinking-area .markdown-body, .markdown-body",
        ) || node
      const clone = target.cloneNode(true) as HTMLElement
      clone.querySelectorAll(EXPORT_DECORATION_SELECTOR).forEach((child) => child.remove())

      const wrapper = document.createElement("div")
      Array.from(clone.childNodes).forEach((child) => wrapper.appendChild(child.cloneNode(true)))
      const markdown = (htmlToMarkdown(wrapper) || this.extractTextWithLineBreaks(clone)).trim()
      if (markdown) blocks.push(this.formatAsThoughtBlockquote(markdown))
      removalNodes.push(node)
    })

    return { blocks, removalNodes }
  }

  private shouldIncludeThoughtsInExport(): boolean {
    if (typeof this.exportIncludeThoughtsOverride === "boolean") {
      return this.exportIncludeThoughtsOverride
    }
    return false
  }

  private formatAsThoughtBlockquote(markdown: string): string {
    const cleaned = markdown.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n")
    const quotedLines = cleaned.split("\n").map((line) => (line.trim() ? `> ${line}` : ">"))
    return ["> [Thought]", ...quotedLines].join("\n")
  }

  private isExportableChatGLMImage(image: HTMLImageElement): boolean {
    const source = this.extractChatGLMImageSource(image)
    if (!source) return false
    if (!isDownloadableExportAssetUrl(source)) return false
    if (source.startsWith("data:image/svg+xml")) return false

    try {
      const url = new URL(source, window.location.href)
      if (url.hostname === "chatglm.cn" && /^\/(assets|icon)\//i.test(url.pathname)) {
        return false
      }
      if (/image_loading|newLogo|avatar|favicon|icon/i.test(url.pathname)) return false
      if (/\/(chat\/image|testpath|file)\//i.test(url.pathname)) return true
    } catch {
      return false
    }

    const rect = image.getBoundingClientRect()
    return (
      Math.max(image.naturalWidth || 0, rect.width) >= 80 &&
      Math.max(image.naturalHeight || 0, rect.height) >= 80
    )
  }

  private extractChatGLMImageSource(image: HTMLImageElement): string {
    if (this.isChatGLMAvatarImage(image)) return ""

    const candidates = [image.currentSrc || "", image.src || "", image.getAttribute("src") || ""]
    for (const candidate of candidates) {
      const source = this.normalizeChatGLMAttachmentSource(candidate)
      if (source) return source
    }
    return ""
  }

  private isChatGLMAvatarImage(image: HTMLImageElement): boolean {
    if (image.classList.contains("user-img") || image.classList.contains("avatar")) return true
    if (image.closest(".user-img, .avatar, .user-avatar, .userInfoBar-header")) return true

    const source = image.currentSrc || image.src || image.getAttribute("src") || ""
    return /\/wechat_avatar\//i.test(source)
  }

  private extractChatGLMDownloadableSource(root: Element): string {
    const image = Array.from(root.querySelectorAll("img")).find(
      (node): node is HTMLImageElement =>
        node instanceof HTMLImageElement && Boolean(this.extractChatGLMImageSource(node)),
    )
    if (image) return this.extractChatGLMImageSource(image)

    const nodes = [root, ...Array.from(root.querySelectorAll("*"))]
    for (const node of nodes) {
      for (const attr of CHATGLM_ATTACHMENT_SOURCE_ATTRS) {
        const source = this.normalizeChatGLMAttachmentSource(node.getAttribute(attr) || "")
        if (source) return source
      }
    }

    return ""
  }

  private normalizeChatGLMAttachmentSource(value: string): string {
    const source = normalizeExportAssetUrl(value)
    if (!source || !isDownloadableExportAssetUrl(source)) return ""

    try {
      const url = new URL(source, window.location.href)
      if (url.hostname === "chatglm.cn" && /^\/(assets|icon)\//i.test(url.pathname)) return ""
      if (/wechat_avatar|image_loading|newLogo|avatar|favicon|iconfont/i.test(url.pathname)) {
        return ""
      }
    } catch {
      return ""
    }

    return source
  }

  private isChatGLMImageAttachment(name: string, type: string, source: string): boolean {
    const signal = `${name} ${type} ${source}`.toLowerCase()
    return (
      /\bimage\b/.test(signal) ||
      /图片|圖像|图像/.test(signal) ||
      /\.(png|jpe?g|webp|gif|avif|svg)(?:$|[?#\s])/.test(signal) ||
      /^data:image\//i.test(source)
    )
  }

  private parseChatGLMSizeLabel(value: string): number | undefined {
    const match = value.match(/(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)/i)
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

  private formatChatGLMFileSize(size: number): string {
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

  private extractChatGLMFilenameFromUrl(source: string): string {
    if (!source) return ""
    try {
      const path = new URL(source, window.location.href).pathname
      return this.decodeChatGLMAttachmentName(path.split("/").pop() || "")
    } catch {
      return ""
    }
  }

  private getChatGLMAttachmentSourceKey(source: string): string {
    if (!source) return ""
    if (/^(blob:|data:)/i.test(source)) return source

    try {
      const url = new URL(source, window.location.href)
      return `${url.hostname}${url.pathname}`.toLowerCase()
    } catch {
      return source.split("?")[0].toLowerCase()
    }
  }

  private decodeChatGLMAttachmentName(value: string): string {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  isGenerating(): boolean {
    const selectors = [
      ".enter.searching .enter-icon-container", // 输入区域的停止按钮容器
      ".stop-generate",
      ".stop-stream-tip",
      ".answer-content-wrap .generating-icon",
      ".enter-icon-container.stop",
      ".enter.searching",
      ".enter.is-main-chat.searching",
    ]

    for (const selector of selectors) {
      const el = document.querySelector(selector) as HTMLElement | null
      if (el && el.offsetParent !== null) return true
    }

    return false
  }

  getStopButtonSelectors(): string[] {
    return [
      ".enter.searching .enter-icon-container", // 输入区域的停止按钮容器（优先）
      ".stop-generate",
      ".stop-stream-tip",
      ".answer-content-wrap .generating-icon",
      ".enter-icon-container.stop",
      ".enter.searching", // 兜底：外层 div
      ".enter.is-main-chat.searching",
    ]
  }

  getModelName(): string | null {
    const selectors = [
      ".wrapper-title .showHideText",
      ".wrapper-title .wrapper-title-innerText",
      ".wrapper-title",
      ".selected-model-info .model-select-name",
      ".model-select-container .model-select-name",
      ".model-select-list .model-select-item.selected .model-select-name",
      ".model-select-name",
    ]

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector)
      for (const element of Array.from(elements)) {
        const text = element.textContent?.trim()
        if (!text) continue

        const el = element as HTMLElement
        if (el.offsetParent !== null) {
          return text.split("\n")[0].trim()
        }
      }
    }

    // 兜底：寻找第一个非空模型名
    for (const selector of selectors) {
      const element = document.querySelector(selector)
      const text = element?.textContent?.trim()
      if (text) return text.split("\n")[0].trim()
    }

    return null
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: [
        ".wrapper-title",
        ".wrapper-title .showHideText",
        ".model-select-icon-container",
        ".selected-model-info",
        ".model-select-container",
      ],
      menuItemSelector: ".model-select-list .model-select-item",
      menuRenderDelay: 150,
      checkInterval: 1000,
      maxAttempts: 10,
    }
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
    return {
      urlPatterns: ["/chatglm/backend-api/assistant/stream"],
      silenceThreshold: 2000,
    }
  }

  getWidthSelectors() {
    const codeBlockStretchCss = [
      "width: 100% !important;",
      "margin-left: 0 !important;",
      "margin-right: 0 !important;",
      "box-sizing: border-box !important;",
    ].join(" ")

    return [
      { selector: ".conversation-container", property: "max-width" },
      { selector: ".conversation-inner", property: "max-width" },
      { selector: ".conversation-list", property: "max-width" },
      {
        selector: CONVERSATION_MESSAGE_WIDTH_SELECTOR,
        property: "max-width",
      },
      {
        selector: CONVERSATION_MARKDOWN_WIDTH_SELECTOR,
        property: "max-width",
      },
      {
        selector: ".code-no-artifacts .markdown-body.md-code, .code-no-artifacts .md-code",
        property: "max-width",
        value: "100%",
        extraCss: codeBlockStretchCss,
        noCenter: true,
      },
      {
        selector:
          ".code-no-artifacts .markdown-body.md-code > .language, .code-no-artifacts .markdown-body.md-code pre",
        property: "max-width",
        value: "100%",
        extraCss: "width: 100% !important; box-sizing: border-box !important;",
        noCenter: true,
      },
      {
        selector: ".markdown-body table, .answer-content-wrap .markdown-body table",
        property: "width",
        value: "100%",
        extraCss:
          "table-layout: fixed !important; display: table !important; min-width: 100% !important;",
        noCenter: true,
      },
      {
        selector: ".markdown-body table th, .markdown-body table td",
        property: "min-width",
        value: "0",
        noCenter: true,
      },
      { selector: ".conversation-list", property: "width", value: "100%" },
      {
        selector: ".conversation-bottom",
        property: "max-width",
        extraCss: "flex: 1 !important;",
      },
      {
        selector: ".component-box-new",
        property: "max-width",
      },
    ]
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    return {
      scopeSelector: CONVERSATION_SCOPE_SELECTOR,
      widthSelectors: [
        {
          selector: RESPONSE_CONTAINER_SELECTOR,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: CONVERSATION_MESSAGE_WIDTH_SELECTOR,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: CONVERSATION_MARKDOWN_WIDTH_SELECTOR,
          property: "max-width",
          extraCss: "min-width: 0 !important;",
        },
      ],
      insetSelectors: [
        {
          selector: CONVERSATION_INNER_SELECTOR,
          extraCss: "box-sizing: border-box;",
        },
      ],
      defaultWidth: "872px",
      gap: 16,
    }
  }

  getZenModeConfig() {
    return {
      hide: [".el-aside"],
    }
  }

  getCleanModeConfig() {
    return {
      hide: [".policy-wrap, .policy-wrap *", ".vip-btn", ".slogan-banner"],
    }
  }
}
