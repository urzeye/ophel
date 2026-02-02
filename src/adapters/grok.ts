/**
 * Grok 适配器（grok.com 独立站点）
 *
 * 选择器策略：
 * - 使用 data-* 属性（如 data-sidebar）- 稳定
 * - 使用语义化 CSS 类名（如 .tiptap.ProseMirror）- 稳定，Tailwind 命名
 * - 使用元素 ID（如 #model-select-trigger）- 稳定
 * - 使用标准 HTML 属性（如 contenteditable, type="submit"）
 *
 * 主题机制：
 * - localStorage.getItem("theme") 存储 "light" | "dark" | "system"
 * - document.documentElement.classList 包含 "light" 或 "dark"
 * - document.documentElement.style.colorScheme 同步
 */
import { SITE_IDS } from "~constants"
import { DOMToolkit } from "~utils/dom-toolkit"

import {
  SiteAdapter,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
} from "./base"

const DEFAULT_TITLE = "Grok"

export class GrokAdapter extends SiteAdapter {
  match(): boolean {
    // 匹配 grok.com 独立站点
    const hostname = window.location.hostname
    return hostname === "grok.com" || hostname.endsWith(".grok.com")
  }

  getSiteId(): string {
    return SITE_IDS.GROK
  }

  getName(): string {
    return "Grok"
  }

  getThemeColors(): { primary: string; secondary: string } {
    // Grok 官方主题色
    return { primary: "#f39c12", secondary: "#1e1f22" }
  }

  getNewTabUrl(): string {
    return "https://grok.com/"
  }

  isNewConversation(): boolean {
    const path = window.location.pathname
    // 根路径是新对话页面
    return path === "/" || path === ""
  }

  // 缓存弹窗中的会话数据（用于同步时弹窗已关闭的情况）
  private cachedDialogConversations: Map<string, ConversationInfo> | null = null

  async loadAllConversations(): Promise<void> {
    const sidebar = document.querySelector('[data-sidebar="content"]')
    if (!sidebar) return

    // 使用 CSS 类特征定位"查看全部"按钮，避免依赖文本
    // 特征：button, w-full, justify-start, text-xs, text-secondary
    // 这些 Tailwind 类名描述了按钮的视觉样式（全宽、左对齐、小字体、次要颜色），相对稳定
    const viewAllBtn = sidebar.querySelector(
      "button.w-full.justify-start.text-xs.text-secondary.font-semibold",
    )

    if (viewAllBtn) {
      // 显示同步提示
      const { showToast } = await import("~utils/toast")
      const { t } = await import("~utils/i18n")
      showToast(t("grokSyncingConversations") || "正在同步会话，请稍候...")
      ;(viewAllBtn as HTMLElement).click()

      // 轮询等待对话框出现（最多 3 秒）
      let cmdkList: Element | null = null
      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        cmdkList = document.querySelector('[cmdk-list-sizer=""], [cmdk-list]')
        if (cmdkList) break
      }

      // 多次滚动，确保虚拟列表加载全部内容
      if (cmdkList) {
        let prevHeight = 0
        let stableCount = 0
        const maxAttempts = 15

        for (let i = 0; i < maxAttempts; i++) {
          cmdkList.scrollTop = cmdkList.scrollHeight
          await new Promise((resolve) => setTimeout(resolve, 400))

          const currentHeight = cmdkList.scrollHeight
          if (currentHeight === prevHeight) {
            stableCount++
            // 连续3次高度不变，认为已加载完毕
            if (stableCount >= 3) break
          } else {
            stableCount = 0
            prevHeight = currentHeight
          }
        }
      }

      // 在关闭弹窗之前，缓存弹窗中的所有会话
      // 这样 getConversationList 在弹窗关闭后仍然可以返回这些数据
      this.cacheDialogConversations()

      // 自动关闭弹窗：模拟按下 ESC 键
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      )

      // 5 秒后清除缓存，确保后续调用使用实时数据
      setTimeout(() => {
        this.cachedDialogConversations = null
      }, 5000)

      return
    }
  }

  /** 缓存弹窗中的会话数据 */
  private cacheDialogConversations(): void {
    const cache = new Map<string, ConversationInfo>()

    // 扫描所有 cmdk 对话框中的会话链接
    const allLinks = document.querySelectorAll('a[href^="/c/"]')
    allLinks.forEach((link) => {
      const href = link.getAttribute("href")
      if (!href) return

      const id = href.replace("/c/", "")
      if (cache.has(id)) return

      let title = "New Chat"
      let isActive = false
      const isPinned = false

      // 识别 cmdk 对话框项
      const cmdkItem = link.closest("[cmdk-item]")
      if (cmdkItem) {
        const titleSpan = cmdkItem.querySelector("span.truncate")
        title = titleSpan?.textContent?.trim() || title
        isActive = cmdkItem.querySelector('[class*="border-border-l2"]') !== null
      } else {
        title = link.textContent?.trim() || title
      }

      cache.set(id, {
        id,
        title,
        url: href,
        isPinned,
        isActive,
      })
    })

    this.cachedDialogConversations = cache
  }

  // ==================== 会话管理 ====================

  getConversationList(): ConversationInfo[] {
    const conversationMap = new Map<string, ConversationInfo>()

    // 1. 优先扫描侧边栏（获取置顶状态）
    const sidebar = document.querySelector('[data-sidebar="content"]')
    if (sidebar) {
      const groups = sidebar.querySelectorAll('[data-sidebar="group"]')
      groups.forEach((group) => {
        // 侧边栏中的链接
        const links = group.querySelectorAll('a[href^="/c/"]')
        if (links.length === 0) return

        // 置顶判断：没有 sticky 日期标题的分组
        const hasStickyDateHeader = group.querySelector(".sticky") !== null
        const isPinnedGroup = !hasStickyDateHeader

        links.forEach((link) => {
          const href = link.getAttribute("href")
          if (!href) return

          const id = href.replace("/c/", "")
          // 侧边栏标题提取：a > span
          const titleSpan = link.querySelector("span.flex-1, span.truncate, span")
          const title = titleSpan?.textContent?.trim() || link.textContent?.trim() || "New Chat"
          const isActive = link.classList.contains("bg-button-ghost-hover")

          conversationMap.set(id, {
            id,
            title,
            url: href,
            isPinned: isPinnedGroup,
            isActive,
          })
        })
      })
    }

    // 2. 扫描所有会话链接（补充对话框中的会话）
    // 这能捕获"查看全部"对话框中的会话，无论选择器细节如何
    const allLinks = document.querySelectorAll('a[href^="/c/"]')
    allLinks.forEach((link) => {
      const href = link.getAttribute("href")
      if (!href) return

      const id = href.replace("/c/", "")
      if (conversationMap.has(id)) return // 已从侧边栏获取，跳过

      // 处理对话框（或其他位置）的会话
      let title = "New Chat"
      let isActive = false
      const isPinned = false // 侧边栏以外默认不置顶

      // 尝试识别 cmdk 对话框项
      // 结构: div[cmdk-item] > a (empty) + div > ... > span.truncate
      const cmdkItem = link.closest("[cmdk-item]")
      if (cmdkItem) {
        // 对话框标题提取：cmdk-item 内部查找
        const titleSpan = cmdkItem.querySelector("span.truncate")
        title = titleSpan?.textContent?.trim() || title
        // 对话框激活状态：检查 current 标签
        isActive = cmdkItem.querySelector('[class*="border-border-l2"]') !== null
      } else {
        // 其他情况的回退提取
        title = link.textContent?.trim() || title
      }

      conversationMap.set(id, {
        id,
        title,
        url: href,
        isPinned,
        isActive,
      })
    })

    // 3. 合并缓存的弹窗会话数据（用于弹窗已关闭但缓存未过期的情况）
    if (this.cachedDialogConversations) {
      this.cachedDialogConversations.forEach((conv, id) => {
        if (!conversationMap.has(id)) {
          conversationMap.set(id, conv)
        }
      })
    }

    return Array.from(conversationMap.values())
  }

  getSidebarScrollContainer(): Element | null {
    // 侧边栏内容区域使用 data-sidebar="content" 属性
    return document.querySelector('[data-sidebar="content"]')
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    return {
      // 同时匹配侧边栏和 cmdk 对话框中的会话链接
      // - 侧边栏：[data-sidebar="content"] a[href^="/c/"]
      // - 对话框：[cmdk-item][data-value^="conversation:"] a[href^="/c/"]
      selector:
        '[data-sidebar="content"] a[href^="/c/"], [cmdk-item][data-value^="conversation:"] a[href^="/c/"]',
      shadow: false,
      extractInfo: (el: Element) => {
        const href = el.getAttribute("href")
        if (!href) return null
        const id = href.replace("/c/", "")

        // 判断来源：侧边栏还是对话框
        const isFromSidebar = !!el.closest('[data-sidebar="content"]')
        const isFromCmdk = !!el.closest("[cmdk-item]")

        let title = ""
        let isPinned = false

        if (isFromSidebar) {
          const titleSpan = el.querySelector("span.flex-1, span.truncate, span")
          title = titleSpan?.textContent?.trim() || el.textContent?.trim() || ""
          // 通过检查分组是否有 sticky 日期标题判断置顶（语言无关）
          const group = el.closest('[data-sidebar="group"]')
          const hasStickyDateHeader = group?.querySelector(".sticky") !== null
          isPinned = !hasStickyDateHeader
        } else if (isFromCmdk) {
          const cmdkItem = el.closest("[cmdk-item]")
          const titleSpan = cmdkItem?.querySelector("span.truncate")
          title = titleSpan?.textContent?.trim() || ""
          isPinned = false // 对话框中无法判断置顶
        }

        return { id, title, url: href, isPinned }
      },
      getTitleElement: (el: Element) => {
        // 优先从对话框 cmdk-item 中找
        const cmdkItem = el.closest("[cmdk-item]")
        if (cmdkItem) {
          return cmdkItem.querySelector("span.truncate") || el
        }
        // 否则从侧边栏找
        return el.querySelector("span.flex-1, span.truncate, span") || el
      },
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    if (url) {
      window.location.href = url
      return true
    }
    // 使用正确的 /c/ 路径格式
    window.location.href = `/c/${id}`
    return true
  }

  getSessionName(): string | null {
    // 从页面标题获取
    const title = document.title
    if (title && title !== DEFAULT_TITLE) {
      return title.replace(` - ${DEFAULT_TITLE}`, "").trim()
    }
    return super.getSessionName()
  }

  getConversationTitle(): string | null {
    // 尝试从页面标题获取
    const title = document.title
    if (title && title !== DEFAULT_TITLE) {
      return title.replace(` - ${DEFAULT_TITLE}`, "").trim()
    }
    return null
  }

  getNewChatButtonSelectors(): string[] {
    // 新对话按钮通常在侧边栏顶部
    return [
      'a[href="/"]',
      '[data-sidebar="header"] a',
      'button[aria-label*="新"]',
      'button[aria-label*="New"]',
    ]
  }

  getLatestReplyText(): string | null {
    // AI 回复：没有 rounded-br-lg 的 .message-bubble（用户消息有此类）
    const aiMessages = document.querySelectorAll(".message-bubble:not(.rounded-br-lg)")
    if (aiMessages.length === 0) return null

    // 获取最后一个 AI 回复
    const lastMessage = aiMessages[aiMessages.length - 1]

    // 从 .response-content-markdown 提取内容
    const contentContainer = lastMessage.querySelector(".response-content-markdown")
    if (contentContainer) {
      return this.extractTextWithLineBreaks(contentContainer)
    }

    return this.extractTextWithLineBreaks(lastMessage)
  }

  // ==================== 页面宽度控制 ====================

  // ==================== 页面宽度控制 ====================

  getWidthSelectors() {
    // Grok 使用 CSS 变量 --content-max-width 控制主内容区域宽度
    // 该变量定义在包含响应式断点的容器上
    return [
      {
        selector: '[class*="--content-max-width"]',
        property: "--content-max-width",
      },
    ]
  }

  getUserQueryWidthSelectors() {
    // Grok 用户消息气泡使用 .message-bubble.rounded-br-lg 类
    // 默认有 max-w-[100%] 和响应式 @sm/mainview:max-w-[90%]
    return [
      {
        selector: ".message-bubble.rounded-br-lg",
        property: "max-width",
      },
    ]
  }

  // ==================== 输入框操作 ====================

  getTextareaSelectors(): string[] {
    // Grok 使用 Tiptap 富文本编辑器
    return [
      ".tiptap.ProseMirror[contenteditable='true']",
      '[contenteditable="true"].ProseMirror',
      ".query-bar [contenteditable='true']",
      "form [contenteditable='true']",
    ]
  }

  getSubmitButtonSelectors(): string[] {
    // 发送按钮是 type="submit" 的按钮
    return [
      'button[type="submit"]',
      'form button[type="submit"]',
      '.query-bar button[type="submit"]',
    ]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (element.offsetParent === null) return false
    if (element.closest(".gh-main-panel")) return false
    // 必须是 contenteditable 的元素
    return element.getAttribute("contenteditable") === "true"
  }

  insertPrompt(content: string): boolean {
    const editor = this.textarea
    if (!editor) return false

    if (!editor.isConnected) {
      this.textarea = null
      return false
    }

    editor.focus()

    // Tiptap 编辑器使用 contenteditable
    if (editor.getAttribute("contenteditable") === "true") {
      // 清空现有内容并插入新内容
      editor.innerHTML = `<p>${content}</p>`
      // 触发 input 事件通知 Tiptap
      editor.dispatchEvent(new Event("input", { bubbles: true }))
      // 将光标移到末尾
      const selection = window.getSelection()
      if (selection) {
        const range = document.createRange()
        range.selectNodeContents(editor)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
      }
      return true
    }

    return false
  }

  clearTextarea(): void {
    if (!this.textarea) return
    if (!this.textarea.isConnected) {
      this.textarea = null
      return
    }

    this.textarea.focus()
    if (this.textarea.getAttribute("contenteditable") === "true") {
      // 清空 Tiptap 编辑器
      this.textarea.innerHTML =
        '<p class="is-empty is-editor-empty"><br class="ProseMirror-trailingBreak"></p>'
      this.textarea.dispatchEvent(new Event("input", { bubbles: true }))
    }
  }

  // ==================== 滚动容器 ====================

  getScrollContainer(): HTMLElement | null {
    // 主内容区域的滚动容器
    const main = document.querySelector("main")
    if (main) {
      // 查找可滚动的子元素
      const scrollable = main.querySelector('[class*="overflow-auto"]') as HTMLElement
      if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
        return scrollable
      }
      // 或者 main 本身可滚动
      if (main.scrollHeight > main.clientHeight) {
        return main as HTMLElement
      }
    }

    // 回退：查找任何大的可滚动容器
    const containers = document.querySelectorAll(
      '[class*="overflow-y-auto"], [class*="overflow-auto"]',
    )
    for (const container of Array.from(containers)) {
      const el = container as HTMLElement
      if (el.scrollHeight > el.clientHeight + 100) {
        return el
      }
    }

    return null
  }

  getResponseContainerSelector(): string {
    return "main"
  }

  getChatContentSelectors(): string[] {
    // 消息内容使用 prose 类名
    return ['[class*="prose"]', '[dir="ltr"]']
  }

  // ==================== 大纲提取 ====================

  getUserQuerySelector(): string {
    // 用户消息气泡特征：.message-bubble 且有右下角圆角 rounded-br-lg
    // 这是区分用户消息和 AI 消息的关键特征
    return ".message-bubble.rounded-br-lg"
  }

  extractUserQueryText(element: Element): string {
    return this.extractTextWithLineBreaks(element)
  }

  extractUserQueryMarkdown(element: Element): string {
    // Grok 用户消息结构：
    // .message-bubble.rounded-br-lg > div.relative > div.relative > .response-content-markdown
    // 内部直接是 <p> 标签，需要提取文本并还原 Markdown
    const markdownContainer = element.querySelector(".response-content-markdown")
    if (markdownContainer) {
      // 提取所有 <p> 标签的文本，用换行连接
      const paragraphs = markdownContainer.querySelectorAll("p")
      if (paragraphs.length > 0) {
        return Array.from(paragraphs)
          .map((p) => p.textContent?.trim() || "")
          .filter((text) => text.length > 0)
          .join("\n\n")
      }
    }
    return element.textContent?.trim() || ""
  }

  replaceUserQueryContent(element: Element, html: string): boolean {
    // Grok 用户消息结构：
    // .message-bubble.rounded-br-lg > div.relative > div.relative > .response-content-markdown
    // 内部直接是 <p> 标签，没有 .whitespace-pre-wrap 容器
    const markdownContainer = element.querySelector(".response-content-markdown")
    if (!markdownContainer) return false

    // 检查是否已经处理过
    if (markdownContainer.querySelector(".gh-user-query-markdown")) {
      return false
    }

    // 保存原始内容的引用（用于恢复）
    const originalContent = Array.from(markdownContainer.children)

    // 创建原内容包装器并隐藏
    const originalWrapper = document.createElement("div")
    originalWrapper.className = "gh-user-query-original"
    originalWrapper.style.display = "none"
    originalContent.forEach((child) => {
      originalWrapper.appendChild(child)
    })
    markdownContainer.appendChild(originalWrapper)

    // 创建渲染容器
    const rendered = document.createElement("div")
    rendered.className = "gh-user-query-markdown gh-markdown-preview"
    rendered.innerHTML = html

    // 插入到 markdownContainer 开头
    markdownContainer.insertBefore(rendered, originalWrapper)
    return true
  }

  getExportConfig(): ExportConfig | null {
    // 配置导出功能
    // 注意：这里的选择器是基于推测的，后续可能需要根据实际 DOM 调整
    return {
      userQuerySelector: this.getUserQuerySelector(),
      // AI 回复：没有 rounded-br-lg 的 .message-bubble（用户消息有此类）
      assistantResponseSelector: ".message-bubble:not(.rounded-br-lg) .response-content-markdown",
      turnSelector: "", // 不使用 turn 选择器，直接通过 user/assistant 选择器匹配
      useShadowDOM: false,
    }
  }

  extractOutline(maxLevel = 6, includeUserQueries = false): OutlineItem[] {
    const outline: OutlineItem[] = []
    const container = document.querySelector(this.getResponseContainerSelector())
    if (!container) return outline

    // 辅助：获取消息 ID (Response ID)
    const getResponseId = (el: Element): string | null => {
      // 往上找 id 以 response- 开头的 div
      const responseDiv = el.closest('[id^="response-"]')
      if (responseDiv) {
        return responseDiv.id
      }
      return null
    }

    // 辅助：生成标题 ID
    const msgHeaderCounts: Record<string, Record<string, number>> = {}
    const generateHeaderId = (msgId: string, tagName: string, text: string): string => {
      if (!msgHeaderCounts[msgId]) msgHeaderCounts[msgId] = {}
      const key = `${tagName}-${text}`
      const count = msgHeaderCounts[msgId][key] || 0
      msgHeaderCounts[msgId][key] = count + 1
      return `${msgId}::${key}::${count}`
    }

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
          const item: OutlineItem = {
            level,
            text: heading.textContent?.trim() || "",
            element: heading,
          }

          // Stable ID for Headings
          const msgId = getResponseId(heading)
          if (msgId) {
            const tagName = heading.tagName.toLowerCase()
            item.id = generateHeaderId(msgId, tagName, item.text)
          }

          outline.push(item)
        }
      })
      return outline
    }

    // 包含用户提问的模式：按 DOM 顺序遍历用户提问和标题
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

        const item: OutlineItem = {
          level: 0,
          text: queryText,
          element,
          isUserQuery: true,
          isTruncated,
        }

        // Stable ID for User Query
        const msgId = getResponseId(element)
        if (msgId) {
          item.id = msgId
        }

        outline.push(item)
      } else if (/^h[1-6]$/.test(tagName)) {
        if (this.isInRenderedMarkdownContainer(element)) return
        const level = parseInt(tagName.charAt(1), 10)
        if (level <= maxLevel) {
          const item: OutlineItem = {
            level,
            text: element.textContent?.trim() || "",
            element,
          }

          // Stable ID for Headings
          const msgId = getResponseId(element)
          if (msgId) {
            item.id = generateHeaderId(msgId, tagName, item.text)
          }

          outline.push(item)
        }
      }
    })

    return outline
  }

  // ==================== 生成状态检测 ====================

  isGenerating(): boolean {
    // 检查是否有停止按钮可见
    const stopButton = document.querySelector(
      'button[aria-label*="停止"], button[aria-label*="Stop"]',
    )
    if (stopButton && (stopButton as HTMLElement).offsetParent !== null) {
      return true
    }

    // 检查是否有加载动画
    const loading = document.querySelector('[class*="loading"], [class*="animate-pulse"]')
    if (loading && (loading as HTMLElement).offsetParent !== null) {
      return true
    }

    return false
  }

  getModelName(): string | null {
    // 使用稳定的模型选择器按钮 ID
    const modelBtn = document.querySelector("#model-select-trigger")
    if (modelBtn) {
      // 模型名称在按钮内部的 span 中
      const span = modelBtn.querySelector(".font-semibold")
      if (span) {
        return span.textContent?.trim() || null
      }
      return modelBtn.textContent?.trim() || null
    }
    return null
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig | null {
    // 精准匹配 Grok 的流式 API 路径
    // 接口格式：/rest/app-chat/conversations/{id}/responses
    // 该接口使用 NDJSON 流式输出，通过 isSoftStop: true 标记生成结束
    return {
      urlPatterns: ["rest/app-chat/conversations"],
      silenceThreshold: 500,
    }
  }

  // ==================== 模型锁定 ====================

  getDefaultLockSettings(): { enabled: boolean; keyword: string } {
    return { enabled: false, keyword: "" }
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig | null {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: ["#model-select-trigger"],
      menuItemSelector: '[role="menuitem"], [role="option"]',
      checkInterval: 1000,
      maxAttempts: 15,
      menuRenderDelay: 500,
    }
  }

  /**
   * 覆盖点击模拟方法
   * Grok 使用 Radix UI，需要完整的 PointerEvent 序列才能触发菜单
   */
  protected simulateClick(element: HTMLElement): void {
    const eventTypes = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]
    for (const type of eventTypes) {
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 1,
        }),
      )
    }
  }

  // ==================== 主题切换 ====================

  /**
   * 切换 Grok 主题
   * Grok 使用 localStorage("theme") 和 document.documentElement.classList 控制主题
   * @param targetMode 目标主题模式
   */
  async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
    try {
      // 更新 localStorage
      localStorage.setItem("theme", targetMode)

      // 更新 document.documentElement 的类
      document.documentElement.classList.remove("light", "dark")
      document.documentElement.classList.add(targetMode)

      // 更新 color-scheme
      document.documentElement.style.colorScheme = targetMode

      // 触发 storage 事件以通知其他可能监听的代码
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "theme",
          newValue: targetMode,
          storageArea: localStorage,
        }),
      )

      return true
    } catch (error) {
      console.error("[GrokAdapter] toggleTheme error:", error)
      return false
    }
  }
}
