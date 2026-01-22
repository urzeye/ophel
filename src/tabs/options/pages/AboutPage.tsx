/**
 * 关于页面
 * 显示扩展信息、版本、链接等
 */
import React from "react"

import {
  AboutIcon,
  GithubIcon,
  GlobeIcon,
  HeartIcon,
  ShieldCheckIcon,
  StarIcon,
} from "~components/icons"
import { APP_DISPLAY_NAME, APP_ICON_URL, APP_VERSION } from "~utils/config"
import { t } from "~utils/i18n"

import { PageTitle } from "../components"

const AboutPage: React.FC = () => {
  return (
    <div>
      <PageTitle title={t("navAbout") || "关于"} Icon={AboutIcon} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          marginBottom: 24,
        }}>
        <span style={{ fontSize: 18 }}>✨</span>
        <div className="about-slogan">{t("aboutPageDesc") || "AI 之益，触手可及"}</div>
        <span style={{ fontSize: 18 }}>✨</span>
      </div>

      {/* Hero Card */}
      <div className="about-hero-card">
        <img
          src={APP_ICON_URL}
          alt={APP_DISPLAY_NAME}
          className="about-hero-logo"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = "none"
          }}
        />
        <div className="about-hero-content">
          <div className="about-hero-title">
            {APP_DISPLAY_NAME}
            <span className="about-hero-version">v{APP_VERSION}</span>
          </div>
          <div className="about-hero-desc">
            {t("aboutDescription") ||
              "Ophel 是一款面向 Gemini、ChatGPT、Claude、AI Studio、Grok 等 AI 平台的浏览器增强扩展。它集中展示账号与余额、提供智能排序和当前站点识别，并提供自动刷新与临口防火墙绕过等自动化能力；支持数据导入导出工具。"}
          </div>
        </div>
      </div>

      <div className="about-section-title">{t("communityAndSupport") || "社区与支持"}</div>
      <div
        style={{
          fontSize: "13px",
          color: "var(--gh-text-secondary)",
          marginBottom: 16,
          fontStyle: "italic",
        }}>
        "{t("communityMotto")}"
      </div>

      <div className="about-links-grid">
        {/* GitHub Link */}
        <a
          href="https://github.com/urzeye/ophel"
          target="_blank"
          rel="noopener noreferrer"
          className="about-link-card">
          <div className="about-link-header">
            <GithubIcon size={20} />
            GitHub 仓库
          </div>
          <div className="about-link-desc">
            {t("githubDesc") || "查看源代码、提交问题或参与项目开发"}
          </div>
          <button className="about-link-btn about-star-btn">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <StarIcon size={14} />
              {t("giveStar") || "点个 Star"}
            </span>
          </button>
        </a>

        {/* Website Link (Placeholder) */}
        <a
          href="https://github.com/urzeye/ophel"
          target="_blank"
          rel="noopener noreferrer"
          className="about-link-card">
          <div className="about-link-header">
            <GlobeIcon size={20} />
            {t("projectWebsite") || "项目官网"}
          </div>
          <div className="about-link-desc">
            {t("websiteDesc") || "查看详细文档、使用指南和更多信息"}
          </div>
          <button className="about-link-btn">{t("visitWebsite") || "访问官网"}</button>
        </a>
      </div>

      <div className="about-section-title">{t("techStack") || "技术栈"}</div>

      <div className="about-tech-grid">
        <TechCard
          name="Plasmo"
          version="v0.89.0"
          desc={t("tsPlasmoDesc") || "Browser Extension Framework"}
        />
        <TechCard
          name="React"
          version="v18.2.0"
          desc={t("tsReactDesc") || "User Interface Library"}
        />
        <TechCard
          name="TypeScript"
          version="v5.3.3"
          desc={t("tsTypescriptDesc") || "Typed JavaScript"}
        />
        <TechCard name="Zustand" version="v5.0.3" desc={t("tsZustandDesc") || "State Management"} />
        <TechCard name="Vite" version="v5.0.0" desc={t("tsViteDesc") || "Frontend Tooling"} />
      </div>

      <div className="about-section-title">{t("credits") || "版权与致谢"}</div>

      <div className="about-simple-card">
        <div className="about-simple-header">
          <HeartIcon size={18} style={{ color: "#ef4444" }} />
          {t("devAndMaintain") || "开发与维护"}
        </div>
        <p
          style={{
            fontSize: "13px",
            color: "var(--gh-text-secondary)",
            lineHeight: 1.6,
            marginBottom: 16,
          }}>
          {t("creditsDesc") ||
            "感谢所有为开源社区做出贡献的开发者们，本插件的开发得益于这些优秀的开源项目和工具。"}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <Badge text={`Made with ❤️`} />
          <Badge text="Open Source" />
          <Badge text="Privacy First" />
        </div>
        <div style={{ marginTop: 16, fontSize: "12px", color: "var(--gh-text-secondary)" }}>
          CC BY-NC-SA 4.0 © {new Date().getFullYear()} {APP_DISPLAY_NAME}
        </div>
      </div>

      {/* Privacy Banner */}
      <div className="about-privacy-banner">
        <ShieldCheckIcon size={24} className="about-privacy-icon" />
        <div>
          <div className="about-privacy-title">{t("privacyTitle") || "隐私保护"}</div>
          <div className="about-privacy-desc">
            {t("privacyText") ||
              "本插件所有数据均存储在本地浏览器中，不会主动上传到任何服务器。您的账号信息和使用数据完全由您自己掌控，确保隐私安全。"}
          </div>
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

const Badge = ({ text }: { text: string }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 8px",
      background: "var(--gh-bg-secondary)",
      border: "1px solid var(--gh-border)",
      borderRadius: "12px",
      fontSize: "12px",
      color: "var(--gh-text-secondary)",
    }}>
    {text}
  </span>
)

export default AboutPage
