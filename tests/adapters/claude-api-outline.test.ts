import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ExportLifecycleContext, OutlineItem } from "~adapters/base"
import { SiteAdapter } from "~adapters/base"
import { ClaudeAdapter } from "~adapters/claude"
import type { ExportMessage } from "~utils/exporter"
import { t } from "~utils/i18n"
import {
  parseClaudeHistoryOutline,
  type ClaudeHistoryOutlineData,
} from "~adapters/claude-history-outline"

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
    origin: "https://claude.ai",
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
  maybeRefreshApiOutline: () => void
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

  it("flags force-refetch when a DOM-owned heading changes irreconcilably", () => {
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

    // 挂载行的 < > 版本切换不经过生成态：DOM 归属条目文本不可调和也必须触发
    state.updateClaudeOutlineCache([
      { level: 2, text: "另一个标题", element: fakeElementInRow(1), isUserQuery: false },
    ])
    expect(state.apiOutlineForceRefetch).toBe(true)
  })

  it("tolerates prefix-only text differences as render or truncation artifacts", () => {
    const adapter = new ClaudeAdapter()
    const state = internals(adapter)
    state.rebuildApiOutlineEntries(
      buildData([
        { uuid: "u1", parent: ZERO_UUID, sender: "human", text: "问题" },
        { uuid: "a1", parent: "u1", sender: "assistant", text: "## 分支标题" },
      ]),
    )

    // DOM 文本更短（截断差异）：互为前缀，不触发
    state.updateClaudeOutlineCache([
      { level: 2, text: "分支", element: fakeElementInRow(1), isUserQuery: false },
    ])
    expect(state.apiOutlineForceRefetch).toBe(false)

    // DOM 文本更长（KaTeX 重复等渲染差异）：互为前缀，不触发
    state.updateClaudeOutlineCache([
      { level: 2, text: "分支标题分支标题", element: fakeElementInRow(1), isUserQuery: false },
    ])
    expect(state.apiOutlineForceRefetch).toBe(false)
  })

  it("purges DOM-owned zombie entries when the branch is truncated", () => {
    const adapter = new ClaudeAdapter()
    const state = internals(adapter)
    state.rebuildApiOutlineEntries(
      buildData([
        { uuid: "u1", parent: ZERO_UUID, sender: "human", text: "问题一" },
        { uuid: "a1", parent: "u1", sender: "assistant", text: "## 标题一" },
        { uuid: "u2", parent: "a1", sender: "human", text: "问题二" },
        { uuid: "a2", parent: "u2", sender: "assistant", text: "## 标题二" },
      ]),
    )
    // 模拟行挂载后条目转为 DOM 归属（不再计入 apiOutlineEntryIds）
    state.updateClaudeOutlineCache([
      { level: 2, text: "标题二", element: fakeElementInRow(3), isUserQuery: false },
    ])
    expect(state.apiOutlineEntryIds.has("claude-message:3:heading:0")).toBe(false)

    // 编辑问题一后分支截断为 2 条：旧分支的 DOM 归属条目必须清除
    state.rebuildApiOutlineEntries(
      buildData([
        { uuid: "u1", parent: ZERO_UUID, sender: "human", text: "问题一" },
        { uuid: "a1", parent: "u1", sender: "assistant", text: "## 新标题一" },
      ]),
    )
    const cache = state.outlineItemCache
    expect(cache.has("claude-message:2:user")).toBe(false)
    expect(cache.has("claude-message:3:heading:0")).toBe(false)
    expect(cache.get("claude-message:1:heading:0")!.text).toBe("新标题一")
  })

  it("replaces irreconcilable DOM-owned entries with api values on rebuild", () => {
    const adapter = new ClaudeAdapter()
    const state = internals(adapter)
    state.rebuildApiOutlineEntries(
      buildData([
        { uuid: "u1", parent: ZERO_UUID, sender: "human", text: "问题" },
        { uuid: "a1", parent: "u1", sender: "assistant", text: "## 旧标题\n正文" },
      ]),
    )
    // 行挂载后 DOM 精化（带精确字数）
    state.updateClaudeOutlineCache([
      {
        level: 2,
        text: "旧标题",
        element: fakeElementInRow(1),
        isUserQuery: false,
        wordCount: 999,
      },
    ])

    // 重新生成后同位置出现不可调和的新标题：以接口为准替换并转回 API 归属
    state.rebuildApiOutlineEntries(
      buildData([
        { uuid: "u1", parent: ZERO_UUID, sender: "human", text: "问题" },
        { uuid: "a1", parent: "u1", sender: "assistant", text: "## 新标题\n新正文" },
      ]),
    )
    const entry = state.outlineItemCache.get("claude-message:1:heading:0")!
    expect(entry.text).toBe("新标题")
    expect(entry.wordCount).not.toBe(999)
    expect(state.apiOutlineEntryIds.has("claude-message:1:heading:0")).toBe(true)
  })
})

describe("ClaudeAdapter API outline refresh gate", () => {
  beforeEach(() => {
    // isClaudeVirtualConversation / isGenerating / buildNativeApiHeaders 的访问面
    vi.stubGlobal("document", {
      querySelector: () => null,
      querySelectorAll: () => [],
      cookie: "",
    })
    vi.stubGlobal("localStorage", { getItem: () => null })
    vi.stubGlobal("window", {
      location: {
        href: "https://claude.ai/chat/b56ad8d3-7271-432f-8651-75dc609c7f08",
        pathname: "/chat/b56ad8d3-7271-432f-8651-75dc609c7f08",
        origin: "https://claude.ai",
      },
      postMessage: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    // stubGlobal 会覆盖文件顶部的 window 桩，后续用例需要时自行补回
    vi.stubGlobal("window", {
      location: {
        href: "https://claude.ai/chat/b56ad8d3-7271-432f-8651-75dc609c7f08",
        pathname: "/chat/b56ad8d3-7271-432f-8651-75dc609c7f08",
        origin: "https://claude.ai",
      },
    })
  })

  const outlinePayload = {
    uuid: "b56ad8d3-7271-432f-8651-75dc609c7f08",
    updated_at: "2026-05-25T04:00:00.000000Z",
    current_leaf_message_uuid: "a1",
    chat_messages: [
      {
        uuid: "u1",
        parent_message_uuid: ZERO_UUID,
        sender: "human",
        index: 0,
        content: [{ type: "text", text: "问题" }],
      },
      {
        uuid: "a1",
        parent_message_uuid: "u1",
        sender: "assistant",
        index: 1,
        content: [{ type: "text", text: "## 标题\n回复" }],
      },
    ],
  }

  it("does not fetch the api outline on non-virtual conversation pages", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const adapter = new ClaudeAdapter()
    internals(adapter).getActiveOrganizationId = async () => "org-1"

    internals(adapter).maybeRefreshApiOutline()
    await Promise.resolve()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("fetches the api outline on virtual conversation pages", async () => {
    // 最小虚拟列表桩：virtualSizer + 一行 virtualRow（getClaudeVirtualRows 过滤 closest 链）
    class FakeHTMLElement {}
    vi.stubGlobal("HTMLElement", FakeHTMLElement)
    const virtualSizer = {}
    const row = Object.assign(new FakeHTMLElement(), {
      getAttribute: (name: string) =>
        name === "data-rs-index" || name === "data-index" ? "1" : null,
      closest: (selector: string) => (selector === "[data-rocksteady-sizer]" ? virtualSizer : null),
      querySelector: () => null,
    })
    vi.stubGlobal("document", {
      querySelector: (selector: string) =>
        selector === "[data-rocksteady-sizer]" ? virtualSizer : null,
      querySelectorAll: (selector: string) =>
        selector === "[data-rs-index][data-index]" ? [row] : [],
      cookie: "",
    })
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => outlinePayload }))
    vi.stubGlobal("fetch", fetchSpy)
    const adapter = new ClaudeAdapter()
    internals(adapter).getActiveOrganizationId = async () => "org-1"

    internals(adapter).maybeRefreshApiOutline()
    await vi.waitFor(() => {
      expect(internals(adapter).outlineItemCache.size).toBeGreaterThan(0)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(internals(adapter).outlineItemCache.has("claude-message:1:heading:0")).toBe(true)
  })

  it("falls back to base query search when the cached query row is not mounted", () => {
    const adapter = new ClaudeAdapter()
    internals(adapter).rebuildApiOutlineEntries(
      buildData([
        { uuid: "u1", parent: ZERO_UUID, sender: "human", text: "第一个问题" },
        { uuid: "a1", parent: "u1", sender: "assistant", text: "回复" },
      ]),
    )
    const superSpy = vi.spyOn(SiteAdapter.prototype, "findUserQueryElement").mockReturnValue(null)

    const result = adapter.findUserQueryElement(1, "第一个问题")

    // 缓存命中但行未挂载：必须回退基类搜索，而不是直接判失
    expect(superSpy).toHaveBeenCalledWith(1, "第一个问题")
    expect(result).toBeNull()
    superSpy.mockRestore()
  })

  it("skips the cache path when the cached query text does not match", () => {
    const adapter = new ClaudeAdapter()
    // 中间夹一条纯图片提问（无文本，不占大纲条目），缓存序号与调用序号可能错位
    internals(adapter).rebuildApiOutlineEntries(
      buildData([
        { uuid: "u1", parent: ZERO_UUID, sender: "human", text: "第一个问题" },
        { uuid: "a1", parent: "u1", sender: "assistant", text: "回复一" },
        { uuid: "u2", parent: "a1", sender: "human", text: "" },
        { uuid: "a2", parent: "u2", sender: "assistant", text: "回复二" },
        { uuid: "u3", parent: "a2", sender: "human", text: "第三个问题" },
        { uuid: "a3", parent: "u3", sender: "assistant", text: "回复三" },
      ]),
    )
    const mountLookup = vi.spyOn(
      adapter as unknown as { findClaudeOutlineTargetInMountedRow: () => Element | null },
      "findClaudeOutlineTargetInMountedRow",
    )
    const superSpy = vi.spyOn(SiteAdapter.prototype, "findUserQueryElement").mockReturnValue(null)

    // 序号 1 的缓存条目是「第一个问题」，与目标文本不可调和：
    // 必须跳过缓存路径，绝不允许按错位条目定位到错误提问
    const result = adapter.findUserQueryElement(1, "第三个问题")

    expect(mountLookup).not.toHaveBeenCalled()
    expect(superSpy).toHaveBeenCalledWith(1, "第三个问题")
    expect(result).toBeNull()
    superSpy.mockRestore()
    mountLookup.mockRestore()
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
        origin: "https://claude.ai",
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

  it("extracts create_file documents instead of vetoing tool conversations", async () => {
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
            { type: "text", text: "文档如下：" },
            {
              type: "tool_use",
              id: "t1",
              name: "create_file",
              input: { path: "/mnt/user-data/outputs/canvas.html", file_text: "<html>v1</html>" },
            },
            {
              type: "tool_result",
              name: "present_files",
              content: [
                {
                  type: "local_resource",
                  file_path: "/mnt/user-data/outputs/canvas.html",
                  name: "robot canvas",
                  mime_type: "text/html",
                },
              ],
            },
          ],
        },
      ],
    })

    const messages = await internals(adapter).collectApiExportMessages(exportContext(false))
    expect(messages).toEqual([
      { role: "user", content: "问题" },
      {
        role: "assistant",
        content: "文档如下：\n\n### robot canvas\n\n~~~html\n<html>v1</html>\n~~~",
      },
    ])
  })

  it("formats markdown documents inline following DOM parity rules", async () => {
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
            {
              type: "tool_use",
              id: "t1",
              name: "create_file",
              input: { path: "/mnt/o/doc.md", file_text: "# 标题\n正文" },
            },
            {
              type: "tool_result",
              name: "present_files",
              content: [
                {
                  type: "local_resource",
                  file_path: "/mnt/o/doc.md",
                  name: "散文",
                  mime_type: "text/markdown",
                },
              ],
            },
          ],
        },
      ],
    })

    const messages = await internals(adapter).collectApiExportMessages(exportContext(false))
    // markdown 文档自带一级标题时原样内联（与 formatClaudeDocumentInlineContent 同规则）
    expect(messages).toEqual([
      { role: "user", content: "问题" },
      { role: "assistant", content: "# 标题\n正文" },
    ])
  })

  it("renders binary documents without file_text as artifact placeholders", async () => {
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
            { type: "text", text: "做好了：" },
            {
              type: "tool_use",
              id: "t1",
              name: "create_file",
              input: { path: "/mnt/o/report.docx" },
            },
            {
              type: "tool_result",
              name: "present_files",
              content: [
                {
                  type: "local_resource",
                  file_path: "/mnt/o/report.docx",
                  name: "报告",
                  mime_type:
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                },
              ],
            },
          ],
        },
      ],
    })

    const messages = await internals(adapter).collectApiExportMessages(exportContext(false))
    expect(messages).toEqual([
      { role: "user", content: "问题" },
      { role: "assistant", content: "做好了：\n\n[Artifact: 报告]" },
    ])
  })

  it("formats user uploaded images and text attachments", async () => {
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
          content: [{ type: "text", text: "看看这些" }],
          attachments: [{ file_name: "笔记.md", extracted_content: "# 笔记" }],
          files: [
            {
              file_kind: "image",
              file_uuid: "img-1",
              file_name: "头像.gif",
              preview_url: "/api/org/files/img-1/preview",
            },
          ],
        },
        {
          uuid: "a1",
          parent_message_uuid: "u1",
          sender: "assistant",
          content: [{ type: "text", text: "收到" }],
        },
      ],
    })

    const messages = await internals(adapter).collectApiExportMessages(exportContext(false))
    expect(messages).toEqual([
      {
        role: "user",
        content: `![头像.gif](https://claude.ai/api/org/files/img-1/preview)\n\n${t("exportAttachmentsLabel")}:\n- 笔记.md\n\n看看这些`,
      },
      { role: "assistant", content: "收到" },
    ])
  })

  it("degrades non-image user files to attachment links", async () => {
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
          content: [{ type: "text", text: "看这个文件" }],
          files: [
            {
              file_kind: "pdf",
              file_uuid: "doc-1",
              file_name: "报告.pdf",
              preview_url: "/api/org/files/doc-1/preview",
            },
            {
              file_kind: "image",
              file_uuid: "img-2",
              file_name: "无地址.gif",
            },
          ],
        },
        {
          uuid: "a1",
          parent_message_uuid: "u1",
          sender: "assistant",
          content: [{ type: "text", text: "收到" }],
        },
      ],
    })

    const messages = await internals(adapter).collectApiExportMessages(exportContext(false))
    expect(messages).toEqual([
      {
        role: "user",
        content: `${t("exportAttachmentsLabel")}:\n- [报告.pdf](/api/org/files/doc-1/preview)\n- 无地址.gif\n\n看这个文件`,
      },
      { role: "assistant", content: "收到" },
    ])
  })

  it("returns null when history cannot be proven complete", async () => {
    const adapter = new ClaudeAdapter()
    stubOrg(adapter)
    stubFetchPayload({
      uuid: "b56ad8d3-7271-432f-8651-75dc609c7f08",
      updated_at: "2026-05-25T04:00:00.000000Z",
      current_leaf_message_uuid: "a9",
      chat_messages: [
        {
          uuid: "u9",
          parent_message_uuid: "missing-parent",
          sender: "human",
          content: [{ type: "text", text: "问题" }],
        },
        {
          uuid: "a9",
          parent_message_uuid: "u9",
          sender: "assistant",
          content: [{ type: "text", text: "回复正文" }],
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

  it("collects image and document assets into the zip bundle", async () => {
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
          content: [{ type: "text", text: "看图" }],
          files: [
            {
              file_kind: "image",
              file_uuid: "img-1",
              file_name: "头像.gif",
              preview_url: "/api/org/files/img-1/preview",
            },
          ],
        },
        {
          uuid: "a1",
          parent_message_uuid: "u1",
          sender: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "create_file",
              input: { path: "/mnt/o/doc.md", file_text: "# 散文\n正文" },
            },
            {
              type: "tool_result",
              name: "present_files",
              content: [
                {
                  type: "local_resource",
                  file_path: "/mnt/o/doc.md",
                  name: "散文",
                  mime_type: "text/markdown",
                },
              ],
            },
          ],
        },
      ],
    })

    const zipContext = {
      format: "markdown",
      packaging: "zip",
      includeThoughts: false,
    } as unknown as ExportLifecycleContext
    await adapter.prepareConversationExport(zipContext)
    const bundle = await adapter.extractExportBundle(zipContext)

    expect(bundle).not.toBeNull()
    expect(bundle!.assets).toHaveLength(2)
    const image = bundle!.assets!.find((asset) => asset.kind === "image")
    expect(image?.sourceUrl).toBe("https://claude.ai/api/org/files/img-1/preview")
    const document = bundle!.assets!.find((asset) => asset.kind === "document")
    expect(document?.content).toBe("# 散文\n正文")
    // 正文引用资产相对路径
    expect(bundle!.messages[0].content).toContain(image?.relativePath)
    expect(bundle!.messages[1].content).toContain(document?.relativePath)
  })
})
