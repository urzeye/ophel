import { resources, type LocaleKey } from "~locales/resources"

// 初始化根据浏览器语言设置
const getBrowserLang = () => {
  if (typeof navigator === "undefined") return "en"
  const lang = navigator.language
  if (lang.startsWith("zh-TW") || lang.startsWith("zh-HK")) return "zh-TW"
  if (lang.startsWith("zh")) return "zh-CN"
  return "en"
}

let currentLang: string = getBrowserLang()

export function setLanguage(lang: string) {
  if (lang === "auto") {
    currentLang = getBrowserLang()
  } else {
    currentLang = lang
  }
}

// 获取当前实际生效的语言（用于 UI 高亮显示）
export function getEffectiveLanguage(settingLang: string): string {
  if (settingLang === "auto") {
    return getBrowserLang()
  }
  return settingLang
}

export function t(key: string): string {
  const langResources = resources[currentLang as keyof typeof resources] || resources["en"]
  return (langResources[key as keyof typeof langResources] as string) || key
}
