import { resources, type LocaleKey } from "~locales/resources"

let currentLang: string = "en"

export function setLanguage(lang: string) {
  if (lang === "auto") {
    const browserLang = navigator.language
    if (browserLang.startsWith("zh-TW") || browserLang.startsWith("zh-HK")) {
      currentLang = "zh-TW"
    } else if (browserLang.startsWith("zh")) {
      currentLang = "zh-CN"
    } else {
      currentLang = "en"
    }
  } else {
    currentLang = lang
  }
}

export function t(key: string): string {
  const langResources = resources[currentLang as keyof typeof resources] || resources["en"]
  return (langResources[key as keyof typeof langResources] as string) || key
}
