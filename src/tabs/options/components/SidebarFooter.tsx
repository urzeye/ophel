import React, { useSyncExternalStore } from "react"

import {
  EarthIcon,
  ThemeDarkIcon,
  ThemeLightIcon,
  ThemeSystemIcon,
  TranslateIcon,
} from "~components/icons"
import { Tooltip } from "~components/ui/Tooltip"
import type { ThemeManager } from "~core/theme-manager"
import { useSettingsStore } from "~stores/settings-store"
import { getEffectiveLanguage, setLanguage, t } from "~utils/i18n"

import { LanguageMenu } from "./LanguageMenu"

export const SidebarFooter = ({ siteId = "_default" }: { siteId?: string }) => {
  const { settings, setSettings } = useSettingsStore()

  // 检测是否在独立 Options 页面（非 content script 环境）
  // 如果是独立页面，不显示主题切换（因为主题是按站点配置的）
  const isStandalonePage = !(window as any).__ophelThemeManager

  // 从全局 ThemeManager 订阅当前主题模式（Single Source of Truth）
  const themeManager = (window as any).__ophelThemeManager as ThemeManager | undefined
  const currentThemeMode = useSyncExternalStore(
    themeManager?.subscribe ?? (() => () => {}),
    themeManager?.getSnapshot ?? (() => "light" as const),
  )
  const themeSites = settings?.theme?.sites
  const siteTheme =
    themeSites && siteId in themeSites
      ? themeSites[siteId as keyof typeof themeSites]
      : themeSites?._default
  const currentThemePreference = siteTheme?.mode || "light"

  // 切换主题模式
  const handleThemeModeToggle = async (
    mode: "light" | "dark" | "system",
    event?: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (currentThemePreference === mode) return

    const themeManager = (window as any).__ophelThemeManager
    if (themeManager?.setMode) {
      await themeManager.setMode(mode, event?.nativeEvent)
    } else {
      // 尝试调用 themeManager，如果失败则手动更新 settings
      const sites = settings?.theme?.sites || {}
      const currentSite = sites[siteId as keyof typeof sites] || sites._default || {}

      setSettings({
        theme: {
          ...settings?.theme,
          sites: {
            ...sites,
            [siteId]: {
              lightStyleId: "google-gradient",
              darkStyleId: "classic-dark",
              ...currentSite,
              mode,
            },
          },
        },
      })
    }
  }

  // 切换语言
  const handleLanguageChange = (lang: string) => {
    setSettings({ language: lang })
    setLanguage(lang)
  }

  // 获取设置中的语言值和实际生效的语言
  const settingLang = settings?.language || "auto"
  const effectiveLang = getEffectiveLanguage(settingLang)

  const [isMenuOpen, setIsMenuOpen] = React.useState(false)
  const moreBtnRef = React.useRef<HTMLButtonElement>(null)
  const themeSegmentRef = React.useRef<HTMLDivElement>(null)
  const [themeSegmentState, setThemeSegmentState] = React.useState<"normal" | "compact" | "icon">(
    "normal",
  )
  const themeSegmentStateRef = React.useRef<"normal" | "compact" | "icon">("normal")

  const SHORT_LANG_MAP: Record<string, string> = {
    en: "EN",
    "zh-CN": "简",
    "zh-TW": "繁",
    ja: "JP",
    ko: "KR",
    it: "IT",
    fr: "FR",
    de: "DE",
    ru: "RU",
    es: "ES",
    pt: "PT",
  }

  // 动态槽位逻辑：
  // 1. 固定显示 zh-CN 和 EN
  // 2. 如果当前语言不是 zh-CN/EN，则第三个槽位显示当前语言
  // 3. 如果当前语言是 zh-CN/EN，则第三个槽位显示推荐语言 (默认 es，或者可以记录上次使用的其他语言)
  const fixedSlots = ["zh-CN", "en"]
  const dynamicSlot = fixedSlots.includes(effectiveLang) ? "es" : effectiveLang

  // 去重（虽然逻辑上 dynamicSlot 应该不会和 fixed 重复，除非有效语言列表只有2个）
  const visibleSlots = Array.from(new Set([...fixedSlots, dynamicSlot]))

  React.useEffect(() => {
    themeSegmentStateRef.current = themeSegmentState
  }, [themeSegmentState])

  React.useEffect(() => {
    const container = themeSegmentRef.current
    if (!container) return

    const applyStateClass = (state: "normal" | "compact" | "icon") => {
      container.classList.toggle("is-compact", state === "compact")
      container.classList.toggle("is-icon", state === "icon")
    }

    const fitsContainer = (state: "normal" | "compact" | "icon") => {
      applyStateClass(state)
      return container.scrollWidth <= container.clientWidth + 1
    }

    const measureState = () => {
      const normalFits = fitsContainer("normal")
      let nextState: "normal" | "compact" | "icon" = "normal"
      if (!normalFits) {
        const compactFits = fitsContainer("compact")
        nextState = compactFits ? "compact" : "icon"
      }

      // 测量完毕后立即将正确状态同步到 DOM（不等 React 异步 setState）
      // 原来是 applyStateClass(prevState)，会导致 DOM 短暂停留在溢出状态
      applyStateClass(nextState)
      if (nextState !== themeSegmentStateRef.current) {
        setThemeSegmentState(nextState)
      }
    }

    const scheduleMeasure = () => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(measureState)
        return
      }
      measureState()
    }

    scheduleMeasure()

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => scheduleMeasure())
      observer.observe(container)
      return () => observer.disconnect()
    }

    window.addEventListener("resize", scheduleMeasure)
    return () => window.removeEventListener("resize", scheduleMeasure)
  }, [effectiveLang])

  return (
    <div className="settings-sidebar-footer">
      {/* 主题切换 - 仅在 content script 环境显示（站点内） */}
      {!isStandalonePage && (
        <div
          ref={themeSegmentRef}
          className={`settings-theme-segmented ${themeSegmentState === "compact" ? "is-compact" : ""} ${themeSegmentState === "icon" ? "is-icon" : ""}`}>
          <Tooltip content={t("themeLight")} triggerStyle={{ flex: 1 }}>
            <button
              className={`settings-theme-segment ${currentThemePreference === "light" ? "active" : ""}`}
              onClick={(event) => handleThemeModeToggle("light", event)}>
              <span className="segment-icon">
                <ThemeLightIcon size={16} />
              </span>
              <span className="segment-label">{t("themeLight")}</span>
            </button>
          </Tooltip>
          <Tooltip content={t("themeDark")} triggerStyle={{ flex: 1 }}>
            <button
              className={`settings-theme-segment ${currentThemePreference === "dark" ? "active" : ""}`}
              onClick={(event) => handleThemeModeToggle("dark", event)}>
              <span className="segment-icon">
                <ThemeDarkIcon size={16} />
              </span>
              <span className="segment-label">{t("themeDark")}</span>
            </button>
          </Tooltip>
          <Tooltip content={t("themeSystem")} triggerStyle={{ flex: 1 }}>
            <button
              className={`settings-theme-segment ${currentThemePreference === "system" ? "active" : ""}`}
              onClick={(event) => handleThemeModeToggle("system", event)}>
              <span className="segment-icon">
                <ThemeSystemIcon size={16} />
              </span>
              <span className="segment-label">{t("themeSystem")}</span>
            </button>
          </Tooltip>
        </div>
      )}

      {/* 语言切换 - 极简文字链 + 更多菜单 */}
      <div className="settings-lang-inline">
        {/* 左侧语言图标 */}
        <button
          className="lang-icon"
          onClick={(e) => {
            e.stopPropagation()
            setIsMenuOpen(!isMenuOpen)
          }}>
          <EarthIcon size={16} />
        </button>

        {/* 中间语言切换 */}
        <div className="lang-links-container">
          {visibleSlots.map((lang, index) => (
            <React.Fragment key={lang}>
              <button
                className={`lang-link ${effectiveLang === lang ? "active" : ""}`}
                onClick={() => handleLanguageChange(lang)}>
                {SHORT_LANG_MAP[lang] || lang}
              </button>
              {index < visibleSlots.length - 1 && <span className="lang-divider">/</span>}
            </React.Fragment>
          ))}
        </div>

        {/* 右侧更多语言 */}
        <Tooltip content={t("moreLanguages")}>
          <button
            ref={moreBtnRef}
            className={`lang-more-btn ${isMenuOpen ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation()
              setIsMenuOpen(!isMenuOpen)
            }}>
            <TranslateIcon size={18} />
          </button>
        </Tooltip>

        {isMenuOpen && (
          <LanguageMenu
            currentLang={effectiveLang}
            themeMode={currentThemeMode}
            onSelect={(lang) => {
              handleLanguageChange(lang)
              setIsMenuOpen(false)
            }}
            onClose={() => setIsMenuOpen(false)}
            triggerRef={moreBtnRef}
          />
        )}
      </div>
    </div>
  )
}
