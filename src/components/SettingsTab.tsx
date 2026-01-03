import React, { useCallback, useEffect, useState } from "react"

import { useStorage } from "@plasmohq/storage/hook"

import { Switch } from "~components/ui"
import { setLanguage, t } from "~utils/i18n"
import { DEFAULT_SETTINGS, STORAGE_KEYS, syncStorage, type Settings } from "~utils/storage"
import { darkPresets, getPreset, lightPresets } from "~utils/themes"

// 快捷按钮定义
const COLLAPSED_BUTTON_DEFS: Record<string, { icon: string; label: string }> = {
  scrollTop: { icon: "⬆️", label: "scrollTop" },
  panel: { icon: "✨", label: "panelTitle" },
  anchor: { icon: "⚓", label: "showCollapsedAnchorLabel" },
  theme: { icon: "🌗", label: "toggleTheme" },
  manualAnchor: { icon: "📍", label: "manualAnchorLabel" },
  scrollBottom: { icon: "⬇️", label: "scrollBottom" },
}

// Tab定义
const TAB_DEFINITIONS: Record<string, { label: string }> = {
  prompts: { label: "tabPrompts" },
  conversations: { label: "tabConversations" },
  outline: { label: "tabOutline" },
}

// 通用开关组件
const ToggleRow: React.FC<{
  label: string
  desc?: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
}> = ({ label, desc, checked, onChange, disabled = false }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "10px",
      padding: "14px 16px",
      backgroundColor: "var(--gh-card-bg, #ffffff)",
      border: "1px solid var(--gh-card-border, #e5e7eb)",
      borderRadius: "8px",
      opacity: disabled ? 0.5 : 1,
      pointerEvents: disabled ? "none" : "auto",
    }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 500, fontSize: "13px", color: "var(--gh-text, #374151)" }}>
        {label}
      </div>
      {desc && (
        <div
          style={{
            fontSize: "11px",
            color: "var(--gh-text-secondary, #6b7280)",
            marginTop: "2px",
          }}>
          {desc}
        </div>
      )}
    </div>
    <Switch checked={checked} onChange={onChange} disabled={disabled} />
  </div>
)

// 可折叠分组
const CollapsibleSection: React.FC<{
  title: string
  defaultExpanded?: boolean
  children: React.ReactNode
}> = ({ title, defaultExpanded = true, children }) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div style={{ marginBottom: "16px" }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: "8px",
          cursor: "pointer",
          padding: "8px 0",
          borderBottom: "1px solid var(--gh-border, #e5e7eb)",
        }}>
        <span style={{ fontSize: "12px", color: "var(--gh-text-secondary, #9ca3af)" }}>
          {expanded ? "▼" : "▶"}
        </span>
        <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--gh-text, #374151)" }}>
          {title}
        </span>
      </div>
      {expanded && <div style={{ paddingTop: "8px" }}>{children}</div>}
    </div>
  )
}

// CSS template (CSS 模板)
const CSS_TEMPLATE = `/* 🎨 Custom CSS Cheat Sheet
 * The following are the main CSS classes used in this extension.
 * 以下是本扩展使用的主要 CSS 类名，您可以自由覆盖。
 */

/* === 1. Theme Variables (主题变量) === */
/*
:root {
  --gh-bg: #ffffff;           /* Panel Background / 面板背景 */
  --gh-text: #374151;         /* Main Text / 主要文字 */
  --gh-primary: #4285f4;      /* Highlighting / 高亮色 */
  --gh-header-bg: #4285f4;    /* Header Background / 顶部背景 */
  --gh-border: #e5e7eb;       /* Border Color / 把框颜色 */
  /* --gh-bg-image: ... */    /* Background Texture / 背景纹理 */
}
*/

/* === 2. Layout & Structure (布局结构) === */
/*
.gh-main-panel { }    /* Main Panel Container / 面板主容器 */
.gh-panel-header { }  /* Header Bar / 顶部标题栏 */
.gh-panel-content { } /* Scrollable Area / 中间滚动区域 */
.gh-panel-footer { }  /* Footer Bar / 底部工具栏 */
*/

/* === 3. Components (组件样式) === */
/*
.outline-item { }         /* Outline Row / 大纲行 */
.outline-item-text { }    /* Outline Text / 大纲文字 */
.outline-toolbar-btn { }  /* Action Buttons / 操作按钮 */
.gh-settings-tab { }      /* Settings Page / 设置页 */
.gh-theme-card { }        /* Theme Preview Card / 主题卡片 */
*/

/* === 4. Example: Customizing Outline (示例：美化大纲) === */
/*
.outline-item {
  border-bottom: 1px dashed var(--gh-border);
  margin-bottom: 4px;
}

.outline-item:hover {
  background: var(--gh-primary) !important;
  color: white !important;
}
*/
`

// 主题卡片组件
const ThemeCard: React.FC<{
  preset: any
  isActive: boolean
  onClick: () => void
  t: (key: string) => string
}> = ({ preset, isActive, onClick, t }) => {
  const primary = preset.variables["--gh-primary"]
  const bg = preset.variables["--gh-bg"]
  const text = preset.variables["--gh-text"]
  const headerBg = preset.variables["--gh-header-bg"]

  return (
    <div className={`gh-theme-card ${isActive ? "active" : ""}`} onClick={onClick}>
      <div className="gh-theme-preview">
        {/* 模拟 Header */}
        <div className="gh-theme-preview-header" style={{ background: headerBg }}></div>

        {/* 模拟 内容区 */}
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 0,
            right: 0,
            bottom: 0,
            background: bg,
          }}></div>

        {/* 色彩圆点 */}
        <div className="gh-theme-color-dots">
          <div className="gh-theme-dot" style={{ background: primary }} title="Primary" />
          <div className="gh-theme-dot" style={{ background: bg }} title="Background" />
          <div className="gh-theme-dot" style={{ background: text }} title="Text" />
        </div>

        {/* 选中对钩 */}
        <div className="gh-theme-check">✓</div>
      </div>

      <div className="gh-theme-info">
        <div className="gh-theme-name" title={preset.name}>
          {t(`themePreset_${preset.id}`) || preset.name}
        </div>
      </div>
    </div>
  )
}

// 模型关键词输入组件 - 使用本地 state 避免输入被打断
const ModelKeywordInput: React.FC<{
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}> = ({ value, onChange, placeholder, disabled = false }) => {
  const [localValue, setLocalValue] = useState(value)

  // 当外部 value 变化时同步本地状态（但避免在输入过程中同步）
  React.useEffect(() => {
    setLocalValue(value)
  }, [value])

  return (
    <input
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      disabled={disabled}
      onBlur={() => {
        // 失焦时保存到 storage
        if (localValue !== value) {
          onChange(localValue)
        }
      }}
      onKeyDown={(e) => {
        // 按 Enter 时也保存
        if (e.key === "Enter") {
          onChange(localValue)
        }
      }}
      placeholder={placeholder || t("modelKeywordExample") || "例如: 3 Pro"}
      style={{
        width: "80px",
        padding: "4px 8px",
        borderRadius: "4px",
        border: "1px solid var(--gh-input-border, #d1d5db)",
        fontSize: "12px",
        backgroundColor: disabled ? "var(--gh-bg-tertiary, #f3f4f6)" : "var(--gh-input-bg, white)",
        color: disabled ? "var(--gh-text-secondary, #9ca3af)" : "inherit",
        cursor: disabled ? "not-allowed" : "text",
      }}
    />
  )
}

// 模型锁定站点行组件 - 显示单个站点的开关和输入框
const ModelLockSiteRow: React.FC<{
  siteId: string
  siteName: string
  config: { enabled: boolean; keyword: string }
  onChange: (config: { enabled: boolean; keyword: string }) => void
}> = ({ siteName, config, onChange }) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "10px",
        padding: "14px 16px",
        backgroundColor: "var(--gh-card-bg, #ffffff)",
        border: "1px solid var(--gh-card-border, #e5e7eb)",
        borderRadius: "8px",
      }}>
      {/* 站点名称 */}
      <span style={{ fontWeight: 500, fontSize: "13px", minWidth: "80px" }}>{siteName}</span>

      {/* 开关 */}
      <div style={{ marginRight: "12px" }}>
        <Switch
          checked={config.enabled}
          onChange={(checked) => onChange({ ...config, enabled: checked })}
        />
      </div>

      {/* 输入框 */}
      <ModelKeywordInput
        value={config.keyword}
        onChange={(keyword) => onChange({ ...config, keyword })}
        placeholder={t("modelKeywordExample") || "快速"}
        disabled={!config.enabled}
      />
    </div>
  )
}

// 可排序列表项
const SortableItem: React.FC<{
  icon?: string
  label: string
  index: number
  total: number
  enabled?: boolean
  showToggle?: boolean
  onToggle?: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}> = ({
  icon,
  label,
  index,
  total,
  enabled = true,
  showToggle = false,
  onToggle,
  onMoveUp,
  onMoveDown,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "6px 0",
      marginBottom: "4px",
    }}>
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {icon && <span style={{ fontSize: "14px" }}>{icon}</span>}
      <span style={{ fontSize: "13px", fontWeight: 500 }}>{label}</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      {showToggle && (
        <div style={{ marginRight: "8px" }}>
          <Switch checked={enabled} onChange={() => onToggle?.()} size="sm" />
        </div>
      )}
      <button
        onClick={onMoveUp}
        disabled={index === 0}
        style={{
          width: "28px",
          height: "28px",
          border: "1px solid var(--gh-input-border, #d1d5db)",
          borderRadius: "4px",
          background: "var(--gh-bg-secondary, #f9fafb)",
          color: "var(--gh-text, #374151)",
          cursor: index === 0 ? "not-allowed" : "pointer",
          opacity: index === 0 ? 0.4 : 1,
          fontSize: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
        ⬆
      </button>
      <button
        onClick={onMoveDown}
        disabled={index === total - 1}
        style={{
          width: "28px",
          height: "28px",
          border: "1px solid var(--gh-input-border, #d1d5db)",
          borderRadius: "4px",
          background: "var(--gh-bg-secondary, #f9fafb)",
          color: "var(--gh-text, #374151)",
          cursor: index === total - 1 ? "not-allowed" : "pointer",
          opacity: index === total - 1 ? 0.4 : 1,
          fontSize: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
        ⬇
      </button>
    </div>
  </div>
)

export const SettingsTab = () => {
  const [settings, setSettings] = useStorage<Settings>(
    {
      key: STORAGE_KEYS.SETTINGS,
      instance: syncStorage,
    },
    (saved) => (saved === undefined ? DEFAULT_SETTINGS : { ...DEFAULT_SETTINGS, ...saved }),
  )

  const updateNestedSetting = <K extends keyof Settings>(
    section: K,
    key: keyof Settings[K],
    value: any,
  ) => {
    if (!settings) return
    const newSettings = {
      ...settings,
      [section]: {
        ...(settings[section] as object),
        [key]: value,
      },
    }
    setSettings(newSettings)
  }

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang)
    if (settings) {
      const newSettings = { ...settings, language: lang }
      // ... save
      setSettings(newSettings)
    }
  }

  // 页面宽度逻辑
  const [tempWidth, setTempWidth] = useState(settings?.pageWidth?.value || "100")

  useEffect(() => {
    if (settings?.pageWidth?.value) {
      setTempWidth(settings.pageWidth.value)
    }
  }, [settings?.pageWidth?.value])

  const handleWidthBlur = () => {
    let val = parseInt(tempWidth)
    const unit = settings?.pageWidth?.unit || "%"

    if (isNaN(val)) {
      val = unit === "%" ? 81 : 1280
    }

    if (unit === "%") {
      if (val < 40) val = 40
      if (val > 100) val = 100
    } else {
      if (val <= 0) val = 1200
    }

    const finalVal = val.toString()
    setTempWidth(finalVal)
    if (finalVal !== settings?.pageWidth?.value) {
      updateNestedSetting("pageWidth", "value", finalVal)
    }
  }

  const handleUnitChange = (newUnit: string) => {
    let newValue = "81"
    if (newUnit === "px") {
      newValue = "1280"
    }
    setTempWidth(newValue)

    if (settings) {
      setSettings({
        ...settings,
        pageWidth: {
          ...settings.pageWidth,
          unit: newUnit,
          value: newValue,
          enabled: settings.pageWidth?.enabled ?? false,
        },
      })
    }
  }
  // Tab 排序
  const moveTab = useCallback(
    (index: number, direction: number) => {
      if (!settings) return
      const newOrder = [...settings.tabOrder]
      const newIndex = index + direction
      if (newIndex >= 0 && newIndex < newOrder.length) {
        ;[newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]]
        setSettings({ ...settings, tabOrder: newOrder })
      }
    },
    [settings, setSettings],
  )

  // 快捷按钮排序
  const moveButton = useCallback(
    (index: number, direction: number) => {
      if (!settings) return
      const newOrder = [...settings.collapsedButtonsOrder]
      const newIndex = index + direction
      if (newIndex >= 0 && newIndex < newOrder.length) {
        ;[newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]]
        setSettings({ ...settings, collapsedButtonsOrder: newOrder })
      }
    },
    [settings, setSettings],
  )

  const toggleButton = useCallback(
    (index: number) => {
      if (!settings) return
      const newOrder = [...settings.collapsedButtonsOrder]
      newOrder[index] = { ...newOrder[index], enabled: !newOrder[index].enabled }
      setSettings({ ...settings, collapsedButtonsOrder: newOrder })
    },
    [settings, setSettings],
  )

  if (!settings) return <div style={{ padding: "16px" }}>加载设置中...</div>

  return (
    <div
      className="gh-settings-tab"
      style={{
        padding: "12px",
        fontSize: "13px",
        userSelect: "none",
      }}>
      <style>{`
        .gh-settings-tab input,
        .gh-settings-tab textarea {
          user-select: text !important;
          cursor: text !important;
        }
      `}</style>
      {/* ========== 通用设置 ========== */}
      <div
        style={{
          marginBottom: "8px",
          fontWeight: 600,
          fontSize: "13px",
          color: "var(--gh-text, #374151)",
        }}>
        {t("settingsTitle") || "通用设置"}
      </div>
      <div
        style={{
          backgroundColor: "var(--gh-card-bg, #ffffff)",
          border: "1px solid var(--gh-card-border, #e5e7eb)",
          borderRadius: "8px",
          padding: "14px 16px",
          marginBottom: "16px",
        }}>
        {/* 语言 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: "13px", color: "var(--gh-text, #374151)" }}>
              {t("languageLabel")}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--gh-text-secondary, #6b7280)",
                marginTop: "2px",
              }}>
              {t("languageDesc") || "设置面板显示语言，即时生效"}
            </div>
          </div>
          <select
            value={settings.language || "auto"}
            onChange={(e) => handleLanguageChange(e.target.value)}
            style={{
              width: "auto",
              minWidth: "120px",
              padding: "4px 8px",
              borderRadius: "4px",
              border: "1px solid var(--gh-input-border, #d1d5db)",
              fontSize: "12px",
              backgroundColor: "var(--gh-input-bg, white)",
              color: "var(--gh-text, #374151)",
            }}>
            <option value="auto">{t("languageAuto")}</option>
            <option value="zh-CN">{t("languageZhCN")}</option>
            <option value="zh-TW">{t("languageZhTW")}</option>
            <option value="en">{t("languageEn")}</option>
          </select>
        </div>
      </div>

      {/* ========== 面板设置 ========== */}
      <CollapsibleSection title={t("panelSettingsTitle") || "面板设置"} defaultExpanded={false}>
        <ToggleRow
          label={t("defaultPanelStateLabel") || "默认显示面板"}
          desc={t("defaultPanelStateDesc") || "页面加载后自动展开面板"}
          checked={settings.defaultPanelOpen ?? false}
          onChange={() =>
            setSettings({ ...settings, defaultPanelOpen: !settings.defaultPanelOpen })
          }
        />
        <ToggleRow
          label={t("autoHidePanelLabel") || "自动隐藏面板"}
          desc={t("autoHidePanelDesc") || "点击面板外部时自动隐藏"}
          checked={settings.autoHidePanel ?? false}
          onChange={() => setSettings({ ...settings, autoHidePanel: !settings.autoHidePanel })}
        />
        <ToggleRow
          label={t("edgeSnapHideLabel") || "边缘吸附隐藏"}
          desc={t("edgeSnapHideDesc") || "拖动面板到屏幕边缘时自动隐藏"}
          checked={settings.edgeSnapHide ?? false}
          onChange={() => setSettings({ ...settings, edgeSnapHide: !settings.edgeSnapHide })}
        />

        {/* 快捷按钮组排序 */}
        <div
          style={{
            marginTop: "12px",
            marginBottom: "8px",
            fontSize: "12px",
            color: "var(--gh-text-secondary, #6b7280)",
          }}>
          {t("collapsedButtonsOrderDesc") || "快捷按钮组排序与启用"}
        </div>
        {settings.collapsedButtonsOrder?.map((btn, index) => {
          const def = COLLAPSED_BUTTON_DEFS[btn.id]
          if (!def) return null
          return (
            <SortableItem
              key={btn.id}
              icon={def.icon}
              label={t(def.label) || btn.id}
              index={index}
              total={settings.collapsedButtonsOrder.length}
              enabled={btn.enabled}
              showToggle={["anchor", "theme", "manualAnchor"].includes(btn.id)}
              onToggle={() => toggleButton(index)}
              onMoveUp={() => moveButton(index, -1)}
              onMoveDown={() => moveButton(index, 1)}
            />
          )
        })}
      </CollapsibleSection>

      {/* ========== 主题设置 ========== */}
      <CollapsibleSection title={t("themeSettings") || "主题设置"} defaultExpanded={false}>
        <div
          style={{
            marginBottom: "12px",
            fontSize: "12px",
            color: "var(--gh-text-secondary, #6b7280)",
          }}>
          {t("themeSettingsDesc") || "选择浅色和深色模式下使用的主题预置"}
        </div>

        {/* 当前模式切换 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
            padding: "10px 16px",
            backgroundColor: "var(--gh-card-bg, #ffffff)",
            border: "1px solid var(--gh-card-border, #e5e7eb)",
            borderRadius: "8px",
          }}>
          <div style={{ fontWeight: 500, fontSize: "13px", color: "var(--gh-text, #374151)" }}>
            {t("currentThemeMode") || "当前模式"}
          </div>
          <div
            style={{
              display: "flex",
              borderRadius: "8px",
              overflow: "hidden",
              border: "1px solid var(--gh-input-border, #d1d5db)",
            }}>
            <button
              onClick={() => {
                if (settings.themeMode !== "light") {
                  setSettings({ ...settings, themeMode: "light" })
                  const themeManager = (window as any).__ghThemeManager
                  if (themeManager) themeManager.toggle()
                }
              }}
              style={{
                padding: "6px 16px",
                border: "none",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s",
                backgroundColor:
                  settings.themeMode === "light"
                    ? "var(--gh-primary, #4285f4)"
                    : "var(--gh-bg-secondary, #f9fafb)",
                color:
                  settings.themeMode === "light" ? "#ffffff" : "var(--gh-text-secondary, #6b7280)",
              }}>
              ☀️ {t("themeLight") || "浅色"}
            </button>
            <button
              onClick={() => {
                if (settings.themeMode !== "dark") {
                  setSettings({ ...settings, themeMode: "dark" })
                  const themeManager = (window as any).__ghThemeManager
                  if (themeManager) themeManager.toggle()
                }
              }}
              style={{
                padding: "6px 16px",
                border: "none",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s",
                backgroundColor:
                  settings.themeMode === "dark"
                    ? "var(--gh-primary, #4285f4)"
                    : "var(--gh-bg-secondary, #f9fafb)",
                color:
                  settings.themeMode === "dark" ? "#ffffff" : "var(--gh-text-secondary, #6b7280)",
              }}>
              🌙 {t("themeDark") || "深色"}
            </button>
          </div>
        </div>

        {/* 浅色模式预置 (Grid Layout) */}
        <div style={{ marginBottom: "20px" }}>
          <div
            style={{
              fontWeight: 500,
              fontSize: "13px",
              color: "var(--gh-text, #374151)",
              marginBottom: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
            <span>{t("lightModePreset") || "浅色模式预置"}</span>
            <span
              style={{
                fontSize: "11px",
                color: "var(--gh-text-secondary, #9ca3af)",
                fontWeight: 400,
              }}>
              {t("lightModePresetDesc") || "仅在浅色模式生效"}
            </span>
          </div>
          <div className="gh-theme-grid">
            {lightPresets.map((preset) => (
              <ThemeCard
                key={preset.id}
                preset={preset}
                isActive={(settings.themePresets?.lightPresetId || "google-gradient") === preset.id}
                t={t}
                onClick={() => updateNestedSetting("themePresets", "lightPresetId", preset.id)}
              />
            ))}
          </div>
        </div>

        {/* 深色模式预置 (Grid Layout) */}
        <div style={{ marginBottom: "20px" }}>
          <div
            style={{
              fontWeight: 500,
              fontSize: "13px",
              color: "var(--gh-text, #374151)",
              marginBottom: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
            <span>{t("darkModePreset") || "深色模式预置"}</span>
            <span
              style={{
                fontSize: "11px",
                color: "var(--gh-text-secondary, #9ca3af)",
                fontWeight: 400,
              }}>
              {t("darkModePresetDesc") || "仅在深色模式生效"}
            </span>
          </div>
          <div className="gh-theme-grid">
            {darkPresets.map((preset) => (
              <ThemeCard
                key={preset.id}
                preset={preset}
                isActive={(settings.themePresets?.darkPresetId || "classic-dark") === preset.id}
                t={t}
                onClick={() => updateNestedSetting("themePresets", "darkPresetId", preset.id)}
              />
            ))}
          </div>
        </div>

        {/* 自定义 CSS */}
        <div
          style={{
            marginTop: "24px",
            borderTop: "1px dashed var(--gh-border, #e5e7eb)",
            paddingTop: "16px",
          }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: "13px", color: "var(--gh-text, #374151)" }}>
                {t("customCSS") || "自定义 CSS"}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--gh-text-secondary, #6b7280)",
                  marginTop: "2px",
                }}>
                {t("customCSSDesc") || "输入标准 CSS 代码覆盖当前主题样式"}
              </div>
            </div>
            <button
              className="outline-toolbar-btn"
              style={{ width: "auto", padding: "0 8px", fontSize: "12px", height: "24px" }}
              title={t("customCSSTemplate") || "Insert Template"}
              onClick={() => {
                const confirmMsg =
                  t("language") === "en"
                    ? "Overwrite current CSS with template?"
                    : "确认使用模板覆盖当前 CSS？"

                if (!settings.customCSS || settings.customCSS.trim() === "") {
                  setSettings({ ...settings, customCSS: CSS_TEMPLATE })
                } else if (confirm(confirmMsg)) {
                  setSettings({ ...settings, customCSS: CSS_TEMPLATE })
                }
              }}>
              📝 {t("customCSSTemplate") || "Template"}
            </button>
          </div>
          <textarea
            value={settings.customCSS || ""}
            onChange={(e) => setSettings({ ...settings, customCSS: e.target.value })}
            placeholder="/* Enter custom CSS here / 在此输入自定义 CSS */"
            spellCheck={false}
            style={{
              width: "100%",
              height: "120px",
              padding: "8px",
              borderRadius: "6px",
              border: "1px solid var(--gh-input-border, #d1d5db)",
              backgroundColor: "var(--gh-bg-secondary, #f9fafb)",
              color: "var(--gh-text, #374151)",
              fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
              fontSize: "12px",
              resize: "vertical",
              outline: "none",
            }}
          />
          <div
            style={{
              fontSize: "11px",
              color: "var(--gh-text-secondary, #9ca3af)",
              marginTop: "4px",
            }}>
            {t("customCSSDesc") || "CSS 将自动应用。请谨慎使用。Changes apply automatically."}
          </div>
        </div>
      </CollapsibleSection>

      {/* ========== 界面排版 ========== */}
      <CollapsibleSection title={t("tabOrderSettings") || "界面排版"} defaultExpanded={false}>
        <div
          style={{
            marginBottom: "8px",
            fontSize: "12px",
            color: "var(--gh-text-secondary, #6b7280)",
          }}>
          {t("tabOrderDesc") || "调整面板标签页的显示顺序"}
        </div>
        {settings.tabOrder
          ?.filter((id) => TAB_DEFINITIONS[id])
          .map((tabId, index) => {
            const def = TAB_DEFINITIONS[tabId]
            const isEnabled =
              tabId === "prompts"
                ? settings.prompts?.enabled !== false
                : tabId === "outline"
                  ? settings.outline?.enabled !== false
                  : tabId === "conversations"
                    ? settings.conversations?.enabled !== false
                    : true
            return (
              <SortableItem
                key={tabId}
                label={t(def.label) || tabId}
                index={index}
                total={settings.tabOrder.filter((id) => TAB_DEFINITIONS[id]).length}
                enabled={isEnabled}
                showToggle
                onToggle={() => {
                  if (tabId === "prompts") updateNestedSetting("prompts", "enabled", !isEnabled)
                  else if (tabId === "outline")
                    updateNestedSetting("outline", "enabled", !isEnabled)
                  else if (tabId === "conversations")
                    updateNestedSetting("conversations", "enabled", !isEnabled)
                }}
                onMoveUp={() => moveTab(index, -1)}
                onMoveDown={() => moveTab(index, 1)}
              />
            )
          })}
      </CollapsibleSection>

      {/* ========== 页面显示 ========== */}
      <CollapsibleSection title={t("pageDisplaySettings") || "页面显示"} defaultExpanded={false}>
        <ToggleRow
          label={t("enablePageWidth") || "启用页面宽度"}
          checked={settings.pageWidth?.enabled ?? false}
          onChange={() => updateNestedSetting("pageWidth", "enabled", !settings.pageWidth?.enabled)}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
            padding: "14px 16px",
            backgroundColor: "var(--gh-card-bg, #ffffff)",
            border: "1px solid var(--gh-card-border, #e5e7eb)",
            borderRadius: "8px",
            opacity: settings.pageWidth?.enabled ? 1 : 0.5,
            pointerEvents: settings.pageWidth?.enabled ? "auto" : "none",
          }}>
          <div style={{ fontWeight: 500, fontSize: "13px", color: "var(--gh-text, #374151)" }}>
            {t("pageWidthValueLabel") || "宽度值"}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              type="text"
              value={tempWidth}
              onChange={(e) => setTempWidth(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={handleWidthBlur}
              disabled={!settings.pageWidth?.enabled}
              style={{
                width: "60px",
                padding: "4px 8px",
                borderRadius: "4px",
                border: "1px solid var(--gh-input-border, #d1d5db)",
                fontSize: "12px",
                backgroundColor: settings.pageWidth?.enabled
                  ? "var(--gh-input-bg, white)"
                  : "var(--gh-bg-tertiary, #f3f4f6)",
                color: settings.pageWidth?.enabled
                  ? "var(--gh-text, #374151)"
                  : "var(--gh-text-secondary, #9ca3af)",
              }}
            />
            <select
              value={settings.pageWidth?.unit || "%"}
              onChange={(e) => handleUnitChange(e.target.value)}
              disabled={!settings.pageWidth?.enabled}
              style={{
                padding: "4px 8px",
                borderRadius: "4px",
                border: "1px solid var(--gh-input-border, #d1d5db)",
                fontSize: "12px",
                backgroundColor: settings.pageWidth?.enabled
                  ? "var(--gh-input-bg, white)"
                  : "var(--gh-bg-tertiary, #f3f4f6)",
                color: settings.pageWidth?.enabled
                  ? "var(--gh-text, #374151)"
                  : "var(--gh-text-secondary, #9ca3af)",
              }}>
              <option value="%">%</option>
              <option value="px">px</option>
            </select>
          </div>
        </div>
        <ToggleRow
          label={t("preventAutoScrollLabel") || "防止自动滚动"}
          desc={t("preventAutoScrollDesc") || "阻止页面自动滚动到底部"}
          checked={settings.preventAutoScroll ?? false}
          onChange={() =>
            setSettings({ ...settings, preventAutoScroll: !settings.preventAutoScroll })
          }
        />
      </CollapsibleSection>

      {/* ========== 大纲设置 ========== */}
      <CollapsibleSection title={t("outlineSettings") || "大纲设置"} defaultExpanded={false}>
        <ToggleRow
          label={t("outlineAutoUpdateLabel") || "自动更新"}
          desc={t("outlineAutoUpdateDesc") || "在对话进行时自动刷新大纲"}
          checked={settings.outline?.autoUpdate ?? true}
          onChange={() =>
            updateNestedSetting("outline", "autoUpdate", !settings.outline?.autoUpdate)
          }
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
            padding: "14px 16px",
            backgroundColor: "var(--gh-card-bg, #ffffff)",
            border: "1px solid var(--gh-card-border, #e5e7eb)",
            borderRadius: "8px",
          }}>
          <label style={{ fontWeight: 500, fontSize: "13px", color: "var(--gh-text, #374151)" }}>
            {t("outlineUpdateIntervalLabel") || "更新检测间隔 (秒)"}
          </label>
          <input
            type="number"
            min={1}
            value={settings.outline?.updateInterval || 2}
            onChange={(e) =>
              updateNestedSetting("outline", "updateInterval", parseInt(e.target.value) || 2)
            }
            style={{
              width: "60px",
              padding: "4px 8px",
              borderRadius: "4px",
              border: "1px solid var(--gh-input-border, #d1d5db)",
              fontSize: "12px",
              backgroundColor: "var(--gh-input-bg, white)",
              color: "var(--gh-text, #374151)",
            }}
          />
        </div>

        <div
          style={{
            marginBottom: "10px",
            padding: "14px 16px",
            backgroundColor: "var(--gh-card-bg, #ffffff)",
            border: "1px solid var(--gh-card-border, #e5e7eb)",
            borderRadius: "8px",
          }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
            <label style={{ fontWeight: 500, fontSize: "13px", color: "var(--gh-text, #374151)" }}>
              {t("outlineFollowModeLabel") || "大纲跟随模式"}
            </label>
            <select
              value={settings.outline?.followMode || "current"}
              onChange={(e) =>
                updateNestedSetting(
                  "outline",
                  "followMode",
                  e.target.value as "current" | "latest" | "manual",
                )
              }
              style={{
                width: "auto",
                padding: "4px 8px",
                borderRadius: "4px",
                border: "1px solid var(--gh-input-border, #d1d5db)",
                fontSize: "12px",
                backgroundColor: "var(--gh-input-bg, white)",
                color: "var(--gh-text, #374151)",
              }}>
              <option value="current">{t("outlineFollowCurrent") || "跟随当前位置"}</option>
              <option value="latest">{t("outlineFollowLatest") || "跟随最新消息"}</option>
              <option value="manual">{t("outlineFollowManual") || "手动控制"}</option>
            </select>
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "var(--gh-text-secondary, #9ca3af)",
              marginTop: "4px",
            }}>
            {settings.outline?.followMode === "current"
              ? t("outlineFollowCurrentDesc") || "滚动页面时自动定位高亮大纲项"
              : settings.outline?.followMode === "latest"
                ? t("outlineFollowLatestDesc") || "大纲始终自动滚动到底部"
                : t("outlineFollowManualDesc") || "不自动滚动大纲"}
          </div>
        </div>
      </CollapsibleSection>

      {/* ========== 会话设置 ========== */}
      <CollapsibleSection
        title={t("conversationsSettingsTitle") || "会话设置"}
        defaultExpanded={false}>
        <ToggleRow
          label={t("conversationsSyncUnpinLabel") || "同步时取消置顶"}
          desc={t("conversationsSyncUnpinDesc") || "同步会话时自动取消置顶"}
          checked={settings.conversations?.syncUnpin ?? false}
          onChange={() =>
            updateNestedSetting("conversations", "syncUnpin", !settings.conversations?.syncUnpin)
          }
        />
        <ToggleRow
          label={t("folderRainbowLabel") || "文件夹彩虹色"}
          desc={t("folderRainbowDesc") || "为不同文件夹使用不同颜色"}
          checked={settings.conversations?.folderRainbow ?? true}
          onChange={() =>
            updateNestedSetting(
              "conversations",
              "folderRainbow",
              !settings.conversations?.folderRainbow,
            )
          }
        />
      </CollapsibleSection>

      {/* ========== 标签页设置 ========== */}
      <CollapsibleSection title={t("tabSettingsTitle")} defaultExpanded={false}>
        <ToggleRow
          label={t("openNewTabLabel") || "新标签页打开"}
          desc={t("openNewTabDesc") || "在新标签页中打开新对话"}
          checked={settings.tabSettings?.openInNewTab ?? true}
          onChange={() =>
            updateNestedSetting("tabSettings", "openInNewTab", !settings.tabSettings?.openInNewTab)
          }
        />
        <ToggleRow
          label={t("autoRenameTabLabel")}
          desc={t("autoRenameTabDesc")}
          checked={settings.tabSettings?.autoRenameTab ?? false}
          onChange={() =>
            updateNestedSetting(
              "tabSettings",
              "autoRenameTab",
              !settings.tabSettings?.autoRenameTab,
            )
          }
        />
        {/* 检测频率 - 始终显示，未开启自动重命名时置灰 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
            padding: "14px 16px",
            backgroundColor: "var(--gh-card-bg, #ffffff)",
            border: "1px solid var(--gh-card-border, #e5e7eb)",
            borderRadius: "8px",
            opacity: settings.tabSettings?.autoRenameTab ? 1 : 0.5,
            pointerEvents: settings.tabSettings?.autoRenameTab ? "auto" : "none",
          }}>
          <label style={{ fontWeight: 500, fontSize: "13px", color: "var(--gh-text, #374151)" }}>
            {t("renameIntervalLabel") || "检测频率"}
          </label>
          <select
            value={settings.tabSettings?.renameInterval || 3}
            onChange={(e) =>
              updateNestedSetting("tabSettings", "renameInterval", parseInt(e.target.value))
            }
            disabled={!settings.tabSettings?.autoRenameTab}
            style={{
              width: "auto",
              padding: "4px 8px",
              borderRadius: "4px",
              border: "1px solid var(--gh-input-border, #d1d5db)",
              fontSize: "12px",
              backgroundColor: settings.tabSettings?.autoRenameTab
                ? "var(--gh-input-bg, white)"
                : "var(--gh-bg-tertiary, #f3f4f6)",
              color: "var(--gh-text, #374151)",
            }}>
            {[1, 3, 5, 10, 30, 60].map((v) => (
              <option key={v} value={v}>
                {v} 秒
              </option>
            ))}
          </select>
        </div>
        {/* 标题格式 - 始终显示，未开启自动重命名时置灰 */}
        <div
          style={{
            marginBottom: "10px",
            padding: "14px 16px",
            backgroundColor: "var(--gh-card-bg, #ffffff)",
            border: "1px solid var(--gh-card-border, #e5e7eb)",
            borderRadius: "8px",
            opacity: settings.tabSettings?.autoRenameTab ? 1 : 0.5,
            pointerEvents: settings.tabSettings?.autoRenameTab ? "auto" : "none",
          }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
            <label
              style={{
                fontWeight: 500,
                fontSize: "13px",
                color: "var(--gh-text, #374151)",
                marginRight: "12px",
                whiteSpace: "nowrap",
              }}>
              {t("titleFormatLabel") || "标题格式"}
            </label>
            <input
              type="text"
              value={settings.tabSettings?.titleFormat || "{status}{title}"}
              onChange={(e) => updateNestedSetting("tabSettings", "titleFormat", e.target.value)}
              placeholder="{status}{title}"
              disabled={!settings.tabSettings?.autoRenameTab}
              style={{
                flex: 1,
                maxWidth: "200px",
                padding: "4px 8px",
                borderRadius: "4px",
                border: "1px solid var(--gh-input-border, #d1d5db)",
                fontSize: "12px",
                backgroundColor: settings.tabSettings?.autoRenameTab
                  ? "var(--gh-input-bg, white)"
                  : "var(--gh-bg-tertiary, #f3f4f6)",
                color: "var(--gh-text, #374151)",
              }}
            />
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "var(--gh-text-secondary, #9ca3af)",
              marginTop: "4px",
            }}>
            {t("titleFormatDesc") || "自定义标题格式，支持占位符：{status}、{title}、{model}"}
          </div>
        </div>
        <ToggleRow
          label={t("showStatusLabel") || "显示生成状态"}
          desc={t("showStatusDesc") || "在标签页标题中显示生成状态"}
          checked={settings.tabSettings?.showStatus ?? true}
          onChange={() =>
            updateNestedSetting("tabSettings", "showStatus", !settings.tabSettings?.showStatus)
          }
        />
        <ToggleRow
          label={t("showNotificationLabel")}
          desc={t("showNotificationDesc")}
          checked={settings.tabSettings?.showNotification ?? true}
          onChange={() =>
            updateNestedSetting(
              "tabSettings",
              "showNotification",
              !settings.tabSettings?.showNotification,
            )
          }
        />
        {/* 通知声音 - 始终显示，未开启通知时置灰 */}
        <ToggleRow
          label={t("notificationSoundLabel") || "通知声音"}
          desc={t("notificationSoundDesc") || "生成完成时播放提示音"}
          checked={settings.tabSettings?.notificationSound ?? false}
          disabled={!settings.tabSettings?.showNotification}
          onChange={() =>
            updateNestedSetting(
              "tabSettings",
              "notificationSound",
              !settings.tabSettings?.notificationSound,
            )
          }
        />
        {/* 声音音量 - 始终显示，未开启通知或声音时置灰 */}
        <div
          style={{
            marginBottom: "12px",
            opacity:
              settings.tabSettings?.showNotification && settings.tabSettings?.notificationSound
                ? 1
                : 0.5,
            pointerEvents:
              settings.tabSettings?.showNotification && settings.tabSettings?.notificationSound
                ? "auto"
                : "none",
          }}>
          <label
            style={{
              display: "block",
              marginBottom: "4px",
              fontWeight: 500,
              fontSize: "13px",
            }}>
            {t("notificationVolumeLabel") || "声音音量"}
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={settings.tabSettings?.notificationVolume || 0.5}
              onChange={(e) =>
                updateNestedSetting("tabSettings", "notificationVolume", parseFloat(e.target.value))
              }
              disabled={
                !settings.tabSettings?.showNotification || !settings.tabSettings?.notificationSound
              }
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: "12px", minWidth: "36px" }}>
              {Math.round((settings.tabSettings?.notificationVolume || 0.5) * 100)}%
            </span>
          </div>
        </div>
        {/* 前台时也通知 - 始终显示，未开启通知时置灰 */}
        <ToggleRow
          label={t("notifyWhenFocusedLabel") || "前台时也通知"}
          desc={t("notifyWhenFocusedDesc") || "窗口在前台时也发送通知"}
          checked={settings.tabSettings?.notifyWhenFocused ?? false}
          disabled={!settings.tabSettings?.showNotification}
          onChange={() =>
            updateNestedSetting(
              "tabSettings",
              "notifyWhenFocused",
              !settings.tabSettings?.notifyWhenFocused,
            )
          }
        />
        {/* 自动窗口置顶 - 始终显示，未开启通知时置灰 */}
        <ToggleRow
          label={t("autoFocusLabel") || "自动窗口置顶"}
          desc={t("autoFocusDesc") || "生成完成后自动激活窗口"}
          checked={settings.tabSettings?.autoFocus ?? false}
          disabled={!settings.tabSettings?.showNotification}
          onChange={() =>
            updateNestedSetting("tabSettings", "autoFocus", !settings.tabSettings?.autoFocus)
          }
        />
        <ToggleRow
          label={t("privacyModeLabel")}
          desc={t("privacyModeDesc")}
          checked={settings.tabSettings?.privacyMode ?? false}
          onChange={() =>
            updateNestedSetting("tabSettings", "privacyMode", !settings.tabSettings?.privacyMode)
          }
        />
        {/* 伪装标题 - 始终显示，未开启隐私模式时置灰 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
            padding: "14px 16px",
            backgroundColor: "var(--gh-card-bg, #ffffff)",
            border: "1px solid var(--gh-card-border, #e5e7eb)",
            borderRadius: "8px",
            opacity: settings.tabSettings?.privacyMode ? 1 : 0.5,
            pointerEvents: settings.tabSettings?.privacyMode ? "auto" : "none",
          }}>
          <label
            style={{
              fontWeight: 500,
              fontSize: "13px",
              color: "var(--gh-text, #374151)",
              marginRight: "12px",
              whiteSpace: "nowrap",
            }}>
            {t("privacyTitleLabel") || "伪装标题"}
          </label>
          <input
            type="text"
            value={settings.tabSettings?.privacyTitle || "Google"}
            onChange={(e) => updateNestedSetting("tabSettings", "privacyTitle", e.target.value)}
            placeholder="Google"
            disabled={!settings.tabSettings?.privacyMode}
            style={{
              flex: 1,
              maxWidth: "200px",
              padding: "4px 8px",
              borderRadius: "4px",

              border: "1px solid var(--gh-input-border, #d1d5db)",
              fontSize: "12px",
              backgroundColor: settings.tabSettings?.privacyMode
                ? "var(--gh-input-bg, white)"
                : "var(--gh-bg-tertiary, #f3f4f6)",
              color: "var(--gh-text, #374151)",
            }}
          />
        </div>
      </CollapsibleSection>

      {/* ========== 阅读历史 ========== */}
      <CollapsibleSection title={t("readingHistoryTitle") || "阅读历史"} defaultExpanded={false}>
        <ToggleRow
          label={t("readingHistoryPersistenceLabel")}
          desc={t("readingHistoryPersistenceDesc")}
          checked={settings.readingHistory?.persistence ?? true}
          onChange={() =>
            updateNestedSetting(
              "readingHistory",
              "persistence",
              !settings.readingHistory?.persistence,
            )
          }
        />
        <ToggleRow
          label={t("readingHistoryAutoRestoreLabel")}
          desc={t("readingHistoryAutoRestoreDesc")}
          checked={settings.readingHistory?.autoRestore ?? true}
          disabled={!settings.readingHistory?.persistence}
          onChange={() =>
            updateNestedSetting(
              "readingHistory",
              "autoRestore",
              !settings.readingHistory?.autoRestore,
            )
          }
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
            padding: "14px 16px",
            backgroundColor: "var(--gh-card-bg, #ffffff)",
            border: "1px solid var(--gh-card-border, #e5e7eb)",
            borderRadius: "8px",
            opacity: settings.readingHistory?.persistence ? 1 : 0.5,
            pointerEvents: settings.readingHistory?.persistence ? "auto" : "none",
          }}>
          <label style={{ fontWeight: 500, fontSize: "13px", color: "var(--gh-text, #374151)" }}>
            {t("readingHistoryCleanup") || "历史保留时间"}
          </label>
          <select
            value={settings.readingHistory?.cleanupDays || 30}
            onChange={(e) =>
              updateNestedSetting("readingHistory", "cleanupDays", parseInt(e.target.value))
            }
            disabled={!settings.readingHistory?.persistence}
            style={{
              width: "auto",
              padding: "4px 8px",
              borderRadius: "4px",
              border: "1px solid var(--gh-input-border, #d1d5db)",
              fontSize: "12px",
              backgroundColor: "var(--gh-input-bg, white)",
              color: "var(--gh-text, #374151)",
            }}>
            <option value={1}>1{t("daysSuffix")}</option>
            <option value={3}>3{t("daysSuffix")}</option>
            <option value={7}>7{t("daysSuffix")}</option>
            <option value={30}>30{t("daysSuffix")}</option>
            <option value={90}>90{t("daysSuffix")}</option>
            <option value={-1}>{t("cleanupInfinite")}</option>
          </select>
        </div>
      </CollapsibleSection>

      {/* ========== 模型锁定 ========== */}
      <CollapsibleSection title={t("modelLockTitle") || "模型锁定"} defaultExpanded={false}>
        {/* Enterprise / Gemini Enterprise */}
        <ModelLockSiteRow
          siteId="gemini-enterprise"
          siteName="Gemini Enterprise"
          config={
            settings.modelLockConfig?.["gemini-enterprise"] || { enabled: false, keyword: "" }
          }
          onChange={(config) => {
            setSettings({
              ...settings,
              modelLockConfig: {
                ...settings.modelLockConfig,
                "gemini-enterprise": config,
              },
            })
          }}
        />
        {/* Gemini */}
        <ModelLockSiteRow
          siteId="gemini"
          siteName="Gemini"
          config={settings.modelLockConfig?.["gemini"] || { enabled: false, keyword: "" }}
          onChange={(config) => {
            setSettings({
              ...settings,
              modelLockConfig: {
                ...settings.modelLockConfig,
                gemini: config,
              },
            })
          }}
        />
      </CollapsibleSection>

      {/* ========== 内容设置 ========== */}
      <CollapsibleSection title={t("contentExportSettingsTitle")} defaultExpanded={false}>
        <ToggleRow
          label={t("markdownFixLabel")}
          desc={t("markdownFixDesc")}
          checked={settings.markdownFix ?? true}
          onChange={() => setSettings({ ...settings, markdownFix: !settings.markdownFix })}
        />
        <ToggleRow
          label={t("clearOnSendLabel")}
          desc={t("clearOnSendDesc")}
          checked={settings.clearTextareaOnSend ?? false}
          onChange={() =>
            setSettings({ ...settings, clearTextareaOnSend: !settings.clearTextareaOnSend })
          }
        />
        <ToggleRow
          label={t("watermarkRemovalLabel") || "水印移除"}
          desc={t("watermarkRemovalDesc") || "自动移除AI生成图片的水印"}
          checked={settings.watermarkRemoval ?? true}
          onChange={() =>
            setSettings({ ...settings, watermarkRemoval: !settings.watermarkRemoval })
          }
        />
        <ToggleRow
          label={t("exportImagesToBase64Label") || "导出时图片转Base64"}
          desc={t("exportImagesToBase64Desc") || "导出会话时将图片转为Base64嵌入"}
          checked={settings.conversations?.exportImagesToBase64 ?? false}
          onChange={() =>
            updateNestedSetting(
              "conversations",
              "exportImagesToBase64",
              !settings.conversations?.exportImagesToBase64,
            )
          }
        />
        <ToggleRow
          label={t("formulaCopyLabel")}
          desc={t("formulaCopyDesc")}
          checked={settings.copy?.formulaCopyEnabled ?? true}
          onChange={() =>
            updateNestedSetting("copy", "formulaCopyEnabled", !settings.copy?.formulaCopyEnabled)
          }
        />
        <ToggleRow
          label={t("formulaDelimiterLabel")}
          desc={t("formulaDelimiterDesc")}
          checked={settings.copy?.formulaDelimiterEnabled ?? true}
          disabled={!settings.copy?.formulaCopyEnabled}
          onChange={() =>
            updateNestedSetting(
              "copy",
              "formulaDelimiterEnabled",
              !settings.copy?.formulaDelimiterEnabled,
            )
          }
        />
        <ToggleRow
          label={t("tableCopyLabel")}
          desc={t("tableCopyDesc")}
          checked={settings.copy?.tableCopyEnabled ?? true}
          onChange={() =>
            updateNestedSetting("copy", "tableCopyEnabled", !settings.copy?.tableCopyEnabled)
          }
        />
      </CollapsibleSection>

      {/* ========== 数据管理 ========== */}
      <CollapsibleSection title={t("dataManagementTitle") || "数据管理"} defaultExpanded={false}>
        <div
          style={{
            fontSize: "12px",
            color: "var(--gh-text-secondary, #6b7280)",
            marginBottom: "12px",
          }}>
          {t("dataManagementDesc") || "导出或导入扩展的所有设置和数据"}
        </div>

        {/* 导出数据 */}
        <div style={{ marginBottom: "12px" }}>
          <button
            onClick={async () => {
              try {
                // 获取 local 和 sync 的所有数据
                const [localData, syncData] = await Promise.all([
                  new Promise<Record<string, any>>((resolve) =>
                    chrome.storage.local.get(null, resolve),
                  ),
                  new Promise<Record<string, any>>((resolve) =>
                    chrome.storage.sync.get(null, resolve),
                  ),
                ])

                const exportData = {
                  version: 1,
                  timestamp: new Date().toISOString(),
                  local: localData,
                  sync: syncData,
                }

                const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                  type: "application/json",
                })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = `chat-helper-backup-${new Date().toISOString().slice(0, 10)}.json`
                a.click()
                URL.revokeObjectURL(url)

                alert(t("exportSuccess") || "导出成功！")
              } catch (err) {
                console.error("Export error:", err)
                alert(t("exportError") || "导出失败：" + String(err))
              }
            }}
            style={{
              width: "100%",
              padding: "10px 16px",
              borderRadius: "6px",
              border: "1px solid var(--gh-input-border, #d1d5db)",
              background:
                "var(--gh-brand-gradient, linear-gradient(135deg, #4285f4 0%, #34a853 100%))",
              color: "var(--gh-text-on-primary, white)",
              fontWeight: 500,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}>
            <span>📤</span>
            {t("exportDataBtn") || "导出全部数据"}
          </button>
        </div>

        {/* 导入数据 */}
        <div>
          <input
            type="file"
            id="import-data-input"
            accept=".json"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return

              try {
                const text = await file.text()
                const data = JSON.parse(text)

                if (!data.version || !data.local || !data.sync) {
                  throw new Error(t("invalidBackupFile") || "无效的备份文件格式")
                }

                const confirm = window.confirm(
                  (t("importConfirm") || "确定要导入数据吗？这将覆盖当前所有设置和数据。") +
                    `\n\n${t("backupTime") || "备份时间"}：${data.timestamp}`,
                )

                if (!confirm) {
                  e.target.value = ""
                  return
                }

                // 导入数据到 local 和 sync
                await Promise.all([
                  new Promise<void>((resolve, reject) =>
                    chrome.storage.local.set(data.local, () =>
                      chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(),
                    ),
                  ),
                  new Promise<void>((resolve, reject) =>
                    chrome.storage.sync.set(data.sync, () =>
                      chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(),
                    ),
                  ),
                ])

                alert(t("importSuccess") || "导入成功！页面将刷新以应用新设置。")
                window.location.reload()
              } catch (err) {
                console.error("Import error:", err)
                alert(t("importError") || "导入失败：" + String(err))
              } finally {
                e.target.value = ""
              }
            }}
          />
          <button
            onClick={() => document.getElementById("import-data-input")?.click()}
            style={{
              width: "100%",
              padding: "10px 16px",
              borderRadius: "6px",
              border: "1px solid var(--gh-input-border, #d1d5db)",
              background: "var(--gh-bg-secondary, #f9fafb)",
              color: "var(--gh-text, #374151)",
              fontWeight: 500,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}>
            <span>📥</span>
            {t("importDataBtn") || "导入数据"}
          </button>
        </div>

        <div
          style={{
            fontSize: "11px",
            color: "var(--gh-text-secondary, #9ca3af)",
            marginTop: "12px",
          }}>
          {t("dataManagementNote") ||
            "提示：导出的文件包含所有设置、会话记录等数据。可用于备份或迁移到新设备。"}
        </div>
      </CollapsibleSection>
    </div>
  )
}
