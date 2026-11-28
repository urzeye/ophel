/**
 * Kimi 适配器（www.kimi.com / www.kimi.ai 国际版）
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
  CONVERSATION_LIST_READY_TIMEOUT_MS,
  loadConversationList,
  waitForConversationLoad,
} from "~utils/conversation-list-loader"

import {
  SiteAdapter,
  type AnchorData,
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationLoadOptions,
  type ConversationObserverConfig,
  type ExportConfig,
  type ExportLifecycleContext,
  type TableCopyTarget,
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
// 裸域名均 302 到 www 子域，content script 注入链路也只匹配 www，无需覆盖裸域名
const KIMI_HOSTS = new Set(["www.kimi.com", "www.kimi.ai"])

const THEME_STORAGE_KEY = "CUSTOM_THEME"
const FULL_LIST_SNAPSHOT_TTL_MS = 15_000
const FULL_LIST_SNAPSHOT_MAX_USES = 6
// Lexical 按内部选区处理编辑事件，DOM 全选后需派发 selectionchange 并让出
// 事件循环等待选区同步，否则操作作用于过期光标（追加而非替换、删除落空）
const KIMI_SELECTION_SYNC_MS = 60

/**
 * 归一化编辑器渲染文本：去零宽字符、折叠普通空白但保留换行、容忍连续空行差异。
 * 必须保留换行——Lexical 对多行 execCommand("insertText") 会吃掉换行但保留字符，
 * 若连同换行一起归一化掉，会把换行丢失的残缺的中间结果误判为插入成功。
 */
const normalizeEditorContent = (text: string): string =>
  text
    .replace(new RegExp("[\\u200B-\\u200D\\uFEFF]", "g"), "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim()

const KIMI_DELETE_REASON = {
  MISSING_AUTH_TOKEN: "delete_api_missing_auth_token",
  API_REQUEST_FAILED: "delete_api_request_failed",
  API_INVALID_RESPONSE: "delete_api_invalid_response",
  API_BUSINESS_FAILED: "delete_api_business_failed",
} as const

export class KimiAdapter extends SiteAdapter {
  protected config: KimiSiteConfig = KIMI_CONFIG
  private deleteReloadScheduled = false
  private loggedMissingDeleteToken = false
  private fullListSnapshot: ConversationInfo[] = []
  private fullListSnapshotExpiresAt = 0
  private fullListSnapshotUsesLeft = 0
  private exportIncludeThoughts: boolean | undefined = undefined

  match(): boolean {
    const matched = KIMI_HOSTS.has(window.location.hostname)
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
    return `${window.location.origin}/`
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
    // 自有对话：/chat/ID    分享对话：/share/ID 或 /kimiplus/ID
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

  getCurrentCid(): string | undefined {
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

    return undefined
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

  async loadAllConversations(options: ConversationLoadOptions = {}): Promise<boolean> {
    const wasHistoryOpen = this.isHistoryPath()
    const originalUrl = window.location.href
    try {
      if (!(await this.openMoreHistoryView(options))) return false
      const complete = await loadConversationList({
        ...options,
        getContainer: () => this.getSidebarScrollContainer(),
        readList: () => this.collectConversationListFromDom(),
        idleMs: 2000,
        onProgress: (items) => {
          this.cacheFullListSnapshot(items)
          options.onProgress?.(items)
        },
      })
      return complete
    } finally {
      // 中止（停止/超时）时同样回退临时路由，避免把用户留在历史页；
      // 已中止则跳过 onNavigation 通知（manager 侧会拒收）
      if (!wasHistoryOpen && this.isHistoryPath()) {
        if (!options.signal?.aborted) options.onNavigation?.(originalUrl)
        await this.closeMoreHistoryView()
      }
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
    if (this.navigateViaHistory(targetUrl)) return true
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

  async insertPrompt(content: string): Promise<boolean> {
    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return false

    editor.focus()
    if (document.activeElement !== editor && !editor.contains(document.activeElement)) {
      return false
    }

    // 实测 Kimi（Lexical）：execCommand("insertText") 会吃掉多行换行且模型提交
    // 异步；合成 paste 事件被正常处理、换行完整保留，优先使用。每种方式都要
    // 验证真实内容；验证失败必须清场再试下一种，否则残留会和新内容叠加。
    const attempts: Array<() => boolean | Promise<boolean>> = [
      () => this.insertByPasteEvent(editor, content),
      () => this.insertBySyntheticBeforeInput(editor, content),
      () => this.insertByExecCommand(editor, content),
    ]
    for (const attempt of attempts) {
      if (!(await attempt())) continue
      if (await this.waitForEditorContent(editor, content)) return true
      if (!(await this.resetEditorIfDirty(editor))) return false
    }

    // 最后兜底：直写 DOM 只有内容不被框架模型还原时才算成功
    editor.textContent = content
    editor.dispatchEvent(new Event("input", { bubbles: true }))
    editor.dispatchEvent(new Event("change", { bubbles: true }))
    return this.waitForEditorContent(editor, content)
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
    const candidates = [
      ...this.collectScrollCandidates(this.config.sitePrivateSelectors.shareScrollContainer),
      ...this.collectScrollCandidates(this.config.sitePrivateSelectors.chatDetailScrollContainer),
    ]

    // 优先匹配真正可垂直滚动且当前已溢出的容器，避免命中 overflow: visible 的外层包装
    const overflowed = candidates.find(
      (candidate) =>
        this.isScrollableOverflowY(candidate) && candidate.scrollHeight > candidate.clientHeight,
    )
    if (overflowed) {
      return overflowed
    }

    const content = document.querySelector(this.config.sitePrivateSelectors.chatContentContainer)
    const scrollable = this.findScrollableParent(content)
    if (scrollable && !scrollable.closest(this.config.sitePrivateSelectors.historyContainer)) {
      return scrollable
    }

    // 短对话尚未溢出时返回已挂载的可滚动容器，确保大纲与阅读历史正确绑定 scroll 监听
    const readyContainer = candidates.find((candidate) => this.isScrollableOverflowY(candidate))
    if (readyContainer) {
      return readyContainer
    }

    return super.getScrollContainer()
  }

  /**
   * 直接滚动 Kimi 对话滚动容器（如 .chat-detail-main），避免默认 scrollIntoView
   * 连带滚动外层同样设置 overflow-y: auto 的 .app.has-sidebar .main。
   */
  scrollToOutlineTarget(element: HTMLElement): void {
    const container = this.getScrollContainer()
    if (!container || !container.contains(element)) {
      super.scrollToOutlineTarget(element)
      return
    }

    const targetScrollTop = this.getRelativeTop(container, element)
    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: "instant",
      __bypassLock: true,
    } as ScrollToOptions & { __bypassLock: true })
  }

  /**
   * Kimi 消息内部的 .segment-content 为 position: relative，导致内容块 offsetTop 恒为 0。
   * 覆写为基于容器坐标计算可见锚点，修复阅读历史记录与恢复错位。
   */
  getVisibleAnchorElement(): AnchorData | null {
    const container = this.getScrollContainer()
    if (!container) return null

    const candidates = this.getChatContentCandidates(container)
    if (candidates.length === 0) return null

    const scrollTop = container.scrollTop
    let bestElement: HTMLElement | null = null
    let bestTop = Number.NEGATIVE_INFINITY

    for (const element of candidates) {
      const top = this.getRelativeTop(container, element)
      if (top <= scrollTop + 100 && top > bestTop) {
        bestElement = element
        bestTop = top
      }
    }

    if (!bestElement) {
      bestElement = candidates[0]
      bestTop = this.getRelativeTop(container, bestElement)
    }

    const offset = scrollTop - bestTop
    const id = bestElement.getAttribute("data-message-id") || bestElement.id
    if (id) {
      let selector = `[data-message-id="${id}"]`
      if (!bestElement.matches(selector)) selector = `#${id}`
      return { type: "selector", selector, offset }
    }

    const index = candidates.indexOf(bestElement)
    if (index === -1) return null

    const textSignature = (bestElement.textContent || "").trim().substring(0, 50)
    return { type: "index", index, offset, textSignature }
  }

  restoreScroll(anchorData: AnchorData): boolean {
    const container = this.getScrollContainer()
    if (!container || !anchorData) return false

    let targetElement: HTMLElement | null = null

    if (anchorData.type === "selector" && anchorData.selector) {
      targetElement = container.querySelector(anchorData.selector) as HTMLElement | null
    } else if (anchorData.type === "index" && typeof anchorData.index === "number") {
      const candidates = this.getChatContentCandidates(container)
      if (candidates[anchorData.index]) {
        targetElement = candidates[anchorData.index]
        if (anchorData.textSignature) {
          const currentText = (targetElement.textContent || "").trim().substring(0, 50)
          if (currentText !== anchorData.textSignature) {
            targetElement =
              candidates.find(
                (candidate) =>
                  (candidate.textContent || "").trim().substring(0, 50) ===
                  anchorData.textSignature,
              ) || targetElement
          }
        }
      } else if (anchorData.textSignature) {
        targetElement =
          candidates.find(
            (candidate) =>
              (candidate.textContent || "").trim().substring(0, 50) === anchorData.textSignature,
          ) || null
      }
    }

    if (!targetElement) return false

    const targetTop = this.getRelativeTop(container, targetElement) + (anchorData.offset || 0)
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "instant",
      __bypassLock: true,
    } as ScrollToOptions & { __bypassLock: true })
    return true
  }

  /**
   * extractOutline 对超过 80 字符的用户提问会拼接 "..."，基类 startsWith 校验会因此失败；
   * 归一化空白并剥离末尾省略号后再匹配，保证 DOM 刷新后长提问仍可准确重定位。
   */
  findUserQueryElement(queryIndex: number, text: string): Element | null {
    const selector = this.getUserQuerySelector()
    if (!selector) return null

    const elements = Array.from(document.querySelectorAll(selector))
    if (elements.length === 0) return null

    if (queryIndex > 0 && elements.length >= queryIndex) {
      const candidate = elements[queryIndex - 1]
      if (!text) return candidate
      if (this.isEquivalentUserQueryText(this.extractUserQueryText(candidate), text)) {
        return candidate
      }
    }

    if (!text) return null
    return (
      elements.find((element) =>
        this.isEquivalentUserQueryText(this.extractUserQueryText(element), text),
      ) || null
    )
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
    const source = this.findOriginalUserQueryContent(element) || element
    if (!source.querySelector(".gh-user-query-markdown")) {
      return this.extractTextWithLineBreaks(source).trim()
    }

    const clone = source.cloneNode(true) as HTMLElement
    clone.querySelectorAll(".gh-user-query-markdown").forEach((node) => node.remove())
    return this.extractTextWithLineBreaks(clone).trim()
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

    // 优先替换气泡载体 .user-content 以保留新版 toolcall-rollup 包裹下的背景与圆角样式
    const contentBox = this.findOriginalUserQueryContent(element) as HTMLElement | null
    if (!contentBox) return false

    const rendered = document.createElement("div")
    rendered.className = `${contentBox.className} gh-user-query-markdown gh-markdown-preview`.trim()
    for (const attr of Array.from(contentBox.attributes)) {
      if (attr.name.startsWith("data-v-")) {
        rendered.setAttribute(attr.name, attr.value)
      }
    }
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

    this.normalizeKimiExportContent(clone)

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

  private normalizeKimiExportContent(root: HTMLElement): void {
    for (const container of root.querySelectorAll(".table.markdown-table")) {
      const headerTable = container.querySelector("table.header-table")
      const body = container.querySelector("table.body-table > tbody")
      if (!headerTable?.querySelector("thead") || !body) continue

      const bodyTable = body.parentElement!
      headerTable.append(body)
      bodyTable.remove()
    }

    for (const paragraph of root.querySelectorAll("div.paragraph")) {
      const normalized = root.ownerDocument.createElement("p")
      for (const child of Array.from(paragraph.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          child.textContent = (child.textContent || "").replace(/[ \t]*\r?\n[ \t]*/g, "\n\n")
        }
        normalized.append(child)
      }
      paragraph.replaceWith(normalized)
    }
  }

  getTableCopyTarget(table: HTMLTableElement): TableCopyTarget | null {
    if (!table.matches(".header-table, .body-table")) return null

    const container = table.closest<HTMLElement>(".table.markdown-table")
    if (!container) return null

    return {
      container,
      getRows: () => [
        ...container.querySelectorAll<HTMLTableRowElement>("table.header-table > thead > tr"),
        ...container.querySelectorAll<HTMLTableRowElement>("table.body-table > tbody > tr"),
      ],
    }
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
    const wrapperCss = [alignRightCss, "box-sizing: border-box !important;"].join(" ")
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
        property: "max-width",
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
    const { hide, preserveFlow, rootClass, styles } = this.config.cleanMode
    return {
      ...(hide ? { hide: [...hide] } : {}),
      ...(preserveFlow ? { preserveFlow: [...preserveFlow] } : {}),
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
        : false) ||
      el.closest(".next-sidebar-history-item.is-active") !== null
    const pinnedSelector = this.config.sitePrivateSelectors.pinnedConversation
    const isPinned = !!(el.querySelector(pinnedSelector) || el.closest(pinnedSelector))
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

  private isScrollableOverflowY(element: HTMLElement): boolean {
    const overflowY = window.getComputedStyle(element).overflowY
    return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay"
  }

  private collectScrollCandidates(selectorList: string): HTMLElement[] {
    const results: HTMLElement[] = []
    const seen = new Set<HTMLElement>()
    const selectors = selectorList
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)

    // 按配置顺序收集候选，避免复合选择器按文档前序优先返回外层非滚动祖先
    for (const selector of selectors) {
      for (const node of Array.from(document.querySelectorAll(selector))) {
        if (!(node instanceof HTMLElement) || seen.has(node)) continue
        if (node.clientHeight <= 0) continue
        if (node.closest(this.config.sitePrivateSelectors.historyContainer)) continue
        seen.add(node)
        results.push(node)
      }
    }

    return results
  }

  private getRelativeTop(container: HTMLElement, element: HTMLElement): number {
    return (
      container.scrollTop +
      (element.getBoundingClientRect().top - container.getBoundingClientRect().top)
    )
  }

  private getChatContentCandidates(container: HTMLElement): HTMLElement[] {
    const selectors = this.getChatContentSelectors()
    if (selectors.length === 0) return []

    return Array.from(container.querySelectorAll(selectors.join(", "))).filter(
      (node): node is HTMLElement => {
        if (!(node instanceof HTMLElement)) return false
        const rect = node.getBoundingClientRect()
        return rect.height > 0 || rect.width > 0
      },
    )
  }

  private normalizeUserQueryMatchText(text: string): string {
    return text
      .replace(/\s+/g, " ")
      .trim()
      .replace(/(?:\.{3}|…)$/u, "")
  }

  private isEquivalentUserQueryText(candidate: string, target: string): boolean {
    const normalizedCandidate = this.normalizeUserQueryMatchText(candidate)
    const normalizedTarget = this.normalizeUserQueryMatchText(target)
    if (!normalizedCandidate || !normalizedTarget) return false

    return (
      normalizedCandidate === normalizedTarget ||
      normalizedCandidate.startsWith(normalizedTarget) ||
      normalizedTarget.startsWith(normalizedCandidate)
    )
  }

  private findScrollableParent(element: Element | null): HTMLElement | null {
    let current = element as HTMLElement | null
    while (current && current !== document.body) {
      if (this.isScrollableOverflowY(current) && current.scrollHeight > current.clientHeight) {
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

  private async openMoreHistoryView(options: ConversationLoadOptions = {}): Promise<boolean> {
    const { signal, readyTimeoutMs = CONVERSATION_LIST_READY_TIMEOUT_MS } = options
    signal?.throwIfAborted()
    const deadline = Date.now() + readyTimeoutMs
    let moreHistoryLink: HTMLElement | null = null
    while (Date.now() < deadline) {
      if (this.isHistoryPath()) return true
      moreHistoryLink = document.querySelector(this.config.sitePrivateSelectors.moreHistoryLink)
      if (moreHistoryLink) break
      if (document.querySelector(this.config.sitePrivateSelectors.nextSidebarBody)) return true
      await waitForConversationLoad(200, signal)
    }
    if (!moreHistoryLink) return false

    const beforePath = window.location.pathname
    const beforeCount = document.querySelectorAll(
      this.config.sitePrivateSelectors.sidebarConversation,
    ).length

    const historyUrl = moreHistoryLink.getAttribute("href") || "/chat/history"
    options.onNavigation?.(new URL(historyUrl, window.location.href).href)
    moreHistoryLink.click()

    const timeoutAt = Date.now() + 3000
    while (Date.now() < timeoutAt) {
      const currentPath = window.location.pathname
      const currentCount = document.querySelectorAll(
        this.config.sitePrivateSelectors.sidebarConversation,
      ).length
      if (currentPath !== beforePath || currentCount > beforeCount) {
        return true
      }
      await waitForConversationLoad(120, signal)
    }
    return false
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

  private async insertByPasteEvent(editor: HTMLElement, content: string): Promise<boolean> {
    try {
      if (typeof DataTransfer === "undefined") return false

      this.selectEditorAll(editor)
      document.dispatchEvent(new Event("selectionchange"))
      await new Promise((resolve) => setTimeout(resolve, KIMI_SELECTION_SYNC_MS))
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

      // 事件未被拦截说明没有编辑器处理粘贴，合成事件本身不会触发默认粘贴行为
      return false
    } catch {
      return false
    }
  }

  /**
   * 等待编辑器内容落盘并校验完整性。模型驱动编辑器（如 Lexical）异步调和
   * DOM，同步读取拿到的是提交前的旧内容；比对基于 innerText 保留换行结构，
   * 换行被吃掉的残缺提交会判失败并触发清场重试。
   */
  private async waitForEditorContent(
    editor: HTMLElement,
    content: string,
    timeoutMs = 500,
  ): Promise<boolean> {
    const target = normalizeEditorContent(content)
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const current = normalizeEditorContent(editor.innerText)
      const matched =
        target.length > 0
          ? current.includes(target)
          : normalizeEditorContent(editor.textContent || "").length === 0
      if (editor.isConnected && matched) return true
      if (Date.now() >= deadline) return false
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  /**
   * 插入方式之间的清场。Lexical 的模型提交是异步的：上一次尝试可能已写入
   * 模型但 DOM 尚未渲染，DOM 看起来干净不代表模型干净，因此每次都做模型级
   * 清空。实测 execCommand("delete")、range.deleteContents()、innerHTML 重置
   * 都会被 Lexical 忽略或用模型还原，只有全选 + 合成 beforeinput 删除有效。
   */
  private async resetEditorIfDirty(editor: HTMLElement): Promise<boolean> {
    this.selectEditorAll(editor)
    document.dispatchEvent(new Event("selectionchange"))
    await new Promise((resolve) => setTimeout(resolve, KIMI_SELECTION_SYNC_MS))
    try {
      editor.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: "deleteContentBackward",
        }),
      )
    } catch {
      // 由下方的内容验证兜底
    }
    return this.waitForEditorContent(editor, "")
  }

  private async insertBySyntheticBeforeInput(
    editor: HTMLElement,
    content: string,
  ): Promise<boolean> {
    try {
      this.selectEditorAll(editor)
      document.dispatchEvent(new Event("selectionchange"))
      await new Promise((resolve) => setTimeout(resolve, KIMI_SELECTION_SYNC_MS))
      editor.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          composed: true,
          data: content,
          inputType: "insertText",
        }),
      )
      return true
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

  private findOriginalUserQueryContent(element: Element): Element | null {
    const directContents = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.userQueryContent),
    ).filter((node) => !node.closest(".gh-user-query-markdown"))
    if (directContents.length > 0) {
      return directContents[0]
    }

    const contentBoxes = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.userContentBox),
    ).filter((node) => !node.closest(".gh-user-query-markdown"))
    return contentBoxes[0] || null
  }

  private extractKimiUserBodyMarkdown(element: Element): string {
    const clone = element.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.userAttachmentList)
      .forEach((node) => node.remove())
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.exportDecoration)
      .forEach((node) => node.remove())
    clone.querySelectorAll(".gh-user-query-markdown").forEach((node) => node.remove())

    const contentBox = this.findOriginalUserQueryContent(clone)
    return this.extractTextWithLineBreaks(contentBox || clone).trim()
  }

  private extractKimiUserImageMarkdown(
    element: Element,
    collector?: ExportAssetCollector,
  ): string[] {
    const images = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.userAttachmentImage),
    ).filter(
      (node): node is HTMLImageElement =>
        node instanceof HTMLImageElement && !node.closest(".gh-user-query-markdown"),
    )
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
    ).filter((card) => !card.closest(".gh-user-query-markdown"))
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
    const markdownSelector = this.config.sitePrivateSelectors.markdown
    if (element.matches(markdownSelector) && !this.isInsideAssistantToolcall(element)) {
      return element
    }

    const directBody = element.querySelector(this.config.sitePrivateSelectors.assistantBodyMarkdown)
    if (directBody && !this.isInsideAssistantToolcall(directBody)) {
      return directBody
    }

    // 当 element 本身就是 .segment-assistant（含导出克隆节点）时，带祖先前缀的
    // assistantBodyMarkdown 无法匹配自身；优先取 toolcall-rollup 最终回答尾节点，
    // 避免误选中 .toolcall-rollup-segment__body 里的开头过渡语。
    const rollupTailStrict = Array.from(
      element.querySelectorAll(
        `.toolcall-rollup__tail-in > .markdown-container > ${markdownSelector}`,
      ),
    ).find((markdown) => !this.isInsideAssistantToolcall(markdown))
    if (rollupTailStrict) {
      return rollupTailStrict
    }

    const rollupTail = Array.from(
      element.querySelectorAll(`.toolcall-rollup__tail-in ${markdownSelector}`),
    ).find((markdown) => !this.isInsideAssistantToolcall(markdown))
    if (rollupTail) {
      return rollupTail
    }

    const legacyDirectBody = Array.from(
      element.querySelectorAll(
        `${this.config.sitePrivateSelectors.userContentBox} > .markdown-container > ${markdownSelector}`,
      ),
    ).find((markdown) => !this.isInsideAssistantToolcall(markdown))
    if (legacyDirectBody) {
      return legacyDirectBody
    }

    return (
      Array.from(element.querySelectorAll(markdownSelector)).find(
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
