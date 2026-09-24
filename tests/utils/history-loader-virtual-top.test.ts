import { afterEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"
import { loadHistoryUntil } from "~utils/history-loader"

function stubWindow() {
  vi.stubGlobal("window", {
    dispatchEvent: vi.fn(),
    postMessage: vi.fn(),
    getComputedStyle: () => ({ flexDirection: "column" }),
  })
  vi.stubGlobal("document", { documentElement: { dataset: {} } })
}

describe("loadHistoryUntil virtual top", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns before the head is mounted only for sites that are not virtual-outline fills", async () => {
    stubWindow()
    const waitForVirtualListEdge = vi.fn(async () => false)
    const container = {
      scrollTop: 3000,
      scrollHeight: 20000,
      clientHeight: 800,
      scrollTo(options: { top: number }) {
        this.scrollTop = options.top
      },
    }
    const adapter = {
      needsHistoryLazyLoad: () => false,
      usesVirtualOutlineFill: () => false,
      getScrollContainer: () => container,
      waitForVirtualListEdge,
    } as unknown as SiteAdapter

    const result = await loadHistoryUntil({ adapter, loadAll: true, allowShortCircuit: true })

    expect(result.success).toBe(true)
    expect(result.silent).toBe(true)
    expect(waitForVirtualListEdge).not.toHaveBeenCalled()
  })

  it("does not report success for Claude or DeepSeek until the first message is mounted", async () => {
    stubWindow()
    const container = {
      scrollTop: 8000,
      scrollHeight: 20000,
      clientHeight: 800,
      scrollTo(options: { top: number }) {
        this.scrollTop = options.top
      },
    }
    const adapter = {
      needsHistoryLazyLoad: () => false,
      usesVirtualOutlineFill: () => true,
      getScrollContainer: () => container,
      waitForVirtualListEdge: vi.fn(async () => false),
    } as unknown as SiteAdapter

    const result = await loadHistoryUntil({ adapter, loadAll: true, allowShortCircuit: true })

    expect(adapter.waitForVirtualListEdge).toHaveBeenCalledWith("start", undefined)
    expect(result.success).toBe(false)
    expect(container.scrollTop).toBe(0)
  })
})
