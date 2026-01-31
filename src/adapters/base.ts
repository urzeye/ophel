/**
 * 站点适配器基类
 *
 * 每个支持的站点（Gemini/ChatGPT/Claude 等）需要继承此类并实现抽象方法
 */

import { SITE_IDS } from "~constants/defaults"
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
  /** 子菜单触发关键字（可选），如 ["more models", "更多模型", "传统", "legacy"] */
  subMenuTriggers?: string[]
  /** 子菜单选择器（可选），用于语言无关匹配，如 '[aria-haspopup="menu"]' */
  subMenuSelector?: string
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

export interface MarkdownFixerConfig {
  /** 查找段落的选择器，如 "message-content p" */
  selector: string
  /** 是否修复 <span> 内部的内容（AI Studio 需要） */
  fixSpanContent?: boolean
  /** 判断是否应跳过当前元素的修复（例如正在流式生成时） */
  shouldSkip?: (element: HTMLElement) => boolean
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

  /** 检测是否为分享页面（只读） */
  isSharePage(): boolean {
    // 大多数站点的分享链接格式：/share/{id}
    return window.location.pathname.startsWith("/share/")
  }

  /**
   * 获取当前团队 ID（用于会话隔离）
   * 仅在支持多团队的站点（如 Gemini Enterprise）中实现
   * @returns 团队 ID 或 null（无团队/默认团队）
   */
  getCurrentCid(): string | null {
    return null
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

  /**
   * 导航到指定会话（SPA 导航，不刷新页面）
   * 各站点适配器应覆盖此方法实现站点特定的导航逻辑
   * @param id 会话 ID
   * @param url 会话 URL（用于降级硬刷新）
   * @returns 是否成功导航
   */
  navigateToConversation(id: string, url?: string): boolean {
    // 默认实现：直接跳转（刷新页面）
    if (url) {
      window.location.href = url
      return true
    }
    return false
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

  /** 返回用户问题宽度调整的 CSS 选择器列表 */
  getUserQueryWidthSelectors(): Array<{ selector: string; property: string }> {
    return []
  }

  /** 获取 Markdown 修复器配置（子类可覆盖） */
  getMarkdownFixerConfig(): MarkdownFixerConfig | null {
    return null
  }

  // ==================== 输入框操作 ====================

  /** 获取提交按钮选择器 */
  getSubmitButtonSelectors(): string[] {
    return []
  }

  /**
   * 获取发送消息的快捷键配置
   * 子类可覆盖以适配不同平台的发送键设置
   * @returns 发送键配置：key 为 "Enter" 或 "Ctrl+Enter"
   */
  getSubmitKeyConfig(): { key: "Enter" | "Ctrl+Enter" } {
    // 默认使用 Enter 键发送
    return { key: "Enter" }
  }

  /** 查找输入框元素 */
  findTextarea(): HTMLElement | null {
    for (const selector of this.getTextareaSelectors()) {
      const elements = document.querySelectorAll(selector)
      for (const element of Array.from(elements)) {
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

    // 尝试在 iframe 中查找（Gemini 图文并茂模式专用）
    // 只在 Gemini 普通版站点遍历 iframe，其他站点跳过以避免跨域警告
    if (this.getSiteId() === SITE_IDS.GEMINI) {
      const iframes = document.querySelectorAll('iframe[sandbox*="allow-same-origin"]')
      for (const iframe of Array.from(iframes)) {
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
          console.warn("[Ophel] Failed to access iframe:", (e as Error).message)
        }
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

  /**
   * 提取文本，保留块级元素和 <br> 的换行
   * 用于复制用户提问时保留原始格式
   */
  protected extractTextWithLineBreaks(element: Element): string {
    const result: string[] = []
    const blockTags = new Set([
      "div",
      "p",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "pre",
      "blockquote",
      "tr",
      "section",
      "article",
    ])

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        // 文本节点：直接追加
        const text = node.textContent || ""
        result.push(text)
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element
        const tag = el.tagName.toLowerCase()

        // <br> 直接换行
        if (tag === "br") {
          result.push("\n")
          return
        }

        // 遍历子节点
        for (const child of el.childNodes) {
          walk(child)
        }

        // 块级元素结束后加换行（避免连续换行）
        if (blockTags.has(tag) && result.length > 0) {
          const lastChar = result[result.length - 1]
          if (!lastChar.endsWith("\n")) {
            result.push("\n")
          }
        }
      }
    }

    walk(element)

    // 清理：合并连续换行（最多两个），去掉首尾空白
    return result
      .join("")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }

  /** 从用户提问元素中提取文本（保留换行） */
  extractUserQueryText(element: Element): string {
    return this.extractTextWithLineBreaks(element)
  }

  /**
   * 从用户提问元素中提取原始 Markdown 文本
   * 子类可重写以处理特殊的 DOM 结构（如按行拆分、Shadow DOM 等）
   * 默认实现：调用 extractUserQueryText
   */
  extractUserQueryMarkdown(element: Element): string {
    return this.extractUserQueryText(element)
  }

  /**
   * 将渲染后的 HTML 替换到用户提问元素中
   * 子类可重写以处理特殊的 DOM 结构
   * @returns 是否成功替换
   */
  replaceUserQueryContent(element: Element, html: string): boolean {
    // 默认实现：不支持替换
    return false
  }

  /**
   * 从AI回复元素中提取文本（保留换行）
   * 默认实现：直接提取文本,子类可重写以处理特殊结构(如Claude Artifacts)
   */
  extractAssistantResponseText(element: Element): string {
    return this.extractTextWithLineBreaks(element)
  }

  /**
   * 检查元素是否在渲染的 Markdown 容器内
   * 用于大纲抽取时排除用户提问渲染容器中的标题
   */
  isInRenderedMarkdownContainer(element: Element): boolean {
    return element.closest(".gh-user-query-markdown") !== null
  }

  /**
   * 是否使用 Shadow DOM 渲染用户提问
   * 用于决定是否需要延迟处理（等待 Shadow DOM 渲染）
   */
  usesShadowDOM(): boolean {
    return false
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
    for (const h of Array.from(headings)) {
      if (h.textContent?.trim() === text) {
        return h
      }
    }
    return null
  }

  /**
   * 根据 queryIndex 和文本查找用户提问元素
   * 用于大纲跳转时元素失效后的重新查找
   * @param queryIndex 用户提问的序号（从 1 开始）
   * @param text 用户提问文本（用于验证和回退搜索）
   * @returns 匹配的元素，未找到返回 null
   */
  findUserQueryElement(queryIndex: number, text: string): Element | null {
    const selector = this.getUserQuerySelector()
    if (!selector) return null

    const elements = DOMToolkit.query(selector, { all: true, shadow: true }) as Element[]
    if (!elements || elements.length === 0) return null

    // 1. 尝试按索引查找并验证文本
    if (elements.length >= queryIndex) {
      const candidate = elements[queryIndex - 1]
      const candidateText = this.extractUserQueryText(candidate)
      // 验证：文本匹配或包含关系（大纲可能显示截断的文本）
      if (
        candidateText === text ||
        candidateText.startsWith(text) ||
        text.startsWith(candidateText)
      ) {
        return candidate
      }
    }

    // 2. 回退：按文本内容搜索所有用户提问
    for (const el of elements) {
      const elText = this.extractUserQueryText(el)
      if (elText === text || elText.startsWith(text) || text.startsWith(elText)) {
        return el
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

  /** 获取最新回复的文本内容（用于复制功能） */
  getLatestReplyText(): string | null {
    return null
  }

  /** 获取"新对话"按钮的选择器列表 */
  getNewChatButtonSelectors(): string[] {
    return []
  }

  /** 绑定新对话触发事件 */
  bindNewChatListeners(callback: () => void): void {
    // 快捷键监听 (Ctrl + Shift + O)
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "o" || e.key === "O")) {
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

  /**
   * 模拟点击元素（子类可覆盖以适配特殊的点击事件处理）
   * 默认使用 HTMLElement.click()，某些站点（如 ChatGPT）需要完整的 PointerEvent 序列
   */
  protected simulateClick(element: HTMLElement): void {
    element.click()
  }

  /**
   * 点击模型选择器按钮（公开方法，供外部调用）
   * 使用 simulateClick 确保在 Radix UI 等框架中也能正常工作
   * 使用 findElementBySelectors 支持 Shadow DOM 穿透（与 lockModel 一致）
   * @returns 是否成功点击
   */
  clickModelSelector(): boolean {
    const config = this.getModelSwitcherConfig("")
    if (!config || !config.selectorButtonSelectors) {
      return false
    }

    // 使用 findElementBySelectors 穿透 Shadow DOM 查找按钮
    const btn = this.findElementBySelectors(config.selectorButtonSelectors)
    if (btn && btn.offsetParent !== null) {
      this.simulateClick(btn)
      return true
    }
    return false
  }

  /**
   * 通用模型锁定实现（分阶段执行，优化用户体验）
   *
   * 阶段1: 等待按钮出现（最多 10 秒）
   * 阶段2: 检查当前模型是否已是目标
   * 阶段3: 打开菜单搜索（仅一次，失败立即停止）
   * 阶段4: 验证切换成功（最多 3 次）
   */
  lockModel(keyword: string, onSuccess?: () => void): void {
    const config = this.getModelSwitcherConfig(keyword)
    if (!config) return

    const {
      targetModelKeyword,
      selectorButtonSelectors,
      menuItemSelector,
      checkInterval = 1000,
      maxAttempts = 10,
      menuRenderDelay = 500,
      subMenuTriggers = [],
      subMenuSelector,
    } = config

    const normalize = (str: string) => (str || "").toLowerCase().trim()
    const target = normalize(targetModelKeyword)

    let buttonWaitAttempts = 0
    const maxButtonWait = maxAttempts // 等待按钮最多 10 次

    // 阶段1: 等待按钮出现
    const waitForButton = setInterval(() => {
      buttonWaitAttempts++

      const selectorBtn = this.findElementBySelectors(selectorButtonSelectors)

      if (selectorBtn) {
        clearInterval(waitForButton)

        // 阶段2: 检查当前模型
        const currentText = normalize(selectorBtn.textContent || selectorBtn.innerText || "")
        if (currentText.includes(target)) {
          // 已经是目标模型，直接成功
          if (onSuccess) onSuccess()
          return
        }

        // 阶段3: 打开菜单搜索
        this.performMenuSearch(
          selectorBtn,
          target,
          menuItemSelector,
          menuRenderDelay,
          subMenuTriggers,
          subMenuSelector,
          onSuccess,
        )
      } else if (buttonWaitAttempts >= maxButtonWait) {
        clearInterval(waitForButton)
        console.warn(`Ophel: Model selector button not found after ${maxButtonWait} attempts.`)
        this.showModelLockFailure(targetModelKeyword, "button_not_found")
      }
    }, checkInterval)
  }

  /**
   * 执行菜单搜索（仅执行一次，不重复打开关闭）
   */
  private performMenuSearch(
    selectorBtn: HTMLElement,
    target: string,
    menuItemSelector: string,
    menuRenderDelay: number,
    subMenuTriggers: string[],
    subMenuSelector: string | undefined,
    onSuccess?: () => void,
  ): void {
    const normalize = (str: string) => (str || "").toLowerCase().trim()

    // 打开菜单
    this.simulateClick(selectorBtn)

    setTimeout(() => {
      const menuItems = this.findAllElementsBySelector(menuItemSelector)

      if (menuItems.length === 0) {
        // 菜单可能还没加载，短暂等待再试一次
        setTimeout(() => {
          const retryItems = this.findAllElementsBySelector(menuItemSelector)
          if (retryItems.length === 0) {
            document.body.click()
            console.warn(`Ophel: Menu items not found.`)
            this.showModelLockFailure(target, "menu_empty")
            return
          }
          this.searchAndSelectModel(
            retryItems,
            target,
            menuItemSelector,
            menuRenderDelay,
            subMenuTriggers,
            subMenuSelector,
            onSuccess,
          )
        }, menuRenderDelay)
        return
      }

      this.searchAndSelectModel(
        menuItems,
        target,
        menuItemSelector,
        menuRenderDelay,
        subMenuTriggers,
        subMenuSelector,
        onSuccess,
      )
    }, menuRenderDelay)
  }

  /**
   * 在菜单项中搜索并选择目标模型
   */
  private searchAndSelectModel(
    menuItems: Element[],
    target: string,
    menuItemSelector: string,
    menuRenderDelay: number,
    subMenuTriggers: string[],
    subMenuSelector: string | undefined,
    onSuccess?: () => void,
  ): void {
    const normalize = (str: string) => (str || "").toLowerCase().trim()

    // 1. 在主菜单中查找（优先精确匹配）
    const matchedItem = this.findBestMatchingItem(menuItems, target)
    if (matchedItem) {
      this.simulateClick(matchedItem as HTMLElement)
      setTimeout(() => {
        document.body.click()
        if (onSuccess) onSuccess()
      }, 100)
      return
    }

    // 2. 尝试子菜单
    // 优先使用 selector（语言无关），文字匹配作为备选
    let subMenuItem: Element | undefined

    // 2a. 优先通过 selector 查找（如 aria-haspopup="menu"）
    if (subMenuSelector) {
      subMenuItem = menuItems.find((item) => item.matches(subMenuSelector))
    }

    // 2b. 备选：通过文字关键字匹配
    if (!subMenuItem && subMenuTriggers.length > 0) {
      subMenuItem = menuItems.find((item) => {
        const text = normalize(item.textContent || "")
        return subMenuTriggers.some((trigger) => text.includes(normalize(trigger)))
      })
    }

    if (subMenuItem) {
      this.simulateClick(subMenuItem as HTMLElement)

      setTimeout(() => {
        const subItems = this.findAllElementsBySelector(menuItemSelector)
        const matchedSubItem = this.findBestMatchingItem(subItems, target)
        if (matchedSubItem) {
          this.simulateClick(matchedSubItem as HTMLElement)
          setTimeout(() => {
            document.body.click()
            if (onSuccess) onSuccess()
          }, 100)
          return
        }

        // 子菜单中也没找到
        document.body.click()
        console.warn(`Ophel: Model "${target}" not found in sub-menu.`)
        this.showModelLockFailure(target, "not_found")
      }, menuRenderDelay)
      return
    }

    // 3. 主菜单和子菜单都没找到
    document.body.click()
    console.warn(`Ophel: Model "${target}" not found in menu.`)
    this.showModelLockFailure(target, "not_found")
  }

  /**
   * 查找最佳匹配的菜单项
   * 匹配优先级：精确匹配 > 结尾匹配 > 包含匹配
   * 这确保 "gpt-5.1" 会匹配 "GPT-5.1" 而不是 "GPT-5.1 Instant"
   */
  private findBestMatchingItem(menuItems: Element[], target: string): Element | undefined {
    const normalize = (str: string) => (str || "").toLowerCase().trim()

    // 优先级1: 精确匹配（文本完全相等，或去掉描述后相等）
    for (const item of menuItems) {
      const itemText = normalize(item.textContent || (item as HTMLElement).innerText || "")
      // 有些菜单项包含描述文字，提取第一行/主要文本
      const mainText = itemText.split("\n")[0].trim()
      if (mainText === target || itemText === target) {
        return item
      }
    }

    // 优先级2: 结尾匹配（目标是菜单项文本的结尾部分）
    // 例如 target="5.1" 匹配 "gpt-5.1" 但不匹配 "gpt-5.1 instant"
    for (const item of menuItems) {
      const itemText = normalize(item.textContent || (item as HTMLElement).innerText || "")
      const mainText = itemText.split("\n")[0].trim()
      if (mainText.endsWith(target)) {
        return item
      }
    }

    // 优先级3: 包含匹配（作为最后的备选）
    for (const item of menuItems) {
      const itemText = normalize(item.textContent || (item as HTMLElement).innerText || "")
      if (itemText.includes(target)) {
        return item
      }
    }

    return undefined
  }

  /**
   * 显示模型锁定失败的 Toast 提示
   */
  private async showModelLockFailure(
    keyword: string,
    reason: "button_not_found" | "menu_empty" | "not_found",
  ): Promise<void> {
    try {
      const { showToast } = await import("~utils/toast")
      const { t } = await import("~utils/i18n")

      let message: string
      switch (reason) {
        case "button_not_found":
          message = t("modelLockFailedNoButton") || `模型选择器未找到`
          break
        case "menu_empty":
          message = t("modelLockFailedMenuEmpty") || `模型菜单加载失败`
          break
        case "not_found":
        default:
          message = (t("modelLockFailedNotFound") || `未找到模型 "{model}"`).replace(
            "{model}",
            keyword,
          )
      }

      showToast(message, 3000)
    } catch (e) {
      // Toast 加载失败时静默处理
      console.error("Ophel: Failed to show toast:", e)
    }
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
      this.lockModel(modelLockConfig.keyword)
    }
  }

  /** 判断是否应该将样式注入到指定的 Shadow Host 中 */
  shouldInjectIntoShadow(host: Element): boolean {
    return true
  }
}
