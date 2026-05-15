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
import { useSettingsStore } from "~stores/settings-store"
import { htmlToMarkdown } from "~utils/exporter"
import type { AIStudioSettings } from "~utils/storage"

import {
  SiteAdapter,
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type ExportLifecycleContext,
  type MarkdownFixerConfig,
  type OutlineItem,
  type SiteDeleteConversationResult,
} from "./base"

// ==================== AI Studio 可用模型列表 ====================
// 基于 ListModels API 响应，按类别分组

export interface AIStudioModel {
  id: string // 模型 ID，如 "models/gemini-3-flash-preview"
  name: string // 显示名称
  category: string // 分类
}

export const AISTUDIO_MODELS: AIStudioModel[] = [
  // Gemini 3 系列
  { id: "models/gemini-3-pro-preview", name: "Gemini 3 Pro Preview", category: "Gemini 3" },
  {
    id: "models/gemini-3-pro-image-preview",
    name: "Gemini 3 Pro Image Preview",
    category: "Gemini 3",
  },
  { id: "models/gemini-3-flash-preview", name: "Gemini 3 Flash Preview", category: "Gemini 3" },

  // Gemini 2.5 系列
  { id: "models/gemini-2.5-pro", name: "Gemini 2.5 Pro", category: "Gemini 2.5" },
  { id: "models/gemini-2.5-flash", name: "Gemini 2.5 Flash", category: "Gemini 2.5" },
  { id: "models/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", category: "Gemini 2.5" },
  { id: "models/gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image", category: "Gemini 2.5" },

  // Gemini 2.0 系列
  { id: "models/gemini-2.0-flash", name: "Gemini 2.0 Flash", category: "Gemini 2.0" },
  { id: "models/gemini-2.0-flash-lite", name: "Gemini 2.0 Flash-Lite", category: "Gemini 2.0" },

  // Latest 别名
  { id: "models/gemini-flash-latest", name: "Gemini Flash Latest", category: "Latest" },
  { id: "models/gemini-flash-lite-latest", name: "Gemini Flash-Lite Latest", category: "Latest" },

  // 特殊模型
  {
    id: "models/gemini-robotics-er-1.5-preview",
    name: "Gemini Robotics-ER 1.5",
    category: "Special",
  },
  {
    id: "models/gemini-2.5-flash-native-audio-preview-12-2025",
    name: "Gemini 2.5 Flash Native Audio",
    category: "Audio",
  },
  { id: "models/gemini-2.5-pro-preview-tts", name: "Gemini 2.5 Pro TTS", category: "TTS" },
  { id: "models/gemini-2.5-flash-preview-tts", name: "Gemini 2.5 Flash TTS", category: "TTS" },

  // Imagen 系列
  { id: "models/imagen-4.0-generate-001", name: "Imagen 4", category: "Imagen" },
  { id: "models/imagen-4.0-ultra-generate-001", name: "Imagen 4 Ultra", category: "Imagen" },
  { id: "models/imagen-4.0-fast-generate-001", name: "Imagen 4 Fast", category: "Imagen" },

  // Veo 系列（视频生成）
  { id: "models/veo-3.1-generate-preview", name: "Veo 3.1", category: "Veo" },
  { id: "models/veo-3.1-fast-generate-preview", name: "Veo 3.1 Fast", category: "Veo" },
  { id: "models/veo-2.0-generate-001", name: "Veo 2", category: "Veo" },
]

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

const AISTUDIO_RPC_SERVICE_PATH =
  "/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService"
const AISTUDIO_DELETE_PROMPT_METHOD = "DeletePrompt"
const AISTUDIO_FALLBACK_RPC_ORIGIN = "https://alkalimakersuite-pa.clients6.google.com"
const AISTUDIO_TURN_SELECTOR = "ms-chat-turn"
const AISTUDIO_ASSISTANT_FRAGMENT_SELECTOR = ".chat-turn-container.model, .model-prompt-container"
const AISTUDIO_ASSISTANT_SELECTOR = ".chat-turn-container.model"
const AISTUDIO_THOUGHT_SELECTOR = "ms-thought-chunk"
const AISTUDIO_EXPORT_ROOT_ATTR = "data-gh-aistudio-export-root"
const AISTUDIO_EXPORT_TURN_ATTR = "data-gh-aistudio-export-turn"
const AISTUDIO_EXPORT_ROLE_ATTR = "data-gh-aistudio-export-role"
const AISTUDIO_EXPORT_ROLE_USER = "user"
const AISTUDIO_EXPORT_ROLE_ASSISTANT = "assistant"
const AISTUDIO_EXPORT_TURN_SELECTOR = `[${AISTUDIO_EXPORT_ROOT_ATTR}="1"] [${AISTUDIO_EXPORT_TURN_ATTR}="1"]`
const AISTUDIO_EXPORT_USER_SELECTOR = `[${AISTUDIO_EXPORT_ROOT_ATTR}="1"] [${AISTUDIO_EXPORT_ROLE_ATTR}="${AISTUDIO_EXPORT_ROLE_USER}"]`
const AISTUDIO_EXPORT_ASSISTANT_SELECTOR = `[${AISTUDIO_EXPORT_ROOT_ATTR}="1"] [${AISTUDIO_EXPORT_ROLE_ATTR}="${AISTUDIO_EXPORT_ROLE_ASSISTANT}"]`

interface AIStudioExportMessageSnapshot {
  role: "user" | "assistant"
  turnKey: string
  order: number
  content: string
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
  // ==================== 缓存属性 ====================

  // 缓存从 library 页面抓取的会话列表
  private cachedLibraryConversations: ConversationInfo[] | null = null
  private cachedApiKey: string | null = null
  private cachedRpcOrigin: string | null = null
  private exportSnapshotRoot: HTMLElement | null = null
  private exportSnapshotActive = false
  private exportIncludeThoughtsOverride: boolean | null = null

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

  getThemeColors(): { primary: string; secondary: string } {
    // Google AI 蓝色主题
    return { primary: "#4285f4", secondary: "#1a73e8" }
  }

  getNewTabUrl(): string {
    return "https://aistudio.google.com/prompts/new_chat"
  }

  // ==================== 会话状态 ====================

  isNewConversation(): boolean {
    // 只要有有效的 session ID，就不是新对话
    return !this.getSessionId()
  }

  getSessionId(): string {
    const path = window.location.pathname
    // AI Studio 会话 ID 位于 /prompts/ 之后
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
    const turnControlId = this.getTurnControlId(turnId)
    if (!turnControlId) return null

    const directTurn = document.getElementById(turnControlId)
    const directUserQuery = directTurn?.querySelector(".chat-turn-container.user")
    if (directUserQuery) {
      return directUserQuery
    }

    const normalizedTurnId = this.normalizeTurnId(turnId)
    const candidates = Array.from(document.querySelectorAll(".chat-turn-container.user"))
    return (
      candidates.find((candidate) => {
        const candidateTurnId = candidate.closest("ms-chat-turn")?.id || ""
        return this.normalizeTurnId(candidateTurnId) === normalizedTurnId
      }) || null
    )
  }

  private getScrollbarQueryEntries(): AIStudioScrollbarQueryEntry[] {
    const buttons = Array.from(
      document.querySelectorAll(
        [
          "ms-items-scrollbar button[aria-controls]",
          "ms-items-scrollbar button[data-test-item-id]",
          "ms-prompt-scrollbar button[aria-controls]",
          "ms-prompt-scrollbar button[data-test-item-id]",
        ].join(", "),
      ),
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
    const sessionId = this.getSessionId()
    if (!sessionId) return null

    const matched = this.getConversationList().find((item) => item.id === sessionId)
    if (matched?.title?.trim()) {
      return matched.title.trim()
    }

    const link = document.querySelector(
      `a.prompt-link[href*="/prompts/${sessionId}"], a.name-btn[href*="/prompts/${sessionId}"], a[href*="/prompts/${sessionId}"]`,
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
    // AI Studio 使用标准 textarea，有 cdk-textarea-autosize 类
    return [
      "textarea.textarea",
      "textarea.cdk-textarea-autosize",
      'textarea[placeholder*="prompt"]',
      'textarea[placeholder*="Start typing"]',
    ]
  }

  getSubmitButtonSelectors(): string[] {
    // Use the submit button inside ms-run-button to avoid matching unrelated primary buttons
    return [
      'ms-run-button button[type="submit"]',
      'ms-run-button.supports-add-instead-of-run button[type="submit"]',
      'button[ms-button][type="submit"]',
      'button.ms-button-primary[type="submit"]',
    ]
  }

  /**
   * 获取发送消息的快捷键配置
   * AI Studio 允许用户自定义发送键：Enter 或 Ctrl+Enter
   * 配置存储在 localStorage.aiStudioUserPreference.enterKeyBehavior
   * - enterKeyBehavior: 2 表示 Ctrl+Enter 发送
   * - 其他值表示 Enter 发送
   */
  getSubmitKeyConfig(): { key: "Enter" | "Ctrl+Enter" } {
    try {
      const prefStr = localStorage.getItem("aiStudioUserPreference")
      if (!prefStr) return { key: "Enter" }

      const pref = JSON.parse(prefStr)
      // enterKeyBehavior: 2 表示 Ctrl+Enter 发送
      if (pref.enterKeyBehavior === 2) {
        return { key: "Ctrl+Enter" }
      }
      return { key: "Enter" }
    } catch {
      return { key: "Enter" }
    }
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (element.offsetParent === null) return false
    if (element.closest(".gh-main-panel")) return false
    // 必须是 textarea 元素
    return element.tagName.toLowerCase() === "textarea"
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
    // 聊天区域滚动容器
    // AI Studio 使用 virtual-scroll 或 overflow-auto 容器
    const candidates = [
      ".chat-container",
      ".virtual-scroll-container",
      '[class*="scroll"]',
      'main [style*="overflow"]',
    ]

    for (const selector of candidates) {
      const container = document.querySelector(selector) as HTMLElement
      if (container && container.scrollHeight > container.clientHeight) {
        return container
      }
    }

    // 回退：查找 main 元素内的可滚动容器
    const main = document.querySelector("main")
    if (main) {
      const scrollable = main.querySelector('[class*="overflow"]') as HTMLElement
      if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
        return scrollable
      }
    }

    return null
  }

  getResponseContainerSelector(): string {
    return ".chat-container, main"
  }

  getChatContentSelectors(): string[] {
    return [".chat-turn-container", '[class*="message"]', '[class*="response"]']
  }

  getWidthSelectors() {
    return [
      // 主聊天内容容器
      { selector: ".chat-session-content", property: "max-width" },
      // 每个对话轮次容器
      { selector: ".chat-turn-container", property: "max-width" },
      // 表格默认 width:auto，开启页面加宽后仍不会拉伸
      {
        selector: ".table-container > table",
        property: "width",
        value: "100%",
        noCenter: true,
        extraCss: "min-width: 100% !important;",
      },
    ]
  }

  getZenModeConfig() {
    return {
      hide: ["ms-navbar", "ms-navbar-v2", "ms-right-side-panel"],
    }
  }

  getCleanModeConfig() {
    return {
      hide: ["ms-hallucinations-disclaimer"],
    }
  }

  getMarkdownFixerConfig(): MarkdownFixerConfig {
    return {
      selector: "ms-cmark-node span.ng-star-inserted",
      fixSpanContent: true,
    }
  }

  private getAIStudioModelSelectorButton(requireVisible = false): HTMLElement | null {
    const selectors = ["button.model-selector-card", ".model-selector-card"]

    for (const selector of selectors) {
      const candidate = document.querySelector(selector)
      if (candidate instanceof HTMLElement && (!requireVisible || this.isVisible(candidate))) {
        return candidate
      }
    }

    const modelName = document.querySelector('[data-test-id="model-name"]')
    const modelButton = modelName?.closest("button")
    return modelButton instanceof HTMLElement && (!requireVisible || this.isVisible(modelButton))
      ? modelButton
      : null
  }

  private getRunSettingsToggleButton(requireVisible = false): HTMLElement | null {
    const toggleButton = document.querySelector('button[aria-label="Toggle run settings panel"]')
    return toggleButton instanceof HTMLElement && (!requireVisible || this.isVisible(toggleButton))
      ? toggleButton
      : null
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

    const maxAttempts = 10
    const checkInterval = 1000
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
          const nameEl = targetBtn.querySelector("div > div > div > span:first-child")
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
                  'button[aria-label="Close run settings panel"]',
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
          'button[aria-label="Close run settings panel"]',
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
          'button[aria-label="Close run settings panel"]',
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
        ".ms-sliding-right-panel-dialog, mat-dialog-container.mat-mdc-dialog-container",
      ) as HTMLElement

      if (sidebar) {
        // 等待模型列表项加载
        await new Promise((r) => setTimeout(r, 300))
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
      sidebar.querySelectorAll("[data-test-category-button]"),
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
    const modelCards = sidebar.querySelectorAll(".model-options-container button.content-button")

    modelCards.forEach((card) => {
      // 从按钮 id 属性提取模型 ID，格式: model-carousel-row-models/{model-id}
      const btnId = card.id || ""
      const modelId = btnId.replace("model-carousel-row-", "").replace("models/", "")

      // 从指定的 span 元素提取干净的显示名称（避免获取描述等内容）
      const nameEl = card.querySelector("div > div > div > span:first-child")
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
    const closeBtn = document.querySelector("button[data-test-close-button]") as HTMLElement
    if (closeBtn) {
      closeBtn.click()
      return
    }

    // 方法2: 发送 ESC 键作为回退
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  }

  /**
   * 加载全部会话（从 library 页面抓取）
   * 跳转到 /library 页面，等待表格加载，抓取所有会话数据后缓存
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

    // 抓取表格数据
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
    // 方法 1: 仅在导航容器（ms-navbar-v2）内查找 /library 链接，
    // 或链接本身带有 Angular routerLink 属性，确保是 SPA 路由链接而非普通 <a>
    const scopedLink = document.querySelector(
      'ms-navbar-v2 a[href="/library"]',
    ) as HTMLAnchorElement | null
    const fallbackLink = document.querySelector('a[href="/library"]') as HTMLAnchorElement | null
    const candidate = scopedLink ?? fallbackLink
    const isRouterLink =
      !!candidate &&
      (!!candidate.closest("ms-navbar-v2") ||
        candidate.hasAttribute("routerlink") ||
        candidate.hasAttribute("ng-reflect-router-link"))

    if (isRouterLink && candidate) {
      candidate.click()
      return this.waitForLibraryTable()
    }

    // 方法 2: 使用 history.pushState + popstate 触发 Angular 路由器
    window.history.pushState(null, "", "/library")
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }))
    return this.waitForLibraryTable()
  }

  /**
   * 等待 library 页面表格加载完成
   */
  private async waitForLibraryTable(): Promise<boolean> {
    // 最多等待 5 秒
    // 以 ms-library-table table 出现为就绪信号（而非必须有 tbody tr），
    // 避免历史列表为空时误判为导航失败
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      const table = document.querySelector("ms-library-table table")
      if (table) {
        // 额外等待 200ms 确保数据渲染完成
        await new Promise((resolve) => setTimeout(resolve, 200))
        return true
      }
    }
    return false
  }

  /**
   * 从 library 页面表格提取会话列表
   */
  private extractLibraryConversations(): ConversationInfo[] {
    const conversations: ConversationInfo[] = []
    const rows = document.querySelectorAll("ms-library-table table tbody tr")

    rows.forEach((row) => {
      // 表格中的会话链接：a.name-btn[href*="/prompts/"]
      const link = row.querySelector('a[href*="/prompts/"]') as HTMLAnchorElement
      if (!link) return

      const href = link.getAttribute("href") || ""
      const match = href.match(/\/prompts\/([^/]+)/)
      if (!match) return

      const id = match[1]
      const title = link.getAttribute("title")?.trim() || link.textContent?.trim() || "Untitled"

      conversations.push({
        id,
        title,
        url: href,
        isActive: window.location.pathname.includes(id),
        isPinned: false,
      })
    })

    return conversations
  }

  /**
   * 从侧边栏提取会话列表（仅部分最近会话）
   */
  private extractSidebarConversations(): ConversationInfo[] {
    const conversationMap = new Map<string, ConversationInfo>()

    // 从侧边栏历史记录提取
    const historyLinks = document.querySelectorAll('a[href*="/prompts/"]')

    historyLinks.forEach((link) => {
      const href = link.getAttribute("href")
      if (!href || href.includes("new_chat")) return

      // 提取 ID
      const match = href.match(/\/prompts\/([^/]+)/)
      if (!match) return

      const id = match[1]
      if (conversationMap.has(id)) return

      // 提取标题
      const title = link.textContent?.trim() || "Untitled"

      // 检查是否当前会话
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
    // 如果在 library 页面，直接从表格抓取
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
    // /library 页面返回真实的会话列表滚动容器
    if (window.location.pathname === "/library") {
      return document.querySelector("ms-library-table .lib-table-wrapper") || null
    }

    // 非 /library 页面：新版 AI Studio（ms-navbar-v2）侧边栏不再包含可滚动的历史列表，
    // 但上层 waitForSidebarReady() 需要一个稳定可获取的元素作为「页面就绪」信号，
    // 否则首次安装或会话列表为空时的自动全量同步（autoFullSync）会被永久阻塞。
    // 这里返回稳定宿主容器作为就绪信号，而非直接返回 null。
    return (
      document.querySelector("ms-navbar-v2") ||
      document.querySelector("main") ||
      document.body ||
      null
    )
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    // 新版 AI Studio 侧边栏（ms-navbar-v2）已不含历史会话链接
    // 会话列表仅通过 /library 页面获取，无需 DOM 观察器
    if (window.location.pathname === "/library") {
      return {
        selector: 'ms-library-table a.name-btn[href*="/prompts/"]:not([href*="new_chat"])',
        shadow: false,
        extractInfo: (el: Element) => {
          const href = el.getAttribute("href")
          if (!href) return null

          const match = href.match(/\/prompts\/([^/]+)/)
          if (!match) return null

          const id = match[1]
          const title = el.getAttribute("title")?.trim() || el.textContent?.trim() || "Untitled"

          return { id, title, url: href, isPinned: false }
        },
        getTitleElement: (el: Element) => el,
      }
    }

    return null
  }

  navigateToConversation(id: string, url?: string): boolean {
    // 优先在 ms-library-table 内查找 a.name-btn，避免误命中页面其他区域的同 URL 链接
    const link = document.querySelector(
      `ms-library-table a.name-btn[href*="/prompts/${id}"]`,
    ) as HTMLAnchorElement | null
    if (link) {
      link.click()
      return true
    }
    // 降级：硬跳转
    window.location.href = url || `/prompts/${id}`
    return true
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
    const authorization = await this.buildGoogleAuthorizationHeader(window.location.origin)
    if (!authorization) {
      return {
        id,
        success: false,
        method: "none",
        reason: AISTUDIO_DELETE_REASON.API_AUTH_MISSING,
      }
    }

    const apiKey = this.resolveGoogleApiKey()
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
            "x-goog-authuser": this.resolveGoogAuthUser(),
            "x-user-agent": "grpc-web-javascript/0.1",
          },
          body: JSON.stringify([promptName]),
        })

        lastStatus = response.status
        if (response.ok) {
          this.cachedRpcOrigin = this.normalizeRpcOriginFromEndpoint(endpoint)
          this.syncConversationListAfterDelete(id)
          return { id, success: true, method: "api" }
        }

        if (response.status === 404) {
          if (!this.isConversationVisible(id)) {
            this.cachedRpcOrigin = this.normalizeRpcOriginFromEndpoint(endpoint)
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
    const origins: string[] = []

    if (this.cachedRpcOrigin) {
      origins.push(this.cachedRpcOrigin)
    }

    origins.push(...this.resolveRpcOriginsFromPerformance())
    origins.push(AISTUDIO_FALLBACK_RPC_ORIGIN)

    const uniqueOrigins = Array.from(new Set(origins.filter(Boolean)))
    return uniqueOrigins.map(
      (origin) => `${origin}${AISTUDIO_RPC_SERVICE_PATH}/${AISTUDIO_DELETE_PROMPT_METHOD}`,
    )
  }

  private resolveRpcOriginsFromPerformance(): string[] {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[]
    if (!entries || entries.length === 0) return []

    const origins: string[] = []
    for (let index = entries.length - 1; index >= 0; index--) {
      const name = entries[index]?.name
      if (!name || !name.includes(AISTUDIO_RPC_SERVICE_PATH)) continue

      const origin = this.normalizeRpcOriginFromEndpoint(name)
      if (origin) origins.push(origin)
    }

    return Array.from(new Set(origins))
  }

  private normalizeRpcOriginFromEndpoint(endpoint: string): string | null {
    try {
      const url = new URL(endpoint)
      if (!this.isLikelyRpcHost(url.hostname)) return null
      return `${url.protocol}//${url.host}`
    } catch {
      return null
    }
  }

  private isLikelyRpcHost(hostname: string): boolean {
    return /(?:^|\.)alkalimakersuite-[a-z0-9-]+\.clients\d+\.google\.com$/i.test(hostname)
  }

  private async buildGoogleAuthorizationHeader(origin: string): Promise<string | null> {
    const timestamp = Math.floor(Date.now() / 1000)
    const sapisid = this.getCookieValue("SAPISID")
    const oneP = this.getCookieValue("__Secure-1PAPISID")
    const threeP = this.getCookieValue("__Secure-3PAPISID")

    const parts: string[] = []

    const primary = sapisid || oneP || threeP
    if (primary) {
      const token = await this.buildSapisidHashToken(primary, origin, timestamp)
      if (token) parts.push(`SAPISIDHASH ${token}`)
    }

    if (oneP) {
      const token = await this.buildSapisidHashToken(oneP, origin, timestamp)
      if (token) parts.push(`SAPISID1PHASH ${token}`)
    }

    if (threeP) {
      const token = await this.buildSapisidHashToken(threeP, origin, timestamp)
      if (token) parts.push(`SAPISID3PHASH ${token}`)
    }

    if (parts.length === 0) return null
    return parts.join(" ")
  }

  private async buildSapisidHashToken(
    value: string,
    origin: string,
    timestamp: number,
  ): Promise<string | null> {
    try {
      const source = `${timestamp} ${value} ${origin}`
      const hashBuffer = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(source))
      const hash = Array.from(new Uint8Array(hashBuffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
      return `${timestamp}_${hash}`
    } catch {
      return null
    }
  }

  private resolveGoogleApiKey(): string | null {
    if (this.cachedApiKey && this.isValidGoogleApiKey(this.cachedApiKey)) {
      return this.cachedApiKey
    }

    const fromWiz = (window as unknown as Record<string, unknown>).WIZ_global_data as
      | Record<string, unknown>
      | undefined
    const wizKey = fromWiz?.SNlM0e
    if (this.isValidGoogleApiKey(wizKey)) {
      this.cachedApiKey = wizKey
      return wizKey
    }

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      const value = localStorage.getItem(key)
      if (!value) continue
      const match = value.match(/AIza[0-9A-Za-z_-]{20,}/)
      if (match) {
        this.cachedApiKey = match[0]
        return match[0]
      }
    }

    const scripts = Array.from(document.querySelectorAll("script"))
    for (const script of scripts) {
      const text = script.textContent
      if (!text) continue
      const match = text.match(/AIza[0-9A-Za-z_-]{20,}/)
      if (match) {
        this.cachedApiKey = match[0]
        return match[0]
      }
    }

    return null
  }

  private isValidGoogleApiKey(value: unknown): value is string {
    return typeof value === "string" && /^AIza[0-9A-Za-z_-]{20,}$/.test(value)
  }

  private resolveGoogAuthUser(): string {
    const fromQuery = new URLSearchParams(window.location.search).get("authuser")
    if (fromQuery && /^\d+$/.test(fromQuery)) {
      return fromQuery
    }
    return "0"
  }

  private getCookieValue(name: string): string | null {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
    if (!match) return null
    try {
      return decodeURIComponent(match[1])
    } catch {
      return match[1]
    }
  }

  private syncConversationListAfterDelete(id: string): void {
    if (this.cachedLibraryConversations) {
      this.cachedLibraryConversations = this.cachedLibraryConversations.filter(
        (item) => item.id !== id,
      )
    }

    const selectors = [
      `a.prompt-link[href*="/prompts/${id}"]`,
      `a.name-btn[href*="/prompts/${id}"]`,
      `a[href*="/prompts/${id}"]`,
    ]
    selectors.forEach((selector) => {
      const anchors = Array.from(document.querySelectorAll(selector)) as HTMLElement[]
      anchors.forEach((anchor) => {
        const container =
          (anchor.closest("tr") as HTMLElement | null) ||
          (anchor.closest("li") as HTMLElement | null) ||
          (anchor.closest("mat-row") as HTMLElement | null) ||
          anchor
        container.remove()
      })
    })
  }

  private isConversationVisible(id: string): boolean {
    return Boolean(
      document.querySelector(
        `a.prompt-link[href*="/prompts/${id}"], a.name-btn[href*="/prompts/${id}"], a[href*="/prompts/${id}"]`,
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
      const anchor = document.querySelector(
        `ms-library-table a[href*="/prompts/${id}"], a.name-btn[href*="/prompts/${id}"]`,
      ) as HTMLElement | null
      if (anchor) {
        const row = (anchor.closest("tr") || anchor.closest("mat-row") || anchor) as HTMLElement
        if (row && this.isVisible(row)) return row
      }
      await this.sleep(80)
    }
    return null
  }

  private findLibraryRowMenuButton(row: HTMLElement): HTMLElement | null {
    const selector = [
      'button[aria-haspopup="menu"]',
      'button[aria-label*="More"]',
      'button[aria-label*="more"]',
      'button[aria-label*="更多"]',
      'button[aria-label*="更多选项"]',
      'button[aria-label*="选项"]',
      'button[title*="More"]',
      'button[title*="more"]',
    ].join(", ")

    const candidates = Array.from(row.querySelectorAll(selector)) as HTMLElement[]
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
        document.querySelectorAll(
          '[role="menuitem"], [role="menu"] button, .mat-mdc-menu-panel button',
        ),
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
      document.querySelectorAll('[role="dialog"], mat-dialog-container, .mat-mdc-dialog-container'),
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
    // 用户消息容器 - 只使用顶级容器，避免父子级重复匹配
    // AI Studio DOM 结构：.chat-turn-container.user > .user-prompt-container > .turn-content > ms-prompt-chunk
    return ".chat-turn-container.user"
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

    // 检查会话变更并清理缓存
    const currentSessionId = this.getSessionId()
    if (this.lastSessionIdForCache !== currentSessionId) {
      this.textCache.clear()
      this.wordCountCache.clear()
      this.lastSessionIdForCache = currentSessionId
    }

    // 尝试提取 Turn ID (用于缓存键)
    // 结构: ms-chat-turn[id="..."] > .chat-turn-container
    const turnId = element.closest("ms-chat-turn")?.id
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
      extractedText = this.extractTextWithLineBreaks(contentChunk).trim()
    } else {
      // 回退：尝试从 .turn-content 中排除 .author-label
      const turnContent = element.querySelector(".turn-content")
      if (turnContent) {
        // AI Studio 的虚拟滚动可能会移除 .turn-content 的内容但保留容器
        // 如果这里获取为空，不代表真的为空，可能是被虚拟化了
        const authorLabel = turnContent.querySelector(".author-label")
        if (authorLabel) {
          // 克隆节点并移除标签
          const clone = turnContent.cloneNode(true) as Element
          const labelInClone = clone.querySelector(".author-label")
          labelInClone?.remove()
          extractedText = clone.textContent?.trim() || ""
        } else {
          extractedText = turnContent.textContent?.trim() || ""
        }
      } else {
        extractedText = this.extractTextWithLineBreaks(element)
      }
    }

    // --- Side-Channel Hydration (Using Scrollbar) ---
    // 如果 DOM 提取文本失败（懒加载/Shadow DOM/渲染延迟），尝试从侧边栏获取
    // 侧边栏按钮通常包含 aria-control="turn-ID" 和 aria-label="Full Text"
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
      .querySelectorAll(
        '.author-label, .actions-container, button, [role="button"], svg, [aria-hidden="true"]',
      )
      .forEach((node) => node.remove())

    this.normalizeAssistantExportDom(source)

    const markdown = htmlToMarkdown(source).trim()
    if (markdown) {
      return markdown
    }

    return this.extractTextWithLineBreaks(source).trim()
  }

  extractUserQueryExportContent(element: Element): string {
    const markdown = this.extractUserQueryMarkdown(element).trim()
    return markdown || this.extractUserQueryText(element)
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
    const currentTurn = element.closest("ms-chat-turn")
    const nextTurn = currentTurn?.nextElementSibling
    if (!nextTurn || nextTurn.tagName.toLowerCase() !== "ms-chat-turn") {
      return undefined
    }

    const responseText = this.extractTextWithLineBreaks(nextTurn).trim().substring(0, 50)
    return responseText || undefined
  }

  private findPreviousUserTurnIdForElement(element: Element): string | null {
    const currentTurn = element.closest("ms-chat-turn")
    if (!currentTurn) return null

    const sameTurnUserQuery = currentTurn.querySelector(".chat-turn-container.user")
    if (sameTurnUserQuery && !sameTurnUserQuery.contains(element)) {
      return this.normalizeTurnId(currentTurn.id)
    }

    let previousTurn = currentTurn.previousElementSibling
    while (previousTurn) {
      const previousUserQuery = previousTurn.querySelector(".chat-turn-container.user")
      if (previousUserQuery) {
        return this.normalizeTurnId(previousTurn.id)
      }
      previousTurn = previousTurn.previousElementSibling
    }

    return null
  }

  private findUserContentChunk(element: Element): Element | null {
    const selectors = [
      "ms-text-chunk",
      "ms-prompt-chunk.text-chunk",
      "ms-prompt-chunk",
      "ms-cmark-node.cmark-node.user-chunk",
    ]

    for (const selector of selectors) {
      const candidate = element.querySelector(selector)
      if (!candidate) continue

      const text = this.extractTextWithLineBreaks(candidate).trim()
      if (text) {
        return candidate
      }
    }

    return null
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
      userQuerySelector: this.getUserQuerySelector(),
      // AI 回复容器 - 同样只用顶级容器
      assistantResponseSelector: AISTUDIO_ASSISTANT_SELECTOR,
      turnSelector: null,
      useShadowDOM: false,
    }
  }

  getAssistantMermaidSupportMode() {
    return "fallback" as const
  }

  async prepareConversationExport(context: ExportLifecycleContext): Promise<unknown> {
    this.exportIncludeThoughtsOverride = context.includeThoughts
    this.clearExportSnapshot()

    const scrollContainer =
      this.getScrollContainer() || document.querySelector(this.getResponseContainerSelector())
    const exportRoot =
      document.querySelector(this.getResponseContainerSelector()) ||
      document.querySelector("main") ||
      document.body

    const messages =
      scrollContainer instanceof HTMLElement
        ? await this.collectExportMessageSnapshots(scrollContainer)
        : this.readVisibleExportMessageSnapshots(exportRoot)

    if (messages.length === 0) {
      return null
    }

    this.mountExportSnapshot(messages)
    return { count: messages.length }
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    _state: unknown,
  ): Promise<void> {
    this.clearExportSnapshot()
    this.exportIncludeThoughtsOverride = null
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const outline: OutlineItem[] = []

    // AI Studio 整个 main 区域都可能是滚动容器，或者 .chat-container
    const container = document.querySelector(".chat-container") || document.querySelector("main")
    if (!container) return outline

    // 辅助函数：提取 ms-chat-turn 的 ID
    // 格式: turn-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
    // 返回 UUID 部分
    const getTurnId = (el: Element): string | null => {
      const turn = el.closest("ms-chat-turn")
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
      const currentTurn = startEl.closest("ms-chat-turn")
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
        const modelContainer = current.querySelector(
          ".chat-turn-container.model, .chat-turn-container:not(.user)",
        )
        if (modelContainer) {
          // AI Studio 使用 ms-cmark-node 渲染 Markdown
          // 需要排除 ms-thought-chunk 内的思维链内容
          const allMarkdownNodes = modelContainer.querySelectorAll("ms-cmark-node")
          for (const node of Array.from(allMarkdownNodes)) {
            // 跳过思维链内的内容
            if (node.closest("ms-thought-chunk")) continue

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
        if (heading.closest("textarea") || heading.closest(".user-prompt-container")) return
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
            const turnContainer = heading.closest("ms-chat-turn")
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
        const target = (element.closest("ms-chat-turn") || element) as HTMLElement
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

      const activeScrollbarEntry = scrollbarEntries.find(
        (entry) =>
          entry.button.getAttribute("aria-pressed") === "true" ||
          entry.button.classList.contains("ms-button-active"),
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
        if (heading.closest(".user-prompt-container") || heading.closest("textarea")) return
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

          const turnContainer = heading.closest("ms-chat-turn")
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

      return sortedEntries.sort((left, right) => left.order - right.order).map(({ item }) => item)
    }

    const combinedSelector = `${userQuerySelector}, ${headingSelectors.join(", ")}`
    const allElements = Array.from(container.querySelectorAll(combinedSelector))

    allElements.forEach((element, index) => {
      const tagName = element.tagName.toLowerCase()
      // 注意：.chat-turn-container.user 是个 div
      // 所以我们通过 class 来判断是否是 User Query
      const isUserQuery =
        element.classList.contains("user") && element.classList.contains("chat-turn-container")

      if (isUserQuery) {
        const currentTurn = element.closest("ms-chat-turn")
        const item = this.createAIStudioUserQueryOutlineItem(
          this.extractUserQueryText(element),
          element,
          currentTurn?.id,
          showWordCount ? calculateUserQueryWordCount(element) : undefined,
        )

        outline.push(item)
      } else if (/^h[1-6]$/.test(tagName)) {
        // 过滤：避免提取到用户提问里的标题（虽然上面已经针对 .user 容器做了处理，但双重保险）
        if (element.closest(".user-prompt-container") || element.closest("textarea")) return
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
              if (
                candidate.classList.contains("user") &&
                candidate.classList.contains("chat-turn-container")
              ) {
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

            const turnContainer = element.closest("ms-chat-turn")
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

    const directTarget = await super.resolveOutlineTarget(item, queryIndex)
    if (directTarget) {
      return directTarget
    }

    return null
  }

  // ==================== 生成状态检测 ====================

  isGenerating(): boolean {
    // AI Studio 生成状态检测（多语言兼容，不依赖按钮文字）
    // 逻辑：当 ms-run-button 组件存在时，表示 AI 没有在生成
    //      当组件不存在（被替换为停止按钮）时，表示正在生成
    const runButton = document.querySelector("ms-run-button")
    if (runButton) {
      // 运行按钮存在，检查是否可见（offsetParent 不为 null）
      // 如果可见，说明未在生成
      if ((runButton as HTMLElement).offsetParent !== null) {
        return false
      }
    }

    // 补充检测：检查是否有停止按钮（通常是 ms-stop-button 或带 stop 图标的按钮）
    const stopIndicators = [
      "ms-stop-button",
      'button mat-icon[fonticon="stop"]',
      'button .material-symbols-outlined:not([class*="keyboard"])',
      ".mat-progress-spinner",
      ".mat-progress-bar",
    ]

    for (const selector of stopIndicators) {
      const el = document.querySelector(selector)
      if (el && (el as HTMLElement).offsetParent !== null) {
        // 对于 .material-symbols-outlined，需要排除 keyboard_return 图标
        if (selector.includes("material-symbols-outlined")) {
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
    return [
      "ms-stop-button",
      'button:has(mat-icon[fonticon="stop"])',
      'button mat-icon[fonticon="stop"]',
    ]
  }

  // ==================== 模型名称获取 ====================

  /** 获取当前使用的模型名称 */
  getModelName(): string | null {
    // 1. 尝试从 DOM 获取 (最准确)
    const selectorBtn = this.getAIStudioModelSelectorButton()
    if (selectorBtn) {
      const titleSpan = selectorBtn.querySelector("span.title") || selectorBtn.querySelector("span")
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

    sanitized.querySelectorAll(AISTUDIO_THOUGHT_SELECTOR).forEach((node) => node.remove())

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
        `${AISTUDIO_THOUGHT_SELECTOR}, .author-label, .actions-container, button, [role="button"], svg, [aria-hidden="true"]`,
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
    const thoughtChunks = Array.from(element.querySelectorAll(AISTUDIO_THOUGHT_SELECTOR))
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
      .querySelectorAll(
        '.author-label, .actions-container, button, [role="button"], svg, [aria-hidden="true"]',
      )
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
    const nodes = Array.from(root.querySelectorAll("ms-cmark-node"))
    nodes.forEach((node) => {
      if (!(node instanceof HTMLElement) || !node.parentNode) return
      node.replaceWith(...Array.from(node.childNodes))
    })
  }

  private replaceInlineCodeSpans(root: HTMLElement): void {
    root.querySelectorAll(".inline-code").forEach((node) => {
      if (!(node instanceof HTMLElement)) return
      if (node.tagName.toLowerCase() === "code") return

      const code = document.createElement("code")
      code.textContent = node.textContent || ""
      node.replaceWith(code)
    })
  }

  private replaceKatexComponents(root: HTMLElement): void {
    root.querySelectorAll("ms-katex").forEach((node) => {
      if (!(node instanceof HTMLElement)) return

      const latex =
        node.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() || ""
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
    root.querySelectorAll("ms-code-block").forEach((node) => {
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
    const codeElement =
      (element.querySelector("pre code") as HTMLElement | null) ||
      (element.querySelector("pre") as HTMLElement | null)

    const code = codeElement?.textContent?.replace(/\r\n/g, "\n").replace(/\n+$/, "") || ""
    if (!code.trim()) {
      return null
    }

    const languageCandidates = [
      element.getAttribute("data-test-language"),
      element.getAttribute("data-language"),
      element.querySelector(".mat-expansion-panel-header-title .ng-star-inserted:last-child")
        ?.textContent,
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
    const aiMessages = document.querySelectorAll(
      `${AISTUDIO_ASSISTANT_SELECTOR}, .model-prompt-container`,
    )

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

  private async collectExportMessageSnapshots(
    scrollContainer: HTMLElement,
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

        const batch = this.readVisibleExportMessageSnapshots(scrollContainer)
        collected = this.mergeExportMessageBatch(collected, batch)
      }
    } finally {
      scrollContainer.scrollTop = originalScrollTop
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }))
    }

    return this.repairLikelyTruncatedUserSnapshots(collected, scrollContainer)
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
  ): AIStudioExportMessageSnapshot[] {
    const turns = Array.from(container.querySelectorAll(AISTUDIO_TURN_SELECTOR)).filter(
      (turn): turn is HTMLElement =>
        turn instanceof HTMLElement && !turn.closest(`[${AISTUDIO_EXPORT_ROOT_ATTR}]`),
    )

    return turns.flatMap((turn) => this.extractExportSnapshotsFromTurn(turn, container))
  }

  private extractExportSnapshotsFromTurn(
    turn: HTMLElement,
    container: ParentNode,
  ): AIStudioExportMessageSnapshot[] {
    const snapshots: AIStudioExportMessageSnapshot[] = []
    const baseOrder = this.getTurnRenderOrder(turn, container)

    const userContainer = this.getUserContainerForTurn(turn)
    if (userContainer) {
      const content = this.normalizeExportMessageContent(
        this.extractUserQueryMarkdown(userContainer),
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
    const candidates = Array.from(turn.querySelectorAll(".chat-turn-container.user")).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element.closest(AISTUDIO_TURN_SELECTOR) === turn,
    )
    return candidates[0] || null
  }

  private getAssistantFragmentsForTurn(turn: HTMLElement): HTMLElement[] {
    return Array.from(turn.querySelectorAll(AISTUDIO_ASSISTANT_FRAGMENT_SELECTOR)).filter(
      (element): element is HTMLElement => {
        if (!(element instanceof HTMLElement)) return false
        if (element.closest(AISTUDIO_TURN_SELECTOR) !== turn) return false

        const parentFragment = element.parentElement?.closest(AISTUDIO_ASSISTANT_FRAGMENT_SELECTOR)
        return parentFragment?.closest(AISTUDIO_TURN_SELECTOR) !== turn
      },
    )
  }

  private getExportTurnKey(message: Element, role: "user" | "assistant", content: string): string {
    const turnId = message
      .closest("ms-chat-turn")
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

          const batch = this.readVisibleExportMessageSnapshots(scrollContainer)
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
    // AI Studio 新对话按钮选择器（多语言兼容，不依赖按钮文字）
    // 使用 iconname="add" 属性和 material icon 定位
    return [
      'button[iconname="add"]',
      'button[data-test-clear="outside"]',
      'button .material-symbols-outlined[aria-hidden="true"]', // 包含 add 图标的按钮
    ]
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
      const appRoot = document.querySelector("app-root, ms-app, body")
      if (appRoot) {
        appRoot.dispatchEvent(new CustomEvent("themechange", { detail: { theme: targetMode } }))
      }

      return true
    } catch (error) {
      console.error("[AIStudioAdapter] toggleTheme error:", error)
      return false
    }
  }

  // ==================== 应用 Ophel 设置到 AI Studio ====================

  /**
   * 将 Ophel 扩展配置应用到 AI Studio 的 localStorage
   * 在页面加载时调用，用于设置默认界面状态和模型
   * @param settings Ophel 的 AI Studio 设置
   */
  applySettings(settings: AIStudioSettings): void {
    try {
      // 读取现有的 AI Studio 用户偏好
      const prefStr = localStorage.getItem("aiStudioUserPreference") || "{}"
      const pref = JSON.parse(prefStr)

      let hasChanges = false

      // 应用侧边栏折叠设置
      if (settings.collapseNavbar !== undefined) {
        const shouldExpand = !settings.collapseNavbar
        if (pref.isNavbarExpanded !== shouldExpand) {
          pref.isNavbarExpanded = shouldExpand
          hasChanges = true
        }
      }

      // 应用工具面板折叠设置
      if (settings.collapseTools !== undefined) {
        const shouldOpen = !settings.collapseTools
        if (pref.areToolsOpen !== shouldOpen) {
          pref.areToolsOpen = shouldOpen
          hasChanges = true
        }
      }

      // 应用高级设置折叠
      if (settings.collapseAdvanced !== undefined) {
        const shouldOpen = !settings.collapseAdvanced
        if (pref.isAdvancedOpen !== shouldOpen) {
          pref.isAdvancedOpen = shouldOpen
          hasChanges = true
        }
      }

      // 应用搜索工具开关
      if (settings.enableSearch !== undefined) {
        if (pref.enableSearchAsATool !== settings.enableSearch) {
          pref.enableSearchAsATool = settings.enableSearch
          hasChanges = true
        }
      }

      // 应用默认模型
      if (settings.defaultModel && settings.defaultModel.trim() !== "") {
        const modelId = settings.defaultModel.trim()
        // 检查是否需要更新（避免覆盖用户本次会话的选择）
        // 仅当当前模型为空或与默认不同时更新
        if (pref.promptModel !== modelId) {
          pref.promptModel = modelId
          pref._promptModelOverride = modelId
          hasChanges = true
        }
      }

      // 仅当有变化时写入 localStorage
      if (hasChanges) {
        localStorage.setItem("aiStudioUserPreference", JSON.stringify(pref))

        // 触发 storage 事件，让 Angular 感知变化
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "aiStudioUserPreference",
            newValue: JSON.stringify(pref),
            storageArea: localStorage,
          }),
        )
      }
    } catch (error) {
      console.error("[AIStudioAdapter] applySettings error:", error)
    }
  }
}
