import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { resources } from "~locales/resources"
import { AFDIAN_URL, GITHUB_REPO_URL, OPHEL_WEBSITE_URL } from "~utils/donate-channels"

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
const appSource = readSource("../../src/components/App.tsx")
const settingsModalSource = readSource("../../src/components/SettingsModal.tsx")
const optionsSource = readSource("../../src/tabs/options.tsx")
const unreadHookSource = readSource("../../src/hooks/useHasUnseenReleaseNotes.ts")

const localeIds = ["zh-CN", "zh-TW", "en", "ja", "ko", "it", "de", "es", "fr", "pt", "ru"] as const

describe("star and donate surfaces", () => {
  it("keeps the first-run disclaimer legal-only", () => {
    const source = compact(disclaimerSource)

    expect(source).toContain('t("agreeButton")')
    expect(source).toContain('t("disclaimerWarning")')
    expect(source).toContain('t("disclaimerAffiliation")')
    expect(source).toContain('t("disclaimerAgreeNote")')
    expect(source).toContain('t("disclaimerContribute")')
    expect(source).toContain('t("reportIssue")')
    expect(source).toContain('role="dialog"')
    expect(source).toContain('aria-modal="true"')
    expect(source).toContain("autoFocus")
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

  it("provides disclaimer affiliation, agree note, and contribute copy in all 11 locales", () => {
    for (const localeId of localeIds) {
      const locale = resources[localeId]
      expect(locale.disclaimerAffiliation.length, localeId).toBeGreaterThan(0)
      expect(locale.disclaimerAgreeNote.length, localeId).toBeGreaterThan(0)
      expect(locale.disclaimerContribute.length, localeId).toBeGreaterThan(0)
    }
  })

  it("wires About to a local Afdian card, the website, and locale donate channels", () => {
    expect(aboutSource).toContain("getDonateChannels")
    expect(aboutSource).toContain("about-sponsor-qrs")
    expect(aboutSource).toContain("about-sponsor-qr-zoom")
    expect(aboutSource).toContain("about-sponsor-lightbox")
    expect(aboutSource).toContain("about-sponsor-lightbox-close")
    expect(aboutSource).toContain("stopPropagation")
    // 爱发电是本地渲染卡片，不再依赖远程 SVG 横幅（严格 CSP 站点会被拦截）
    expect(aboutSource).toContain("about-sponsor-afdian-card")
    expect(aboutSource).toContain('t("afdianCardDesc")')
    expect(aboutSource).not.toContain("afdianBannerUnavailable")
    expect(aboutSource).not.toContain("afdian-connect.vercel.app")
    expect(AFDIAN_URL).toBe("https://afdian.com/a/urzeye")
    expect(aboutSource).toContain("OPHEL_WEBSITE_URL")
    expect(aboutSource).toContain("donateChannels.wechatImagePath")
    expect(aboutSource).toContain("donateChannels.alipayImagePath")
    expect(OPHEL_WEBSITE_URL).toBe("https://ophel.app")
    expect(aboutSource.indexOf('t("communityAndSupport")')).toBeLessThan(
      aboutSource.indexOf('t("sponsorSupport")'),
    )
    expect(aboutSource.indexOf('t("sponsorSupport")')).toBeLessThan(
      aboutSource.indexOf('t("rateAndReview")'),
    )
    expect(aboutSource).toContain("community-grid-triple")
  })

  it("keeps store review buttons on the theme primary color instead of store brand colors", () => {
    const reviewsSection = aboutSource.slice(aboutSource.indexOf('t("rateAndReview")'))

    expect(reviewsSection).not.toContain("--card-color")
  })

  it("adds weak Release Notes Star and donate links without replacing the changelog control", () => {
    const source = compact(releaseNotesSource)

    expect(source).toContain("gh-release-notes-star-link")
    expect(source).toContain("gh-release-notes-footer-support")
    expect(source).toContain("gh-release-notes-secondary")
    expect(source).toContain("GithubIcon")
    expect(source).toContain("GITHUB_REPO_URL")
    expect(source).toContain('t("giveStar")')
    // 赞助入口按语言分流（zh-CN 爱发电，其余 Ko-fi），文案统一用 kofiSupport（中文即“赞助支持”）
    expect(source).toContain("getDonateChannels")
    expect(source).toContain("donateChannels.primaryUrl")
    expect(source).toContain('t("kofiSupport")')
    expect(source).toContain("onOpenFullChangelog")
    expect(source).toContain('t("releaseNotesViewFull")')
    // 长文案语言一行放不下时，实测溢出后隐藏 Star/赞助文案只留图标按钮
    expect(source).toContain("is-compact")
    expect(source).toContain("ResizeObserver")
    // 只剩图标时用 tooltip 兜底文案
    expect(source).toContain("Tooltip")
    expect(source).toContain("disabled={!isFooterCompact}")
    // 测量时按完整内容宽度判定，避免紧凑后按图标宽度误判导致来回振荡
    expect(source).toContain("is-measuring")
    // 只在页脚宽度变化时复测：紧凑切换不改宽度，排除自反馈抖动
    expect(source).toContain("footer.clientWidth === lastWidth")
    // 留 20px 余量：内容贴近可用宽度时就提前降级为图标
    expect(source).toContain("availableWidth - 20")
    expect(releaseNotesCss).toContain(
      ".gh-release-notes-footer.is-compact:not(.is-measuring) .gh-release-notes-star-link span { display: none;",
    )
    expect(GITHUB_REPO_URL).toBe("https://github.com/urzeye/ophel")
    // “知道了”保持实色主按钮，hover 用 color-mix 加深以兼容 24 套主题
    expect(releaseNotesCss).toContain(
      ".gh-release-notes-primary { border: 1px solid transparent; padding: 0 14px; background: var(--gh-primary, #4285f4);",
    )
    expect(releaseNotesCss).toContain("color: var(--gh-text-on-primary, #ffffff);")
    expect(releaseNotesCss).toContain(
      "background: color-mix(in srgb, var(--gh-primary, #4285f4) 88%, #000000);",
    )
    expect(releaseNotesCss).not.toContain(
      ".gh-release-notes-primary { border: 1px solid var(--gh-primary, #4285f4);",
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

  it("opens the full release notes modal on brand hover and drops the preview popover", () => {
    const panel = compact(mainPanelSource)
    const app = compact(appSource)

    // 轻量预览 popover 已移除：不再有任何 popover 残留
    expect(panel).not.toContain("gh-brand-release-popover")
    expect(panel).not.toContain("isBrandPopoverOpen")
    // 悬停短暂停留后直接打开完整更新日志
    expect(panel).toContain("brandHoverTimerRef.current = setTimeout(() => {")
    expect(panel).toContain("onOpenReleaseNotes()")
    // 悬停 350ms 才打开，避免鼠标路过 logo 误触
    expect(panel).toContain("}, 350)")
    // 打开即标记已读，关闭只做关闭，避免读写竞态复活红点
    expect(app).toContain("markedSeenVersionRef.current = APP_VERSION")
    expect(app).toContain(
      "const closeReleaseNotes = useCallback(() => { setIsReleaseNotesOpen(false) }, [])",
    )
  })

  it("mirrors the unread release notes dot on the settings nav and About entry", () => {
    expect(compact(settingsModalSource)).toContain("settings-nav-unread-dot")
    expect(compact(optionsSource)).toContain("settings-nav-unread-dot")
    // 独立 Options 页也能打开更新日志并标记已读，导航红点不是死端
    expect(compact(optionsSource)).toContain("ReleaseNotesModal")
    expect(compact(optionsSource)).toContain("onOpenReleaseNotes")
    expect(compact(optionsSource)).toContain("markReleaseNotesSeen")
    expect(aboutSource).toContain("about-release-notes-unread")
    expect(aboutSource).toContain("useHasUnseenReleaseNotes")
    // 共享 hook 读写同一份平台存储，保证各入口红点同生同灭
    expect(unreadHookSource).toContain("RELEASE_NOTES_STATE_KEY")
    expect(unreadHookSource).toContain("platform.storage.watch")
  })
})

describe("star and donate copy", () => {
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
      expect(locale.afdianCardDesc.length, localeId).toBeGreaterThan(0)
      expect(locale.joinDiscordCommunity.length, localeId).toBeGreaterThan(0)
    }
  })

  it("keeps the About description current in all 11 locales", () => {
    for (const localeId of localeIds) {
      const desc = resources[localeId].aboutDescription

      // 保留占位符与站点适配能力，平台顺序固定为 ChatGPT、Claude、Gemini、DeepSeek
      expect(desc, localeId).toContain("{appName}")
      expect(desc, localeId).toContain("JSON")
      expect(desc.indexOf("ChatGPT"), localeId).toBeGreaterThanOrEqual(0)
      expect(desc.indexOf("ChatGPT"), localeId).toBeLessThan(desc.indexOf("Claude"))
      expect(desc.indexOf("Claude"), localeId).toBeLessThan(desc.indexOf("Gemini"))
      expect(desc.indexOf("Gemini"), localeId).toBeLessThan(desc.indexOf("DeepSeek"))
      // 旧文案中的过时平台举例不应再出现
      expect(desc, localeId).not.toContain("AI Studio")
    }
  })
})
