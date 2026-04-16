/**
 * ima 适配器（ima.qq.com）
 *
 * 范围说明：
 * - 支持输入框注入、导出、大纲、新对话、模型锁定、停止生成、页面宽度/禅模式
 * - 不支持主题切换
 * - 会话同步/会话面板能力按需求保持不支持
 */
import { SITE_IDS } from "~constants"
import { htmlToMarkdown } from "~utils/exporter"

import {
  SiteAdapter,
  type ExportConfig,
  type ExportLifecycleContext,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
} from "./base"

const IMA_HOSTNAME = "ima.qq.com"
const IMA_CHAT_PATH_PATTERN = /^\/chat\/([a-z0-9]+)(?:\/|$)/i
const IMA_CID_STORAGE_KEY = "ima-official-website-uid"

const IMA_SCROLL_CONTAINER_SELECTOR = "#scrollContainer"
const IMA_RESPONSE_CONTAINER_SELECTOR = `${IMA_SCROLL_CONTAINER_SELECTOR} [class*="scrollWrap"]`
const IMA_USER_BUBBLE_CONTAINER_SELECTOR = 'div[class*="userBubbleContainer"]'
const IMA_USER_BUBBLE_SELECTOR = `${IMA_USER_BUBBLE_CONTAINER_SELECTOR} [class*="userBubble"]`
const IMA_USER_TEXT_SELECTOR = `${IMA_USER_BUBBLE_SELECTOR} [class*="content"]`
const IMA_AI_CONTAINER_SELECTOR = 'div[class*="aiContainer"]'
const IMA_AI_BUBBLE_SELECTOR = `${IMA_AI_CONTAINER_SELECTOR} [class*="bubble"]`
const IMA_MARKDOWN_SELECTOR = `${IMA_AI_BUBBLE_SELECTOR} [class*="markdown"]`
const IMA_THINKING_SELECTOR = '[class*="thinking"]'
const IMA_THINKING_TITLE_SELECTOR =
  '[class*="tipsWrap"], [class*="thinkingTitle"], [class*="thinkingHeader"]'
const IMA_INLINE_REFERENCE_SELECTOR =
  '.system-copy-exclude, [x-noteelement="excluded"], [x-copyelement="copy-exclude"]'
const IMA_INPUT_SELECTOR =
  '#tagTextarea [contenteditable="true"], [class*="chatInputContainer"] .tiptap.ProseMirror'
const IMA_SEND_BUTTON_SELECTOR = '[class*="sendBtnWrap"]'
const IMA_SEND_DISABLED_SELECTOR = '.icon-send-disable-big, [class*="sendDisableIcon"]'
const IMA_STOP_BUTTON_SELECTOR = 'div[class*="stopButton"], [class*="stopButton"]'
const IMA_STOP_BUTTON_CLICKABLE_SELECTOR = [
  'div[class*="stopButton"] > div',
  '[class*="stopButton"][role="button"]',
  'button[class*="stopButton"]',
  '[class*="stopButton"]',
].join(", ")
const IMA_NEW_CHAT_BUTTON_SELECTOR = '[class*="newChatWrap"]'
const IMA_ACTIVE_HISTORY_TITLE_SELECTOR =
  '[class*="historyListWrap"] [class*="itemWrap"][class*="highLight"] [class*="main"]'
const IMA_HISTORY_SCROLL_SELECTOR = "#HistoryScrollContainer"
const IMA_MODEL_BUTTON_SELECTOR =
  '[class*="currentChoiceWrap"], [class*="modelSelectionWrap"], [class*="modelSelectionText"]'
const IMA_MODEL_TEXT_SELECTOR = '[class*="modelSelectionText"]'
const IMA_MODEL_MENU_ITEM_SELECTOR =
  '.modelDropdown .t-dropdown__item, .modelDropdown [class*="modelOption"], .t-popup .modelDropdown .t-dropdown__item'
const IMA_FOOT_TIPS_SELECTOR = '[class*="footTips"]'

const MAX_OUTLINE_TEXT_LENGTH = 80

export class ImaAdapter extends SiteAdapter {
  private exportIncludeThoughts: boolean | undefined = undefined

  match(): boolean {
    return window.location.hostname === IMA_HOSTNAME
  }

  getSiteId(): string {
    return SITE_IDS.IMA
  }

  getName(): string {
    return "ima"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#07a45f", secondary: "#05854d" }
  }

  getSessionId(): string {
    const match = window.location.pathname.match(IMA_CHAT_PATH_PATTERN)
    return match?.[1] || ""
  }

  isNewConversation(): boolean {
    const path = window.location.pathname.replace(/\/+$/, "") || "/"
    return path === "/"
  }

  getCurrentCid(): string | null {
    const raw = window.localStorage.getItem(IMA_CID_STORAGE_KEY)
    if (!raw) return null

    try {
      const parsed = JSON.parse(raw) as unknown
      if (typeof parsed === "string" && parsed.trim()) return parsed.trim()
      if (parsed && typeof parsed === "object") {
        for (const key of ["uid", "id", "userId", "openId"]) {
          const value = (parsed as Record<string, unknown>)[key]
          if (typeof value === "string" && value.trim()) {
            return value.trim()
          }
        }
      }
    } catch {
      // fallback to raw string below
    }

    return raw.trim() || null
  }

  getSessionName(): string | null {
    const sidebarTitle = this.getActiveHistoryTitle()
    if (sidebarTitle) return sidebarTitle

    const title = document.title.trim()
    if (!title) return null

    const cleaned = title
      .replace(/\s*[-|]\s*ima$/i, "")
      .replace(/^ima\s*[-|]\s*/i, "")
      .trim()

    if (!cleaned || cleaned.toLowerCase() === "ima") {
      return null
    }

    return cleaned
  }

  getNewTabUrl(): string {
    return "https://ima.qq.com/"
  }

  getConversationTitle(): string | null {
    return this.getActiveHistoryTitle() || this.getSessionName()
  }

  getTextareaSelectors(): string[] {
    return [IMA_INPUT_SELECTOR]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (!super.isValidTextarea(element)) return false
    if (!element.isContentEditable) return false
    return !!element.closest("#tagTextarea, [class*='chatInputContainer']")
  }

  insertPrompt(content: string): boolean {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return false

    editor.focus()
    this.selectAllEditorContent(editor)

    const pasted = this.tryPasteText(editor, content)
    if (pasted) return true

    try {
      if (document.execCommand("insertText", false, content)) {
        this.dispatchEditorInput(editor, content, "insertText")
        return true
      }
    } catch {
      // fallback below
    }

    editor.textContent = content
    this.dispatchEditorInput(editor, content, "insertText")
    return true
  }

  clearTextarea(): void {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return

    editor.focus()
    this.selectAllEditorContent(editor)

    try {
      document.execCommand("delete", false)
    } catch {
      // fallback below
    }

    editor.textContent = ""
    this.dispatchEditorInput(editor, "", "deleteContentBackward")
  }

  getSubmitButtonSelectors(): string[] {
    return [IMA_SEND_BUTTON_SELECTOR]
  }

  findSubmitButton(editor: HTMLElement | null): HTMLElement | null {
    const scopes = [
      editor?.closest("#tagTextarea"),
      editor?.closest('[class*="chatInputContainer"]'),
      document.querySelector('[class*="chatInputContainer"]'),
      document.body,
    ].filter(Boolean) as ParentNode[]

    for (const scope of scopes) {
      const button = scope.querySelector(IMA_SEND_BUTTON_SELECTOR) as HTMLElement | null
      if (!button || !this.isVisibleElement(button)) continue
      if (button.querySelector(IMA_SEND_DISABLED_SELECTOR)) continue
      return button
    }

    return null
  }

  getNewChatButtonSelectors(): string[] {
    return [IMA_NEW_CHAT_BUTTON_SELECTOR]
  }

  getSidebarScrollContainer(): Element | null {
    return document.querySelector(IMA_HISTORY_SCROLL_SELECTOR)
  }

  getScrollContainer(): HTMLElement | null {
    const container = document.querySelector(IMA_SCROLL_CONTAINER_SELECTOR)
    return container instanceof HTMLElement ? container : null
  }

  getResponseContainerSelector(): string {
    return IMA_RESPONSE_CONTAINER_SELECTOR
  }

  getChatContentSelectors(): string[] {
    return [IMA_USER_BUBBLE_CONTAINER_SELECTOR, IMA_AI_CONTAINER_SELECTOR]
  }

  getUserQuerySelector(): string | null {
    return IMA_USER_BUBBLE_CONTAINER_SELECTOR
  }

  extractUserQueryText(element: Element): string {
    const contentRoot = this.findUserContentRoot(element)
    if (!contentRoot) return ""

    const clone = contentRoot.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(".gh-user-query-markdown, button, [role='button'], svg")
      .forEach((node) => {
        node.remove()
      })

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
      if (inlineStyle) rendered.setAttribute("style", inlineStyle)
      contentRoot.style.display = "none"
    }

    contentRoot.after(rendered)
    return true
  }

  extractAssistantResponseText(element: Element): string {
    const clone = element.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(
        `${IMA_INLINE_REFERENCE_SELECTOR}, button, [role='button'], svg, [aria-hidden='true']`,
      )
      .forEach((node) => node.remove())

    const includeThoughts = this.shouldIncludeThoughtsInExport()
    const thoughtBlocks = includeThoughts ? this.extractThoughtBlockquotes(clone) : []

    clone.querySelectorAll(IMA_THINKING_SELECTOR).forEach((node) => node.remove())

    const markdownRoot = this.findAssistantMarkdownRoot(clone)
    const markdownSource = markdownRoot instanceof HTMLElement ? markdownRoot : clone
    const markdown = htmlToMarkdown(markdownSource).trim()

    if (includeThoughts && thoughtBlocks.length > 0) {
      const thoughtSection = thoughtBlocks.join("\n\n")
      return markdown ? `${thoughtSection}\n\n${markdown}` : thoughtSection
    }

    if (markdown) return markdown

    return this.extractTextWithLineBreaks(markdownSource).trim()
  }

  getLatestReplyText(): string | null {
    const replies = document.querySelectorAll(IMA_AI_CONTAINER_SELECTOR)
    const last = replies[replies.length - 1]
    if (!last) return null

    const text = this.extractAssistantResponseText(last)
    return text || null
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const container =
      document.querySelector(IMA_RESPONSE_CONTAINER_SELECTOR) ||
      document.querySelector(IMA_SCROLL_CONTAINER_SELECTOR)
    if (!container) return []

    const outline: OutlineItem[] = []
    const blocks = Array.from(
      container.querySelectorAll(
        `${IMA_USER_BUBBLE_CONTAINER_SELECTOR}, ${IMA_AI_CONTAINER_SELECTOR}`,
      ),
    ).filter((element) => !element.closest(".gh-root"))

    blocks.forEach((block, blockIndex) => {
      if (block.matches(IMA_USER_BUBBLE_CONTAINER_SELECTOR)) {
        if (!includeUserQueries) return

        const text = this.extractUserQueryText(block)
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          const nextAssistant = blocks
            .slice(blockIndex + 1)
            .find((element) => element.matches(IMA_AI_CONTAINER_SELECTOR))
          wordCount = nextAssistant ? this.extractAssistantResponseText(nextAssistant).length : 0
        }

        outline.push({
          level: 0,
          text: this.truncateText(text, MAX_OUTLINE_TEXT_LENGTH),
          element: block,
          isUserQuery: true,
          isTruncated: text.length > MAX_OUTLINE_TEXT_LENGTH,
          wordCount,
        })
        return
      }

      const markdownRoot = this.findAssistantMarkdownRoot(block)
      if (!markdownRoot) return

      const headings = Array.from(markdownRoot.querySelectorAll("h1, h2, h3, h4, h5, h6")).filter(
        (heading) => !this.isInRenderedMarkdownContainer(heading),
      )

      headings.forEach((heading, headingIndex) => {
        const level = Number.parseInt(heading.tagName.slice(1), 10)
        if (Number.isNaN(level) || level > maxLevel) return

        const text = this.extractHeadingText(heading)
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          let nextBoundary: Element | null = null
          for (let index = headingIndex + 1; index < headings.length; index += 1) {
            const candidate = headings[index]
            const candidateLevel = Number.parseInt(candidate.tagName.slice(1), 10)
            if (!Number.isNaN(candidateLevel) && candidateLevel <= level) {
              nextBoundary = candidate
              break
            }
          }
          wordCount = this.calculateRangeWordCount(heading, nextBoundary, markdownRoot)
        }

        outline.push({
          level,
          text,
          element: heading,
          wordCount,
        })
      })
    })

    return outline
  }

  getExportConfig(): ExportConfig | null {
    return {
      userQuerySelector: IMA_USER_BUBBLE_CONTAINER_SELECTOR,
      assistantResponseSelector: IMA_AI_CONTAINER_SELECTOR,
      turnSelector: null,
      useShadowDOM: false,
    }
  }

  async prepareConversationExport(context: ExportLifecycleContext): Promise<unknown> {
    this.exportIncludeThoughts = context.includeThoughts
    return null
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    _state: unknown,
  ): Promise<void> {
    this.exportIncludeThoughts = undefined
  }

  isGenerating(): boolean {
    return this.findStopButton() !== null
  }

  getStopButtonSelectors(): string[] {
    return [IMA_STOP_BUTTON_CLICKABLE_SELECTOR]
  }

  stopGeneration(): boolean {
    const button = this.findStopButton()
    if (!button) return false

    this.simulateClick(button)
    return true
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
    return {
      // ima 对话使用 SSE 流式接口：POST /cgi-bin/assistant/qa
      urlPatterns: ["/cgi-bin/assistant/qa"],
      urlPathEndsWith: ["/cgi-bin/assistant/qa"],
      silenceThreshold: 2000,
    }
  }

  getModelName(): string | null {
    const textNode = this.findVisibleElementBySelectors([IMA_MODEL_TEXT_SELECTOR])
    const text = textNode?.innerText?.trim() || textNode?.textContent?.trim() || ""
    if (text) return text.split("\n")[0].trim()

    const button = this.findVisibleElementBySelectors([IMA_MODEL_BUTTON_SELECTOR])
    const buttonText = button?.innerText?.trim() || button?.textContent?.trim() || ""
    return buttonText ? buttonText.split("\n")[0].trim() : null
  }

  getModelLockCheckText(selectorBtn?: HTMLElement | null): string {
    return this.getModelName() || super.getModelLockCheckText(selectorBtn)
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: [IMA_MODEL_BUTTON_SELECTOR, IMA_MODEL_TEXT_SELECTOR],
      menuItemSelector: IMA_MODEL_MENU_ITEM_SELECTOR,
      menuRenderDelay: 200,
      checkInterval: 1000,
      maxAttempts: 10,
    }
  }

  getWidthSelectors() {
    return [
      {
        selector: IMA_SCROLL_CONTAINER_SELECTOR,
        property: "max-width",
        extraCss: "width: 100% !important;",
        noCenter: true,
      },
      {
        selector: IMA_RESPONSE_CONTAINER_SELECTOR,
        property: "max-width",
        extraCss: "width: 100% !important;",
        noCenter: true,
      },
      {
        selector: '[class*="_chatInputContainer_"] [class*="_editorContainer_"]',
        property: "max-width",
        extraCss: "width: 100vw !important; margin: 0 auto;",
      },
    ]
  }

  getUserQueryWidthSelectors(): Array<{ selector: string; property: string }> {
    return [{ selector: IMA_USER_BUBBLE_SELECTOR, property: "max-width" }]
  }

  getZenModeConfig() {
    return {
      hide: [".expandable-sidebar-panel-sidebar"],
    }
  }

  getCleanModeConfig() {
    return {
      hide: [
        '[class*="_downloadContainer_"]',
        IMA_FOOT_TIPS_SELECTOR,
        '[class*="_activityBanner"]',
      ],
    }
  }

  private getActiveHistoryTitle(): string | null {
    const title = document.querySelector(IMA_ACTIVE_HISTORY_TITLE_SELECTOR)
    const text = title?.textContent?.trim() || ""
    return text || null
  }

  private findUserContentRoot(element: Element): Element | null {
    return element.querySelector(IMA_USER_TEXT_SELECTOR) || element.querySelector("p") || element
  }

  private findAssistantMarkdownRoot(element: Element): Element | null {
    if (element.matches(IMA_MARKDOWN_SELECTOR)) return element
    return element.querySelector(IMA_MARKDOWN_SELECTOR)
  }

  private extractHeadingText(heading: Element): string {
    const clone = heading.cloneNode(true) as HTMLElement
    clone.querySelectorAll(IMA_INLINE_REFERENCE_SELECTOR).forEach((node) => node.remove())
    return this.extractTextWithLineBreaks(clone).trim()
  }

  private shouldIncludeThoughtsInExport(): boolean {
    if (this.exportIncludeThoughts !== undefined) {
      return this.exportIncludeThoughts
    }
    return false
  }

  private extractThoughtBlockquotes(element: Element): string[] {
    const thoughtNodes = Array.from(element.querySelectorAll(IMA_THINKING_SELECTOR))
    const blocks: string[] = []

    for (const thought of thoughtNodes) {
      const clone = thought.cloneNode(true) as HTMLElement
      clone
        .querySelectorAll(
          `${IMA_THINKING_TITLE_SELECTOR}, button, [role='button'], svg, [aria-hidden='true']`,
        )
        .forEach((node) => node.remove())

      const markdown = htmlToMarkdown(clone) || this.extractTextWithLineBreaks(clone)
      const normalized = markdown.trim()
      if (!normalized) continue

      blocks.push(this.formatAsThoughtBlockquote(normalized))
    }

    return blocks
  }

  private formatAsThoughtBlockquote(markdown: string): string {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n")
    const quotedLines = lines.map((line) => (line.trim().length > 0 ? `> ${line}` : ">"))
    return ["> [Thoughts]", ...quotedLines].join("\n")
  }

  private truncateText(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  }

  private tryPasteText(editor: HTMLElement, content: string): boolean {
    if (typeof DataTransfer === "undefined" || typeof ClipboardEvent === "undefined") {
      return false
    }

    try {
      const clipboardData = new DataTransfer()
      clipboardData.setData("text/plain", content)

      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
        composed: true,
      })

      const handled = !editor.dispatchEvent(pasteEvent)
      if (handled) {
        return true
      }
    } catch {
      return false
    }

    return false
  }

  private selectAllEditorContent(editor: HTMLElement): void {
    const selection = window.getSelection()
    if (!selection) return

    const range = document.createRange()
    range.selectNodeContents(editor)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  private dispatchEditorInput(
    editor: HTMLElement,
    data: string,
    inputType: "insertText" | "deleteContentBackward",
  ): void {
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        data,
        inputType,
      }),
    )
    editor.dispatchEvent(new Event("change", { bubbles: true }))
  }

  private isVisibleElement(element: HTMLElement | null): boolean {
    if (!element || !element.isConnected) return false
    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden") return false
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  protected simulateClick(element: HTMLElement): void {
    const eventTypes = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"] as const
    let dispatched = false

    for (const type of eventTypes) {
      try {
        if (typeof PointerEvent === "function") {
          element.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 1,
            }),
          )
        } else {
          element.dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
            }),
          )
        }
        dispatched = true
      } catch {
        try {
          element.dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
            }),
          )
          dispatched = true
        } catch {
          // ignore dispatch errors and fallback to native click
        }
      }
    }

    if (!dispatched) {
      element.click()
    }
  }

  private findStopButton(): HTMLElement | null {
    const candidates = Array.from(document.querySelectorAll(IMA_STOP_BUTTON_SELECTOR))

    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement) || !this.isVisibleElement(candidate)) {
        continue
      }

      const clickableCandidates = [
        candidate.querySelector(":scope > div"),
        candidate.querySelector('[class*="container"]'),
        candidate,
      ]

      for (const clickable of clickableCandidates) {
        if (clickable instanceof HTMLElement && this.isVisibleElement(clickable)) {
          return clickable
        }
      }
    }

    return null
  }
}
