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
import { CHATGPT_CONFIG } from "~adapters/chatgpt-config"

const CID = "aaaaaaaa-1111-4000-8000-000000000001"

interface ApiExportInternals {
  collectApiExportMessageSnapshots(
    collector?: null,
  ): Promise<{ role: string; content: string }[] | null>
  isUserConversationPage(): boolean
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

// apiFirstExport：接口导出优先的会话页允许导出流程跳过 DOM 历史预加载；
// 接口失败且未预加载时 prepare 返回 null，让导出流程补做预加载后重试
describe("ChatGPT api-first export preload skip", () => {
  interface PrepareInternals {
    isUserConversationPage(): boolean
    canSkipExportHistoryPreload(): boolean
    clearExportSnapshot(): void
    collectApiExportMessageSnapshots(): Promise<null>
    findCurrentResponseContainer(): null
    getScrollContainer(): null
    readVisibleExportMessageSnapshots(
      container: unknown,
    ): { role: "user"; content: string; turnKey: string; order: number }[]
    mountExportSnapshot(messages: unknown[]): void
  }

  const createPrepareAdapter = () => {
    const adapter = new ChatGPTAdapter()
    adapter.applyMergedConfig(CHATGPT_CONFIG)
    return adapter as unknown as PrepareInternals & {
      prepareConversationExport: ChatGPTAdapter["prepareConversationExport"]
    }
  }

  // 接口导出与 DOM 世代无关：新老版本的会话页都允许跳过预加载，非会话页不允许
  it("allows skipping preload on conversation pages regardless of DOM generation", () => {
    const adapter = createPrepareAdapter()
    adapter.isUserConversationPage = () => true
    expect(adapter.canSkipExportHistoryPreload()).toBe(true)

    adapter.isUserConversationPage = () => false
    expect(adapter.canSkipExportHistoryPreload()).toBe(false)
  })

  it("returns null from prepare when api export fails without a DOM history preload", async () => {
    const adapter = createPrepareAdapter()
    adapter.clearExportSnapshot = () => {}
    adapter.collectApiExportMessageSnapshots = async () => null
    let domFallbackCalled = false
    adapter.readVisibleExportMessageSnapshots = () => {
      domFallbackCalled = true
      return []
    }

    const result = await adapter.prepareConversationExport({
      conversationId: CID,
      format: "markdown",
      includeThoughts: true,
      packaging: "markdown",
      domHistoryPreloaded: false,
    })

    expect(result).toBeNull()
    expect(domFallbackCalled).toBe(false)
  })

  it("falls back to scroll collection once the DOM history has been preloaded", async () => {
    const adapter = createPrepareAdapter()
    adapter.clearExportSnapshot = () => {}
    adapter.collectApiExportMessageSnapshots = async () => null
    adapter.findCurrentResponseContainer = () => null
    adapter.getScrollContainer = () => null
    adapter.readVisibleExportMessageSnapshots = () => [
      { role: "user", content: "你好", turnKey: "t1", order: 1 },
    ]
    adapter.mountExportSnapshot = () => {}

    const result = await adapter.prepareConversationExport({
      conversationId: CID,
      format: "markdown",
      includeThoughts: true,
      packaging: "markdown",
      domHistoryPreloaded: true,
    })

    expect(result).toEqual({ count: 1 })
  })
})
