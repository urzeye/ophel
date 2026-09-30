import {
  markdownPlainLength,
  parseMarkdownHeadingSections,
  stripMarkdownInline,
} from "~utils/outline-heading-cache"
import { resolveActiveBranch, type ApiOutlineSourceData } from "~utils/outline-api-source"

/** 接口解析出的大纲标题：text 已清洗为纯文本，wordCount 为章节正文估算值 */
export interface DeepSeekHistoryOutlineHeading {
  level: number
  text: string
  wordCount: number
}

/**
 * DeepSeek history_messages 接口解析出的大纲数据（仅当前激活分支）。
 * 重新生成会产生 parent_id 旁支，接口返回的 chat_messages 包含所有分支，
 * 需要从 current_message_id 沿 parent_id 回溯出激活分支。
 */
export interface DeepSeekHistoryOutlineData extends ApiOutlineSourceData {
  version: number
  /** assistant message_id -> 标题列表（text 已清洗，wordCount 为估算值） */
  headingsByAssistantId: Map<number, DeepSeekHistoryOutlineHeading[]>
  /** assistant message_id -> 回复正文纯文本长度（未挂载提问条目的字数统计用） */
  replyWordCountByAssistantId: Map<number, number>
  /** assistant message_id -> 所属用户提问的 1-based 序号 */
  queryIndexByAssistantId: Map<number, number>
  /** 用户提问 1-based 序号 -> 对应 assistant message_id */
  assistantIdByQueryIndex: Map<number, number>
  /** 激活分支上的用户提问总数 */
  queryCount: number
  /** 激活分支上的用户提问（按顺序；显示文本与离屏定位匹配文本双用） */
  userQueries: { messageId: number; queryIndex: number; text: string }[]
}

interface DeepSeekHistoryFragment {
  type?: unknown
  content?: unknown
  files?: unknown
}

export interface DeepSeekHistoryMessage {
  message_id?: unknown
  parent_id?: unknown
  role?: unknown
  content?: unknown
  fragments?: unknown
  thinking_content?: unknown
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null

const asObjectArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value.filter(Boolean) as T[]) : []

/**
 * 取首个附件的文件名。纯附件提问（如只发图片）没有 REQUEST 文本，
 * 原生 TOC 此时的标题逻辑是 getUserQuery || 首个附件 fileName，
 * 这里保持一致，保证大纲条目文案与借原生 TOC 跳转时的文本校验对齐。
 */
const firstAttachmentFileName = (fragments: DeepSeekHistoryFragment[]): string => {
  for (const fragment of fragments) {
    if (fragment.type !== "FILE") continue
    for (const file of asObjectArray<Record<string, unknown>>(fragment.files)) {
      if (typeof file.file_name === "string" && file.file_name.trim()) {
        return file.file_name.trim()
      }
    }
  }
  return ""
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
  if (!branch) return null

  const branchMessageIds: number[] = []
  const headingsByAssistantId = new Map<number, DeepSeekHistoryOutlineHeading[]>()
  const replyWordCountByAssistantId = new Map<number, number>()
  const queryIndexByAssistantId = new Map<number, number>()
  const assistantIdByQueryIndex = new Map<number, number>()
  const userQueries: { messageId: number; queryIndex: number; text: string }[] = []
  let maxMessageId = 0
  let queryCount = 0

  for (const message of branch) {
    if (typeof message.message_id !== "number") continue
    const messageId = message.message_id
    branchMessageIds.push(messageId)
    maxMessageId = Math.max(maxMessageId, messageId)

    const fragments = asObjectArray<DeepSeekHistoryFragment>(message.fragments)

    if (message.role === "USER") {
      queryCount += 1
      const requestText = fragments
        .filter((fragment) => fragment.type === "REQUEST" && typeof fragment.content === "string")
        .map((fragment) => fragment.content as string)
        .join("\n\n")
      // 实测样本中 USER 顶层 content 为 null，字符串 content 仅作兜底
      const rawText = requestText.trim()
        ? requestText
        : typeof message.content === "string"
          ? message.content
          : ""
      const text = stripMarkdownInline(rawText)
      // 无文本的纯附件提问回退用首个附件文件名；文件名不过 stripMarkdownInline，
      // 与原生 TOC 展示口径一致（借 TOC 跳转时按文本校验）
      const displayText = text || firstAttachmentFileName(fragments)
      // 完全无展示文本的提问仍计入 queryCount（保持 queryIndex 绝对序），但不进入大纲序列
      if (displayText) {
        userQueries.push({ messageId, queryIndex: queryCount, text: displayText })
      }
      continue
    }
    if (message.role !== "ASSISTANT") continue

    queryIndexByAssistantId.set(messageId, queryCount)
    assistantIdByQueryIndex.set(queryCount, messageId)

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

    replyWordCountByAssistantId.set(messageId, markdownPlainLength(markdown))

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
      headingsByAssistantId.set(messageId, headings)
    }
  }

  return {
    sessionId,
    version,
    branchMessageIds,
    maxMessageId,
    headingsByAssistantId,
    replyWordCountByAssistantId,
    queryIndexByAssistantId,
    assistantIdByQueryIndex,
    queryCount,
    userQueries,
  }
}
