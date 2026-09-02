import { existsSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AFDIAN_URL,
  KOFI_URL,
  SUPPORT_ASSET_FILES,
  getDonateChannels,
  resolveSupportImageUrl,
  usesZhCnDonateChannels,
} from "~utils/donate-channels"

const repoRoot = fileURLToPath(new URL("../..", import.meta.url))

describe("getDonateChannels", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("maps zh-CN to Afdian plus WeChat and Alipay assets", () => {
    const channels = getDonateChannels("zh-CN")

    expect(usesZhCnDonateChannels("zh-CN")).toBe(true)
    expect(channels.kind).toBe("zh-CN")
    expect(channels.primaryUrl).toBe(AFDIAN_URL)
    expect(channels.primaryUrl).toBe("https://afdian.com/a/urzeye")

    if (channels.kind !== "zh-CN") {
      throw new Error("expected zh-CN donate channels")
    }

    expect(channels.afdianUrl).toBe(AFDIAN_URL)
    expect(channels.wechatImagePath).toBe(SUPPORT_ASSET_FILES.wechatPay)
    expect(channels.alipayImagePath).toBe(SUPPORT_ASSET_FILES.alipay)
    expect(channels.wechatImagePath).toBe("assets/support/wechat-pay.jpg")
    expect(channels.alipayImagePath).toBe("assets/support/alipay.png")
  })

  it("keeps Ko-fi and omits WeChat/Alipay for other product languages", () => {
    for (const language of ["zh-TW", "en", "ja", "ko", "it", "de", "es", "fr", "pt", "ru"]) {
      const channels = getDonateChannels(language)

      expect(usesZhCnDonateChannels(language)).toBe(false)
      expect(channels.kind).toBe("kofi")
      expect(channels.primaryUrl).toBe(KOFI_URL)
      expect(channels.primaryUrl).toBe("https://ko-fi.com/urzeye")
      expect("wechatImagePath" in channels).toBe(false)
      expect("alipayImagePath" in channels).toBe(false)
    }
  })

  it('resolves the "auto" setting through the browser language before routing', () => {
    // 设置默认值是 "auto"，更新日志页脚会直接传入原始值
    vi.stubGlobal("navigator", { language: "zh-CN" })
    expect(usesZhCnDonateChannels("auto")).toBe(true)
    expect(getDonateChannels("auto").primaryUrl).toBe(AFDIAN_URL)

    vi.stubGlobal("navigator", { language: "zh-TW" })
    expect(getDonateChannels("auto").primaryUrl).toBe(KOFI_URL)

    vi.stubGlobal("navigator", { language: "en-US" })
    expect(getDonateChannels("auto").primaryUrl).toBe(KOFI_URL)
  })

  it("resolves support images through the extension runtime URL", () => {
    expect(resolveSupportImageUrl(SUPPORT_ASSET_FILES.wechatPay)).toBe(
      `chrome-extension://ophel-test/${SUPPORT_ASSET_FILES.wechatPay}`,
    )
    expect(resolveSupportImageUrl(SUPPORT_ASSET_FILES.alipay)).toBe(
      `chrome-extension://ophel-test/${SUPPORT_ASSET_FILES.alipay}`,
    )
  })

  it("ships WeChat JPEG and a compressed Alipay PNG under assets/support", () => {
    const wechatPath = path.join(repoRoot, SUPPORT_ASSET_FILES.wechatPay)
    const alipayPath = path.join(repoRoot, SUPPORT_ASSET_FILES.alipay)
    const wechatSourcePath = path.join(repoRoot, "docs/media/support/wechat-pay.jpg")

    expect(existsSync(wechatPath)).toBe(true)
    expect(existsSync(alipayPath)).toBe(true)
    expect(statSync(wechatPath).size).toBe(statSync(wechatSourcePath).size)
    expect(statSync(alipayPath).size).toBeLessThan(185_000)
  })
})
