/**
 * 元宝适配器（yuanbao.tencent.com）
 *
 * 选择器策略：
 * - 优先使用稳定的语义类名和 data 属性（如 data-desc / dt-cid / data-item-id）
 * - 避免依赖 CSS Modules 哈希类名
 * - 输入框基于 Quill 的 `.ql-editor[contenteditable="true"]`
 */
import { SITE_IDS } from "~constants"
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
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportLifecycleContext,
  type ExportConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type PanelAvoidanceConfig,
  type SiteDeleteConversationResult,
} from "./base"
import type { BuiltinSiteConfig } from "./declarative"
import { YUANBAO_CONFIG, YUANBAO_CONFIG_VERSION, type YuanbaoSiteConfig } from "./yuanbao-config"

const HOSTNAME = "yuanbao.tencent.com"
const CHAT_PATH_PATTERN = /^\/chat\/([^/?#]+)(?:\/([^/?#]+))?/
const THEME_STORAGE_KEY = "yb_web_theme_mode"
const USER_ID_STORAGE_KEY = "yb_user_id"
const ATTACHMENT_SOURCE_ATTRS = [
  "href",
  "src",
  "data-src",
  "data-url",
  "data-card-url",
  "data-download-url",
  "data-file-url",
  "data-resource-url",
  "data-source-url",
  "data-origin-url",
  "data-original-url",
  "data-thumbnail-url",
  "data-image-url",
  "data-image-src",
]

const DELETE_TEXT_PATTERN = /删除|delete/i
const CONFIRM_TEXT_PATTERN = /删除|确认|确定|delete|confirm/i
const CANCEL_TEXT_PATTERN = /取消|cancel/i

const YUANBAO_DELETE_REASON = {
  UI_FAILED: "ui_failed",
  UI_EXCEPTION: "ui_exception",
  BATCH_ABORTED_AFTER_UI_FAILURE: "batch_aborted_after_ui_failure",
} as const

const MAX_OUTLINE_TEXT_LENGTH = 80

interface YuanbaoUserAttachment {
  kind: "image" | "file"
  name: string
  source: string
  type: string
  sizeLabel?: string
}

interface YuanbaoAssistantImage {
  source: string
  alt: string
  extensionHint?: string
}

export class YuanbaoAdapter extends SiteAdapter {
  private config: YuanbaoSiteConfig = YUANBAO_CONFIG
  private exportIncludeThoughtsOverride: boolean | null = null

  match(): boolean {
    return window.location.hostname === HOSTNAME
  }

  getSiteId(): string {
    return SITE_IDS.YUANBAO
  }

  getName(): string {
    return "元宝"
  }

  getBuiltinConfig(): YuanbaoSiteConfig {
    return YUANBAO_CONFIG
  }

  getBuiltinConfigVersion(): number {
    return YUANBAO_CONFIG_VERSION
  }

  applyMergedConfig(config: BuiltinSiteConfig): void {
    this.config = config as YuanbaoSiteConfig
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#1677ff", secondary: "#0b5bd3" }
  }

  supportsFormulaCopy(): boolean {
    return false
  }

  getTextareaSelectors(): string[] {
    return [...this.config.selectors.textarea]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (!super.isValidTextarea(element)) return false
    return (
      element.getAttribute("contenteditable") === "true" &&
      !!element.closest(this.config.sitePrivateSelectors.inputContainer)
    )
  }

  getSubmitKeyConfig(): { key: "Enter" | "Ctrl+Enter" } {
    return { key: this.config.input.submitKey ?? "Enter" }
  }

  insertPrompt(content: string): boolean {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return false

    editor.focus()

    try {
      document.execCommand("selectAll", false)
      if (!document.execCommand("insertText", false, content)) {
        throw new Error("execCommand returned false")
      }
      editor.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          data: content,
          inputType: "insertText",
        }),
      )
      return true
    } catch {
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
  }

  clearTextarea(): void {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return

    editor.focus()

    try {
      document.execCommand("selectAll", false)
      document.execCommand("delete", false)
    } catch {
      editor.textContent = ""
    }

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

  protected simulateClick(element: HTMLElement): void {
    const rect = element.getBoundingClientRect()
    const clientX = rect.left + Math.max(1, Math.min(rect.width / 2, Math.max(rect.width - 1, 1)))
    const clientY = rect.top + Math.max(1, Math.min(rect.height / 2, Math.max(rect.height - 1, 1)))
    const commonInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX,
      clientY,
    }

    const dispatchPointer = (type: string) => {
      if (typeof PointerEvent !== "function") return false
      return element.dispatchEvent(
        new PointerEvent(type, {
          ...commonInit,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }),
      )
    }

    dispatchPointer("pointerenter")
    dispatchPointer("pointerover")
    dispatchPointer("pointermove")
    element.dispatchEvent(new MouseEvent("mouseenter", commonInit))
    element.dispatchEvent(new MouseEvent("mouseover", commonInit))
    element.dispatchEvent(new MouseEvent("mousemove", commonInit))
    dispatchPointer("pointerdown")
    element.dispatchEvent(new MouseEvent("mousedown", commonInit))
    dispatchPointer("pointerup")
    element.dispatchEvent(new MouseEvent("mouseup", commonInit))
    element.dispatchEvent(new MouseEvent("click", commonInit))
  }

  getSubmitButtonSelectors(): string[] {
    return [...this.config.selectors.submitButton]
  }

  findSubmitButton(): HTMLElement | null {
    const primary = document.querySelector(
      this.config.sitePrivateSelectors.primarySubmitButton,
    ) as HTMLElement | null
    if (this.isVisibleElement(primary) && !this.isDisabledActionButton(primary)) {
      return primary
    }

    for (const selector of this.config.selectors.submitButton) {
      const candidates = Array.from(document.querySelectorAll(selector))
      for (const candidate of candidates) {
        const button = candidate as HTMLElement
        if (!this.isVisibleElement(button)) continue
        if (this.isDisabledActionButton(button) || this.isStopLikeButton(button)) continue
        return button
      }
    }

    return null
  }

  getSessionId(): string {
    const match = window.location.pathname.match(CHAT_PATH_PATTERN)
    return match?.[2] || ""
  }

  isNewConversation(): boolean {
    const path = window.location.pathname.replace(/\/+$/, "")
    const match = path.match(CHAT_PATH_PATTERN)
    if (match) {
      return !match[2]
    }
    return path === "" || path === "/"
  }

  isSharePage(): boolean {
    // 自有会话：/chat/ID    分享会话：/s/ID
    return window.location.pathname.startsWith("/s/")
  }

  getNewTabUrl(): string {
    const agentId = this.getAgentId()
    return agentId ? this.buildConfiguredConversationUrl(agentId) : `https://${HOSTNAME}/`
  }

  getSessionName(): string | null {
    const conversationTitle = this.getConversationTitle()
    if (conversationTitle) return conversationTitle

    const title = this.getDocumentConversationTitle() || ""
    if (!title) return null

    const cleaned = title.replace(/\s*[-|]\s*(腾讯元宝|元宝)$/i, "").trim()
    if (!cleaned || /^(腾讯元宝|元宝)$/i.test(cleaned)) {
      return null
    }

    return cleaned
  }

  getCurrentCid(): string | null {
    const raw = localStorage.getItem(USER_ID_STORAGE_KEY)
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
      // 回退到原始值
    }

    return raw.trim() || null
  }

  getConversationTitle(): string | null {
    const active = this.findActiveConversationElement()
    return active ? this.extractConversationTitle(active) : null
  }

  getCurrentConversationInfo(): ConversationInfo | null {
    const current = super.getCurrentConversationInfo()
    if (!current) return null

    const active = this.findActiveConversationElement()
    const activeInfo = active
      ? this.extractConversationInfo(active, this.getCurrentCid() || undefined)
      : null

    if (!activeInfo || activeInfo.id !== current.id) {
      return current
    }

    return {
      ...current,
      title: activeInfo.title || current.title,
      url: activeInfo.url || current.url,
      cid: activeInfo.cid ?? current.cid,
      isActive: activeInfo.isActive ?? current.isActive,
      isPinned: activeInfo.isPinned ?? current.isPinned,
    }
  }

  getConversationList(): ConversationInfo[] {
    const cid = this.getCurrentCid() || undefined
    const map = new Map<string, ConversationInfo>()

    this.getConversationElements().forEach((item) => {
      const info = this.extractConversationInfo(item, cid)
      if (info) {
        map.set(info.id, info)
      }
    })

    return Array.from(map.values())
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    return {
      selector: this.config.conversation.itemSelector,
      shadow: this.config.conversation.shadow ?? false,
      extractInfo: (el) => this.extractConversationInfo(el, this.getCurrentCid() || undefined),
      getTitleElement: (el) => this.findConversationTitleElement(el) || el,
    }
  }

  getSidebarScrollContainer(): Element | null {
    return document.querySelector(this.config.selectors.sidebarScrollContainer)
  }

  navigateToConversation(id: string, url?: string): boolean {
    if (this.config.conversation.navigationStrategy === "location") {
      return super.navigateToConversation(id, url || this.buildConversationUrl(id))
    }

    const beforeState = this.captureConversationNavigationState()
    const row = this.findConversationRowById(id)

    if (row) {
      const titleElement = this.findConversationTitleElement(row)
      const clickable =
        this.resolveClickableTarget(titleElement) ||
        (row.querySelector("a[href]") as HTMLElement | null) ||
        this.resolveClickableTarget(row) ||
        row
      this.simulateClick(clickable)
      window.setTimeout(() => {
        if (!this.hasConversationNavigationChanged(beforeState)) {
          super.navigateToConversation(id, url || this.buildConversationUrl(id))
        }
      }, 800)
      return true
    }

    return super.navigateToConversation(id, url || this.buildConversationUrl(id))
  }

  async deleteConversationOnSite(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    try {
      const success = await this.deleteConversationViaUi(target.id)
      return {
        id: target.id,
        success,
        method: success ? "ui" : "none",
        reason: success ? undefined : YUANBAO_DELETE_REASON.UI_FAILED,
      }
    } catch (error) {
      console.error(`[YuanbaoAdapter] deleteConversationOnSite error for "${target.id}":`, error)
      return {
        id: target.id,
        success: false,
        method: "none",
        reason: YUANBAO_DELETE_REASON.UI_EXCEPTION,
      }
    }
  }

  async deleteConversationsOnSite(
    targets: ConversationDeleteTarget[],
  ): Promise<SiteDeleteConversationResult[]> {
    const results: SiteDeleteConversationResult[] = []

    for (let index = 0; index < targets.length; index += 1) {
      const result = await this.deleteConversationOnSite(targets[index])
      results.push(result)

      if (!result.success && result.reason === YUANBAO_DELETE_REASON.UI_FAILED) {
        for (let rest = index + 1; rest < targets.length; rest += 1) {
          results.push({
            id: targets[rest].id,
            success: false,
            method: "none",
            reason: YUANBAO_DELETE_REASON.BATCH_ABORTED_AFTER_UI_FAILURE,
          })
        }
        break
      }
    }

    return results
  }

  getScrollContainer(): HTMLElement | null {
    for (const selector of this.config.selectors.scrollContainer) {
      const candidate = document.querySelector(selector)
      if (!(candidate instanceof HTMLElement)) continue

      if (candidate.scrollHeight > candidate.clientHeight) {
        return candidate
      }

      const scrollable = this.findScrollableParent(candidate)
      if (scrollable) return scrollable
    }

    return super.getScrollContainer()
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

  extractUserQueryText(element: Element): string {
    const contentRoot = this.findUserContentRoot(element)
    if (!contentRoot) return ""

    const clone = contentRoot.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.userTextDecoration)
      .forEach((node) => node.remove())

    return this.extractTextWithLineBreaks(clone).trim()
  }

  extractUserQueryMarkdown(element: Element): string {
    return this.extractUserQueryText(element)
  }

  extractUserQueryExportContent(element: Element): string {
    return this.extractUserQueryExportContentWithAssets(element)
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
    return this.extractAssistantResponseTextWithAssets(element)
  }

  getLatestReplyText(): string | null {
    const replies = document.querySelectorAll(this.config.selectors.assistantResponse)
    const last = replies[replies.length - 1]
    return last ? this.extractAssistantResponseText(last) : null
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const container =
      document.querySelector(this.config.selectors.responseContainer) ||
      this.getScrollContainer() ||
      document
    const blocks = Array.from(
      container.querySelectorAll(this.config.selectors.chatContent.join(", ")),
    ).filter((element) => !element.closest(".gh-root"))

    const items: OutlineItem[] = []

    blocks.forEach((block, blockIndex) => {
      if (block.matches(this.config.selectors.userQuery)) {
        if (!includeUserQueries) return

        const text = this.extractUserQueryText(block)
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          const nextAssistant = blocks
            .slice(blockIndex + 1)
            .find((element) => element.matches(this.config.selectors.assistantResponse))
          wordCount = nextAssistant ? this.extractAssistantPlainText(nextAssistant).length : 0
        }

        items.push({
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

  async prepareConversationExport(context: ExportLifecycleContext): Promise<unknown> {
    this.exportIncludeThoughtsOverride = context.includeThoughts
    return null
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    _state: unknown,
  ): Promise<void> {
    this.exportIncludeThoughtsOverride = null
  }

  async extractExportMessages(_context: ExportLifecycleContext): Promise<ExportMessage[] | null> {
    const messages = this.extractYuanbaoExportMessages()
    return messages.length > 0 ? messages : null
  }

  async extractExportBundle(_context: ExportLifecycleContext): Promise<ExportBundle | null> {
    return this.createExportBundleFromMessages((collector) =>
      this.extractYuanbaoExportMessages(collector),
    )
  }

  isGenerating(): boolean {
    return this.findStopButton() !== null
  }

  getStopButtonSelectors(): string[] {
    return [...this.config.selectors.stopButton]
  }

  stopGeneration(): boolean {
    const button = this.findStopButton()
    if (!button) return false

    this.simulateClick(button)
    return true
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
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

  getWidthSelectors() {
    return this.config.widthSelectors.map((selector) => ({ ...selector }))
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    return {
      scopeSelector: this.config.sitePrivateSelectors.layoutScope,
      widthSelectors: this.getWidthSelectors(),
      insetSelectors: [
        {
          selector: this.config.sitePrivateSelectors.chatContent,
          scopeSelector: this.config.sitePrivateSelectors.chatColumnScope,
          extraCss: "box-sizing: border-box;",
        },
        {
          selector: this.config.sitePrivateSelectors.inputContainer,
          scopeSelector: this.config.sitePrivateSelectors.chatColumnScope,
          extraCss: "box-sizing: border-box;",
        },
        {
          selector: this.config.sitePrivateSelectors.canvasPane,
          scopeSelector: this.config.sitePrivateSelectors.layoutScope,
          applySide: "right",
          insetMode: "edge",
          rightProperty: "margin-right",
          extraCss: "box-sizing: border-box;",
        },
      ],
      defaultWidth: "960px",
      gap: 16,
    }
  }

  async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, targetMode)

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_STORAGE_KEY,
          newValue: targetMode,
          storageArea: localStorage,
        }),
      )

      document.documentElement.style.colorScheme = targetMode
      return true
    } catch (error) {
      console.error("[YuanbaoAdapter] toggleTheme error:", error)
      return false
    }
  }

  getModelName(): string | null {
    const modelTextSelector =
      this.config.modelSwitcher.selectorButtonSelectors[1] ||
      this.config.modelSwitcher.selectorButtonSelectors[0]
    const textNode = modelTextSelector ? document.querySelector(modelTextSelector) : null
    const text = textNode?.textContent?.trim() || ""
    return text || null
  }

  getModelLockCheckText(selectorBtn?: HTMLElement | null): string {
    return this.getModelName() || super.getModelLockCheckText(selectorBtn)
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

  getNewChatButtonSelectors(): string[] {
    return [...this.config.selectors.newChatButton]
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

  private getAgentId(): string | null {
    const pathMatch = window.location.pathname.match(CHAT_PATH_PATTERN)
    if (pathMatch?.[1]) return pathMatch[1]

    for (const selector of this.config.sitePrivateSelectors.agentId) {
      const attrValue = document.querySelector(selector)?.getAttribute("dt-agent-id")
      if (attrValue?.trim()) return attrValue.trim()
    }

    return null
  }

  private buildConfiguredConversationUrl(id: string): string {
    const path = this.config.conversation.urlTemplate.split("{id}").join(id)
    return `https://${HOSTNAME}${path}`
  }

  private buildConversationUrl(sessionId: string): string {
    const agentId = this.getAgentId()
    return agentId
      ? this.buildConfiguredConversationUrl(`${agentId}/${sessionId}`)
      : `https://${HOSTNAME}/`
  }

  private getConversationElements(): Element[] {
    const { itemSelector, shadow } = this.config.conversation
    return shadow
      ? this.findAllElementsBySelector(itemSelector)
      : Array.from(document.querySelectorAll(itemSelector))
  }

  private findActiveConversationElement(): Element | null {
    const activeMatch = this.config.conversation.activeMatch
    if (!activeMatch) return null

    return this.getConversationElements().find((item) => item.matches(activeMatch)) || null
  }

  private extractConversationInfo(el: Element, cid?: string): ConversationInfo | null {
    const container =
      (el.closest(this.config.conversation.itemSelector) as HTMLElement | null) ||
      (el.matches(this.config.conversation.itemSelector) ? (el as HTMLElement) : null)
    if (!container) return null

    const id = this.extractConversationId(container)
    if (!id) return null

    const title = this.extractConversationTitle(container)
    const url = this.buildConversationUrl(id)

    return {
      id,
      title,
      url,
      cid,
      isActive: this.config.conversation.activeMatch
        ? container.matches(this.config.conversation.activeMatch)
        : undefined,
      isPinned: this.isPinnedConversation(container),
    }
  }

  private extractConversationId(container: Element): string {
    const { attr = "href", regex } = this.config.conversation.idFrom
    const source = container.getAttribute(attr)
    const primaryId = source ? new RegExp(regex).exec(source)?.[1] || "" : ""
    if (primaryId) return primaryId

    return (
      container
        .querySelector(this.config.sitePrivateSelectors.conversationFallbackId)
        ?.getAttribute("data-item-id") || ""
    )
  }

  private findConversationTitleElement(element: Element): HTMLElement | null {
    const titleSelector = this.config.conversation.titleSelector
    if (!titleSelector) return null
    if (element.matches(titleSelector)) return element as HTMLElement
    return element.querySelector(titleSelector) as HTMLElement | null
  }

  private extractConversationTitle(element: Element): string {
    const titleElement = this.findConversationTitleElement(element)
    const attrTitle =
      titleElement?.getAttribute("data-item-name") || titleElement?.dataset?.itemName
    const text = attrTitle || titleElement?.textContent || ""
    return text.trim()
  }

  private isPinnedConversation(element: Element): boolean {
    return element.querySelector(this.config.sitePrivateSelectors.conversationPinned) !== null
  }

  private findScrollableParent(element: Element | null): HTMLElement | null {
    let current = element?.parentElement || null

    while (current) {
      const style = window.getComputedStyle(current)
      const isScrollable = /(auto|scroll)/i.test(style.overflowY)
      if (isScrollable && current.scrollHeight > current.clientHeight) {
        return current
      }
      current = current.parentElement
    }

    return null
  }

  private findUserContentRoot(element: Element): HTMLElement | null {
    return (
      (element.querySelector(this.config.sitePrivateSelectors.userText) as HTMLElement | null) ||
      (element.querySelector(
        this.config.sitePrivateSelectors.bubbleContent,
      ) as HTMLElement | null) ||
      (element as HTMLElement)
    )
  }

  private findAssistantContentRoot(element: Element): HTMLElement | null {
    const bodyRoot = this.findAssistantBodyRoot(element)
    if (bodyRoot) return bodyRoot

    const markdownRoot = this.findAssistantMarkdownRoot(element)
    if (markdownRoot) return markdownRoot as HTMLElement

    return (
      (element.querySelector(
        this.config.sitePrivateSelectors.assistantSpeechText,
      ) as HTMLElement | null) ||
      (element.querySelector(
        this.config.sitePrivateSelectors.bubbleContent,
      ) as HTMLElement | null) ||
      (element as HTMLElement)
    )
  }

  private findAssistantMarkdownRoot(element: Element): Element | null {
    const reasonerBody = this.findFirstAssistantNodeOutsideThoughts(
      element,
      this.config.sitePrivateSelectors.assistantReasonerBody.slice(0, 2),
    )
    if (reasonerBody) return reasonerBody

    if (
      element.matches(this.config.sitePrivateSelectors.assistantMarkdown) &&
      !this.isThoughtElement(element)
    ) {
      return element
    }

    const markdownRoots = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.assistantMarkdown),
    )
    return markdownRoots.find((node) => !this.isThoughtElement(node)) || markdownRoots[0] || null
  }

  private extractYuanbaoExportMessages(collector?: ExportAssetCollector): ExportMessage[] {
    const root =
      (document.querySelector(this.config.selectors.responseContainer) as ParentNode | null) ||
      this.getScrollContainer() ||
      document.body
    const blocks = this.collectTopLevelBlocks(
      Array.from(root.querySelectorAll(this.config.selectors.chatContent.join(", "))),
    )
      .filter((element) => !this.shouldSkipExportElement(element))
      .sort((left, right) => this.compareDomOrder(left, right))

    return blocks
      .map((element): ExportMessage => {
        const role = element.matches(this.config.selectors.userQuery) ? "user" : "assistant"
        const content =
          role === "user"
            ? this.extractUserQueryExportContentWithAssets(element, collector)
            : this.extractAssistantResponseTextWithAssets(element, collector)

        return { role, content: content.trim() }
      })
      .filter((message) => message.content.length > 0)
  }

  private extractUserQueryExportContentWithAssets(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    const body = this.extractUserQueryText(element)
    const attachments = this.extractYuanbaoUserAttachments(element)

    if (attachments.length === 0) {
      return body
    }

    const imageMarkdown = this.formatYuanbaoUserImageAttachments(attachments, collector)
    const fileMarkdown = this.formatYuanbaoUserFileAttachments(attachments, collector)
    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, body].filter(Boolean).join("\n\n")
  }

  private extractAssistantResponseTextWithAssets(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    const body = this.extractAssistantMarkdown(element)
    const imageMarkdown = this.formatYuanbaoAssistantImages(
      this.extractYuanbaoAssistantImages(element),
      collector,
    )

    return [body, imageMarkdown.join("\n\n")].filter(Boolean).join("\n\n")
  }

  private extractAssistantMarkdown(element: Element): string {
    const includeThoughts = this.shouldIncludeThoughtsInExport()
    const clone = element.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.assistantExportDecoration)
      .forEach((node) => node.remove())

    const thoughtBlocks = includeThoughts ? this.extractThoughtBlockquotes(clone) : []
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.thoughtContainer)
      .forEach((node) => node.remove())

    const bodyRoot = this.findAssistantBodyRoot(clone) || clone
    const markdown = htmlToMarkdown(bodyRoot).trim()
    const normalizedBody = markdown || this.extractTextWithLineBreaks(bodyRoot).trim()

    if (includeThoughts && thoughtBlocks.length > 0) {
      const thoughtSection = thoughtBlocks.join("\n\n")
      return normalizedBody ? `${thoughtSection}\n\n${normalizedBody}` : thoughtSection
    }

    return normalizedBody
  }

  private extractYuanbaoUserAttachments(element: Element): YuanbaoUserAttachment[] {
    const scope = this.findUserMessageScope(element)
    const attachments: YuanbaoUserAttachment[] = []
    const seen = new Set<string>()

    const addAttachment = (attachment: YuanbaoUserAttachment | null) => {
      if (!attachment) return
      const keys = this.getYuanbaoAttachmentKeys(attachment)
      if (keys.some((key) => seen.has(key))) return
      keys.forEach((key) => seen.add(key))
      attachments.push(attachment)
    }

    scope.querySelectorAll(this.config.sitePrivateSelectors.userAttachmentImage).forEach((node) => {
      if (node instanceof HTMLImageElement) {
        addAttachment(this.extractYuanbaoUserImageAttachment(node))
      }
    })

    this.queryElementsIncludingSelf(
      scope,
      this.config.sitePrivateSelectors.userAttachmentFile,
    ).forEach((card) => {
      addAttachment(this.extractYuanbaoUserFileAttachment(card))
    })

    return attachments
  }

  private extractYuanbaoUserImageAttachment(image: HTMLImageElement): YuanbaoUserAttachment | null {
    const source = this.extractYuanbaoImageSource(image)
    if (!source) return null

    const name =
      image.alt?.trim() ||
      image.getAttribute("title")?.trim() ||
      extractExportFilenameFromUrl(source, { ignoreGenericDownload: true }) ||
      "uploaded image"
    const type = extractExportExtension(name) || extractExportExtensionFromUrl(source) || "image"

    return {
      kind: "image",
      name,
      source,
      type,
    }
  }

  private extractYuanbaoUserFileAttachment(card: Element): YuanbaoUserAttachment | null {
    if (card.closest(this.config.sitePrivateSelectors.userImageContainer)) {
      return null
    }

    const textParts = this.extractCleanTextParts(card)
    const { name, type, sizeLabel } = parseExportFileAttachmentText(textParts)
    const source = this.extractYuanbaoDownloadableSource(card, {
      allowDataImage: false,
      includeImages: false,
    })

    if (!name && !source) return null

    const fallbackName =
      name ||
      extractExportFilenameFromUrl(source, { ignoreGenericDownload: true }) ||
      this.extractResourceIdFilename(source) ||
      "attachment"

    return {
      kind: "file",
      name: fallbackName,
      source,
      type: type || extractExportExtension(fallbackName) || extractExportExtensionFromUrl(source),
      sizeLabel,
    }
  }

  private formatYuanbaoUserImageAttachments(
    attachments: YuanbaoUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportImageAttachments(attachments, collector, { siteId: this.getSiteId() })
  }

  private formatYuanbaoUserFileAttachments(
    attachments: YuanbaoUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportFileAttachments(attachments, collector, { siteId: this.getSiteId() })
  }

  private extractYuanbaoAssistantImages(element: Element): YuanbaoAssistantImage[] {
    const contentRoot = this.findAssistantContentRoot(element)
    const images: YuanbaoAssistantImage[] = []
    const seen = new Set<string>()

    this.queryElementsIncludingSelf(
      contentRoot,
      this.config.sitePrivateSelectors.assistantGeneratedImage,
    ).forEach((node) => {
      if (!(node instanceof HTMLImageElement)) return

      const source = this.extractYuanbaoImageSource(node)
      const sourceKey = getExportAttachmentSourceKey(source)
      if (!source || seen.has(sourceKey)) return

      seen.add(sourceKey)
      images.push({
        source,
        alt:
          node.alt?.trim() ||
          node.getAttribute("aria-label")?.trim() ||
          `generated image ${images.length + 1}`,
        extensionHint: this.extractYuanbaoImageExtensionHint(node),
      })
    })

    return images
  }

  private formatYuanbaoAssistantImages(
    images: YuanbaoAssistantImage[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportImageMarkdownList(images, collector, {
      siteId: this.getSiteId(),
      role: "assistant",
      category: "generated-image",
      fallbackAlt: "generated image",
    })
  }

  private extractYuanbaoImageSource(image: HTMLImageElement): string {
    const cardUrl =
      image.closest(this.config.sitePrivateSelectors.assetCard)?.getAttribute("data-card-url") || ""
    const candidates = [
      cardUrl,
      image.currentSrc || "",
      image.src || "",
      image.getAttribute("src") || "",
      image.getAttribute("data-src") || "",
      image.getAttribute("data-image-url") || "",
      image.getAttribute("data-original-url") || "",
      image.getAttribute("data-origin-url") || "",
    ]

    for (const candidate of candidates) {
      const source = this.normalizeYuanbaoExportSource(candidate, { allowDataImage: true })
      if (source) return source
    }

    return ""
  }

  private extractYuanbaoDownloadableSource(
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
        candidates.push(this.extractYuanbaoImageSource(element))
      }

      ATTACHMENT_SOURCE_ATTRS.forEach((attr) => {
        if (!options.includeImages && element instanceof HTMLImageElement && attr === "src") {
          return
        }
        candidates.push(element.getAttribute(attr) || "")
      })
    })

    for (const candidate of candidates) {
      const source = this.normalizeYuanbaoExportSource(candidate, {
        allowDataImage: options.allowDataImage,
      })
      if (source) return source
    }

    return ""
  }

  private normalizeYuanbaoExportSource(
    value: string,
    options: { allowDataImage: boolean },
  ): string {
    const source = normalizeExportAssetUrl(value)
    if (!source) return ""
    if (/^data:image\/svg\+xml/i.test(source)) return ""
    if (/^data:image\//i.test(source)) return options.allowDataImage ? source : ""
    if (!isDownloadableExportAssetUrl(source)) return ""

    try {
      const url = new URL(source, window.location.href)
      if (url.hostname === HOSTNAME && /\/(?:static|assets)\//i.test(url.pathname)) return ""
      if (/\.(?:svg|ico)$/i.test(url.pathname) && /(?:icon|logo|sprite)/i.test(url.pathname)) {
        return ""
      }
    } catch {
      return ""
    }

    return source
  }

  private extractYuanbaoImageExtensionHint(image: HTMLImageElement): string {
    return (
      [
        image.currentSrc || "",
        image.src || "",
        image.getAttribute("src") || "",
        image.getAttribute("data-src") || "",
        image.closest(this.config.sitePrivateSelectors.assetCard)?.getAttribute("data-card-url") ||
          "",
        image.alt || "",
      ]
        .map((value) => extractExportExtensionFromUrl(value) || extractExportExtension(value))
        .find(Boolean) || ""
    )
  }

  private findUserMessageScope(element: Element): Element {
    if (element.matches(this.config.selectors.userQuery)) return element
    return element.closest(this.config.selectors.userQuery) || element
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

  private getYuanbaoAttachmentKeys(attachment: YuanbaoUserAttachment): string[] {
    const keys: string[] = []
    const sourceKey = getExportAttachmentSourceKey(attachment.source)
    const name = attachment.name.trim().toLowerCase()
    const type = attachment.type.trim().toLowerCase()
    const size = attachment.sizeLabel?.trim().toLowerCase() || ""

    if (sourceKey) keys.push(`${attachment.kind}:source:${sourceKey}`)
    if (name && type) keys.push(`${attachment.kind}:name-type:${name}:${type}`)
    if (name && size) keys.push(`${attachment.kind}:name-size:${name}:${size}`)

    return keys.length > 0 ? keys : [`${attachment.kind}:fallback:${name}:${type}`]
  }

  private extractResourceIdFilename(source: string): string {
    if (!source) return ""

    try {
      const resourceId = new URL(source, window.location.href).searchParams.get("resourceId")
      return resourceId ? `attachment-${resourceId.slice(0, 12)}` : ""
    } catch {
      return ""
    }
  }

  private extractAssistantPlainText(element: Element): string {
    const contentRoot = this.findAssistantContentRoot(element)
    if (!contentRoot) return ""

    const clone = contentRoot.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.assistantPlainTextDecoration)
      .forEach((node) => node.remove())
    return this.extractTextWithLineBreaks(clone).trim()
  }

  private extractHeadingText(heading: Element): string {
    const clone = heading.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.headingDecoration)
      .forEach((node) => node.remove())
    return this.extractTextWithLineBreaks(clone).trim()
  }

  private findAssistantBodyRoot(element: Element): HTMLElement | null {
    const reasonerBody = this.findFirstAssistantNodeOutsideThoughts(
      element,
      this.config.sitePrivateSelectors.assistantReasonerBody,
    )
    if (reasonerBody) return reasonerBody

    const markdownRoot = this.findAssistantMarkdownRoot(element)
    if (markdownRoot instanceof HTMLElement) return markdownRoot

    const speechText = element.querySelector(
      this.config.sitePrivateSelectors.assistantSpeechText,
    ) as HTMLElement | null
    if (speechText && !this.isThoughtElement(speechText)) {
      return speechText
    }

    const bubbleContent = element.querySelector(
      this.config.sitePrivateSelectors.bubbleContent,
    ) as HTMLElement | null
    if (bubbleContent && !this.isThoughtElement(bubbleContent)) {
      return bubbleContent
    }

    return element instanceof HTMLElement ? element : null
  }

  private shouldIncludeThoughtsInExport(): boolean {
    if (typeof this.exportIncludeThoughtsOverride === "boolean") {
      return this.exportIncludeThoughtsOverride
    }

    return false
  }

  private extractThoughtBlockquotes(element: Element): string[] {
    const nodes = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.thoughtMarkdown),
    ).filter(
      (node) => !node.parentElement?.closest(this.config.sitePrivateSelectors.thoughtMarkdown),
    )
    const blocks: string[] = []

    for (const node of nodes) {
      const clone = node.cloneNode(true) as HTMLElement
      clone
        .querySelectorAll(this.config.sitePrivateSelectors.thoughtDecoration)
        .forEach((child) => child.remove())

      const markdown = (htmlToMarkdown(clone) || this.extractTextWithLineBreaks(clone)).trim()
      if (!markdown) continue

      blocks.push(this.formatAsThoughtBlockquote(markdown))
    }

    return blocks
  }

  private formatAsThoughtBlockquote(markdown: string): string {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n")
    const quotedLines = lines.map((line) => (line.trim().length > 0 ? `> ${line}` : ">"))
    return ["> [Thoughts]", ...quotedLines].join("\n")
  }

  private findFirstAssistantNodeOutsideThoughts(
    element: Element,
    selectors: string[],
  ): HTMLElement | null {
    for (const selector of selectors) {
      if (element.matches(selector) && !this.isThoughtElement(element)) {
        return element as HTMLElement
      }

      const match = Array.from(element.querySelectorAll(selector)).find(
        (node): node is HTMLElement => node instanceof HTMLElement && !this.isThoughtElement(node),
      )
      if (match) return match
    }

    return null
  }

  private isThoughtElement(element: Element): boolean {
    return element.closest(this.config.sitePrivateSelectors.thoughtContainer) !== null
  }

  private findConversationRowById(id: string): HTMLElement | null {
    const items = this.getConversationElements()
    for (const item of items) {
      if (this.extractConversationId(item) === id) {
        return item as HTMLElement
      }
    }

    return null
  }

  private async deleteConversationViaUi(id: string): Promise<boolean> {
    let row = this.findConversationRowById(id)
    if (!row) {
      await this.loadAllConversations()
      row = this.findConversationRowById(id)
    }
    if (!row) return false

    const beforeState = this.captureConversationNavigationState()

    row.scrollIntoView({ block: "center", behavior: "auto" })
    this.revealConversationActions(row)

    let trigger = this.findConversationMenuTrigger(row)
    if (!trigger) return false

    const action = await this.openConversationAction(row, trigger)
    if (!action) return false

    let dialog: HTMLElement | null = action.kind === "dialog" ? action.dialog : null
    if (action.kind === "menu") {
      const deleteItem = await this.waitForDeleteMenuItem(action.menu, 2000)
      if (!deleteItem) {
        document.body.click()
        return false
      }

      this.simulateClick(deleteItem)
      dialog = await this.waitForDialogOpen(1200)
    }

    if (dialog) {
      const confirmButton = await this.waitForDeleteConfirmButton(dialog, 2000)
      if (!confirmButton) return false
      this.simulateClick(confirmButton)
    }

    const deleted = await this.waitForConversationDeleteResult(id, beforeState, 4500)
    if (deleted) return true

    if (dialog) {
      await this.waitForDialogClosed(1200)
      return this.waitForConversationDeleteResult(id, beforeState, 800)
    }

    return false
  }

  private revealConversationActions(row: HTMLElement): void {
    const title = this.findConversationTitleElement(row)
    const targets = [row, title].filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    )

    for (const target of targets) {
      const rect = target.getBoundingClientRect()
      const clientX = rect.left + Math.max(1, Math.min(rect.width / 2, Math.max(rect.width - 1, 1)))
      const clientY =
        rect.top + Math.max(1, Math.min(rect.height / 2, Math.max(rect.height - 1, 1)))
      const commonInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX,
        clientY,
      }

      if (typeof PointerEvent === "function") {
        for (const type of ["pointerenter", "pointerover", "pointermove"]) {
          target.dispatchEvent(
            new PointerEvent(type, {
              ...commonInit,
              pointerId: 1,
              pointerType: "mouse",
              isPrimary: true,
            }),
          )
        }
      }

      for (const type of ["mouseenter", "mouseover", "mousemove"]) {
        target.dispatchEvent(new MouseEvent(type, commonInit))
      }
    }
  }

  private findConversationMenuTrigger(row: HTMLElement): HTMLElement | null {
    return this.getConversationActionCandidates(row)[0] || null
  }

  private getConversationActionCandidates(
    row: HTMLElement,
    preferredTrigger?: HTMLElement | null,
  ): HTMLElement[] {
    const candidates = Array.from(
      row.querySelectorAll(this.config.sitePrivateSelectors.conversationMenuTrigger),
    )
    const scoredCandidates: Array<{ element: HTMLElement; score: number }> = []
    const seen = new Set<HTMLElement>()

    const pushCandidate = (candidate: HTMLElement | null, bonus = 0) => {
      if (!(candidate instanceof HTMLElement) || seen.has(candidate)) return
      seen.add(candidate)

      const score = this.getConversationActionScore(candidate)
      if (!Number.isFinite(score)) return

      scoredCandidates.push({ element: candidate, score: score + bonus })
    }

    pushCandidate(preferredTrigger, 25)

    for (const candidate of candidates) {
      pushCandidate(candidate as HTMLElement)
    }

    scoredCandidates.sort((left, right) => right.score - left.score)
    return scoredCandidates.map(({ element }) => element)
  }

  private getConversationActionScore(candidate: HTMLElement): number {
    const titleSelector = this.config.conversation.titleSelector
    if (titleSelector && candidate.closest(titleSelector)) {
      return Number.NEGATIVE_INFINITY
    }
    if (candidate.closest(this.config.sitePrivateSelectors.conversationActionExclusion)) {
      return Number.NEGATIVE_INFINITY
    }
    if (candidate.matches("input, label")) return Number.NEGATIVE_INFINITY

    const signal = this.getConversationActionSignal(candidate)
    const style = window.getComputedStyle(candidate)
    let score = 0

    if (candidate.matches('[aria-haspopup="menu"], [aria-haspopup="listbox"]')) score += 120
    if (/(ellipsis|more[_-]?vert|icon-more|icon-menu|menu)/i.test(signal)) score += 70
    if (/(delete|删除)/i.test(signal)) score += 45
    if (/(action|operate|dropdown|popup)/i.test(signal)) score += 15
    if (candidate.matches("button, [role='button']")) score += 10
    if (candidate.querySelector(this.config.sitePrivateSelectors.conversationActionIcon)) {
      score += 5
    }
    if (style.pointerEvents !== "none") score += 5
    if (this.isVisibleElement(candidate)) score += 30

    return score
  }

  private async openConversationAction(
    row: HTMLElement,
    initialTrigger: HTMLElement,
  ): Promise<{ kind: "menu"; menu: HTMLElement } | { kind: "dialog"; dialog: HTMLElement } | null> {
    let trigger: HTMLElement | null = initialTrigger

    for (let attempt = 0; attempt < 4; attempt += 1) {
      document.body.click()
      await this.sleep(80)

      this.revealConversationActions(row)
      const candidates = this.getConversationActionCandidates(row, trigger)
      if (candidates.length === 0) return null

      trigger = candidates[0] || null
      for (const candidate of candidates) {
        if (!candidate.isConnected) continue

        this.simulateClick(candidate)
        const opened = await this.waitForConversationActionOpen(candidate, 1000)
        if (opened) return opened
      }
    }

    return null
  }

  private async waitForConversationActionOpen(
    trigger: HTMLElement,
    timeout: number,
  ): Promise<{ kind: "menu"; menu: HTMLElement } | { kind: "dialog"; dialog: HTMLElement } | null> {
    const start = Date.now()

    while (Date.now() - start < timeout) {
      const dialog = this.findVisibleDialog()
      if (dialog) {
        return { kind: "dialog", dialog }
      }

      const menu = this.findVisibleMenu(trigger)
      if (menu) {
        return { kind: "menu", menu }
      }

      await this.sleep(80)
    }

    return null
  }

  private findVisibleMenu(trigger?: HTMLElement | null): HTMLElement | null {
    const controlledId =
      trigger?.getAttribute("aria-controls") || trigger?.getAttribute("aria-owns")
    if (controlledId) {
      const controlled = document.getElementById(controlledId)
      if (
        controlled instanceof HTMLElement &&
        this.isVisibleElement(controlled) &&
        this.isDropdownMenuContainer(controlled)
      ) {
        return controlled
      }
    }

    const menus = Array.from(
      document.querySelectorAll(this.config.sitePrivateSelectors.dropdownMenu),
    ).filter(
      (menu): menu is HTMLElement =>
        menu instanceof HTMLElement &&
        this.isVisibleElement(menu) &&
        this.isDropdownMenuContainer(menu),
    )
    if (menus.length > 0) {
      return menus[menus.length - 1]
    }

    return null
  }

  private isDropdownMenuContainer(element: HTMLElement): boolean {
    if (element.matches(this.config.sitePrivateSelectors.dropdownItem)) return true
    return !!element.querySelector(this.config.sitePrivateSelectors.dropdownItem)
  }

  private async waitForDeleteMenuItem(
    menu: HTMLElement,
    timeout: number,
  ): Promise<HTMLElement | null> {
    const start = Date.now()

    while (Date.now() - start < timeout) {
      const items = Array.from(
        menu.querySelectorAll(this.config.sitePrivateSelectors.dropdownItem),
      ).filter(
        (item): item is HTMLElement => item instanceof HTMLElement && this.isVisibleElement(item),
      )

      const themedDelete =
        items.find((item) => item.className.includes("theme-error")) ||
        items.find((item) => DELETE_TEXT_PATTERN.test(this.getElementText(item)))
      if (themedDelete) {
        return themedDelete
      }

      await this.sleep(80)
    }

    return null
  }

  private async waitForDialogOpen(timeout: number): Promise<HTMLElement | null> {
    const start = Date.now()

    while (Date.now() - start < timeout) {
      const dialog = this.findVisibleDialog()
      if (dialog) return dialog

      await this.sleep(80)
    }

    return null
  }

  private findVisibleDialog(): HTMLElement | null {
    return (
      Array.from(document.querySelectorAll(this.config.sitePrivateSelectors.dialog)).find(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && this.isVisibleElement(element),
      ) || null
    )
  }

  private async waitForDeleteConfirmButton(
    dialog: HTMLElement,
    timeout: number,
  ): Promise<HTMLElement | null> {
    const start = Date.now()

    while (Date.now() - start < timeout) {
      const buttons = Array.from(
        dialog.querySelectorAll(this.config.sitePrivateSelectors.dialogButton),
      ).filter(
        (button): button is HTMLElement =>
          button instanceof HTMLElement && this.isVisibleElement(button),
      )

      const matched =
        buttons.find((button) => {
          const text = this.getElementText(button)
          return CONFIRM_TEXT_PATTERN.test(text) && !CANCEL_TEXT_PATTERN.test(text)
        }) || buttons.find((button) => /primary|danger/i.test(button.className))

      if (matched) return matched

      await this.sleep(80)
    }

    return null
  }

  private async waitForDialogClosed(timeout: number): Promise<boolean> {
    const start = Date.now()

    while (Date.now() - start < timeout) {
      const dialog = Array.from(
        document.querySelectorAll(this.config.sitePrivateSelectors.dialog),
      ).find((element) => element instanceof HTMLElement && this.isVisibleElement(element))
      if (!dialog) return true

      await this.sleep(80)
    }

    return false
  }

  private async waitForConversationDeleteResult(
    id: string,
    beforeState: { href: string; sessionId: string; isNewConversation: boolean },
    timeout: number,
  ): Promise<boolean> {
    const start = Date.now()
    const deletingCurrentConversation = beforeState.sessionId === id

    while (Date.now() - start < timeout) {
      if (!this.findConversationRowById(id)) {
        return true
      }

      if (deletingCurrentConversation && this.hasConversationNavigationChanged(beforeState)) {
        return true
      }

      await this.sleep(100)
    }

    return false
  }

  private getElementText(element: Element): string {
    return (element.textContent || (element as HTMLElement).innerText || "").trim()
  }

  private getConversationActionSignal(element: HTMLElement): string {
    return [
      element.className || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.getAttribute("data-desc") || "",
      element.getAttribute("data-testid") || "",
      element.getAttribute("data-test-id") || "",
      element.textContent || "",
    ]
      .join(" ")
      .toLowerCase()
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  private findStopButton(): HTMLElement | null {
    for (const selector of this.config.generating.existsSelectors) {
      const candidates = Array.from(document.querySelectorAll(selector))
      for (const candidate of candidates) {
        const button = candidate as HTMLElement
        if (!this.isVisibleElement(button)) continue
        if (this.isStopLikeButton(button)) return button
      }
    }
    return null
  }

  private isDisabledActionButton(button: HTMLElement | null): boolean {
    if (!(button instanceof HTMLElement)) return true
    const className = typeof button.className === "string" ? button.className : ""
    return (
      button.hasAttribute("disabled") ||
      button.getAttribute("aria-disabled") === "true" ||
      /disabled/i.test(className)
    )
  }

  private isStopLikeButton(button: HTMLElement | null): boolean {
    if (!(button instanceof HTMLElement)) return false
    if (button.querySelector(this.config.sitePrivateSelectors.sendIcon)) return false
    if (button.querySelector(this.config.sitePrivateSelectors.stopIcon)) return true

    const text = button.innerText?.trim() || button.textContent?.trim() || ""
    return /停止|stop/i.test(text)
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

  private truncateText(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  }
}
