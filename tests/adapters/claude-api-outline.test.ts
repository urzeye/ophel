import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ExportLifecycleContext, OutlineItem } from "~adapters/base"
import { ClaudeAdapter } from "~adapters/claude"
import type { ExportMessage } from "~utils/exporter"
import {
  parseClaudeHistoryOutline,
  type ClaudeHistoryOutlineData,
} from "~utils/claude-history-outline"

// base.ts 在模块顶层实例化 DOMToolkit（依赖 document）；node 环境下打桩
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

// ensureClaudeOutlineCacheSession 经 getSessionId 读 location
vi.stubGlobal("window", {
  location: {
    href: "https://claude.ai/chat/b56ad8d3-7271-432f-8651-75dc609c7f08",
    pathname: "/chat/b56ad8d3-7271-432f-8651-75dc609c7f08",
  },
})

interface CacheEntry {
  id: string
  messageIndex: number
  orderInMessage: number
  level: number
  text: string
  isUserQuery: boolean
  isTruncated?: boolean
  wordCount?: number
}

type AdapterInternals = {
  outlineItemCache: Map<string, CacheEntry>
  apiOutlineEntryIds: Set<string>
  apiOutlineForceRefetch: boolean
  exportApiMessages: ExportMessage[] | null
  getActiveOrganizationId: () => Promise<string | null>
  rebuildApiOutlineEntries: (data: ClaudeHistoryOutlineData) => void
  updateClaudeOutlineCache: (items: OutlineItem[]) => void
  collectApiExportMessages: (context: ExportLifecycleContext) => Promise<ExportMessage[] | null>
  mergeCachedClaudeOutlineItems: (
    currentItems: OutlineItem[],
    maxLevel: number,
    includeUserQueries: boolean,
    showWordCount: boolean,
  ) => OutlineItem[]
}

const ZERO_UUID = "00000000-0000-4000-8000-000000000000"

const buildData = (
  messages: {
    uuid: string
    parent: string
    sender: "human" | "assistant"
    text: string
  }[],
): ClaudeHistoryOutlineData =>
  parseClaudeHistoryOutline({
    uuid: "b56ad8d3-7271-432f-8651-75dc609c7f08",
    updated_at: "2026-05-25T04:00:00.000000Z",
    current_leaf_message_uuid: messages[messages.length - 1]?.uuid,
    chat_messages: messages.map((message, index) => ({
      uuid: message.uuid,
      parent_message_uuid: message.parent,
      sender: message.sender,
      index,
      content: [{ type: "text", text: message.text }],
    })),
  })!

const internals = (adapter: ClaudeAdapter): AdapterInternals =>
  adapter as unknown as AdapterInternals

// DOM 侧挂载行的最小桩：virtualRow closest 链 + data-rs-index
const fakeRow = (index: number) => ({
  getAttribute: (name: string) =>
    name === "data-rs-index" || name === "data-index" ? String(index) : null,
  closest: () => null,
})
const fakeElementInRow = (index: number) =>
  ({ closest: () => fakeRow(index) }) as unknown as Element

describe("ClaudeAdapter API outline entries", () => {
  it("rebuilds cache entries with the DOM-compatible id scheme", () => {
    const adapter = new ClaudeAdapter()
    const data = buildData([
      { uuid: "u1", parent: ZERO_UUID, sender: "human", text: "第一个问题" },
      { uuid: "a1", parent: "u1", sender: "assistant", text: "## 第一节\n正文\n## 第二节" },
      { uuid: "u2", parent: "a1", sender: "human", text: "第二个问题" },
      { uuid: "a2", parent: "u2", sender: "assistant", text: "没有标题" },
    ])

    internals(adapter).rebuildApiOutlineEntries(data)
    const cache = internals(adapter).outlineItemCache

    expect(cache.get("claude-message:0:user")).toMatchObject({
      messageIndex: 0,
      orderInMessage: 0,
      level: 0,
      text: "第一个问题",
      isUserQuery: true,
    })
    // 提问条目的字数取后续回复的纯文本长度
    expect(cache.get("claude-message:0:user")!.wordCount).toBeGreaterThan(0)
    // 标题 id 中序号为 0 基，orderInMessage 为 1 基
    expect(cache.get("claude-message:1:heading:0")).toMatchObject({
      orderInMessage: 1,
      level: 2,
      text: "第一节",
    })
    expect(cache.get("claude-message:1:heading:1")).toMatchObject({
      orderInMessage: 2,
      level: 2,
      text: "第二节",
    })
    expect(cache.has("claude-message:3:heading:0")).toBe(false)

    // 归并输出按 messageIndex + orderInMessage 排序
    const merged = internals(adapter).mergeCachedClaudeOutlineItems([], 6, true, false)
    expect(merged.map((item) => item.id)).toEqual([
      "claude-message:0:user",
      "claude-message:1:heading:0",
      "claude-message:1:heading:1",
      "claude-message:2:user",
    ])
  })

  it("does not overwrite DOM-refined entries on rebuild", () => {
    const adapter = new ClaudeAdapter()
    const state = internals(adapter)
    // 先重建一次建立缓存会话，再模拟行挂载经 DOM 扫描精化条目
    state.rebuildApiOutlineEntries(
      buildData([
        { uuid: "u1", parent: ZERO_UUID, sender: "human", text: "问题" },
        { uuid: "a1", parent: "u1", sender: "assistant", text: "## 第一节\n正文" },
      ]),
    )
    state.updateClaudeOutlineCache([
      {
        level: 2,
        text: "第一节",
        element: fakeElementInRow(1),
        isUserQuery: false,
        wordCount: 999,
      },
    ])

    state.rebuildApiOutlineEntries(
      buildData([
        { uuid: "u1", parent: ZERO_UUID, sender: "human", text: "问题" },
        { uuid: "a1", parent: "u1", sender: "assistant", text: "## 第一节\n正文" },
      ]),
    )

    // DOM 精化后的条目转为 DOM 来源：不被 API 估算值覆盖，也不再计入 API 条目集
    expect(state.outlineItemCache.get("claude-message:1:heading:0")!.wordCount).toBe(999)
    expect(state.apiOutlineEntryIds.has("claude-message:1:heading:0")).toBe(false)
    expect(state.apiOutlineEntryIds.has("claude-message:0:user")).toBe(true)
  })

  it("replaces previous API entries on the next rebuild", () => {
    const adapter = new ClaudeAdapter()
    const state = internals(adapter)
    state.rebuildApiOutlineEntries(
      buildData([
        { uuid: "u1", parent: ZERO_UUID, sender: "human", text: "问题" },
        { uuid: "a1", parent: "u1", sender: "assistant", text: "## 旧标题" },
      ]),
    )
    state.rebuildApiOutlineEntries(
      buildData([
        { uuid: "u1", parent: ZERO_UUID, sender: "human", text: "问题" },
        { uuid: "a1", parent: "u1", sender: "assistant", text: "## 新标题" },
        { uuid: "u2", parent: "a1", sender: "human", text: "追问" },
      ]),
    )

    const cache = state.outlineItemCache
    expect(cache.get("claude-message:1:heading:0")!.text).toBe("新标题")
    expect(cache.has("claude-message:2:user")).toBe(true)
  })

  it("flags force-refetch when a mounted heading drifts from the API entry", () => {
    const adapter = new ClaudeAdapter()
    const state = internals(adapter)
    state.rebuildApiOutlineEntries(
      buildData([
        { uuid: "u1", parent: ZERO_UUID, sender: "human", text: "问题" },
        { uuid: "a1", parent: "u1", sender: "assistant", text: "## 旧分支标题" },
      ]),
    )

    // 分支切换后挂载行标题变化（条目仍是 API 归属）：触发强制重拉
    state.updateClaudeOutlineCache([
      { level: 2, text: "新分支标题", element: fakeElementInRow(1), isUserQuery: false },
    ])
    expect(state.apiOutlineForceRefetch).toBe(true)
  })

  it("does not flag force-refetch for matching or DOM-owned entries", () => {
    const adapter = new ClaudeAdapter()
    const state = internals(adapter)
    state.rebuildApiOutlineEntries(
      buildData([
        { uuid: "u1", parent: ZERO_UUID, sender: "human", text: "问题" },
        { uuid: "a1", parent: "u1", sender: "assistant", text: "## 分支标题" },
      ]),
    )

    // 文本一致：不触发（条目同时被 DOM 精化、转为 DOM 来源）
    state.updateClaudeOutlineCache([
      { level: 2, text: "分支标题", element: fakeElementInRow(1), isUserQuery: false },
    ])
    expect(state.apiOutlineForceRefetch).toBe(false)

    // 已转 DOM 来源的条目之后文本再变也不触发（DOM 自身即真值，无需重拉）
    state.updateClaudeOutlineCache([
      { level: 2, text: "另一个标题", element: fakeElementInRow(1), isUserQuery: false },
    ])
    expect(state.apiOutlineForceRefetch).toBe(false)
  })
})

describe("ClaudeAdapter API export", () => {
  beforeEach(() => {
    // prepareConversationExport 的 removeClaudeExportSnapshot 会访问 document；
    // buildNativeApiHeaders 经 getCookieValue 读 document.cookie
    vi.stubGlobal("document", {
      querySelector: () => null,
      querySelectorAll: () => [],
      cookie: "",
    })
    // buildNativeApiHeaders 的 anthropic-* 头读取会访问 localStorage
    vi.stubGlobal("localStorage", { getItem: () => null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    // stubGlobal 会覆盖文件顶部的 window 桩，后续用例需要时自行补回
    vi.stubGlobal("window", {
      location: {
        href: "https://claude.ai/chat/b56ad8d3-7271-432f-8651-75dc609c7f08",
        pathname: "/chat/b56ad8d3-7271-432f-8651-75dc609c7f08",
      },
    })
  })

  const exportContext = (includeThoughts: boolean) =>
    ({ format: "markdown", includeThoughts }) as unknown as ExportLifecycleContext

  const stubFetchPayload = (payload: unknown) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => payload })),
    )
  }

  const stubOrg = (adapter: ClaudeAdapter) => {
    internals(adapter).getActiveOrganizationId = async () => "org-1"
  }

  it("collects export messages from the conversations api", async () => {
    const adapter = new ClaudeAdapter()
    stubOrg(adapter)
    stubFetchPayload({
      uuid: "b56ad8d3-7271-432f-8651-75dc609c7f08",
      updated_at: "2026-05-25T04:00:00.000000Z",
      current_leaf_message_uuid: "a1",
      chat_messages: [
        {
          uuid: "u1",
          parent_message_uuid: ZERO_UUID,
          sender: "human",
          content: [{ type: "text", text: "问题" }],
        },
        {
          uuid: "a1",
          parent_message_uuid: "u1",
          sender: "assistant",
          content: [
            { type: "thinking", thinking: "思考过程", summaries: [{ summary: "摘要" }] },
            { type: "text", text: "回复正文" },
          ],
        },
      ],
    })

    const messages = await internals(adapter).collectApiExportMessages(exportContext(true))
    expect(messages).toEqual([
      { role: "user", content: "问题" },
      {
        role: "assistant",
        content: "> [Thoughts]\n> **摘要**\n>\n> 思考过程\n\n回复正文",
      },
    ])

    // includeThoughts=false 时不带思考链
    const withoutThoughts = await internals(adapter).collectApiExportMessages(exportContext(false))
    expect(withoutThoughts).toEqual([
      { role: "user", content: "问题" },
      { role: "assistant", content: "回复正文" },
    ])
  })

  it("returns null when the api payload is not exportable", async () => {
    const adapter = new ClaudeAdapter()
    stubOrg(adapter)
    stubFetchPayload({
      uuid: "b56ad8d3-7271-432f-8651-75dc609c7f08",
      updated_at: "2026-05-25T04:00:00.000000Z",
      current_leaf_message_uuid: "a1",
      chat_messages: [
        {
          uuid: "u1",
          parent_message_uuid: ZERO_UUID,
          sender: "human",
          content: [{ type: "text", text: "问题" }],
        },
        {
          uuid: "a1",
          parent_message_uuid: "u1",
          sender: "assistant",
          content: [
            { type: "tool_use", name: "create_file" },
            { type: "text", text: "回复正文" },
          ],
        },
      ],
    })

    expect(await internals(adapter).collectApiExportMessages(exportContext(false))).toBeNull()
  })

  it("prepareConversationExport short-circuits snapshot collection on api success", async () => {
    const adapter = new ClaudeAdapter()
    stubOrg(adapter)
    stubFetchPayload({
      uuid: "b56ad8d3-7271-432f-8651-75dc609c7f08",
      updated_at: "2026-05-25T04:00:00.000000Z",
      current_leaf_message_uuid: "a1",
      chat_messages: [
        {
          uuid: "u1",
          parent_message_uuid: ZERO_UUID,
          sender: "human",
          content: [{ type: "text", text: "问题" }],
        },
        {
          uuid: "a1",
          parent_message_uuid: "u1",
          sender: "assistant",
          content: [{ type: "text", text: "回复正文" }],
        },
      ],
    })

    const state = (await adapter.prepareConversationExport(exportContext(false))) as {
      usedApiExport?: boolean
    }
    expect(state.usedApiExport).toBe(true)
    expect(internals(adapter).exportApiMessages).toEqual([
      { role: "user", content: "问题" },
      { role: "assistant", content: "回复正文" },
    ])

    const messages = await adapter.extractExportMessages(exportContext(false))
    expect(messages).toHaveLength(2)
    // bundle 路径在接口数据源下不提供资产
    expect(await adapter.extractExportBundle(exportContext(false))).toBeNull()
  })
})
