import { describe, expect, it } from "vitest"

import { parseDeepSeekHistoryOutline } from "~adapters/deepseek-history-outline"

interface TestMessage {
  message_id: number
  parent_id: number | null
  role: "USER" | "ASSISTANT"
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
      { level: 2, text: "第一节" },
      { level: 3, text: "小节" },
    ])
    // 思考链里的标题不参与
    expect(data!.headingsByAssistantId.get(2)!.some((h) => h.text.includes("思考"))).toBe(false)
    // 无标题的回复不产生条目，但仍有提问序号映射
    expect(data!.headingsByAssistantId.has(4)).toBe(false)
    expect(data!.queryIndexByAssistantId.get(4)).toBe(2)
    expect(data!.assistantIdByQueryIndex.get(1)).toBe(2)
    expect(data!.assistantIdByQueryIndex.get(2)).toBe(4)
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
    expect(data.headingsByAssistantId.get(3)).toEqual([{ level: 2, text: "重新生成的标题" }])
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
    expect(data.headingsByAssistantId.get(2)).toEqual([{ level: 1, text: "一" }])
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
    expect(data.headingsByAssistantId.get(2)).toEqual([{ level: 2, text: "结论" }])
    expect(data.queryIndexByAssistantId.get(2)).toBe(1)
  })
})
