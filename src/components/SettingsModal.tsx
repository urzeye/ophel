/**
 * 设置模态框组件
 * 在当前页面弹出设置页面，无需跳转到新标签页
 */
import React, { useEffect, useState } from "react"

import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import AboutPage from "~tabs/options/pages/AboutPage"
import AppearancePage from "~tabs/options/pages/AppearancePage"
import BackupPage from "~tabs/options/pages/BackupPage"
import FeaturesPage from "~tabs/options/pages/FeaturesPage"
import GeneralPage from "~tabs/options/pages/GeneralPage"
import PageContentPage from "~tabs/options/pages/PageContentPage"
import PermissionsPage from "~tabs/options/pages/PermissionsPage"
import { APP_DISPLAY_NAME, APP_ICON_URL } from "~utils/config"
import { setLanguage, t } from "~utils/i18n"

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

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  siteId: string
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, siteId }) => {
  const [activePage, setActivePage] = useState("general")
  const { settings } = useSettingsStore()
  const isHydrated = useSettingsHydrated()

  // 初始化语言
  useEffect(() => {
    if (isHydrated && settings?.language) {
      setLanguage(settings.language)
    }
  }, [isHydrated, settings?.language])

  // 按 ESC 关闭模态框
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  // 禁止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  if (!isOpen) return null

  // 渲染当前页面
  const renderPage = () => {
    if (!settings || !isHydrated) {
      return <div style={{ padding: 40, textAlign: "center" }}>{t("loading") || "加载中..."}</div>
    }

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
        return <BackupPage siteId={siteId} onNavigate={setActivePage} />
      case "about":
        return <AboutPage />
      default:
        return <GeneralPage siteId={siteId} />
    }
  }

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* 关闭按钮 */}
        <button className="settings-modal-close" onClick={onClose} title={t("close") || "关闭"}>
          ✕
        </button>

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
    </div>
  )
}

export default SettingsModal
