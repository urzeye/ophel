import { en } from "~locales/en"

type LocaleMessages = Record<string, string>
type I18nChangeListener = () => void
type SupportedLocale =
  | "zh-CN"
  | "zh-TW"
  | "en"
  | "ja"
  | "ko"
  | "it"
  | "fr"
  | "de"
  | "ru"
  | "es"
  | "pt"

const DEFAULT_LOCALE: SupportedLocale = "en"
const localeCache: Partial<Record<SupportedLocale, LocaleMessages>> = { en }
const localeLoads = new Map<SupportedLocale, Promise<LocaleMessages>>()
const listeners = new Set<I18nChangeListener>()

const ALL_LOCALIZED_TEXTS: Record<string, string[]> = {
  untitledConversation: [
    "未命名会话",
    "未命名會話",
    "Untitled conversation",
    "無題の会話",
    "제목 없는 대화",
    "Conversazione senza titolo",
    "Sans titre",
    "Unbenannt",
    "Без темы",
    "Sin título",
    "Sem título",
  ],
}

const getBrowserLang = (): SupportedLocale => {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE
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
  return DEFAULT_LOCALE
}

function resolveLocale(lang: string | undefined | null): SupportedLocale {
  if (!lang || lang === "auto") return getBrowserLang()

  switch (lang) {
    case "zh-CN":
    case "zh-TW":
    case "en":
    case "ja":
    case "ko":
    case "it":
    case "fr":
    case "de":
    case "ru":
    case "es":
    case "pt":
      return lang
    default:
      return DEFAULT_LOCALE
  }
}

async function importLocale(locale: SupportedLocale): Promise<LocaleMessages> {
  switch (locale) {
    case "zh-CN":
      return (await import("~locales/zh-CN")).zhCN
    case "zh-TW":
      return (await import("~locales/zh-TW")).zhTW
    case "ja":
      return (await import("~locales/ja")).ja
    case "ko":
      return (await import("~locales/ko")).ko
    case "it":
      return (await import("~locales/it")).it
    case "fr":
      return (await import("~locales/fr")).fr
    case "de":
      return (await import("~locales/de")).de
    case "ru":
      return (await import("~locales/ru")).ru
    case "es":
      return (await import("~locales/es")).es
    case "pt":
      return (await import("~locales/pt")).pt
    case "en":
      return en
  }
}

async function loadLocale(locale: SupportedLocale): Promise<LocaleMessages> {
  const cached = localeCache[locale]
  if (cached) return cached

  const pending = localeLoads.get(locale)
  if (pending) return pending

  const load = importLocale(locale).then((messages) => {
    localeCache[locale] = messages
    localeLoads.delete(locale)
    return messages
  })
  localeLoads.set(locale, load)
  return load
}

function notifyI18nChange(): void {
  listeners.forEach((listener) => listener())
}

let currentLang: SupportedLocale = getBrowserLang()

export async function setLanguage(lang: string): Promise<void> {
  const nextLang = resolveLocale(lang)
  const previousLang = currentLang
  currentLang = nextLang

  await loadLocale(nextLang)
  if (currentLang === nextLang && (previousLang !== nextLang || nextLang !== DEFAULT_LOCALE)) {
    notifyI18nChange()
  }
}

export function subscribeI18nChanges(listener: I18nChangeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getEffectiveLanguage(settingLang: string): string {
  return resolveLocale(settingLang)
}

export function t(key: string, params?: Record<string, string>): string {
  const langResources = localeCache[currentLang]
  let text = langResources?.[key] || en[key as keyof typeof en] || key

  if (params) {
    Object.keys(params).forEach((paramKey) => {
      text = text.replace(new RegExp(`{${paramKey}}`, "g"), params[paramKey])
    })
  }

  return text
}

export function getAllLocalizedTexts(key: string): string[] {
  return ALL_LOCALIZED_TEXTS[key] || [t(key)]
}

export function getCurrentLang(): string {
  return currentLang
}
