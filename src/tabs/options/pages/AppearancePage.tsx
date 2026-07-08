/**
 * 外观主题页面
 * 包含：主题预置 | 自定义样式
 */
import hljs from "highlight.js/lib/core"
import css from "highlight.js/lib/languages/css"
import React, { useEffect, useState } from "react"

import {
  AppearanceIcon,
  CheckIcon,
  ClearIcon,
  DeleteIcon,
  EditIcon,
  ThemeDarkIcon,
  ThemeLightIcon,
} from "~components/icons"
import { APPEARANCE_TAB_IDS } from "~constants"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import type { CustomStyle } from "~utils/storage"
import {
  darkPresets,
  lightPresets,
  parseThemeVariablesFromCSS,
  type ThemePreset,
  type ThemeVariables,
} from "~utils/themes"
import { showToast as showDomToast } from "~utils/toast"
import { createSafeHTML } from "~utils/trusted-types"

import { PageTitle, SettingCard, TabGroup, ToggleRow } from "../components"
import { SafeCodeEditor } from "../components/SafeCodeEditor"
import { ThemePreview } from "../components/ThemePreview"

hljs.registerLanguage("css", css)

interface AppearancePageProps {
  siteId: string
  initialTab?: string
}

// CSS 模板
const CSS_TEMPLATE = `/* Custom CSS Cheat Sheet
 * 以下是本扩展使用的主要 CSS 类名，您可以自由覆盖。
 */

/* === 主题变量 === */
/*
:host {
  --gh-bg: #ffffff;
  --gh-text: #1f2937;
  --gh-primary: #4285f4;
}
*/

/* === 面板样式 === */
/*
.gh-main-panel { }
.gh-panel-header { }
.gh-panel-content { }
*/
`

// 主题卡片组件
const ThemeCard: React.FC<{
  preset: ThemePreset
  isActive: boolean
  onClick: () => void
}> = ({ preset, isActive, onClick }) => {
  const key = `themePreset_${preset.id}`
  const translation = t(key)
  const displayName = translation && translation !== key ? translation : preset.name

  return (
    <button
      type="button"
      className={`settings-theme-card ${isActive ? "active" : ""}`}
      onClick={onClick}
      aria-pressed={isActive}
      title={displayName}>
      <div className="settings-theme-card-preview">
        <ThemePreview preset={preset} />
        {isActive ? (
          <span className="settings-theme-card-check" aria-hidden="true">
            <CheckIcon size={14} />
          </span>
        ) : null}
      </div>
      <div className="settings-theme-name">{displayName}</div>
    </button>
  )
}

const AppearancePage: React.FC<AppearancePageProps> = ({ siteId, initialTab }) => {
  const [activeTab, setActiveTab] = useState(initialTab || APPEARANCE_TAB_IDS.PRESETS)
  const { settings, setSettings } = useSettingsStore()

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  // 自定义样式编辑器状态
  const [showStyleEditor, setShowStyleEditor] = useState(false)
  const [editingStyle, setEditingStyle] = useState<CustomStyle | null>(null)

  // 获取当前站点的主题配置
  const currentTheme =
    settings?.theme?.sites?.[siteId as keyof typeof settings.theme.sites] ||
    settings?.theme?.sites?._default

  if (!settings) return null

  const tabs = [
    { id: APPEARANCE_TAB_IDS.PRESETS, label: t("themePresetsTab") },
    { id: APPEARANCE_TAB_IDS.CUSTOM, label: t("customStylesTab") },
  ]

  // 选择浅色主题预置
  const selectLightPreset = async (presetId: string) => {
    const themeManager = window.__ophelThemeManager
    const isSystemMode = currentTheme?.mode === "system"
    if (!isSystemMode && themeManager?.setMode) {
      // setMode 会等待动画完成后才返回
      await themeManager.setMode("light")
    }

    // 更新样式 ID
    const sites = settings?.theme?.sites || {}
    const currentSite = sites[siteId as keyof typeof sites] || sites._default || {}
    setSettings({
      theme: {
        ...settings?.theme,
        sites: {
          ...settings?.theme?.sites,
          [siteId]: {
            ...currentSite,
            ...(isSystemMode ? {} : { mode: "light" }),
            lightStyleId: presetId,
          },
        },
      },
    })
  }

  // 选择深色主题预置
  const selectDarkPreset = async (presetId: string) => {
    const themeManager = window.__ophelThemeManager
    const isSystemMode = currentTheme?.mode === "system"
    if (!isSystemMode && themeManager?.setMode) {
      // setMode 会等待动画完成后才返回
      await themeManager.setMode("dark")
    }

    // 更新样式 ID
    const sites = settings?.theme?.sites || {}
    const currentSite = sites[siteId as keyof typeof sites] || sites._default || {}
    setSettings({
      theme: {
        ...settings?.theme,
        sites: {
          ...settings?.theme?.sites,
          [siteId]: {
            ...currentSite,
            ...(isSystemMode ? {} : { mode: "dark" }),
            darkStyleId: presetId,
          },
        },
      },
    })
  }

  // 保存自定义样式
  const saveCustomStyle = () => {
    if (!editingStyle) return

    if (!editingStyle.name.trim()) {
      showDomToast(t("pleaseEnterStyleName"))
      return
    }

    const existingStyles = settings?.theme?.customStyles || []
    let newStyles: CustomStyle[]

    if (editingStyle.id) {
      // 编辑现有样式
      newStyles = existingStyles.map((s) => (s.id === editingStyle.id ? editingStyle : s))
    } else {
      // 新建样式
      const newStyle: CustomStyle = {
        ...editingStyle,
        id: crypto.randomUUID(),
      }
      newStyles = [...existingStyles, newStyle]
    }

    setSettings({
      theme: {
        ...settings?.theme,
        customStyles: newStyles,
      },
    })
    setShowStyleEditor(false)
    showDomToast(editingStyle.id ? t("styleUpdated") : t("styleCreated"))
  }

  // 删除自定义样式
  const deleteCustomStyle = (styleId: string) => {
    if (confirm(t("confirmDeleteStyle"))) {
      const newStyles = (settings?.theme?.customStyles || []).filter((s) => s.id !== styleId)
      setSettings({
        theme: {
          ...settings?.theme,
          customStyles: newStyles,
        },
      })
    }
  }

  const customStyles = settings?.theme?.customStyles || []

  // 将自定义样式转换为 ThemePreset 格式以兼容 UI 显示
  const customStyleToPreset = (style: CustomStyle): ThemePreset => {
    // 解析用户输入的 CSS 变量
    const parsedVariables = parseThemeVariablesFromCSS(style.css)

    // 默认变量（作为回退）
    const defaults = {
      "--gh-bg": style.mode === "light" ? "#f3f4f6" : "#1f2937",
      "--gh-header-bg": style.mode === "light" ? "#e5e7eb" : "#374151",
      "--gh-border": style.mode === "light" ? "#d1d5db" : "#4b5563",
      "--gh-primary": "#4285f4",
      "--gh-text": style.mode === "light" ? "#374151" : "#f9fafb",
      "--gh-text-secondary": style.mode === "light" ? "#6b7280" : "#9ca3af",
      "--gh-bg-secondary": style.mode === "light" ? "#ffffff" : "#1f2937",
    }

    return {
      id: style.id,
      name: style.name,
      variables: {
        ...defaults,
        ...parsedVariables,
      } as ThemeVariables,
    }
  }

  const displayLightPresets = [
    ...lightPresets,
    ...customStyles.filter((s) => s.mode === "light").map(customStyleToPreset),
  ]

  const displayDarkPresets = [
    ...darkPresets,
    ...customStyles.filter((s) => s.mode === "dark").map(customStyleToPreset),
  ]

  return (
    <div>
      <PageTitle title={t("navAppearance")} Icon={AppearanceIcon} />
      <p className="settings-page-desc">{t("appearancePageDesc")}</p>

      <SettingCard settingId="appearance-theme-sync">
        <ToggleRow
          label={t("syncNativePageThemeLabel")}
          description={t("syncNativePageThemeDesc")}
          checked={settings?.theme?.syncNativePageTheme ?? true}
          onChange={() =>
            setSettings({
              theme: {
                ...settings?.theme,
                syncNativePageTheme: !(settings?.theme?.syncNativePageTheme ?? true),
              },
            })
          }
          settingId="appearance-sync-native-page-theme"
        />
      </SettingCard>

      <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === APPEARANCE_TAB_IDS.PRESETS && (
        <>
          {/* 浅色模式预置 */}
          <SettingCard
            title={t("lightModePreset")}
            description={t("lightModePresetDesc")}
            settingId="appearance-preset-light">
            <div className="settings-theme-grid">
              {displayLightPresets.map((preset) => (
                <ThemeCard
                  key={preset.id}
                  preset={preset}
                  isActive={(currentTheme?.lightStyleId || "google-gradient") === preset.id}
                  onClick={() => selectLightPreset(preset.id)}
                />
              ))}
            </div>
          </SettingCard>

          {/* 深色模式预置 */}
          <SettingCard
            title={t("darkModePreset")}
            description={t("darkModePresetDesc")}
            settingId="appearance-preset-dark">
            <div className="settings-theme-grid">
              {displayDarkPresets.map((preset) => (
                <ThemeCard
                  key={preset.id}
                  preset={preset}
                  isActive={(currentTheme?.darkStyleId || "classic-dark") === preset.id}
                  onClick={() => selectDarkPreset(preset.id)}
                />
              ))}
            </div>
          </SettingCard>
        </>
      )}

      {activeTab === APPEARANCE_TAB_IDS.CUSTOM && (
        <>
          <SettingCard
            title={t("customCSS")}
            description={t("customCSSDesc")}
            settingId="appearance-custom-styles">
            <div className="settings-custom-style-toolbar">
              <button
                className="settings-btn settings-btn-primary"
                onClick={() => {
                  setEditingStyle({
                    id: "",
                    name: "",
                    css: CSS_TEMPLATE,
                    mode: "light",
                  })
                  setShowStyleEditor(true)
                }}>
                + {t("addCustomStyle")}
              </button>
            </div>

            {(settings?.theme?.customStyles || []).length === 0 ? (
              <div className="settings-custom-style-empty">{t("noCustomStyles")}</div>
            ) : (
              <div className="settings-custom-style-list">
                {(settings?.theme?.customStyles || []).map((style) => (
                  <article key={style.id} className="settings-custom-style-item">
                    <div className="settings-custom-style-item-preview">
                      <ThemePreview preset={customStyleToPreset(style)} />
                    </div>
                    <div className="settings-custom-style-item-main">
                      <div className="settings-custom-style-item-head">
                        <div className="settings-custom-style-item-title">
                          {style.name || t("unnamedStyle")}
                        </div>
                        <span
                          className={`settings-custom-style-mode-badge ${style.mode}`}
                          title={style.mode === "light" ? t("lightMode") : t("darkMode")}>
                          {style.mode === "light" ? (
                            <ThemeLightIcon size={12} />
                          ) : (
                            <ThemeDarkIcon size={12} />
                          )}
                          <span>{style.mode === "light" ? t("lightMode") : t("darkMode")}</span>
                        </span>
                      </div>
                    </div>
                    <div className="settings-custom-style-item-actions">
                      <button
                        type="button"
                        className="settings-btn settings-btn-secondary settings-inline-icon-btn"
                        onClick={() => {
                          setEditingStyle(style)
                          setShowStyleEditor(true)
                        }}>
                        <EditIcon size={14} />
                        <span>{t("edit")}</span>
                      </button>
                      <button
                        type="button"
                        className="settings-btn settings-btn-danger settings-icon-only-btn"
                        onClick={() => deleteCustomStyle(style.id)}
                        aria-label={t("confirmDeleteStyle")}
                        title={t("confirmDeleteStyle")}>
                        <DeleteIcon size={14} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </SettingCard>
        </>
      )}

      {/* 样式编辑器模态框 */}
      {showStyleEditor && editingStyle && (
        <div className="settings-style-editor-overlay">
          <div className="settings-style-editor-modal">
            <div className="settings-style-editor-header">
              <h3 className="settings-style-editor-title">
                {editingStyle.id ? t("editStyleTitle") : t("newStyle")}
              </h3>
              <button
                type="button"
                className="settings-style-editor-close"
                onClick={() => setShowStyleEditor(false)}
                aria-label={t("close")}
                title={t("close")}>
                <ClearIcon size={16} />
              </button>
            </div>

            <div className="settings-style-editor-body">
              <div className="settings-style-editor-field">
                <label className="settings-style-editor-label">{t("styleNameLabel")}</label>
                <input
                  type="text"
                  className="settings-input settings-style-editor-input"
                  value={editingStyle.name}
                  onChange={(e) => setEditingStyle({ ...editingStyle, name: e.target.value })}
                  placeholder={t("enterStyleName")}
                />
              </div>

              <div className="settings-style-editor-field">
                <label className="settings-style-editor-label">{t("styleModeLabel")}</label>
                <div className="settings-style-editor-radio-group">
                  <label className="settings-style-editor-radio">
                    <input
                      type="radio"
                      checked={editingStyle.mode === "light"}
                      onChange={() => setEditingStyle({ ...editingStyle, mode: "light" })}
                    />
                    <span className="settings-style-editor-radio-text">
                      <ThemeLightIcon size={14} />
                      <span>{t("lightMode")}</span>
                    </span>
                  </label>
                  <label className="settings-style-editor-radio">
                    <input
                      type="radio"
                      checked={editingStyle.mode === "dark"}
                      onChange={() => setEditingStyle({ ...editingStyle, mode: "dark" })}
                    />
                    <span className="settings-style-editor-radio-text">
                      <ThemeDarkIcon size={14} />
                      <span>{t("darkMode")}</span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="settings-style-editor-code-section">
                <label className="settings-style-editor-label">CSS {t("code")}</label>
                <div className="settings-textarea settings-style-editor-code-frame">
                  <SafeCodeEditor
                    value={editingStyle.css}
                    onValueChange={(code) => setEditingStyle({ ...editingStyle, css: code })}
                    highlight={(code) =>
                      createSafeHTML(hljs.highlight(code, { language: "css" }).value)
                    }
                    padding={12}
                    style={{
                      fontFamily: '"Menlo", "Monaco", "Consolas", monospace',
                      fontSize: 13,
                      minHeight: "100%",
                    }}
                    textareaClassName="focus-outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="settings-style-editor-footer">
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                onClick={() => setShowStyleEditor(false)}>
                {t("cancel")}
              </button>
              <button
                type="button"
                className="settings-btn settings-btn-primary"
                onClick={saveCustomStyle}>
                {editingStyle.id ? t("save") : t("create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AppearancePage
