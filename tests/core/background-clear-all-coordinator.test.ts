import { describe, expect, it, vi } from "vitest"

import { PersistenceWriteBarrier } from "~stores/chrome-adapter"

import {
  BACKGROUND_CLEAR_TRANSACTION_KEY,
  BackgroundClearAllCoordinator,
  type BackgroundSessionStorage,
} from "~core/background-clear-all-coordinator"

const createSessionStorage = (initial: Record<string, unknown> = {}) => {
  const values: Record<string, unknown> = { ...initial }
  const storage: BackgroundSessionStorage = {
    get: vi.fn(async () => ({ ...values })),
    set: vi.fn(async (items) => {
      Object.assign(values, items)
    }),
    remove: vi.fn(async (key) => {
      delete values[key]
    }),
  }
  return { storage, values }
}

describe("BackgroundClearAllCoordinator", () => {
  it("drains writes that started before acquiring the clear lock", async () => {
    const session = createSessionStorage()
    let finishWrite = () => undefined
    const pendingWrite = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    const coordinator = new BackgroundClearAllCoordinator(session.storage)

    void coordinator.runPersistenceWrite(() => pendingWrite)
    await Promise.resolve()
    let prepared = false
    const prepare = coordinator.begin("clear-1").then(() => {
      prepared = true
    })

    await Promise.resolve()
    expect(prepared).toBe(false)
    finishWrite()
    await prepare
    expect(prepared).toBe(true)
  })

  it("blocks new writes and requires the owning transaction to release the lock", async () => {
    const session = createSessionStorage()
    const write = vi.fn().mockResolvedValue(undefined)
    const coordinator = new BackgroundClearAllCoordinator(session.storage)

    await coordinator.begin("clear-1")
    await expect(coordinator.runPersistenceWrite(write)).rejects.toThrow(
      "Background persistence writes are suspended",
    )
    await expect(coordinator.begin("clear-2")).rejects.toThrow("is already active")
    await expect(coordinator.release("clear-2")).rejects.toThrow("ownership does not match")

    await coordinator.release("clear-1")
    await coordinator.runPersistenceWrite(write)
    expect(write).toHaveBeenCalledOnce()
  })

  it("restores an active lock after a service worker restart", async () => {
    const session = createSessionStorage({
      [BACKGROUND_CLEAR_TRANSACTION_KEY]: { id: "clear-1", startedAt: 1_000 },
    })
    const coordinator = new BackgroundClearAllCoordinator(
      session.storage,
      new PersistenceWriteBarrier(),
      { now: () => 1_500 },
    )

    await expect(coordinator.runPersistenceWrite(async () => undefined)).rejects.toThrow(
      "Background persistence writes are suspended",
    )
    await coordinator.release("clear-1")
    expect(session.values).toEqual({})
  })

  it("expires an abandoned lock before allowing the next write", async () => {
    const session = createSessionStorage({
      [BACKGROUND_CLEAR_TRANSACTION_KEY]: { id: "stale", startedAt: 1_000 },
    })
    const warn = vi.fn()
    const write = vi.fn().mockResolvedValue(undefined)
    const coordinator = new BackgroundClearAllCoordinator(
      session.storage,
      new PersistenceWriteBarrier(),
      { now: () => 3_001, ttlMs: 2_000, warn },
    )

    await coordinator.runPersistenceWrite(write)

    expect(write).toHaveBeenCalledOnce()
    expect(session.values).toEqual({})
    expect(warn).toHaveBeenCalledWith("[Ophel] Releasing stale background clear-all transaction:", {
      transactionId: "stale",
    })
  })

  it("removes the persisted lock and resumes writes when preparation fails", async () => {
    const session = createSessionStorage()
    const failure = new Error("pending write failed")
    let failWrite = (_error: Error) => undefined
    const pendingWrite = new Promise<void>((_resolve, reject) => {
      failWrite = reject
    })
    const coordinator = new BackgroundClearAllCoordinator(session.storage)
    const write = coordinator.runPersistenceWrite(() => pendingWrite)
    await Promise.resolve()

    const prepare = coordinator.begin("clear-1")
    await vi.waitFor(() => {
      expect(session.storage.set).toHaveBeenCalledOnce()
    })
    await Promise.resolve()
    failWrite(failure)

    await expect(write).rejects.toBe(failure)
    await expect(prepare).rejects.toThrow("Pending persistence writes failed")
    expect(session.values).toEqual({})

    const resumedWrite = vi.fn().mockResolvedValue(undefined)
    await coordinator.runPersistenceWrite(resumedWrite)
    expect(resumedWrite).toHaveBeenCalledOnce()
  })
})
