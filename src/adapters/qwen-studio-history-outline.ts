import {
  markdownPlainLength,
  parseMarkdownHeadingSections,
  stripMarkdownInline,
} from "~utils/outline-heading-cache"
import type { ApiOutlineSourceData } from "~utils/outline-api-source"

export interface QwenHistoryOutlineHeading {
  level: number
  text: string
  wordCount: number
}

/**
 * Qwen Studio 单对话接口解析出的大纲数据（仅当前激活分支）。
 * 对话详情从 currentId 沿 parentId 回溯；重新生成产生的旁支不会进入大纲。
 *
 * 响应结构（2026-10-30 实测）：data.chat.history = { messages, currentId, pagination }，
 * 消息为 camelCase 的 id / parentId / childrenIds，content_list 的阶段名见
 * thinking_summary、answer 等；pagination 为 snake_case（has_more_older / oldest_id）。
 */
export interface QwenHistoryOutlineData extends ApiOutlineSourceData {
  signature: string
  headingsByAssistantId: Map<string, QwenHistoryOutlineHeading[]>
  replyWordCountByAssistantId: Map<string, number>
  queryIndexByAssistantId: Map<string, number>
  assistantIdByQueryIndex: Map<number, string>
  /** assistant 回复 -> 对应提问消息 ID（DOM 提问无 ID 时用于精确归并） */
  queryMessageIdByAssistantId: Map<string, string>
  queryCount: number
  userQueries: { messageId: string; queryIndex: number; text: string }[]
}

interface QwenHistoryOutlinePhase {
  phase?: unknown
  content?: unknown
}

interface QwenHistoryOutlineFile {
  name?: unknown
}

interface QwenHistoryOutlineMessage {
  id?: unknown
  role?: unknown
  content?: unknown
  parentId?: unknown
  files?: unknown
  content_list?: unknown
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null

const asObjectArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value.filter(Boolean) as T[]) : []

const getMessageContent = (message: QwenHistoryOutlineMessage): string =>
  typeof message.content === "string" ? message.content.trim() : ""

const getFirstAttachmentName = (message: QwenHistoryOutlineMessage): string => {
  for (const file of asObjectArray<QwenHistoryOutlineFile>(message.files)) {
    if (typeof file.name === "string" && file.name.trim()) return file.name.trim()
  }
  return ""
}

/**
 * 沿 parentId 从 currentId 回溯激活分支（根 → 叶）。
 *
 * 只有回溯到 `parentId === null` 的根消息才算历史完整：缺 currentId、父消息不在表里
 * （分页没拉全/被删）、成环，或 parentId 字段缺失（接口改版）都返回 null，
 * 由调用方显式失败或回退——不猜分支，也不返回残缺链。大纲与导出共用这一条规则。
 */
export function resolveQwenActiveBranch<T extends { parentId?: unknown }>(
  messages: ReadonlyMap<string, T>,
  currentId: string | null,
): { id: string; message: T }[] | null {
  if (!currentId) return null

  const chain: { id: string; message: T }[] = []
  const seen = new Set<string>()
  let cursor = currentId
  while (true) {
    const message = messages.get(cursor)
    if (!message || seen.has(cursor)) return null
    seen.add(cursor)
    chain.push({ id: cursor, message })

    const parentId = message.parentId
    if (parentId === null) return chain.reverse()
    if (typeof parentId !== "string" || !parentId) return null
    cursor = parentId
  }
}

/**
 * 只拼接正式回答内容：思考摘要、生图与代码解释器日志都不参与标题解析。
 * message.content 是部分版本的正文兜底，已在 content_list 出现时不再重复追加。
 */
const getAssistantMarkdown = (message: QwenHistoryOutlineMessage): string => {
  const blocks: string[] = []
  for (const phase of asObjectArray<QwenHistoryOutlinePhase>(message.content_list)) {
    const phaseName = typeof phase.phase === "string" ? phase.phase : ""
    if (
      phaseName === "thinking_summary" ||
      phaseName === "image_gen" ||
      phaseName === "image_gen_tool" ||
      phaseName === "code_interpreter"
    ) {
      continue
    }
    const content = typeof phase.content === "string" ? phase.content.trim() : ""
    if (content) blocks.push(content)
  }

  const plainContent = getMessageContent(message)
  if (plainContent && !blocks.includes(plainContent)) {
    blocks.push(plainContent)
  }
  return blocks.join("\n\n")
}

const resolveHistory = (
  payload: unknown,
): {
  sessionId: string
  messages: Map<string, QwenHistoryOutlineMessage>
  currentId: string | null
} | null => {
  const root = asRecord(payload)
  if (!root) return null

  const data = asRecord(root.data)
  const chat = asRecord(data?.chat) ?? data
  const history = asRecord(chat?.history) ?? chat ?? (asRecord(root.messages) ? root : null)
  const rawMessages = asRecord(history?.messages)
  if (!rawMessages) return null

  const messages = new Map<string, QwenHistoryOutlineMessage>()
  Object.entries(rawMessages).forEach(([key, value]) => {
    const message = asRecord(value) as QwenHistoryOutlineMessage | null
    if (!message) return
    const id = typeof message.id === "string" && message.id.trim() ? message.id.trim() : key.trim()
    if (!id) return
    messages.set(id, { ...message, id })
  })
  if (messages.size === 0) return null

  const sessionId =
    (typeof chat?.id === "string" && chat.id.trim()) ||
    (typeof data?.id === "string" && data.id.trim()) ||
    (typeof root.id === "string" && root.id.trim()) ||
    ""
  const currentId =
    typeof history?.currentId === "string" && history.currentId.trim()
      ? history.currentId.trim()
      : null

  return { sessionId, messages, currentId }
}

/**
 * 解析 Qwen 单对话接口响应；也接受调用方合并多页后的
 * `{ messages, currentId }` 形态。结构不符合预期时返回 null。
 */
export function parseQwenHistoryOutline(
  payload: unknown,
  fallbackSessionId = "",
  maxLevel = 6,
): QwenHistoryOutlineData | null {
  const resolved = resolveHistory(payload)
  if (!resolved) return null

  const sessionId = resolved.sessionId || fallbackSessionId.trim()
  if (!sessionId) return null

  const { currentId } = resolved
  const branch = resolveQwenActiveBranch(resolved.messages, currentId)
  if (!currentId || !branch || branch.length === 0) return null

  const branchMessageIds: string[] = []
  const headingsByAssistantId = new Map<string, QwenHistoryOutlineHeading[]>()
  const replyWordCountByAssistantId = new Map<string, number>()
  const queryIndexByAssistantId = new Map<string, number>()
  const assistantIdByQueryIndex = new Map<number, string>()
  const queryMessageIdByAssistantId = new Map<string, string>()
  const userQueries: { messageId: string; queryIndex: number; text: string }[] = []
  let queryCount = 0
  let pendingQueryMessageId: string | null = null
  let latestAssistantId = ""
  let headingCount = 0
  let replyLength = 0

  for (const { id: messageId, message } of branch) {
    branchMessageIds.push(messageId)

    if (message.role === "user") {
      queryCount += 1
      pendingQueryMessageId = messageId
      const text =
        stripMarkdownInline(getMessageContent(message)) || getFirstAttachmentName(message)
      if (text) {
        userQueries.push({ messageId, queryIndex: queryCount, text })
      }
      continue
    }
    if (message.role !== "assistant") continue

    latestAssistantId = messageId
    if (queryCount > 0) {
      queryIndexByAssistantId.set(messageId, queryCount)
      assistantIdByQueryIndex.set(queryCount, messageId)
      if (pendingQueryMessageId) {
        queryMessageIdByAssistantId.set(messageId, pendingQueryMessageId)
      }
    }

    const markdown = getAssistantMarkdown(message)
    if (!markdown.trim()) continue

    const wordCount = markdownPlainLength(markdown)
    replyWordCountByAssistantId.set(messageId, wordCount)
    replyLength += wordCount

    const headings = parseMarkdownHeadingSections(markdown)
      .filter((section) => section.level <= maxLevel)
      .map((section) => ({
        level: section.level,
        text: stripMarkdownInline(section.text),
        wordCount: markdownPlainLength(section.body),
      }))
      .filter((heading) => heading.text.length > 0)
    if (headings.length > 0) {
      headingsByAssistantId.set(messageId, headings)
      headingCount += headings.length
    }
  }

  const maxMessageId = latestAssistantId || branchMessageIds[branchMessageIds.length - 1]
  if (!maxMessageId) return null

  return {
    sessionId,
    signature: [
      sessionId,
      currentId,
      branchMessageIds.length,
      maxMessageId,
      queryCount,
      headingCount,
      replyLength,
    ].join(":"),
    branchMessageIds,
    maxMessageId,
    headingsByAssistantId,
    replyWordCountByAssistantId,
    queryIndexByAssistantId,
    assistantIdByQueryIndex,
    queryMessageIdByAssistantId,
    queryCount,
    userQueries,
  }
}
