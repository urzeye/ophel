import { describe, expect, it, vi } from "vitest"

// 适配器模块加载链读取全局 document；node 环境提供最小 stub
vi.hoisted(() => {
  const globalRef = globalThis as Record<string, unknown>
  globalRef.document ??= { documentElement: {}, body: {} }
})

vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

vi.mock("~utils/export-assets", () => ({
  createExportAssetCollector: vi.fn(() => ({ assets: [], usedPaths: new Set() })),
  formatExportFileAttachments: vi.fn(() => ""),
  formatExportImageAttachments: vi.fn(() => ""),
  isDownloadableExportAssetUrl: vi.fn(() => false),
  normalizeExportAssetUrl: vi.fn(() => null),
}))

vi.mock("~utils/exporter", () => ({
  htmlToMarkdown: vi.fn(() => ""),
}))

vi.mock("~utils/i18n", () => ({
  t: (key: string) => key,
}))

import { AIStudioAdapter } from "~adapters/aistudio"
import { ClaudeAdapter } from "~adapters/claude"
import { GrokAdapter } from "~adapters/grok"

// apiFirstExport：这些虚拟滚动站点的接口导出路径能拿到全量历史，
// 导出流程应跳过 DOM 历史预加载（不再先滚到顶部）
describe("apiFirstExport on virtual-scroll sites", () => {
  it.each([
    ["Claude", () => new ClaudeAdapter()],
    ["AI Studio", () => new AIStudioAdapter()],
    ["Grok", () => new GrokAdapter()],
  ])("%s declares apiFirstExport so export skips DOM history preload", (_name, create) => {
    expect(create().canSkipExportHistoryPreload()).toBe(true)
  })
})

// Grok 的 prepare 历史上恒返回 null；apiFirstExport 下 manager 会把 null 当成
// 「接口失败」补做预加载并重试。接口成功时必须返回非空标记，避免每次导出都
// 白跑一次预加载 + 重复拉取接口
describe("Grok prepareConversationExport api marker", () => {
  interface GrokPrepareInternals {
    collectGrokShareUserAttachments(): Promise<null>
    fetchApiExportData(): Promise<unknown>
  }

  const createAdapter = () => {
    const adapter = new GrokAdapter()
    const internals = adapter as unknown as GrokPrepareInternals & {
      prepareConversationExport: GrokAdapter["prepareConversationExport"]
    }
    internals.collectGrokShareUserAttachments = async () => null
    return internals
  }

  const context = {
    conversationId: "session-1",
    format: "markdown" as const,
    includeThoughts: true,
    packaging: "markdown" as const,
    domHistoryPreloaded: false,
  }

  it("returns a non-null marker when the api export data is fetched", async () => {
    const adapter = createAdapter()
    adapter.fetchApiExportData = async () => ({ sessionId: "session-1", messages: [] })

    expect(await adapter.prepareConversationExport(context)).toEqual({ usedApiExport: true })
  })

  it("returns null when the api export fails so the manager preloads and retries", async () => {
    const adapter = createAdapter()
    adapter.fetchApiExportData = async () => null

    expect(await adapter.prepareConversationExport(context)).toBeNull()
  })
})
