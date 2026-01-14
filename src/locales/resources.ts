/**
 * 国际化资源
 */

import { de } from "./de"
import { en } from "./en"
import { es } from "./es"
import { fr } from "./fr"
import { ja } from "./ja"
import { ko } from "./ko"
import { pt } from "./pt"
import { ru } from "./ru"
import { zhCN } from "./zh-CN"
import { zhTW } from "./zh-TW"

export const resources = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  en: en,
  ja: ja,
  ko: ko,
  fr: fr,
  de: de,
  ru: ru,
  es: es,
  pt: pt,
}

export type LocaleKey = keyof typeof zhCN
