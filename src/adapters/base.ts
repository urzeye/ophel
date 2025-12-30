/**
 * 站点适配器基类
 *
 * 每个支持的站点（Gemini/ChatGPT/Claude 等）需要继承此类并实现抽象方法
 */

import { DOMToolkit } from "~utils/dom-toolkit"

// ==================== 类型定义 ====================

export interface OutlineItem {
  level: number
  text: string
  element: Element | null
  isUserQuery?: boolean
  isTruncated?: boolean
}

export interface ConversationInfo {
  id: string
  title: string
  url: string
  isActive?: boolean
  isPinned?: boolean
  cid?: string
}

export interface NetworkMonitorConfig {
  urlPatterns: string[]
  silenceThreshold: number
}

export interface ModelSwitcherConfig {
  targetModelKeyword: string
  selectorButtonSelectors: string[]
  menuItemSelector: string
  checkInterval?: number
  maxAttempts?: number
  menuRenderDelay?: number
}

export interface ExportConfig {
  userQuerySelector: string
  assistantResponseSelector: string
  turnSelector: string | null
  useShadowDOM: boolean
}

export interface ConversationObserverConfig {
  selector: string
  shadow: boolean
  extractInfo: (el: Element) => ConversationInfo | null
  getTitleElement: (el: Element) => Element | null
}

export interface AnchorData {
  type: "selector" | "index"
  selector?: string
  index?: number
  offset: number
  textSignature?: string
}

// ==================== SiteAdapter 基类 ====================

export abstract class SiteAdapter {
  protected textarea: HTMLElement | null = null
  protected _cachedFlutterScrollContainer: HTMLElement | null = null

  // ==================== 必须实现的方法 ====================

  /** 检测当前页面是否匹配该站点 */
  abstract match(): boolean

  /** 返回站点标识符（用于配置存储） */
  abstract getSiteId(): string

  /** 返回站点显示名称 */
  abstract getName(): string

  /** 返回站点主题色 */
  abstract getThemeColors(): { primary: string; secondary: string }

  /** 返回输入框选择器列表 */
  abstract getTextareaSelectors(): string[]

  /** 向输入框插入内容 */
  abstract insertPrompt(content: string): boolean

  // ==================== 会话相关 ====================

  /** 获取当前会话 ID */
  getSessionId(): string {
    const urlWithoutQuery = window.location.href.split("?")[0]
    const parts = urlWithoutQuery.split("/").filter((p) => p)
    return parts.length > 0 ? parts[parts.length - 1] : "default"
  }

  /** 是否支持在新标签页打开新对话 */
  supportsNewTab(): boolean {
    return true
  }

  /** 获取新标签页打开的 URL */
  getNewTabUrl(): string {
    return window.location.origin
  }

  /** 是否支持标签页重命名 */
  supportsTabRename(): boolean {
    return true
  }

  /** 获取当前会话名称（用于标签页重命名） */
  getSessionName(): string | null {
    const title = document.title
    if (title) {
      const parts = title.split(" - ")
      if (parts.length > 1) {
        return parts.slice(0, -1).join(" - ").trim()
      }
      return title.trim()
    }
    return null
  }

  /** 获取当前侧边栏选中会话的标题 */
  abstract getConversationTitle(): string | null

  /** 判断当前是否处于新对话页面 */
  isNewConversation(): boolean {
    return false
  }

  /** 获取侧边栏会话列表 */
  getConversationList(): ConversationInfo[] {
    return []
  }

  /** 获取侧边栏滚动容器 */
  getSidebarScrollContainer(): Element | null {
    return null
  }

  /** 获取会话观察器配置 */
  getConversationObserverConfig(): ConversationObserverConfig | null {
    return null
  }

  /** 滚动加载全部会话 */
  async loadAllConversations(): Promise<void> {
    const container = this.getSidebarScrollContainer()
    if (!container) return

    let lastCount = 0
    let stableRounds = 0
    const maxStableRounds = 3

    while (stableRounds < maxStableRounds) {
      container.scrollTop = container.scrollHeight
      await new Promise((r) => setTimeout(r, 500))

      // 使用 DOMToolkit 穿透 Shadow DOM 查询会话数量
      const conversations =
        (DOMToolkit.query(".conversation", { all: true, shadow: true }) as Element[]) || []
      const currentCount = conversations.length
      if (currentCount === lastCount) {
        stableRounds++
      } else {
        lastCount = currentCount
        stableRounds = 0
      }
    }
  }

  // ==================== 生成状态检测 ====================

  /** 检测 AI 是否正在生成响应 */
  isGenerating(): boolean {
    return false
  }

  /** 获取当前使用的模型名称 */
  getModelName(): string | null {
    return null
  }

  /** 获取网络监控配置 */
  getNetworkMonitorConfig(): NetworkMonitorConfig | null {
    return null
  }

  /**
   * 切换站点主题（子类可覆盖以实现站点特定的主题切换逻辑）
   * @param targetMode 目标主题模式
   * @returns 是否成功切换
   */
  async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
    // 基类默认不处理，交给 ThemeManager 直接操作 DOM
    return false
  }

  // ==================== 页面宽度控制 ====================

  /** 返回需要加宽的 CSS 选择器列表 */
  getWidthSelectors(): Array<{ selector: string; property: string }> {
    return []
  }

  // ==================== 输入框操作 ====================

  /** 获取提交按钮选择器 */
  getSubmitButtonSelectors(): string[] {
    return []
  }

  /** 查找输入框元素 */
  findTextarea(): HTMLElement | null {
    for (const selector of this.getTextareaSelectors()) {
      const elements = document.querySelectorAll(selector)
      for (const element of elements) {
        if (this.isValidTextarea(element as HTMLElement)) {
          this.textarea = element as HTMLElement
          return element as HTMLElement
        }
      }
    }
    return null
  }

  /** 验证输入框是否有效 */
  isValidTextarea(element: HTMLElement): boolean {
    return element.offsetParent !== null
  }

  /** 清空输入框内容 */
  clearTextarea(): void {
    if (this.textarea) {
      if (
        this.textarea instanceof HTMLInputElement ||
        this.textarea instanceof HTMLTextAreaElement
      ) {
        this.textarea.value = ""
      } else {
        this.textarea.textContent = ""
      }
      this.textarea.dispatchEvent(new Event("input", { bubbles: true }))
    }
  }

  /** 获取输入框元素（用于外部获取输入框位置） */
  getTextareaElement(): HTMLElement | null {
    // 如果已缓存的输入框仍然有效，直接返回
    if (this.textarea && this.textarea.isConnected) {
      return this.textarea
    }
    // 否则重新查找
    return this.findTextarea()
  }

  // ==================== 滚动控制 ====================

  /** 获取滚动容器 */
  getScrollContainer(): HTMLElement | null {
    const selectors = [
      "infinite-scroller.chat-history",
      ".chat-mode-scroller",
      "main",
      '[role="main"]',
      ".conversation-container",
      ".chat-container",
      "div.content-container",
    ]

    for (const selector of selectors) {
      const container = document.querySelector(selector) as HTMLElement
      if (container && container.scrollHeight > container.clientHeight) {
        this._cachedFlutterScrollContainer = null
        return container
      }
    }

    // 检查缓存的 Flutter 容器是否仍然有效
    if (this._cachedFlutterScrollContainer && this._cachedFlutterScrollContainer.isConnected) {
      return this._cachedFlutterScrollContainer
    }

    // 尝试在 iframe 中查找（Gemini 图文并茂模式）
    const iframes = document.querySelectorAll('iframe[sandbox*="allow-same-origin"]')
    for (const iframe of iframes) {
      try {
        const iframeDoc =
          (iframe as HTMLIFrameElement).contentDocument ||
          (iframe as HTMLIFrameElement).contentWindow?.document
        if (iframeDoc) {
          const scrollContainer = iframeDoc.querySelector(
            'flt-semantics[style*="overflow-y: scroll"]:not([style*="overflow-x: scroll"])',
          ) as HTMLElement
          if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
            this._cachedFlutterScrollContainer = scrollContainer
            return scrollContainer
          }
        }
      } catch (e) {
        console.warn("[Chat Helper] Failed to access iframe:", (e as Error).message)
      }
    }

    return null
  }

  /** 获取当前视口中可见的锚点元素信息 */
  getVisibleAnchorElement(): AnchorData | null {
    const container = this.getScrollContainer()
    if (!container) return null

    const scrollTop = container.scrollTop
    const selectors = this.getChatContentSelectors()
    if (!selectors.length) return null

    const candidates = Array.from(container.querySelectorAll(selectors.join(", ")))
    if (!candidates.length) return null

    let bestElement: Element | null = null

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i] as HTMLElement
      const top = el.offsetTop

      if (top <= scrollTop + 100) {
        bestElement = el
      } else {
        break
      }
    }

    if (!bestElement && candidates.length > 0) bestElement = candidates[0]

    if (bestElement) {
      const offset = scrollTop - (bestElement as HTMLElement).offsetTop
      const id = bestElement.getAttribute("data-message-id") || bestElement.id

      if (id) {
        let selector = `[data-message-id="${id}"]`
        if (!bestElement.matches(selector)) selector = `#${id}`
        return { type: "selector", selector, offset }
      } else {
        const globalIndex = candidates.indexOf(bestElement)
        if (globalIndex !== -1) {
          const textSignature = (bestElement.textContent || "").trim().substring(0, 50)
          return { type: "index", index: globalIndex, offset, textSignature }
        }
      }
    }
    return null
  }

  /** 根据保存的锚点信息恢复滚动 */
  restoreScroll(anchorData: AnchorData): boolean {
    const container = this.getScrollContainer()
    if (!container || !anchorData) return false

    let targetElement: Element | null = null

    if (anchorData.type === "selector" && anchorData.selector) {
      targetElement = container.querySelector(anchorData.selector)
    } else if (anchorData.type === "index" && typeof anchorData.index === "number") {
      const selectors = this.getChatContentSelectors()
      const candidates = Array.from(container.querySelectorAll(selectors.join(", ")))

      if (candidates[anchorData.index]) {
        targetElement = candidates[anchorData.index]

        if (anchorData.textSignature) {
          const currentText = (targetElement.textContent || "").trim().substring(0, 50)
          if (currentText !== anchorData.textSignature) {
            const found = candidates.find(
              (c) => (c.textContent || "").trim().substring(0, 50) === anchorData.textSignature,
            )
            if (found) targetElement = found
          }
        }
      } else if (anchorData.textSignature) {
        const found = candidates.find(
          (c) => (c.textContent || "").trim().substring(0, 50) === anchorData.textSignature,
        )
        if (found) targetElement = found
      }
    }

    if (targetElement) {
      const targetTop = (targetElement as HTMLElement).offsetTop + (anchorData.offset || 0)
      container.scrollTo({
        top: targetTop,
        behavior: "instant" as ScrollBehavior,
      })
      return true
    }
    return false
  }

  // ==================== 大纲提取 ====================

  /** 获取对话历史容器的选择器 */
  getResponseContainerSelector(): string {
    return ""
  }

  /** 获取聊天内容元素的选择器列表 */
  getChatContentSelectors(): string[] {
    return []
  }

  /** 获取用户提问元素的选择器 */
  getUserQuerySelector(): string | null {
    return null
  }

  /** 从用户提问元素中提取文本 */
  extractUserQueryText(element: Element): string {
    return element.textContent?.trim() || ""
  }

  /** 从页面提取大纲 */
  extractOutline(maxLevel = 6, includeUserQueries = false): OutlineItem[] {
    return []
  }

  /**
   * 根据标题级别和文本查找元素（支持 Shadow DOM 穿透）
   * 用于大纲跳转时元素失效后的重新查找
   * @param level 标题级别 (1-6)
   * @param text 标题文本内容
   * @returns 匹配的元素，未找到返回 null
   */
  findElementByHeading(level: number, text: string): Element | null {
    // 默认实现：使用 document.querySelectorAll（子类可覆盖以支持 Shadow DOM）
    const headings = document.querySelectorAll(`h${level}`)
    for (const h of headings) {
      if (h.textContent?.trim() === text) {
        return h
      }
    }
    return null
  }

  /** 是否支持滚动锁定功能 */
  supportsScrollLock(): boolean {
    return false
  }

  /** 获取导出配置 */
  getExportConfig(): ExportConfig | null {
    return null
  }

  // ==================== 新对话监听 ====================

  /** 获取"新对话"按钮的选择器列表 */
  getNewChatButtonSelectors(): string[] {
    return []
  }

  /** 绑定新对话触发事件 */
  bindNewChatListeners(callback: () => void): void {
    // 快捷键监听 (Ctrl + Shift + O)
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "o" || e.key === "O")) {
        console.log(`[${this.getName()}] New chat shortcut detected.`)
        setTimeout(callback, 500)
      }
    })

    // 按钮点击监听
    document.addEventListener(
      "click",
      (e) => {
        const selectors = this.getNewChatButtonSelectors()
        if (selectors.length === 0) return

        const path = e.composedPath()
        for (const target of path) {
          if (target === document || target === window) break

          for (const selector of selectors) {
            if ((target as Element).matches && (target as Element).matches(selector)) {
              console.log(`[${this.getName()}] New chat button clicked.`)
              setTimeout(callback, 500)
              return
            }
          }
        }
      },
      true,
    )
  }

  // ==================== 模型锁定 ====================

  /** 获取默认的模型锁定设置 */
  getDefaultLockSettings(): { enabled: boolean; keyword: string } {
    return { enabled: false, keyword: "" }
  }

  /** 获取模型锁定配置 */
  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    return null
  }

  /** 通用模型锁定实现 */
  lockModel(keyword: string, onSuccess?: () => void): void {
    const config = this.getModelSwitcherConfig(keyword)
    if (!config) return

    const {
      targetModelKeyword,
      selectorButtonSelectors,
      menuItemSelector,
      checkInterval = 1500,
      maxAttempts = 20,
      menuRenderDelay = 500,
    } = config

    let attempts = 0
    let isSelecting = false
    const normalize = (str: string) => (str || "").toLowerCase().trim()
    const target = normalize(targetModelKeyword)

    const timer = setInterval(() => {
      attempts++
      if (attempts > maxAttempts) {
        console.warn(`Chat Helper: Model lock timed out for "${targetModelKeyword}"`)
        clearInterval(timer)
        return
      }

      if (isSelecting) return

      const selectorBtn = this.findElementBySelectors(selectorButtonSelectors)
      if (!selectorBtn) return

      const currentText = selectorBtn.textContent || selectorBtn.innerText || ""
      if (normalize(currentText).includes(target)) {
        console.log(`Chat Helper: Model is already locked to "${targetModelKeyword}"`)
        clearInterval(timer)
        if (onSuccess) onSuccess()
        return
      }

      isSelecting = true
      selectorBtn.click()

      setTimeout(() => {
        const menuItems = this.findAllElementsBySelector(menuItemSelector)

        if (menuItems.length > 0) {
          let found = false

          for (const item of menuItems) {
            const itemText = item.textContent || (item as HTMLElement).innerText || ""
            if (normalize(itemText).includes(target)) {
              ;(item as HTMLElement).click()
              found = true
              clearInterval(timer)
              console.log(`Chat Helper: Switched to model "${targetModelKeyword}"`)
              setTimeout(() => {
                document.body.click()
                if (onSuccess) onSuccess()
              }, 100)
              break
            }
          }

          if (!found) {
            console.warn(
              `Chat Helper: Target model "${targetModelKeyword}" not found in menu. Aborting.`,
            )
            clearInterval(timer)
            document.body.click()
            isSelecting = false
          }
        } else {
          isSelecting = false
          document.body.click()
        }
      }, menuRenderDelay)
    }, checkInterval)
  }

  /** 通过选择器列表查找单个元素（支持 Shadow DOM 穿透） */
  findElementBySelectors(selectors: string[]): HTMLElement | null {
    return DOMToolkit.query(selectors, { shadow: true }) as HTMLElement | null
  }

  /** 通过选择器查找所有元素（支持 Shadow DOM 穿透） */
  findAllElementsBySelector(selector: string): Element[] {
    return (DOMToolkit.query(selector, { all: true, shadow: true }) as Element[]) || []
  }

  // ==================== 生命周期 ====================

  /** 页面加载完成后执行 */
  afterPropertiesSet(
    options: { modelLockConfig?: { enabled: boolean; keyword: string } } = {},
  ): void {
    const { modelLockConfig } = options
    if (modelLockConfig && modelLockConfig.enabled) {
      console.log(`[${this.getName()}] Triggering auto model lock:`, modelLockConfig.keyword)
      this.lockModel(modelLockConfig.keyword)
    }
  }

  /** 判断是否应该将样式注入到指定的 Shadow Host 中 */
  shouldInjectIntoShadow(host: Element): boolean {
    return true
  }
}
