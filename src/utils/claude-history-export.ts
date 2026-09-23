import { parseClaudeHistoryBranch, type ClaudeHistoryMessage } from "~utils/claude-history-outline"

/** chat_conversations 中一条消息提取出的导出素材（格式化由适配器负责） */
export interface ClaudeHistoryExportMessage {
  role: "user" | "assistant"
  /** 用户提问正文（text 内容块拼接） */
  requestText: string
  /** 回复 markdown（text 内容块拼接） */
  responseMarkdown: string
  /** 思考链正文（thinking 内容块的 thinking 字段拼接） */
  thinkingMarkdown: string
  /** 思考链标题（首个 summary，适配器作引用块标题） */
  thinkingTitle: string
}

export interface ClaudeHistoryExportData {
  sessionId: string
  messages: ClaudeHistoryExportMessage[]
}

const asObjectArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value.filter(Boolean) as T[]) : []

interface ClaudeContentBlock {
  type?: unknown
  text?: unknown
  thinking?: unknown
  summaries?: unknown
}

const joinBlockField = (
  blocks: ClaudeContentBlock[],
  type: string,
  field: "text" | "thinking",
): string =>
  blocks
    .filter((block) => block.type === type && typeof block[field] === "string")
    .map((block) => block[field] as string)
    .join("\n\n")

const hasNonEmptyArray = (value: unknown): boolean => Array.isArray(value) && value.length > 0

/**
 * 解析 chat_conversations 响应为导出消息序列（激活分支、完整历史）。
 * 与大纲解析的关键差异是完整性要求：导出静默缺内容比大纲漏标题更伤，
 * 凡无法证明完整/可忠实还原的情形一律返回 null，调用方回退滚动收集：
 * - current_leaf_message_uuid 未收录（疑似分页）；
 * - 分支链顶 parent 不是哨兵零 uuid（历史被截断）；
 * - 任一用户消息带 attachments/files（接口附件 schema 未验证）；
 * - 任一助手消息含 tool_use 块（create_file 即 Artifact 文档机制，
 *   DOM 导出对其有完整处理，接口形态待真实样本验证后再放开）。
 */
export function parseClaudeHistoryExport(payload: unknown): ClaudeHistoryExportData | null {
  const parsed = parseClaudeHistoryBranch(payload)
  if (!parsed) return null
  if (parsed.leafMissing || parsed.truncated) return null

  const exportMessages: ClaudeHistoryExportMessage[] = []
  for (const message of parsed.branch) {
    const blocks = asObjectArray<ClaudeContentBlock>(message.content)

    if (message.sender === "human") {
      if (hasNonEmptyArray(message.attachments) || hasNonEmptyArray(message.files)) {
        return null
      }
      exportMessages.push({
        role: "user",
        requestText: joinBlockField(blocks, "text", "text").trim(),
        responseMarkdown: "",
        thinkingMarkdown: "",
        thinkingTitle: "",
      })
      continue
    }

    if (message.sender === "assistant") {
      if (blocks.some((block) => block.type === "tool_use")) {
        return null
      }
      const firstSummary = asObjectArray<{ summary?: unknown }>(
        blocks.find((block) => block.type === "thinking")?.summaries,
      )[0]
      exportMessages.push({
        role: "assistant",
        requestText: "",
        responseMarkdown: joinBlockField(blocks, "text", "text").trim(),
        thinkingMarkdown: joinBlockField(blocks, "thinking", "thinking").trim(),
        thinkingTitle: typeof firstSummary?.summary === "string" ? firstSummary.summary.trim() : "",
      })
    }
  }

  if (exportMessages.length === 0) return null
  return { sessionId: parsed.sessionId, messages: exportMessages }
}
