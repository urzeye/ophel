import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  prepareAppRuntimeForClearAll,
  stopAppRuntimeWriters,
} from "~components/app/runtime-lifecycle"
import { drainPersistenceWrites, suspendPersistenceWrites } from "~stores/chrome-adapter"

vi.mock("~stores/chrome-adapter", () => ({
  drainPersistenceWrites: vi.fn(() => Promise.resolve()),
  suspendPersistenceWrites: vi.fn(),
}))

const createWriters = () => ({
  queueDispatcher: { stop: vi.fn() },
  conversationManager: { destroy: vi.fn() },
  outlineManager: { destroy: vi.fn() },
})

describe("stopAppRuntimeWriters", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("stops every UI writer without suspending persistence", () => {
    const writers = createWriters()

    stopAppRuntimeWriters(writers)

    expect(writers.queueDispatcher.stop).toHaveBeenCalledOnce()
    expect(writers.conversationManager.destroy).toHaveBeenCalledOnce()
    expect(writers.outlineManager.destroy).toHaveBeenCalledOnce()
    expect(suspendPersistenceWrites).not.toHaveBeenCalled()
    expect(drainPersistenceWrites).not.toHaveBeenCalled()
  })

  it("stops every UI writer even when one cleanup fails", () => {
    const failure = new Error("queue cleanup failed")
    const queueStop = vi.fn(() => {
      throw failure
    })
    const conversationDestroy = vi.fn()
    const outlineDestroy = vi.fn()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

    stopAppRuntimeWriters({
      queueDispatcher: { stop: queueStop },
      conversationManager: { destroy: conversationDestroy },
      outlineManager: { destroy: outlineDestroy },
    })

    expect(queueStop).toHaveBeenCalledOnce()
    expect(conversationDestroy).toHaveBeenCalledOnce()
    expect(outlineDestroy).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledWith("[Ophel] app runtime cleanup failed:", failure)
  })

  it("suspends and drains persistence before clear-all continues", async () => {
    const writers = createWriters()

    await prepareAppRuntimeForClearAll(writers)

    expect(suspendPersistenceWrites).toHaveBeenCalledOnce()
    expect(writers.queueDispatcher.stop).toHaveBeenCalledOnce()
    expect(writers.conversationManager.destroy).toHaveBeenCalledOnce()
    expect(writers.outlineManager.destroy).toHaveBeenCalledOnce()
    expect(drainPersistenceWrites).toHaveBeenCalledOnce()
  })
})
