import { describe, expect, it } from "vitest"

import { parseDeepSeekHistoryExport } from "~adapters/deepseek-history-export"

interface TestMessage {
  message_id: number
  parent_id: number | null
  role: "USER" | "ASSISTANT"
  content?: string | null
  thinking_content?: string | null
  fragments: Record<string, unknown>[]
}

const buildPayload = (
  messages: TestMessage[],
  currentMessageId?: number,
  sessionId = "session-1",
) => ({
  code: 0,
  data: {
    biz_code: 0,
    biz_data: {
      chat_session: {
        id: sessionId,
        version: 10,
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
  content: null,
  fragments: [{ type: "REQUEST", content: `问题 ${id}` }],
})

const assistantMessage = (id: number, parentId: number, markdown: string): TestMessage => ({
  message_id: id,
  parent_id: parentId,
  role: "ASSISTANT",
  fragments: [
    { type: "THINK", content: `思考 ${id}` },
    { type: "RESPONSE", content: markdown },
  ],
})

describe("parseDeepSeekHistoryExport", () => {
  it("extracts request/response/thinking from fragment-shaped messages", () => {
    const payload = buildPayload([
      userMessage(1, null),
      assistantMessage(2, 1, "## 第一节\n正文"),
      userMessage(3, 2),
      assistantMessage(4, 3, "没有标题"),
    ])

    const data = parseDeepSeekHistoryExport(payload)
    expect(data).not.toBeNull()
    expect(data!.sessionId).toBe("session-1")
    expect(data!.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ])
    expect(data!.messages[0].requestText).toBe("问题 1")
    expect(data!.messages[1].responseMarkdown).toBe("## 第一节\n正文")
    expect(data!.messages[1].thinkingMarkdown).toBe("思考 2")
  })

  it("prefers content fields over fragments for newer payload shapes", () => {
    const newer: TestMessage = {
      message_id: 2,
      parent_id: 1,
      role: "ASSISTANT",
      content: "## 新版正文",
      thinking_content: "新版思考",
      fragments: [{ type: "RESPONSE", content: "旧版正文" }],
    }
    const payload = buildPayload([userMessage(1, null), newer])

    const data = parseDeepSeekHistoryExport(payload)
    expect(data!.messages[1].responseMarkdown).toBe("## 新版正文")
    expect(data!.messages[1].thinkingMarkdown).toBe("新版思考")
  })

  it("passes FILE fragments through for the adapter attachment extractor", () => {
    const withFile: TestMessage = {
      ...userMessage(1, null),
      fragments: [
        { type: "REQUEST", content: "看这个文件" },
        {
          type: "FILE",
          files: [
            { file_name: "报表.xlsx", file_size: 2048, is_image: false, signed_path: "/sig/1" },
          ],
        },
      ],
    }
    const payload = buildPayload([withFile, assistantMessage(2, 1, "好的")])

    const data = parseDeepSeekHistoryExport(payload)
    expect(data!.messages[0].fileFragments).toHaveLength(1)
    expect((data!.messages[0].fileFragments[0].files as { file_name: string }[])[0].file_name).toBe(
      "报表.xlsx",
    )
  })

  it("keeps only the active branch when the history has regenerations", () => {
    const payload = buildPayload(
      [
        userMessage(1, null),
        assistantMessage(2, 1, "## 分支 A"),
        assistantMessage(3, 1, "## 分支 B"),
      ],
      3,
    )

    const data = parseDeepSeekHistoryExport(payload)
    expect(data!.messages.map((message) => message.role)).toEqual(["user", "assistant"])
    expect(data!.messages[1].responseMarkdown).toBe("## 分支 B")
  })

  it("returns null when current_message_id is not in the message page", () => {
    const payload = buildPayload([userMessage(1, null), assistantMessage(2, 1, "正文")], 999)
    expect(parseDeepSeekHistoryExport(payload)).toBeNull()
  })

  it("returns null when the branch head still has an unlisted parent (truncated history)", () => {
    // message 1 不在列表里：历史被截断，导出会静默缺开头
    const payload = buildPayload([userMessage(2, 1), assistantMessage(3, 2, "正文")])
    expect(parseDeepSeekHistoryExport(payload)).toBeNull()
  })

  it("returns null when current_message_id is missing and the history has a fork", () => {
    const payload = buildPayload([
      userMessage(1, null),
      assistantMessage(2, 1, "## 分支 A"),
      assistantMessage(3, 1, "## 分支 B"),
    ])
    delete (payload.data.biz_data.chat_session as { current_message_id?: number })
      .current_message_id

    expect(parseDeepSeekHistoryExport(payload)).toBeNull()
  })

  it("accepts full order when current_message_id is missing but the history is linear", () => {
    const payload = buildPayload([
      userMessage(1, null),
      assistantMessage(2, 1, "正文"),
      userMessage(3, 2),
      assistantMessage(4, 3, "正文"),
    ])
    delete (payload.data.biz_data.chat_session as { current_message_id?: number })
      .current_message_id

    const data = parseDeepSeekHistoryExport(payload)
    expect(data).not.toBeNull()
    expect(data!.messages).toHaveLength(4)
  })

  it("returns null for malformed payloads", () => {
    expect(parseDeepSeekHistoryExport(null)).toBeNull()
    expect(parseDeepSeekHistoryExport({ data: { biz_data: { chat_messages: [] } } })).toBeNull()
  })
})
