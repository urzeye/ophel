import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OutlineItem, OutlineSource, SiteAdapter } from "~adapters/base"
import { DEFAULT_SETTINGS } from "~constants/default-settings"
import { OutlineManager } from "~core/outline-manager"
import type { Settings } from "~utils/storage"

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

describe("OutlineManager document source and user query handling", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { pathname: "/app/123" },
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

  it("resets expandLevel to 6 when switching to document source with level 0", () => {
    const sources: OutlineSource[] = [
      { id: "conversation", kind: "conversation", label: "对话", available: true },
      { id: "document", kind: "document", label: "文档", available: true },
    ]

    const conversationItems: OutlineItem[] = [
      { level: 0, text: "User question", isUserQuery: true, element: null },
      { level: 2, text: "Response Heading", element: null },
    ]

    const documentItems: OutlineItem[] = [
      { level: 1, text: "Document Title", element: null },
      { level: 2, text: "Document Section", element: null },
    ]

    const adapter = {
      getSiteId: () => "gemini",
      getSessionId: () => "sess-1",
      getOutlineSources: () => sources,
      extractOutlineForSource: (sourceId: string) => {
        return sourceId === "document" ? documentItems : conversationItems
      },
      getScrollContainer: () => null,
      getOutlineScrollContainer: () => null,
      resolveOutlineTarget: async () => null,
      scrollToOutlineSourceTarget: () => {},
      supportsDynamicOutlineSources: () => false,
      getOutlineSourcesSignature: () => "",
      isGenerating: () => false,
      usesPeriodicOutlineRefreshFallback: () => false,
      getObserveTarget: () => null,
    } as unknown as SiteAdapter

    const settings: Settings["features"]["outline"] = {
      ...DEFAULT_SETTINGS.features.outline,
      showUserQueries: true,
    }

    const manager = new OutlineManager(adapter, settings)
    manager.setActive(true)
    manager.refresh(undefined, true)

    // 1. 在对话源下，将层级设置为 0（仅显示用户提问）
    manager.setLevel(0)
    manager.refresh(undefined, true)
    expect(manager.getState().expandLevel).toBe(0)
    expect(manager.getState().displayLevel).toBe(0)
    expect(manager.getState().minRelativeLevel).toBe(0)

    // 2. 切换到文档源
    manager.setActiveSource("document")
    manager.refresh(undefined, true)

    // 3. 文档源没有用户提问节点，expandLevel 应自动重置为 6，避免大纲全空
    const state = manager.getState()
    expect(state.activeSourceId).toBe("document")
    expect(state.expandLevel).toBe(6)
    expect(state.displayLevel).toBe(6)
    expect(state.minRelativeLevel).toBe(1)
    expect(state.includeUserQueries).toBe(false)
  })

  it("clamps minRelativeLevel and minDisplayLevel to 1 when current source has no user queries", () => {
    const sources: OutlineSource[] = [
      { id: "document", kind: "document", label: "文档", available: true },
    ]

    const documentItems: OutlineItem[] = [
      { level: 1, text: "Document Title", element: null },
      { level: 2, text: "Document Section", element: null },
    ]

    const adapter = {
      getSiteId: () => "gemini",
      getSessionId: () => "sess-1",
      getOutlineSources: () => sources,
      extractOutlineForSource: () => documentItems,
      getScrollContainer: () => null,
      getOutlineScrollContainer: () => null,
      resolveOutlineTarget: async () => null,
      scrollToOutlineSourceTarget: () => {},
      supportsDynamicOutlineSources: () => false,
      getOutlineSourcesSignature: () => "",
      isGenerating: () => false,
      usesPeriodicOutlineRefreshFallback: () => false,
      getObserveTarget: () => null,
    } as unknown as SiteAdapter

    const settings: Settings["features"]["outline"] = {
      ...DEFAULT_SETTINGS.features.outline,
      showUserQueries: true,
    }

    const manager = new OutlineManager(adapter, settings)
    manager.setActive(true)
    manager.refresh(undefined, true)

    const state = manager.getState()
    expect(state.minRelativeLevel).toBe(1)
    expect(state.includeUserQueries).toBe(false)
    expect(state.tree.length).toBeGreaterThan(0)
    // 树中根节点为 level 1，由于 minRelativeLevel 是 1，relativeLevel 为 1 的根节点正常显示
    expect(state.tree[0].relativeLevel).toBe(1)
  })
})
