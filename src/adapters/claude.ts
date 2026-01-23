/**
 * Claude.ai 适配器
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

export class ClaudeAdapter extends SiteAdapter {
  match(): boolean {
    return (
      window.location.hostname.includes("claude.ai") ||
      window.location.hostname.includes("claude.com")
    )
  }

  getSiteId(): string {
    return SITE_IDS.CLAUDE
  }

  getName(): string {
    return "Claude"
  }

  getThemeColors(): { primary: string; secondary: string } {
    // Claude 品牌色 (Terracotta/Orange)
    return { primary: "#d97757", secondary: "#c66045" }
  }

  getNewTabUrl(): string {
    return "https://claude.ai/new"
  }

  isNewConversation(): boolean {
    return window.location.pathname === "/new" || window.location.pathname === "/"
  }

  isSharePage(): boolean {
    // Claude 分享链接示例：https://claude.ai/public/artifacts/xxx
    return window.location.pathname.startsWith("/public/")
  }

  // ==================== 会话管理 ====================

  getConversationList(): ConversationInfo[] {
    // 侧边栏会话列表
    // Selector: a[data-dd-action-name="sidebar-chat-item"]
    const items = document.querySelectorAll('a[data-dd-action-name="sidebar-chat-item"]')

    return Array.from(items)
      .map((el) => {
        const href = el.getAttribute("href") || ""
        // href 格式: /chat/c44e44c0-913a-4fbe-b4f8-d346fd0b7eff
        const idMatch = href.match(/\/chat\/([a-f0-9-]+)/)
        const id = idMatch ? idMatch[1] : ""

        // 标题在 span 中
        const titleSpan = el.querySelector("span.truncate")
        const title = titleSpan?.textContent?.trim() || ""

        // 激活状态: 检查是否有激活样式或aria-current (需验证,暂时简单判断URL)
        const isActive = window.location.href.includes(id)

        // 判断是否收藏(Starred):
        // 核心特征:
        // 1. Starred分组的h3没有role="button"(不可折叠)
        // 2. Starred分组的ul有-mx-1.5类
        // 通过语义化属性判断,比纯样式类更稳定,不依赖文字内容,支持国际化
        let isPinned = false
        const groupContainer = el.closest("div.flex.flex-col")
        if (groupContainer) {
          // 检查1: h3是否没有role属性(Starred不可折叠,Recents有role="button")
          const h3 = groupContainer.querySelector("h3")
          const isNonCollapsible = h3 && !h3.hasAttribute("role")

          // 检查2: ul是否有Starred特有的-mx-1.5类
          const ul = groupContainer.querySelector("ul")
          const hasStarredClass = ul?.classList.contains("-mx-1.5")

          // 任一条件满足即为收藏会话
          isPinned = isNonCollapsible || hasStarredClass
        }

        return {
          id,
          title,
          url: href.startsWith("http") ? href : `https://claude.ai${href}`,
          isActive,
          isPinned,
        }
      })
      .filter((c) => c.id)
  }

  getSidebarScrollContainer(): Element | null {
    // 侧边栏导航容器
    const nav = document.querySelector("nav")
    if (nav) {
      // 侧边栏通常在 nav 内的某个可滚动 div 中
      // 根据 structure: nav > div > div > div[class*="overflow-y-auto"]
      const scrollable = nav.querySelector("div.overflow-y-auto")
      return scrollable || nav
    }
    return null
  }

  // ==================== 输入框操作 ====================

  getTextareaSelectors(): string[] {
    return ['[contenteditable="true"]', ".ProseMirror", 'div[role="textbox"]']
  }

  getSubmitButtonSelectors(): string[] {
    return [
      'button[aria-label="Send Message"]',
      'button[data-testid="send-button"]',
      'button[aria-label="Send"]',
    ]
  }

  insertPrompt(content: string): boolean {
    const editor = this.getTextareaElement()
    if (!editor) return false

    editor.focus()

    // Claude 使用 ProseMirror/ContentEditable，execCommand 通常是最稳妥的
    try {
      // 选中已有内容
      document.execCommand("selectAll", false, undefined)
      // 插入新内容
      if (!document.execCommand("insertText", false, content)) {
        throw new Error("execCommand failed")
      }
    } catch (e) {
      // 降级: 直接 DOM 操作
      editor.textContent = content
      editor.dispatchEvent(new Event("input", { bubbles: true }))
    }
    return true
  }

  clearTextarea(): void {
    const editor = this.getTextareaElement()
    if (!editor) return

    editor.focus()
    // 尝试清空
    try {
      document.execCommand("selectAll", false, undefined)
      document.execCommand("delete", false, undefined)
    } catch (e) {
      editor.textContent = ""
    }
    // 触发 input 事件通知 React/框架
    editor.dispatchEvent(new Event("input", { bubbles: true }))
  }

  getConversationTitle(): string | null {
    // 尝试获取侧边栏激活项的标题
    // Selector: a[data-dd-action-name="sidebar-chat-item"] active??
    // 暂时通过 URL 匹配来找 active
    const currentId = this.getSessionId()
    if (currentId && currentId !== "default") {
      const activeItem = document.querySelector(`a[href*="${currentId}"]`)
      if (activeItem) {
        return activeItem.querySelector("span.truncate")?.textContent?.trim() || null
      }
    }
    return null
  }

  getScrollContainer(): HTMLElement | null {
    // 聊天内容滚动容器
    // 根据 MHTML: #main-content > div ...
    // 通常是 flex-1 h-full overflow-y-scroll
    const mainContent = document.getElementById("main-content")
    if (mainContent) {
      const scrollable = mainContent.querySelector(".overflow-y-scroll")
      if (scrollable) return scrollable as HTMLElement
    }
    return super.getScrollContainer()
  }

  getChatContentSelectors(): string[] {
    return ['div[data-testid="user-message"]', "div.font-claude-response"]
  }

  // ==================== 模型管理 ====================

  getModelName(): string | null {
    // 尝试从模型选择器获取
    const selectorBtn = document.querySelector('button[data-testid="model-selector-dropdown"]')
    if (selectorBtn && selectorBtn.textContent) {
      return selectorBtn.textContent.trim()
    }
    return null
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: ['button[data-testid="model-selector-dropdown"]'],
      menuItemSelector: 'div[role="menuitem"]',
      checkInterval: 1000,
      maxAttempts: 20,
      // 语言无关：通过 aria-haspopup 检测子菜单触发器
      subMenuSelector: '[aria-haspopup="menu"]',
      // 文字备选（多语言）
      subMenuTriggers: ["more models", "更多模型"],
    }
  }

  /**
   * Claude 使用 Radix UI，可能需要模拟 PointerEvent
   */
  protected simulateClick(element: HTMLElement): void {
    // 尝试标准点击，如果不行再切 PointerEvent (参考 ChatGPT 实现)
    // 目前先用标准点击，若有问题需参考 ChatGPTAdapter 的 simulateClick
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

  // ==================== 杂项 ====================

  getNewChatButtonSelectors(): string[] {
    return ['a[data-dd-action-name="sidebar-new-item"]', 'a[href="/new"]']
  }

  getDefaultLockSettings(): { enabled: boolean; keyword: string } {
    return { enabled: false, keyword: "sonnet" }
  }

  // ==================== 大纲功能 ====================

  extractOutline(maxLevel = 6, includeUserQueries = false): OutlineItem[] {
    const outline: OutlineItem[] = []
    const scrollContainer = this.getScrollContainer()
    if (!scrollContainer) return outline

    // Claude 的标题在 AI 回复中，有 text-text-100 class
    // 排除侧边栏的 H3 (RecentsHide 等)
    const headings = scrollContainer.querySelectorAll("h1, h2, h3, h4, h5, h6")

    headings.forEach((h) => {
      const level = parseInt(h.tagName[1])
      if (level > maxLevel) return

      // 跳过侧边栏分组标题
      if (h.classList.contains("pointer-events-none")) return

      const text = h.textContent?.trim() || ""
      if (!text) return

      outline.push({
        level,
        text: text.length > 80 ? text.slice(0, 77) + "..." : text,
        element: h,
        isUserQuery: false,
        isTruncated: text.length > 80,
      })
    })

    // 可选：包含用户问题
    if (includeUserQueries) {
      const userQueries = scrollContainer.querySelectorAll('[data-testid="user-message"]')
      userQueries.forEach((el) => {
        const text = el.textContent?.trim() || ""
        if (!text) return

        outline.push({
          level: 0,
          text: text.length > 60 ? text.slice(0, 57) + "..." : text,
          element: el,
          isUserQuery: true,
          isTruncated: text.length > 60,
        })
      })

      // 按 DOM 顺序排序
      outline.sort((a, b) => {
        if (!a.element || !b.element) return 0
        const pos = a.element.compareDocumentPosition(b.element)
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      })
    }

    return outline
  }

  // ==================== 生成状态 ====================

  isGenerating(): boolean {
    // 方法1: 检查 Stop 按钮 (aria-label="Stop response")
    const stopBtn = document.querySelector('button[aria-label="Stop response"]')
    if (stopBtn) return true

    // 方法2: 检查流式输出指示器
    const streaming = document.querySelector('[class*="streaming"], [class*="typing"]')
    if (streaming) return true

    return false
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
    return {
      // Claude API 请求模式
      // 主要是 /api/organizations/.../completion
      urlPatterns: ["/api/", "/completion"],
      silenceThreshold: 500,
    }
  }

  // ==================== 导出功能 ====================

  getExportConfig(): ExportConfig {
    return {
      userQuerySelector: '[data-testid="user-message"]',
      assistantResponseSelector: ".font-claude-response",
      turnSelector: null, // Claude 不使用 turn 容器
      useShadowDOM: false,
    }
  }

  getLatestReplyText(): string | null {
    const responses = document.querySelectorAll(".font-claude-response")
    if (responses.length === 0) return null

    const lastResponse = responses[responses.length - 1]

    // 过滤掉Artifact卡片,只提取.standard-markdown或.progressive-markdown
    const markdownContent = lastResponse.querySelector(".standard-markdown, .progressive-markdown")
    if (markdownContent) {
      return markdownContent.textContent?.trim() || null
    }

    // 降级:如果没有markdown容器,返回整个内容(兼容旧版本)
    return lastResponse.textContent?.trim() || null
  }

  getResponseContainerSelector(): string {
    return ".font-claude-response"
  }

  // ==================== 用户问题处理 ====================

  getUserQuerySelector(): string {
    return '[data-testid="user-message"]'
  }

  extractUserQueryText(element: Element): string {
    return element.textContent?.trim() || ""
  }

  extractUserQueryMarkdown(element: Element): string {
    // Claude 对用户输入已经部分渲染了 Markdown（blockquote, ul, pre）
    // 但标题和加粗没有渲染，仍然是纯文本在 <p class="whitespace-pre-wrap"> 中
    // 我们需要提取需要增强的 <p> 元素的文本

    // 检查是否有包含未渲染 Markdown 的 <p> 元素
    const textParagraphs = element.querySelectorAll("p.whitespace-pre-wrap")
    if (textParagraphs.length === 0) {
      return ""
    }

    // 收集需要渲染的段落内容
    const paragraphsToRender: string[] = []
    textParagraphs.forEach((p) => {
      const text = p.textContent || ""
      // 检查是否包含未渲染的 Markdown：标题、加粗、斜体
      const hasUnrendered =
        /^#{1,6}\s/m.test(text) || // 标题
        /\*\*[^*]+\*\*/.test(text) || // 加粗
        /\*[^*]+\*/.test(text) // 斜体

      if (hasUnrendered) {
        paragraphsToRender.push(text)
      }
    })

    // 如果没有需要渲染的段落，返回空
    if (paragraphsToRender.length === 0) {
      return ""
    }

    // 返回一个能通过 looksLikeMarkdown 检查的字符串
    // looksLikeMarkdown 需要：包含换行 + 命中 Markdown 模式
    // 实际渲染逻辑在 replaceUserQueryContent 中处理
    return "# CLAUDE_INCREMENTAL\nplaceholder"
  }

  replaceUserQueryContent(element: Element, _html: string): boolean {
    // Claude 增量增强策略：
    // 只替换 <p class="whitespace-pre-wrap"> 中未渲染的 Markdown
    // 保留 Claude 已渲染的 <blockquote>, <ul>, <pre> 等

    // 检查是否已经处理过
    if (element.querySelector(".gh-claude-enhanced")) {
      return false
    }

    const textParagraphs = element.querySelectorAll("p.whitespace-pre-wrap")
    if (textParagraphs.length === 0) return false

    let hasChanges = false

    textParagraphs.forEach((p) => {
      const text = p.textContent || ""

      // 检查是否包含未渲染的 Markdown
      const hasHeaders = /^#{1,6}\s/m.test(text)
      const hasBold = /\*\*[^*]+\*\*/.test(text)
      const hasItalic = /(?<!\*)\*(?!\*)[^*]+\*(?!\*)/.test(text)

      if (!hasHeaders && !hasBold && !hasItalic) {
        return // 这个段落不需要处理
      }

      // 渲染这个段落的 Markdown
      let html = text

      // 处理标题（多行情况）
      html = html.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, content) => {
        const level = hashes.length
        // 使用 Claude 的标题样式
        const sizeClass =
          level === 1 ? "text-[1.375rem]" : level === 2 ? "text-[1.125rem]" : "text-base"
        return `<h${level} class="text-text-100 mt-2 -mb-1 ${sizeClass} font-bold">${content}</h${level}>`
      })

      // 处理加粗
      html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")

      // 处理斜体（注意不要匹配加粗）
      html = html.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, "<em>$1</em>")

      // 处理换行（保持 whitespace-pre-wrap 行为）
      // 将连续的换行转为 <br>，单个换行保留
      html = html
        .split("\n")
        .map((line) => {
          // 如果这行已经是 HTML 标签开头，不加 br
          if (line.startsWith("<h") || line.trim() === "") return line
          return line
        })
        .join("<br>")

      // 创建替换元素
      const rendered = document.createElement("div")
      rendered.className = "gh-claude-enhanced whitespace-pre-wrap break-words"
      rendered.innerHTML = html

      // 替换原始 <p> 元素
      p.replaceWith(rendered)
      hasChanges = true
    })

    return hasChanges
  }

  /**
   * 提取AI回复文本,过滤Artifact卡片但标注其存在
   * Claude特有:Artifacts以卡片形式嵌入在回复中,需要特殊处理
   */
  extractAssistantResponseText(element: Element): string {
    let result = ""

    // 检查是否有Artifacts卡片
    const artifacts = element.querySelectorAll(".artifact-block-cell")
    if (artifacts.length > 0) {
      artifacts.forEach((artifact) => {
        // 提取标题
        const titleElem = artifact.querySelector(".line-clamp-1")
        const title = titleElem?.textContent?.trim() || "Untitled"

        // 提取版本信息
        const versionElem = artifact.querySelector(".text-text-400")
        const version = versionElem?.textContent?.trim()

        // 尝试查找下载链接(可能在同级或父级元素的菜单中)
        // 下载菜单通常需要点击才会出现,所以可能找不到
        const downloadLink = element.querySelector('a[download][href^="blob:"]')
        const link = downloadLink?.getAttribute("href")

        // 构建Artifact标注
        if (link) {
          result += `\n[Artifact: ${title}${version ? ` - ${version}` : ""} | Download: ${link}]\n\n`
        } else {
          result += `\n[Artifact: ${title}${version ? ` - ${version}` : ""}]\n\n`
        }
      })
    }

    // 提取正常回复内容(在.standard-markdown或.progressive-markdown中)
    const markdownContent = element.querySelector(".standard-markdown, .progressive-markdown")
    if (markdownContent) {
      result += markdownContent.textContent?.trim() || ""
    }

    return result.trim()
  }

  // ==================== 会话观察器 ====================

  getConversationObserverConfig(): ConversationObserverConfig {
    return {
      selector: 'a[data-dd-action-name="sidebar-chat-item"]',
      shadow: false,
      extractInfo: (el: Element): ConversationInfo | null => {
        const href = el.getAttribute("href") || ""
        const idMatch = href.match(/\/chat\/([a-f0-9-]+)/)
        const id = idMatch ? idMatch[1] : ""
        if (!id) return null

        const titleSpan = el.querySelector("span.truncate")
        const title = titleSpan?.textContent?.trim() || ""

        // 判断是否收藏(与getConversationList逻辑一致)
        let isPinned = false
        const groupContainer = el.closest("div.flex.flex-col")
        if (groupContainer) {
          const h3 = groupContainer.querySelector("h3")
          const isNonCollapsible = h3 && !h3.hasAttribute("role")
          const ul = groupContainer.querySelector("ul")
          const hasStarredClass = ul?.classList.contains("-mx-1.5")
          isPinned = isNonCollapsible || hasStarredClass
        }

        return {
          id,
          title,
          url: `https://claude.ai${href}`,
          isActive: window.location.href.includes(id),
          isPinned,
        }
      },
      getTitleElement: (el: Element): Element | null => {
        return el.querySelector("span.truncate")
      },
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    const targetUrl = url || `https://claude.ai/chat/${id}`
    const link = document.querySelector(`a[href*="${id}"]`) as HTMLAnchorElement
    if (link) {
      link.click()
      return true
    }
    // 降级：直接跳转
    window.location.href = targetUrl
    return true
  }

  getSessionName(): string | null {
    return this.getConversationTitle()
  }

  // ==================== 页面宽度 ====================

  getWidthSelectors() {
    return [
      // Claude 的主内容区域
      { selector: "#main-content .max-w-3xl", property: "max-width" },
      { selector: "#main-content .max-w-4xl", property: "max-width" },
    ]
  }

  getUserQueryWidthSelectors() {
    return [{ selector: '[data-testid="user-message"]', property: "max-width" }]
  }

  // ==================== 主题切换 ====================

  async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
    try {
      // Claude 使用 localStorage.LSS-userThemeMode 存储主题
      // 格式: {"value":"dark","tabId":"xxx","timestamp":xxx}
      const themeData = {
        value: targetMode,
        tabId: crypto.randomUUID(),
        timestamp: Date.now(),
      }
      localStorage.setItem("LSS-userThemeMode", JSON.stringify(themeData))

      // 触发 storage 事件通知其他组件
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "LSS-userThemeMode",
          newValue: JSON.stringify(themeData),
        }),
      )

      // 等待一下看是否生效，如果不行则尝试刷新页面
      await new Promise((r) => setTimeout(r, 300))
      return true
    } catch (error) {
      console.error("[ClaudeAdapter] toggleTheme error:", error)
      return false
    }
  }
}
