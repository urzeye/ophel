import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  remoteState: { status: "idle" },
  reconcile: vi
    .fn()
    .mockResolvedValue({ packIssues: [], bindingIssues: [], missingPermissionOrigins: [] }),
}))

vi.mock("~core/remote-config-runtime", () => ({
  createRuntimeRemoteConfigManager: () => ({ getState: async () => state.remoteState }),
}))
vi.mock("~core/pack-manager-runtime", () => ({ createRuntimePackManager: () => ({}) }))
vi.mock("~core/pack-manager", () => ({
  INSTALLED_SITE_PACKS_STORAGE_KEY: "installedSitePacks",
  isInstalledSitePackEffectivelyEnabled: vi.fn(),
}))
vi.mock("~platform/extension/site-pack-registration-runtime", () => ({
  createRuntimeSitePackRegistrationManager: () => ({ reconcile: state.reconcile }),
}))
vi.mock("~utils/storage", () => ({ localStorage: { get: async () => undefined } }))
vi.mock("~utils/config", () => ({ APP_DISPLAY_NAME: "Ophel" }))
vi.mock("~utils/persisted-settings", () => ({
  PERSISTED_SETTINGS_STORAGE_KEY: "settings",
  readRemoteConfigAutoUpdate: async () => false,
}))

const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() })
const createChrome = () => ({
  runtime: {
    getManifest: () => ({ content_scripts: [] }),
    getURL: (path: string) => `chrome-extension://test/${path}`,
    onInstalled: event(),
    onStartup: event(),
    onMessage: event(),
  },
  storage: { onChanged: event() },
  permissions: { onAdded: event(), onRemoved: event(), contains: vi.fn().mockResolvedValue(true) },
  commands: { onCommand: event() },
  alarms: { onAlarm: event(), clear: vi.fn().mockResolvedValue(true) },
})

let chromeMock: ReturnType<typeof createChrome>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubEnv("PLASMO_BROWSER", "safari")
  chromeMock = createChrome()
  fetchMock = vi
    .fn()
    .mockResolvedValue(new Response("asset", { headers: { "content-type": "text/plain" } }))
  vi.stubGlobal("chrome", chromeMock)
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal(
    "FileReader",
    class {
      result = "data:text/plain;base64,YXNzZXQ="
      onloadend = () => {}
      readAsDataURL() {
        this.onloadend()
      }
    },
  )
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const dispatch = (message: Record<string, unknown>) => {
  const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0]
  return new Promise<Record<string, unknown>>((resolve) => listener(message, {}, resolve))
}

describe("background without optional Safari APIs", () => {
  it.each(["chrome", "firefox"])(
    "preserves system notifications and native options for %s",
    async (browser) => {
      vi.stubEnv("PLASMO_BROWSER", browser)
      vi.stubGlobal("navigator", { userAgent: browser, language: "en", platform: "Win32" })
      const create = vi.fn((_id, _options, callback) => callback())
      vi.stubGlobal("chrome", { ...chromeMock, notifications: { create } })
      await import("~background")
      expect(await dispatch({ type: "SHOW_NOTIFICATION", title: "Done", body: "Ready" })).toEqual({
        success: true,
      })
      const options = create.mock.calls[0][1]
      expect(options).toMatchObject({ title: "Done", message: "Ready", type: "basic" })
      expect(options.silent).toBe(browser === "firefox" ? undefined : true)
    },
  )

  it("starts and serves core messages without update, notification or DNR APIs", async () => {
    await import("~background")
    expect(chromeMock.runtime.onMessage.addListener).toHaveBeenCalledOnce()
    expect(await dispatch({ type: "GET_REMOTE_CONFIG_STATE" })).toEqual({
      success: true,
      state: state.remoteState,
    })
    expect(
      await dispatch({ type: "CHECK_PERMISSIONS", origins: ["https://example.com/*"] }),
    ).toMatchObject({ success: true, hasPermission: true })
    expect(
      await dispatch({ type: "SHOW_NOTIFICATION", title: "Done", body: "Ready" }),
    ).toMatchObject({ success: false })
  })

  it("keeps credentialed public resource requests without DNR", async () => {
    await import("~background")
    expect(
      await dispatch({ type: "PROXY_FETCH", url: "https://example.com/image.png" }),
    ).toMatchObject({ success: true, data: "data:text/plain;base64,YXNzZXQ=" })
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/image.png", {
      credentials: "include",
    })
  })

  it.each(["http://127.0.0.1/private", "http://192.168.1.1/", "file:///private"])(
    "preserves proxy restrictions for %s",
    async (url) => {
      await import("~background")
      const log = vi.spyOn(console, "error").mockImplementation(() => {})
      expect(await dispatch({ type: "PROXY_FETCH", url })).toMatchObject({ success: false })
      expect(fetchMock).not.toHaveBeenCalled()
      log.mockRestore()
    },
  )

  it.each(["chrome", "firefox"])("retains the DNR request path for %s", async (browser) => {
    vi.stubEnv("PLASMO_BROWSER", browser)
    const getDynamicRules = vi.fn().mockResolvedValue([{ id: 1001 }])
    vi.stubGlobal("chrome", { ...chromeMock, declarativeNetRequest: { getDynamicRules } })
    await import("~background")
    expect(
      await dispatch({ type: "PROXY_FETCH", url: "https://example.com/image.png" }),
    ).toMatchObject({ success: true })
    expect(getDynamicRules).toHaveBeenCalledOnce()
  })
})
