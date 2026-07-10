import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PollingTaskRegistry } from "./polling-task-registry"

describe("PollingTaskRegistry", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts a task idempotently and stops it", () => {
    const registry = new PollingTaskRegistry()
    const run = vi.fn()

    registry.start({ name: "sync", intervalMs: 100, run })
    registry.start({ name: "sync", intervalMs: 100, run })
    vi.advanceTimersByTime(250)

    expect(run).toHaveBeenCalledTimes(2)
    registry.stop("sync")
    vi.advanceTimersByTime(250)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("skips hidden document ticks by default", () => {
    const registry = new PollingTaskRegistry()
    const run = vi.fn()
    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockReturnValue(true)

    registry.start({ name: "visible-only", intervalMs: 100, run })
    vi.advanceTimersByTime(250)

    expect(run).not.toHaveBeenCalled()
    hiddenSpy.mockReturnValue(false)
    vi.advanceTimersByTime(100)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
