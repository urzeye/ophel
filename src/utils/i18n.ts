import { en } from "~locales/en"
import { MSG_GET_LOCALE_MESSAGES, sendToBackground, type AppLocale } from "~utils/messaging"

type LocaleMessages = Record<string, string>
type I18nChangeListener = () => void
type SupportedLocale = AppLocale

const DEFAULT_LOCALE: SupportedLocale = "en"
export const I18N_LANGUAGE_CHANGE_EVENT = "ophel:i18n-language-change"

const localeCache: Partial<Record<SupportedLocale, LocaleMessages>> = { en }
const localeLoads = new Map<SupportedLocale, Promise<LocaleMessages>>()
const listeners = new Set<I18nChangeListener>()
const reportedLocaleLoadFailures = new Set<SupportedLocale>()

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

  return isSupportedLocale(lang) ? lang : DEFAULT_LOCALE
}

function isSupportedLocale(lang: unknown): lang is SupportedLocale {
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
      return true
    default:
      return false
  }
}

async function importLocale(locale: SupportedLocale): Promise<LocaleMessages> {
  if (locale === DEFAULT_LOCALE) return en

  const response = await sendToBackground({ type: MSG_GET_LOCALE_MESSAGES, locale })
  if (!response.success || !response.messages) {
    throw new Error(response.error || `Failed to load locale messages: ${locale}`)
  }

  return response.messages
}

async function loadLocale(locale: SupportedLocale): Promise<LocaleMessages> {
  const cached = localeCache[locale]
  if (cached) return cached

  const pending = localeLoads.get(locale)
  if (pending) return pending

  const load = importLocale(locale).then(
    (messages) => {
      localeCache[locale] = messages
      localeLoads.delete(locale)
      return messages
    },
    (error: unknown) => {
      localeLoads.delete(locale)
      throw error
    },
  )
  localeLoads.set(locale, load)
  return load
}

function notifyI18nChange(): void {
  listeners.forEach((listener) => listener())
}

function getSharedLanguage(): SupportedLocale | null {
  if (typeof window === "undefined") return null
  return isSupportedLocale(window.__ophelLanguageRuntime) ? window.__ophelLanguageRuntime : null
}

let currentLang: SupportedLocale = getSharedLanguage() ?? getBrowserLang()
let languageRequestVersion = 0
let observedSharedLanguageVersion =
  typeof window === "undefined" ? 0 : window.__ophelLanguageRuntimeVersion ?? 0

async function applyLanguage(nextLang: SupportedLocale, broadcast: boolean): Promise<void> {
  const requestVersion = ++languageRequestVersion
  let effectiveLang = nextLang

  try {
    await loadLocale(nextLang)
  } catch (error) {
    effectiveLang = DEFAULT_LOCALE
    if (!reportedLocaleLoadFailures.has(nextLang)) {
      reportedLocaleLoadFailures.add(nextLang)
      console.error(`[Ophel] Failed to load locale "${nextLang}"; using English instead.`, error)
    }
  }

  // A slower locale request must not overwrite a newer language selection.
  if (requestVersion !== languageRequestVersion) return

  const previousLang = currentLang
  currentLang = effectiveLang

  if (broadcast && typeof window !== "undefined") {
    window.__ophelLanguageRuntime = nextLang
    observedSharedLanguageVersion = (window.__ophelLanguageRuntimeVersion ?? 0) + 1
    window.__ophelLanguageRuntimeVersion = observedSharedLanguageVersion
    window.dispatchEvent(new Event(I18N_LANGUAGE_CHANGE_EVENT))
  }

  if (previousLang !== effectiveLang || nextLang !== DEFAULT_LOCALE) {
    notifyI18nChange()
  }
}

function handleSharedLanguageChange(): void {
  const sharedVersion = window.__ophelLanguageRuntimeVersion ?? 0
  const sharedLanguage = getSharedLanguage()
  if (sharedVersion <= observedSharedLanguageVersion || !sharedLanguage) return

  observedSharedLanguageVersion = sharedVersion
  void applyLanguage(sharedLanguage, false).catch((error: unknown) => {
    console.error("[Ophel] Failed to synchronize i18n language:", error)
  })
}

if (typeof window !== "undefined") {
  window.addEventListener(I18N_LANGUAGE_CHANGE_EVENT, handleSharedLanguageChange)

  const sharedLanguage = getSharedLanguage()
  if (sharedLanguage && sharedLanguage !== DEFAULT_LOCALE) {
    void applyLanguage(sharedLanguage, false).catch((error: unknown) => {
      console.error("[Ophel] Failed to initialize shared i18n language:", error)
    })
  }
}

export async function setLanguage(lang: string): Promise<void> {
  await applyLanguage(resolveLocale(lang), true)
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
