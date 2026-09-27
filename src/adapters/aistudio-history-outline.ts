import {
  markdownPlainLength,
  parseMarkdownHeadingSections,
  stripMarkdownInline,
} from "~utils/outline-heading-cache"
import type { ApiOutlineSourceData } from "~utils/outline-api-source"

/** 接口解析出的大纲标题：text 已清洗为纯文本，wordCount 为章节正文估算值 */
export interface AIStudioHistoryOutlineHeading {
  level: number
  text: string
  wordCount: number
}

/**
 * AI Studio ResolveDriveResource 接口解析出的大纲数据。
 * 与 DeepSeek/Claude 的关键差异：Google RPC 响应是 positional array，
 * chunk 无显式 id，历史为线性单链（无重生旁支），因此全链路用
 * 「带文本提问的 1-based 序号」空间做 ApiOutlineSourceData 的
 * branchMessageIds/maxMessageId（与时间线滚动条的条目序号同构，
 * 纯附件轮次不进滚动条、也不进该序号空间）。
 */
export interface AIStudioHistoryOutlineData extends ApiOutlineSourceData {
  /** 变更检测签名：chunk 数 + 元数据最后更新时间 + 提问轮数 + 末条回答长度 */
  signature: string
  /** 带文本的用户提问（按顺序；文本已清洗，与滚动条 aria-label 对齐用） */
  userQueries: { queryIndex: number; text: string }[]
  /** 提问序号（全部轮次空间）-> 该轮回答的标题列表 */
  headingsByQueryIndex: Map<number, AIStudioHistoryOutlineHeading[]>
}

// chunk 槽位定义（实测样本全量验证，见 docs/developer/aistudio-api-outline-plan.md）
const CHUNK_SLOT_TEXT = 0
const CHUNK_SLOT_ROLE = 8
const CHUNK_SLOT_THOUGHT = 19
const CHUNK_SLOT_ERROR = 28

const asArray = (value: unknown): unknown[] | null => (Array.isArray(value) ? value : null)

const chunkText = (chunk: unknown[]): string =>
  typeof chunk[CHUNK_SLOT_TEXT] === "string" ? (chunk[CHUNK_SLOT_TEXT] as string) : ""

const chunkRole = (chunk: unknown[]): string =>
  typeof chunk[CHUNK_SLOT_ROLE] === "string" ? (chunk[CHUNK_SLOT_ROLE] as string) : ""

const isThoughtChunk = (chunk: unknown[]): boolean => chunk[CHUNK_SLOT_THOUGHT] === 1

const isErrorChunk = (chunk: unknown[]): boolean =>
  typeof chunk[CHUNK_SLOT_ERROR] === "string" && (chunk[CHUNK_SLOT_ERROR] as string).length > 0

/** 元数据最后更新时间戳（prompt[4][4][0][0]，秒级字符串）；缺失时返回空串 */
const readUpdatedAt = (prompt: unknown[]): string => {
  const meta = asArray(prompt[4])
  const updateInfo = asArray(meta?.[4])
  const timestamp = asArray(updateInfo?.[0])
  const seconds = timestamp?.[0]
  return typeof seconds === "string" ? seconds : ""
}

/**
 * 解析 ResolveDriveResource 响应；结构不符合预期时返回 null（调用方退化为纯 DOM 扫描）。
 * 对话本体在 prompt[13][0]（[13][1] 是输入框草稿，不参与）；
 * 连续的 user chunk（附件 + 文本）合并为一个用户轮次。
 */
export function parseAIStudioHistoryOutline(
  payload: unknown,
  maxLevel = 6,
): AIStudioHistoryOutlineData | null {
  const batch = asArray(payload)
  const prompt = asArray(batch?.[0])
  if (!prompt) return null

  const resourceName = typeof prompt[0] === "string" ? (prompt[0] as string) : ""
  const sessionId = resourceName.replace(/^prompts\//, "")
  if (!sessionId) return null

  const turns = asArray(prompt[13])
  const chunks = asArray(turns?.[0])?.filter((c): c is unknown[] => Array.isArray(c))
  if (!chunks || chunks.length === 0) return null

  let turnCount = 0
  const userQueries: { queryIndex: number; text: string }[] = []
  const answerPartsByQueryIndex = new Map<number, string[]>()
  let previousRole = ""
  let currentQueryEntry: { queryIndex: number; text: string } | null = null

  for (const chunk of chunks) {
    const role = chunkRole(chunk)
    const text = chunkText(chunk)

    if (role === "user") {
      if (previousRole !== "user") {
        turnCount += 1
        currentQueryEntry = null
      }
      // 纯附件轮次仍计入 turnCount（保持 queryIndex 绝对序），但不进入提问序列
      const stripped = stripMarkdownInline(text).trim()
      if (stripped) {
        if (currentQueryEntry) {
          currentQueryEntry.text = `${currentQueryEntry.text}\n${stripped}`
        } else {
          currentQueryEntry = { queryIndex: turnCount, text: stripped }
          userQueries.push(currentQueryEntry)
        }
      }
    } else if (role === "model" && turnCount > 0) {
      // 思考链（[19]===1）与错误 chunk（[28] 带文案）不参与标题解析
      if (!isThoughtChunk(chunk) && !isErrorChunk(chunk) && text.trim()) {
        const parts = answerPartsByQueryIndex.get(turnCount) ?? []
        parts.push(text)
        answerPartsByQueryIndex.set(turnCount, parts)
      }
    }
    previousRole = role
  }

  if (turnCount === 0) return null

  const headingsByQueryIndex = new Map<number, AIStudioHistoryOutlineHeading[]>()
  let lastAnswerLength = 0

  for (const [queryIndex, parts] of answerPartsByQueryIndex) {
    const markdown = parts.join("\n\n")
    lastAnswerLength = markdown.length

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
      headingsByQueryIndex.set(queryIndex, headings)
    }
  }

  const queryCount = userQueries.length
  return {
    sessionId,
    signature: `${chunks.length}:${readUpdatedAt(prompt)}:${turnCount}:${lastAnswerLength}`,
    userQueries,
    headingsByQueryIndex,
    branchMessageIds: Array.from({ length: queryCount }, (_, i) => i + 1),
    maxMessageId: queryCount,
  }
}
