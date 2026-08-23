/**
 * 会话导出工具
 *
 * 支持导出为 Markdown、JSON、TXT、HTML 格式
 * 包含强大的 HTML 转 Markdown 功能
 */

import { platform } from "~platform"
import { getCurrentLang, t } from "~utils/i18n"
import { createMarkdownIt } from "~utils/markdown"
import { showToast } from "~utils/toast"

// 使用 String.fromCodePoint 在运行时生成 emoji
// 避免构建工具将 Unicode 转义序列转换为 UTF-16 代理对字符串
const EMOJI_EXPORT = String.fromCodePoint(0x1f4e4) // 📤
const EMOJI_USER = String.fromCodePoint(0x1f64b) // 🙋
const EMOJI_ASSISTANT = String.fromCodePoint(0x1f916) // 🤖
export const EXPORT_MARKDOWN_HREF_ATTR = "data-ophel-export-markdown-href"

export interface ExportMessage {
  role: "user" | "assistant" | string
  content: string
}

export type ExportAssetKind = "image" | "document" | "file" | "audio" | "video" | "reference"

export interface ExportAsset {
  id?: string
  name: string
  relativePath?: string
  mimeType?: string
  kind?: ExportAssetKind
  content?: string | Blob | ArrayBuffer | Uint8Array
  sourceUrl?: string
  description?: string
}

export interface ExportBundle {
  messages: ExportMessage[]
  assets?: ExportAsset[]
}

export interface ExportMetadata {
  title: string
  id?: string
  url: string
  exportTime: string
  source: string
  customUserName?: string
  customModelName?: string
  showIndex?: boolean
  customDivider?: string
}

export type ExportFormat = "markdown" | "json" | "txt" | "html" | "clipboard"

export interface ZipFileInput {
  path: string
  data: string | Blob | ArrayBuffer | Uint8Array
  mimeType?: string
}

interface ZipFileEntry {
  path: string
  data: Uint8Array
  crc32: number
  dosTime: number
  dosDate: number
  localHeaderOffset: number
}

interface ExportPackageInput {
  markdownFilename: string
  markdownContent: string
  assets: ExportAsset[]
  packageFilename: string
  metadata: ExportMetadata
}

interface ExportAssetManifestItem {
  name: string
  path: string
  kind?: ExportAssetKind
  mimeType?: string
  sourceUrl?: string
  description?: string
  included: boolean
  error?: string
}

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
      tag === "style" ||
      tag === "script" ||
      tag === "template" ||
      tag === "noscript" ||
      tag === "button" ||
      tag === "svg" ||
      tag === "annotation" ||
      tag === "annotation-xml" ||
      element.classList?.contains("gh-assistant-mermaid") ||
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

      if (element.classList?.contains("gh-assistant-mermaid")) {
        return ""
      }

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

      if (tag === "style" || tag === "script" || tag === "template" || tag === "noscript") {
        return ""
      }

      // 图片
      if (tag === "img") {
        const alt = (element as HTMLImageElement).alt || element.getAttribute("alt") || "图片"
        const src = element.getAttribute("src") || (element as HTMLImageElement).src || ""
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
          return `[${renderChildren(element, context)}](${element.getAttribute(EXPORT_MARKDOWN_HREF_ATTR) || (element as HTMLAnchorElement).href || ""})`
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

// ==================== 格式化函数与清洗管道 ====================

const THOUGHT_MARKDOWN_LINE =
  /^\s*(?:\[(?:Thoughts?|思维链|思考过程)\]|\*{0,2}💭\s*思考过程\*{0,2})\s*$/i

const CODE_FENCE_LINE = /^\s*(`{3,}|~{3,})/

function getThoughtMarkerIndex(lines: string[]): number {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/^>\s?/, "").trim()
    if (!line) continue
    return THOUGHT_MARKDOWN_LINE.test(line) ? index : -1
  }

  return -1
}

/**
 * 按行标记 fenced code block 内部（含闭合围栏行之前的所有内容行），
 * 思维链聚合只处理普通引用块，不能改写代码示例中的 > 引用文本
 */
function computeCodeFenceFlags(lines: string[]): boolean[] {
  const flags: boolean[] = []
  let fenceChar = ""
  let fenceLength = 0

  for (const line of lines) {
    flags.push(fenceLength > 0)
    const match = line.match(CODE_FENCE_LINE)
    if (!match) continue
    const marker = match[1]
    if (fenceLength === 0) {
      fenceChar = marker[0]
      fenceLength = marker.length
    } else if (marker[0] === fenceChar && marker.length >= fenceLength) {
      fenceChar = ""
      fenceLength = 0
    }
  }

  return flags
}

/**
 * 通用思维链聚合函数：
 * 扫描内容中的连续 > [Thoughts] 引用块，合并为单一标准的思维链引用块，避免分段产生多个 [Thoughts] 标签。
 */
export function consolidateThoughtBlocks(content: string): string {
  if (!content || !content.includes(">")) return content

  const lines = content.replace(/\r\n?/g, "\n").split("\n")
  const inCodeFence = computeCodeFenceFlags(lines)
  const merged: string[] = []
  let index = 0

  while (index < lines.length) {
    if (inCodeFence[index] || !lines[index].startsWith(">")) {
      merged.push(lines[index])
      index += 1
      continue
    }

    const block: string[] = []
    while (index < lines.length && !inCodeFence[index] && lines[index].startsWith(">")) {
      block.push(lines[index])
      index += 1
    }

    const markerIndex = getThoughtMarkerIndex(block)
    if (markerIndex !== 0) {
      merged.push(...block)
      continue
    }

    const normalizedBlock = [...block]
    normalizedBlock[markerIndex] = "> [Thoughts]"
    const thoughtGroup = [...normalizedBlock]

    while (true) {
      let nextIndex = index
      while (nextIndex < lines.length && lines[nextIndex].trim() === "") nextIndex += 1
      if (nextIndex >= lines.length || inCodeFence[nextIndex] || !lines[nextIndex].startsWith(">"))
        break

      const nextBlock: string[] = []
      let scanIndex = nextIndex
      while (
        scanIndex < lines.length &&
        !inCodeFence[scanIndex] &&
        lines[scanIndex].startsWith(">")
      ) {
        nextBlock.push(lines[scanIndex])
        scanIndex += 1
      }

      const nextMarkerIndex = getThoughtMarkerIndex(nextBlock)
      if (nextMarkerIndex < 0) break

      thoughtGroup.push(">")
      thoughtGroup.push(...nextBlock.slice(nextMarkerIndex + 1))
      index = scanIndex
    }

    merged.push(...thoughtGroup)
  }

  return merged.join("\n")
}

/**
 * 判断内容是否为纯思维链块（整段由引用行组成，且头部为思考过程标记）
 */
export function isPureThoughtContent(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed || !trimmed.startsWith(">")) return false
  const lines = trimmed.split("\n")
  const markerIdx = getThoughtMarkerIndex(lines)
  if (markerIdx === -1) return false
  return lines.every((line) => !line.trim() || line.trimStart().startsWith(">"))
}

/**
 * 消息序列归一化管道：
 * 1. 对每条消息统一聚合思维链（合并碎片化 [Thoughts]）
 * 2. 安全合并规则：连续 Assistant 角色且前一条为纯思维链时，自动将思维链作为前缀拼到后续正文前
 * 3. 用户（User）消息与连续普通正文严格保持原样，绝不发生误合并
 */
export function normalizeExportMessages(messages: ExportMessage[]): ExportMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) return []

  const result: ExportMessage[] = []
  let i = 0

  while (i < messages.length) {
    let current: ExportMessage = {
      role: messages[i].role,
      content: consolidateThoughtBlocks(messages[i].content),
    }

    // 仅当连续 assistant 且当前累积内容仍为纯思维链时，安全前缀合并；
    // 内层循环覆盖多段思维链分片（如 [思考A, 思考B, 正文]），用户消息与连续正文一律保持原样
    if (current.role === "assistant" && isPureThoughtContent(current.content)) {
      while (
        i + 1 < messages.length &&
        messages[i + 1].role === "assistant" &&
        isPureThoughtContent(current.content)
      ) {
        const nextContent = consolidateThoughtBlocks(messages[i + 1].content)
        current = {
          role: "assistant",
          content: consolidateThoughtBlocks(`${current.content}\n\n${nextContent}`),
        }
        i += 1
      }
    }

    result.push(current)
    i += 1
  }

  return result
}

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
  const normalizedMessages = normalizeExportMessages(messages)
  const divider = metadata.customDivider !== undefined ? metadata.customDivider : "---"

  // 元数据头（头部结构分隔线固定为 ---，自定义分割线只作用于消息之间）
  lines.push(`# ${metadata.title}`)
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push(`## ${EMOJI_EXPORT} ${t("exportMetaTitle")}`)
  lines.push(`- **${t("exportMetaConvTitle")}**: ${metadata.title}`)
  lines.push(`- **${t("exportMetaTime")}**: ${metadata.exportTime}`)
  lines.push(`- **${t("exportMetaSource")}**: ${metadata.source}`)
  lines.push(`- **${t("exportMetaUrl")}**: ${metadata.url}`)
  lines.push("")
  lines.push("---")
  lines.push("")

  // 对话内容
  let turnNumber = 0
  normalizedMessages.forEach((msg) => {
    if (msg.role === "user") {
      turnNumber += 1
      const userLabel = metadata.customUserName || t("exportUserLabel")
      const titlePrefix = metadata.showIndex ? `${turnNumber}. ` : ""
      lines.push(`## ${titlePrefix}${EMOJI_USER} ${userLabel}`)
      lines.push("")
      lines.push(msg.content)
      lines.push("")
      if (divider) {
        lines.push(divider)
        lines.push("")
      }
    } else {
      const modelLabel = metadata.customModelName || metadata.source
      // 开场 assistant（尚未出现 user 轮次）不编号，避免与首轮 1 重复
      const titlePrefix = metadata.showIndex && turnNumber > 0 ? `${turnNumber}. ` : ""
      lines.push(`## ${titlePrefix}${EMOJI_ASSISTANT} ${modelLabel}`)
      lines.push("")
      lines.push(msg.content)
      lines.push("")
      if (divider) {
        lines.push(divider)
        lines.push("")
      }
    }
  })

  return lines.join("\n")
}

/**
 * 格式化为 JSON
 */
export function formatToJSON(metadata: ExportMetadata, messages: ExportMessage[]): string {
  const normalizedMessages = normalizeExportMessages(messages)
  const data = {
    metadata: {
      title: metadata.title,
      id: metadata.id,
      url: metadata.url,
      exportTime: metadata.exportTime,
      source: metadata.source,
    },
    messages: normalizedMessages.map((msg) => ({
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
  const normalizedMessages = normalizeExportMessages(messages)

  lines.push(`${t("exportMetaConvTitle")}: ${metadata.title}`)
  lines.push(`${t("exportMetaTime")}: ${metadata.exportTime}`)
  lines.push(`${t("exportMetaSource")}: ${metadata.source}`)
  lines.push(`${t("exportMetaUrl")}: ${metadata.url}`)
  lines.push("")
  lines.push("=".repeat(50))
  lines.push("")

  let turnNumber = 0
  normalizedMessages.forEach((msg) => {
    if (msg.role === "user") {
      turnNumber += 1
      const userLabel = metadata.customUserName || t("exportUserLabel")
      const prefix = metadata.showIndex ? `${turnNumber}. ` : ""
      lines.push(`[${prefix}${userLabel}]`)
    } else {
      const modelLabel = metadata.customModelName || metadata.source
      const prefix = metadata.showIndex && turnNumber > 0 ? `${turnNumber}. ` : ""
      lines.push(`[${prefix}${modelLabel}]`)
    }
    lines.push(msg.content)
    lines.push("")
    lines.push("-".repeat(50))
    lines.push("")
  })

  return lines.join("\n")
}

// ==================== HTML 导出 ====================

/**
 * 导出的 HTML 是自包含的单文件文档：
 * - 无外部依赖（字体、图标、CDN），file:// 直接打开即可阅读
 * - 内置亮 / 暗 / 跟随系统三种主题，读者可自由切换
 * - 代码块带复制按钮与语言标签，打印时强制浅色
 */

export const HTML_FILE_EXT = "html"

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

/**
 * 将 LaTeX 渲染为 MathML（现代浏览器原生支持，无需内嵌字体）
 * 渲染失败时回退为等宽文本显示 LaTeX 源码
 */
export const renderMathToMathML = (content: string, displayMode: boolean): string =>
  platform.math.renderKatexToMathML(content, { displayMode })

let htmlExportMarkdownIt: ReturnType<typeof createMarkdownIt> | null = null

const getHtmlExportMarkdownIt = (): ReturnType<typeof createMarkdownIt> => {
  if (!htmlExportMarkdownIt) {
    htmlExportMarkdownIt = createMarkdownIt(true, false, renderMathToMathML)
  }
  return htmlExportMarkdownIt
}

const COPY_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'

type TopLevelBlockquote = {
  index: number
  end: number
  block: string
}

/**
 * 提取渲染后 HTML 中的顶层 blockquote（按标签深度配对，正确处理嵌套）。
 */
const findTopLevelBlockquotes = (html: string): TopLevelBlockquote[] => {
  const blocks: TopLevelBlockquote[] = []
  let depth = 0
  let startIndex = -1
  let cursor = 0

  while (cursor < html.length) {
    const openIndex = html.indexOf("<blockquote", cursor)
    const closeIndex = html.indexOf("</blockquote>", cursor)

    if (openIndex === -1 && closeIndex === -1) break

    if (closeIndex === -1 || (openIndex !== -1 && openIndex < closeIndex)) {
      if (depth === 0) startIndex = openIndex
      depth += 1
      cursor = openIndex + "<blockquote".length
      continue
    }

    depth -= 1
    cursor = closeIndex + "</blockquote>".length
    if (depth === 0 && startIndex !== -1) {
      blocks.push({ index: startIndex, end: cursor, block: html.slice(startIndex, cursor) })
      startIndex = -1
    }
  }

  return blocks
}

// 只匹配 blockquote 开头第一个段落里的思维链标记，
// 避免把正文中偶然出现的 “[Thoughts]” 或嵌套内容误判为思维链标题。
const leadingThoughtMarkerPattern =
  /^(<blockquote>\s*<p>\s*)(?:(?:<strong>\s*)?\[(?:Thoughts?|思维链|思考过程)\](?:\s*<\/strong>)?|(?:<strong>\s*)?💭\s*思考过程(?:\s*<\/strong>)?)\s*(?:<br\s*\/?>\s*)?/i

const isThoughtMarker = (block: string): boolean => leadingThoughtMarkerPattern.test(block)

const renderThoughtGroup = (blocks: string[]): string => {
  const thoughtBody = blocks
    .map((block) =>
      block
        .replace(leadingThoughtMarkerPattern, "$1")
        .replace(/^<blockquote>\s*<p>\s*<\/p>\s*/i, "<blockquote>"),
    )
    .join("\n")

  return `<details class="gh-thought">
  <summary class="gh-thought-summary"><span class="gh-thought-dot" aria-hidden="true"></span>${t("exportThoughtCollapsedLabel")}</summary>
  <div class="gh-thought-body">${thoughtBody}</div>
</details>`
}

/**
 * 渲染单条导出的 Markdown 内容
 * 复用面板同源的 markdown-it + highlight.js 管线，保证所见即所谈
 */
function renderExportMarkdown(content: string): string {
  let html = getHtmlExportMarkdownIt().render(consolidateThoughtBlocks(content))

  // 高亮变量占位符 {{varName}}
  html = html.replace(/\{\{([^\s{}]+)\}\}/g, '<span class="gh-variable-highlight">{{$1}}</span>')

  // 连续的思维链 blockquote 合并为一个折叠块，避免模型分段输出造成多个思维链卡片。
  // 按标签深度扫描顶层 blockquote，而不是用非贪婪正则匹配：
  // markdown-it 已转义代码块里的 HTML，因此 indexOf 不会误伤代码内容；
  // 深度计数能正确处理嵌套 blockquote。
  const blocks = findTopLevelBlockquotes(html)
  let renderedThoughts = ""
  let lastIndex = 0
  let pendingThoughts: string[] = []

  for (const { index, end, block } of blocks) {
    const before = html.slice(lastIndex, index)
    const isAdjacentThought = pendingThoughts.length > 0 && /^\s*$/.test(before)

    if (isThoughtMarker(block) || isAdjacentThought) {
      if (pendingThoughts.length === 0) renderedThoughts += before
      pendingThoughts.push(block)
    } else {
      if (pendingThoughts.length > 0) {
        renderedThoughts += renderThoughtGroup(pendingThoughts)
        pendingThoughts = []
      }
      renderedThoughts += before + block
    }

    lastIndex = end
  }

  if (pendingThoughts.length > 0) {
    renderedThoughts += renderThoughtGroup(pendingThoughts)
  }
  renderedThoughts += html.slice(lastIndex)
  html = renderedThoughts

  // 带语言标注的代码块：标签栏（语言标签 + 复制按钮）
  html = html.replace(
    /<pre><code class="language-([A-Za-z0-9_#+-]+)"/g,
    (_match, lang: string) =>
      `<div class="gh-code-wrapper"><div class="gh-code-header"><span class="gh-code-lang">${escapeHtml(lang)}</span><button class="gh-code-copy-btn" data-copy-code="true" type="button" aria-label="${t("copy")}" title="${t("copy")}">${COPY_ICON_SVG}</button></div><pre><code class="language-${escapeHtml(lang)}"`,
  )

  // 无语言标注的代码块：仅复制按钮
  html = html.replace(
    /<pre><code(?![^>]*class=)/g,
    `<div class="gh-code-wrapper"><div class="gh-code-header"><span class="gh-code-lang"></span><button class="gh-code-copy-btn" data-copy-code="true" type="button" aria-label="${t("copy")}" title="${t("copy")}">${COPY_ICON_SVG}</button></div><pre><code`,
  )

  html = html.replace(/<\/pre>/g, "</pre></div>")

  return html
}

const EXPORT_HTML_CSS = `
:root {
  --gh-bg: #f7f6f4;
  --gh-surface: #ffffff;
  --gh-border: #e9e5df;
  --gh-border-strong: #d8d2c9;
  --gh-text: #1c1917;
  --gh-text-secondary: #6b655e;
  --gh-text-tertiary: #a29b92;
  --gh-primary: #4285f4;
  --gh-primary-soft: #e8f0fe;
  --gh-primary-soft-border: #d2e3fc;
  --gh-hover: #f4f2ef;
  --gh-shadow: 0 1px 2px rgba(28, 25, 23, 0.05), 0 10px 30px rgba(28, 25, 23, 0.06);
  --gh-code-bg: #151516;
  --gh-code-text: #e9e7e4;
  --gh-code-border: #252528;
  --gh-code-header-bg: #1c1c1e;
  --gh-code-btn-text: #97938c;
  --gh-code-btn-hover: #2b2b2e;
  --gh-code-btn-border: #353538;
  --gh-radius: 16px;
  --gh-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  --gh-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", "Courier New", monospace;
}
html[data-theme="dark"] {
  --gh-bg: #0f0f11;
  --gh-surface: #19191c;
  --gh-border: #2a2a2f;
  --gh-border-strong: #3a3a40;
  --gh-text: #ece9e5;
  --gh-text-secondary: #a6a19a;
  --gh-text-tertiary: #757068;
  --gh-primary: #818cf8;
  --gh-primary-soft: rgba(129, 140, 248, 0.14);
  --gh-primary-soft-border: rgba(129, 140, 248, 0.26);
  --gh-hover: #222226;
  --gh-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 10px 30px rgba(0, 0, 0, 0.38);
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--gh-bg);
  color: var(--gh-text);
  font-family: var(--gh-font);
  font-size: 16px;
  line-height: 1.7;
  font-optical-sizing: auto;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  transition: background 0.2s ease, color 0.2s ease;
}

@keyframes gh-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 纸面卡片：整篇导出内容落在居中的白卡上 */
.gh-shell {
  max-width: 820px;
  margin: 32px auto;
  padding: 32px 56px 44px;

  background: var(--gh-surface);
  border: 1px solid var(--gh-border);
  border-radius: var(--gh-radius);
  box-shadow: var(--gh-shadow);
  animation: gh-enter 240ms cubic-bezier(0.16, 1, 0.3, 1) both;
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

/* 顶部工具栏：主题切换 */
.gh-doc-header { position: relative; padding-right: 48px; }
.gh-toolbar { position: absolute; top: -2px; right: 0; display: flex; }
.gh-tool-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; padding: 0;
  border: 1px solid var(--gh-border);
  border-radius: 10px;
  background: transparent;
  color: var(--gh-text-secondary);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
.gh-tool-btn:hover { background: var(--gh-hover); color: var(--gh-text); border-color: var(--gh-border-strong); }
.gh-tool-btn:active { transform: scale(0.95); }
.gh-tool-btn:focus-visible { outline: 2px solid var(--gh-primary); outline-offset: 2px; }
.gh-tool-btn svg { display: none; }
.gh-tool-btn[data-theme-mode="auto"] .gh-icon-auto,
.gh-tool-btn[data-theme-mode="light"] .gh-icon-sun,
.gh-tool-btn[data-theme-mode="dark"] .gh-icon-moon { display: block; }

/* 文档头部 */
.gh-kicker {
  margin: 0 0 10px;
  font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--gh-text-secondary);
}
.gh-doc-header h1 {
  margin: 0 0 14px;
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  font-weight: 750;
  line-height: 1.2;
  letter-spacing: -0.03em;
  word-break: break-word;
}
.gh-doc-meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  color: var(--gh-text-secondary);
  font-size: 0.8125rem;
}
.gh-meta-dot { color: var(--gh-text-tertiary); }

.gh-conversation { margin-top: 36px; }

.gh-message {
  margin: 0 0 22px;
  padding: 20px 24px;
  border-radius: var(--gh-radius);
  background: var(--gh-surface);
  border: 1px solid var(--gh-border);
  box-shadow: 0 1px 2px rgba(28, 25, 23, 0.03);
}
.gh-message[data-role="user"] {
  background: var(--gh-primary-soft);
  border-color: var(--gh-primary-soft-border);
}
.gh-msg-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.gh-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--gh-hover);
  color: var(--gh-primary);
  flex-shrink: 0;
}
.gh-avatar svg { display: block; }
.gh-message[data-role="user"] .gh-avatar {
  background: var(--gh-primary);
  color: #ffffff;
}
.gh-msg-name { font-size: 0.8125rem; font-weight: 650; color: var(--gh-text-secondary); }
.gh-message[data-role="user"] .gh-msg-name { color: var(--gh-text); }

/* Markdown 渲染 */
.gh-markdown-preview { line-height: 1.75; font-size: 0.95rem; }
.gh-markdown-preview > :first-child { margin-top: 0; }
.gh-markdown-preview > :last-child { margin-bottom: 0; }
.gh-markdown-preview p { margin: 14px 0; }
.gh-markdown-preview h1, .gh-markdown-preview h2, .gh-markdown-preview h3, .gh-markdown-preview h4 {
  margin: 24px 0 10px; font-weight: 700; line-height: 1.35; letter-spacing: -0.02em;
}
.gh-markdown-preview h1 { font-size: 1.4em; }
.gh-markdown-preview h2 { font-size: 1.25em; padding-bottom: 6px; border-bottom: 1px solid var(--gh-border); }
.gh-markdown-preview h3 { font-size: 1.1em; }
.gh-markdown-preview h4 { font-size: 1em; }
.gh-markdown-preview h5, .gh-markdown-preview h6 { font-size: 0.92em; color: var(--gh-text-secondary); }
.gh-markdown-preview ul, .gh-markdown-preview ol { margin: 14px 0; padding-left: 26px; }
.gh-markdown-preview li { margin: 6px 0; }
.gh-markdown-preview li::marker { color: var(--gh-text-tertiary); }
.gh-markdown-preview a {
  color: var(--gh-primary);
  text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--gh-primary) 35%, transparent);
}
.gh-markdown-preview a:hover { border-bottom-color: var(--gh-primary); }
.gh-markdown-preview :not(pre) > code:not(.hljs) {
  background: var(--gh-hover);
  padding: 2px 6px; border-radius: 6px;
  font-family: var(--gh-mono); font-size: 0.875em; color: var(--gh-text);
}
.gh-markdown-preview blockquote {
  margin: 14px 0;
  padding: 4px 0 4px 18px;
  border-left: 3px solid var(--gh-border-strong);
  background: color-mix(in srgb, var(--gh-hover) 55%, transparent);
  color: var(--gh-text-secondary);
}
.gh-markdown-preview hr { margin: 24px 0; border: 0; border-top: 1px solid var(--gh-border); }
.gh-markdown-preview img { max-width: 100%; height: auto; border-radius: 10px; }
.gh-markdown-preview mark { padding: 1px 4px; border-radius: 3px; background: rgba(255, 213, 0, 0.35); color: inherit; }
.gh-markdown-preview .task-list-item { list-style: none; margin-left: -22px; }
.gh-markdown-preview .task-list-item input[type="checkbox"] { margin-right: 8px; }
.gh-markdown-preview table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; margin: 14px 0; font-size: 0.92em; }
.gh-markdown-preview th, .gh-markdown-preview td { padding: 8px 12px; border: 1px solid var(--gh-border); text-align: left; }
.gh-markdown-preview th { background: var(--gh-hover); font-weight: 650; }
.gh-variable-highlight { padding: 2px 6px; border-radius: 4px; background: color-mix(in srgb, var(--gh-primary) 14%, transparent); color: var(--gh-primary); font-family: var(--gh-mono); font-size: 0.9em; font-weight: 500; }

/* 思维链折叠（[Thought] blockquote 包装为 details） */
.gh-thought {
  margin: 16px 0;
  border: 1px solid var(--gh-border);
  border-radius: 12px;
  background: var(--gh-surface);
  overflow: hidden;
}
.gh-thought-summary {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px;
  font-size: 0.8125rem; font-weight: 650;
  color: var(--gh-text-secondary);
  cursor: pointer; user-select: none;
  list-style: none;
  transition: background 0.15s ease, color 0.15s ease;
}
.gh-thought-summary::-webkit-details-marker { display: none; }
.gh-thought-summary:hover { background: var(--gh-hover); color: var(--gh-text); }
.gh-thought-summary:focus-visible { outline: 2px solid var(--gh-primary); outline-offset: -2px; border-radius: 12px; }
.gh-thought-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--gh-primary); flex-shrink: 0;
}
.gh-thought[open] .gh-thought-summary { border-bottom: 1px solid var(--gh-border); }
.gh-thought-body { padding: 4px 0; }
.gh-thought-body blockquote {
  margin: 0; padding: 12px 16px;
  border-left: 0;
  background: transparent;
  color: var(--gh-text-secondary); font-size: 0.9em;
}

/* 提示容器 */
.gh-container { margin: 14px 0; padding: 12px 16px; border-radius: 10px; border-left: 4px solid; }
.gh-container-info { border-color: var(--gh-primary); background: var(--gh-primary-soft); }
.gh-container-warning { border-color: #f0a45c; background: rgba(240, 164, 92, 0.12); }
.gh-container-danger { border-color: #f0625d; background: rgba(240, 98, 93, 0.12); }

/* 代码块：标签栏 + 深色代码区（两主题下保持一致） */
.gh-code-wrapper {
  margin: 16px 0;
  border: 1px solid var(--gh-code-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--gh-code-bg);
}
.gh-code-header {
  display: flex; align-items: center; justify-content: space-between;
  height: 38px; padding: 0 6px 0 14px;
  background: var(--gh-code-header-bg);
  border-bottom: 1px solid var(--gh-code-border);
}
.gh-code-lang {
  font-family: var(--gh-mono); font-size: 11px; letter-spacing: 0.4px; text-transform: uppercase;
  color: var(--gh-code-btn-text);
  user-select: none;
}
.gh-code-copy-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; padding: 0; border-radius: 6px;
  border: 1px solid transparent; background: transparent;
  color: var(--gh-code-btn-text);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
.gh-code-copy-btn:hover { background: var(--gh-code-btn-hover); color: var(--gh-code-text); border-color: var(--gh-code-btn-border); }
.gh-code-copy-btn:active { transform: scale(0.92); }
.gh-code-copy-btn:focus-visible { outline: 2px solid var(--gh-primary); outline-offset: 1px; }
.gh-code-copy-btn svg { display: block; }
.gh-code-copy-btn[data-copied] { color: #3fb950; }
.gh-code-copy-btn[data-copied] svg { display: none; }
.gh-code-copy-btn[data-copied]::after { content: "✓"; font-size: 12px; line-height: 1; }
.gh-code-wrapper pre { margin: 0; }
.gh-code-wrapper pre code {
  display: block; padding: 16px 18px; overflow-x: auto;
  font-family: var(--gh-mono); font-size: 13.5px; line-height: 1.65;
  color: var(--gh-code-text); background: var(--gh-code-bg);
  white-space: pre; tab-size: 4;
}

/* highlight.js GitHub Dark 配色（代码区固定深色底） */
.hljs { display: block; }
.hljs-comment, .hljs-quote { color: #8b949e; font-style: italic; }
.hljs-keyword, .hljs-selector-tag { color: #ff7b72; }
.hljs-string, .hljs-doctag { color: #a5d6ff; }
.hljs-number, .hljs-literal { color: #79c0ff; }
.hljs-title, .hljs-section, .hljs-selector-id { color: #d2a8ff; font-weight: bold; }
.hljs-function > .hljs-title { color: #d2a8ff; }
.hljs-type, .hljs-class .hljs-title { color: #7ee787; }
.hljs-attribute { color: #79c0ff; }
.hljs-variable, .hljs-template-variable { color: #ffa657; }
.hljs-built_in, .hljs-params { color: #ffa657; }
.hljs-meta, .hljs-symbol, .hljs-bullet { color: #e3b341; }
.hljs-addition { color: #aff5b4; background: rgba(46, 160, 67, 0.15); }
.hljs-deletion { color: #ffdcd7; background: rgba(248, 81, 73, 0.15); }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: bold; }

/* 数学公式（MathML 由浏览器原生排版） */
.math-block { display: block; margin: 14px 0; overflow-x: auto; }
.math-inline { white-space: nowrap; }
math { font-family: "Cambria Math", "STIX Two Math", "Latin Modern Math", "Times New Roman", serif; }

/* 导出页脚 */
.gh-doc-footer {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 56px; padding-top: 28px;
  border-top: 1px solid var(--gh-border);
  color: var(--gh-text-tertiary);
  font-size: 0.75rem;
}
.gh-footer-dot { opacity: 0.6; }

/* 响应式 */
@media (max-width: 640px) {
  .gh-shell { margin: 0; padding: 28px 18px 32px; border-radius: 0; border-left: 0; border-right: 0; box-shadow: none; }
  .gh-doc-header h1 { font-size: 1.5rem; }
  .gh-message { padding: 16px; }
}

/* 打印：强制浅色、隐藏交互控件 */
@media print {
  :root, html[data-theme="dark"] {
    --gh-bg: #ffffff;
    --gh-surface: #ffffff;
    --gh-border: #e5e7eb;
    --gh-border-strong: #d1d5db;
    --gh-text: #111827;
    --gh-text-secondary: #4b5563;
    --gh-text-tertiary: #9ca3af;
    --gh-primary: #2563eb;
    --gh-primary-soft: #f0f4ff;
    --gh-primary-soft-border: #dbe3ff;
    --gh-code-bg: #f8f9fa;
    --gh-code-text: #1f2937;
    --gh-code-border: #e5e7eb;
    --gh-code-header-bg: #f0f1f3;
    --gh-code-btn-text: #6b7280;
    --gh-code-btn-hover: #e5e7eb;
  }
  body { font-size: 12pt; }
  .gh-shell { margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; }
  .gh-toolbar, .gh-code-header { display: none !important; }
  .gh-message { break-inside: avoid; }
  .gh-message[data-role="user"] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .gh-code-wrapper pre code { white-space: pre-wrap; word-break: break-word; }
  .gh-avatar { border: 1px solid var(--gh-border); }
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`

function getExportHtmlJs(): string {
  const themeLabels = JSON.stringify({
    auto: t("themeAuto"),
    light: t("themeLight"),
    dark: t("themeDark"),
  })

  return `
(function () {
  "use strict";
  var KEY = "gh-export-theme";
  var LABELS = ${themeLabels};

  function resolve(mode) {
    if (mode === "light" || mode === "dark") return mode;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    return "light";
  }
  function normalizeMode(mode) {
    return mode === "light" || mode === "dark" || mode === "auto" ? mode : "auto";
  }
  function apply(mode, persist, themeBtn) {
    mode = normalizeMode(mode);
    document.documentElement.setAttribute("data-theme", resolve(mode));
    if (themeBtn) {
      themeBtn.setAttribute("data-theme-mode", mode);
      themeBtn.setAttribute("aria-label", LABELS[mode] || LABELS.auto);
      themeBtn.setAttribute("title", LABELS[mode] || LABELS.auto);
    }
    if (persist) {
      try { localStorage.setItem(KEY, mode); } catch (err) { /* 存储不可用时保持当前页面状态 */ }
    }
  }
  function cycle(themeBtn) {
    var current = themeBtn.getAttribute("data-theme-mode") || "auto";
    var next = current === "light" ? "dark" : current === "dark" ? "auto" : "light";
    apply(next, true, themeBtn);
  }
  function init() {
    var themeBtn = document.getElementById("gh-theme-btn");
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (err) { /* 存储不可用时使用自动主题 */ }
    apply(normalizeMode(saved || "auto"), false, themeBtn);
    if (themeBtn) themeBtn.addEventListener("click", function () { cycle(themeBtn); });

    if (window.matchMedia) {
      var media = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function () {
        if ((themeBtn && themeBtn.getAttribute("data-theme-mode")) === "auto") apply("auto", false, themeBtn);
      };
      if (media.addEventListener) media.addEventListener("change", onChange);
      else if (media.addListener) media.addListener(onChange);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  document.addEventListener("click", function (event) {
    var target = event.target;
    var btn = target && target.closest ? target.closest("[data-copy-code]") : null;
    if (!btn) return;
    var wrapper = btn.closest(".gh-code-wrapper");
    if (!wrapper) return;
    var pre = wrapper.querySelector("pre");
    if (!pre) return;
    var text = pre.innerText || pre.textContent || "";
    function done() {
      btn.setAttribute("data-copied", "true");
      setTimeout(function () { btn.removeAttribute("data-copied"); }, 1200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done)["catch"](function () {});
    } else {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand("copy"); done(); } catch (err) { /* 复制失败时不伪造成功状态 */ }
      document.body.removeChild(textarea);
    }
  });
})();
`
}

const SUN_ICON_SVG =
  '<svg class="gh-icon-sun" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4l1.4-1.4"></path></svg>'
const MOON_ICON_SVG =
  '<svg class="gh-icon-moon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>'
const SYSTEM_ICON_SVG =
  '<svg class="gh-icon-auto" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"></rect><path d="M8 21h8m-4-4v4"></path></svg>'

const USER_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
const ASSISTANT_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.8 5.8 1.9-5.8 1.9L12 18.4l-1.9-5.8L4.3 10.7l5.8-1.9z"></path><path d="M19 3v3"></path><path d="M20.5 4.5h-3"></path></svg>'

function formatMessageHtml(
  msg: ExportMessage,
  metadata: ExportMetadata,
  turnNumber?: number,
): string {
  const isUser = msg.role === "user"
  const isAssistant = msg.role === "assistant"
  let label = isUser
    ? metadata.customUserName || t("exportUserLabel")
    : isAssistant
      ? metadata.customModelName || metadata.source
      : msg.role

  if (metadata.showIndex && turnNumber) {
    label = `${turnNumber}. ${label}`
  }
  const icon = isUser ? USER_ICON_SVG : ASSISTANT_ICON_SVG

  return `<article class="gh-message" data-role="${escapeHtml(msg.role)}">
  <div class="gh-msg-head">
    <span class="gh-avatar" aria-hidden="true">${icon}</span>
    <span class="gh-msg-name">${escapeHtml(label)}</span>
  </div>
  <div class="gh-markdown-preview">${renderExportMarkdown(msg.content)}</div>
</article>`
}

/**
 * 格式化为自包含的单文件 HTML
 */
export function formatToHTML(metadata: ExportMetadata, messages: ExportMessage[]): string {
  const lang = getCurrentLang() || "en"
  const title = escapeHtml(metadata.title)
  const time = escapeHtml(metadata.exportTime)
  const source = escapeHtml(metadata.source)
  const normalizedMessages = normalizeExportMessages(messages)

  let turnNumber = 0
  const messagesHtml = normalizedMessages
    .map((msg) => {
      if (msg.role === "user") {
        turnNumber += 1
      }
      // 开场 assistant（turnNumber 仍为 0）不传序号，标题不编号
      return formatMessageHtml(msg, metadata, turnNumber > 0 ? turnNumber : undefined)
    })
    .join("\n")

  return `<!DOCTYPE html>
<html lang="${lang}" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${EXPORT_HTML_CSS}</style>
<script>${getExportHtmlJs()}</script>
</head>
<body>
<main class="gh-shell">
  <header class="gh-doc-header">
    <div class="gh-toolbar">
      <button id="gh-theme-btn" class="gh-tool-btn" type="button" aria-label="${t("themeAuto")}" title="${t("themeAuto")}" data-theme-mode="auto">${SUN_ICON_SVG}${MOON_ICON_SVG}${SYSTEM_ICON_SVG}</button>
    </div>
    <p class="gh-kicker">Ophel Atlas</p>
    <h1>${title}</h1>
    <div class="gh-doc-meta">
      <span>${time}</span>
      <span class="gh-meta-dot" aria-hidden="true">·</span>
      <span>${source}</span>
    </div>
  </header>
  <section class="gh-conversation">
${messagesHtml}
  </section>
  <footer class="gh-doc-footer">
    <span>Ophel Atlas</span>
    <span class="gh-footer-dot" aria-hidden="true">·</span>
    <span>${time}</span>
  </footer>
</main>
</body>
</html>`
}
// ==================== 文件操作 ====================

const textEncoder = new TextEncoder()
let crc32Table: Uint32Array | null = null

function getCrc32Table(): Uint32Array {
  if (crc32Table) return crc32Table

  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[i] = value >>> 0
  }
  crc32Table = table
  return table
}

function calculateCrc32(data: Uint8Array): number {
  const table = getCrc32Table()
  let crc = 0xffffffff
  for (const byte of data) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeUint16LE(target: Uint8Array, offset: number, value: number): number {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
  return offset + 2
}

function writeUint32LE(target: Uint8Array, offset: number, value: number): number {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
  target[offset + 2] = (value >>> 16) & 0xff
  target[offset + 3] = (value >>> 24) & 0xff
  return offset + 4
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  chunks.forEach((chunk) => {
    result.set(chunk, offset)
    offset += chunk.length
  })
  return result
}

function getZipDosDateTime(date = new Date()): { dosDate: number; dosTime: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

async function toUint8Array(data: string | Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (typeof data === "string") {
    return textEncoder.encode(data)
  }
  if (data instanceof Uint8Array) {
    return data
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }
  return new Uint8Array(await data.arrayBuffer())
}

function sanitizeZipPathSegment(value: string, fallback: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
  return sanitized || fallback
}

function normalizeZipPath(value: string, fallback: string): string {
  const segments = value
    .replace(/\\/g, "/")
    .replace(/^[a-zA-Z]:\//, "")
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => sanitizeZipPathSegment(segment, "asset"))
    .filter((segment) => segment !== "." && segment !== "..")

  return segments.length > 0 ? segments.join("/") : fallback
}

export function normalizeExportAssetPath(value: string, fallback = "assets/asset"): string {
  return normalizeZipPath(value, fallback)
}

function ensureUniqueZipPath(path: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(path)) {
    usedPaths.add(path)
    return path
  }

  const slashIndex = path.lastIndexOf("/")
  const directory = slashIndex >= 0 ? `${path.slice(0, slashIndex + 1)}` : ""
  const filename = slashIndex >= 0 ? path.slice(slashIndex + 1) : path
  const dotIndex = filename.lastIndexOf(".")
  const basename = dotIndex > 0 ? filename.slice(0, dotIndex) : filename
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : ""

  for (let index = 2; index < 10000; index += 1) {
    const candidate = `${directory}${basename}-${index}${extension}`
    if (!usedPaths.has(candidate)) {
      usedPaths.add(candidate)
      return candidate
    }
  }

  throw new Error(`Unable to create unique zip path for ${path}`)
}

export function createUniqueExportAssetPath(
  path: string,
  usedPaths: Set<string>,
  fallback = "assets/asset",
): string {
  return ensureUniqueZipPath(normalizeExportAssetPath(path, fallback), usedPaths)
}

function getDefaultAssetPath(asset: ExportAsset): string {
  return `assets/${sanitizeZipPathSegment(asset.name, asset.id || "asset")}`
}

const EXPORT_IMAGE_SRC_ATTR = "data-ophel-export-image-src"
const WATERMARK_SOURCE_ATTR = "data-ophel-wm-source"

function isGoogleusercontentHost(hostname: string): boolean {
  return hostname === "googleusercontent.com" || hostname.endsWith(".googleusercontent.com")
}

function canonicalizeExportAssetMatchUrl(url: string): string {
  if (!url) return ""
  if (url.startsWith("blob:") || url.startsWith("data:")) return url

  try {
    const parsed = new URL(url)
    parsed.hash = ""
    if (isGoogleusercontentHost(parsed.hostname)) {
      // Display URLs often use =w400-h300 while export assets keep =s0.
      parsed.pathname = parsed.pathname.replace(/=(?:s|w|h)\d+[^/]*$/i, "")
      parsed.search = ""
    }
    return parsed.toString()
  } catch {
    return url
  }
}

function areExportAssetUrlsEquivalent(left: string, right: string): boolean {
  if (!left || !right) return false
  if (left === right) return true
  const canonicalLeft = canonicalizeExportAssetMatchUrl(left)
  const canonicalRight = canonicalizeExportAssetMatchUrl(right)
  return Boolean(canonicalLeft) && canonicalLeft === canonicalRight
}

function getImageSourceCandidates(image: HTMLImageElement): string[] {
  const candidates = [
    image.currentSrc || "",
    image.src || "",
    image.getAttribute("src") || "",
    image.getAttribute(EXPORT_IMAGE_SRC_ATTR) || "",
    image.getAttribute(WATERMARK_SOURCE_ATTR) || "",
  ]
  const unique: string[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    unique.push(candidate)
  }
  return unique
}

function isMatchingExportImageSource(sourceUrl: string, image: HTMLImageElement): boolean {
  return getImageSourceCandidates(image).some((candidate) =>
    areExportAssetUrlsEquivalent(sourceUrl, candidate),
  )
}

function getImageRenderedArea(image: HTMLImageElement): number {
  const width = image.naturalWidth || image.width || 0
  const height = image.naturalHeight || image.height || 0
  return Math.max(0, width) * Math.max(0, height)
}

export function findMatchingImageInDocument(sourceUrl: string): HTMLImageElement | null {
  if (typeof document === "undefined" || !sourceUrl) return null

  let best: HTMLImageElement | null = null
  let bestArea = -1

  for (const image of Array.from(document.querySelectorAll("img"))) {
    if (!isMatchingExportImageSource(sourceUrl, image)) continue
    const area = getImageRenderedArea(image)
    if (!best || area > bestArea) {
      best = image
      bestArea = area
    }
  }

  return best
}

function isSameOriginImageSource(source: string): boolean {
  if (!source) return false
  if (source.startsWith("blob:") || source.startsWith("data:")) return true
  if (typeof window === "undefined") return false

  try {
    return new URL(source, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

function resolveCanvasMimeType(asset?: ExportAsset): string {
  const mimeType = (asset?.mimeType || "").toLowerCase()
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "image/jpeg"
  if (mimeType === "image/webp") return "image/webp"

  const name = (asset?.name || "").toLowerCase()
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg"
  if (name.endsWith(".webp")) return "image/webp"
  return "image/png"
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const commaIndex = dataUrl.indexOf(",")
    if (!dataUrl.startsWith("data:") || commaIndex < 0) return null

    const header = dataUrl.slice(0, commaIndex)
    const payload = dataUrl.slice(commaIndex + 1)
    const mimeType = header.match(/^data:([^;,]+)/)?.[1] || "application/octet-stream"
    const isBase64 = /;base64/i.test(header)

    if (!isBase64) {
      return new Blob([decodeURIComponent(payload)], { type: mimeType })
    }

    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new Blob([bytes], { type: mimeType })
  } catch {
    return null
  }
}

async function readRenderedImageBlob(image: HTMLImageElement): Promise<Blob | null> {
  const candidates = getImageSourceCandidates(image)

  for (const candidate of candidates) {
    if (!candidate.startsWith("data:image/")) continue
    const blob = dataUrlToBlob(candidate)
    if (blob) return blob
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith("blob:")) continue
    try {
      const response = await fetch(candidate)
      if (response.ok) return await response.blob()
    } catch {
      // Try the next candidate; canvas remains the last resort.
    }
  }

  return null
}

async function ensureImageDecoded(image: HTMLImageElement): Promise<void> {
  if (image.complete && (image.naturalWidth > 0 || image.width > 0)) return
  if (typeof image.decode !== "function") {
    throw new Error("Image is not loaded and cannot be decoded")
  }
  await image.decode()
}

function isSecurityError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "SecurityError"
  }
  return error instanceof Error && error.name === "SecurityError"
}

async function renderImageElementToBlob(
  image: HTMLImageElement,
  asset?: ExportAsset,
): Promise<Blob> {
  const source = image.currentSrc || image.src || image.getAttribute("src") || ""
  if (!isSameOriginImageSource(source)) {
    throw new Error("Canvas fallback is only available for same-origin images")
  }

  await ensureImageDecoded(image)

  const width = image.naturalWidth || image.width || image.clientWidth
  const height = image.naturalHeight || image.height || image.clientHeight
  if (width <= 0 || height <= 0) {
    throw new Error("Image has no exportable size")
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("2D canvas context unavailable")
  }

  try {
    context.drawImage(image, 0, 0, width, height)
  } catch (error) {
    if (isSecurityError(error)) {
      throw new Error("Canvas is tainted and cannot be exported")
    }
    throw error
  }

  const mimeType = resolveCanvasMimeType(asset)

  try {
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Canvas export produced no image data"))
          return
        }
        resolve(blob)
      }, mimeType)
    })
  } catch (error) {
    if (isSecurityError(error)) {
      throw new Error("Canvas is tainted and cannot be exported")
    }
    throw error
  }
}

async function resolveImageElementBlob(
  image: HTMLImageElement,
  asset?: ExportAsset,
): Promise<Blob> {
  const renderedBlob = await readRenderedImageBlob(image)
  if (renderedBlob) return renderedBlob
  return await renderImageElementToBlob(image, asset)
}

async function resolveAssetData(
  asset: ExportAsset,
): Promise<string | Blob | ArrayBuffer | Uint8Array> {
  if (asset.content !== undefined) {
    return asset.content
  }

  if (!asset.sourceUrl) {
    throw new Error("Asset has no content or source URL")
  }

  const sourceUrl = asset.sourceUrl
  const matchingImage = findMatchingImageInDocument(sourceUrl)

  if (sourceUrl.startsWith("blob:")) {
    try {
      const response = await fetch(sourceUrl)
      if (response.ok) {
        return await response.blob()
      }
    } catch {
      // Fall through to the matching rendered image.
    }

    if (matchingImage) {
      return await resolveImageElementBlob(matchingImage, asset)
    }

    throw new Error("Blob asset URL expired or unavailable")
  }

  if (matchingImage) {
    const renderedBlob = await readRenderedImageBlob(matchingImage)
    if (renderedBlob) return renderedBlob
  }

  try {
    const response = await fetch(sourceUrl, {
      credentials: "include",
      cache: "force-cache",
    })
    if (!response.ok) {
      throw new Error(`Asset fetch failed with HTTP ${response.status}`)
    }

    return response.blob()
  } catch (pageFetchError) {
    if (!/^https?:\/\//i.test(sourceUrl)) {
      if (matchingImage) {
        return await resolveImageElementBlob(matchingImage, asset)
      }
      throw pageFetchError
    }

    try {
      const response = await platform.fetch(sourceUrl)
      if (!response.ok) {
        throw new Error(`Asset proxy fetch failed with HTTP ${response.status}`)
      }

      return response.blob()
    } catch (proxyFetchError) {
      if (matchingImage) {
        const source =
          matchingImage.currentSrc || matchingImage.src || matchingImage.getAttribute("src") || ""
        if (isSameOriginImageSource(source)) {
          try {
            return await renderImageElementToBlob(matchingImage, asset)
          } catch (canvasError) {
            throw new Error(
              `Asset fetch failed: ${getErrorMessage(pageFetchError)}; proxy fetch failed: ${getErrorMessage(proxyFetchError)}; canvas fallback failed: ${getErrorMessage(canvasError)}`,
            )
          }
        }
      }

      throw new Error(
        `Asset fetch failed: ${getErrorMessage(pageFetchError)}; proxy fetch failed: ${getErrorMessage(proxyFetchError)}`,
      )
    }
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

async function createZipBlob(files: ZipFileInput[]): Promise<Blob> {
  const entries: ZipFileEntry[] = []
  const chunks: Uint8Array[] = []
  const { dosDate, dosTime } = getZipDosDateTime()
  let offset = 0

  for (const file of files) {
    const path = normalizeZipPath(file.path, "file")
    const nameBytes = textEncoder.encode(path)
    const data = await toUint8Array(file.data)
    const crc32 = calculateCrc32(data)
    const localHeader = new Uint8Array(30 + nameBytes.length)
    let cursor = 0

    cursor = writeUint32LE(localHeader, cursor, 0x04034b50)
    cursor = writeUint16LE(localHeader, cursor, 20)
    cursor = writeUint16LE(localHeader, cursor, 0x0800)
    cursor = writeUint16LE(localHeader, cursor, 0)
    cursor = writeUint16LE(localHeader, cursor, dosTime)
    cursor = writeUint16LE(localHeader, cursor, dosDate)
    cursor = writeUint32LE(localHeader, cursor, crc32)
    cursor = writeUint32LE(localHeader, cursor, data.length)
    cursor = writeUint32LE(localHeader, cursor, data.length)
    cursor = writeUint16LE(localHeader, cursor, nameBytes.length)
    cursor = writeUint16LE(localHeader, cursor, 0)
    localHeader.set(nameBytes, cursor)

    entries.push({
      path,
      data,
      crc32,
      dosTime,
      dosDate,
      localHeaderOffset: offset,
    })
    chunks.push(localHeader, data)
    offset += localHeader.length + data.length
  }

  const centralDirectoryOffset = offset

  entries.forEach((entry) => {
    const nameBytes = textEncoder.encode(entry.path)
    const centralHeader = new Uint8Array(46 + nameBytes.length)
    let cursor = 0

    cursor = writeUint32LE(centralHeader, cursor, 0x02014b50)
    cursor = writeUint16LE(centralHeader, cursor, 20)
    cursor = writeUint16LE(centralHeader, cursor, 20)
    cursor = writeUint16LE(centralHeader, cursor, 0x0800)
    cursor = writeUint16LE(centralHeader, cursor, 0)
    cursor = writeUint16LE(centralHeader, cursor, entry.dosTime)
    cursor = writeUint16LE(centralHeader, cursor, entry.dosDate)
    cursor = writeUint32LE(centralHeader, cursor, entry.crc32)
    cursor = writeUint32LE(centralHeader, cursor, entry.data.length)
    cursor = writeUint32LE(centralHeader, cursor, entry.data.length)
    cursor = writeUint16LE(centralHeader, cursor, nameBytes.length)
    cursor = writeUint16LE(centralHeader, cursor, 0)
    cursor = writeUint16LE(centralHeader, cursor, 0)
    cursor = writeUint16LE(centralHeader, cursor, 0)
    cursor = writeUint16LE(centralHeader, cursor, 0)
    cursor = writeUint32LE(centralHeader, cursor, 0)
    cursor = writeUint32LE(centralHeader, cursor, entry.localHeaderOffset)
    centralHeader.set(nameBytes, cursor)

    chunks.push(centralHeader)
    offset += centralHeader.length
  })

  const centralDirectorySize = offset - centralDirectoryOffset
  const endRecord = new Uint8Array(22)
  let cursor = 0

  cursor = writeUint32LE(endRecord, cursor, 0x06054b50)
  cursor = writeUint16LE(endRecord, cursor, 0)
  cursor = writeUint16LE(endRecord, cursor, 0)
  cursor = writeUint16LE(endRecord, cursor, entries.length)
  cursor = writeUint16LE(endRecord, cursor, entries.length)
  cursor = writeUint32LE(endRecord, cursor, centralDirectorySize)
  cursor = writeUint32LE(endRecord, cursor, centralDirectoryOffset)
  writeUint16LE(endRecord, cursor, 0)
  chunks.push(endRecord)

  return new Blob([concatUint8Arrays(chunks)], { type: "application/zip" })
}

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
    return await downloadBlob(blob, filename)
  } catch (err: unknown) {
    console.error("[Exporter] Download failed:", err)
    showToast(t("exportFailed"))
    return false
  }
}

export async function downloadBlob(blob: Blob, filename: string): Promise<boolean> {
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return true
  } catch (err: unknown) {
    console.error("[Exporter] Download failed:", err)
    showToast(t("exportFailed"))
    return false
  }
}

export async function downloadExportPackage(input: ExportPackageInput): Promise<boolean> {
  const usedPaths = new Set<string>()
  const markdownPath = ensureUniqueZipPath(
    normalizeZipPath(input.markdownFilename, "conversation.md"),
    usedPaths,
  )
  const files: ZipFileInput[] = [
    {
      path: markdownPath,
      data: input.markdownContent,
      mimeType: "text/markdown;charset=utf-8",
    },
  ]
  const manifestAssets: ExportAssetManifestItem[] = []

  for (const asset of input.assets) {
    const assetPath = createUniqueExportAssetPath(
      asset.relativePath || getDefaultAssetPath(asset),
      usedPaths,
    )

    try {
      const data = await resolveAssetData(asset)
      files.push({
        path: assetPath,
        data,
        mimeType: asset.mimeType,
      })
      manifestAssets.push({
        name: asset.name,
        path: assetPath,
        kind: asset.kind,
        mimeType: asset.mimeType,
        sourceUrl: asset.sourceUrl,
        description: asset.description,
        included: true,
      })
    } catch (error) {
      console.warn("[Exporter] Failed to include export asset:", asset.name, error)
      manifestAssets.push({
        name: asset.name,
        path: assetPath,
        kind: asset.kind,
        mimeType: asset.mimeType,
        sourceUrl: asset.sourceUrl,
        description: asset.description,
        included: false,
        error: getErrorMessage(error),
      })
    }
  }

  files.push({
    path: ensureUniqueZipPath("manifest.json", usedPaths),
    data: JSON.stringify(
      {
        version: 1,
        metadata: {
          title: input.metadata.title,
          id: input.metadata.id,
          url: input.metadata.url,
          exportTime: input.metadata.exportTime,
          source: input.metadata.source,
        },
        markdown: markdownPath,
        assets: manifestAssets,
      },
      null,
      2,
    ),
    mimeType: "application/json;charset=utf-8",
  })

  try {
    const zipBlob = await createZipBlob(files)
    return await downloadBlob(zipBlob, input.packageFilename)
  } catch (error) {
    console.error("[Exporter] Package download failed:", error)
    showToast(t("exportFailed"))
    return false
  }
}

export async function downloadZipFiles(files: ZipFileInput[], filename: string): Promise<boolean> {
  try {
    const zipBlob = await createZipBlob(files)
    return await downloadBlob(zipBlob, filename)
  } catch (error) {
    console.error("[Exporter] ZIP download failed:", error)
    showToast(t("exportFailed"))
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
  options?: {
    customUserName?: string
    customModelName?: string
    showIndex?: boolean
    customDivider?: string
  },
): ExportMetadata {
  return {
    title: title || t("exportUntitled"),
    id,
    url: window.location.href,
    exportTime: new Date().toLocaleString(),
    source,
    customUserName: options?.customUserName,
    customModelName: options?.customModelName,
    showIndex: options?.showIndex,
    customDivider: options?.customDivider,
  }
}
