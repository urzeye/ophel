import { describe, expect, it, vi } from "vitest"

describe("allowsSitePackHttpOrigins", () => {
  it("is disabled outside development builds", async () => {
    vi.resetModules()
    vi.doMock("~utils/config", () => ({ IS_DEVELOPMENT_BUILD: false }))
    const { allowsSitePackHttpOrigins } = await import("~core/site-pack-http-policy")
    expect(allowsSitePackHttpOrigins()).toBe(false)
  })

  it("is enabled for development builds", async () => {
    vi.resetModules()
    vi.doMock("~utils/config", () => ({ IS_DEVELOPMENT_BUILD: true }))
    const { allowsSitePackHttpOrigins } = await import("~core/site-pack-http-policy")
    expect(allowsSitePackHttpOrigins()).toBe(true)
  })
})
