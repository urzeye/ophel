import type { SiteAdapter } from "~adapters/base"
import { DOMToolkit } from "~utils/dom-toolkit"
import { t } from "~utils/i18n"
import { createCopyIcon, showCopySuccess } from "~utils/icons"
import type { Settings } from "~utils/storage"
import { showToast } from "~utils/toast"

// 表格扫描间隔（毫秒）
const TABLE_RESCAN_INTERVAL = 1000

/**
 * 复制功能管理器
 * 负责公式双击复制和表格 Markdown 复制
 */
export class CopyManager {
  private settings: Settings["content"]
  private siteAdapter: SiteAdapter | null = null
  private formulaCopyInitialized = false
  private tableCopyInitialized = false
  private formulaDblClickHandler: ((e: MouseEvent) => void) | null = null
  private stopTableWatch: (() => void) | null = null
  private rescanTimer: ReturnType<typeof setInterval> | null = null

  constructor(settings: Settings["content"], siteAdapter?: SiteAdapter) {
    this.settings = settings
    this.siteAdapter = siteAdapter || null
  }

  updateSettings(settings: Settings["content"]) {
    // 动态启用/禁用公式复制
    if (settings.formulaCopy !== this.settings.formulaCopy) {
      if (settings.formulaCopy) {
        // 先临时赋值以便 init 读取
        this.settings = settings
        this.initFormulaCopy()
      } else {
        this.destroyFormulaCopy()
      }
    }

    // 动态启用/禁用表格复制
    if (settings.tableCopy !== this.settings.tableCopy) {
      if (settings.tableCopy) {
        // 先临时赋值以便 init 读取
        this.settings = settings
        this.initTableCopy()
      } else {
        this.destroyTableCopy()
      }
    }

    // 更新设置
    this.settings = settings
  }

  // ==================== Formula Copy ====================

  /**
   * 初始化公式双击复制功能
   * 禁用公式文字选择，双击复制 LaTeX 源码
   * 支持 Gemini (.math-block/.math-inline) 和 ChatGPT (.katex)
   */
  initFormulaCopy() {
    if (this.formulaCopyInitialized) return
    this.formulaCopyInitialized = true

    // 注入 CSS（同时支持 Gemini 和 ChatGPT 的公式选择器）
    const styleId = "gh-formula-copy-style"
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style")
      style.id = styleId
      style.textContent = `
        .math-block, .math-inline, .katex {
            user-select: none !important;
            cursor: pointer !important;
        }
        .math-block:hover, .math-inline:hover, .katex:hover {
            outline: 2px solid #4285f4;
            outline-offset: 2px;
            border-radius: 4px;
        }
      `
      document.head.appendChild(style)
    }

    // 双击事件委托处理
    this.formulaDblClickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      // 优先匹配 Gemini 格式
      const geminiMathEl = target.closest(".math-block, .math-inline")
      if (geminiMathEl) {
        const latex = geminiMathEl.getAttribute("data-math")
        if (latex) {
          this.copyLatex(latex, geminiMathEl.classList.contains("math-block"))
          e.preventDefault()
          e.stopPropagation()
          return
        }
      }

      // 匹配 ChatGPT/KaTeX 格式
      const katexEl = target.closest(".katex")
      if (katexEl) {
        // 从 annotation 标签获取 LaTeX 源码
        const annotation = katexEl.querySelector('annotation[encoding="application/x-tex"]')
        if (annotation?.textContent) {
          // 检测是否为 display 模式（块级公式）
          const isBlock = !!katexEl.closest(".katex-display")
          this.copyLatex(annotation.textContent, isBlock)
          e.preventDefault()
          e.stopPropagation()
          return
        }
      }
    }

    document.addEventListener("dblclick", this.formulaDblClickHandler, true)
  }

  /**
   * 复制 LaTeX 公式
   */
  private copyLatex(latex: string, isBlock: boolean) {
    let copyText = latex
    if (this.settings.formulaDelimiter) {
      copyText = isBlock ? `$$${latex}$$` : `$${latex}$`
    }

    navigator.clipboard
      .writeText(copyText)
      .then(() => showToast(t("formulaCopied")))
      .catch((err) => {
        console.error("[FormulaCopy] Copy failed:", err)
        showToast(t("copyFailed"))
      })
  }

  /**
   * 销毁公式双击复制功能
   */
  destroyFormulaCopy() {
    this.formulaCopyInitialized = false

    const style = document.getElementById("gh-formula-copy-style")
    if (style) style.remove()

    if (this.formulaDblClickHandler) {
      document.removeEventListener("dblclick", this.formulaDblClickHandler, true)
      this.formulaDblClickHandler = null
    }
  }

  // ==================== Table Copy ====================

  /**
   * 初始化表格 Markdown 复制功能
   */
  initTableCopy() {
    if (this.tableCopyInitialized) return
    this.tableCopyInitialized = true

    // 注入 CSS 到主文档
    const styleId = "gh-table-copy-style"
    const css = `
        .gh-table-copy-btn {
            position: absolute;
            top: 4px;
            right: 4px;
            width: 28px;
            height: 28px;
            border: none;
            border-radius: 6px;
            background: rgba(255,255,255,0.9);
            color: #374151;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.7;
            transition: opacity 0.2s, background 0.2s;
            z-index: 10;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .gh-table-container:hover .gh-table-copy-btn,
        table-block:hover .gh-table-copy-btn,
        ucs-markdown-table:hover .gh-table-copy-btn {
            opacity: 1;
        }
        .gh-table-copy-btn:hover {
            background: #4285f4;
            color: white;
        }
    `
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style")
      style.id = styleId
      style.textContent = css
      document.head.appendChild(style)
    }

    const usesShadowDOM = this.siteAdapter?.usesShadowDOM() ?? false

    if (usesShadowDOM) {
      // Shadow DOM 站点：使用定时扫描
      // 因为 DOMToolkit.each 的 MutationObserver 无法检测 Shadow DOM 内部的变化
      this.startRescanTimer()
    } else {
      // 普通站点：使用 DOMToolkit.each 持续监听
      this.stopTableWatch = DOMToolkit.each(
        "table",
        (table) => {
          this.injectTableButton(table as HTMLTableElement)
        },
        { shadow: true },
      )
    }
  }

  /**
   * 启动定时扫描（用于 Shadow DOM 站点）
   */
  private startRescanTimer() {
    // 先做一次初始扫描
    this.rescanTables()

    // 启动定时器
    this.rescanTimer = setInterval(() => {
      this.rescanTables()
    }, TABLE_RESCAN_INTERVAL)
  }

  /**
   * 扫描页面上的表格元素
   */
  private rescanTables() {
    // 页面不可见时暂停扫描
    if (document.hidden) return

    const tables = DOMToolkit.query("table", { all: true, shadow: true }) as Element[]
    for (const table of tables) {
      this.injectTableButton(table as HTMLTableElement)
    }
  }

  private injectTableButton(table: HTMLTableElement) {
    if (table.dataset.ghTableCopy) return
    table.dataset.ghTableCopy = "true"

    // 检查是否在用户提问或提示词预览区域
    const isInMarkdownPreview =
      table.closest(".gh-user-query-markdown") || table.closest(".gh-markdown-preview")

    try {
      // 尝试找到原生表格容器
      let container: HTMLElement
      if (isInMarkdownPreview) {
        // Markdown 预览区域：直接用表格作为容器
        container = table
        table.style.position = "relative"
      } else {
        container = table.closest("table-block, ucs-markdown-table") as HTMLElement
        if (!container) {
          container = table.parentNode as HTMLElement
          if (!container) return
          container.classList.add("gh-table-container")
        }
        container.style.position = "relative"
      }

      const btn = document.createElement("button")
      btn.className = "gh-table-copy-btn"
      btn.appendChild(createCopyIcon({ size: 14, color: "#6b7280" }))
      btn.title = t("tableCopyLabel")

      // 检测是否在 Gemini Enterprise 容器中（有原生按钮），调整位置避免遮挡
      const tagName = container.tagName?.toLowerCase()
      const isGeminiEnterprise =
        tagName === "ucs-markdown-table" ||
        container.closest("ucs-markdown-table") ||
        container.classList.contains("gh-table-container")
      const rightOffset = isGeminiEnterprise ? "80px" : "4px"

      // 使用内联样式确保定位正确（CSS 可能无法穿透 Shadow DOM）
      Object.assign(btn.style, {
        position: "absolute",
        top: "4px",
        right: rightOffset,
        width: "28px",
        height: "28px",
        border: "none",
        borderRadius: "6px",
        background: "rgba(255,255,255,0.9)",
        color: "#374151",
        cursor: "pointer",
        fontSize: "14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: "0.6",
        transition: "opacity 0.2s, background 0.2s, transform 0.2s",
        zIndex: "10",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        pointerEvents: "auto",
      })

      // hover 效果（因为 CSS :hover 无法穿透 Shadow DOM）
      btn.addEventListener("mouseenter", () => {
        btn.style.opacity = "1"
        btn.style.transform = "scale(1.1)"
      })
      btn.addEventListener("mouseleave", () => {
        btn.style.opacity = "0.6"
        btn.style.transform = "scale(1)"
      })

      btn.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()

        const markdown = this.tableToMarkdown(table)
        navigator.clipboard
          .writeText(markdown)
          .then(() => {
            showToast(t("tableCopied"))
            showCopySuccess(btn, { size: 14 })
          })
          .catch((err) => {
            console.error("[TableCopy] Copy failed:", err)
            showToast(t("copyFailed"))
          })
      })

      container.appendChild(btn)
    } catch (err) {
      console.error("[TableCopy] Error injecting button:", err)
    }
  }

  /**
   * 表格转 Markdown
   */
  tableToMarkdown(table: HTMLTableElement): string {
    const rows = table.querySelectorAll("tr")
    if (rows.length === 0) return ""

    const lines: string[] = []
    let headerProcessed = false

    const getCellContent = (cell: HTMLTableCellElement) => {
      // 如果启用了公式复制，尝试处理公式
      if (this.settings.formulaCopy) {
        const clone = cell.cloneNode(true) as HTMLElement
        const mathEls = clone.querySelectorAll(".math-block, .math-inline")
        mathEls.forEach((mathEl) => {
          const el = mathEl as HTMLElement
          const latex = el.getAttribute("data-math")
          if (latex) {
            const isBlock = el.classList.contains("math-block")
            let replacement
            if (this.settings.formulaDelimiter) {
              replacement = isBlock ? `$$${latex}$$` : `$${latex}$`
            } else {
              replacement = latex
            }
            el.replaceWith(document.createTextNode(replacement))
          }
        })
        return clone.innerText?.trim().replace(/\|/g, "\\|").replace(/\n/g, " ") || ""
      }
      return cell.innerText?.trim().replace(/\|/g, "\\|").replace(/\n/g, " ") || ""
    }

    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll("th, td")
      const cellTexts = Array.from(cells).map((cell) =>
        getCellContent(cell as HTMLTableCellElement),
      )
      lines.push("| " + cellTexts.join(" | ") + " |")

      if (!headerProcessed && (row.querySelector("th") || rowIndex === 0)) {
        const alignments = Array.from(cells).map((cell) => {
          if (cell.classList.contains("align-center")) return ":---:"
          if (cell.classList.contains("align-right")) return "---:"
          return "---"
        })
        lines.push("| " + alignments.join(" | ") + " |")
        headerProcessed = true
      }
    })

    return lines.join("\n")
  }

  /**
   * 销毁表格复制功能
   */
  destroyTableCopy() {
    this.tableCopyInitialized = false

    // 停止 DOMToolkit.each 监听
    if (this.stopTableWatch) {
      this.stopTableWatch()
      this.stopTableWatch = null
    }

    // 停止定时扫描
    if (this.rescanTimer) {
      clearInterval(this.rescanTimer)
      this.rescanTimer = null
    }

    const style = document.getElementById("gh-table-copy-style")
    if (style)
      style.remove()

      // 清理按钮和标记
    ;(
      DOMToolkit.query(".gh-table-copy-btn", {
        all: true,
        shadow: true,
      }) as Element[]
    )?.forEach((btn) => btn.remove())
    ;(
      DOMToolkit.query("[data-gh-table-copy]", {
        all: true,
        shadow: true,
      }) as Element[]
    )?.forEach((el) => {
      if (el instanceof HTMLElement) {
        el.removeAttribute("data-gh-table-copy")
      }
    })
    ;(
      DOMToolkit.query(".gh-table-container", {
        all: true,
        shadow: true,
      }) as Element[]
    )?.forEach((el) => {
      el.classList.remove("gh-table-container")
    })
  }

  /**
   * 停止所有功能
   */
  stop() {
    this.destroyFormulaCopy()
    this.destroyTableCopy()
  }
}
