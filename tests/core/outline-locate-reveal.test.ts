import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OutlineItem, SiteAdapter } from "~adapters/base"
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

// 标题从 H3 起始的文档：minLevel = 3，H3 的 relativeLevel 为 1，
// 原始 level 与 relativeLevel 不一致，用于覆盖定位临时展开后的恢复逻辑
const deepLevelItems: OutlineItem[] = [
  { level: 0, text: "User question", isUserQuery: true, element: null },
  { level: 3, text: "Heading Three", element: null },
  { level: 4, text: "Heading Four", element: null },
]

const createManager = () => {
  const adapter = {
    getSiteId: () => "gemini",
    getSessionId: () => "sess-1",
    getOutlineSources: () => [],
    extractOutlineForSource: () => deepLevelItems,
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
  return manager
}

describe("OutlineManager locate reveal restore", () => {
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

  it.each([0, 1, 2])(
    "restores collapsed state after clearForceVisible when slider level is %i",
    (level) => {
      const manager = createManager()
      manager.setLevel(level)

      const tree = manager.getState().tree
      const userQueryNode = tree[0]
      const h3Node = userQueryNode.children[0]
      expect(h3Node.text).toBe("Heading Three")

      // 定位前的初始状态：两级均折叠（子节点原始 level 超出滑块层级）
      expect(userQueryNode.collapsed).toBe(true)
      expect(h3Node.collapsed).toBe(true)

      // 定位临时展开：父级被展开并标记 forceVisible
      manager.revealNode(h3Node.index)
      expect(userQueryNode.collapsed).toBe(false)
      expect(userQueryNode.forceVisible).toBe(true)
      expect(h3Node.forceVisible).toBe(true)

      // 高亮结束后恢复：必须与定位前的折叠状态一致
      manager.clearForceVisible()
      expect(userQueryNode.forceVisible).toBe(false)
      expect(h3Node.forceVisible).toBe(false)
      expect(userQueryNode.collapsed).toBe(true)
      expect(h3Node.collapsed).toBe(true)
    },
  )

  it("keeps nodes expanded when children remain within the slider level", () => {
    const manager = createManager()
    manager.setLevel(4)

    const tree = manager.getState().tree
    const userQueryNode = tree[0]
    const h3Node = userQueryNode.children[0]

    // 滑块层级 4 时所有子节点都在显示范围内，初始即展开
    expect(userQueryNode.collapsed).toBe(false)
    expect(h3Node.collapsed).toBe(false)

    manager.revealNode(h3Node.index)
    manager.clearForceVisible()

    // 恢复后仍保持展开，不误折叠
    expect(userQueryNode.collapsed).toBe(false)
    expect(h3Node.collapsed).toBe(false)
  })
})
