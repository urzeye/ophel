import { parseMarkdownHeadings, type ParsedMarkdownHeading } from "~utils/outline-heading-cache"

/**
 * DeepSeek history_messages 接口解析出的大纲数据（仅当前激活分支）。
 * 重新生成会产生 parent_id 旁支，接口返回的 chat_messages 包含所有分支，
 * 需要从 current_message_id 沿 parent_id 回溯出激活分支。
 */
export interface DeepSeekHistoryOutlineData {
  sessionId: string
  version: number
  /** 激活分支上的 message_id 顺序 */
  branchMessageIds: number[]
  /** 分支上最大 message_id（和 DOM 挂载行比对判断数据是否过期） */
  maxMessageId: number
  /** assistant message_id -> 该回复 markdown 中的标题（按出现顺序） */
  headingsByAssistantId: Map<number, ParsedMarkdownHeading[]>
  /** assistant message_id -> 所属用户提问的 1-based 序号 */
  queryIndexByAssistantId: Map<number, number>
  /** 用户提问 1-based 序号 -> 对应 assistant message_id */
  assistantIdByQueryIndex: Map<number, number>
  /** 激活分支上的用户提问总数 */
  queryCount: number
}

interface DeepSeekHistoryFragment {
  type?: unknown
  content?: unknown
}

interface DeepSeekHistoryMessage {
  message_id?: unknown
  parent_id?: unknown
  role?: unknown
  content?: unknown
  fragments?: unknown
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null

const asObjectArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value.filter(Boolean) as T[]) : []

/** 沿 parent_id 从 current_message_id 回溯激活分支；结构异常时退化为接口返回顺序。 */
const resolveActiveBranch = (
  messages: DeepSeekHistoryMessage[],
  currentMessageId: number | null,
): DeepSeekHistoryMessage[] => {
  const byId = new Map<number, DeepSeekHistoryMessage>()
  for (const message of messages) {
    if (typeof message.message_id === "number") {
      byId.set(message.message_id, message)
    }
  }

  if (currentMessageId !== null && byId.has(currentMessageId)) {
    const chain: DeepSeekHistoryMessage[] = []
    const seen = new Set<number>()
    let current: DeepSeekHistoryMessage | undefined = byId.get(currentMessageId)
    while (current && typeof current.message_id === "number" && !seen.has(current.message_id)) {
      seen.add(current.message_id)
      chain.unshift(current)
      current = typeof current.parent_id === "number" ? byId.get(current.parent_id) : undefined
    }
    if (chain.length > 0) return chain
  }

  return messages
}

/** 解析 history_messages 响应；结构不符合预期时返回 null（调用方退化为纯 DOM 扫描）。 */
export function parseDeepSeekHistoryOutline(
  payload: unknown,
  maxLevel = 6,
): DeepSeekHistoryOutlineData | null {
  const bizData = asRecord(asRecord(asRecord(payload)?.data)?.biz_data)
  if (!bizData) return null

  const session = asRecord(bizData.chat_session)
  const sessionId = typeof session?.id === "string" ? session.id : ""
  const version = typeof session?.version === "number" ? session.version : 0
  if (!sessionId) return null

  const messages = asObjectArray<DeepSeekHistoryMessage>(bizData.chat_messages)
  if (messages.length === 0) return null

  const currentMessageId =
    typeof session?.current_message_id === "number" ? session.current_message_id : null
  const branch = resolveActiveBranch(messages, currentMessageId)

  const branchMessageIds: number[] = []
  const headingsByAssistantId = new Map<number, ParsedMarkdownHeading[]>()
  const queryIndexByAssistantId = new Map<number, number>()
  const assistantIdByQueryIndex = new Map<number, number>()
  let maxMessageId = 0
  let queryCount = 0

  for (const message of branch) {
    if (typeof message.message_id !== "number") continue
    const messageId = message.message_id
    branchMessageIds.push(messageId)
    maxMessageId = Math.max(maxMessageId, messageId)

    if (message.role === "USER") {
      queryCount += 1
      continue
    }
    if (message.role !== "ASSISTANT") continue

    queryIndexByAssistantId.set(messageId, queryCount)
    assistantIdByQueryIndex.set(queryCount, messageId)

    const fragments = asObjectArray<DeepSeekHistoryFragment>(message.fragments)
    const fragmentMarkdown = fragments
      .filter((fragment) => fragment.type === "RESPONSE" && typeof fragment.content === "string")
      .map((fragment) => fragment.content as string)
      .join("\n\n")
    // 当前版本的接口直接在 message.content 返回回复 markdown
    // （思考链在独立的 thinking_content 字段，不参与标题解析）；
    // 早期版本走 fragments，仅取 RESPONSE 片段。
    const markdown = fragmentMarkdown.trim()
      ? fragmentMarkdown
      : typeof message.content === "string"
        ? message.content
        : ""
    if (!markdown.trim()) continue

    const headings = parseMarkdownHeadings(markdown, maxLevel)
    if (headings.length > 0) {
      headingsByAssistantId.set(messageId, headings)
    }
  }

  return {
    sessionId,
    version,
    branchMessageIds,
    maxMessageId,
    headingsByAssistantId,
    queryIndexByAssistantId,
    assistantIdByQueryIndex,
    queryCount,
  }
}
