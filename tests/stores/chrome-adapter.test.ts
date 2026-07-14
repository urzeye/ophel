import { describe, expect, it, vi } from "vitest"
import type { StateStorage } from "zustand/middleware"

import {
  guardPersistenceWrites,
  PersistenceEpochGuard,
  PersistenceWriteBarrier,
} from "~stores/chrome-adapter"

describe("persistence write barrier", () => {
  it("blocks every write and removal after suspension while preserving reads", async () => {
    const getItem = vi.fn(() => "stored")
    const setItem = vi.fn()
    const removeItem = vi.fn()
    const storage: StateStorage = { getItem, setItem, removeItem }
    const barrier = new PersistenceWriteBarrier()
    const guarded = guardPersistenceWrites(storage, barrier)

    await guarded.setItem("settings", "before")
    barrier.suspend()
    await guarded.setItem("settings", "after")
    await guarded.removeItem("settings")

    expect(await guarded.getItem("settings")).toBe("stored")
    expect(setItem).toHaveBeenCalledOnce()
    expect(setItem).toHaveBeenCalledWith("settings", "before")
    expect(removeItem).not.toHaveBeenCalled()
    expect(getItem).toHaveBeenCalledWith("settings")
  })

  it("waits for writes that started before suspension", async () => {
    let resolveWrite = () => undefined
    const pendingWrite = new Promise<void>((resolve) => {
      resolveWrite = resolve
    })
    const storage: StateStorage = {
      getItem: () => null,
      setItem: () => pendingWrite,
      removeItem: () => undefined,
    }
    const barrier = new PersistenceWriteBarrier()
    const guarded = guardPersistenceWrites(storage, barrier)

    void guarded.setItem("settings", "pending")
    barrier.suspend()
    let drained = false
    const drain = barrier.drain().then(() => {
      drained = true
    })

    await Promise.resolve()
    expect(drained).toBe(false)
    resolveWrite()
    await drain
    expect(drained).toBe(true)
  })

  it("surfaces failures from writes that started before suspension", async () => {
    const failure = new Error("storage write failed")
    const storage: StateStorage = {
      getItem: () => null,
      setItem: () => Promise.reject(failure),
      removeItem: () => undefined,
    }
    const barrier = new PersistenceWriteBarrier()
    const guarded = guardPersistenceWrites(storage, barrier)

    void Promise.resolve(guarded.setItem("settings", "pending")).catch(() => undefined)
    barrier.suspend()

    await expect(barrier.drain()).rejects.toThrow("Pending persistence writes failed")
  })

  it("allows a transaction coordinator to resume writes after an aborted clear", async () => {
    const setItem = vi.fn()
    const storage: StateStorage = {
      getItem: () => null,
      setItem,
      removeItem: () => undefined,
    }
    const barrier = new PersistenceWriteBarrier()
    const guarded = guardPersistenceWrites(storage, barrier)

    barrier.suspend()
    await guarded.setItem("settings", "blocked")
    barrier.resume()
    await guarded.setItem("settings", "resumed")

    expect(setItem).toHaveBeenCalledOnce()
    expect(setItem).toHaveBeenCalledWith("settings", "resumed")
  })
})

describe("PersistenceEpochGuard", () => {
  it("suspends for a prepare lock or a changed clear generation", () => {
    let generation: unknown = "generation-1"
    let prepareSignal: unknown
    const guard = new PersistenceEpochGuard(
      () => generation,
      () => prepareSignal,
    )

    expect(guard.shouldSuspend()).toBe(false)
    prepareSignal = { transactionId: "clear-1" }
    expect(guard.shouldSuspend()).toBe(true)
    prepareSignal = undefined
    generation = "generation-2"
    expect(guard.shouldSuspend()).toBe(true)
  })
})
