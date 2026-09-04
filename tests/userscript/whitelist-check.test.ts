import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { SITE_IDS } from "~constants"
import { shouldInitializeOnCurrentSite } from "~platform/userscript/whitelist-check"

// 油猴白名单检查在脚本启动早期运行，依赖 GM_getValue 与 window.location，
// 这里按 persist 真实写入格式（createJSONStorage → JSON 字符串）构造桩。

const DOUBAO_URL = "https://www.doubao.com/chat"

const gmStore = new Map<string, unknown>()

const setLocation = (url: string) => {
  const parsed = new URL(url)
  Object.defineProperty(globalThis, "window", {
    value: { location: parsed },
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  gmStore.clear()
  ;(globalThis as Record<string, unknown>).GM_getValue = (key: string, defaultValue?: unknown) =>
    gmStore.has(key) ? gmStore.get(key) : defaultValue
  setLocation(DOUBAO_URL)
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).GM_getValue
})

const persistEnvelope = (disabledSites: string[]) =>
  JSON.stringify({ state: { settings: { disabledSites } }, version: 1 })

describe("userscript whitelist-check built-in site toggle", () => {
  it("initializes on a built-in site when nothing is disabled", async () => {
    await expect(shouldInitializeOnCurrentSite()).resolves.toBe(true)
  })

  it("skips a disabled built-in site (persist JSON string envelope)", async () => {
    gmStore.set("settings", persistEnvelope([SITE_IDS.DOUBAO]))
    await expect(shouldInitializeOnCurrentSite()).resolves.toBe(false)
  })

  it("still initializes other built-in sites", async () => {
    gmStore.set("settings", persistEnvelope([SITE_IDS.DOUBAO]))
    setLocation("https://chatgpt.com/c/123")
    await expect(shouldInitializeOnCurrentSite()).resolves.toBe(true)
  })

  it("tolerates legacy raw settings objects stored in GM", async () => {
    gmStore.set("settings", { disabledSites: [SITE_IDS.DOUBAO] })
    await expect(shouldInitializeOnCurrentSite()).resolves.toBe(false)
  })

  it("tolerates malformed settings payloads", async () => {
    gmStore.set("settings", "{not json")
    await expect(shouldInitializeOnCurrentSite()).resolves.toBe(true)
  })
})
