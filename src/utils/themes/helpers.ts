/**
 * 主题工具函数
 */

import { darkPresets } from "./dark"
import { lightPresets } from "./light"
import type { ThemePreset, ThemeVariables } from "./types"

// 获取默认的浅色主题
export const getDefaultLightPreset = (): ThemePreset => lightPresets[0]

// 获取默认的深色主题
export const getDefaultDarkPreset = (): ThemePreset => darkPresets[0]

// 根据 ID 查找主题
export const findPreset = (id: string, mode: "light" | "dark"): ThemePreset | undefined => {
  const presets = mode === "light" ? lightPresets : darkPresets
  return presets.find((p) => p.id === id)
}

// 获取当前模式的主题
export const getPreset = (presetId: string, mode: "light" | "dark"): ThemePreset => {
  const found = findPreset(presetId, mode)
  return found || (mode === "light" ? getDefaultLightPreset() : getDefaultDarkPreset())
}

// 将主题变量转换为 CSS 字符串
// ⭐ 使用 !important 确保动态注入的变量优先于静态定义的变量
export const themeVariablesToCSS = (variables: ThemeVariables): string => {
  return Object.entries(variables)
    .map(([key, value]) => `${key}: ${value} !important;`)
    .join("\n  ")
}
