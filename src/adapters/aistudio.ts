/**
 * AI Studio 适配器（aistudio.google.com）
 *
 * AI Studio 是 Google 的 Gemini Playground 界面，与传统聊天界面不同：
 * - 使用 Angular + Material UI (mat-* 组件)
 * - 三栏布局：左导航 + 中内容 + 右设置面板
 * - URL 结构：/prompts/new_chat（新对话）、/prompts/[ID]（历史对话）
 *
 * 选择器策略：
 * - 使用 Angular Material 类名（如 .textarea, .mat-*）- 相对稳定
 * - 使用语义化属性（如 placeholder, aria-label）
 */
import { SITE_IDS } from "~constants"
import {
  AISTUDIO_RPC_BRIDGE_ATTR,
  AISTUDIO_RPC_REQUEST_EVENT,
  AISTUDIO_RPC_RESPONSE_EVENT,
  installAIStudioRpcBridge,
  type AIStudioRpcBridgeWindow,
} from "~core/aistudio-rpc-bridge"
import { platform } from "~platform"
import { useSettingsStore } from "~stores/settings-store"
import {
  createExportAssetCollector,
  formatExportFileAttachments,
  formatExportImageAttachments,
  isDownloadableExportAssetUrl,
  normalizeExportAssetUrl,
  type ExportAssetCollector,
} from "~utils/export-assets"
import { htmlToMarkdown, type ExportBundle } from "~utils/exporter"
import {
  buildGoogleAuthorizationHeader,
  GOOGLE_MAKER_SUITE_RPC_PATH,
  recordGoogleRpcOrigin,
  resolveGoogleApiKey,
  resolveGoogleAuthUser,
  resolveGoogleRpcOrigins,
} from "~utils/google-rpc-auth"
import { t } from "~utils/i18n"
import { EVENT_OUTLINE_DATA_UPDATED } from "~utils/messaging"
import { isApiOutlineStale, shouldAttemptApiOutlineFetch } from "~utils/outline-api-source"
import {
  alignScrollTop,
  settleVirtualScroll,
  waitForVirtualScrollQuiet,
} from "~utils/virtual-scroll-settle"
import type {
  VirtualOutlinePositionSnapshot,
  VirtualPositionAnchor,
} from "~utils/virtual-outline-position"

import {
  SiteAdapter,
  type AnchorData,
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportCollectionReport,
  type ExportConfig,
  type ExportLifecycleContext,
  type MarkdownFixerConfig,
  type ModelSwitcherConfig,
  type OutlineItem,
  type PanelAvoidanceConfig,
  type SiteDeleteConversationResult,
  type ZenModeConfig,
} from "./base"
import {
  AISTUDIO_CONFIG,
  AISTUDIO_CONFIG_VERSION,
  type AIStudioSiteConfig,
} from "./aistudio-config"
import {
  parseAIStudioHistoryOutline,
  type AIStudioHistoryAttachment,
  type AIStudioHistoryOutlineData,
} from "./aistudio-history-outline"
import type { BuiltinSiteConfig } from "./declarative"

const AISTUDIO_DELETE_REASON = {
  UI_FAILED: "delete_ui_failed",
  BATCH_ABORTED_AFTER_UI_FAILURE: "delete_batch_aborted_after_ui_failure",
  API_DISABLED_UNSTABLE: "delete_api_disabled_unstable",
  API_AUTH_MISSING: "delete_api_auth_missing",
  API_KEY_MISSING: "delete_api_key_missing",
  API_REQUEST_FAILED: "delete_api_request_failed",
  API_NOT_FOUND_BUT_VISIBLE: "delete_api_not_found_but_visible",
} as const

const AISTUDIO_DELETE_MENU_KEYWORDS = [
  "delete",
  "remove",
  "删除",
  "刪除",
  "削除",
  "삭제",
  "supprimer",
  "eliminar",
  "löschen",
  "excluir",
  "hapus",
  "удалить",
]

const AISTUDIO_CANCEL_KEYWORDS = [
  "cancel",
  "取消",
  "キャンセル",
  "취소",
  "annuler",
  "abbrechen",
  "annulla",
  "batal",
  "cancelar",
  "отмена",
]

const AISTUDIO_DELETE_PROMPT_METHOD = "DeletePrompt"
const AISTUDIO_EXPORT_ROOT_ATTR = "data-gh-aistudio-export-root"
const AISTUDIO_EXPORT_TURN_ATTR = "data-gh-aistudio-export-turn"
const AISTUDIO_EXPORT_ROLE_ATTR = "data-gh-aistudio-export-role"
const AISTUDIO_EXPORT_ROLE_USER = "user"
const AISTUDIO_EXPORT_ROLE_ASSISTANT = "assistant"
const AISTUDIO_EXPORT_TURN_SELECTOR = `[${AISTUDIO_EXPORT_ROOT_ATTR}="1"] [${AISTUDIO_EXPORT_TURN_ATTR}="1"]`
const AISTUDIO_EXPORT_USER_SELECTOR = `[${AISTUDIO_EXPORT_ROOT_ATTR}="1"] [${AISTUDIO_EXPORT_ROLE_ATTR}="${AISTUDIO_EXPORT_ROLE_USER}"]`
const AISTUDIO_EXPORT_ASSISTANT_SELECTOR = `[${AISTUDIO_EXPORT_ROOT_ATTR}="1"] [${AISTUDIO_EXPORT_ROLE_ATTR}="${AISTUDIO_EXPORT_ROLE_ASSISTANT}"]`

const AISTUDIO_API_OUTLINE_FETCH_BACKOFF_MS = 10_000
const AISTUDIO_API_OUTLINE_BOTTOM_TOLERANCE_PX = 100
const AISTUDIO_RPC_REQUEST_TIMEOUT_MS = 10_000
const AISTUDIO_API_HEADING_MOUNT_TIMEOUT_MS = 2_000

interface AIStudioExportMessageSnapshot {
  role: "user" | "assistant"
  turnKey: string
  order: number
  content: string
}

interface AIStudioUserAttachment {
  kind: "image" | "file"
  name: string
  source: string
  details?: string
  mimeHint?: string
}

interface AIStudioScrollbarQueryEntry {
  turnId: string
  text: string
  button: HTMLElement
  element: Element | null
  index: number
}

interface AIStudioOutlineSortEntry {
  item: OutlineItem
  order: number
}

export class AIStudioAdapter extends SiteAdapter {
  protected config: AIStudioSiteConfig = AISTUDIO_CONFIG

  // ==================== 缓存属性 ====================

  // 缓存从 library 页面抓取的对话列表
  private cachedLibraryConversations: ConversationInfo[] | null = null
  private exportSnapshotRoot: HTMLElement | null = null
  private exportSnapshotActive = false
  private exportIncludeThoughtsOverride: boolean | null = null
  private exportBundleCache: ExportBundle | null = null
  // 导出采集完整性报告（通过 getExportCollectionReport 暴露给 manager）
  private exportCollectionReport: ExportCollectionReport | null = null

  // ==================== API 数据源大纲状态 ====================

  private apiOutlineData: AIStudioHistoryOutlineData | null = null
  private apiOutlineFetchPromise: Promise<void> | null = null
  private apiOutlineLastFetchAt = 0
  private apiOutlineFailures = 0
  private apiOutlineSessionId = ""
  private apiOutlineForceRefetch = false
  private apiOutlineWasGenerating = false
  // ==================== 基础信息 ====================

  match(): boolean {
    // 匹配 aistudio.google.com
    const hostname = window.location.hostname
    return hostname === "aistudio.google.com"
  }

  getSiteId(): string {
    return SITE_IDS.AISTUDIO
  }

  getName(): string {
    return "AI Studio"
  }

  getBuiltinConfig(): AIStudioSiteConfig {
    return AISTUDIO_CONFIG
  }

  getBuiltinConfigVersion(): number {
    return AISTUDIO_CONFIG_VERSION
  }

  applyMergedConfig(config: BuiltinSiteConfig): void {
    this.config = config as AIStudioSiteConfig
  }

  getThemeColors(): { primary: string; secondary: string } {
    // Google AI 蓝色主题
    return { primary: "#4285f4", secondary: "#1a73e8" }
  }

  getNewTabUrl(): string {
    return "https://aistudio.google.com/prompts/new_chat"
  }

  // ==================== 对话状态 ====================

  isNewConversation(): boolean {
    // 只要有有效的 session ID，就不是新对话
    return !this.getSessionId()
  }

  isSharePage(): boolean {
    // 自有对话：/prompts/ID    分享对话：/app/prompts/ID
    return window.location.pathname.startsWith("/app/prompts/")
  }

  getSessionId(): string {
    const path = window.location.pathname
    // AI Studio 对话 ID 位于 /prompts/ 之后
    // 支持 /app/prompts/[ID] 和 /prompts/[ID]
    // 排除 query 参数和 hash（虽然 pathname 通常不含这些，但为了稳健性使用排除集）
    const match = path.match(/\/prompts\/([^/?#]+)/)

    if (match && match[1]) {
      const id = match[1]
      // 排除 "new_chat" 关键字
      if (id !== "new_chat") {
        return id
      }
    }

    return ""
  }

  private normalizeTurnId(turnId: string): string {
    return turnId.replace(/^turn-/, "").trim()
  }

  private getTurnControlId(turnId: string): string {
    const normalizedTurnId = this.normalizeTurnId(turnId)
    return normalizedTurnId ? `turn-${normalizedTurnId}` : ""
  }

  private normalizeScrollbarQueryText(text: string): string {
    return text.replace(/\s+/g, " ").trim()
  }

  private isSameOutlineText(source: string, target: string): boolean {
    const normalizedSource = this.normalizeScrollbarQueryText(source)
    const normalizedTarget = this.normalizeScrollbarQueryText(target)

    return (
      normalizedSource === normalizedTarget ||
      normalizedSource.startsWith(normalizedTarget) ||
      normalizedTarget.startsWith(normalizedSource)
    )
  }

  private findUserQueryElementByTurnId(turnId: string): Element | null {
    const privateSelectors = this.config.sitePrivateSelectors
    const turnControlId = this.getTurnControlId(turnId)
    if (!turnControlId) return null

    const directTurn = document.getElementById(turnControlId)
    const directUserQuery = directTurn?.querySelector(this.config.selectors.userQuery)
    if (directUserQuery) {
      return directUserQuery
    }

    const normalizedTurnId = this.normalizeTurnId(turnId)
    const candidates = Array.from(document.querySelectorAll(this.config.selectors.userQuery))
    return (
      candidates.find((candidate) => {
        const candidateTurnId = candidate.closest(privateSelectors.turn)?.id || ""
        return this.normalizeTurnId(candidateTurnId) === normalizedTurnId
      }) || null
    )
  }

  private getScrollbarQueryEntries(): AIStudioScrollbarQueryEntry[] {
    const buttons = Array.from(
      document.querySelectorAll(this.config.sitePrivateSelectors.scrollbarButton),
    ).filter((button): button is HTMLElement => button instanceof HTMLElement)

    const seenTurnIds = new Set<string>()
    const entries: AIStudioScrollbarQueryEntry[] = []

    buttons.forEach((button) => {
      const rawTurnId =
        button.getAttribute("aria-controls") || button.getAttribute("data-test-item-id") || ""
      const turnId = this.normalizeTurnId(rawTurnId)
      if (!turnId || seenTurnIds.has(turnId)) return

      const text = this.normalizeScrollbarQueryText(
        button.getAttribute("aria-label") || button.getAttribute("title") || "",
      )
      if (!text) return

      seenTurnIds.add(turnId)
      entries.push({
        turnId,
        text,
        button,
        element: this.findUserQueryElementByTurnId(turnId),
        index: entries.length,
      })
    })

    return entries
  }

  /**
   * 从时间线滚动条获取用户提问文本。
   * AI Studio 新版使用 ms-items-scrollbar，旧版使用 ms-prompt-scrollbar。
   */
  private getTextFromScrollbar(turnId: string): string | null {
    const normalizedTurnId = this.normalizeTurnId(turnId)
    if (!normalizedTurnId) return null

    const entry = this.getScrollbarQueryEntries().find(
      (candidate) => candidate.turnId === normalizedTurnId,
    )
    return entry?.text || null
  }

  private async waitForUserQueryElementByTurnId(
    turnId: string,
    text: string,
    timeout = 1600,
  ): Promise<Element | null> {
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      const candidate = this.findUserQueryElementByTurnId(turnId)
      if (candidate) {
        const candidateText = this.extractUserQueryText(candidate)
        if (!text || this.isSameOutlineText(candidateText, text)) {
          return candidate
        }
      }

      await this.sleep(80)
    }

    return this.findUserQueryElementByTurnId(turnId)
  }

  private revealUserQueryThroughScrollbar(turnId: string): boolean {
    const normalizedTurnId = this.normalizeTurnId(turnId)
    const entry = this.getScrollbarQueryEntries().find(
      (candidate) => candidate.turnId === normalizedTurnId,
    )
    if (!entry) return false

    entry.button.scrollIntoView({ block: "nearest", inline: "nearest" })
    entry.button.click()
    return true
  }

  private resolveScrollbarTurnIdForOutlineItem(
    item: Pick<OutlineItem, "text" | "id">,
    queryIndex?: number,
  ): string | null {
    const itemId = item.id || ""
    const idMatch = itemId.match(/^aistudio-user:(.+)$/)
    if (idMatch?.[1]) {
      return this.normalizeTurnId(idMatch[1])
    }

    const entries = this.getScrollbarQueryEntries()
    if (queryIndex !== undefined) {
      return entries[queryIndex - 1]?.turnId || null
    }

    return entries.find((entry) => this.isSameOutlineText(entry.text, item.text))?.turnId || null
  }

  private getCurrentConversationTitleFromSources(): string | null {
    const privateSelectors = this.config.sitePrivateSelectors
    const sessionId = this.getSessionId()
    if (!sessionId) return null

    // ① 页面 H1 标题——自有 + 分享页面最权威的来源，不受侧边栏改版 / 链接污染影响。
    //    自有页：<div class="page-title"><h1 class="mode-title ...">Hello</h1></div>
    //    分享页：<h1 class="page-title mode-title ...">IoT平台规划</h1>
    const pageHeading = document.querySelector(privateSelectors.pageHeading)
    const headingText = pageHeading?.textContent?.trim()
    if (headingText) {
      return headingText
    }

    // ② 回退：library 缓存全量精确匹配（仅当用户访问过 /library 时有效）
    if (this.cachedLibraryConversations && this.cachedLibraryConversations.length > 0) {
      const matched = this.cachedLibraryConversations.find((item) => item.id === sessionId)
      if (matched?.title?.trim()) {
        return matched.title.trim()
      }
    }

    // ③ 最终回退：侧边栏内的特定链接（使用精确选择器，避免
    //    a[href*="/prompts/..."] 误匹配分享按钮等无关元素）
    const link = Array.from(document.querySelectorAll(privateSelectors.sidebarTitleLink)).find(
      (candidate) => candidate.getAttribute("href")?.includes(`/prompts/${sessionId}`),
    )
    const title = link?.textContent?.trim()
    return title || null
  }

  getSessionName(): string | null {
    return this.getCurrentConversationTitleFromSources()
  }

  getConversationTitle(): string | null {
    return this.getCurrentConversationTitleFromSources()
  }

  // ==================== 输入框操作 ====================

  getTextareaSelectors(): string[] {
    return [...this.config.selectors.textarea]
  }

  getSubmitButtonSelectors(): string[] {
    return [...this.config.selectors.submitButton]
  }

  /**
   * 获取发送消息的快捷键配置
   * AI Studio 允许用户自定义发送键：Enter 或 Ctrl+Enter
   * 配置存储在 localStorage.aiStudioUserPreference.enterKeyBehavior
   * - enterKeyBehavior: 2 表示 Ctrl+Enter 发送
   * - 其他值表示 Enter 发送
   */
  getSubmitKeyConfig(): { key: "Enter" | "Ctrl+Enter" } {
    const fallbackKey = this.config.input.submitKey || "Enter"
    try {
      const prefStr = localStorage.getItem("aiStudioUserPreference")
      if (!prefStr) return { key: fallbackKey }

      const pref = JSON.parse(prefStr)
      // enterKeyBehavior: 2 表示 Ctrl+Enter 发送
      if (pref.enterKeyBehavior === 2) {
        return { key: "Ctrl+Enter" }
      }
      return { key: fallbackKey }
    } catch {
      return { key: fallbackKey }
    }
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (element.offsetParent === null) return false
    if (element.closest(".gh-main-panel")) return false
    return (
      this.config.input.mode === "textarea" &&
      element.matches(this.config.sitePrivateSelectors.validTextarea)
    )
  }

  insertPrompt(content: string): boolean {
    const textarea = this.textarea as HTMLTextAreaElement
    if (!textarea) return false

    if (!textarea.isConnected) {
      this.textarea = null
      return false
    }

    textarea.focus()

    // 标准 textarea 操作
    if (textarea.tagName.toLowerCase() === "textarea") {
      // 设置值
      textarea.value = content

      // 触发 Angular 变更检测
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      textarea.dispatchEvent(new Event("change", { bubbles: true }))

      // 将光标移到末尾
      textarea.selectionStart = textarea.selectionEnd = content.length

      return true
    }

    return false
  }

  clearTextarea(): void {
    const textarea = this.textarea as HTMLTextAreaElement
    if (!textarea) return
    if (!textarea.isConnected) {
      this.textarea = null
      return
    }

    textarea.focus()
    if (textarea.tagName.toLowerCase() === "textarea") {
      textarea.value = ""
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      textarea.dispatchEvent(new Event("change", { bubbles: true }))
    }
  }

  // ==================== 滚动容器 ====================

  getScrollContainer(): HTMLElement | null {
    for (const selector of this.config.selectors.scrollContainer) {
      // 同一选择器可能命中多个候选（如 virtual-scroll-container 会命中
      // 每个 turn 的内层容器），逐个检查可滚动性，不能只验第一个
      for (const container of Array.from(document.querySelectorAll(selector))) {
        if (container instanceof HTMLElement && container.scrollHeight > container.clientHeight) {
          return container
        }
      }
    }

    return null
  }

  getResponseContainerSelector(): string {
    return this.config.selectors.responseContainer
  }

  getChatContentSelectors(): string[] {
    return [...this.config.selectors.chatContent]
  }

  getWidthSelectors() {
    return this.config.widthSelectors.map((selector) => ({ ...selector }))
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    const privateSelectors = this.config.sitePrivateSelectors
    return {
      // AI Studio 的右侧 Run settings 是 ms-chunk-editor 的 flex 子节点。
      // 聊天主区域独立计算正文避让，父级 editor 单独预留右侧空间，避免把透明设置栏叠到聊天区。
      scopeSelector: privateSelectors.layoutScope,
      obstacleSelectors: [privateSelectors.modelSidebar],
      widthSelectors: [
        {
          selector: privateSelectors.panelChatContentWidth,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.panelChatTurnWidth,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.panelPromptBoxWidth,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.panelTableWidth,
          property: "width",
          value: "100%",
          noCenter: true,
          extraCss: "min-width: 100% !important;",
        },
      ],
      insetSelectors: [
        {
          selector: privateSelectors.panelChatSafeArea,
          insetMode: "edge",
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.panelPromptSafeArea,
          insetMode: "edge",
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: privateSelectors.editorScope,
          scopeSelector: privateSelectors.editorScope,
          applySide: "right",
          insetMode: "edge",
          extraCss: "box-sizing: border-box !important; min-width: 0 !important;",
        },
      ],
      defaultWidth: "1000px",
      gap: 16,
    }
  }

  getZenModeConfig() {
    return this.cloneZenModeConfig(this.config.zenMode)
  }

  getCleanModeConfig() {
    return this.cloneZenModeConfig(this.config.cleanMode)
  }

  getMarkdownFixerConfig(): MarkdownFixerConfig {
    return {
      selector: this.config.sitePrivateSelectors.markdownFixerTarget,
      fixSpanContent: true,
    }
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

  private getAIStudioModelSelectorButton(requireVisible = false): HTMLElement | null {
    for (const selector of this.config.modelSwitcher.selectorButtonSelectors) {
      const candidate = document.querySelector(selector)
      if (candidate instanceof HTMLElement && (!requireVisible || this.isVisible(candidate))) {
        return candidate
      }
    }

    const modelName = document.querySelector(this.config.sitePrivateSelectors.modelNameMarker)
    const modelButton = modelName?.closest("button")
    return modelButton instanceof HTMLElement && (!requireVisible || this.isVisible(modelButton))
      ? modelButton
      : null
  }

  private getRunSettingsToggleButton(requireVisible = false): HTMLElement | null {
    const toggleButton = document.querySelector(
      this.config.sitePrivateSelectors.runSettingsToggleButton,
    )
    return toggleButton instanceof HTMLElement && (!requireVisible || this.isVisible(toggleButton))
      ? toggleButton
      : null
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig {
    const config = this.config.modelSwitcher
    return {
      targetModelKeyword: keyword,
      ...config,
      selectorButtonSelectors: [...config.selectorButtonSelectors],
      ...(config.subMenuTriggers ? { subMenuTriggers: [...config.subMenuTriggers] } : {}),
    }
  }

  clickModelSelector(): boolean {
    const modelSelectorButton = this.getAIStudioModelSelectorButton()
    if (modelSelectorButton) {
      this.simulateClick(modelSelectorButton)
      return true
    }

    const toggleButton = this.getRunSettingsToggleButton()
    if (!toggleButton) return false

    this.simulateClick(toggleButton)
    const expandedModelSelectorButton = this.getAIStudioModelSelectorButton()
    if (!expandedModelSelectorButton) return false

    this.simulateClick(expandedModelSelectorButton)
    return true
  }

  // ==================== 模型列表抓取 ====================

  /**
   * 获取可用模型列表（从 DOM 动态抓取）
   * 打开模型选择侧边栏 → 抓取模型列表 → 关闭侧边栏
   */
  /**
   * 锁定模型（AI Studio 专用实现）
   * 使用 ID 精确匹配，解决显示名称与 ID 不一致的问题
   */
  lockModel(keyword: string, onSuccess?: () => void): void {
    if (!keyword) return

    const maxAttempts = this.config.modelSwitcher.maxAttempts ?? 10
    const checkInterval = this.config.modelSwitcher.checkInterval ?? 1000
    let attempts = 0

    const waitForButton = setInterval(async () => {
      attempts++
      const selectorBtn = this.getAIStudioModelSelectorButton()

      if (selectorBtn) {
        clearInterval(waitForButton)

        // 1. 打开侧边栏
        selectorBtn.click()

        // 2. 等待侧边栏
        const sidebar = await this.waitForModelSidebar()
        if (!sidebar) {
          console.warn("[AIStudioAdapter] 模型侧边栏加载超时")
          this.closeModelSidebar()
          return
        }

        await this.ensureAllModelsCategory(sidebar)

        // 3. 查找目标模型（通过 ID）
        // ID 格式: model-carousel-row-models/{model-id}
        const targetId = `model-carousel-row-models/${keyword}`
        const targetBtn = document.getElementById(targetId)

        if (targetBtn) {
          // 3.1 提取模型名称并缓存 (解决面板收起后无法获取模型名的问题)
          const nameEl = targetBtn.querySelector(this.config.sitePrivateSelectors.modelCardName)
          const displayName = nameEl?.textContent?.trim() || keyword
          const sessionId = this.getSessionId()
          if (sessionId) {
            localStorage.setItem(`ophel:aistudio:model:${sessionId}`, displayName)
          }

          // 4. 点击选择
          targetBtn.click()
          // AI Studio 点击模型后会自动关闭侧边栏并切换
          if (onSuccess) onSuccess()

          // 5. 检查是否需要收起运行设置面板
          // (Preload 脚本在开启模型锁定时会跳过收起操作，交由这里执行)
          try {
            const settings = useSettingsStore.getState().settings
            if (settings.aistudio?.collapseRunSettings) {
              // 稍作延迟等待 UI 稳定
              setTimeout(() => {
                const closeRunSettingsBtn = document.querySelector(
                  this.config.sitePrivateSelectors.runSettingsCloseButton,
                ) as HTMLElement
                if (closeRunSettingsBtn) {
                  closeRunSettingsBtn.click()
                }
              }, 500)
            }
          } catch (e) {
            console.error("[AIStudioAdapter] Auto-collapse run settings failed:", e)
          }
        } else {
          console.warn(`[AIStudioAdapter] 未找到目标模型: ${keyword}`)
          // 关闭侧边栏
          this.closeModelSidebar()
        }
      } else {
        // 如果找不到模型选择按钮，尝试检查是否是因为面板被收起了
        const toggleBtn = this.getRunSettingsToggleButton()
        if (toggleBtn) {
          // 此时不要关闭 interval，点击后等待下一次检查
          toggleBtn.click()
          // 重置尝试次数，给予更多时间让面板加载
          attempts = Math.max(0, attempts - 2)
        } else if (attempts >= maxAttempts) {
          clearInterval(waitForButton)
          console.warn("[AIStudioAdapter] 未找到模型选择按钮")
        }
      }
    }, checkInterval)
  }

  async getModelList(): Promise<{ id: string; name: string }[]> {
    let wasCollapsed = false
    // 1. 获取模型选择按钮
    let modelSelectorBtn = this.getAIStudioModelSelectorButton()
    // 如果按钮不存在，尝试检查是否是因为面板被收起了
    if (!modelSelectorBtn) {
      const toggleBtn = this.getRunSettingsToggleButton()
      if (toggleBtn) {
        wasCollapsed = true
        toggleBtn.click()

        // 等待面板展开和按钮出现
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 200))
          modelSelectorBtn = this.getAIStudioModelSelectorButton()
          if (modelSelectorBtn) break
        }
      }
    }

    if (!modelSelectorBtn) {
      console.warn("[AIStudioAdapter] 模型选择器按钮未找到")
      return []
    }

    // 2. 点击按钮打开侧边栏
    modelSelectorBtn.click()

    // 3. 等待模型侧边栏出现
    const sidebar = await this.waitForModelSidebar()
    if (!sidebar) {
      console.warn("[AIStudioAdapter] 模型侧边栏加载超时")
      // 如果是为了抓取而打开了面板，记得恢复
      if (wasCollapsed) {
        const closeRunSettingsBtn = document.querySelector(
          this.config.sitePrivateSelectors.runSettingsCloseButton,
        ) as HTMLElement
        if (closeRunSettingsBtn) closeRunSettingsBtn.click()
      }
      return []
    }

    // 4. 确保先切换到"All"分类（默认打开的可能是"Featured"，导致模型列表不全）
    await this.ensureAllModelsCategory(sidebar)

    // 5. 抓取模型列表
    const models = this.extractModelsFromSidebar(sidebar)

    // 5. 关闭模型选择侧边栏（ESC 键或点击关闭按钮）
    this.closeModelSidebar()

    // 6. 如果之前是收起的，恢复收起状态
    if (wasCollapsed) {
      // 稍作延迟等待侧边栏关闭动画
      setTimeout(() => {
        const closeRunSettingsBtn = document.querySelector(
          this.config.sitePrivateSelectors.runSettingsCloseButton,
        ) as HTMLElement
        if (closeRunSettingsBtn) {
          closeRunSettingsBtn.click()
        }
      }, 500)
    }

    return models
  }

  /**
   * 等待模型选择侧边栏出现
   */
  private async waitForModelSidebar(): Promise<HTMLElement | null> {
    const maxWait = 5000
    const interval = 100
    const start = Date.now()

    while (Date.now() - start < maxWait) {
      // 查找侧边栏容器（使用实际 DOM 结构）
      const sidebar = document.querySelector(
        this.config.sitePrivateSelectors.modelSidebar,
      ) as HTMLElement

      if (sidebar) {
        // 等待模型列表项加载
        await new Promise((r) => setTimeout(r, this.config.modelSwitcher.menuRenderDelay ?? 300))
        return sidebar
      }

      await new Promise((r) => setTimeout(r, interval))
    }

    return null
  }

  /**
   * 确保模型侧边栏已切换到"All"分类，避免仅显示 Featured 等子集
   */
  private async ensureAllModelsCategory(sidebar: HTMLElement): Promise<void> {
    const categoryButtons = Array.from(
      sidebar.querySelectorAll(this.config.sitePrivateSelectors.modelCategoryButton),
    ) as HTMLElement[]
    if (categoryButtons.length === 0) return

    // 找到"All"按钮
    const allBtn = categoryButtons.find((btn) => btn.textContent?.trim() === "All")
    if (!allBtn) return

    // 如果已经是"All"，不做任何操作
    if (allBtn.getAttribute("aria-selected") === "true") return

    // 点击"All"并等待列表刷新
    allBtn.click()
    await this.sleep(400)
  }

  /**
   * 从侧边栏抓取模型列表
   */
  private extractModelsFromSidebar(sidebar: HTMLElement): { id: string; name: string }[] {
    const models: { id: string; name: string }[] = []

    // 从模型选项容器中提取模型卡片
    const modelCards = sidebar.querySelectorAll(this.config.modelSwitcher.menuItemSelector)

    modelCards.forEach((card) => {
      // 从按钮 id 属性提取模型 ID，格式: model-carousel-row-models/{model-id}
      const btnId = card.id || ""
      const modelId = btnId.replace("model-carousel-row-", "").replace("models/", "")

      // 从指定的 span 元素提取干净的显示名称（避免获取描述等内容）
      const nameEl = card.querySelector(this.config.sitePrivateSelectors.modelCardName)
      const displayName = nameEl?.textContent?.trim() || modelId

      if (modelId && displayName) {
        models.push({ id: modelId, name: displayName })
      }
    })

    return models
  }

  /**
   * 关闭模型选择侧边栏
   */
  private closeModelSidebar(): void {
    // 方法1: 点击关闭按钮（使用稳定的 data-test 选择器）
    const closeBtn = document.querySelector(
      this.config.sitePrivateSelectors.modelSidebarCloseButton,
    ) as HTMLElement
    if (closeBtn) {
      closeBtn.click()
      return
    }

    // 方法2: 发送 ESC 键作为回退
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  }

  /**
   * 加载全部对话（从 library 页面抓取）
   * 跳转到 /library 页面，等待桌面表格或移动端卡片列表加载后缓存。
   */
  async loadAllConversations(): Promise<void> {
    const currentPath = window.location.pathname
    const isOnLibrary = currentPath === "/library"

    if (!isOnLibrary) {
      // 尝试 SPA 跳转到 library 页面（新版侧边栏已移除 view-all-history-link）
      const navigated = await this.navigateToLibraryViaSpa()
      if (!navigated) {
        // SPA 导航失败，降级为全页面跳转
        window.location.href = "/library"
        return
      }
    }

    // 抓取 library 数据
    const conversations = this.extractLibraryConversations()
    if (conversations.length > 0) {
      this.cachedLibraryConversations = conversations
    }

    // 如果是从其他页面跳转过来的，返回原页面
    if (!isOnLibrary) {
      // 使用 history.back() 返回，保持 SPA 状态
      window.history.back()
    }

    // 10 秒后清除缓存，确保后续调用使用实时数据
    setTimeout(() => {
      this.cachedLibraryConversations = null
    }, 10000)
  }

  /**
   * 通过 SPA 方式导航到 /library 页面
   * 优先寻找页面内的 Angular 路由链接，回退到 history.pushState + popstate
   */
  private async navigateToLibraryViaSpa(): Promise<boolean> {
    const privateSelectors = this.config.sitePrivateSelectors
    // 方法 1: 仅在导航容器（ms-navbar-v2）内查找 /library 链接，
    // 或链接本身带有 Angular routerLink 属性，确保是 SPA 路由链接而非普通 <a>
    const candidate = privateSelectors.libraryNavigationLink
      .map((selector) => document.querySelector(selector))
      .find((element): element is HTMLAnchorElement => element instanceof HTMLAnchorElement)
    const isRouterLink =
      !!candidate &&
      (!!candidate.closest(this.config.selectors.sidebarScrollContainer) ||
        candidate.hasAttribute("routerlink") ||
        candidate.hasAttribute("ng-reflect-router-link"))

    if (isRouterLink && candidate) {
      candidate.click()
      return this.waitForLibraryContent()
    }

    // 方法 2: 使用 history.pushState + popstate 触发 Angular 路由器
    window.history.pushState(null, "", "/library")
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }))
    return this.waitForLibraryContent()
  }

  /**
   * 等待 library 页面内容加载完成
   */
  private async waitForLibraryContent(): Promise<boolean> {
    // 最多等待 5 秒
    // 以桌面表格、移动端卡片列表、真实对话链接或明确空状态为就绪信号。
    // 不把裸 ms-library-table 当作完成信号，避免 Angular shell 阶段提前返回。
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      const content = this.getLibraryContentElement()
      if (content) {
        // 额外等待 200ms 确保数据渲染完成
        await new Promise((resolve) => setTimeout(resolve, 200))
        return true
      }
    }
    return false
  }

  /**
   * 从 library 页面提取对话列表，兼容桌面表格和移动端卡片布局。
   */
  private extractLibraryConversations(): ConversationInfo[] {
    const conversations = new Map<string, ConversationInfo>()
    const links = Array.from(
      document.querySelectorAll(this.config.conversation.itemSelector),
    ) as HTMLAnchorElement[]

    links.forEach((link) => {
      const info = this.extractLibraryConversationInfo(link)
      if (!info || conversations.has(info.id)) return
      conversations.set(info.id, info)
    })

    return Array.from(conversations.values())
  }

  private getLibraryContentElement(): Element | null {
    const privateSelectors = this.config.sitePrivateSelectors
    return (
      document.querySelector(privateSelectors.libraryTable) ||
      document.querySelector(privateSelectors.libraryMobileCards) ||
      document.querySelector(this.config.conversation.itemSelector) ||
      this.getLibraryEmptyStateElement()
    )
  }

  private getLibraryEmptyStateElement(): HTMLElement | null {
    const candidates = Array.from(
      document.querySelectorAll(this.config.sitePrivateSelectors.libraryEmptyState),
    ) as HTMLElement[]
    return candidates.find((candidate) => this.isVisible(candidate)) || null
  }

  private getLibraryScrollContainer(): Element | null {
    const privateSelectors = this.config.sitePrivateSelectors
    const tableWrapper = document.querySelector(privateSelectors.libraryTableWrapper)
    if (tableWrapper) return tableWrapper

    const mobileCards = document.querySelector(privateSelectors.libraryMobileCards)
    if (mobileCards) {
      return document.scrollingElement || document.documentElement || mobileCards
    }

    return document.querySelector(privateSelectors.libraryRoot)
  }

  private extractLibraryConversationInfo(link: HTMLAnchorElement): ConversationInfo | null {
    const hrefAttribute = this.config.conversation.idFrom.attr || "href"
    const href = link.getAttribute(hrefAttribute) || ""
    if (!href || href.includes("new_chat")) return null

    const match = href.match(new RegExp(this.config.conversation.idFrom.regex))
    if (!match) return null

    const id = match[1]
    const card = link.closest(this.config.sitePrivateSelectors.libraryCard) as HTMLElement | null
    const cardLabel = card
      ?.getAttribute("aria-label")
      ?.replace(/^Open\s+/i, "")
      .trim()
    const title =
      link.getAttribute("title")?.trim() ||
      link.textContent?.replace(/\s+/g, " ").trim() ||
      cardLabel ||
      "Untitled"

    return {
      id,
      title,
      url: href,
      isActive: window.location.pathname.includes(id),
      isPinned: false,
    }
  }

  /**
   * 从侧边栏提取对话列表（仅部分最近对话）
   */
  private extractSidebarConversations(): ConversationInfo[] {
    const conversationMap = new Map<string, ConversationInfo>()

    // 从侧边栏历史记录提取
    const historyLinks = document.querySelectorAll(
      this.config.sitePrivateSelectors.sidebarConversationLink,
    )

    historyLinks.forEach((link) => {
      const href = link.getAttribute(this.config.conversation.idFrom.attr || "href")
      if (!href || href.includes("new_chat")) return

      // 提取 ID
      const match = href.match(new RegExp(this.config.conversation.idFrom.regex))
      if (!match) return

      const id = match[1]
      if (conversationMap.has(id)) return

      // 提取标题
      const title = link.textContent?.trim() || "Untitled"

      // 检查是否当前对话
      const isActive = window.location.pathname.includes(id)

      conversationMap.set(id, {
        id,
        title,
        url: href,
        isActive,
        isPinned: false,
      })
    })

    return Array.from(conversationMap.values())
  }

  getConversationList(): ConversationInfo[] {
    // 如果在 library 页面，直接从页面列表抓取
    if (window.location.pathname === "/library") {
      return this.extractLibraryConversations()
    }

    // 优先返回缓存的 library 数据（全量）
    if (this.cachedLibraryConversations && this.cachedLibraryConversations.length > 0) {
      return this.cachedLibraryConversations
    }

    // 否则从侧边栏抓取（部分）
    return this.extractSidebarConversations()
  }

  getSidebarScrollContainer(): Element | null {
    // /library 页面返回真实的对话列表滚动容器
    if (window.location.pathname === "/library") {
      return this.getLibraryScrollContainer()
    }

    // 非 /library 页面：新版 AI Studio（ms-navbar-v2）侧边栏不再包含可滚动的历史列表，
    // 但上层 waitForSidebarReady() 需要一个稳定可获取的元素作为「页面就绪」信号，
    // 否则首次安装或对话列表为空时的自动全量同步（autoFullSync）会被永久阻塞。
    // 这里返回稳定宿主容器作为就绪信号，而非直接返回 null。
    return (
      document.querySelector(this.config.selectors.sidebarScrollContainer) ||
      document.querySelector("main") ||
      document.body ||
      null
    )
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    // 新版 AI Studio 侧边栏（ms-navbar-v2）已不含历史对话链接
    // 对话列表仅通过 /library 页面获取，无需 DOM 观察器
    if (window.location.pathname === "/library") {
      return {
        selector: this.config.conversation.itemSelector,
        shadow: this.config.conversation.shadow ?? false,
        extractInfo: (el: Element) => {
          return this.extractLibraryConversationInfo(el as HTMLAnchorElement)
        },
        getTitleElement: (el: Element) => el,
      }
    }

    return null
  }

  navigateToConversation(id: string, url?: string): boolean {
    // 优先在 ms-library-table 内查找，避免误命中页面其他区域的同 URL 链接
    const link = this.findConversationLinkById(this.config.conversation.itemSelector, id)
    if (link) {
      link.click()
      return true
    }
    // 降级：优先 history 导航免刷新（Angular 路由响应 popstate，已实测），失败再硬跳转
    const targetUrl = url || this.config.conversation.urlTemplate.replace("{id}", id)
    if (this.navigateViaHistory(targetUrl)) return true
    window.location.href = targetUrl
    return true
  }

  private findConversationLinkById(selector: string, id: string): HTMLAnchorElement | null {
    const links = Array.from(document.querySelectorAll(selector)).filter(
      (element): element is HTMLAnchorElement => element instanceof HTMLAnchorElement,
    )
    return links.find((link) => this.extractLibraryConversationInfo(link)?.id === id) || null
  }

  // ==================== 大纲提取 ====================

  async deleteConversationOnSite(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    const results = await this.deleteConversationsOnSite([target])
    return (
      results[0] || {
        id: target.id,
        success: false,
        method: "none",
        reason: AISTUDIO_DELETE_REASON.UI_FAILED,
      }
    )
  }

  async deleteConversationsOnSite(
    targets: ConversationDeleteTarget[],
  ): Promise<SiteDeleteConversationResult[]> {
    const libraryContext = await this.enterLibraryPageForDelete()
    const results: SiteDeleteConversationResult[] = []
    const deletedIds: string[] = []
    let restored = false

    try {
      for (let index = 0; index < targets.length; index++) {
        const result = await this.deleteConversationOnSiteInternal(targets[index])
        results.push(result)
        if (result.success) {
          deletedIds.push(targets[index].id)
        }

        if (!result.success && result.reason === AISTUDIO_DELETE_REASON.UI_FAILED) {
          for (let i = index + 1; i < targets.length; i++) {
            results.push({
              id: targets[i].id,
              success: false,
              method: "none",
              reason: AISTUDIO_DELETE_REASON.BATCH_ABORTED_AFTER_UI_FAILURE,
            })
          }
          break
        }
      }

      if (libraryContext.enteredLibrary) {
        await this.restoreFromLibraryPage(libraryContext.originalPath)
        restored = true
      }

      if (deletedIds.length > 0) {
        this.scheduleFullReloadAfterDelete(deletedIds)
      }

      return results
    } finally {
      if (libraryContext.enteredLibrary && !restored) {
        await this.restoreFromLibraryPage(libraryContext.originalPath)
      }
    }
  }

  private async deleteConversationOnSiteInternal(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    const apiResult = this.shouldUseNativeDeleteApi()
      ? await this.tryDeleteViaGrpcApi(target.id)
      : {
          id: target.id,
          success: false,
          method: "none" as const,
          reason: AISTUDIO_DELETE_REASON.API_DISABLED_UNSTABLE,
        }
    if (apiResult.success) {
      return apiResult
    }

    const uiSuccess = await this.deleteConversationViaUi(target.id)
    return {
      id: target.id,
      success: uiSuccess,
      method: uiSuccess ? "ui" : "none",
      reason: uiSuccess ? undefined : apiResult.reason || AISTUDIO_DELETE_REASON.UI_FAILED,
    }
  }

  private shouldUseNativeDeleteApi(): boolean {
    // AI Studio's RPC headers/tokens are highly dynamic and currently unstable across sessions.
    // Keep API delete disabled to avoid false failures and rely on stable UI automation.
    return false
  }

  private async tryDeleteViaGrpcApi(id: string): Promise<SiteDeleteConversationResult> {
    const authorization = await buildGoogleAuthorizationHeader(window.location.origin)
    if (!authorization) {
      return {
        id,
        success: false,
        method: "none",
        reason: AISTUDIO_DELETE_REASON.API_AUTH_MISSING,
      }
    }

    const apiKey = resolveGoogleApiKey()
    if (!apiKey) {
      return {
        id,
        success: false,
        method: "none",
        reason: AISTUDIO_DELETE_REASON.API_KEY_MISSING,
      }
    }

    const promptName = this.normalizePromptName(id)
    const endpoints = this.getDeletePromptEndpoints()
    let lastStatus = 0

    try {
      for (const endpoint of endpoints) {
        const response = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: {
            accept: "*/*",
            authorization,
            "content-type": "application/json+protobuf",
            "x-goog-api-key": apiKey,
            "x-goog-authuser": resolveGoogleAuthUser(),
            "x-user-agent": "grpc-web-javascript/0.1",
          },
          body: JSON.stringify([promptName]),
        })

        lastStatus = response.status
        if (response.ok) {
          recordGoogleRpcOrigin(new URL(endpoint).origin)
          this.syncConversationListAfterDelete(id)
          return { id, success: true, method: "api" }
        }

        if (response.status === 404) {
          if (!this.isConversationVisible(id)) {
            recordGoogleRpcOrigin(new URL(endpoint).origin)
            this.syncConversationListAfterDelete(id)
            return { id, success: true, method: "api" }
          }
          // 404 可能来自错误 shard，继续尝试下一个候选端点。
          continue
        }

        // 400/5xx 也可能是错误 host，继续尝试候选端点。
        if (response.status === 400 || response.status >= 500) {
          continue
        }

        return {
          id,
          success: false,
          method: "api",
          reason: this.toDeleteApiHttpReason(response.status),
        }
      }

      if (lastStatus === 404) {
        return {
          id,
          success: false,
          method: "api",
          reason: AISTUDIO_DELETE_REASON.API_NOT_FOUND_BUT_VISIBLE,
        }
      }

      return {
        id,
        success: false,
        method: "api",
        reason: this.toDeleteApiHttpReason(lastStatus || 0),
      }
    } catch {
      return {
        id,
        success: false,
        method: "api",
        reason: AISTUDIO_DELETE_REASON.API_REQUEST_FAILED,
      }
    }
  }

  private toDeleteApiHttpReason(status: number): string {
    switch (status) {
      case 401:
      case 403:
        return "delete_api_unauthorized"
      case 429:
        return "delete_api_rate_limited"
      default:
        return `delete_api_http_${status}`
    }
  }

  private normalizePromptName(id: string): string {
    if (!id) return ""
    return id.startsWith("prompts/") ? id : `prompts/${id}`
  }

  private getDeletePromptEndpoints(): string[] {
    return resolveGoogleRpcOrigins().map(
      (origin) => `${origin}${GOOGLE_MAKER_SUITE_RPC_PATH}/${AISTUDIO_DELETE_PROMPT_METHOD}`,
    )
  }

  // ==================== API 数据源大纲 ====================

  /**
   * 所有会话统一拉取接口大纲：页面可能把轮次渲染为无内容空壳，DOM 扫描不全；
   * 回填只补 DOM 缺失的标题，已渲染轮次不会产生重复条目。
   * 过期判定与拉取闸门复用 outline-api-source 的站无关机制；
   * mountedIds 用语义等同的「时间线滚动条条目序号」（滚动条始终列出全部带文本提问）。
   */
  private maybeRefreshApiOutline(): void {
    if (this.isSharePage()) return
    const sessionId = this.getSessionId()
    if (!sessionId) return

    if (sessionId !== this.apiOutlineSessionId) {
      // 会话切换时解除失败熔断与拉取冷却，新会话应立即补齐大纲
      this.apiOutlineSessionId = sessionId
      this.apiOutlineFailures = 0
      this.apiOutlineLastFetchAt = 0
    }

    // 生成结束（含编辑后重跑）后内容已变化，提问序号不变，必须强制重拉
    const generating = this.isGenerating()
    if (this.apiOutlineWasGenerating && !generating) {
      this.apiOutlineForceRefetch = true
    }
    this.apiOutlineWasGenerating = generating

    const scrollable = this.getScrollContainer()
    const atBottom = scrollable
      ? scrollable.scrollTop + scrollable.clientHeight >=
        scrollable.scrollHeight - AISTUDIO_API_OUTLINE_BOTTOM_TOLERANCE_PX
      : true
    const scrollbarQueryIndexes = new Set(
      this.getScrollbarQueryEntries().map((entry) => entry.index + 1),
    )
    const stale =
      this.apiOutlineForceRefetch ||
      isApiOutlineStale({
        data: this.apiOutlineData,
        sessionId,
        mountedIds: scrollbarQueryIndexes,
        atBottom,
      })

    if (
      !shouldAttemptApiOutlineFetch({
        now: Date.now(),
        lastFetchAt: this.apiOutlineLastFetchAt,
        backoffMs: AISTUDIO_API_OUTLINE_FETCH_BACKOFF_MS,
        parseFailures: this.apiOutlineFailures,
        inFlight: this.apiOutlineFetchPromise !== null,
        generating,
        stale,
      })
    ) {
      return
    }

    // 任何一次实际发起的拉取都记入冷却，成功但数据未变的重拉也不会连续重试
    this.apiOutlineLastFetchAt = Date.now()
    this.apiOutlineFetchPromise = this.fetchApiOutline(sessionId)
      .then((result) => {
        if (result === "parse-failed") {
          this.apiOutlineFailures += 1
          return
        }
        if (result === "no-bridge") {
          // 桥未就绪（启动竞态）：不计失败，等下次 extract 再试
          return
        }
        this.apiOutlineFailures = 0
        if (result === "changed") {
          window.postMessage({ type: EVENT_OUTLINE_DATA_UPDATED }, "*")
        }
      })
      .catch((error) => {
        // 网络/HTTP 失败计入熔断：连续失败时回退纯 DOM 扫描
        this.apiOutlineFailures += 1
        console.warn("[AIStudioAdapter] Failed to fetch conversation outline:", error)
      })
      .finally(() => {
        this.apiOutlineFetchPromise = null
      })
  }

  private async fetchApiOutline(
    sessionId: string,
  ): Promise<"changed" | "unchanged" | "parse-failed" | "no-bridge"> {
    const result = await this.requestRpcResolveDriveResource(sessionId)
    if (result.kind === "no-bridge") return "no-bridge"
    if (result.kind === "failed") {
      throw new Error(`ResolveDriveResource responded ${result.status}`)
    }

    const parsed = parseAIStudioHistoryOutline(result.payload)
    if (!parsed || parsed.sessionId !== sessionId) return "parse-failed"

    const previous = this.apiOutlineData
    this.apiOutlineData = parsed
    this.apiOutlineForceRefetch = false
    return !previous ||
      previous.sessionId !== parsed.sessionId ||
      previous.signature !== parsed.signature
      ? "changed"
      : "unchanged"
  }

  /**
   * 经 main world 桥代发 ResolveDriveResource（SAPISIDHASH 校验绑定 Origin，
   * isolated world 的跨域 fetch 会被改写 Origin，见 aistudio-rpc-bridge.ts 头注释）。
   * no-bridge：桥未安装；failed：桥返回非 2xx 或请求超时。
   */
  private requestRpcResolveDriveResource(
    promptId: string,
  ): Promise<
    { kind: "ok"; payload: unknown } | { kind: "no-bridge" } | { kind: "failed"; status: number }
  > {
    // 油猴端没有 Plasmo 的 world:"MAIN" 机制，直接把桥装进页面 window
    const unsafeWin = (window as unknown as Record<string, unknown>).unsafeWindow as
      | AIStudioRpcBridgeWindow
      | undefined
    if (unsafeWin && typeof unsafeWin === "object") {
      installAIStudioRpcBridge(unsafeWin)
    }

    if (!document.documentElement?.hasAttribute?.(AISTUDIO_RPC_BRIDGE_ATTR)) {
      return Promise.resolve({ kind: "no-bridge" })
    }

    const requestId = `ophel-aistudio-rpc-${Date.now()}-${Math.random().toString(36).slice(2)}`

    return new Promise((resolve) => {
      let settled = false
      let timeoutId = 0
      const cleanup = () => {
        window.clearTimeout(timeoutId)
        window.removeEventListener("message", handleMessage)
      }
      const finish = (
        result:
          | { kind: "ok"; payload: unknown }
          | { kind: "no-bridge" }
          | { kind: "failed"; status: number },
      ) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(result)
      }

      const handleMessage = (event: MessageEvent) => {
        if (event.source !== window) return
        const data = event.data as {
          type?: unknown
          requestId?: unknown
          ok?: unknown
          status?: unknown
          payload?: unknown
        }
        if (data?.type !== AISTUDIO_RPC_RESPONSE_EVENT || data.requestId !== requestId) return
        if (data.ok === true) {
          finish({ kind: "ok", payload: data.payload })
        } else {
          finish({ kind: "failed", status: typeof data.status === "number" ? data.status : 0 })
        }
      }

      timeoutId = window.setTimeout(
        () => finish({ kind: "failed", status: 0 }),
        AISTUDIO_RPC_REQUEST_TIMEOUT_MS,
      )
      window.addEventListener("message", handleMessage)
      window.postMessage(
        {
          type: AISTUDIO_RPC_REQUEST_EVENT,
          requestId,
          method: "ResolveDriveResource",
          args: [promptId],
        },
        "*",
      )
    })
  }

  /**
   * 滚动条条目（仅带文本提问）→ 接口提问序号（全部轮次空间）的映射。
   * 两者都只收录带文本的提问：数量一致时按位置对齐（快路径）；
   * 不一致时按归一化文本匹配（截断容忍），匹配不上的条目不做接口回填。
   */
  private mapScrollbarEntriesToApiQueries(
    entries: AIStudioScrollbarQueryEntry[],
    data: AIStudioHistoryOutlineData,
  ): Map<string, number> {
    const mapping = new Map<string, number>()

    if (entries.length === data.userQueries.length) {
      entries.forEach((entry, index) => {
        const query = data.userQueries[index]
        if (query) mapping.set(entry.turnId, query.queryIndex)
      })
      return mapping
    }

    const usedQueryIndexes = new Set<number>()
    for (const entry of entries) {
      const hit = data.userQueries.find(
        (query) =>
          !usedQueryIndexes.has(query.queryIndex) && this.isSameOutlineText(query.text, entry.text),
      )
      if (hit) {
        usedQueryIndexes.add(hit.queryIndex)
        mapping.set(entry.turnId, hit.queryIndex)
      }
    }
    return mapping
  }

  // ==================== API 数据源导出 ====================

  /**
   * 导出优先走 ResolveDriveResource 接口拿全量 markdown（公式/代码零损耗、
   * 无需滚动收集，且主动调用不依赖页面自身的请求时机）；接口不可用或结构
   * 异常时返回 null，回退现有 DOM/滚动收集。
   */
  private async collectApiExportMessageSnapshots(
    context: ExportLifecycleContext,
    collector?: ExportAssetCollector,
  ): Promise<AIStudioExportMessageSnapshot[] | null> {
    if (this.isSharePage()) return null
    const sessionId = this.getSessionId()
    if (!sessionId) return null

    const result = await this.requestRpcResolveDriveResource(sessionId)
    if (result.kind !== "ok") return null

    const parsed = parseAIStudioHistoryOutline(result.payload)
    if (!parsed || parsed.sessionId !== sessionId) return null

    // 轮次空间为绝对序号（含纯附件轮）：提问、附件、回答取并集后按序组装
    const turnIndexes = new Set<number>()
    parsed.userQueries.forEach((query) => turnIndexes.add(query.queryIndex))
    parsed.attachmentsByQueryIndex.forEach((_, index) => turnIndexes.add(index))
    parsed.replyMarkdownByQueryIndex.forEach((_, index) => turnIndexes.add(index))
    if (turnIndexes.size === 0) return null

    const includeThoughts = this.shouldIncludeThoughtsInExport()
    const inlineImages = context.format === "markdown" && context.packaging !== "zip"
    const messages: AIStudioExportMessageSnapshot[] = []
    let order = 0

    for (const turnIndex of Array.from(turnIndexes).sort((left, right) => left - right)) {
      const query = parsed.userQueries.find((entry) => entry.queryIndex === turnIndex)
      const attachment = parsed.attachmentsByQueryIndex.get(turnIndex)
      if (query || attachment) {
        const content = await this.buildApiExportUserContent(
          query?.markdown ?? "",
          attachment,
          collector,
          inlineImages,
        )
        if (content) {
          messages.push({
            role: "user",
            turnKey: `api-user-${turnIndex}`,
            order: order++,
            content,
          })
        }
      }

      const thoughtBlocks = includeThoughts
        ? (parsed.thoughtsByQueryIndex.get(turnIndex) ?? []).map((thought) =>
            this.formatAsThoughtBlockquote(thought),
          )
        : []
      const reply = parsed.replyMarkdownByQueryIndex.get(turnIndex)?.trim() ?? ""
      const assistantContent = [...thoughtBlocks, reply].filter(Boolean).join("\n\n")
      if (assistantContent) {
        messages.push({
          role: "assistant",
          turnKey: `api-model-${turnIndex}`,
          order: order++,
          content: assistantContent,
        })
      }
    }

    return messages.length > 0 ? messages : null
  }

  /** 组装 API 路径的用户消息：提问原文 + 附件（图片 zip 内嵌 / 单文件 data URL / 真实链接） */
  private async buildApiExportUserContent(
    markdown: string,
    attachment: AIStudioHistoryAttachment | undefined,
    collector: ExportAssetCollector | undefined,
    inlineImages: boolean,
  ): Promise<string> {
    if (!attachment || (attachment.images.length === 0 && attachment.files.length === 0)) {
      return markdown.trim()
    }

    const downloaded = new Map<string, Blob>()

    // Promise.all + map 保持与响应一致的原顺序（不能用 forEach+push，完成顺序乱序）
    const images: AIStudioUserAttachment[] = await Promise.all(
      attachment.images.map(async (fileId, index): Promise<AIStudioUserAttachment> => {
        const needBytes = Boolean(collector) || inlineImages
        const info = await this.fetchDriveAttachment(fileId, needBytes)
        if (info.blob) downloaded.set(fileId, info.blob)
        return {
          kind: "image",
          name: info.name || `image-${index + 1}.png`,
          source: this.buildDriveDownloadUrl(fileId),
        }
      }),
    )
    const files: AIStudioUserAttachment[] = await Promise.all(
      attachment.files.map(async (fileId, index): Promise<AIStudioUserAttachment> => {
        const info = await this.fetchDriveAttachment(fileId, false)
        return {
          kind: "file",
          name: info.name || `attachment-${index + 1}`,
          source: this.buildDriveDownloadUrl(fileId),
        }
      }),
    )

    let imageMarkdown: string[]
    if (inlineImages) {
      // 单文件导出：图片转 data URL 内嵌，保证脱离登录态也能查看
      const inlined = await Promise.all(
        images.map(async (image) => {
          const blob = downloaded.get(this.extractDriveFileIdFromUrl(image.source) || "")
          if (!blob) return `![${image.name}](${image.source})`
          const dataUrl = await this.convertBlobToDataUrl(blob)
          return dataUrl ? `![${image.name}](${dataUrl})` : `![${image.name}](${image.source})`
        }),
      )
      imageMarkdown = inlined
    } else {
      imageMarkdown = this.formatAIStudioUserImageAttachments(images, collector)
      // zip 打包：collector 只登记了 sourceUrl，页面上下文无法跨域下载
      // drive.usercontent（CORS 不允许带凭证），这里把后台通道取回的字节补上
      if (collector) {
        for (const asset of collector.assets) {
          if (!asset.sourceUrl || asset.content !== undefined) continue
          const blob = downloaded.get(this.extractDriveFileIdFromUrl(asset.sourceUrl) || "")
          if (blob) asset.content = blob
        }
      }
    }

    // 文件附件不打包字节（可能触发 Drive 病毒扫描两步流且体积不可控），统一给真实链接
    const fileMarkdown = this.formatAIStudioUserFileAttachments(files, undefined)
    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, markdown.trim()].filter(Boolean).join("\n\n")
  }

  /** AI Studio 附件即用户 Drive 文件，下载端点带登录态可打开（真实链接） */
  private buildDriveDownloadUrl(fileId: string, extraParams = ""): string {
    return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&authuser=${resolveGoogleAuthUser()}${extraParams}`
  }

  private extractDriveFileIdFromUrl(url: string): string | null {
    try {
      return new URL(url).searchParams.get("id")
    } catch {
      return null
    }
  }

  /**
   * 经平台通道（扩展 background / 油猴 GM_xhr，均带登录 cookie）获取附件信息。
   * 浏览器页面上下文读不到 Content-Disposition（CORS 暴露头不含），必须走这里。
   * 大文件首次返回病毒扫描警告页：从页内解析文件名与确认参数，需要字节时二次请求。
   */
  private async fetchDriveAttachment(
    fileId: string,
    withContent: boolean,
  ): Promise<{ name: string | null; blob: Blob | null }> {
    try {
      const response = await platform.fetch(this.buildDriveDownloadUrl(fileId))
      if (!response.ok) return { name: null, blob: null }

      if (response.contentType?.includes("text/html")) {
        const html = await response.text()
        const name = this.parseDriveInterstitialFileName(html)
        if (!withContent) return { name, blob: null }
        const uuid = html.match(/name="uuid" value="([^"]+)"/)?.[1]
        const at = html.match(/name="at" value="([^"]+)"/)?.[1]
        if (!uuid || !at) return { name, blob: null }
        const confirmed = await platform.fetch(
          this.buildDriveDownloadUrl(
            fileId,
            `&confirm=t&uuid=${encodeURIComponent(uuid)}&at=${encodeURIComponent(at)}`,
          ),
        )
        if (!confirmed.ok) return { name, blob: null }
        return {
          name: this.parseContentDispositionFilename(confirmed.contentDisposition) || name,
          blob: await confirmed.blob(),
        }
      }

      const name = this.parseContentDispositionFilename(response.contentDisposition)
      if (!withContent) return { name, blob: null }
      return { name, blob: await response.blob() }
    } catch (error) {
      console.warn("[AIStudioAdapter] Failed to fetch attachment:", fileId, error)
      return { name: null, blob: null }
    }
  }

  private parseContentDispositionFilename(disposition?: string): string | null {
    if (!disposition) return null
    const encoded = disposition.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/)
    if (encoded?.[1]) {
      try {
        return decodeURIComponent(encoded[1].trim())
      } catch {
        return encoded[1].trim()
      }
    }
    const quoted = disposition.match(/filename\s*=\s*"([^"]+)"/)
    if (quoted?.[1]) return quoted[1].trim()
    const bare = disposition.match(/filename\s*=\s*([^;]+)/)
    return bare?.[1]?.trim() || null
  }

  /** 病毒扫描警告页的文件名在 uc-name-size 锚点文本里 */
  private parseDriveInterstitialFileName(html: string): string | null {
    const match = html.match(/uc-name-size[^>]*>\s*<a[^>]*>([^<]+)</)
    return match?.[1]?.trim() || null
  }

  private convertBlobToDataUrl(blob: Blob): Promise<string | null> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  }

  private syncConversationListAfterDelete(id: string): void {
    if (this.cachedLibraryConversations) {
      this.cachedLibraryConversations = this.cachedLibraryConversations.filter(
        (item) => item.id !== id,
      )
    }

    const anchors = Array.from(
      document.querySelectorAll(this.config.sitePrivateSelectors.conversationVisibilityLink),
    ).filter(
      (element): element is HTMLAnchorElement =>
        element instanceof HTMLAnchorElement &&
        this.extractLibraryConversationInfo(element)?.id === id,
    )
    anchors.forEach((anchor) => {
      const container =
        this.findClosestElement(
          anchor,
          this.config.sitePrivateSelectors.conversationRemovalContainer,
        ) || anchor
      container.remove()
    })
  }

  private isConversationVisible(id: string): boolean {
    return Boolean(
      this.findConversationLinkById(
        this.config.sitePrivateSelectors.conversationVisibilityLink,
        id,
      ),
    )
  }

  private scheduleFullReloadAfterDelete(deletedIds: string[]): void {
    if (deletedIds.length === 0) return

    const currentId = this.getSessionId()
    if (currentId && deletedIds.includes(currentId)) {
      try {
        window.history.replaceState(window.history.state, "", "/prompts/new_chat")
      } catch {
        // ignore SPA route replacement failure
      }
    }
  }

  private async deleteConversationViaUi(id: string): Promise<boolean> {
    const row = await this.findLibraryRowByPromptId(id, 1500)
    if (!row) return false

    const menuButton = this.findLibraryRowMenuButton(row)
    if (!menuButton) return false

    this.simulateClick(menuButton)

    const deleteItem = await this.waitForDeleteMenuItem(2500)
    if (!deleteItem) return false
    this.simulateClick(deleteItem)

    const confirmButton = await this.waitForDeleteConfirmButton(2500)
    if (!confirmButton) return false
    this.simulateClick(confirmButton)

    const removed = await this.waitForConversationRemoved(id, 5000)
    if (removed) {
      this.syncConversationListAfterDelete(id)
    }
    return removed
  }

  private async enterLibraryPageForDelete(): Promise<{
    enteredLibrary: boolean
    originalPath: string
  }> {
    const originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (window.location.pathname === "/library") {
      return { enteredLibrary: false, originalPath }
    }

    // 尝试 SPA 导航到 library（新版侧边栏已移除 view-all-history-link）
    const navigated = await this.navigateToLibraryViaSpa()
    if (!navigated || window.location.pathname !== "/library") {
      return { enteredLibrary: false, originalPath }
    }

    return { enteredLibrary: true, originalPath }
  }

  private async restoreFromLibraryPage(originalPath: string): Promise<void> {
    if (!originalPath || window.location.pathname !== "/library") return

    window.history.back()
    const start = Date.now()
    while (Date.now() - start < 3000) {
      if (window.location.pathname !== "/library") return
      await this.sleep(80)
    }
  }

  private async findLibraryRowByPromptId(id: string, timeout = 1200): Promise<HTMLElement | null> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const anchor = this.findConversationLinkById(this.config.conversation.itemSelector, id)
      if (anchor) {
        const row =
          this.findClosestElement(anchor, this.config.sitePrivateSelectors.libraryRow) || anchor
        if (row && this.isVisible(row)) return row
      }
      await this.sleep(80)
    }
    return null
  }

  private findClosestElement(element: Element, selectors: string[]): HTMLElement | null {
    for (const selector of selectors) {
      const candidate = element.closest(selector)
      if (candidate instanceof HTMLElement) return candidate
    }
    return null
  }

  private findLibraryRowMenuButton(row: HTMLElement): HTMLElement | null {
    const candidates = Array.from(
      row.querySelectorAll(this.config.sitePrivateSelectors.conversationMenuButton),
    ) as HTMLElement[]
    const visible = candidates.filter((item) => this.isVisible(item))
    if (visible.length > 0) {
      return visible.sort(
        (a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right,
      )[0]
    }

    const fallbackButtons = Array.from(row.querySelectorAll("button")) as HTMLElement[]
    const visibleFallback = fallbackButtons.filter((item) => this.isVisible(item))
    if (visibleFallback.length === 0) return null
    return visibleFallback.sort(
      (a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right,
    )[0]
  }

  private async waitForDeleteMenuItem(timeout = 2500): Promise<HTMLElement | null> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const menuItems = Array.from(
        document.querySelectorAll(this.config.sitePrivateSelectors.conversationMenuItem),
      ) as HTMLElement[]

      for (const item of menuItems) {
        if (!this.isVisible(item)) continue
        const text = this.getSignalText(item)
        if (!this.hasKeyword(text, AISTUDIO_DELETE_MENU_KEYWORDS)) continue
        if (this.hasKeyword(text, AISTUDIO_CANCEL_KEYWORDS)) continue
        return item
      }

      await this.sleep(80)
    }
    return null
  }

  private async waitForDeleteConfirmButton(timeout = 2500): Promise<HTMLElement | null> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const dialog = this.findVisibleDialog()
      const buttons = dialog
        ? (Array.from(dialog.querySelectorAll("button")) as HTMLElement[])
        : (Array.from(document.querySelectorAll("button")) as HTMLElement[])

      for (const button of buttons) {
        if (!this.isVisible(button)) continue
        const text = this.getSignalText(button)
        if (!this.hasKeyword(text, AISTUDIO_DELETE_MENU_KEYWORDS)) continue
        if (this.hasKeyword(text, AISTUDIO_CANCEL_KEYWORDS)) continue
        return button
      }
      await this.sleep(80)
    }
    return null
  }

  private findVisibleDialog(): HTMLElement | null {
    const dialogs = Array.from(
      document.querySelectorAll(this.config.sitePrivateSelectors.conversationDialog),
    ) as HTMLElement[]
    return dialogs.find((dialog) => this.isVisible(dialog)) || null
  }

  private async waitForConversationRemoved(id: string, timeout = 3500): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (!this.isConversationVisible(id)) return true
      await this.sleep(80)
    }
    return false
  }

  private getSignalText(element: HTMLElement): string {
    return [
      element.textContent || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.className || "",
    ]
      .join(" ")
      .toLowerCase()
  }

  private hasKeyword(text: string, keywords: string[]): boolean {
    const normalized = text.toLowerCase()
    return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  }

  private isVisible(element: Element | null): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false
    if (!element.isConnected) return false

    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  getUserQuerySelector(): string {
    return this.config.selectors.userQuery
  }

  getQuickQuoteSupportMode() {
    return this.config.quickQuote
  }

  supportsHostThemeSync(): boolean {
    return this.config.supportsHostThemeSync
  }

  findUserQueryElement(queryIndex: number, text: string): Element | null {
    const scrollbarEntry = this.getScrollbarQueryEntries()[queryIndex - 1]
    if (scrollbarEntry) {
      const target = this.findUserQueryElementByTurnId(scrollbarEntry.turnId)
      if (!target) return null

      const targetText = this.extractUserQueryText(target)
      return !text || this.isSameOutlineText(targetText, text) ? target : null
    }

    return super.findUserQueryElement(queryIndex, text)
  }

  // 用户文本缓存（解决虚拟滚动导致的文本丢失）
  private textCache = new Map<string, string>()
  // 字数缓存（解决虚拟滚动导致的字数统计丢失）
  private wordCountCache = new Map<string, number>()
  private lastSessionIdForCache: string | null = null

  extractUserQueryText(element: Element): string {
    if (this.isExportSnapshotElement(element)) {
      return element.textContent?.trim() || ""
    }

    // 检查对话变更并清理缓存
    const currentSessionId = this.getSessionId()
    if (this.lastSessionIdForCache !== currentSessionId) {
      this.textCache.clear()
      this.wordCountCache.clear()
      this.lastSessionIdForCache = currentSessionId
    }

    // 尝试提取 Turn ID (用于缓存键)
    // 结构: ms-chat-turn[id="..."] > .chat-turn-container
    const turnId = element.closest(this.config.sitePrivateSelectors.turn)?.id
    let extractedText = ""

    // AI Studio 用户消息结构：
    // .chat-turn-container.user
    //   > .actions-container > button (包含 editmore_vert 等按钮文本)
    //   > .user-prompt-container > .turn-content
    //     > .author-label (包含 "User" 标签)
    //     > ms-prompt-chunk.text-chunk (实际用户输入)
    //
    // 必须精确定位到 ms-prompt-chunk.text-chunk，避免抓取按钮和标签文本
    const contentChunk = this.findUserContentChunk(element)
    if (contentChunk) {
      // 即使找到 chunk，也可能是 ms-prompt-chunk 包了文字 + image-chunk 的混合 turn——
      // 直接 extractTextWithLineBreaks 会把 image-chunk 内的 "download" / "fullscreen"
      // 按钮文字一起算进来污染大纲。统一用 extractCleanTextFromChunk 剥装饰元素 +
      // 附件 chunk，只保留用户输入的真实文字。
      extractedText = this.extractCleanTextFromChunk(contentChunk)
    } else {
      // 没有 ms-text-chunk —— 通常是纯附件（图片/文件）turn 或挂载未完成。
      // 同样剥所有装饰 + 附件 chunk，避免按钮文字污染大纲（实测显示成
      // "downloadfullscreen"）。注意：**不**在这里输出 `[Image: alt]` 占位——
      // 用户要求大纲只显示文字内容，与 AI Studio 原生时间线保持一致；纯附件
      // turn 让后面的 sidebar fallback 接管文字摘要（或者干脆留空）。
      const turnContent = element.querySelector(this.config.sitePrivateSelectors.turnContent)
      if (turnContent) {
        const clone = turnContent.cloneNode(true) as Element
        clone
          .querySelectorAll(this.config.sitePrivateSelectors.userContentNoise)
          .forEach((node) => node.remove())
        extractedText = (clone.textContent || "").trim()
      } else {
        extractedText = this.extractTextWithLineBreaks(element)
      }
    }

    // --- Side-Channel Hydration (Using Scrollbar) ---
    // 如果 DOM 提取文本失败（懒加载/Shadow DOM/渲染延迟、或纯附件 turn），
    // 尝试从侧边栏获取 AI Studio 自己生成的摘要文本——保持大纲与原生时间线一致。
    if (!extractedText && turnId) {
      const scrollbarText = this.getTextFromScrollbar(turnId)
      if (scrollbarText) {
        extractedText = scrollbarText
      }
    }

    // 缓存逻辑
    if (extractedText) {
      // 如果成功提取到了文本，更新缓存
      if (turnId) {
        this.textCache.set(turnId, extractedText)
      }
      return extractedText
    } else {
      // 如果提取为空（可能是虚拟滚动），尝试从缓存恢复
      if (turnId && this.textCache.has(turnId)) {
        return this.textCache.get(turnId)!
      }
    }

    return ""
  }

  extractUserQueryMarkdown(element: Element): string {
    if (this.isExportSnapshotElement(element)) {
      return element.textContent?.trim() || ""
    }

    const contentChunk = this.findUserContentChunk(element)
    const source = (contentChunk || element).cloneNode(true) as HTMLElement
    source
      .querySelectorAll(this.config.sitePrivateSelectors.userContentNoise)
      .forEach((node) => node.remove())

    this.normalizeAssistantExportDom(source)

    const markdown = htmlToMarkdown(source).trim()
    if (markdown) {
      return markdown
    }

    return this.extractTextWithLineBreaks(source).trim()
  }

  extractUserQueryExportContent(element: Element): string {
    return this.extractUserQueryExportContentWithAttachments(element)
  }

  private extractUserQueryExportContentWithAttachments(
    element: Element,
    collector?: ExportAssetCollector,
  ): string {
    if (this.isExportSnapshotElement(element)) {
      return element.textContent?.trim() || ""
    }

    const attachments = this.extractAIStudioUserAttachments(element)
    const markdown = this.extractUserQueryMarkdown(element).trim()
    const body = markdown || (attachments.length === 0 ? this.extractUserQueryText(element) : "")

    if (attachments.length === 0) {
      return body
    }

    const imageMarkdown = this.formatAIStudioUserImageAttachments(attachments, collector)
    const fileMarkdown = this.formatAIStudioUserFileAttachments(attachments, collector)
    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, body].filter(Boolean).join("\n\n")
  }

  private extractAIStudioUserAttachments(element: Element): AIStudioUserAttachment[] {
    const attachments: AIStudioUserAttachment[] = []
    const seen = new Set<string>()

    this.extractAIStudioUserImageAttachments(element).forEach((attachment) => {
      const key = `image:${attachment.source || attachment.name}`
      if (seen.has(key)) return
      seen.add(key)
      attachments.push(attachment)
    })

    this.extractAIStudioUserFileAttachments(element).forEach((attachment) => {
      const key = `file:${attachment.source || attachment.name}:${attachment.details || ""}`
      if (seen.has(key)) return
      seen.add(key)
      attachments.push(attachment)
    })

    return attachments
  }

  private extractAIStudioUserImageAttachments(element: Element): AIStudioUserAttachment[] {
    const images = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.userImageAttachment),
    ).filter((node): node is HTMLImageElement => node instanceof HTMLImageElement)

    return images.flatMap((image) => {
      const source = this.extractAIStudioImageSource(image)
      if (!source) return []

      const name = (image.alt || image.getAttribute("title") || "uploaded image")
        .replace(/\s+/g, " ")
        .trim()

      return [
        {
          kind: "image" as const,
          name: name || "uploaded image",
          source,
          mimeHint: name,
        },
      ]
    })
  }

  private extractAIStudioImageSource(image: HTMLImageElement): string {
    const candidates = [image.currentSrc || "", image.src || "", image.getAttribute("src") || ""]

    for (const candidate of candidates) {
      const source = normalizeExportAssetUrl(candidate)
      if (!source) continue
      if (source.startsWith("data:image/svg+xml")) continue
      if (isDownloadableExportAssetUrl(source)) return source
    }

    return ""
  }

  private extractAIStudioUserFileAttachments(element: Element): AIStudioUserAttachment[] {
    const files = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.userFileAttachment),
    )

    return files.flatMap((file) => {
      const name = this.extractAIStudioFileName(file)
      if (!name) return []

      return [
        {
          kind: "file" as const,
          name,
          source: this.extractAIStudioFileSource(file),
          details: this.extractAIStudioFileDetails(file),
          mimeHint: name,
        },
      ]
    })
  }

  private extractAIStudioFileName(file: Element): string {
    const privateSelectors = this.config.sitePrivateSelectors
    const nameElement = file.querySelector(privateSelectors.userFileName)
    const title = nameElement?.getAttribute("title")?.trim()
    if (title) return title

    const visibleName = nameElement?.textContent?.trim()
    if (visibleName) return visibleName

    const ariaLabel =
      file.getAttribute("aria-label") ||
      file.querySelector(privateSelectors.userFileAriaLabel)?.getAttribute("aria-label")
    return ariaLabel?.split(",")[0]?.trim() || ""
  }

  private extractAIStudioFileDetails(file: Element): string {
    const details = Array.from(
      file.querySelectorAll(this.config.sitePrivateSelectors.userFileDetails),
    )
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() || "")
      .find(Boolean)

    return details || ""
  }

  private extractAIStudioFileSource(file: Element): string {
    const links = Array.from(
      file.querySelectorAll(this.config.sitePrivateSelectors.userFileLink),
    ).filter((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement)

    for (const link of links) {
      const source = normalizeExportAssetUrl(link.href || link.getAttribute("href") || "")
      if (isDownloadableExportAssetUrl(source)) return source
    }

    return ""
  }

  private formatAIStudioUserImageAttachments(
    attachments: AIStudioUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportImageAttachments(attachments, collector, {
      siteId: this.getSiteId(),
      getExtensionHint: (attachment) => attachment.mimeHint || attachment.name,
    })
  }

  private formatAIStudioUserFileAttachments(
    attachments: AIStudioUserAttachment[],
    collector?: ExportAssetCollector,
  ): string[] {
    return formatExportFileAttachments(attachments, collector, {
      siteId: this.getSiteId(),
      getLabel: (attachment) => this.formatAIStudioFileLabel(attachment),
      getMimeHint: (attachment) => attachment.mimeHint || attachment.name,
    })
  }

  private formatAIStudioFileLabel(attachment: AIStudioUserAttachment): string {
    return attachment.details ? `${attachment.name} (${attachment.details})` : attachment.name
  }

  private createAIStudioUserQueryOutlineItem(
    text: string,
    element: Element | null,
    turnId?: string,
    wordCount?: number,
  ): OutlineItem {
    let queryText = this.normalizeScrollbarQueryText(text)
    let isTruncated = false
    if (queryText.length > 200) {
      queryText = queryText.substring(0, 200)
      isTruncated = true
    }

    const normalizedTurnId = turnId ? this.normalizeTurnId(turnId) : ""
    const item: OutlineItem = {
      level: 0,
      text: queryText,
      element,
      isUserQuery: true,
      isTruncated,
    }

    if (normalizedTurnId) {
      item.id = `aistudio-user:${normalizedTurnId}`
    }

    if (wordCount !== undefined) {
      item.wordCount = wordCount
    }

    const context = element ? this.getNextTurnContextForUserQuery(element) : undefined
    if (context) {
      item.context = context
    }

    return item
  }

  private getNextTurnContextForUserQuery(element: Element): string | undefined {
    const turnSelector = this.config.sitePrivateSelectors.turn
    const currentTurn = element.closest(turnSelector)
    const nextTurn = currentTurn?.nextElementSibling
    if (!nextTurn || !nextTurn.matches(turnSelector)) {
      return undefined
    }

    const responseText = this.extractTextWithLineBreaks(nextTurn).trim().substring(0, 50)
    return responseText || undefined
  }

  private findPreviousUserTurnIdForElement(element: Element): string | null {
    const privateSelectors = this.config.sitePrivateSelectors
    const currentTurn = element.closest(privateSelectors.turn)
    if (!currentTurn) return null

    const sameTurnUserQuery = currentTurn.querySelector(this.config.selectors.userQuery)
    if (sameTurnUserQuery && !sameTurnUserQuery.contains(element)) {
      return this.normalizeTurnId(currentTurn.id)
    }

    let previousTurn = currentTurn.previousElementSibling
    while (previousTurn) {
      const previousUserQuery = previousTurn.querySelector(this.config.selectors.userQuery)
      if (previousUserQuery) {
        return this.normalizeTurnId(previousTurn.id)
      }
      previousTurn = previousTurn.previousElementSibling
    }

    return null
  }

  private findUserContentChunk(element: Element): Element | null {
    for (const selector of this.config.sitePrivateSelectors.userContentChunk) {
      const candidate = element.querySelector(selector)
      if (!candidate) continue

      // 判定 chunk 是否"真有文字内容"前必须排除装饰元素——纯图片附件的
      // `<ms-prompt-chunk>` 里包着 `<ms-image-chunk>` + 一堆 download/fullscreen
      // 按钮，原本 textContent 非空就会被误判为"有文字"，结果按钮文字被当成
      // 用户提问写进大纲（实测大纲显示成 "downloadfullscreen"）。
      const text = this.extractCleanTextFromChunk(candidate)
      if (text) {
        return candidate
      }
    }

    return null
  }

  /**
   * 提取 chunk 内的"干净"文字——剥掉装饰元素（按钮 / svg / aria-hidden）和
   * 附件元素（ms-image-chunk / ms-file-chunk）后的纯用户输入文字。
   */
  private extractCleanTextFromChunk(chunk: Element): string {
    const clone = chunk.cloneNode(true) as Element
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.userContentNoise)
      .forEach((n) => n.remove())
    return this.extractTextWithLineBreaks(clone).trim()
  }

  getExportConfig(): ExportConfig | null {
    if (this.exportSnapshotActive) {
      return {
        userQuerySelector: AISTUDIO_EXPORT_USER_SELECTOR,
        assistantResponseSelector: AISTUDIO_EXPORT_ASSISTANT_SELECTOR,
        turnSelector: AISTUDIO_EXPORT_TURN_SELECTOR,
        useShadowDOM: false,
      }
    }

    return {
      ...this.config.export,
    }
  }

  getAssistantMermaidSupportMode() {
    return this.config.mermaidSupport
  }

  async prepareConversationExport(context: ExportLifecycleContext): Promise<unknown> {
    this.exportIncludeThoughtsOverride = context.includeThoughts
    this.exportBundleCache = null
    this.exportCollectionReport = null
    this.clearExportSnapshot()
    const collector =
      context.format === "markdown" && context.packaging === "zip"
        ? createExportAssetCollector()
        : undefined

    // 优先走 ResolveDriveResource 接口：全量 markdown + 思考链 + 附件真实链接，
    // 主动发起、无需滚动收集；失败回退 DOM/滚动收集
    const apiMessages = await this.collectApiExportMessageSnapshots(context, collector)
    if (apiMessages && apiMessages.length > 0) {
      this.exportCollectionReport = {
        expectedCount: apiMessages.length,
        collectedCount: apiMessages.length,
        missingAnchors: [],
        hasTruncated: false,
      }
      if (collector) {
        this.exportBundleCache = {
          messages: apiMessages.map(({ role, content }) => ({ role, content })),
          assets: collector.assets,
        }
      }
      this.mountExportSnapshot(apiMessages)
      return { count: apiMessages.length }
    }

    const scrollContainer =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    const exportRoot =
      document.querySelector(this.getResponseContainerSelector()) ||
      document.querySelector("main") ||
      document.body

    const messages =
      scrollContainer instanceof HTMLElement
        ? await this.collectExportMessageSnapshots(scrollContainer, collector)
        : this.readVisibleExportMessageSnapshots(exportRoot, collector)

    if (messages.length === 0) {
      return null
    }

    if (collector) {
      this.exportBundleCache = {
        messages: messages.map(({ role, content }) => ({ role, content })),
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

  getExportCollectionReport(): ExportCollectionReport | null {
    return this.exportCollectionReport
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const outline: OutlineItem[] = []
    const privateSelectors = this.config.sitePrivateSelectors

    // 接口回填数据源：异步拉取 ResolveDriveResource，补齐 DOM 缺失的回答标题
    // （数据就绪后通过 EVENT_OUTLINE_DATA_UPDATED 触发刷新）
    this.maybeRefreshApiOutline()

    // AI Studio 整个 main 区域都可能是滚动容器，或者 .chat-container
    const container =
      document.querySelector(privateSelectors.outlineContainer) || document.querySelector("main")
    if (!container) return outline

    // 辅助函数：提取 ms-chat-turn 的 ID
    // 格式: turn-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
    // 返回 UUID 部分
    const getTurnId = (el: Element): string | null => {
      const turn = el.closest(privateSelectors.turn)
      if (turn && turn.id) {
        // 移除 "turn-" 前缀
        return turn.id.replace(/^turn-/, "")
      }
      return null
    }

    // 辅助函数：生成标题的稳定 ID
    const turnHeaderCounts: Record<string, Record<string, number>> = {}
    const generateHeaderId = (turnId: string, tagName: string, text: string): string => {
      if (!turnHeaderCounts[turnId]) {
        turnHeaderCounts[turnId] = {}
      }

      const key = `${tagName}-${text}`
      const count = turnHeaderCounts[turnId][key] || 0
      turnHeaderCounts[turnId][key] = count + 1

      return `${turnId}::${key}::${count}`
    }

    // 计算用户提问的字数（统计后续 AI 回复）
    // 使用缓存以应对虚拟滚动导致的 DOM 内容丢失
    const userQuerySelector = this.getUserQuerySelector()
    const calculateUserQueryWordCount = (startEl: Element): number => {
      // AI Studio 结构：每个对话轮次在 ms-chat-turn 中
      // 用户消息和 AI 回复各自在不同的 ms-chat-turn 中
      const currentTurn = startEl.closest(privateSelectors.turn)
      if (!currentTurn) return 0

      // 使用 turn ID 作为缓存键
      const turnId = currentTurn.id

      let current = currentTurn.nextElementSibling
      let totalLength = 0
      let foundContent = false

      while (current) {
        // 检查是否是下一个用户消息的容器
        const userQueryInThis = current.querySelector(userQuerySelector)
        if (userQueryInThis) {
          break // 遇到下一个用户提问的容器，结束
        }

        // 查找 AI 回复内容：在 .model 容器中查找 ms-cmark-node（排除思维链）
        const modelContainer = current.querySelector(privateSelectors.outlineAssistantContainer)
        if (modelContainer) {
          // AI Studio 使用 ms-cmark-node 渲染 Markdown
          // 需要排除 ms-thought-chunk 内的思维链内容
          const allMarkdownNodes = modelContainer.querySelectorAll(privateSelectors.markdownNode)
          for (const node of Array.from(allMarkdownNodes)) {
            // 跳过思维链内的内容
            if (node.closest(privateSelectors.thoughtChunk)) continue

            const textLength = node.textContent?.trim().length || 0
            if (textLength > 0) {
              foundContent = true
              totalLength += textLength
            }
          }
        }

        current = current.nextElementSibling
      }

      // 如果找到内容，更新缓存
      if (foundContent && turnId) {
        this.wordCountCache.set(turnId, totalLength)
      }

      // 如果没找到内容（可能被虚拟化），尝试使用缓存
      if (totalLength === 0 && turnId && this.wordCountCache.has(turnId)) {
        return this.wordCountCache.get(turnId)!
      }

      return totalLength
    }

    if (!includeUserQueries) {
      const headingSelectors: string[] = []
      for (let i = 1; i <= maxLevel; i++) {
        headingSelectors.push(`h${i}`)
      }

      const headings = Array.from(container.querySelectorAll(headingSelectors.join(", ")))
      headings.forEach((heading, index) => {
        // AI Studio 可能把 input 内的 h1 也选出来，需要过滤
        if (heading.closest("textarea") || heading.closest(privateSelectors.userPromptContainer))
          return
        if (this.isInRenderedMarkdownContainer(heading)) return

        const level = parseInt(heading.tagName.charAt(1), 10)
        if (level <= maxLevel) {
          const item: OutlineItem = {
            level,
            text: heading.textContent?.trim() || "",
            element: heading,
          }

          // 稳定 ID 生成
          const turnId = getTurnId(heading)
          if (turnId) {
            const tagName = heading.tagName.toLowerCase()
            item.id = generateHeaderId(turnId, tagName, item.text)
          }

          // 字数统计
          if (showWordCount) {
            let nextBoundaryEl: Element | null = null
            for (let i = index + 1; i < headings.length; i++) {
              const candidate = headings[i]
              const candidateLevel = parseInt(candidate.tagName.charAt(1), 10)
              if (candidateLevel <= level) {
                nextBoundaryEl = candidate
                break
              }
            }
            // 查找所属的 ms-chat-turn
            const turnContainer = heading.closest(privateSelectors.turn)
            item.wordCount = this.calculateRangeWordCount(
              heading,
              nextBoundaryEl,
              turnContainer || container,
            )
          }

          outline.push(item)
        }
      })
      return outline
    }

    // 包含用户提问的模式。AI Studio 会虚拟滚动聊天 DOM，时间线滚动条更适合作为完整用户问题来源。
    const headingSelectors: string[] = []
    for (let headingLevel = 1; headingLevel <= maxLevel; headingLevel++) {
      headingSelectors.push(`h${headingLevel}`)
    }

    const scrollbarEntries = this.getScrollbarQueryEntries()
    if (scrollbarEntries.length > 0) {
      const scrollbarOrderByTurnId = new Map<string, number>()
      const sortedEntries: AIStudioOutlineSortEntry[] = []

      const getElementRenderOrder = (element: Element): number => {
        const target = (element.closest(privateSelectors.turn) || element) as HTMLElement
        const targetRect = target.getBoundingClientRect()
        if (container instanceof HTMLElement) {
          const containerRect = container.getBoundingClientRect()
          return container.scrollTop + (targetRect.top - containerRect.top)
        }
        return window.scrollY + targetRect.top
      }

      const visibleUserAnchors = scrollbarEntries
        .filter((entry): entry is AIStudioScrollbarQueryEntry & { element: Element } =>
          Boolean(entry.element),
        )
        .map((entry) => ({
          index: entry.index,
          renderOrder: getElementRenderOrder(entry.element),
        }))
        .sort((left, right) => left.renderOrder - right.renderOrder)

      const activeScrollbarEntry = scrollbarEntries.find((entry) =>
        entry.button.matches(privateSelectors.activeScrollbarButton),
      )

      const estimateUserOrderForHeading = (heading: Element): number => {
        const headingOrder = getElementRenderOrder(heading)
        let previousAnchor: { index: number; renderOrder: number } | undefined
        let nextAnchor: { index: number; renderOrder: number } | undefined

        for (const anchor of visibleUserAnchors) {
          if (anchor.renderOrder <= headingOrder) {
            previousAnchor = anchor
          } else {
            nextAnchor = anchor
            break
          }
        }

        if (previousAnchor) return previousAnchor.index
        if (nextAnchor) return Math.max(0, nextAnchor.index - 1)
        return activeScrollbarEntry?.index ?? 0
      }

      scrollbarEntries.forEach((entry) => {
        scrollbarOrderByTurnId.set(entry.turnId, entry.index)
        const visibleText = entry.element ? this.extractUserQueryText(entry.element) : ""
        const item = this.createAIStudioUserQueryOutlineItem(
          visibleText || entry.text,
          entry.element,
          entry.turnId,
          showWordCount && entry.element ? calculateUserQueryWordCount(entry.element) : undefined,
        )

        sortedEntries.push({
          item,
          order: entry.index * 100000,
        })
      })

      const headingElements = Array.from(container.querySelectorAll(headingSelectors.join(", ")))
      headingElements.forEach((heading, headingIndex) => {
        if (heading.closest(privateSelectors.userPromptContainer) || heading.closest("textarea"))
          return
        if (this.isInRenderedMarkdownContainer(heading)) return

        const tagName = heading.tagName.toLowerCase()
        const level = parseInt(tagName.charAt(1), 10)
        if (level > maxLevel) return

        const item: OutlineItem = {
          level,
          text: heading.textContent?.trim() || "",
          element: heading,
        }

        const turnId = getTurnId(heading)
        if (turnId) {
          item.id = generateHeaderId(turnId, tagName, item.text)
        }

        if (showWordCount) {
          let nextBoundaryEl: Element | null = null
          for (
            let nextHeadingIndex = headingIndex + 1;
            nextHeadingIndex < headingElements.length;
            nextHeadingIndex++
          ) {
            const candidate = headingElements[nextHeadingIndex]
            const candidateLevel = parseInt(candidate.tagName.charAt(1), 10)
            if (candidateLevel <= item.level) {
              nextBoundaryEl = candidate
              break
            }
          }

          const turnContainer = heading.closest(privateSelectors.turn)
          item.wordCount = this.calculateRangeWordCount(
            heading,
            nextBoundaryEl,
            turnContainer || container,
          )
        }

        const previousUserTurnId = this.findPreviousUserTurnIdForElement(heading)
        const previousUserOrder = previousUserTurnId
          ? scrollbarOrderByTurnId.get(previousUserTurnId)
          : undefined
        const orderBase =
          previousUserOrder !== undefined ? previousUserOrder : estimateUserOrderForHeading(heading)

        sortedEntries.push({
          item,
          order: orderBase * 100000 + 50000 + headingIndex,
        })
      })

      // 接口回填：为未挂载（无 DOM 标题）的提问轮补回答标题
      const apiData = this.apiOutlineData
      if (apiData && apiData.sessionId === this.getSessionId()) {
        // 已挂载轮次按 DOM 标题条目实际占用的序号带去重（含归属失败后的估算落位；
        // 用户提问条目在同一带内的偏移小于 50000，需排除），接口回填跳过这些轮次
        const domHeadingOrderBases = new Set(
          sortedEntries
            .filter((entry) => entry.order % 100000 >= 50000)
            .map((entry) => Math.floor(entry.order / 100000)),
        )
        const apiQueryByTurnId = this.mapScrollbarEntriesToApiQueries(scrollbarEntries, apiData)
        scrollbarEntries.forEach((entry) => {
          if (domHeadingOrderBases.has(entry.index)) return
          const queryIndex = apiQueryByTurnId.get(entry.turnId)
          if (queryIndex === undefined) return
          const apiHeadings = apiData.headingsByQueryIndex.get(queryIndex)
          if (!apiHeadings) return
          apiHeadings.forEach((apiHeading, headingOrder) => {
            // 与 DOM 条目同一截断规则：文本截 200，isTruncated 阈值 80
            sortedEntries.push({
              item: {
                level: apiHeading.level,
                text:
                  apiHeading.text.length > 200 ? apiHeading.text.slice(0, 200) : apiHeading.text,
                element: null,
                isTruncated: apiHeading.text.length > 80,
                id: `aistudio-api:q${queryIndex}:h${headingOrder}`,
                ...(showWordCount ? { wordCount: apiHeading.wordCount } : {}),
              },
              order: entry.index * 100000 + 50000 + headingOrder,
            })
          })
        })
      }

      return sortedEntries.sort((left, right) => left.order - right.order).map(({ item }) => item)
    }

    const combinedSelector = `${userQuerySelector}, ${headingSelectors.join(", ")}`
    const allElements = Array.from(container.querySelectorAll(combinedSelector))

    allElements.forEach((element, index) => {
      const tagName = element.tagName.toLowerCase()
      // 注意：.chat-turn-container.user 是个 div
      // 所以我们通过 class 来判断是否是 User Query
      const isUserQuery = element.matches(userQuerySelector)

      if (isUserQuery) {
        const currentTurn = element.closest(privateSelectors.turn)
        const item = this.createAIStudioUserQueryOutlineItem(
          this.extractUserQueryText(element),
          element,
          currentTurn?.id,
          showWordCount ? calculateUserQueryWordCount(element) : undefined,
        )

        outline.push(item)
      } else if (/^h[1-6]$/.test(tagName)) {
        // 过滤：避免提取到用户提问里的标题（虽然上面已经针对 .user 容器做了处理，但双重保险）
        if (element.closest(privateSelectors.userPromptContainer) || element.closest("textarea"))
          return
        if (this.isInRenderedMarkdownContainer(element)) return

        const level = parseInt(tagName.charAt(1), 10)
        if (level <= maxLevel) {
          const item: OutlineItem = {
            level,
            text: element.textContent?.trim() || "",
            element,
          }

          if (showWordCount) {
            let nextBoundaryEl: Element | null = null
            for (let i = index + 1; i < allElements.length; i++) {
              const candidate = allElements[i]
              const candidateTagName = candidate.tagName.toLowerCase()

              // 遇到用户提问时停止
              if (candidate.matches(userQuerySelector)) {
                nextBoundaryEl = candidate
                break
              }

              if (/^h[1-6]$/.test(candidateTagName)) {
                const candidateLevel = parseInt(candidateTagName.charAt(1), 10)
                if (candidateLevel <= item.level) {
                  nextBoundaryEl = candidate
                  break
                }
              }
            }

            const turnContainer = element.closest(privateSelectors.turn)
            item.wordCount = this.calculateRangeWordCount(
              element,
              nextBoundaryEl,
              turnContainer || container,
            )
          }

          outline.push(item)
        }
      }
    })

    return outline
  }

  async resolveOutlineTarget(
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery"> & { id?: string },
    queryIndex?: number,
  ): Promise<Element | null> {
    if (item.isUserQuery && item.level === 0) {
      const scrollbarTurnId = this.resolveScrollbarTurnIdForOutlineItem(item, queryIndex)
      if (scrollbarTurnId) {
        const directTarget = this.findUserQueryElementByTurnId(scrollbarTurnId)
        if (directTarget) {
          return directTarget
        }

        const revealed = this.revealUserQueryThroughScrollbar(scrollbarTurnId)
        if (revealed) {
          const resolvedTarget = await this.waitForUserQueryElementByTurnId(
            scrollbarTurnId,
            item.text,
          )
          if (resolvedTarget) {
            return resolvedTarget
          }
        }
      }
    }

    // API 回填标题（无 DOM 元素）：先经时间线滚动条把所属轮次挂载出来，
    // 再等回答内容渲染后按文本定位标题；找不到标题时落到该轮提问
    const apiHeadingTarget = await this.resolveApiOutlineHeadingTarget(item)
    if (apiHeadingTarget) {
      return apiHeadingTarget
    }

    const directTarget = await super.resolveOutlineTarget(item, queryIndex)
    if (directTarget) {
      return directTarget
    }

    return null
  }

  private parseApiOutlineItemId(id?: string): { queryIndex: number; order: number } | null {
    const match = id?.match(/^aistudio-api:q(\d+):h(\d+)$/)
    if (!match) return null
    return { queryIndex: Number(match[1]), order: Number(match[2]) }
  }

  private async resolveApiOutlineHeadingTarget(
    item: Pick<OutlineItem, "text"> & { id?: string },
  ): Promise<Element | null> {
    const ref = this.parseApiOutlineItemId(item.id)
    const data = this.apiOutlineData
    if (!ref || !data || data.sessionId !== this.getSessionId()) return null

    const heading = data.headingsByQueryIndex.get(ref.queryIndex)?.[ref.order]
    if (!heading) return null

    const entries = this.getScrollbarQueryEntries()
    const apiQueryByTurnId = this.mapScrollbarEntriesToApiQueries(entries, data)
    const entry = entries.find(
      (candidate) => apiQueryByTurnId.get(candidate.turnId) === ref.queryIndex,
    )
    if (!entry) return null

    if (!this.findUserQueryElementByTurnId(entry.turnId)) {
      this.revealUserQueryThroughScrollbar(entry.turnId)
    }
    const userElement = await this.waitForUserQueryElementByTurnId(entry.turnId, entry.text)
    if (!userElement) return null

    return (await this.waitForApiHeadingMounted(userElement, heading.text)) || userElement
  }

  /**
   * 揭示提问后目标回答可能仍是无内容空壳（内容按需渲染），把提问之后的
   * 回答 turn 依次滚入视口触发渲染后重试文本定位；超时返回 null，
   * 由调用方落到提问位置（对齐 DeepSeek 的揭示后轮询挂载逻辑）。
   */
  private async waitForApiHeadingMounted(
    userElement: Element,
    headingText: string,
  ): Promise<Element | null> {
    const immediate = this.findMountedHeadingAfterUserQuery(userElement, headingText)
    if (immediate) return immediate

    const privateSelectors = this.config.sitePrivateSelectors
    const userTurn = userElement.closest(privateSelectors.turn)
    if (!userTurn) return null

    const deadline = Date.now() + AISTUDIO_API_HEADING_MOUNT_TIMEOUT_MS
    let sibling = userTurn.nextElementSibling
    while (sibling && Date.now() < deadline) {
      // 到下一个提问轮为止
      if (sibling.querySelector(this.config.selectors.userQuery)) break
      if (sibling instanceof HTMLElement && !this.turnHasMountedContent(sibling)) {
        await this.waitForTurnContentMounted(sibling, deadline - Date.now())
      }
      const found = this.findMountedHeadingAfterUserQuery(userElement, headingText)
      if (found) return found
      sibling = sibling.nextElementSibling
    }
    return null
  }

  /** 在提问所属轮次之后（下一个提问之前）的已挂载区域内按文本找标题 */
  private findMountedHeadingAfterUserQuery(
    userElement: Element,
    headingText: string,
  ): Element | null {
    const privateSelectors = this.config.sitePrivateSelectors
    const turn = userElement.closest(privateSelectors.turn)
    if (!turn) return null

    const normalizedTarget = this.normalizeScrollbarQueryText(headingText)
    let current = turn.nextElementSibling
    while (current) {
      if (current.querySelector(this.config.selectors.userQuery)) break
      const headings = current.matches("h1, h2, h3, h4, h5, h6")
        ? [current]
        : Array.from(current.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      for (const candidate of headings) {
        if (
          candidate.closest(privateSelectors.userPromptContainer) ||
          candidate.closest("textarea")
        )
          continue
        if (this.isInRenderedMarkdownContainer(candidate)) continue
        const candidateText = this.normalizeScrollbarQueryText(candidate.textContent?.trim() || "")
        if (
          candidateText &&
          (candidateText === normalizedTarget ||
            candidateText.startsWith(normalizedTarget) ||
            normalizedTarget.startsWith(candidateText))
        ) {
          return candidate
        }
      }
      current = current.nextElementSibling
    }
    return null
  }

  // ==================== 虚拟滚动会话（阅读历史锚点） ====================

  /**
   * 当前会话是否为虚拟滚动渲染：时间线滚动条列出全部提问，
   * 存在未挂载的提问条目即说明会话被虚拟化。
   * 内容级虚拟化下 turn 空壳仍在 DOM（命中 .chat-turn-container.user），
   * 因此挂载判定以 turn 内是否渲染出真实内容为准。
   */
  override isVirtualScrollConversation(): boolean {
    const entries = this.getScrollbarQueryEntries()
    if (entries.length < 2) return false
    if (entries.some((entry) => !entry.element)) return true
    const turnSelector = this.config.sitePrivateSelectors.turn
    const contentSelector = this.config.sitePrivateSelectors.mountedContent
    return entries.some((entry) => {
      const turn = entry.element?.closest(turnSelector)
      return !turn || !turn.querySelector(contentSelector)
    })
  }

  override getVirtualAnchorElement(): AnchorData | null {
    if (!this.isVirtualScrollConversation()) return null
    const container = this.getScrollContainer()
    if (!container) return null

    const mountedEntries = this.getScrollbarQueryEntries().filter(
      (entry): entry is AIStudioScrollbarQueryEntry & { element: Element } =>
        Boolean(entry.element),
    )
    if (mountedEntries.length === 0) return null

    const containerRect = container.getBoundingClientRect()
    const viewportLine = containerRect.top + 100
    let best: (AIStudioScrollbarQueryEntry & { element: Element }) | null = null
    let bestTop = -Infinity
    for (const entry of mountedEntries) {
      const turn = entry.element.closest(this.config.sitePrivateSelectors.turn)
      if (!turn) continue
      const top = turn.getBoundingClientRect().top
      if (top <= viewportLine && top > bestTop) {
        best = entry
        bestTop = top
      }
    }
    if (!best) best = mountedEntries[0]

    const bestTurn = best.element.closest(this.config.sitePrivateSelectors.turn)
    if (!bestTurn) return null
    const rowTop = bestTurn.getBoundingClientRect().top - containerRect.top + container.scrollTop
    return {
      type: "virtual-row",
      rowKey: best.index,
      offset: container.scrollTop - rowTop,
      textSignature: best.text.substring(0, 50),
    }
  }

  /**
   * 按滚动条序号把目标提问挂载出来并对齐保存时的行内偏移。
   * 滚动条按钮点击由站点自己完成虚拟列表跳转，无需探测滚动。
   * 站点打开会话后会持续自动滚到底部，且离屏轮次是固定高度占位空壳
   * （坐标随渲染漂移），因此先等开场滚动安静再动手，对齐 DeepSeek 的
   * 恢复闭环。
   */
  override async restoreVirtualAnchor(anchor: AnchorData, signal?: AbortSignal): Promise<boolean> {
    if (anchor.type !== "virtual-row" || typeof anchor.rowKey !== "number") return false

    // 冷加载时滚动条出现晚于会话 id 就绪，有界等待；期间用户交互经 signal 中止
    const deadline = Date.now() + 10000
    let entries = this.getScrollbarQueryEntries()
    while (entries.length === 0) {
      if (signal?.aborted) return false
      if (Date.now() >= deadline) {
        console.warn("[Ophel] Reading history restore skipped: AI Studio scrollbar not ready")
        return false
      }
      await this.sleep(100)
      entries = this.getScrollbarQueryEntries()
    }

    const entry = entries[anchor.rowKey]
    if (!entry) {
      console.warn(
        "[Ophel] Reading history restore skipped: AI Studio query not found",
        anchor.rowKey,
      )
      return false
    }
    if (anchor.textSignature && !this.isSameOutlineText(entry.text, anchor.textSignature)) {
      console.warn("[Ophel] Reading history restore skipped: AI Studio query text changed")
      return false
    }

    // 等站点开场滚动（自动去底部、渲染引发的调整）安静下来，
    // 否则恢复期间会被站点反复拽走，永远无法落定
    const quiet = await waitForVirtualScrollQuiet(() => this.getScrollContainer(), signal)
    if (signal?.aborted) return false
    if (!quiet) {
      console.warn("[Ophel] Reading history restore skipped: AI Studio page kept scrolling")
      return false
    }

    this.revealUserQueryThroughScrollbar(entry.turnId)
    const element = await this.waitForUserQueryElementByTurnId(entry.turnId, entry.text)
    if (signal?.aborted) return false
    if (!element) return false

    const offset = anchor.offset || 0
    const turnSelector = this.config.sitePrivateSelectors.turn
    const findTurn = () =>
      this.findUserQueryElementByTurnId(entry.turnId)?.closest(turnSelector) ?? null

    // 落定判定用「turn 相对容器顶部的视觉位置」而不是 scrollTop 像素：
    // 页面仍在渲染，文档高度在漂，像素值几秒内稳定不下来；
    // 视觉位置才是保存 offset 的本义
    const isAligned = (c: HTMLElement) => {
      const target = findTurn()
      if (!target) return false
      const visualOffset = target.getBoundingClientRect().top - c.getBoundingClientRect().top
      return Math.abs(visualOffset + offset) <= 24
    }
    const settled = await settleVirtualScroll(
      () => this.getScrollContainer(),
      isAligned,
      (c) => {
        const target = findTurn()
        if (!target) return
        const turnTop =
          target.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop
        alignScrollTop(c, turnTop + offset)
      },
      signal,
      { timeoutMs: 4000 },
    )
    if (settled || signal?.aborted) return settled

    // 收敛失败但 turn 仍在目标附近（渲染抖动导致始终差几像素）则接受现状；
    // turn 已不在 DOM（被站点拽走）才算失败
    const finalContainer = this.getScrollContainer()
    const finalTurn = finalContainer ? findTurn() : null
    if (finalContainer && finalTurn) {
      const visualOffset =
        finalTurn.getBoundingClientRect().top - finalContainer.getBoundingClientRect().top
      if (Math.abs(visualOffset + offset) <= 240) {
        console.warn("[Ophel] Reading history restore accepted with loose alignment")
        return true
      }
    }
    console.warn("[Ophel] Reading history restore failed: AI Studio turn did not settle")
    return false
  }

  /**
   * 滚动到顶/底后等虚拟列表把边缘轮次挂出来。边缘以时间线滚动条的首/末条目
   * 是否挂载为准（滚动条始终列出全部提问）；非虚拟会话滚动即到位，不空等。
   */
  override async waitForVirtualListEdge(
    edge: "start" | "end",
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (!this.isVirtualScrollConversation()) return true
    return settleVirtualScroll(
      () => this.getScrollContainer(),
      () => {
        const entries = this.getScrollbarQueryEntries()
        if (entries.length === 0) return false
        const edgeEntry = edge === "start" ? entries[0] : entries[entries.length - 1]
        return Boolean(edgeEntry.element?.isConnected)
      },
      (container) => alignScrollTop(container, edge === "start" ? 0 : container.scrollHeight),
      signal,
    )
  }

  /**
   * 高亮估算快照：已挂载提问轮的内容坐标 + 完整轮数边界。
   * 序号空间为时间线滚动条条目序号（与 getVirtualOutlineRowIndex 同一坐标系）。
   */
  override getVirtualOutlinePositionSnapshot(): VirtualOutlinePositionSnapshot | null {
    if (!this.isVirtualScrollConversation()) return null
    const container = this.getScrollContainer()
    if (!container) return null
    const entries = this.getScrollbarQueryEntries()
    if (entries.length === 0) return null

    const containerRect = container.getBoundingClientRect()
    const anchors: VirtualPositionAnchor[] = []
    for (const entry of entries) {
      if (!entry.element?.isConnected) continue
      const turn = (entry.element.closest(this.config.sitePrivateSelectors.turn) ||
        entry.element) as HTMLElement
      const rect = turn.getBoundingClientRect()
      const top = rect.top - containerRect.top + container.scrollTop
      anchors.push({ index: entry.index, top })
      anchors.push({ index: entry.index + 1, top: top + rect.height })
    }
    if (anchors.length === 0) return null

    return {
      anchors,
      bounds: {
        endSlot: entries.length,
        endTop: Math.max(0, container.scrollHeight - container.clientHeight),
      },
    }
  }

  /**
   * 大纲条目归属的滚动条序号：接口回填条目按 id 解析提问序号再映射回滚动条；
   * 用户提问条目按 id 里的 turnId；DOM 标题条目取所属轮次的提问。
   */
  override getVirtualOutlineRowIndex(item: OutlineItem): number | null {
    const entries = this.getScrollbarQueryEntries()
    if (entries.length === 0) return null
    const indexByTurnId = new Map(entries.map((entry) => [entry.turnId, entry.index]))

    const ref = item.navigationId || item.id
    const apiRef = this.parseApiOutlineItemId(ref)
    if (apiRef) {
      const data = this.apiOutlineData
      if (!data || data.sessionId !== this.getSessionId()) return null
      const apiQueryByTurnId = this.mapScrollbarEntriesToApiQueries(entries, data)
      const entry = entries.find(
        (candidate) => apiQueryByTurnId.get(candidate.turnId) === apiRef.queryIndex,
      )
      return entry?.index ?? null
    }

    const userTurnId = ref?.match(/^aistudio-user:(.+)$/)?.[1]
    if (userTurnId) return indexByTurnId.get(userTurnId) ?? null

    if (!item.element) return null
    const previousTurnId = this.findPreviousUserTurnIdForElement(item.element)
    if (!previousTurnId) return null
    return indexByTurnId.get(previousTurnId) ?? null
  }

  // ==================== 生成状态检测 ====================

  isGenerating(): boolean {
    const privateSelectors = this.config.sitePrivateSelectors
    // AI Studio 生成状态检测（多语言兼容，不依赖按钮文字）
    // 逻辑：当 ms-run-button 组件存在时，表示 AI 没有在生成
    //      当组件不存在（被替换为停止按钮）时，表示正在生成
    const runButton = document.querySelector(privateSelectors.runButton)
    if (runButton) {
      // 运行按钮存在，检查是否可见（offsetParent 不为 null）
      // 如果可见，说明未在生成
      if ((runButton as HTMLElement).offsetParent !== null) {
        return false
      }
    }

    // 补充检测：检查是否有停止按钮（通常是 ms-stop-button 或带 stop 图标的按钮）
    for (const selector of this.config.generating.existsSelectors) {
      const el = document.querySelector(selector)
      if (el && (el as HTMLElement).offsetParent !== null) {
        // 对于 .material-symbols-outlined，需要排除 keyboard_return 图标
        if (el.matches(privateSelectors.generationTextStopIndicator)) {
          const text = el.textContent?.trim()
          if (text === "stop" || text === "stop_circle") {
            return true
          }
        } else {
          return true
        }
      }
    }

    return false
  }

  getStopButtonSelectors(): string[] {
    return [...this.config.selectors.stopButton]
  }

  // ==================== 模型名称获取 ====================

  /** 获取当前使用的模型名称 */
  getModelName(): string | null {
    // 1. 尝试从 DOM 获取 (最准确)
    const selectorBtn = this.getAIStudioModelSelectorButton()
    if (selectorBtn) {
      const titleSpan = this.config.sitePrivateSelectors.modelNameText
        .map((selector) => selectorBtn.querySelector(selector))
        .find(Boolean)
      const name = titleSpan?.textContent?.trim()
      if (name) {
        // 更新缓存
        const sessionId = this.getSessionId()
        if (sessionId) {
          localStorage.setItem(`ophel:aistudio:model:${sessionId}`, name)
        }
        return name
      }
    }

    // 2. 尝试读取自定义缓存 (Display Name)
    const sessionId = this.getSessionId()
    if (sessionId) {
      const cached = localStorage.getItem(`ophel:aistudio:model:${sessionId}`)
      if (cached) return cached
    }

    // 3. 尝试读取 AI Studio 内部偏好 (ID)
    // 这是最可靠的非 DOM 来源
    try {
      const prefStr = localStorage.getItem("aiStudioUserPreference")
      if (prefStr) {
        const pref = JSON.parse(prefStr)
        const modelPath = pref._promptModelOverride || pref.promptModel
        if (modelPath) {
          return modelPath.replace(/^models\//, "")
        }
      }
    } catch {
      // ignore
    }

    // 4. 尝试从 URL 参数获取 (作为最后的手段，通常是 ID)
    const urlParams = new URLSearchParams(window.location.search)
    const modelParam = urlParams.get("model")
    if (modelParam) {
      return modelParam
    }

    // 5. 默认回退
    return "Gemini 1.5 Flash"
  }

  // ==================== 复制最新回复 ====================

  extractAssistantResponseText(element: Element): string {
    if (this.isExportSnapshotElement(element)) {
      return element.textContent?.trim() || ""
    }

    const sanitized = element.cloneNode(true) as HTMLElement
    const includeThoughts = this.shouldIncludeThoughtsInExport()
    const thoughtBlocks = includeThoughts
      ? this.extractThoughtBlockquotesFromElement(sanitized)
      : []

    sanitized
      .querySelectorAll(this.config.sitePrivateSelectors.thoughtChunk)
      .forEach((node) => node.remove())

    const normalizedBody = this.extractAssistantResponseMarkdown(sanitized).trim()
    if (thoughtBlocks.length > 0) {
      const thoughtSection = thoughtBlocks.join("\n\n")
      return normalizedBody ? `${thoughtSection}\n\n${normalizedBody}` : thoughtSection
    }

    return normalizedBody
  }

  private extractAssistantResponseMarkdown(element: Element): string {
    const clone = element.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(
        `${this.config.sitePrivateSelectors.thoughtChunk}, ${this.config.sitePrivateSelectors.assistantContentNoise}`,
      )
      .forEach((node) => node.remove())

    this.normalizeAssistantExportDom(clone)

    const markdown = htmlToMarkdown(clone).trim()
    if (markdown) {
      return markdown
    }

    return this.extractTextWithLineBreaks(clone).trim()
  }

  private shouldIncludeThoughtsInExport(): boolean {
    if (typeof this.exportIncludeThoughtsOverride === "boolean") {
      return this.exportIncludeThoughtsOverride
    }
    return false
  }

  private extractThoughtBlockquotesFromElement(element: Element): string[] {
    const thoughtChunks = Array.from(
      element.querySelectorAll(this.config.sitePrivateSelectors.thoughtChunk),
    )
    const blocks: string[] = []

    thoughtChunks.forEach((chunk) => {
      const content = this.extractThoughtMarkdown(chunk).trim()
      if (!content) return
      blocks.push(this.formatAsThoughtBlockquote(content))
    })

    return blocks
  }

  private extractThoughtMarkdown(element: Element): string {
    const clone = element.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(this.config.sitePrivateSelectors.assistantContentNoise)
      .forEach((node) => node.remove())

    this.normalizeAssistantExportDom(clone)

    const markdown = htmlToMarkdown(clone).trim()
    if (markdown) {
      return markdown
    }

    return this.extractTextWithLineBreaks(clone).trim()
  }

  private normalizeAssistantExportDom(root: HTMLElement): void {
    this.unwrapCmarkNodes(root)
    this.replaceInlineCodeSpans(root)
    this.replaceKatexComponents(root)
    this.replaceCodeBlockComponents(root)
  }

  private unwrapCmarkNodes(root: HTMLElement): void {
    const nodes = Array.from(root.querySelectorAll(this.config.sitePrivateSelectors.markdownNode))
    nodes.forEach((node) => {
      if (!(node instanceof HTMLElement) || !node.parentNode) return
      node.replaceWith(...Array.from(node.childNodes))
    })
  }

  private replaceInlineCodeSpans(root: HTMLElement): void {
    root.querySelectorAll(this.config.sitePrivateSelectors.inlineCode).forEach((node) => {
      if (!(node instanceof HTMLElement)) return
      if (node.tagName.toLowerCase() === "code") return

      const code = document.createElement("code")
      code.textContent = node.textContent || ""
      node.replaceWith(code)
    })
  }

  private replaceKatexComponents(root: HTMLElement): void {
    root.querySelectorAll(this.config.sitePrivateSelectors.katex).forEach((node) => {
      if (!(node instanceof HTMLElement)) return

      const latex =
        node.querySelector(this.config.sitePrivateSelectors.katexAnnotation)?.textContent?.trim() ||
        ""
      if (!latex) {
        return
      }

      const replacement = document.createElement(node.classList.contains("inline") ? "span" : "div")
      replacement.className = node.classList.contains("inline") ? "math-inline" : "math-block"
      replacement.setAttribute("data-math", latex)
      node.replaceWith(replacement)
    })
  }

  private replaceCodeBlockComponents(root: HTMLElement): void {
    root.querySelectorAll(this.config.sitePrivateSelectors.codeBlock).forEach((node) => {
      if (!(node instanceof HTMLElement)) return

      const extracted = this.extractCodeBlockFromComponent(node)
      if (!extracted) {
        return
      }

      const pre = document.createElement("pre")
      const code = document.createElement("code")
      if (extracted.language) {
        code.className = `language-${extracted.language}`
      }
      code.textContent = extracted.code
      pre.appendChild(code)
      node.replaceWith(pre)
    })
  }

  private extractCodeBlockFromComponent(
    element: HTMLElement,
  ): { language: string; code: string } | null {
    const codeElement = this.config.sitePrivateSelectors.codeBlockContent
      .map((selector) => element.querySelector(selector))
      .find((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)

    const code = codeElement?.textContent?.replace(/\r\n/g, "\n").replace(/\n+$/, "") || ""
    if (!code.trim()) {
      return null
    }

    const languageCandidates = [
      element.getAttribute("data-test-language"),
      element.getAttribute("data-language"),
      element.querySelector(this.config.sitePrivateSelectors.codeBlockLanguage)?.textContent,
    ]

    const language =
      languageCandidates
        .map((candidate) => candidate?.trim().toLowerCase() || "")
        .find((candidate) => candidate && candidate !== "code") || ""

    return { language, code }
  }

  private formatAsThoughtBlockquote(markdown: string): string {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n")
    const quotedLines = lines.map((line) => (line.trim().length > 0 ? `> ${line}` : ">"))
    return ["> [Thoughts]", ...quotedLines].join("\n")
  }

  getLatestReplyText(): string | null {
    const prevOverride = this.exportIncludeThoughtsOverride
    this.exportIncludeThoughtsOverride = false

    // AI 回复容器
    const aiMessages = document.querySelectorAll(this.config.sitePrivateSelectors.assistantFragment)

    try {
      for (let i = aiMessages.length - 1; i >= 0; i -= 1) {
        const text = this.extractAssistantResponseText(aiMessages[i]).trim()
        if (text) {
          return text
        }
      }

      return null
    } finally {
      this.exportIncludeThoughtsOverride = prevOverride
    }
  }

  private isExportSnapshotElement(element: Element): boolean {
    return element.hasAttribute(AISTUDIO_EXPORT_ROLE_ATTR)
  }

  /**
   * 收集导出快照。
   *
   * 所有 `ms-chat-turn` 常驻 DOM（外层不虚拟化），真正的虚拟化在 turn 内部：
   * 离视口远的 turn 的 `.turn-content` 会被卸载只剩高度占位。因此按 DOM 顺序
   * 遍历所有 turn，对内容未挂载的 turn 先 `scrollIntoView` 触发渲染再抓。
   */
  private async collectExportMessageSnapshots(
    scrollContainer: HTMLElement,
    collector?: ExportAssetCollector,
  ): Promise<AIStudioExportMessageSnapshot[]> {
    const privateSelectors = this.config.sitePrivateSelectors
    const allTurns = Array.from(
      (scrollContainer.querySelector(privateSelectors.chatSession) || document).querySelectorAll(
        privateSelectors.turn,
      ),
    ).filter((turn): turn is HTMLElement => {
      if (!(turn instanceof HTMLElement)) return false
      // 排除快照模式自己挂载的占位节点
      if (turn.closest(`[${AISTUDIO_EXPORT_ROOT_ATTR}]`)) return false
      return true
    })

    if (allTurns.length === 0) {
      // 极端兜底：完全找不到 turn（站点结构变更），退回 step-sweep + repair
      return this.collectExportMessageSnapshotsByScrollSweep(scrollContainer, collector)
    }

    return this.collectExportMessageSnapshotsByDomIteration(scrollContainer, allTurns, collector)
  }

  /**
   * 按 DOM 顺序遍历每个 ms-chat-turn，必要时 scrollIntoView 让内部 .turn-content
   * 挂载，然后按状态机配对 user / thought-only / reply 三种 turn：
   *   - user turn → user snapshot；
   *   - thought-only model turn → 暂存到 pendingThoughts；
   *   - reply model turn → 把累积的 thought turn 合并进自己的 assistant snapshot。
   *
   * order 直接用 turn 在 DOM 中的位置 index，天然单调、不受滚动影响。
   */
  private async collectExportMessageSnapshotsByDomIteration(
    scrollContainer: HTMLElement,
    allTurns: HTMLElement[],
    collector?: ExportAssetCollector,
  ): Promise<AIStudioExportMessageSnapshot[]> {
    const originalScrollTop = scrollContainer.scrollTop
    const includeThoughts = this.shouldIncludeThoughtsInExport()
    const collected: AIStudioExportMessageSnapshot[] = []
    let pendingThoughts: HTMLElement[] = []
    // 用户附件（图片 / 文件）在 AI Studio 里被渲染成独立的 ms-chat-turn，与紧跟其后的
    // 文字 turn **本质上是同一次用户提问**。这里像处理 thought-only turn 一样累积
    // 多个连续的 user turn，等遇到下一个 model turn 时再合并 flush 成一条 user
    // snapshot——避免一次提问被导出成多条 user 消息。
    let pendingUserTurns: HTMLElement[] = []

    const flushPendingThoughtsAsAssistant = (orderHint: number): void => {
      if (pendingThoughts.length === 0 || !includeThoughts) {
        pendingThoughts = []
        return
      }
      const lastThought = pendingThoughts[pendingThoughts.length - 1]
      const content = this.buildAssistantContentFromModelTurns(pendingThoughts, includeThoughts)
      if (content) {
        collected.push({
          role: AISTUDIO_EXPORT_ROLE_ASSISTANT,
          turnKey: `assistant:${lastThought.id || `idx:${orderHint}`}`,
          order: orderHint,
          content,
        })
      }
      pendingThoughts = []
    }

    const flushPendingUserTurnsAsUser = (): void => {
      if (pendingUserTurns.length === 0) return
      const parts: string[] = []
      for (const userTurn of pendingUserTurns) {
        const userContainer = this.getUserContainerForTurn(userTurn)
        if (!userContainer) continue
        const content = this.normalizeExportMessageContent(
          this.extractUserQueryExportContentWithAttachments(userContainer, collector),
        )
        if (content) parts.push(content)
      }
      if (parts.length > 0) {
        const firstTurn = pendingUserTurns[0]
        const firstIdx = allTurns.indexOf(firstTurn)
        collected.push({
          role: AISTUDIO_EXPORT_ROLE_USER,
          turnKey: `user:${firstTurn.id || `idx:${firstIdx}`}`,
          order: firstIdx,
          content: parts.join("\n\n"),
        })
      }
      pendingUserTurns = []
    }

    try {
      for (let i = 0; i < allTurns.length; i += 1) {
        const turn = allTurns[i]

        // 让 turn 内部内容挂载好——AI Studio 内部虚拟化会在 turn 离开视口后卸载
        // `.turn-content`，只剩高度占位。scrollIntoView 在普通 DOM scroll 上是可靠的
        // （这站点没有 CDK Virtual Scroll viewport 干扰）。
        if (!this.turnHasMountedContent(turn)) {
          try {
            turn.scrollIntoView({ block: "center", behavior: "instant" })
          } catch {
            turn.scrollIntoView({ block: "center" })
          }
          await this.waitForTurnContentMounted(turn, 1800)
        }

        // 分类
        const userContainer = this.getUserContainerForTurn(turn)
        if (userContainer) {
          // 遇到 user：先把上一轮残留的 thought-only 序列结算掉（罕见，通常 reply
          // turn 已经吸收过；这里是兜底防止 thought 内容彻底丢失）
          flushPendingThoughtsAsAssistant(i - 0.5)

          // 不立即输出——可能后面还跟着同次提问的附件 / 文字 turn。先暂存，
          // 等遇到 model turn 时再合并 flush。
          pendingUserTurns.push(turn)
          continue
        }

        const modelContainer = turn.querySelector(
          this.config.selectors.assistantResponse,
        ) as HTMLElement | null
        if (!modelContainer) continue

        // 遇到 model turn：把累积的连续 user turn 合并 flush 成一条 user snapshot
        flushPendingUserTurnsAsUser()

        if (this.isThoughtOnlyModelTurn(modelContainer)) {
          // 暂存——等紧随其后的 reply turn 把它一并合并
          pendingThoughts.push(turn)
          continue
        }

        // reply turn：合并累积的 thought turn + 自己的正文
        const groupTurns = [...pendingThoughts, turn]
        pendingThoughts = []
        const content = this.buildAssistantContentFromModelTurns(groupTurns, includeThoughts)
        if (content) {
          collected.push({
            role: AISTUDIO_EXPORT_ROLE_ASSISTANT,
            turnKey: `assistant:${turn.id || `idx:${i}`}`,
            order: i,
            content,
          })
        }
      }

      // 末尾残留兜底
      flushPendingUserTurnsAsUser()
      flushPendingThoughtsAsAssistant(allTurns.length)

      // Retry pass：first pass 走过一遍后，少数 turn 因为内层挂载特别慢（图片大、
      // 内容长、CPU 抖动等）没能在 1.8s 内抓到——这里把缺失的 user / assistant turn
      // 单独逐个处理一次，给极宽的 5s timeout + 多轮 scroll 重试。
      const stillMissingAnchors = await this.retryMissingTurns(
        allTurns,
        collected,
        includeThoughts,
        collector,
      )
      // 重试后仍缺失的 turn 写入完整性报告（manager 负责向用户提示），不静默产出
      this.exportCollectionReport = {
        expectedCount: null,
        collectedCount: collected.length,
        missingAnchors: stillMissingAnchors,
        hasTruncated: false,
      }
    } finally {
      scrollContainer.scrollTop = originalScrollTop
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
    }

    return collected.sort((a, b) => a.order - b.order)
  }

  /**
   * 把 first pass 漏掉的 turn 单独再处理一次。
   *
   * 漏抓的 turn 通常是因为 1.8s 内部挂载没渲染完（图片大、长正文、CPU 高负载）。
   * 这里用 5s 的宽 timeout + 多次重 scroll，最大化恢复机会。慢一些但保证完整。
   *
   * 返回重试后仍缺失的 turn 锚点，供完整性报告使用。
   */
  private async retryMissingTurns(
    allTurns: HTMLElement[],
    collected: AIStudioExportMessageSnapshot[],
    includeThoughts: boolean,
    collector?: ExportAssetCollector,
  ): Promise<string[]> {
    const collectedUserTurnIds = new Set(
      collected
        .filter((s) => s.role === AISTUDIO_EXPORT_ROLE_USER)
        .map((s) => s.turnKey.replace(/^user:/, "")),
    )
    const collectedAssistantTurnIds = new Set(
      collected
        .filter((s) => s.role === AISTUDIO_EXPORT_ROLE_ASSISTANT)
        .map((s) => s.turnKey.replace(/^assistant:/, "")),
    )

    // 找 missing user：DOM 里的 user turn 但 id（包括"被合并到下一个 user 组"的
    // 第一个 turn id）没出现在 collected 内。
    const missingUserTurns: HTMLElement[] = []
    let pendingUserGroupHead: HTMLElement | null = null
    for (let i = 0; i < allTurns.length; i += 1) {
      const turn = allTurns[i]
      const isUser = !!turn.querySelector(this.config.selectors.userQuery)
      const isModel = !!turn.querySelector(this.config.selectors.assistantResponse)

      if (isUser) {
        if (!pendingUserGroupHead) pendingUserGroupHead = turn
        continue
      }

      if (isModel && pendingUserGroupHead) {
        const headId = pendingUserGroupHead.id || `idx:${allTurns.indexOf(pendingUserGroupHead)}`
        if (!collectedUserTurnIds.has(headId)) {
          missingUserTurns.push(pendingUserGroupHead)
        }
        pendingUserGroupHead = null
      }
    }
    if (pendingUserGroupHead) {
      const headId = pendingUserGroupHead.id || `idx:${allTurns.indexOf(pendingUserGroupHead)}`
      if (!collectedUserTurnIds.has(headId)) {
        missingUserTurns.push(pendingUserGroupHead)
      }
    }

    // 找 missing assistant：reply model turn（非 thought-only）的 id 不在 collected。
    const missingAssistantTurns: HTMLElement[] = []
    for (const turn of allTurns) {
      const modelContainer = turn.querySelector(
        this.config.selectors.assistantResponse,
      ) as HTMLElement | null
      if (!modelContainer) continue
      if (this.isThoughtOnlyModelTurn(modelContainer)) continue
      const id = turn.id || `idx:${allTurns.indexOf(turn)}`
      if (!collectedAssistantTurnIds.has(id)) {
        missingAssistantTurns.push(turn)
      }
    }

    if (missingUserTurns.length === 0 && missingAssistantTurns.length === 0) return []

    // 处理 missing user：重新 reveal + 等 5s + 抓自己 + 下一个连续 user（合并）
    for (const headTurn of missingUserTurns) {
      const headIdx = allTurns.indexOf(headTurn)
      if (headIdx < 0) continue

      // 收集这组连续 user turn
      const groupTurns: HTMLElement[] = []
      for (let j = headIdx; j < allTurns.length; j += 1) {
        const t = allTurns[j]
        if (!t.querySelector(this.config.selectors.userQuery)) break
        groupTurns.push(t)
      }

      // 对每个 turn 强制 reveal + 等到挂载好
      const parts: string[] = []
      for (const t of groupTurns) {
        try {
          t.scrollIntoView({ block: "start", behavior: "instant" })
        } catch {
          t.scrollIntoView({ block: "start" })
        }
        await this.waitForTurnContentMounted(t, 5000)
        const userContainer = this.getUserContainerForTurn(t)
        if (!userContainer) continue
        const content = this.normalizeExportMessageContent(
          this.extractUserQueryExportContentWithAttachments(userContainer, collector),
        )
        if (content) parts.push(content)
      }

      if (parts.length > 0) {
        collected.push({
          role: AISTUDIO_EXPORT_ROLE_USER,
          turnKey: `user:${headTurn.id || `idx:${headIdx}`}`,
          order: headIdx,
          content: parts.join("\n\n"),
        })
      }
    }

    // 处理 missing assistant：找 reply turn 前面紧邻的 thought-only turn 一起合并
    for (const replyTurn of missingAssistantTurns) {
      const replyIdx = allTurns.indexOf(replyTurn)
      if (replyIdx < 0) continue

      const groupTurns: HTMLElement[] = []
      // 向前找连续的 thought-only model turn
      for (let j = replyIdx - 1; j >= 0; j -= 1) {
        const t = allTurns[j]
        const mc = t.querySelector(this.config.selectors.assistantResponse) as HTMLElement | null
        if (!mc || !this.isThoughtOnlyModelTurn(mc)) break
        groupTurns.unshift(t)
      }
      groupTurns.push(replyTurn)

      // 强制 reveal + 等
      for (const t of groupTurns) {
        try {
          t.scrollIntoView({ block: "start", behavior: "instant" })
        } catch {
          t.scrollIntoView({ block: "start" })
        }
        await this.waitForTurnContentMounted(t, 5000)
      }

      const content = this.buildAssistantContentFromModelTurns(groupTurns, includeThoughts)
      if (content) {
        collected.push({
          role: AISTUDIO_EXPORT_ROLE_ASSISTANT,
          turnKey: `assistant:${replyTurn.id || `idx:${replyIdx}`}`,
          order: replyIdx,
          content,
        })
      }
    }

    // 重抓后仍缺失的 turn 锚点
    const finalUserTurnIds = new Set(
      collected
        .filter((s) => s.role === AISTUDIO_EXPORT_ROLE_USER)
        .map((s) => s.turnKey.replace(/^user:/, "")),
    )
    const finalAssistantTurnIds = new Set(
      collected
        .filter((s) => s.role === AISTUDIO_EXPORT_ROLE_ASSISTANT)
        .map((s) => s.turnKey.replace(/^assistant:/, "")),
    )
    const stillMissing: string[] = []
    for (const turn of missingUserTurns) {
      const id = turn.id || `idx:${allTurns.indexOf(turn)}`
      if (!finalUserTurnIds.has(id)) stillMissing.push(`user-turn:${id}`)
    }
    for (const turn of missingAssistantTurns) {
      const id = turn.id || `idx:${allTurns.indexOf(turn)}`
      if (!finalAssistantTurnIds.has(id)) stillMissing.push(`assistant-turn:${id}`)
    }
    return stillMissing
  }

  /**
   * turn 内部是否已经渲染出真实内容（不是只剩高度占位）。
   * 内层虚拟化先挂载 `<ms-prompt-chunk>` 外壳、再异步填充内部 chunk，
   * 因此要求 prompt-chunk 内至少有一个真实内容 chunk（text/thought/image/file）
   * 才算挂载好。
   */
  private turnHasMountedContent(turn: HTMLElement): boolean {
    const privateSelectors = this.config.sitePrivateSelectors
    const promptChunk = turn.querySelector(privateSelectors.promptChunk)
    if (!promptChunk) return false
    if (promptChunk.querySelector(privateSelectors.mountedContent)) {
      return true
    }
    // 罕见 fallback：自定义 chunk 类型——若 prompt-chunk 已有较长 textContent 也算
    const text = (promptChunk.textContent || "").trim()
    return text.length > 0
  }

  /**
   * scrollIntoView 后轮询等待 turn 内部真正挂载好。
   *
   * 给一次"重新滚动"重试机会：第一次 scrollIntoView 后 turn 进入视口可能因 turn
   * 高度大或 Angular 渲染压力没在 timeout 内挂载好；再 scrollIntoView 一次（block:
   * "start" 让 turn 顶部贴齐，给后续内容更多渲染时间）并等更久。
   */
  private async waitForTurnContentMounted(turn: HTMLElement, timeoutMs: number): Promise<boolean> {
    const halfDeadline = Date.now() + Math.floor(timeoutMs / 2)
    while (Date.now() < halfDeadline) {
      if (this.turnHasMountedContent(turn)) return true
      await this.sleep(60)
    }

    // 一半时间过了还没挂载——再 scrollIntoView 一次（block: start，让 turn 在视口
    // 顶部触发 Angular 重新计算并补渲染），剩下的时间继续轮询。
    try {
      turn.scrollIntoView({ block: "start", behavior: "instant" })
    } catch {
      turn.scrollIntoView({ block: "start" })
    }

    const finalDeadline = Date.now() + Math.floor(timeoutMs / 2)
    while (Date.now() < finalDeadline) {
      if (this.turnHasMountedContent(turn)) return true
      await this.sleep(60)
    }
    return false
  }

  /**
   * 判断 model turn 是否只包含思考过程（无正文）。
   * 依据：model container 内所有 ms-text-chunk 是否都嵌套在 ms-thought-chunk 内。
   * 见 demo.html turn 2 (thought-only) vs turn 3 (reply) 的结构对比。
   */
  private isThoughtOnlyModelTurn(modelContainer: HTMLElement): boolean {
    const textChunks = Array.from(
      modelContainer.querySelectorAll(this.config.sitePrivateSelectors.textChunk),
    )
    if (textChunks.length === 0) return true
    return textChunks.every(
      (chunk) => chunk.closest(this.config.sitePrivateSelectors.thoughtChunk) !== null,
    )
  }

  /**
   * 把一组 model turn 合并成单条 assistant 内容。
   * AI Studio 把"思考过程"和"正式回复"切成两个独立的 ms-chat-turn——前者
   * thought-only、后者 reply。一个用户提问对应的回复在导出里应当只产出一条 assistant
   * snapshot：
   *   - includeThoughts=false：跳过 thought-only turn，只保留 reply 正文；
   *   - includeThoughts=true：thought 用 blockquote 形式拼到 reply 前面。
   */
  private buildAssistantContentFromModelTurns(
    turns: HTMLElement[],
    includeThoughts: boolean,
  ): string {
    if (turns.length === 0) return ""

    const parts: string[] = []
    for (const turn of turns) {
      const modelContainer = turn.querySelector(
        this.config.selectors.assistantResponse,
      ) as HTMLElement | null
      if (!modelContainer) continue

      if (this.isThoughtOnlyModelTurn(modelContainer)) {
        if (!includeThoughts) continue
        const thoughtBlocks = this.extractThoughtBlockquotesFromElement(modelContainer)
        thoughtBlocks.forEach((block) => parts.push(block))
        continue
      }

      // reply turn：走 extractAssistantResponseText（它自身按 includeThoughts 过滤
      // ms-thought-chunk——但 reply turn 没有 thought-chunk，所以等同于纯正文提取）。
      const fragments = this.getAssistantFragmentsForTurn(turn)
      const fragmentParts: string[] = []
      for (const fragment of fragments) {
        const content = this.normalizeExportMessageContent(
          this.extractAssistantResponseText(fragment),
        )
        if (content) fragmentParts.push(content)
      }
      if (fragmentParts.length > 0) {
        parts.push(fragmentParts.join("\n\n"))
      }
    }

    return parts.join("\n\n")
  }

  /** 时间线驱动方案已废弃后保留的兜底：找不到任何 ms-chat-turn 时退回原 step-sweep。 */
  private async collectExportMessageSnapshotsByScrollSweep(
    scrollContainer: HTMLElement,
    collector?: ExportAssetCollector,
  ): Promise<AIStudioExportMessageSnapshot[]> {
    const positions = this.buildExportSnapshotPositions(scrollContainer)
    const originalScrollTop = scrollContainer.scrollTop
    let collected: AIStudioExportMessageSnapshot[] = []

    try {
      for (const top of positions) {
        scrollContainer.scrollTop = top
        scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
        scrollContainer.getBoundingClientRect()
        await this.sleep(80)

        const batch = this.readVisibleExportMessageSnapshots(scrollContainer, collector)
        collected = this.mergeExportMessageBatch(collected, batch)
      }
    } finally {
      scrollContainer.scrollTop = originalScrollTop
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
    }

    return this.repairLikelyTruncatedUserSnapshots(collected, scrollContainer, collector)
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

  private readVisibleExportMessageSnapshots(
    container: ParentNode,
    collector?: ExportAssetCollector,
  ): AIStudioExportMessageSnapshot[] {
    const turns = Array.from(
      container.querySelectorAll(this.config.sitePrivateSelectors.turn),
    ).filter(
      (turn): turn is HTMLElement =>
        turn instanceof HTMLElement && !turn.closest(`[${AISTUDIO_EXPORT_ROOT_ATTR}]`),
    )

    return turns.flatMap((turn) => this.extractExportSnapshotsFromTurn(turn, container, collector))
  }

  private extractExportSnapshotsFromTurn(
    turn: HTMLElement,
    container: ParentNode,
    collector?: ExportAssetCollector,
  ): AIStudioExportMessageSnapshot[] {
    const snapshots: AIStudioExportMessageSnapshot[] = []
    const baseOrder = this.getTurnRenderOrder(turn, container)

    const userContainer = this.getUserContainerForTurn(turn)
    if (userContainer) {
      const content = this.normalizeExportMessageContent(
        this.extractUserQueryExportContentWithAttachments(userContainer, collector),
      )
      if (content) {
        snapshots.push({
          role: AISTUDIO_EXPORT_ROLE_USER,
          turnKey: this.getExportTurnKey(turn, "user", content),
          order: baseOrder,
          content,
        })
      }
    }

    const assistantFragments = this.getAssistantFragmentsForTurn(turn)
    if (assistantFragments.length > 0) {
      let content = ""
      assistantFragments.forEach((fragment) => {
        const fragmentContent = this.normalizeExportMessageContent(
          this.extractAssistantResponseText(fragment),
        )
        content = this.mergeSnapshotContent(content, fragmentContent)
      })

      if (content) {
        snapshots.push({
          role: AISTUDIO_EXPORT_ROLE_ASSISTANT,
          turnKey: this.getExportTurnKey(turn, "assistant", content),
          order: baseOrder + 0.5,
          content,
        })
      }
    }

    return snapshots
  }

  private getTurnRenderOrder(turn: HTMLElement, container: ParentNode): number {
    const turnRect = turn.getBoundingClientRect()
    if (container instanceof HTMLElement) {
      const containerRect = container.getBoundingClientRect()
      return container.scrollTop + (turnRect.top - containerRect.top)
    }

    return window.scrollY + turnRect.top
  }

  private getUserContainerForTurn(turn: HTMLElement): HTMLElement | null {
    const turnSelector = this.config.sitePrivateSelectors.turn
    const candidates = Array.from(turn.querySelectorAll(this.config.selectors.userQuery)).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element.closest(turnSelector) === turn,
    )
    return candidates[0] || null
  }

  private getAssistantFragmentsForTurn(turn: HTMLElement): HTMLElement[] {
    const privateSelectors = this.config.sitePrivateSelectors
    return Array.from(turn.querySelectorAll(privateSelectors.assistantFragment)).filter(
      (element): element is HTMLElement => {
        if (!(element instanceof HTMLElement)) return false
        if (element.closest(privateSelectors.turn) !== turn) return false

        const parentFragment = element.parentElement?.closest(privateSelectors.assistantFragment)
        return parentFragment?.closest(privateSelectors.turn) !== turn
      },
    )
  }

  private getExportTurnKey(message: Element, role: "user" | "assistant", content: string): string {
    const turnId = message
      .closest(this.config.sitePrivateSelectors.turn)
      ?.id?.replace(/^turn-/, "")
      .trim()
    if (turnId) {
      return `${role}:${turnId}`
    }

    const normalizedContent = content.replace(/\s+/g, " ").trim().slice(0, 120)
    return `${role}:content:${normalizedContent}`
  }

  private mergeSnapshotContent(previous: string, current: string): string {
    if (!current) {
      return previous
    }

    if (!previous) {
      return current
    }

    if (previous === current || previous.includes(current)) {
      return previous
    }

    if (current.includes(previous)) {
      return current
    }

    const normalizedPrevious = this.normalizeSnapshotComparisonText(previous)
    const normalizedCurrent = this.normalizeSnapshotComparisonText(current)

    if (normalizedPrevious && normalizedCurrent) {
      if (normalizedCurrent.startsWith(normalizedPrevious) && current.length >= previous.length) {
        return current
      }

      if (normalizedPrevious.startsWith(normalizedCurrent) && previous.length >= current.length) {
        return previous
      }
    }

    return `${previous}\n\n${current}`.trim()
  }

  private async repairLikelyTruncatedUserSnapshots(
    collected: AIStudioExportMessageSnapshot[],
    scrollContainer: HTMLElement,
    collector?: ExportAssetCollector,
  ): Promise<AIStudioExportMessageSnapshot[]> {
    const targets = collected.filter((snapshot) => this.isLikelyTruncatedUserSnapshot(snapshot))
    if (targets.length === 0) {
      return collected
    }

    const repaired = collected.map((item) => ({ ...item }))
    const originalScrollTop = scrollContainer.scrollTop

    try {
      for (const target of targets) {
        const start = Math.max(0, target.order - Math.max(120, scrollContainer.clientHeight * 0.25))
        const end = target.order + Math.max(120, scrollContainer.clientHeight * 0.25)
        const positions = [start, target.order, end].map((value) => Math.round(value))

        for (const position of positions) {
          scrollContainer.scrollTop = position
          scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
          scrollContainer.getBoundingClientRect()
          await this.sleep(120)

          const batch = this.readVisibleExportMessageSnapshots(scrollContainer, collector)
          const candidate = batch.find((item) => item.turnKey === target.turnKey)
          if (!candidate) {
            continue
          }

          const repairedIndex = repaired.findIndex((item) => item.turnKey === target.turnKey)
          if (repairedIndex === -1) {
            break
          }

          repaired[repairedIndex] = {
            ...repaired[repairedIndex],
            order: Math.min(repaired[repairedIndex].order, candidate.order),
            content: this.mergeSnapshotContent(repaired[repairedIndex].content, candidate.content),
          }

          if (!this.isLikelyTruncatedUserSnapshot(repaired[repairedIndex])) {
            break
          }
        }
      }
    } finally {
      scrollContainer.scrollTop = originalScrollTop
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
    }

    return repaired
  }

  private isLikelyTruncatedUserSnapshot(snapshot: AIStudioExportMessageSnapshot): boolean {
    if (snapshot.role !== AISTUDIO_EXPORT_ROLE_USER) {
      return false
    }

    const text = snapshot.content.trim()
    return /(?:\.{3}|…)$/.test(text)
  }

  private normalizeSnapshotComparisonText(content: string): string {
    return content
      .replace(/\r\n/g, "\n")
      .replace(/\u2026/g, "...")
      .replace(/\.{3}\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim()
  }

  private normalizeExportMessageContent(content: string): string {
    return content
      .replace(/\r\n/g, "\n")
      .replace(/\u00a0/g, " ")
      .trim()
  }

  private mergeExportMessageBatch(
    collected: AIStudioExportMessageSnapshot[],
    batch: AIStudioExportMessageSnapshot[],
  ): AIStudioExportMessageSnapshot[] {
    if (batch.length === 0) {
      return collected
    }

    if (collected.length === 0) {
      return batch.map((item) => ({ ...item }))
    }

    const merged = collected.map((item) => ({ ...item }))
    let anchorIndex: number | null = null

    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      const item = batch[batchIndex]
      const existingIndex = merged.findIndex((entry) => entry.turnKey === item.turnKey)

      if (existingIndex !== -1) {
        const existing = merged[existingIndex]
        merged[existingIndex] = {
          ...existing,
          order: Math.min(existing.order, item.order),
          content: this.mergeSnapshotContent(existing.content, item.content),
        }
        anchorIndex = existingIndex
        continue
      }

      const nextKnownIndex = this.findNextKnownSnapshotIndex(merged, batch, batchIndex + 1)
      let insertIndex = merged.length

      if (anchorIndex !== null) {
        insertIndex = anchorIndex + 1
        if (nextKnownIndex !== null && insertIndex > nextKnownIndex) {
          insertIndex = nextKnownIndex
        }
      } else if (nextKnownIndex !== null) {
        insertIndex = nextKnownIndex
      }

      merged.splice(insertIndex, 0, { ...item })
      anchorIndex = insertIndex
    }

    return merged
  }

  private findNextKnownSnapshotIndex(
    merged: AIStudioExportMessageSnapshot[],
    batch: AIStudioExportMessageSnapshot[],
    startIndex: number,
  ): number | null {
    for (let index = startIndex; index < batch.length; index += 1) {
      const turnKey = batch[index].turnKey
      const knownIndex = merged.findIndex((entry) => entry.turnKey === turnKey)
      if (knownIndex !== -1) {
        return knownIndex
      }
    }

    return null
  }

  private mountExportSnapshot(messages: AIStudioExportMessageSnapshot[]): void {
    this.clearExportSnapshot()

    const root = document.createElement("div")
    root.setAttribute(AISTUDIO_EXPORT_ROOT_ATTR, "1")
    root.style.display = "none"

    messages.forEach((message) => {
      const turn = document.createElement("div")
      turn.setAttribute(AISTUDIO_EXPORT_TURN_ATTR, "1")

      const node = document.createElement("div")
      node.setAttribute(AISTUDIO_EXPORT_ROLE_ATTR, message.role)
      node.textContent = message.content
      turn.appendChild(node)
      root.appendChild(turn)
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

    document.querySelectorAll(`[${AISTUDIO_EXPORT_ROOT_ATTR}]`).forEach((node) => {
      if (node !== root) {
        node.parentNode?.removeChild(node)
      }
    })
  }

  // ==================== 新对话按钮 ====================

  getNewChatButtonSelectors(): string[] {
    return [...this.config.selectors.newChatButton]
  }

  // ==================== 主题切换 ====================

  /**
   * 切换 AI Studio 主题
   * AI Studio 使用 localStorage.aiStudioUserPreference.theme 存储主题
   * 值域：light / dark / system
   * @param targetMode 目标主题模式
   */
  async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
    try {
      // 读取现有的用户偏好
      const prefStr = localStorage.getItem("aiStudioUserPreference") || "{}"
      const pref = JSON.parse(prefStr)

      // 更新主题设置
      pref.theme = targetMode

      // 写回 localStorage
      localStorage.setItem("aiStudioUserPreference", JSON.stringify(pref))

      // AI Studio 使用 Angular Material，尝试更新 body 类名
      // Angular Material 主题类通常在 body 上：mat-app-background, dark-theme 等
      const body = document.body
      if (targetMode === "dark") {
        body.classList.add("dark-theme")
        body.classList.remove("light-theme")
      } else {
        body.classList.remove("dark-theme")
        body.classList.add("light-theme")
      }

      // 更新 color-scheme
      body.style.colorScheme = targetMode

      // 触发 storage 事件（Angular 可能监听这个事件）
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "aiStudioUserPreference",
          newValue: JSON.stringify(pref),
          storageArea: localStorage,
        }),
      )

      // 通知 Angular：尝试触发变更检测
      // AI Studio 可能需要刷新页面才能完全应用主题
      // 但我们先尝试无刷新方式
      const appRoot = document.querySelector(this.config.sitePrivateSelectors.themeEventTarget)
      if (appRoot) {
        appRoot.dispatchEvent(new CustomEvent("themechange", { detail: { theme: targetMode } }))
      }

      return true
    } catch (error) {
      console.error("[AIStudioAdapter] toggleTheme error:", error)
      return false
    }
  }
}
