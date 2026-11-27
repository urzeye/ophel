/**
 * Markdown 标题层级提取与标准化工具
 *
 * 通过 ~utils/markdown 复用 CommonMark 块级解析器（油猴端共享 markdown-vendor，不重复打包）：
 * - 精准跳过围栏代码块（含嵌套长围栏）、4 空格缩进代码块、HTML 块以及引用/列表内嵌套标题
 * - 兼容 ATX（# ~ ######）与 Setext（=== / ---）标题
 * - 单向降级策略：仅当单条消息包含顶层 H1 时，将顶层标题统一顺延 +1（H1~H5 -> H2~H6，H6 -> 加粗段落）
 */

import { createCommonmarkParser } from "~utils/markdown"

export interface MarkdownHeadingInfo {
  level: number
  text: string
  startLine: number
  endLine: number
  isSetext: boolean
}

type CommonmarkToken = {
  type: string
  tag: string
  level: number
  markup: string
  content: string
  map: [number, number] | null
  children?: CommonmarkToken[] | null
}

type CommonmarkParser = ReturnType<typeof createCommonmarkParser>

let commonmarkParser: CommonmarkParser | null = null

function getCommonmarkParser(): CommonmarkParser {
  if (!commonmarkParser) {
    commonmarkParser = createCommonmarkParser()
  }
  return commonmarkParser
}

function getInlineChildren(md: CommonmarkParser, text: string): CommonmarkToken[] {
  const inlineTokens = md.parseInline(text, {}) as CommonmarkToken[]
  return (inlineTokens[0]?.children ?? []).filter(
    (token) => !(token.type === "text" && token.content === ""),
  )
}

function isWrappedBySingleTokenPair(
  children: CommonmarkToken[],
  openType: string,
  closeType: string,
): boolean {
  if (children.length < 2) return false
  if (children[0].type !== openType || children[children.length - 1].type !== closeType) {
    return false
  }

  let depth = 0
  for (let i = 0; i < children.length; i += 1) {
    if (children[i].type === openType) {
      depth += 1
    } else if (children[i].type === closeType) {
      depth -= 1
    }

    // 中途归零说明属于 "**A** and **B**" 类分段加粗，而非整段包裹
    if (i < children.length - 1 && depth <= 0) {
      return false
    }
  }

  return depth === 0
}

function isWrappedInSingleStrong(md: CommonmarkParser, text: string): boolean {
  return isWrappedBySingleTokenPair(getInlineChildren(md, text), "strong_open", "strong_close")
}

function isAlreadyFullyBold(md: CommonmarkParser, text: string): boolean {
  const children = getInlineChildren(md, text)
  if (isWrappedBySingleTokenPair(children, "strong_open", "strong_close")) {
    return true
  }
  // 兼容整段粗斜体（如 ***text*** -> em_open + strong_open + ... + strong_close + em_close）
  if (isWrappedBySingleTokenPair(children, "em_open", "em_close")) {
    return isWrappedBySingleTokenPair(children.slice(1, -1), "strong_open", "strong_close")
  }
  return false
}

function hasInlineStrongWithMarkup(
  md: CommonmarkParser,
  text: string,
  markup: "**" | "__",
): boolean {
  const children = getInlineChildren(md, text)
  return children.some((token) => token.type === "strong_open" && token.markup === markup)
}

/**
 * 文本以奇数个反斜杠结尾时，若直接套 **...** 会转义闭合定界符的第一个字符导致加粗失效；
 * 补齐为偶数个反斜杠即可保住原字面量 \ 并让闭合定界符生效。
 */
function escapeTrailingOddBackslash(text: string): string {
  const match = text.match(/\\+$/)
  if (!match || match[0].length % 2 === 0) return text
  return `${text}\\`
}

function stripUnprotectedStarStrongDelimiters(text: string): string {
  // 保留行内代码片段，且只剥离可能与外层 ** 冲突的 **，避免误伤链接 URL 等处的 __
  const codeSpans: string[] = []
  const placeholderText = text.replace(/(`+)([\s\S]*?)\1/g, (match) => {
    codeSpans.push(match)
    return `\x00CODE${codeSpans.length - 1}\x00`
  })

  const stripped = placeholderText.replace(/\\.|(\*\*)/g, (match, delimiter?: string) =>
    delimiter ? "" : match,
  )

  return stripped.replace(/\x00CODE(\d+)\x00/g, (_match, index: string) => {
    return codeSpans[Number(index)] ?? ""
  })
}

/**
 * 提取 Markdown 正文中的顶层标题（CommonMark level === 0）
 */
export function extractTopLevelMarkdownHeadings(content: string): MarkdownHeadingInfo[] {
  if (!content) return []

  const md = getCommonmarkParser()
  const normalized = content.replace(/\r\n?/g, "\n")
  const tokens: CommonmarkToken[] = []
  md.block.parse(normalized, md, {}, tokens as never)

  const headings: MarkdownHeadingInfo[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token.type !== "heading_open" || token.level !== 0 || !token.map) continue

    const level = Number(token.tag.slice(1))
    if (!Number.isInteger(level) || level < 1 || level > 6) continue

    const inlineToken = tokens[i + 1]
    const text = inlineToken?.type === "inline" ? inlineToken.content : ""
    const isSetext = token.markup === "=" || token.markup === "-"

    headings.push({
      level,
      text,
      startLine: token.map[0],
      endLine: token.map[1],
      isSetext,
    })
  }

  return headings
}

/**
 * 将溢出 6 级的标题文本安全格式化为单行加粗 Markdown
 */
export function formatBoldMarkdownLine(text: string): string {
  const singleLine = text.replace(/\s*\n\s*/g, " ").trim()
  if (!singleLine) return ""

  const md = getCommonmarkParser()
  if (isAlreadyFullyBold(md, singleLine)) {
    return singleLine
  }

  const safeInner = escapeTrailingOddBackslash(singleLine)

  const starCandidate = `**${safeInner}**`
  if (
    !hasInlineStrongWithMarkup(md, safeInner, "**") &&
    isWrappedInSingleStrong(md, starCandidate)
  ) {
    return starCandidate
  }

  const underCandidate = `__${safeInner}__`
  if (
    !hasInlineStrongWithMarkup(md, safeInner, "__") &&
    isWrappedInSingleStrong(md, underCandidate)
  ) {
    return underCandidate
  }

  // 若内部同时含 ** 与 __ 或紧邻字词造成定界符提前闭合，优先选通过解析校验的包装；
  // 否则剥离非代码片段内的冗余加粗定界符后再用 ** 包裹
  if (isWrappedInSingleStrong(md, starCandidate)) {
    return starCandidate
  }
  if (isWrappedInSingleStrong(md, underCandidate)) {
    return underCandidate
  }

  const cleaned = escapeTrailingOddBackslash(
    stripUnprotectedStarStrongDelimiters(singleLine).trim(),
  )
  return cleaned ? `**${cleaned}**` : `**${safeInner}**`
}

/**
 * 标准化单条消息内的 Markdown 标题层级（配合外层 H1 轮次标题）：
 * - 仅当消息内含顶层 H1 时触发单向顺延（只下移、不上提）
 * - H1~H5 -> H2~H6（Setext H1/H2 统一转为 ATX H2/H3）
 * - H6 -> 独立加粗段落（上下紧邻非空行时补空行，防止段落粘连或误成 Setext 下划线）
 */
export function normalizeMarkdownHeadings(content: string): string {
  if (!content) return content

  const normalized = content.replace(/\r\n?/g, "\n")
  const headings = extractTopLevelMarkdownHeadings(normalized)
  if (!headings.some((heading) => heading.level === 1)) {
    return content
  }

  const headingByStartLine = new Map<number, MarkdownHeadingInfo>()
  for (const heading of headings) {
    headingByStartLine.set(heading.startLine, heading)
  }

  const lines = normalized.split("\n")
  const result: string[] = []
  let needBlankLineBeforeNextContent = false
  let skipNextBlankLine = false

  const ensureBlankLineIfNeeded = () => {
    if (
      needBlankLineBeforeNextContent &&
      result.length > 0 &&
      result[result.length - 1].trim() !== ""
    ) {
      result.push("")
    }
    needBlankLineBeforeNextContent = false
    skipNextBlankLine = false
  }

  for (let i = 0; i < lines.length; ) {
    const heading = headingByStartLine.get(i)

    if (!heading) {
      if (lines[i].trim() === "") {
        if (skipNextBlankLine) {
          skipNextBlankLine = false
          i += 1
          continue
        }
        needBlankLineBeforeNextContent = false
        result.push(lines[i])
        i += 1
        continue
      }

      ensureBlankLineIfNeeded()
      result.push(lines[i])
      i += 1
      continue
    }

    if (heading.level < 6) {
      ensureBlankLineIfNeeded()

      if (heading.isSetext) {
        const headingText = heading.text.replace(/\s*\n\s*/g, " ").trim()
        const prefix = "#".repeat(heading.level + 1)
        result.push(headingText ? `${prefix} ${headingText}` : prefix)
      } else {
        result.push(lines[i].replace(/^(\s{0,3})(#{1,5})(?=[ \t]|$)/, "$1#$2"))
      }

      i = heading.endLine
      continue
    }

    const boldLine = formatBoldMarkdownLine(heading.text)
    if (boldLine) {
      if (result.length > 0 && result[result.length - 1].trim() !== "") {
        result.push("")
      }
      result.push(boldLine)
      needBlankLineBeforeNextContent = true
      skipNextBlankLine = false
    } else {
      // 空 H6 不生成 ****：延迟到后面真正出现非空内容时再补空行，避免末尾产生多余空行；
      // 若上方已有空行则跳过紧随其后的重复空行
      const hasLeadingBlank = result.length > 0 && result[result.length - 1].trim() === ""
      needBlankLineBeforeNextContent = result.length > 0 && !hasLeadingBlank
      skipNextBlankLine = hasLeadingBlank
    }

    i = heading.endLine
  }

  return result.join("\n")
}
