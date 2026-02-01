import React, { useSyncExternalStore } from "react"

import { EarthIcon, ThemeDarkIcon, ThemeLightIcon, TranslateIcon } from "~components/icons"
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

  const [isMenuOpen, setIsMenuOpen] = React.useState(false)
  const moreBtnRef = React.useRef<HTMLButtonElement>(null)

  const SHORT_LANG_MAP: Record<string, string> = {
    en: "EN",
    "zh-CN": "简",
    "zh-TW": "繁",
    ja: "JP",
    ko: "KR",
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

  return (
    <div className="settings-sidebar-footer">
      {/* 主题切换 - 仅在 content script 环境显示（站点内） */}
      {!isStandalonePage && (
        <div className="settings-theme-segmented">
          <Tooltip content={t("themeLight") || "浅色"}>
            <button
              className={`settings-theme-segment ${currentThemeMode === "light" ? "active" : ""}`}
              onClick={() => handleThemeModeToggle("light")}>
              <span className="segment-icon">
                <ThemeLightIcon size={16} />
              </span>
              <span className="segment-label">{t("themeLight") || "浅色"}</span>
            </button>
          </Tooltip>
          <Tooltip content={t("themeDark") || "深色"}>
            <button
              className={`settings-theme-segment ${currentThemeMode === "dark" ? "active" : ""}`}
              onClick={() => handleThemeModeToggle("dark")}>
              <span className="segment-icon">
                <ThemeDarkIcon size={16} />
              </span>
              <span className="segment-label">{t("themeDark") || "深色"}</span>
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

        <span className="lang-divider" style={{ opacity: 0.3, display: "none" }}>
          |
        </span>

        {/* 右侧更多语言 */}
        <Tooltip content={t("moreLanguages") || "More Languages"}>
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

      <style>{`
        .settings-lang-inline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 3px 4px;
          background: var(--gh-bg-secondary, #f3f4f6);
          border-radius: 8px;
          margin-top: 4px; /* Reduced gap */
          height: 32px;
        }

        :host-context([data-gh-mode="dark"]) .settings-lang-inline {
          background: rgba(255, 255, 255, 0.08); /* 匹配深色模式下的 segmented */
        }

        .lang-icon {
           display: flex;
           align-items: center;
           justify-content: center;
           color: var(--gh-text-secondary, #9ca3af);
           padding: 4px;
           margin-left: 2px;
           background: transparent;
           border: none;
           cursor: pointer;
           transition: color 0.2s;
        }

        .lang-icon:hover {
          color: var(--gh-text, #374151);
        }

        :host-context([data-gh-mode="dark"]) .lang-icon:hover {
           color: #e5e7eb;
        }

        /* 中间语言链接容器 */
        .lang-links-container {
           flex: 1;
           display: flex;
           align-items: center;
           justify-content: center;
           gap: 2px;
        }

        .lang-link {
          background: none;
          border: none;
          padding: 2px 4px;
          cursor: pointer;
          font-size: 13px;
          color: var(--gh-text-secondary, #6b7280);
          transition: all 0.2s;
          border-radius: 4px;
          font-weight: 500;
        }

        .lang-link:hover {
          color: var(--gh-text, #374151);
          background: rgba(0, 0, 0, 0.05);
        }

         :host-context([data-gh-mode="dark"]) .lang-link:hover {
            color: #f3f4f6;
            background: rgba(255, 255, 255, 0.1);
         }

        .lang-link.active {
          color: var(--gh-text, #111827);
          font-weight: 600;
        }

        :host-context([data-gh-mode="dark"]) .lang-link.active {
           color: #f9fafb;
        }

        .lang-divider {
          color: var(--gh-text-secondary, #d1d5db);
          font-size: 12px;
          margin: 0 1px;
        }

        .lang-more-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--gh-text-secondary, #9ca3af);
          cursor: pointer;
          padding: 2px;
          border-radius: 4px;
          transition: all 0.2s;
          margin-right: 2px;
        }
        .lang-more-btn:hover, .lang-more-btn.active {
          color: var(--gh-text, #374151);
          background: rgba(0, 0, 0, 0.05); /* Match hover styles */
        }
        :host-context([data-gh-mode="dark"]) .lang-more-btn:hover {
           color: #e5e7eb;
           background: rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  )
}
