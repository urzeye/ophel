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

// 同步读取脚本管理器安装时缓存的资源，主题初始化不依赖运行时网络请求。
export const lightPresets = presets.lightPresets
export const darkPresets = presets.darkPresets
