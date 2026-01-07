/**
 * 关于页面
 * 显示扩展信息、版本、链接等
 */
import React from "react"

import { APP_DISPLAY_NAME, APP_ICON_URL, APP_VERSION } from "~utils/config"
import { t } from "~utils/i18n"

import { SettingCard } from "../components"

const AboutPage: React.FC = () => {
  return (
    <div>
      <h1 className="settings-page-title">{t("navAbout") || "关于"}</h1>
      <p className="settings-page-desc">{t("aboutPageDesc") || "扩展信息和相关链接"}</p>

      {/* 扩展信息卡片 */}
      <SettingCard>
        <div className="settings-about-header">
          <img
            src={APP_ICON_URL}
            alt={APP_DISPLAY_NAME}
            className="settings-about-logo"
            onError={(e) => {
              // 如果图标加载失败，显示默认占位图
              ;(e.target as HTMLImageElement).style.display = "none"
            }}
          />
          <div>
            <div className="settings-about-name">{APP_DISPLAY_NAME}</div>
            <div className="settings-about-version">
              {t("version") || "版本"}: {APP_VERSION}
            </div>
          </div>
        </div>

        <p
          style={{
            fontSize: "14px",
            color: "var(--gh-text-secondary)",
            lineHeight: 1.6,
            marginBottom: "20px",
          }}>
          {t("aboutDescription") ||
            "Ophel 是一个浏览器扩展，为 Gemini 提供增强功能，包括会话管理、提示词库、大纲导航、主题定制等。"}
        </p>

        <div className="settings-about-links">
          <a
            href="https://github.com/user/ophel"
            target="_blank"
            rel="noopener noreferrer"
            className="settings-about-link">
            📦 GitHub
          </a>
          <a
            href="https://github.com/user/ophel/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="settings-about-link">
            🐛 {t("reportIssue") || "报告问题"}
          </a>
          <a
            href="https://github.com/user/ophel/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="settings-about-link">
            📋 {t("changelog") || "更新日志"}
          </a>
        </div>
      </SettingCard>

      {/* 技术栈卡片 */}
      <SettingCard title={t("techStack") || "技术栈"}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {["React", "TypeScript", "Plasmo", "Zustand", "Vite"].map((tech) => (
            <span
              key={tech}
              style={{
                padding: "4px 12px",
                background: "var(--gh-bg-secondary, #f3f4f6)",
                borderRadius: "16px",
                fontSize: "13px",
                color: "var(--gh-text-secondary, #6b7280)",
              }}>
              {tech}
            </span>
          ))}
        </div>
      </SettingCard>

      {/* 隐私声明卡片 */}
      <SettingCard title={t("privacyStatement") || "隐私声明"}>
        <p
          style={{
            fontSize: "13px",
            color: "var(--gh-text-secondary)",
            lineHeight: 1.6,
            margin: 0,
          }}>
          {t("privacyText") ||
            "本扩展的所有数据均存储在您的浏览器本地，不会上传到任何远程服务器。WebDAV 同步功能由您自行配置的服务器处理，扩展不会收集或存储您的任何个人信息。"}
        </p>
      </SettingCard>

      {/* 版权信息卡片 */}
      <SettingCard title={t("license") || "开源协议"}>
        <p
          style={{
            fontSize: "13px",
            color: "var(--gh-text-secondary)",
            lineHeight: 1.6,
            margin: 0,
          }}>
          MIT License © {new Date().getFullYear()} {APP_DISPLAY_NAME}
        </p>
      </SettingCard>
    </div>
  )
}

export default AboutPage
