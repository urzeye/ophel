import { afterEach, describe, expect, it, vi } from "vitest"

import { darkPresets } from "../src/utils/themes/dark"
import { lightPresets } from "../src/utils/themes/light"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("userscript theme resources", () => {
  it("preserves all preset metadata, variables, textures and animations", async () => {
    const readResource = vi.fn(() => JSON.stringify({ lightPresets, darkPresets }))
    vi.stubGlobal("GM_getResourceText", readResource)

    const loaded = await import("../src/platform/userscript/theme-presets")
    expect(loaded.lightPresets).toEqual(lightPresets)
    expect(loaded.darkPresets).toEqual(darkPresets)
    expect(loaded.lightPresets.length + loaded.darkPresets.length).toBe(24)
    expect(readResource).toHaveBeenCalledExactlyOnceWith("ophelThemePresets")
  })

  it.each(["", "{", "null", '{"lightPresets":[],"darkPresets":[]}'])(
    "rejects missing or invalid data instead of silently changing the theme: %s",
    async (text) => {
      vi.stubGlobal("GM_getResourceText", () => text)
      await expect(import("../src/platform/userscript/theme-presets")).rejects.toThrow()
    },
  )
})
