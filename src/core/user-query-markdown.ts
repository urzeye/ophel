/**
 * 用户提问 Markdown 渲染器
 *
 * 将用户提问区域的文本还原并渲染为 Markdown 格式
 * 站点差异逻辑由适配器处理，核心类只负责调度
 */

import type { SiteAdapter } from "~adapters/base"
import { DOMToolkit } from "~utils/dom-toolkit"
import { getHighlightStyles, renderMarkdown } from "~utils/markdown"

// Markdown 语法检测规则
const MARKDOWN_PATTERNS = [
  /^#{1,6}\s+\S/m, // 标题：# Title
  /\*\*[^*]+\*\*/, // 加粗：**bold**
  /`[^`]+`/, // 行内代码：`code`
  /^```/m, // 代码块：```
  /^>\s+\S/m, // 引用：> quote
  /^[-*]\s+\S/m, // 无序列表：- item 或 * item
  /^\d+\.\s+\S/m, // 有序列表：1. item
  /\[.+\]\(.+\)/, // 链接：[text](url)
]

// 配置
const RESCAN_INTERVAL = 2000 // Shadow DOM 站点重扫描间隔
const INITIAL_DELAY = 1000 // 首次扫描延迟
const STYLE_ID = "gh-user-query-markdown-style"

// 用户提问 Markdown 渲染样式（注入到页面 document.head）
// 如果把 CSS 抽离到单独的 .css 文件：需要使用 data-text: 导入为字符串，然后仍然需要在 JS 中拼接并手动注入
const USER_QUERY_MARKDOWN_CSS = `
/* ============= 用户提问 Markdown 渲染样式 ============= */
.gh-user-query-markdown {
  font-size: 15px;
  line-height: 1.6;
}

/* 代码块样式 - 紧凑、自动换行 */
.gh-user-query-markdown pre {
  margin: 0.5em 0;
  padding: 0.75em;
  padding-right: 0.5em;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  font-size: 0.95em;
  max-height: 200px;
  overflow: auto;
  position: relative;
}

/* 美化滚动条 */
.gh-user-query-markdown pre::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.gh-user-query-markdown pre::-webkit-scrollbar-track {
  background: transparent;
}
.gh-user-query-markdown pre::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
}
.gh-user-query-markdown pre::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

.gh-user-query-markdown pre code {
  background: transparent;
  padding: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-all;
  overflow: visible; /* 覆盖 .hljs 的 overflow-x: auto，让 pre 控制滚动 */
}

/* 行内代码 */
.gh-user-query-markdown code {
  background: rgba(0, 0, 0, 0.05);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
}

/* 代码块复制按钮 - sticky 定位，滚动时保持可见 */
.gh-user-query-markdown .gh-code-copy-btn {
  position: sticky;
  top: 6px;
  float: right;
  margin-top: -1.5em;
  margin-right: -1.0em;
  width: 24px;
  height: 24px;
  padding: 0;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  color: #666;
  font-size: 12px;
  cursor: pointer;
  opacity: 0.2;
  transition: opacity 0.2s, background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}
.gh-user-query-markdown pre:hover .gh-code-copy-btn {
  opacity: 1;
}
.gh-user-query-markdown .gh-code-copy-btn:hover {
  background: #4285f4;
  color: white;
  border-color: #4285f4;
}

/* 标题间距优化 */
.gh-user-query-markdown h1,
.gh-user-query-markdown h2,
.gh-user-query-markdown h3,
.gh-user-query-markdown h4,
.gh-user-query-markdown h5,
.gh-user-query-markdown h6 {
  margin: 0.5em 0 0.3em;
  line-height: 1.3;
}

.gh-user-query-markdown h1 { font-size: 1.3em; }
.gh-user-query-markdown h2 { font-size: 1.2em; }
.gh-user-query-markdown h3 { font-size: 1.1em; }

/* 列表样式 */
.gh-user-query-markdown ul,
.gh-user-query-markdown ol {
  margin: 0.4em 0;
  padding-left: 1.5em;
}

.gh-user-query-markdown li {
  margin: 0.2em 0;
}

/* 引用块 */
.gh-user-query-markdown blockquote {
  margin: 0.5em 0;
  padding: 0.5em 1em;
  border-left: 3px solid #4285f4;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 0 4px 4px 0;
}

/* 表格优化 */
.gh-user-query-markdown table {
  margin: 0.5em 0;
  font-size: 0.9em;
}

/* 分隔线 */
.gh-user-query-markdown hr {
  margin: 0.5em 0;
  border: none;
  border-top: 1px solid #e5e7eb;
}

/* 深色模式适配 - 检测 Gemini 的 dark-theme 类 */
body.dark-theme .gh-user-query-markdown pre,
body.dark-theme .gh-user-query-markdown code {
  background: rgba(255, 255, 255, 0.08);
}
body.dark-theme .gh-user-query-markdown pre::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
}
body.dark-theme .gh-user-query-markdown pre::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}
body.dark-theme .gh-user-query-markdown .gh-code-copy-btn {
  background: rgba(0, 0, 0, 0.5);
  border-color: rgba(255, 255, 255, 0.1);
  color: #aaa;
}
body.dark-theme .gh-user-query-markdown blockquote {
  background: rgba(255, 255, 255, 0.05);
}
body.dark-theme .gh-user-query-markdown hr {
  border-top-color: #4b5563;
}

/* Gemini Enterprise 深色模式 */
html[dark-theme] .gh-user-query-markdown pre,
html[dark-theme] .gh-user-query-markdown code {
  background: rgba(255, 255, 255, 0.08);
}
html[dark-theme] .gh-user-query-markdown pre::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
}
html[dark-theme] .gh-user-query-markdown pre::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}
html[dark-theme] .gh-user-query-markdown .gh-code-copy-btn {
  background: rgba(0, 0, 0, 0.5);
  border-color: rgba(255, 255, 255, 0.1);
  color: #aaa;
}
html[dark-theme] .gh-user-query-markdown blockquote {
  background: rgba(255, 255, 255, 0.05);
}
html[dark-theme] .gh-user-query-markdown hr {
  border-top-color: #4b5563;
}
`

/**
 * 检测文本是否看起来像 Markdown
 * 需要同时满足：包含换行 + 命中至少一个规则
 */
function looksLikeMarkdown(text: string): boolean {
  // 单行文本不处理
  if (!text.includes("\n")) return false

  // 检测是否命中至少一个 Markdown 语法规则
  return MARKDOWN_PATTERNS.some((pattern) => pattern.test(text))
}

export class UserQueryMarkdownRenderer {
  private adapter: SiteAdapter
  private enabled: boolean
  private processedElements = new WeakSet<Element>()
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
      this.injectGlobalStyles()
      this.initCodeCopyHandler()

      // 使用 DOMToolkit.each() 监听
      this.stopWatch = DOMToolkit.each(
        selector,
        (el) => {
          this.processQueryElement(el)
        },
        { shadow: true },
      )
    }
  }

  /**
   * 注入样式到 document.head
   */
  private injectGlobalStyles() {
    if (document.getElementById(STYLE_ID)) return

    const style = document.createElement("style")
    style.id = STYLE_ID
    style.textContent = getHighlightStyles() + "\n" + USER_QUERY_MARKDOWN_CSS
    document.head.appendChild(style)
  }

  /**
   * 注入样式到 Shadow DOM（用于 Gemini Enterprise）
   */
  private injectStyleToShadowRoot(shadowRoot: ShadowRoot) {
    if (this.injectedShadowRoots.has(shadowRoot)) return
    if (shadowRoot.querySelector(`#${STYLE_ID}`)) return

    const style = document.createElement("style")
    style.id = STYLE_ID
    style.textContent = getHighlightStyles() + "\n" + USER_QUERY_MARKDOWN_CSS
    shadowRoot.prepend(style)
    this.injectedShadowRoots.add(shadowRoot)

    // Shadow DOM 内的事件监听（因为 document 级别的事件无法穿透 Shadow DOM）
    shadowRoot.addEventListener("click", (e: Event) => this.handleCodeCopy(e))
  }

  /**
   * 处理代码复制按钮点击
   */
  private handleCodeCopy(e: Event) {
    const target = e.target as HTMLElement
    if (
      target.classList.contains("gh-code-copy-btn") &&
      target.closest(".gh-user-query-markdown")
    ) {
      e.preventDefault()
      e.stopPropagation()

      const code = target.nextElementSibling?.textContent || ""
      navigator.clipboard
        .writeText(code)
        .then(() => {
          const originalText = target.textContent
          target.textContent = "✓"
          setTimeout(() => (target.textContent = originalText), 1500)
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
    // 避免重复处理
    if (this.processedElements.has(element)) return
    this.processedElements.add(element)

    // 1. 使用适配器提取原始 Markdown 文本
    const rawMarkdown = this.adapter.extractUserQueryMarkdown(element)
    if (!rawMarkdown) return

    // 2. 检测是否像 Markdown
    if (!looksLikeMarkdown(rawMarkdown)) return

    // 3. 渲染成 HTML
    const html = renderMarkdown(rawMarkdown, false)

    // 4. 对于 Shadow DOM 站点，先注入样式到目标 Shadow DOM
    if (this.adapter.usesShadowDOM()) {
      const markdown = element.querySelector("ucs-fast-markdown")
      if (markdown?.shadowRoot) {
        this.injectStyleToShadowRoot(markdown.shadowRoot)
      }
    }

    // 5. 使用适配器替换内容
    this.adapter.replaceUserQueryContent(element, html)
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
    this.processedElements = new WeakSet()
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
