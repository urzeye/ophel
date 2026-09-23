import {
  markdownPlainLength,
  parseMarkdownHeadingSections,
  stripMarkdownInline,
} from "~utils/outline-heading-cache"
import { resolveActiveBranch, type ApiOutlineSourceData } from "~utils/outline-api-source"

/** 接口解析出的大纲标题：text 已清洗为纯文本，wordCount 为章节正文估算值 */
export interface ClaudeHistoryOutlineHeading {
  level: number
  text: string
  wordCount: number
}

/**
 * Claude chat_conversations 接口解析出的大纲数据（仅当前激活分支）。
 * 与 DeepSeek 的关键差异：消息 id 是 uuid 字符串，DOM 虚拟行只有位置序号
 * （data-rs-index），因此全链路统一用「分支位置序号」作为 messageIndex，
 * branchMessageIds/maxMessageId 均为位置值（截断时含尾部对齐偏移）。
 */
export interface ClaudeHistoryOutlineData extends ApiOutlineSourceData {
  /** 变更检测签名（接口无 version）：分支长度 + 叶消息 uuid + 会话 updated_at */
  signature: string
  /** 分支位置 -> 标题列表（text 已清洗，wordCount 为估算值） */
  headingsByMessageIndex: Map<number, ClaudeHistoryOutlineHeading[]>
  /** 分支位置 -> 回复正文纯文本长度（未挂载提问条目的字数统计用） */
  replyWordCountByMessageIndex: Map<number, number>
  /** 激活分支上的用户提问（按顺序；文本已清洗，供大纲条目与内容指纹双用） */
  userQueries: { messageIndex: number; queryIndex: number; text: string }[]
  /** 激活分支上的用户提问总数（含无文本提问，保持 queryIndex 绝对序） */
  queryCount: number
  /** 接口历史是否被截断（链顶 parent 不是哨兵零 uuid）；截断时位置已按 totalMessages 尾部对齐 */
  truncated: boolean
}

/** Claude 根消息的 parent_message_uuid 哨兵值 */
const CLAUDE_ROOT_PARENT_UUID = "00000000-0000-4000-8000-000000000000"

interface ClaudeHistoryContentBlock {
  type?: unknown
  text?: unknown
}

export interface ClaudeHistoryMessage {
  uuid?: unknown
  parent_message_uuid?: unknown
  sender?: unknown
  index?: unknown
  content?: unknown
  attachments?: unknown
  files?: unknown
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null

const asObjectArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value.filter(Boolean) as T[]) : []

/** 拼接消息的 text 内容块（thinking/tool_use 等块不参与） */
const joinTextBlocks = (message: ClaudeHistoryMessage): string =>
  asObjectArray<ClaudeHistoryContentBlock>(message.content)
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n\n")

/**
 * chat_conversations 响应的激活分支解析结果（大纲与导出共用）。
 */
export interface ClaudeHistoryBranch {
  sessionId: string
  /** current_leaf_message_uuid（可能缺失） */
  leafUuid: string | null
  /** 会话级 updated_at（变更检测签名用） */
  updatedAt: string
  /** 激活分支消息（根 → 叶顺序） */
  branch: ClaudeHistoryMessage[]
  /** 接口历史被截断（链顶 parent 不是哨兵零 uuid） */
  truncated: boolean
  /** leaf uuid 存在但未收录于 chat_messages（疑似分页） */
  leafMissing: boolean
}

/**
 * 解析 chat_conversations 响应并回溯激活分支（大纲与导出共用）。
 * resolveActiveBranch 要求数值 id：按数组下标预映射 uuid -> int，
 * 位置序号与 DOM data-rs-index 的对齐由调用方处理。
 * 结构不符合预期时返回 null（调用方退化为 DOM 路径）。
 */
export function parseClaudeHistoryBranch(payload: unknown): ClaudeHistoryBranch | null {
  const root = asRecord(payload)
  if (!root) return null

  const sessionId = typeof root.uuid === "string" ? root.uuid : ""
  if (!sessionId) return null

  const messages = asObjectArray<ClaudeHistoryMessage>(root.chat_messages)
  if (messages.length === 0) return null

  const positionByUuid = new Map<string, number>()
  messages.forEach((message, index) => {
    if (typeof message.uuid === "string") {
      positionByUuid.set(message.uuid, index)
    }
  })

  const mapped = messages.map((message, index) => {
    const parentUuid = message.parent_message_uuid
    const parentId =
      typeof parentUuid === "string" && parentUuid !== CLAUDE_ROOT_PARENT_UUID
        ? positionByUuid.get(parentUuid)
        : undefined
    return { message_id: index, parent_id: parentId }
  })

  const leafUuid =
    typeof root.current_leaf_message_uuid === "string" && root.current_leaf_message_uuid
      ? root.current_leaf_message_uuid
      : null
  const currentMessageId = leafUuid !== null ? positionByUuid.get(leafUuid) ?? null : null

  const branch = resolveActiveBranch(mapped, currentMessageId)
  if (!branch || branch.length === 0) return null

  // 链顶 parent 既不是哨兵也不在返回集里（映射后为 undefined 但原值是非哨兵 uuid）→ 历史截断
  const head = messages[branch[0].message_id]
  const headParent = head?.parent_message_uuid
  const truncated = typeof headParent === "string" && headParent !== CLAUDE_ROOT_PARENT_UUID

  return {
    sessionId,
    leafUuid,
    updatedAt: typeof root.updated_at === "string" ? root.updated_at : "",
    branch: branch.map((mappedMessage) => messages[mappedMessage.message_id]),
    truncated,
    leafMissing: leafUuid !== null && currentMessageId === null,
  }
}

/**
 * 解析 chat_conversations 响应为大纲数据；结构不符合预期时返回 null（调用方退化为 DOM 路径）。
 * totalMessages 为 DOM aria-setsize 的总消息数，仅在接口历史截断时用于尾部对齐；
 * 截断且 totalMessages 缺失或小于分支长度时判解析失败（位置无法对齐，宁缺毋错）。
 */
export function parseClaudeHistoryOutline(
  payload: unknown,
  maxLevel = 6,
  totalMessages?: number,
): ClaudeHistoryOutlineData | null {
  const parsed = parseClaudeHistoryBranch(payload)
  if (!parsed) return null
  const { sessionId, leafUuid, updatedAt, branch, truncated } = parsed

  let offset = 0
  if (truncated) {
    if (
      totalMessages === undefined ||
      !Number.isSafeInteger(totalMessages) ||
      totalMessages < branch.length
    ) {
      return null
    }
    offset = totalMessages - branch.length
  }

  const branchMessageIds: number[] = []
  const headingsByMessageIndex = new Map<number, ClaudeHistoryOutlineHeading[]>()
  const replyWordCountByMessageIndex = new Map<number, number>()
  const userQueries: { messageIndex: number; queryIndex: number; text: string }[] = []
  let queryCount = 0

  branch.forEach((message, branchPosition) => {
    const messageIndex = offset + branchPosition
    branchMessageIds.push(messageIndex)

    if (message.sender === "human") {
      queryCount += 1
      const text = stripMarkdownInline(joinTextBlocks(message))
      // 无文本的提问仍计入 queryCount（保持 queryIndex 绝对序），但不进入大纲序列
      if (text) {
        userQueries.push({ messageIndex, queryIndex: queryCount, text })
      }
      return
    }
    if (message.sender !== "assistant") return

    const markdown = joinTextBlocks(message)
    if (!markdown.trim()) return

    replyWordCountByMessageIndex.set(messageIndex, markdownPlainLength(markdown))

    // 章节边界用完整层级计算，存储时才按 maxLevel 过滤
    const headings = parseMarkdownHeadingSections(markdown)
      .filter((section) => section.level <= maxLevel)
      .map((section) => ({
        level: section.level,
        text: stripMarkdownInline(section.text),
        wordCount: markdownPlainLength(section.body),
      }))
      .filter((heading) => heading.text.length > 0)
    if (headings.length > 0) {
      headingsByMessageIndex.set(messageIndex, headings)
    }
  })

  return {
    sessionId,
    signature: `${branch.length}:${leafUuid ?? ""}:${updatedAt}`,
    branchMessageIds,
    maxMessageId: branchMessageIds[branchMessageIds.length - 1],
    headingsByMessageIndex,
    replyWordCountByMessageIndex,
    userQueries,
    queryCount,
    truncated,
  }
}
