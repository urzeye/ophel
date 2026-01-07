/**
 * Options Page 入口
 * 独立的设置页面，通过 chrome.windows.create 打开
 */
import React, { useEffect, useState } from "react"

import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { APP_DISPLAY_NAME, APP_ICON_URL } from "~utils/config"
import { setLanguage, t } from "~utils/i18n"

import AboutPage from "./options/pages/AboutPage"
import AppearancePage from "./options/pages/AppearancePage"
import BackupPage from "./options/pages/BackupPage"
import FeaturesPage from "./options/pages/FeaturesPage"
// 页面组件
import GeneralPage from "./options/pages/GeneralPage"
import PageContentPage from "./options/pages/PageContentPage"
import PermissionsPage from "./options/pages/PermissionsPage"
// 样式
import "./options.css"

// 导航菜单定义
const NAV_ITEMS = [
  { id: "general", icon: "⚙️", labelKey: "navGeneral", label: "基本设置" },
  { id: "appearance", icon: "🎨", labelKey: "navAppearance", label: "外观主题" },
  { id: "pageContent", icon: "📄", labelKey: "navPageContent", label: "页面与内容" },
  { id: "features", icon: "📑", labelKey: "navFeatures", label: "功能模块" },
  { id: "backup", icon: "☁️", labelKey: "navBackup", label: "备份与同步" },
  { id: "permissions", icon: "🔐", labelKey: "navPermissions", label: "权限管理" },
  { id: "about", icon: "ℹ️", labelKey: "navAbout", label: "关于" },
]

const OptionsPage = () => {
  const [activePage, setActivePage] = useState("general")

  // 初始化时检查 URL search params
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const page = params.get("page")
      if (page && NAV_ITEMS.some((item) => item.id === page)) {
        setActivePage(page)
      }
    }
  }, [])
  const { settings } = useSettingsStore()
  const isHydrated = useSettingsHydrated()

  // ⭐ 语言初始化状态
  // 确保在语言设置完成后才渲染内容，避免首次渲染显示默认语言
  const [languageReady, setLanguageReady] = useState(false)

  // ⭐ 初始化 i18n 语言设置
  // 当 settings 加载完成后，根据 settings.language 设置界面语言
  useEffect(() => {
    if (isHydrated && settings?.language) {
      setLanguage(settings.language)
      setLanguageReady(true)
    }
  }, [isHydrated, settings?.language])

  // 获取当前站点 ID（Options 页面使用 _default）
  const siteId = "_default"

  // 等待 hydration 和语言初始化完成
  if (!settings || !isHydrated || !languageReady) {
    return (
      <div className="settings-layout">
        <div style={{ padding: 40, textAlign: "center" }}>{t("loading") || "加载中..."}</div>
      </div>
    )
  }

  // 渲染当前页面
  const renderPage = () => {
    switch (activePage) {
      case "general":
        return <GeneralPage siteId={siteId} />
      case "appearance":
        return <AppearancePage siteId={siteId} />
      case "pageContent":
        return <PageContentPage siteId={siteId} />
      case "features":
        return <FeaturesPage siteId={siteId} />
      case "permissions":
        return <PermissionsPage siteId={siteId} />
      case "backup":
        return <BackupPage siteId={siteId} />
      case "about":
        return <AboutPage />
      default:
        return <GeneralPage siteId={siteId} />
    }
  }

  return (
    <div className="settings-layout">
      {/* 侧边栏 */}
      <aside className="settings-sidebar">
        <div className="settings-sidebar-header">
          <div className="settings-sidebar-logo">
            <img src={APP_ICON_URL} alt={APP_DISPLAY_NAME} />
            <span>{APP_DISPLAY_NAME}</span>
          </div>
        </div>
        <nav className="settings-sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`settings-nav-item ${activePage === item.id ? "active" : ""}`}
              onClick={() => setActivePage(item.id)}>
              <span className="settings-nav-item-icon">{item.icon}</span>
              <span>{t(item.labelKey) || item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* 内容区 */}
      <main className="settings-content">{renderPage()}</main>
    </div>
  )
}

export default OptionsPage
