/**
 * 设置模态框组件
 * 在当前页面弹出设置页面，无需跳转到新标签页
 */
import React, { useEffect, useRef, useState } from "react"

import {
  AboutIcon,
  AppearanceIcon,
  BackupIcon,
  FeaturesIcon,
  GeneralIcon,
  KeyboardIcon,
  PermissionsIcon,
} from "~components/icons"
import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { SidebarFooter } from "~tabs/options/components/SidebarFooter"
import AboutPage from "~tabs/options/pages/AboutPage"
import AppearancePage from "~tabs/options/pages/AppearancePage"
import BackupPage from "~tabs/options/pages/BackupPage"
import FeaturesPage from "~tabs/options/pages/FeaturesPage"
import GeneralPage from "~tabs/options/pages/GeneralPage"
import PermissionsPage from "~tabs/options/pages/PermissionsPage"
import ShortcutsPage from "~tabs/options/pages/ShortcutsPage"
import { APP_DISPLAY_NAME, APP_ICON_URL } from "~utils/config"
import { setLanguage, t } from "~utils/i18n"

// 导航菜单定义
const NAV_ITEMS = [
  {
    id: "general",
    Icon: GeneralIcon,
    labelKey: "navGeneral",
    label: "基本设置",
  },
  { id: "features", Icon: FeaturesIcon, labelKey: "navFeatures", label: "功能模块" },
  {
    id: "appearance",
    Icon: AppearanceIcon,
    labelKey: "navAppearance",
    label: "外观主题",
  },
  { id: "shortcuts", Icon: KeyboardIcon, labelKey: "navShortcuts", label: "键位设置" },
  { id: "backup", Icon: BackupIcon, labelKey: "navBackup", label: "数据管理" },
  {
    id: "permissions",
    Icon: PermissionsIcon,
    labelKey: "navPermissions",
    label: "权限管理",
  },
  { id: "about", Icon: AboutIcon, labelKey: "navAbout", label: "关于" },
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
  const contentRef = useRef<HTMLDivElement>(null)

  // 初始化语言
  useEffect(() => {
    if (isHydrated && settings?.language) {
      setLanguage(settings.language)
    }
  }, [isHydrated, settings?.language])

  // 切换 Tab 时重置滚动条
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0
    }
  }, [activePage])

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

  // 监听外部导航请求
  useEffect(() => {
    const handleNavigate = (e: CustomEvent<{ page: string }>) => {
      if (e.detail?.page && NAV_ITEMS.some((item) => item.id === e.detail.page)) {
        setActivePage(e.detail.page)
      }
    }
    window.addEventListener("ophel:navigateSettingsPage", handleNavigate as EventListener)
    return () =>
      window.removeEventListener("ophel:navigateSettingsPage", handleNavigate as EventListener)
  }, [])

  // 禁止背景滚动并保护键盘输入不被外部抢占
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"

      // 拦截键盘事件，阻止 Grok 等页面抢占焦点
      // Grok 会在 keydown 时把焦点抢到自己的输入框
      const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement
        const container = document.querySelector(".settings-modal-container")

        // 如果按键发生在模态框内的输入元素，正常处理
        if (container && container.contains(target)) {
          // 允许 ESC 键关闭模态框（已在其他地方处理）
          // 允许模态框内的正常输入
          return
        }

        // 如果按键目标不是模态框内的元素（如 PLASMO-CSUI），
        // 阻止事件传播，防止 Grok 抢占焦点
        if (
          target.tagName === "PLASMO-CSUI" ||
          target.closest("plasmo-csui") ||
          !container?.contains(target)
        ) {
          // 查找模态框内正在编辑的输入框
          const activeInput = container?.querySelector(
            "input, textarea, select, [contenteditable='true']",
          ) as HTMLElement
          if (activeInput && document.activeElement !== activeInput) {
            // 阻止事件继续传播到页面
            e.stopPropagation()
            // 把焦点拉回模态框内的输入框
            activeInput.focus()
          }
        }
      }

      // 使用捕获阶段，优先于其他事件处理器
      document.addEventListener("keydown", handleKeyDown, true)
      document.addEventListener("keypress", handleKeyDown, true)

      return () => {
        document.body.style.overflow = ""
        document.removeEventListener("keydown", handleKeyDown, true)
        document.removeEventListener("keypress", handleKeyDown, true)
      }
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
      case "features":
        return <FeaturesPage siteId={siteId} />
      case "shortcuts":
        return <ShortcutsPage siteId={siteId} />
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
                <span className="settings-nav-item-icon">
                  <item.Icon size={22} />
                </span>
                <span>{t(item.labelKey) || item.label}</span>
              </button>
            ))}
          </nav>

          {/* 侧边栏底部快捷设置 */}
          <SidebarFooter siteId={siteId} />
        </aside>

        {/* 内容区 */}
        <main className="settings-content" ref={contentRef}>
          {renderPage()}
        </main>
      </div>
    </div>
  )
}

export default SettingsModal
