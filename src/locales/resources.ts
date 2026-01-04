/**
 * 国际化资源
 */

import { en } from "./en"
import { zhCN } from "./zh-CN"
import { zhTW } from "./zh-TW"

export const resources = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  en: en,
}

export type LocaleKey = keyof typeof zhCN
