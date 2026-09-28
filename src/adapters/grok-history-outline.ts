import {
  markdownPlainLength,
  parseMarkdownHeadingSections,
  stripMarkdownInline,
} from "~utils/outline-heading-cache"
import { resolveActiveBranch, type ApiOutlineSourceData } from "~utils/outline-api-source"

/** 接口解析出的大纲标题：text 已清洗为纯文本，wordCount 为章节正文估算值 */
export interface GrokHistoryOutlineHeading {
  level: number
  text: string
  wordCount: number
}

/**
 * Grok response-node 接口返回的激活分支树。
 * response-node 只含骨架（responseId / sender / parentResponseId），
 * 消息正文要再按 responseId 批量调 load-responses 获取。
 */
export interface GrokResponseTree {
  sessionId: string
  /** 激活分支上的 responseId（根 → 叶顺序）；数组下标即分支位置序号 */
  branchResponseIds: string[]
  /** 分支上各 responseId 的 sender（骨架自带，已归一小写；load-responses 缺失条目时兜底用） */
  branchSenderByResponseId: Map<string, string>
  /** 变更检测签名（接口无 version）：节点总数 + 叶 responseId */
  signature: string
  /** 激活分支叶节点 responseId */
  leafResponseId: string
}

/**
 * Grok response-node + load-responses 解析出的大纲数据（仅当前激活分支）。
 * 与 DeepSeek 的关键差异：消息 id 是 uuid 字符串，全链路统一用「分支位置
 * 序号」作为 messageIndex（同 Claude），DOM 虚拟行带 responseId
 * （data-plane-row / id="response-<uuid>"），双向映射见 positionByResponseId。
 */
export interface GrokHistoryOutlineData extends ApiOutlineSourceData {
  /** 变更检测签名：节点总数 + 叶 responseId */
  signature: string
  /** responseId -> 分支位置（DOM 挂载行映射用） */
  positionByResponseId: Map<string, number>
  /** 分支位置 -> responseId（probe 挂载按 uuid 找行用） */
  branchResponseIds: string[]
  /** 分支位置 -> 标题列表（text 已清洗，wordCount 为估算值） */
  headingsByMessageIndex: Map<number, GrokHistoryOutlineHeading[]>
  /** 分支位置 -> 回复正文纯文本长度（未挂载提问条目的字数统计用） */
  replyWordCountByMessageIndex: Map<number, number>
  /** 用户提问 1-based 序号 -> 对应 assistant 回复的分支位置 */
  assistantIndexByQueryIndex: Map<number, number>
  /** 激活分支上的用户提问（按顺序；显示文本与离屏定位匹配文本双用） */
  userQueries: { messageIndex: number; queryIndex: number; text: string }[]
  /** 激活分支上的用户提问总数（含无文本提问，保持 queryIndex 绝对序） */
  queryCount: number
}

interface GrokResponseNodePayload {
  responseId?: unknown
  sender?: unknown
  parentResponseId?: unknown
}

export interface GrokLoadResponseItem {
  responseId?: unknown
  sender?: unknown
  message?: unknown
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null

const asObjectArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value.filter(Boolean) as T[]) : []

/**
 * 骨架完整性校验：parentResponseId 不在集合内（或缺失）的节点数。
 * 正常会话恰为 1（根节点，其 parent 是不入列的 system 哨兵）；
 * 大于 1 说明历史截断或存在孤儿节点。结构非法返回 null。
 * 仅供导出等对完整性要求严于大纲的链路使用。
 */
export function countGrokTreeRoots(payload: unknown): number | null {
  const root = asRecord(payload)
  if (!root) return null
  const nodes = asObjectArray<GrokResponseNodePayload>(root.responseNodes).filter(
    (node): node is GrokResponseNodePayload & { responseId: string } =>
      typeof node?.responseId === "string" && node.responseId.length > 0,
  )
  if (nodes.length === 0) return null

  const ids = new Set(nodes.map((node) => node.responseId))
  let roots = 0
  for (const node of nodes) {
    if (typeof node.parentResponseId !== "string" || !ids.has(node.parentResponseId)) {
      roots += 1
    }
  }
  return roots
}

/**
 * 解析 response-node 响应并回溯激活分支。
 * 叶节点选择：URL rid 是无子节点的叶子时优先（用户经链接定位到旧分支），
 * 否则取数组末尾节点（接口按创建顺序返回，最新节点即默认展示分支的叶）。
 * 重新生成产生的旁支挂在同一棵树上，resolveActiveBranch 沿 parent 回溯。
 * 结构不符合预期时返回 null（调用方退化为纯 DOM 扫描）。
 */
export function parseGrokResponseTree(
  payload: unknown,
  sessionId: string,
  preferredLeafId?: string | null,
): GrokResponseTree | null {
  if (!sessionId) return null
  const root = asRecord(payload)
  if (!root) return null

  const nodes = asObjectArray<GrokResponseNodePayload>(root.responseNodes).filter(
    (node): node is GrokResponseNodePayload & { responseId: string } =>
      typeof node?.responseId === "string" && node.responseId.length > 0,
  )
  if (nodes.length === 0) return null

  const positionById = new Map<string, number>()
  nodes.forEach((node, index) => {
    positionById.set(node.responseId, index)
  })

  const childCount = new Map<number, number>()
  const mapped = nodes.map((node, index) => {
    const parentId =
      typeof node.parentResponseId === "string"
        ? positionById.get(node.parentResponseId)
        : undefined
    if (parentId !== undefined) {
      childCount.set(parentId, (childCount.get(parentId) ?? 0) + 1)
    }
    return { message_id: index, parent_id: parentId }
  })

  const isLeaf = (index: number): boolean => !childCount.has(index)
  let leafIndex: number | null = null
  if (preferredLeafId) {
    const preferred = positionById.get(preferredLeafId)
    if (preferred !== undefined && isLeaf(preferred)) {
      leafIndex = preferred
    }
  }
  if (leafIndex === null && isLeaf(nodes.length - 1)) {
    leafIndex = nodes.length - 1
  }

  const branch = resolveActiveBranch(mapped, leafIndex)
  if (!branch || branch.length === 0) return null

  const branchResponseIds = branch.map((message) => nodes[message.message_id].responseId)
  const leafResponseId = branchResponseIds[branchResponseIds.length - 1]

  // sender 实测存在 "ASSISTANT" 大写形式，统一归一小写
  const branchSenderByResponseId = new Map<string, string>()
  for (const message of branch) {
    const node = nodes[message.message_id]
    if (typeof node.sender === "string" && node.sender) {
      branchSenderByResponseId.set(node.responseId, node.sender.toLowerCase())
    }
  }

  return {
    sessionId,
    branchResponseIds,
    branchSenderByResponseId,
    signature: `${nodes.length}:${leafResponseId}`,
    leafResponseId,
  }
}

/**
 * 把激活分支树与 load-responses 正文合并为大纲数据。
 * 分支位置序号即 messageId（0-based，根 → 叶递增），branchMessageIds
 * 为 [0..n-1]。load-responses 缺失的条目按树内 sender 保留结构位：
 * human 仍计入 queryCount（保持 queryIndex 绝对序），assistant 跳过标题。
 */
export function parseGrokHistoryOutline(
  tree: GrokResponseTree,
  loadPayload: unknown,
  maxLevel = 6,
): GrokHistoryOutlineData | null {
  const root = asRecord(loadPayload)
  if (!root) return null
  const responses = asObjectArray<GrokLoadResponseItem>(root.responses)

  const senderByResponseId = new Map<string, string>()
  const messageByResponseId = new Map<string, string>()
  for (const item of responses) {
    if (typeof item?.responseId !== "string") continue
    if (typeof item.sender === "string") {
      // sender 实测存在 "ASSISTANT" 大写形式，统一归一小写（与导出解析器同口径）
      senderByResponseId.set(item.responseId, item.sender.toLowerCase())
    }
    if (typeof item.message === "string") {
      messageByResponseId.set(item.responseId, item.message)
    }
  }

  const branchMessageIds: number[] = []
  const positionByResponseId = new Map<string, number>()
  const headingsByMessageIndex = new Map<number, GrokHistoryOutlineHeading[]>()
  const replyWordCountByMessageIndex = new Map<number, number>()
  const assistantIndexByQueryIndex = new Map<number, number>()
  const userQueries: { messageIndex: number; queryIndex: number; text: string }[] = []
  let queryCount = 0
  let pendingQueryIndex: number | null = null

  tree.branchResponseIds.forEach((responseId, position) => {
    branchMessageIds.push(position)
    positionByResponseId.set(responseId, position)

    const message = messageByResponseId.get(responseId) ?? ""
    // load-responses 缺失（或无 sender）的条目按骨架 sender 保留结构位：
    // human 仍计入 queryCount（保持 queryIndex 绝对序），assistant 跳过标题
    const sender =
      senderByResponseId.get(responseId) ?? tree.branchSenderByResponseId.get(responseId)

    if (sender === "human") {
      queryCount += 1
      pendingQueryIndex = queryCount
      const text = stripMarkdownInline(message)
      // 无文本的提问仍计入 queryCount（保持 queryIndex 绝对序），但不进入大纲序列
      if (text) {
        userQueries.push({ messageIndex: position, queryIndex: queryCount, text })
      }
      return
    }
    if (sender !== "assistant") return

    if (pendingQueryIndex !== null) {
      assistantIndexByQueryIndex.set(pendingQueryIndex, position)
      pendingQueryIndex = null
    }
    if (!message.trim()) return

    replyWordCountByMessageIndex.set(position, markdownPlainLength(message))

    // 章节边界用完整层级计算，存储时才按 maxLevel 过滤
    const headings = parseMarkdownHeadingSections(message)
      .filter((section) => section.level <= maxLevel)
      .map((section) => ({
        level: section.level,
        text: stripMarkdownInline(section.text),
        wordCount: markdownPlainLength(section.body),
      }))
      .filter((heading) => heading.text.length > 0)
    if (headings.length > 0) {
      headingsByMessageIndex.set(position, headings)
    }
  })

  if (branchMessageIds.length === 0) return null

  return {
    sessionId: tree.sessionId,
    signature: tree.signature,
    branchMessageIds,
    maxMessageId: branchMessageIds[branchMessageIds.length - 1],
    positionByResponseId,
    branchResponseIds: [...tree.branchResponseIds],
    headingsByMessageIndex,
    replyWordCountByMessageIndex,
    assistantIndexByQueryIndex,
    userQueries,
    queryCount,
  }
}
