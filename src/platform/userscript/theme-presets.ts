import type { ThemePreset } from "../../utils/themes/types"

import { USERSCRIPT_RESOURCE_DEFINITIONS } from "./resource-manifest"

declare function GM_getResourceText(name: string): string

function isPresetList(value: unknown): value is ThemePreset[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (preset) =>
        preset !== null &&
        typeof preset === "object" &&
        typeof preset.id === "string" &&
        typeof preset.name === "string" &&
        preset.variables !== null &&
        typeof preset.variables === "object" &&
        !Array.isArray(preset.variables) &&
        Object.values(preset.variables).every((value) => typeof value === "string") &&
        typeof preset.variables["--gh-bg"] === "string",
    )
  )
}

let cachedPresets: { lightPresets: ThemePreset[]; darkPresets: ThemePreset[] } | undefined

function loadThemePresets(): { lightPresets: ThemePreset[]; darkPresets: ThemePreset[] } {
  if (cachedPresets) return cachedPresets

  const resourceName = USERSCRIPT_RESOURCE_DEFINITIONS.themePresets.metaName
  const text = GM_getResourceText(resourceName)
  if (!text) throw new Error(`[Ophel] Required resource is missing: ${resourceName}`)

  const presets: unknown = JSON.parse(text)
  if (
    !presets ||
    typeof presets !== "object" ||
    !("lightPresets" in presets) ||
    !("darkPresets" in presets) ||
    !isPresetList(presets.lightPresets) ||
    !isPresetList(presets.darkPresets)
  ) {
    throw new Error(`[Ophel] Invalid theme presets resource: ${resourceName}`)
  }

  cachedPresets = {
    lightPresets: presets.lightPresets,
    darkPresets: presets.darkPresets,
  }
  return cachedPresets
}

function createLazyPresetList(key: "lightPresets" | "darkPresets"): ThemePreset[] {
  const target: ThemePreset[] = []
  let populated = false
  const ensurePopulated = () => {
    if (!populated) {
      target.push(...loadThemePresets()[key])
      populated = true
    }
    return target
  }
  return new Proxy(target, {
    get(_target, prop, receiver) {
      return Reflect.get(ensurePopulated(), prop, receiver)
    },
    has(_target, prop) {
      return Reflect.has(ensurePopulated(), prop)
    },
    ownKeys() {
      return Reflect.ownKeys(ensurePopulated())
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(ensurePopulated(), prop)
    },
  })
}

// 延迟到首次读取预设时同步加载缓存资源，避免在非白名单站点顶层触发 GM_getResourceText。
export const lightPresets = createLazyPresetList("lightPresets")
export const darkPresets = createLazyPresetList("darkPresets")
