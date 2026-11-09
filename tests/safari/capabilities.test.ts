import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("extension browser policy", () => {
  it.each(["chrome", "firefox", "edge"])("preserves every capability for %s", async (browser) => {
    vi.stubEnv("PLASMO_BROWSER", browser)
    const { extensionCapabilities } = await import("~platform/extension/browser-policy")
    expect(Object.values(extensionCapabilities).every(Boolean)).toBe(true)
  })

  it("disables only Safari enhancements, without requiring browser globals", async () => {
    vi.stubEnv("PLASMO_BROWSER", "safari")
    const { extensionCapabilities } = await import("~platform/extension/browser-policy")
    expect(extensionCapabilities).toEqual({
      cookies: true,
      permissions: true,
      tabs: true,
      commands: true,
      declarativeNetRequest: false,
      watermarkRemoval: false,
      notifications: false,
    })
  })
})

describe("watermark MAIN world entry", () => {
  it.each(["safari", "chrome"])("controls fetch side effects for %s", async (browser) => {
    vi.stubEnv("PLASMO_BROWSER", browser)
    const originalFetch = vi.fn()
    const windowMock = { fetch: originalFetch, addEventListener: vi.fn() }
    const setAttribute = vi.fn()
    vi.stubGlobal("window", windowMock)
    vi.stubGlobal("document", { documentElement: { setAttribute } })

    await import("~contents/gemini-watermark-main")
    if (browser === "safari") {
      expect(windowMock.fetch).toBe(originalFetch)
      expect(windowMock.addEventListener).not.toHaveBeenCalled()
      expect(setAttribute).not.toHaveBeenCalled()
    } else {
      expect(windowMock.fetch).not.toBe(originalFetch)
      expect(windowMock.addEventListener).toHaveBeenCalledWith("message", expect.any(Function))
      expect(setAttribute).toHaveBeenCalledWith("data-ophel-wm-main", "1")
    }
  })
})
