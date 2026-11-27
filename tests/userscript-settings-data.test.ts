import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import ts from "typescript"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createUserscriptSettingsData } from "../scripts/userscript-settings-data"
import * as original from "../src/constants/ui"
import { SHORTCUT_META } from "../src/constants/shortcuts"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

function loadTransformedSettings() {
  const file = path.resolve("src/constants/ui.ts")
  const code = fs.readFileSync(file, "utf8")
  const resource = createUserscriptSettingsData(process.cwd())
  const data = JSON.parse(resource.content)
  const transform = resource.plugin.transform as (code: string, id: string) => string
  const transformed = transform(code, file)
  const module = { exports: {} as typeof original }
  const icons = new Proxy({}, { get: () => () => null })
  const context = {
    module,
    exports: module.exports,
    require: (name: string) => {
      if (name.startsWith("~components/icons")) return icons
      if (name === "~constants/shortcuts") return { SHORTCUT_META }
      if (name.endsWith("settings-data.ts"))
        return { readUserscriptSettingsData: (key: string) => data[key] }
      throw new Error(`Unexpected settings import: ${name}`)
    },
  }
  const output = ts.transpileModule(transformed, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  vm.runInNewContext(output, context)
  return { loaded: module.exports, data, resource, transformed }
}

describe("userscript settings data", () => {
  it("preserves all data and Set behavior while removing unused search groups", () => {
    const { loaded, transformed } = loadTransformedSettings()
    expect(loaded.SETTING_ID_ROUTE_MAP).toEqual(original.SETTING_ID_ROUTE_MAP)
    expect(loaded.SETTING_ID_ALIASES).toEqual(original.SETTING_ID_ALIASES)
    expect(loaded.SETTINGS_SEARCH_ITEMS).toEqual(original.SETTINGS_SEARCH_ITEMS)
    expect(Array.from(loaded.SETTING_CARD_LEVEL_SEARCH_IDS)).toEqual(
      Array.from(original.SETTING_CARD_LEVEL_SEARCH_IDS),
    )
    expect(loaded.SETTING_CARD_LEVEL_SEARCH_IDS.has("site-packs-registry")).toBe(true)
    expect(transformed).not.toContain("const SHORTCUT_SETTINGS_SEARCH_ITEMS")
    expect(transformed).not.toContain("const SETTING_CARD_SEARCH_ITEMS")
  })

  it("preserves exact routes, all aliases, prefix rules and legacy page redirects", () => {
    const { loaded, data } = loadTransformedSettings()
    const ids = [
      ...Object.keys(original.SETTING_ID_ROUTE_MAP),
      ...Object.keys(original.SETTING_ID_ALIASES),
      ...data.prefixRoutes.map((rule: { prefix: string }) => `${rule.prefix}future-setting`),
      "unknown",
      "",
      undefined,
    ]
    for (const id of ids) {
      expect(loaded.resolveSettingId(id)).toBe(original.resolveSettingId(id))
      expect(loaded.resolveSettingRoute(id)).toEqual(original.resolveSettingRoute(id))
      const detail = { settingId: id }
      expect(loaded.resolveSettingsNavigateDetail(detail)).toEqual(
        original.resolveSettingsNavigateDetail(detail),
      )
    }
    for (const page of ["globalSearch", "permissions", "general", undefined]) {
      expect(loaded.resolveSettingsNavigateDetail({ page })).toEqual(
        original.resolveSettingsNavigateDetail({ page }),
      )
    }
  })

  it("preserves search results, ranking, alias matching and limit semantics", () => {
    const { loaded } = loadTransformedSettings()
    const queries = [
      "",
      "主题",
      "theme",
      "prompt queue",
      "快捷键",
      "不存在的搜索词",
      ...original.SETTINGS_SEARCH_ITEMS.map((item) => item.title),
      ...Object.keys(original.SETTING_ID_ALIASES),
    ]
    for (const query of queries)
      expect(loaded.searchSettingsItems(query, 8)).toEqual(original.searchSettingsItems(query, 8))
    for (const limit of [undefined, 0, -1, 3, Infinity, NaN]) {
      expect(loaded.searchSettingsItems("", limit)).toEqual(original.searchSettingsItems("", limit))
    }
  })

  it("reads and validates the resource once", async () => {
    const resource = createUserscriptSettingsData(process.cwd())
    const read = vi.fn(() => resource.content)
    vi.stubGlobal("GM_getResourceText", read)
    const { readUserscriptSettingsData } = await import("../src/platform/userscript/settings-data")
    expect(readUserscriptSettingsData("routes")).toEqual(original.SETTING_ID_ROUTE_MAP)
    expect(readUserscriptSettingsData("items")).toEqual(original.SETTINGS_SEARCH_ITEMS)
    expect(read).toHaveBeenCalledExactlyOnceWith("ophelSettingsData")
  })

  it.each(["", "{", "null", "[]", "{}"])("rejects invalid resources: %s", async (text) => {
    vi.stubGlobal("GM_getResourceText", () => text)
    const { readUserscriptSettingsData } = await import("../src/platform/userscript/settings-data")
    expect(() => readUserscriptSettingsData("routes")).toThrow()
  })

  it.each(["routes", "aliases", "prefixRoutes", "legacyRoutes", "items", "cardIds"])(
    "rejects malformed field data: %s",
    async (field) => {
      const data = JSON.parse(createUserscriptSettingsData(process.cwd()).content)
      data[field] =
        field === "routes" || field === "aliases" || field === "legacyRoutes"
          ? { invalid: 42 }
          : [42]
      vi.stubGlobal("GM_getResourceText", () => JSON.stringify(data))
      const { readUserscriptSettingsData } = await import(
        "../src/platform/userscript/settings-data"
      )
      expect(() => readUserscriptSettingsData("routes")).toThrow("Invalid settings data")
    },
  )
})
