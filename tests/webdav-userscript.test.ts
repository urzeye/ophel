import { AsyncLocalStorage } from "node:async_hooks"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ runManual: vi.fn(), runScheduled: vi.fn() }))
vi.mock("~core/webdav-backup", () => ({
  WebDAVBackupService: class {
    runManual = mocks.runManual
    runScheduled = mocks.runScheduled
    getNextBackupAt = vi.fn(async () => null)
  },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  mocks.runManual.mockReset()
})

async function setupTabs() {
  const context = new AsyncLocalStorage<string>()
  const tabs: Record<string, Record<string, unknown>> = { a: {}, b: {} }
  vi.stubGlobal("GM_getTab", (callback: (tab: unknown) => void) => {
    const tab = structuredClone(tabs[context.getStore()!])
    queueMicrotask(() => callback(tab))
  })
  // Deliberately no callback: this is the API shape also supported by Violentmonkey.
  vi.stubGlobal("GM_saveTab", (tab: Record<string, unknown>) => {
    tabs[context.getStore()!] = structuredClone(tab)
  })
  vi.stubGlobal("GM_getTabs", (callback: (saved: unknown) => void) => {
    const saved = structuredClone(tabs)
    queueMicrotask(() => callback(saved))
  })
  vi.resetModules()
  const a = await import("~platform/userscript/webdav")
  vi.resetModules()
  const b = await import("~platform/userscript/webdav")
  return { context, tabs, a, b }
}

describe("userscript WebDAV coordination", () => {
  it("does not execute simultaneous manual operations from different origins/tabs", async () => {
    const { context, a, b } = await setupTabs()
    let active = 0
    let peak = 0
    mocks.runManual.mockImplementation(async () => {
      active++
      peak = Math.max(active, peak)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active--
      return { success: true, messageKey: "webdavUploadSuccess" }
    })
    const config = {} as import("~types/webdav").WebDAVConfig
    const results = await Promise.all([
      context.run("a", () => a.userscriptWebDAV.runAction("upload", config)),
      context.run("b", () => b.userscriptWebDAV.runAction("upload", config)),
    ])
    expect(peak).toBeLessThanOrEqual(1)
    expect(results.some((result) => result.messageKey === "webdavBusy")).toBe(true)
    expect(
      (await context.run("a", () => a.userscriptWebDAV.runAction("upload", config))).success,
    ).toBe(true)
  })

  it("rejects an operation while another tab is uploading, then releases the lock", async () => {
    const { context, a, b } = await setupTabs()
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    mocks.runManual
      .mockImplementationOnce(async () => {
        await pending
        return { success: true, messageKey: "webdavUploadSuccess" }
      })
      .mockResolvedValue({ success: true, messageKey: "webdavUploadSuccess" })
    const config = {} as import("~types/webdav").WebDAVConfig
    const first = context.run("a", () => a.userscriptWebDAV.runAction("upload", config))
    await vi.waitFor(() => expect(mocks.runManual).toHaveBeenCalledTimes(1))
    expect(
      await context.run("b", () => b.userscriptWebDAV.runAction("download", config)),
    ).toMatchObject({ success: false, messageKey: "webdavBusy" })
    finish()
    await first
    expect(
      (await context.run("b", () => b.userscriptWebDAV.runAction("download", config))).success,
    ).toBe(true)
  })

  it("does not deadlock after a GM API failure", async () => {
    const { context, a } = await setupTabs()
    const original = globalThis.GM_getTab
    vi.stubGlobal("GM_getTab", () => {
      throw new Error("manager unavailable")
    })
    const config = {} as import("~types/webdav").WebDAVConfig
    await expect(
      context.run("a", () => a.userscriptWebDAV.runAction("upload", config)),
    ).rejects.toThrow("manager unavailable")
    vi.stubGlobal("GM_getTab", original)
    mocks.runManual.mockResolvedValue({ success: true, messageKey: "webdavUploadSuccess" })
    expect(
      (await context.run("a", () => a.userscriptWebDAV.runAction("upload", config))).success,
    ).toBe(true)
  })

  it("sets request timeouts and preserves WebDAV response headers", async () => {
    const { a } = await setupTabs()
    const request = vi.fn((details: { timeout: number; onload: (response: unknown) => void }) => {
      details.onload({
        status: 207,
        statusText: "Multi-Status",
        responseText: "<xml />",
        responseHeaders: 'ETag: "abc"\r\nContent-Type: application/xml\r\n',
      })
    })
    vi.stubGlobal("GM_xmlhttpRequest", request)
    const response = await a.userscriptWebDAV.request("PROPFIND", "https://dav.example.com/")
    expect(response.headers.get("etag")).toBe('"abc"')
    expect(await response.text()).toBe("<xml />")
    expect(request.mock.calls[0][0].timeout).toBe(25_000)
  })
})
