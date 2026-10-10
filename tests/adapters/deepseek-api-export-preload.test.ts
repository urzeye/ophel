import { describe, expect, it, vi } from "vitest"

import { DeepSeekAdapter } from "~adapters/deepseek"

// base.ts 在模块顶层实例化 DOMToolkit（依赖 document）；node 环境下打桩
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

// node 环境没有 HTMLElement；prepareConversationExport 的 DOM 回退路径有 instanceof 窄化
class FakeHTMLElement {}
vi.stubGlobal("HTMLElement", FakeHTMLElement)

// apiFirstExport：接口导出优先，导出流程跳过 DOM 历史预加载（不再滚顶）；
// 接口失败且未预加载时 prepare 返回 null，让导出流程补做预加载后重试，
// 避免在只挂载了部分历史的虚拟列表上滚动采集得到不完整导出
describe("DeepSeek api-first export preload skip", () => {
  interface PrepareInternals {
    canSkipExportHistoryPreload(): boolean
    clearExportSnapshot(): void
    collectShareExportMessageSnapshots(): Promise<null>
    collectApiExportMessageSnapshots(): Promise<null>
    getScrollContainer(): HTMLElement | null
    collectExportMessageSnapshots(
      container: HTMLElement,
    ): Promise<{ role: string; content: string }[]>
    mountExportSnapshot(messages: unknown[]): void
  }

  const createPrepareAdapter = () => {
    const adapter = new DeepSeekAdapter()
    const internals = adapter as unknown as PrepareInternals & {
      prepareConversationExport: DeepSeekAdapter["prepareConversationExport"]
    }
    internals.clearExportSnapshot = () => {}
    internals.collectShareExportMessageSnapshots = async () => null
    internals.collectApiExportMessageSnapshots = async () => null
    return internals
  }

  const context = (domHistoryPreloaded: boolean) => ({
    conversationId: "session-1",
    format: "markdown" as const,
    includeThoughts: true,
    packaging: "markdown" as const,
    domHistoryPreloaded,
  })

  it("declares apiFirstExport so the export flow skips DOM history preload", () => {
    const adapter = new DeepSeekAdapter()
    expect(adapter.canSkipExportHistoryPreload()).toBe(true)
  })

  it("returns null from prepare when api export fails without a DOM history preload", async () => {
    const adapter = createPrepareAdapter()
    let domFallbackCalled = false
    adapter.collectExportMessageSnapshots = async () => {
      domFallbackCalled = true
      return []
    }

    const result = await adapter.prepareConversationExport(context(false))

    expect(result).toBeNull()
    expect(domFallbackCalled).toBe(false)
  })

  it("falls back to scroll collection once the DOM history has been preloaded", async () => {
    const adapter = createPrepareAdapter()
    adapter.getScrollContainer = () => new FakeHTMLElement() as HTMLElement
    adapter.collectExportMessageSnapshots = async () => [{ role: "user", content: "你好" }]
    adapter.mountExportSnapshot = () => {}

    const result = await adapter.prepareConversationExport(context(true))

    expect(result).toEqual({ count: 1 })
  })
})
