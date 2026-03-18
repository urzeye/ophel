/**
 * 通义千问适配器（qianwen.com）
 *
 * 选择器策略：
 * - 优先使用稳定的语义属性和结构锚点（role/data-slate-editor/id）
 * - CSS Modules 仅使用 stem 匹配，避免依赖完整哈希
 * - 会话列表使用“当前可见项 + 快照缓存”兼容 react-window 虚拟列表
 */
import { SITE_IDS } from "~constants"
import { htmlToMarkdown } from "~utils/exporter"

import {
  SiteAdapter,
  type ExportConfig,
  type ExportLifecycleContext,
  type MarkdownFixerConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type ZenModeRule,
} from "./base"

const CHAT_PATH_PATTERN = /\/chat\/([a-f0-9]+)/i
const GROUP_PATH_PATTERN = /\/group\/([a-f0-9]+)/i
const THEME_STORAGE_KEY = "tongyi-theme-preference"
const CID_STORAGE_KEY = "qianwen-uniq-id"
const MODEL_EXPANDED_KEY = "model-select-expanded"
const QUESTION_ITEM_SELECTOR = '[class*="questionItem"]'
const ANSWER_ITEM_SELECTOR = '[class*="answerItem"]'
const BUBBLE_SELECTOR = '[class*="bubble"]'
const CHAT_INPUT_SELECTOR = '[class*="chatInput"]'
const CHAT_TEXTAREA_SELECTOR = '[class*="chatTextarea"]'
const MESSAGE_LIST_SELECTOR = ".message-list-scroll-container, #message-list-scroller"
const MESSAGE_LIST_AREA_SELECTOR = "#qwen-message-list-area"
const SIDEBAR_SELECTOR = "aside#new-nav-tab-wrapper"
const NEW_CHAT_BUTTON_SELECTOR = '[class*="newChatButton"]'
const THINKING_SELECTOR =
  '.qc-thinking-header, [class*="thinkingWrap"], [class*="thinkingContent"], [class*="thinkingHeader"], [class*="thinkingTitle"]'
const STOP_BUTTON_SELECTOR = '[class*="stop-"], [class*="stopBtn"], div[class*="stop"]'
const MODEL_DIALOG_SELECTOR = '[role="dialog"], [data-radix-popper-content-wrapper]'
const MODEL_DIALOG_ITEM_SELECTOR = [
  '[role="dialog"] [id="tongyi-for-guide-model"]',
  '[role="dialog"] .group.rounded-8',
  '[data-radix-popper-content-wrapper] [id="tongyi-for-guide-model"]',
  "[data-radix-popper-content-wrapper] .group.rounded-8",
].join(", ")
const FOOTNOTE_SELECTOR = "#ice-container .root-G6nVVr"

export class QianwenAdapter extends SiteAdapter {
  private exportIncludeThoughts: boolean | undefined = undefined

  // ==================== 基础识别 ====================

  match(): boolean {
    const hostname = window.location.hostname
    return hostname === "www.qianwen.com" || hostname === "qianwen.com"
  }

  getSiteId(): string {
    return SITE_IDS.QIANWEN
  }

  getName(): string {
    return "Qianwen"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#615ced", secondary: "#4b45c0" }
  }

  getSessionId(): string {
    const match = window.location.pathname.match(CHAT_PATH_PATTERN)
    return match?.[1] || super.getSessionId()
  }

  isNewConversation(): boolean {
    const path = window.location.pathname.replace(/\/+$/, "") || "/"
    return path === "/" || path === "/chat"
  }

  isSharePage(): boolean {
    return window.location.pathname.startsWith("/share/")
  }

  getCurrentCid(): string | null {
    const raw = localStorage.getItem(CID_STORAGE_KEY)
    if (!raw) return null

    try {
      const parsed = JSON.parse(raw) as unknown
      if (typeof parsed === "string" && parsed.trim()) return parsed.trim()
      if (parsed && typeof parsed === "object") {
        for (const key of ["uid", "id", "cid", "userId"]) {
          const value = (parsed as Record<string, unknown>)[key]
          if (typeof value === "string" && value.trim()) return value.trim()
        }
      }
    } catch {
      // 回退到原始字符串
    }

    return raw.trim() || null
  }

  getSessionName(): string | null {
    const title = document.title.trim()
    if (!title) return null

    const cleaned = title
      .replace(/\s*[-|]\s*通义千问$/i, "")
      .replace(/\s*[-|]\s*Qwen$/i, "")
      .replace(/\s*[-|]\s*Qianwen$/i, "")
      .trim()

    if (!cleaned || /^(通义千问|Qwen|Qianwen)$/i.test(cleaned)) {
      return null
    }

    return cleaned
  }

  getNewTabUrl(): string {
    return "https://www.qianwen.com"
  }

  getCurrentConversationInfo() {
    if (GROUP_PATH_PATTERN.test(window.location.pathname)) {
      return null
    }
    return super.getCurrentConversationInfo()
  }

  getConversationTitle(): string | null {
    return this.getSessionName()
  }

  // ==================== 输入框操作 ====================

  getTextareaSelectors(): string[] {
    return [
      CHAT_TEXTAREA_SELECTOR,
      `${CHAT_INPUT_SELECTOR} [contenteditable="true"]`,
      '[data-slate-editor="true"][contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
      "textarea",
    ]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (!super.isValidTextarea(element)) return false
    if (element.closest(THINKING_SELECTOR)) return false
    if (!(element.isContentEditable || element instanceof HTMLTextAreaElement)) return false
    return !!(element.closest(CHAT_INPUT_SELECTOR) || element.matches('[data-slate-editor="true"]'))
  }

  insertPrompt(content: string): boolean {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return false

    editor.focus()

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      if (setter) {
        setter.call(editor, content)
      } else {
        editor.value = content
      }
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, composed: true, data: content }),
      )
      editor.dispatchEvent(new Event("change", { bubbles: true }))
      return true
    }

    try {
      document.execCommand("selectAll", false)
      if (document.execCommand("insertText", false, content)) {
        editor.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            composed: true,
            data: content,
            inputType: "insertText",
          }),
        )
        return true
      }
    } catch {
      // fallback below
    }

    editor.textContent = content
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: content,
        inputType: "insertText",
      }),
    )
    editor.dispatchEvent(new Event("change", { bubbles: true }))
    return true
  }

  clearTextarea(): void {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return

    editor.focus()

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      if (setter) {
        setter.call(editor, "")
      } else {
        editor.value = ""
      }
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: "" }))
      editor.dispatchEvent(new Event("change", { bubbles: true }))
      return
    }

    try {
      document.execCommand("selectAll", false)
      document.execCommand("delete", false)
    } catch {
      // fallback below
    }

    editor.textContent = ""
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: "",
        inputType: "deleteContentBackward",
      }),
    )
    editor.dispatchEvent(new Event("change", { bubbles: true }))
  }

  getSubmitButtonSelectors(): string[] {
    return [
      '[class*="operateBtn"]',
      '[data-icon-type="qwpcicon-sendChat"]',
      "button[type='submit']",
    ]
  }

  findSubmitButton(editor: HTMLElement | null): HTMLElement | null {
    const scopes = [
      editor?.closest(CHAT_INPUT_SELECTOR),
      editor?.parentElement,
      editor?.closest("div"),
      document.body,
    ].filter(Boolean) as ParentNode[]

    for (const scope of scopes) {
      const candidates = scope.querySelectorAll(
        '[class*="operateBtn"], [data-icon-type="qwpcicon-sendChat"]',
      )
      for (const candidate of Array.from(candidates)) {
        const button = (candidate as HTMLElement).closest(
          '[class*="operateBtn"], button, [role="button"]',
        ) as HTMLElement | null
        if (!button || !this.isVisibleElement(button)) continue
        if (this.isDisabledActionButton(button)) continue
        return button
      }
    }

    return super.findSubmitButton(editor)
  }

  getNewChatButtonSelectors(): string[] {
    return [NEW_CHAT_BUTTON_SELECTOR]
  }

  // ==================== 滚动与消息 ====================

  getScrollContainer(): HTMLElement | null {
    const selectors = [MESSAGE_LIST_SELECTOR, MESSAGE_LIST_AREA_SELECTOR]
    for (const selector of selectors) {
      const containers = document.querySelectorAll(selector)
      for (const container of Array.from(containers)) {
        const el = container as HTMLElement
        if (el.scrollHeight > el.clientHeight) return el
      }
    }

    const area = document.querySelector(MESSAGE_LIST_AREA_SELECTOR) as HTMLElement | null
    if (!area) return null

    let current: HTMLElement | null = area
    while (current && current !== document.body) {
      if (current.scrollHeight > current.clientHeight) return current
      current = current.parentElement
    }

    return null
  }

  getResponseContainerSelector(): string {
    return `${MESSAGE_LIST_AREA_SELECTOR}, ${MESSAGE_LIST_SELECTOR}`
  }

  getChatContentSelectors(): string[] {
    return [QUESTION_ITEM_SELECTOR, ANSWER_ITEM_SELECTOR]
  }

  getUserQuerySelector(): string | null {
    return QUESTION_ITEM_SELECTOR
  }

  getLatestReplyText(): string | null {
    const responses = document.querySelectorAll(ANSWER_ITEM_SELECTOR)
    const last = responses[responses.length - 1]
    return last ? this.extractAssistantPlainText(last) : null
  }

  // ==================== 文本提取 / 大纲 / 导出 ====================

  extractUserQueryText(element: Element): string {
    const contentRoot = this.findUserQueryContentRoot(element)
    if (!contentRoot) return ""

    const clone = contentRoot.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(
        ".gh-user-query-markdown, button, [role='button'], svg, [aria-hidden='true']",
      )
      .forEach((node) => node.remove())

    return this.extractTextWithLineBreaks(clone).trim()
  }

  extractUserQueryMarkdown(element: Element): string {
    return this.extractUserQueryText(element)
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    const contentRoot = this.findUserQueryContentRoot(element)
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

  /**
   * 导出/复制 AI 回复（参考 Gemini 适配器模式）
   * 1. clone 元素
   * 2. 提取思维链内容 → 格式化为 blockquote
   * 3. 移除思维链和装饰元素 → htmlToMarkdown 正文
   * 4. 拼接：思维链引用块 + 正文
   */
  extractAssistantResponseText(element: Element): string {
    const clone = element.cloneNode(true) as HTMLElement

    // 移除 UI 装饰（工具栏、按钮、SVG、复制按钮等）
    clone
      .querySelectorAll(
        'button, [role="button"], svg, .qk-md-table-action, .qk-md-copy-icon, [aria-hidden="true"], [class*="answerToolsContent"], [class*="functionArea"]',
      )
      .forEach((node) => node.remove())

    // 提取思维链内容（如果设置允许）
    const includeThoughts = this.shouldIncludeThoughtsInExport()
    let thoughtBlocks: string[] = []

    if (includeThoughts) {
      thoughtBlocks = this.extractThoughtBlockquotes(clone)
    }

    // 始终从 clone 中移除思维链相关节点（避免正文重复）
    const thinkingSelectors = `${THINKING_SELECTOR}, [class*="thinkingTitle"]`
    clone.querySelectorAll(thinkingSelectors).forEach((node) => node.remove())

    // 正文：htmlToMarkdown 保留 markdown 格式
    const bodyMarkdown = htmlToMarkdown(clone) || this.extractTextWithLineBreaks(clone)
    const normalizedBody = bodyMarkdown.trim()

    if (includeThoughts && thoughtBlocks.length > 0) {
      const thoughtSection = thoughtBlocks.join("\n\n")
      return normalizedBody ? `${thoughtSection}\n\n${normalizedBody}` : thoughtSection
    }

    return normalizedBody
  }

  /** 导出前钩子：记录 includeThoughts 设置供 extractAssistantResponseText 使用 */
  async prepareConversationExport(context: ExportLifecycleContext): Promise<unknown> {
    this.exportIncludeThoughts = context.includeThoughts
    return null
  }

  /** 导出后钩子：清除临时设置 */
  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    _state: unknown,
  ): Promise<void> {
    this.exportIncludeThoughts = undefined
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const items: OutlineItem[] = []
    const container =
      document.querySelector(MESSAGE_LIST_AREA_SELECTOR) ||
      document.querySelector(this.getResponseContainerSelector())
    if (!container) return items

    const blocks = Array.from(
      container.querySelectorAll(`${QUESTION_ITEM_SELECTOR}, ${ANSWER_ITEM_SELECTOR}`),
    ).filter((el) => !el.closest(".gh-root"))

    blocks.forEach((block, index) => {
      const isUserBlock = block.matches(QUESTION_ITEM_SELECTOR)

      if (isUserBlock) {
        if (!includeUserQueries) return

        const text = this.extractUserQueryText(block)
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          const nextAnswer = blocks.slice(index + 1).find((el) => el.matches(ANSWER_ITEM_SELECTOR))
          wordCount = nextAnswer ? this.extractAssistantPlainText(nextAnswer).length : 0
        }

        items.push({
          level: 0,
          text: this.truncateText(text, 80),
          element: block,
          isUserQuery: true,
          isTruncated: text.length > 80,
          wordCount,
        })
        return
      }

      // 直接在 answerItem 上查找标题，排除思维链和渲染容器中的标题
      const headings = Array.from(block.querySelectorAll("h1, h2, h3, h4, h5, h6")).filter(
        (heading) =>
          !heading.closest(THINKING_SELECTOR) && !this.isInRenderedMarkdownContainer(heading),
      )

      headings.forEach((heading, headingIndex) => {
        const level = parseInt(heading.tagName[1], 10)
        if (level > maxLevel) return

        const text = heading.textContent?.trim() || ""
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          let nextBoundary: Element | null = null
          for (let i = headingIndex + 1; i < headings.length; i++) {
            const candidate = headings[i]
            const candidateLevel = parseInt(candidate.tagName[1], 10)
            if (candidateLevel <= level) {
              nextBoundary = candidate
              break
            }
          }
          wordCount = this.calculateRangeWordCount(heading, nextBoundary, block)
        }

        items.push({
          level,
          text,
          element: heading,
          wordCount,
        })
      })
    })

    return items
  }

  getExportConfig(): ExportConfig | null {
    return {
      userQuerySelector: QUESTION_ITEM_SELECTOR,
      assistantResponseSelector: ANSWER_ITEM_SELECTOR,
      turnSelector: null,
      useShadowDOM: false,
    }
  }

  // ==================== 主题 / 模型 / 生成状态 ====================

  async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, targetMode)

      const html = document.documentElement
      html.setAttribute("data-theme", targetMode)
      html.setAttribute("color-scheme-lock", targetMode)
      html.style.colorScheme = targetMode

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_STORAGE_KEY,
          newValue: targetMode,
          storageArea: localStorage,
        }),
      )

      return true
    } catch (error) {
      console.error("[QianwenAdapter] toggleTheme error:", error)
      return false
    }
  }

  getModelName(): string | null {
    const trigger = this.findModelSelectorTrigger()
    if (!trigger) return null

    const text = trigger.innerText?.trim() || trigger.textContent?.trim() || ""
    return text ? text.split("\n")[0].trim() : null
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig | null {
    return {
      urlPatterns: ["api/v2/chat", "api/v1/chat/snap"],
      silenceThreshold: 2000,
    }
  }

  isGenerating(): boolean {
    const stopButtons = document.querySelectorAll(STOP_BUTTON_SELECTOR)
    for (const button of Array.from(stopButtons)) {
      const el = button as HTMLElement
      if (this.isVisibleElement(el) && !this.isDisabledActionButton(el)) {
        return true
      }
    }
    return false
  }

  getDefaultLockSettings(): { enabled: boolean; keyword: string } {
    return { enabled: false, keyword: "" }
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: [
        `${MESSAGE_LIST_AREA_SELECTOR} [aria-haspopup="dialog"]`,
        `[aria-haspopup="dialog"][aria-controls][data-state]`,
      ],
      menuItemSelector: MODEL_DIALOG_ITEM_SELECTOR,
      checkInterval: 1000,
      maxAttempts: 10,
      menuRenderDelay: 300,
    }
  }

  clickModelSelector(): boolean {
    const trigger = this.findModelSelectorTrigger()
    if (!trigger) return false
    try {
      localStorage.setItem(MODEL_EXPANDED_KEY, "1")
    } catch {
      // 静默处理
    }
    this.simulateClick(trigger)
    return true
  }

  lockModel(keyword: string, onSuccess?: () => void): void {
    const target = this.normalizeText(keyword)
    if (!target) return

    let attempts = 0
    const maxAttempts = 10

    const trySelect = () => {
      attempts++
      const trigger = this.findModelSelectorTrigger()
      if (!trigger) {
        if (attempts < maxAttempts) {
          setTimeout(trySelect, 500)
        } else {
          console.warn(`Ophel: Qianwen model selector not found for "${keyword}".`)
        }
        return
      }

      const currentModel = this.normalizeText(this.getModelName() || "")
      if (currentModel.includes(target)) {
        onSuccess?.()
        return
      }

      // 预设展开状态，确保 dialog 打开时直接显示全部模型
      try {
        localStorage.setItem(MODEL_EXPANDED_KEY, "1")
      } catch {
        // 静默处理
      }

      this.simulateClick(trigger)

      setTimeout(async () => {
        let items = this.findVisibleModelDialogItems()
        let matched = this.findBestMatchingDialogItem(items, target)

        // 若预设未生效，尝试手动展开
        if (!matched && this.expandMoreModels()) {
          await new Promise((resolve) => setTimeout(resolve, 400))
          items = this.findVisibleModelDialogItems()
          matched = this.findBestMatchingDialogItem(items, target)
        }

        if (!matched) {
          if (attempts < maxAttempts) {
            setTimeout(trySelect, 500)
          } else {
            document.body.click()
            console.warn(`Ophel: Qianwen model "${keyword}" not found.`)
          }
          return
        }

        this.simulateClick(matched)
        setTimeout(() => {
          document.body.click()
          onSuccess?.()
        }, 150)
      }, 300)
    }

    trySelect()
  }

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

  // ==================== 宽度 / Zen / Markdown 修复 ====================

  getWidthSelectors() {
    // 千问整体宽度由 scrollOutWrapper 的 max-width: 896px + width: calc(100%-48px) 控制
    // 需要同时覆盖 max-width 和 width
    return [
      {
        selector: '[class*="scrollOutWrapper"]',
        property: "max-width",
        extraCss: "width: 100% !important;",
        noCenter: true,
      },
      {
        selector: `${MESSAGE_LIST_AREA_SELECTOR}`,
        property: "max-width",
        extraCss: "width: 100% !important;",
        noCenter: true,
      },
    ]
  }

  getUserQueryWidthSelectors(): Array<{ selector: string; property: string }> {
    return [{ selector: `${QUESTION_ITEM_SELECTOR} ${BUBBLE_SELECTOR}`, property: "max-width" }]
  }

  getZenModeSelectors(): ZenModeRule[] {
    return [
      { selector: SIDEBAR_SELECTOR, action: "hide" },
      { selector: FOOTNOTE_SELECTOR, action: "hide" },
      { selector: '[aria-haspopup="dialog"][aria-controls][data-state]', action: "hide" },
    ]
  }

  getMarkdownFixerConfig(): MarkdownFixerConfig | null {
    return {
      selector: `${ANSWER_ITEM_SELECTOR} .qk-md-paragraph`,
      fixSpanContent: false,
      shouldSkip: (element) => {
        if (!this.isGenerating()) return false
        const currentMessage = element.closest(ANSWER_ITEM_SELECTOR)
        if (!currentMessage) return false
        const messages = document.querySelectorAll(ANSWER_ITEM_SELECTOR)
        return currentMessage === messages[messages.length - 1]
      },
    }
  }

  // ==================== 内部辅助方法 ====================

  /** 是否在导出中包含思维链（导出期间由 prepareConversationExport 设置） */
  private shouldIncludeThoughtsInExport(): boolean {
    if (this.exportIncludeThoughts !== undefined) {
      return this.exportIncludeThoughts
    }
    // 非导出上下文（如 getLatestReplyText）默认不包含
    return false
  }

  /** 从 clone 的元素中提取思维链内容，转为 blockquote 格式 */
  private extractThoughtBlockquotes(element: Element): string[] {
    // 千问思维链结构：thinkingContent > qk-markdown > 实际内容
    const thoughtNodes = Array.from(element.querySelectorAll('[class*="thinkingContent"]'))
    const blocks: string[] = []

    for (const thought of thoughtNodes) {
      // 移除 thinking 内部的装饰元素
      const clone = thought.cloneNode(true) as HTMLElement
      clone
        .querySelectorAll(
          '[class*="thinkingTitle"], [class*="thinkingHeader"], .qc-thinking-header, button, svg, [aria-hidden="true"]',
        )
        .forEach((node) => node.remove())

      const markdown = htmlToMarkdown(clone) || this.extractTextWithLineBreaks(clone)
      const normalized = markdown.trim()
      if (!normalized) continue

      blocks.push(this.formatAsThoughtBlockquote(normalized))
    }

    return blocks
  }

  /** 将思维链 markdown 文本格式化为引用块（每行加 > 前缀） */
  private formatAsThoughtBlockquote(markdown: string): string {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n")
    const quotedLines = lines.map((line) => (line.trim().length > 0 ? `> ${line}` : ">"))
    return ["> [Thoughts]", ...quotedLines].join("\n")
  }

  /** 提取 AI 回复纯文本（用于复制和大纲字数统计，不用于导出） */
  private extractAssistantPlainText(element: Element): string {
    const clone = element.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(
        `${THINKING_SELECTOR}, .qc-thinking-header, [class*="thinkingWrap"], [class*="thinkingContent"], button, [role='button'], svg, .qk-md-table-action, .qk-md-copy-icon, [aria-hidden='true'], [class*="answerToolsContent"], [class*="functionArea"]`,
      )
      .forEach((node) => node.remove())
    return this.extractTextWithLineBreaks(clone).trim()
  }

  private findUserQueryContentRoot(element: Element): HTMLElement | null {
    if (element.matches(BUBBLE_SELECTOR)) return element as HTMLElement
    return (
      (element.querySelector(BUBBLE_SELECTOR) as HTMLElement | null) || (element as HTMLElement)
    )
  }

  private findModelSelectorTrigger(): HTMLElement | null {
    const triggers = Array.from(
      document.querySelectorAll(
        '[aria-haspopup="dialog"][aria-controls], [aria-haspopup="dialog"][data-state]',
      ),
    )

    const visibleTriggers = triggers.filter((trigger) => {
      const el = trigger as HTMLElement
      if (!this.isVisibleElement(el)) return false
      if (el.closest(SIDEBAR_SELECTOR)) return false
      if (el.closest(CHAT_INPUT_SELECTOR)) return false
      const rect = el.getBoundingClientRect()
      const text = el.innerText?.trim() || el.textContent?.trim() || ""
      return rect.top < 180 && rect.width > 0 && rect.height > 0 && text.length > 0
    }) as HTMLElement[]

    return visibleTriggers[0] || null
  }

  private findVisibleModelDialogItems(): HTMLElement[] {
    const dialogs = Array.from(document.querySelectorAll(MODEL_DIALOG_SELECTOR)).filter((dialog) =>
      this.isVisibleElement(dialog as HTMLElement),
    )
    if (dialogs.length === 0) return []

    const items: HTMLElement[] = []
    dialogs.forEach((dialog) => {
      const found = dialog.querySelectorAll(MODEL_DIALOG_ITEM_SELECTOR)
      for (const item of Array.from(found)) {
        const el = item as HTMLElement
        if (!this.isVisibleElement(el)) continue
        if (!el.innerText?.trim()) continue
        items.push(el)
      }
    })
    return items
  }

  private findBestMatchingDialogItem(items: HTMLElement[], target: string): HTMLElement | null {
    if (items.length === 0) return null

    const normalizedTarget = this.normalizeText(target)

    // 优先级 1: 精确匹配（第一行文本完全等于 target）
    for (const item of items) {
      const text = this.normalizeText(item.innerText || item.textContent || "")
      if (!text) continue
      const mainText = text.split("\n")[0].trim()
      if (mainText === normalizedTarget) return item
    }

    // 优先级 2: 结尾匹配（如 target="3.5" 匹配 "qwen-3.5"）
    for (const item of items) {
      const text = this.normalizeText(item.innerText || item.textContent || "")
      const mainText = text.split("\n")[0].trim()
      if (mainText.endsWith(normalizedTarget)) return item
    }

    // 优先级 3: 包含匹配（最后兜底）
    for (const item of items) {
      const text = this.normalizeText(item.innerText || item.textContent || "")
      if (text.includes(normalizedTarget)) return item
    }

    return null
  }

  private expandMoreModels(): boolean {
    const dialogs = Array.from(document.querySelectorAll(MODEL_DIALOG_SELECTOR)).filter((dialog) =>
      this.isVisibleElement(dialog as HTMLElement),
    )

    for (const dialog of dialogs) {
      const toggles = dialog.querySelectorAll("button, div, span")
      for (const toggle of Array.from(toggles)) {
        const el = toggle as HTMLElement
        if (!this.isVisibleElement(el)) continue
        const text = this.normalizeText(el.innerText || el.textContent || "")
        if (!text) continue
        // 只点击"展开更多"，不点击"收起"
        if (
          (text.includes(this.normalizeText("查看更多模型")) ||
            text.includes(this.normalizeText("view more models")) ||
            text.includes(this.normalizeText("更多模型"))) &&
          !text.includes(this.normalizeText("收起")) &&
          !text.includes(this.normalizeText("collapse"))
        ) {
          this.simulateClick(el)
          return true
        }
      }
    }

    return false
  }

  private truncateText(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  }

  private normalizeText(text: string): string {
    return (text || "").replace(/\s+/g, " ").trim().toLowerCase()
  }

  private isDisabledActionButton(element: HTMLElement): boolean {
    const className = this.getElementClassName(element)
    return (
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-disabled") === "true" ||
      /disabled/i.test(className)
    )
  }

  private isVisibleElement(element: HTMLElement | null): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false
    if (!element.isConnected) return false

    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private getElementClassName(element: Element): string {
    return typeof element.className === "string" ? element.className : ""
  }
}
