/**
 * Options Page 入口
 * 独立的设置页面，通过 chrome.windows.create 打开
 */
import React, { useEffect, useRef, useState } from "react"

import {
  ABOUT_SPONSOR_SETTING_ID,
  NAV_IDS,
  resolveSettingsNavigateDetail,
  type SettingsNavigateDetail,
} from "~constants"
import { useHasUnseenReleaseNotes } from "~hooks/useHasUnseenReleaseNotes"
import { platform } from "~platform"
import {
  getFullChangelogUrl,
  getReleaseNotesMarkdown,
  hasCurrentReleaseNotes,
} from "~release-notes"
import { currentReleaseNotes } from "~release-notes/current"
import { markReleaseNotesSeen } from "~release-notes/storage"
import { ReleaseNotesModal } from "~components/ReleaseNotesModal"
import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { APP_VERSION } from "~utils/config"
import { getOphelPlatformFontClassName } from "~utils/font"
import { setLanguage, t } from "~utils/i18n"
import { scrollWithinSettingsContent } from "~utils/settings-scroll"

import { SettingsCompactBar, SettingsSidebar } from "./options/components/SettingsSidebar"
import AboutPage from "./options/pages/AboutPage"
import AppearancePage from "./options/pages/AppearancePage"
import BackupPage from "./options/pages/BackupPage"
import FeaturesPage from "./options/pages/FeaturesPage"
// 页面组件
import GeneralPage from "./options/pages/GeneralPage"
import ShortcutsPage from "./options/pages/ShortcutsPage"
import SitePacksPage from "./options/pages/SitePacksPage"
import SiteSettingsPage from "./options/pages/SiteSettingsPage"
import {
  isSettingsNavPage,
  SETTINGS_NAV_ITEMS,
  useSettingsCompactNav,
} from "./options/settings-nav"
// 样式
import "./options.css"

// 带页面参数的深链直接进入页面屏，否则窄屏从导航屏开始
const hasPageDeepLink = () =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("page")

const OptionsPage = () => {
  const [activePage, setActivePage] = useState<string>(NAV_IDS.GENERAL)
  const {
    isCompact,
    pane: compactPane,
    showPage,
    showNav,
  } = useSettingsCompactNav(hasPageDeepLink() ? "page" : "nav")
  const hasUnseenReleaseNotes = useHasUnseenReleaseNotes()
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

      if (resolved.page && isSettingsNavPage(resolved.page)) {
        setActivePage(resolved.page)
      }

      setInitialSubTab(resolved.subTab)

      if (resolved.settingId) {
        setLocateRequest({ settingId: resolved.settingId, token: Date.now() })
      }
    }
  }, [])

  // 监听页内设置导航事件（如侧边栏 zh-CN 赞助入口跳“关于-赞助支持”）
  useEffect(() => {
    const handleNavigate = (e: CustomEvent<SettingsNavigateDetail>) => {
      const resolved = resolveSettingsNavigateDetail(e.detail || {})

      if (resolved.page && isSettingsNavPage(resolved.page)) {
        setActivePage(resolved.page)
      }

      setInitialSubTab(resolved.subTab)

      if (resolved.settingId) {
        setLocateRequest({ settingId: resolved.settingId, token: Date.now() })
      }

      // 页内导航指向具体页面或设置项，窄屏直接进入页面屏
      showPage()
    }
    window.addEventListener("ophel:navigateSettingsPage", handleNavigate as EventListener)
    return () =>
      window.removeEventListener("ophel:navigateSettingsPage", handleNavigate as EventListener)
  }, [showPage])

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

        scrollWithinSettingsContent(target)
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

      // 目标可能由异步数据渲染（如适配中心已安装列表），多等一段时间再放弃
      if (attempt >= 30) {
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
  const [isReleaseNotesOpen, setIsReleaseNotesOpen] = useState(false)

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
      <div className={`settings-layout ${platformFontClassName}`}>
        <div style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      </div>
    )
  }

  // 独立 Options 页同样能打开当前版本更新日志：导航红点与关于页按钮不再是死端
  const releaseNotesLanguage = settings.language
  const canShowCurrentReleaseNotes = hasCurrentReleaseNotes()
  const releaseNotesMarkdown = canShowCurrentReleaseNotes
    ? getReleaseNotesMarkdown(releaseNotesLanguage)
    : ""
  const fullChangelogUrl = canShowCurrentReleaseNotes
    ? getFullChangelogUrl(releaseNotesLanguage)
    : "https://ophel.app/docs/changelog"

  const openReleaseNotes = () => {
    if (!canShowCurrentReleaseNotes || !releaseNotesMarkdown.trim()) return
    // 打开即视为已读，与页内面板行为一致；storage.watch 会同步各入口红点
    void markReleaseNotesSeen(APP_VERSION).catch((error) => {
      console.warn("[Ophel] Failed to save release notes state:", error)
    })
    setIsReleaseNotesOpen(true)
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
      case "sitePacks":
        return <SitePacksPage initialTab={initialSubTab} />
      case "shortcuts":
        return <ShortcutsPage siteId={siteId} />
      case "features":
        return <FeaturesPage siteId={siteId} initialTab={initialSubTab} />
      case "backup":
        return <BackupPage siteId={siteId} initialTab={initialSubTab} onNavigate={setActivePage} />
      case "about":
        return (
          <AboutPage
            onOpenReleaseNotes={
              canShowCurrentReleaseNotes && releaseNotesMarkdown.trim()
                ? openReleaseNotes
                : undefined
            }
          />
        )
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

  // 检测是否在独立 Options 页面（非 content script 环境）
  // 如果是独立页面，不显示外观主题菜单（因为主题是按站点配置的）
  const isStandalonePage = !window.__ophelThemeManager
  const navItems = isStandalonePage
    ? SETTINGS_NAV_ITEMS.filter((item) => item.id !== NAV_IDS.APPEARANCE)
    : SETTINGS_NAV_ITEMS

  return (
    <div
      className={`settings-layout ${platformFontClassName} ${isCompact ? "is-compact" : ""}`}
      data-compact-pane={isCompact ? compactPane : undefined}>
      {/* 侧边栏；窄屏下是导航屏 */}
      <SettingsSidebar
        items={navItems}
        activePage={activePage}
        onSelect={(page) => {
          setActivePage(page)
          setInitialSubTab(undefined)
          setLocateRequest(null)
          showPage()
        }}
        hasUnseenReleaseNotes={hasUnseenReleaseNotes}
        siteId={siteId}
      />

      {isCompact && compactPane === "page" && <SettingsCompactBar onBack={showNav} />}

      {/* 内容区；窄屏下是页面屏 */}
      <main className="settings-content" ref={contentRef}>
        {renderPage()}
      </main>

      {isReleaseNotesOpen && canShowCurrentReleaseNotes && releaseNotesMarkdown.trim() ? (
        <ReleaseNotesModal
          version={currentReleaseNotes.version}
          date={currentReleaseNotes.date}
          markdown={releaseNotesMarkdown}
          language={releaseNotesLanguage}
          media={currentReleaseNotes.media}
          fullChangelogUrl={fullChangelogUrl}
          onClose={() => setIsReleaseNotesOpen(false)}
          onOpenFullChangelog={() => platform.openTab(fullChangelogUrl)}
          // 中文下赞助按钮跳回本页“关于-赞助支持”区块并高亮定位
          onOpenSponsor={() => {
            setIsReleaseNotesOpen(false)
            setActivePage(NAV_IDS.ABOUT)
            setLocateRequest({ settingId: ABOUT_SPONSOR_SETTING_ID, token: Date.now() })
            showPage()
          }}
        />
      ) : null}
    </div>
  )
}

export default OptionsPage
