import { describe, expect, it } from "vitest"

import { parseClaudeHistoryExport } from "~utils/claude-history-export"

const ZERO_UUID = "00000000-0000-4000-8000-000000000000"

interface TestBlock {
  type: string
  text?: string
  thinking?: string
  summaries?: { summary: string }[]
}

interface TestMessage {
  uuid: string
  parent_message_uuid: string
  sender: "human" | "assistant"
  content: TestBlock[]
  attachments?: unknown[]
  files?: unknown[]
}

const buildPayload = (messages: TestMessage[], currentLeafUuid?: string, sessionId = "conv-1") => ({
  uuid: sessionId,
  updated_at: "2026-05-25T04:00:00.000000Z",
  current_leaf_message_uuid: currentLeafUuid ?? messages[messages.length - 1]?.uuid,
  chat_messages: messages,
})

const userMessage = (uuid: string, parentUuid: string, text = `问题 ${uuid}`): TestMessage => ({
  uuid,
  parent_message_uuid: parentUuid,
  sender: "human",
  content: [{ type: "text", text }],
})

const assistantMessage = (uuid: string, parentUuid: string, markdown: string): TestMessage => ({
  uuid,
  parent_message_uuid: parentUuid,
  sender: "assistant",
  content: [
    {
      type: "thinking",
      thinking: "思考过程",
      summaries: [{ summary: "思考摘要" }],
    },
    { type: "text", text: markdown },
  ],
})

describe("parseClaudeHistoryExport", () => {
  it("extracts the active branch as export messages", () => {
    const payload = buildPayload([
      userMessage("u1", ZERO_UUID),
      assistantMessage("a1-old", "u1", "旧回复"),
      assistantMessage("a1-new", "u1", "新回复"),
      userMessage("u2", "a1-new"),
      assistantMessage("a2", "u2", "后续回复"),
    ])

    const data = parseClaudeHistoryExport(payload)
    expect(data).not.toBeNull()
    expect(data!.sessionId).toBe("conv-1")
    expect(data!.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ])
    expect(data!.messages[0].requestText).toBe("问题 u1")
    // 激活分支绕过旧回复
    expect(data!.messages[1].responseMarkdown).toBe("新回复")
    expect(data!.messages[1].thinkingMarkdown).toBe("思考过程")
    expect(data!.messages[1].thinkingTitle).toBe("思考摘要")
    expect(data!.messages[3].responseMarkdown).toBe("后续回复")
  })

  it("returns null when the leaf is missing from chat_messages", () => {
    const payload = buildPayload(
      [userMessage("u1", ZERO_UUID), assistantMessage("a1", "u1", "回复")],
      "missing-leaf",
    )
    expect(parseClaudeHistoryExport(payload)).toBeNull()
  })

  it("returns null when history is truncated", () => {
    const payload = buildPayload([
      userMessage("u9", "missing-parent"),
      assistantMessage("a9", "u9", "尾部回复"),
    ])
    expect(parseClaudeHistoryExport(payload)).toBeNull()
  })

  it("returns null when any user message carries attachments or files", () => {
    const withAttachment = userMessage("u1", ZERO_UUID)
    withAttachment.attachments = [{ file_name: "a.png" }]
    expect(
      parseClaudeHistoryExport(
        buildPayload([withAttachment, assistantMessage("a1", "u1", "回复")]),
      ),
    ).toBeNull()

    const withFile = userMessage("u1", ZERO_UUID)
    withFile.files = [{ file_name: "b.pdf" }]
    expect(
      parseClaudeHistoryExport(buildPayload([withFile, assistantMessage("a1", "u1", "回复")])),
    ).toBeNull()
  })

  it("returns null when any assistant message contains a tool_use block", () => {
    const withTool = assistantMessage("a1", "u1", "回复")
    withTool.content.push({ type: "tool_use" })
    expect(
      parseClaudeHistoryExport(buildPayload([userMessage("u1", ZERO_UUID), withTool])),
    ).toBeNull()
  })

  it("returns null for malformed payloads", () => {
    expect(parseClaudeHistoryExport(null)).toBeNull()
    expect(parseClaudeHistoryExport({})).toBeNull()
    expect(parseClaudeHistoryExport({ uuid: "conv-1", chat_messages: [] })).toBeNull()
  })
})
