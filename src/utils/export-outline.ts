import type { ExportMessage } from "~utils/exporter"
import { extractTopLevelMarkdownHeadings, formatBoldMarkdownLine } from "~utils/markdown-headings"
import { cleanOutlineTitle } from "~utils/outline-text"

export interface ExportMessagesOutlineOptions {
  includeUserQueries: boolean
  maxHeadingLevel?: number
}

export interface ExportMessagesOutlineResult {
  text: string
  count: number
}

interface ExportOutlineItem {
  level: number
  text: string
}

export interface OutlineTextNode {
  level: number
  text: string
  isUserQuery?: boolean
  index?: number
  children?: OutlineTextNode[]
}

export interface OutlineTextTreeOptions {
  includeUserQueries: boolean
  isIncluded?: (node: OutlineTextNode) => boolean
}

const MAX_MARKDOWN_HEADING_LEVEL = 6
const USER_QUERY_HEADING_LEVEL = 1

function clampHeadingLevel(level: number | undefined): number {
  if (typeof level !== "number" || !Number.isFinite(level)) return MAX_MARKDOWN_HEADING_LEVEL
  return Math.min(MAX_MARKDOWN_HEADING_LEVEL, Math.max(0, Math.floor(level)))
}

function normalizeOutlineText(value: string): string {
  return cleanOutlineTitle(value)
}

function isNonEmptyUserQueryText(text: string): boolean {
  // 跳过空白与不可见字符（含快速引用标记残留的 U+2063 Invisible Separator）
  return Boolean(text && text.replace(/[\s\u2063]/g, "").length > 0)
}

function getMarkdownHeadingPrefix(level: number): string {
  return "#".repeat(Math.min(MAX_MARKDOWN_HEADING_LEVEL, Math.max(1, level)))
}

function formatHeadingOutlineLine(level: number, text: string, shift: number): string {
  const effectiveLevel = level + shift
  if (effectiveLevel > MAX_MARKDOWN_HEADING_LEVEL) {
    return formatBoldMarkdownLine(text)
  }
  return `${getMarkdownHeadingPrefix(effectiveLevel)} ${text}`
}

function formatHeadingGroup(
  headings: ExportOutlineItem[],
  maxHeadingLevel: number,
  shiftWhenHasH1: boolean,
): string[] {
  if (headings.length === 0 || maxHeadingLevel < 1) return []

  const shift = shiftWhenHasH1 && headings.some((item) => item.level === 1) ? 1 : 0

  return headings.flatMap((item) => {
    if (item.level > maxHeadingLevel) return []

    return [formatHeadingOutlineLine(item.level, item.text, shift)]
  })
}

function formatUserQueryHeading(text: string, count: number): string {
  return `${getMarkdownHeadingPrefix(USER_QUERY_HEADING_LEVEL)} Q${count}. ${text}`
}

export function createOutlineTextFromExportMessages(
  messages: ExportMessage[],
  options: ExportMessagesOutlineOptions,
): ExportMessagesOutlineResult {
  const maxHeadingLevel = clampHeadingLevel(options.maxHeadingLevel)
  const hasVisibleUserQueries =
    options.includeUserQueries &&
    messages.some(
      (message) =>
        message.role.toLowerCase() === "user" &&
        isNonEmptyUserQueryText(normalizeOutlineText(message.content)),
    )

  const lines: string[] = []
  let userQueryCount = 0
  let pendingHeadings: ExportOutlineItem[] = []

  const flushPendingHeadings = () => {
    if (pendingHeadings.length === 0) return
    lines.push(...formatHeadingGroup(pendingHeadings, maxHeadingLevel, hasVisibleUserQueries))
    pendingHeadings = []
  }

  for (const message of messages) {
    const role = message.role.toLowerCase()

    if (role === "user") {
      if (!options.includeUserQueries) continue

      const text = normalizeOutlineText(message.content)
      if (isNonEmptyUserQueryText(text)) {
        flushPendingHeadings()
        userQueryCount += 1
        lines.push(formatUserQueryHeading(text, userQueryCount))
      }
      continue
    }

    const headings: ExportOutlineItem[] = extractTopLevelMarkdownHeadings(message.content).flatMap(
      (heading) => {
        const text = normalizeOutlineText(heading.text)
        return text ? [{ level: heading.level, text }] : []
      },
    )
    pendingHeadings.push(...headings)
  }
  flushPendingHeadings()

  if (lines.length === 0) {
    return { text: "", count: 0 }
  }

  return {
    text: lines.join("\n\n"),
    count: lines.length,
  }
}

export function createOutlineTextFromOutlineTree(
  nodes: OutlineTextNode[],
  options: OutlineTextTreeOptions,
): ExportMessagesOutlineResult {
  type FlatEntry = {
    isUserQuery: boolean
    level: number
    text: string
  }

  const entries: FlatEntry[] = []

  const traverse = (node: OutlineTextNode) => {
    const included = options.isIncluded ? options.isIncluded(node) : true

    if (included) {
      const text = normalizeOutlineText(node.text)

      if (text) {
        if (node.isUserQuery) {
          if (options.includeUserQueries && isNonEmptyUserQueryText(text)) {
            entries.push({ isUserQuery: true, level: USER_QUERY_HEADING_LEVEL, text })
          }
        } else {
          entries.push({ isUserQuery: false, level: node.level, text })
        }
      }
    }

    node.children?.forEach(traverse)
  }

  nodes.forEach(traverse)

  const hasVisibleUserQueries = entries.some((entry) => entry.isUserQuery)
  const lines: string[] = []
  let userQueryCount = 0
  let pendingHeadings: ExportOutlineItem[] = []

  const flushPendingHeadings = () => {
    if (pendingHeadings.length === 0) return
    lines.push(
      ...formatHeadingGroup(pendingHeadings, MAX_MARKDOWN_HEADING_LEVEL, hasVisibleUserQueries),
    )
    pendingHeadings = []
  }

  for (const entry of entries) {
    if (entry.isUserQuery) {
      flushPendingHeadings()
      userQueryCount += 1
      lines.push(formatUserQueryHeading(entry.text, userQueryCount))
    } else {
      pendingHeadings.push({ level: entry.level, text: entry.text })
    }
  }
  flushPendingHeadings()

  if (lines.length === 0) {
    return { text: "", count: 0 }
  }

  return {
    text: lines.join("\n\n"),
    count: lines.length,
  }
}
