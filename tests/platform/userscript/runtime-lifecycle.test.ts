import { beforeEach, describe, expect, it, vi } from "vitest"

import { prepareUserscriptRuntimeForClearAll } from "~platform/userscript/runtime-lifecycle"
import { drainPersistenceWrites, suspendPersistenceWrites } from "~stores/chrome-adapter"
import { dispatchClearAllDataEvent } from "~utils/clear-all-event"

vi.mock("~stores/chrome-adapter", () => ({
  drainPersistenceWrites: vi.fn(),
  suspendPersistenceWrites: vi.fn(),
}))

vi.mock("~utils/clear-all-event", () => ({
  dispatchClearAllDataEvent: vi.fn(),
}))

const createDeferred = () => {
  let resolve = () => undefined
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe("prepareUserscriptRuntimeForClearAll", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("waits for persistence writes and runtime event tasks before completing", async () => {
    const persistenceDrain = createDeferred()
    const runtimeTasks = createDeferred()
    vi.mocked(drainPersistenceWrites).mockReturnValue(persistenceDrain.promise)
    vi.mocked(dispatchClearAllDataEvent).mockReturnValue(runtimeTasks.promise)

    let completed = false
    const preparation = prepareUserscriptRuntimeForClearAll().then(() => {
      completed = true
    })

    expect(suspendPersistenceWrites).toHaveBeenCalledOnce()
    expect(drainPersistenceWrites).toHaveBeenCalledOnce()
    expect(dispatchClearAllDataEvent).toHaveBeenCalledOnce()

    runtimeTasks.resolve()
    await Promise.resolve()
    expect(completed).toBe(false)

    persistenceDrain.resolve()
    await preparation
    expect(completed).toBe(true)
  })

  it("rejects preparation when the persistence drain fails", async () => {
    const failure = new Error("pending write failed")
    vi.mocked(drainPersistenceWrites).mockRejectedValue(failure)
    vi.mocked(dispatchClearAllDataEvent).mockResolvedValue(undefined)

    await expect(prepareUserscriptRuntimeForClearAll()).rejects.toBe(failure)
  })
})
