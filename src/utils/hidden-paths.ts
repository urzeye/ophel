/**
 * 隐藏页面规则：判断页面路径（location.pathname）是否命中某个站点的规则
 *
 * - 普通规则：* 代表任意内容（含 /），其余字符须与整条路径一致，如 /artifact/* 命中所有 artifact 页面
 * - 正则规则：pattern 作为正则表达式对路径做 test，锚点由用户自己写
 *
 * 比对区分大小写，与 URL 路径语义一致。
 */
import type { HiddenPathRule } from "~types/settings"

export type HiddenPathInputError = "invalidUrl" | "invalidRegex"

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g

const wildcardToRegExp = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern
      .split("*")
      .map((part) => part.replace(REGEXP_SPECIALS, "\\$&"))
      .join(".*")}$`,
  )

/** 编译单条规则；正则无效时返回 null，该规则不生效（设置页会把它标成无效） */
export const compileHiddenPathRule = (rule: HiddenPathRule): RegExp | null => {
  if (!rule.regex) return wildcardToRegExp(rule.pattern)

  try {
    return new RegExp(rule.pattern)
  } catch {
    return null
  }
}

export const matchesHiddenPath = (
  rules: readonly HiddenPathRule[] | undefined,
  pathname: string,
): boolean => rules?.some((rule) => compileHiddenPathRule(rule)?.test(pathname) === true) ?? false

/**
 * 把输入框内容转成规则。
 * 普通规则按网址解析：粘贴完整网址只取路径，漏写开头的 / 自动补上，? 和 # 之后的部分不属于路径、直接去掉；
 * 以 * 开头的输入保持原样，避免被补成 /* 后少匹配根路径下的页面。
 */
export const parseHiddenPathInput = (
  input: string,
  regex: boolean,
): { rule: HiddenPathRule } | { error: HiddenPathInputError } => {
  const pattern = input.trim()

  if (regex) {
    const rule = { pattern, regex: true }
    return compileHiddenPathRule(rule) ? { rule } : { error: "invalidRegex" }
  }

  if (pattern.startsWith("*")) return { rule: { pattern, regex: false } }

  let url: URL
  try {
    url = new URL(pattern, "https://ophel.invalid")
  } catch {
    return { error: "invalidUrl" }
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "invalidUrl" }
  return { rule: { pattern: url.pathname, regex: false } }
}
