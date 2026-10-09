import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("~utils/export-assets", () => ({
  createExportAssetCollector: vi.fn(() => ({ assets: [], usedPaths: new Set() })),
  escapeMarkdownLinkText: vi.fn((value: string) => value),
  formatExportFileAttachments: vi.fn(() => ""),
  formatExportImageMarkdown: vi.fn(() => ""),
  isDownloadableExportAssetUrl: vi.fn(() => false),
  normalizeExportAssetUrl: vi.fn(() => null),
}))

vi.mock("~utils/exporter", () => ({
  htmlToMarkdown: vi.fn(() => ""),
}))

vi.mock("~stores/settings-store", () => ({ useSettingsStore: { getState: vi.fn() } }))
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: { query: vi.fn(() => []), walkShadowRoots: vi.fn() },
}))
vi.mock("~utils/font", () => ({
  INTER_LOCAL_FONT_FACE: "",
  getPlatformFontFamily: () => "sans-serif",
}))
vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))

// node 环境提供最小 DOM 全局，chatgpt.ts 模块加载与 instanceof 判断依赖它们
vi.hoisted(() => {
  const globalRef = globalThis as Record<string, unknown>
  globalRef.document ??= { documentElement: {}, body: {} }
  globalRef.HTMLElement ??= class HTMLElement {}
  globalRef.Element ??= class Element {}
})

import { ChatGPTAdapter } from "~adapters/chatgpt"

const CID = "aaaaaaaa-1111-4000-8000-000000000001"

interface ApiExportInternals {
  collectApiExportMessageSnapshots(
    collector?: null,
  ): Promise<{ role: string; content: string }[] | null>
  isUserConversationPage(): boolean
  isChatGPTTurnKeyConversation(): boolean
  getSessionId(): string | null
  fetchConversationApiPage(cid: string, cursor?: string): Promise<unknown | null>
}

const pagePayload = (messageIds: string[], hasPreviousPage: boolean) => ({
  conversation_id: CID,
  current_node: messageIds[messageIds.length - 1],
  page_info: {
    start_cursor: messageIds[0],
    end_cursor: messageIds[messageIds.length - 1],
    has_previous_page: hasPreviousPage,
    has_next_page: false,
  },
  messages: messageIds.map((id) => ({
    id,
    author: { role: "user", name: null, metadata: {} },
    create_time: 0,
    content: { content_type: "text", parts: [`消息 ${id}`] },
    status: "finished_successfully",
    metadata: { turn_exchange_id: `te-${id}` },
  })),
})

const createAdapter = (fetchPage: ApiExportInternals["fetchConversationApiPage"]) => {
  const adapter = new ChatGPTAdapter() as unknown as ApiExportInternals
  adapter.isUserConversationPage = () => true
  adapter.isChatGPTTurnKeyConversation = () => true
  adapter.getSessionId = () => CID
  adapter.fetchConversationApiPage = fetchPage
  return adapter
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("ChatGPT api export pagination", () => {
  it("returns snapshots when the first page already reaches the history start", async () => {
    const adapter = createAdapter(async () => pagePayload(["m1", "m2"], false))

    const snapshots = await adapter.collectApiExportMessageSnapshots()
    expect(snapshots).not.toBeNull()
    expect(snapshots).toHaveLength(2)
    expect(snapshots![0].content).toContain("消息 m1")
  })

  // 回归：翻页达到上限仍 has_previous_page=true 时历史不完整，
  // 必须返回 null 回退滚动收集，而不是用截断的分页结果导出
  it("returns null when the page cap is hit with earlier history still remaining", async () => {
    let calls = 0
    const adapter = createAdapter(async () => {
      calls += 1
      return pagePayload([`m-${calls}`], true)
    })

    const snapshots = await adapter.collectApiExportMessageSnapshots()
    expect(snapshots).toBeNull()
    expect(calls).toBe(50)
  })
})
