/**
 * Options Page 入口
 * 独立的设置页面，通过 chrome.windows.create 打开
 */
import React, { useEffect, useRef, useState } from "react"

import { getSettingsNavigationItems, NAV_IDS, resolveSettingsNavigateDetail } from "~constants"
import { platform } from "~platform"
import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { APP_DISPLAY_NAME, APP_ICON_URL } from "~utils/config"
import { SidebarCommunityLinks } from "~components/SidebarCommunityLinks"
import { OverlayPortalProvider } from "~components/ui/OverlayPortal"
import { getOphelPlatformFontClassName } from "~utils/font"
import { setLanguage, t } from "~utils/i18n"

import AboutPage from "./options/pages/AboutPage"
import AppearancePage from "./options/pages/AppearancePage"
import BackupPage from "./options/pages/BackupPage"
import FeaturesPage from "./options/pages/FeaturesPage"
import GlobalSearchPage from "./options/pages/GlobalSearchPage"
// 页面组件
import GeneralPage from "./options/pages/GeneralPage"
import PermissionsPage from "./options/pages/PermissionsPage"
import ShortcutsPage from "./options/pages/ShortcutsPage"
import SiteSettingsPage from "./options/pages/SiteSettingsPage"
// 样式
import "./options.css"
import "~styles/overlays.css"

import { SidebarFooter } from "./options/components/SidebarFooter"

const OptionsPage = () => {
  const [activePage, setActivePage] = useState<string>(NAV_IDS.GENERAL)
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

      if (
        resolved.page &&
        getSettingsNavigationItems(platform.hasCapability("permissions")).some(
          (item) => item.id === resolved.page,
        )
      ) {
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
  const platformFontClassName = getOphelPlatformFontClassName()

  // 语言初始化状态
  // 确保在语言设置完成后才渲染内容，避免首次渲染显示默认语言
  const [languageReady, setLanguageReady] = useState(false)

  // 初始化 i18n 语言设置
  // 当 settings 加载完成后，根据 settings.language 设置界面语言
  useEffect(() => {
    if (isHydrated && settings?.language) {
      setLanguageReady(false)
      void setLanguage(settings.language).then(() => setLanguageReady(true))
    }
  }, [isHydrated, settings?.language])

  // 获取当前站点 ID（Options 页面使用 _default）
  const siteId = "_default"

  // 等待 hydration 和语言初始化完成
  if (!settings || !isHydrated || !languageReady) {
    return (
      <div className={`settings-layout ${platformFontClassName}`}>
        <div style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      </div>
    )
  }

  // 渲染当前页面
  const renderPage = () => {
    switch (activePage) {
      case "general":
        return (
          <GeneralPage
            siteId={siteId}
            initialTab={initialSubTab}
            locateSettingId={locateRequest?.settingId}
          />
        )
      case "appearance":
        return <AppearancePage siteId={siteId} initialTab={initialSubTab} />
      case "siteSettings":
        return <SiteSettingsPage siteId={siteId} initialTab={initialSubTab} />
      case "features":
        return <FeaturesPage siteId={siteId} initialTab={initialSubTab} />
      case "globalSearch":
        return <GlobalSearchPage siteId={siteId} />
      case "shortcuts":
        return <ShortcutsPage siteId={siteId} />
      case "permissions":
        return <PermissionsPage siteId={siteId} />
      case "backup":
        return <BackupPage siteId={siteId} onNavigate={setActivePage} />
      case "about":
        return <AboutPage />
      default:
        return (
          <GeneralPage
            siteId={siteId}
            initialTab={initialSubTab}
            locateSettingId={locateRequest?.settingId}
          />
        )
    }
  }

  const filteredNavItems = getSettingsNavigationItems(platform.hasCapability("permissions"))

  return (
    <div className={`settings-layout ${platformFontClassName}`}>
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
              <span className="settings-nav-item-label">{t(item.labelKey)}</span>
            </button>
          ))}

          {/* 左下角社区链接图标 */}
          <SidebarCommunityLinks />
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

const OptionsApp = () => (
  <OverlayPortalProvider>
    <OptionsPage />
  </OverlayPortalProvider>
)

export default OptionsApp
