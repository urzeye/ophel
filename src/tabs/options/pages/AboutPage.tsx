/**
 * 关于页面
 * 显示扩展信息、版本、链接等
 */
import React from "react"

import { PlatformIcon } from "~components/PlatformIcon"
import {
  AboutIcon,
  ChromeIcon,
  DiscordIcon,
  EdgeIcon,
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
import { useSupportedAiPlatforms } from "~hooks/useSupportedAiPlatforms"
import { APP_DISPLAY_NAME, APP_VERSION, getAppIconUrl } from "~utils/config"
import { t } from "~utils/i18n"

import { PageTitle } from "../components"

interface AboutPageProps {
  onOpenReleaseNotes?: () => void
}

const AboutPage: React.FC<AboutPageProps> = ({ onOpenReleaseNotes }) => {
  const supportedPlatforms = useSupportedAiPlatforms()
  const supportedPlatformsCount = String(supportedPlatforms.length)

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
              </button>
            ) : null}
          </div>
          <div className="about-hero-desc">
            {t("aboutDescription", { appName: APP_DISPLAY_NAME })}
          </div>
        </div>
      </div>

      <div className="about-section-title">{t("rateAndReview")}</div>
      <div className="about-links-grid reviews-grid">
        {/* Chrome Store */}
        <a
          href={STORE_LINKS.chrome}
          target="_blank"
          rel="noopener noreferrer"
          className="about-link-card"
          style={{ "--card-color": "#4285F4" } as React.CSSProperties}>
          <div className="about-link-header">
            <ChromeIcon size={24} color="var(--card-color)" />
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
          className="about-link-card"
          style={{ "--card-color": "#0078D7" } as React.CSSProperties}>
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
          className="about-link-card"
          style={{ "--card-color": "#FF7139" } as React.CSSProperties}>
          <div className="about-link-header">
            <FirefoxIcon size={24} color="var(--card-color)" />
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
          className="about-link-card"
          style={{ "--card-color": "#4b5563" } as React.CSSProperties}>
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
          className="about-link-card"
          style={{ "--card-color": "#1296db" } as React.CSSProperties}>
          <div className="about-link-header">
            <ScriptCatIcon size={24} color="var(--card-color)" />
            <span style={{ fontWeight: 600, color: "var(--gh-text)" }}>{t("scriptCat")}</span>
          </div>
          <button type="button" className="about-link-btn">
            {t("reviewBtn")}
          </button>
        </a>
      </div>

      <div className="about-section-title">{t("communityAndSupport")}</div>
      <div className="about-community-motto">"{t("communityMotto")}"</div>

      <div className="about-links-grid community-grid">
        {/* GitHub Link */}
        <a
          href="https://github.com/urzeye/ophel"
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

        {/* Ko-fi Link */}
        <a
          href="https://ko-fi.com/urzeye"
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

        {/* Website Link */}
        <a
          href="https://github.com/urzeye/ophel"
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
