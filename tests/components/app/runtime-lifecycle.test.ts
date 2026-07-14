import { describe, expect, it, vi } from "vitest"

import { stopAppRuntimeWriters } from "~components/app/runtime-lifecycle"

describe("stopAppRuntimeWriters", () => {
  it("stops every UI writer even when one cleanup fails", async () => {
    const failure = new Error("queue cleanup failed")
    const queueStop = vi.fn(() => {
      throw failure
    })
    const conversationDestroy = vi.fn()
    const outlineDestroy = vi.fn()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

    await stopAppRuntimeWriters({
      queueDispatcher: { stop: queueStop },
      conversationManager: { destroy: conversationDestroy },
      outlineManager: { destroy: outlineDestroy },
    })

    expect(queueStop).toHaveBeenCalledOnce()
    expect(conversationDestroy).toHaveBeenCalledOnce()
    expect(outlineDestroy).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledWith("[Ophel] app runtime cleanup failed:", failure)
  })
})
