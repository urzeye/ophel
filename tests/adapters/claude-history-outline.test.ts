import { describe, expect, it } from "vitest"

import { parseClaudeHistoryOutline } from "~adapters/claude-history-outline"

const ZERO_UUID = "00000000-0000-4000-8000-000000000000"

interface TestBlock {
  type: string
  text?: string
}

interface TestMessage {
  uuid: string
  parent_message_uuid: string
  sender: "human" | "assistant"
  index: number
  content: TestBlock[]
  attachments?: unknown[]
  files?: unknown[]
}

const textBlock = (text: string): TestBlock => ({ type: "text", text })

const buildPayload = (
  messages: TestMessage[],
  currentLeafUuid?: string,
  sessionId = "conv-1",
  updatedAt = "2026-05-25T04:00:00.000000Z",
) => ({
  uuid: sessionId,
  name: "测试会话",
  updated_at: updatedAt,
  current_leaf_message_uuid: currentLeafUuid ?? messages[messages.length - 1]?.uuid,
  chat_messages: messages,
})

const userMessage = (uuid: string, parentUuid: string, text = `问题 ${uuid}`): TestMessage => ({
  uuid,
  parent_message_uuid: parentUuid,
  sender: "human",
  index: 0,
  content: [textBlock(text)],
})

const assistantMessage = (uuid: string, parentUuid: string, markdown: string): TestMessage => ({
  uuid,
  parent_message_uuid: parentUuid,
  sender: "assistant",
  index: 0,
  content: [
    { type: "thinking", text: "# 思考里的标题不应出现" },
    textBlock(markdown),
    { type: "tool_use" },
    { type: "tool_result" },
    { type: "token_budget" },
  ],
})

describe("parseClaudeHistoryOutline", () => {
  it("extracts headings and user queries from text blocks on the active branch", () => {
    const payload = buildPayload([
      userMessage("u1", ZERO_UUID),
      assistantMessage("a1", "u1", "## 第一节\n正文\n### 小节"),
      userMessage("u2", "a1"),
      assistantMessage("a2", "u2", "没有标题的回复"),
    ])

    const data = parseClaudeHistoryOutline(payload)
    expect(data).not.toBeNull()
    expect(data!.sessionId).toBe("conv-1")
    expect(data!.branchMessageIds).toEqual([0, 1, 2, 3])
    expect(data!.maxMessageId).toBe(3)
    expect(data!.truncated).toBe(false)
    expect(data!.queryCount).toBe(2)
    expect(data!.signature).toBe("4:a2:2026-05-25T04:00:00.000000Z")

    expect(data!.headingsByMessageIndex.get(1)).toEqual([
      { level: 2, text: "第一节", wordCount: 5 },
      { level: 3, text: "小节", wordCount: 0 },
    ])
    // 非 text 块（thinking 等）的标题不参与
    expect(
      data!.headingsByMessageIndex.get(1)!.some((heading) => heading.text.includes("思考")),
    ).toBe(false)
    // 无标题的回复不产生标题条目，但仍有回复字数估算
    expect(data!.headingsByMessageIndex.has(3)).toBe(false)
    expect(data!.replyWordCountByMessageIndex.get(3)).toBeGreaterThan(0)

    expect(data!.userQueries).toEqual([
      { messageIndex: 0, queryIndex: 1, text: "问题 u1" },
      { messageIndex: 2, queryIndex: 2, text: "问题 u2" },
    ])
  })

  it("walks the active branch via parent uuid when regeneration forks exist", () => {
    const payload = buildPayload([
      userMessage("u1", ZERO_UUID),
      assistantMessage("a1-old", "u1", "## 旧回复标题"),
      assistantMessage("a1-new", "u1", "## 重新生成的标题"),
      userMessage("u2", "a1-new"),
      assistantMessage("a2", "u2", "## 后续回复"),
    ])

    const data = parseClaudeHistoryOutline(payload)
    expect(data).not.toBeNull()
    // 激活分支绕过旧回复：u1 -> a1-new -> u2 -> a2
    expect(data!.branchMessageIds).toEqual([0, 1, 2, 3])
    expect(data!.headingsByMessageIndex.get(1)).toEqual([
      { level: 2, text: "重新生成的标题", wordCount: 0 },
    ])
    expect(
      Array.from(data!.headingsByMessageIndex.values())
        .flat()
        .some((heading) => heading.text.includes("旧回复")),
    ).toBe(false)
    expect(data!.userQueries.map((query) => query.text)).toEqual(["问题 u1", "问题 u2"])
  })

  it("tail-aligns positions via totalMessages when history is truncated", () => {
    // 链顶 u9 的 parent 是不在返回集里的非哨兵 uuid → 历史被截断
    const payload = buildPayload([
      userMessage("u9", "missing-parent"),
      assistantMessage("a9", "u9", "## 尾部标题"),
    ])

    const data = parseClaudeHistoryOutline(payload, 6, 10)
    expect(data).not.toBeNull()
    expect(data!.truncated).toBe(true)
    // offset = 10 - 2 = 8：分支位置 0/1 对齐到绝对序号 8/9
    expect(data!.branchMessageIds).toEqual([8, 9])
    expect(data!.maxMessageId).toBe(9)
    expect(data!.headingsByMessageIndex.get(9)).toEqual([
      { level: 2, text: "尾部标题", wordCount: 0 },
    ])
    expect(data!.userQueries).toEqual([{ messageIndex: 8, queryIndex: 1, text: "问题 u9" }])
  })

  it("fails when truncated history cannot be aligned", () => {
    const payload = buildPayload([
      userMessage("u9", "missing-parent"),
      assistantMessage("a9", "u9", "## 尾部标题"),
    ])

    // 无 totalMessages / totalMessages 小于分支长度：位置无法对齐，判解析失败
    expect(parseClaudeHistoryOutline(payload)).toBeNull()
    expect(parseClaudeHistoryOutline(payload, 6, 1)).toBeNull()
  })

  it("keeps queryIndex absolute for text-less user messages", () => {
    const attachmentOnly = userMessage("u2", "a1", "")
    attachmentOnly.content = []
    attachmentOnly.attachments = [{ file_name: "a.png" }]

    const payload = buildPayload([
      userMessage("u1", ZERO_UUID),
      assistantMessage("a1", "u1", "## 标题"),
      attachmentOnly,
      userMessage("u3", "u2"),
      assistantMessage("a2", "u3", "回复"),
    ])

    const data = parseClaudeHistoryOutline(payload)
    expect(data).not.toBeNull()
    expect(data!.queryCount).toBe(3)
    // 无文本提问不进入大纲序列，但后续提问序号保持绝对序
    expect(data!.userQueries).toEqual([
      { messageIndex: 0, queryIndex: 1, text: "问题 u1" },
      { messageIndex: 3, queryIndex: 3, text: "问题 u3" },
    ])
  })

  it("filters headings beyond maxLevel but keeps section word counts", () => {
    const payload = buildPayload([
      userMessage("u1", ZERO_UUID),
      assistantMessage("a1", "u1", "# 一\n内容\n### 三\n内容"),
    ])

    const data = parseClaudeHistoryOutline(payload, 2)
    expect(data).not.toBeNull()
    // 章节正文估算包含子标题文本（与 deepseek 解析器同一语义）
    expect(data!.headingsByMessageIndex.get(1)).toEqual([{ level: 1, text: "一", wordCount: 7 }])
  })

  it("returns null for malformed payloads", () => {
    expect(parseClaudeHistoryOutline(null)).toBeNull()
    expect(parseClaudeHistoryOutline({})).toBeNull()
    expect(parseClaudeHistoryOutline({ uuid: "conv-1" })).toBeNull()
    expect(parseClaudeHistoryOutline({ uuid: "conv-1", chat_messages: [] })).toBeNull()
  })

  it("returns null when the active branch cannot be determined without leaf", () => {
    // 接口未给 current_leaf 且存在旁支：无法确定激活分支，退化为 DOM 路径
    const payload = buildPayload(
      [
        userMessage("u1", ZERO_UUID),
        assistantMessage("a1-old", "u1", "## 旧"),
        assistantMessage("a1-new", "u1", "## 新"),
      ],
      "",
    )
    payload.current_leaf_message_uuid = ""

    expect(parseClaudeHistoryOutline(payload)).toBeNull()
  })
})
