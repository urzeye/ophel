import {
  USERSCRIPT_LOCALE_RESOURCE_DEFINITIONS,
  type UserscriptLocale,
  isUserscriptLocale,
} from "./resource-manifest"

declare function GM_getResourceText(name: string): string
declare function GM_getValue<T>(key: string, defaultValue?: T): T

type LocaleMessages = Record<string, string>
type I18nChangeListener = () => void

const DEFAULT_LOCALE: UserscriptLocale = "en"
const localeCache: Partial<Record<UserscriptLocale, LocaleMessages>> = {}
const listeners = new Set<I18nChangeListener>()

const getBrowserLang = (): UserscriptLocale => {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE

  const lang = navigator.language
  if (lang.startsWith("zh-TW") || lang.startsWith("zh-HK")) return "zh-TW"
  if (lang.startsWith("zh")) return "zh-CN"
  if (lang.startsWith("ja")) return "ja"
  if (lang.startsWith("ko")) return "ko"
  if (lang.startsWith("fr")) return "fr"
  if (lang.startsWith("de")) return "de"
  if (lang.startsWith("ru")) return "ru"
  if (lang.startsWith("es")) return "es"
  if (lang.startsWith("pt")) return "pt"
  return DEFAULT_LOCALE
}

let currentLang: UserscriptLocale = getBrowserLang()

function notifyI18nChange() {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch (error) {
      console.warn("[Ophel] Userscript i18n listener failed:", error)
    }
  })
}

function resolveLocale(lang: string | undefined | null): UserscriptLocale {
  if (!lang || lang === "auto") {
    return getBrowserLang()
  }

  if (isUserscriptLocale(lang)) {
    return lang
  }

  if (lang.startsWith("zh-TW") || lang.startsWith("zh-HK")) return "zh-TW"
  if (lang.startsWith("zh")) return "zh-CN"
  if (lang.startsWith("ja")) return "ja"
  if (lang.startsWith("ko")) return "ko"
  if (lang.startsWith("fr")) return "fr"
  if (lang.startsWith("de")) return "de"
  if (lang.startsWith("ru")) return "ru"
  if (lang.startsWith("es")) return "es"
  if (lang.startsWith("pt")) return "pt"

  return DEFAULT_LOCALE
}

function loadLocaleMessages(locale: UserscriptLocale): LocaleMessages {
  const cached = localeCache[locale]
  if (cached) {
    return cached
  }

  const resourceName = USERSCRIPT_LOCALE_RESOURCE_DEFINITIONS[locale].metaName

  try {
    const text = GM_getResourceText(resourceName)
    if (!text) {
      localeCache[locale] = {}
      return localeCache[locale]
    }

    const parsed = JSON.parse(text) as LocaleMessages
    localeCache[locale] = parsed
    return parsed
  } catch (error) {
    console.warn(`[Ophel] Failed to load userscript locale resource: ${locale}`, error)
    localeCache[locale] = {}
    return localeCache[locale]
  }
}

function extractStoredLanguage(rawSettings: unknown): string | undefined {
  if (!rawSettings) {
    return undefined
  }

  try {
    const parsed = typeof rawSettings === "string" ? JSON.parse(rawSettings) : rawSettings
    const language =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { state?: { settings?: { language?: unknown } } }).state?.settings?.language
        : undefined

    return typeof language === "string" ? language : undefined
  } catch (error) {
    console.warn("[Ophel] Failed to parse persisted settings language:", error)
    return undefined
  }
}

export function primeUserscriptLocales(lang?: string): UserscriptLocale {
  const resolvedLang = resolveLocale(lang)
  currentLang = resolvedLang

  loadLocaleMessages(DEFAULT_LOCALE)
  if (resolvedLang !== DEFAULT_LOCALE) {
    loadLocaleMessages(resolvedLang)
  }

  return resolvedLang
}

export function getInitialUserscriptLanguage(): string {
  return extractStoredLanguage(GM_getValue("settings")) || "auto"
}

export function subscribeI18nChanges(listener: I18nChangeListener): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function setLanguage(lang: string) {
  const nextLang = resolveLocale(lang)
  const previousLang = currentLang

  currentLang = nextLang
  loadLocaleMessages(DEFAULT_LOCALE)
  loadLocaleMessages(nextLang)

  if (previousLang !== nextLang) {
    notifyI18nChange()
  }
}

export function getEffectiveLanguage(settingLang: string): string {
  return resolveLocale(settingLang)
}

export function t(key: string, params?: Record<string, string>): string {
  const langResources = loadLocaleMessages(currentLang)
  const fallbackResources =
    currentLang === DEFAULT_LOCALE ? langResources : loadLocaleMessages(DEFAULT_LOCALE)
  let text = langResources[key] || fallbackResources[key] || key

  if (params) {
    Object.keys(params).forEach((paramKey) => {
      text = text.replace(new RegExp(`{${paramKey}}`, "g"), params[paramKey])
    })
  }

  return text
}

export function getCurrentLang(): string {
  return currentLang
}
