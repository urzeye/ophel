import { describe, expect, it } from "vitest"

import { parseAIStudioHistoryOutline } from "~adapters/aistudio-history-outline"

interface TestChunkOptions {
  text?: string
  role: "user" | "model"
  thought?: boolean
  error?: string
  imageIds?: string[]
  fileIds?: string[]
  inlineImage?: { mimeType: string; data: string }
}

/** 构造 37 槽位 chunk：文本 [0]、图片 [1]、文件 [3]、角色 [8]、内联图片 [12]、正式回答 [16]、思考 [19]、错误 [28] */
const makeChunk = (options: TestChunkOptions): unknown[] => {
  const chunk: unknown[] = new Array(37).fill(null)
  chunk[0] = options.text ?? ""
  if (options.imageIds) chunk[1] = options.imageIds
  if (options.fileIds) chunk[3] = options.fileIds
  chunk[8] = options.role
  if (options.inlineImage) chunk[12] = [options.inlineImage.mimeType, options.inlineImage.data]
  if (options.role === "model" && !options.thought && !options.error) chunk[16] = 1
  if (options.thought) chunk[19] = 1
  if (options.error) chunk[28] = options.error
  return chunk
}

/** 构造 ResolveDriveResource 响应：[[resourceName, ..., metadata, ..., [chunks, draft]]] */
const buildPayload = (
  chunks: unknown[][],
  options: { sessionId?: string; updatedAt?: string; withDraft?: boolean } = {},
) => {
  const { sessionId = "abc123", updatedAt = "1790062476", withDraft = true } = options
  const prompt: unknown[] = new Array(14).fill(null)
  prompt[0] = `prompts/${sessionId}`
  const meta: unknown[] = new Array(12).fill(null)
  meta[0] = "测试会话"
  meta[4] = [[updatedAt, 1000000]]
  meta[11] = [["promptType", "CHUNKED_PROMPT"]]
  prompt[4] = meta
  prompt[13] = withDraft ? [chunks, [makeChunk({ role: "user" })]] : [chunks]
  return [prompt]
}

describe("parseAIStudioHistoryOutline", () => {
  it("解析纯文本对话：跳过思考链，提取提问与回答标题", () => {
    const payload = buildPayload([
      makeChunk({ role: "user", text: "第一个问题" }),
      makeChunk({ role: "model", text: "**Thinking**\n\nLet me think...", thought: true }),
      makeChunk({ role: "model", text: "## 第一节\n正文内容\n### 小节\n细节" }),
      makeChunk({ role: "user", text: "第二个问题" }),
      makeChunk({ role: "model", text: "没有标题的回答" }),
    ])

    const data = parseAIStudioHistoryOutline(payload)
    expect(data).not.toBeNull()
    expect(data!.sessionId).toBe("abc123")
    expect(data!.userQueries).toEqual([
      { queryIndex: 1, text: "第一个问题", markdown: "第一个问题" },
      { queryIndex: 2, text: "第二个问题", markdown: "第二个问题" },
    ])
    // 带文本提问序号空间：branchMessageIds/maxMessageId 与滚动条条目同构
    expect(data!.branchMessageIds).toEqual([1, 2])
    expect(data!.maxMessageId).toBe(2)
    expect(data!.signature).toBe("5:1790062476:2:7")

    const headings = data!.headingsByQueryIndex.get(1)
    expect(headings).toEqual([
      { level: 2, text: "第一节", wordCount: 10 },
      { level: 3, text: "小节", wordCount: 2 },
    ])
    // 思考链的 markdown 不参与标题解析
    expect(
      [...data!.headingsByQueryIndex.values()].flat().some((h) => h.text.includes("Thinking")),
    ).toBe(false)
    // 第二轮无标题
    expect(data!.headingsByQueryIndex.has(2)).toBe(false)
    // 思考链单独收集，不进回答正文
    expect(data!.thoughtsByQueryIndex.get(1)).toEqual(["**Thinking**\n\nLet me think..."])
    expect(data!.replyMarkdownByQueryIndex.get(1)).toContain("## 第一节")
    expect(data!.replyMarkdownByQueryIndex.get(1)).not.toContain("Thinking")
  })

  it("合并同一轮的附件与文本 chunk，纯附件轮计入轮次序号但不进提问序列", () => {
    const payload = buildPayload([
      makeChunk({ role: "user", imageIds: ["img-1"] }),
      makeChunk({ role: "user", fileIds: ["file-1"] }),
      makeChunk({ role: "user", text: "看看这些" }),
      makeChunk({ role: "model", text: "## 分析\n图片内容" }),
      makeChunk({ role: "user", imageIds: ["img-2"] }),
      makeChunk({ role: "model", text: "收到图片" }),
      makeChunk({ role: "user", text: "谢谢" }),
      makeChunk({ role: "model", text: "不客气" }),
    ])

    const data = parseAIStudioHistoryOutline(payload)
    expect(data).not.toBeNull()
    // 纯附件轮占用了绝对序号 2，但不进提问序列
    expect(data!.userQueries).toEqual([
      { queryIndex: 1, text: "看看这些", markdown: "看看这些" },
      { queryIndex: 3, text: "谢谢", markdown: "谢谢" },
    ])
    // 附件按轮次（绝对序号）收集：第 1 轮图片+文件，第 2 轮纯图片无文本
    expect(data!.attachmentsByQueryIndex.get(1)).toEqual({
      images: ["img-1"],
      files: ["file-1"],
      inlineImages: [],
    })
    expect(data!.attachmentsByQueryIndex.get(2)).toEqual({
      images: ["img-2"],
      files: [],
      inlineImages: [],
    })
    // 附件所属轮的回答标题挂在该轮（绝对序号 1）上
    expect(data!.headingsByQueryIndex.get(1)).toEqual([{ level: 2, text: "分析", wordCount: 4 }])
    // branchMessageIds 只含带文本提问（与滚动条对齐）
    expect(data!.branchMessageIds).toEqual([1, 2])
  })

  it("粘贴的内联图片仅在导出解析（includeInlineImages）时捕获", () => {
    const buildImagePayload = () =>
      buildPayload([
        makeChunk({ role: "user", inlineImage: { mimeType: "image/png", data: "aGVsbG8=" } }),
        makeChunk({ role: "model", text: "图片分析结果" }),
        makeChunk({ role: "user", text: "谢谢" }),
        makeChunk({ role: "model", text: "不客气" }),
      ])

    // 大纲解析（默认）：不捕获内联字节，纯图片轮不产生附件条目
    const outlineData = parseAIStudioHistoryOutline(buildImagePayload())
    expect(outlineData).not.toBeNull()
    expect(outlineData!.attachmentsByQueryIndex.size).toBe(0)
    expect(outlineData!.userQueries).toEqual([{ queryIndex: 2, text: "谢谢", markdown: "谢谢" }])

    // 导出解析：捕获内联图片，纯图片轮进入附件轮次空间
    const exportData = parseAIStudioHistoryOutline(buildImagePayload(), 6, {
      includeInlineImages: true,
    })
    expect(exportData).not.toBeNull()
    expect(exportData!.attachmentsByQueryIndex.get(1)).toEqual({
      images: [],
      files: [],
      inlineImages: [{ mimeType: "image/png", data: "aGVsbG8=" }],
    })
    expect(exportData!.replyMarkdownByQueryIndex.get(1)).toBe("图片分析结果")
  })

  it("内联图片槽位形态不符时忽略", () => {
    const payload = buildPayload([
      makeChunk({ role: "user", inlineImage: { mimeType: "text/plain", data: "aGVsbG8=" } }),
      makeChunk({ role: "user", text: "问题" }),
      makeChunk({ role: "model", text: "回答" }),
    ])

    const data = parseAIStudioHistoryOutline(payload, 6, { includeInlineImages: true })
    expect(data).not.toBeNull()
    expect(data!.attachmentsByQueryIndex.size).toBe(0)
  })

  it("跳过错误 chunk 与空回答", () => {
    const payload = buildPayload([
      makeChunk({ role: "user", text: "问题" }),
      makeChunk({ role: "model", error: "An internal error has occurred." }),
      makeChunk({ role: "user", text: "再问" }),
      makeChunk({ role: "model", text: "" }),
    ])

    const data = parseAIStudioHistoryOutline(payload)
    expect(data).not.toBeNull()
    expect(data!.headingsByQueryIndex.size).toBe(0)
  })

  it("同一轮的多条正式回答合并解析", () => {
    const payload = buildPayload([
      makeChunk({ role: "user", text: "问题" }),
      makeChunk({ role: "model", text: "## 上半部分\n内容" }),
      makeChunk({ role: "model", text: "## 下半部分\n内容" }),
    ])

    const data = parseAIStudioHistoryOutline(payload)
    expect(data!.headingsByQueryIndex.get(1)).toEqual([
      { level: 2, text: "上半部分", wordCount: 2 },
      { level: 2, text: "下半部分", wordCount: 2 },
    ])
  })

  it("maxLevel 过滤深层标题", () => {
    const payload = buildPayload([
      makeChunk({ role: "user", text: "问题" }),
      makeChunk({ role: "model", text: "## 二级\n正文\n#### 四级\n正文" }),
    ])

    const data = parseAIStudioHistoryOutline(payload, 3)
    expect(data!.headingsByQueryIndex.get(1)).toEqual([{ level: 2, text: "二级", wordCount: 8 }])
  })

  it("结构非法时返回 null", () => {
    expect(parseAIStudioHistoryOutline(null)).toBeNull()
    expect(parseAIStudioHistoryOutline({})).toBeNull()
    expect(parseAIStudioHistoryOutline([null])).toBeNull()
    expect(parseAIStudioHistoryOutline([["prompts/abc123"]])).toBeNull()

    // 没有对话本体
    const noTurns = new Array(14).fill(null)
    noTurns[0] = "prompts/abc123"
    expect(parseAIStudioHistoryOutline([noTurns])).toBeNull()

    // 没有任何用户轮次
    expect(
      parseAIStudioHistoryOutline(buildPayload([makeChunk({ role: "model", text: "自言自语" })])),
    ).toBeNull()

    // 资源名缺失
    const noName = new Array(14).fill(null)
    noName[13] = [[makeChunk({ role: "user", text: "问题" })]]
    expect(parseAIStudioHistoryOutline([noName])).toBeNull()
  })

  it("签名随内容与更新时间变化", () => {
    const chunks = [
      makeChunk({ role: "user", text: "问题" }),
      makeChunk({ role: "model", text: "回答" }),
    ]
    const base = parseAIStudioHistoryOutline(buildPayload(chunks))!
    const updated = parseAIStudioHistoryOutline(buildPayload(chunks, { updatedAt: "1790062477" }))!
    const extended = parseAIStudioHistoryOutline(
      buildPayload([...chunks, makeChunk({ role: "user", text: "追加" })]),
    )!

    expect(base.signature).not.toBe(updated.signature)
    expect(base.signature).not.toBe(extended.signature)
    // 相同输入签名稳定
    expect(parseAIStudioHistoryOutline(buildPayload(chunks))!.signature).toBe(base.signature)
  })
})
