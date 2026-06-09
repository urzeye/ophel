import type { ExportMessage } from "~utils/exporter"

export interface ExportMessagesOutlineOptions {
  includeUserQueries: boolean
  maxLevel?: number
}

export interface ExportMessagesOutlineResult {
  text: string
  count: number
}

interface ExportOutlineItem {
  level: number
  text: string
  isUserQuery?: boolean
}

const MAX_USER_QUERY_PREVIEW_LENGTH = 200

function clampHeadingLevel(level: number | undefined): number {
  if (typeof level !== "number" || !Number.isFinite(level)) return 6
  return Math.min(6, Math.max(0, Math.floor(level)))
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\\([\\`*_[\]{}()#+\-.!|>])/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeOutlineText(value: string, maxLength?: number): string {
  const normalized = stripInlineMarkdown(value.replace(/\r\n?/g, "\n").replace(/\n+/g, " "))
  if (!maxLength || normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trim()}...`
}

function extractMarkdownHeadings(content: string, maxLevel: number): ExportOutlineItem[] {
  if (maxLevel < 1) return []

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
    if (level > maxLevel) continue

    const text = normalizeOutlineText(headingMatch[2])
    if (!text) continue

    items.push({ level, text })
  }

  return items
}

export function createOutlineTextFromExportMessages(
  messages: ExportMessage[],
  options: ExportMessagesOutlineOptions,
): ExportMessagesOutlineResult {
  const maxLevel = clampHeadingLevel(options.maxLevel)
  const items: ExportOutlineItem[] = []

  for (const message of messages) {
    const role = message.role.toLowerCase()

    if (role === "user") {
      if (!options.includeUserQueries) continue

      const text = normalizeOutlineText(message.content, MAX_USER_QUERY_PREVIEW_LENGTH)
      if (text) {
        items.push({ level: 0, text, isUserQuery: true })
      }
      continue
    }

    items.push(...extractMarkdownHeadings(message.content, maxLevel))
  }

  if (items.length === 0) {
    return { text: "", count: 0 }
  }

  const headingLevels = items.filter((item) => !item.isUserQuery).map((item) => item.level)
  const minHeadingLevel = headingLevels.length > 0 ? Math.min(...headingLevels) : 1

  const lines = items.map((item) => {
    const depth = item.isUserQuery
      ? 0
      : options.includeUserQueries
        ? Math.max(1, item.level - minHeadingLevel + 1)
        : Math.max(0, item.level - minHeadingLevel)

    return `${"  ".repeat(depth)}- ${item.text}`
  })

  return {
    text: lines.join("\n"),
    count: lines.length,
  }
}
