/**
 * Options Page 入口
 * 独立的设置页面，通过 chrome.windows.create 打开
 */
import React, { useEffect, useRef, useState } from "react"

import {
  AboutIcon,
  AppearanceIcon,
  BackupIcon,
  FeaturesIcon,
  GeneralIcon,
  PageContentIcon,
  PermissionsIcon,
} from "~components/icons"
import { resolveSettingsNavigateDetail } from "~constants"
import { platform } from "~platform"
import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { APP_DISPLAY_NAME, APP_ICON_URL } from "~utils/config"
import { setLanguage, t } from "~utils/i18n"

import AboutPage from "./options/pages/AboutPage"
import AppearancePage from "./options/pages/AppearancePage"
import BackupPage from "./options/pages/BackupPage"
import FeaturesPage from "./options/pages/FeaturesPage"
// 页面组件
import GeneralPage from "./options/pages/GeneralPage"
import PermissionsPage from "./options/pages/PermissionsPage"
import SiteSettingsPage from "./options/pages/SiteSettingsPage"
// 样式
import "./options.css"

import { SidebarFooter } from "./options/components/SidebarFooter"

// 图标组件

// 导航菜单定义
const NAV_ITEMS = [
  // 导航项定义
  {
    id: "general",
    Icon: GeneralIcon,
    labelKey: "navGeneral",
    label: "基本设置",
  },
  { id: "features", Icon: FeaturesIcon, labelKey: "navFeatures", label: "功能模块" },
  {
    id: "siteSettings",
    Icon: PageContentIcon,
    labelKey: "navSiteSettings",
    label: "站点设置",
  },
  {
    id: "appearance",
    Icon: AppearanceIcon,
    labelKey: "navAppearance",
    label: "外观主题",
  },
  { id: "backup", Icon: BackupIcon, labelKey: "navBackup", label: "备份与同步" },
  {
    id: "permissions",
    Icon: PermissionsIcon,
    labelKey: "navPermissions",
    label: "权限管理",
  },
  { id: "about", Icon: AboutIcon, labelKey: "navAbout", label: "关于" },
]

const OptionsPage = () => {
  const [activePage, setActivePage] = useState("general")
  const [initialSubTab, setInitialSubTab] = useState<string | undefined>(undefined)
  const [locateRequest, setLocateRequest] = useState<{ settingId: string; token: number } | null>(
    null,
  )
  const contentRef = useRef<HTMLElement>(null)
  const highlightTimerRef = useRef<number | undefined>(undefined)
  const highlightedElementRef = useRef<HTMLElement | null>(null)

  // 初始化时检查 URL search params
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const resolved = resolveSettingsNavigateDetail({
        page: params.get("page") || undefined,
        subTab: params.get("subTab") || undefined,
        settingId: params.get("settingId") || undefined,
      })

      if (resolved.page && NAV_ITEMS.some((item) => item.id === resolved.page)) {
        setActivePage(resolved.page)
      }

      setInitialSubTab(resolved.subTab)

      if (resolved.settingId) {
        setLocateRequest({ settingId: resolved.settingId, token: Date.now() })
      }
    }
  }, [])

  // URL 深链定位并高亮目标设置项
  useEffect(() => {
    if (!locateRequest?.settingId) return

    let cancelled = false
    let retryTimer: number | undefined
    let rafId: number | undefined

    const escapedSettingId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(locateRequest.settingId)
        : JSON.stringify(locateRequest.settingId).slice(1, -1)
    const selector = `[data-setting-id="${escapedSettingId}"]`

    const tryLocate = (attempt: number) => {
      if (cancelled) return

      const target = contentRef.current?.querySelector<HTMLElement>(selector)
      if (target) {
        if (highlightTimerRef.current !== undefined) {
          window.clearTimeout(highlightTimerRef.current)
          highlightTimerRef.current = undefined
        }

        if (highlightedElementRef.current && highlightedElementRef.current !== target) {
          highlightedElementRef.current.classList.remove("setting-locate-highlight")
        }

        target.scrollIntoView({ behavior: "smooth", block: "center" })
        target.classList.remove("setting-locate-highlight")
        void target.offsetWidth
        target.classList.add("setting-locate-highlight")

        highlightedElementRef.current = target

        highlightTimerRef.current = window.setTimeout(() => {
          target.classList.remove("setting-locate-highlight")
          if (highlightedElementRef.current === target) {
            highlightedElementRef.current = null
          }
          highlightTimerRef.current = undefined
        }, 2200)

        setLocateRequest(null)
        return
      }

      if (attempt >= 12) {
        console.warn(`[Ophel] Failed to locate setting in options page: ${locateRequest.settingId}`)
        setLocateRequest(null)
        return
      }

      retryTimer = window.setTimeout(() => tryLocate(attempt + 1), 100)
    }

    rafId = window.requestAnimationFrame(() => tryLocate(0))

    return () => {
      cancelled = true

      if (rafId !== undefined) {
        window.cancelAnimationFrame(rafId)
      }

      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer)
      }
    }
  }, [activePage, initialSubTab, locateRequest])

  // 卸载时清理高亮状态
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== undefined) {
        window.clearTimeout(highlightTimerRef.current)
      }

      if (highlightedElementRef.current) {
        highlightedElementRef.current.classList.remove("setting-locate-highlight")
        highlightedElementRef.current = null
      }
    }
  }, [])
  const { settings } = useSettingsStore()
  const isHydrated = useSettingsHydrated()

  // 语言初始化状态
  // 确保在语言设置完成后才渲染内容，避免首次渲染显示默认语言
  const [languageReady, setLanguageReady] = useState(false)

  // 初始化 i18n 语言设置
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
        return <GeneralPage siteId={siteId} initialTab={initialSubTab} />
      case "appearance":
        return <AppearancePage siteId={siteId} initialTab={initialSubTab} />
      case "siteSettings":
        return <SiteSettingsPage siteId={siteId} initialTab={initialSubTab} />
      case "features":
        return <FeaturesPage siteId={siteId} initialTab={initialSubTab} />
      case "permissions":
        return <PermissionsPage siteId={siteId} />
      case "backup":
        return <BackupPage siteId={siteId} onNavigate={setActivePage} />
      case "about":
        return <AboutPage />
      default:
        return <GeneralPage siteId={siteId} initialTab={initialSubTab} />
    }
  }

  // 检测是否在独立 Options 页面（非 content script 环境）
  // 如果是独立页面，不显示外观主题菜单（因为主题是按站点配置的）
  const isStandalonePage = !(window as any).__ophelThemeManager

  // 在独立页面中过滤掉 appearance 导航项
  // 在油猴脚本环境中过滤掉 permissions 导航项（因为没有权限 API）
  const filteredNavItems = NAV_ITEMS.filter((item) => {
    if (isStandalonePage && item.id === "appearance") return false
    if (!platform.hasCapability("permissions") && item.id === "permissions") return false
    return true
  })

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
          {filteredNavItems.map((item) => (
            <button
              key={item.id}
              className={`settings-nav-item ${activePage === item.id ? "active" : ""}`}
              onClick={() => {
                setActivePage(item.id)
                setInitialSubTab(undefined)
                setLocateRequest(null)
              }}>
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
  )
}

export default OptionsPage
