import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest"

import type { SiteAdapter } from "~adapters/base"
import { InlineBookmarkManager } from "~core/inline-bookmark-manager"
import type { OutlineManager } from "~core/outline-manager"
import { MutationElement, mutationRecord } from "../helpers/mutation-dom"

vi.mock("~stores/bookmarks-store", () => ({ useBookmarkStore: { subscribe: () => () => {} } }))
vi.mock("~utils/dom-toolkit", () => ({ DOMToolkit: { query: vi.fn(() => []) } }))

type BookmarkInternals = {
  injectGlobalStyles(): void
  removeInjectedIcons(): void
  hasRelevantMutation(records: MutationRecord[]): boolean
  scheduleInjectBookmarkIcons(): void
}

let manager: InlineBookmarkManager | undefined
let adapter: SiteAdapter
let outline: OutlineManager
let observers: Array<{ disconnect: ReturnType<typeof vi.fn> }>
let inject: MockInstance<InlineBookmarkManager["injectBookmarkIcons"]>

beforeEach(() => {
  vi.useFakeTimers()
  observers = []
  vi.stubGlobal("Element", MutationElement)
  const body = new MutationElement("body")
  Object.assign(body, { classList: { add: vi.fn(), remove: vi.fn() } })
  vi.stubGlobal("document", { body })
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe = vi.fn()
      disconnect = vi.fn()
      constructor() {
        observers.push(this)
      }
    },
  )
  const prototype = InlineBookmarkManager.prototype as unknown as BookmarkInternals
  vi.spyOn(prototype, "injectGlobalStyles").mockImplementation(() => {})
  vi.spyOn(prototype, "removeInjectedIcons").mockImplementation(() => {})
  vi.spyOn(InlineBookmarkManager, "cleanupInjectedArtifacts").mockImplementation(() => {})
  inject = vi
    .spyOn(InlineBookmarkManager.prototype, "injectBookmarkIcons")
    .mockImplementation(() => {})
  adapter = {
    getObserveTarget: () => body,
    getUserQuerySelector: () => ".query",
    getChatContentSelectors: () => [".response"],
  } as unknown as SiteAdapter
  outline = { subscribe: () => () => {} } as unknown as OutlineManager
})

afterEach(() => {
  manager?.cleanup()
  manager = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("InlineBookmarkManager lifecycle and feedback", () => {
  it("does not attach observers or scan when initially hidden", () => {
    manager = new InlineBookmarkManager(outline, adapter, "hidden")
    expect(observers.length).toBe(0)
    expect(inject.mock.calls.length).toBe(0)
  })

  it("disconnects and cancels queued work when hidden, then restarts when shown", () => {
    manager = new InlineBookmarkManager(outline, adapter)
    const internals = manager as unknown as BookmarkInternals
    internals.scheduleInjectBookmarkIcons()
    inject.mockClear()
    manager.setDisplayMode("hidden")
    vi.advanceTimersByTime(300)
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    expect(inject.mock.calls.length).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    manager.setDisplayMode("hover")
    expect(observers.length).toBe(2)
    expect(inject.mock.calls.length).toBe(1)
  })

  it("does not rescan headings in response to its own star insertion", () => {
    manager = new InlineBookmarkManager(outline, adapter)
    const records = [
      mutationRecord(new MutationElement("h2"), {
        added: [new MutationElement(".gh-inline-bookmark")],
      }),
    ]
    expect((manager as unknown as BookmarkInternals).hasRelevantMutation(records)).toBe(false)
  })

  it("does not starve during continuous heading changes", () => {
    manager = new InlineBookmarkManager(outline, adapter)
    inject.mockClear()
    for (let index = 0; index < 10; index++) {
      ;(manager as unknown as BookmarkInternals).scheduleInjectBookmarkIcons()
      vi.advanceTimersByTime(30)
    }
    expect(inject.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(inject.mock.calls.length).toBeLessThanOrEqual(3)
  })
})
