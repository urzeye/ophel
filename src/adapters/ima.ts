/**
 * ima 适配器（ima.qq.com）
 *
 * 范围说明：
 * - 支持输入框注入、导出、大纲、新对话、模型锁定、停止生成、页面宽度/禅模式
 * - 不支持主题切换
 * - 会话同步/会话面板能力按需求保持不支持
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
  type AdapterCapabilities,
  type ExportConfig,
  type ExportLifecycleContext,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type PanelAvoidanceConfig,
} from "./base"
import type { BuiltinSiteConfig } from "./declarative"
import { IMA_CONFIG, IMA_CONFIG_VERSION, type ImaSiteConfig } from "./ima-config"

const IMA_HOSTNAME = "ima.qq.com"
const IMA_CHAT_PATH_PATTERN = /^\/chat\/([a-z0-9]+)(?:\/|$)/i
const IMA_CID_STORAGE_KEY = "ima-official-website-uid"
const IMA_ATTACHMENT_SOURCE_ATTRS = [
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

const MAX_OUTLINE_TEXT_LENGTH = 80

interface ImaUserAttachment {
  kind: "image" | "file"
  name: string
  source: string
  type: string
  sizeLabel?: string
}

interface ImaAssistantImage {
  source: string
  alt: string
  extensionHint?: string
}

export class ImaAdapter extends SiteAdapter {
  private config: ImaSiteConfig = IMA_CONFIG
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

  getBuiltinConfig(): ImaSiteConfig {
    return IMA_CONFIG
  }

  getBuiltinConfigVersion(): number {
    return IMA_CONFIG_VERSION
  }

  applyMergedConfig(config: BuiltinSiteConfig): void {
    this.config = config as ImaSiteConfig
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#07a45f", secondary: "#05854d" }
  }

  supportsHostThemeSync(): boolean {
    return false
  }

  getSessionId(): string {
    const match = window.location.pathname.match(IMA_CHAT_PATH_PATTERN)
    return match?.[1] || ""
  }

  isNewConversation(): boolean {
    const path = window.location.pathname.replace(/\/+$/, "") || "/"
    return path === "/"
  }

  isSharePage(): boolean {
    // 自有会话：/ai-chat/ID    分享会话：/share/
    return window.location.pathname.startsWith("/share/")
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

    const title = this.getDocumentConversationTitle() || ""
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
    return [...this.config.selectors.textarea]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (!super.isValidTextarea(element)) return false
    if (!element.isContentEditable) return false
    return !!element.closest(this.config.sitePrivateSelectors.inputScope)
  }

  getSubmitKeyConfig(): { key: "Enter" | "Ctrl+Enter" } {
    return { key: this.config.input.submitKey ?? "Enter" }
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
    return [this.config.sitePrivateSelectors.submitButton]
  }

  findSubmitButton(editor: HTMLElement | null): HTMLElement | null {
    const scopes = [
      editor?.closest(this.config.sitePrivateSelectors.tagTextarea),
      editor?.closest(this.config.sitePrivateSelectors.chatInputContainer),
      document.querySelector(this.config.sitePrivateSelectors.chatInputContainer),
      document.body,
    ].filter(Boolean) as ParentNode[]

    for (const scope of scopes) {
      const button = scope.querySelector(
        this.config.sitePrivateSelectors.submitButton,
      ) as HTMLElement | null
      if (!button || !this.isVisibleElement(button)) continue
      if (button.querySelector(this.config.sitePrivateSelectors.submitDisabled)) continue
      return button
    }

    return null
  }

  getNewChatButtonSelectors(): string[] {
    return [...this.config.selectors.newChatButton]
  }

  getSidebarScrollContainer(): Element | null {
    return document.querySelector(this.config.sitePrivateSelectors.sidebarScrollContainer)
  }

  getScrollContainer(): HTMLElement | null {
    const container = document.querySelector(this.config.sitePrivateSelectors.scrollContainer)
    return container instanceof HTMLElement ? container : null
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
      .querySelectorAll(".gh-user-query-markdown, button, [role='button'], svg")
      .forEach((node) => {
        node.remove()
      })

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
    if (!last) return null

    const text = this.extractAssistantResponseText(last)
    return text || null
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const container =
      document.querySelector(this.config.selectors.responseContainer) ||
      document.querySelector(this.config.sitePrivateSelectors.scrollContainer)
    if (!container) return []

    const outline: OutlineItem[] = []
    const blocks = Array.from(
      container.querySelectorAll(this.config.selectors.chatContent.join(", ")),
    ).filter((element) => !element.closest(".gh-root"))

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
    return { ...this.config.export }
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

  async extractExportMessages(_context: ExportLifecycleContext): Promise<ExportMessage[] | null> {
    const messages = this.extractImaExportMessages()
    return messages.length > 0 ? messages : null
  }

  async extractExportBundle(_context: ExportLifecycleContext): Promise<ExportBundle | null> {
    return this.createExportBundleFromMessages((collector) =>
      this.extractImaExportMessages(collector),
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

  getModelName(): string | null {
    const textNode = this.findVisibleElementBySelectors([
      this.config.sitePrivateSelectors.modelText,
    ])
    const text = textNode?.innerText?.trim() || textNode?.textContent?.trim() || ""
    if (text) return text.split("\n")[0].trim()

    const button = this.findVisibleElementBySelectors(
      this.config.modelSwitcher.selectorButtonSelectors,
    )
    const buttonText = button?.innerText?.trim() || button?.textContent?.trim() || ""
    return buttonText ? buttonText.split("\n")[0].trim() : null
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

  getCapabilities(): AdapterCapabilities {
    return {
      ...super.getCapabilities(),
      layout: {
        getWidthSelectors: () => this.getWidthSelectors(),
        getUserQueryWidthSelectors: () => this.getUserQueryWidthSelectors(),
        getPanelAvoidanceConfig: () => this.getPanelAvoidanceConfig(),
      },
    }
  }

  getWidthSelectors() {
    return this.config.widthSelectors.map((selector) => ({ ...selector }))
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    return {
      scopeSelector: this.config.sitePrivateSelectors.pageContent,
      widthSelectors: [
        {
          selector: this.config.selectors.responseContainer,
          property: "width",
          extraCss: "max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: this.config.sitePrivateSelectors.editorContainer,
          property: "width",
          extraCss: "max-width: 100% !important; min-width: 0 !important;",
        },
      ],
      insetSelectors: [
        {
          selector: this.config.sitePrivateSelectors.mainArea,
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: this.config.sitePrivateSelectors.chatPageInputContainer,
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: this.config.sitePrivateSelectors.newChatContent,
          insetMode: "edge",
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
      ],
      defaultWidth: "960px",
      gap: 16,
    }
  }

  getUserQueryWidthSelectors(): Array<{ selector: string; property: string }> {
    return [
      {
        selector: this.config.sitePrivateSelectors.userQueryWidth,
        property: "max-width",
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

  private extractImaExportMessages(collector?: ExportAssetCollector): ExportMessage[] {
    const root =
      (document.querySelector(this.config.selectors.responseContainer) as ParentNode | null) ||
      (document.querySelector(
        this.config.sitePrivateSelectors.scrollContainer,
      ) as ParentNode | null) ||
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
    const attachments = this.extractImaUserAttachments(element)

    if (attachments.length === 0) {
      return body
    }

    const imageMarkdown = this.formatImaUserImageAttachments(attachments, collector)
    const fileMarkdown = this.formatImaUserFileAttachments(attachments, collector)
    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, body].filter(Boolean).join("\n\n")
  }

  private extractAssistantResponseTextWithAssets(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    const body = this.extractAssistantMarkdown(element)
    const imageMarkdown = this.formatImaAssistantImages(
      this.extractImaAssistantImages(element),
      collector,
    )

    return [body, imageMarkdown.join("\n\n")].filter(Boolean).join("\n\n")
  }

  private extractAssistantMarkdown(element: Element): string {
    const includeThoughts = this.shouldIncludeThoughtsInExport()
    const clone = element.cloneNode(true) as HTMLElement
    const thoughtBlocks = includeThoughts ? this.extractThoughtBlockquotes(clone) : []

    clone
      .querySelectorAll(
        `${this.config.sitePrivateSelectors.exportDecoration}, ${this.config.sitePrivateSelectors.assistantGeneratedImageCards}`,
      )
      .forEach((node) => node.remove())
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.thinking)
      .forEach((node) => node.remove())

    const markdownRoot = this.findAssistantMarkdownRoot(clone)
    const markdownSource =
      markdownRoot instanceof HTMLElement ? markdownRoot : this.findAssistantBubbleRoot(clone)
    const markdown = markdownSource ? htmlToMarkdown(markdownSource).trim() : ""
    const normalizedBody =
      markdown || (markdownSource ? this.extractTextWithLineBreaks(markdownSource).trim() : "")

    if (includeThoughts && thoughtBlocks.length > 0) {
      const thoughtSection = thoughtBlocks.join("\n\n")
      return normalizedBody ? `${thoughtSection}\n\n${normalizedBody}` : thoughtSection
    }

    return normalizedBody
  }

  private extractImaUserAttachments(element: Element): ImaUserAttachment[] {
    const scope = this.findUserMessageScope(element)
    const attachments: ImaUserAttachment[] = []
    const seen = new Set<string>()

    const addAttachment = (attachment: ImaUserAttachment | null) => {
      if (!attachment) return

      const keys = this.getImaAttachmentKeys(attachment)
      if (keys.some((key) => seen.has(key))) return

      keys.forEach((key) => seen.add(key))
      attachments.push(attachment)
    }

    this.queryElementsIncludingSelf(
      scope,
      this.config.sitePrivateSelectors.userAttachmentImages,
    ).forEach((node) => {
      if (node instanceof HTMLImageElement) {
        addAttachment(this.extractImaUserImageAttachment(node))
      }
    })

    this.queryElementsIncludingSelf(
      scope,
      this.config.sitePrivateSelectors.userAttachmentFiles.join(", "),
    ).forEach((card) => {
      addAttachment(this.extractImaUserFileAttachment(card))
    })

    return attachments
  }

  private extractImaUserImageAttachment(image: HTMLImageElement): ImaUserAttachment | null {
    const source = this.extractImaImageSource(image)
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

  private extractImaUserFileAttachment(card: Element): ImaUserAttachment | null {
    if (
      card instanceof HTMLImageElement ||
      card.closest(this.config.sitePrivateSelectors.userAttachmentImageCard) ||
      card.querySelector("img")
    ) {
      return null
    }

    const textParts = this.extractCleanTextParts(card)
    const { name, type, sizeLabel } = parseExportFileAttachmentText(textParts)
    const source = this.extractImaDownloadableSource(card, {
      allowDataImage: false,
      includeImages: false,
    })
    const inferredName =
      name ||
      extractExportFilenameFromUrl(source, { ignoreGenericDownload: true }) ||
      this.extractDataAttributeFilename(card)

    if (!inferredName && !source) return null

    const fallbackName = inferredName || "attachment"

    return {
      kind: "file",
      name: fallbackName,
      source,
      type: type || extractExportExtension(fallbackName) || extractExportExtensionFromUrl(source),
      sizeLabel,
    }
  }

  private formatImaUserImageAttachments(
    attachments: ImaUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportImageAttachments(attachments, collector, { siteId: this.getSiteId() })
  }

  private formatImaUserFileAttachments(
    attachments: ImaUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportFileAttachments(attachments, collector, { siteId: this.getSiteId() })
  }

  private extractImaAssistantImages(element: Element): ImaAssistantImage[] {
    const contentRoot = this.findAssistantBubbleRoot(element) || element
    const images: ImaAssistantImage[] = []
    const seen = new Set<string>()

    this.queryElementsIncludingSelf(
      contentRoot,
      this.config.sitePrivateSelectors.assistantGeneratedImages,
    ).forEach((node) => {
      if (!(node instanceof HTMLImageElement)) return
      if (node.closest(".gh-root, .gh-user-query-markdown")) return

      const source = this.extractImaImageSource(node)
      const sourceKey = getExportAttachmentSourceKey(source)
      if (!source || seen.has(sourceKey)) return

      seen.add(sourceKey)
      images.push({
        source,
        alt:
          node.alt?.trim() ||
          node.getAttribute("aria-label")?.trim() ||
          `generated image ${images.length + 1}`,
        extensionHint: this.extractImaImageExtensionHint(node),
      })
    })

    return images
  }

  private formatImaAssistantImages(
    images: ImaAssistantImage[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportImageMarkdownList(images, collector, {
      siteId: this.getSiteId(),
      role: "assistant",
      category: "generated-image",
      fallbackAlt: "generated image",
    })
  }

  private extractImaImageSource(image: HTMLImageElement): string {
    const candidates = [
      image.closest("[data-card-url]")?.getAttribute("data-card-url") || "",
      image.currentSrc || "",
      image.src || "",
      image.getAttribute("src") || "",
      image.getAttribute("data-src") || "",
      image.getAttribute("data-image-url") || "",
      image.getAttribute("data-original-url") || "",
      image.getAttribute("data-origin-url") || "",
    ]

    for (const candidate of candidates) {
      const source = this.normalizeImaExportSource(candidate, { allowDataImage: true })
      if (source) return source
    }

    return ""
  }

  private extractImaDownloadableSource(
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
        candidates.push(this.extractImaImageSource(element))
      }

      if (!options.includeImages && element instanceof HTMLImageElement) {
        return
      }

      IMA_ATTACHMENT_SOURCE_ATTRS.forEach((attr) => {
        candidates.push(element.getAttribute(attr) || "")
      })
    })

    for (const candidate of candidates) {
      const source = this.normalizeImaExportSource(candidate, {
        allowDataImage: options.allowDataImage,
      })
      if (source) return source
    }

    return ""
  }

  private normalizeImaExportSource(value: string, options: { allowDataImage: boolean }): string {
    const raw = value.trim()
    if (!raw || raw.startsWith("#") || /^javascript:/i.test(raw)) return ""

    const source = normalizeExportAssetUrl(raw)
    if (!source) return ""
    if (/^data:image\/svg\+xml/i.test(source)) return ""
    if (/^data:image\//i.test(source)) return options.allowDataImage ? source : ""
    if (/^data:/i.test(source)) return source
    if (!isDownloadableExportAssetUrl(source)) return ""

    try {
      const url = new URL(source, window.location.href)
      if (
        url.hostname === IMA_HOSTNAME &&
        /^\/(?:chat|share|ai-chat)(?:\/|$)/i.test(url.pathname)
      ) {
        return ""
      }
      if (url.hostname === IMA_HOSTNAME && /\/(?:static|assets)\//i.test(url.pathname)) {
        return ""
      }
      if (/\/wupload\/xy\/(?:qb_tool|ima_tool)\//i.test(url.pathname)) {
        return ""
      }
      if (/\.(?:svg|ico)$/i.test(url.pathname) && /(?:icon|logo|sprite)/i.test(url.pathname)) {
        return ""
      }
    } catch {
      return ""
    }

    return source
  }

  private extractImaImageExtensionHint(image: HTMLImageElement): string {
    return (
      [
        image.currentSrc || "",
        image.src || "",
        image.getAttribute("src") || "",
        image.getAttribute("data-src") || "",
        image.closest("[data-card-url]")?.getAttribute("data-card-url") || "",
        image.alt || "",
      ]
        .map((value) => extractExportExtensionFromUrl(value) || extractExportExtension(value))
        .find(Boolean) || ""
    )
  }

  private extractCleanTextParts(root: Element): string[] {
    const clone = root.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.exportDecoration)
      .forEach((node) => node.remove())
    clone.querySelectorAll("img").forEach((node) => node.remove())

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

  private getImaAttachmentKeys(attachment: ImaUserAttachment): string[] {
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

  private extractDataAttributeFilename(element: Element): string {
    const candidates = [
      "data-file-name",
      "data-filename",
      "data-name",
      "title",
      "aria-label",
      "data-file-id",
      "data-doc-id",
      "data-resource-id",
    ]

    for (const attr of candidates) {
      const value = element.getAttribute(attr)?.trim()
      if (value) return value
    }

    return ""
  }

  private findUserMessageScope(element: Element): Element {
    if (element.matches(this.config.selectors.userQuery)) return element
    return element.closest(this.config.selectors.userQuery) || element
  }

  private findAssistantBubbleRoot(element: Element): HTMLElement | null {
    if (element.matches(this.config.sitePrivateSelectors.assistantBubble)) {
      return element as HTMLElement
    }

    const bubble = element.querySelector(this.config.sitePrivateSelectors.assistantBubble)
    if (bubble instanceof HTMLElement) return bubble

    const fallback = element.querySelector(this.config.sitePrivateSelectors.assistantBubbleFallback)
    if (fallback instanceof HTMLElement) return fallback

    return element instanceof HTMLElement ? element : null
  }

  private shouldSkipExportElement(element: Element): boolean {
    return element.closest(".gh-root, .gh-user-query-markdown") !== null
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

  private getActiveHistoryTitle(): string | null {
    const title = document.querySelector(this.config.sitePrivateSelectors.activeHistoryTitle)
    const text = title?.textContent?.trim() || ""
    return text || null
  }

  private findUserContentRoot(element: Element): Element | null {
    if (element.matches(this.config.sitePrivateSelectors.userText)) return element
    return (
      element.querySelector(this.config.sitePrivateSelectors.userText) ||
      element.querySelector("p") ||
      element
    )
  }

  private findAssistantMarkdownRoot(element: Element): Element | null {
    if (element.matches(this.config.sitePrivateSelectors.assistantMarkdown)) return element
    return element.querySelector(this.config.sitePrivateSelectors.assistantMarkdown)
  }

  private extractHeadingText(heading: Element): string {
    const clone = heading.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.inlineReference)
      .forEach((node) => node.remove())
    return this.extractTextWithLineBreaks(clone).trim()
  }

  private shouldIncludeThoughtsInExport(): boolean {
    if (this.exportIncludeThoughts !== undefined) {
      return this.exportIncludeThoughts
    }
    return false
  }

  private extractThoughtBlockquotes(element: Element): string[] {
    const thoughtNodes = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.thinking),
    )
    const blocks: string[] = []

    for (const thought of thoughtNodes) {
      const clone = thought.cloneNode(true) as HTMLElement
      clone
        .querySelectorAll(
          `${this.config.sitePrivateSelectors.thinkingTitle}, button, [role='button'], svg, [aria-hidden='true']`,
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
    const candidates = Array.from(
      document.querySelectorAll(this.config.generating.existsSelectors.join(", ")),
    )

    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement) || !this.isVisibleElement(candidate)) {
        continue
      }

      const clickableCandidates = [
        ...this.config.sitePrivateSelectors.stopButtonChildren.map((selector) =>
          candidate.querySelector(selector),
        ),
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
