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
// 使用 !important 确保动态注入的变量优先于静态定义的变量
export const themeVariablesToCSS = (variables: ThemeVariables): string => {
  return Object.entries(variables)
    .map(([key, value]) => `${key}: ${value} !important;`)
    .join("\n  ")
}

/**
 * 从 CSS 字符串中解析主题变量
 * 用于自定义样式的实时预览
 */
export const parseThemeVariablesFromCSS = (css: string): Partial<ThemeVariables> => {
  const variables: Partial<ThemeVariables> = {}

  // 匹配 CSS 变量声明: --variable-name: value;
  // 兼容多行和不同格式
  const regex = /(--[\w-]+)\s*:\s*([^;]+);/g

  let match
  while ((match = regex.exec(css)) !== null) {
    const key = match[1] as keyof ThemeVariables
    const value = match[2].trim()
    variables[key] = value
  }

  return variables
}
