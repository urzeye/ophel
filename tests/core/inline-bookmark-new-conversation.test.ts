import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OutlineItem, SiteAdapter } from "~adapters/base"
import { InlineBookmarkManager } from "~core/inline-bookmark-manager"
import type { OutlineManager } from "~core/outline-manager"

vi.mock("~stores/bookmarks-store", () => ({ useBookmarkStore: { subscribe: () => () => {} } }))
vi.mock("~utils/dom-toolkit", () => ({ DOMToolkit: { query: vi.fn(() => []) } }))

type BookmarkInternals = {
  getInlineBookmarkItems(includeAdapterScan: boolean): Array<{
    item: OutlineItem
    sourceId: string
  }>
}

const welcomeItems: OutlineItem[] = [{ level: 1, text: "Welcome Heading", element: {} as Element }]

const createAdapter = (isNewConversation: boolean, hasUserMessages: boolean) => {
  const getInlineBookmarkItems = vi.fn(() => welcomeItems)
  const adapter = {
    getObserveTarget: () => null,
    getUserQuerySelector: () => ".query",
    getChatContentSelectors: () => [".response"],
    isNewConversation: () => isNewConversation,
    hasUserMessagesInDom: () => hasUserMessages,
    getInlineBookmarkItems,
  } as unknown as SiteAdapter
  return { adapter, getInlineBookmarkItems }
}

describe("InlineBookmarkManager new conversation suppression", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      body: { classList: { add: vi.fn(), remove: vi.fn() } },
    })
    const prototype = InlineBookmarkManager.prototype as unknown as {
      injectGlobalStyles(): void
      removeInjectedIcons(): void
    }
    vi.spyOn(prototype, "injectGlobalStyles").mockImplementation(() => {})
    vi.spyOn(prototype, "removeInjectedIcons").mockImplementation(() => {})
    vi.spyOn(InlineBookmarkManager, "cleanupInjectedArtifacts").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const createManager = (adapter: SiteAdapter) => {
    const outline = {
      subscribe: () => () => {},
      getFlatItems: () => [],
      getActiveSourceId: () => "conversation",
    } as unknown as OutlineManager
    // hidden 模式不启动 observer 与图标注入，便于直接验证候选收集逻辑
    return new InlineBookmarkManager(outline, adapter, "hidden")
  }

  it("skips the adapter scan on new conversation landing pages", () => {
    const { adapter, getInlineBookmarkItems } = createAdapter(true, false)
    const manager = createManager(adapter)

    const candidates = (manager as unknown as BookmarkInternals).getInlineBookmarkItems(true)

    expect(getInlineBookmarkItems).not.toHaveBeenCalled()
    expect(candidates).toEqual([])
    manager.cleanup()
  })

  it("keeps the adapter scan when user messages exist on a new-conversation URL", () => {
    const { adapter, getInlineBookmarkItems } = createAdapter(true, true)
    const manager = createManager(adapter)

    const candidates = (manager as unknown as BookmarkInternals).getInlineBookmarkItems(true)

    expect(getInlineBookmarkItems).toHaveBeenCalled()
    expect(candidates.length).toBe(1)
    manager.cleanup()
  })

  it("keeps the adapter scan outside new conversation pages", () => {
    const { adapter, getInlineBookmarkItems } = createAdapter(false, false)
    const manager = createManager(adapter)

    const candidates = (manager as unknown as BookmarkInternals).getInlineBookmarkItems(true)

    expect(getInlineBookmarkItems).toHaveBeenCalled()
    expect(candidates.length).toBe(1)
    manager.cleanup()
  })
})
