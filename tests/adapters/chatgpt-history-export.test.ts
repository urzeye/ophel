import { describe, expect, it } from "vitest"

import { parseChatGPTHistoryExport } from "~adapters/chatgpt-history-export"

const SESSION_ID = "aaaaaaaa-1111-4000-8000-000000000001"

const msg = (
  id: string,
  role: string,
  turnExchangeId: string,
  text: string,
  contentType = "text",
  options: { attachments?: unknown[]; extraParts?: unknown[]; imageGenTitle?: string } = {},
) => ({
  id,
  author: { role, name: null, metadata: {} },
  create_time: 0,
  content: {
    content_type: contentType,
    parts: [...(text ? [text] : []), ...(options.extraParts ?? [])],
  },
  status: "finished_successfully",
  metadata: {
    turn_exchange_id: turnExchangeId,
    ...(options.attachments ? { attachments: options.attachments } : {}),
    ...(options.imageGenTitle ? { image_gen_title: options.imageGenTitle } : {}),
  },
})

const pagePayload = (
  messages: { id: string }[],
  options: {
    hasPreviousPage?: boolean
    hasNextPage?: boolean
    currentNode?: string | null
    sessionId?: string
  } = {},
) => ({
  conversation_id: options.sessionId ?? SESSION_ID,
  current_node:
    options.currentNode === null
      ? undefined
      : options.currentNode ?? messages[messages.length - 1]?.id,
  page_info: {
    start_cursor: messages[0]?.id,
    end_cursor: messages[messages.length - 1]?.id,
    has_previous_page: options.hasPreviousPage ?? false,
    has_next_page: options.hasNextPage ?? false,
  },
  messages,
})

// 旧页（历史起点）
const olderPage = () =>
  pagePayload(
    [
      msg("u1", "user", "te1", "第一个问题"),
      msg("a1", "assistant", "te1", "## 答复一\n正文"),
      msg("u2", "user", "te2", "第二个问题"),
      msg("a2", "assistant", "te2", "答复二"),
    ],
    { hasPreviousPage: false, hasNextPage: true },
  )

// 新页（首页抓取，含 current_node）
const newerPage = () =>
  pagePayload(
    [
      msg("u3", "user", "te3", "第三个问题"),
      msg("a3-thoughts", "assistant", "te3", "思考", "thoughts"),
      msg("tool3", "tool", "te3", "工具输出"),
      msg("a3", "assistant", "te3", "答复三"),
      msg("a3-recap", "assistant", "te3", "回顾", "reasoning_recap"),
    ],
    { hasPreviousPage: true, hasNextPage: false, currentNode: "a3-recap" },
  )

describe("parseChatGPTHistoryExport", () => {
  it("exports all pages in chronological order, skipping tool/thoughts messages", () => {
    const data = parseChatGPTHistoryExport([newerPage(), olderPage()])
    expect(data).not.toBeNull()
    expect(data!.sessionId).toBe(SESSION_ID)
    expect(data!.messages.map(({ role, text }) => ({ role, text }))).toEqual([
      { role: "user", text: "第一个问题" },
      { role: "assistant", text: "## 答复一\n正文" },
      { role: "user", text: "第二个问题" },
      { role: "assistant", text: "答复二" },
      { role: "user", text: "第三个问题" },
      { role: "assistant", text: "答复三" },
    ])
  })

  it("allows missing assistant message (generation interrupted)", () => {
    const page = pagePayload([msg("u1", "user", "te1", "问题")], { currentNode: "u1" })
    const data = parseChatGPTHistoryExport([page])
    expect(data).not.toBeNull()
    expect(data!.messages.map(({ role, text }) => ({ role, text }))).toEqual([
      { role: "user", text: "问题" },
    ])
  })

  it("returns null when the oldest page still has a previous page (truncated history)", () => {
    const truncatedOlder = olderPage()
    truncatedOlder.page_info.has_previous_page = true
    expect(parseChatGPTHistoryExport([newerPage(), truncatedOlder])).toBeNull()
  })

  it("returns null on duplicated message ids across pages (cursor chain broken)", () => {
    // 翻页游标失效时服务端会拉回与首页重复的页
    const duplicated = newerPage()
    duplicated.page_info.has_previous_page = false
    expect(parseChatGPTHistoryExport([newerPage(), duplicated])).toBeNull()
  })

  it("returns null when current_node is missing on the first page", () => {
    expect(parseChatGPTHistoryExport([newerPage(), olderPage()].slice(1))).not.toBeNull()
    const noCurrentNode = pagePayload([msg("u1", "user", "te1", "问题")], { currentNode: null })
    expect(parseChatGPTHistoryExport([noCurrentNode])).toBeNull()
  })

  it("returns null when a turn has no user message", () => {
    const orphan = pagePayload([msg("a1", "assistant", "te1", "孤儿回复")])
    expect(parseChatGPTHistoryExport([orphan])).toBeNull()
  })

  it("returns null when pages come from different conversations", () => {
    const foreign = olderPage()
    foreign.conversation_id = "bbbbbbbb-2222-4000-8000-000000000002"
    expect(parseChatGPTHistoryExport([newerPage(), foreign])).toBeNull()
  })

  it("returns null for empty input", () => {
    expect(parseChatGPTHistoryExport([])).toBeNull()
    expect(parseChatGPTHistoryExport([null])).toBeNull()
  })

  it("keeps user-uploaded attachments, including attachment-only queries", () => {
    const page = pagePayload([
      msg("u1", "user", "te1", "", "text", {
        attachments: [
          { id: "file-abc", name: "需求.pdf", mime_type: "application/pdf", size: 1024 },
          { id: "file-img", name: "截图.png", mime_type: "image/png", size: 2048 },
        ],
      }),
      msg("a1", "assistant", "te1", "收到附件"),
    ])
    const data = parseChatGPTHistoryExport([page])
    expect(data).not.toBeNull()
    expect(data!.messages[0]).toEqual({
      role: "user",
      text: "",
      attachments: [
        { id: "file-abc", name: "需求.pdf", mimeType: "application/pdf" },
        { id: "file-img", name: "截图.png", mimeType: "image/png" },
      ],
      imageAssetPointers: [],
    })
  })

  it("collects image asset pointers from multimodal parts (generated images)", () => {
    const page = pagePayload([
      msg("u1", "user", "te1", "画一只猫"),
      msg("a1", "assistant", "te1", "给你画好了", "multimodal_text", {
        extraParts: [
          {
            content_type: "image_asset_pointer",
            asset_pointer: "sediment://file_xyz",
            mime_type: "image/png",
          },
        ],
      }),
    ])
    const data = parseChatGPTHistoryExport([page])
    expect(data).not.toBeNull()
    expect(data!.messages[1]).toEqual({
      role: "assistant",
      text: "给你画好了",
      attachments: [],
      imageAssetPointers: [{ pointer: "sediment://file_xyz", mimeType: "image/png", alt: "" }],
    })
  })

  it("collects generated images from tool messages when the turn has no assistant text", () => {
    const page = pagePayload([
      msg("u1", "user", "te1", "画一张夕阳图", "multimodal_text"),
      msg("a1", "assistant", "te1", "", "model_editable_context"),
      msg("a2", "assistant", "te1", "", "code"),
      msg("t1", "tool", "te1", "", "multimodal_text", {
        extraParts: [
          {
            content_type: "image_asset_pointer",
            asset_pointer: "sediment://file_gen",
            mime_type: "image/png",
          },
        ],
        imageGenTitle: "夕阳下的樱花街景",
      }),
    ])
    const data = parseChatGPTHistoryExport([page])
    expect(data).not.toBeNull()
    expect(data!.messages).toHaveLength(2)
    expect(data!.messages[1]).toEqual({
      role: "assistant",
      text: "",
      attachments: [],
      imageAssetPointers: [
        { pointer: "sediment://file_gen", mimeType: "image/png", alt: "夕阳下的樱花街景" },
      ],
    })
  })

  // 老版页面的响应：没有 metadata.turn_exchange_id，且开头多一条 system 消息
  const legacyMsg = (id: string, role: string, text: string) => ({
    id,
    author: { role, name: null, metadata: {} },
    create_time: 0,
    content: { content_type: "text", parts: text ? [text] : [] },
    status: "finished_successfully",
    metadata: {},
  })

  it("groups legacy responses without turn_exchange_id by user message boundaries", () => {
    const page = pagePayload([
      legacyMsg("sys", "system", "系统提示"),
      legacyMsg("u1", "user", "第一个问题"),
      legacyMsg("a1", "assistant", "答复一"),
      legacyMsg("u2", "user", "第二个问题"),
      legacyMsg("a2", "assistant", "答复二"),
    ])
    const data = parseChatGPTHistoryExport([page])
    expect(data).not.toBeNull()
    expect(data!.messages.map(({ role, text }) => ({ role, text }))).toEqual([
      { role: "user", text: "第一个问题" },
      { role: "assistant", text: "答复一" },
      { role: "user", text: "第二个问题" },
      { role: "assistant", text: "答复二" },
    ])
  })

  it("returns null for legacy responses whose first non-system message is not a user turn", () => {
    const page = pagePayload([
      legacyMsg("sys", "system", "系统提示"),
      legacyMsg("a1", "assistant", "孤儿回复"),
      legacyMsg("u1", "user", "问题"),
    ])
    expect(parseChatGPTHistoryExport([page])).toBeNull()
  })
})
