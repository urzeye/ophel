/**
 * Qwen Studio 适配器（chat.qwen.ai）
 *
 * 说明：
 * - 与国内版 qianwen.com 完全独立，避免选择器/路由相互污染
 * - 对话列表优先走官方接口 /api/v2/chats/all，DOM 只做补充
 * - 输入框、导出、主题、模型选择器均基于 qwen.html 快照中的稳定类名和结构锚点
 */
import { SITE_IDS } from "~constants"
import {
  extractExportExtension,
  extractExportExtensionFromUrl,
  extractExportFilenameFromUrl,
  createExportAssetCollector,
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
import { loadCompleteHistoryForExport } from "~utils/history-loader"
import { t } from "~utils/i18n"
import {
  EVENT_OUTLINE_DATA_UPDATED,
  type MonitorResponseCaptureRule,
  type MonitorResponsePayload,
} from "~utils/messaging"
import { subscribeNetworkResponses } from "~utils/network-response-capture"
import { hashOutlineText } from "~utils/outline-heading-cache"
import {
  dropTrailingFillDuplicates,
  isApiOutlineStale,
  mergeByBranchMessageOrder,
  shouldAttemptApiOutlineFetch,
  type BranchMergeEntry,
} from "~utils/outline-api-source"

import {
  SiteAdapter,
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportCollectionReport,
  type ExportLifecycleContext,
  type ExportConfig,
  type FormulaCopySource,
  type MarkdownFixerConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type PanelAvoidanceConfig,
  type SiteDeleteConversationResult,
  type ZenModeConfig,
} from "./base"
import type { BuiltinSiteConfig } from "./declarative"
import {
  QWEN_STUDIO_CONFIG,
  QWEN_STUDIO_CONFIG_VERSION,
  type QwenStudioSiteConfig,
} from "./qwen-studio-config"
import {
  parseQwenHistoryOutline,
  resolveQwenActiveBranch,
  type QwenHistoryOutlineData,
} from "./qwen-studio-history-outline"

const QWENAI_CHAT_PATH_PATTERN = /\/c\/([a-f0-9-]+)/i
const QWENAI_THEME_STORAGE_KEY = "theme"
const QWENAI_THEME_COOKIE_KEY = "qwen-theme"
const QWENAI_TOKEN_STORAGE_KEY = "token"
const QWENAI_ACCESS_TOKEN_STATE_KEY = "qwen_access_token_state"
const QWENAI_MERMAID_EXPORT_SWITCHED_ATTR = "data-ophel-qwenai-mermaid-export-switched"
const QWENAI_ATTACHMENT_SOURCE_ATTRS = [
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
const QWENAI_CONVERSATION_SNAPSHOT_TTL_MS = 30_000
const QWENAI_CONVERSATION_SNAPSHOT_RETRY_MS = 30_000
const QWENAI_CHAT_LIST_PATH = "/api/v2/chats/all"
// 新对话要等回复完成才有正式标题，页面会自己轮询列表接口直到拿到；复用它的响应，不另行轮询
const QWENAI_CHAT_LIST_CAPTURE: MonitorResponseCaptureRule = {
  id: `${SITE_IDS.QWENAI}:chat-list`,
  method: "GET",
  // 页面自己请求的是 /api/v2/chats/，末尾斜杠可有可无
  pathPattern: "^/api/v2/chats/?$",
}
const QWENAI_FETCH_PAGE_LIMIT = 100
const QWENAI_BOOTSTRAP_PAGE_LIMIT = 5
// 单对话接口的 limit 按“轮次”计，100 轮约 200 条消息；更早历史用 cursor 向前翻页。
const QWENAI_CHAT_API_PAGE_LIMIT = 100
const QWENAI_CHAT_API_MAX_PAGES = 100
const QWENAI_API_OUTLINE_FETCH_BACKOFF_MS = 10_000
const QWENAI_API_OUTLINE_BOTTOM_TOLERANCE_PX = 100
const QWENAI_API_OUTLINE_REVEAL_MAX_ROUNDS = 60
const QWENAI_API_OUTLINE_REVEAL_WAIT_MS = 600
const QWENAI_API_OUTLINE_LAYOUT_STABLE_INTERVAL_MS = 80
const QWENAI_API_OUTLINE_LAYOUT_STABLE_ROUNDS = 3
const QWENAI_API_OUTLINE_LAYOUT_STABLE_MAX_ROUNDS = 15
const QWENAI_API_OUTLINE_LAYOUT_STABLE_TOLERANCE_PX = 2
const QWENAI_API_OUTLINE_HEADING_MAX_ATTEMPTS = 12
const QWENAI_API_OUTLINE_HEADING_RETRY_MS = 100
const QWENAI_API_OUTLINE_JUMP_RETRY_DELAYS_MS = [0, 80, 200, 500, 900]
const QWENAI_API_OUTLINE_JUMP_CLEANUP_DELAY_MS = 300

interface QwenAiConversationApiResponse {
  success?: boolean
  data?: unknown
}

interface QwenAiSettingsUpdateResponse {
  success?: boolean
  data?: unknown
}

interface QwenAiExportLifecycleState {
  shouldCloseThoughtPanel: boolean
  usedApiExport: boolean
}

interface QwenAiChatApiFile {
  name?: string
  type?: string
  file_type?: string
  url?: string
  size?: number
}

interface QwenAiChatApiContentPhase {
  phase?: string
  content?: string
  extra?: {
    summary_title?: { content?: string[] }
    summary_thought?: { content?: string[] }
    image_list?: Array<{ image?: string }>
    tool_result?: Array<{ image?: string }>
  } | null
}

// 字段口径以 2026-10-30 的真实响应为准：消息用 camelCase 的 parentId（根消息为 null），
// pagination 用 snake_case，content_list 阶段名见 thinking_summary / answer 等。
interface QwenAiChatApiMessage {
  id?: string
  role?: string
  content?: string
  reasoning_content?: string
  parentId?: string | null
  files?: QwenAiChatApiFile[]
  content_list?: QwenAiChatApiContentPhase[]
  timestamp?: number
}

interface QwenAiChatApiPagination {
  oldest_id?: string | null
  has_more_older?: boolean
  has_more_newer?: boolean
  path_count?: number
}

interface QwenAiChatApiHistory {
  messages?: Record<string, QwenAiChatApiMessage>
  currentId?: string | null
  currentResponseIds?: string[] | string | null
  pagination?: QwenAiChatApiPagination | null
}

interface QwenAiChatApiChat {
  id?: string
  title?: string
  history?: QwenAiChatApiHistory
}

interface QwenAiChatApiData extends QwenAiChatApiChat {
  chat?: QwenAiChatApiChat
}

interface QwenAiChatApiResponse {
  success?: boolean
  data?: QwenAiChatApiData
}

interface QwenAiUserAttachment {
  kind: "image" | "file"
  name: string
  source: string
  type: string
  sizeLabel?: string
}

interface QwenAiAssistantImage {
  source: string
  alt: string
}

type QwenAiModelLockFailureReason = "button_not_found" | "menu_empty" | "not_found"

/** success:false 的响应是 HTTP 200，data 形如 { code, details }（如 Unauthorized），附进错误信息便于定位 */
const formatQwenApiErrorDetail = (data: unknown): string => {
  if (!data || typeof data !== "object") return ""
  const { code, details } = data as { code?: unknown; details?: unknown }
  const parts = [code, details].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  )
  return parts.length > 0 ? ` (${parts.join(": ")})` : ""
}

export class QwenAiAdapter extends SiteAdapter {
  protected config: QwenStudioSiteConfig = QWEN_STUDIO_CONFIG
  private conversationSnapshot: ConversationInfo[] = []
  private conversationSnapshotFetchedAt = 0
  private conversationSnapshotRetryAt = 0
  // 进行中的刷新；resolve 为 true 表示该次请求的范围已完整拿到（失败或不完整为 false）
  private conversationSnapshotPromise: Promise<boolean> | null = null
  private conversationSnapshotFetchesAll = false
  private conversationListListeners = new Set<() => void>()
  private stopConversationListCapture: (() => void) | null = null
  private exportIncludeThoughtsOverride: boolean | null = null
  private exportApiMessages: ExportMessage[] | null = null
  private exportApiBundle: ExportBundle | null = null
  // 接口导出失败回退 DOM 且历史加载未收敛时记录一份「可能缺开头」的报告，供 manager 提示
  private exportCollectionReport: ExportCollectionReport | null = null
  private exportThoughtBlocks = new WeakMap<Element, string[]>()
  private apiOutlineData: QwenHistoryOutlineData | null = null
  private apiOutlineFetchPromise: Promise<void> | null = null
  private apiOutlineLastFetchAt = 0
  private apiOutlineParseFailures = 0
  private apiOutlineSessionId = ""
  private apiOutlineWasGenerating = false
  private apiOutlineForceRefetch = false
  private outlineJumpRequestSeq = 0
  // 回填跳转为触发懒加载会把容器滚到顶，这里记下滚动前的位置，跳转最终没有目标时还原
  private outlineRevealOrigin: number | null = null
  private outlineJumpTargetResolvers = new WeakMap<Element, () => Element | null>()

  afterPropertiesSet(
    options: { modelLockConfig?: { enabled: boolean; keyword: string } } = {},
  ): void {
    super.afterPropertiesSet(options)
    void this.refreshConversationSnapshot()
  }

  match(): boolean {
    return window.location.hostname === "chat.qwen.ai"
  }

  getSiteId(): string {
    return SITE_IDS.QWENAI
  }

  getName(): string {
    return "Qwen Studio"
  }

  getBuiltinConfig(): QwenStudioSiteConfig {
    return QWEN_STUDIO_CONFIG
  }

  getBuiltinConfigVersion(): number {
    return QWEN_STUDIO_CONFIG_VERSION
  }

  applyMergedConfig(config: BuiltinSiteConfig): void {
    this.config = config as QwenStudioSiteConfig
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#4f6bff", secondary: "#3047c7" }
  }

  getQuickQuoteSupportMode() {
    return this.config.quickQuote
  }

  supportsHostThemeSync(): boolean {
    return this.config.supportsHostThemeSync
  }

  getSessionId(): string {
    const match = window.location.pathname.match(QWENAI_CHAT_PATH_PATTERN)
    return match?.[1] || super.getSessionId()
  }

  isNewConversation(): boolean {
    const path = window.location.pathname.replace(/\/+$/, "") || "/"
    return path === "/"
  }

  isSharePage(): boolean {
    // 自有对话：/chat/...    分享对话：/s/ID
    return window.location.pathname.startsWith("/s/")
  }

  isUserConversationPage(): boolean {
    return !this.isSharePage() && QWENAI_CHAT_PATH_PATTERN.test(window.location.pathname)
  }

  getCurrentCid(): string | null {
    const fromCookie = this.readCookieValue("aui") || this.readCookieValue("cnaui")
    if (fromCookie) return fromCookie
    // 与接口鉴权同一取数口径：站点已把 token 迁到 qwen_access_token_state，旧 token 可能是上个账号残留
    return this.extractUidFromToken(this.getQwenAccessToken())
  }

  getSessionName(): string | null {
    const title = this.getDocumentConversationTitle() || ""
    if (!title) return null

    const cleaned = title
      .replace(/\s*[-|]\s*Qwen(?:AI| Chat| Studio)?$/i, "")
      .replace(/^Qwen(?:AI| Chat| Studio)?\s*[-|]\s*/i, "")
      .trim()

    if (!cleaned || /^(qwen(?:ai|\s*chat|\s*studio)?)$/i.test(cleaned)) {
      return null
    }

    return cleaned
  }

  getNewTabUrl(): string {
    return "https://chat.qwen.ai/"
  }

  getConversationTitle(): string | null {
    const sessionId = this.getSessionId()
    if (sessionId && sessionId !== "default") {
      const matched = this.getConversationList().find((item) => item.id === sessionId)
      if (matched?.title) return matched.title
      void this.refreshConversationSnapshot()
    }

    return this.getSessionName()
  }

  getConversationList(): ConversationInfo[] {
    const domList = this.collectConversationListFromDom()
    const snapshot = this.getFreshConversationSnapshot()

    if (domList.length === 0) {
      if (snapshot.length === 0) {
        void this.refreshConversationSnapshot()
      }
      return snapshot
    }

    if (snapshot.length === 0) {
      void this.refreshConversationSnapshot()
      return domList
    }

    return this.mergeConversationInfos(snapshot, domList)
  }

  /**
   * 侧边栏没有对话 ID，DOM 观察器同步不到对话，列表只能来自接口快照：
   * 订阅期间转发页面自己的列表接口响应并入快照，有变化就回调同步。
   * 只在「订阅时补同步」和「收到页面响应」两处回调，快照刷新本身不回调，
   * 否则手动同步与首次全量同步的新增计数会被这里提前消费。
   */
  onConversationListChange(callback: () => void): () => void {
    this.conversationListListeners.add(callback)
    if (!this.stopConversationListCapture) {
      this.stopConversationListCapture = subscribeNetworkResponses(
        QWENAI_CHAT_LIST_CAPTURE,
        (response) => this.applyCapturedConversationPage(response),
      )
    }

    // 刷新页面后 store 可能落后于站点：订阅时先确保快照可用，再补同步一次
    void this.refreshConversationSnapshot().then(() => {
      if (this.conversationListListeners.has(callback)) callback()
    })

    return () => {
      this.conversationListListeners.delete(callback)
      if (this.conversationListListeners.size > 0) return
      this.stopConversationListCapture?.()
      this.stopConversationListCapture = null
    }
  }

  private getConversationUrl(id: string): string {
    const path = this.config.conversation.urlTemplate.replace("{id}", id)
    return new URL(path, window.location.origin).href
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    const conversation = this.config.conversation
    return {
      selector: conversation.itemSelector,
      shadow: conversation.shadow ?? false,
      extractInfo: (el) =>
        this.extractSidebarConversationInfo(el, this.getCurrentCid() || undefined),
      getTitleElement: (el) =>
        (conversation.titleSelector ? el.querySelector(conversation.titleSelector) : null) || el,
    }
  }

  getSidebarScrollContainer(): Element | null {
    const privateSelectors = this.config.sitePrivateSelectors
    return (
      document.querySelector(
        `:is(${privateSelectors.sidebarRoot}) :is(${privateSelectors.sidebarScroll})`,
      ) ||
      document.querySelector(privateSelectors.sidebarScroll) ||
      document.querySelector(privateSelectors.sidebarRoot)
    )
  }

  /**
   * 返回 false 表示没能拿到完整列表（请求失败、置顶接口失败或页数触顶）：
   * 调用方据此不做「同步删除」，否则会拿残缺列表去清本地记录。
   */
  async loadAllConversations(): Promise<boolean> {
    return this.refreshConversationSnapshot({ force: true, fetchAllPages: true })
  }

  navigateToConversation(id: string, url?: string): boolean {
    const cid = this.getCurrentCid() || undefined
    const nodes = document.querySelectorAll(this.config.conversation.itemSelector)

    if (this.config.conversation.navigationStrategy === "click-item") {
      for (const node of Array.from(nodes)) {
        const info = this.extractSidebarConversationInfo(node, cid)
        if (!info || info.id !== id) continue

        const clickable =
          (node.querySelector("a, button, [role='button']") as HTMLElement | null) ||
          (node as HTMLElement)
        this.simulateClick(clickable)
        return true
      }
    }

    // 降级：优先 history 导航免刷新（路由响应 popstate，已实测），失败再整页刷新
    const targetUrl = url || this.getConversationUrl(id)
    if (this.navigateViaHistory(targetUrl)) return true
    return super.navigateToConversation(id, targetUrl)
  }

  async deleteConversationOnSite(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    const id = typeof target.id === "string" ? target.id.trim() : ""
    if (!id) {
      return { id: target.id, success: false, method: "none", reason: "invalid_conversation_id" }
    }

    const authorization = this.getQwenAuthorizationHeader()
    if (!authorization) {
      return { id, success: false, method: "api", reason: "missing_auth_token" }
    }

    try {
      const response = await fetch(
        new URL(`/api/v2/chats/${encodeURIComponent(id)}`, window.location.origin).toString(),
        {
          method: "DELETE",
          credentials: "include",
          cache: "no-store",
          headers: {
            Authorization: authorization,
            Accept: "application/json, text/plain, */*",
            "X-Request-Id": crypto.randomUUID(),
            source: "web",
          },
        },
      )

      if (!response.ok) {
        return { id, success: false, method: "api", reason: `http_${response.status}` }
      }

      const payload = (await response.json().catch(() => null)) as { success?: boolean } | null
      if (payload?.success === false) {
        return { id, success: false, method: "api", reason: "response_unsuccessful" }
      }

      this.conversationSnapshot = this.conversationSnapshot.filter((item) => item.id !== id)
      return { id, success: true, method: "api" }
    } catch (error) {
      console.warn("[QwenAiAdapter] Failed to delete conversation:", error)
      return { id, success: false, method: "api", reason: "request_failed" }
    }
  }

  getTextareaSelectors(): string[] {
    return [...this.config.selectors.textarea]
  }

  getSubmitKeyConfig(): { key: "Enter" | "Ctrl+Enter" } {
    return { key: this.config.input.submitKey ?? "Enter" }
  }

  insertPrompt(content: string): boolean {
    const textarea = this.getTextareaElement() as HTMLTextAreaElement | null
    if (!textarea || !textarea.isConnected) return false

    textarea.focus()

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    if (setter) {
      setter.call(textarea, content)
    } else {
      textarea.value = content
    }

    textarea.dispatchEvent(
      new InputEvent("input", { bubbles: true, composed: true, data: content }),
    )
    textarea.dispatchEvent(new Event("change", { bubbles: true }))
    textarea.setSelectionRange(content.length, content.length)
    return true
  }

  clearTextarea(): void {
    const textarea = this.getTextareaElement() as HTMLTextAreaElement | null
    if (!textarea || !textarea.isConnected) return

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    if (setter) {
      setter.call(textarea, "")
    } else {
      textarea.value = ""
    }

    textarea.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: "",
      }),
    )
    textarea.dispatchEvent(new Event("change", { bubbles: true }))
    textarea.setSelectionRange(0, 0)
  }

  getSubmitButtonSelectors(): string[] {
    return [...this.config.selectors.submitButton]
  }

  findSubmitButton(): HTMLElement | null {
    const button = document.querySelector(
      this.config.sitePrivateSelectors.composerButton,
    ) as HTMLElement | null
    if (!this.isVisibleActionElement(button)) return null
    if (button.hasAttribute("disabled")) return null
    if (this.isStopLikeButton(button)) return null
    return button
  }

  getNewChatButtonSelectors(): string[] {
    return [...this.config.selectors.newChatButton]
  }

  getScrollContainer(): HTMLElement | null {
    for (const selector of this.config.selectors.scrollContainer) {
      const container = document.querySelector(selector)
      if (container instanceof HTMLElement) return container
    }
    return null
  }

  getResponseContainerSelector(): string {
    return this.config.selectors.responseContainer
  }

  getAssistantMermaidSupportMode() {
    return this.config.mermaidSupport
  }

  extractFormulaCopySource(target: Element, formulaHost: Element): FormulaCopySource | null {
    const latexHost =
      target.closest(this.config.sitePrivateSelectors.latex) ||
      formulaHost.closest(this.config.sitePrivateSelectors.latex)
    if (!latexHost) return null

    const math = latexHost.querySelector("math")
    if (!math) return null

    const latex = this.extractQwenLatexFromMath(math)
    const mathml = this.serializeQwenMathml(math)
    if (!latex && !mathml) return null

    return {
      latex,
      mathml,
      isBlock:
        !!latexHost.closest(this.config.sitePrivateSelectors.latexDisplay) ||
        math.getAttribute("display") === "block",
    }
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

  extractUserQueryText(element: Element): string {
    const contentRoot = this.findUserContentRoot(element)
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

  private extractAssistantMarkdown(element: Element): string {
    const contentRoot = this.findAssistantContentRoot(element)
    if (!contentRoot) return ""

    const includeThoughts = this.shouldIncludeThoughtsInExport()
    const thoughtBlocks = includeThoughts ? this.getThoughtBlocksForElement(element) : []

    const clone = contentRoot.cloneNode(true) as HTMLElement
    this.normalizeQwenCodeBlocks(clone)

    clone
      .querySelectorAll(
        `${this.config.sitePrivateSelectors.exportDecoration}, ${this.config.sitePrivateSelectors.assistantGeneratedImageCard}`,
      )
      .forEach((node) => node.remove())

    const markdown = htmlToMarkdown(clone) || this.extractTextWithLineBreaks(clone)
    const normalizedBody = markdown.trim()

    if (includeThoughts && thoughtBlocks.length > 0) {
      const thoughtSection = thoughtBlocks.join("\n\n")
      return normalizedBody ? `${thoughtSection}\n\n${normalizedBody}` : thoughtSection
    }

    return normalizedBody
  }

  private extractAssistantResponseTextWithAssets(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    const body = this.extractAssistantMarkdown(element)
    const imageMarkdown = this.formatQwenAssistantImages(
      this.extractQwenAssistantImages(element),
      collector,
    )

    return [body, imageMarkdown.join("\n\n")].filter(Boolean).join("\n\n")
  }

  getLastCodeBlockText(): string | null {
    const responses = document.querySelectorAll(this.config.selectors.assistantResponse)

    for (let i = responses.length - 1; i >= 0; i -= 1) {
      const contentRoot = this.findAssistantContentRoot(responses[i])
      if (!contentRoot) continue

      const codeBlocks = Array.from(
        contentRoot.querySelectorAll(this.config.sitePrivateSelectors.codeBlock),
      )
      for (let j = codeBlocks.length - 1; j >= 0; j -= 1) {
        const codeText = this.extractQwenCodeBlockText(codeBlocks[j])
        if (codeText) return codeText
      }
    }

    return super.getLastCodeBlockText()
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const items: OutlineItem[] = []
    const container =
      document.querySelector(this.config.selectors.responseContainer) || this.getScrollContainer()
    if (!container) return items
    this.maybeRefreshApiOutline(container)

    const userQuerySelector = this.config.selectors.userQuery
    const assistantResponseSelector = this.config.selectors.assistantResponse

    const blocks = this.collectTopLevelBlocks(
      Array.from(
        container.querySelectorAll(`${userQuerySelector}, ${assistantResponseSelector}`),
      ).filter((el) => !el.closest(".gh-root")),
    )
    const apiData =
      this.apiOutlineData && this.apiOutlineData.sessionId === this.getSessionId()
        ? this.apiOutlineData
        : null
    const assistantIdByBlock = new WeakMap<Element, string>()
    blocks.forEach((block) => {
      if (!block.matches(assistantResponseSelector)) return
      const messageId = this.extractQwenAssistantMessageId(block)
      if (messageId) assistantIdByBlock.set(block, messageId)
    })
    const getNextAssistantMessageId = (startIndex: number): string => {
      for (let i = startIndex + 1; i < blocks.length; i += 1) {
        if (blocks[i].matches(userQuerySelector)) return ""
        if (blocks[i].matches(assistantResponseSelector)) {
          return assistantIdByBlock.get(blocks[i]) || ""
        }
      }
      return ""
    }

    const domEntries: BranchMergeEntry<OutlineItem>[] = []
    const domHeadingAssistantIds = new Set<string>()
    const domQueryMessageIds = new Set<string>()

    blocks.forEach((block, index) => {
      const isUserBlock = block.matches(userQuerySelector)

      if (isUserBlock) {
        if (!includeUserQueries) return

        const text = this.extractUserQueryText(block)
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          const nextAnswer = blocks
            .slice(index + 1)
            .find((el) => el.matches(assistantResponseSelector))
          wordCount = nextAnswer ? this.extractAssistantPlainText(nextAnswer).length : 0
        }

        const item: OutlineItem = {
          level: 0,
          text: this.truncateText(text, 80),
          element: block,
          isUserQuery: true,
          isTruncated: text.length > 80,
          wordCount,
        }
        items.push(item)

        const nextAssistantId = getNextAssistantMessageId(index)
        const queryMessageId = nextAssistantId
          ? apiData?.queryMessageIdByAssistantId.get(nextAssistantId) ?? null
          : null
        if (queryMessageId) domQueryMessageIds.add(queryMessageId)
        domEntries.push({
          messageId: queryMessageId || nextAssistantId || null,
          item,
        })
        return
      }

      const headings = Array.from(block.querySelectorAll("h1, h2, h3, h4, h5, h6")).filter(
        (heading) =>
          !heading.closest(this.config.sitePrivateSelectors.thinkingCard) &&
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

        const item: OutlineItem = {
          level,
          text,
          element: heading,
          wordCount,
        }
        items.push(item)

        const assistantId = assistantIdByBlock.get(block) || ""
        if (assistantId) domHeadingAssistantIds.add(assistantId)
        domEntries.push({ messageId: assistantId || null, item })
      })
    })

    if (!apiData) return items
    return this.mergeQwenOutlineByBranchOrder(
      domEntries,
      domHeadingAssistantIds,
      domQueryMessageIds,
      apiData,
      { maxLevel, includeUserQueries, showWordCount },
    )
  }

  async resolveOutlineTarget(
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery" | "id" | "navigationId">,
    queryIndex?: number,
  ): Promise<Element | null> {
    const requestId = ++this.outlineJumpRequestSeq
    let target: Element | null = null
    try {
      target = await this.resolveQwenOutlineTarget(item, queryIndex, requestId)
      return target
    } finally {
      // 只有最新一次请求负责收尾（含异常路径）；被取代的请求把滚动起点交给后继者
      if (requestId === this.outlineJumpRequestSeq) this.settleOutlineReveal(target !== null)
    }
  }

  /** 跳转结束：找到目标由随后的跳转接管视口，没有目标则回到触发懒加载前的位置 */
  private settleOutlineReveal(found: boolean): void {
    const origin = this.outlineRevealOrigin
    this.outlineRevealOrigin = null
    if (found || origin === null) return

    const container = this.getScrollContainer()
    if (container) container.scrollTop = origin
  }

  private async resolveQwenOutlineTarget(
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery" | "id" | "navigationId">,
    queryIndex: number | undefined,
    requestId: number,
  ): Promise<Element | null> {
    const ref = item.navigationId || item.id || ""
    const data =
      this.apiOutlineData && this.apiOutlineData.sessionId === this.getSessionId()
        ? this.apiOutlineData
        : null

    const headingRef = this.parseQwenApiHeadingItemId(ref)
    if (headingRef && data) {
      const target = await this.resolveQwenApiHeadingTarget(headingRef, item.text, requestId)
      if (requestId !== this.outlineJumpRequestSeq) return null
      if (target) {
        this.outlineJumpTargetResolvers.set(target, () =>
          this.findQwenApiHeadingTargetNow(headingRef, item.text),
        )
        return target
      }
    }

    const queryMessageId = this.parseQwenApiUserQueryItemId(ref)
    if (queryMessageId && data) {
      const target = await this.resolveQwenApiUserQueryTarget(
        queryMessageId,
        item.text,
        data,
        requestId,
      )
      if (requestId !== this.outlineJumpRequestSeq) return null
      if (target) {
        this.outlineJumpTargetResolvers.set(target, () =>
          this.findQwenApiUserQueryTargetNow(queryMessageId, item.text, data),
        )
        return target
      }
    }

    if (requestId !== this.outlineJumpRequestSeq) return null
    return super.resolveOutlineTarget(item, queryIndex)
  }

  scrollToOutlineSourceTarget(element: HTMLElement, sourceId = "conversation"): void {
    // 任何新的跳转都取代进行中的回填定位（含跳到已挂载条目），否则后者还会把容器滚回顶部
    const requestId = ++this.outlineJumpRequestSeq
    this.outlineRevealOrigin = null

    const resolveTarget = this.outlineJumpTargetResolvers.get(element)
    if (sourceId !== "conversation" || !resolveTarget) {
      super.scrollToOutlineSourceTarget(element, sourceId)
      return
    }

    // 目标出现后 Qwen 仍可能继续插入旧消息并修正滚动位置；短时重锚定以最后一次跳转为准。
    const container = this.getOutlineScrollContainer(sourceId)
    const timers: number[] = []
    let disposed = false
    let cancelOnUserIntent = () => {}
    const dispose = () => {
      if (disposed) return
      disposed = true
      timers.forEach((timer) => window.clearTimeout(timer))
      container?.removeEventListener("wheel", cancelOnUserIntent)
      container?.removeEventListener("touchmove", cancelOnUserIntent)
      container?.removeEventListener("pointerdown", cancelOnUserIntent)
    }
    cancelOnUserIntent = () => {
      if (requestId !== this.outlineJumpRequestSeq || disposed) return
      this.outlineJumpRequestSeq += 1
      dispose()
    }

    container?.addEventListener("wheel", cancelOnUserIntent, { passive: true })
    container?.addEventListener("touchmove", cancelOnUserIntent, { passive: true })
    container?.addEventListener("pointerdown", cancelOnUserIntent, { passive: true })

    const attempt = () => {
      if (requestId !== this.outlineJumpRequestSeq || disposed) {
        dispose()
        return
      }
      const target = resolveTarget()
      if (target?.isConnected) {
        super.scrollToOutlineTarget(target as HTMLElement)
      }
    }

    QWENAI_API_OUTLINE_JUMP_RETRY_DELAYS_MS.forEach((delay) => {
      timers.push(window.setTimeout(attempt, delay))
    })
    const lastDelay = QWENAI_API_OUTLINE_JUMP_RETRY_DELAYS_MS.at(-1) ?? 0
    timers.push(window.setTimeout(dispose, lastDelay + QWENAI_API_OUTLINE_JUMP_CLEANUP_DELAY_MS))
  }

  private parseQwenApiHeadingItemId(
    id: string,
  ): { messageId: string; level: number; orderInMessage: number } | null {
    const match = id.match(/^qwen:api-h:(.+):(\d+):(\d+):[0-9a-f]+$/)
    if (!match) return null
    return {
      messageId: match[1],
      level: Number(match[2]),
      orderInMessage: Number(match[3]),
    }
  }

  private parseQwenApiUserQueryItemId(id: string): string | null {
    return id.match(/^qwen:api-u:(.+)$/)?.[1] || null
  }

  private async resolveQwenApiHeadingTarget(
    ref: { messageId: string; level: number; orderInMessage: number },
    text: string,
    requestId: number,
  ): Promise<Element | null> {
    const message = await this.revealQwenAssistantMessage(ref.messageId, requestId)
    if (!message || requestId !== this.outlineJumpRequestSeq) return null
    return (
      (await this.findQwenApiHeadingInBlock(
        message,
        ref.level,
        ref.orderInMessage,
        text,
        requestId,
      )) || message
    )
  }

  private async resolveQwenApiUserQueryTarget(
    messageId: string,
    text: string,
    data: QwenHistoryOutlineData,
    requestId: number,
  ): Promise<Element | null> {
    const query = data.userQueries.find((entry) => entry.messageId === messageId)
    if (!query) return null

    const assistantId = data.assistantIdByQueryIndex.get(query.queryIndex)
    if (assistantId) {
      const message = await this.revealQwenAssistantMessage(assistantId, requestId)
      if (requestId !== this.outlineJumpRequestSeq) return null
      if (message) {
        return this.findPreviousQwenUserBlock(message) || message
      }
    }

    if (requestId !== this.outlineJumpRequestSeq) return null
    return this.findUserQueryElement(query.queryIndex, text || query.text)
  }

  private findQwenApiHeadingTargetNow(
    ref: { messageId: string; level: number; orderInMessage: number },
    text: string,
  ): Element | null {
    const message = this.findQwenAssistantBlockById(ref.messageId)
    if (!message) return null
    return (
      this.findQwenApiHeadingInBlockNow(message, ref.level, ref.orderInMessage, text) || message
    )
  }

  private findQwenApiUserQueryTargetNow(
    messageId: string,
    text: string,
    data: QwenHistoryOutlineData,
  ): Element | null {
    const query = data.userQueries.find((entry) => entry.messageId === messageId)
    if (!query) return null

    const assistantId = data.assistantIdByQueryIndex.get(query.queryIndex)
    if (assistantId) {
      const message = this.findQwenAssistantBlockById(assistantId)
      if (message) return this.findPreviousQwenUserBlock(message) || message
    }

    return this.findUserQueryElement(query.queryIndex, text || query.text)
  }

  private async revealQwenAssistantMessage(
    messageId: string,
    requestId: number,
  ): Promise<Element | null> {
    const findMessage = () => this.findQwenAssistantBlockById(messageId)
    const existing = findMessage()
    if (existing) return existing

    const container = this.getScrollContainer()
    if (!container || container.scrollHeight <= container.clientHeight) return null

    // 连续被取代的几次跳转共用同一个起点：后继者不能把已被滚到顶部的位置当成「原位置」
    if (this.outlineRevealOrigin === null) this.outlineRevealOrigin = container.scrollTop

    // 用户自己滚动 = 放弃这次跳转，并且不再还原位置。派发的合成 wheel 不是用户操作（isTrusted 为 false）
    const cancelOnUserIntent = (event: Event) => {
      if (!event.isTrusted || requestId !== this.outlineJumpRequestSeq) return
      this.outlineJumpRequestSeq += 1
      this.outlineRevealOrigin = null
    }
    const userIntentEvents = ["wheel", "touchmove", "pointerdown"] as const
    userIntentEvents.forEach((name) =>
      container.addEventListener(name, cancelOnUserIntent, { passive: true }),
    )

    let lastHeight = container.scrollHeight
    let stableRounds = 0

    try {
      for (let round = 0; round < QWENAI_API_OUTLINE_REVEAL_MAX_ROUNDS; round += 1) {
        if (requestId !== this.outlineJumpRequestSeq) return null
        container.scrollTop = 0
        container.dispatchEvent(new Event("scroll", { bubbles: true }))
        container.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY: -900,
          }),
        )
        await this.sleep(QWENAI_API_OUTLINE_REVEAL_WAIT_MS)

        const message = findMessage()
        if (message) {
          const stableMessage = await this.waitForQwenMessageLayoutStable(messageId, requestId)
          if (requestId !== this.outlineJumpRequestSeq) return null
          if (stableMessage) return stableMessage
        }

        if (container.scrollHeight === lastHeight) {
          stableRounds += 1
          if (stableRounds >= 2) break
        } else {
          lastHeight = container.scrollHeight
          stableRounds = 0
        }
      }
      return null
    } finally {
      userIntentEvents.forEach((name) => container.removeEventListener(name, cancelOnUserIntent))
    }
  }

  private async waitForQwenMessageLayoutStable(
    messageId: string,
    requestId: number,
  ): Promise<Element | null> {
    const container = this.getScrollContainer()
    if (!container) return this.findQwenAssistantBlockById(messageId)

    let lastMessage: Element | null = null
    let lastTop = Number.NaN
    let lastHeight = Number.NaN
    let lastScrollHeight = -1
    let stableRounds = 0

    for (let round = 0; round < QWENAI_API_OUTLINE_LAYOUT_STABLE_MAX_ROUNDS; round += 1) {
      if (requestId !== this.outlineJumpRequestSeq) return null

      const message = this.findQwenAssistantBlockById(messageId)
      if (message) {
        const containerRect = container.getBoundingClientRect()
        const rect = message.getBoundingClientRect()
        const top = rect.top - containerRect.top + container.scrollTop
        const height = rect.height
        const scrollHeight = container.scrollHeight
        const sameLayout =
          message === lastMessage &&
          Math.abs(top - lastTop) <= QWENAI_API_OUTLINE_LAYOUT_STABLE_TOLERANCE_PX &&
          Math.abs(height - lastHeight) <= QWENAI_API_OUTLINE_LAYOUT_STABLE_TOLERANCE_PX &&
          scrollHeight === lastScrollHeight

        stableRounds = sameLayout ? stableRounds + 1 : 0
        if (stableRounds >= QWENAI_API_OUTLINE_LAYOUT_STABLE_ROUNDS) return message

        lastMessage = message
        lastTop = top
        lastHeight = height
        lastScrollHeight = scrollHeight
      } else {
        stableRounds = 0
        lastMessage = null
        lastTop = Number.NaN
        lastHeight = Number.NaN
        lastScrollHeight = -1
      }

      await this.sleep(QWENAI_API_OUTLINE_LAYOUT_STABLE_INTERVAL_MS)
    }

    if (requestId !== this.outlineJumpRequestSeq) return null
    return this.findQwenAssistantBlockById(messageId)
  }

  private findQwenAssistantBlockById(messageId: string): Element | null {
    const selector = this.config.selectors.assistantResponse
    const directIds = [
      `chat-response-message-${messageId}`,
      `qwen-chat-message-assistant-${messageId}`,
    ]
    for (const id of directIds) {
      const element = document.getElementById(id)
      const block = element?.closest(selector)
      if (block) return block
    }

    const blocks = document.querySelectorAll(selector)
    for (const block of Array.from(blocks)) {
      if (this.extractQwenAssistantMessageId(block) === messageId) return block
    }
    return null
  }

  private findPreviousQwenUserBlock(message: Element): Element | null {
    const root = this.getQwenExportRoot()
    const userSelector = this.config.selectors.userQuery
    const assistantSelector = this.config.selectors.assistantResponse
    const blocks = this.collectTopLevelBlocks(
      Array.from(root.querySelectorAll(`${userSelector}, ${assistantSelector}`)),
    )
    const index = blocks.findIndex((block) => block === message || block.contains(message))
    for (let i = index - 1; i >= 0; i -= 1) {
      if (blocks[i].matches(userSelector)) return blocks[i]
      if (blocks[i].matches(assistantSelector)) return null
    }
    return null
  }

  private async findQwenApiHeadingInBlock(
    message: Element,
    level: number,
    orderInMessage: number,
    text: string,
    requestId: number,
  ): Promise<Element | null> {
    for (let attempt = 0; attempt < QWENAI_API_OUTLINE_HEADING_MAX_ATTEMPTS; attempt += 1) {
      if (requestId !== this.outlineJumpRequestSeq) return null
      const heading = this.findQwenApiHeadingInBlockNow(message, level, orderInMessage, text)
      if (heading) return heading
      await this.sleep(QWENAI_API_OUTLINE_HEADING_RETRY_MS)
    }
    return null
  }

  private findQwenApiHeadingInBlockNow(
    message: Element,
    level: number,
    orderInMessage: number,
    text: string,
  ): Element | null {
    const normalizedTarget = text.replace(/\s+/g, " ").trim()
    const headings = Array.from(message.querySelectorAll("h1, h2, h3, h4, h5, h6")).filter(
      (heading) =>
        !heading.closest(this.config.sitePrivateSelectors.thinkingCard) &&
        !this.isInRenderedMarkdownContainer(heading),
    )
    const direct = headings[orderInMessage]
    if (direct && parseInt(direct.tagName[1], 10) === level) {
      const directText = (direct.textContent || "").replace(/\s+/g, " ").trim()
      if (directText === normalizedTarget) return direct
    }

    const precise = headings.find((heading) => {
      if (parseInt(heading.tagName[1], 10) !== level) return false
      const candidate = (heading.textContent || "").replace(/\s+/g, " ").trim()
      return candidate === normalizedTarget
    })
    if (precise) return precise
    if (direct && parseInt(direct.tagName[1], 10) === level) return direct
    return null
  }

  private mergeQwenOutlineByBranchOrder(
    domEntries: BranchMergeEntry<OutlineItem>[],
    domHeadingAssistantIds: ReadonlySet<string>,
    domQueryMessageIds: ReadonlySet<string>,
    data: QwenHistoryOutlineData,
    options: { maxLevel: number; includeUserQueries: boolean; showWordCount: boolean },
  ): OutlineItem[] {
    const { maxLevel, includeUserQueries, showWordCount } = options
    const fillQueryEntries: BranchMergeEntry<OutlineItem>[] = []
    const fillHeadingEntries: BranchMergeEntry<OutlineItem>[] = []

    if (includeUserQueries) {
      for (const query of data.userQueries) {
        if (domQueryMessageIds.has(query.messageId)) continue

        let wordCount: number | undefined
        if (showWordCount) {
          const assistantId = data.assistantIdByQueryIndex.get(query.queryIndex)
          wordCount = assistantId ? data.replyWordCountByAssistantId.get(assistantId) ?? 0 : 0
        }
        const isTruncated = query.text.length > 80
        fillQueryEntries.push({
          messageId: query.messageId,
          item: {
            level: 0,
            text: this.truncateText(query.text, 80),
            element: null,
            isUserQuery: true,
            isTruncated,
            navigationId: `qwen:api-u:${query.messageId}`,
            wordCount,
          },
        })
      }
    }

    for (const [assistantId, headings] of data.headingsByAssistantId) {
      if (domHeadingAssistantIds.has(assistantId)) continue
      headings.forEach((heading, orderInMessage) => {
        if (heading.level > maxLevel) return
        const id = `qwen:api-h:${assistantId}:${heading.level}:${orderInMessage}:${hashOutlineText(heading.text)}`
        fillHeadingEntries.push({
          messageId: assistantId,
          item: {
            level: heading.level,
            text: heading.text,
            element: null,
            id,
            navigationId: id,
            wordCount: showWordCount ? heading.wordCount : undefined,
          },
        })
      })
    }

    // 刚发送/生成中的新消息，DOM 行 id 可能暂时归属不到分支（或与接口 id 对不上），
    // 接口重拉后回填条目会与这些 DOM 条目并存而重复。按文本计数，只在最后一个已知
    // DOM 条目之后的回填里扣除同名项：更早的未挂载旧消息不受影响。
    const branchIndex = new Map(data.branchMessageIds.map((id, index) => [id, index] as const))
    let lastKnownDomIndex = -1
    const unmatchedQueryKeys = new Map<string, number>()
    const unmatchedHeadingKeys = new Map<string, number>()
    for (const entry of domEntries) {
      const index = entry.messageId !== null ? branchIndex.get(entry.messageId) : undefined
      if (index !== undefined) {
        lastKnownDomIndex = Math.max(lastKnownDomIndex, index)
        continue
      }
      const bucket = entry.item.isUserQuery ? unmatchedQueryKeys : unmatchedHeadingKeys
      const key = this.getQwenOutlineDedupeKey(entry.item)
      bucket.set(key, (bucket.get(key) ?? 0) + 1)
    }

    const dropDuplicates = (
      entries: BranchMergeEntry<OutlineItem>[],
      unmatchedKeys: Map<string, number>,
    ): BranchMergeEntry<OutlineItem>[] => {
      if (unmatchedKeys.size === 0) return entries
      const isTrailing = (entry: BranchMergeEntry<OutlineItem>) =>
        entry.messageId !== null && (branchIndex.get(entry.messageId) ?? -1) > lastKnownDomIndex
      return [
        ...entries.filter((entry) => !isTrailing(entry)),
        ...dropTrailingFillDuplicates(
          entries.filter(isTrailing),
          (item) => this.getQwenOutlineDedupeKey(item),
          unmatchedKeys,
        ),
      ]
    }

    return mergeByBranchMessageOrder(data.branchMessageIds, domEntries, [
      ...dropDuplicates(fillQueryEntries, unmatchedQueryKeys),
      ...dropDuplicates(fillHeadingEntries, unmatchedHeadingKeys),
    ])
  }

  private getQwenOutlineDedupeKey(item: OutlineItem): string {
    const text = item.text.replace(/\s+/g, " ").trim()
    return item.isUserQuery ? text : `${item.level}:${text}`
  }

  private maybeRefreshApiOutline(container: Element): void {
    if (!this.isUserConversationPage()) return

    const sessionId = this.getSessionId()
    if (!sessionId || sessionId === "default") return
    if (sessionId !== this.apiOutlineSessionId) {
      this.apiOutlineSessionId = sessionId
      this.apiOutlineParseFailures = 0
      this.apiOutlineLastFetchAt = 0
    }

    const generating = this.isGenerating()
    if (this.apiOutlineWasGenerating && !generating) {
      this.apiOutlineForceRefetch = true
    }
    this.apiOutlineWasGenerating = generating

    const scrollable = this.getScrollContainer()
    const atBottom = scrollable
      ? scrollable.scrollTop + scrollable.clientHeight >=
        scrollable.scrollHeight - QWENAI_API_OUTLINE_BOTTOM_TOLERANCE_PX
      : false
    const stale =
      this.apiOutlineForceRefetch ||
      isApiOutlineStale({
        data: this.apiOutlineData,
        sessionId,
        mountedIds: this.collectQwenMountedAssistantMessageIds(container),
        atBottom,
      })

    if (
      !shouldAttemptApiOutlineFetch({
        now: Date.now(),
        lastFetchAt: this.apiOutlineLastFetchAt,
        backoffMs: QWENAI_API_OUTLINE_FETCH_BACKOFF_MS,
        parseFailures: this.apiOutlineParseFailures,
        inFlight: this.apiOutlineFetchPromise !== null,
        generating,
        stale,
      })
    ) {
      return
    }

    this.apiOutlineLastFetchAt = Date.now()
    this.apiOutlineFetchPromise = this.fetchQwenApiOutline(sessionId)
      .then((result) => {
        if (result === "parse-failed") {
          this.apiOutlineParseFailures += 1
          return
        }
        this.apiOutlineParseFailures = 0
        if (result === "changed") {
          window.postMessage({ type: EVENT_OUTLINE_DATA_UPDATED }, "*")
        }
      })
      .catch((error) => {
        // 网络、HTTP 失败和鉴权失败（token 过期到站点刷新之间接口返回 Unauthorized）都是暂态，
        // 只靠拉取间隔重试，不计入熔断；熔断只留给解析失败（接口改版或历史不完整）
        console.warn("[QwenAiAdapter] Failed to fetch conversation outline:", error)
      })
      .finally(() => {
        this.apiOutlineFetchPromise = null
      })
  }

  private collectQwenMountedAssistantMessageIds(container: Element): Set<string> {
    const ids = new Set<string>()
    container.querySelectorAll(this.config.selectors.assistantResponse).forEach((message) => {
      const id = this.extractQwenAssistantMessageId(message)
      if (id) ids.add(id)
    })
    return ids
  }

  private async fetchQwenApiOutline(
    sessionId: string,
  ): Promise<"changed" | "unchanged" | "parse-failed"> {
    const pages = await this.fetchQwenChatHistoryPages(sessionId)
    if (!pages) return "parse-failed"

    const { messages, currentId } = this.mergeQwenHistoryPages(pages)
    const parsed = parseQwenHistoryOutline(
      { id: sessionId, messages: Object.fromEntries(messages), currentId },
      sessionId,
    )
    if (!parsed || parsed.sessionId !== sessionId) {
      console.warn("[QwenAiAdapter] Conversation history does not resolve to a complete branch")
      return "parse-failed"
    }

    const previous = this.apiOutlineData
    this.apiOutlineData = parsed
    this.apiOutlineForceRefetch = false
    return !previous ||
      previous.sessionId !== parsed.sessionId ||
      previous.signature !== parsed.signature
      ? "changed"
      : "unchanged"
  }

  getExportConfig(): ExportConfig | null {
    return { ...this.config.export }
  }

  async prepareConversationExport(
    context: ExportLifecycleContext,
  ): Promise<QwenAiExportLifecycleState> {
    this.exportIncludeThoughtsOverride = context.includeThoughts
    this.exportApiMessages = null
    this.exportApiBundle = null
    this.exportCollectionReport = null
    this.clearThoughtExportCache()

    if (!this.isSharePage()) {
      const conversationId = this.getSessionId()
      if (conversationId && conversationId !== "default") {
        const collector =
          context.format === "markdown" && context.packaging === "zip"
            ? createExportAssetCollector()
            : undefined
        const apiMessages = await this.collectQwenApiExportMessages(
          conversationId,
          context,
          collector,
        )
        if (apiMessages) {
          this.exportApiMessages = apiMessages
          this.exportApiBundle = collector
            ? { messages: apiMessages, assets: collector.assets }
            : null
          return { shouldCloseThoughtPanel: false, usedApiExport: true }
        }
      }
    }

    // 接口导出不可用时回退 DOM：manager 因 apiFirstExport 跳过了预加载，这里自己滚顶加载，
    // 加载未收敛要通过 getExportCollectionReport 让 manager 提示「可能不完整」
    if (!(await this.loadCompleteExportHistory())) {
      this.exportCollectionReport = {
        expectedCount: null,
        collectedCount: this.getOrderedQwenMessages(this.getQwenExportRoot()).length,
        missingAnchors: [],
        hasTruncated: true,
      }
    }
    await this.prepareMermaidBlocksForExport()

    const panelWasOpen = this.getVisibleThoughtPanel() !== null
    if (!context.includeThoughts) {
      return { shouldCloseThoughtPanel: false, usedApiExport: false }
    }

    const assistantMessages = Array.from(
      document.querySelectorAll(this.config.selectors.assistantResponse),
    ).filter((element) => !element.closest(".gh-root"))

    for (const message of assistantMessages) {
      await this.captureThoughtBlocksForMessage(message)
    }

    return {
      shouldCloseThoughtPanel: !panelWasOpen && this.getVisibleThoughtPanel() !== null,
      usedApiExport: false,
    }
  }

  /** 返回历史加载是否收敛；false 表示触顶轮次仍在变化，导出可能缺开头 */
  private async loadCompleteExportHistory(): Promise<boolean> {
    const result = await loadCompleteHistoryForExport({
      adapter: this,
      waitMs: 800,
      maxRounds: 60,
      stableRounds: 4,
      wheelDeltaY: -900,
      getSignature: (container) => this.getExportHistoryLoadSignature(container),
    })

    if (!result.success) {
      console.warn("[QwenAiAdapter] Export history load reached max rounds before stabilizing", {
        rounds: result.rounds,
        stableRounds: result.stableRounds,
        finalHeight: result.finalHeight,
      })
    }
    return result.success
  }

  getExportCollectionReport(): ExportCollectionReport | null {
    return this.exportCollectionReport
  }

  private getExportHistoryLoadSignature(container: HTMLElement): string {
    const root = this.getQwenExportRoot()
    const messages = this.getOrderedQwenMessages(root)
    const firstMessage = messages[0]?.element
    const lastMessage = messages[messages.length - 1]?.element

    return [
      container.scrollHeight,
      container.clientHeight,
      container.scrollTop,
      messages.length,
      firstMessage ? this.getExportHistoryMessageMarker(firstMessage) : "",
      lastMessage ? this.getExportHistoryMessageMarker(lastMessage) : "",
    ].join(":")
  }

  private getExportHistoryMessageMarker(element: Element): string {
    const source = element.closest(this.config.sitePrivateSelectors.messageMarkerRoot) || element
    const id =
      source.id ||
      source.getAttribute("data-message-id") ||
      source.getAttribute("data-testid") ||
      source.getAttribute("aria-label")

    if (id) return id

    return (source.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120)
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    state: unknown,
  ): Promise<void> {
    const parsedState = this.parseThoughtExportState(state)
    try {
      if (!parsedState?.usedApiExport) {
        if (parsedState?.shouldCloseThoughtPanel) {
          await this.closeThoughtPanelIfNeeded()
        }
        await this.restoreMermaidBlocksAfterExport()
      }
    } finally {
      this.exportApiMessages = null
      this.exportApiBundle = null
      this.exportCollectionReport = null
      this.exportIncludeThoughtsOverride = null
      this.clearThoughtExportCache()
    }
  }

  async extractExportMessages(_context: ExportLifecycleContext): Promise<ExportMessage[] | null> {
    if (this.exportApiMessages) return this.exportApiMessages
    const messages = this.extractQwenExportMessages()
    return messages.length > 0 ? messages : null
  }

  async extractExportBundle(_context: ExportLifecycleContext): Promise<ExportBundle | null> {
    if (this.exportApiBundle) return this.exportApiBundle
    return this.createExportBundleFromMessages((collector) =>
      this.extractQwenExportMessages(collector),
    )
  }

  supportsExportByConversationId(): boolean {
    return true
  }

  protected async fetchConversationExportMessagesById(
    context: ExportLifecycleContext,
    collector?: ExportAssetCollector,
  ): Promise<ExportMessage[] | null> {
    return this.collectQwenApiExportMessages(context.conversationId, context, collector)
  }

  /**
   * 通过单对话接口导出完整主链。接口 limit 按轮次计，先取最新一段，
   * 再沿 pagination.oldest_id 向前翻页；回溯链必须到达根消息，
   * 无法证明历史完整时返回 null（调用方回退 DOM 或报导出失败），不产出残缺文件。
   */
  private async collectQwenApiExportMessages(
    conversationId: string,
    context: ExportLifecycleContext,
    collector?: ExportAssetCollector,
  ): Promise<ExportMessage[] | null> {
    if (!conversationId) return null

    try {
      const pages = await this.fetchQwenChatHistoryPages(conversationId)
      if (!pages) return null

      const { messages: messageMap, currentId } = this.mergeQwenHistoryPages(pages)
      const chain = resolveQwenActiveBranch(messageMap, currentId)
      if (!chain) {
        console.warn("[QwenAiAdapter] API history does not resolve to a complete branch")
        return null
      }

      const messages: ExportMessage[] = []
      for (const { message } of chain) {
        const role = message.role
        if (role !== "user" && role !== "assistant") continue

        const content =
          role === "user"
            ? this.formatQwenApiUserMessage(message, collector)
            : this.formatQwenApiAssistantMessage(message, context.includeThoughts, collector)
        const normalized = content.trim()
        if (normalized) messages.push({ role, content: normalized })
      }

      return messages.length > 0 ? messages : null
    } catch (error) {
      console.warn("[QwenAiAdapter] API export failed, falling back to DOM:", error)
      return null
    }
  }

  /**
   * 逐页拉取单对话历史（direction=up，从最新一页向前）。
   * - 网络错误、HTTP 非 2xx、success:false（含鉴权失败）直接抛错：这些是暂态，不等于数据不可用；
   * - 响应结构不符、翻页走不到起点返回 null：数据本身不可用。
   * pagination 缺失按「已到起点」处理，完整性由调用方回溯到根消息来校验。
   */
  private async fetchQwenChatHistoryPages(
    conversationId: string,
  ): Promise<QwenAiChatApiHistory[] | null> {
    const authorization = this.getQwenAuthorizationHeader()
    const pages: QwenAiChatApiHistory[] = []
    let cursor: string | undefined

    for (let page = 0; page < QWENAI_CHAT_API_MAX_PAGES; page += 1) {
      const url = new URL(
        `/api/v2/chats/${encodeURIComponent(conversationId)}`,
        window.location.origin,
      )
      url.searchParams.set("direction", "up")
      url.searchParams.set("limit", String(QWENAI_CHAT_API_PAGE_LIMIT))
      if (cursor) url.searchParams.set("cursor", cursor)

      const response = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          ...(authorization ? { Authorization: authorization } : {}),
          Accept: "application/json, text/plain, */*",
          "X-Request-Id": crypto.randomUUID(),
          source: "web",
        },
      })

      if (!response.ok) throw new Error(`chat history responded ${response.status}`)

      const payload = (await response.json()) as QwenAiChatApiResponse
      if (payload.success === false) {
        throw new Error(`chat history unsuccessful${formatQwenApiErrorDetail(payload.data)}`)
      }

      const chat = payload.data?.chat || payload.data
      const history = chat?.history
      if (!history?.messages || Array.isArray(history.messages)) {
        console.warn("[QwenAiAdapter] Unexpected chat history response shape")
        return null
      }
      pages.push(history)

      const pagination = history.pagination
      if (!pagination?.has_more_older) return pages

      const nextCursor = typeof pagination.oldest_id === "string" ? pagination.oldest_id.trim() : ""
      if (!nextCursor || nextCursor === cursor) break
      cursor = nextCursor
    }

    console.warn("[QwenAiAdapter] Chat history pagination did not reach the conversation start")
    return null
  }

  /** 把逐页响应合并成一张消息表；currentId 以最新一页（首页）为准 */
  private mergeQwenHistoryPages(pages: readonly QwenAiChatApiHistory[]): {
    messages: Map<string, QwenAiChatApiMessage>
    currentId: string | null
  } {
    const messages = new Map<string, QwenAiChatApiMessage>()
    let currentId: string | null = null

    for (const history of pages) {
      if (!currentId && history.currentId) currentId = history.currentId
      for (const [key, value] of Object.entries(history.messages || {})) {
        if (!value || typeof value !== "object") continue
        const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : key
        messages.set(id, { ...value, id })
      }
    }

    return { messages, currentId }
  }

  private formatQwenApiUserMessage(
    message: QwenAiChatApiMessage,
    collector?: ExportAssetCollector,
  ): string {
    const body = typeof message.content === "string" ? message.content.trim() : ""
    const attachments = this.mapQwenApiAttachments(message.files)
    const images = attachments.filter((attachment) => attachment.kind === "image")
    const files = attachments.filter((attachment) => attachment.kind === "file")
    const imageMarkdown = this.formatQwenUserImageAttachments(images, collector)
    const fileMarkdown = this.formatQwenUserFileAttachments(files, collector)
    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, body].filter(Boolean).join("\n\n")
  }

  private formatQwenApiAssistantMessage(
    message: QwenAiChatApiMessage,
    includeThoughts: boolean,
    collector?: ExportAssetCollector,
  ): string {
    const blocks: string[] = []
    const images: QwenAiAssistantImage[] = []
    const seenImages = new Set<string>()
    const contentList = Array.isArray(message.content_list) ? message.content_list : []

    const addImage = (source: string) => {
      const normalized = source.trim()
      if (!normalized || seenImages.has(normalized)) return
      seenImages.add(normalized)
      images.push({
        source: normalized,
        alt: `generated image ${images.length + 1}`,
      })
    }

    for (const phase of contentList) {
      if (!phase || typeof phase !== "object") continue
      const phaseName = typeof phase.phase === "string" ? phase.phase : ""

      if (phaseName === "thinking_summary") {
        if (!includeThoughts) continue
        const thought = this.getQwenApiThoughtText(phase)
        if (thought) {
          blocks.push(this.formatAsThoughtBlockquote(thought, this.getQwenApiThoughtTitle(phase)))
        }
        continue
      }

      if (phaseName === "image_gen") {
        if (typeof phase.content === "string") addImage(phase.content)
        continue
      }

      if (phaseName === "image_gen_tool") {
        this.getQwenApiPhaseImages(phase).forEach(addImage)
        continue
      }

      // code_interpreter 是工具执行日志，最终结果通常在 answer 阶段；跳过避免污染正文。
      if (phaseName === "code_interpreter") continue

      const content = typeof phase.content === "string" ? phase.content.trim() : ""
      if (content) blocks.push(content)
    }

    const plainContent = typeof message.content === "string" ? message.content.trim() : ""
    if (plainContent && !blocks.includes(plainContent)) {
      blocks.push(plainContent)
    }

    const reasoning =
      includeThoughts && typeof message.reasoning_content === "string"
        ? message.reasoning_content.trim()
        : ""
    if (reasoning && !blocks.some((block) => block.includes(reasoning))) {
      blocks.unshift(this.formatAsThoughtBlockquote(reasoning))
    }

    const imageMarkdown = this.formatQwenAssistantImages(images, collector)
    return [blocks.join("\n\n"), imageMarkdown.join("\n\n")].filter(Boolean).join("\n\n")
  }

  private getQwenApiThoughtText(phase: QwenAiChatApiContentPhase): string {
    const contents = phase.extra?.summary_thought?.content
    if (Array.isArray(contents)) {
      const text = contents
        .filter((item): item is string => typeof item === "string")
        .join("\n\n")
        .trim()
      if (text) return text
    }

    return typeof phase.content === "string" ? phase.content.trim() : ""
  }

  private getQwenApiThoughtTitle(phase: QwenAiChatApiContentPhase): string {
    const contents = phase.extra?.summary_title?.content
    if (!Array.isArray(contents)) return ""
    return contents
      .filter((item): item is string => typeof item === "string")
      .join(" ")
      .trim()
  }

  private getQwenApiPhaseImages(phase: QwenAiChatApiContentPhase): string[] {
    const candidates = [...(phase.extra?.image_list || []), ...(phase.extra?.tool_result || [])]
    return candidates
      .map((item) => (typeof item?.image === "string" ? item.image.trim() : ""))
      .filter(Boolean)
  }

  private mapQwenApiAttachments(files?: QwenAiChatApiFile[]): QwenAiUserAttachment[] {
    if (!Array.isArray(files)) return []

    const attachments: QwenAiUserAttachment[] = []
    const seen = new Set<string>()

    files.forEach((file) => {
      if (!file || typeof file !== "object") return

      const source = typeof file.url === "string" ? file.url.trim() : ""
      const name =
        (typeof file.name === "string" ? file.name.trim() : "") ||
        extractExportFilenameFromUrl(source) ||
        "attachment"
      const fileType = typeof file.file_type === "string" ? file.file_type.trim() : ""
      const kind: QwenAiUserAttachment["kind"] =
        file.type === "image" || fileType.toLowerCase().startsWith("image/") ? "image" : "file"
      const type =
        fileType || extractExportExtension(name) || (kind === "image" ? "image" : "") || ""
      const key = `${kind}:${source || name}`
      if (seen.has(key)) return
      seen.add(key)

      attachments.push({
        kind,
        name,
        source,
        type,
        sizeLabel: this.formatQwenApiFileSize(file.size),
      })
    })

    return attachments
  }

  private formatQwenApiFileSize(size?: number): string | undefined {
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return undefined
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }

  async toggleTheme(targetMode: "light" | "dark" | "system"): Promise<boolean> {
    try {
      const resolvedMode = this.resolveThemeMode(targetMode)
      const updated = await this.updateThemePreference(targetMode)
      if (!updated) return false

      this.syncThemeState(resolvedMode, targetMode)
      return true
    } catch (error) {
      console.error("[QwenAiAdapter] toggleTheme error:", error)
      return false
    }
  }

  getModelName(): string | null {
    const textNode = document.querySelector(
      this.config.sitePrivateSelectors.modelText,
    ) as HTMLElement | null
    const text = textNode?.innerText?.trim() || textNode?.textContent?.trim() || ""
    return text ? text.split("\n")[0].trim() : null
  }

  getModelLockCheckText(selectorBtn?: HTMLElement | null): string {
    return this.getModelName() || super.getModelLockCheckText(selectorBtn)
  }

  clickModelSelector(): boolean {
    const trigger = this.findModelTrigger()
    if (!trigger) return false
    this.simulateClick(trigger)
    return true
  }

  lockModel(keyword: string, onSuccess?: () => void): void {
    const target = this.normalizeModelKeyword(keyword)
    if (!target) return

    const maxAttempts = this.config.modelSwitcher.maxAttempts ?? 12
    const checkInterval = this.config.modelSwitcher.checkInterval ?? 1000
    let attempts = 0

    const tryLock = async () => {
      attempts++

      const trigger = this.findModelTrigger()
      if (!trigger) {
        if (attempts >= maxAttempts) {
          void this.showQwenModelLockFailure(keyword, "button_not_found")
          return
        }
        window.setTimeout(tryLock, checkInterval)
        return
      }

      const currentText = this.normalizeModelKeyword(this.getModelLockCheckText(trigger))
      if (currentText.includes(target)) {
        onSuccess?.()
        return
      }

      const result = await this.selectQwenModel(target)
      if (result.success) {
        onSuccess?.()
        return
      }

      void this.showQwenModelLockFailure(keyword, result.reason || "not_found")
    }

    void tryLock()
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    const { selectorButtonSelectors, menuItemSelector, subMenuTriggers, ...config } =
      this.config.modelSwitcher
    return {
      ...config,
      targetModelKeyword: keyword,
      selectorButtonSelectors: [...selectorButtonSelectors],
      menuItemSelector,
      ...(subMenuTriggers ? { subMenuTriggers: [...subMenuTriggers] } : {}),
    }
  }

  isGenerating(): boolean {
    const indicator = this.findVisibleElementBySelectors(this.config.generating.existsSelectors)
    if (indicator && !this.isDisabledActionElement(indicator)) {
      return true
    }

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
    const { urlPatterns, urlPathEndsWith, requestBodyRules, ...config } = this.config.networkMonitor
    return {
      ...config,
      urlPatterns: [...urlPatterns],
      ...(urlPathEndsWith ? { urlPathEndsWith: [...urlPathEndsWith] } : {}),
      ...(requestBodyRules
        ? {
            requestBodyRules: requestBodyRules.map((rule) => ({
              ...rule,
              metadata: { ...rule.metadata },
            })),
          }
        : {}),
    }
  }

  getWidthSelectors() {
    return this.config.widthSelectors.map((selector) => ({ ...selector }))
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    const privateSelectors = this.config.sitePrivateSelectors
    return {
      scopeSelector: privateSelectors.layoutScope,
      obstacleSelectors: [privateSelectors.thoughtPanel],
      widthSelectors: [
        {
          selector: privateSelectors.messageWidth,
          property: "max-width",
          extraCss:
            "width: 100% !important; min-width: 0 !important; box-sizing: border-box !important;",
        },
      ],
      insetSelectors: [
        {
          selector: this.config.selectors.scrollContainer[0],
          extraCss: "box-sizing: border-box; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.inputSafeArea,
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.newChatInputSafeArea,
          insetMode: "edge",
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.newChatPlaceholder,
          insetMode: "edge",
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
      ],
      defaultWidth: "800px",
      gap: 16,
    }
  }

  getUserQueryWidthSelectors() {
    return this.config.sitePrivateSelectors.userQueryWidth.map((selector) => ({
      selector,
      property: "max-width",
      noCenter: true,
    }))
  }

  private cloneZenModeConfig(config: ZenModeConfig): ZenModeConfig {
    const { hide, preserveFlow, rootClass, styles } = config
    return {
      ...(hide ? { hide: [...hide] } : {}),
      ...(preserveFlow ? { preserveFlow: [...preserveFlow] } : {}),
      ...(rootClass ? { rootClass: { ...rootClass } } : {}),
      ...(styles ? { styles: styles.map((style) => ({ ...style })) } : {}),
    }
  }

  getZenModeConfig(): ZenModeConfig {
    return this.cloneZenModeConfig(this.config.zenMode)
  }

  getCleanModeConfig(): ZenModeConfig {
    return this.cloneZenModeConfig(this.config.cleanMode)
  }

  getMarkdownFixerConfig(): MarkdownFixerConfig | null {
    return {
      selector: `${this.config.selectors.assistantResponse} ${this.config.sitePrivateSelectors.markdownParagraph}`,
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

  private getFreshConversationSnapshot(): ConversationInfo[] {
    const isFresh =
      Date.now() - this.conversationSnapshotFetchedAt < QWENAI_CONVERSATION_SNAPSHOT_TTL_MS

    if (!isFresh && !this.conversationSnapshotPromise) {
      void this.refreshConversationSnapshot()
    }

    return this.conversationSnapshot.map((item) => ({ ...item }))
  }

  /**
   * 刷新对话快照。返回 true 表示该次请求的范围已完整拿到：
   * 普通刷新 = 请求成功；fetchAllPages = 翻到了空页且置顶接口也成功。
   * 失败或不完整返回 false，loadAllConversations 据此让调用方拒绝「同步删除」。
   */
  private async refreshConversationSnapshot(
    options: { force?: boolean; fetchAllPages?: boolean } = {},
  ): Promise<boolean> {
    const { force = false, fetchAllPages = false } = options
    const isFresh =
      Date.now() - this.conversationSnapshotFetchedAt < QWENAI_CONVERSATION_SNAPSHOT_TTL_MS

    if (!force && isFresh) return true
    if (!force && Date.now() < this.conversationSnapshotRetryAt) return false

    // 进行中的是部分刷新而本次要全量：等它结束再补一次，不能被它吞掉
    while (this.conversationSnapshotPromise) {
      if (!fetchAllPages || this.conversationSnapshotFetchesAll) {
        return this.conversationSnapshotPromise
      }
      await this.conversationSnapshotPromise
    }

    this.conversationSnapshotFetchesAll = fetchAllPages
    this.conversationSnapshotPromise = (async () => {
      try {
        const { list, complete } = await this.fetchConversationSnapshot(fetchAllPages)
        this.conversationSnapshot = list
        this.conversationSnapshotFetchedAt = Date.now()
        this.conversationSnapshotRetryAt = 0
        return !fetchAllPages || complete
      } catch (error) {
        this.conversationSnapshotRetryAt = Date.now() + QWENAI_CONVERSATION_SNAPSHOT_RETRY_MS
        console.warn("[QwenAiAdapter] Failed to refresh conversation snapshot:", error)
        return false
      } finally {
        this.conversationSnapshotPromise = null
      }
    })()

    return this.conversationSnapshotPromise
  }

  private async fetchConversationSnapshot(
    fetchAllPages: boolean,
  ): Promise<{ list: ConversationInfo[]; complete: boolean }> {
    const currentSessionId = this.getSessionId()
    const maxPages = fetchAllPages ? QWENAI_FETCH_PAGE_LIMIT : QWENAI_BOOTSTRAP_PAGE_LIMIT
    const all: ConversationInfo[] = []
    const seen = new Set<string>()
    // 只有翻到空页才证明列表到底；页数触顶、接口不再前进都不算
    let reachedEnd = false

    for (let page = 1; page <= maxPages; page++) {
      const items = await this.fetchConversationPage(page)
      if (items.length === 0) {
        reachedEnd = true
        break
      }

      let newCount = 0
      for (const item of items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        all.push(item)
        newCount++
      }

      if (newCount === 0) break
      if (!fetchAllPages && currentSessionId && seen.has(currentSessionId)) break
    }

    const pinned = await this.fetchPinnedConversations()
    const complete = reachedEnd && pinned.ok
    if (pinned.items.length === 0) return { list: all, complete }

    const pinnedById = new Map(pinned.items.map((item) => [item.id, item]))
    const merged = all.map((item) => {
      if (!pinnedById.has(item.id)) return item
      pinnedById.delete(item.id)
      return { ...item, isPinned: true }
    })
    pinnedById.forEach((item) => merged.push(item))
    return { list: merged, complete }
  }

  private async fetchConversationPage(page: number): Promise<ConversationInfo[]> {
    const url = new URL(QWENAI_CHAT_LIST_PATH, window.location.origin)
    url.searchParams.set("page", String(page))
    url.searchParams.set("exclude_project", "false")
    const authorization = this.getQwenAuthorizationHeader()

    const response = await fetch(url.toString(), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
        Accept: "application/json, text/plain, */*",
        "X-Request-Id": crypto.randomUUID(),
        source: "web",
      },
    })

    if (!response.ok) {
      throw new Error(`fetch conversations failed: ${response.status}`)
    }

    return this.normalizeConversationApiItems(
      this.readConversationListEntries(await response.json()),
    )
  }

  private async fetchPinnedConversations(): Promise<{ items: ConversationInfo[]; ok: boolean }> {
    try {
      const url = new URL("/api/v2/chats/pinned", window.location.origin)
      const authorization = this.getQwenAuthorizationHeader()
      const response = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          ...(authorization ? { Authorization: authorization } : {}),
          Accept: "application/json, text/plain, */*",
          "X-Request-Id": crypto.randomUUID(),
          source: "web",
        },
      })

      if (!response.ok) throw new Error(`fetch pinned conversations failed: ${response.status}`)

      // 与主列表的 exclude_project 口径一致，排除项目内对话
      const items = this.normalizeConversationApiItems(
        this.readConversationListEntries(await response.json()),
        { skipProjectChats: true },
      )
      return { items: items.map((item) => ({ ...item, isPinned: true })), ok: true }
    } catch (error) {
      // 置顶只是主列表的补充，失败不拖垮主列表刷新；但快照因此不完整，不能用于同步删除
      console.warn("[QwenAiAdapter] Failed to fetch pinned conversations:", error)
      return { items: [], ok: false }
    }
  }

  /**
   * 页面自己请求的列表分页并入快照：只新增或更新，不删除（分页结果证明不了删除，删除仍走手动同步）；
   * 页面会反复轮询到相同数据，快照没变化时不回调。
   */
  private applyCapturedConversationPage(response: MonitorResponsePayload): void {
    let items: ConversationInfo[]
    try {
      // 页面请求未必带 exclude_project，按主列表口径排除项目内对话
      items = this.normalizeConversationApiItems(
        this.readConversationListEntries(JSON.parse(response.body)),
        { skipProjectChats: true },
      )
    } catch (error) {
      console.warn("[QwenAiAdapter] Ignored captured conversation list response:", error)
      return
    }

    if (this.mergeCapturedConversations(items)) this.notifyConversationListChange()

    // 在途的快照刷新请求发得更早，结束时会整体覆盖快照：等它结束再并一次，保住这批较新的数据
    const pendingRefresh = this.conversationSnapshotPromise
    if (!pendingRefresh) return
    void pendingRefresh.then(() => {
      if (this.mergeCapturedConversations(items)) this.notifyConversationListChange()
    })
  }

  /** 返回快照是否有变化；置顶沿用 mergeConversationInfos 的「任一方置顶即置顶」 */
  private mergeCapturedConversations(items: ConversationInfo[]): boolean {
    const currentById = new Map(this.conversationSnapshot.map((item) => [item.id, item]))
    const changed = items.some((item) => {
      const current = currentById.get(item.id)
      return (
        !current || current.title !== item.title || (item.isPinned === true && !current.isPinned)
      )
    })
    if (!changed) return false

    this.conversationSnapshot = this.mergeConversationInfos(this.conversationSnapshot, items)
    return true
  }

  private notifyConversationListChange(): void {
    this.conversationListListeners.forEach((listener) => listener())
  }

  /**
   * 校验对话列表类接口响应并取出 data 数组。空列表也是数组；data 不是数组说明接口结构变了，
   * 必须抛错，不能当成「没有对话」（全量刷新会据此误判列表到底）。
   */
  private readConversationListEntries(payload: unknown): unknown[] {
    if (!payload || typeof payload !== "object") {
      throw new Error("conversation list response: unexpected payload")
    }

    const { success, data } = payload as QwenAiConversationApiResponse
    if (success === false) {
      throw new Error(`conversation list response unsuccessful${formatQwenApiErrorDetail(data)}`)
    }
    if (!Array.isArray(data)) {
      throw new Error("conversation list response: unexpected data shape")
    }
    return data
  }

  private normalizeConversationApiItems(
    entries: unknown[],
    options: { skipProjectChats?: boolean } = {},
  ): ConversationInfo[] {
    const cid = this.getCurrentCid() || undefined
    const items: ConversationInfo[] = []
    for (const entry of entries) {
      if (options.skipProjectChats && this.isProjectConversationEntry(entry)) continue
      const info = this.normalizeConversationApiItem(entry, cid)
      if (info) items.push(info)
    }
    return items
  }

  private isProjectConversationEntry(entry: unknown): boolean {
    if (!entry || typeof entry !== "object") return false
    const projectId = (entry as Record<string, unknown>).project_id
    return typeof projectId === "string" && projectId.trim().length > 0
  }

  private normalizeConversationApiItem(entry: unknown, cid?: string): ConversationInfo | null {
    if (!entry || typeof entry !== "object") return null

    const record = entry as Record<string, unknown>
    const id = typeof record.id === "string" ? record.id.trim() : ""
    const title = typeof record.title === "string" ? record.title.trim() : ""
    if (!id || !title) return null

    return {
      id,
      cid,
      title,
      url: this.getConversationUrl(id),
      isPinned: Boolean(record.pinned),
      isActive: id === this.getSessionId(),
    }
  }

  private collectConversationListFromDom(): ConversationInfo[] {
    const nodes = document.querySelectorAll(this.config.conversation.itemSelector)
    if (nodes.length === 0) return []

    const cid = this.getCurrentCid() || undefined
    const list: ConversationInfo[] = []

    nodes.forEach((node) => {
      const info = this.extractSidebarConversationInfo(node, cid)
      if (info) list.push(info)
    })

    return list
  }

  private extractSidebarConversationInfo(element: Element, cid?: string): ConversationInfo | null {
    const id = this.extractConversationIdFromElement(element)
    if (!id) return null

    const titleSelector = this.config.conversation.titleSelector
    const titleElement = titleSelector ? element.querySelector(titleSelector) : null
    const title = titleElement?.textContent?.trim() || ""
    if (!title) return null

    return {
      id,
      cid,
      title,
      url: this.getConversationUrl(id),
      isPinned: !!element.querySelector(this.config.sitePrivateSelectors.pinnedConversation),
      isActive: id === this.getSessionId(),
    }
  }

  private extractConversationIdFromElement(element: Element): string | null {
    const directLink = element.querySelector(this.config.sitePrivateSelectors.conversationLink)
    const directHref = directLink?.getAttribute(this.config.conversation.idFrom.attr ?? "href")
    const directId = this.extractConversationIdFromText(directHref)
    if (directId) return directId

    const nodes = [element, ...Array.from(element.querySelectorAll("*"))]
    for (const node of nodes) {
      const attrNames = (node as Element).getAttributeNames?.() || []
      for (const attr of attrNames) {
        const value = (node as Element).getAttribute(attr)
        const id = this.extractConversationIdFromText(value)
        if (id) return id
      }
    }

    return null
  }

  private extractQwenLatexFromMath(math: Element): string {
    return Array.from(math.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent?.trim() || "")
      .filter(Boolean)
      .join(" ")
      .trim()
  }

  private serializeQwenMathml(math: Element): string {
    const clone = math.cloneNode(true) as Element
    Array.from(clone.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) node.remove()
    })

    try {
      return new XMLSerializer().serializeToString(clone).trim()
    } catch {
      return clone instanceof HTMLElement ? clone.outerHTML.trim() : ""
    }
  }

  private extractConversationIdFromText(value: string | null | undefined): string | null {
    if (!value) return null
    const match = new RegExp(this.config.conversation.idFrom.regex).exec(value)
    if (match?.[1]) return match[1]

    const uuidLike = value.match(
      /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i,
    )
    return uuidLike?.[0] || null
  }

  private mergeConversationInfos(...lists: ConversationInfo[][]): ConversationInfo[] {
    const merged = new Map<string, ConversationInfo>()
    for (const list of lists) {
      for (const item of list) {
        const previous = merged.get(item.id)
        const next = { ...previous, ...item }
        // DOM 缺少可靠置顶标识时不能覆盖 API 已确认的置顶状态。
        if (previous?.isPinned || item.isPinned) {
          next.isPinned = true
        }
        merged.set(item.id, next)
      }
    }
    return Array.from(merged.values())
  }

  private extractQwenExportMessages(collector?: ExportAssetCollector): ExportMessage[] {
    const root = this.getQwenExportRoot()
    return this.getOrderedQwenMessages(root)
      .map(({ role, element }) => {
        const content =
          role === "user"
            ? this.extractUserQueryExportContentWithAssets(element, collector)
            : this.extractAssistantResponseTextWithAssets(element, collector)

        return {
          role,
          content: content.trim(),
        }
      })
      .filter((message) => message.content.length > 0)
  }

  private getQwenExportRoot(): HTMLElement {
    return (
      (document.querySelector(this.config.selectors.responseContainer) as HTMLElement | null) ||
      this.getScrollContainer() ||
      document.body
    )
  }

  private getOrderedQwenMessages(root: ParentNode): Array<{
    role: "user" | "assistant"
    element: Element
  }> {
    const userRoots = this.collectTopLevelBlocks(
      this.queryElementsIncludingSelf(root, this.config.selectors.userQuery),
    ).filter((element) => !this.shouldSkipExportElement(element))
    const assistantRoots = this.collectTopLevelBlocks(
      this.queryElementsIncludingSelf(root, this.config.selectors.assistantResponse),
    ).filter((element) => !this.shouldSkipExportElement(element))

    return [
      ...userRoots.map((element) => ({ role: "user" as const, element })),
      ...assistantRoots.map((element) => ({ role: "assistant" as const, element })),
    ].sort((left, right) => this.compareDomOrder(left.element, right.element))
  }

  private extractUserQueryExportContentWithAssets(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    const body =
      this.extractQwenUserTextParts(element).join("\n\n").trim() ||
      this.extractUserQueryText(element)
    const attachments = this.extractQwenUserAttachments(element)

    if (attachments.length === 0) {
      return body
    }

    const imageMarkdown = this.formatQwenUserImageAttachments(attachments, collector)
    const fileMarkdown = this.formatQwenUserFileAttachments(attachments, collector)
    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, body].filter(Boolean).join("\n\n")
  }

  private extractQwenUserTextParts(element: Element): string[] {
    const scope = this.findUserMessageScope(element)
    const roots = this.collectTopLevelBlocks(
      this.queryElementsIncludingSelf(scope, this.config.sitePrivateSelectors.userContent),
    )
    const parts: string[] = []
    const seen = new Set<string>()

    roots.forEach((root) => {
      if (root.closest(".gh-user-query-markdown")) return

      const clone = root.cloneNode(true) as HTMLElement
      clone
        .querySelectorAll(this.config.sitePrivateSelectors.exportDecoration)
        .forEach((node) => node.remove())

      const text = this.extractTextWithLineBreaks(clone).trim()
      if (!text || seen.has(text)) return

      seen.add(text)
      parts.push(text)
    })

    return parts
  }

  private extractQwenUserAttachments(element: Element): QwenAiUserAttachment[] {
    const scope = this.findUserMessageScope(element)
    const attachments: QwenAiUserAttachment[] = []
    const seen = new Set<string>()

    const addAttachment = (attachment: QwenAiUserAttachment | null) => {
      if (!attachment) return

      const keys = this.getQwenAttachmentKeys(attachment)
      if (keys.some((key) => seen.has(key))) return

      keys.forEach((key) => seen.add(key))
      attachments.push(attachment)
    }

    this.collectTopLevelBlocks(
      this.queryElementsIncludingSelf(scope, this.config.sitePrivateSelectors.userImageCard),
    ).forEach((card) => addAttachment(this.extractQwenUserImageAttachment(card)))

    this.collectTopLevelBlocks(
      this.queryElementsIncludingSelf(scope, this.config.sitePrivateSelectors.userFileCard),
    ).forEach((card) => addAttachment(this.extractQwenUserFileAttachment(card)))

    return attachments
  }

  private extractQwenUserImageAttachment(card: Element): QwenAiUserAttachment | null {
    const image =
      card instanceof HTMLImageElement
        ? card
        : (card.querySelector("img") as HTMLImageElement | null)
    if (!(image instanceof HTMLImageElement)) return null

    const source = this.extractQwenImageSource(image)
    if (!source) return null

    const name =
      image.alt?.trim() ||
      image.getAttribute("title")?.trim() ||
      extractExportFilenameFromUrl(source) ||
      "uploaded image"
    const type = extractExportExtension(name) || extractExportExtensionFromUrl(source) || "image"

    return {
      kind: "image",
      name,
      source,
      type,
    }
  }

  private extractQwenUserFileAttachment(card: Element): QwenAiUserAttachment | null {
    const textParts = this.extractCleanTextParts(card)
    const { name, type, sizeLabel } = parseExportFileAttachmentText(textParts)
    const source = this.extractQwenDownloadableSource(card, {
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

  private formatQwenUserImageAttachments(
    attachments: QwenAiUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportImageAttachments(attachments, collector, { siteId: this.getSiteId() })
  }

  private formatQwenUserFileAttachments(
    attachments: QwenAiUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportFileAttachments(attachments, collector, { siteId: this.getSiteId() })
  }

  private extractQwenAssistantImages(element: Element): QwenAiAssistantImage[] {
    const scope = element.closest(this.config.selectors.assistantResponse) || element
    const images: QwenAiAssistantImage[] = []
    const seen = new Set<string>()

    this.queryElementsIncludingSelf(
      scope,
      this.config.sitePrivateSelectors.assistantGeneratedImage,
    ).forEach((node) => {
      if (!(node instanceof HTMLImageElement)) return
      if (node.closest(".gh-root, .gh-user-query-markdown")) return
      if (node.closest(this.config.sitePrivateSelectors.assistantImageDecoration)) return

      const source = this.extractQwenImageSource(node)
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

  private formatQwenAssistantImages(
    images: QwenAiAssistantImage[],
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
    const root = element.closest(this.config.sitePrivateSelectors.userMessageRoot)
    if (root) return root
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

  private extractQwenImageSource(image: HTMLImageElement): string {
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
      const source = this.normalizeQwenExportSource(candidate, { allowDataImage: true })
      if (source) return this.preferOriginalQwenImageUrl(source)
    }

    return ""
  }

  private extractQwenDownloadableSource(
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
        candidates.push(this.extractQwenImageSource(element))
      }

      QWENAI_ATTACHMENT_SOURCE_ATTRS.forEach((attr) => {
        if (!options.includeImages && element instanceof HTMLImageElement && attr === "src") {
          return
        }
        candidates.push(element.getAttribute(attr) || "")
      })
    })

    for (const candidate of candidates) {
      const source = this.normalizeQwenExportSource(candidate, {
        allowDataImage: options.allowDataImage,
      })
      if (source) return source
    }

    return ""
  }

  private normalizeQwenExportSource(value: string, options: { allowDataImage: boolean }): string {
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
      if (url.hostname === window.location.hostname) {
        if (
          QWENAI_CHAT_PATH_PATTERN.test(url.pathname) ||
          /^\/(?:c|s)(?:\/|$)/i.test(url.pathname)
        ) {
          return ""
        }
      }
      if (
        /^img\.alicdn\.com$/i.test(url.hostname) &&
        /\.(?:apng|svg)(?:$|[?#])/i.test(url.pathname)
      ) {
        return ""
      }
      if (
        /\/(?:static|assets)\//i.test(url.pathname) &&
        !/\.(png|jpe?g|webp|gif|avif|pdf|docx?|xlsx?|pptx?|json|txt|csv)(?:$|[?#])/i.test(
          url.pathname,
        )
      ) {
        return ""
      }
    } catch {
      return ""
    }

    return source
  }

  private preferOriginalQwenImageUrl(source: string): string {
    if (!/^https?:\/\//i.test(source)) return source

    try {
      const url = new URL(source)
      if (url.searchParams.has("x-oss-process")) {
        url.searchParams.delete("x-oss-process")
        return url.toString()
      }
    } catch {
      return source
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

  private getQwenAttachmentKeys(attachment: QwenAiUserAttachment): string[] {
    const sourceKey = getExportAttachmentSourceKey(attachment.source)
    const nameKey = attachment.name.trim().toLowerCase()
    const typeKey = attachment.type.trim().toLowerCase()
    const sizeKey = attachment.sizeLabel?.trim().toLowerCase() || ""

    if (sourceKey) return [`${attachment.kind}:source:${sourceKey}`]
    return [`${attachment.kind}:meta:${nameKey}:${typeKey}:${sizeKey}`]
  }

  private normalizeQwenCodeBlocks(root: HTMLElement): void {
    const codeBlocks = Array.from(root.querySelectorAll(this.config.sitePrivateSelectors.codeBlock))

    codeBlocks.forEach((block) => {
      const codeText = this.extractQwenCodeBlockText(block)
      if (!codeText) return

      const lang = this.extractQwenCodeLanguage(block)
      const pre = document.createElement("pre")
      const code = document.createElement("code")

      if (lang) {
        code.className = `language-${lang}`
      }

      code.textContent = codeText
      pre.appendChild(code)
      block.replaceWith(pre)
    })
  }

  private extractQwenCodeBlockText(block: Element): string | null {
    const mermaidSource = this.extractQwenMermaidSource(block)
    if (mermaidSource) return mermaidSource

    const lines = Array.from(block.querySelectorAll(this.config.sitePrivateSelectors.codeLine))
      .map((line) => this.normalizeQwenCodeLineText(line.textContent || ""))
      .filter((line, index, arr) => !(index === arr.length - 1 && line === "" && arr.length > 1))

    if (lines.length > 0) {
      const joined = lines.join("\n").replace(/\n+$/, "")
      return joined.trim() ? joined : null
    }

    const fallbackBody =
      block.querySelector(this.config.sitePrivateSelectors.codeBody) ||
      block.querySelector(this.config.sitePrivateSelectors.codeBodyFallback) ||
      block

    const fallbackText = this.normalizeQwenCodeLineText(fallbackBody.textContent || "")
    return fallbackText.trim() ? fallbackText : null
  }

  private extractQwenMermaidSource(block: Element): string | null {
    if (!this.isQwenMermaidCodeBlock(block)) return null

    const candidates: Element[] = []
    const pushCandidate = (element: Element | null | undefined) => {
      if (!element) return
      if (candidates.includes(element)) return
      candidates.push(element)
    }

    const codeBody = block.querySelector(this.config.sitePrivateSelectors.mermaidCodeBody)
    pushCandidate(codeBody)

    for (const selector of this.config.sitePrivateSelectors.mermaidCodeContent) {
      Array.from(block.querySelectorAll(selector)).forEach((node) => pushCandidate(node))
    }

    let bestSource: string | null = null

    for (const candidate of candidates) {
      const source = this.extractQwenCodeLinesFromRoot(candidate)
      if (!source) continue

      if (!bestSource || source.length > bestSource.length) {
        bestSource = source
      }
    }

    return bestSource
  }

  private isQwenMermaidCodeBlock(block: Element): boolean {
    const headerText = this.extractQwenCodeHeaderLabel(block).toLowerCase()

    if (headerText === "mermaid") return true

    if (block.querySelector(this.config.sitePrivateSelectors.mermaidCodeBody)) return true

    return block.querySelector(this.config.sitePrivateSelectors.mermaidChart) !== null
  }

  private extractQwenCodeLanguage(block: Element): string {
    const headerText = this.extractQwenCodeHeaderLabel(block).toLowerCase()

    if (headerText) return headerText

    const body = block.querySelector(
      this.config.sitePrivateSelectors.codeBody,
    ) as HTMLElement | null
    if (!body) return ""

    const classNames = Array.from(body.classList)
    const lang = classNames.find(
      (name) =>
        name !== "qwen-markdown-code-body" &&
        !["monaco", "editor", "body"].includes(name.toLowerCase()),
    )

    return lang?.trim().toLowerCase() || ""
  }

  private extractQwenCodeHeaderLabel(block: Element): string {
    const header = block.querySelector(
      this.config.sitePrivateSelectors.codeHeader,
    ) as HTMLElement | null
    if (!header) return ""

    const directChildren = Array.from(header.children)
    for (const child of directChildren) {
      if (!(child instanceof HTMLElement)) continue
      if (child.matches(this.config.sitePrivateSelectors.codeHeaderActions)) continue

      const text = child.textContent?.trim() || ""
      if (text) return text
    }

    const firstChild = header.firstElementChild as HTMLElement | null
    return firstChild?.textContent?.trim() || ""
  }

  private extractQwenCodeLinesFromRoot(root: Element): string | null {
    const lineNodes = Array.from(root.querySelectorAll(this.config.sitePrivateSelectors.codeLine))
    if (lineNodes.length === 0) return null

    const lines = lineNodes
      .map((line) => this.normalizeQwenCodeLineText(line.textContent || ""))
      .filter((line, index, arr) => !(index === arr.length - 1 && line === "" && arr.length > 1))

    if (lines.length === 0) return null

    const joined = lines.join("\n").replace(/\n+$/, "")
    return joined.trim() ? joined : null
  }

  private normalizeQwenCodeLineText(text: string): string {
    return text
      .replace(/\u00a0/g, " ")
      .replace(/\u200b/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\n/g, "")
      .replace(/\s+$/g, "")
  }

  private shouldIncludeThoughtsInExport(): boolean {
    if (typeof this.exportIncludeThoughtsOverride === "boolean") {
      return this.exportIncludeThoughtsOverride
    }

    return false
  }

  private getThoughtBlocksForElement(element: Element): string[] {
    const host = element.closest(this.config.selectors.assistantResponse)
    return (
      this.exportThoughtBlocks.get(element) ||
      (host ? this.exportThoughtBlocks.get(host) : undefined) ||
      []
    )
  }

  private clearThoughtExportCache(): void {
    this.exportThoughtBlocks = new WeakMap<Element, string[]>()
  }

  private async prepareMermaidBlocksForExport(): Promise<void> {
    this.clearMermaidExportMarkers()

    const codeBlocks = Array.from(
      document.querySelectorAll(this.config.sitePrivateSelectors.codeBlock),
    ).filter((block) => this.isQwenMermaidCodeBlock(block))

    for (const block of codeBlocks) {
      if (!(block instanceof HTMLElement)) continue
      const initialView = this.getQwenMermaidActiveView(block)
      const codeTab = this.findQwenMermaidViewTab(block, "code")
      const previewTab = this.findQwenMermaidViewTab(block, "preview")

      if (initialView !== "code" && codeTab) {
        try {
          codeTab.scrollIntoView({ block: "center", behavior: "auto" })
        } catch {
          // ignore scroll failures
        }

        this.simulateClick(codeTab)
      }

      let ready = await this.waitForMermaidCodeViewReady(block)

      if (!ready && initialView === "code" && previewTab && codeTab) {
        this.simulateClick(previewTab)
        await this.sleep(100)
        this.simulateClick(codeTab)
        ready = await this.waitForMermaidCodeViewReady(block)
      }

      if (ready && initialView !== "code") {
        block.setAttribute(QWENAI_MERMAID_EXPORT_SWITCHED_ATTR, "true")
      }
    }
  }

  private async restoreMermaidBlocksAfterExport(): Promise<void> {
    const blocks = Array.from(
      document.querySelectorAll(
        `${this.config.sitePrivateSelectors.codeBlock}[${QWENAI_MERMAID_EXPORT_SWITCHED_ATTR}]`,
      ),
    )

    for (const block of blocks) {
      if (!(block instanceof HTMLElement)) continue

      const previewTab = this.findQwenMermaidViewTab(block, "preview")
      if (previewTab && this.getQwenMermaidActiveView(block) !== "preview") {
        this.simulateClick(previewTab)
        await this.sleep(80)
      }

      block.removeAttribute(QWENAI_MERMAID_EXPORT_SWITCHED_ATTR)
    }
  }

  private clearMermaidExportMarkers(): void {
    document
      .querySelectorAll(
        `${this.config.sitePrivateSelectors.codeBlock}[${QWENAI_MERMAID_EXPORT_SWITCHED_ATTR}]`,
      )
      .forEach((node) => node.removeAttribute(QWENAI_MERMAID_EXPORT_SWITCHED_ATTR))
  }

  private getQwenMermaidActiveView(block: Element): "code" | "preview" | null {
    const switcher = block.querySelector(this.config.sitePrivateSelectors.mermaidSwitch)
    if (!(switcher instanceof HTMLElement)) return null

    const items = Array.from(
      switcher.querySelectorAll(this.config.sitePrivateSelectors.mermaidSwitchItem),
    )
    for (const item of items) {
      if (!(item instanceof HTMLElement)) continue
      const text = item.textContent?.trim().toLowerCase() || ""
      if (!text) continue

      if (item.matches(this.config.sitePrivateSelectors.mermaidActiveSwitch)) {
        if (text.includes("code")) return "code"
        if (text.includes("preview")) return "preview"
      }
    }

    return null
  }

  private findQwenMermaidViewTab(block: Element, target: "code" | "preview"): HTMLElement | null {
    const switcher = block.querySelector(this.config.sitePrivateSelectors.mermaidSwitch)
    if (!(switcher instanceof HTMLElement)) return null

    const items = Array.from(
      switcher.querySelectorAll(this.config.sitePrivateSelectors.mermaidSwitchItem),
    )
    for (const item of items) {
      if (!(item instanceof HTMLElement)) continue
      const text = item.textContent?.trim().toLowerCase() || ""
      if (!text.includes(target)) continue
      return item
    }

    return null
  }

  private async waitForMermaidCodeViewReady(block: Element, timeout = 2200): Promise<boolean> {
    const start = Date.now()
    let longestSource = ""
    let stableRounds = 0
    const expectedLineCount = this.getQwenMermaidExpectedLineCount(block)

    while (Date.now() - start < timeout) {
      if (this.getQwenMermaidActiveView(block) === "code") {
        const source = this.extractQwenMermaidSource(block) || ""
        if (source.length > longestSource.length) {
          longestSource = source
          stableRounds = 0
        } else if (source.length > 0) {
          stableRounds += 1
        }

        const lineCount = longestSource ? longestSource.split("\n").length : 0
        const lineReady = expectedLineCount > 1 ? lineCount >= expectedLineCount : lineCount > 0

        if (lineReady && stableRounds >= 2) {
          return true
        }
      }

      await this.sleep(80)
    }

    const lineCount = longestSource ? longestSource.split("\n").length : 0
    return expectedLineCount > 1 ? lineCount >= expectedLineCount : longestSource.length > 0
  }

  private getQwenMermaidExpectedLineCount(block: Element): number {
    const lineNumbers = Array.from(
      block.querySelectorAll(this.config.sitePrivateSelectors.codeLineNumber),
    )
      .map((node) => parseInt(node.textContent?.trim() || "", 10))
      .filter((value) => Number.isFinite(value) && value > 0)

    if (lineNumbers.length === 0) {
      return 0
    }

    return Math.max(...lineNumbers)
  }

  private parseThoughtExportState(state: unknown): QwenAiExportLifecycleState | null {
    if (!state || typeof state !== "object") return null

    const candidate = state as Partial<QwenAiExportLifecycleState>
    return {
      shouldCloseThoughtPanel: Boolean(candidate.shouldCloseThoughtPanel),
      usedApiExport: Boolean(candidate.usedApiExport),
    }
  }

  private async captureThoughtBlocksForMessage(message: Element): Promise<void> {
    const trigger = this.findThoughtTriggerForMessage(message)
    if (!trigger) return

    const previousSignature = this.getThoughtPanelSignature()

    try {
      trigger.scrollIntoView({ block: "center", behavior: "auto" })
    } catch {
      // ignore scroll failures
    }

    this.simulateClick(trigger)

    const panel =
      (await this.waitForThoughtPanelUpdate(previousSignature)) || this.getVisibleThoughtPanel()
    if (!panel || !this.isThoughtPanelForMessage(panel, message)) return

    const blocks = this.extractThoughtBlockquotesFromPanel(panel)
    if (blocks.length > 0) {
      this.exportThoughtBlocks.set(message, blocks)
    }

    await this.sleep(60)
  }

  private findThoughtTriggerForMessage(message: Element): HTMLElement | null {
    const privateSelectors = this.config.sitePrivateSelectors
    const candidates = Array.from(message.querySelectorAll(privateSelectors.thoughtTrigger))

    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) continue
      if (!this.isQwenElementVisible(candidate)) continue

      const title =
        candidate.querySelector(privateSelectors.thoughtTitle)?.textContent?.trim() ||
        candidate.textContent?.trim() ||
        ""

      if (!title) continue
      if (!/已.*完成思考|已经完成思考/i.test(title)) continue
      return candidate
    }

    return null
  }

  private isThoughtPanelForMessage(panel: Element, message: Element): boolean {
    const messageId = this.extractQwenAssistantMessageId(message)
    if (!messageId) return true

    const phaseIds = Array.from(panel.querySelectorAll(this.config.sitePrivateSelectors.phaseId))
      .map((node) => node.getAttribute("data-phase-id")?.trim() || "")
      .filter(Boolean)

    if (phaseIds.length === 0) return true
    return phaseIds.some((phaseId) => phaseId.includes(messageId))
  }

  private extractQwenAssistantMessageId(message: Element): string {
    const candidates = [
      message.id || "",
      ...this.config.sitePrivateSelectors.assistantMessageId.map(
        (selector) => message.querySelector(selector)?.id || "",
      ),
    ]

    for (const candidate of candidates) {
      const match = candidate.match(/(?:qwen-chat-message-assistant|chat-response-message)-(.+)$/)
      if (match?.[1]) return match[1]
    }

    return ""
  }

  private getVisibleThoughtPanel(): HTMLElement | null {
    const panels = document.querySelectorAll(this.config.sitePrivateSelectors.thoughtPanel)
    for (const panel of Array.from(panels)) {
      if (this.isQwenElementVisible(panel)) return panel as HTMLElement
    }
    return null
  }

  private getThoughtPanelSignature(panel?: Element | null): string | null {
    const target = panel || this.getVisibleThoughtPanel()
    if (!target) return null

    const phaseIds = Array.from(target.querySelectorAll(this.config.sitePrivateSelectors.phaseId))
      .map((node) => node.getAttribute("data-phase-id")?.trim() || "")
      .filter(Boolean)
    if (phaseIds.length > 0) {
      return phaseIds.join("|")
    }

    const blocks = this.extractThoughtBlockquotesFromPanel(target)
    if (blocks.length === 0) return null

    return blocks.join("\n\n")
  }

  private async waitForThoughtPanelUpdate(
    previousSignature: string | null,
    timeout = 2200,
  ): Promise<HTMLElement | null> {
    const start = Date.now()

    while (Date.now() - start < timeout) {
      const panel = this.getVisibleThoughtPanel()
      if (panel) {
        const signature = this.getThoughtPanelSignature(panel)
        if (signature && (previousSignature === null || signature !== previousSignature)) {
          return panel
        }
      }

      await this.sleep(80)
    }

    return null
  }

  private extractThoughtBlockquotesFromPanel(panel: Element): string[] {
    const privateSelectors = this.config.sitePrivateSelectors
    const container =
      panel.querySelector(privateSelectors.thoughtPanelContent) ||
      panel.querySelector(privateSelectors.thoughtPanelContentFallback) ||
      panel

    const cards = Array.from(container.querySelectorAll(privateSelectors.thoughtPanelCards))
    const blocks: string[] = []

    for (const card of cards) {
      const contentRoot =
        card.querySelector(privateSelectors.thoughtCardContent) ||
        card.querySelector(privateSelectors.thoughtMarkdown)
      if (!contentRoot) continue

      const title = card.querySelector(privateSelectors.thoughtTitle)?.textContent?.trim() || ""

      const clone = contentRoot.cloneNode(true) as HTMLElement
      this.normalizeQwenCodeBlocks(clone)
      clone
        .querySelectorAll(
          `${privateSelectors.thoughtTitle}, button, [role='button'], svg, [aria-hidden='true']`,
        )
        .forEach((node) => node.remove())

      const markdown = htmlToMarkdown(clone) || this.extractTextWithLineBreaks(clone)
      const normalized = markdown.trim()
      if (!normalized) continue

      blocks.push(this.formatAsThoughtBlockquote(normalized, title))
    }

    return blocks
  }

  private formatAsThoughtBlockquote(markdown: string, title?: string): string {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n")
    const quotedLines = lines.map((line) => (line.trim().length > 0 ? `> ${line}` : ">"))
    const normalizedTitle = (title || "").trim()
    const titleLines =
      normalizedTitle && !/已.*完成思考|已经完成思考/i.test(normalizedTitle)
        ? [`> **${normalizedTitle}**`, ">"]
        : []

    return ["> [Thoughts]", ...titleLines, ...quotedLines].join("\n")
  }

  private async closeThoughtPanelIfNeeded(timeout = 1500): Promise<void> {
    const panel = this.getVisibleThoughtPanel()
    if (!panel) return

    const closeButton = panel.querySelector(
      this.config.sitePrivateSelectors.thoughtPanelClose,
    ) as HTMLElement | null
    if (!closeButton || !this.isQwenElementVisible(closeButton)) return

    this.simulateClick(closeButton)

    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (!this.getVisibleThoughtPanel()) return
      await this.sleep(80)
    }
  }

  private async updateThemePreference(targetMode: "light" | "dark" | "system"): Promise<boolean> {
    const authorization = this.getQwenAuthorizationHeader()

    const response = await fetch("/api/v2/users/user/settings/update", {
      method: "POST",
      credentials: "include",
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "X-Request-Id": crypto.randomUUID(),
        source: "web",
      },
      body: JSON.stringify({
        ui: { theme: targetMode },
      }),
    })

    if (!response.ok) {
      throw new Error(`update theme failed: ${response.status}`)
    }

    const payload = (await response.json()) as QwenAiSettingsUpdateResponse
    return payload.success !== false
  }

  private syncThemeState(
    resolvedMode: "light" | "dark",
    preference: "light" | "dark" | "system" = resolvedMode,
  ): void {
    localStorage.setItem(QWENAI_THEME_STORAGE_KEY, preference)
    document.cookie = `${QWENAI_THEME_COOKIE_KEY}=${resolvedMode}; path=/; max-age=31536000`

    const html = document.documentElement
    html.classList.remove("light", "dark")
    html.classList.add(resolvedMode)
    html.setAttribute("data-theme", resolvedMode)
    html.style.colorScheme = resolvedMode

    if (document.body) {
      document.body.setAttribute("data-theme", resolvedMode)
      document.body.style.colorScheme = resolvedMode
    }

    const meta = document.querySelector('meta[name="color-scheme"]')
    if (meta) {
      meta.setAttribute("content", resolvedMode)
    }

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: QWENAI_THEME_STORAGE_KEY,
        newValue: preference,
        storageArea: localStorage,
      }),
    )
  }

  private resolveThemeMode(targetMode: "light" | "dark" | "system"): "light" | "dark" {
    if (targetMode !== "system") return targetMode

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }

  private async selectQwenModel(
    target: string,
  ): Promise<{ success: boolean; reason?: QwenAiModelLockFailureReason }> {
    const trigger = this.findModelTrigger()
    if (!trigger) return { success: false, reason: "button_not_found" }

    this.simulateClick(trigger)

    const primaryPopup = await this.waitForVisibleQwenModelPopup(
      this.config.sitePrivateSelectors.primaryModelPopup,
    )
    if (!primaryPopup) {
      return { success: false, reason: "menu_empty" }
    }

    const primaryItems = this.getQwenModelItems(primaryPopup)
    const primaryMatch = this.findBestQwenModelItem(primaryItems, target)
    if (primaryMatch) {
      this.clickQwenModelItem(primaryMatch)
      return { success: true }
    }

    const moreTrigger = this.findQwenMoreTrigger(primaryPopup)
    if (!moreTrigger) {
      document.body.click()
      return { success: false, reason: "not_found" }
    }

    const secondaryPopup = await this.openQwenMoreMenu(moreTrigger)
    if (!secondaryPopup) {
      document.body.click()
      return { success: false, reason: "menu_empty" }
    }

    const secondaryItems = this.getQwenModelItems(secondaryPopup)
    const secondaryMatch = this.findBestQwenModelItem(secondaryItems, target)
    if (!secondaryMatch) {
      document.body.click()
      return { success: false, reason: "not_found" }
    }

    this.clickQwenModelItem(secondaryMatch)
    return { success: true }
  }

  private async waitForVisibleQwenModelPopup(
    selector: string,
    maxAttempts = 8,
    delay = 150,
  ): Promise<HTMLElement | null> {
    for (let i = 0; i < maxAttempts; i++) {
      const popup = this.findVisibleQwenModelPopup(selector)
      if (popup) return popup
      await this.sleep(delay)
    }
    return null
  }

  private findVisibleQwenModelPopup(selector: string): HTMLElement | null {
    const nodes = this.findAllElementsBySelector(selector)
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue
      if (!this.isQwenElementVisible(node)) continue
      return node
    }
    return null
  }

  private getQwenModelItems(popup: HTMLElement): HTMLElement[] {
    const items = Array.from(popup.querySelectorAll(this.config.sitePrivateSelectors.modelItem))

    return items.filter(
      (item): item is HTMLElement => item instanceof HTMLElement && this.isQwenElementVisible(item),
    )
  }

  private findBestQwenModelItem(items: HTMLElement[], target: string): HTMLElement | null {
    const normalizedTarget = this.normalizeModelKeyword(target)
    if (!normalizedTarget) return null

    for (const item of items) {
      const name = this.normalizeModelKeyword(this.getQwenModelItemName(item))
      if (name === normalizedTarget) return item
    }

    for (const item of items) {
      const name = this.normalizeModelKeyword(this.getQwenModelItemName(item))
      if (name.endsWith(normalizedTarget)) return item
    }

    for (const item of items) {
      const name = this.normalizeModelKeyword(this.getQwenModelItemName(item))
      if (name.includes(normalizedTarget)) return item
    }

    return null
  }

  private getQwenModelItemName(item: HTMLElement): string {
    let label: Element = item
    for (const selector of this.config.sitePrivateSelectors.modelItemName) {
      const candidate = item.querySelector(selector)
      if (!candidate) continue
      label = candidate
      break
    }

    return (label.textContent || "").trim()
  }

  private findQwenMoreTrigger(popup: HTMLElement): HTMLElement | null {
    const trigger = popup.querySelector(this.config.sitePrivateSelectors.modelMoreTrigger)
    if (trigger instanceof HTMLElement && this.isQwenElementVisible(trigger)) {
      return trigger
    }
    return null
  }

  private async openQwenMoreMenu(trigger: HTMLElement): Promise<HTMLElement | null> {
    const targets: HTMLElement[] = [trigger]
    const innerCandidates = this.config.sitePrivateSelectors.modelMoreInner.map((selector) =>
      trigger.querySelector(selector),
    )

    innerCandidates.forEach((node) => {
      if (node instanceof HTMLElement && !targets.includes(node)) {
        targets.push(node)
      }
    })

    for (const target of targets) {
      this.dispatchQwenMoreMenuHover(target)

      let popup = await this.waitForVisibleQwenSecondaryPopup(trigger, 3, 100)
      if (popup) return popup

      this.simulateClick(target)
      popup = await this.waitForVisibleQwenSecondaryPopup(trigger, 4, 120)
      if (popup) return popup
    }

    return this.waitForVisibleQwenSecondaryPopup(trigger, 4, 150)
  }

  private async waitForVisibleQwenSecondaryPopup(
    trigger: HTMLElement,
    maxAttempts = 8,
    delay = 150,
  ): Promise<HTMLElement | null> {
    for (let i = 0; i < maxAttempts; i++) {
      const popup = this.findVisibleQwenSecondaryPopup(trigger)
      if (popup) return popup
      await this.sleep(delay)
    }
    return null
  }

  private findVisibleQwenSecondaryPopup(trigger: HTMLElement): HTMLElement | null {
    const nested = trigger.querySelector(this.config.sitePrivateSelectors.secondaryModelPopup)
    if (nested instanceof HTMLElement && this.isQwenElementVisible(nested)) {
      return nested
    }

    return this.findVisibleQwenModelPopup(this.config.sitePrivateSelectors.secondaryModelPopup)
  }

  private dispatchQwenMoreMenuHover(element: HTMLElement): void {
    const rect = element.getBoundingClientRect()
    const eventInit: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      view: window,
    }

    const mouseEvents: Array<keyof GlobalEventHandlersEventMap> = [
      "pointerover",
      "pointerenter",
      "mouseover",
      "mouseenter",
      "mousemove",
    ]

    mouseEvents.forEach((eventName) => {
      try {
        if (eventName.startsWith("pointer") && typeof PointerEvent !== "undefined") {
          element.dispatchEvent(
            new PointerEvent(eventName, {
              ...eventInit,
              pointerType: "mouse",
              isPrimary: true,
            }),
          )
          return
        }

        element.dispatchEvent(new MouseEvent(eventName, eventInit))
      } catch {
        // 静默降级到后续 click
      }
    })
  }

  private clickQwenModelItem(item: HTMLElement): void {
    this.simulateClick(item)
    window.setTimeout(() => {
      document.body.click()
    }, 100)
  }

  private normalizeModelKeyword(text: string): string {
    return (text || "").toLowerCase().replace(/\s+/g, " ").trim()
  }

  private isQwenElementVisible(element: Element | null): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false
    if (!element.isConnected) return false

    const style = window.getComputedStyle(element)
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      parseFloat(style.opacity || "1") === 0
    ) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  private async showQwenModelLockFailure(
    keyword: string,
    reason: QwenAiModelLockFailureReason,
  ): Promise<void> {
    try {
      const { showToast } = await import("~utils/toast")
      const { t } = await import("~utils/i18n")

      let message: string
      switch (reason) {
        case "button_not_found":
          message = t("modelLockFailedNoButton")
          break
        case "menu_empty":
          message = t("modelLockFailedMenuEmpty")
          break
        case "not_found":
        default:
          message = t("modelLockFailedNotFound").replace("{model}", keyword)
          break
      }

      showToast(message, 3000)
    } catch (error) {
      console.error("[QwenAiAdapter] Failed to show model lock error:", error)
    }
  }

  private readCookieValue(name: string): string | null {
    const pattern = new RegExp(`(?:^|; )${name}=([^;]+)`)
    const matched = document.cookie.match(pattern)
    if (!matched?.[1]) return null

    try {
      return decodeURIComponent(matched[1]).trim() || null
    } catch {
      return matched[1].trim() || null
    }
  }

  private getQwenAccessToken(): string | null {
    const rawState = localStorage.getItem(QWENAI_ACCESS_TOKEN_STATE_KEY)
    if (rawState) {
      try {
        const state = JSON.parse(rawState) as { token?: unknown }
        if (typeof state.token === "string" && state.token.trim()) {
          return state.token.trim()
        }
      } catch {
        // 状态损坏时回退到旧版 token，保持与站点旧缓存兼容
      }
    }

    return localStorage.getItem(QWENAI_TOKEN_STORAGE_KEY)?.trim() || null
  }

  private getQwenAuthorizationHeader(): string | null {
    const token = this.getQwenAccessToken()
    if (!token) return null
    return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`
  }

  private extractUidFromToken(token: string | null): string | null {
    if (!token) return null

    try {
      const payload = token.split(".")[1]
      if (!payload) return null

      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
      const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))
      const parsed = JSON.parse(decoded) as Record<string, unknown>
      const id = parsed.id
      return typeof id === "string" && id.trim() ? id.trim() : null
    } catch {
      return null
    }
  }

  private findUserContentRoot(element: Element): HTMLElement | null {
    const selector = this.config.sitePrivateSelectors.userContent
    if (element.matches(selector)) return element as HTMLElement
    return (element.querySelector(selector) as HTMLElement | null) || (element as HTMLElement)
  }

  private findAssistantContentRoot(element: Element): HTMLElement | null {
    const selector = this.config.sitePrivateSelectors.assistantContent
    if (element.matches(selector)) return element as HTMLElement
    return (element.querySelector(selector) as HTMLElement | null) || (element as HTMLElement)
  }

  private extractAssistantPlainText(element: Element): string {
    const contentRoot = this.findAssistantContentRoot(element)
    if (!contentRoot) return ""

    const clone = contentRoot.cloneNode(true) as HTMLElement
    this.normalizeQwenCodeBlocks(clone)

    clone
      .querySelectorAll(
        `${this.config.sitePrivateSelectors.thinkingCard}, ${this.config.sitePrivateSelectors.responseToolbar}, button, [role='button'], svg, [aria-hidden='true']`,
      )
      .forEach((node) => node.remove())

    return this.extractTextWithLineBreaks(clone).trim()
  }

  private findModelTrigger(): HTMLElement | null {
    const privateSelectors = this.config.sitePrivateSelectors
    const trigger = document.querySelector(privateSelectors.modelTrigger)
    if (trigger instanceof HTMLElement && this.isVisibleActionElement(trigger)) {
      return trigger
    }

    const label = document.querySelector(privateSelectors.modelText) as HTMLElement | null
    if (!label) return null

    const closest = label.closest(privateSelectors.modelTriggerFallback)
    return closest instanceof HTMLElement ? closest : label
  }

  private isStopLikeButton(button: HTMLElement | null): boolean {
    if (!button) return false

    const iconUse = button.querySelector("use")
    const iconHref = iconUse?.getAttribute("xlink:href") || iconUse?.getAttribute("href") || ""
    const text = (button.innerText || button.textContent || "").trim().toLowerCase()

    return /stop/i.test(iconHref) || text.includes("stop") || text.includes("停止")
  }

  private findStopButton(): HTMLElement | null {
    const stopButton = this.findVisibleElementBySelectors(this.getStopButtonSelectors())
    if (stopButton && !this.isDisabledActionElement(stopButton)) {
      return stopButton
    }

    const composerButton = document.querySelector(
      this.config.sitePrivateSelectors.composerButton,
    ) as HTMLElement | null
    if (
      this.isVisibleActionElement(composerButton) &&
      !this.isDisabledActionElement(composerButton) &&
      this.isStopLikeButton(composerButton)
    ) {
      return composerButton
    }

    return null
  }

  private isVisibleActionElement(element: HTMLElement | null): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false
    if (!element.isConnected) return false

    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private isDisabledActionElement(element: HTMLElement | null): boolean {
    if (!(element instanceof HTMLElement)) return true

    return (
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-disabled") === "true" ||
      /\bdisabled\b/i.test(element.className || "")
    )
  }

  private truncateText(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  }
}
