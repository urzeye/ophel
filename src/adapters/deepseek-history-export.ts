import { resolveActiveBranch } from "~utils/outline-api-source"
import type { DeepSeekHistoryMessage } from "./deepseek-history-outline"

/** history_messages 中一条消息提取出的导出素材（格式化由适配器负责） */
export interface DeepSeekHistoryExportMessage {
  role: "user" | "assistant"
  /** 用户提问正文（REQUEST 片段拼接，content 兜底） */
  requestText: string
  /** 用户附件 FILE 片段原样透出（与 share 接口同构，适配器复用同一提取器） */
  fileFragments: Record<string, unknown>[]
  /** 回复 markdown（content 优先，RESPONSE 片段兜底） */
  responseMarkdown: string
  /** 思考链 markdown（thinking_content 优先，THINK 片段兜底） */
  thinkingMarkdown: string
}

export interface DeepSeekHistoryExportData {
  sessionId: string
  messages: DeepSeekHistoryExportMessage[]
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null

const asObjectArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value.filter(Boolean) as T[]) : []

const joinFragmentText = (fragments: Record<string, unknown>[], type: string): string =>
  fragments
    .filter((fragment) => fragment.type === type && typeof fragment.content === "string")
    .map((fragment) => fragment.content as string)
    .join("\n\n")

/**
 * 解析 history_messages 响应为导出消息序列（激活分支、完整历史）。
 * 与大纲解析的关键差异是完整性要求：导出静默缺开头/缺尾比大纲漏标题更伤，
 * 凡无法证明历史完整的情形一律返回 null，调用方回退滚动收集：
 * - current_message_id 未收录（疑似分页）；
 * - 分支链顶仍有未收录的 parent（历史被截断；实测根消息 parent_id 为 null）；
 * - current_message_id 字段缺失且存在旁支（无法确定激活分支）。
 */
export function parseDeepSeekHistoryExport(payload: unknown): DeepSeekHistoryExportData | null {
  const bizData = asRecord(asRecord(asRecord(payload)?.data)?.biz_data)
  if (!bizData) return null

  const session = asRecord(bizData.chat_session)
  const sessionId = typeof session?.id === "string" ? session.id : ""
  if (!sessionId) return null

  const messages = asObjectArray<DeepSeekHistoryMessage>(bizData.chat_messages)
  if (messages.length === 0) return null

  const currentMessageId =
    typeof session?.current_message_id === "number" ? session.current_message_id : null

  if (currentMessageId !== null) {
    const found = messages.some((message) => message.message_id === currentMessageId)
    if (!found) return null
  }

  const branch = resolveActiveBranch(messages, currentMessageId)
  if (!branch || branch.length === 0) return null

  const head = branch[0]
  if (head && typeof head.parent_id === "number") return null

  const exportMessages: DeepSeekHistoryExportMessage[] = []
  for (const message of branch) {
    const fragments = asObjectArray<Record<string, unknown>>(message.fragments)

    if (message.role === "USER") {
      const requestText = joinFragmentText(fragments, "REQUEST").trim()
      const fallback = typeof message.content === "string" ? message.content.trim() : ""
      exportMessages.push({
        role: "user",
        requestText: requestText || fallback,
        fileFragments: fragments.filter((fragment) => fragment.type === "FILE"),
        responseMarkdown: "",
        thinkingMarkdown: "",
      })
      continue
    }

    if (message.role === "ASSISTANT") {
      const responseMarkdown =
        typeof message.content === "string" && message.content.trim()
          ? message.content
          : joinFragmentText(fragments, "RESPONSE")
      const thinkingMarkdown =
        typeof message.thinking_content === "string" && message.thinking_content.trim()
          ? message.thinking_content
          : joinFragmentText(fragments, "THINK")
      exportMessages.push({
        role: "assistant",
        requestText: "",
        fileFragments: [],
        responseMarkdown,
        thinkingMarkdown,
      })
    }
  }

  if (exportMessages.length === 0) return null
  return { sessionId, messages: exportMessages }
}
