import { DOMToolkit } from "~utils/dom-toolkit"
import { t } from "~utils/i18n"
import type { Settings } from "~utils/storage"
import { showToast } from "~utils/toast"

/**
 * 复制功能管理器
 * 负责公式双击复制和表格 Markdown 复制
 */
export class CopyManager {
  private settings: Settings["copy"]
  private formulaCopyInitialized = false
  private tableCopyInitialized = false
  private formulaDblClickHandler: ((e: MouseEvent) => void) | null = null
  private stopTableWatch: (() => void) | null = null

  constructor(settings: Settings["copy"]) {
    this.settings = settings
  }

  updateSettings(settings: Settings["copy"]) {
    // 动态启用/禁用公式复制
    if (settings.formulaCopyEnabled !== this.settings.formulaCopyEnabled) {
      if (settings.formulaCopyEnabled) {
        // 先临时赋值以便 init 读取
        this.settings = settings
        this.initFormulaCopy()
      } else {
        this.destroyFormulaCopy()
      }
    }

    // 动态启用/禁用表格复制
    if (settings.tableCopyEnabled !== this.settings.tableCopyEnabled) {
      if (settings.tableCopyEnabled) {
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
   */
  initFormulaCopy() {
    if (this.formulaCopyInitialized) return
    this.formulaCopyInitialized = true

    // 注入 CSS
    const styleId = "gh-formula-copy-style"
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style")
      style.id = styleId
      style.textContent = `
        .math-block, .math-inline {
            user-select: none !important;
            cursor: pointer !important;
        }
        .math-block:hover, .math-inline:hover {
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
      const mathEl = target.closest(".math-block, .math-inline")
      if (!mathEl) return

      const latex = mathEl.getAttribute("data-math")
      if (!latex) {
        console.warn("[FormulaCopy] No data-math attribute found")
        return
      }

      let copyText = latex
      if (this.settings.formulaDelimiterEnabled) {
        const isBlock = mathEl.classList.contains("math-block")
        copyText = isBlock ? `$$${latex}$$` : `$${latex}$`
      }

      navigator.clipboard
        .writeText(copyText)
        .then(() => showToast(t("formulaCopied")))
        .catch((err) => {
          console.error("[FormulaCopy] Copy failed:", err)
          showToast(t("copyFailed"))
        })

      e.preventDefault()
      e.stopPropagation()
    }

    document.addEventListener("dblclick", this.formulaDblClickHandler, true)
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

    // 注入 CSS
    const styleId = "gh-table-copy-style"
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style")
      style.id = styleId
      style.textContent = `
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
        table-block:hover .gh-table-copy-btn {
            opacity: 1;
        }
        .gh-table-copy-btn:hover {
            background: #4285f4;
            color: white;
        }
      `
      document.head.appendChild(style)
    }

    // 使用 DOMToolkit.each 持续监听表格（支持 Shadow DOM 穿透）
    this.stopTableWatch = DOMToolkit.each(
      "table",
      (table) => {
        this.injectTableButton(table as HTMLTableElement)
      },
      { shadow: true },
    )
  }

  private injectTableButton(table: HTMLTableElement) {
    if (table.dataset.ghTableCopy) return
    table.dataset.ghTableCopy = "true"

    try {
      // 尝试找到原生表格容器
      let container = table.closest("table-block, ucs-markdown-table") as HTMLElement
      if (!container) {
        container = table.parentNode as HTMLElement
        if (!container) return
        container.classList.add("gh-table-container")
      }
      container.style.position = "relative"

      const btn = document.createElement("button")
      btn.className = "gh-table-copy-btn"
      btn.textContent = "📋"
      btn.title = t("tableCopyLabel")

      // 检测是否在 Gemini Enterprise 容器中（有原生按钮），调整位置避免遮挡
      const tagName = container.tagName?.toLowerCase()
      const isGeminiEnterprise =
        tagName === "ucs-markdown-table" ||
        container.closest("ucs-markdown-table") ||
        container.classList.contains("gh-table-container")
      const rightOffset = isGeminiEnterprise ? "80px" : "4px"

      // 使用内联样式确保定位正确
      Object.assign(btn.style, {
        position: "absolute",
        top: "4px",
        right: rightOffset,
      })

      btn.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()

        const markdown = this.tableToMarkdown(table)
        navigator.clipboard
          .writeText(markdown)
          .then(() => {
            showToast(t("tableCopied"))
            const originalText = btn.textContent
            btn.textContent = "✓"
            setTimeout(() => {
              btn.textContent = originalText
            }, 1000)
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
      if (this.settings.formulaCopyEnabled) {
        const clone = cell.cloneNode(true) as HTMLElement
        const mathEls = clone.querySelectorAll(".math-block, .math-inline")
        mathEls.forEach((mathEl) => {
          const el = mathEl as HTMLElement
          const latex = el.getAttribute("data-math")
          if (latex) {
            const isBlock = el.classList.contains("math-block")
            let replacement
            if (this.settings.formulaDelimiterEnabled) {
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

    // 停止监听
    if (this.stopTableWatch) {
      this.stopTableWatch()
      this.stopTableWatch = null
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
