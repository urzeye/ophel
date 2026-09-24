import { describe, expect, it } from "vitest"

import { parseClaudeHistoryExport } from "~adapters/claude-history-export"

const ZERO_UUID = "00000000-0000-4000-8000-000000000000"

interface TestBlock {
  type: string
  text?: string
  thinking?: string
  summaries?: { summary: string }[]
  id?: string
  name?: string
  input?: Record<string, unknown>
  content?: Record<string, unknown>[]
  is_error?: boolean
  tool_use_id?: string
}

interface TestMessage {
  uuid: string
  parent_message_uuid: string
  sender: "human" | "assistant"
  content: TestBlock[]
  attachments?: Record<string, unknown>[]
  files?: Record<string, unknown>[]
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
    { type: "thinking", thinking: "思考过程", summaries: [{ summary: "思考摘要" }] },
    { type: "text", text: markdown },
  ],
})

const createFileBlock = (id: string, path: string, fileText?: string): TestBlock => ({
  type: "tool_use",
  id,
  name: "create_file",
  input: { path, file_text: fileText },
})

const presentFilesResult = (path: string, name: string, mimeType: string): TestBlock => ({
  type: "tool_result",
  name: "present_files",
  content: [{ type: "local_resource", file_path: path, name, mime_type: mimeType }],
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
    expect(data!.messages[1].segments).toEqual([{ type: "text", text: "新回复" }])
    expect(data!.messages[1].thinkingMarkdown).toBe("思考过程")
    expect(data!.messages[1].thinkingTitle).toBe("思考摘要")
  })

  it("returns null when the leaf is missing or history is truncated", () => {
    const missingLeaf = buildPayload(
      [userMessage("u1", ZERO_UUID), assistantMessage("a1", "u1", "回复")],
      "missing-leaf",
    )
    expect(parseClaudeHistoryExport(missingLeaf)).toBeNull()

    const truncated = buildPayload([
      userMessage("u9", "missing-parent"),
      assistantMessage("a9", "u9", "尾部回复"),
    ])
    expect(parseClaudeHistoryExport(truncated)).toBeNull()
  })

  it("extracts user attachments and files instead of vetoing", () => {
    const message = userMessage("u1", ZERO_UUID, "看看这些")
    message.attachments = [
      { file_name: "笔记.md", extracted_content: "# 笔记\n内容" },
      { file_name: "空文档.txt" },
    ]
    message.files = [
      {
        file_kind: "image",
        file_uuid: "img-1",
        file_name: "头像.gif",
        preview_url: "/api/org/files/img-1/preview",
      },
    ]

    const data = parseClaudeHistoryExport(
      buildPayload([message, assistantMessage("a1", "u1", "回复")]),
    )
    expect(data).not.toBeNull()
    expect(data!.messages[0].attachments).toEqual([
      { fileName: "笔记.md", extractedContent: "# 笔记\n内容" },
      { fileName: "空文档.txt", extractedContent: "" },
    ])
    expect(data!.messages[0].files).toEqual([
      {
        fileName: "头像.gif",
        fileUuid: "img-1",
        fileKind: "image",
        previewUrl: "/api/org/files/img-1/preview",
      },
    ])
  })

  it("turns create_file blocks into document segments in block order", () => {
    const reply = assistantMessage("a1", "u1", "")
    reply.content = [
      { type: "text", text: "先看这个：" },
      createFileBlock("t1", "/mnt/user-data/outputs/canvas.html", "<html>v1</html>"),
      presentFilesResult("/mnt/user-data/outputs/canvas.html", "robot canvas", "text/html"),
      { type: "text", text: "以上是初版。" },
    ]

    const data = parseClaudeHistoryExport(buildPayload([userMessage("u1", ZERO_UUID), reply]))
    expect(data).not.toBeNull()
    expect(data!.messages[1].segments).toEqual([
      { type: "text", text: "先看这个：" },
      {
        type: "document",
        document: {
          name: "robot canvas",
          path: "/mnt/user-data/outputs/canvas.html",
          content: "<html>v1</html>",
          mimeType: "text/html",
        },
      },
      { type: "text", text: "以上是初版。" },
    ])
  })

  it("keeps only the final content for repeated paths", () => {
    const reply = assistantMessage("a1", "u1", "")
    reply.content = [
      createFileBlock("t1", "/mnt/o/doc.md", "# 旧版"),
      { type: "text", text: "改一版：" },
      createFileBlock("t2", "/mnt/o/doc.md", "# 新版"),
    ]

    const data = parseClaudeHistoryExport(buildPayload([userMessage("u1", ZERO_UUID), reply]))
    expect(data).not.toBeNull()
    const documents = data!.messages[1].segments.filter((segment) => segment.type === "document")
    expect(documents).toHaveLength(2)
    // 同 path 仅最后一次保留正文，早前版本降级为占位符
    expect(documents[0]).toMatchObject({ document: { content: null } })
    expect(documents[1]).toMatchObject({
      document: { content: "# 新版", mimeType: "text/markdown" },
    })
  })

  it("marks create_file without file_text as placeholder document", () => {
    const reply = assistantMessage("a1", "u1", "")
    reply.content = [createFileBlock("t1", "/mnt/o/report.docx", undefined)]

    const data = parseClaudeHistoryExport(buildPayload([userMessage("u1", ZERO_UUID), reply]))
    expect(data).not.toBeNull()
    expect(data!.messages[1].segments).toEqual([
      {
        type: "document",
        document: { name: "report.docx", path: "/mnt/o/report.docx", content: null, mimeType: "" },
      },
    ])
  })

  it("ignores unknown tool_use names and non-text tool blocks", () => {
    const reply = assistantMessage("a1", "u1", "")
    reply.content = [
      { type: "text", text: "前" },
      { type: "tool_use", name: "bash_tool", input: { command: "ls" } },
      { type: "tool_result", name: "bash_tool", content: [{ type: "text", text: "输出" }] },
      { type: "tool_use", name: "some_future_tool", input: {} },
      { type: "token_budget" },
      { type: "text", text: "后" },
    ]

    const data = parseClaudeHistoryExport(buildPayload([userMessage("u1", ZERO_UUID), reply]))
    expect(data).not.toBeNull()
    expect(data!.messages[1].segments).toEqual([
      { type: "text", text: "前" },
      { type: "text", text: "后" },
    ])
  })

  it("skips create_file whose tool_result is an error", () => {
    const reply = assistantMessage("a1", "u1", "")
    reply.content = [
      createFileBlock("t1", "/mnt/o/broken.html", "<html>失败版</html>"),
      { type: "tool_result", name: "create_file", tool_use_id: "t1", is_error: true },
      createFileBlock("t2", "/mnt/o/ok.md", "# 成功"),
      { type: "text", text: "只成功了一个。" },
    ]

    const data = parseClaudeHistoryExport(buildPayload([userMessage("u1", ZERO_UUID), reply]))
    expect(data).not.toBeNull()
    expect(data!.messages[1].segments).toEqual([
      {
        type: "document",
        document: {
          name: "ok.md",
          path: "/mnt/o/ok.md",
          content: "# 成功",
          mimeType: "text/markdown",
        },
      },
      { type: "text", text: "只成功了一个。" },
    ])
  })

  it("returns null for malformed payloads", () => {
    expect(parseClaudeHistoryExport(null)).toBeNull()
    expect(parseClaudeHistoryExport({})).toBeNull()
    expect(parseClaudeHistoryExport({ uuid: "conv-1", chat_messages: [] })).toBeNull()
  })
})
