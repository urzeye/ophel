import type { ExportMessage } from "~utils/exporter"

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

const MAX_MARKDOWN_HEADING_LEVEL = 6
const USER_QUERY_HEADING_LEVEL = 1
const ASSISTANT_HEADING_OFFSET_WITH_USER_QUERIES = 1
const ASSISTANT_HEADING_OFFSET = 0
const MAX_USER_QUERY_PREVIEW_LENGTH = 120

function clampHeadingLevel(level: number | undefined): number {
  if (typeof level !== "number" || !Number.isFinite(level)) return MAX_MARKDOWN_HEADING_LEVEL
  return Math.min(MAX_MARKDOWN_HEADING_LEVEL, Math.max(0, Math.floor(level)))
}

function stripBlockquoteMarkers(value: string): string {
  return value.replace(/(^|\n)\s*>+\s?/g, "$1")
}

function stripInlineMarkdown(value: string): string {
  return stripBlockquoteMarkers(value)
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\\([\\`*_[\]{}()#+\-.!|>])/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeOutlineText(value: string, maxLength?: number): string {
  const normalized = stripInlineMarkdown(
    stripBlockquoteMarkers(value.replace(/\r\n?/g, "\n")).replace(/\n+/g, " "),
  )
  if (!maxLength || normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trim()}...`
}

function extractMarkdownHeadings(content: string): ExportOutlineItem[] {
  const items: ExportOutlineItem[] = []
  const lines = content.replace(/\r\n?/g, "\n").split("\n")
  let fenceMarker: string | null = null

  for (const line of lines) {
    const fenceMatch = /^\s{0,3}(```+|~~~+)/.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!fenceMarker) {
        fenceMarker = marker
      } else if (fenceMarker === marker) {
        fenceMarker = null
      }
      continue
    }

    if (fenceMarker) continue

    const headingMatch = /^\s{0,3}(#{1,6})(?:\s+|$)(.*?)\s*#*\s*$/.exec(line)
    if (!headingMatch) continue

    const level = headingMatch[1].length
    const text = normalizeOutlineText(headingMatch[2])
    if (!text) continue

    items.push({ level, text })
  }

  return items
}

function getMarkdownHeadingPrefix(level: number): string {
  return "#".repeat(Math.min(MAX_MARKDOWN_HEADING_LEVEL, Math.max(1, level)))
}

function formatAssistantHeadings(
  headings: ExportOutlineItem[],
  maxHeadingLevel: number,
  headingOffset: number,
): string[] {
  if (headings.length === 0 || maxHeadingLevel < 1) return []

  return headings.flatMap((item) => {
    if (item.level > maxHeadingLevel) return []

    const headingLevel = item.level + headingOffset
    return [`${getMarkdownHeadingPrefix(headingLevel)} ${item.text}`]
  })
}

export function createOutlineTextFromExportMessages(
  messages: ExportMessage[],
  options: ExportMessagesOutlineOptions,
): ExportMessagesOutlineResult {
  const maxHeadingLevel = clampHeadingLevel(options.maxHeadingLevel)
  const assistantHeadingOffset = options.includeUserQueries
    ? ASSISTANT_HEADING_OFFSET_WITH_USER_QUERIES
    : ASSISTANT_HEADING_OFFSET
  const lines: string[] = []

  for (const message of messages) {
    const role = message.role.toLowerCase()

    if (role === "user") {
      if (!options.includeUserQueries) continue

      const text = normalizeOutlineText(message.content, MAX_USER_QUERY_PREVIEW_LENGTH)
      if (text) {
        lines.push(`${getMarkdownHeadingPrefix(USER_QUERY_HEADING_LEVEL)} ${text}`)
      }
      continue
    }

    const headings = extractMarkdownHeadings(message.content)
    lines.push(...formatAssistantHeadings(headings, maxHeadingLevel, assistantHeadingOffset))
  }

  if (lines.length === 0) {
    return { text: "", count: 0 }
  }

  return {
    text: lines.join("\n\n"),
    count: lines.length,
  }
}
