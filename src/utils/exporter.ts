/**
 * 会话导出工具
 *
 * 支持导出为 Markdown、JSON、TXT 格式
 * 包含强大的 HTML 转 Markdown 功能
 */

import { t } from "~utils/i18n"
import { showToast } from "~utils/toast"

// 使用 String.fromCodePoint 在运行时生成 emoji
// 避免构建工具将 Unicode 转义序列转换为 UTF-16 代理对字符串
const EMOJI_EXPORT = String.fromCodePoint(0x1f4e4) // 📤
const EMOJI_USER = String.fromCodePoint(0x1f64b) // 🙋
const EMOJI_ASSISTANT = String.fromCodePoint(0x1f916) // 🤖

export interface ExportMessage {
  role: "user" | "assistant" | string
  content: string
}

export interface ExportMetadata {
  title: string
  id?: string
  url: string
  exportTime: string
  source: string
  customUserName?: string
  customModelName?: string
}

export type ExportFormat = "markdown" | "json" | "txt" | "clipboard"

// ==================== HTML 转 Markdown ====================

/**
 * 将 HTML 元素转换为 Markdown
 * 支持数学公式、代码块、表格、图片等
 */
export function htmlToMarkdown(el: Element): string {
  if (!el) return ""

  const processNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ""
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return ""
    }

    const element = node as HTMLElement

    // 处理数学公式
    if (element.classList?.contains("math-block")) {
      const latex = element.getAttribute("data-math")
      if (latex) return `\n$$${latex}$$\n`
    }

    if (element.classList?.contains("math-inline")) {
      const latex = element.getAttribute("data-math")
      if (latex) return `$${latex}$`
    }

    const tag = element.tagName.toLowerCase()

    // 图片
    if (tag === "img") {
      const alt = (element as HTMLImageElement).alt || element.getAttribute("alt") || "图片"
      const src = (element as HTMLImageElement).src || element.getAttribute("src") || ""
      return `![${alt}](${src})`
    }

    // 代码块
    if (tag === "code-block") {
      const decoration = element.querySelector(".code-block-decoration")
      const lang = decoration?.querySelector("span")?.textContent?.trim().toLowerCase() || ""
      const codeEl = element.querySelector("pre code")
      const text = codeEl?.textContent || element.querySelector("pre")?.textContent || ""
      return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`
    }

    // pre 块
    if (tag === "pre") {
      const code = element.querySelector("code")
      const lang = code?.className.match(/language-(\w+)/)?.[1] || ""
      const text = code?.textContent || element.textContent
      return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`
    }

    // 内联代码
    if (tag === "code") {
      if (element.parentElement?.tagName.toLowerCase() === "pre") return ""
      return `\`${element.textContent}\``
    }

    // 表格
    if (tag === "table") {
      const rows: string[] = []
      const thead = element.querySelector("thead")
      const tbody = element.querySelector("tbody")

      const getCellContent = (cell: Element): string => {
        return cell.textContent?.trim() || ""
      }

      if (thead) {
        const headerRow = thead.querySelector("tr")
        if (headerRow) {
          const headers = Array.from(headerRow.querySelectorAll("td, th")).map(getCellContent)
          if (headers.some((h) => h)) {
            rows.push("| " + headers.join(" | ") + " |")
            rows.push("| " + headers.map(() => "---").join(" | ") + " |")
          }
        }
      }

      if (tbody) {
        const bodyRows = tbody.querySelectorAll("tr")
        bodyRows.forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll("td, th")).map(getCellContent)
          if (cells.some((c) => c)) {
            rows.push("| " + cells.join(" | ") + " |")
          }
        })
      }

      if (!thead && !tbody) {
        const allRows = element.querySelectorAll("tr")
        let isFirst = true
        allRows.forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll("td, th")).map(getCellContent)
          if (cells.some((c) => c)) {
            rows.push("| " + cells.join(" | ") + " |")
            if (isFirst) {
              rows.push("| " + cells.map(() => "---").join(" | ") + " |")
              isFirst = false
            }
          }
        })
      }

      return rows.length > 0 ? "\n" + rows.join("\n") + "\n" : ""
    }

    // 表格容器
    if (tag === "table-block" || tag === "ucs-markdown-table") {
      const innerTable = element.querySelector("table")
      if (innerTable) {
        return processNode(innerTable)
      }
    }

    // 递归处理子节点
    const children = Array.from(element.childNodes).map(processNode).join("")

    switch (tag) {
      case "h1":
        return `\n# ${children}\n`
      case "h2":
        return `\n## ${children}\n`
      case "h3":
        return `\n### ${children}\n`
      case "h4":
        return `\n#### ${children}\n`
      case "h5":
        return `\n##### ${children}\n`
      case "h6":
        return `\n###### ${children}\n`
      case "strong":
      case "b":
        return `**${children}**`
      case "em":
      case "i":
        return `*${children}*`
      case "a":
        return `[${children}](${(element as HTMLAnchorElement).href || ""})`
      case "li":
        return `- ${children}\n`
      case "p":
        return `${children}\n\n`
      case "br":
        return "\n"
      case "ul":
      case "ol":
        return `\n${children}`
      default:
        // 处理 Shadow DOM
        if ((element as any).shadowRoot) {
          return Array.from((element as any).shadowRoot.childNodes)
            .map(processNode)
            .join("")
        }
        return children
    }
  }

  return processNode(el).trim()
}

// ==================== 格式化函数 ====================

/**
 * 为 UTF-8 文本添加 BOM，提升 Windows 记事本等工具的编码识别
 */
export function ensureUtf8Bom(content: string): string {
  if (!content) return "\ufeff"
  return content.startsWith("\ufeff") ? content : `\ufeff${content}`
}

/**
 * 格式化为 Markdown
 */
export function formatToMarkdown(metadata: ExportMetadata, messages: ExportMessage[]): string {
  const lines: string[] = []

  // 元数据头
  lines.push("---")
  lines.push(`# ${EMOJI_EXPORT} ${t("exportMetaTitle")}`)
  lines.push(`- **${t("exportMetaConvTitle")}**: ${metadata.title}`)
  lines.push(`- **${t("exportMetaTime")}**: ${metadata.exportTime}`)
  lines.push(`- **${t("exportMetaSource")}**: ${metadata.source}`)
  lines.push(`- **${t("exportMetaUrl")}**: ${metadata.url}`)
  lines.push("---")
  lines.push("")

  // 对话内容
  messages.forEach((msg) => {
    if (msg.role === "user") {
      const userLabel = metadata.customUserName || t("exportUserLabel")
      lines.push(`## ${EMOJI_USER} ${userLabel}`)
      lines.push("")
      lines.push(msg.content)
      lines.push("")
      lines.push("---")
      lines.push("")
    } else {
      const modelLabel = metadata.customModelName || metadata.source
      lines.push(`## ${EMOJI_ASSISTANT} ${modelLabel}`)
      lines.push("")
      lines.push(msg.content)
      lines.push("")
      lines.push("---")
      lines.push("")
    }
  })

  return lines.join("\n")
}

/**
 * 格式化为 JSON
 */
export function formatToJSON(metadata: ExportMetadata, messages: ExportMessage[]): string {
  const data = {
    metadata: {
      title: metadata.title,
      id: metadata.id,
      url: metadata.url,
      exportTime: metadata.exportTime,
      source: metadata.source,
    },
    messages: messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  }
  return JSON.stringify(data, null, 2)
}

/**
 * 格式化为 TXT
 */
export function formatToTXT(metadata: ExportMetadata, messages: ExportMessage[]): string {
  const lines: string[] = []

  lines.push(`${t("exportMetaConvTitle")}: ${metadata.title}`)
  lines.push(`${t("exportMetaTime")}: ${metadata.exportTime}`)
  lines.push(`${t("exportMetaSource")}: ${metadata.source}`)
  lines.push(`${t("exportMetaUrl")}: ${metadata.url}`)
  lines.push("")
  lines.push("=".repeat(50))
  lines.push("")

  messages.forEach((msg) => {
    if (msg.role === "user") {
      const userLabel = metadata.customUserName || t("exportUserLabel")
      lines.push(`[${userLabel}]`)
    } else {
      const modelLabel = metadata.customModelName || metadata.source
      lines.push(`[${modelLabel}]`)
    }
    lines.push(msg.content)
    lines.push("")
    lines.push("-".repeat(50))
    lines.push("")
  })

  return lines.join("\n")
}

// ==================== 文件操作 ====================

/**
 * 下载文件
 * 使用 Blob + createObjectURL 直接下载到默认下载目录
 */
export async function downloadFile(
  content: string,
  filename: string,
  mimeType: string = "text/plain;charset=utf-8",
): Promise<boolean> {
  try {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return true
  } catch (err: any) {
    console.error("[Exporter] Download failed:", err)
    showToast("下载失败: " + err.message)
    return false
  }
}

/**
 * 复制到剪贴板
 */
export async function copyToClipboard(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content)
    return true
  } catch (e) {
    console.error("[Exporter] Failed to copy:", e)
    return false
  }
}

/**
 * 创建导出元数据
 */
export function createExportMetadata(
  title: string,
  source: string,
  id?: string,
  options?: { customUserName?: string; customModelName?: string },
): ExportMetadata {
  return {
    title: title || t("exportUntitled"),
    id,
    url: window.location.href,
    exportTime: new Date().toLocaleString(),
    source,
    customUserName: options?.customUserName,
    customModelName: options?.customModelName,
  }
}
