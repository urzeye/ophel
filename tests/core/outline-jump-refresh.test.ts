import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OutlineItem, SiteAdapter } from "~adapters/base"
import { DEFAULT_SETTINGS } from "~constants/default-settings"
import { OutlineManager } from "~core/outline-manager"
import { EVENT_OUTLINE_JUMP_COMPLETED } from "~utils/messaging"

vi.mock("~stores/bookmarks-store", () => ({
  useBookmarkStore: {
    subscribe: () => () => {},
    getState: () => ({
      getBookmarksBySession: () => [],
      removeBookmark: vi.fn(),
      updateBookmark: vi.fn(),
    }),
  },
}))

vi.mock("~stores/settings-store", () => ({
  useSettingsStore: {
    getState: () => ({
      settings: {
        features: {
          outline: {
            showWordCount: false,
          },
        },
      },
    }),
  },
}))

vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))
vi.mock("~utils/toast", () => ({ showToast: vi.fn() }))

const buildAdapter = (items: OutlineItem[], usesVirtualOutlineFill = true): SiteAdapter =>
  ({
    getSiteId: () => "deepseek",
    getSessionId: () => "sess-1",
    usesVirtualOutlineFill: () => usesVirtualOutlineFill,
    getOutlineSources: () => [
      { id: "conversation", kind: "conversation", label: "对话", available: true },
    ],
    extractOutlineForSource: () => items,
    getScrollContainer: () => null,
    getOutlineScrollContainer: () => null,
    resolveOutlineTarget: async () => null,
    scrollToOutlineSourceTarget: () => {},
    supportsDynamicOutlineSources: () => false,
    getOutlineSourcesSignature: () => "",
    isGenerating: () => false,
    usesPeriodicOutlineRefreshFallback: () => false,
    getObserveTarget: () => null,
  }) as unknown as SiteAdapter

const sendJumpCompleted = (manager: OutlineManager) => {
  ;(manager as unknown as { handleMessage(event: unknown): void }).handleMessage({
    data: { type: EVENT_OUTLINE_JUMP_COMPLETED },
    source: window,
  })
}

describe("OutlineManager jump-completed refresh gating", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { pathname: "/a/chat/s/sess-1" },
    })
    vi.stubGlobal("document", { body: {} })
    class MockMutationObserver {
      observe = vi.fn()
      disconnect = vi.fn()
      takeRecords = vi.fn(() => [])
    }
    vi.stubGlobal("MutationObserver", MockMutationObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("ignores jump-completed events when every node is mounted or has a cached position", () => {
    vi.useFakeTimers()
    const items: OutlineItem[] = [
      { level: 0, text: "提问一", isUserQuery: true, element: {} as Element },
      { level: 2, text: "回答标题", element: {} as Element },
    ]
    const manager = new OutlineManager(buildAdapter(items), {
      ...DEFAULT_SETTINGS.features.outline,
      showUserQueries: true,
    })
    manager.setActive(true)
    manager.refresh(undefined, true)

    expect(manager.hasPositionlessOutlineNodes()).toBe(false)

    const refreshSpy = vi.spyOn(manager as unknown as { refresh(): void }, "refresh")
    sendJumpCompleted(manager)
    vi.advanceTimersByTime(2000)
    expect(refreshSpy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it("schedules staggered refreshes on jump-completed when the tree has positionless fill nodes", () => {
    // 虚拟列表换挂载是异步的，单次过早 refresh 会抽到旧 DOM 且因文本未变
    // 静默跳过，必须错峰多次探测（与 handleUrlChange 同理）
    vi.useFakeTimers()
    // 虚拟滚动 + 外部数据回填：条目既未挂载也没有缓存滚动位置
    const items: OutlineItem[] = [
      { level: 0, text: "提问一", isUserQuery: true, element: null },
      { level: 2, text: "回答标题", element: null },
    ]
    const manager = new OutlineManager(buildAdapter(items), {
      ...DEFAULT_SETTINGS.features.outline,
      showUserQueries: true,
    })
    manager.setActive(true)
    manager.refresh(undefined, true)

    expect(manager.hasPositionlessOutlineNodes()).toBe(true)

    const refreshSpy = vi.spyOn(manager as unknown as { refresh(): void }, "refresh")
    sendJumpCompleted(manager)
    expect(refreshSpy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1300)
    expect(refreshSpy.mock.calls.length).toBeGreaterThanOrEqual(3)
    vi.useRealTimers()
  })

  it("ignores positionless nodes on sites that do not declare virtual outline fill", () => {
    vi.useFakeTimers()
    // ChatGPT/Claude/豆包等站点的缓存回填条目同样 element: null，
    // 但未声明 traits.virtualOutlineFill，跳转后不得改变其原有行为
    const items: OutlineItem[] = [
      { level: 0, text: "提问一", isUserQuery: true, element: null },
      { level: 2, text: "回答标题", element: null },
    ]
    const manager = new OutlineManager(buildAdapter(items, false), {
      ...DEFAULT_SETTINGS.features.outline,
      showUserQueries: true,
    })
    manager.setActive(true)
    manager.refresh(undefined, true)

    expect(manager.hasPositionlessOutlineNodes()).toBe(false)

    const refreshSpy = vi.spyOn(manager as unknown as { refresh(): void }, "refresh")
    sendJumpCompleted(manager)
    vi.advanceTimersByTime(2000)
    expect(refreshSpy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
