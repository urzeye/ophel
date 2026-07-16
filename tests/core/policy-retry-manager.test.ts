import { describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"
import { PolicyRetryManager } from "~core/policy-retry-manager"

describe("PolicyRetryManager lifecycle", () => {
  it("removes the exact window listener once", () => {
    const addListener = vi.spyOn(window, "addEventListener")
    const removeListener = vi.spyOn(window, "removeEventListener")
    const adapter = {
      getSiteId: () => "gemini-enterprise",
    } as unknown as SiteAdapter

    const manager = new PolicyRetryManager(adapter, { enabled: false, maxRetries: 3 })
    const registration = addListener.mock.calls.find(([type]) => type === "message")

    expect(registration).toBeDefined()

    manager.destroy()
    manager.destroy()

    const removals = removeListener.mock.calls.filter(([type]) => type === "message")
    expect(removals).toHaveLength(1)
    expect(removals[0]?.[1]).toBe(registration?.[1])
  })
})
