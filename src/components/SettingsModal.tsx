/**
 * 设置模态框组件
 * 在当前页面弹出设置页面，无需跳转到新标签页
 */
import React, { useEffect, useRef, useState } from "react"

import {
  AboutIcon,
  AppearanceIcon,
  BackupIcon,
  ClearIcon,
  FeaturesIcon,
  GeneralIcon,
  KeyboardIcon,
  MaximizeIcon,
  PageContentIcon,
  PermissionsIcon,
  RestoreIcon,
  SearchIcon,
} from "~components/icons"
import ModelLockSettingsContent from "~components/ModelLockSettingsContent"
import { Tooltip } from "~components/ui/Tooltip"
import { SidebarCommunityLinks } from "~components/SidebarCommunityLinks"
import { NAV_IDS, resolveSettingsNavigateDetail, type SettingsNavigateDetail } from "~constants"
import { platform } from "~platform"
import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { SidebarFooter } from "~tabs/options/components/SidebarFooter"
import AboutPage from "~tabs/options/pages/AboutPage"
import AppearancePage from "~tabs/options/pages/AppearancePage"
import BackupPage from "~tabs/options/pages/BackupPage"
import FeaturesPage from "~tabs/options/pages/FeaturesPage"
import GlobalSearchPage from "~tabs/options/pages/GlobalSearchPage"
import GeneralPage from "~tabs/options/pages/GeneralPage"
import PermissionsPage from "~tabs/options/pages/PermissionsPage"
import ShortcutsPage from "~tabs/options/pages/ShortcutsPage"
import SiteSettingsPage from "~tabs/options/pages/SiteSettingsPage"
import { APP_DISPLAY_NAME, APP_ICON_URL } from "~utils/config"
import { attachEditableKeyboardFocusGuard, OPHEL_INTERACTION_LAYER_PROPS } from "~utils/dom-toolkit"
import { setLanguage, t } from "~utils/i18n"

const getLocalizedLabel = (labelKey: string, fallback: string): string => {
  const localized = t(labelKey)
  return localized === labelKey ? fallback : localized
}

const FOCUSABLE_SETTINGS_MODAL_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(",")

const getDeepActiveElement = (): HTMLElement | null => {
  let activeElement: Element | null = document.activeElement

  while (activeElement?.shadowRoot?.activeElement) {
    activeElement = activeElement.shadowRoot.activeElement
  }

  return activeElement instanceof HTMLElement ? activeElement : null
}

const isFocusableElementVisible = (element: HTMLElement): boolean =>
  !element.hasAttribute("disabled") &&
  element.getAttribute("aria-hidden") !== "true" &&
  (element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0)

const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SETTINGS_MODAL_SELECTOR)).filter(
    isFocusableElementVisible,
  )

// 导航菜单定义
const NAV_ITEMS = [
  {
    id: NAV_IDS.GENERAL,
    Icon: GeneralIcon,
    labelKey: "navGeneral",
    label: "基本设置",
  },
  {
    id: NAV_IDS.APPEARANCE,
    Icon: AppearanceIcon,
    labelKey: "navAppearance",
    label: "外观主题",
  },
  { id: NAV_IDS.FEATURES, Icon: FeaturesIcon, labelKey: "navFeatures", label: "功能模块" },
  {
    id: NAV_IDS.SITE_SETTINGS,
    Icon: PageContentIcon,
    labelKey: "navSiteSettings",
    label: "站点配置",
  },
  {
    id: NAV_IDS.GLOBAL_SEARCH,
    Icon: SearchIcon,
    labelKey: "navGlobalSearch",
    label: "全局搜索",
  },
  { id: NAV_IDS.SHORTCUTS, Icon: KeyboardIcon, labelKey: "navShortcuts", label: "快捷键位" },
  { id: NAV_IDS.BACKUP, Icon: BackupIcon, labelKey: "navBackup", label: "数据管理" },
  {
    id: NAV_IDS.PERMISSIONS,
    Icon: PermissionsIcon,
    labelKey: "navPermissions",
    label: "权限管理",
  },
  { id: NAV_IDS.ABOUT, Icon: AboutIcon, labelKey: "navAbout", label: "关于" },
]

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  siteId: string
  onOpenReleaseNotes?: () => void
  onPanelHoverWidthPreviewChange?: (isActive: boolean) => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  siteId,
  onOpenReleaseNotes,
  onPanelHoverWidthPreviewChange,
}) => {
  const [activePage, setActivePage] = useState<string>(NAV_IDS.GENERAL)
  const [initialSubTab, setInitialSubTab] = useState<string | undefined>(undefined)
  const [locateRequest, setLocateRequest] = useState<{ settingId: string; token: number } | null>(
    null,
  )
  const [isMaximized, setIsMaximized] = useState(false)
  const { settings } = useSettingsStore()
  const isHydrated = useSettingsHydrated()
  const contentRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null) // 容器引用
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const titleId = "ophel-settings-modal-title"
  const highlightTimerRef = useRef<number | undefined>(undefined)
  const highlightedElementRef = useRef<HTMLElement | null>(null)

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

  // 打开时聚焦弹窗标题，关闭时恢复到触发元素
  useEffect(() => {
    if (!isOpen) return

    restoreFocusRef.current = getDeepActiveElement()
    const focusTimer = window.setTimeout(() => {
      const container = containerRef.current
      if (!container) return

      const titleElement = container.querySelector<HTMLElement>(`#${titleId}`)
      ;(titleElement || getFocusableElements(container)[0] || container).focus({
        preventScroll: true,
      })
    }, 0)

    return () => {
      window.clearTimeout(focusTimer)
      const restoreElement = restoreFocusRef.current
      restoreFocusRef.current = null

      if (!restoreElement?.isConnected) {
        return
      }

      try {
        restoreElement.focus({ preventScroll: true })
      } catch (error) {
        console.warn("[Ophel] Failed to restore settings modal focus:", error)
      }
    }
  }, [isOpen, titleId])

  // 按 ESC 关闭模态框，并将 Tab 焦点限制在弹窗内。
  // 使用容器 capture 监听，确保输入框事件被 editable guard 截断前先完成焦点边界判断。
  useEffect(() => {
    if (!isOpen) return

    const container = containerRef.current
    if (!container) {
      return
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
        return
      }

      if (e.key !== "Tab") {
        return
      }

      const focusableElements = getFocusableElements(container)
      if (focusableElements.length === 0) {
        e.preventDefault()
        container.focus({ preventScroll: true })
        return
      }

      const activeElement = getDeepActiveElement()
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (e.shiftKey && (!activeElement || activeElement === firstElement)) {
        e.preventDefault()
        lastElement.focus({ preventScroll: true })
      } else if (!e.shiftKey && activeElement === lastElement) {
        e.preventDefault()
        firstElement.focus({ preventScroll: true })
      }
    }

    container.addEventListener("keydown", handleKeyDown, true)
    return () => container.removeEventListener("keydown", handleKeyDown, true)
  }, [isOpen, onClose])

  // 监听外部导航请求
  useEffect(() => {
    const handleNavigate = (e: CustomEvent<SettingsNavigateDetail>) => {
      const resolved = resolveSettingsNavigateDetail(e.detail || {})

      if (resolved.page && NAV_ITEMS.some((item) => item.id === resolved.page)) {
        setActivePage(resolved.page)
      }

      setInitialSubTab(resolved.subTab)

      if (resolved.settingId) {
        setLocateRequest({ settingId: resolved.settingId, token: Date.now() })
      } else {
        setLocateRequest(null)
      }
    }
    window.addEventListener("ophel:navigateSettingsPage", handleNavigate as EventListener)
    return () =>
      window.removeEventListener("ophel:navigateSettingsPage", handleNavigate as EventListener)
  }, [])

  // 定位并高亮目标设置项
  useEffect(() => {
    if (!isOpen || !locateRequest?.settingId) return

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
        console.warn(`[Ophel] Failed to locate setting: ${locateRequest.settingId}`)
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
  }, [isOpen, activePage, initialSubTab, locateRequest])

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

  // 防止所有站点在设置弹窗输入时抢占焦点或拦截快捷键
  useEffect(() => {
    if (isOpen) {
      const container = containerRef.current
      if (!container) {
        return
      }

      return attachEditableKeyboardFocusGuard(container)
    }
  }, [isOpen, siteId])

  // 禁止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"

      return () => {
        document.body.style.overflow = ""
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
      return <div style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
    }

    switch (activePage) {
      case NAV_IDS.GENERAL:
        return (
          <GeneralPage
            siteId={siteId}
            initialTab={initialSubTab}
            locateSettingId={locateRequest?.settingId}
            onPanelHoverWidthPreviewChange={onPanelHoverWidthPreviewChange}
          />
        )
      case NAV_IDS.SITE_SETTINGS:
        return (
          <SiteSettingsPage
            siteId={siteId}
            initialTab={initialSubTab}
            modelLockContent={<ModelLockSettingsContent />}
          />
        )
      case NAV_IDS.APPEARANCE:
        return <AppearancePage siteId={siteId} initialTab={initialSubTab} />
      case NAV_IDS.FEATURES:
        return <FeaturesPage siteId={siteId} initialTab={initialSubTab} />
      case NAV_IDS.GLOBAL_SEARCH:
        return <GlobalSearchPage siteId={siteId} />
      case NAV_IDS.SHORTCUTS:
        return <ShortcutsPage siteId={siteId} />
      case NAV_IDS.PERMISSIONS:
        return <PermissionsPage siteId={siteId} />
      case NAV_IDS.BACKUP:
        return <BackupPage siteId={siteId} onNavigate={setActivePage} />
      case NAV_IDS.ABOUT:
        return <AboutPage onOpenReleaseNotes={onOpenReleaseNotes} />
      default:
        return (
          <GeneralPage
            siteId={siteId}
            initialTab={initialSubTab}
            onPanelHoverWidthPreviewChange={onPanelHoverWidthPreviewChange}
          />
        )
    }
  }

  return (
    <div className="settings-modal-overlay" {...OPHEL_INTERACTION_LAYER_PROPS} onClick={onClose}>
      <div
        ref={containerRef}
        className={`settings-modal-container ${isMaximized ? "maximized" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}>
        {/* 关闭按钮 */}
        <div className="settings-modal-actions">
          <Tooltip content={isMaximized ? t("restore") : t("maximize")}>
            <button
              type="button"
              className="settings-modal-action-btn"
              aria-label={isMaximized ? t("restore") : t("maximize")}
              onClick={() => setIsMaximized(!isMaximized)}>
              {isMaximized ? <RestoreIcon size={16} /> : <MaximizeIcon size={16} />}
            </button>
          </Tooltip>
          <Tooltip content={t("close")}>
            <button
              type="button"
              className="settings-modal-action-btn close"
              aria-label={t("close")}
              onClick={onClose}>
              <ClearIcon size={16} />
            </button>
          </Tooltip>
        </div>

        {/* 侧边栏 */}
        <aside className="settings-sidebar">
          <div className="settings-sidebar-header">
            <div className="settings-sidebar-logo">
              <img src={APP_ICON_URL} alt={APP_DISPLAY_NAME} />
              <span id={titleId} tabIndex={-1}>
                {APP_DISPLAY_NAME}
              </span>
            </div>
          </div>
          <nav className="settings-sidebar-nav">
            {NAV_ITEMS.filter((item) => {
              // 油猴脚本环境中过滤掉 permissions 导航项
              if (!platform.hasCapability("permissions") && item.id === NAV_IDS.PERMISSIONS)
                return false
              return true
            }).map((item) => (
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
                <span className="settings-nav-item-label">
                  {getLocalizedLabel(item.labelKey, item.label)}
                </span>
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
    </div>
  )
}

export default SettingsModal
