/**
 * 关于页面
 * 显示扩展信息、版本、链接等
 */
import React, { useEffect, useState, useSyncExternalStore } from "react"

import { PlatformIcon } from "~components/PlatformIcon"
import {
  AboutIcon,
  AfdianIcon,
  ChromeIcon,
  ClearIcon,
  DiscordIcon,
  EdgeIcon,
  ExternalLinkIcon,
  FirefoxIcon,
  GithubIcon,
  GlobeIcon,
  GreasyForkIcon,
  HeartIcon,
  KofiIcon,
  ScriptCatIcon,
  ShieldCheckIcon,
  StarIcon,
} from "~components/icons"
import { SparkleIcon } from "~components/icons/SparkleIcon"
import { STORE_LINKS } from "~constants/store-links"
import { useHasUnseenReleaseNotes } from "~hooks/useHasUnseenReleaseNotes"
import { useSupportedAiPlatforms } from "~hooks/useSupportedAiPlatforms"
import { APP_DISPLAY_NAME, APP_VERSION, getAppIconUrl } from "~utils/config"
import {
  AFDIAN_URL,
  GITHUB_REPO_URL,
  OPHEL_WEBSITE_URL,
  getDonateChannels,
  resolveSupportImageUrl,
} from "~utils/donate-channels"
import { getCurrentLang, subscribeI18nChanges, t } from "~utils/i18n"

import { PageTitle } from "../components"

interface AboutPageProps {
  onOpenReleaseNotes?: () => void
}

const AboutPage: React.FC<AboutPageProps> = ({ onOpenReleaseNotes }) => {
  const supportedPlatforms = useSupportedAiPlatforms()
  const supportedPlatformsCount = String(supportedPlatforms.length)
  const language = useSyncExternalStore(subscribeI18nChanges, getCurrentLang, getCurrentLang)
  const donateChannels = getDonateChannels(language)
  const hasUnseenReleaseNotes = useHasUnseenReleaseNotes()
  const [sponsorPreview, setSponsorPreview] = useState<{ src: string; alt: string } | null>(null)

  useEffect(() => {
    if (!sponsorPreview) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      // capture 阶段拦截并截断，避免设置弹窗的容器级 Esc 监听把整个弹窗一起关掉
      event.stopPropagation()
      setSponsorPreview(null)
    }

    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [sponsorPreview])

  return (
    <div>
      <PageTitle title={t("navAbout")} Icon={AboutIcon} />
      <div className="about-slogan-container">
        <div className="about-slogan-badge">
          <span style={{ marginRight: 6 }}>✨</span>
          {t("aboutPageDesc")}
          <span style={{ marginLeft: 6 }}>✨</span>
        </div>
      </div>

      {/* Hero Card */}
      <div className="about-hero-card">
        <img
          src={getAppIconUrl()}
          alt={APP_DISPLAY_NAME}
          className="about-hero-logo"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = "none"
          }}
        />
        <div className="about-hero-content">
          <div className="about-hero-heading">
            <div className="about-hero-title">
              {APP_DISPLAY_NAME}
              <span className="about-hero-version">v{APP_VERSION}</span>
            </div>
            {onOpenReleaseNotes ? (
              <button
                type="button"
                className="about-release-notes-btn"
                onClick={onOpenReleaseNotes}>
                <SparkleIcon size={14} color="currentColor" />
                <span>{t("releaseNotesOpen")}</span>
                {hasUnseenReleaseNotes ? (
                  <span className="about-release-notes-unread" aria-hidden="true" />
                ) : null}
              </button>
            ) : null}
          </div>
          <div className="about-hero-desc">
            {t("aboutDescription", { appName: APP_DISPLAY_NAME })}
          </div>
        </div>
      </div>

      <div className="about-section-title">{t("communityAndSupport")}</div>
      <div className="about-community-motto">"{t("communityMotto")}"</div>

      <div
        className={`about-links-grid community-grid${
          donateChannels.kind === "zh-CN" ? " community-grid-triple" : ""
        }`}>
        {/* GitHub Link */}
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="about-link-card"
          style={{ "--card-color": "#111827" } as React.CSSProperties}>
          <div className="about-link-header">
            <GithubIcon size={22} />
            <span style={{ fontWeight: 600 }}>{t("githubRepository")}</span>
          </div>
          <div className="about-link-desc">{t("githubDesc")}</div>
          <button type="button" className="about-link-btn about-star-btn">
            <span className="about-btn-inner">
              <StarIcon size={15} color="currentColor" filled={true} />
              {t("giveStar")}
            </span>
          </button>
        </a>

        {donateChannels.kind === "kofi" ? (
          <a
            href={donateChannels.kofiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="about-link-card kofi-card"
            style={{ "--card-color": "#FF5E5B" } as React.CSSProperties}>
            <div className="about-link-header" style={{ color: "var(--card-color)" }}>
              <KofiIcon size={22} color="var(--card-color)" />
              <span style={{ fontWeight: 600 }}>{t("kofiSupport")}</span>
            </div>
            <div className="about-link-desc" style={{ color: "var(--gh-text-secondary)" }}>
              {t("kofiDesc")}
            </div>
            <button type="button" className="about-link-btn">
              <span className="about-btn-inner">
                <KofiIcon size={14} color="currentColor" />
                {t("kofiBtn")}
              </span>
            </button>
          </a>
        ) : null}

        {/* Website Link */}
        <a
          href={OPHEL_WEBSITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="about-link-card"
          style={{ "--card-color": "#3B82F6" } as React.CSSProperties}>
          <div className="about-link-header">
            <GlobeIcon size={22} color="var(--card-color)" />
            <span style={{ fontWeight: 600, color: "var(--card-color)" }}>
              {t("projectWebsite")}
            </span>
          </div>
          <div className="about-link-desc">{t("websiteDesc")}</div>
          <button type="button" className="about-link-btn">
            <span className="about-btn-inner">
              <GlobeIcon size={14} color="currentColor" />
              {t("visitWebsite")}
            </span>
          </button>
        </a>

        {/* Discord Link */}
        <a
          href="https://discord.gg/rmPzb6Cx9u"
          target="_blank"
          rel="noopener noreferrer"
          className="about-link-card discord-card"
          style={{ "--card-color": "#5865F2" } as React.CSSProperties}>
          <div className="about-link-header" style={{ color: "var(--card-color)" }}>
            <DiscordIcon size={22} color="var(--card-color)" />
            <span style={{ fontWeight: 600 }}>{t("discordCommunity")}</span>
          </div>
          <div className="about-link-desc" style={{ color: "var(--gh-text-secondary)" }}>
            {t("discordDesc")}
          </div>
          <button type="button" className="about-link-btn">
            <span className="about-btn-inner">
              <DiscordIcon size={14} color="currentColor" />
              {t("joinDiscord")}
            </span>
          </button>
        </a>
      </div>

      {donateChannels.kind === "zh-CN" ? (
        <section className="about-sponsor-block">
          <div className="about-section-title">{t("sponsorSupport")}</div>
          <p className="about-sponsor-desc">{t("sponsorDesc")}</p>
          <div className="about-sponsor-channels">
            <a
              href={AFDIAN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="about-sponsor-afdian-card">
              <span className="about-sponsor-afdian-visual" aria-hidden="true">
                <span className="about-sponsor-afdian-icon">
                  <AfdianIcon size={24} />
                </span>
                <span className="about-sponsor-afdian-desc">{t("afdianCardDesc")}</span>
                <span className="about-sponsor-afdian-cta">
                  afdian.com
                  <ExternalLinkIcon size={12} />
                </span>
              </span>
              <span className="about-sponsor-afdian-title">{t("afdianSupport")}</span>
            </a>
            <div className="about-sponsor-qrs">
              <figure className="about-sponsor-qr">
                <button
                  type="button"
                  className="about-sponsor-qr-zoom"
                  onClick={() =>
                    setSponsorPreview({
                      src: resolveSupportImageUrl(donateChannels.wechatImagePath),
                      alt: t("wechatPay"),
                    })
                  }>
                  <img
                    src={resolveSupportImageUrl(donateChannels.wechatImagePath)}
                    alt={t("wechatPay")}
                    className="about-sponsor-qr-img"
                  />
                </button>
                <figcaption>{t("wechatPay")}</figcaption>
              </figure>
              <figure className="about-sponsor-qr">
                <button
                  type="button"
                  className="about-sponsor-qr-zoom"
                  onClick={() =>
                    setSponsorPreview({
                      src: resolveSupportImageUrl(donateChannels.alipayImagePath),
                      alt: t("alipayPay"),
                    })
                  }>
                  <img
                    src={resolveSupportImageUrl(donateChannels.alipayImagePath)}
                    alt={t("alipayPay")}
                    className="about-sponsor-qr-img"
                  />
                </button>
                <figcaption>{t("alipayPay")}</figcaption>
              </figure>
            </div>
          </div>
          {sponsorPreview ? (
            <div
              className="about-sponsor-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={sponsorPreview.alt}
              onClick={() => setSponsorPreview(null)}>
              <button
                type="button"
                className="about-sponsor-lightbox-close"
                aria-label={t("close")}
                autoFocus
                onClick={() => setSponsorPreview(null)}>
                <ClearIcon size={18} />
              </button>
              <img src={sponsorPreview.src} alt={sponsorPreview.alt} />
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="about-section-title">{t("rateAndReview")}</div>
      <div className="about-links-grid reviews-grid">
        {/* Chrome Store */}
        <a
          href={STORE_LINKS.chrome}
          target="_blank"
          rel="noopener noreferrer"
          className="about-link-card">
          <div className="about-link-header">
            <ChromeIcon size={24} />
            <span style={{ fontWeight: 600 }}>{t("chromeStore")}</span>
          </div>
          <button type="button" className="about-link-btn">
            {t("reviewBtn")}
          </button>
        </a>

        {/* Edge Add-ons */}
        <a
          href={STORE_LINKS.edge}
          target="_blank"
          rel="noopener noreferrer"
          className="about-link-card">
          <div className="about-link-header">
            <EdgeIcon size={24} />
            <span style={{ fontWeight: 600 }}>{t("edgeAddons")}</span>
          </div>
          <button type="button" className="about-link-btn">
            {t("reviewBtn")}
          </button>
        </a>

        {/* Firefox Add-on */}
        <a
          href={STORE_LINKS.firefox}
          target="_blank"
          rel="noopener noreferrer"
          className="about-link-card">
          <div className="about-link-header">
            <FirefoxIcon size={24} color="#FF7139" />
            <span style={{ fontWeight: 600 }}>{t("firefoxAddons")}</span>
          </div>
          <button type="button" className="about-link-btn">
            {t("reviewBtn")}
          </button>
        </a>

        {/* GreasyFork */}
        <a
          href={STORE_LINKS.greasyFork}
          target="_blank"
          rel="noopener noreferrer"
          className="about-link-card">
          <div className="about-link-header">
            <GreasyForkIcon size={24} color="currentColor" />
            <span style={{ fontWeight: 600, color: "var(--gh-text)" }}>{t("greasyFork")}</span>
          </div>
          <button type="button" className="about-link-btn">
            {t("reviewBtn")}
          </button>
        </a>

        {/* ScriptCat */}
        <a
          href={STORE_LINKS.scriptCat}
          target="_blank"
          rel="noopener noreferrer"
          className="about-link-card">
          <div className="about-link-header">
            <ScriptCatIcon size={24} color="#1296db" />
            <span style={{ fontWeight: 600, color: "var(--gh-text)" }}>{t("scriptCat")}</span>
          </div>
          <button type="button" className="about-link-btn">
            {t("reviewBtn")}
          </button>
        </a>
      </div>

      <div className="about-section-title">{t("aboutSupportedPlatforms")}</div>
      <div className="about-platforms-card">
        <div className="about-platforms-header">
          <div className="about-platforms-desc">
            {t("aboutSupportedPlatformsDesc", { count: supportedPlatformsCount })}
          </div>
          <span className="about-platforms-count">{supportedPlatformsCount}</span>
        </div>
        <div className="about-platforms-grid">
          {supportedPlatforms.map((platform) => {
            const [entryUrl] = platform.entryUrls
            const icon = (
              <PlatformIcon
                platform={platform}
                size={18}
                className="about-platform-chip-icon"
                fallbackClassName="about-platform-chip-emoji"
              />
            )

            // 未绑定域名的适配包没有可打开地址，渲染为纯标签而不是死链接。
            if (!entryUrl) {
              return (
                <span key={platform.id} className="about-platform-chip">
                  {icon}
                  <span>{platform.name}</span>
                </span>
              )
            }

            return (
              <a
                key={platform.id}
                href={entryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="about-platform-chip"
                title={entryUrl}>
                {icon}
                <span>{platform.name}</span>
              </a>
            )
          })}
        </div>
      </div>

      <div className="about-section-title">{t("techStack")}</div>

      <div className="about-tech-grid">
        <TechCard name="Plasmo" version="v0.89.0" desc={t("tsPlasmoDesc")} />
        <TechCard name="React" version="v18.2.0" desc={t("tsReactDesc")} />
        <TechCard name="TypeScript" version="v5.3.3" desc={t("tsTypescriptDesc")} />
        <TechCard name="Zustand" version="v5.0.3" desc={t("tsZustandDesc")} />
        <TechCard name="Vite" version="v5.0.0" desc={t("tsViteDesc")} />
      </div>

      <div className="about-section-title">{t("credits")}</div>

      <div className="about-simple-card">
        <div className="about-simple-header">
          <HeartIcon size={18} style={{ color: "var(--gh-danger, #ef4444)" }} />
          {t("devAndMaintain")}
        </div>
        <p className="about-credits-text">{t("creditsDesc")}</p>
        <div className="about-credits-badges">
          <Badge text="Made with ❤️" />
          <Badge text="Open Source" />
          <Badge text="Privacy First" />
        </div>
        <div className="about-license-text">
          GNU GPLv3 © {new Date().getFullYear()} {APP_DISPLAY_NAME}
        </div>
      </div>

      {/* Privacy Banner */}
      <div className="about-privacy-banner">
        <ShieldCheckIcon size={24} className="about-privacy-icon" />
        <div>
          <div className="about-privacy-title">{t("privacyTitle")}</div>
          <div className="about-privacy-desc">{t("privacyText")}</div>
        </div>
      </div>
    </div>
  )
}

const TechCard = ({ name, version, desc }: { name: string; version: string; desc: string }) => (
  <div className="about-tech-card">
    <div className="about-tech-header">
      <div className="about-tech-name">{name}</div>
      <div className="about-tech-version">{version}</div>
    </div>
    <div className="about-tech-desc">{desc}</div>
  </div>
)

const Badge = ({ text }: { text: string }) => <span className="about-badge">{text}</span>

export default AboutPage
