/**
 * Kimi 适配器（www.kimi.com）
 *
 * 选择器策略：
 * - 优先使用语义化 class（如 .chat-info-item、.chat-input-editor、.segment-assistant）
 * - 避免依赖 data-v-* 等构建时生成属性
 */
import { SITE_IDS } from "~constants"
import { kimiNativeThemeCss } from "~styles/native-theme-adapters/kimi"
import {
  formatExportFileAttachments,
  formatExportImageMarkdown,
  isDownloadableExportAssetUrl,
  normalizeExportAssetUrl,
  type ExportAssetCollector,
} from "~utils/export-assets"
import { htmlToMarkdown, type ExportBundle, type ExportMessage } from "~utils/exporter"
import { t } from "~utils/i18n"

import {
  SiteAdapter,
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type ExportLifecycleContext,
  type MarkdownFixerConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type PanelAvoidanceConfig,
  type SiteDeleteConversationResult,
} from "./base"
import type { BuiltinSiteConfig } from "./declarative"
import { KIMI_CONFIG, KIMI_CONFIG_VERSION, type KimiSiteConfig } from "./kimi-config"

const CHAT_PATH_PATTERN = /^\/chat\/([a-z0-9-]+)(?:\/|$)/i
const SHARE_PATH_PATTERN = /^\/(?:share|kimiplus)\/([a-z0-9-]+)(?:\/|$)/i
const NON_CHAT_PATH_PREFIXES = ["/docs/", "/website/", "/table/"]
const TOKEN_STORAGE_PREFIX = "__tea_cache_tokens_"
const KIMI_DELETE_API_PATH = "/apiv2/kimi.chat.v1.ChatService/DeleteChat"
const KIMI_AUTH_COOKIE_KEY = "kimi-auth"
const KIMI_AUTH_STORAGE_KEYS = [
  KIMI_AUTH_COOKIE_KEY,
  "kimi_auth",
  "access_token",
  "accessToken",
  "token",
  "auth",
  "authorization",
]
const KIMI_TOKEN_FIELD_KEYS = [
  "value",
  "token",
  "access_token",
  "accessToken",
  "auth",
  "authorization",
  "id_token",
  "idToken",
  "jwt",
]
const JWT_TOKEN_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const TOKEN_KEYWORD_REGEX = /(token|auth|jwt|tea)/i

const THEME_STORAGE_KEY = "CUSTOM_THEME"
const FULL_LIST_SNAPSHOT_TTL_MS = 15_000
const FULL_LIST_SNAPSHOT_MAX_USES = 6
const KIMI_DELETE_REASON = {
  MISSING_AUTH_TOKEN: "delete_api_missing_auth_token",
  API_REQUEST_FAILED: "delete_api_request_failed",
  API_INVALID_RESPONSE: "delete_api_invalid_response",
  API_BUSINESS_FAILED: "delete_api_business_failed",
} as const

export class KimiAdapter extends SiteAdapter {
  private config: KimiSiteConfig = KIMI_CONFIG
  private deleteReloadScheduled = false
  private loggedMissingDeleteToken = false
  private fullListSnapshot: ConversationInfo[] = []
  private fullListSnapshotExpiresAt = 0
  private fullListSnapshotUsesLeft = 0
  private exportIncludeThoughts: boolean | undefined = undefined

  match(): boolean {
    const matched = window.location.hostname === "www.kimi.com"
    if (matched) {
      this.normalizeThemeStorageValue()
    }
    return matched
  }

  getSiteId(): string {
    return SITE_IDS.KIMI
  }

  getName(): string {
    return "Kimi"
  }

  getBuiltinConfig(): KimiSiteConfig {
    return KIMI_CONFIG
  }

  getBuiltinConfigVersion(): number {
    return KIMI_CONFIG_VERSION
  }

  applyMergedConfig(config: BuiltinSiteConfig): void {
    this.config = config as KimiSiteConfig
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#7C3AED", secondary: "#6D28D9" }
  }

  getNativeThemeCss(): string | null {
    return kimiNativeThemeCss
  }

  supportsFormulaCopy(): boolean {
    return false
  }

  getNewTabUrl(): string {
    return "https://www.kimi.com/"
  }

  getSessionId(): string {
    const path = window.location.pathname
    if (path === "/chat/history" || path.startsWith("/chat/history/")) {
      return ""
    }
    const normalized = path.endsWith("/") ? path : `${path}/`
    if (NON_CHAT_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
      return ""
    }

    const chatMatch = path.match(CHAT_PATH_PATTERN)
    if (chatMatch?.[1]) {
      return chatMatch[1]
    }

    const shareMatch = path.match(SHARE_PATH_PATTERN)
    return shareMatch?.[1] || ""
  }

  isNewConversation(): boolean {
    const path = window.location.pathname
    return (
      path === "/" || path === "" || path === "/chat/history" || path.startsWith("/chat/history/")
    )
  }

  isSharePage(): boolean {
    // 自有会话：/chat/ID    分享会话：/share/ID 或 /kimiplus/ID
    return (
      window.location.pathname.startsWith("/share/") ||
      window.location.pathname.startsWith("/kimiplus/")
    )
  }

  getSessionName(): string | null {
    const conversationTitle = this.getConversationTitle()
    if (conversationTitle) return conversationTitle

    const title = this.getDocumentConversationTitle() || ""
    if (!title || title === "Kimi") return null

    // 自有页格式："Title - Kimi"    分享页格式："Kimi | Title"
    const normalized = title
      .replace(/^Kimi\s*\|\s*/i, "")
      .replace(/\s*-\s*Kimi$/i, "")
      .trim()
    return normalized || null
  }

  getCurrentCid(): string | null {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || !key.startsWith(TOKEN_STORAGE_PREFIX)) continue

        const raw = localStorage.getItem(key)
        if (!raw) continue

        const parsed = JSON.parse(raw) as Record<string, unknown>
        const uid = parsed.user_unique_id
        if (typeof uid === "string" && uid.trim()) {
          return uid.trim()
        }
      }
    } catch {
      // ignore malformed storage data
    }

    return null
  }

  getConversationList(): ConversationInfo[] {
    const domList = this.collectConversationListFromDom()
    const snapshot = this.getFreshFullListSnapshot()

    if (domList.length === 0) {
      return snapshot
    }

    if (snapshot.length === 0 || snapshot.length <= domList.length) {
      return domList
    }

    this.fullListSnapshotUsesLeft = Math.max(0, this.fullListSnapshotUsesLeft - 1)
    return this.mergeConversationInfos(domList, snapshot)
  }

  private collectConversationListFromDom(): ConversationInfo[] {
    const links = this.getConversationItems()
    if (links.length === 0) return []

    const cid = this.getCurrentCid() || undefined
    const list: ConversationInfo[] = []

    links.forEach((el) => {
      const info = this.extractConversationInfo(el, cid)
      if (!info) return

      list.push(info)
    })

    return this.mergeConversationInfos(list)
  }

  getConversationObserverConfig(): ConversationObserverConfig {
    const titleSelector = this.config.conversation.titleSelector
    return {
      selector: this.config.conversation.itemSelector,
      shadow: this.config.conversation.shadow ?? false,
      extractInfo: (el) => this.extractConversationInfo(el, this.getCurrentCid() || undefined),
      getTitleElement: (el) =>
        titleSelector
          ? el.matches(titleSelector)
            ? el
            : el.querySelector(titleSelector) || el
          : el,
    }
  }

  getSidebarScrollContainer(): Element | null {
    const candidates = this.config.sitePrivateSelectors.historyScrollCandidates
      .map((selector) => document.querySelector(selector))
      .filter(Boolean) as Element[]

    for (const candidate of candidates) {
      const scrollable = this.findScrollableParent(candidate)
      if (scrollable) return scrollable
      if (candidate instanceof HTMLElement && candidate.scrollHeight > candidate.clientHeight) {
        return candidate
      }
      if (candidate.matches(this.config.sitePrivateSelectors.nextSidebarBody)) return candidate
    }

    return null
  }

  async loadAllConversations(): Promise<void> {
    await this.openMoreHistoryView()

    try {
      let lastCount = 0
      let stableRounds = 0
      const maxStableRounds = 4

      while (stableRounds < maxStableRounds) {
        const container = this.getSidebarScrollContainer() as HTMLElement | null
        if (!container) return

        container.scrollTop = container.scrollHeight
        container.dispatchEvent(new Event("scroll", { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 500))

        const count = this.getConversationItems().length
        if (count === lastCount) {
          stableRounds++
        } else {
          lastCount = count
          stableRounds = 0
        }
      }

      this.cacheFullListSnapshot(this.collectConversationListFromDom())
    } finally {
      await this.closeMoreHistoryView()
    }
  }

  async deleteConversationOnSite(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    const token = this.getAuthToken()
    if (!token) {
      this.logMissingDeleteTokenOnce()
      return {
        id: target.id,
        success: false,
        method: "api",
        reason: KIMI_DELETE_REASON.MISSING_AUTH_TOKEN,
      }
    }

    const currentSessionId = this.getSessionId()
    const result = await this.deleteConversationViaApi(target, token)

    if (result.success && target.id === currentSessionId) {
      this.navigateToHomeAfterDelete()
    }

    return result
  }

  async deleteConversationsOnSite(
    targets: ConversationDeleteTarget[],
  ): Promise<SiteDeleteConversationResult[]> {
    if (targets.length === 0) return []

    const token = this.getAuthToken()
    if (!token) {
      this.logMissingDeleteTokenOnce()
      return targets.map((target) => ({
        id: target.id,
        success: false,
        method: "api",
        reason: KIMI_DELETE_REASON.MISSING_AUTH_TOKEN,
      }))
    }

    const currentSessionId = this.getSessionId()
    const results: SiteDeleteConversationResult[] = []
    const deletedIds: string[] = []

    for (const target of targets) {
      const result = await this.deleteConversationViaApi(target, token)
      results.push(result)
      if (result.success) {
        deletedIds.push(target.id)
      }
    }

    if (deletedIds.length > 0) {
      const deletedCurrent = currentSessionId && deletedIds.includes(currentSessionId)
      if (deletedCurrent) {
        this.navigateToHomeAfterDelete()
      } else {
        this.scheduleReloadAfterBatchDelete()
      }
    }

    return results
  }

  navigateToConversation(id: string, url?: string): boolean {
    const targetUrl = this.buildConversationUrl(id, url)
    if ((this.config.conversation.navigationStrategy ?? "click-item") === "location") {
      return super.navigateToConversation(id, targetUrl)
    }

    const link = this.findConversationLinkById(id)
    if (link) {
      const beforeSessionId = this.getSessionId()
      link.click()

      window.setTimeout(() => {
        if (this.getSessionId() !== id && this.getSessionId() === beforeSessionId) {
          this.navigateToKimiConversationRoute(targetUrl)
        }
      }, 120)
      return true
    }

    if (this.navigateToKimiConversationRoute(targetUrl)) {
      return true
    }

    return super.navigateToConversation(id, targetUrl)
  }

  getConversationTitle(): string | null {
    const headerTitle = document
      .querySelector(this.config.sitePrivateSelectors.conversationHeaderTitle)
      ?.textContent?.trim()
    if (headerTitle) return headerTitle

    const activeLink = this.getActiveConversationLink()
    if (activeLink) {
      const title = this.extractConversationTitle(activeLink)
      if (title) return title
    }

    const sessionId = this.getSessionId()
    if (sessionId) {
      const currentLink = this.findConversationLinkById(sessionId)
      if (currentLink) {
        const title = this.extractConversationTitle(currentLink)
        if (title) return title
      }
    }

    return null
  }

  getTextareaSelectors(): string[] {
    return [...this.config.selectors.textarea]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (element.offsetParent === null) return false
    if (!element.isContentEditable) return false
    if (element.closest(".gh-main-panel") || element.closest(".gh-queue-panel")) return false
    return !!element.closest(this.config.sitePrivateSelectors.inputScope)
  }

  getSubmitKeyConfig(): { key: "Enter" | "Ctrl+Enter" } {
    return { key: this.config.input.submitKey ?? "Enter" }
  }

  insertPrompt(content: string): boolean {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return false

    editor.focus()
    if (document.activeElement !== editor && !editor.contains(document.activeElement)) {
      return false
    }

    const insertedByExec = this.insertByExecCommand(editor, content)
    if (insertedByExec) return true

    const insertedByPaste = this.insertByPasteEvent(editor, content)
    if (insertedByPaste) return true

    editor.textContent = content
    editor.dispatchEvent(new Event("input", { bubbles: true }))
    editor.dispatchEvent(new Event("change", { bubbles: true }))
    return true
  }

  clearTextarea(): void {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return

    const isEmpty = () => {
      const text = (editor.textContent || "").replace(/[\u200b\u00a0]/g, "").trim()
      return text.length === 0
    }

    const selectAll = () => {
      this.selectEditorAll(editor)
      try {
        document.dispatchEvent(new Event("selectionchange"))
      } catch {
        // ignore selectionchange failure
      }
    }

    const dispatchBeforeInput = (inputType: InputEvent["inputType"]) => {
      try {
        editor.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            composed: true,
            cancelable: true,
            inputType,
          }),
        )
      } catch {
        // ignore beforeinput failure
      }
    }

    const dispatchInput = (inputType: InputEvent["inputType"]) => {
      try {
        editor.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            composed: true,
            inputType,
          }),
        )
      } catch {
        editor.dispatchEvent(new Event("input", { bubbles: true }))
      }
    }

    const dispatchKey = (key: string, code: string, keyCode: number) => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code,
          keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      )
      editor.dispatchEvent(
        new KeyboardEvent("keyup", {
          key,
          code,
          keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      )
    }

    const deleteByRange = () => {
      try {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return
        const range = selection.getRangeAt(0)
        range.deleteContents()
      } catch {
        // ignore range delete failure
      }
    }

    const performClear = () => {
      if (!editor.isConnected) return

      editor.focus()
      selectAll()
      dispatchBeforeInput("deleteContentBackward")

      try {
        document.execCommand("delete", false, undefined)
      } catch {
        // ignore execCommand delete failure
      }

      if (!isEmpty()) {
        try {
          document.execCommand("insertText", false, "")
        } catch {
          // ignore execCommand insertText failure
        }
      }

      if (!isEmpty()) {
        dispatchKey("Backspace", "Backspace", 8)
      }

      if (!isEmpty()) {
        dispatchBeforeInput("deleteContentForward")
        dispatchKey("Delete", "Delete", 46)
      }

      if (!isEmpty()) {
        deleteByRange()
      }

      if (!isEmpty()) {
        const clearedByExec = this.clearByExecCommand(editor)
        if (!clearedByExec || !isEmpty()) {
          // Lexical editor fallback: keep an empty paragraph node so host app state can reconcile.
          editor.innerHTML = "<p><br></p>"
        }
      }

      dispatchInput("deleteContentBackward")
      editor.dispatchEvent(new Event("change", { bubbles: true }))
    }

    performClear()

    // Lexical 状态可能异步回写，做少量重试确保清空
    const retryDelays = [30, 120, 240]
    retryDelays.forEach((delay) => {
      setTimeout(() => {
        if (!editor.isConnected) return
        if (!isEmpty()) {
          performClear()
        }
      }, delay)
    })
  }

  getSubmitButtonSelectors(): string[] {
    return [...this.config.selectors.submitButton]
  }

  findSubmitButton(editor: HTMLElement | null): HTMLElement | null {
    const scopes = [
      editor?.closest(this.config.sitePrivateSelectors.editorScope),
      editor?.closest(this.config.sitePrivateSelectors.inputScope),
      editor?.parentElement,
      document.body,
    ].filter(Boolean) as ParentNode[]

    const seen = new Set<HTMLElement>()
    for (const scope of scopes) {
      const buttons = scope.querySelectorAll(this.config.sitePrivateSelectors.submitButtonContainer)
      for (const btn of Array.from(buttons)) {
        const button = btn as HTMLElement
        if (seen.has(button)) continue
        seen.add(button)
        if (button.offsetParent === null) continue
        if (button.matches(this.config.sitePrivateSelectors.submitButtonDisabled)) continue
        return button
      }
    }

    return null
  }

  getScrollContainer(): HTMLElement | null {
    const shareDetail = document.querySelector(
      this.config.sitePrivateSelectors.shareScrollContainer,
    ) as HTMLElement | null
    if (shareDetail && shareDetail.scrollHeight > shareDetail.clientHeight) {
      return shareDetail
    }

    const detail = document.querySelector(
      this.config.sitePrivateSelectors.chatDetailScrollContainer,
    ) as HTMLElement | null
    if (detail && detail.scrollHeight > detail.clientHeight) {
      return detail
    }

    const content = document.querySelector(this.config.sitePrivateSelectors.chatContentContainer)
    const scrollable = this.findScrollableParent(content)
    if (scrollable && !scrollable.closest(this.config.sitePrivateSelectors.historyContainer)) {
      return scrollable
    }

    return super.getScrollContainer()
  }

  getResponseContainerSelector(): string {
    return this.config.selectors.responseContainer
  }

  getChatContentSelectors(): string[] {
    return [...this.config.selectors.chatContent]
  }

  getUserQuerySelector(): string {
    return this.config.selectors.userQuery
  }

  extractUserQueryText(element: Element): string {
    const contentBox = element.querySelector(this.config.sitePrivateSelectors.userContentBox)
    return this.extractTextWithLineBreaks(contentBox || element).trim()
  }

  extractUserQueryMarkdown(element: Element): string {
    return this.extractUserQueryText(element)
  }

  extractUserQueryExportContent(element: Element): string {
    return this.extractKimiUserQueryExportContent(element)
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    if (element.querySelector(".gh-user-query-markdown")) {
      return false
    }

    const contentBox = element.querySelector(
      this.config.sitePrivateSelectors.userContentBox,
    ) as HTMLElement | null
    if (!contentBox) return false

    const rendered = document.createElement("div")
    rendered.className = `${contentBox.className} gh-user-query-markdown gh-markdown-preview`.trim()
    rendered.innerHTML = html

    const inlineStyle = contentBox.getAttribute("style")
    if (inlineStyle) {
      rendered.setAttribute("style", inlineStyle)
    }

    contentBox.style.display = "none"
    contentBox.after(rendered)
    return true
  }

  extractAssistantResponseText(element: Element): string {
    const clone = element.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.exportDecoration)
      .forEach((node) => node.remove())

    const includeThoughts = this.shouldIncludeThoughtsInExport()
    const thoughtBlocks = includeThoughts ? this.extractThoughtBlockquotes(clone) : []

    clone
      .querySelectorAll(this.config.sitePrivateSelectors.toolcallContainer)
      .forEach((node) => node.remove())

    const bodyRoot = this.findAssistantBodyMarkdownRoot(clone)
    if (!bodyRoot) {
      if (thoughtBlocks.length > 0) return thoughtBlocks.join("\n\n")
      return ""
    }

    const content = (htmlToMarkdown(bodyRoot) || this.extractTextWithLineBreaks(bodyRoot)).trim()
    if (thoughtBlocks.length > 0) {
      const thoughtSection = thoughtBlocks.join("\n\n")
      return content ? `${thoughtSection}\n\n${content}` : thoughtSection
    }
    return content
  }

  getLatestReplyText(): string | null {
    const replies = document.querySelectorAll(
      this.config.sitePrivateSelectors.assistantBodyMarkdown,
    )
    if (replies.length === 0) return null
    const last = replies[replies.length - 1]
    const text = this.extractAssistantResponseText(last)
    return text || null
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const container = document.querySelector(this.config.selectors.responseContainer)
    if (!container) return []

    const outline: OutlineItem[] = []
    const items = this.getChatItems(container)

    items.forEach((item, itemIndex) => {
      const isUserItem =
        item.matches(this.config.sitePrivateSelectors.userItem) ||
        item.matches(this.config.selectors.userQuery) ||
        item.querySelector(this.config.selectors.userQuery)

      if (isUserItem) {
        if (!includeUserQueries) return

        const userRoot = item.querySelector(this.config.selectors.userQuery) || item
        const text = this.extractUserQueryMarkdown(userRoot)
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          const nextAssistantMarkdown = this.findNextAssistantMarkdown(items, itemIndex)
          wordCount = nextAssistantMarkdown?.textContent?.trim().length || 0
        }

        outline.push({
          level: 0,
          text: text.length > 80 ? `${text.slice(0, 80)}...` : text,
          element: userRoot,
          isUserQuery: true,
          isTruncated: text.length > 80,
          wordCount,
        })
        return
      }

      if (
        !item.matches(this.config.sitePrivateSelectors.assistantItem) &&
        !item.matches(this.config.selectors.assistantResponse) &&
        !item.querySelector(this.config.sitePrivateSelectors.assistantBodyMarkdown)
      ) {
        return
      }

      const markdown = this.findAssistantBodyMarkdownRoot(item)
      if (!markdown) return

      const headings = Array.from(markdown.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      headings.forEach((heading, headingIndex) => {
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

    return outline
  }

  getExportConfig(): ExportConfig {
    return { ...this.config.export }
  }

  async extractExportMessages(_context: ExportLifecycleContext): Promise<ExportMessage[] | null> {
    const messages = this.extractKimiExportMessages()
    return messages.length > 0 ? messages : null
  }

  async extractExportBundle(_context: ExportLifecycleContext): Promise<ExportBundle | null> {
    return this.createExportBundleFromMessages((collector) =>
      this.extractKimiExportMessages(collector),
    )
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
    for (const selector of this.config.generating.existsSelectors) {
      const targets = document.querySelectorAll(selector)
      for (const target of Array.from(targets)) {
        const visibleTarget =
          target.closest(this.config.sitePrivateSelectors.submitButtonContainer) || target
        if (visibleTarget instanceof HTMLElement && visibleTarget.offsetParent !== null) return true
      }
    }

    return false
  }

  getStopButtonSelectors(): string[] {
    return [...this.config.selectors.stopButton]
  }

  getModelName(): string | null {
    const el = document.querySelector(this.config.sitePrivateSelectors.modelName)
    return el?.textContent?.trim() || null
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

  async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
    try {
      const storageValue = JSON.stringify(targetMode)
      localStorage.setItem(THEME_STORAGE_KEY, storageValue)

      const html = document.documentElement
      html.classList.remove("light", "dark")
      html.classList.add(targetMode)

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_STORAGE_KEY,
          newValue: storageValue,
          storageArea: localStorage,
        }),
      )
      return true
    } catch (error) {
      console.error("[KimiAdapter] toggleTheme error:", error)
      return false
    }
  }

  getNewChatButtonSelectors(): string[] {
    return [...this.config.selectors.newChatButton]
  }

  getWidthSelectors() {
    return this.config.widthSelectors.map((selector) => ({ ...selector }))
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    return {
      scopeSelector: this.config.sitePrivateSelectors.chatLayoutScope,
      widthSelectors: [
        {
          selector: this.config.sitePrivateSelectors.chatContentContainer,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: this.config.sitePrivateSelectors.chatListWidth,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: this.config.sitePrivateSelectors.chatActionContainer,
          property: "max-width",
          extraCss: "width: 100% !important;",
        },
        {
          selector: this.config.sitePrivateSelectors.chatEditor,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
      ],
      insetSelectors: [
        {
          selector: this.config.sitePrivateSelectors.chatDetailMain,
          extraCss: "box-sizing: border-box;",
        },
        {
          selector: this.config.sitePrivateSelectors.newChatLayoutScope,
          insetMode: "edge",
          extraCss: "box-sizing: border-box;",
        },
      ],
      defaultWidth: "800px",
      gap: 16,
    }
  }

  getUserQueryWidthSelectors(): Array<{
    selector: string
    property: string
    value?: string
    extraCss?: string
    noCenter?: boolean
  }> {
    const alignRightCss = "margin-left: auto !important; margin-right: 0 !important;"
    const wrapperCss = [
      alignRightCss,
      "max-width: 100% !important;",
      "box-sizing: border-box !important;",
    ].join(" ")
    const contentBoxCss = [
      "max-width: 100% !important;",
      "margin-left: 0 !important;",
      "margin-right: 0 !important;",
      "box-sizing: border-box !important;",
    ].join(" ")
    const contentCss = [
      "max-width: 100% !important;",
      "box-sizing: border-box !important;",
      "overflow-wrap: anywhere !important;",
    ].join(" ")

    return [
      {
        selector: this.config.sitePrivateSelectors.userQueryWrapper,
        property: "width",
        extraCss: wrapperCss,
        noCenter: true,
      },
      {
        selector: this.config.sitePrivateSelectors.userContent,
        property: "width",
        value: "100%",
        extraCss: contentBoxCss,
        noCenter: true,
      },
      {
        selector: this.config.sitePrivateSelectors.userQueryContent,
        property: "width",
        value: "100%",
        extraCss: contentCss,
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

  getMarkdownFixerConfig(): MarkdownFixerConfig {
    return {
      selector: this.config.sitePrivateSelectors.markdownFixerParagraph,
      fixSpanContent: false,
      shouldSkip: (element: HTMLElement) => {
        if (!this.isGenerating()) return false

        const currentAssistant = element.closest(this.config.selectors.assistantResponse)
        if (!currentAssistant) return false

        const allAssistants = document.querySelectorAll(
          this.config.sitePrivateSelectors.lastAssistant,
        )
        const lastAssistant = allAssistants[allAssistants.length - 1]
        return currentAssistant === lastAssistant
      },
    }
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

  private normalizeThemeStorageValue(): void {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (!raw) return

    const trimmed = raw.trim()
    if (!trimmed) return

    if (trimmed === "light" || trimmed === "dark") {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(trimmed))
      return
    }

    try {
      const parsed = JSON.parse(trimmed)
      if (parsed === "light" || parsed === "dark") {
        return
      }
    } catch {
      // keep unknown payload untouched
    }
  }

  private async deleteConversationViaApi(
    target: ConversationDeleteTarget,
    token: string,
  ): Promise<SiteDeleteConversationResult> {
    try {
      const deleteUrl = new URL(KIMI_DELETE_API_PATH, window.location.origin).toString()
      const response = await fetch(deleteUrl, {
        method: "POST",
        headers: this.buildDeleteHeaders(token),
        body: JSON.stringify({ chat_id: target.id }),
        credentials: "include",
      })

      if (!response.ok) {
        return {
          id: target.id,
          success: false,
          method: "api",
          reason: this.toDeleteApiHttpReason(response.status),
        }
      }

      const payload = await this.safeParseJson(response)
      if (this.isDeleteSuccessPayload(payload, target.id)) {
        return {
          id: target.id,
          success: true,
          method: "api",
        }
      }

      return {
        id: target.id,
        success: false,
        method: "api",
        reason: this.toDeleteApiPayloadReason(payload),
      }
    } catch {
      return {
        id: target.id,
        success: false,
        method: "api",
        reason: KIMI_DELETE_REASON.API_REQUEST_FAILED,
      }
    }
  }

  private buildDeleteHeaders(token: string): Record<string, string> {
    const payload = this.parseJwtPayload(token)
    const language = this.getClientLanguage()
    const timezone = this.getClientTimezone()

    const headers: Record<string, string> = {
      accept: "*/*",
      authorization: `Bearer ${token}`,
      "connect-protocol-version": "1",
      "content-type": "application/json",
      "x-language": language,
      "r-timezone": timezone,
      "x-msh-platform": "web",
      "x-msh-version": "1.0.0",
    }

    const deviceId = typeof payload.device_id === "string" ? payload.device_id.trim() : ""
    const sessionId = typeof payload.ssid === "string" ? payload.ssid.trim() : ""
    const trafficId = typeof payload.sub === "string" ? payload.sub.trim() : ""

    if (deviceId) headers["x-msh-device-id"] = deviceId
    if (sessionId) headers["x-msh-session-id"] = sessionId
    if (trafficId) headers["x-traffic-id"] = trafficId

    return headers
  }

  private getAuthToken(): string | null {
    const fromCookie = this.getCookieToken(KIMI_AUTH_COOKIE_KEY)
    if (fromCookie) return fromCookie

    const fromLocalStorage = this.findAuthTokenInStorage(localStorage)
    if (fromLocalStorage) return fromLocalStorage

    try {
      const fromSessionStorage = this.findAuthTokenInStorage(sessionStorage)
      if (fromSessionStorage) return fromSessionStorage
    } catch {
      // ignore unavailable sessionStorage
    }

    return null
  }

  private getCookieToken(key: string): string | null {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`))
    if (!match?.[1]) return null

    return this.extractTokenFromRaw(match[1])
  }

  private findAuthTokenInStorage(storage: Storage): string | null {
    for (const key of KIMI_AUTH_STORAGE_KEYS) {
      const value = storage.getItem(key)
      const token = this.extractTokenFromRaw(value)
      if (token) return token
    }

    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key || !key.startsWith(TOKEN_STORAGE_PREFIX)) continue
      const token = this.extractTokenFromRaw(storage.getItem(key))
      if (token) return token
    }

    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key || !TOKEN_KEYWORD_REGEX.test(key)) continue
      const token = this.extractTokenFromRaw(storage.getItem(key))
      if (token) return token
    }

    return null
  }

  private extractTokenFromRaw(raw: string | null): string | null {
    if (!raw) return null

    const direct = this.extractTokenFromText(raw)
    if (direct) return direct

    const decoded = this.safeDecodeURIComponent(raw)
    if (decoded !== raw) {
      const fromDecoded = this.extractTokenFromText(decoded)
      if (fromDecoded) return fromDecoded
    }

    const parsed = this.safeParseUnknown(raw)
    if (parsed !== undefined) {
      const fromParsed = this.findTokenInUnknown(parsed, 0)
      if (fromParsed) return fromParsed
    }

    if (decoded !== raw) {
      const parsedDecoded = this.safeParseUnknown(decoded)
      if (parsedDecoded !== undefined) {
        const fromParsedDecoded = this.findTokenInUnknown(parsedDecoded, 0)
        if (fromParsedDecoded) return fromParsedDecoded
      }
    }

    return null
  }

  private extractTokenFromText(text: string): string | null {
    const normalized = this.normalizeAuthToken(text)
    if (normalized) return normalized

    const match = text.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)
    if (!match?.[0]) return null
    return this.normalizeAuthToken(match[0])
  }

  private normalizeAuthToken(raw: string): string | null {
    let token = raw.trim()
    if (!token) return null

    token = token.replace(/^"(.*)"$/, "$1").trim()
    token = token.replace(/^Bearer\s+/i, "").trim()

    return JWT_TOKEN_REGEX.test(token) ? token : null
  }

  private safeDecodeURIComponent(value: string): string {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  private safeParseUnknown(raw: string): unknown | undefined {
    try {
      return JSON.parse(raw)
    } catch {
      return undefined
    }
  }

  private findTokenInUnknown(
    value: unknown,
    depth: number,
    seen: WeakSet<object> = new WeakSet<object>(),
  ): string | null {
    if (depth > 6 || value == null) return null

    if (typeof value === "string") {
      return this.extractTokenFromRaw(value)
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const token = this.findTokenInUnknown(item, depth + 1, seen)
        if (token) return token
      }
      return null
    }

    if (typeof value !== "object") return null
    if (seen.has(value as object)) return null
    seen.add(value as object)

    const record = value as Record<string, unknown>

    for (const key of KIMI_TOKEN_FIELD_KEYS) {
      if (!(key in record)) continue
      const token = this.findTokenInUnknown(record[key], depth + 1, seen)
      if (token) return token
    }

    for (const [key, nested] of Object.entries(record)) {
      if (
        KIMI_TOKEN_FIELD_KEYS.includes(key) ||
        (depth > 0 && !TOKEN_KEYWORD_REGEX.test(key) && typeof nested !== "object")
      ) {
        continue
      }
      const token = this.findTokenInUnknown(nested, depth + 1, seen)
      if (token) return token
    }

    return null
  }

  private logMissingDeleteTokenOnce() {
    if (this.loggedMissingDeleteToken) return
    this.loggedMissingDeleteToken = true
    console.warn("[KimiAdapter] DeleteChat skipped: auth token not found in cookie/storage.")
  }

  private parseJwtPayload(token: string): Record<string, unknown> {
    try {
      const parts = token.split(".")
      if (parts.length < 2) return {}

      const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/")
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
      const decoded = atob(padded)
      const parsed = JSON.parse(decoded)
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  private getClientLanguage(): string {
    return document.documentElement.lang || navigator.language || "en-US"
  }

  private getClientTimezone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    } catch {
      return "UTC"
    }
  }

  private isDeleteSuccessPayload(payload: unknown, targetId: string): boolean {
    if (!payload || typeof payload !== "object") return false

    const data = payload as Record<string, unknown>
    const chatId = data.chatId
    const altChatId = data.chat_id
    return chatId === targetId || altChatId === targetId
  }

  private toDeleteApiPayloadReason(payload: unknown): string {
    if (!payload || typeof payload !== "object") {
      return KIMI_DELETE_REASON.API_INVALID_RESPONSE
    }

    const data = payload as Record<string, unknown>
    const message =
      (typeof data.message === "string" && data.message.trim()) ||
      (typeof data.msg === "string" && data.msg.trim()) ||
      (typeof data.error === "string" && data.error.trim()) ||
      ""
    if (message) {
      return `${KIMI_DELETE_REASON.API_BUSINESS_FAILED}:${message}`
    }

    return KIMI_DELETE_REASON.API_BUSINESS_FAILED
  }

  private toDeleteApiHttpReason(status: number): string {
    switch (status) {
      case 401:
      case 403:
        return "delete_api_unauthorized"
      case 404:
        return "delete_api_not_found"
      case 429:
        return "delete_api_rate_limited"
      default:
        return `delete_api_http_${status || 0}`
    }
  }

  private async safeParseJson(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch {
      return null
    }
  }

  private scheduleReloadAfterBatchDelete() {
    if (this.deleteReloadScheduled) return
    this.deleteReloadScheduled = true
    window.setTimeout(() => {
      window.location.reload()
    }, 120)
  }

  private navigateToHomeAfterDelete() {
    const currentPath = window.location.pathname
    if (currentPath === "/" || currentPath === "") {
      this.scheduleReloadAfterBatchDelete()
      return
    }

    window.location.href = this.getNewTabUrl()
  }

  private extractConversationInfo(el: Element, cid?: string): ConversationInfo | null {
    const source = el.getAttribute(this.config.conversation.idFrom.attr ?? "href") || ""
    const id = this.extractConversationIdFromHref(source)
    if (!id) return null

    const title = this.extractConversationTitle(el)
    const isActive =
      id === this.getSessionId() ||
      (this.config.conversation.activeMatch
        ? el.matches(this.config.conversation.activeMatch)
        : false)
    const isPinned = !!el.querySelector(this.config.sitePrivateSelectors.pinnedConversation)
    const conversationPath = this.config.conversation.urlTemplate
      .split("{id}")
      .join(encodeURIComponent(id))

    return {
      id,
      cid,
      title,
      url: new URL(conversationPath, window.location.origin).toString(),
      isActive,
      isPinned,
    }
  }

  private extractConversationTitle(el: Element): string {
    const title = this.config.conversation.titleSelector
      ? (el.matches(this.config.conversation.titleSelector)
          ? el
          : el.querySelector(this.config.conversation.titleSelector)
        )?.textContent?.trim() || ""
      : el.textContent?.trim() || ""
    if (title) return title

    const fallback = el.textContent?.replace(/\s+/g, " ").trim() || ""
    return fallback.length > 120 ? `${fallback.slice(0, 120)}...` : fallback
  }

  private extractConversationIdFromHref(href: string): string | null {
    if (!href) return null

    const pattern = new RegExp(this.config.conversation.idFrom.regex, "i")
    const directMatch = href.match(pattern)
    if (directMatch?.[1]) return directMatch[1]

    try {
      const url = new URL(href, window.location.origin)
      const match = url.pathname.match(pattern)
      return match ? match[1] : null
    } catch {
      return null
    }
  }

  private buildConversationUrl(id: string, url?: string): string {
    if (url) {
      try {
        const target = new URL(url, window.location.origin)
        if (this.extractConversationIdFromHref(target.href) === id) {
          if (!target.search) {
            target.searchParams.set("chat_enter_method", "history")
          }
          return target.toString()
        }
      } catch {
        // fallback to canonical Kimi chat URL below
      }
    }

    const conversationPath = this.config.conversation.urlTemplate
      .split("{id}")
      .join(encodeURIComponent(id))
    const target = new URL(conversationPath, window.location.origin)
    target.searchParams.set("chat_enter_method", "history")
    return target.toString()
  }

  private findConversationLinkById(id: string): HTMLElement | null {
    const links = this.getConversationItems()

    for (const link of Array.from(links)) {
      const source = link.getAttribute(this.config.conversation.idFrom.attr ?? "href") || ""
      if (this.extractConversationIdFromHref(source) === id) {
        return link as HTMLElement
      }
    }

    return null
  }

  private navigateToKimiConversationRoute(url: string): boolean {
    let target: URL
    try {
      target = new URL(url, window.location.origin)
    } catch {
      return false
    }

    if (target.origin !== window.location.origin) return false
    if (!this.extractConversationIdFromHref(target.href)) return false

    const targetPath = `${target.pathname}${target.search}${target.hash}`
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (targetPath === currentPath) return true

    try {
      window.history.pushState(window.history.state, "", targetPath)
      const event =
        typeof PopStateEvent === "function"
          ? new PopStateEvent("popstate", { state: window.history.state })
          : new Event("popstate")
      window.dispatchEvent(event)
      return true
    } catch {
      return false
    }
  }

  private findScrollableParent(element: Element | null): HTMLElement | null {
    let current = element as HTMLElement | null
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current)
      if (
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        current.scrollHeight > current.clientHeight
      ) {
        return current
      }
      current = current.parentElement
    }
    return null
  }

  private getActiveConversationLink(): Element | null {
    if (this.config.conversation.shadow && this.config.conversation.activeMatch) {
      const activeMatch = this.config.conversation.activeMatch
      return this.getConversationItems().find((item) => item.matches(activeMatch)) || null
    }

    const activeLink = document.querySelector(this.config.sitePrivateSelectors.activeConversation)
    if (activeLink) return activeLink

    if (window.location.pathname === "/" || window.location.pathname === "") return null

    const sessionId = this.getSessionId()
    return sessionId ? this.findConversationLinkById(sessionId) : null
  }

  private isHistoryPath(pathname = window.location.pathname): boolean {
    return pathname === "/chat/history" || pathname.startsWith("/chat/history/")
  }

  private getConversationItems(): Element[] {
    return this.config.conversation.shadow
      ? this.findAllElementsBySelector(this.config.conversation.itemSelector)
      : Array.from(document.querySelectorAll(this.config.conversation.itemSelector))
  }

  private async openMoreHistoryView(): Promise<void> {
    if (this.isHistoryPath()) return

    const moreHistoryLink = document.querySelector(
      this.config.sitePrivateSelectors.moreHistoryLink,
    ) as HTMLElement | null
    if (!moreHistoryLink) return

    const beforePath = window.location.pathname
    const beforeCount = document.querySelectorAll(
      this.config.sitePrivateSelectors.sidebarConversation,
    ).length

    moreHistoryLink.click()

    const timeoutAt = Date.now() + 3000
    while (Date.now() < timeoutAt) {
      const currentPath = window.location.pathname
      const currentCount = document.querySelectorAll(
        this.config.sitePrivateSelectors.sidebarConversation,
      ).length
      if (currentPath !== beforePath || currentCount > beforeCount) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
  }

  private async closeMoreHistoryView(): Promise<void> {
    if (!this.isHistoryPath()) return

    const closeTarget = document.querySelector(
      this.config.sitePrivateSelectors.closeHistory,
    ) as HTMLElement | null
    if (!closeTarget) return

    const clickable =
      (closeTarget.closest(
        this.config.sitePrivateSelectors.closeButtonContainer,
      ) as HTMLElement | null) || closeTarget

    this.simulateClick(clickable)
    if (await this.waitForHistoryClosed(900)) return

    // fallback: some runtimes only react to native click
    clickable.click()
    if (await this.waitForHistoryClosed(1200)) return

    // last fallback: force browser history back once
    try {
      window.history.back()
    } catch {
      // ignore and return
    }
    await this.waitForHistoryClosed(1500)
  }

  private async waitForHistoryClosed(timeoutMs: number): Promise<boolean> {
    const timeoutAt = Date.now() + timeoutMs
    while (Date.now() < timeoutAt) {
      if (!this.isHistoryPath()) return true
      await new Promise((resolve) => setTimeout(resolve, 80))
    }
    return !this.isHistoryPath()
  }

  private cacheFullListSnapshot(list: ConversationInfo[]): void {
    if (!list.length) return
    this.fullListSnapshot = list.map((item) => ({ ...item }))
    this.fullListSnapshotExpiresAt = Date.now() + FULL_LIST_SNAPSHOT_TTL_MS
    this.fullListSnapshotUsesLeft = FULL_LIST_SNAPSHOT_MAX_USES
  }

  private getFreshFullListSnapshot(): ConversationInfo[] {
    if (!this.fullListSnapshot.length) return []

    const expired = Date.now() > this.fullListSnapshotExpiresAt
    const depleted = this.fullListSnapshotUsesLeft <= 0
    if (expired || depleted) {
      this.fullListSnapshot = []
      this.fullListSnapshotExpiresAt = 0
      this.fullListSnapshotUsesLeft = 0
      return []
    }

    return this.fullListSnapshot.map((item) => ({ ...item }))
  }

  private mergeConversationInfos(...sources: ConversationInfo[][]): ConversationInfo[] {
    const map = new Map<string, ConversationInfo>()

    sources.forEach((source) => {
      source.forEach((info) => {
        const existing = map.get(info.id)
        if (!existing) {
          map.set(info.id, info)
          return
        }

        map.set(info.id, {
          ...existing,
          title: existing.title || info.title,
          isActive: existing.isActive || info.isActive,
          isPinned: existing.isPinned || info.isPinned,
        })
      })
    })

    return Array.from(map.values())
  }

  private selectEditorAll(editor: HTMLElement): void {
    const selection = window.getSelection()
    if (!selection) return

    const range = document.createRange()
    range.selectNodeContents(editor)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  private insertByExecCommand(editor: HTMLElement, content: string): boolean {
    try {
      this.selectEditorAll(editor)
      const inserted = document.execCommand("insertText", false, content)
      if (inserted) return true
    } catch {
      // ignore and fallback
    }
    return false
  }

  private insertByPasteEvent(editor: HTMLElement, content: string): boolean {
    try {
      if (typeof DataTransfer === "undefined") return false

      const before = editor.textContent || ""
      const dataTransfer = new DataTransfer()
      dataTransfer.setData("text/plain", content)

      const notCanceled = editor.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dataTransfer,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      )
      if (!notCanceled) return true

      const after = editor.textContent || ""
      return after !== before || content.length === 0
    } catch {
      return false
    }
  }

  private clearByExecCommand(editor: HTMLElement): boolean {
    try {
      this.selectEditorAll(editor)
      return document.execCommand("delete", false, undefined)
    } catch {
      return false
    }
  }

  private extractKimiExportMessages(collector?: ExportAssetCollector): ExportMessage[] {
    const container = document.querySelector(this.config.selectors.responseContainer)
    if (!container) return []

    const messages: ExportMessage[] = []
    const items = this.getChatItems(container)

    for (const item of items) {
      const userRoot = this.findKimiUserMessageRoot(item)
      if (userRoot) {
        const content = this.extractKimiUserQueryExportContent(userRoot, collector).trim()
        if (content) {
          messages.push({ role: "user", content })
        }
        continue
      }

      const assistantRoot = this.findKimiAssistantMessageRoot(item)
      if (assistantRoot) {
        const content = this.extractAssistantResponseText(assistantRoot).trim()
        if (content) {
          messages.push({ role: "assistant", content })
        }
      }
    }

    return messages
  }

  private findKimiUserMessageRoot(element: Element): Element | null {
    if (element.matches(this.config.selectors.userQuery)) return element
    return element.querySelector(this.config.selectors.userQuery)
  }

  private findKimiAssistantMessageRoot(element: Element): Element | null {
    if (element.matches(this.config.selectors.assistantResponse)) return element
    const segment = element.querySelector(this.config.selectors.assistantResponse)
    if (segment) return segment

    const markdown = this.findAssistantBodyMarkdownRoot(element)
    return markdown?.closest(this.config.selectors.assistantResponse) || null
  }

  private extractKimiUserQueryExportContent(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    const imageMarkdown = this.extractKimiUserImageMarkdown(element, collector)
    const fileMarkdown = this.extractKimiUserFileMarkdown(element, collector)
    const body = this.extractKimiUserBodyMarkdown(element)

    if (imageMarkdown.length === 0 && fileMarkdown.length === 0) {
      return body
    }

    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, body].filter(Boolean).join("\n\n")
  }

  private extractKimiUserBodyMarkdown(element: Element): string {
    const clone = element.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.userAttachmentList)
      .forEach((node) => node.remove())
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.exportDecoration)
      .forEach((node) => node.remove())

    const contentBox = clone.querySelector(this.config.sitePrivateSelectors.userContentBox)
    return this.extractTextWithLineBreaks(contentBox || clone).trim()
  }

  private extractKimiUserImageMarkdown(
    element: Element,
    collector?: ExportAssetCollector,
  ): string[] {
    const images = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.userAttachmentImage),
    ).filter((node): node is HTMLImageElement => node instanceof HTMLImageElement)
    const seenSources = new Set<string>()
    const imageMarkdown: string[] = []

    for (const image of images) {
      const source = this.getKimiImageExportSource(image)
      if (!source || seenSources.has(source)) continue

      seenSources.add(source)
      const alt = this.extractKimiImageAlt(image, source)
      const markdown = formatExportImageMarkdown({ source, alt, extensionHint: alt }, collector, {
        siteId: this.getSiteId(),
        role: "user",
        category: "image",
        fallbackAlt: "uploaded image",
      })

      if (markdown) imageMarkdown.push(markdown)
    }

    return imageMarkdown
  }

  private getKimiImageExportSource(image: HTMLImageElement): string {
    const candidates = [image.currentSrc || "", image.src || "", image.getAttribute("src") || ""]

    for (const candidate of candidates) {
      const source = normalizeExportAssetUrl(candidate)
      if (!source) continue
      if (source.startsWith("data:image/svg+xml")) continue
      if (isDownloadableExportAssetUrl(source)) return source
    }

    return ""
  }

  private extractKimiImageAlt(image: HTMLImageElement, source: string): string {
    const candidates = [
      image.alt || "",
      image.getAttribute("title") || "",
      image.getAttribute("aria-label") || "",
      this.extractKimiFilenameFromUrl(source),
      "uploaded image",
    ]

    return (
      candidates.map((value) => value.replace(/\s+/g, " ").trim()).find(Boolean) || "uploaded image"
    )
  }

  private extractKimiUserFileMarkdown(
    element: Element,
    collector?: ExportAssetCollector,
  ): string[] {
    const cards = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.userFileCard),
    )
    const seenFiles = new Set<string>()
    const fileMarkdown: string[] = []

    for (const card of cards) {
      const name = this.extractKimiFileName(card)
      if (!name) continue

      const type = this.extractKimiFileType(card)
      const size = this.extractKimiFileSize(card)
      const label = this.formatKimiFileLabel(name, type, size)
      const href = this.extractKimiFileHref(card)
      const markdown = formatExportFileAttachments(
        [{ kind: "file", name, source: href, type, sizeLabel: size }],
        collector,
        {
          siteId: this.getSiteId(),
          getLabel: () => label,
        },
      )[0]

      if (seenFiles.has(markdown)) continue

      seenFiles.add(markdown)
      fileMarkdown.push(markdown)
    }

    return fileMarkdown
  }

  private extractKimiFileName(card: Element): string {
    const candidates = [
      card.querySelector(this.config.sitePrivateSelectors.userFileName)?.textContent || "",
      card.getAttribute("download") || "",
      card.getAttribute("title") || "",
      card.getAttribute("aria-label") || "",
      card.textContent || "",
    ]
      .map((value) => value.replace(/\s+/g, " ").trim())
      .filter(Boolean)

    const filename = candidates.find((value) => /[^/\\]+\.[A-Za-z0-9]{1,10}(\s|$)/.test(value))
    if (filename) {
      return filename.match(/[^/\\]+?\.[A-Za-z0-9]{1,10}/)?.[0] || ""
    }

    return candidates[0] || ""
  }

  private extractKimiFileType(card: Element): string {
    return (
      card
        .querySelector(this.config.sitePrivateSelectors.userFileType)
        ?.textContent?.replace(/\s+/g, " ")
        .trim() || ""
    )
  }

  private extractKimiFileSize(card: Element): string {
    return (
      card
        .querySelector(this.config.sitePrivateSelectors.userFileSize)
        ?.textContent?.replace(/\s+/g, " ")
        .trim() || ""
    )
  }

  private formatKimiFileLabel(name: string, type: string, size: string): string {
    const details = [type && !this.fileNameEndsWithExtension(name, type) ? type : "", size].filter(
      Boolean,
    )

    return details.length > 0 ? `${name} (${details.join(", ")})` : name
  }

  private fileNameEndsWithExtension(name: string, extension: string): boolean {
    const normalizedExtension = extension.toLowerCase().replace(/^\./, "").trim()
    if (!normalizedExtension) return false
    return name.toLowerCase().endsWith(`.${normalizedExtension}`)
  }

  private extractKimiFileHref(card: Element): string {
    const links = Array.from(card.querySelectorAll(this.config.sitePrivateSelectors.fileLink))
    const parentLink = card.closest(this.config.sitePrivateSelectors.fileLink)
    if (parentLink) links.unshift(parentLink)

    for (const link of links) {
      if (!(link instanceof HTMLAnchorElement)) continue
      const href = normalizeExportAssetUrl(link.getAttribute("href") || link.href || "")
      if (isDownloadableExportAssetUrl(href)) return href
    }

    return ""
  }

  private extractKimiFilenameFromUrl(value: string): string {
    try {
      const url = new URL(value, window.location.href)
      const filename = url.searchParams.get("filename")
      if (filename?.trim()) return filename.trim()

      const pathname = decodeURIComponent(url.pathname)
      return pathname.split("/").pop()?.trim() || ""
    } catch {
      return ""
    }
  }

  private shouldIncludeThoughtsInExport(): boolean {
    if (this.exportIncludeThoughts !== undefined) {
      return this.exportIncludeThoughts
    }
    return false
  }

  private findAssistantBodyMarkdownRoot(element: Element): Element | null {
    if (
      element.matches(this.config.sitePrivateSelectors.markdown) &&
      !this.isInsideAssistantToolcall(element)
    ) {
      return element
    }

    const directBody = element.querySelector(this.config.sitePrivateSelectors.assistantBodyMarkdown)
    if (directBody && !this.isInsideAssistantToolcall(directBody)) {
      return directBody
    }

    return (
      Array.from(element.querySelectorAll(this.config.sitePrivateSelectors.markdown)).find(
        (markdown) => !this.isInsideAssistantToolcall(markdown),
      ) || null
    )
  }

  private isInsideAssistantToolcall(element: Element): boolean {
    return (
      element.closest(this.config.sitePrivateSelectors.toolcallContainer) !== null ||
      element.closest(this.config.sitePrivateSelectors.toolcallContentMarkdown) !== null
    )
  }

  private extractThoughtBlockquotes(element: Element): string[] {
    const thoughtNodes = this.collectTopLevelBlocks(
      Array.from(element.querySelectorAll(this.config.sitePrivateSelectors.thinkingContainer)),
    )
    const blocks: string[] = []

    for (const thought of thoughtNodes) {
      const clone = thought.cloneNode(true) as HTMLElement
      clone
        .querySelectorAll(this.config.sitePrivateSelectors.exportDecoration)
        .forEach((node) => node.remove())

      const contentMarkdowns = Array.from(
        clone.querySelectorAll(this.config.sitePrivateSelectors.markdown),
      )
      const content =
        contentMarkdowns.length > 0
          ? contentMarkdowns
              .map(
                (markdown) => htmlToMarkdown(markdown) || this.extractTextWithLineBreaks(markdown),
              )
              .join("\n\n")
          : htmlToMarkdown(clone) || this.extractTextWithLineBreaks(clone)

      const normalized = content.trim()
      if (!normalized) continue

      blocks.push(this.formatAsThoughtBlockquote(normalized))
    }

    return blocks
  }

  private formatAsThoughtBlockquote(markdown: string): string {
    const lines = markdown
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
    const quotedLines = lines.map((line) => (line.trim().length > 0 ? `> ${line}` : ">"))
    return ["> [Thoughts]", ...quotedLines].join("\n")
  }

  private collectTopLevelBlocks(blocks: Element[]): Element[] {
    if (blocks.length <= 1) return blocks
    return blocks.filter(
      (block) => !blocks.some((other) => other !== block && other.contains(block)),
    )
  }

  private getChatItems(container: Element): Element[] {
    const directItems = Array.from(
      container.querySelectorAll(this.config.sitePrivateSelectors.chatItem),
    ).filter((item) => !item.parentElement?.closest(this.config.sitePrivateSelectors.chatItem))
    if (directItems.length > 0) return directItems

    return Array.from(container.children).filter(
      (child) =>
        child.matches(this.config.sitePrivateSelectors.userItem) ||
        child.matches(this.config.sitePrivateSelectors.assistantItem) ||
        child.matches(this.config.selectors.userQuery) ||
        child.matches(this.config.selectors.assistantResponse) ||
        child.querySelector(this.config.selectors.userQuery) !== null ||
        child.querySelector(this.config.sitePrivateSelectors.assistantBodyMarkdown) !== null,
    )
  }

  private findNextAssistantMarkdown(items: Element[], fromIndex: number): Element | null {
    for (let i = fromIndex + 1; i < items.length; i++) {
      const markdown = this.findAssistantBodyMarkdownRoot(items[i])
      if (markdown) return markdown
    }
    return null
  }
}
