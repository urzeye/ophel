import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AIStudioRpcBridgeWindow } from "~core/aistudio-rpc-bridge"

const BLOCKED_KEY = "AIzaSyBlockedKey0000000000000000000"
const WORKING_KEY = "AIzaSyWorkingKey1111111111111111111"
const OTHER_KEY = "AIzaSyOtherKey2222222222222222222"

const importAuth = () => import("~utils/google-rpc-auth")

describe("resolveGoogleApiKeys", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("WIu0Nc 优先于 WIZ_global_data 里的其他 key", async () => {
    const { resolveGoogleApiKeys } = await importAuth()
    const keys = resolveGoogleApiKeys({
      WIZ_global_data: { PeqOqb: BLOCKED_KEY, WIu0Nc: WORKING_KEY },
    })
    expect(keys).toEqual([WORKING_KEY, BLOCKED_KEY])
  })

  it("无 WIZ_global_data 全局变量时，从内联 JSON 配置块按字段名解析", async () => {
    vi.stubGlobal("document", {
      querySelectorAll: () => [
        {
          type: "application/json",
          textContent: JSON.stringify({ PeqOqb: BLOCKED_KEY, WIu0Nc: WORKING_KEY }),
        },
      ],
    })
    const { resolveGoogleApiKeys } = await importAuth()
    expect(resolveGoogleApiKeys()).toEqual([WORKING_KEY, BLOCKED_KEY])
  })

  it("SNlM0e 为非 AIza 值时跳过，为合法 key 时排在 WIu0Nc 之后", async () => {
    const { resolveGoogleApiKeys } = await importAuth()
    expect(
      resolveGoogleApiKeys({
        WIZ_global_data: { SNlM0e: "ABPsNSW8ISrE8li8j234uBwqFDqU:1790562456561" },
      }),
    ).toEqual([])
    expect(
      resolveGoogleApiKeys({
        WIZ_global_data: { WIu0Nc: WORKING_KEY, SNlM0e: OTHER_KEY },
      }),
    ).toEqual([WORKING_KEY, OTHER_KEY])
  })

  it("重复出现的 key 去重", async () => {
    const { resolveGoogleApiKeys } = await importAuth()
    const keys = resolveGoogleApiKeys({
      WIZ_global_data: { WIu0Nc: WORKING_KEY, PeqOqb: WORKING_KEY, other: BLOCKED_KEY },
    })
    expect(keys).toEqual([WORKING_KEY, BLOCKED_KEY])
  })

  it("recordGoogleApiKey 记录的实测可用 key 排在最前", async () => {
    const { recordGoogleApiKey, resolveGoogleApiKeys } = await importAuth()
    recordGoogleApiKey(BLOCKED_KEY)
    recordGoogleApiKey("not-a-key")
    const keys = resolveGoogleApiKeys({ WIZ_global_data: { WIu0Nc: WORKING_KEY } })
    expect(keys).toEqual([BLOCKED_KEY, WORKING_KEY])
  })

  it("recordGoogleApiKey 持久化到 localStorage，模块重载（页面刷新）后仍优先", async () => {
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      get length() {
        return store.size
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    })

    const first = await importAuth()
    first.recordGoogleApiKey(WORKING_KEY)

    vi.resetModules()
    const second = await importAuth()
    expect(second.resolveGoogleApiKeys({ WIZ_global_data: { WIu0Nc: BLOCKED_KEY } })[0]).toBe(
      WORKING_KEY,
    )
  })
})

describe("aistudio-rpc-bridge api key fallback", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal("document", {
      cookie: "SAPISID=test-sapisid",
      querySelectorAll: () => [],
    })
    vi.stubGlobal("window", { location: { search: "" } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const createFakeWindow = (fetchImpl: unknown) => {
    const listeners = new Map<string, Array<(event: unknown) => void>>()
    const posted: Array<Record<string, unknown>> = []
    const fakeWindow = {
      location: { origin: "https://aistudio.google.com" },
      document: { documentElement: { setAttribute: () => {} } },
      addEventListener: (type: string, fn: (event: unknown) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), fn])
      },
      postMessage: (data: Record<string, unknown>) => {
        posted.push(data)
      },
      fetch: fetchImpl,
      WIZ_global_data: { WIu0Nc: BLOCKED_KEY, PeqOqb: WORKING_KEY },
    }
    const emit = (data: unknown) => {
      for (const fn of listeners.get("message") ?? []) {
        fn({ source: fakeWindow, data })
      }
    }
    return { fakeWindow, posted, emit }
  }

  it("首个候选 key 返回 403 时换下一个 key 重试，成功后记录可用 key", async () => {
    const bridge = await import("~core/aistudio-rpc-bridge")
    const seenKeys: string[] = []
    const fetchImpl = vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      const key = init.headers["x-goog-api-key"]
      seenKeys.push(key)
      if (key === BLOCKED_KEY) {
        return { ok: false, status: 403, json: async () => null }
      }
      return { ok: true, status: 200, json: async () => ["ok"] }
    })
    const { fakeWindow, posted, emit } = createFakeWindow(fetchImpl)
    bridge.installAIStudioRpcBridge(fakeWindow as unknown as AIStudioRpcBridgeWindow)

    emit({
      type: bridge.AISTUDIO_RPC_REQUEST_EVENT,
      requestId: "r1",
      method: "ResolveDriveResource",
      args: ["pid"],
    })

    await vi.waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({
      type: bridge.AISTUDIO_RPC_RESPONSE_EVENT,
      requestId: "r1",
      ok: true,
      status: 200,
      payload: ["ok"],
    })
    expect(seenKeys).toEqual([BLOCKED_KEY, WORKING_KEY])

    const { resolveGoogleApiKeys } = await importAuth()
    expect(resolveGoogleApiKeys({})[0]).toBe(WORKING_KEY)
  })
})
