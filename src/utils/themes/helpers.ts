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

const ROOT_BASE_SELECTOR = /^(?::host|:root|html)$/i
const ROOT_MODE_SELECTOR =
  /^(?::host\(\s*\[data-theme\s*=\s*["']?(light|dark)["']?\s*\]\s*\)|(?::root|html)?\[data-theme\s*=\s*["']?(light|dark)["']?\])$/i
const GH_VAR_NAME = /^--gh-[a-zA-Z0-9-]+$/

function stripCssComments(css: string): string {
  let result = ""
  let quote: '"' | "'" | null = null

  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (quote) {
      result += ch
      if (ch === "\\" && i + 1 < css.length) {
        result += css[++i]
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      result += ch
    } else if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2)
      result += " "
      if (end === -1) break
      i = end + 1
    } else {
      result += ch
    }
  }
  return result
}

function parseThemeDeclarations(body: string, target: Record<string, string>): void {
  let start = 0
  let quote: '"' | "'" | null = null
  let parenDepth = 0

  const flush = (end: number) => {
    const raw = body.slice(start, end).trim()
    if (!raw) return
    const colonIndex = raw.indexOf(":")
    if (colonIndex === -1) return
    const key = raw.slice(0, colonIndex).trim()
    if (!GH_VAR_NAME.test(key)) return
    const value = raw
      .slice(colonIndex + 1)
      .replace(/\s*!important\s*$/i, "")
      .trim()
    if (value) target[key] = value
  }

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quote) {
      if (ch === "\\") {
        i++
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === "(") {
      parenDepth++
    } else if (ch === ")" && parenDepth > 0) {
      parenDepth--
    } else if (ch === ";" && parenDepth === 0) {
      flush(i)
      start = i + 1
    }
  }
  flush(body.length)
}

/**
 * 从自定义样式 CSS 的顶层根选择器（:host / :root / html 及对应明暗属性块）提取 --gh-* 主题变量。
 * 同时用于自定义样式预览与 ThemeManager 同步到 documentElement（供 Portal 弹窗继承）。
 * 跳过 @media/@supports 等嵌套规则与局部后代选择器，并保留引号/括号内的分号（如 data: URL）。
 */
export const parseThemeVariablesFromCSS = (
  css: string,
  mode?: "light" | "dark",
): Partial<ThemeVariables> => {
  const cleaned = stripCssComments(css)
  const baseVars: Record<string, string> = {}
  const modeVars: Record<string, string> = {}

  let depth = 0
  let quote: '"' | "'" | null = null
  let headerStart = 0
  let bodyStart = -1
  let currentHeader = ""

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (quote) {
      if (ch === "\\") {
        i++
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === ";" && depth === 0) {
      headerStart = i + 1
      continue
    }
    if (ch === "{") {
      if (depth === 0) {
        currentHeader = cleaned.slice(headerStart, i).trim()
        bodyStart = i + 1
      }
      depth++
      continue
    }
    if (ch === "}" && depth > 0) {
      depth--
      if (depth === 0) {
        if (currentHeader && !currentHeader.startsWith("@")) {
          const selectors = currentHeader.split(",").map((item) => item.trim())
          let target: Record<string, string> | null = null
          for (const selector of selectors) {
            const modeMatch = ROOT_MODE_SELECTOR.exec(selector)
            if (modeMatch) {
              const matchedMode = modeMatch[1].toLowerCase()
              if (!mode || matchedMode === mode) {
                target = modeVars
                break
              }
              continue
            }
            if (ROOT_BASE_SELECTOR.test(selector)) {
              target = baseVars
            }
          }
          if (target) {
            parseThemeDeclarations(cleaned.slice(bodyStart, i), target)
          }
        }
        headerStart = i + 1
      }
    }
  }

  return { ...baseVars, ...modeVars } as Partial<ThemeVariables>
}
