import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"
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

function createAdapter(virtual: boolean): SiteAdapter {
  const container = {
    scrollTop: 4200,
    scrollHeight: 9000,
    clientHeight: 800,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  return {
    getScrollContainer: () => container,
    getSessionId: () => "session-1",
    isUserConversationPage: () => true,
    getSiteInstanceKey: () => "deepseek",
    getSiteId: () => "deepseek",
    canClaimLegacySiteData: () => false,
    usesVirtualOutlineFill: () => virtual,
    needsHistoryLazyLoad: () => false,
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

  it("does not auto-restore virtual conversations from a saved scroll position", async () => {
    const adapter = createAdapter(true)
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
    expect(loadHistoryUntil).not.toHaveBeenCalled()
    expect(smartScrollTo).not.toHaveBeenCalled()
    manager.stopRecording()
  })

  it("does not save a window index for virtual conversations", () => {
    const adapter = createAdapter(true)
    const manager = new ReadingHistoryManager(adapter, settings)
    manager.startRecording({ initialCooldownMs: 0 })

    const saved = (manager as unknown as { saveProgress(): boolean }).saveProgress()

    expect(saved).toBe(true)
    expect(adapter.getVisibleAnchorElement).not.toHaveBeenCalled()
    const stored = [...positions.values()][0]
    expect(stored.top).toBe(4200)
    expect(stored.type).toBeUndefined()
    manager.stopRecording()
  })

  it("still uses the content anchor on ordinary sites", async () => {
    const adapter = createAdapter(false)
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
