/**
 * 通义千问适配器（qianwen.com）
 *
 * 选择器策略：
 * - 优先使用稳定的语义属性和结构锚点（role/data-slate-editor/id）
 * - CSS Modules 仅使用 stem 匹配，避免依赖完整哈希
 * - 会话列表使用“当前可见项 + 快照缓存”兼容 react-window 虚拟列表
 */
import { SITE_IDS } from "~constants"
import { qianwenNativeThemeCss } from "~styles/native-theme-adapters/qianwen"
import {
  extractExportExtension,
  extractExportExtensionFromUrl,
  extractExportFilenameFromUrl,
  formatExportFileAttachments,
  formatExportImageAttachments,
  formatExportImageMarkdownList,
  getExportAttachmentSourceKey,
  isDownloadableExportAssetUrl,
  normalizeExportAssetUrl,
  parseExportFileAttachmentText,
  type ExportAssetCollector,
} from "~utils/export-assets"
import { htmlToMarkdown, type ExportBundle, type ExportMessage } from "~utils/exporter"
import { t } from "~utils/i18n"

import {
  SiteAdapter,
  type ExportConfig,
  type ExportLifecycleContext,
  type MarkdownFixerConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
} from "./base"

const CHAT_PATH_PATTERN = /\/chat\/([a-f0-9]+)/i
const GROUP_PATH_PATTERN = /\/group\/([a-f0-9]+)/i
const THEME_STORAGE_KEY = "tongyi-theme-preference"
const CID_STORAGE_KEY = "qianwen-uniq-id"
const MODEL_EXPANDED_KEY = "model-select-expanded"
const QUESTION_ITEM_SELECTOR =
  '[class*="questionItem"], .chat-question-wrap, [class*="message-select-wrapper-question"]'
const QUESTION_LAYOUT_SELECTOR = '[class*="questionItem"], .chat-question-wrap'
const QUESTION_CARD_SELECTOR = "[data-chat-question-wrap]"
const ANSWER_ITEM_SELECTOR =
  '[class*="answerItem"], [data-chat-answers-wrap], .chat-answers-card-wrap'
const BUBBLE_SELECTOR = '[class*="bubble"]'
const QUESTION_CARD_INNER_SELECTOR = [
  `${QUESTION_CARD_SELECTOR} .message-card-wrap.question`,
  `${QUESTION_CARD_SELECTOR} .question-text-card`,
].join(", ")
const TURN_SELECTOR = ".chat-round[data-chat], [data-chat-list-key]"
const USER_CARD_SELECTOR = ".message-card-wrap.question"
const USER_TEXT_CARD_SELECTOR = ".question-text-card"
const USER_IMAGE_CARD_SELECTOR = `${USER_CARD_SELECTOR}[data-mt*="image"]`
const USER_FILE_CARD_SELECTOR = [
  `${USER_CARD_SELECTOR}[data-mt*="doc"]`,
  `${USER_CARD_SELECTOR}[data-mt*="file"]`,
  `${USER_CARD_SELECTOR}[data-mt*="office"]`,
  `${USER_CARD_SELECTOR}:has([class*="office-card"])`,
].join(", ")
const ASSISTANT_CONTENT_SELECTOR = [
  ".answer-common-card .qk-markdown",
  ".markdown-pc-special-class .qk-markdown",
  "#qk-markdown-react",
  ".answer-common-card",
].join(", ")
const ASSISTANT_GENERATED_IMAGE_SELECTOR = [
  '[data-card-type="ai_generate_image_list"] img',
  ".card_card_ai_generate_image img",
  '[data-tpl*="card_ai_generate_image"] img',
  'img[data-image-menu-items*="download"]',
  'img[class*="image-"][data-image-resource-id]',
].join(", ")
const ASSISTANT_GENERATED_IMAGE_CARD_SELECTOR = [
  '[data-card-type="ai_generate_image_list"]',
  ".card_card_ai_generate_image",
  '[data-tpl*="card_ai_generate_image"]',
].join(", ")
const EXPORT_DECORATION_SELECTOR = [
  ".gh-root",
  ".gh-user-query-markdown",
  "button",
  "[role='button']",
  "svg",
  "[aria-hidden='true']",
  ".qk-md-table-action",
  ".qk-md-copy-icon",
  "[class*='answerToolsContent']",
  "[class*='functionArea']",
  "[class*='recommend-query']",
  ".q-item",
  ".qs-bottom",
  "style",
  "script",
].join(", ")
const ATTACHMENT_SOURCE_ATTRS = [
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

interface QianwenUserAttachment {
  kind: "image" | "file"
  name: string
  source: string
  type: string
  sizeLabel?: string
}

interface QianwenAssistantImage {
  source: string
  alt: string
}

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

  getNativeThemeCss(): string | null {
    return qianwenNativeThemeCss
  }

  getQuickQuoteSupportMode() {
    return "disabled" as const
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

  isUserConversationPage(): boolean {
    return !this.isSharePage() && CHAT_PATH_PATTERN.test(window.location.pathname)
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
    const title = this.getDocumentConversationTitle() || ""
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

    // Slate 编辑器：先全选再插入，确保 Slate 状态正确更新
    try {
      // 1. 全选现有内容
      const selection = window.getSelection()
      if (selection) {
        selection.selectAllChildren(editor)
      }

      // 2. 使用 execCommand 删除 + 插入（触发 Slate 的 onChange）
      document.execCommand("delete", false)
      const inserted = document.execCommand("insertText", false, content)

      if (inserted) {
        // 3. 额外触发 input 事件确保 Slate 更新
        editor.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            composed: true,
            data: content,
            inputType: "insertText",
          }),
        )

        // 4. 触发 beforeinput 和 change 事件（Slate 可能监听这些）
        editor.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            composed: true,
            data: content,
            inputType: "insertText",
            cancelable: true,
          }),
        )
        editor.dispatchEvent(new Event("change", { bubbles: true }))

        // 5. 等待一帧后再次聚焦，确保光标位置正确
        requestAnimationFrame(() => {
          editor.focus()
          // 将光标移到末尾
          const sel = window.getSelection()
          if (sel) {
            sel.collapse(editor, editor.childNodes.length)
          }
        })

        return true
      }
    } catch (error) {
      console.warn("[QianwenAdapter] insertPrompt execCommand failed:", error)
    }

    // Fallback: 直接设置 textContent（但可能导致 Slate 状态不同步）
    editor.textContent = content
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: content,
        inputType: "insertText",
      }),
    )
    editor.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        composed: true,
        data: content,
        inputType: "insertText",
        cancelable: true,
      }),
    )
    editor.dispatchEvent(new Event("change", { bubbles: true }))

    requestAnimationFrame(() => {
      editor.focus()
      const sel = window.getSelection()
      if (sel) {
        sel.collapse(editor, editor.childNodes.length)
      }
    })

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

    // Slate 编辑器：全选 + 删除，确保状态同步
    try {
      const selection = window.getSelection()
      if (selection) {
        selection.selectAllChildren(editor)
      }

      const deleted = document.execCommand("delete", false)

      if (deleted) {
        // 触发 input 事件
        editor.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            composed: true,
            data: "",
            inputType: "deleteContentBackward",
          }),
        )
        editor.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            composed: true,
            data: "",
            inputType: "deleteContentBackward",
            cancelable: true,
          }),
        )
        editor.dispatchEvent(new Event("change", { bubbles: true }))
        return
      }
    } catch (error) {
      console.warn("[QianwenAdapter] clearTextarea execCommand failed:", error)
    }

    // Fallback
    editor.textContent = ""
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: "",
        inputType: "deleteContentBackward",
      }),
    )
    editor.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        composed: true,
        data: "",
        inputType: "deleteContentBackward",
        cancelable: true,
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
    return last ? this.extractAssistantResponseText(last) : null
  }

  // ==================== 文本提取 / 大纲 / 导出 ====================

  extractUserQueryText(element: Element): string {
    const textParts = this.extractUserTextParts(element)
    if (textParts.length > 0) {
      return textParts.join("\n\n")
    }

    const contentRoot = this.findUserQueryContentRoot(element)
    if (!contentRoot) return ""

    const clone = contentRoot.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(
        ".gh-user-query-markdown, button, [role='button'], svg, [aria-hidden='true']",
      )
      .forEach((node) => node.remove())

    return this.normalizeUserQueryText(this.extractTextWithLineBreaks(clone)).trim()
  }

  extractUserQueryMarkdown(element: Element): string {
    return this.extractUserQueryText(element)
  }

  extractUserQueryExportContent(element: Element): string {
    return this.extractUserQueryExportContentWithAssets(element)
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    const contentRoot = this.findUserQueryContentRoot(element)
    if (!contentRoot) return false
    if (element.querySelector(".gh-user-query-markdown")) return false

    const rendered = document.createElement("div")
    rendered.className =
      `${contentRoot instanceof HTMLElement ? contentRoot.className : ""} gh-user-query-markdown gh-user-query-markdown-qianwen gh-markdown-preview`.trim()
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
    return this.extractAssistantResponseTextWithAssets(element)
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

  async extractExportMessages(_context: ExportLifecycleContext): Promise<ExportMessage[] | null> {
    const messages = this.extractQianwenExportMessages()
    return messages.length > 0 ? messages : null
  }

  async extractExportBundle(_context: ExportLifecycleContext): Promise<ExportBundle | null> {
    return this.createExportBundleFromMessages((collector) =>
      this.extractQianwenExportMessages(collector),
    )
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const items: OutlineItem[] = []
    const container =
      document.querySelector(MESSAGE_LIST_AREA_SELECTOR) ||
      document.querySelector(this.getResponseContainerSelector())
    if (!container) return items

    const blocks = this.collectTopLevelBlocks(
      Array.from(
        container.querySelectorAll(`${QUESTION_ITEM_SELECTOR}, ${ANSWER_ITEM_SELECTOR}`),
      ).filter((el) => !el.closest(".gh-root")),
    )

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

  getStopButtonSelectors(): string[] {
    return [STOP_BUTTON_SELECTOR]
  }

  stopGeneration(): boolean {
    const stopButtons = document.querySelectorAll(STOP_BUTTON_SELECTOR)
    for (const button of Array.from(stopButtons)) {
      const el = button as HTMLElement
      if (!this.isVisibleElement(el) || this.isDisabledActionButton(el)) {
        continue
      }

      this.simulateClick(el)
      return true
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
    const messageListWidthVarsCss = [
      "width: 100% !important;",
      "min-width: 0 !important;",
      "--max-message-list-width: 100% !important;",
      "--min-message-list-width: 0px !important;",
    ].join(" ")

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
      {
        selector: '[class*="auto-center-wrapper"]',
        property: "max-width",
        extraCss: messageListWidthVarsCss,
      },
      {
        selector: '[class*="inputMotionCarrier"]',
        property: "max-width",
        extraCss: "width: 100% !important;",
      },
      {
        selector: '[class*="inputOutWrap"]',
        property: "max-width",
        value: "100%",
        extraCss: "width: 100% !important;",
      },
      {
        selector: '[class*="answerItem"] [class*="containerWrap"]',
        property: "max-width",
      },
      {
        selector: `${QUESTION_LAYOUT_SELECTOR}`,
        property: "width",
        extraCss: "margin-right: 0 !important",
      },
      {
        selector: QUESTION_CARD_INNER_SELECTOR,
        property: "width",
        value: "100%",
        extraCss: "max-width: 100% !important; box-sizing: border-box !important;",
        noCenter: true,
      },
    ]
  }

  getUserQueryWidthSelectors(): Array<{
    selector: string
    property: string
    extraCss?: string
    noCenter?: boolean
  }> {
    const alignRightCss = "margin-left: auto !important; margin-right: 0 !important;"

    return [
      {
        selector: `${QUESTION_ITEM_SELECTOR} ${BUBBLE_SELECTOR}`,
        property: "max-width",
        extraCss: alignRightCss,
        noCenter: true,
      },
      {
        selector: QUESTION_CARD_SELECTOR,
        property: "max-width",
        extraCss: alignRightCss,
        noCenter: true,
      },
    ]
  }

  getZenModeConfig() {
    return {
      hide: [SIDEBAR_SELECTOR],
    }
  }

  getCleanModeConfig() {
    return {
      hide: [FOOTNOTE_SELECTOR],
    }
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

  private extractQianwenExportMessages(collector?: ExportAssetCollector): ExportMessage[] {
    const root = this.getExportRoot()
    const turns = this.collectQianwenExportTurns(root)
    const sources = turns.length > 0 ? turns : [root]
    const messages: ExportMessage[] = []

    sources.forEach((source) => {
      this.getOrderedQianwenMessages(source).forEach(({ role, element }) => {
        const content =
          role === "user"
            ? this.extractUserQueryExportContentWithAssets(element, collector)
            : this.extractAssistantResponseTextWithAssets(element, collector)
        const normalized = content.trim()
        if (normalized) {
          messages.push({ role, content: normalized })
        }
      })
    })

    return messages
  }

  private getExportRoot(): HTMLElement {
    return (
      (document.querySelector(MESSAGE_LIST_AREA_SELECTOR) as HTMLElement | null) ||
      (document.querySelector(MESSAGE_LIST_SELECTOR) as HTMLElement | null) ||
      document.body
    )
  }

  private collectQianwenExportTurns(root: Element): Element[] {
    const candidates = this.queryElementsIncludingSelf(root, TURN_SELECTOR)
    return this.collectTopLevelBlocks(candidates).filter(
      (turn) => this.getOrderedQianwenMessages(turn).length > 0,
    )
  }

  private getOrderedQianwenMessages(root: ParentNode): Array<{
    role: "user" | "assistant"
    element: Element
  }> {
    const messages: Array<{ role: "user" | "assistant"; element: Element }> = []
    const seen = new Set<Element>()

    const addMessage = (role: "user" | "assistant", element: Element | null) => {
      if (!element || seen.has(element) || this.shouldSkipExportElement(element)) return
      seen.add(element)
      messages.push({ role, element })
    }

    const userRoots = this.collectTopLevelBlocks(
      this.queryElementsIncludingSelf(root, `${QUESTION_ITEM_SELECTOR}, [data-chat-question-wrap]`),
    )
    const assistantRoots = this.collectTopLevelBlocks(
      this.queryElementsIncludingSelf(root, ANSWER_ITEM_SELECTOR),
    )

    ;[
      ...userRoots.map((element) => ({ role: "user" as const, element })),
      ...assistantRoots.map((element) => ({ role: "assistant" as const, element })),
    ]
      .sort((left, right) => this.compareDomOrder(left.element, right.element))
      .forEach(({ role, element }) => addMessage(role, element))

    return messages
  }

  private extractUserQueryExportContentWithAssets(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    const body = this.extractUserTextParts(element).join("\n\n").trim()
    const attachments = this.extractQianwenUserAttachments(element)

    if (attachments.length === 0) {
      return body || this.extractUserQueryText(element)
    }

    const imageMarkdown = this.formatQianwenUserImageAttachments(attachments, collector)
    const fileMarkdown = this.formatQianwenUserFileAttachments(attachments, collector)
    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, body].filter(Boolean).join("\n\n")
  }

  private extractAssistantResponseTextWithAssets(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    const body = this.extractAssistantMarkdown(element)
    const imageMarkdown = this.formatQianwenAssistantImages(
      this.extractQianwenAssistantImages(element),
      collector,
    )

    return [body, imageMarkdown.join("\n\n")].filter(Boolean).join("\n\n")
  }

  private extractAssistantMarkdown(element: Element): string {
    const includeThoughts = this.shouldIncludeThoughtsInExport()
    const thoughtBlocks = includeThoughts ? this.extractThoughtBlockquotes(element) : []
    const contentRoot = this.findAssistantContentRoot(element)
    const clone = contentRoot.cloneNode(true) as HTMLElement

    clone
      .querySelectorAll(
        [
          EXPORT_DECORATION_SELECTOR,
          ASSISTANT_GENERATED_IMAGE_CARD_SELECTOR,
          "picture",
          "img",
        ].join(", "),
      )
      .forEach((node) => node.remove())

    const thinkingSelectors = `${THINKING_SELECTOR}, [class*="thinkingTitle"]`
    clone.querySelectorAll(thinkingSelectors).forEach((node) => node.remove())

    const bodyMarkdown = htmlToMarkdown(clone) || this.extractTextWithLineBreaks(clone)
    const normalizedBody = bodyMarkdown.trim()

    if (thoughtBlocks.length > 0) {
      const thoughtSection = thoughtBlocks.join("\n\n")
      return normalizedBody ? `${thoughtSection}\n\n${normalizedBody}` : thoughtSection
    }

    return normalizedBody
  }

  private extractUserTextParts(element: Element): string[] {
    const scope = this.findUserMessageScope(element)
    const textCards = this.queryElementsIncludingSelf(scope, USER_TEXT_CARD_SELECTOR)
    const parts: string[] = []
    const seen = new Set<string>()

    textCards.forEach((card) => {
      if (card.closest(".gh-user-query-markdown")) return
      const clone = card.cloneNode(true) as HTMLElement
      clone
        .querySelectorAll(
          ".gh-user-query-markdown, button, [role='button'], svg, [aria-hidden='true']",
        )
        .forEach((node) => node.remove())

      const text = this.normalizeUserQueryText(this.extractTextWithLineBreaks(clone)).trim()
      if (!text || seen.has(text)) return
      seen.add(text)
      parts.push(text)
    })

    return parts
  }

  private extractQianwenUserAttachments(element: Element): QianwenUserAttachment[] {
    const scope = this.findUserMessageScope(element)
    const attachments: QianwenUserAttachment[] = []
    const seen = new Set<string>()

    const addAttachment = (attachment: QianwenUserAttachment | null) => {
      if (!attachment) return
      const key = [
        attachment.kind,
        getExportAttachmentSourceKey(attachment.source),
        attachment.name.trim().toLowerCase(),
        attachment.type.trim().toLowerCase(),
        attachment.sizeLabel || "",
      ].join(":")
      if (seen.has(key)) return
      seen.add(key)
      attachments.push(attachment)
    }

    this.queryElementsIncludingSelf(scope, USER_IMAGE_CARD_SELECTOR).forEach((card) =>
      addAttachment(this.extractQianwenUserImageAttachment(card)),
    )
    this.queryElementsIncludingSelf(scope, USER_FILE_CARD_SELECTOR).forEach((card) =>
      addAttachment(this.extractQianwenUserFileAttachment(card)),
    )

    return attachments
  }

  private extractQianwenUserImageAttachment(card: Element): QianwenUserAttachment | null {
    const image = card.querySelector("img")
    if (!(image instanceof HTMLImageElement)) return null

    const source = this.extractQianwenImageSource(image)
    if (!source) return null

    const name =
      image.alt?.trim() ||
      image.getAttribute("title")?.trim() ||
      extractExportFilenameFromUrl(source) ||
      "uploaded image"
    const type = extractExportExtension(name) || extractExportExtensionFromUrl(source)

    return {
      kind: "image",
      name,
      source,
      type,
    }
  }

  private extractQianwenUserFileAttachment(card: Element): QianwenUserAttachment | null {
    const textParts = this.extractCleanTextParts(card)
    const { name, type, sizeLabel } = parseExportFileAttachmentText(textParts)
    const source = this.extractQianwenDownloadableSource(card, {
      allowDataImage: false,
      includeImages: false,
    })
    const fallbackName = name || extractExportFilenameFromUrl(source) || "attachment"

    if (!fallbackName && !source) return null

    return {
      kind: "file",
      name: fallbackName,
      source,
      type: type || extractExportExtension(fallbackName) || extractExportExtensionFromUrl(source),
      sizeLabel,
    }
  }

  private formatQianwenUserImageAttachments(
    attachments: QianwenUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportImageAttachments(attachments, collector, { siteId: this.getSiteId() })
  }

  private formatQianwenUserFileAttachments(
    attachments: QianwenUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportFileAttachments(attachments, collector, { siteId: this.getSiteId() })
  }

  private extractQianwenAssistantImages(element: Element): QianwenAssistantImage[] {
    const contentRoot = this.findAssistantContentRoot(element)
    const images: QianwenAssistantImage[] = []
    const seen = new Set<string>()

    this.queryElementsIncludingSelf(contentRoot, ASSISTANT_GENERATED_IMAGE_SELECTOR).forEach(
      (node) => {
        if (!(node instanceof HTMLImageElement)) return

        const source = this.extractQianwenImageSource(node)
        if (!source || seen.has(source)) return

        seen.add(source)
        images.push({
          source,
          alt:
            node.alt?.trim() ||
            node.getAttribute("aria-label")?.trim() ||
            `generated image ${images.length + 1}`,
        })
      },
    )

    return images
  }

  private formatQianwenAssistantImages(
    images: QianwenAssistantImage[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportImageMarkdownList(images, collector, {
      siteId: this.getSiteId(),
      role: "assistant",
      category: "generated-image",
      fallbackAlt: "generated image",
    })
  }

  private findUserMessageScope(element: Element): Element {
    if (element.matches(QUESTION_ITEM_SELECTOR) || element.matches("[data-chat-question-wrap]")) {
      return element
    }

    return (
      element.closest(QUESTION_ITEM_SELECTOR) ||
      element.closest("[data-chat-question-wrap]") ||
      element
    )
  }

  private findAssistantContentRoot(element: Element): Element {
    if (element.matches(ASSISTANT_CONTENT_SELECTOR)) return element
    return element.querySelector(ASSISTANT_CONTENT_SELECTOR) || element
  }

  private shouldSkipExportElement(element: Element): boolean {
    if (element.closest(".gh-root")) return true
    if (element.closest(".gh-user-query-markdown")) return true
    return false
  }

  private queryElementsIncludingSelf(root: ParentNode, selector: string): Element[] {
    const elements: Element[] = []
    if (root instanceof Element && root.matches(selector)) {
      elements.push(root)
    }

    root.querySelectorAll(selector).forEach((element) => {
      if (!elements.includes(element)) {
        elements.push(element)
      }
    })

    return elements
  }

  private collectTopLevelBlocks(blocks: Element[]): Element[] {
    if (blocks.length <= 1) return blocks
    return blocks.filter(
      (block) => !blocks.some((other) => other !== block && other.contains(block)),
    )
  }

  private compareDomOrder(left: Element, right: Element): number {
    if (left === right) return 0
    const position = left.compareDocumentPosition(right)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  }

  private extractQianwenImageSource(image: HTMLImageElement): string {
    const candidates = [
      image.currentSrc || "",
      image.src || "",
      image.getAttribute("src") || "",
      image.getAttribute("data-src") || "",
      image.getAttribute("data-image-url") || "",
      image.getAttribute("data-original-url") || "",
      image.getAttribute("data-origin-url") || "",
    ]

    for (const candidate of candidates) {
      const source = this.normalizeQianwenExportSource(candidate, { allowDataImage: true })
      if (source) return source
    }

    return ""
  }

  private extractQianwenDownloadableSource(
    root: Element,
    options: { allowDataImage: boolean; includeImages: boolean },
  ): string {
    const candidates: string[] = []
    const elements = [root, ...Array.from(root.querySelectorAll("*"))]

    elements.forEach((element) => {
      if (element instanceof HTMLAnchorElement) {
        candidates.push(element.href || element.getAttribute("href") || "")
      }

      if (options.includeImages && element instanceof HTMLImageElement) {
        candidates.push(this.extractQianwenImageSource(element))
      }

      ATTACHMENT_SOURCE_ATTRS.forEach((attr) => {
        if (!options.includeImages && element instanceof HTMLImageElement && attr === "src") {
          return
        }
        candidates.push(element.getAttribute(attr) || "")
      })
    })

    for (const candidate of candidates) {
      const source = this.normalizeQianwenExportSource(candidate, {
        allowDataImage: options.allowDataImage,
      })
      if (source) return source
    }

    return ""
  }

  private normalizeQianwenExportSource(
    value: string,
    options: { allowDataImage: boolean },
  ): string {
    const source = normalizeExportAssetUrl(value)
    if (!source) return ""
    if (/^data:image\/svg\+xml/i.test(source)) return ""
    if (/^data:image\//i.test(source)) return options.allowDataImage ? source : ""
    if (!isDownloadableExportAssetUrl(source)) return ""

    try {
      const url = new URL(source)
      if (/^g\.alicdn\.com$/i.test(url.hostname)) return ""
      if (/\/static\//i.test(url.pathname) && !/\.(png|jpe?g|webp|gif|avif)$/i.test(url.pathname)) {
        return ""
      }
    } catch {
      return ""
    }

    return source
  }

  private extractCleanTextParts(root: Element): string[] {
    const clone = root.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll("button, [role='button'], svg, [aria-hidden='true'], style, script")
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
    if (element.matches(".question-text-card")) return element as HTMLElement

    const questionTextCard = element.querySelector(".question-text-card")
    if (questionTextCard instanceof HTMLElement) return questionTextCard

    if (element.matches(BUBBLE_SELECTOR)) return element as HTMLElement
    return (
      (element.querySelector(BUBBLE_SELECTOR) as HTMLElement | null) || (element as HTMLElement)
    )
  }

  private normalizeUserQueryText(text: string): string {
    return text.replace(/\u00a0/g, " ")
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
