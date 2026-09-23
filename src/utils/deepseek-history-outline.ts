import {
  markdownPlainLength,
  parseMarkdownHeadingSections,
  stripMarkdownInline,
} from "~utils/outline-heading-cache"

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
export interface DeepSeekHistoryOutlineData {
  sessionId: string
  version: number
  /** 激活分支上的 message_id 顺序 */
  branchMessageIds: number[]
  /** 分支上最大 message_id（和 DOM 挂载行比对判断数据是否过期） */
  maxMessageId: number
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
 * 沿 parent_id 从 current_message_id 回溯激活分支。
 * current_message_id 未收录（分页/删除）或历史为单链时，退化为接口返回顺序；
 * 字段缺失（疑似接口改版）且存在重新生成的旁支时返回 null——无法确定激活
 * 分支，退化为纯 DOM 扫描好过展示混入旁支的错误大纲。
 */
export const resolveActiveBranch = (
  messages: DeepSeekHistoryMessage[],
  currentMessageId: number | null,
): DeepSeekHistoryMessage[] | null => {
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

  if (currentMessageId === null) {
    const childCount = new Map<number, number>()
    for (const message of messages) {
      if (typeof message.parent_id !== "number") continue
      const count = (childCount.get(message.parent_id) ?? 0) + 1
      childCount.set(message.parent_id, count)
      if (count > 1) return null
    }
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
      // 无文本的提问仍计入 queryCount（保持 queryIndex 绝对序），但不进入大纲序列
      if (text) {
        userQueries.push({ messageId, queryIndex: queryCount, text })
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

/** 解析失败连续达到该次数后熔断，等会话切换再重试（大概率站点改版） */
export const API_OUTLINE_PARSE_FAILURE_LIMIT = 3

export interface ApiOutlineStaleCheckInput {
  data: DeepSeekHistoryOutlineData | null
  sessionId: string
  /** 当前挂载行的 message_id 集合 */
  mountedIds: ReadonlySet<number>
  /** 滚动容器是否处于底部（尾部删除信号的必要前提） */
  atBottom: boolean
}

/**
 * 接口缓存过期判定（满足任一即需重拉）：
 * 1. 无数据或会话不匹配；
 * 2. 挂载行出现比缓存更大的 message_id（新增消息已入库）；
 * 3. 挂载行 id 不在分支序列中（编辑/重生切换了分支）；
 * 4. 尾部删除复合判定：贴底且挂载行最大 id 小于缓存 maxMessageId。
 *    at-bottom 前提不可省：向上滚动时挂载窗口 max id 天然小于缓存值，
 *    裸比较会在滚动期间反复触发全量重拉。
 */
export function isApiOutlineStale({
  data,
  sessionId,
  mountedIds,
  atBottom,
}: ApiOutlineStaleCheckInput): boolean {
  if (!data || data.sessionId !== sessionId) return true
  if (mountedIds.size === 0) return false

  let maxMountedId = 0
  mountedIds.forEach((id) => {
    maxMountedId = Math.max(maxMountedId, id)
  })
  if (maxMountedId > data.maxMessageId) return true

  const branchIds = new Set(data.branchMessageIds)
  for (const id of mountedIds) {
    if (!branchIds.has(id)) return true
  }

  return atBottom && maxMountedId < data.maxMessageId
}

export interface ApiOutlineFetchGateInput {
  now: number
  /** 任何一次实际发起的拉取都记入该时间戳（含 version 未变的成功重拉），消掉连续重试路径 */
  lastFetchAt: number
  backoffMs: number
  parseFailures: number
  inFlight: boolean
  generating: boolean
  stale: boolean
}

/** 拉取闸门：单飞、生成中跳过、冷却窗口、解析失败熔断 */
export function shouldAttemptApiOutlineFetch({
  now,
  lastFetchAt,
  backoffMs,
  parseFailures,
  inFlight,
  generating,
  stale,
}: ApiOutlineFetchGateInput): boolean {
  if (inFlight || generating || !stale) return false
  if (parseFailures >= API_OUTLINE_PARSE_FAILURE_LIMIT) return false
  return now - lastFetchAt >= backoffMs
}

export interface BranchMergeEntry<T> {
  /** 条目所属消息的 message_id；null 表示未知（生成中的新消息） */
  messageId: number | null
  item: T
}

/**
 * 方案 C 统一归并：DOM 条目与接口回填条目统一打上 message_id -> 分支序号键，
 * 按分支序号归并。挂载项由调用方保证只出现在 domEntries（DOM 为准），
 * 接口只补未挂载的。未知 id（生成中的新提问/新回复不在 branchMessageIds 里）
 * 按 DOM 相对顺序挂在最近一个已知分支序号之后，重拉后自动归位。
 */
export function mergeByBranchMessageOrder<T>(
  branchMessageIds: readonly number[],
  domEntries: readonly BranchMergeEntry<T>[],
  fillEntries: readonly BranchMergeEntry<T>[],
): T[] {
  const branchIndex = new Map<number, number>()
  branchMessageIds.forEach((id, index) => {
    branchIndex.set(id, index)
  })

  const keyed: { key: number; seq: number; item: T }[] = []
  let lastKnownKey = -1
  let unknownOffset = 0
  let seq = 0

  for (const entry of domEntries) {
    const index = entry.messageId !== null ? branchIndex.get(entry.messageId) : undefined
    if (index !== undefined) {
      lastKnownKey = index
      unknownOffset = 0
      keyed.push({ key: index, seq, item: entry.item })
    } else {
      // 小步偏移让未知 id 按 DOM 相对顺序贴在最近已知序号之后；未知 id
      // 实际只有生成中的一两条，达不到越过下一个已知序号的数量级
      unknownOffset += 1
      keyed.push({ key: lastKnownKey + unknownOffset * 0.01, seq, item: entry.item })
    }
    seq += 1
  }

  for (const entry of fillEntries) {
    const index = entry.messageId !== null ? branchIndex.get(entry.messageId) : undefined
    if (index === undefined) continue
    keyed.push({ key: index, seq, item: entry.item })
    seq += 1
  }

  return keyed.sort((a, b) => a.key - b.key || a.seq - b.seq).map((entry) => entry.item)
}
