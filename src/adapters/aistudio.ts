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
import type { AIStudioSettings } from "~utils/storage"

import {
  SiteAdapter,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type MarkdownFixerConfig,
  type OutlineItem,
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

const DEFAULT_TITLE = "Google AI Studio"

export class AIStudioAdapter extends SiteAdapter {
  // ==================== 缓存属性 ====================

  // 缓存从 library 页面抓取的会话列表
  private cachedLibraryConversations: ConversationInfo[] | null = null

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

  getSessionName(): string | null {
    // 从页面标题获取
    const title = document.title
    if (title && !title.includes(DEFAULT_TITLE)) {
      return title.replace(` | ${DEFAULT_TITLE}`, "").trim()
    }
    return super.getSessionName()
  }

  getConversationTitle(): string | null {
    // 尝试从页面标题获取
    const title = document.title
    if (title && !title.includes(DEFAULT_TITLE)) {
      return title.replace(` | ${DEFAULT_TITLE}`, "").trim()
    }
    return null
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
    // Run 按钮
    return [
      'button[aria-label="Run"]',
      'button:has-text("Run")',
      ".ms-button-primary",
      'button[class*="run"]',
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
    ]
  }

  getMarkdownFixerConfig(): MarkdownFixerConfig {
    return {
      selector: "ms-cmark-node span.ng-star-inserted",
      fixSpanContent: true,
    }
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
      const selectorBtn = document.querySelector("button.model-selector-card") as HTMLElement

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
        const toggleBtn = document.querySelector(
          'button[aria-label="Toggle run settings panel"]',
        ) as HTMLElement
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
    let modelSelectorBtn = document.querySelector("button.model-selector-card") as HTMLElement

    // 如果按钮不存在，尝试检查是否是因为面板被收起了
    if (!modelSelectorBtn) {
      const toggleBtn = document.querySelector(
        'button[aria-label="Toggle run settings panel"]',
      ) as HTMLElement
      if (toggleBtn) {
        wasCollapsed = true
        toggleBtn.click()

        // 等待面板展开和按钮出现
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 200))
          modelSelectorBtn = document.querySelector("button.model-selector-card") as HTMLElement
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

    // 4. 抓取模型列表
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
      // 不在 library 页面时，点击"查看所有历史"按钮进行 SPA 跳转
      const viewAllBtn = document.querySelector(
        'a.view-all-history-link[href="/library"]',
      ) as HTMLAnchorElement
      if (viewAllBtn) {
        viewAllBtn.click()
        // 等待 library 页面 DOM 加载
        await this.waitForLibraryTable()
      } else {
        // 降级：直接导航
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
   * 等待 library 页面表格加载完成
   */
  private async waitForLibraryTable(): Promise<boolean> {
    // 最多等待 5 秒
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      const table = document.querySelector("ms-library-table table tbody tr")
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
      const title = link.textContent?.trim() || "Untitled"

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
    // AI Studio 左侧边栏历史记录区域
    // 优先查找包含历史记录的 aside 元素
    const aside = document.querySelector("aside")
    if (aside) return aside
    return null
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    return {
      // 精确匹配侧边栏中的会话链接（带有 prompt-link 类）
      selector: 'a.prompt-link[href*="/prompts/"]:not([href*="new_chat"])',
      // 开启 shadow 以启用轮询机制
      // AI Studio 使用 Angular 数据绑定，标题变更可能绕过 MutationObserver
      // 轮询可以作为后备检测标题变更
      shadow: true,
      extractInfo: (el: Element) => {
        const href = el.getAttribute("href")
        if (!href) return null

        const match = href.match(/\/prompts\/([^/]+)/)
        if (!match) return null

        const id = match[1]
        const title = el.textContent?.trim() || "Untitled"

        return { id, title, url: href, isPinned: false }
      },
      getTitleElement: (el: Element) => {
        // 链接本身就是标题元素
        return el
      },
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    // 尝试找到页面中的对应链接并点击（SPA 跳转，避免页面刷新）
    // 侧边栏：a.prompt-link[href*="/prompts/ID"]
    // Library 页面表格：a.name-btn[href*="/prompts/ID"]
    const link = document.querySelector(
      `a.prompt-link[href*="/prompts/${id}"], a.name-btn[href*="/prompts/${id}"]`,
    ) as HTMLAnchorElement
    if (link) {
      link.click()
      return true
    }
    // 降级：页面刷新
    window.location.href = url || `/prompts/${id}`
    return true
  }

  // ==================== 大纲提取 ====================

  getUserQuerySelector(): string {
    // 用户消息容器 - 只使用顶级容器，避免父子级重复匹配
    // AI Studio DOM 结构：.chat-turn-container.user > .user-prompt-container > .turn-content > ms-prompt-chunk
    return ".chat-turn-container.user"
  }

  // 用户文本缓存（解决虚拟滚动导致的文本丢失）
  private textCache = new Map<string, string>()
  private lastSessionIdForCache: string | null = null

  extractUserQueryText(element: Element): string {
    // 检查会话变更并清理缓存
    const currentSessionId = this.getSessionId()
    if (this.lastSessionIdForCache !== currentSessionId) {
      this.textCache.clear()
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
    const contentChunk = element.querySelector("ms-prompt-chunk.text-chunk, ms-prompt-chunk")
    if (contentChunk) {
      extractedText = contentChunk.textContent?.trim() || ""
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

  getExportConfig(): ExportConfig | null {
    return {
      userQuerySelector: this.getUserQuerySelector(),
      // AI 回复容器 - 同样只用顶级容器
      assistantResponseSelector: ".chat-turn-container.model",
      turnSelector: ".chat-turn-container",
      useShadowDOM: false,
    }
  }

  extractOutline(maxLevel = 6, includeUserQueries = false): OutlineItem[] {
    const outline: OutlineItem[] = []
    const container = document.querySelector(this.getResponseContainerSelector())
    if (!container) return outline

    // 不包含用户提问时，只提取标题
    if (!includeUserQueries) {
      const headingSelectors: string[] = []
      for (let i = 1; i <= maxLevel; i++) {
        headingSelectors.push(`h${i}`)
      }

      const headings = container.querySelectorAll(headingSelectors.join(", "))
      headings.forEach((heading) => {
        if (this.isInRenderedMarkdownContainer(heading)) return
        const level = parseInt(heading.tagName.charAt(1), 10)
        if (level <= maxLevel) {
          outline.push({
            level,
            text: heading.textContent?.trim() || "",
            element: heading,
          })
        }
      })
      return outline
    }

    // 包含用户提问的模式
    const userQuerySelector = this.getUserQuerySelector()
    const headingSelectors: string[] = []
    for (let i = 1; i <= maxLevel; i++) {
      headingSelectors.push(`h${i}`)
    }

    const combinedSelector = `${userQuerySelector}, ${headingSelectors.join(", ")}`
    const allElements = container.querySelectorAll(combinedSelector)

    allElements.forEach((element) => {
      const tagName = element.tagName.toLowerCase()
      const isUserQuery = element.matches(userQuerySelector)

      if (isUserQuery) {
        let queryText = this.extractUserQueryText(element)
        let isTruncated = false
        if (queryText.length > 200) {
          queryText = queryText.substring(0, 200)
          isTruncated = true
        }

        outline.push({
          level: 0,
          text: queryText,
          element,
          isUserQuery: true,
          isTruncated,
        })
      } else if (/^h[1-6]$/.test(tagName)) {
        if (this.isInRenderedMarkdownContainer(element)) return
        const level = parseInt(tagName.charAt(1), 10)
        if (level <= maxLevel) {
          outline.push({
            level,
            text: element.textContent?.trim() || "",
            element,
          })
        }
      }
    })

    return outline
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

  // ==================== 模型名称获取 ====================

  /** 获取当前使用的模型名称 */
  getModelName(): string | null {
    // 1. 尝试从 DOM 获取 (最准确)
    const selectorBtn = document.querySelector("button.model-selector-card")
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
    } catch (e) {
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

  getLatestReplyText(): string | null {
    // AI 回复容器
    const aiMessages = document.querySelectorAll(
      ".chat-turn-container.model, .model-prompt-container",
    )
    if (aiMessages.length === 0) return null

    const lastMessage = aiMessages[aiMessages.length - 1]
    return this.extractTextWithLineBreaks(lastMessage)
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
