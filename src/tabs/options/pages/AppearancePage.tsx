/**
 * 外观主题页面
 * 包含：主题预置 | 自定义样式
 */
import React, { useEffect, useState } from "react"

import {
  AppearanceIcon,
  CheckIcon,
  DeleteIcon,
  EditIcon,
  PlusIcon,
  ThemeDarkIcon,
  ThemeLightIcon,
} from "~components/icons"
import { ConfirmDialog, Tooltip } from "~components/ui"
import { APPEARANCE_TAB_IDS } from "~constants"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import { getSiteTheme, type CustomStyle } from "~utils/storage"
import {
  darkPresets,
  lightPresets,
  parseThemeVariablesFromCSS,
  type ThemePreset,
  type ThemeVariables,
} from "~utils/themes"
import { showToast as showDomToast } from "~utils/toast"

import { PageTitle, SettingCard, TabGroup, ToggleRow } from "../components"
import { CustomStyleEditorDialog } from "../components/CustomStyleEditorDialog"
import { ThemePreview } from "../components/ThemePreview"

interface AppearancePageProps {
  siteId: string
  initialTab?: string
}

// CSS 模板：完整示例，同时作为新建自定义样式的起点
const CSS_TEMPLATE = `/* ==========================================================================
   Ophel custom style starter
   --------------------------------------------------------------------------
   This file contains two complete palettes:
   - the light palette in ":host", based on the built-in "Google Gradient";
   - the dark palette in ':host([data-theme="dark"])', based on the built-in
     "Classic Dark".
   All 24 built-in presets use the same --gh-* variable contract, so any value
   can be copied from src/utils/themes/light/index.ts or
   src/utils/themes/dark/index.ts.

   How it works
   - Custom styles are injected inside Ophel's Shadow DOM.
   - :host is the panel host element. Variables declared here cascade to
     every panel component inside the Shadow DOM.
   - ThemeManager writes data-theme="light" or data-theme="dark" to the host.
     The second block wins only in dark mode, so both blocks can stay active.
   - The Light/Dark radio in the editor decides which picker list this style
     appears in and which palette the preview uses. It does not change the CSS
     selectors; the host attribute does.
   - Prefer changing variables over overriding component CSS. Variables keep
     hover, focus, disabled states, and every built-in theme coherent.
   - Every declaration is optional. Remove one to inherit the default from
     Ophel's base stylesheet.
   - The most useful starting points are --gh-primary, --gh-header-bg,
     --gh-bg, --gh-text, --gh-card-bg, and the selected/folder colors.

   Tip: change one group at a time and use the style preview in the list to
   compare the result before saving.
   ========================================================================== */

:host {
  /* Keep native controls (scrollbars, form widgets) in the matching mode. */
  color-scheme: light;

  /* ------------------------------------------------------------------------
     1. Surfaces
     The main panel, secondary surfaces, and subtle fills such as hovered rows.
     ------------------------------------------------------------------------ */
  --gh-bg: #ffffff;
  --gh-bg-secondary: #f9fafb;
  --gh-bg-tertiary: #f3f4f6;

  /* ------------------------------------------------------------------------
     2. Text
     Primary text, supporting text, muted text, and text placed on top of the
     primary/accent color.
     ------------------------------------------------------------------------ */
  --gh-text: #1f2937;
  --gh-text-secondary: #6b7280;
  --gh-text-tertiary: #8d94a1;
  --gh-text-on-primary: #ffffff;

  /* Optional icon colors. They normally derive from the text and primary
     colors; override them only when icons need different contrast.
  --gh-icon: var(--gh-text-secondary);
  --gh-icon-active: var(--gh-primary);
  --gh-icon-hover: var(--gh-text);
  */

  /* ------------------------------------------------------------------------
     3. Borders and interaction
     Base border, active/accent border, hover fill, and pressed/selected fill.
     ------------------------------------------------------------------------ */
  --gh-border: #e5e7eb;
  --gh-border-active: #4285f4;
  --gh-hover: #f3f4f6;
  --gh-active-bg: #e5e7eb;

  /* ------------------------------------------------------------------------
     4. Inputs
     Text fields, search boxes, and the focus ring.
     ------------------------------------------------------------------------ */
  --gh-input-bg: #ffffff;
  --gh-input-border: #d1d5db;
  --gh-input-focus-border: #4285f4;
  --gh-input-focus-shadow: 0 0 0 2px rgba(66, 133, 244, 0.1);

  /* ------------------------------------------------------------------------
     5. Elevation
     Panel shadow, small control shadow, large dialog shadow, and the colored
     shadow used by primary actions.
     ------------------------------------------------------------------------ */
  --gh-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  --gh-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1);
  --gh-shadow-lg: 0 20px 60px rgba(0, 0, 0, 0.3);
  --gh-shadow-brand: 0 4px 12px rgba(66, 133, 244, 0.3);

  /* ------------------------------------------------------------------------
     6. Brand and accents
     --gh-primary is the main accent. --gh-primary-text is the readable
     variant used for text and icons on light surfaces.
     ------------------------------------------------------------------------ */
  --gh-primary: #4285f4;
  --gh-primary-text: #1a73e8;
  --gh-secondary: #34a853;
  --gh-danger: #ef4444;

  /* ------------------------------------------------------------------------
     7. Panel header and tabs
     --gh-header-bg accepts a solid color or any CSS gradient. When the header
     background is light, set --gh-header-text to a dark color.
     ------------------------------------------------------------------------ */
  --gh-header-bg: linear-gradient(135deg, #4285f4 0%, #34a853 100%);
  --gh-header-text: #ffffff;
  --gh-tag-active-bg: #4285f4;
  --gh-checkbox-bg: #4f46e5;

  /* ------------------------------------------------------------------------
     8. Badges
     Small labels such as counts, "New" markers, and mode badges.
     ------------------------------------------------------------------------ */
  --gh-badge-text: #4b5563;
  --gh-badge-bg: #ffffff;
  --gh-badge-border: #e5e7eb;
  --gh-badge-shadow: #ffffff;

  /* ------------------------------------------------------------------------
     9. Selection and folders
     Selected row background plus eight folder accent colors. Folder colors
     are intentionally light; text continues to use --gh-text.
     ------------------------------------------------------------------------ */
  --gh-selected-gradient: linear-gradient(
    135deg,
    rgba(66, 133, 244, 0.1) 0%,
    rgba(52, 211, 153, 0.1) 100%
  );
  --gh-folder-bg-default: #e0f2fe;
  --gh-folder-bg-expanded: #c7d2fe;
  --gh-folder-bg-0: #fef9e7;
  --gh-folder-bg-1: #fdf2f8;
  --gh-folder-bg-2: #eff6ff;
  --gh-folder-bg-3: #ecfdf5;
  --gh-folder-bg-4: #faf5ff;
  --gh-folder-bg-5: #fefce8;
  --gh-folder-bg-6: #ecfeff;
  --gh-folder-bg-7: #fdf4ff;

  /* ------------------------------------------------------------------------
     10. Outline highlights
     Locate is the strong highlight used when jumping to an outline item.
     Sync is the softer background used while following the page scroll.
     ------------------------------------------------------------------------ */
  --gh-outline-locate-bg: rgba(16, 185, 129, 0.25);
  --gh-outline-locate-border: #10b981;
  --gh-outline-locate-shadow: rgba(16, 185, 129, 0.5);
  --gh-outline-sync-bg: rgba(52, 211, 153, 0.1);
  --gh-outline-sync-border: #34d399;

  /* ------------------------------------------------------------------------
     11. User question blocks
     Backgrounds for quoted user messages and their hover state.
     ------------------------------------------------------------------------ */
  --gh-user-query-bg: rgba(66, 133, 244, 0.08);
  --gh-user-query-hover-bg: rgba(66, 133, 244, 0.15);

  /* ------------------------------------------------------------------------
     12. Destructive actions
     Delete buttons, warnings, and confirmation dialogs.
     ------------------------------------------------------------------------ */
  --gh-bg-danger: #fef2f2;
  --gh-text-danger: #ef4444;
  --gh-bg-danger-hover: #fee2e2;

  /* ------------------------------------------------------------------------
     13. Brand gradient and glass controls
     The gradient is used by the logo and brand accents. Glass colors are used
     by translucent controls placed on top of the header.
     ------------------------------------------------------------------------ */
  --gh-brand-gradient: linear-gradient(135deg, #4285f4 0%, #34a853 100%);
  --gh-brand-border: transparent;
  --gh-glass-bg: rgba(255, 255, 255, 0.2);
  --gh-glass-bg-hover: rgba(255, 255, 255, 0.3);
  --gh-glass-text: #ffffff;

  /* ------------------------------------------------------------------------
     14. Settings surfaces
     Cards and borders used by the in-panel settings dialog.
     ------------------------------------------------------------------------ */
  --gh-card-bg: #ffffff;
  --gh-card-border: #e5e7eb;

  /* Optional settings-page layers. Leave these unset to derive them from the
     background and card colors above.
  --gh-surface: var(--gh-card-bg);
  --gh-canvas: color-mix(in srgb, var(--gh-bg) 96%, var(--gh-text));
  */

  /* ------------------------------------------------------------------------
     15. Overlays and small details
     ------------------------------------------------------------------------ */
  --gh-overlay-bg: rgba(0, 0, 0, 0.5);
  --gh-btn-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  --gh-btn-shadow-hover: 0 4px 12px rgba(0, 0, 0, 0.2);
  --gh-search-highlight-bg: rgba(255, 235, 59, 0.5);
  --gh-emoji-selected-bg: #dbeafe;
  --gh-highlight-pulse: rgba(59, 130, 246, 0.3);
  --gh-slider-dot-bg: #d1d5db;
  --gh-code-bg: rgba(0, 0, 0, 0.05);

  /* Optional: global search result badges inside the outline.
  --gh-search-outline-query-accent: #3b82f6;
  --gh-search-outline-query-bg: rgba(59, 130, 246, 0.14);
  --gh-search-outline-query-text: #1d4ed8;
  --gh-search-outline-query-border: rgba(59, 130, 246, 0.32);
  --gh-search-outline-reply-accent: #8b5cf6;
  --gh-search-outline-reply-bg: rgba(139, 92, 246, 0.14);
  --gh-search-outline-reply-text: #7c3aed;
  --gh-search-outline-reply-border: rgba(139, 92, 246, 0.3);
  */

  /* Optional: a background image or animation behind the panel.
  --gh-bg-image: url("https://example.com/texture.png");
  --gh-bg-animation: none;
  */
}

/* ==========================================================================
   Optional component-level overrides
   --------------------------------------------------------------------------
   The variables above cover most of the UI. Use class selectors only when a
   change cannot be expressed with variables. Keep overrides small so future
   updates remain safe. Uncomment an example and adjust it.

.gh-main-panel {
  border-radius: 16px;
  border-color: var(--gh-primary);
}

.gh-panel-header {
  background: var(--gh-header-bg);
  color: var(--gh-header-text, #ffffff);
}

.gh-panel-tab-btn.active {
  color: var(--gh-primary-text, var(--gh-primary));
  border-bottom-color: var(--gh-primary);
}

.gh-panel-content {
  background: linear-gradient(180deg, var(--gh-bg) 0%, var(--gh-bg-secondary) 100%);
}
*/

/* ==========================================================================
   Dark palette
   --------------------------------------------------------------------------
   ThemeManager writes data-theme="dark" to the panel host, so this block only
   applies in dark mode. The values mirror the built-in "Classic Dark" preset.
   Keep the variable names identical to the light block: that makes the two
   palettes easy to compare and keeps the editor preview accurate.
   ========================================================================== */

:host([data-theme="dark"]) {
  color-scheme: dark;

  /* ------------------------------------------------------------------------
     1. Surfaces
     The secondary surface is intentionally darker than the panel. This adds
     depth in dark mode without relying on heavy shadows.
     ------------------------------------------------------------------------ */
  --gh-bg: #1e1e1e;
  --gh-bg-secondary: #0b0b0b;
  --gh-bg-tertiary: #262626;

  /* ------------------------------------------------------------------------
     2. Text
     Dark themes reverse the light relationship: text gets lighter as the
     surface gets darker. --gh-text-on-primary is dark here because the accent
     color is light enough to need dark text on top.
     ------------------------------------------------------------------------ */
  --gh-text: #e3e3e3;
  --gh-text-secondary: #a0a0a0;
  --gh-text-tertiary: #6b7280;
  --gh-text-on-primary: #1e1b4b;

  /* Optional icon colors. They normally derive from the text and primary
     colors; override them only when icons need different contrast.
  --gh-icon: var(--gh-text-secondary);
  --gh-icon-active: var(--gh-primary);
  --gh-icon-hover: var(--gh-text);
  */

  /* ------------------------------------------------------------------------
     3. Borders and interaction
     Keep borders one step lighter than their surface so controls remain
     visible without turning into bright outlines.
     ------------------------------------------------------------------------ */
  --gh-border: #333333;
  --gh-border-active: #818cf8;
  --gh-hover: #262626;
  --gh-active-bg: #333333;

  /* ------------------------------------------------------------------------
     4. Inputs
     Inputs sit slightly above the panel surface. The focus ring uses the
     accent color with transparency so it does not glow too aggressively.
     ------------------------------------------------------------------------ */
  --gh-input-bg: #262626;
  --gh-input-border: #404040;
  --gh-input-focus-border: #818cf8;
  --gh-input-focus-shadow: 0 0 0 2px rgba(129, 140, 248, 0.2);

  /* ------------------------------------------------------------------------
     5. Elevation
     Dark surfaces need stronger black shadows to separate floating layers
     from the page. The brand shadow keeps the accent hue.
     ------------------------------------------------------------------------ */
  --gh-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  --gh-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --gh-shadow-lg: 0 20px 60px rgba(0, 0, 0, 0.7);
  --gh-shadow-brand: 0 4px 12px rgba(129, 140, 248, 0.3);

  /* ------------------------------------------------------------------------
     6. Brand and accents
     --gh-primary is the main accent. --gh-primary-text is the readable
     version used for text and icons; dark themes usually keep both identical.
     ------------------------------------------------------------------------ */
  --gh-primary: #818cf8;
  --gh-primary-text: #818cf8;
  --gh-secondary: #6366f1;
  --gh-danger: #fca5a5;

  /* ------------------------------------------------------------------------
     7. Panel header and tabs
     A solid header color works better than a bright gradient in dark mode.
     --gh-header-text must stay readable against --gh-header-bg.
     ------------------------------------------------------------------------ */
  --gh-header-bg: #1e1e1e;
  --gh-header-text: #ffffff;
  --gh-tag-active-bg: rgba(129, 140, 248, 0.6);
  --gh-checkbox-bg: #818cf8;

  /* ------------------------------------------------------------------------
     8. Badges
     Badges use a raised neutral surface instead of the light theme's white
     pill, otherwise they would become the brightest element on the panel.
     ------------------------------------------------------------------------ */
  --gh-badge-text: #e5e7eb;
  --gh-badge-bg: #374151;
  --gh-badge-border: #4b5563;
  --gh-badge-shadow: #1f2937;

  /* ------------------------------------------------------------------------
     9. Selection and folders
     Folder colors are translucent so the panel background still shows through
     and the eight accent colors stay distinguishable in dark mode.
     ------------------------------------------------------------------------ */
  --gh-selected-gradient: linear-gradient(
    135deg,
    rgba(129, 140, 248, 0.25) 0%,
    rgba(99, 102, 241, 0.15) 100%
  );
  --gh-folder-bg-default: rgba(66, 133, 244, 0.15);
  --gh-folder-bg-expanded: rgba(66, 133, 244, 0.3);
  --gh-folder-bg-0: rgba(253, 224, 71, 0.15);
  --gh-folder-bg-1: rgba(244, 114, 182, 0.15);
  --gh-folder-bg-2: rgba(96, 165, 250, 0.15);
  --gh-folder-bg-3: rgba(52, 211, 153, 0.15);
  --gh-folder-bg-4: rgba(167, 139, 250, 0.15);
  --gh-folder-bg-5: rgba(253, 224, 71, 0.1);
  --gh-folder-bg-6: rgba(34, 211, 238, 0.15);
  --gh-folder-bg-7: rgba(232, 121, 249, 0.15);

  /* ------------------------------------------------------------------------
     10. Outline highlights
     Locate is the strong highlight used when jumping to an outline item.
     Sync is the softer background used while following the page scroll.
     Classic Dark uses amber for both so they stand out from the blue accent.
     ------------------------------------------------------------------------ */
  --gh-outline-locate-bg: rgba(52, 211, 153, 0.3);
  --gh-outline-locate-border: #fbbf24;
  --gh-outline-locate-shadow: rgba(251, 191, 36, 0.6);
  --gh-outline-sync-bg: rgba(251, 191, 36, 0.15);
  --gh-outline-sync-border: #f59e0b;

  /* ------------------------------------------------------------------------
     11. User question blocks
     Quoted user messages use a translucent accent so they read as related to
     the primary color without competing with the outline highlight.
     ------------------------------------------------------------------------ */
  --gh-user-query-bg: rgba(66, 133, 244, 0.15);
  --gh-user-query-hover-bg: rgba(66, 133, 244, 0.25);

  /* ------------------------------------------------------------------------
     12. Destructive actions
     Destructive colors stay translucent so warnings feel integrated with the
     dark surface instead of appearing as bright red blocks.
     ------------------------------------------------------------------------ */
  --gh-bg-danger: rgba(239, 68, 68, 0.15);
  --gh-text-danger: #fca5a5;
  --gh-bg-danger-hover: rgba(239, 68, 68, 0.25);

  /* ------------------------------------------------------------------------
     13. Brand gradient and glass controls
     The brand gradient is used by the logo and brand accents. Glass colors
     are used by translucent controls placed on top of the header.
     ------------------------------------------------------------------------ */
  --gh-brand-gradient: linear-gradient(135deg, #1a73e8 0%, #1e8e3e 100%);
  --gh-brand-border: #333333;
  --gh-glass-bg: rgba(255, 255, 255, 0.08);
  --gh-glass-bg-hover: rgba(255, 255, 255, 0.12);
  --gh-glass-text: #e3e3e3;

  /* ------------------------------------------------------------------------
     14. Settings surfaces
     Cards and borders used by the in-panel settings dialog.
     ------------------------------------------------------------------------ */
  --gh-card-bg: #0b0b0b;
  --gh-card-border: #333333;

  /* Optional settings-page layers. Leave these unset to use the dark
     derivations from theme-variables.css.
  --gh-surface: color-mix(in srgb, var(--gh-bg) 92%, #ffffff);
  --gh-canvas: color-mix(in srgb, var(--gh-bg) 78%, #000000);
  */

  /* ------------------------------------------------------------------------
     15. Overlays and small details
     These tokens cover masks, button elevation, search marks, emoji
     selection, the locate pulse, slider dots, and inline code backgrounds.
     ------------------------------------------------------------------------ */
  --gh-overlay-bg: rgba(0, 0, 0, 0.7);
  --gh-btn-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  --gh-btn-shadow-hover: 0 4px 12px rgba(0, 0, 0, 0.5);
  --gh-search-highlight-bg: rgba(255, 235, 59, 0.4);
  --gh-emoji-selected-bg: rgba(129, 140, 248, 0.3);
  --gh-highlight-pulse: rgba(129, 140, 248, 0.4);
  --gh-slider-dot-bg: #4b5563;
  --gh-code-bg: rgba(255, 255, 255, 0.08);

  /* Optional: global search result badges inside the outline.
  --gh-search-outline-query-accent: #60a5fa;
  --gh-search-outline-query-bg: rgba(96, 165, 250, 0.25);
  --gh-search-outline-query-text: #bfdbfe;
  --gh-search-outline-query-border: rgba(96, 165, 250, 0.42);
  --gh-search-outline-reply-accent: #a78bfa;
  --gh-search-outline-reply-bg: rgba(167, 139, 250, 0.24);
  --gh-search-outline-reply-text: #ddd6fe;
  --gh-search-outline-reply-border: rgba(167, 139, 250, 0.4);
  */

  /* Optional: a background image or animation behind the panel.
  --gh-bg-image: url("https://example.com/texture.png");
  --gh-bg-animation: none;
  */
}
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
      aria-pressed={isActive}>
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
  const [styleToDelete, setStyleToDelete] = useState<string | null>(null)

  // 获取当前站点的主题配置
  const currentTheme = settings ? getSiteTheme(settings, siteId) : undefined

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
    const sites = settings.theme.sites
    const currentSite = getSiteTheme(settings, siteId)
    setSettings({
      theme: {
        ...settings?.theme,
        sites: {
          ...sites,
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
    const sites = settings.theme.sites
    const currentSite = getSiteTheme(settings, siteId)
    setSettings({
      theme: {
        ...settings?.theme,
        sites: {
          ...sites,
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
    const newStyles = (settings?.theme?.customStyles || []).filter((s) => s.id !== styleId)
    setSettings({
      theme: {
        ...settings?.theme,
        customStyles: newStyles,
      },
    })
  }

  const customStyles = settings?.theme?.customStyles || []

  // 将自定义样式转换为 ThemePreset 格式以兼容 UI 显示
  const customStyleToPreset = (style: CustomStyle): ThemePreset => {
    // 解析用户输入的 CSS 变量
    const parsedVariables = parseThemeVariablesFromCSS(style.css, style.mode)

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

      <SettingCard>
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
            settingId="appearance-custom-styles"
            action={
              <button
                type="button"
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
                <PlusIcon size={16} />
                {t("addCustomStyle")}
              </button>
            }>
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
                        <span className="settings-custom-style-mode-badge">
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
                      <Tooltip content={t("deleteStyle")}>
                        <button
                          type="button"
                          className="settings-btn settings-btn-danger settings-icon-only-btn"
                          onClick={() => setStyleToDelete(style.id)}
                          aria-label={t("deleteStyle")}>
                          <DeleteIcon size={14} />
                        </button>
                      </Tooltip>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </SettingCard>
        </>
      )}

      {/* 样式编辑器：走共享 DialogOverlay */}
      {showStyleEditor && editingStyle && (
        <CustomStyleEditorDialog
          style={editingStyle}
          onChange={setEditingStyle}
          onSave={saveCustomStyle}
          onClose={() => setShowStyleEditor(false)}
        />
      )}

      {styleToDelete && (
        <ConfirmDialog
          title={t("deleteStyle")}
          message={t("confirmDeleteStyle")}
          danger
          onConfirm={() => {
            deleteCustomStyle(styleToDelete)
            setStyleToDelete(null)
          }}
          onCancel={() => setStyleToDelete(null)}
        />
      )}
    </div>
  )
}

export default AppearancePage
