import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AnchorData, SiteAdapter } from "~adapters/base"
import { ReadingHistoryManager } from "~core/reading-history"
import type { ReadingPosition } from "~stores/reading-history-store"
import type { Settings } from "~utils/storage"

const positions = new Map<string, ReadingPosition>()

vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))
vi.mock("~utils/history-loader", () => ({
  loadHistoryUntil: vi.fn(async () => ({
    success: true,
    finalHeight: 8000,
    heightAdded: 0,
    previousScrollTop: 0,
    silent: true,
  })),
}))
vi.mock("~utils/scroll-helper", () => ({
  smartScrollTo: vi.fn(async (_adapter: SiteAdapter | null, position: number) => ({
    success: true,
    currentScrollTop: position,
  })),
}))

vi.mock("~stores/reading-history-store", () => ({
  useReadingHistoryStore: {
    getState: () => ({ _hasHydrated: true }),
    subscribe: () => () => {},
    setState: vi.fn(),
  },
  getReadingHistoryStore: () => ({
    getPosition: (key: string) => positions.get(key),
    claimPosition: (_legacy: string, key: string) => positions.get(key),
    savePosition: (key: string, data: ReadingPosition) => {
      positions.set(key, data)
    },
    cleanup: vi.fn(),
  }),
}))

import { loadHistoryUntil } from "~utils/history-loader"
import { smartScrollTo } from "~utils/scroll-helper"

interface AdapterOptions {
  /** 站点级 traits.virtualOutlineFill */
  virtualSite: boolean
  /** 当前会话是否真的虚拟化（短对话为 false） */
  conversationVirtual?: boolean
  virtualAnchor?: AnchorData | null
  restoreVirtualResult?: boolean
}

function createAdapter(options: AdapterOptions): SiteAdapter {
  const container = {
    scrollTop: 4200,
    scrollHeight: 9000,
    clientHeight: 800,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const conversationVirtual = options.conversationVirtual ?? options.virtualSite
  return {
    getScrollContainer: () => container,
    getSessionId: () => "session-1",
    isUserConversationPage: () => true,
    getSiteInstanceKey: () => "deepseek",
    getSiteId: () => "deepseek",
    canClaimLegacySiteData: () => false,
    usesVirtualOutlineFill: () => options.virtualSite,
    needsHistoryLazyLoad: () => false,
    isVirtualScrollConversation: () => conversationVirtual,
    getVirtualAnchorElement: vi.fn(() => options.virtualAnchor ?? null),
    restoreVirtualAnchor: vi.fn(async () => options.restoreVirtualResult ?? false),
    restoreScroll: vi.fn(() => {
      container.scrollTop = 12
      return true
    }),
    getVisibleAnchorElement: vi.fn(() => ({ type: "index", index: 2, offset: 10 })),
  } as unknown as SiteAdapter
}

const settings = {
  persistence: true,
  autoRestore: true,
} as Settings["readingHistory"]

describe("virtual reading history restore", () => {
  beforeEach(() => {
    positions.clear()
    vi.mocked(smartScrollTo).mockClear()
    vi.mocked(loadHistoryUntil).mockClear()
    vi.stubGlobal("requestAnimationFrame", () => 1)
    vi.stubGlobal("cancelAnimationFrame", () => {})
    vi.stubGlobal("window", {
      scrollY: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    })
    vi.stubGlobal("document", {
      documentElement: {
        dataset: {},
        setAttribute: vi.fn(),
        getAttribute: vi.fn(() => null),
        removeAttribute: vi.fn(),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("does not restore a virtual conversation from legacy pixel/index data", async () => {
    const adapter = createAdapter({ virtualSite: true })
    positions.set("v1:deepseek:session-1", {
      top: 4200,
      ts: 1,
      type: "index",
      index: 2,
      offset: 10,
    })
    const manager = new ReadingHistoryManager(adapter, settings)

    await expect(manager.restoreProgress()).resolves.toBe(false)
    expect(adapter.restoreScroll).not.toHaveBeenCalled()
    expect(adapter.restoreVirtualAnchor).not.toHaveBeenCalled()
    expect(loadHistoryUntil).not.toHaveBeenCalled()
    expect(smartScrollTo).not.toHaveBeenCalled()
    manager.stopRecording()
  })

  it("saves a stable virtual-row anchor instead of a window index", () => {
    const adapter = createAdapter({
      virtualSite: true,
      virtualAnchor: { type: "virtual-row", rowKey: 47, offset: 10, textSignature: "你好" },
    })
    const manager = new ReadingHistoryManager(adapter, settings)
    manager.startRecording({ initialCooldownMs: 0 })

    const saved = (manager as unknown as { saveProgress(): boolean }).saveProgress()

    expect(saved).toBe(true)
    expect(adapter.getVirtualAnchorElement).toHaveBeenCalled()
    expect(adapter.getVisibleAnchorElement).not.toHaveBeenCalled()
    const stored = [...positions.values()][0]
    expect(stored.top).toBe(4200)
    expect(stored.type).toBe("virtual-row")
    expect(stored.rowKey).toBe(47)
    manager.stopRecording()
  })

  it("saves a normal content anchor for non-virtual conversations on virtual sites", () => {
    const adapter = createAdapter({ virtualSite: true, conversationVirtual: false })
    const manager = new ReadingHistoryManager(adapter, settings)
    manager.startRecording({ initialCooldownMs: 0 })

    const saved = (manager as unknown as { saveProgress(): boolean }).saveProgress()

    expect(saved).toBe(true)
    expect(adapter.getVirtualAnchorElement).not.toHaveBeenCalled()
    expect(adapter.getVisibleAnchorElement).toHaveBeenCalled()
    const stored = [...positions.values()][0]
    expect(stored.type).toBe("index")
    manager.stopRecording()
  })

  it("restores a virtual conversation through the virtual anchor without pixel fallback", async () => {
    const adapter = createAdapter({ virtualSite: true, restoreVirtualResult: true })
    positions.set("v1:deepseek:session-1", {
      top: 4200,
      ts: 1,
      type: "virtual-row",
      rowKey: 47,
      offset: 10,
      textSignature: "你好",
    })
    const manager = new ReadingHistoryManager(adapter, settings)

    const restored = await manager.restoreProgress()

    expect(restored).toBe(true)
    expect(adapter.restoreVirtualAnchor).toHaveBeenCalledWith(
      { type: "virtual-row", rowKey: 47, offset: 10, textSignature: "你好" },
      expect.anything(),
    )
    expect(adapter.restoreScroll).not.toHaveBeenCalled()
    expect(loadHistoryUntil).not.toHaveBeenCalled()
    expect(smartScrollTo).not.toHaveBeenCalled()
    manager.stopRecording()
  })

  it("stays put when the virtual anchor cannot be restored", async () => {
    const adapter = createAdapter({ virtualSite: true, restoreVirtualResult: false })
    positions.set("v1:deepseek:session-1", {
      top: 4200,
      ts: 1,
      type: "virtual-row",
      rowKey: 47,
      offset: 10,
    })
    const manager = new ReadingHistoryManager(adapter, settings)

    const restored = await manager.restoreProgress()

    expect(restored).toBe(false)
    expect(adapter.restoreVirtualAnchor).toHaveBeenCalled()
    expect(loadHistoryUntil).not.toHaveBeenCalled()
    expect(smartScrollTo).not.toHaveBeenCalled()
    manager.stopRecording()
  })

  it("restores non-virtual conversations on virtual sites through the content anchor", async () => {
    const adapter = createAdapter({ virtualSite: true, conversationVirtual: false })
    positions.set("v1:deepseek:session-1", {
      top: 4200,
      ts: 1,
      type: "index",
      index: 2,
      offset: 10,
    })
    const manager = new ReadingHistoryManager(adapter, settings)

    const restored = await manager.restoreProgress()

    expect(restored).toBe(true)
    expect(adapter.restoreScroll).toHaveBeenCalled()
    expect(adapter.restoreVirtualAnchor).not.toHaveBeenCalled()
    expect(smartScrollTo).not.toHaveBeenCalled()
    manager.stopRecording()
  })

  it("still uses the content anchor on ordinary sites", async () => {
    const adapter = createAdapter({ virtualSite: false })
    positions.set("v1:deepseek:session-1", {
      top: 4200,
      ts: 1,
      type: "index",
      index: 2,
      offset: 10,
    })
    const manager = new ReadingHistoryManager(adapter, settings)

    const restored = await manager.restoreProgress()

    expect(restored).toBe(true)
    expect(adapter.restoreScroll).toHaveBeenCalled()
    expect(smartScrollTo).not.toHaveBeenCalled()
    manager.stopRecording()
  })
})
