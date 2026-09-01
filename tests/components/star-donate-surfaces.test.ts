import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { resources } from "~locales/resources"
import { AFDIAN_PROFILE, GITHUB_REPO_URL, OPHEL_WEBSITE_URL } from "~utils/donate-channels"

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")

const compact = (source: string): string => source.replace(/\s+/g, " ")

const releaseNotesCss = compact(readSource("../../src/styles/release-notes.css"))

const disclaimerSource = readSource("../../src/components/DisclaimerModal.tsx")
const aboutSource = readSource("../../src/tabs/options/pages/AboutPage.tsx")
const releaseNotesSource = readSource("../../src/components/ReleaseNotesModal.tsx")
const sidebarSource = readSource("../../src/components/SidebarCommunityLinks.tsx")
const popupSource = readSource("../../src/popup.tsx")
const mainPanelSource = readSource("../../src/components/MainPanel.tsx")

describe("star and donate surfaces", () => {
  it("keeps the first-run disclaimer legal-only", () => {
    const source = compact(disclaimerSource)

    expect(source).toContain('t("agreeButton")')
    expect(source).toContain('t("disclaimerWarning")')
    expect(source).toContain("GITHUB_REPO_URL")
    expect(source).not.toContain('t("giveStar")')
    expect(source).not.toContain("getStoreInfo")
    expect(source).not.toContain("star-btn")
    expect(source).not.toContain("review-btn")
    expect(source).not.toContain("ko-fi.com")
    expect(source).not.toContain("afdian")
    expect(source).not.toContain("wechat")
    expect(source).not.toContain("alipay")
    expect(source).not.toContain("kofiSupport")
  })

  it("wires About to Afdian picture sources, the website, and locale donate channels", () => {
    expect(aboutSource).toContain("getDonateChannels")
    expect(aboutSource).toContain("about-sponsor-qrs")
    expect(aboutSource).toContain("about-sponsor-qr-zoom")
    expect(aboutSource).toContain("about-sponsor-lightbox")
    expect(aboutSource).toContain("AFDIAN_PROFILE.darkSrc")
    expect(aboutSource).toContain("AFDIAN_PROFILE.lightSrc")
    expect(aboutSource).toContain("OPHEL_WEBSITE_URL")
    expect(aboutSource).toContain("donateChannels.wechatImagePath")
    expect(aboutSource).toContain("donateChannels.alipayImagePath")
    expect(AFDIAN_PROFILE.darkSrc).toContain(
      "https://afdian-connect.vercel.app/profile.svg?slug=urzeye&bg_color=%230d1117",
    )
    expect(AFDIAN_PROFILE.lightSrc).toBe(
      "https://afdian-connect.vercel.app/profile.svg?slug=urzeye",
    )
    expect(OPHEL_WEBSITE_URL).toBe("https://ophel.app")
    expect(aboutSource.indexOf('t("communityAndSupport")')).toBeLessThan(
      aboutSource.indexOf('t("sponsorSupport")'),
    )
    expect(aboutSource.indexOf('t("sponsorSupport")')).toBeLessThan(
      aboutSource.indexOf('t("rateAndReview")'),
    )
    expect(aboutSource).toContain("community-grid-triple")
  })

  it("adds a weak Release Notes Star link without replacing the changelog control", () => {
    const source = compact(releaseNotesSource)

    expect(source).toContain("gh-release-notes-star-link")
    expect(source).toContain("gh-release-notes-secondary")
    expect(source).toContain("GithubIcon")
    expect(source).toContain("GITHUB_REPO_URL")
    expect(source).toContain('t("giveStar")')
    expect(source).toContain("onOpenFullChangelog")
    expect(source).toContain('t("releaseNotesViewFull")')
    expect(GITHUB_REPO_URL).toBe("https://github.com/urzeye/ophel")
    expect(releaseNotesCss).toContain(
      ".gh-release-notes-primary { border: 1px solid var(--gh-primary, #4285f4);",
    )
    expect(releaseNotesCss).toContain(
      "background: var(--gh-bg, #ffffff); color: var(--gh-primary, #4285f4);",
    )
    expect(releaseNotesCss).not.toContain(
      ".gh-release-notes-primary { border: 1px solid transparent; padding: 0 14px; background: var(--gh-primary, #4285f4);",
    )
  })

  it("points sidebar and popup coffee actions at the shared donate primary URL", () => {
    expect(sidebarSource).toContain("getDonateChannels")
    expect(sidebarSource).toContain("joinDiscordCommunity")
    expect(sidebarSource).toContain("donateChannels.primaryUrl")
    expect(sidebarSource).not.toContain("https://ko-fi.com/urzeye")
    expect(popupSource).toContain("getDonateChannels")
    expect(popupSource).toContain("donateChannels.primaryUrl")
    expect(popupSource).not.toContain("https://ko-fi.com/urzeye")
  })

  it("does not add Star or donate CTAs to the main panel", () => {
    expect(mainPanelSource).not.toContain("giveStar")
    expect(mainPanelSource).not.toContain("kofiSupport")
    expect(mainPanelSource).not.toContain("ko-fi.com")
    expect(mainPanelSource).not.toContain("afdian")
    expect(mainPanelSource).not.toContain("getDonateChannels")
  })
})

describe("star and donate copy", () => {
  const localeIds = [
    "zh-CN",
    "zh-TW",
    "en",
    "ja",
    "ko",
    "it",
    "de",
    "es",
    "fr",
    "pt",
    "ru",
  ] as const

  it("fixes zh-CN donate title and keeps Star-aligned githubDesc in all 11 locales", () => {
    expect(Object.keys(resources).sort()).toEqual([...localeIds].sort())
    expect(resources.en.kofiSupport).toBe("Buy Me a Coffee")
    expect(resources["zh-CN"].kofiSupport).toBe("赞助支持")
    expect(resources["zh-TW"].kofiSupport).toBe("贊助支持")
    for (const localeId of localeIds) {
      if (localeId === "en") continue
      expect(resources[localeId].kofiSupport, localeId).not.toBe("Buy Me a Coffee")
    }
    expect(resources.ko.zenModeTitle).toBe("선 모드")
    expect(resources.ko.zenModeTitle).not.toContain("Zen")

    for (const localeId of localeIds) {
      const locale = resources[localeId]
      expect(locale.githubDesc, localeId).toMatch(
        /star|Star|Stern|étoile|estrella|estrela|stella|звезд|스타|スター|星/i,
      )
      expect(locale.githubDesc, localeId).not.toMatch(/view source code, report issues/i)
      expect(locale.sponsorSupport.length, localeId).toBeGreaterThan(0)
      expect(locale.sponsorDesc.length, localeId).toBeGreaterThan(0)
      expect(locale.wechatPay.length, localeId).toBeGreaterThan(0)
      expect(locale.alipayPay.length, localeId).toBeGreaterThan(0)
      expect(locale.afdianSupport.length, localeId).toBeGreaterThan(0)
      expect(locale.joinDiscordCommunity.length, localeId).toBeGreaterThan(0)
    }
  })
})
