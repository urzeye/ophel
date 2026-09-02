/**
 * 捐赠渠道：按产品 i18n 语言分流，而不是浏览器 UI 语言。
 * 仅 zh-CN 走爱发电 / 微信 / 支付宝；其余语言走 Ko-fi。
 */

import { getEffectiveLanguage } from "~utils/i18n"

const isUserscript = typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript"

export const KOFI_URL = "https://ko-fi.com/urzeye"
export const AFDIAN_URL = "https://afdian.com/a/urzeye"
export const GITHUB_REPO_URL = "https://github.com/urzeye/ophel"
export const OPHEL_WEBSITE_URL = "https://ophel.app"

export const SUPPORT_ASSET_FILES = {
  wechatPay: "assets/support/wechat-pay.jpg",
  alipay: "assets/support/alipay.png",
} as const

const USERSCRIPT_ASSET_KEY_BY_PATH: Record<string, string> = {
  [SUPPORT_ASSET_FILES.wechatPay]: "wechatPay",
  [SUPPORT_ASSET_FILES.alipay]: "alipay",
}

export type ZhCnDonateChannels = {
  kind: "zh-CN"
  primaryUrl: typeof AFDIAN_URL
  afdianUrl: typeof AFDIAN_URL
  wechatImagePath: typeof SUPPORT_ASSET_FILES.wechatPay
  alipayImagePath: typeof SUPPORT_ASSET_FILES.alipay
}

export type KofiDonateChannels = {
  kind: "kofi"
  primaryUrl: typeof KOFI_URL
  kofiUrl: typeof KOFI_URL
}

export type DonateChannels = ZhCnDonateChannels | KofiDonateChannels

export function usesZhCnDonateChannels(language: string): boolean {
  // 调用方可能传入设置里的原始值（默认 "auto"，如更新日志页脚），
  // 先解析成实际生效语言再判断，否则中文用户会被错误分流到 Ko-fi
  return getEffectiveLanguage(language) === "zh-CN"
}

export function getDonateChannels(language: string): DonateChannels {
  if (usesZhCnDonateChannels(language)) {
    return {
      kind: "zh-CN",
      primaryUrl: AFDIAN_URL,
      afdianUrl: AFDIAN_URL,
      wechatImagePath: SUPPORT_ASSET_FILES.wechatPay,
      alipayImagePath: SUPPORT_ASSET_FILES.alipay,
    }
  }

  return {
    kind: "kofi",
    primaryUrl: KOFI_URL,
    kofiUrl: KOFI_URL,
  }
}

export function resolveSupportImageUrl(assetPath: string): string {
  if (isUserscript) {
    const key = USERSCRIPT_ASSET_KEY_BY_PATH[assetPath]
    if (!key || typeof window === "undefined") return ""
    return window.__OPHEL_USERSCRIPT_ASSET_URLS__?.[key] || ""
  }

  return chrome.runtime.getURL(assetPath)
}
