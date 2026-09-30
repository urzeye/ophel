import { describe, expect, it } from "vitest"

import {
  parseDeepSeekHistoryOutline,
  type DeepSeekHistoryOutlineData,
} from "~adapters/deepseek-history-outline"
import {
  API_OUTLINE_PARSE_FAILURE_LIMIT,
  isApiOutlineStale,
  mergeByBranchMessageOrder,
  shouldAttemptApiOutlineFetch,
} from "~utils/outline-api-source"

interface TestMessage {
  message_id: number
  parent_id: number | null
  role: "USER" | "ASSISTANT"
  content?: string | null
  fragments: { type: string; content?: string; files?: { file_name?: string }[] }[]
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

  it("uses the first attachment file name for image-only USER messages (native TOC parity)", () => {
    const payload = buildPayload([
      {
        message_id: 1,
        parent_id: null,
        role: "USER",
        content: null,
        fragments: [{ type: "FILE", files: [{ file_name: "image.png" }] }],
      },
      assistantMessage(2, 1, "无标题"),
      userMessage(3, 2),
      assistantMessage(4, 3, "无标题"),
    ])

    const data = parseDeepSeekHistoryOutline(payload)!
    expect(data.queryCount).toBe(2)
    expect(data.userQueries).toEqual([
      { messageId: 1, queryIndex: 1, text: "image.png" },
      { messageId: 3, queryIndex: 2, text: "问题 3" },
    ])
    expect(data.queryIndexByAssistantId.get(2)).toBe(1)
    expect(data.queryIndexByAssistantId.get(4)).toBe(2)
  })

  it("prefers REQUEST text over attachment file names", () => {
    const payload = buildPayload([
      {
        message_id: 1,
        parent_id: null,
        role: "USER",
        content: null,
        fragments: [
          { type: "FILE", files: [{ file_name: "image.png" }] },
          { type: "REQUEST", content: "看图说话" },
        ],
      },
      assistantMessage(2, 1, "无标题"),
    ])

    const data = parseDeepSeekHistoryOutline(payload)!
    expect(data.userQueries).toEqual([{ messageId: 1, queryIndex: 1, text: "看图说话" }])
  })

  it("keeps FILE-only USER messages without file names out of userQueries", () => {
    const payload = buildPayload([
      {
        message_id: 1,
        parent_id: null,
        role: "USER",
        content: null,
        fragments: [{ type: "FILE", files: [{}] }],
      },
      assistantMessage(2, 1, "无标题"),
      userMessage(3, 2),
      assistantMessage(4, 3, "无标题"),
    ])

    const data = parseDeepSeekHistoryOutline(payload)!
    expect(data.queryCount).toBe(2)
    expect(data.userQueries).toEqual([{ messageId: 3, queryIndex: 2, text: "问题 3" }])
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

  it("preserves underscores in heading and query text (snake_case identifiers)", () => {
    const payload = buildPayload([
      {
        message_id: 1,
        parent_id: null,
        role: "USER",
        fragments: [{ type: "REQUEST", content: "讲讲 vt9_pro_max" }],
      },
      assistantMessage(2, 1, "## vt9_pro_max 配置\n调用 __init__ 方法"),
    ])

    const data = parseDeepSeekHistoryOutline(payload)!
    expect(data.headingsByAssistantId.get(2)).toEqual([
      { level: 2, text: "vt9_pro_max 配置", wordCount: "调用 __init__ 方法".length },
    ])
    expect(data.userQueries).toEqual([{ messageId: 1, queryIndex: 1, text: "讲讲 vt9_pro_max" }])
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
    // 99/100 大于分支最大 id：判定为缓存未覆盖的新消息，追加到末尾
    // （真实 DOM 顺序里新消息本就在尾部，这里的人造乱序验证尾部判定优先）
    expect(merged).toEqual(["a", "q2", "b", "new-q", "new-h"])
  })

  it("keeps non-new unknown ids before any known entry at the front", () => {
    // id 未超过分支最大值的未知行（如已删除/旁支残留）保持原有相对位置
    const merged = mergeByBranchMessageOrder(
      branch,
      [
        { messageId: 0, item: "x" },
        { messageId: 2, item: "a" },
      ],
      [],
    )
    expect(merged).toEqual(["x", "a"])
  })

  it("appends brand-new messages to the tail even when no known row is mounted", () => {
    // 回归：发送新消息后挂载窗口只有新行（没有任何已知 id），
    // 未知条目不能顶到最前，否则新提问会出现在大纲顶部
    const merged = mergeByBranchMessageOrder(
      branch,
      [
        { messageId: 99, item: "new-q" },
        { messageId: 100, item: "new-h" },
      ],
      [
        { messageId: 1, item: "q1" },
        { messageId: 3, item: "q2" },
      ],
    )
    expect(merged).toEqual(["q1", "q2", "new-q", "new-h"])
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
    // null = 行未进虚拟列表/临时 key，即未入库的新消息，追加到末尾
    expect(merged).toEqual(["a", "no-row"])
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

describe("parseDeepSeekHistoryOutline branch fallback", () => {
  const dropCurrentMessageId = (payload: ReturnType<typeof buildPayload>) => {
    delete (payload.data.biz_data.chat_session as { current_message_id?: number })
      .current_message_id
    return payload
  }

  it("degrades to null when current_message_id is missing and the history has a fork", () => {
    // 字段缺失（疑似接口改版）且存在重新生成的旁支：无法确定激活分支，
    // 退化为纯 DOM 扫描，好过展示混入旁支的错误大纲
    const payload = dropCurrentMessageId(
      buildPayload([
        userMessage(1, null),
        assistantMessage(2, 1, "## 分支 A"),
        assistantMessage(3, 1, "## 分支 B"),
      ]),
    )

    expect(parseDeepSeekHistoryOutline(payload)).toBeNull()
  })

  it("keeps full order when current_message_id is missing but the history is linear", () => {
    const payload = dropCurrentMessageId(
      buildPayload([
        userMessage(1, null),
        assistantMessage(2, 1, "## 第一节"),
        userMessage(3, 2),
        assistantMessage(4, 3, "## 第二节"),
      ]),
    )

    const data = parseDeepSeekHistoryOutline(payload)
    expect(data).not.toBeNull()
    expect(data!.branchMessageIds).toEqual([1, 2, 3, 4])
  })

  it("keeps full order when current_message_id is not in the message page", () => {
    // 分页/删除导致 current 未收录：保留全量顺序的尽力而为，不放弃长对话大纲
    const payload = buildPayload(
      [
        userMessage(1, null),
        assistantMessage(2, 1, "## 分支 A"),
        assistantMessage(3, 1, "## 分支 B"),
      ],
      999,
    )

    const data = parseDeepSeekHistoryOutline(payload)
    expect(data).not.toBeNull()
    expect(data!.branchMessageIds).toEqual([1, 2, 3])
  })
})
