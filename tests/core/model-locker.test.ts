import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"

import { ModelLocker } from "~core/model-locker"

const createAdapter = () =>
  ({
    lockModel: vi.fn(),
    getModelSwitcherConfig: vi.fn(() => null),
    findElementBySelectors: vi.fn(() => null),
    getModelLockCheckText: vi.fn(() => ""),
  }) as unknown as SiteAdapter

describe("ModelLocker", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("cancels a pending initial lock when disabled", () => {
    const adapter = createAdapter()
    const locker = new ModelLocker(adapter, { enabled: true, keyword: "pro" })

    locker.start(1500)
    locker.updateConfig({ enabled: false, keyword: "pro" })
    vi.advanceTimersByTime(2000)

    expect(adapter.lockModel).not.toHaveBeenCalled()
  })

  it("relock replaces the previous pending lock", () => {
    const adapter = createAdapter()
    const locker = new ModelLocker(adapter, { enabled: true, keyword: "pro" })

    locker.start(1500)
    locker.relock(300)
    vi.advanceTimersByTime(2000)

    expect(adapter.lockModel).toHaveBeenCalledTimes(1)
  })
})
