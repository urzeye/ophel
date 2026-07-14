import { describe, expect, it, vi } from "vitest"

import { drainCleanupStack } from "~utils/cleanup-stack"

describe("drainCleanupStack", () => {
  it("runs every task in reverse order even when one fails", () => {
    const calls: string[] = []
    const error = new Error("cleanup failure")
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const tasks = [
      () => calls.push("first"),
      () => {
        calls.push("second")
        throw error
      },
      () => calls.push("third"),
    ]

    drainCleanupStack(tasks, "test")

    expect(calls).toEqual(["third", "second", "first"])
    expect(tasks).toHaveLength(0)
    expect(consoleError).toHaveBeenCalledWith("[Ophel] test cleanup failed:", error)
  })
})
