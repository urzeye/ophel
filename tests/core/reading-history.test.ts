import { afterEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"

const hydrationStore = vi.hoisted(() => {
  let state = { _hasHydrated: false }
  const listeners = new Set<(nextState: typeof state) => void>()
  const setState = vi.fn((partial: Partial<typeof state>) => {
    state = { ...state, ...partial }
    for (const listener of listeners) listener(state)
  })

  return {
    getState: () => state,
    setState,
    subscribe: (listener: (nextState: typeof state) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    reset: () => {
      state = { _hasHydrated: false }
      listeners.clear()
      setState.mockClear()
    },
  }
})

vi.mock("~stores/reading-history-store", () => ({
  getReadingHistoryStore: () => ({
    cleanup: vi.fn(),
    getPosition: vi.fn(),
    savePosition: vi.fn(),
  }),
  useReadingHistoryStore: {
    getState: hydrationStore.getState,
    setState: hydrationStore.setState,
    subscribe: hydrationStore.subscribe,
  },
}))

import { ReadingHistoryManager } from "~core/reading-history"

describe("ReadingHistoryManager lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers()
    hydrationStore.reset()
  })

  it("cancels a hydration wait without mutating the store after destroy", async () => {
    vi.useFakeTimers()
    const manager = new ReadingHistoryManager({} as SiteAdapter, {
      persistence: true,
      autoRestore: true,
      cleanupDays: 3,
    })

    const hydration = manager.waitForHydration(5000)
    manager.destroy()

    await expect(hydration).resolves.toBe(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(hydrationStore.setState).not.toHaveBeenCalled()
  })

  it("does not continue restoring when hydration times out", async () => {
    vi.useFakeTimers()
    const adapter = {
      getSessionId: vi.fn(() => "conversation-id"),
      isUserConversationPage: vi.fn(() => true),
    } as unknown as SiteAdapter
    const manager = new ReadingHistoryManager(adapter, {
      persistence: true,
      autoRestore: true,
      cleanupDays: 3,
    })

    const restore = manager.restoreProgress()
    await vi.advanceTimersByTimeAsync(5000)

    await expect(restore).resolves.toBe(false)
    expect(adapter.getSessionId).not.toHaveBeenCalled()
    expect(hydrationStore.setState).not.toHaveBeenCalled()
  })
})
