import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OutlineItem, OutlineSource, SiteAdapter } from "~adapters/base"
import { DEFAULT_SETTINGS } from "~constants/default-settings"
import { OutlineManager } from "~core/outline-manager"
import type { Settings } from "~utils/storage"

const mockBookmarks: Array<{
  id: string
  signature: string
  title: string
  level: number
  scrollTop: number
}> = []

vi.mock("~stores/bookmarks-store", () => ({
  useBookmarkStore: {
    subscribe: () => () => {},
    getState: () => ({
      getBookmarksBySession: () => mockBookmarks,
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

const welcomeItems: OutlineItem[] = [
  { level: 1, text: "Welcome Heading", element: null },
  { level: 2, text: "Suggested Prompt", element: null },
]

const documentItems: OutlineItem[] = [{ level: 1, text: "Document Title", element: null }]

const createAdapter = (
  isNewConversation: boolean,
  withDocumentSource = false,
  hasUserMessages = false,
) => {
  const sources: OutlineSource[] = [
    { id: "conversation", kind: "conversation", label: "对话", available: true },
  ]
  if (withDocumentSource) {
    sources.push({ id: "document", kind: "document", label: "文档", available: true })
  }

  const extractOutlineForSource = vi.fn((sourceId: string) =>
    sourceId === "document" ? documentItems : welcomeItems,
  )

  const adapter = {
    getSiteId: () => "mock-site",
    getSessionId: () => "sess-new",
    isNewConversation: () => isNewConversation,
    hasUserMessagesInDom: () => hasUserMessages,
    getOutlineSources: () => sources,
    extractOutlineForSource,
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

  return { adapter, extractOutlineForSource }
}

const createManager = (adapter: SiteAdapter) => {
  const settings: Settings["features"]["outline"] = {
    ...DEFAULT_SETTINGS.features.outline,
    showUserQueries: true,
  }
  const manager = new OutlineManager(adapter, settings)
  manager.setActive(true)
  return manager
}

describe("OutlineManager new conversation suppression", () => {
  beforeEach(() => {
    mockBookmarks.length = 0
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { pathname: "/" },
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

  it("returns an empty tree on new conversation pages without extracting", () => {
    const { adapter, extractOutlineForSource } = createAdapter(true)
    const manager = createManager(adapter)
    manager.refresh(undefined, true)

    // 欢迎页标题不进入大纲树，空态（含引导）得以展示
    expect(manager.getState().tree).toEqual([])
    expect(extractOutlineForSource).not.toHaveBeenCalled()
  })

  it("does not resurrect ghost bookmarks on new conversation pages", () => {
    mockBookmarks.push({
      id: "b1",
      signature: "sig-welcome",
      title: "Welcome Heading",
      level: 1,
      scrollTop: 0,
    })

    const { adapter } = createAdapter(true)
    const manager = createManager(adapter)
    manager.refresh(undefined, true)

    // 书签合并被一并跳过，幽灵节点不会重新撑起树
    expect(manager.getState().tree).toEqual([])
  })

  it("still extracts the document source on new conversation pages", () => {
    const { adapter } = createAdapter(true, true)
    const manager = createManager(adapter)
    manager.refresh(undefined, true)

    manager.setActiveSource("document")
    manager.refresh(undefined, true)

    const state = manager.getState()
    expect(state.activeSourceId).toBe("document")
    expect(state.tree.length).toBe(1)
    expect(state.tree[0].text).toBe("Document Title")
  })

  it("extracts the conversation outline normally outside new conversation pages", () => {
    const { adapter, extractOutlineForSource } = createAdapter(false)
    const manager = createManager(adapter)
    manager.refresh(undefined, true)

    expect(extractOutlineForSource).toHaveBeenCalled()
    expect(manager.getState().tree.length).toBeGreaterThan(0)
  })

  it("does not suppress when user messages exist on a new-conversation URL", () => {
    // URL 不跳转的临时对话（如 Claude 隐身、Gemini 临时对话）：发消息后 URL 仍是新对话形态，
    // 但 DOM 已有用户提问，大纲应正常工作
    const { adapter, extractOutlineForSource } = createAdapter(true, false, true)
    const manager = createManager(adapter)
    manager.refresh(undefined, true)

    expect(extractOutlineForSource).toHaveBeenCalled()
    expect(manager.getState().tree.length).toBeGreaterThan(0)
  })
})
