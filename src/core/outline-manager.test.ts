import { afterEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"
import { useBookmarkStore } from "~stores/bookmarks-store"
import { DEFAULT_SETTINGS } from "~utils/storage"

import { OutlineManager } from "./outline-manager"

describe("OutlineManager lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("removes the exact window listener and store subscription once", () => {
    const unsubscribe = vi.fn()
    vi.spyOn(useBookmarkStore, "subscribe").mockReturnValue(unsubscribe)
    const addListener = vi.spyOn(window, "addEventListener")
    const removeListener = vi.spyOn(window, "removeEventListener")
    const adapter = {
      getOutlineSources: () => [
        { id: "conversation", kind: "conversation", label: "Conversation", available: true },
      ],
    } as unknown as SiteAdapter

    const manager = new OutlineManager(adapter, DEFAULT_SETTINGS.features.outline)
    const messageListener = addListener.mock.calls.find(([event]) => event === "message")?.[1]

    manager.destroy()
    manager.destroy()

    expect(messageListener).toBeTypeOf("function")
    expect(removeListener).toHaveBeenCalledWith("message", messageListener)
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
