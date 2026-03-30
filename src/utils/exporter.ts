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

  type RenderContext = {
    listDepth: number
    inListItem: boolean
  }

  const normalizeLineEndings = (value: string): string => value.replace(/\r\n?/g, "\n")

  const sanitizeLanguageLabel = (value: string | null | undefined): string => {
    const normalized = value?.split(/\r?\n/)[0]?.trim().toLowerCase() || ""
    if (!normalized || /^(copy|复制)$/.test(normalized)) return ""
    return normalized.replace(/\s+/g, "")
  }

  const formatInlineMath = (latex: string): string => {
    const normalized = normalizeLineEndings(latex)
      .replace(/\s*\n\s*/g, " ")
      .trim()
    return normalized ? `$${normalized}$` : ""
  }

  const formatBlockMath = (latex: string): string => {
    const normalized = normalizeLineEndings(latex).trim()
    if (!normalized) return ""

    const shouldUseMultilineDelimiters =
      normalized.includes("\n") || /(^|[^\\])\\\\($|[^\\])/.test(normalized)

    return shouldUseMultilineDelimiters ? `\n$$\n${normalized}\n$$\n` : `\n$$${normalized}$$\n`
  }

  const extractKatexLatex = (element: Element): string => {
    const annotation = element.querySelector('annotation[encoding="application/x-tex"]')
    const annotationText = annotation?.textContent?.trim()
    if (annotationText) return annotationText

    const dataTex =
      (element as HTMLElement).getAttribute("data-tex") ||
      (element as HTMLElement).getAttribute("data-latex")
    if (dataTex) return dataTex.trim()

    const ariaLabel = (element as HTMLElement).getAttribute("aria-label")
    if (ariaLabel) return ariaLabel.trim()

    return ""
  }

  const extractTextWithLineBreaks = (node: Node): string => {
    if (!node) return ""

    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ""
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return ""
    }

    const element = node as HTMLElement
    const tag = element.tagName?.toLowerCase() || ""

    if (tag === "br") {
      return "\n"
    }

    if (
      tag === "button" ||
      tag === "svg" ||
      tag === "annotation" ||
      tag === "annotation-xml" ||
      element.classList?.contains("katex-mathml") ||
      element.classList?.contains("katex-html")
    ) {
      return ""
    }

    return Array.from(element.childNodes).map(extractTextWithLineBreaks).join("")
  }

  const getCodeBlockLanguage = (element: Element): string => {
    const codeEl = element.querySelector("code")
    const codeClassMatch = codeEl?.className.match(/language-([A-Za-z0-9_#+-]+)/)
    const hasCodeMirrorViewer = !!element.querySelector("#code-block-viewer, .cm-editor")

    const candidates = [
      (element as HTMLElement).getAttribute("data-language"),
      (element.querySelector(".cm-content") as HTMLElement | null)?.getAttribute("data-language"),
      codeClassMatch?.[1],
      element.querySelector(".code-block-decoration span")?.textContent,
      hasCodeMirrorViewer
        ? element.querySelector('.sticky [class*="font-medium"]')?.textContent
        : null,
    ]

    for (const candidate of candidates) {
      const language = sanitizeLanguageLabel(candidate)
      if (language) return language
    }

    return ""
  }

  const extractCodeBlock = (element: Element): { lang: string; code: string } | null => {
    const hasStructuredCodeViewer = !!element.querySelector("#code-block-viewer, .cm-editor")
    const cmContent = element.matches(".cm-content")
      ? (element as HTMLElement)
      : (element.querySelector(".cm-content") as HTMLElement | null) ?? null

    if (cmContent) {
      const code = normalizeLineEndings(extractTextWithLineBreaks(cmContent)).replace(/\n+$/, "")
      if (code.trim()) {
        return {
          lang: getCodeBlockLanguage(element),
          code,
        }
      }
    }

    const codeEl = element.matches("code")
      ? (element as HTMLElement)
      : (element.querySelector("pre code, code") as HTMLElement | null) ?? null

    if (codeEl) {
      const code = normalizeLineEndings(extractTextWithLineBreaks(codeEl)).replace(/\n+$/, "")
      if (code.trim()) {
        return {
          lang: getCodeBlockLanguage(element),
          code,
        }
      }
    }

    if (!hasStructuredCodeViewer) {
      const code = normalizeLineEndings(extractTextWithLineBreaks(element)).replace(/\n+$/, "")
      if (code.trim()) {
        return {
          lang: getCodeBlockLanguage(element),
          code,
        }
      }
    }

    return null
  }

  const renderChildren = (element: HTMLElement, context: RenderContext): string =>
    Array.from(element.childNodes)
      .map((child) => processNode(child, context))
      .join("")

  const normalizeListItemContent = (value: string): string =>
    normalizeLineEndings(value)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()

  const prefixMultilineContent = (
    value: string,
    prefix: string,
    continuationIndent: string,
  ): string => {
    const lines = normalizeLineEndings(value).split("\n")
    const [firstLine = "", ...restLines] = lines
    if (restLines.length === 0) {
      return `${prefix}${firstLine}`
    }

    return [
      `${prefix}${firstLine}`,
      ...restLines.map((line) => (line ? `${continuationIndent}${line}` : "")),
    ].join("\n")
  }

  const renderList = (element: HTMLElement, depth: number): string => {
    const ordered = element.tagName.toLowerCase() === "ol"
    const items = Array.from(element.children).filter(
      (child) => child.tagName?.toLowerCase() === "li",
    ) as HTMLElement[]

    const rendered = items
      .map((item, index) => renderListItem(item, depth, ordered ? index + 1 : null))
      .filter(Boolean)
      .join("\n")

    return rendered ? `\n${rendered}\n\n` : ""
  }

  const renderListItem = (
    element: HTMLElement,
    depth: number,
    orderedIndex: number | null,
  ): string => {
    const indent = "  ".repeat(depth)
    const marker = orderedIndex === null ? "-" : `${orderedIndex}.`
    const bodyParts: string[] = []
    const nestedLists: string[] = []

    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childElement = child as HTMLElement
        const childTag = childElement.tagName.toLowerCase()

        if (childTag === "ul" || childTag === "ol") {
          const nested = renderList(childElement, depth + 1).replace(/^\n+|\n+$/g, "")
          if (nested) nestedLists.push(nested)
          continue
        }
      }

      bodyParts.push(
        processNode(child, {
          listDepth: depth,
          inListItem: true,
        }),
      )
    }

    const body = normalizeListItemContent(bodyParts.join(""))
    let result = body
      ? prefixMultilineContent(body, `${indent}${marker} `, `${indent}  `)
      : `${indent}${marker}`

    if (nestedLists.length > 0) {
      result = `${result.trimEnd()}\n${nestedLists.join("\n")}`
    }

    return result
  }

  const processNode = (
    node: Node,
    context: RenderContext = { listDepth: 0, inListItem: false },
  ): string => {
    try {
      if (!node) return ""

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
        if (latex) return formatBlockMath(latex)
      }

      if (element.classList?.contains("math-inline")) {
        const latex = element.getAttribute("data-math")
        if (latex) return formatInlineMath(latex)
      }

      if (element.classList?.contains("katex-display")) {
        const latex = extractKatexLatex(element)
        if (latex) return formatBlockMath(latex)
      }

      if (element.classList?.contains("katex")) {
        const latex = extractKatexLatex(element)
        if (latex) return formatInlineMath(latex)
      }

      if (element.classList?.contains("katex-mathml")) {
        return ""
      }

      if (element.classList?.contains("katex-html")) {
        return ""
      }

      // 跳过 UI 元素（复制按钮、装饰 SVG 等）
      if (element.tagName === "BUTTON" || element.tagName === "SVG") {
        return ""
      }

      // CodeMirror 代码块（Z.ai 等站点使用）
      if (element.classList?.contains("cm-content") && element.getAttribute("data-language")) {
        const codeBlock = extractCodeBlock(element)
        if (codeBlock) {
          return `\n\`\`\`${codeBlock.lang}\n${codeBlock.code}\n\`\`\`\n`
        }
      }

      // 跳过 CodeMirror 装饰层（光标、选区等）
      if (
        element.classList?.contains("cm-cursorLayer") ||
        element.classList?.contains("cm-selectionLayer") ||
        element.classList?.contains("cm-announced")
      ) {
        return ""
      }

      const tag = element.tagName?.toLowerCase() || ""
      if (!tag) return ""

      if (tag === "annotation" || tag === "annotation-xml") {
        return ""
      }

      // 图片
      if (tag === "img") {
        const alt = (element as HTMLImageElement).alt || element.getAttribute("alt") || "图片"
        const src = (element as HTMLImageElement).src || element.getAttribute("src") || ""
        return `![${alt}](${src})`
      }

      // 代码块
      if (tag === "code-block") {
        const codeBlock = extractCodeBlock(element)
        if (codeBlock) {
          return `\n\`\`\`${codeBlock.lang}\n${codeBlock.code}\n\`\`\`\n`
        }
      }

      // pre 块
      if (tag === "pre") {
        const codeBlock = extractCodeBlock(element)
        if (codeBlock) {
          return `\n\`\`\`${codeBlock.lang}\n${codeBlock.code}\n\`\`\`\n`
        }
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

      switch (tag) {
        case "h1":
          return `\n# ${renderChildren(element, context)}\n`
        case "h2":
          return `\n## ${renderChildren(element, context)}\n`
        case "h3":
          return `\n### ${renderChildren(element, context)}\n`
        case "h4":
          return `\n#### ${renderChildren(element, context)}\n`
        case "h5":
          return `\n##### ${renderChildren(element, context)}\n`
        case "h6":
          return `\n###### ${renderChildren(element, context)}\n`
        case "strong":
        case "b":
          return `**${renderChildren(element, context)}**`
        case "em":
        case "i":
          return `*${renderChildren(element, context)}*`
        case "a":
          return `[${renderChildren(element, context)}](${(element as HTMLAnchorElement).href || ""})`
        case "li":
          return renderListItem(
            element,
            context.listDepth,
            element.parentElement?.tagName?.toLowerCase() === "ol"
              ? Array.from(element.parentElement.children)
                  .filter((child) => child.tagName?.toLowerCase() === "li")
                  .indexOf(element) + 1
              : null,
          )
        case "p":
          return context.inListItem
            ? `${renderChildren(element, context).trim()}\n`
            : `${renderChildren(element, context)}\n\n`
        case "br":
          return "\n"
        case "ul":
        case "ol":
          return renderList(element, context.listDepth)
        case "blockquote": {
          const lines = renderChildren(element, context).replace(/\r\n/g, "\n").split("\n")
          const quoted = lines.map((l: string) => (l.trim().length > 0 ? `> ${l}` : ">"))
          return `\n${quoted.join("\n")}\n`
        }
        default:
          // 处理 Shadow DOM
          if ((element as HTMLElement).shadowRoot) {
            return Array.from((element as HTMLElement).shadowRoot!.childNodes)
              .map((child) => processNode(child, context))
              .join("")
          }
          return renderChildren(element, context)
      }
    } catch (err) {
      console.error("Error processing node in htmlToMarkdown:", err)
      // 降级为纯文本，避免单个节点异常导致内容被静默丢弃
      return node.textContent || ""
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
  lines.push(`# ${metadata.title}`)
  lines.push("")
  lines.push("---")
  lines.push(`## ${EMOJI_EXPORT} ${t("exportMetaTitle")}`)
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
  } catch (err: unknown) {
    console.error("[Exporter] Download failed:", err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    showToast("下载失败: " + errorMessage)
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
