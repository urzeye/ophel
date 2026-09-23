import { describe, expect, it } from "vitest"

import {
  API_OUTLINE_PARSE_FAILURE_LIMIT,
  isApiOutlineStale,
  mergeByBranchMessageOrder,
  parseDeepSeekHistoryOutline,
  shouldAttemptApiOutlineFetch,
  type DeepSeekHistoryOutlineData,
} from "~utils/deepseek-history-outline"

interface TestMessage {
  message_id: number
  parent_id: number | null
  role: "USER" | "ASSISTANT"
  content?: string | null
  fragments: { type: string; content: string }[]
}

const buildPayload = (
  messages: TestMessage[],
  currentMessageId?: number,
  sessionId = "session-1",
  version = 10,
) => ({
  code: 0,
  data: {
    biz_code: 0,
    biz_data: {
      chat_session: {
        id: sessionId,
        version,
        current_message_id: currentMessageId ?? messages[messages.length - 1]?.message_id,
      },
      chat_messages: messages,
      cache_control: "REPLACE",
    },
  },
})

const userMessage = (id: number, parentId: number | null): TestMessage => ({
  message_id: id,
  parent_id: parentId,
  role: "USER",
  fragments: [{ type: "REQUEST", content: `问题 ${id}` }],
})

const assistantMessage = (id: number, parentId: number, markdown: string): TestMessage => ({
  message_id: id,
  parent_id: parentId,
  role: "ASSISTANT",
  fragments: [
    { type: "THINK", content: "# 思考里的标题不应出现" },
    { type: "RESPONSE", content: markdown },
  ],
})

describe("parseDeepSeekHistoryOutline", () => {
  it("extracts headings from RESPONSE fragments on the active branch", () => {
    const payload = buildPayload([
      userMessage(1, null),
      assistantMessage(2, 1, "## 第一节\n正文\n### 小节"),
      userMessage(3, 2),
      assistantMessage(4, 3, "没有标题的回复"),
    ])

    const data = parseDeepSeekHistoryOutline(payload)
    expect(data).not.toBeNull()
    expect(data!.sessionId).toBe("session-1")
    expect(data!.version).toBe(10)
    expect(data!.branchMessageIds).toEqual([1, 2, 3, 4])
    expect(data!.maxMessageId).toBe(4)
    expect(data!.queryCount).toBe(2)

    expect(data!.headingsByAssistantId.get(2)).toEqual([
      { level: 2, text: "第一节", wordCount: 5 },
      { level: 3, text: "小节", wordCount: 0 },
    ])
    // 思考链里的标题不参与
    expect(data!.headingsByAssistantId.get(2)!.some((h) => h.text.includes("思考"))).toBe(false)
    // 无标题的回复不产生条目，但仍有提问序号映射
    expect(data!.headingsByAssistantId.has(4)).toBe(false)
    expect(data!.queryIndexByAssistantId.get(4)).toBe(2)
    expect(data!.assistantIdByQueryIndex.get(1)).toBe(2)
    expect(data!.assistantIdByQueryIndex.get(2)).toBe(4)
    expect(data!.userQueries).toEqual([
      { messageId: 1, queryIndex: 1, text: "问题 1" },
      { messageId: 3, queryIndex: 2, text: "问题 3" },
    ])
  })

  it("walks the active branch via parent_id when regeneration forks exist", () => {
    const payload = buildPayload(
      [
        userMessage(1, null),
        assistantMessage(2, 1, "## 旧回复标题"),
        assistantMessage(3, 1, "## 重新生成的标题"),
      ],
      3,
    )

    const data = parseDeepSeekHistoryOutline(payload)!
    expect(data.branchMessageIds).toEqual([1, 3])
    expect(data.headingsByAssistantId.has(2)).toBe(false)
    expect(data.headingsByAssistantId.get(3)).toEqual([
      { level: 2, text: "重新生成的标题", wordCount: 0 },
    ])
    expect(data.queryIndexByAssistantId.get(3)).toBe(1)
  })

  it("falls back to payload order when the branch tip is missing", () => {
    const payload = buildPayload([userMessage(1, null), assistantMessage(2, 1, "## 标题")], 999)
    const data = parseDeepSeekHistoryOutline(payload)!
    expect(data.branchMessageIds).toEqual([1, 2])
  })

  it("returns null for malformed payloads", () => {
    expect(parseDeepSeekHistoryOutline(null)).toBeNull()
    expect(parseDeepSeekHistoryOutline({})).toBeNull()
    expect(parseDeepSeekHistoryOutline({ data: { biz_data: { chat_messages: [] } } })).toBeNull()
    expect(
      parseDeepSeekHistoryOutline({
        data: { biz_data: { chat_session: { id: "s" }, chat_messages: [] } },
      }),
    ).toBeNull()
  })

  it("respects maxLevel when parsing headings", () => {
    const payload = buildPayload([userMessage(1, null), assistantMessage(2, 1, "# 一\n#### 四")])
    const data = parseDeepSeekHistoryOutline(payload, 2)!
    expect(data.headingsByAssistantId.get(2)).toEqual([{ level: 1, text: "一", wordCount: 1 }])
  })

  it("reads markdown from message.content when the response has no fragments", () => {
    // 当前版本接口的真实结构：回复 markdown 直接在 content 字段，
    // 思考链在独立的 thinking_content，无 fragments 数组
    const payload = {
      code: 0,
      data: {
        biz_code: 0,
        biz_data: {
          chat_session: { id: "session-1", version: 3, current_message_id: 2 },
          chat_messages: [
            { message_id: 1, parent_id: null, role: "USER", content: "问题一" },
            {
              message_id: 2,
              parent_id: 1,
              role: "ASSISTANT",
              content: "## 结论\n正文",
              thinking_content: "# 思考标题不应出现",
            },
          ],
        },
      },
    }

    const data = parseDeepSeekHistoryOutline(payload)!
    expect(data.branchMessageIds).toEqual([1, 2])
    expect(data.headingsByAssistantId.get(2)).toEqual([{ level: 2, text: "结论", wordCount: 2 }])
    expect(data.queryIndexByAssistantId.get(2)).toBe(1)
  })

  it("joins multiple REQUEST fragments and falls back to string content", () => {
    const payload = buildPayload([
      {
        message_id: 1,
        parent_id: null,
        role: "USER",
        fragments: [
          { type: "REQUEST", content: "第一段" },
          { type: "REQUEST", content: "第二段" },
        ],
      },
      assistantMessage(2, 1, "无标题"),
      { message_id: 3, parent_id: 2, role: "USER", content: "兜底问题", fragments: [] },
      assistantMessage(4, 3, "无标题"),
    ])

    const data = parseDeepSeekHistoryOutline(payload)!
    expect(data.userQueries).toEqual([
      { messageId: 1, queryIndex: 1, text: "第一段 第二段" },
      { messageId: 3, queryIndex: 2, text: "兜底问题" },
    ])
  })

  it("keeps textless USER messages in queryCount but out of userQueries", () => {
    const payload = buildPayload([
      { message_id: 1, parent_id: null, role: "USER", content: null, fragments: [] },
      assistantMessage(2, 1, "无标题"),
      userMessage(3, 2),
      assistantMessage(4, 3, "无标题"),
    ])

    const data = parseDeepSeekHistoryOutline(payload)!
    expect(data.queryCount).toBe(2)
    expect(data.userQueries).toEqual([{ messageId: 3, queryIndex: 2, text: "问题 3" }])
    // queryIndex 绝对序不因无文本提问而平移
    expect(data.queryIndexByAssistantId.get(2)).toBe(1)
    expect(data.queryIndexByAssistantId.get(4)).toBe(2)
  })

  it("strips markdown formatting and reference marks from heading text", () => {
    const payload = buildPayload([
      userMessage(1, null),
      assistantMessage(2, 1, "## **重要** 结论[reference:0]\n正文"),
    ])

    const data = parseDeepSeekHistoryOutline(payload)!
    expect(data.headingsByAssistantId.get(2)).toEqual([
      { level: 2, text: "重要 结论", wordCount: 2 },
    ])
  })

  it("drops headings whose cleaned text is empty", () => {
    const payload = buildPayload([
      userMessage(1, null),
      assistantMessage(2, 1, "## [reference:3]\n正文\n## 有效标题\n正文"),
    ])

    const data = parseDeepSeekHistoryOutline(payload)!
    expect(data.headingsByAssistantId.get(2)).toEqual([
      { level: 2, text: "有效标题", wordCount: 2 },
    ])
  })

  it("computes section wordCount up to the next same-or-higher level heading", () => {
    const markdown = ["# 一", "正文一", "##### 深层", "深层正文", "# 二", "正文二"].join("\n")
    const payload = buildPayload([userMessage(1, null), assistantMessage(2, 1, markdown)])

    // maxLevel=2 过滤掉 h5，但 h1 的章节边界仍按完整层级算到下一个 h1 前
    const data = parseDeepSeekHistoryOutline(payload, 2)!
    expect(data.headingsByAssistantId.get(2)).toEqual([
      { level: 1, text: "一", wordCount: "正文一 深层 深层正文".length },
      { level: 1, text: "二", wordCount: 3 },
    ])
  })

  it("excludes side-branch USER/ASSISTANT messages from userQueries and headings", () => {
    const payload = buildPayload(
      [
        userMessage(1, null),
        assistantMessage(2, 1, "## A"),
        userMessage(3, 2),
        assistantMessage(4, 3, "## B"),
        // 重新提问产生的旁支
        {
          message_id: 5,
          parent_id: 2,
          role: "USER",
          fragments: [{ type: "REQUEST", content: "旁支问题" }],
        },
        assistantMessage(6, 5, "## C"),
      ],
      4,
    )

    const data = parseDeepSeekHistoryOutline(payload)!
    expect(data.branchMessageIds).toEqual([1, 2, 3, 4])
    expect(data.userQueries.map((query) => query.messageId)).toEqual([1, 3])
    expect(data.headingsByAssistantId.has(6)).toBe(false)
  })

  it("estimates reply plain-text length for user query word counts", () => {
    const payload = buildPayload([userMessage(1, null), assistantMessage(2, 1, "无标题回复正文")])
    const data = parseDeepSeekHistoryOutline(payload)!
    expect(data.replyWordCountByAssistantId.get(2)).toBe(7)
  })
})

describe("mergeByBranchMessageOrder", () => {
  const branch = [1, 2, 3, 4]

  it("merges dom and fill entries by branch position", () => {
    const merged = mergeByBranchMessageOrder(
      branch,
      [
        { messageId: 2, item: "h1" },
        { messageId: 2, item: "h2" },
        { messageId: 4, item: "h3" },
      ],
      [
        { messageId: 1, item: "q1" },
        { messageId: 3, item: "q2" },
      ],
    )
    expect(merged).toEqual(["q1", "h1", "h2", "q2", "h3"])
  })

  it("hangs unknown ids (generating messages) after the nearest known position", () => {
    const merged = mergeByBranchMessageOrder(
      branch,
      [
        { messageId: 2, item: "a" },
        { messageId: 99, item: "new-q" },
        { messageId: 100, item: "new-h" },
        { messageId: 4, item: "b" },
      ],
      [{ messageId: 3, item: "q2" }],
    )
    expect(merged).toEqual(["a", "new-q", "new-h", "q2", "b"])
  })

  it("keeps unknown ids before any known entry at the front", () => {
    const merged = mergeByBranchMessageOrder(
      branch,
      [
        { messageId: 99, item: "x" },
        { messageId: 2, item: "a" },
      ],
      [],
    )
    expect(merged).toEqual(["x", "a"])
  })

  it("treats null messageId as unknown and skips fill entries outside the branch", () => {
    const merged = mergeByBranchMessageOrder(
      branch,
      [
        { messageId: null, item: "no-row" },
        { messageId: 1, item: "a" },
      ],
      [{ messageId: 999, item: "not-in-branch" }],
    )
    expect(merged).toEqual(["no-row", "a"])
  })
})

const staleData = (
  overrides: Partial<DeepSeekHistoryOutlineData> = {},
): DeepSeekHistoryOutlineData => ({
  sessionId: "session-1",
  version: 4,
  branchMessageIds: [1, 2, 3, 4],
  maxMessageId: 4,
  headingsByAssistantId: new Map(),
  replyWordCountByAssistantId: new Map(),
  queryIndexByAssistantId: new Map(),
  assistantIdByQueryIndex: new Map(),
  queryCount: 2,
  userQueries: [],
  ...overrides,
})

describe("isApiOutlineStale", () => {
  it("is stale without data or on session mismatch", () => {
    expect(
      isApiOutlineStale({ data: null, sessionId: "s", mountedIds: new Set(), atBottom: true }),
    ).toBe(true)
    expect(
      isApiOutlineStale({
        data: staleData(),
        sessionId: "other",
        mountedIds: new Set([1]),
        atBottom: true,
      }),
    ).toBe(true)
  })

  it("is stale when a mounted id exceeds the cached maxMessageId", () => {
    expect(
      isApiOutlineStale({
        data: staleData(),
        sessionId: "session-1",
        mountedIds: new Set([3, 4, 5]),
        atBottom: false,
      }),
    ).toBe(true)
  })

  it("is stale when a mounted id is outside the branch (edit/regenerate)", () => {
    expect(
      isApiOutlineStale({
        data: staleData(),
        sessionId: "session-1",
        mountedIds: new Set([2, 9]),
        atBottom: false,
      }),
    ).toBe(true)
  })

  it("detects tail deletion only when scrolled to bottom", () => {
    const base = {
      data: staleData(),
      sessionId: "session-1",
      mountedIds: new Set([1, 2]),
    }
    // 贴底且挂载 max id 小于缓存：尾部被删
    expect(isApiOutlineStale({ ...base, atBottom: true })).toBe(true)
    // 同样的挂载窗口出现在向上滚动时：不触发重拉
    expect(isApiOutlineStale({ ...base, atBottom: false })).toBe(false)
  })

  it("is fresh when mounted ids are a subset of the branch tail", () => {
    expect(
      isApiOutlineStale({
        data: staleData(),
        sessionId: "session-1",
        mountedIds: new Set([3, 4]),
        atBottom: true,
      }),
    ).toBe(false)
  })
})

describe("shouldAttemptApiOutlineFetch", () => {
  const base = {
    now: 100_000,
    lastFetchAt: 0,
    backoffMs: 10_000,
    parseFailures: 0,
    inFlight: false,
    generating: false,
    stale: true,
  }

  it("blocks while in flight, generating, or fresh", () => {
    expect(shouldAttemptApiOutlineFetch({ ...base, inFlight: true })).toBe(false)
    expect(shouldAttemptApiOutlineFetch({ ...base, generating: true })).toBe(false)
    expect(shouldAttemptApiOutlineFetch({ ...base, stale: false })).toBe(false)
  })

  it("blocks inside the cooldown window and allows after it", () => {
    expect(shouldAttemptApiOutlineFetch({ ...base, lastFetchAt: 95_000 })).toBe(false)
    expect(shouldAttemptApiOutlineFetch({ ...base, lastFetchAt: 90_000 })).toBe(true)
  })

  it("fuses after consecutive parse failures", () => {
    expect(
      shouldAttemptApiOutlineFetch({ ...base, parseFailures: API_OUTLINE_PARSE_FAILURE_LIMIT - 1 }),
    ).toBe(true)
    expect(
      shouldAttemptApiOutlineFetch({ ...base, parseFailures: API_OUTLINE_PARSE_FAILURE_LIMIT }),
    ).toBe(false)
  })
})
