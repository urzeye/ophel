/**
 * 国际化（浏览器扩展实现）
 *
 * 语言资源不再整体打进 JS bundle：11 种语言约 1.1MB，内联会放大每个
 * 入口产物并触发 Firefox AMO 的单文件 5MB 解析上限。构建期由
 * scripts/prepare-locale-assets.ts 生成 assets/locales/messages.json，
 * 运行时经 initI18n() 一次性 fetch 进内存，之后 t() 保持同步读取。
 * en 静态打进 bundle 兜底：加载完成前或失败时 t() 回退英文，不暴露原始 key。
 *
 * 油猴构建中本模块被 alias 到 src/platform/userscript/i18n.ts
 * （GM @resource 同步实现），两端通过 initI18n() 契约对接共享初始化路径。
 */

import { en } from "~locales/en"
import { getBundledOutlineSourceMessage } from "~locales/outline-sources"

type LocaleMessages = typeof en
type LocaleResources = Record<string, LocaleMessages>
type I18nChangeListener = () => void

const FALLBACK_LANG = "en"

// initI18n() 成功后替换为完整的 11 语言快照
let resources: LocaleResources = { [FALLBACK_LANG]: en }

// 初始化根据浏览器语言设置
const getBrowserLang = () => {
  if (typeof navigator === "undefined") return FALLBACK_LANG
  const lang = navigator.language
  if (lang.startsWith("zh-TW") || lang.startsWith("zh-HK")) return "zh-TW"
  if (lang.startsWith("zh")) return "zh-CN"
  if (lang.startsWith("ja")) return "ja"
  if (lang.startsWith("ko")) return "ko"
  if (lang.startsWith("it")) return "it"
  if (lang.startsWith("fr")) return "fr"
  if (lang.startsWith("de")) return "de"
  if (lang.startsWith("ru")) return "ru"
  if (lang.startsWith("es")) return "es"
  if (lang.startsWith("pt")) return "pt"
  return FALLBACK_LANG
}

let currentLang: string = getBrowserLang()
const listeners = new Set<I18nChangeListener>()

let initPromise: Promise<void> | null = null

/**
 * 加载打包的语言资源（幂等）。
 *
 * 仅在扩展运行环境（chrome.runtime.getURL 可用）执行 fetch；其他环境
 * （如 Vitest、油猴 vendor 构建）保持 en 兜底。永不 reject：
 * 失败时保留 en 兜底并输出错误日志。
 */
export function initI18n(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return

      const response = await fetch(chrome.runtime.getURL("assets/locales/messages.json"))
      if (!response.ok) {
        throw new Error(`unexpected status ${response.status}`)
      }

      resources = (await response.json()) as LocaleResources
    } catch (error) {
      console.error("[Ophel] Failed to load locale resources; falling back to English:", error)
    }
  })()

  return initPromise
}

export function subscribeI18nChanges(listener: I18nChangeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setLanguage(lang: string) {
  const nextLang = lang === "auto" ? getBrowserLang() : lang
  if (nextLang === currentLang) return

  currentLang = nextLang
  listeners.forEach((listener) => listener())
}

// 获取当前实际生效的语言（用于 UI 高亮显示）
export function getEffectiveLanguage(settingLang: string): string {
  if (settingLang === "auto") {
    return getBrowserLang()
  }
  return settingLang
}

export function t(key: string, params?: Record<string, string | number>): string {
  const langResources = resources[currentLang]
  const enResources = resources[FALLBACK_LANG]
  let text =
    (langResources?.[key as keyof LocaleMessages] as string) ||
    getBundledOutlineSourceMessage(currentLang, key) ||
    (enResources[key as keyof LocaleMessages] as string) ||
    en[key as keyof LocaleMessages] ||
    key

  if (params) {
    Object.keys(params).forEach((paramKey) => {
      text = text.replace(new RegExp(`{${paramKey}}`, "g"), String(params[paramKey]))
    })
  }

  return text
}

export function getAllLocalizedTexts(key: string): string[] {
  return Array.from(
    new Set(
      Object.values(resources)
        .map((resource) => resource[key as keyof typeof resource])
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  )
}

export function getCurrentLang(): string {
  return currentLang
}

// 应用语言到 BCP 47 locale 的映射，用于日期时间等本地化格式化
const LOCALE_MAP: Record<string, string> = {
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
  en: "en",
  ja: "ja",
  ko: "ko",
  it: "it",
  de: "de",
  es: "es",
  fr: "fr",
  pt: "pt",
  ru: "ru",
}

export function getCurrentLocale(): string {
  return LOCALE_MAP[currentLang] ?? "en"
}
