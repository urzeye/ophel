/**
 * 设置模态框组件
 * 在当前页面弹出设置页面，无需跳转到新标签页
 */
import React, { useEffect, useRef, useState } from "react"

import type { SiteAdapter } from "~adapters/base"
import { ClearIcon, MaximizeIcon, RestoreIcon } from "~components/icons"
import { Tooltip } from "~components/ui/Tooltip"
import { NAV_IDS, resolveSettingsNavigateDetail, type SettingsNavigateDetail } from "~constants"
import { useHasUnseenReleaseNotes } from "~hooks/useHasUnseenReleaseNotes"
import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { SettingsCompactBar, SettingsSidebar } from "~tabs/options/components/SettingsSidebar"
import AboutPage from "~tabs/options/pages/AboutPage"
import AppearancePage from "~tabs/options/pages/AppearancePage"
import BackupPage from "~tabs/options/pages/BackupPage"
import FeaturesPage from "~tabs/options/pages/FeaturesPage"
import GeneralPage from "~tabs/options/pages/GeneralPage"
import ShortcutsPage from "~tabs/options/pages/ShortcutsPage"
import SitePacksPage from "~tabs/options/pages/SitePacksPage"
import SiteSettingsPage from "~tabs/options/pages/SiteSettingsPage"
import {
  isSettingsNavPage,
  SETTINGS_NAV_ITEMS,
  useSettingsCompactNav,
} from "~tabs/options/settings-nav"
import {
  attachEditableKeyboardFocusGuard,
  isEventFromEscapeLayer,
  OPHEL_INTERACTION_LAYER_PROPS,
} from "~utils/dom-toolkit"
import { setLanguage, t } from "~utils/i18n"
import { scrollWithinSettingsContent } from "~utils/settings-scroll"

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

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  adapter: SiteAdapter
  onOpenReleaseNotes?: () => void
  onPanelHoverWidthPreviewChange?: (isActive: boolean) => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  adapter,
  onOpenReleaseNotes,
  onPanelHoverWidthPreviewChange,
}) => {
  const siteId = adapter.getSiteId()
  const siteInstanceKey = adapter.getSiteInstanceKey()
  const [activePage, setActivePage] = useState<string>(NAV_IDS.GENERAL)
  const hasUnseenReleaseNotes = useHasUnseenReleaseNotes()
  const [initialSubTab, setInitialSubTab] = useState<string | undefined>(undefined)
  const [locateRequest, setLocateRequest] = useState<{ settingId: string; token: number } | null>(
    null,
  )
  const [isMaximized, setIsMaximized] = useState(false)
  const { isCompact, pane: compactPane, showPage, showNav } = useSettingsCompactNav()
  const { settings } = useSettingsStore()
  const isHydrated = useSettingsHydrated()
  const contentRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null) // 容器引用
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  // 打开弹窗时触发元素是否处于键盘焦点；鼠标点开的关闭后不归还焦点，避免 ESC 关闭时凭空出现焦点环和 tooltip
  const triggerHadFocusVisibleRef = useRef(false)
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

  // 窄屏下每次打开都从导航屏开始。在关闭时复位而不是打开时：带页面的导航请求
  // 会在打开的同一轮把 pane 切到页面屏，打开时复位会把它覆盖掉
  useEffect(() => {
    if (!isOpen) showNav()
  }, [isOpen, showNav])

  // 打开时聚焦弹窗标题，关闭时恢复到触发元素
  useEffect(() => {
    if (!isOpen) return

    restoreFocusRef.current = getDeepActiveElement()
    triggerHadFocusVisibleRef.current = restoreFocusRef.current?.matches(":focus-visible") ?? false
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
      const shouldRestoreFocus = triggerHadFocusVisibleRef.current
      triggerHadFocusVisibleRef.current = false

      if (!shouldRestoreFocus || !restoreElement?.isConnected) {
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
        // 内部浮层（下拉、快捷键录制、语言菜单）自行消费 Esc，只关最上层
        if (isEventFromEscapeLayer(e)) return
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

      if (resolved.page && isSettingsNavPage(resolved.page)) {
        setActivePage(resolved.page)
      }

      setInitialSubTab(resolved.subTab)

      if (resolved.settingId) {
        setLocateRequest({ settingId: resolved.settingId, token: Date.now() })
      } else {
        setLocateRequest(null)
      }

      // 外部导航指向具体页面或设置项，窄屏直接进入页面屏
      showPage()
    }
    window.addEventListener("ophel:navigateSettingsPage", handleNavigate as EventListener)
    return () =>
      window.removeEventListener("ophel:navigateSettingsPage", handleNavigate as EventListener)
  }, [showPage])

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

  // 弹窗打开期间开启键盘屏障：站点在 window/document 捕获阶段的快捷键监听
  // 由主世界劫持层跳过（keyboard-guard-main.ts / keyboard-guard-inject.ts），
  // 避免弹窗内按键（如录制快捷键）穿透触发站点自身快捷键
  useEffect(() => {
    if (!isOpen) return

    document.documentElement.dataset.ophelKeyboardShield = "1"
    return () => {
      delete document.documentElement.dataset.ophelKeyboardShield
    }
  }, [isOpen])

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
            siteInstanceKey={siteInstanceKey}
            adapter={adapter}
            initialTab={initialSubTab}
          />
        )
      case NAV_IDS.SITE_PACKS:
        return <SitePacksPage initialTab={initialSubTab} />
      case NAV_IDS.APPEARANCE:
        return <AppearancePage siteId={siteInstanceKey} initialTab={initialSubTab} />
      case NAV_IDS.FEATURES:
        return <FeaturesPage siteId={siteId} initialTab={initialSubTab} />
      case NAV_IDS.SHORTCUTS:
        return <ShortcutsPage siteId={siteId} />
      case NAV_IDS.BACKUP:
        return <BackupPage siteId={siteId} initialTab={initialSubTab} onNavigate={setActivePage} />
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
        className={`settings-modal-container ${isMaximized ? "maximized" : ""} ${isCompact ? "is-compact" : ""}`}
        data-compact-pane={isCompact ? compactPane : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}>
        {/* 窗口操作：关闭在上，最大化在下；窄屏已经全屏，不提供最大化 */}
        <div className="settings-modal-actions">
          <Tooltip content={t("close")}>
            <button
              type="button"
              className="settings-modal-action-btn close"
              aria-label={t("close")}
              onClick={onClose}>
              <ClearIcon size={16} />
            </button>
          </Tooltip>
          {!isCompact && (
            <Tooltip content={isMaximized ? t("restoreWindow") : t("maximize")}>
              <button
                type="button"
                className="settings-modal-action-btn"
                aria-label={isMaximized ? t("restoreWindow") : t("maximize")}
                onClick={() => setIsMaximized(!isMaximized)}>
                {isMaximized ? <RestoreIcon size={16} /> : <MaximizeIcon size={16} />}
              </button>
            </Tooltip>
          )}
        </div>

        {/* 侧边栏；窄屏下是导航屏 */}
        <SettingsSidebar
          items={SETTINGS_NAV_ITEMS}
          activePage={activePage}
          onSelect={(page) => {
            setActivePage(page)
            setInitialSubTab(undefined)
            setLocateRequest(null)
            showPage()
          }}
          hasUnseenReleaseNotes={hasUnseenReleaseNotes}
          siteId={siteInstanceKey}
          titleId={titleId}
        />

        {isCompact && compactPane === "page" && <SettingsCompactBar onBack={showNav} />}

        {/* 内容区；窄屏下是页面屏 */}
        <main className="settings-content" ref={contentRef}>
          {renderPage()}
        </main>
      </div>
    </div>
  )
}

export default SettingsModal
