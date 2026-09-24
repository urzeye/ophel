/**
 * DeepSeek 适配器（chat.deepseek.com）
 *
 * 选择器策略：
 * - 优先使用 `ds-*` 语义类名
 * - 对话列表优先使用 `/a/chat/s/{id}` 路由结构
 * - 对用户消息采用“消息容器内不存在 `.ds-markdown`”的结构判断
 *
 * 注意：DeepSeek 页面存在部分 CSS Modules 哈希类名，首版实现尽量避免依赖它们。
 */
import { SITE_IDS } from "~constants"
import { deepseekNativeThemeCss } from "~styles/native-theme-adapters/deepseek"
import {
  createExportAssetCollector,
  formatExportFileAttachments,
  formatExportImageAttachments,
  isDownloadableExportAssetUrl,
  normalizeExportAssetUrl,
  type ExportAssetCollector,
} from "~utils/export-assets"
import { htmlToMarkdown, type ExportBundle } from "~utils/exporter"
import { t } from "~utils/i18n"
import { EVENT_OUTLINE_DATA_UPDATED } from "~utils/messaging"
import { hashOutlineText, stripMarkdownInline } from "~utils/outline-heading-cache"

import {
  SiteAdapter,
  type AnchorData,
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type ExportLifecycleContext,
  type NetworkMonitorConfig,
  type OutlineItem,
  type PanelAvoidanceConfig,
  type SiteDeleteConversationResult,
  type ZenModeConfig,
} from "./base"
import {
  DEEPSEEK_CONFIG,
  DEEPSEEK_CONFIG_VERSION,
  type DeepSeekSiteConfig,
} from "./deepseek-config"
import {
  parseDeepSeekHistoryOutline,
  type DeepSeekHistoryOutlineData,
} from "./deepseek-history-outline"
import {
  isApiOutlineStale,
  mergeByBranchMessageOrder,
  shouldAttemptApiOutlineFetch,
} from "~utils/outline-api-source"
import { parseDeepSeekHistoryExport } from "./deepseek-history-export"
import {
  alignScrollTop,
  isDeepSeekVirtualEdgeSettled,
  settleVirtualScroll,
  waitForVirtualScrollQuiet,
} from "~utils/virtual-scroll-settle"
import type {
  VirtualOutlinePositionSnapshot,
  VirtualPositionAnchor,
} from "~utils/virtual-outline-position"
import type { BuiltinSiteConfig } from "./declarative"

const CHAT_PATH_PATTERN = /\/a\/chat\/s\/([a-z0-9-]+)/i
const SHARE_PATH_PATTERN = /\/share\/([a-z0-9-]+)/i
const TOKEN_STORAGE_PREFIX = "__tea_cache_tokens_"
const THEME_STORAGE_KEY = "__appKit_@deepseek/chat_themePreference"
const USER_TOKEN_STORAGE_KEY = "userToken"
const OUTLINE_HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6"
const CHAT_DELETE_API_PATH = "/api/v0/chat_session/delete"
const CHAT_HISTORY_API_PATH = "/api/v0/chat/history_messages"
/**
 * history_messages 接口按请求头返回两种数据形态：不带 x-client-version 时
 * fragments 整体为空，思考链只有 thinking_content（其中混入"已浏览网页。"等
 * 本地化工具状态行），图片附件的 FILE 片段也拿不到；带上后 fragments 完整
 * （THINK/FILE/TOOL_* 齐全），thinking_content 为空。版本号过期时服务端只会
 * 退回旧形态，不会报错。
 */
const DEEPSEEK_CLIENT_VERSION = "2.5.0"
/** 历史消息接口拉取冷却间隔（含失败与 version 未变的成功重拉），避免每次 extractOutline 都重试 */
const API_OUTLINE_FETCH_BACKOFF_MS = 10_000
/** 尾部删除复合判定中的贴底容差（约一行高度） */
const API_OUTLINE_BOTTOM_TOLERANCE_PX = 100
/** 直接滚动探测虚拟列表的最大尝试次数（闭环收敛，通常 1-3 次） */
const VIRTUAL_ROW_PROBE_MAX_ATTEMPTS = 8
/** 挂载窗口无变化时的短等待（给异步重挂载一帧时间） */
const VIRTUAL_ROW_PROBE_SETTLE_MS = 60
const DEEPSEEK_HOME_URL = "https://chat.deepseek.com/"
const DELETE_REFRESH_STORAGE_KEY = "gh.deepseek.delete.refresh"
const DEEPSEEK_EXPORT_ROOT_ATTR = "data-gh-deepseek-export-root"
const DEEPSEEK_EXPORT_ROLE_ATTR = "data-gh-deepseek-export-role"
const DEEPSEEK_EXPORT_ROLE_USER = "user"
const DEEPSEEK_EXPORT_ROLE_ASSISTANT = "assistant"
const DEEPSEEK_EXPORT_USER_SELECTOR = `[${DEEPSEEK_EXPORT_ROOT_ATTR}="1"] [${DEEPSEEK_EXPORT_ROLE_ATTR}="${DEEPSEEK_EXPORT_ROLE_USER}"]`
const DEEPSEEK_EXPORT_ASSISTANT_SELECTOR = `[${DEEPSEEK_EXPORT_ROOT_ATTR}="1"] [${DEEPSEEK_EXPORT_ROLE_ATTR}="${DEEPSEEK_EXPORT_ROLE_ASSISTANT}"]`
const NATIVE_OUTLINE_SETTLE_MS = 120
const USER_QUERY_REVEAL_TIMEOUT_MS = 3200
const USER_QUERY_REVEAL_INTERVAL_MS = 80

const DEEPSEEK_DELETE_REASON = {
  MISSING_AUTH_TOKEN: "delete_api_missing_auth_token",
  API_REQUEST_FAILED: "delete_api_request_failed",
  API_INVALID_RESPONSE: "delete_api_invalid_response",
  API_BUSINESS_FAILED: "delete_api_business_failed",
} as const

interface DeepSeekNativeOutlineEntry {
  text: string
  scrollTop?: number
  batchIndex?: number
}

interface DeepSeekNativeOutlineCache {
  sessionId: string
  snapshot: string
  items: DeepSeekNativeOutlineEntry[]
}

interface DeepSeekExportMessageSnapshot {
  role: "user" | "assistant"
  content: string
}

interface DeepSeekUserAttachment {
  kind: "image" | "file"
  name: string
  type: string
  size: string
  source: string
}

export class DeepSeekAdapter extends SiteAdapter {
  protected config: DeepSeekSiteConfig = DEEPSEEK_CONFIG
  private nativeOutlineCache: DeepSeekNativeOutlineCache | null = null
  private nativeOutlineRevealRequestId = 0
  private apiOutlineData: DeepSeekHistoryOutlineData | null = null
  private apiOutlineFetchPromise: Promise<void> | null = null
  private apiOutlineLastFetchAt = 0
  private apiOutlineParseFailures = 0
  private apiOutlineSessionId = ""
  private apiBranchIndexCache: {
    data: DeepSeekHistoryOutlineData
    map: Map<number, number>
  } | null = null
  private exportSnapshotRoot: HTMLElement | null = null
  private exportSnapshotActive = false
  private exportIncludeThoughtsOverride: boolean | null = null
  private exportBundleCache: ExportBundle | null = null

  match(): boolean {
    const isMatch = window.location.hostname === "chat.deepseek.com"
    if (isMatch) {
      this.consumePendingDeleteRefresh()
    }
    return isMatch
  }

  getSiteId(): string {
    return SITE_IDS.DEEPSEEK
  }

  getName(): string {
    return "DeepSeek"
  }

  getBuiltinConfig(): DeepSeekSiteConfig {
    return DEEPSEEK_CONFIG
  }

  getBuiltinConfigVersion(): number {
    return DEEPSEEK_CONFIG_VERSION
  }

  applyMergedConfig(config: BuiltinSiteConfig): void {
    this.config = config as DeepSeekSiteConfig
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#4b6bfe", secondary: "#3a5ae0" }
  }

  getNativeThemeCss(): string | null {
    return deepseekNativeThemeCss
  }

  getTextareaSelectors(): string[] {
    return [...this.config.selectors.textarea]
  }

  getSubmitKeyConfig(): { key: "Enter" | "Ctrl+Enter" } {
    return { key: this.config.input.submitKey ?? "Enter" }
  }

  getQuickQuoteSupportMode() {
    return this.config.quickQuote
  }

  insertPrompt(content: string): boolean {
    const el = this.getTextareaElement() as HTMLTextAreaElement | null
    if (!el || !el.isConnected) return false

    el.focus()

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    if (setter) {
      setter.call(el, content)
    } else {
      el.value = content
    }

    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: content }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    el.setSelectionRange(content.length, content.length)
    return true
  }

  clearTextarea(): void {
    const el = this.getTextareaElement() as HTMLTextAreaElement | null
    if (!el || !el.isConnected) return

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    if (setter) {
      setter.call(el, "")
    } else {
      el.value = ""
    }

    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: "" }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    el.setSelectionRange(0, 0)
  }

  getSessionId(): string {
    const path = window.location.pathname
    const chatMatch = path.match(CHAT_PATH_PATTERN)
    if (chatMatch?.[1]) {
      return chatMatch[1]
    }

    const shareMatch = path.match(SHARE_PATH_PATTERN)
    return shareMatch?.[1] || ""
  }

  isNewConversation(): boolean {
    const path = window.location.pathname
    if (this.isSharePage()) return false

    return (
      path === "/" || path === "/a/chat" || path === "/a/chat/" || !CHAT_PATH_PATTERN.test(path)
    )
  }

  isSharePage(): boolean {
    // 自有对话：/a/chat/s/ID    分享对话：/share/ID
    return window.location.pathname.startsWith("/share/")
  }

  getNewTabUrl(): string {
    return "https://chat.deepseek.com/"
  }

  getSessionName(): string | null {
    const conversationTitle = this.getConversationTitle()
    if (conversationTitle) return conversationTitle

    const title = this.getDocumentConversationTitle() || ""
    if (!title || title === "DeepSeek") return null

    return title.replace(/\s*[-|]\s*DeepSeek$/i, "").trim() || null
  }

  getCurrentCid(): string | null {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || !key.startsWith(TOKEN_STORAGE_PREFIX)) continue

        const raw = localStorage.getItem(key)
        if (!raw) continue

        const data = JSON.parse(raw) as Record<string, unknown>
        const uid = data.user_unique_id
        if (typeof uid === "string" && uid) {
          return uid
        }
      }
    } catch {
      // ignore malformed localStorage data
    }

    return null
  }

  getConversationList(): ConversationInfo[] {
    const cid = this.getCurrentCid() || undefined
    const links = document.querySelectorAll(this.config.conversation.itemSelector)
    const map = new Map<string, ConversationInfo>()

    links.forEach((link) => {
      const info = this.extractConversationInfo(link, cid)
      if (info) {
        map.set(info.id, info)
      }
    })

    return Array.from(map.values())
  }

  getConversationObserverConfig(): ConversationObserverConfig {
    return {
      selector: this.config.conversation.itemSelector,
      shadow: this.config.conversation.shadow ?? false,
      extractInfo: (el) => this.extractConversationInfo(el, this.getCurrentCid() || undefined),
      getTitleElement: (el) => this.findTitleElement(el),
    }
  }

  async deleteConversationOnSite(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    const currentSessionId = this.getSessionId()
    const token = this.getUserToken()
    if (!token) {
      return {
        id: target.id,
        success: false,
        method: "api",
        reason: DEEPSEEK_DELETE_REASON.MISSING_AUTH_TOKEN,
      }
    }

    const result = await this.deleteConversationViaApi(target, token)
    if (result.success) {
      if (target.id === currentSessionId) {
        this.scheduleHomeRefreshAfterDelete()
      } else {
        this.schedulePageReloadAfterDelete()
      }
    }
    return result
  }

  async deleteConversationsOnSite(
    targets: ConversationDeleteTarget[],
  ): Promise<SiteDeleteConversationResult[]> {
    if (targets.length === 0) {
      return []
    }

    const currentSessionId = this.getSessionId()
    const token = this.getUserToken()
    if (!token) {
      return targets.map((target) => ({
        id: target.id,
        success: false,
        method: "api",
        reason: DEEPSEEK_DELETE_REASON.MISSING_AUTH_TOKEN,
      }))
    }

    const results: SiteDeleteConversationResult[] = []
    let deletedCurrentSession = false
    let hasSuccessfulDeletion = false

    for (const target of targets) {
      const result = await this.deleteConversationViaApi(target, token)
      results.push(result)
      if (result.success) {
        hasSuccessfulDeletion = true
        if (target.id === currentSessionId) {
          deletedCurrentSession = true
        }
      }
    }

    if (hasSuccessfulDeletion) {
      if (deletedCurrentSession) {
        this.scheduleHomeRefreshAfterDelete()
      } else {
        this.schedulePageReloadAfterDelete()
      }
    }

    return results
  }

  getConversationTitle(): string | null {
    if (this.isSharePage()) {
      return this.getShareConversationTitle()
    }

    const sessionId = this.getSessionId()
    const conversationLink = this.config.conversation.itemSelector
    const activeMatch = this.config.conversation.activeMatch
    const activeLink =
      (sessionId
        ? document.querySelector(`${conversationLink}[href*="/a/chat/s/${sessionId}"]`)
        : null) ||
      (activeMatch
        ? Array.from(document.querySelectorAll(conversationLink)).find((link) =>
            link.matches(activeMatch),
          )
        : null)

    if (!activeLink) return null
    return this.extractConversationTitle(activeLink)
  }

  navigateToConversation(id: string, url?: string): boolean {
    if ((this.config.conversation.navigationStrategy ?? "click-item") !== "location") {
      const conversationLink = this.config.conversation.itemSelector
      const link = document.querySelector(
        `${conversationLink}[href*="/a/chat/s/${id}"]`,
      ) as HTMLElement | null

      if (link) {
        link.click()
        return true
      }
    }

    const path = this.config.conversation.urlTemplate.replace("{id}", encodeURIComponent(id))
    return super.navigateToConversation(id, url || new URL(path, DEEPSEEK_HOME_URL).toString())
  }

  getSidebarScrollContainer(): Element | null {
    const firstLink = document.querySelector(this.config.conversation.itemSelector)
    return firstLink?.closest(this.config.sitePrivateSelectors.sidebarScrollArea) || null
  }

  getZenModeConfig() {
    const { hide, rootClass, styles } = this.config.zenMode
    return {
      ...(hide ? { hide: [...hide] } : {}),
      ...(rootClass ? { rootClass: { ...rootClass } } : {}),
      ...(styles ? { styles: styles.map((style) => ({ ...style })) } : {}),
    }
  }

  getCleanModeConfig(): ZenModeConfig | null {
    const { hide, preserveFlow, rootClass, styles } = this.config.cleanMode
    return {
      ...(hide ? { hide: [...hide] } : {}),
      ...(preserveFlow ? { preserveFlow: [...preserveFlow] } : {}),
      ...(rootClass ? { rootClass: { ...rootClass } } : {}),
      ...(styles ? { styles: styles.map((style) => ({ ...style })) } : {}),
    }
  }

  getScrollContainer(): HTMLElement | null {
    const messageSelector = this.config.sitePrivateSelectors.message
    const topLevelMessages = Array.from(document.querySelectorAll(messageSelector)).filter(
      (message) => !message.parentElement?.closest(messageSelector),
    )
    const fromMessages = this.pickBestScrollableAncestor(topLevelMessages)
    if (fromMessages) {
      return fromMessages
    }

    const fallbackRoots = Array.from(
      document.querySelectorAll(
        `${this.config.selectors.assistantResponse}, ${this.config.selectors.userQuery}`,
      ),
    ).filter((element) => !element.closest(".gh-root, .gh-table-container"))
    return this.pickBestScrollableAncestor(fallbackRoots)
  }

  override async waitForVirtualListEdge(
    edge: "start" | "end",
    signal?: AbortSignal,
  ): Promise<boolean> {
    return settleVirtualScroll(
      () => this.getScrollContainer(),
      (container) => isDeepSeekVirtualEdgeSettled(container, edge),
      (container) => alignScrollTop(container, edge === "start" ? 0 : container.scrollHeight),
      signal,
    )
  }

  override isVirtualScrollConversation(): boolean {
    const container = this.getScrollContainer()
    if (!container) return false
    return container.querySelector("[data-virtual-list-item-key]") !== null
  }

  override getVirtualAnchorElement(): AnchorData | null {
    if (!this.isVirtualScrollConversation()) return null
    const container = this.getScrollContainer()
    if (!container) return null
    const rows = this.readMountedVirtualRows(container)
    if (!rows.length) return null

    // 视口上沿那条已挂载的行；readMountedVirtualRows 的 top 是视口坐标，
    // translateY 位移已包含在内
    const containerRect = container.getBoundingClientRect()
    const viewportLine = containerRect.top + 100
    let best: { key: number; top: number } | null = null
    for (const row of rows) {
      if (row.top <= viewportLine && (!best || row.top > best.top)) {
        best = row
      }
    }
    if (!best) best = rows[0]

    const element = container.querySelector(`[data-virtual-list-item-key="${best.key}"]`)
    if (!element) return null

    const rowTop = best.top - containerRect.top + container.scrollTop
    return {
      type: "virtual-row",
      rowKey: best.key,
      offset: container.scrollTop - rowTop,
      textSignature: (element.textContent || "").trim().substring(0, 50),
    }
  }

  override async restoreVirtualAnchor(anchor: AnchorData, signal?: AbortSignal): Promise<boolean> {
    if (anchor.type !== "virtual-row" || typeof anchor.rowKey !== "number") return false
    const rowKey = anchor.rowKey
    const offset = anchor.offset || 0

    // 虚拟窗口的挂载晚于会话 id 就绪，冷加载可能要数秒，有界等待其出现；
    // 期间用户主动滚动会通过 signal 中止等待
    const deadline = Date.now() + 10000
    while (!this.isVirtualScrollConversation()) {
      if (signal?.aborted) return false
      if (Date.now() >= deadline) {
        console.warn("[Ophel] Reading history restore skipped: DeepSeek message list not ready")
        return false
      }
      await this.sleep(100)
    }

    const container = this.getScrollContainer()
    if (!container) return false

    // 等站点自己的开场滚动（自动去底部、渲染引发的调整）安静下来再动手，
    // 否则恢复期间会被站点反复拽走，永远无法落定
    const quiet = await waitForVirtualScrollQuiet(() => this.getScrollContainer(), signal)
    if (signal?.aborted) return false
    if (!quiet) {
      console.warn("[Ophel] Reading history restore skipped: DeepSeek page kept scrolling")
      return false
    }

    // 复用大纲跳转的探测闭环：按 message_id 把目标行挂出来；
    // 有大纲接口缓存数据时传入，分支序号距离比 id 差值更准
    const apiData = this.apiOutlineData
    const outlineData = apiData && apiData.sessionId === this.getSessionId() ? apiData : null
    const row = await this.probeMountVirtualRow(rowKey, container, outlineData, null, signal)
    if (signal?.aborted) return false
    if (!row) {
      console.warn("[Ophel] Reading history restore skipped: DeepSeek message not found", rowKey)
      return false
    }

    // key 是服务端 message_id，天然稳定；文本签名兜底防极端错位
    if (anchor.textSignature) {
      const current = (row.textContent || "").trim().substring(0, 50)
      if (current !== anchor.textSignature) {
        console.warn(
          "[Ophel] Reading history restore skipped: DeepSeek message content changed",
          rowKey,
        )
        return false
      }
    }

    const findRow = (c: HTMLElement) => c.querySelector(`[data-virtual-list-item-key="${rowKey}"]`)
    const docTop = (c: HTMLElement, el: Element) => {
      const cRect = c.getBoundingClientRect()
      const rRect = el.getBoundingClientRect()
      return rRect.top - cRect.top + c.scrollTop
    }

    // 落定判定用「行相对容器顶部的视觉位置」而不是 scrollTop 像素：刷新后页面仍在
    // 渲染，文档高度在漂，像素值几秒内稳定不下来；视觉位置才是保存 offset 的本义
    const samples: string[] = []
    let lastAlignedTop: number | null = null
    const isAligned = (c: HTMLElement) => {
      const target = findRow(c)
      if (!target) {
        samples.push("row-unmounted")
        return false
      }
      const visualOffset = target.getBoundingClientRect().top - c.getBoundingClientRect().top
      samples.push(`vo=${Math.round(visualOffset + offset)} st=${Math.round(c.scrollTop)}`)
      return Math.abs(visualOffset + offset) <= 24
    }
    const settled = await settleVirtualScroll(
      () => this.getScrollContainer(),
      isAligned,
      (c) => {
        // 上一拍对准之后 scrollTop 又被改动：站点自己的滚动在与恢复竞争
        if (lastAlignedTop !== null && Math.abs(c.scrollTop - lastAlignedTop) > 2) {
          samples.push(`external-scroll=${Math.round(c.scrollTop)}`)
        }
        const target = findRow(c)
        if (target) {
          alignScrollTop(c, docTop(c, target) + offset)
          lastAlignedTop = c.scrollTop
        }
      },
      signal,
      { timeoutMs: 4000 },
    )
    if (settled || signal?.aborted) return settled

    // 收敛失败但行仍在目标附近（渲染抖动导致始终差几像素）则接受现状；
    // 行已不在 DOM（被站点拽走）才算失败
    const finalContainer = this.getScrollContainer()
    const finalRow = finalContainer ? findRow(finalContainer) : null
    if (finalContainer && finalRow) {
      const visualOffset =
        finalRow.getBoundingClientRect().top - finalContainer.getBoundingClientRect().top
      if (Math.abs(visualOffset + offset) <= 240) {
        console.warn(
          "[Ophel] Reading history restore accepted with loose alignment",
          samples.slice(-12),
        )
        return true
      }
    }
    console.warn(
      "[Ophel] Reading history restore incomplete: DeepSeek scroll did not settle",
      samples.slice(-12),
    )
    return false
  }

  /**
   * 高亮估算快照：以当前挂载窗口的 key（= 服务端 message_id）映射分支序号做锚点，
   * 行顶、行底各记一个点；边界取分支消息总数与最大 scrollTop（与大纲高亮同一
   * 内容坐标系）。
   */
  override getVirtualOutlinePositionSnapshot(): VirtualOutlinePositionSnapshot | null {
    const container = this.getScrollContainer()
    if (!container || !this.isVirtualScrollConversation()) return null
    const data = this.apiOutlineData
    if (!data || data.sessionId !== this.getSessionId()) return null

    const branchIndex = this.getApiBranchIndex(data)
    const containerRect = container.getBoundingClientRect()
    const anchors: VirtualPositionAnchor[] = []
    container.querySelectorAll("[data-virtual-list-item-key]").forEach((row) => {
      const key = Number(row.getAttribute("data-virtual-list-item-key"))
      const index = branchIndex.get(key)
      if (index === undefined) return
      const rect = row.getBoundingClientRect()
      const top = rect.top - containerRect.top + container.scrollTop
      anchors.push({ index, top })
      anchors.push({ index: index + 1, top: top + rect.height })
    })
    if (anchors.length === 0) return null

    return {
      anchors,
      bounds: {
        endSlot: data.branchMessageIds.length,
        endTop: Math.max(0, container.scrollHeight - container.clientHeight),
      },
    }
  }

  override getVirtualOutlineRowIndex(item: OutlineItem): number | null {
    const data = this.apiOutlineData
    if (!data || data.sessionId !== this.getSessionId()) return null
    const branchIndex = this.getApiBranchIndex(data)

    const ref = item.navigationId || item.id
    const headingRef = this.parseApiOutlineItemId(ref)
    if (headingRef) return branchIndex.get(headingRef.messageId) ?? null
    const queryMessageId = this.parseApiUserQueryItemId(ref)
    if (queryMessageId !== null) return branchIndex.get(queryMessageId) ?? null

    const mountedId = this.getMountedRowMessageId(item.element)
    return mountedId !== null ? branchIndex.get(mountedId) ?? null : null
  }

  private getApiBranchIndex(data: DeepSeekHistoryOutlineData): Map<number, number> {
    if (this.apiBranchIndexCache?.data === data) return this.apiBranchIndexCache.map
    const map = new Map(data.branchMessageIds.map((id, index) => [id, index]))
    this.apiBranchIndexCache = { data, map }
    return map
  }

  getResponseContainerSelector(): string {
    return this.config.selectors.responseContainer
  }

  getUserQuerySelector(): string {
    return this.config.selectors.userQuery
  }

  findUserQueryElement(queryIndex: number, text: string): Element | null {
    const elements = this.getVisibleUserQueryElements()
    if (elements.length === 0) return null

    if (queryIndex > 0 && elements.length >= queryIndex) {
      const candidate = elements[queryIndex - 1]
      if (this.isEquivalentUserQueryText(this.extractUserQueryText(candidate), text)) {
        return candidate
      }
    }

    return (
      elements.find((element) =>
        this.isEquivalentUserQueryText(this.extractUserQueryText(element), text),
      ) || null
    )
  }

  getChatContentSelectors(): string[] {
    return [...this.config.selectors.chatContent]
  }

  scrollToOutlineTarget(element: HTMLElement): void {
    this.nativeOutlineRevealRequestId += 1
    super.scrollToOutlineTarget(element)
  }

  extractUserQueryText(element: Element): string {
    if (this.isExportSnapshotElement(element)) {
      return element.textContent?.trim() || ""
    }

    const source = this.findUserContentRoot(element)
    if (!source) {
      if (this.resolveUserMessageElement(element)) {
        return ""
      }
      return this.extractTextWithLineBreaks(element).trim()
    }

    const clone = source.cloneNode(true) as HTMLElement

    clone
      .querySelectorAll(
        `.gh-user-query-markdown, button, [role=button], svg, ${this.config.sitePrivateSelectors.iconButton}, [aria-hidden=true]`,
      )
      .forEach((node) => node.remove())

    return this.extractTextWithLineBreaks(clone).trim()
  }

  extractUserQueryMarkdown(element: Element): string {
    return this.extractUserQueryText(element)
  }

  extractUserQueryExportContent(element: Element): string {
    return this.extractDeepSeekUserQueryExportContent(element)
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    const contentRoot = this.findUserContentRoot(element)
    if (!contentRoot) return false
    if (element.querySelector(".gh-user-query-markdown")) return false

    const rendered = document.createElement("div")
    rendered.className =
      `${contentRoot instanceof HTMLElement ? contentRoot.className : ""} gh-user-query-markdown gh-user-query-markdown-deepseek gh-markdown-preview`.trim()
    rendered.innerHTML = html

    if (contentRoot instanceof HTMLElement) {
      const inlineStyle = contentRoot.getAttribute("style")
      if (inlineStyle) {
        rendered.setAttribute("style", inlineStyle)
      }
    }

    if (contentRoot === element) {
      const rawWrapper = document.createElement("div")
      rawWrapper.className = "gh-user-query-raw"
      while (element.firstChild) {
        rawWrapper.appendChild(element.firstChild)
      }
      rawWrapper.style.display = "none"
      element.appendChild(rawWrapper)
      element.appendChild(rendered)
      return true
    }

    ;(contentRoot as HTMLElement).style.display = "none"
    contentRoot.after(rendered)
    return true
  }

  extractAssistantResponseText(element: Element): string {
    if (this.isExportSnapshotElement(element)) {
      return element.textContent?.trim() || ""
    }

    const includeThoughts = this.shouldIncludeThoughtsInExport()
    const assistantMessage = this.resolveAssistantMessageElement(element)
    const bodyMarkdown = this.resolveAssistantBodyMarkdownElement(element)
    const thoughtBlocks =
      includeThoughts && assistantMessage
        ? this.extractThoughtBlockquotesFromMessage(assistantMessage)
        : []

    const content = bodyMarkdown ? this.extractMarkdownText(bodyMarkdown) : ""
    if (includeThoughts && thoughtBlocks.length > 0) {
      return content ? `${thoughtBlocks.join("\n\n")}\n\n${content}` : thoughtBlocks.join("\n\n")
    }

    return content
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const container =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    if (!container) return []

    // 虚拟滚动兜底：异步拉取历史消息接口，补齐离屏回复的标题
    this.maybeRefreshApiOutline(container)

    const outline: OutlineItem[] = []
    const domUserQueries: OutlineItem[] = []
    const domQueryFullTexts = new Map<OutlineItem, string>()
    const messageSelector = this.config.sitePrivateSelectors.message
    const messages = Array.from(container.querySelectorAll(messageSelector)).filter(
      (message) => !message.parentElement?.closest(messageSelector),
    )

    messages.forEach((message, index) => {
      const markdown = this.getAssistantBodyMarkdown(message)

      if (!markdown) {
        if (!includeUserQueries) return

        // 流式思考阶段正文 markdown 尚未生成，不能把 AI 思考块当成用户提问
        if (!this.resolveUserMessageElement(message)) return

        const text = this.extractUserQueryMarkdown(message)
        if (!text) return

        let wordCount: number | undefined
        if (showWordCount) {
          wordCount =
            this.findNextAssistantMarkdown(messages, index)?.textContent?.trim().length || 0
        }

        const item = this.createUserQueryOutlineItem(text, message as HTMLElement, wordCount)
        domQueryFullTexts.set(item, text)
        domUserQueries.push(item)
        outline.push(item)
        return
      }

      const headings = Array.from(markdown.querySelectorAll(OUTLINE_HEADING_SELECTOR))
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
          element: heading as HTMLElement,
          wordCount,
        })
      })
    })

    // 接口数据可用：提问与标题统一按 message_id 归并（方案 C），原生 TOC 只作定位跳板
    const apiData = this.apiOutlineData
    if (apiData && apiData.sessionId === this.getSessionId()) {
      return this.mergeOutlineByBranchOrder(outline, apiData, container, domQueryFullTexts, {
        maxLevel,
        includeUserQueries,
        showWordCount,
      })
    }

    // 接口不可用（未登录/失败/结构变更）：回退 DOM + 原生 TOC 路径
    if (!includeUserQueries) {
      return outline
    }
    const nativeUserQueries = this.extractNativeUserQueries(domUserQueries)
    if (nativeUserQueries.length <= domUserQueries.length) {
      return outline
    }
    return this.mergeOutlineWithNativeUserQueries(outline, nativeUserQueries)
  }

  async resolveOutlineTarget(
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery" | "id" | "navigationId">,
    queryIndex?: number,
  ): Promise<Element | null> {
    // 接口回填的离屏条目：优先按 message_id 精确定位，而非全局文本匹配
    const ref = item.navigationId || item.id
    const apiHeadingRef = this.parseApiOutlineItemId(ref)
    if (apiHeadingRef) {
      const apiTarget = await this.resolveApiOutlineTarget(apiHeadingRef, item.text)
      if (apiTarget) return apiTarget
    } else {
      const apiQueryMessageId = this.parseApiUserQueryItemId(ref)
      if (apiQueryMessageId !== null) {
        const apiTarget = await this.resolveApiUserQueryTarget(apiQueryMessageId, item.text)
        if (apiTarget) return apiTarget
      }
    }

    const isUserQueryTarget = item.isUserQuery && item.level === 0 && queryIndex !== undefined
    const revealRequestId = isUserQueryTarget
      ? ++this.nativeOutlineRevealRequestId
      : this.nativeOutlineRevealRequestId

    const directTarget = await super.resolveOutlineTarget(item, queryIndex)
    if (directTarget) {
      return directTarget
    }

    if (!isUserQueryTarget) {
      return null
    }

    const jumped = await this.revealUserQueryThroughNativeOutline(
      queryIndex,
      item.text,
      revealRequestId,
    )
    if (!jumped) {
      return null
    }

    return this.waitForUserQueryElement(queryIndex, item.text, revealRequestId)
  }

  // ==================== 大纲缓存（历史消息接口数据源） ====================

  /**
   * DeepSeek 消息列表走 ds-virtual-list 虚拟滚动，离屏回复的标题会从 DOM 卸载。
   * 这里直接请求站点的 history_messages 接口（不带 cache_version 即全量 REPLACE），
   * 从 RESPONSE markdown 解析标题，作为大纲标题的完整数据源。
   */
  private maybeRefreshApiOutline(container: Element): void {
    if (!this.isUserConversationPage()) return

    const sessionId = this.getSessionId()
    if (sessionId !== this.apiOutlineSessionId) {
      // 会话切换时解除解析失败熔断与拉取冷却，新会话应立即补齐大纲
      this.apiOutlineSessionId = sessionId
      this.apiOutlineParseFailures = 0
      this.apiOutlineLastFetchAt = 0
    }

    const scrollable = container instanceof HTMLElement ? container : null
    const atBottom = scrollable
      ? scrollable.scrollTop + scrollable.clientHeight >=
        scrollable.scrollHeight - API_OUTLINE_BOTTOM_TOLERANCE_PX
      : false
    const stale = isApiOutlineStale({
      data: this.apiOutlineData,
      sessionId,
      mountedIds: this.collectMountedVirtualMessageIds(container),
      atBottom,
    })

    // 生成中响应未入库，拉到的回复不完整；等生成结束后下一次 extract 再拉
    if (
      !shouldAttemptApiOutlineFetch({
        now: Date.now(),
        lastFetchAt: this.apiOutlineLastFetchAt,
        backoffMs: API_OUTLINE_FETCH_BACKOFF_MS,
        parseFailures: this.apiOutlineParseFailures,
        inFlight: this.apiOutlineFetchPromise !== null,
        generating: this.isGenerating(),
        stale,
      })
    ) {
      return
    }

    // 没有登录态时静默跳过（退化为纯 DOM 扫描），不进入 Promise 链避免每次 extract 空转
    const token = this.getUserToken()
    if (!token) return

    // 任何一次实际发起的拉取都记入冷却：version 未变的成功重拉也不会连续重试
    this.apiOutlineLastFetchAt = Date.now()
    this.apiOutlineFetchPromise = this.fetchApiOutline(sessionId, token)
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
        console.warn("[DeepSeekAdapter] Failed to fetch history outline:", error)
      })
      .finally(() => {
        this.apiOutlineFetchPromise = null
      })
  }

  private collectMountedVirtualMessageIds(container: Element): Set<number> {
    const ids = new Set<number>()
    container.querySelectorAll("[data-virtual-list-item-key]").forEach((row) => {
      const id = Number(row.getAttribute("data-virtual-list-item-key"))
      if (Number.isFinite(id)) {
        ids.add(id)
      }
    })
    return ids
  }

  private async fetchApiOutline(
    sessionId: string,
    token: string,
  ): Promise<"changed" | "unchanged" | "parse-failed"> {
    const response = await fetch(
      `${window.location.origin}${CHAT_HISTORY_API_PATH}?chat_session_id=${encodeURIComponent(sessionId)}`,
      {
        headers: this.buildHistoryApiHeaders(token),
        credentials: "include",
      },
    )
    if (!response.ok) {
      throw new Error(`history_messages responded ${response.status}`)
    }

    const parsed = parseDeepSeekHistoryOutline(await response.json())
    if (!parsed || parsed.sessionId !== sessionId) return "parse-failed"

    const previous = this.apiOutlineData
    this.apiOutlineData = parsed
    return !previous ||
      previous.sessionId !== parsed.sessionId ||
      previous.version !== parsed.version
      ? "changed"
      : "unchanged"
  }

  /**
   * 方案 C 统一归并：DOM 条目与接口回填条目统一按 message_id -> 分支序号归并，
   * 不使用"第几个挂载提问"这类相对计数。挂载项以 DOM 为准（文本真实、元素在手），
   * 接口只补未挂载的提问与回复标题。
   */
  private mergeOutlineByBranchOrder(
    domItems: OutlineItem[],
    data: DeepSeekHistoryOutlineData,
    container: Element,
    domQueryFullTexts: Map<OutlineItem, string>,
    options: { maxLevel: number; includeUserQueries: boolean; showWordCount: boolean },
  ): OutlineItem[] {
    const { maxLevel, includeUserQueries, showWordCount } = options
    const mountedIds = this.collectMountedVirtualMessageIds(container)

    const domEntries = domItems.map((item) => ({
      messageId: this.getMountedRowMessageId(item.element),
      item,
    }))

    // 收藏签名的 occurrence 需要在完整提问序列上按未截断文本计数
    const queryFullTexts = new Map<OutlineItem, string>(domQueryFullTexts)

    // 发送/生成中的新消息可能还挂在临时行 key 上（或尚未进入虚拟列表），
    // DOM 条目归属不到分支；接口重拉后回填条目与它们并存会重复。
    // 按文本统计这类 DOM 条目，回填时从尾部丢掉同名条目（尾部才是新消息；
    // 同文本的旧提问/旧标题若未挂载，保留其回填不受影响）
    const branchIdSet = new Set(data.branchMessageIds)
    const unmatchedQueryKeys = new Map<string, number>()
    const unmatchedHeadingKeys = new Map<string, number>()
    for (const entry of domEntries) {
      if (entry.messageId !== null && branchIdSet.has(entry.messageId)) continue
      const item = entry.item
      if (item.isUserQuery && item.level === 0) {
        // 与接口文本口径对齐（接口文本已经过 stripMarkdownInline）
        const key = this.normalizeUserQueryMatchText(
          stripMarkdownInline(queryFullTexts.get(item) ?? item.text),
        )
        unmatchedQueryKeys.set(key, (unmatchedQueryKeys.get(key) ?? 0) + 1)
      } else if (!item.isUserQuery) {
        const key = `${item.level}:${item.text}`
        unmatchedHeadingKeys.set(key, (unmatchedHeadingKeys.get(key) ?? 0) + 1)
      }
    }

    const fillQueryEntries: { messageId: number; item: OutlineItem }[] = []
    const fillHeadingEntries: { messageId: number; item: OutlineItem }[] = []

    if (includeUserQueries) {
      for (const query of data.userQueries) {
        if (mountedIds.has(query.messageId)) continue
        let wordCount: number | undefined
        if (showWordCount) {
          // 提问条目的字数口径 = 对应回复的文本长度，未挂载时取接口估算值
          const assistantId = data.assistantIdByQueryIndex.get(query.queryIndex)
          wordCount =
            assistantId !== undefined ? data.replyWordCountByAssistantId.get(assistantId) ?? 0 : 0
        }
        const item = this.createUserQueryOutlineItem(query.text, null, wordCount)
        item.navigationId = `deepseek:api-u:${query.messageId}`
        queryFullTexts.set(item, query.text)
        fillQueryEntries.push({ messageId: query.messageId, item })
      }
    }

    for (const [messageId, headings] of data.headingsByAssistantId) {
      if (mountedIds.has(messageId)) continue
      headings.forEach((heading, orderInMessage) => {
        if (heading.level > maxLevel) return
        const id = `deepseek:api-h:${messageId}:${heading.level}:${orderInMessage}:${hashOutlineText(heading.text)}`
        fillHeadingEntries.push({
          messageId,
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

    const fillEntries = [
      ...this.dropTrailingFillDuplicates(
        fillQueryEntries,
        (item) => this.normalizeUserQueryMatchText(queryFullTexts.get(item) ?? item.text),
        unmatchedQueryKeys,
      ),
      ...this.dropTrailingFillDuplicates(
        fillHeadingEntries,
        (item) => `${item.level}:${item.text}`,
        unmatchedHeadingKeys,
      ),
    ]

    const merged = mergeByBranchMessageOrder(data.branchMessageIds, domEntries, fillEntries)

    if (includeUserQueries) {
      this.assignUserQueryOutlineIds(merged, queryFullTexts)
    }
    return merged
  }

  /** 从回填条目尾部丢弃与「无分支归属的 DOM 条目」同名的重复项（计数式，见上） */
  private dropTrailingFillDuplicates(
    fillEntries: { messageId: number; item: OutlineItem }[],
    keyOf: (item: OutlineItem) => string,
    unmatchedCounts: Map<string, number>,
  ): { messageId: number; item: OutlineItem }[] {
    if (unmatchedCounts.size === 0 || fillEntries.length === 0) return fillEntries

    const kept = [...fillEntries]
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      const key = keyOf(kept[i].item)
      const count = unmatchedCounts.get(key) ?? 0
      if (count === 0) continue
      if (count === 1) unmatchedCounts.delete(key)
      else unmatchedCounts.set(key, count - 1)
      kept.splice(i, 1)
    }
    return kept
  }

  /**
   * 在归并后的完整提问序列上统一计算 occurrence 并生成收藏签名 id。
   * 若只在挂载子集上计数，同一提问在不同滚动位置签名漂移、收藏失效。
   */
  private assignUserQueryOutlineIds(
    items: OutlineItem[],
    queryFullTexts: Map<OutlineItem, string>,
  ): void {
    const occurrenceMap = new Map<string, number>()
    for (const item of items) {
      if (!item.isUserQuery || item.level !== 0) continue
      const fullText = queryFullTexts.get(item) ?? item.text
      const matchKey = this.normalizeUserQueryMatchText(fullText)
      const occurrence = occurrenceMap.get(matchKey) ?? 0
      occurrenceMap.set(matchKey, occurrence + 1)
      item.id = `deepseek-user-query::${occurrence}::${matchKey}`
    }
  }

  private getMountedRowMessageId(element: Element | null): number | null {
    const row = element?.closest("[data-virtual-list-item-key]")
    if (!row) return null
    const id = Number(row.getAttribute("data-virtual-list-item-key"))
    return Number.isFinite(id) ? id : null
  }

  private parseApiOutlineItemId(
    id?: string,
  ): { messageId: number; level: number; orderInMessage: number } | null {
    if (!id) return null
    const match = id.match(/^deepseek:api-h:(\d+):(\d+):(\d+):[0-9a-f]+$/)
    if (!match) return null
    return {
      messageId: Number(match[1]),
      level: Number(match[2]),
      orderInMessage: Number(match[3]),
    }
  }

  private parseApiUserQueryItemId(id?: string): number | null {
    if (!id) return null
    const match = id.match(/^deepseek:api-u:(\d+)$/)
    return match ? Number(match[1]) : null
  }

  private findApiHeadingInRow(
    row: Element,
    ref: { level: number; orderInMessage: number },
    text: string,
  ): Element | null {
    const headings = Array.from(row.querySelectorAll(OUTLINE_HEADING_SELECTOR))
    const direct = headings[ref.orderInMessage]
    if (direct && (direct.textContent || "").trim() === text) return direct

    // setext/引用块/原生 HTML 标题会渲染进 DOM 但不参与 ATX 序号，序号可能
    // 错位：先用「层级+文本」精确命中真正的目标，避免层级巧合跳错标题
    const precise = headings.find(
      (heading) =>
        Number(heading.tagName.charAt(1)) === ref.level &&
        (heading.textContent || "").trim() === text,
    )
    if (precise) return precise

    // reference 角标等渲染差异导致文本无法精确比对时，才采信同层级的序号命中
    if (direct && Number(direct.tagName.charAt(1)) === ref.level) return direct
    return null
  }

  /**
   * 直接滚动探测聊天虚拟列表，把目标 message_id 的行挂载出来。
   * scrollTop 与挂载窗口的 key 区间单调对应，每次用真实挂载行做锚点闭环逼近，
   * 通常 1-3 次收敛；ds-virtual-list 在程序化 scrollTop + 强制 layout 后同步
   * 重挂载（与 scanNativeOutlineEntries 同一手法），成功时全程无需借道原生
   * TOC 点击（省掉站点 React 的同步处理与逐位置 settle 等待）。
   * 失败返回 null，调用方回退 TOC 跳转链路。
   */
  private async probeMountVirtualRow(
    messageId: number,
    container: HTMLElement,
    data: DeepSeekHistoryOutlineData | null,
    requestId: number | null,
    signal?: AbortSignal,
  ): Promise<Element | null> {
    if (container.scrollHeight <= container.clientHeight) return null

    const branchIndex = data ? new Map(data.branchMessageIds.map((id, i) => [id, i])) : null
    const findRow = () => container.querySelector(`[data-virtual-list-item-key="${messageId}"]`)
    // 编辑/删除造成的 id 空洞下，分支序号距离比 id 差值更接近真实行距
    const rowDistance = (key: number): number => {
      const targetIdx = branchIndex?.get(messageId)
      const keyIdx = branchIndex?.get(key)
      return targetIdx !== undefined && keyIdx !== undefined ? targetIdx - keyIdx : messageId - key
    }

    let prevSignature = ""
    for (let attempt = 0; attempt < VIRTUAL_ROW_PROBE_MAX_ATTEMPTS; attempt += 1) {
      const existing = findRow()
      if (existing) return existing
      // requestId 为 null 表示非大纲链路调用（阅读历史恢复），不参与大纲请求失效判断
      if (requestId !== null && requestId !== this.nativeOutlineRevealRequestId) return null
      if (signal?.aborted) return null

      const rows = this.readMountedVirtualRows(container)
      if (rows.length === 0) return null

      const signature = `${rows[0].key}:${rows[rows.length - 1].key}:${Math.round(container.scrollTop)}`
      if (signature === prevSignature) {
        // 窗口无变化：重挂载可能是异步的，给一帧时间
        await this.sleep(VIRTUAL_ROW_PROBE_SETTLE_MS)
      }
      prevSignature = signature

      const first = rows[0]
      const last = rows[rows.length - 1]
      let deltaRows = 0
      if (rowDistance(first.key) < 0) {
        deltaRows = rowDistance(first.key)
      } else if (rowDistance(last.key) > 0) {
        deltaRows = rowDistance(last.key)
      }

      if (deltaRows === 0) {
        // 目标 key 落在窗口 key 区间内却未挂载（id 空洞或挂载滞后）
        await this.sleep(VIRTUAL_ROW_PROBE_SETTLE_MS)
        continue
      }

      const spanRows = Math.max(
        1,
        Math.abs(
          (branchIndex?.get(last.key) ?? last.key) - (branchIndex?.get(first.key) ?? first.key),
        ),
      )
      const spanPx = last.top - first.top
      const pxPerRow =
        spanPx > 0 ? spanPx / spanRows : container.clientHeight / Math.max(1, rows.length)
      if (!(pxPerRow > 0)) return null

      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
      // 至少移动一行，避免小步长在原地打转
      const deltaPx = Math.sign(deltaRows) * Math.max(Math.abs(deltaRows) * pxPerRow, pxPerRow)
      const nextTop = Math.min(maxScroll, Math.max(0, container.scrollTop + deltaPx))
      if (nextTop === container.scrollTop && (nextTop === 0 || nextTop === maxScroll)) {
        // 已到滚动边界仍未挂载：目标行不存在（可能被删除）
        return null
      }

      container.scrollTop = nextTop
      container.dispatchEvent(new Event("scroll", { bubbles: true }))
      // 强制同步 layout，促使虚拟列表本轮完成重挂载
      container.getBoundingClientRect()
    }

    return this.bisectMountVirtualRow(messageId, container, findRow, requestId, signal)
  }

  /**
   * probeMountVirtualRow 的兜底：启发式逼近依赖行高估算，id 空洞或行高不均时
   * 会过冲震荡。挂载窗口的 key 区间随 scrollTop 单调移动，二分不依赖行高，
   * 对长对话 log 级收敛。
   */
  private async bisectMountVirtualRow(
    messageId: number,
    container: HTMLElement,
    findRow: () => Element | null,
    requestId: number | null,
    signal?: AbortSignal,
  ): Promise<Element | null> {
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
    let lo = 0
    let hi = maxScroll
    let mid = Math.min(maxScroll, Math.max(0, container.scrollTop))

    for (let attempt = 0; attempt < 14; attempt += 1) {
      const existing = findRow()
      if (existing) return existing
      if (requestId !== null && requestId !== this.nativeOutlineRevealRequestId) return null
      if (signal?.aborted) return null

      const rows = this.readMountedVirtualRows(container)
      if (rows.length === 0) return null

      const firstKey = rows[0].key
      const lastKey = rows[rows.length - 1].key
      if (messageId < firstKey) {
        hi = mid
      } else if (messageId > lastKey) {
        lo = mid
      } else {
        // 目标 key 落在窗口区间内却未挂载：等几拍排除挂载滞后，仍没有就是 id 空洞
        for (let wait = 0; wait < 3; wait += 1) {
          await this.sleep(VIRTUAL_ROW_PROBE_SETTLE_MS)
          const mounted = findRow()
          if (mounted) return mounted
        }
        return null
      }
      if (hi - lo <= 2) return null

      mid = Math.round((lo + hi) / 2)
      container.scrollTop = mid
      container.dispatchEvent(new Event("scroll", { bubbles: true }))
      container.getBoundingClientRect()
      await this.sleep(VIRTUAL_ROW_PROBE_SETTLE_MS)
    }

    return findRow()
  }

  private readMountedVirtualRows(container: HTMLElement): { key: number; top: number }[] {
    const rows: { key: number; top: number }[] = []
    container.querySelectorAll("[data-virtual-list-item-key]").forEach((row) => {
      const key = Number(row.getAttribute("data-virtual-list-item-key"))
      if (Number.isFinite(key)) {
        rows.push({ key, top: row.getBoundingClientRect().top })
      }
    })
    return rows.sort((a, b) => a.key - b.key)
  }

  private async resolveApiOutlineTarget(
    ref: { messageId: number; level: number; orderInMessage: number },
    text: string,
  ): Promise<Element | null> {
    const container =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    if (!container) return null

    const findMounted = () => {
      const row = container.querySelector(`[data-virtual-list-item-key="${ref.messageId}"]`)
      return row ? this.findApiHeadingInRow(row, ref, text) : null
    }

    const mounted = findMounted()
    if (mounted) return mounted

    const data = this.apiOutlineData
    if (!data || data.sessionId !== this.getSessionId()) return null

    // 快路径：直接滚动探测把目标回复行挂载出来，行内按序号定位标题
    const requestId = ++this.nativeOutlineRevealRequestId
    // 探测/跳转会移动滚动位置；彻底失败时复原，避免把用户甩到无关位置。
    // 请求已被更新的定位接管时不复原
    const entryScrollTop = container.scrollTop
    const fail = (): null => {
      if (requestId === this.nativeOutlineRevealRequestId) {
        container.scrollTop = entryScrollTop
      }
      return null
    }
    const probedRow =
      container instanceof HTMLElement
        ? await this.probeMountVirtualRow(ref.messageId, container, data, requestId)
        : null
    if (probedRow) {
      const heading = this.findApiHeadingInRow(probedRow, ref, text)
      if (heading) return heading
    }

    // 慢路径回退：借原生大纲跳到所属提问附近，让虚拟列表把目标回复挂载出来。
    // 匹配文本优先用接口的提问文本，TOC 只做点击跳板
    const queryIndex = data.queryIndexByAssistantId.get(ref.messageId)
    if (!queryIndex) return fail()
    const queryText =
      data.userQueries.find((query) => query.queryIndex === queryIndex)?.text ||
      this.collectNativeOutlineEntries()[queryIndex - 1]?.text
    if (!queryText) return fail()

    const jumped = await this.revealUserQueryThroughNativeOutline(queryIndex, queryText, requestId)
    if (!jumped) return fail()

    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      const target = findMounted()
      if (target) return target
      await this.sleep(80)
    }
    return fail()
  }

  /** 接口回填的提问条目：行挂载则直接返回，否则借原生 TOC 跳转后轮询挂载 */
  private async resolveApiUserQueryTarget(
    messageId: number,
    text: string,
  ): Promise<Element | null> {
    const container =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    if (!container) return null

    const findMounted = () => {
      const row = container.querySelector(`[data-virtual-list-item-key="${messageId}"]`)
      // data-virtual-list-item-key 行是 .ds-message 的包裹层，需向下找用户消息元素
      const message = row?.querySelector(this.config.selectors.userQuery)
      return message instanceof HTMLElement ? message : null
    }

    const mounted = findMounted()
    if (mounted) return mounted

    const data = this.apiOutlineData
    if (!data || data.sessionId !== this.getSessionId()) return null
    const query = data.userQueries.find((entry) => entry.messageId === messageId)
    if (!query) return null

    const requestId = ++this.nativeOutlineRevealRequestId
    // 同 resolveApiOutlineTarget：彻底失败时复原滚动位置
    const entryScrollTop = container.scrollTop
    const fail = (): null => {
      if (requestId === this.nativeOutlineRevealRequestId) {
        container.scrollTop = entryScrollTop
      }
      return null
    }
    // 快路径：直接滚动探测把目标提问行挂载出来
    const probedRow =
      container instanceof HTMLElement
        ? await this.probeMountVirtualRow(messageId, container, data, requestId)
        : null
    if (probedRow) {
      const message = probedRow.querySelector(this.config.selectors.userQuery)
      if (message instanceof HTMLElement) return message
    }

    const jumped = await this.revealUserQueryThroughNativeOutline(
      query.queryIndex,
      query.text || text,
      requestId,
    )
    if (!jumped) return fail()

    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      const target = findMounted()
      if (target) return target
      await this.sleep(80)
    }
    return fail()
  }

  private createUserQueryOutlineItem(
    text: string,
    element: Element | null,
    wordCount?: number,
  ): OutlineItem {
    const normalizedText = this.normalizeOutlineText(text)
    const isTruncated = normalizedText.length > 80

    return {
      level: 0,
      text: isTruncated ? `${normalizedText.slice(0, 80)}...` : normalizedText,
      element,
      isUserQuery: true,
      isTruncated,
      wordCount,
    }
  }

  getExportConfig(): ExportConfig {
    if (this.exportSnapshotActive) {
      return {
        userQuerySelector: DEEPSEEK_EXPORT_USER_SELECTOR,
        assistantResponseSelector: DEEPSEEK_EXPORT_ASSISTANT_SELECTOR,
        turnSelector: null,
        useShadowDOM: false,
      }
    }

    return { ...this.config.export }
  }

  async prepareConversationExport(context: ExportLifecycleContext): Promise<unknown> {
    this.exportIncludeThoughtsOverride = context.includeThoughts
    this.exportBundleCache = null
    this.clearExportSnapshot()

    const collector =
      context.format === "markdown" && context.packaging === "zip"
        ? createExportAssetCollector()
        : undefined
    const shareMessages = await this.collectShareExportMessageSnapshots(collector)
    if (shareMessages?.length) {
      return this.finishExportWithSnapshots(shareMessages, collector)
    }

    const apiMessages = await this.collectApiExportMessageSnapshots(collector)
    if (apiMessages?.length) {
      return this.finishExportWithSnapshots(apiMessages, collector)
    }

    const scrollContainer =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    if (!(scrollContainer instanceof HTMLElement)) {
      return null
    }

    const messages = await this.collectExportMessageSnapshots(scrollContainer, collector)
    if (messages.length === 0) {
      return null
    }

    return this.finishExportWithSnapshots(messages, collector)
  }

  private finishExportWithSnapshots(
    messages: DeepSeekExportMessageSnapshot[],
    collector?: ExportAssetCollector,
  ): { count: number } {
    if (collector) {
      this.exportBundleCache = {
        messages,
        assets: collector.assets,
      }
    }

    this.mountExportSnapshot(messages)
    return { count: messages.length }
  }

  async extractExportBundle(_context: ExportLifecycleContext): Promise<ExportBundle | null> {
    return this.exportBundleCache
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    _state: unknown,
  ): Promise<void> {
    this.clearExportSnapshot()
    this.exportIncludeThoughtsOverride = null
    this.exportBundleCache = null
  }

  getLatestReplyText(): string | null {
    const prevOverride = this.exportIncludeThoughtsOverride
    this.exportIncludeThoughtsOverride = false

    const scrollContainer =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    try {
      if (scrollContainer instanceof HTMLElement) {
        const originalScrollTop = scrollContainer.scrollTop
        const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)

        try {
          scrollContainer.scrollTop = maxScroll
          scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
          scrollContainer.getBoundingClientRect()

          const latest = this.extractLatestReplyTextFromMessages(
            this.getVisibleAssistantMessages(scrollContainer),
          )
          if (latest) {
            return latest
          }
        } finally {
          scrollContainer.scrollTop = originalScrollTop
          scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
        }
      }

      return this.extractLatestReplyTextFromMessages(this.getVisibleAssistantMessages(document))
    } finally {
      this.exportIncludeThoughtsOverride = prevOverride
    }
  }

  getLastCodeBlockText(): string | null {
    const prevOverride = this.exportIncludeThoughtsOverride
    this.exportIncludeThoughtsOverride = false

    const scrollContainer =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    try {
      if (scrollContainer instanceof HTMLElement) {
        const positions = this.buildBottomUpScanPositions(scrollContainer)
        const originalScrollTop = scrollContainer.scrollTop

        try {
          for (const top of positions) {
            scrollContainer.scrollTop = top
            scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
            scrollContainer.getBoundingClientRect()

            const code = this.extractLastCodeBlockTextFromMessages(
              this.getVisibleAssistantMessages(scrollContainer),
            )
            if (code) {
              return code
            }
          }
        } finally {
          scrollContainer.scrollTop = originalScrollTop
          scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
        }
      }

      return this.extractLastCodeBlockTextFromMessages(this.getVisibleAssistantMessages(document))
    } finally {
      this.exportIncludeThoughtsOverride = prevOverride
    }
  }

  getSubmitButtonSelectors(): string[] {
    return [...this.config.selectors.submitButton]
  }

  findSubmitButton(editor: HTMLElement | null): HTMLElement | null {
    const selector = this.getSubmitButtonSelectors().join(", ")
    if (!selector) return null

    const scopes = [
      editor?.closest("form"),
      editor?.parentElement,
      editor?.closest("div"),
      document.body,
    ].filter(Boolean) as ParentNode[]

    const seen = new Set<HTMLElement>()

    for (const scope of scopes) {
      const buttons = scope.querySelectorAll(selector)
      for (const button of Array.from(buttons)) {
        const element = button as HTMLElement
        if (seen.has(element) || element.offsetParent === null) continue
        seen.add(element)
        return element
      }
    }

    return null
  }

  getNewChatButtonSelectors(): string[] {
    return [...this.config.selectors.newChatButton]
  }

  getWidthSelectors() {
    return this.config.widthSelectors.map((selector) => ({ ...selector }))
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    return {
      scopeSelector: this.config.sitePrivateSelectors.panelAvoidanceScope,
      widthSelectors: this.getWidthSelectors(),
      insetSelectors: [
        { selector: this.config.sitePrivateSelectors.messageListItems },
        { selector: this.config.sitePrivateSelectors.messageComposer },
        {
          selector: this.config.sitePrivateSelectors.newChatLayoutScope,
          scopeSelector: this.config.sitePrivateSelectors.newChatLayoutScope,
          insetMode: "edge",
          extraCss: "box-sizing: border-box !important; min-width: 0 !important;",
        },
        {
          // 文档预览 / Canvas 预览右侧边栏：内容列带内联 width 且为 content-box，
          // 必须强制 border-box，padding 内缩才能真正压缩内容而不是把内容挤出去。
          selector: this.config.sitePrivateSelectors.panelPreviewContent,
          scopeSelector: this.config.sitePrivateSelectors.panelPreviewScope,
          obstacleSelectors: [],
          applySide: "right",
          insetMode: "edge",
          extraCss: "box-sizing: border-box !important; min-width: 0 !important;",
        },
      ],
      defaultWidth: "840px",
      gap: 16,
    }
  }

  getUserQueryWidthSelectors() {
    const userQueryWidthCss = [
      "max-width: 100% !important;",
      "min-width: 0 !important;",
      "box-sizing: border-box !important;",
      "margin-left: auto !important;",
      "margin-right: 0 !important;",
      "overflow-wrap: anywhere !important;",
      "word-break: break-word !important;",
    ].join(" ")

    return [
      {
        // 用户问题内容节点使用随机哈希类名，改为匹配 ds-message 下稳定的直接内容 div。
        selector: this.config.sitePrivateSelectors.userMessageContent,
        property: "width",
        extraCss: userQueryWidthCss,
        noCenter: true,
      },
    ]
  }

  isGenerating(): boolean {
    const buttons = this.findComposerButtons()
    const selector = this.config.generating.existsSelectors.join(", ")
    if (!selector) return false

    for (const button of buttons) {
      if (button.matches(selector)) {
        return true
      }
    }

    return false
  }

  getStopButtonSelectors(): string[] {
    return [...this.config.selectors.stopButton]
  }

  getModelName(): string | null {
    const selectedButtons = Array.from(
      document.querySelectorAll(this.config.sitePrivateSelectors.selectedModel),
    )
      .map(
        (button) => (button as HTMLElement).innerText?.trim() || button.textContent?.trim() || "",
      )
      .filter(Boolean)

    if (selectedButtons.length === 0) {
      return "DeepSeek"
    }

    return `DeepSeek (${selectedButtons.join(", ")})`
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

  async toggleTheme(targetMode: "light" | "dark" | "system"): Promise<boolean> {
    try {
      const resolvedMode: "light" | "dark" =
        targetMode === "system"
          ? typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : targetMode

      const themeData = JSON.stringify({ value: targetMode, __version: "0" })
      localStorage.setItem(THEME_STORAGE_KEY, themeData)

      const body = document.body
      if (body) {
        body.classList.remove("light", "dark")
        body.classList.add("change-theme", resolvedMode)

        if (resolvedMode === "dark") {
          body.setAttribute("data-ds-dark-theme", "dark")
        } else {
          body.removeAttribute("data-ds-dark-theme")
        }

        body.style.colorScheme = resolvedMode

        window.setTimeout(() => {
          if (document.body === body) {
            body.classList.remove("change-theme")
          }
        }, 300)
      }

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_STORAGE_KEY,
          newValue: themeData,
          storageArea: localStorage,
        }),
      )

      return true
    } catch (error) {
      console.error("[DeepSeekAdapter] toggleTheme error:", error)
      return false
    }
  }

  private findComposerButtons(): HTMLElement[] {
    const textarea = this.getTextareaElement()
    const scopes = [
      textarea?.closest("form"),
      textarea?.parentElement,
      textarea?.closest("div"),
      document.body,
    ].filter(Boolean) as HTMLElement[]

    const seen = new Set<HTMLElement>()
    const buttons: HTMLElement[] = []

    for (const scope of scopes) {
      const found = scope.querySelectorAll(this.config.sitePrivateSelectors.composerButton)
      for (const button of Array.from(found)) {
        const el = button as HTMLElement
        if (el.offsetParent === null || seen.has(el)) continue
        seen.add(el)
        buttons.push(el)
      }

      if (buttons.length > 0) {
        return buttons
      }
    }

    return buttons
  }

  private pickBestScrollableAncestor(elements: Element[]): HTMLElement | null {
    const scored = new Map<HTMLElement, number>()

    for (const element of elements) {
      const ancestor = this.findScrollableAncestor(element)
      if (!ancestor) continue
      const current = scored.get(ancestor) || 0
      scored.set(ancestor, current + this.scoreScrollContainer(ancestor))
    }

    let best: HTMLElement | null = null
    let bestScore = -1

    for (const [candidate, score] of scored.entries()) {
      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    }

    return bestScore > 0 ? best : null
  }

  private findScrollableAncestor(element: Element | null): HTMLElement | null {
    let current = element instanceof HTMLElement ? element : element?.parentElement || null

    while (current && current !== document.body) {
      if (this.isPrimaryScrollContainer(current)) {
        return current
      }
      current = current.parentElement
    }

    return null
  }

  private isPrimaryScrollContainer(element: HTMLElement): boolean {
    if (!element.isConnected) return false

    const style = window.getComputedStyle(element)
    if (!(style.overflowY === "auto" || style.overflowY === "scroll")) {
      return false
    }

    if (element.scrollHeight <= element.clientHeight) {
      return false
    }

    if (element.clientHeight < 220) {
      return false
    }

    const rect = element.getBoundingClientRect()
    if (rect.width < 320 || rect.height < 220) {
      return false
    }

    return true
  }

  private scoreScrollContainer(element: HTMLElement): number {
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
    const rect = element.getBoundingClientRect()
    const messageCount = element.querySelectorAll(this.config.sitePrivateSelectors.message).length
    const userCount = element.querySelectorAll(this.config.selectors.userQuery).length
    const assistantCount = element.querySelectorAll(this.config.selectors.assistantResponse).length

    let score = 0

    score += Math.min(messageCount, 80) * 200
    score += Math.min(userCount, 40) * 120
    score += Math.min(assistantCount, 40) * 120

    if (element.scrollTop > 0) {
      score += 800
    }

    if (rect.height >= viewportHeight * 0.35) {
      score += 500
    }

    if (rect.width >= viewportWidth * 0.45) {
      score += 350
    }

    if (
      element.matches(this.config.sitePrivateSelectors.mainRegion) ||
      element.closest(this.config.sitePrivateSelectors.mainRegion)
    ) {
      score += 250
    }

    if (element.querySelector("textarea")) {
      score -= 700
    }

    if (element.querySelector(".gh-table-container")) {
      score -= 250
    }

    return score
  }

  private extractNativeUserQueries(domUserQueries: OutlineItem[]): OutlineItem[] {
    const nativeEntries = this.collectNativeOutlineEntries()
    if (nativeEntries.length === 0) {
      return []
    }

    const outline: OutlineItem[] = []
    const occurrenceMap = new Map<string, number>()
    let domQueryCursor = 0

    nativeEntries.forEach((entry) => {
      const matchIndex = this.findMatchingUserQueryIndex(domUserQueries, entry.text, domQueryCursor)
      const matchedQuery = matchIndex >= 0 ? domUserQueries[matchIndex] : null

      if (matchIndex >= 0) {
        domQueryCursor = matchIndex + 1
      }

      const item = this.createUserQueryOutlineItem(entry.text, matchedQuery?.element || null)
      item.wordCount = matchedQuery?.wordCount

      const occurrenceKey = this.normalizeUserQueryMatchText(entry.text)
      const occurrence = occurrenceMap.get(occurrenceKey) || 0
      occurrenceMap.set(occurrenceKey, occurrence + 1)

      item.id =
        matchedQuery?.id ||
        `deepseek-user-query::${occurrence}::${this.normalizeUserQueryMatchText(entry.text)}`

      outline.push(item)
    })

    return outline
  }

  private mergeOutlineWithNativeUserQueries(
    domOutline: OutlineItem[],
    nativeUserQueries: OutlineItem[],
  ): OutlineItem[] {
    if (!domOutline.some((item) => item.isUserQuery)) {
      return [...nativeUserQueries, ...domOutline]
    }

    type QuerySegment =
      | {
          type: "matched"
          nativeIndex: number
          assistantItems: OutlineItem[]
        }
      | {
          type: "unmatched"
          userItem: OutlineItem
          assistantItems: OutlineItem[]
        }

    const leadingAssistantItems: OutlineItem[] = []
    const segments: QuerySegment[] = []
    let currentSegment: QuerySegment | null = null
    let nativeQueryCursor = 0

    domOutline.forEach((item) => {
      if (!item.isUserQuery) {
        if (currentSegment) {
          currentSegment.assistantItems.push(item)
        } else {
          leadingAssistantItems.push(item)
        }
        return
      }

      const matchIndex = this.findMatchingNativeUserQueryIndex(
        nativeUserQueries,
        item,
        nativeQueryCursor,
      )

      if (matchIndex >= 0) {
        currentSegment = {
          type: "matched",
          nativeIndex: matchIndex,
          assistantItems: [],
        }
        nativeQueryCursor = matchIndex + 1
      } else {
        currentSegment = {
          type: "unmatched",
          userItem: item,
          assistantItems: [],
        }
      }

      segments.push(currentSegment)
    })

    const firstMatchedSegment = segments.find(
      (segment): segment is Extract<QuerySegment, { type: "matched" }> =>
        segment.type === "matched",
    )
    if (!firstMatchedSegment) {
      return [...nativeUserQueries, ...domOutline]
    }

    const merged: OutlineItem[] = []
    let nextNativeQueryIndex = 0

    if (leadingAssistantItems.length > 0) {
      // DeepSeek 虚拟滚动可能会让当前可见 assistant 回复先挂在 DOM 中，
      // 而对应的上一条用户提问暂时被卸载。此时把这些 heading 归到
      // “首个可见用户提问之前的最后一条原生提问”后面，可以避免回答跑到提问上方。
      const leadingTargetIndex = Math.max(firstMatchedSegment.nativeIndex - 1, 0)

      while (
        nextNativeQueryIndex <= leadingTargetIndex &&
        nextNativeQueryIndex < nativeUserQueries.length
      ) {
        merged.push(nativeUserQueries[nextNativeQueryIndex])
        nextNativeQueryIndex += 1
      }

      merged.push(...leadingAssistantItems)
    }

    segments.forEach((segment) => {
      if (segment.type === "matched") {
        while (
          nextNativeQueryIndex <= segment.nativeIndex &&
          nextNativeQueryIndex < nativeUserQueries.length
        ) {
          merged.push(nativeUserQueries[nextNativeQueryIndex])
          nextNativeQueryIndex += 1
        }

        merged.push(...segment.assistantItems)
        return
      }

      merged.push(segment.userItem, ...segment.assistantItems)
    })

    while (nextNativeQueryIndex < nativeUserQueries.length) {
      merged.push(nativeUserQueries[nextNativeQueryIndex])
      nextNativeQueryIndex += 1
    }

    return merged
  }

  private collectNativeOutlineEntries(): DeepSeekNativeOutlineEntry[] {
    const sessionId = this.getSessionId()
    const list = this.findNativeOutlineList()

    if (!list) {
      return this.nativeOutlineCache?.sessionId === sessionId
        ? this.nativeOutlineCache.items.map((item) => ({ ...item }))
        : []
    }

    const scrollContainer = this.findNativeOutlineScrollContainer(list)
    const snapshot = this.getNativeOutlineSnapshot(sessionId, list, scrollContainer)

    if (
      this.nativeOutlineCache &&
      this.nativeOutlineCache.sessionId === sessionId &&
      this.nativeOutlineCache.snapshot === snapshot
    ) {
      return this.nativeOutlineCache.items.map((item) => ({ ...item }))
    }

    const scanned = this.scanNativeOutlineEntries(list, scrollContainer)
    if (scanned.length > 0) {
      this.nativeOutlineCache = {
        sessionId,
        snapshot,
        items: scanned.map((item) => ({ ...item })),
      }
    }

    return scanned
  }

  private findNativeOutlineList(): HTMLElement | null {
    const candidates = Array.from(
      document.querySelectorAll(this.config.sitePrivateSelectors.nativeOutlineList),
    ).filter(
      (candidate) =>
        candidate instanceof HTMLElement &&
        candidate.querySelector(this.config.sitePrivateSelectors.nativeOutlineContentRoots) &&
        !candidate.querySelector(this.config.conversation.itemSelector) &&
        !candidate.closest(this.config.sitePrivateSelectors.nativeOutlineExcludedAncestor),
    ) as HTMLElement[]

    let best: HTMLElement | null = null
    let bestScore = -1

    candidates.forEach((candidate) => {
      const rect = candidate.getBoundingClientRect()
      let score = 0

      if (candidate.closest(this.config.sitePrivateSelectors.nativeOutlinePaddingScope)) {
        score += 2500
      }

      if (candidate.closest(this.config.sitePrivateSelectors.mainRegion)) {
        score += 600
      }

      if (candidate.querySelector(this.config.sitePrivateSelectors.nativeOutlineVisibleItems)) {
        score += 400
      }

      if (rect.width >= 140 && rect.width <= 420) {
        score += 350
      }

      if (rect.height >= 120) {
        score += 250
      }

      if (candidate.scrollHeight > candidate.clientHeight + 20) {
        score += 300
      }

      if (candidate.querySelector(this.config.sitePrivateSelectors.message)) {
        score -= 1500
      }

      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    })

    return bestScore > 0 ? best : null
  }

  private findNativeOutlineScrollContainer(list: HTMLElement): HTMLElement | null {
    const candidates = [
      list,
      list.closest(this.config.sitePrivateSelectors.sidebarScrollArea),
      list.parentElement,
      list
        .closest(this.config.sitePrivateSelectors.nativeOutlinePaddingScope)
        ?.querySelector(this.config.sitePrivateSelectors.sidebarScrollArea),
    ].filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)

    let best: HTMLElement | null = null
    let bestScore = -1

    candidates.forEach((candidate) => {
      const style = window.getComputedStyle(candidate)
      const canScroll =
        candidate.scrollHeight > candidate.clientHeight + 8 ||
        style.overflowY === "auto" ||
        style.overflowY === "scroll" ||
        candidate.matches(this.config.sitePrivateSelectors.nativeOutlineList) ||
        candidate.matches(this.config.sitePrivateSelectors.sidebarScrollArea)

      if (!canScroll || candidate.clientHeight <= 0) {
        return
      }

      let score = 0
      if (candidate === list) score += 500
      if (candidate.matches(this.config.sitePrivateSelectors.nativeOutlineList)) score += 350
      if (candidate.matches(this.config.sitePrivateSelectors.sidebarScrollArea)) score += 250
      score += Math.min(candidate.scrollHeight - candidate.clientHeight, 2000)

      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    })

    return bestScore > 0 ? best : null
  }

  private getNativeOutlineSnapshot(
    sessionId: string,
    list: HTMLElement,
    scrollContainer: HTMLElement | null,
  ): string {
    const itemsRoot = list.querySelector(
      this.config.sitePrivateSelectors.nativeOutlineItems,
    ) as HTMLElement | null
    const visibleRoot = list.querySelector(
      this.config.sitePrivateSelectors.nativeOutlineVisibleItems,
    )
    const scrollHost = scrollContainer || list

    return [
      sessionId,
      scrollHost.scrollHeight,
      scrollHost.clientHeight,
      itemsRoot?.scrollHeight || 0,
      visibleRoot?.childElementCount || 0,
    ].join("::")
  }

  private scanNativeOutlineEntries(
    list: HTMLElement,
    scrollContainer: HTMLElement | null,
  ): DeepSeekNativeOutlineEntry[] {
    const visibleOnly = this.readVisibleNativeOutlineEntries(list)
    if (!scrollContainer) {
      return visibleOnly
    }

    const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    if (maxScroll <= 0) {
      return visibleOnly
    }

    const originalScrollTop = scrollContainer.scrollTop
    const step = Math.max(48, Math.floor(scrollContainer.clientHeight * 0.6))
    const positions = new Set<number>([0, maxScroll, originalScrollTop])

    for (let top = 0; top < maxScroll; top += step) {
      positions.add(top)
    }

    let collected: DeepSeekNativeOutlineEntry[] = []

    try {
      Array.from(positions)
        .sort((a, b) => a - b)
        .forEach((top) => {
          scrollContainer.scrollTop = top
          scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))

          // 强制浏览器同步 layout，确保虚拟列表完成本轮渲染。
          scrollContainer.getBoundingClientRect()
          list.getBoundingClientRect()

          const batch = this.readVisibleNativeOutlineEntries(list)
          collected = this.mergeNativeOutlineEntryBatch(collected, batch, top)
        })
    } finally {
      scrollContainer.scrollTop = originalScrollTop
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
    }

    return collected
  }

  private readVisibleNativeOutlineEntries(list: HTMLElement): DeepSeekNativeOutlineEntry[] {
    const visibleRoot =
      (list.querySelector(
        this.config.sitePrivateSelectors.nativeOutlineVisibleItems,
      ) as HTMLElement | null) ||
      (list.querySelector(
        this.config.sitePrivateSelectors.nativeOutlineItems,
      ) as HTMLElement | null)
    if (!visibleRoot) {
      return []
    }

    const entries: DeepSeekNativeOutlineEntry[] = []

    Array.from(visibleRoot.children).forEach((child, index) => {
      if (!(child instanceof HTMLElement)) return

      const text = this.extractNativeOutlineText(child)
      if (!text) return

      entries.push({ text, batchIndex: index })
    })

    return entries
  }

  private extractNativeOutlineText(item: HTMLElement): string {
    const directChildren = Array.from(item.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    )

    for (const child of directChildren) {
      const text = this.normalizeOutlineText(child.innerText || child.textContent || "")
      if (text) {
        return text
      }
    }

    return this.normalizeOutlineText(item.innerText || item.textContent || "")
  }

  private mergeNativeOutlineEntryBatch(
    collected: DeepSeekNativeOutlineEntry[],
    batch: DeepSeekNativeOutlineEntry[],
    scrollTop: number,
  ): DeepSeekNativeOutlineEntry[] {
    if (batch.length === 0) {
      return collected
    }

    if (collected.length === 0) {
      return batch.map((item) => ({
        ...item,
        scrollTop: item.scrollTop ?? scrollTop,
      }))
    }

    const maxOverlap = Math.min(collected.length, batch.length)
    for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
      const collectedTail = collected.slice(-overlap)
      const batchHead = batch.slice(0, overlap)
      if (this.nativeOutlineEntrySequenceEquals(collectedTail, batchHead)) {
        return [
          ...collected,
          ...batch.slice(overlap).map((item) => ({
            ...item,
            scrollTop: item.scrollTop ?? scrollTop,
          })),
        ]
      }
    }

    return [
      ...collected,
      ...batch.map((item) => ({
        ...item,
        scrollTop: item.scrollTop ?? scrollTop,
      })),
    ]
  }

  private nativeOutlineEntrySequenceEquals(
    left: DeepSeekNativeOutlineEntry[],
    right: DeepSeekNativeOutlineEntry[],
  ): boolean {
    if (left.length !== right.length) {
      return false
    }

    return left.every((item, index) => this.nativeOutlineEntryEquals(item, right[index]))
  }

  private nativeOutlineEntryEquals(
    left: DeepSeekNativeOutlineEntry,
    right: DeepSeekNativeOutlineEntry,
  ): boolean {
    return (
      this.normalizeUserQueryMatchText(left.text) === this.normalizeUserQueryMatchText(right.text)
    )
  }

  private findMatchingUserQueryIndex(
    queries: OutlineItem[],
    text: string,
    startIndex: number,
  ): number {
    for (let i = startIndex; i < queries.length; i += 1) {
      if (this.isEquivalentUserQueryText(queries[i].text, text)) {
        return i
      }
    }

    return -1
  }

  private findMatchingNativeUserQueryIndex(
    nativeQueries: OutlineItem[],
    query: OutlineItem,
    startIndex: number,
  ): number {
    for (let i = startIndex; i < nativeQueries.length; i += 1) {
      if (this.isEquivalentUserQueryText(nativeQueries[i].text, query.text)) {
        return i
      }
    }

    return -1
  }

  private isEquivalentUserQueryText(left: string, right: string): boolean {
    const normalizedLeft = this.normalizeUserQueryMatchText(left)
    const normalizedRight = this.normalizeUserQueryMatchText(right)

    if (!normalizedLeft || !normalizedRight) {
      return false
    }

    return (
      normalizedLeft === normalizedRight ||
      normalizedLeft.startsWith(normalizedRight) ||
      normalizedRight.startsWith(normalizedLeft)
    )
  }

  private normalizeUserQueryMatchText(text: string): string {
    return this.normalizeOutlineText(text).replace(/(?:\.{3}|…)$/u, "")
  }

  private normalizeOutlineText(text: string): string {
    return text.replace(/\s+/g, " ").trim()
  }

  private async revealUserQueryThroughNativeOutline(
    queryIndex: number,
    text: string,
    requestId: number,
  ): Promise<boolean> {
    const list = this.findNativeOutlineList()
    if (!list) {
      return false
    }

    const scrollContainer = this.findNativeOutlineScrollContainer(list)
    if (!scrollContainer) {
      return false
    }

    const entries = this.collectNativeOutlineEntries()
    if (entries.length === 0) {
      return false
    }

    const targetEntry = this.resolveNativeOutlineEntry(entries, queryIndex, text)
    if (!targetEntry) {
      return false
    }

    const candidateScrollTops = this.buildNativeOutlineJumpPositions(
      entries,
      targetEntry,
      queryIndex,
      scrollContainer,
      text,
    )

    for (const top of candidateScrollTops) {
      if (requestId !== this.nativeOutlineRevealRequestId) {
        return false
      }

      scrollContainer.scrollTop = top
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
      await this.sleep(NATIVE_OUTLINE_SETTLE_MS)

      if (requestId !== this.nativeOutlineRevealRequestId) {
        return false
      }

      const targetItem = this.findVisibleNativeOutlineItem(list, targetEntry, text)
      if (!targetItem) {
        continue
      }

      this.dispatchNativeOutlineClick(targetItem)
      return true
    }

    return false
  }

  private resolveNativeOutlineEntry(
    entries: DeepSeekNativeOutlineEntry[],
    queryIndex: number,
    text: string,
  ): DeepSeekNativeOutlineEntry | null {
    if (queryIndex > 0 && queryIndex <= entries.length) {
      return entries[queryIndex - 1]
    }

    return entries.find((entry) => this.isEquivalentUserQueryText(entry.text, text)) || null
  }

  private buildNativeOutlineJumpPositions(
    entries: DeepSeekNativeOutlineEntry[],
    targetEntry: DeepSeekNativeOutlineEntry,
    queryIndex: number,
    scrollContainer: HTMLElement,
    text: string,
  ): number[] {
    const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    const estimatedTop =
      entries.length > 1
        ? Math.round((maxScroll * Math.max(queryIndex - 1, 0)) / Math.max(entries.length - 1, 1))
        : 0

    const matchTops = entries
      .filter((entry) => this.isEquivalentUserQueryText(entry.text, text))
      .map((entry) => entry.scrollTop)
      .filter((top): top is number => typeof top === "number")

    const positions = [
      targetEntry.scrollTop,
      estimatedTop,
      estimatedTop - scrollContainer.clientHeight * 0.5,
      estimatedTop + scrollContainer.clientHeight * 0.5,
      ...matchTops,
      0,
      maxScroll,
    ]

    const seen = new Set<number>()

    return positions
      .map((top) => Math.max(0, Math.min(maxScroll, Math.round(top || 0))))
      .filter((top) => {
        if (seen.has(top)) {
          return false
        }
        seen.add(top)
        return true
      })
  }

  private findVisibleNativeOutlineItem(
    list: HTMLElement,
    targetEntry: DeepSeekNativeOutlineEntry,
    text: string,
  ): HTMLElement | null {
    const visibleRoot =
      (list.querySelector(
        this.config.sitePrivateSelectors.nativeOutlineVisibleItems,
      ) as HTMLElement | null) ||
      (list.querySelector(
        this.config.sitePrivateSelectors.nativeOutlineItems,
      ) as HTMLElement | null)
    if (!visibleRoot) {
      return null
    }

    const children = Array.from(visibleRoot.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    )

    if (
      typeof targetEntry.batchIndex === "number" &&
      targetEntry.batchIndex >= 0 &&
      targetEntry.batchIndex < children.length
    ) {
      const indexedChild = children[targetEntry.batchIndex]
      if (this.isEquivalentUserQueryText(this.extractNativeOutlineText(indexedChild), text)) {
        return indexedChild
      }
    }

    return (
      children.find((child) =>
        this.isEquivalentUserQueryText(this.extractNativeOutlineText(child), text),
      ) || null
    )
  }

  private dispatchNativeOutlineClick(element: HTMLElement): void {
    const target =
      (element.querySelector('button, [role="button"], a') as HTMLElement | null) || element

    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }))
    target.click()
  }

  private async waitForUserQueryElement(
    queryIndex: number,
    text: string,
    requestId: number,
  ): Promise<Element | null> {
    const startedAt = Date.now()

    while (Date.now() - startedAt < USER_QUERY_REVEAL_TIMEOUT_MS) {
      if (requestId !== this.nativeOutlineRevealRequestId) {
        return null
      }

      const found = this.findUserQueryElement(queryIndex, text)
      if (found) {
        return found
      }

      await this.sleep(USER_QUERY_REVEAL_INTERVAL_MS)
    }

    if (requestId !== this.nativeOutlineRevealRequestId) {
      return null
    }

    return this.findUserQueryElement(queryIndex, text)
  }

  private getVisibleUserQueryElements(): Element[] {
    const messageSelector = this.config.sitePrivateSelectors.message
    return Array.from(document.querySelectorAll(this.config.selectors.userQuery)).filter(
      (element) =>
        element instanceof HTMLElement && !element.parentElement?.closest(messageSelector),
    )
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  private isExportSnapshotElement(element: Element): boolean {
    return element.hasAttribute(DEEPSEEK_EXPORT_ROLE_ATTR)
  }

  private async collectShareExportMessageSnapshots(
    collector?: ExportAssetCollector,
  ): Promise<DeepSeekExportMessageSnapshot[] | null> {
    if (!this.isSharePage()) {
      return null
    }

    const shareId = this.getSessionId()
    if (!shareId) {
      return null
    }

    try {
      const response = await fetch(
        `/api/v0/share/content?share_id=${encodeURIComponent(shareId)}`,
        {
          credentials: "include",
        },
      )
      if (!response.ok) {
        return null
      }

      const payload = await response.json()
      const messages = this.extractShareExportMessagesFromPayload(payload, collector)
      return messages.length > 0 ? messages : null
    } catch (error) {
      console.warn("[DeepSeekAdapter] Failed to collect share export payload:", error)
      return null
    }
  }

  /**
   * 常规会话优先走 history_messages 接口拿全量 markdown（公式/代码零损耗、
   * 无需滚动收集）；接口不可用或无法证明历史完整时返回 null，回退滚动收集。
   */
  private async collectApiExportMessageSnapshots(
    collector?: ExportAssetCollector,
  ): Promise<DeepSeekExportMessageSnapshot[] | null> {
    const sessionId = this.getSessionId()
    const token = this.getUserToken()
    if (!sessionId || !token) return null

    try {
      const response = await fetch(
        `${window.location.origin}${CHAT_HISTORY_API_PATH}?chat_session_id=${encodeURIComponent(sessionId)}`,
        {
          headers: this.buildHistoryApiHeaders(token),
          credentials: "include",
        },
      )
      if (!response.ok) return null

      const parsed = parseDeepSeekHistoryExport(await response.json())
      if (!parsed || parsed.sessionId !== sessionId) return null

      const includeThoughts = this.shouldIncludeThoughtsInExport()
      const messages: DeepSeekExportMessageSnapshot[] = []

      for (const message of parsed.messages) {
        if (message.role === "user") {
          const attachments = message.fileFragments.flatMap((fragment) =>
            this.extractShareUserAttachments(fragment),
          )
          const content = this.normalizeExportMessageContent(
            this.formatUserQueryExportContent(message.requestText, attachments, collector),
          )
          if (content) {
            messages.push({ role: DEEPSEEK_EXPORT_ROLE_USER, content })
          }
          continue
        }

        const thinking = message.thinkingMarkdown.trim()
        const thoughtBlocks =
          includeThoughts && thinking ? [this.formatAsThoughtBlockquote(thinking)] : []
        const content = this.normalizeExportMessageContent(
          [...thoughtBlocks, message.responseMarkdown.trim()].filter(Boolean).join("\n\n"),
        )
        if (content) {
          messages.push({ role: DEEPSEEK_EXPORT_ROLE_ASSISTANT, content })
        }
      }

      return messages.length > 0 ? messages : null
    } catch (error) {
      console.warn("[DeepSeekAdapter] Failed to collect api export payload:", error)
      return null
    }
  }

  private extractShareExportMessagesFromPayload(
    payload: unknown,
    collector?: ExportAssetCollector,
  ): DeepSeekExportMessageSnapshot[] {
    const bizData = this.getNestedRecord(payload, ["data", "biz_data"])
    const rawMessages = bizData?.messages
    if (!Array.isArray(rawMessages)) {
      return []
    }

    const messages: DeepSeekExportMessageSnapshot[] = []

    rawMessages.forEach((rawMessage) => {
      const message = this.toRecord(rawMessage)
      if (!message) return

      const role = typeof message.role === "string" ? message.role.toUpperCase() : ""
      const fragments = Array.isArray(message.fragments) ? message.fragments : []
      if (role === "USER") {
        const attachments: DeepSeekUserAttachment[] = []
        const requestParts: string[] = []

        fragments.forEach((rawFragment) => {
          const fragment = this.toRecord(rawFragment)
          if (!fragment) return

          const type = typeof fragment.type === "string" ? fragment.type.toUpperCase() : ""
          if (type === "FILE") {
            attachments.push(...this.extractShareUserAttachments(fragment))
            return
          }

          if (type === "REQUEST" && typeof fragment.content === "string") {
            requestParts.push(fragment.content)
          }
        })

        const content = this.normalizeExportMessageContent(
          this.formatUserQueryExportContent(requestParts.join("\n\n"), attachments, collector),
        )
        if (content) {
          messages.push({ role: DEEPSEEK_EXPORT_ROLE_USER, content })
        }
        return
      }

      if (role === "ASSISTANT") {
        const responseParts: string[] = []
        const thoughtParts: string[] = []

        fragments.forEach((rawFragment) => {
          const fragment = this.toRecord(rawFragment)
          if (!fragment || typeof fragment.content !== "string") return

          const type = typeof fragment.type === "string" ? fragment.type.toUpperCase() : ""
          if (type === "THINK") {
            thoughtParts.push(fragment.content)
          } else if (type === "RESPONSE") {
            responseParts.push(fragment.content)
          }
        })

        const cleanThought = thoughtParts
          .map((content) => content.trim())
          .filter(Boolean)
          .join("\n\n")

        const thoughtBlocks =
          this.shouldIncludeThoughtsInExport() && cleanThought
            ? [this.formatAsThoughtBlockquote(cleanThought)]
            : []
        const content = this.normalizeExportMessageContent(
          [...thoughtBlocks, ...responseParts.map((content) => content.trim()).filter(Boolean)]
            .filter(Boolean)
            .join("\n\n"),
        )
        if (content) {
          messages.push({ role: DEEPSEEK_EXPORT_ROLE_ASSISTANT, content })
        }
      }
    })

    return messages
  }

  private extractShareUserAttachments(fragment: Record<string, unknown>): DeepSeekUserAttachment[] {
    const files = Array.isArray(fragment.files) ? fragment.files : []

    return files.flatMap((rawFile) => {
      const file = this.toRecord(rawFile)
      if (!file) return []

      const name = typeof file.file_name === "string" ? file.file_name.trim() : ""
      if (!name) return []

      const signedPath = typeof file.signed_path === "string" ? file.signed_path.trim() : ""
      const size = typeof file.file_size === "number" ? this.formatFileSize(file.file_size) : ""
      const isImage = file.is_image === true

      return [
        {
          kind: isImage ? "image" : "file",
          name,
          type: this.extractFileTypeFromName(name),
          size,
          // 非图片附件不产出下载地址，导出只保留文件名标签
          source: isImage && signedPath ? this.resolveSignedImageUrl(signedPath) : "",
        },
      ]
    })
  }

  /**
   * signed_path 形如 /file?file_id=...&state=...，是相对地址且缺 ty 参数；
   * 真实文件托管在 files.deepseeksvc.com/api/file，ty 必传（实测仅支持
   * p/t/r，图片用 p=大图，t=缩略图）。签名 state 原样透传。
   * 形态不符时回退按原地址解析。
   */
  private resolveSignedImageUrl(signedPath: string): string {
    try {
      const url = new URL(signedPath, window.location.origin)
      const fileId = url.searchParams.get("file_id")
      const state = url.searchParams.get("state")
      if (url.pathname !== "/file" || !fileId || !state) {
        return normalizeExportAssetUrl(signedPath)
      }
      const params = new URLSearchParams({ file_id: fileId, state, ty: "p" })
      return `https://files.deepseeksvc.com/api/file?${params.toString()}`
    } catch {
      return normalizeExportAssetUrl(signedPath)
    }
  }

  private getNestedRecord(source: unknown, path: string[]): Record<string, unknown> | null {
    let current = this.toRecord(source)
    for (const key of path) {
      if (!current) return null
      current = this.toRecord(current[key])
    }
    return current
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null
  }

  private extractDeepSeekUserQueryExportContent(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    if (this.isExportSnapshotElement(element)) {
      return element.textContent?.trim() || ""
    }

    const attachments = this.extractDomUserAttachments(element)
    const body = this.extractUserQueryText(element)
    return this.formatUserQueryExportContent(body, attachments, collector)
  }

  private resolveUserMessageElement(element: Element): HTMLElement | null {
    if (element.matches(this.config.selectors.userQuery)) {
      return element as HTMLElement
    }

    const message = element.closest(this.config.selectors.userQuery)
    return message instanceof HTMLElement ? message : null
  }

  private extractDomUserAttachments(element: Element): DeepSeekUserAttachment[] {
    const message = this.resolveUserMessageElement(element)
    if (!message) {
      return []
    }

    const attachments: DeepSeekUserAttachment[] = []
    const seen = new Set<string>()

    this.extractDomUserImageAttachments(message).forEach((attachment) => {
      const key = `image:${attachment.source || attachment.name}`
      if (seen.has(key)) return
      seen.add(key)
      attachments.push(attachment)
    })

    this.extractDomUserFileAttachments(message).forEach((attachment) => {
      const key = `file:${attachment.source || attachment.name}:${attachment.type}:${attachment.size}`
      if (seen.has(key)) return
      seen.add(key)
      attachments.push(attachment)
    })

    return attachments
  }

  private extractDomUserImageAttachments(message: Element): DeepSeekUserAttachment[] {
    const images = Array.from(message.querySelectorAll("img")).filter(
      (node): node is HTMLImageElement =>
        node instanceof HTMLImageElement && !node.closest(".gh-user-query-markdown"),
    )

    return images.flatMap((image) => {
      const source = this.getDeepSeekImageExportSource(image)
      if (!source) return []

      const name = this.extractImageAttachmentName(image, source)
      return [
        {
          kind: "image",
          name,
          type: this.extractFileTypeFromName(name) || "image",
          size: "",
          source,
        },
      ]
    })
  }

  private extractDomUserFileAttachments(message: Element): DeepSeekUserAttachment[] {
    const cards = Array.from(message.querySelectorAll("div")).filter((node) =>
      this.isLikelyUserFileAttachmentCard(node, message),
    )

    return cards.flatMap((card) => {
      const name = this.extractAttachmentCardName(card)
      if (!name) return []

      const source = this.extractAttachmentCardSource(card)
      const type = this.extractAttachmentCardType(card, name) || this.extractFileTypeFromName(name)
      const kind = this.isImageAttachmentName(name, type) ? "image" : "file"

      return [
        {
          kind,
          name,
          type,
          size: this.extractAttachmentCardSize(card),
          source,
        },
      ]
    })
  }

  private formatUserQueryExportContent(
    body: string,
    attachments: DeepSeekUserAttachment[],
    collector?: ExportAssetCollector,
  ): string {
    const cleanBody = this.stripUserAttachmentBodyText(body, attachments)
    if (attachments.length === 0) {
      return cleanBody
    }

    const imageMarkdown = this.formatUserImageAttachments(attachments, collector)
    const fileMarkdown = this.formatUserFileAttachments(attachments, collector)
    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, cleanBody].filter(Boolean).join("\n\n")
  }

  private formatUserImageAttachments(
    attachments: DeepSeekUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportImageAttachments(attachments, collector, { siteId: this.getSiteId() })
  }

  private formatUserFileAttachments(
    attachments: DeepSeekUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportFileAttachments(attachments, collector, {
      siteId: this.getSiteId(),
      includeAttachment: (attachment) => attachment.kind !== "image" || !attachment.source,
      getLabel: (attachment) => this.formatAttachmentLabel(attachment),
    })
  }

  private formatAttachmentLabel(attachment: DeepSeekUserAttachment): string {
    const details = this.formatAttachmentDetails(attachment)
    return details ? `${attachment.name} (${details})` : attachment.name
  }

  private formatAttachmentDetails(attachment: DeepSeekUserAttachment): string {
    return [
      attachment.type && !this.fileNameEndsWithExtension(attachment.name, attachment.type)
        ? attachment.type
        : "",
      attachment.size,
    ]
      .filter(Boolean)
      .join(", ")
  }

  private getDeepSeekImageExportSource(image: HTMLImageElement): string {
    const candidates = [image.currentSrc || "", image.src || "", image.getAttribute("src") || ""]

    for (const candidate of candidates) {
      const source = normalizeExportAssetUrl(candidate)
      if (!source) continue
      if (source.startsWith("data:image/svg+xml")) continue
      if (isDownloadableExportAssetUrl(source)) return source
    }

    return ""
  }

  private extractImageAttachmentName(image: HTMLImageElement, source: string): string {
    const candidates = [
      image.alt || "",
      image.getAttribute("title") || "",
      image.getAttribute("aria-label") || "",
      this.extractFilenameFromUrl(source),
      "uploaded image",
    ]

    return candidates.map((value) => this.normalizeAttachmentText(value)).find(Boolean) || "image"
  }

  private isLikelyUserFileAttachmentCard(card: Element, message: Element): boolean {
    if (card === message) return false
    if (card.closest(".gh-user-query-markdown")) return false
    if (!this.isWithinUserAttachmentContainer(card, message)) return false
    if (!card.querySelector("svg") || card.querySelector("img")) return false

    const name = this.extractAttachmentCardName(card)
    if (!name) return false

    const text = this.normalizeAttachmentText(card.textContent || "")
    return text !== name
  }

  private isWithinUserAttachmentContainer(card: Element, message: Element): boolean {
    let current: Element | null = card
    while (current && current !== message) {
      if (current.parentElement === message) {
        return this.isLikelyUserAttachmentContainer(current)
      }
      current = current.parentElement
    }
    return false
  }

  private isLikelyUserAttachmentContainer(element: Element): boolean {
    if (element.matches(".gh-inline-bookmark, .gh-user-query-raw, .gh-user-query-markdown")) {
      return false
    }
    if (
      element.matches(
        `button, [role=button], ${this.config.sitePrivateSelectors.iconButton}, ${this.config.sitePrivateSelectors.focusRing}`,
      )
    ) {
      return false
    }
    if (element.querySelector("img")) return true

    const text = this.normalizeAttachmentText(element.textContent || "")
    if (!text) return false
    if (!element.querySelector("svg")) return false
    return this.extractAttachmentCardName(element) !== ""
  }

  private stripUserAttachmentBodyText(body: string, attachments: DeepSeekUserAttachment[]): string {
    if (!body || attachments.length === 0) return body

    return body
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((line) => !this.isUserAttachmentBodyLine(line, attachments))
      .join("\n")
      .trim()
  }

  private isUserAttachmentBodyLine(line: string, attachments: DeepSeekUserAttachment[]): boolean {
    const normalizedLine = this.normalizeAttachmentComparisonText(line)
    if (!normalizedLine) return false

    return attachments.some((attachment) => {
      const name = this.normalizeAttachmentComparisonText(attachment.name)
      if (!name || !normalizedLine.includes(name)) return false

      const size = this.normalizeAttachmentComparisonText(attachment.size)
      if (size && normalizedLine.includes(size)) return true

      const type =
        attachment.type && !this.fileNameEndsWithExtension(attachment.name, attachment.type)
          ? this.normalizeAttachmentComparisonText(attachment.type)
          : ""
      if (type && normalizedLine.includes(type)) return true

      return normalizedLine === name
    })
  }

  private extractAttachmentCardName(card: Element): string {
    const textNodes = Array.from(card.querySelectorAll("div, span, p")).filter(
      (node) => !node.querySelector("svg, img"),
    )
    const leafCandidates = textNodes
      .filter((node) => node.children.length === 0)
      .map((node) => this.normalizeAttachmentText(node.textContent || ""))
      .filter(Boolean)
    const candidates = textNodes
      .map((node) => this.normalizeAttachmentText(node.textContent || ""))
      .filter(Boolean)

    const filename = [...leafCandidates, ...candidates].find((value) =>
      this.looksLikeFilename(value),
    )
    if (filename) {
      return filename
    }

    const ariaLabel = this.normalizeAttachmentText(card.getAttribute("aria-label") || "")
    if (this.looksLikeFilename(ariaLabel)) {
      return ariaLabel
    }

    const title = this.normalizeAttachmentText(card.getAttribute("title") || "")
    if (this.looksLikeFilename(title)) {
      return title
    }

    return ""
  }

  private extractAttachmentCardType(card: Element, name = ""): string {
    const normalizedName = this.normalizeAttachmentText(name).toLowerCase()
    const textParts = Array.from(card.querySelectorAll("div, span, p"))
      .map((node) => this.normalizeAttachmentText(node.textContent || ""))
      .filter(Boolean)

    const info = textParts.find(
      (value) =>
        (!normalizedName || !value.toLowerCase().includes(normalizedName)) &&
        !this.looksLikeFilename(value) &&
        /^[A-Za-z0-9.+-]{1,12}(?:\s+\d+(?:\.\d+)?\s*[KMGT]?B)?$/i.test(value),
    )
    return info?.match(/^[A-Za-z0-9.+-]{1,12}/)?.[0]?.toUpperCase() || ""
  }

  private extractAttachmentCardSize(card: Element): string {
    const text = this.normalizeAttachmentText(card.textContent || "")
    return text.match(/\b\d+(?:\.\d+)?\s*[KMGT]?B\b/i)?.[0] || ""
  }

  private extractAttachmentCardSource(card: Element): string {
    const links = Array.from(card.querySelectorAll("a[href]"))
    const parentLink = card.closest("a[href]")
    if (parentLink) links.unshift(parentLink)

    for (const link of links) {
      if (!(link instanceof HTMLAnchorElement)) continue
      const href = normalizeExportAssetUrl(link.getAttribute("href") || link.href || "")
      if (isDownloadableExportAssetUrl(href)) return href
    }

    return ""
  }

  private looksLikeFilename(value: string): boolean {
    const normalized = this.normalizeAttachmentText(value)
    if (this.isFileMetaText(normalized)) {
      return false
    }

    return /[^/\\]+\.[A-Za-z0-9]{1,10}$/.test(normalized)
  }

  private isFileMetaText(value: string): boolean {
    return /^[A-Za-z0-9.+-]{1,12}\s+\d+(?:\.\d+)?\s*[KMGT]?B$/i.test(value)
  }

  private isImageAttachmentName(name: string, type: string): boolean {
    const extension = (this.extractFileTypeFromName(name) || type).toLowerCase()
    return ["avif", "gif", "jpg", "jpeg", "png", "svg", "webp"].includes(extension)
  }

  private extractFileTypeFromName(name: string): string {
    return name.match(/\.([A-Za-z0-9]{1,10})$/)?.[1]?.toUpperCase() || ""
  }

  private formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return ""

    const units = ["B", "KB", "MB", "GB", "TB"]
    let value = bytes
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex += 1
    }

    const precision = value >= 10 || unitIndex === 0 ? 0 : 2
    return `${value.toFixed(precision)}${units[unitIndex]}`
  }

  private extractFilenameFromUrl(value: string): string {
    try {
      const url = new URL(value, window.location.href)
      const filename = url.searchParams.get("filename") || url.searchParams.get("file_name")
      if (filename?.trim()) return filename.trim()

      const pathname = decodeURIComponent(url.pathname)
      return pathname.split("/").pop()?.trim() || ""
    } catch {
      return ""
    }
  }

  private normalizeAttachmentText(value: string): string {
    return value.replace(/\s+/g, " ").trim()
  }

  private normalizeAttachmentComparisonText(value: string): string {
    return this.normalizeAttachmentText(value)
      .toLowerCase()
      .replace(/[（]/g, "(")
      .replace(/[）]/g, ")")
      .replace(/\s+/g, "")
  }

  private fileNameEndsWithExtension(name: string, extension: string): boolean {
    const normalizedExtension = extension.toLowerCase().replace(/^\./, "").trim()
    if (!normalizedExtension) return false
    return name.toLowerCase().endsWith(`.${normalizedExtension}`)
  }

  private async collectExportMessageSnapshots(
    scrollContainer: HTMLElement,
    collector?: ExportAssetCollector,
  ): Promise<DeepSeekExportMessageSnapshot[]> {
    const positions = this.buildExportSnapshotPositions(scrollContainer)
    const originalScrollTop = scrollContainer.scrollTop
    let collected: DeepSeekExportMessageSnapshot[] = []

    try {
      for (const top of positions) {
        scrollContainer.scrollTop = top
        scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
        scrollContainer.getBoundingClientRect()
        await this.waitForExportMessagesMounted(scrollContainer)

        const batch = this.readVisibleExportMessageSnapshots(scrollContainer, collector)
        collected = this.mergeExportMessageBatch(collected, batch)
      }
    } finally {
      scrollContainer.scrollTop = originalScrollTop
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
    }

    return collected
  }

  /**
   * 挂载确认：轮询当前可见消息签名（数量 + 首尾文本长度），连续两次采样一致即稳定，
   * 替代固定 80ms sleep——渲染慢时不再读到未挂载完成的批次，从源头避免 overlap 失配。
   */
  private async waitForExportMessagesMounted(
    container: HTMLElement,
    timeoutMs = 800,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs
    // 先等一帧再首采样：scroll 事件在下一帧才派发，滚动后立即采样拿到的是旧位置的消息，
    // 慢渲染下两次采样一致会被误判为稳定（假稳定竞态）。
    // 与 sleep 竞速：后台标签页 rAF 不触发，避免悬挂
    await Promise.race([
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      this.sleep(100),
    ])
    let lastSignature = ""
    while (Date.now() < deadline) {
      const signature = this.getVisibleExportMessageSignature(container)
      if (signature && signature === lastSignature) return
      lastSignature = signature
      await this.sleep(60)
    }
  }

  private getVisibleExportMessageSignature(container: HTMLElement): string {
    const messageSelector = this.config.sitePrivateSelectors.message
    const messages = Array.from(container.querySelectorAll(messageSelector)).filter(
      (message): message is HTMLElement =>
        message instanceof HTMLElement &&
        !message.closest(`[${DEEPSEEK_EXPORT_ROOT_ATTR}]`) &&
        !message.parentElement?.closest(messageSelector),
    )
    if (messages.length === 0) return ""
    const firstLength = messages[0].textContent?.length ?? 0
    const lastLength = messages[messages.length - 1].textContent?.length ?? 0
    // 混入 scrollTop：同一组消息在不同滚动位置不会产生假稳定
    return `${Math.round(container.scrollTop)}:${messages.length}:${firstLength}:${lastLength}`
  }

  private buildExportSnapshotPositions(scrollContainer: HTMLElement): number[] {
    const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    const currentScrollTop = scrollContainer.scrollTop

    if (maxScroll <= 0) {
      return [currentScrollTop]
    }

    const step = Math.max(160, Math.floor(scrollContainer.clientHeight * 0.75))
    const positions = new Set<number>([0, currentScrollTop, maxScroll])

    for (let top = 0; top < maxScroll; top += step) {
      positions.add(top)
    }

    return Array.from(positions).sort((a, b) => a - b)
  }

  private buildBottomUpScanPositions(scrollContainer: HTMLElement): number[] {
    const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
    if (maxScroll <= 0) {
      return [scrollContainer.scrollTop]
    }

    const step = Math.max(160, Math.floor(scrollContainer.clientHeight * 0.9))
    const positions: number[] = []

    for (let top = maxScroll; top > 0; top -= step) {
      positions.push(top)
    }

    if (positions[positions.length - 1] !== 0) {
      positions.push(0)
    }

    return positions
  }

  private shouldIncludeThoughtsInExport(): boolean {
    if (typeof this.exportIncludeThoughtsOverride === "boolean") {
      return this.exportIncludeThoughtsOverride
    }

    return false
  }

  private resolveAssistantMessageElement(element: Element): HTMLElement | null {
    if (element.matches(this.config.sitePrivateSelectors.message)) {
      return element as HTMLElement
    }

    const message = element.closest(this.config.sitePrivateSelectors.message)
    return message instanceof HTMLElement ? message : null
  }

  private resolveAssistantBodyMarkdownElement(element: Element): HTMLElement | null {
    if (
      element.matches(this.config.sitePrivateSelectors.assistantMarkdown) &&
      !this.isThoughtMarkdownElement(element)
    ) {
      return element as HTMLElement
    }

    const message = this.resolveAssistantMessageElement(element)
    if (!message) {
      return null
    }

    return this.getAssistantBodyMarkdown(message)
  }

  private getAssistantBodyMarkdown(message: Element): HTMLElement | null {
    const markdowns = Array.from(
      message.querySelectorAll(this.config.sitePrivateSelectors.assistantMarkdown),
    ).filter(
      (markdown): markdown is HTMLElement =>
        markdown instanceof HTMLElement && !this.isThoughtMarkdownElement(markdown),
    )

    return markdowns.length > 0 ? markdowns[markdowns.length - 1] : null
  }

  private isThoughtMarkdownElement(element: Element): boolean {
    return element.closest(this.config.sitePrivateSelectors.thoughtContainer) !== null
  }

  private extractThoughtBlockquotesFromMessage(message: Element): string[] {
    const thoughtMarkdowns = Array.from(
      message.querySelectorAll(
        `${this.config.sitePrivateSelectors.thoughtContainer} ${this.config.sitePrivateSelectors.assistantMarkdown}`,
      ),
    ).filter((markdown): markdown is HTMLElement => markdown instanceof HTMLElement)

    const thoughtTexts = thoughtMarkdowns
      .map((markdown) => this.extractMarkdownText(markdown))
      .filter(Boolean)

    if (thoughtTexts.length === 0) return []

    return [this.formatAsThoughtBlockquote(thoughtTexts.join("\n\n"))]
  }

  private extractMarkdownText(element: Element): string {
    const clone = element.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(
        `button, [role="button"], svg, ${this.config.sitePrivateSelectors.iconButton}, ${this.config.sitePrivateSelectors.focusRing}, [aria-hidden="true"]`,
      )
      .forEach((node) => node.remove())

    const content = htmlToMarkdown(clone).trim()
    if (content) {
      return content
    }

    return this.extractTextWithLineBreaks(clone).trim()
  }

  private formatAsThoughtBlockquote(markdown: string): string {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n")
    const quotedLines = lines.map((line) => (line.trim().length > 0 ? `> ${line}` : ">"))
    return ["> [Thoughts]", ...quotedLines].join("\n")
  }

  private getVisibleAssistantMessages(container: ParentNode): HTMLElement[] {
    return Array.from(container.querySelectorAll(this.config.selectors.assistantResponse)).filter(
      (message): message is HTMLElement =>
        message instanceof HTMLElement &&
        !message.closest(`[${DEEPSEEK_EXPORT_ROOT_ATTR}]`) &&
        !message.closest(".gh-root") &&
        !message.parentElement?.closest(this.config.sitePrivateSelectors.message),
    )
  }

  private extractLatestReplyTextFromMessages(messages: HTMLElement[]): string | null {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const text = this.extractAssistantResponseText(messages[i]).trim()
      if (text) {
        return text
      }
    }

    return null
  }

  private extractLastCodeBlockTextFromMessages(messages: HTMLElement[]): string | null {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i]
      const bodyMarkdown = this.getAssistantBodyMarkdown(message)
      if (!bodyMarkdown) continue

      const markdownText = this.extractAssistantResponseText(message)
      const fromMarkdown = this.extractLastFencedCodeBlock(markdownText)
      if (fromMarkdown) {
        return fromMarkdown
      }

      const fromDom = this.extractLastCodeBlockTextFromDom(bodyMarkdown)
      if (fromDom) {
        return fromDom
      }
    }

    return null
  }

  private extractLastFencedCodeBlock(markdown: string): string | null {
    if (!markdown) {
      return null
    }

    const pattern = /```[^\n]*\n([\s\S]*?)```/g
    let lastMatch: string | null = null

    for (const match of markdown.matchAll(pattern)) {
      lastMatch = match[1] || null
    }

    if (!lastMatch || !lastMatch.trim()) {
      return null
    }

    return lastMatch.replace(/\r\n/g, "\n").replace(/\n+$/, "")
  }

  private extractLastCodeBlockTextFromDom(markdown: Element): string | null {
    const candidates = Array.from(markdown.querySelectorAll("pre code, pre"))

    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const candidate = candidates[i]
      if (!(candidate instanceof HTMLElement)) continue

      const clone = candidate.cloneNode(true) as HTMLElement
      clone
        .querySelectorAll(
          `button, [role="button"], svg, ${this.config.sitePrivateSelectors.iconButton}, [aria-hidden="true"]`,
        )
        .forEach((node) => node.remove())

      const text = clone.textContent?.replace(/\r\n/g, "\n").replace(/\n+$/, "") || ""
      if (text.trim()) {
        return text
      }
    }

    return null
  }

  private readVisibleExportMessageSnapshots(
    container: ParentNode,
    collector?: ExportAssetCollector,
  ): DeepSeekExportMessageSnapshot[] {
    const messageSelector = this.config.sitePrivateSelectors.message
    const messages = Array.from(container.querySelectorAll(messageSelector)).filter(
      (message): message is HTMLElement =>
        message instanceof HTMLElement &&
        !message.closest(`[${DEEPSEEK_EXPORT_ROOT_ATTR}]`) &&
        !message.parentElement?.closest(messageSelector),
    )

    return messages
      .map((message) => this.extractExportMessageSnapshot(message, collector))
      .filter((message): message is DeepSeekExportMessageSnapshot => message !== null)
  }

  private extractExportMessageSnapshot(
    message: Element,
    collector?: ExportAssetCollector,
  ): DeepSeekExportMessageSnapshot | null {
    const markdown = this.getAssistantBodyMarkdown(message)
    if (markdown) {
      const content = this.normalizeExportMessageContent(this.extractAssistantResponseText(message))
      return content
        ? {
            role: DEEPSEEK_EXPORT_ROLE_ASSISTANT,
            content,
          }
        : null
    }

    const content = this.normalizeExportMessageContent(
      this.extractDeepSeekUserQueryExportContent(message, collector),
    )
    return content
      ? {
          role: DEEPSEEK_EXPORT_ROLE_USER,
          content,
        }
      : null
  }

  private normalizeExportMessageContent(content: string): string {
    return content
      .replace(/\r\n/g, "\n")
      .replace(/\u00a0/g, " ")
      .trim()
  }

  private mergeExportMessageBatch(
    collected: DeepSeekExportMessageSnapshot[],
    batch: DeepSeekExportMessageSnapshot[],
  ): DeepSeekExportMessageSnapshot[] {
    if (batch.length === 0) {
      return collected
    }

    if (collected.length === 0) {
      return batch.map((item) => ({ ...item }))
    }

    const maxOverlap = Math.min(collected.length, batch.length)
    for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
      const collectedTail = collected.slice(-overlap)
      const batchHead = batch.slice(0, overlap)
      if (this.exportMessageSequenceEquals(collectedTail, batchHead)) {
        return [...collected, ...batch.slice(overlap).map((item) => ({ ...item }))]
      }
    }

    const merged = collected.map((item) => ({ ...item }))
    batch.forEach((item) => {
      if (!this.exportMessageEntryEquals(merged[merged.length - 1], item)) {
        merged.push({ ...item })
      }
    })
    return merged
  }

  private exportMessageSequenceEquals(
    left: DeepSeekExportMessageSnapshot[],
    right: DeepSeekExportMessageSnapshot[],
  ): boolean {
    if (left.length !== right.length) {
      return false
    }

    return left.every((item, index) => this.exportMessageEntryEquals(item, right[index]))
  }

  private exportMessageEntryEquals(
    left: DeepSeekExportMessageSnapshot | undefined,
    right: DeepSeekExportMessageSnapshot | undefined,
  ): boolean {
    if (!left || !right) {
      return false
    }

    return left.role === right.role && left.content === right.content
  }

  private mountExportSnapshot(messages: DeepSeekExportMessageSnapshot[]): void {
    this.clearExportSnapshot()

    const root = document.createElement("div")
    root.setAttribute(DEEPSEEK_EXPORT_ROOT_ATTR, "1")
    root.style.display = "none"

    messages.forEach((message) => {
      const node = document.createElement("div")
      node.setAttribute(DEEPSEEK_EXPORT_ROLE_ATTR, message.role)
      node.textContent = message.content
      root.appendChild(node)
    })

    document.body.appendChild(root)
    this.exportSnapshotRoot = root
    this.exportSnapshotActive = true
  }

  private clearExportSnapshot(): void {
    this.exportSnapshotActive = false
    const root = this.exportSnapshotRoot
    this.exportSnapshotRoot = null

    if (root?.isConnected) {
      root.remove()
    }

    document.querySelectorAll(`[${DEEPSEEK_EXPORT_ROOT_ATTR}]`).forEach((node) => {
      if (node !== root) {
        node.parentNode?.removeChild(node)
      }
    })
  }

  private async deleteConversationViaApi(
    target: ConversationDeleteTarget,
    token: string,
  ): Promise<SiteDeleteConversationResult> {
    try {
      const response = await fetch(CHAT_DELETE_API_PATH, {
        method: "POST",
        headers: this.buildDeleteHeaders(token),
        body: JSON.stringify({ chat_session_id: target.id }),
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
      if (this.isDeleteSuccessPayload(payload)) {
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
        reason: DEEPSEEK_DELETE_REASON.API_REQUEST_FAILED,
      }
    }
  }

  private buildDeleteHeaders(token: string): Record<string, string> {
    return {
      accept: "*/*",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-client-platform": "web",
      "x-client-locale": this.getClientLocale(),
      "x-client-timezone-offset": String(-new Date().getTimezoneOffset() * 60),
    }
  }

  private buildHistoryApiHeaders(token: string): Record<string, string> {
    return {
      accept: "*/*",
      authorization: `Bearer ${token}`,
      "x-client-platform": "web",
      "x-client-locale": this.getClientLocale(),
      // 见 DEEPSEEK_CLIENT_VERSION：该头决定接口返回完整 fragments 形态
      "x-client-version": DEEPSEEK_CLIENT_VERSION,
    }
  }

  private getUserToken(): string | null {
    const raw = localStorage.getItem(USER_TOKEN_STORAGE_KEY)
    if (!raw) return null

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const value = parsed.value
      if (typeof value === "string" && value.trim()) {
        return value.trim()
      }
    } catch {
      // ignore malformed token payload and fall back to raw string
    }

    const normalized = raw.trim().replace(/^"|"$/g, "")
    return normalized || null
  }

  private getClientLocale(): string {
    const lang = document.documentElement.lang || navigator.language || "en-US"
    return lang.replace(/-/g, "_")
  }

  private isDeleteSuccessPayload(payload: unknown): boolean {
    if (!payload || typeof payload !== "object") return false

    const data = payload as Record<string, unknown>
    if (data.code !== 0) return false

    const responseData = data.data
    if (!responseData || typeof responseData !== "object") {
      return true
    }

    const bizCode = (responseData as Record<string, unknown>).biz_code
    return bizCode === undefined || bizCode === 0
  }

  private toDeleteApiPayloadReason(payload: unknown): string {
    if (!payload || typeof payload !== "object") {
      return DEEPSEEK_DELETE_REASON.API_INVALID_RESPONSE
    }

    const data = payload as Record<string, unknown>
    if (typeof data.msg === "string" && data.msg.trim()) {
      return `${DEEPSEEK_DELETE_REASON.API_BUSINESS_FAILED}:${data.msg.trim()}`
    }

    const nested = data.data
    if (nested && typeof nested === "object") {
      const nestedData = nested as Record<string, unknown>
      if (typeof nestedData.biz_msg === "string" && nestedData.biz_msg.trim()) {
        return `${DEEPSEEK_DELETE_REASON.API_BUSINESS_FAILED}:${nestedData.biz_msg.trim()}`
      }
    }

    return DEEPSEEK_DELETE_REASON.API_BUSINESS_FAILED
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

  private scheduleHomeRefreshAfterDelete() {
    try {
      sessionStorage.setItem(DELETE_REFRESH_STORAGE_KEY, "1")
    } catch {
      // ignore storage failures and still try to redirect
    }

    window.location.replace(DEEPSEEK_HOME_URL)
  }

  private schedulePageReloadAfterDelete() {
    window.setTimeout(() => {
      window.location.reload()
    }, 0)
  }

  private consumePendingDeleteRefresh() {
    let shouldRefresh = false

    try {
      shouldRefresh = sessionStorage.getItem(DELETE_REFRESH_STORAGE_KEY) === "1"
      if (!shouldRefresh) return
      sessionStorage.removeItem(DELETE_REFRESH_STORAGE_KEY)
    } catch {
      return
    }

    const isHomePage = window.location.pathname === "/" || window.location.pathname === ""
    if (!isHomePage) {
      try {
        sessionStorage.setItem(DELETE_REFRESH_STORAGE_KEY, "1")
      } catch {
        // ignore storage failures and still try to redirect
      }
      window.location.replace(DEEPSEEK_HOME_URL)
      return
    }

    setTimeout(() => {
      window.location.reload()
    }, 0)
  }

  private findNextAssistantMarkdown(messages: Element[], currentIndex: number): Element | null {
    for (let i = currentIndex + 1; i < messages.length; i++) {
      const markdown = this.getAssistantBodyMarkdown(messages[i])
      if (markdown) {
        return markdown
      }
    }

    return null
  }

  private extractConversationInfo(el: Element, cid?: string): ConversationInfo | null {
    const href = el.getAttribute(this.config.conversation.idFrom.attr ?? "href") || ""
    const match = href.match(new RegExp(this.config.conversation.idFrom.regex, "i"))
    if (!match) return null

    const id = match[1]
    const title = this.extractConversationTitle(el)
    const url = new URL(href, window.location.origin).toString()
    const isActive =
      (this.config.conversation.activeMatch
        ? el.matches(this.config.conversation.activeMatch)
        : false) ||
      new URL(url).pathname === window.location.pathname ||
      id === this.getSessionId()

    return {
      id,
      cid,
      title,
      url,
      isActive,
      isPinned: this.isPinnedConversationLink(el),
    }
  }

  private getShareConversationTitle(): string | null {
    const messageSelector = this.config.sitePrivateSelectors.message
    const firstUserMessage = Array.from(
      document.querySelectorAll(this.config.selectors.userQuery),
    ).find((message) => !message.parentElement?.closest(messageSelector))
    const firstUserText = firstUserMessage ? this.extractUserQueryText(firstUserMessage) : ""
    const normalizedUserText = this.normalizeOutlineText(firstUserText)

    if (normalizedUserText) {
      return normalizedUserText.length > 80
        ? `${normalizedUserText.slice(0, 80)}...`
        : normalizedUserText
    }

    const metaTitle = document
      .querySelector(this.config.sitePrivateSelectors.shareTitleMeta)
      ?.getAttribute("content")
      ?.replace(/\s*[-|]\s*DeepSeek$/i, "")
      ?.trim()

    if (metaTitle && metaTitle !== "来自分享的对话") {
      return metaTitle
    }

    return metaTitle || "DeepSeek Share"
  }

  private isPinnedConversationLink(link: Element): boolean {
    let current = link.parentElement
    let pathChild = link

    while (current && current !== document.body) {
      const directChildren = Array.from(current.children)
      const pathIndex = directChildren.indexOf(pathChild)

      if (pathIndex > 0) {
        const hasGroupHeader = directChildren
          .slice(0, pathIndex)
          .some((child) => this.isConversationGroupHeader(child))
        // 新版侧边栏：置顶分组的会话列表被额外包了一层容器，
        // 日期分组的会话则是分组容器的直接子节点
        if (hasGroupHeader) return pathChild !== link
      }

      pathChild = current
      current = current.parentElement
    }

    return false
  }

  private isConversationGroupHeader(element: Element): boolean {
    if (this.isConversationLink(element)) return false
    if (element.querySelector(this.config.conversation.itemSelector)) return false
    return Boolean(element.textContent?.trim())
  }

  private isConversationLink(element: Element): boolean {
    return element.matches(this.config.conversation.itemSelector)
  }

  private extractConversationTitle(el: Element): string {
    const ariaLabel = el.getAttribute("aria-label")?.trim()
    if (ariaLabel) return ariaLabel

    const titleElement = this.findTitleElement(el)
    const titleText =
      (titleElement as HTMLElement | null)?.innerText?.trim() ||
      titleElement?.textContent?.trim() ||
      ""

    if (titleText) {
      return titleText.replace(/\s+/g, " ").trim()
    }

    const linkText = (el as HTMLElement).innerText?.trim() || el.textContent?.trim() || ""
    return linkText.replace(/\s+/g, " ").trim()
  }

  private findTitleElement(el: Element): Element | null {
    const directChildren = Array.from(el.children)
    const directTitleChild = directChildren.find((child) => {
      if (!(child instanceof HTMLElement)) return false
      if (child.matches(this.config.sitePrivateSelectors.focusRing)) return false
      if (child.querySelector(`[role="button"], ${this.config.sitePrivateSelectors.iconButton}`)) {
        return false
      }
      return !!child.innerText?.trim()
    })
    if (directTitleChild) return directTitleChild

    const candidates = el.querySelectorAll("span, p, div")
    for (const candidate of Array.from(candidates)) {
      const text =
        (candidate as HTMLElement).innerText?.trim() || candidate.textContent?.trim() || ""
      if (text) return candidate
    }

    return el
  }

  private findUserContentRoot(element: Element): Element | null {
    const message = this.resolveUserMessageElement(element)
    if (!message) return null

    const candidates = Array.from(message.children).filter((child) => {
      if (!(child instanceof HTMLElement)) return false
      if (this.isLikelyUserMessageDecoration(child)) return false
      if (this.isLikelyUserAttachmentContainer(child)) return false
      return Boolean(child.innerText?.trim())
    })

    return candidates[0] || null
  }

  private isLikelyUserMessageDecoration(element: Element): boolean {
    return element.matches(
      `.gh-inline-bookmark, .gh-user-query-raw, .gh-user-query-markdown, button, [role=button], ${this.config.sitePrivateSelectors.iconButton}, ${this.config.sitePrivateSelectors.focusRing}`,
    )
  }
}
