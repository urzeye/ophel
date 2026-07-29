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
  type PanelAvoidanceConfig,
} from "./base"
import type { BuiltinSiteConfig } from "./declarative"
import { QIANWEN_CONFIG, QIANWEN_CONFIG_VERSION, type QianwenSiteConfig } from "./qianwen-config"

const CHAT_PATH_PATTERN = /\/chat\/([a-f0-9]+)/i
const GROUP_PATH_PATTERN = /\/group\/([a-f0-9]+)/i
const THEME_STORAGE_KEY = "tongyi-theme-preference"
const CID_STORAGE_KEY = "qianwen-uniq-id"
const MODEL_EXPANDED_KEY = "model-select-expanded"
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
const HISTORY_LOAD_WAIT_MS = 650
const HISTORY_LOAD_MAX_ROUNDS = 60
const HISTORY_LOAD_STABLE_ROUNDS = 4

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
  private config: QianwenSiteConfig = QIANWEN_CONFIG
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

  getBuiltinConfig(): QianwenSiteConfig {
    return QIANWEN_CONFIG
  }

  getBuiltinConfigVersion(): number {
    return QIANWEN_CONFIG_VERSION
  }

  applyMergedConfig(config: BuiltinSiteConfig): void {
    this.config = config as QianwenSiteConfig
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
    return [...this.config.selectors.textarea]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (!super.isValidTextarea(element)) return false
    if (element.closest(this.config.sitePrivateSelectors.thinking)) return false
    if (!(element.isContentEditable || element instanceof HTMLTextAreaElement)) return false
    return !!(
      element.closest(this.config.sitePrivateSelectors.chatInput) ||
      element.matches(this.config.sitePrivateSelectors.slateEditor)
    )
  }

  getSubmitKeyConfig(): { key: "Enter" | "Ctrl+Enter" } {
    return { key: this.config.input.submitKey ?? "Enter" }
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
    return [...this.config.selectors.submitButton]
  }

  findSubmitButton(editor: HTMLElement | null): HTMLElement | null {
    const scopes = [
      editor?.closest(this.config.sitePrivateSelectors.chatInput),
      editor?.parentElement,
      editor?.closest("div"),
      document.body,
    ].filter(Boolean) as ParentNode[]

    for (const scope of scopes) {
      const candidates = scope.querySelectorAll(
        this.config.sitePrivateSelectors.submitButtonCandidates,
      )
      for (const candidate of Array.from(candidates)) {
        const button = (candidate as HTMLElement).closest(
          this.config.sitePrivateSelectors.submitButtonClickable,
        ) as HTMLElement | null
        if (!button || !this.isVisibleElement(button)) continue
        if (this.isDisabledActionButton(button)) continue
        return button
      }
    }

    return super.findSubmitButton(editor)
  }

  getNewChatButtonSelectors(): string[] {
    return [...this.config.selectors.newChatButton]
  }

  // ==================== 滚动与消息 ====================

  getScrollContainer(): HTMLElement | null {
    const messageRoots = [
      document.querySelector(this.config.sitePrivateSelectors.messageListArea),
      document.querySelector(this.config.sitePrivateSelectors.messageList),
    ].filter(Boolean) as Element[]

    for (const root of messageRoots) {
      const scrollableAncestor = this.findConversationScrollableAncestor(root)
      if (scrollableAncestor) return scrollableAncestor
    }

    for (const selector of this.config.sitePrivateSelectors.scrollRootCandidates) {
      const containers = document.querySelectorAll(selector)
      for (const container of Array.from(containers)) {
        const el = container as HTMLElement
        if (this.isScrollableConversationContainer(el)) return el
      }
    }

    const scrollingElement = document.scrollingElement
    if (
      scrollingElement instanceof HTMLElement &&
      this.isScrollableConversationContainer(scrollingElement)
    ) {
      return scrollingElement
    }

    return null
  }

  getResponseContainerSelector(): string {
    return this.config.selectors.responseContainer
  }

  getChatContentSelectors(): string[] {
    return [...this.config.selectors.chatContent]
  }

  getUserQuerySelector(): string | null {
    return this.config.selectors.userQuery
  }

  getLatestReplyText(): string | null {
    const responses = document.querySelectorAll(this.config.selectors.assistantResponse)
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
      .querySelectorAll(this.config.sitePrivateSelectors.userTextDecoration)
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

  /** 导出前钩子：记录 includeThoughts，并补齐千问懒加载的长会话历史。 */
  async prepareConversationExport(context: ExportLifecycleContext): Promise<unknown> {
    this.exportIncludeThoughts = context.includeThoughts
    await this.loadCompleteConversationHistory()
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
      document.querySelector(this.config.sitePrivateSelectors.messageListArea) ||
      document.querySelector(this.getResponseContainerSelector())
    if (!container) return items

    const blocks = this.collectTopLevelBlocks(
      Array.from(container.querySelectorAll(this.config.selectors.chatContent.join(", "))).filter(
        (el) => !el.closest(".gh-root"),
      ),
    )

    blocks.forEach((block, index) => {
      const isUserBlock = block.matches(this.config.selectors.userQuery)

      if (isUserBlock) {
        if (!includeUserQueries) return

        const text = this.extractUserQueryText(block)
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          const nextAnswer = blocks
            .slice(index + 1)
            .find((el) => el.matches(this.config.selectors.assistantResponse))
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
          !heading.closest(this.config.sitePrivateSelectors.thinking) &&
          !this.isInRenderedMarkdownContainer(heading),
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
    return { ...this.config.export }
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
      ...this.config.networkMonitor,
      urlPatterns: [...this.config.networkMonitor.urlPatterns],
      urlPathEndsWith: this.config.networkMonitor.urlPathEndsWith
        ? [...this.config.networkMonitor.urlPathEndsWith]
        : undefined,
      requestBodyRules: this.config.networkMonitor.requestBodyRules?.map((rule) => ({
        ...rule,
        metadata: { ...rule.metadata },
      })),
    }
  }

  isGenerating(): boolean {
    for (const selector of this.config.generating.existsSelectors) {
      const stopButtons = document.querySelectorAll(selector)
      for (const button of Array.from(stopButtons)) {
        const el = button as HTMLElement
        if (this.isVisibleElement(el) && !this.isDisabledActionButton(el)) {
          return true
        }
      }
    }
    return false
  }

  getStopButtonSelectors(): string[] {
    return [...this.config.selectors.stopButton]
  }

  stopGeneration(): boolean {
    for (const selector of this.config.selectors.stopButton) {
      const stopButtons = document.querySelectorAll(selector)
      for (const button of Array.from(stopButtons)) {
        const el = button as HTMLElement
        if (!this.isVisibleElement(el) || this.isDisabledActionButton(el)) {
          continue
        }

        this.simulateClick(el)
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
      ...this.config.modelSwitcher,
      targetModelKeyword: keyword,
      selectorButtonSelectors: [...this.config.modelSwitcher.selectorButtonSelectors],
      subMenuTriggers: this.config.modelSwitcher.subMenuTriggers
        ? [...this.config.modelSwitcher.subMenuTriggers]
        : undefined,
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
    const maxAttempts = this.config.modelSwitcher.maxAttempts ?? 10
    const menuRenderDelay = this.config.modelSwitcher.menuRenderDelay ?? 300

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
      }, menuRenderDelay)
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
    return this.config.widthSelectors.map((selector) => ({ ...selector }))
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    const messageListWidthVarsCss = [
      "width: 100% !important;",
      "min-width: 0 !important;",
      "--max-message-list-width: 100% !important;",
      "--min-message-list-width: 0px !important;",
    ].join(" ")

    return {
      scopeSelector: this.config.sitePrivateSelectors.chatLayoutScope,
      widthSelectors: [
        {
          selector: this.config.sitePrivateSelectors.messageCenter,
          property: "max-width",
          extraCss: messageListWidthVarsCss,
        },
        {
          selector: this.config.sitePrivateSelectors.messageList,
          property: "--message-content-width",
          noCenter: true,
        },
        {
          selector: this.config.selectors.assistantResponse,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
      ],
      insetSelectors: [
        {
          selector: `${this.config.sitePrivateSelectors.chatContent}, ${this.config.sitePrivateSelectors.messageListArea}`,
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: this.config.sitePrivateSelectors.canvasPanel,
          scopeSelector: this.config.sitePrivateSelectors.canvasLayoutScope,
          applySide: "right",
          insetMode: "edge",
          rightProperty: "margin-right",
          extraCss: "box-sizing: border-box; min-width: 0 !important;",
        },
      ],
      defaultWidth: "800px",
      gap: 16,
    }
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
        selector: `${this.config.selectors.userQuery} ${this.config.sitePrivateSelectors.bubble}`,
        property: "max-width",
        extraCss: alignRightCss,
        noCenter: true,
      },
      {
        selector: this.config.sitePrivateSelectors.questionCard,
        property: "max-width",
        extraCss: alignRightCss,
        noCenter: true,
      },
    ]
  }

  getZenModeConfig() {
    const { hide, rootClass, styles } = this.config.zenMode
    return {
      ...(hide ? { hide: [...hide] } : {}),
      ...(rootClass ? { rootClass: { ...rootClass } } : {}),
      ...(styles ? { styles: styles.map((style) => ({ ...style })) } : {}),
    }
  }

  getCleanModeConfig() {
    const { hide, rootClass, styles } = this.config.cleanMode
    return {
      ...(hide ? { hide: [...hide] } : {}),
      ...(rootClass ? { rootClass: { ...rootClass } } : {}),
      ...(styles ? { styles: styles.map((style) => ({ ...style })) } : {}),
    }
  }

  getMarkdownFixerConfig(): MarkdownFixerConfig | null {
    return {
      selector: this.config.sitePrivateSelectors.markdownFixerParagraph,
      fixSpanContent: false,
      shouldSkip: (element) => {
        if (!this.isGenerating()) return false
        const currentMessage = element.closest(this.config.selectors.assistantResponse)
        if (!currentMessage) return false
        const messages = document.querySelectorAll(this.config.selectors.assistantResponse)
        return currentMessage === messages[messages.length - 1]
      },
    }
  }

  // ==================== 内部辅助方法 ====================

  private async loadCompleteConversationHistory(): Promise<void> {
    let container = this.getScrollContainer()
    if (!container) return

    let lastSignature = ""
    let stableRounds = 0

    for (let round = 0; round < HISTORY_LOAD_MAX_ROUNDS; round++) {
      const refreshedContainer = this.getScrollContainer()
      if (refreshedContainer) {
        container = refreshedContainer
      }

      this.scrollConversationContainerToTop(container)
      await this.sleep(HISTORY_LOAD_WAIT_MS)

      const signature = this.getConversationLoadSignature(container)
      if (signature === lastSignature) {
        stableRounds++
      } else {
        lastSignature = signature
        stableRounds = 0
      }

      if (stableRounds >= HISTORY_LOAD_STABLE_ROUNDS) {
        return
      }
    }
  }

  private scrollConversationContainerToTop(container: HTMLElement): void {
    if (container === document.documentElement || container === document.body) {
      window.scrollTo({ top: 0, behavior: "auto" })
    } else {
      container.scrollTop = 0
    }

    container.dispatchEvent(new Event("scroll", { bubbles: true }))
    container.dispatchEvent(new WheelEvent("wheel", { deltaY: -800, bubbles: true }))
    window.dispatchEvent(new Event("scroll"))
  }

  private getConversationLoadSignature(container: HTMLElement): string {
    return [
      container.scrollHeight,
      container.clientHeight,
      container.scrollTop,
      this.getExportableMessageBlockCount(),
    ].join(":")
  }

  private getExportableMessageBlockCount(): number {
    const root = this.getExportRoot()
    return this.collectTopLevelBlocks(
      Array.from(root.querySelectorAll(this.config.selectors.chatContent.join(", "))),
    ).filter((element) => !element.closest(".gh-root")).length
  }

  private findConversationScrollableAncestor(element: Element): HTMLElement | null {
    let current = element.parentElement
    while (current && current !== document.body) {
      if (this.isScrollableConversationContainer(current)) return current
      current = current.parentElement
    }
    return null
  }

  private isScrollableConversationContainer(element: HTMLElement): boolean {
    if (!element.isConnected) return false

    const hasConversationContent =
      element === document.documentElement ||
      element === document.body ||
      Boolean(element.querySelector(this.config.sitePrivateSelectors.scrollContent))

    if (!hasConversationContent) return false

    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden") return false

    const rect = element.getBoundingClientRect()
    if (element !== document.documentElement && element !== document.body) {
      if (rect.width <= 0 || rect.height <= 0) return false
    }

    return element.scrollHeight > element.clientHeight + 5
  }

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
      (document.querySelector(
        this.config.sitePrivateSelectors.messageListArea,
      ) as HTMLElement | null) ||
      (document.querySelector(
        this.config.sitePrivateSelectors.messageList,
      ) as HTMLElement | null) ||
      document.body
    )
  }

  private collectQianwenExportTurns(root: Element): Element[] {
    const candidates = this.queryElementsIncludingSelf(root, this.config.sitePrivateSelectors.turn)
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
      this.queryElementsIncludingSelf(
        root,
        `${this.config.selectors.userQuery}, ${this.config.sitePrivateSelectors.questionCard}`,
      ),
    )
    const assistantRoots = this.collectTopLevelBlocks(
      this.queryElementsIncludingSelf(root, this.config.selectors.assistantResponse),
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
      .querySelectorAll(this.config.sitePrivateSelectors.assistantExportDecoration)
      .forEach((node) => node.remove())

    clone
      .querySelectorAll(this.config.sitePrivateSelectors.thinking)
      .forEach((node) => node.remove())

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
    const textCards = this.queryElementsIncludingSelf(
      scope,
      this.config.sitePrivateSelectors.userTextCard,
    )
    const parts: string[] = []
    const seen = new Set<string>()

    textCards.forEach((card) => {
      if (card.closest(".gh-user-query-markdown")) return
      const clone = card.cloneNode(true) as HTMLElement
      clone
        .querySelectorAll(this.config.sitePrivateSelectors.userTextDecoration)
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

    this.queryElementsIncludingSelf(scope, this.config.sitePrivateSelectors.userImageCard).forEach(
      (card) => addAttachment(this.extractQianwenUserImageAttachment(card)),
    )
    this.queryElementsIncludingSelf(scope, this.config.sitePrivateSelectors.userFileCard).forEach(
      (card) => addAttachment(this.extractQianwenUserFileAttachment(card)),
    )

    return attachments
  }

  private extractQianwenUserImageAttachment(card: Element): QianwenUserAttachment | null {
    const image = card.querySelector(this.config.sitePrivateSelectors.attachmentImage)
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

    this.queryElementsIncludingSelf(
      contentRoot,
      this.config.sitePrivateSelectors.assistantGeneratedImage,
    ).forEach((node) => {
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
    })

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
    if (
      element.matches(this.config.selectors.userQuery) ||
      element.matches(this.config.sitePrivateSelectors.questionCard)
    ) {
      return element
    }

    return (
      element.closest(this.config.selectors.userQuery) ||
      element.closest(this.config.sitePrivateSelectors.questionCard) ||
      element
    )
  }

  private findAssistantContentRoot(element: Element): Element {
    if (element.matches(this.config.sitePrivateSelectors.assistantContent)) return element
    return element.querySelector(this.config.sitePrivateSelectors.assistantContent) || element
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
      .querySelectorAll(this.config.sitePrivateSelectors.cleanTextDecoration)
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
    const thoughtNodes = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.thinkingContent),
    )
    const blocks: string[] = []

    for (const thought of thoughtNodes) {
      // 移除 thinking 内部的装饰元素
      const clone = thought.cloneNode(true) as HTMLElement
      clone
        .querySelectorAll(this.config.sitePrivateSelectors.thinkingDecoration)
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
      .querySelectorAll(this.config.sitePrivateSelectors.assistantPlainTextDecoration)
      .forEach((node) => node.remove())
    return this.extractTextWithLineBreaks(clone).trim()
  }

  private findUserQueryContentRoot(element: Element): HTMLElement | null {
    if (element.matches(this.config.sitePrivateSelectors.questionTextCard)) {
      return element as HTMLElement
    }

    const questionTextCard = element.querySelector(
      this.config.sitePrivateSelectors.questionTextCard,
    )
    if (questionTextCard instanceof HTMLElement) return questionTextCard

    if (element.matches(this.config.sitePrivateSelectors.bubble)) return element as HTMLElement
    return (
      (element.querySelector(this.config.sitePrivateSelectors.bubble) as HTMLElement | null) ||
      (element as HTMLElement)
    )
  }

  private normalizeUserQueryText(text: string): string {
    return text.replace(/\u00a0/g, " ")
  }

  private findModelSelectorTrigger(): HTMLElement | null {
    const triggers = Array.from(
      document.querySelectorAll(this.config.sitePrivateSelectors.modelTrigger),
    )

    const visibleTriggers = triggers.filter((trigger) => {
      const el = trigger as HTMLElement
      if (!this.isVisibleElement(el)) return false
      if (el.closest(this.config.sitePrivateSelectors.sidebar)) return false
      if (el.closest(this.config.sitePrivateSelectors.chatInput)) return false
      const rect = el.getBoundingClientRect()
      const text = el.innerText?.trim() || el.textContent?.trim() || ""
      return rect.top < 180 && rect.width > 0 && rect.height > 0 && text.length > 0
    }) as HTMLElement[]

    return visibleTriggers[0] || null
  }

  private findVisibleModelDialogItems(): HTMLElement[] {
    const dialogs = Array.from(
      document.querySelectorAll(this.config.sitePrivateSelectors.modelDialog),
    ).filter((dialog) => this.isVisibleElement(dialog as HTMLElement))
    if (dialogs.length === 0) return []

    const items: HTMLElement[] = []
    dialogs.forEach((dialog) => {
      const found = dialog.querySelectorAll(this.config.modelSwitcher.menuItemSelector)
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
    const dialogs = Array.from(
      document.querySelectorAll(this.config.sitePrivateSelectors.modelDialog),
    ).filter((dialog) => this.isVisibleElement(dialog as HTMLElement))

    for (const dialog of dialogs) {
      const toggles = dialog.querySelectorAll(this.config.sitePrivateSelectors.modelExpandToggle)
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
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
