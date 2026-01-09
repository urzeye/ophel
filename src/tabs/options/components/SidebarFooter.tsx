import React, { useSyncExternalStore } from "react"

import { ThemeDarkIcon, ThemeLightIcon } from "~components/icons"
import type { ThemeManager } from "~core/theme-manager"
import { useSettingsStore } from "~stores/settings-store"
import { getEffectiveLanguage, setLanguage, t } from "~utils/i18n"

export const SidebarFooter = ({ siteId = "_default" }: { siteId?: string }) => {
  const { settings, setSettings } = useSettingsStore()

  // ⭐ 从全局 ThemeManager 订阅当前主题模式（Single Source of Truth）
  const themeManager = (window as any).__ophelThemeManager as ThemeManager | undefined
  const currentThemeMode = useSyncExternalStore(
    themeManager?.subscribe ?? (() => () => {}),
    themeManager?.getSnapshot ?? (() => "light" as const),
  )

  // 切换主题模式
  const handleThemeModeToggle = async (mode: "light" | "dark") => {
    if (currentThemeMode === mode) return

    const themeManager = (window as any).__ophelThemeManager
    if (themeManager) {
      await themeManager.toggle()
    } else {
      // Fallback if themeManager is not available (e.g. in standalone options page without content script logic)
      // options page 应该也有 themeManager，因为我们在 options.tsx 里没有看到 ThemeManager 初始化
      // 实际上 options 页面可能没有 __ophelThemeManager，只有 content script 有
      // 我们之前的 options.tsx 里只是 setSettings，依靠 storage listener 更新？
      // 不，SettingsModal 是在 content script 环境下的，有 themeManager
      // OptionsPage 是独立页面，可能没有。
      // 我们先保留之前的逻辑：如果是 standalone，直接 setSettings；如果是 modal，用 toggle
      // 实际上之前的 options.tsx 里的 handleThemeModeToggle 只是 setSettings
      // 而 SettingsModal 里用了 themeManager.toggle()
      // 这里我们需要兼容两种情况

      // 尝试调用 themeManager，如果失败则手动更新 settings
      const newMode = mode
      const sites = settings?.theme?.sites || {}
      const currentSite = sites._default || {}

      setSettings({
        theme: {
          ...settings?.theme,
          sites: {
            ...sites,
            _default: {
              lightStyleId: "google-gradient",
              darkStyleId: "classic-dark",
              ...currentSite,
              mode: newMode,
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

  return (
    <div className="settings-sidebar-footer">
      {/* 主题切换 - 分段控制器风格 */}
      <div className="settings-theme-segmented">
        <button
          className={`settings-theme-segment ${currentThemeMode === "light" ? "active" : ""}`}
          onClick={() => handleThemeModeToggle("light")}
          title={t("themeLight") || "浅色"}>
          <span className="segment-icon">
            <ThemeLightIcon size={16} />
          </span>
          <span className="segment-label">{t("themeLight") || "浅色"}</span>
        </button>
        <button
          className={`settings-theme-segment ${currentThemeMode === "dark" ? "active" : ""}`}
          onClick={() => handleThemeModeToggle("dark")}
          title={t("themeDark") || "深色"}>
          <span className="segment-icon">
            <ThemeDarkIcon size={16} />
          </span>
          <span className="segment-label">{t("themeDark") || "深色"}</span>
        </button>
      </div>

      {/* 语言切换 - 极简文字链风格 */}
      {/* 使用 effectiveLang 判断高亮，这样当设置为 auto 时也能正确显示当前语言 */}
      <div className="settings-lang-inline">
        <button
          className={`lang-link ${effectiveLang === "en" ? "active" : ""}`}
          onClick={() => handleLanguageChange("en")}>
          EN
        </button>
        <span className="lang-divider">/</span>
        <button
          className={`lang-link ${effectiveLang === "zh-CN" ? "active" : ""}`}
          onClick={() => handleLanguageChange("zh-CN")}>
          简
        </button>
        <span className="lang-divider">/</span>
        <button
          className={`lang-link ${effectiveLang === "zh-TW" ? "active" : ""}`}
          onClick={() => handleLanguageChange("zh-TW")}>
          繁
        </button>
      </div>
    </div>
  )
}
