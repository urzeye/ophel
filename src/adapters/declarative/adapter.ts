import {
  SiteAdapter,
  type AssistantMermaidSupportMode,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type PanelAvoidanceConfig,
  type QuickQuoteSupportMode,
  type WidthSelectorConfig,
  type ZenModeConfig,
} from "../base"
import type { SitePackCapability } from "../feature-capabilities"
import { getCurrentLang } from "~utils/i18n"

import { resolveSitePackName } from "./localization"
import { siteMatchPatternMatchesUrl, siteMatchPatternOrigin } from "./match-pattern"
import type { SitePackManifest } from "./types"

const DEFAULT_THEME_COLORS = {
  primary: "#2563eb",
  secondary: "#1d4ed8",
}

const ZERO_WIDTH_EDITOR_MARKERS = /[\u200B\u200C\u200D\uFEFF]/g
const EDITOR_WHITESPACE = /\s+/g

type TextControl = HTMLInputElement | HTMLTextAreaElement

type ConfiguredEditor =
  | { mode: "textarea"; editor: TextControl }
  | { mode: "contenteditable"; editor: HTMLElement }

interface OutlineCandidate {
  element: Element
  level: number
  text: string
  isUserQuery: boolean
}

export interface DeclarativeAdapterOptions {
  explicitOrigin?: string
  installSource?: "registry" | "local"
}

export interface DeclarativeAdapterPackageMetadata {
  id: string
  version: number
  source?: "registry" | "local"
}

const isTextControl = (element: HTMLElement): element is TextControl =>
  element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement

/**
 * 按点分隔路径写入嵌套对象的值；中间层缺失或被占用时重建为对象。
 * valuePath 已经过 manifest 校验（不含 __proto__ 等危险段），这里仍按段防御一次。
 */
const setNestedThemeValue = (
  target: Record<string, unknown>,
  path: string,
  value: string,
): void => {
  const segments = path.split(".")
  let current: Record<string, unknown> = target
  for (const segment of segments.slice(0, -1)) {
    if (segment === "__proto__" || segment === "prototype" || segment === "constructor") return
    const next: unknown = current[segment]
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      current[segment] = {}
    }
    current = current[segment] as Record<string, unknown>
  }
  const last = segments[segments.length - 1]
  if (last === "__proto__" || last === "prototype" || last === "constructor") return
  current[last] = value
}

const getEditorText = (editor: HTMLElement): string =>
  isTextControl(editor) ? editor.value : editor.textContent ?? ""

// contenteditable DOM（如 ProseMirror 多段落）的 textContent 不保留换行与原始空白，
// 校验插入结果时移除两侧全部空白字符，避免多行内容已插入却被误判为失败。
const normalizeEditorText = (text: string): string =>
  text.replace(ZERO_WIDTH_EDITOR_MARKERS, "").replace(EDITOR_WHITESPACE, "")

const compareDomOrder = (left: Element, right: Element): number => {
  if (left === right) return 0

  const position = left.compareDocumentPosition(right)
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
  return 0
}

const isInsideOphelContainer = (element: Element, boundary: Element): boolean => {
  let current: Element | null = element

  while (current) {
    if (Array.from(current.classList).some((className) => className.startsWith("gh-"))) {
      return true
    }
    if (current === boundary) break
    current = current.parentElement
  }

  return false
}

const cloneZenModeConfig = (config: ZenModeConfig): ZenModeConfig => {
  const { hide, rootClass, styles } = config
  return {
    ...(hide ? { hide: [...hide] } : {}),
    ...(rootClass ? { rootClass: { ...rootClass } } : {}),
    ...(styles ? { styles: styles.map((style) => ({ ...style })) } : {}),
  }
}

const cloneNetworkMonitorConfig = (config: NetworkMonitorConfig): NetworkMonitorConfig => ({
  urlPatterns: [...config.urlPatterns],
  silenceThreshold: config.silenceThreshold,
  ...(config.urlPathEndsWith ? { urlPathEndsWith: [...config.urlPathEndsWith] } : {}),
  ...(config.requestBodyRules
    ? {
        requestBodyRules: config.requestBodyRules.map((rule) => ({
          ...rule,
          metadata: { ...rule.metadata },
        })),
      }
    : {}),
})

const normalizeElementText = (element: Element | null): string | null => {
  const text = element?.textContent?.replace(/\s+/g, " ").trim()
  return text || null
}

/** 把已通过校验的 SitePack manifest 显式映射到现有 SiteAdapter API。 */
export class DeclarativeAdapter extends SiteAdapter {
  private manifest: SitePackManifest
  private conversationIdPattern: RegExp | null = null
  private sessionIdPattern: RegExp | null = null
  private newConversationPathPatterns: RegExp[] | null = null
  private featureCapabilities: ReadonlySet<SitePackCapability> = new Set()
  private readonly explicitOrigin?: string
  private readonly installSource?: "registry" | "local"

  constructor(manifest: SitePackManifest, options: DeclarativeAdapterOptions = {}) {
    super()
    this.explicitOrigin = options.explicitOrigin
    this.installSource = options.installSource
    this.manifest = structuredClone(manifest)
    this.rebuildManifestState()
  }

  private rebuildManifestState(): void {
    this.featureCapabilities = new Set(this.manifest.capabilities)
    this.conversationIdPattern = this.manifest.conversation
      ? new RegExp(this.manifest.conversation.idFrom.regex)
      : null
    this.sessionIdPattern = this.manifest.session?.idFromPathRegex
      ? new RegExp(this.manifest.session.idFromPathRegex)
      : null
    this.newConversationPathPatterns = this.manifest.session?.newConversationPathPatterns
      ? this.manifest.session.newConversationPathPatterns.map((pattern) => new RegExp(pattern))
      : null
    this.textarea = null
  }

  getSitePackMetadata(): DeclarativeAdapterPackageMetadata {
    return {
      id: this.manifest.id,
      version: this.manifest.version,
      ...(this.installSource ? { source: this.installSource } : {}),
    }
  }

  applySitePackManifest(manifest: SitePackManifest): boolean {
    if (manifest.id !== this.manifest.id) {
      throw new TypeError(
        `Cannot replace SitePack ${this.manifest.id} with a different package: ${manifest.id}`,
      )
    }
    if (manifest.version < this.manifest.version) {
      throw new TypeError(
        `Cannot roll back SitePack ${manifest.id}: ${manifest.version} < ${this.manifest.version}`,
      )
    }
    if (manifest.version === this.manifest.version) return false

    this.manifest = structuredClone(manifest)
    this.rebuildManifestState()
    return true
  }

  match(): boolean {
    const url = new URL(window.location.href)
    if (this.explicitOrigin !== undefined) return url.origin === this.explicitOrigin
    return this.manifest.matches.some((pattern) => siteMatchPatternMatchesUrl(url, pattern))
  }

  getSiteId(): string {
    return `pack:${this.manifest.id}`
  }

  canClaimLegacySiteData(): boolean {
    if (this.explicitOrigin !== undefined) return false
    if (
      this.manifest.matches.length === 0 ||
      this.manifest.matches.some((match) => /^https:\/\/\*\./i.test(match))
    ) {
      return false
    }

    const origins = new Set(this.manifest.matches.map(siteMatchPatternOrigin))
    return origins.size === 1 && origins.has(window.location.origin)
  }

  getName(): string {
    return resolveSitePackName(this.manifest, getCurrentLang())
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { ...(this.manifest.theme ?? DEFAULT_THEME_COLORS) }
  }

  getFeatureCapabilities(): Set<SitePackCapability> {
    return new Set(this.featureCapabilities)
  }

  getTextareaSelectors(): string[] {
    return [...(this.manifest.selectors.textarea ?? [])]
  }

  private getConfiguredEditor(): ConfiguredEditor | null {
    const mode = this.manifest.input?.mode
    if (!mode) return null

    const editor = this.getTextareaElement()
    if (!editor || !editor.isConnected) return null

    if (mode === "textarea") {
      return isTextControl(editor) ? { mode, editor } : null
    }

    return editor.isContentEditable ? { mode, editor } : null
  }

  private isEditorUpdateValid(
    editor: HTMLElement,
    content: string,
    requireSubmitButton: boolean,
  ): boolean {
    if (!editor.isConnected) return false

    const editorText = getEditorText(editor)
    const contentMatches =
      content.length > 0
        ? normalizeEditorText(editorText).includes(normalizeEditorText(content))
        : editorText.replace(ZERO_WIDTH_EDITOR_MARKERS, "").length === 0

    return contentMatches && (!requireSubmitButton || this.hasReadySubmitButton())
  }

  private isSubmitButtonDisabled(element: HTMLElement): boolean {
    const disableableElement = element as HTMLElement & { disabled?: boolean }
    return (
      disableableElement.disabled === true ||
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-disabled") === "true" ||
      element.getAttribute("data-disabled") === "true"
    )
  }

  private isConfiguredElementVisible(element: Element): boolean {
    if (!element.isConnected) return false
    if (element.closest(".gh-main-panel, .gh-queue-panel")) return false

    const style = window.getComputedStyle(element)
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number.parseFloat(style.opacity || "1") === 0
    ) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private hasReadySubmitButton(): boolean {
    return (this.manifest.selectors.submitButton ?? []).some((selector) =>
      this.findAllElementsBySelector(selector).some(
        (element) =>
          element instanceof HTMLElement &&
          this.isConfiguredElementVisible(element) &&
          !this.isSubmitButtonDisabled(element),
      ),
    )
  }

  private setTextControlValue(editor: TextControl, content: string): boolean {
    const prototype =
      editor instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set
    if (!setter) return false

    try {
      editor.focus()
      setter.call(editor, content)
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, composed: true, data: content }),
      )
      editor.dispatchEvent(new Event("change", { bubbles: true }))

      if (
        editor instanceof HTMLTextAreaElement ||
        ["text", "search", "tel", "url", "password"].includes(editor.type)
      ) {
        editor.setSelectionRange(content.length, content.length)
      }
    } catch {
      return false
    }

    return true
  }

  private selectAllEditorContent(editor: HTMLElement): boolean {
    const selection = editor.ownerDocument.getSelection()
    if (!selection) return false

    try {
      selection.selectAllChildren(editor)
      return true
    } catch {
      return false
    }
  }

  private replaceContentEditableContent(
    editor: HTMLElement,
    content: string,
    requireSubmitButton: boolean,
  ): boolean {
    editor.focus()

    if (this.selectAllEditorContent(editor)) {
      try {
        editor.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            composed: true,
            data: content,
            inputType: "insertText",
          }),
        )
      } catch {
        // Unsupported beforeinput construction continues to the execCommand attempt.
      }
      if (this.isEditorUpdateValid(editor, content, requireSubmitButton)) return true
    }

    if (!this.selectAllEditorContent(editor)) return false

    try {
      editor.ownerDocument.execCommand("insertText", false, content)
    } catch {
      return false
    }

    return this.isEditorUpdateValid(editor, content, requireSubmitButton)
  }

  insertPrompt(content: string): boolean {
    const configuredEditor = this.getConfiguredEditor()
    if (!configuredEditor) return false
    const requireSubmitButton = (this.manifest.selectors.submitButton?.length ?? 0) > 0

    if (configuredEditor.mode === "contenteditable") {
      return this.replaceContentEditableContent(
        configuredEditor.editor,
        content,
        requireSubmitButton,
      )
    }

    if (!this.setTextControlValue(configuredEditor.editor, content)) return false
    return this.isEditorUpdateValid(configuredEditor.editor, content, requireSubmitButton)
  }

  clearTextarea(): void {
    const configuredEditor = this.getConfiguredEditor()
    if (!configuredEditor) return

    if (configuredEditor.mode === "contenteditable") {
      this.replaceContentEditableContent(configuredEditor.editor, "", false)
      return
    }

    if (!this.setTextControlValue(configuredEditor.editor, "")) return
    if (!this.isEditorUpdateValid(configuredEditor.editor, "", false)) return
  }

  private isInsideOutlineExclude(element: Element): boolean {
    const excludeSelectors = this.manifest.selectors.outlineExclude
    if (!excludeSelectors || excludeSelectors.length === 0) return false
    return excludeSelectors.some((selector) => element.closest(selector) !== null)
  }

  private getOutlineCandidates(
    maxLevel: number,
  ): { container: HTMLElement; candidates: OutlineCandidate[] } | null {
    const responseContainerSelector = this.manifest.selectors.responseContainer
    if (!responseContainerSelector) return null

    const container = this.findElementBySelectors([responseContainerSelector])
    if (!container) return null

    const normalizedMaxLevel = Math.min(Math.max(Math.floor(maxLevel), 1), 6)
    const selectors = Array.from({ length: normalizedMaxLevel }, (_, index) => `h${index + 1}`)
    const userQuerySelector = this.manifest.selectors.userQuery
    if (userQuerySelector) selectors.push(userQuerySelector)

    const candidates = Array.from(container.querySelectorAll(selectors.join(", ")))
      .filter((element) => !isInsideOphelContainer(element, container))
      .filter((element) => !this.isInsideOutlineExclude(element))
      .map((element): OutlineCandidate | null => {
        const isUserQuery = userQuerySelector ? element.matches(userQuerySelector) : false
        if (isUserQuery) {
          return {
            element,
            level: 0,
            text: this.extractUserQueryText(element),
            isUserQuery: true,
          }
        }

        const level = Number.parseInt(element.tagName.slice(1), 10)
        const text = element.textContent?.trim() || ""
        if (Number.isNaN(level) || !text) return null

        return { element, level, text, isUserQuery: false }
      })
      .filter((candidate): candidate is OutlineCandidate => candidate !== null)
      .sort((left, right) => compareDomOrder(left.element, right.element))

    return { container, candidates }
  }

  private getNextOutlineBoundary(
    candidates: OutlineCandidate[],
    currentIndex: number,
  ): Element | null {
    const current = candidates[currentIndex]

    for (let index = currentIndex + 1; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      if (candidate.isUserQuery) return candidate.element
      if (!current.isUserQuery && candidate.level <= current.level) return candidate.element
    }

    return null
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const context = this.getOutlineCandidates(maxLevel)
    if (!context) return []

    const { candidates, container } = context
    const outline: OutlineItem[] = []

    candidates.forEach((candidate, index) => {
      if (candidate.isUserQuery && (!includeUserQueries || !candidate.text)) return

      const item: OutlineItem = {
        level: candidate.level,
        text: candidate.text,
        element: candidate.element,
        ...(candidate.isUserQuery ? { isUserQuery: true } : {}),
      }

      if (showWordCount) {
        item.wordCount = this.calculateRangeWordCount(
          candidate.element,
          this.getNextOutlineBoundary(candidates, index),
          container,
        )
      }

      outline.push(item)
    })

    return outline
  }

  getConversationTitle(): string | null {
    const { conversation } = this.manifest
    const activeMatch = conversation?.activeMatch
    if (activeMatch) {
      const activeItem = this.getConversationItems().find((item) => item.matches(activeMatch))
      if (activeItem) {
        const title = normalizeElementText(this.getConversationTitleElement(activeItem))
        if (title) return title
      }
    }

    return this.getDocumentConversationTitle()
  }

  private getConversationItems(): Element[] {
    const { conversation } = this.manifest
    if (!conversation) return []

    return conversation.shadow
      ? this.findAllElementsBySelector(conversation.itemSelector)
      : Array.from(document.querySelectorAll(conversation.itemSelector))
  }

  private getConversationId(item: Element): string | null {
    const { conversation } = this.manifest
    if (!conversation || !this.conversationIdPattern) return null

    const source = item.getAttribute(conversation.idFrom.attr ?? "href")
    if (!source) return null

    const id = this.conversationIdPattern.exec(source)?.[1]?.trim()
    return id || null
  }

  private getConversationTitleElement(item: Element): Element | null {
    const titleSelector = this.manifest.conversation?.titleSelector
    if (!titleSelector) return item
    return item.matches(titleSelector) ? item : item.querySelector(titleSelector)
  }

  private buildConversationUrl(id: string): string | null {
    const { conversation } = this.manifest
    if (!conversation) return null

    const path = conversation.urlTemplate.split("{id}").join(encodeURIComponent(id))
    try {
      const url = new URL(path, window.location.origin)
      return url.origin === window.location.origin ? url.href : null
    } catch {
      return null
    }
  }

  private extractConversationInfo(item: Element): ConversationInfo | null {
    const { conversation } = this.manifest
    if (!conversation) return null

    const id = this.getConversationId(item)
    if (!id) return null

    const url = this.buildConversationUrl(id)
    if (!url) return null

    return {
      id,
      title: normalizeElementText(this.getConversationTitleElement(item)) ?? "",
      url,
      ...(conversation.activeMatch ? { isActive: item.matches(conversation.activeMatch) } : {}),
    }
  }

  getConversationList(): ConversationInfo[] {
    const conversations = new Map<string, ConversationInfo>()

    for (const item of this.getConversationItems()) {
      const info = this.extractConversationInfo(item)
      if (info && !conversations.has(info.id)) {
        conversations.set(info.id, info)
      }
    }

    return Array.from(conversations.values())
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    const { conversation } = this.manifest
    if (!conversation) return null

    return {
      selector: conversation.itemSelector,
      shadow: conversation.shadow ?? false,
      extractInfo: (item) => this.extractConversationInfo(item),
      getTitleElement: (item) => this.getConversationTitleElement(item),
    }
  }

  navigateToConversation(id: string, _url?: string): boolean {
    const { conversation } = this.manifest
    const normalizedId = id.trim()
    if (!conversation || !normalizedId) return false

    if ((conversation.navigationStrategy ?? "click-item") === "click-item") {
      const item = this.getConversationItems().find(
        (candidate) => this.getConversationId(candidate) === normalizedId,
      )
      if (item instanceof HTMLElement) {
        this.simulateClick(item)
        return true
      }
    }

    const targetUrl = this.buildConversationUrl(normalizedId)
    return targetUrl ? super.navigateToConversation(normalizedId, targetUrl) : false
  }

  isGenerating(): boolean {
    return (
      super.isGenerating() ||
      (this.manifest.generating?.existsSelectors ?? []).some((selector) =>
        this.findAllElementsBySelector(selector).some((element) =>
          this.isConfiguredElementVisible(element),
        ),
      )
    )
  }

  getSessionId(): string {
    if (!this.sessionIdPattern) return super.getSessionId()

    return this.sessionIdPattern.exec(window.location.pathname)?.[1]?.trim() ?? ""
  }

  isNewConversation(): boolean {
    if (!this.newConversationPathPatterns) return super.isNewConversation()

    return this.newConversationPathPatterns.some((pattern) =>
      pattern.test(window.location.pathname),
    )
  }

  isSharePage(): boolean {
    const sharePathPrefix = this.manifest.session?.sharePathPrefix
    return sharePathPrefix === undefined
      ? super.isSharePage()
      : window.location.pathname.startsWith(sharePathPrefix)
  }

  getNewTabUrl(): string {
    const newTabPath = this.manifest.session?.newTabPath
    if (newTabPath === undefined) return super.getNewTabUrl()

    const url = new URL(newTabPath, window.location.origin)
    if (url.origin !== window.location.origin) {
      throw new Error("Declarative SitePack newTabPath must remain on the current origin")
    }

    return url.href
  }

  getSubmitButtonSelectors(): string[] {
    return [...(this.manifest.selectors.submitButton ?? [])]
  }

  scrollToOutlineTarget(element: HTMLElement): void {
    super.scrollToOutlineTarget(element)
    if (this.manifest.scrollPinRelease) this.signalUserScrollIntent(element)
  }

  private outlineJumpSeq = 0
  private emittingPinReleaseWheel = false

  /**
   * 部分站点（如 LongCat）靠 wheel/touchmove 判断用户已接管滚动，判定前
   * 内容区的 MutationObserver 会反复把容器拉回底部，撤销大纲的程序化跳转。
   * 跳转后补发零增量 wheel 让站点停止自动吸底；若期间被拉回则重试跳转。
   * 仅对 manifest 声明 scrollPinRelease 的站点启用，避免影响其他适配包站点。
   */
  private signalUserScrollIntent(element: HTMLElement): void {
    const container = this.getScrollContainer()
    if (!container) return

    // 序号守卫：仅最后一次大纲跳转的重试生效，避免连点不同标题时旧重试把视图拽回。
    const seq = ++this.outlineJumpSeq
    const isCurrentJump = () => seq === this.outlineJumpSeq

    // 重试窗口内的真实用户滚动（排除补发的合成 wheel）视为用户已接管，放弃后续重试。
    const cancelOnUserScroll = () => {
      if (this.emittingPinReleaseWheel) return
      if (isCurrentJump()) this.outlineJumpSeq += 1
    }
    container.addEventListener("wheel", cancelOnUserScroll, { passive: true })
    container.addEventListener("touchmove", cancelOnUserScroll, { passive: true })
    setTimeout(() => {
      container.removeEventListener("wheel", cancelOnUserScroll)
      container.removeEventListener("touchmove", cancelOnUserScroll)
    }, 480)

    const attempt = () => {
      if (!isCurrentJump() || !element.isConnected) return
      super.scrollToOutlineTarget(element)
      requestAnimationFrame(() => {
        if (!isCurrentJump()) return
        this.emittingPinReleaseWheel = true
        try {
          container.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true }))
        } finally {
          this.emittingPinReleaseWheel = false
        }
      })
    }

    attempt()
    setTimeout(attempt, 120)
    setTimeout(attempt, 320)
  }

  getNewChatButtonSelectors(): string[] {
    return [...(this.manifest.selectors.newChatButton ?? [])]
  }

  getStopButtonSelectors(): string[] {
    return [...(this.manifest.selectors.stopButton ?? [])]
  }

  getResponseContainerSelector(): string {
    return this.manifest.selectors.responseContainer ?? ""
  }

  getChatContentSelectors(): string[] {
    return [...(this.manifest.selectors.chatContent ?? [])]
  }

  getUserQuerySelector(): string | null {
    return this.manifest.selectors.userQuery ?? null
  }

  getScrollContainer(): HTMLElement | null {
    return this.findElementBySelectors(this.manifest.selectors.scrollContainer ?? [])
  }

  getSidebarScrollContainer(): Element | null {
    const selector = this.manifest.selectors.sidebarScrollContainer
    return selector ? this.findElementBySelectors([selector]) : null
  }

  getExportConfig(): ExportConfig | null {
    return this.manifest.export ? { ...this.manifest.export } : null
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig | null {
    return this.manifest.networkMonitor
      ? cloneNetworkMonitorConfig(this.manifest.networkMonitor)
      : null
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    const config = this.manifest.modelSwitcher
    if (!config) return null

    return {
      ...config,
      targetModelKeyword: keyword,
      selectorButtonSelectors: [...config.selectorButtonSelectors],
      subMenuTriggers: config.subMenuTriggers ? [...config.subMenuTriggers] : undefined,
    }
  }

  getWidthSelectors(): WidthSelectorConfig[] {
    return (this.manifest.widthSelectors ?? []).map((selector) => ({ ...selector }))
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig | null {
    return this.manifest.panelAvoidance ? structuredClone(this.manifest.panelAvoidance) : null
  }

  getZenModeConfig(): ZenModeConfig | null {
    return this.manifest.zenMode ? cloneZenModeConfig(this.manifest.zenMode) : null
  }

  getCleanModeConfig(): ZenModeConfig | null {
    return this.manifest.cleanMode ? cloneZenModeConfig(this.manifest.cleanMode) : null
  }

  getSubmitKeyConfig(): { key: "Enter" | "Ctrl+Enter" } {
    return { key: this.manifest.input?.submitKey ?? "Enter" }
  }

  getQuickQuoteSupportMode(): QuickQuoteSupportMode {
    return this.manifest.quickQuote ?? "disabled"
  }

  getAssistantMermaidSupportMode(): AssistantMermaidSupportMode {
    return this.manifest.mermaidSupport ?? "native"
  }

  supportsHostThemeSync(): boolean {
    return this.manifest.supportsHostThemeSync ?? Boolean(this.manifest.themeSync)
  }

  /**
   * 基于 manifest.themeSync 的声明式宿主页主题切换。
   * 仅支持 localStorage + html class 机制；未声明 themeSync 时保持基类行为（返回 false）。
   */
  async toggleTheme(targetMode: "light" | "dark" | "system"): Promise<boolean> {
    const config = this.manifest.themeSync
    if (!config) return false

    try {
      const resolvedMode: "light" | "dark" =
        targetMode === "system"
          ? window.matchMedia?.("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : targetMode

      // system 未配置独立值时退化为解析值，避免站点读到不认识的模式值
      const storageValue =
        targetMode === "system"
          ? config.values.system ?? config.values[resolvedMode]
          : config.values[targetMode]

      const previousValue = localStorage.getItem(config.storageKey)
      let nextValue: string
      if (config.valuePath) {
        // 嵌套存储：保留对象内其他偏好字段，读-改-写
        let stored: Record<string, unknown> = {}
        if (previousValue) {
          try {
            const parsed: unknown = JSON.parse(previousValue)
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
              stored = parsed as Record<string, unknown>
            }
          } catch {
            stored = {}
          }
        }
        setNestedThemeValue(stored, config.valuePath, storageValue)
        nextValue = JSON.stringify(stored)
      } else {
        nextValue = config.valueFormat === "json" ? JSON.stringify(storageValue) : storageValue
      }
      localStorage.setItem(config.storageKey, nextValue)

      // 用 classList 精确替换，绝不像部分内置站点那样整体覆写 className
      // darkClass/lightClass 都缺省时不动 DOM 类，靠上面的 storage 事件让站点自行应用
      const html = document.documentElement
      if (resolvedMode === "dark") {
        if (config.lightClass) html.classList.remove(config.lightClass)
        if (config.darkClass) html.classList.add(config.darkClass)
      } else {
        if (config.darkClass) html.classList.remove(config.darkClass)
        if (config.lightClass) html.classList.add(config.lightClass)
      }
      html.style.colorScheme = resolvedMode

      // 手动派发的 storage 事件同标签页监听者也能收到，next-themes 类实现靠它同步状态
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: config.storageKey,
          oldValue: previousValue,
          newValue: nextValue,
          storageArea: localStorage,
        }),
      )

      return true
    } catch (error) {
      console.error(`[SitePackAdapter:${this.manifest.id}] toggleTheme error:`, error)
      return false
    }
  }
}
