/**
 * 用户提问 Markdown 渲染器
 *
 * 将用户提问区域的文本还原并渲染为 Markdown 格式
 * 站点差异逻辑由适配器处理，核心类只负责调度
 */

import type { SiteAdapter } from "~adapters/base"
import { SITE_IDS } from "~constants"
import { INLINE_USER_QUERY_MARKDOWN_STYLES } from "../styles/user-query-markdown-inline"
import { DOMToolkit } from "~utils/dom-toolkit"
import { initCopyButtons, showCopySuccess } from "~utils/icons"
import { getMathStyles } from "~utils/katex-styles"
import { getHighlightStyles, renderMarkdown } from "~utils/markdown"

// Markdown 语法检测规则
const BLOCK_MARKDOWN_PATTERNS = [
  /^\s*#{1,6}\s+\S/m, // 标题：# Title
  /^\s*```/m, // 代码块：```
  /^\s*(?:>|&gt;)\s+\S/m, // 引用：> quote
  /^\s*[-*]\s+\S/m, // 无序列表：- item 或 * item
  /^\s*\d+\.\s+\S/m, // 有序列表：1. item
]

const INLINE_MARKDOWN_PATTERNS = [
  /\*\*[^*]+\*\*/, // 加粗：**bold**
  /`[^`]+`/, // 行内代码：`code`
  /\[.+\]\(.+\)/, // 链接：[text](url)
]

const BLOCK_MATH_PATTERNS = [
  /(^|[^\\])\$\$[\s\S]+?\$\$/m, // 块公式：$$...$$
  /\\\[[\s\S]+?\\\]/m, // 块公式：\[...\]
]

const INLINE_MATH_PATTERNS = [
  /(^|[^\\$])\$[^\s$](?:[^$\n]*[^\s$])?\$(?!\$)/, // 行内公式：$...$
  /\\\([^\n]+?\\\)/, // 行内公式：\(...\)
]

// 配置
const RESCAN_INTERVAL = 2000 // Shadow DOM 站点重扫描间隔
const INITIAL_DELAY = 1000 // 首次扫描延迟
const STYLE_ID = "gh-user-query-markdown-style"

function isUserscriptPlatform(): boolean {
  return typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"
}

function getUserscriptUserQueryMarkdownStyles(): string {
  if (typeof window === "undefined" || !isUserscriptPlatform()) return ""
  return window.__OPHEL_USER_QUERY_MARKDOWN_STYLES__ || ""
}

function getInlineUserQueryMarkdownStyles(): string {
  return INLINE_USER_QUERY_MARKDOWN_STYLES
}

function getUserQueryMarkdownStyles(): string {
  if (isUserscriptPlatform()) {
    return getUserscriptUserQueryMarkdownStyles()
  }

  return getInlineUserQueryMarkdownStyles()
}

/**
 * 检测文本是否看起来像 Markdown
 * 单行块级语法（如引用、标题、列表）和单行行内语法（如加粗、行内代码、链接）也允许渲染
 */
function looksLikeMarkdown(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false

  return (
    BLOCK_MARKDOWN_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    INLINE_MARKDOWN_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    containsLikelyMath(normalized)
  )
}

function stripCodeContent(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "")
}

function containsLikelyMath(text: string): boolean {
  const normalized = stripCodeContent(text)

  return (
    BLOCK_MATH_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    INLINE_MATH_PATTERNS.some((pattern) => pattern.test(normalized))
  )
}

export class UserQueryMarkdownRenderer {
  private adapter: SiteAdapter
  private enabled: boolean
  private processedElements = new WeakMap<Element, string>()
  private stopWatch: (() => void) | null = null
  private rescanTimer: number | null = null
  private injectedShadowRoots = new WeakSet<ShadowRoot>()
  private codeCopyHandler: ((e: MouseEvent) => void) | null = null

  constructor(adapter: SiteAdapter, enabled: boolean) {
    this.adapter = adapter
    this.enabled = enabled
    if (enabled) {
      this.init()
    }
  }

  private init() {
    const selector = this.adapter.getUserQuerySelector()
    if (!selector) {
      console.warn("[UserQueryMarkdownRenderer] No user query selector found for this site")
      return
    }

    const usesShadowDOM = this.adapter.usesShadowDOM()

    if (usesShadowDOM) {
      // Shadow DOM 站点：使用定时扫描
      // 样式和事件通过 injectStyleToShadowRoot 注入到各 Shadow DOM 中
      this.startRescanTimer()
    } else {
      // 普通站点：注入全局样式和事件处理
      void this.injectGlobalStyles()
      this.initCodeCopyHandler()

      // 使用 DOMToolkit.each() 监听
      this.stopWatch = DOMToolkit.each(
        selector,
        (el) => {
          this.processQueryElement(el)
        },
        { shadow: true },
      )

      // 兜底重扫：豆包 / Qwen Studio / 通义千问 可能先插入空节点，再异步填充文本
      // 仅靠 each() 的“新增节点回调一次”可能错过最终内容
      const siteId = this.adapter.getSiteId()
      if (siteId === SITE_IDS.DOUBAO || siteId === SITE_IDS.QWENAI || siteId === SITE_IDS.QIANWEN) {
        this.startRescanTimer()
      }
    }
  }

  /**
   * 注入样式到 document.head
   */
  private async injectGlobalStyles() {
    const styleText = await this.getStyleText()
    let style = document.getElementById(STYLE_ID)

    if (!style) {
      style = document.createElement("style")
      style.id = STYLE_ID
      document.head.appendChild(style)
    }

    if (style.textContent !== styleText) {
      style.textContent = styleText
    }
  }

  /**
   * 注入样式到 Shadow DOM（用于 Gemini Enterprise）
   */
  private async injectStyleToShadowRoot(shadowRoot: ShadowRoot) {
    const styleText = await this.getStyleText()
    const existingStyle = shadowRoot.querySelector(`#${STYLE_ID}`)
    if (existingStyle) {
      if (existingStyle.textContent !== styleText) {
        existingStyle.textContent = styleText
      }
      this.injectedShadowRoots.add(shadowRoot)
      return
    }

    const style = document.createElement("style")
    style.id = STYLE_ID
    style.textContent = styleText
    shadowRoot.prepend(style)

    // Shadow DOM 内的事件监听（因为 document 级别的事件无法穿透 Shadow DOM）
    if (!this.injectedShadowRoots.has(shadowRoot)) {
      shadowRoot.addEventListener("click", (e: Event) => this.handleCodeCopy(e))
      this.injectedShadowRoots.add(shadowRoot)
    }
  }

  private async getStyleText(): Promise<string> {
    const mathStyles = await getMathStyles()
    return [getHighlightStyles(), mathStyles, getUserQueryMarkdownStyles()]
      .filter(Boolean)
      .join("\n")
  }

  private normalizeRenderedContainer(container: Element) {
    if (!(container instanceof HTMLElement)) return
    container.style.setProperty("white-space", "normal", "important")
  }

  /**
   * 处理代码复制按钮点击
   */
  private handleCodeCopy(e: Event) {
    const target = e.target as HTMLElement
    // 支持点击 SVG 内部元素
    const btn = target.closest(".gh-code-copy-btn") as HTMLElement
    if (btn && btn.closest(".gh-user-query-markdown")) {
      e.preventDefault()
      e.stopPropagation()

      const code = btn.nextElementSibling?.textContent || ""
      navigator.clipboard
        .writeText(code)
        .then(() => {
          showCopySuccess(btn, { size: 14 })
        })
        .catch((err) => {
          console.error("[UserQueryMarkdownRenderer] Copy failed:", err)
        })
    }
  }

  /**
   * 初始化代码复制事件处理（全局事件委托）
   */
  private initCodeCopyHandler() {
    if (this.codeCopyHandler) return

    this.codeCopyHandler = (e: MouseEvent) => this.handleCodeCopy(e)
    document.addEventListener("click", this.codeCopyHandler, true)
  }

  /**
   * 启动定时重扫描（用于 Shadow DOM 站点）
   */
  private startRescanTimer() {
    if (this.rescanTimer) return

    // 初始延迟后执行首次扫描
    setTimeout(() => {
      if (this.enabled) this.rescan()
    }, INITIAL_DELAY)

    // 定时重扫描
    this.rescanTimer = window.setInterval(() => {
      if (!this.enabled) return
      this.rescan()
    }, RESCAN_INTERVAL)
  }

  /**
   * 重新扫描页面上的用户提问元素
   */
  private rescan() {
    // 页面不可见或失去焦点时暂停扫描
    if (document.hidden || !document.hasFocus()) return

    const selector = this.adapter.getUserQuerySelector()
    if (!selector) return

    const elements = DOMToolkit.query(selector, { all: true, shadow: true }) as Element[]
    for (const el of elements) {
      this.processQueryElement(el)
    }
  }

  private processQueryElement(element: Element) {
    // 1. 使用适配器提取原始 Markdown 文本
    const rawMarkdown = this.adapter.extractUserQueryMarkdown(element)
    if (!rawMarkdown) return

    // 2. 检测是否像 Markdown
    if (!looksLikeMarkdown(rawMarkdown)) return

    // 避免对相同文本重复渲染
    const processedMarkdown = this.processedElements.get(element)
    if (processedMarkdown === rawMarkdown) return

    // 3. 渲染成 HTML
    const html = renderMarkdown(rawMarkdown, false, { enableMath: true })

    // 4. 对于 Shadow DOM 站点，先注入样式到目标 Shadow DOM
    if (this.adapter.usesShadowDOM()) {
      const markdown = element.querySelector("ucs-fast-markdown")
      if (markdown?.shadowRoot) {
        void this.injectStyleToShadowRoot(markdown.shadowRoot)
      }
    }

    // 5. 使用适配器替换内容
    const replaced = this.adapter.replaceUserQueryContent(element, html)

    // 6. 初始化复制按钮的 SVG 图标
    // 先尝试在主文档中查找，再在 Shadow DOM 中查找
    let container = element.querySelector(".gh-user-query-markdown")
    if (!container && this.adapter.usesShadowDOM()) {
      const markdown = element.querySelector("ucs-fast-markdown")
      if (markdown?.shadowRoot) {
        container = markdown.shadowRoot.querySelector(".gh-user-query-markdown")
      }
    }
    if (container) {
      this.normalizeRenderedContainer(container)
      initCopyButtons(container, { size: 14, color: "#6b7280" })
      this.processedElements.set(element, rawMarkdown)
      return
    }

    // replace 成功但容器查找稍慢时，也先记录，避免重复插入
    if (replaced) {
      this.processedElements.set(element, rawMarkdown)
    }
  }

  /**
   * 更新设置
   */
  updateSettings(enabled: boolean) {
    if (this.enabled === enabled) return

    this.enabled = enabled

    if (enabled) {
      this.init()
    } else {
      this.stop()
    }
  }

  /**
   * 停止监听
   */
  stop() {
    if (this.stopWatch) {
      this.stopWatch()
      this.stopWatch = null
    }
    if (this.rescanTimer) {
      clearInterval(this.rescanTimer)
      this.rescanTimer = null
    }
  }

  /**
   * 销毁（移除注入的样式和事件监听）
   */
  destroy() {
    this.stop()
    this.processedElements = new WeakMap()
    this.injectedShadowRoots = new WeakSet()

    // 移除全局样式
    const style = document.getElementById(STYLE_ID)
    if (style) style.remove()

    // 移除代码复制事件监听
    if (this.codeCopyHandler) {
      document.removeEventListener("click", this.codeCopyHandler, true)
      this.codeCopyHandler = null
    }
  }
}
