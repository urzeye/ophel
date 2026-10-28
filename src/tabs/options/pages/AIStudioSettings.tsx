/**
 * AI Studio 专属设置：界面默认折叠、搜索工具、去水印、Markdown 修复
 */
import React from "react"

import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import { showToast } from "~utils/toast"

import { SettingCard, ToggleRow } from "../components"

type AIStudioToggleField =
  | "collapseNavbar"
  | "collapseRunSettings"
  | "collapseTools"
  | "collapseAdvanced"
  | "enableSearch"
  | "removeWatermark"
  | "markdownFix"

interface AIStudioToggle {
  field: AIStudioToggleField
  labelKey: string
  descKey: string
  settingId: string
  /** settings.aistudio 缺省该字段时的生效值，需与 DEFAULT_SETTINGS.aistudio 的读取方一致 */
  defaultValue: boolean
  /** 需要刷新页面才生效，切换后给出提示 */
  needsReload?: boolean
}

const AISTUDIO_TOGGLES: AIStudioToggle[] = [
  {
    field: "collapseNavbar",
    labelKey: "aistudioCollapseNavbar",
    descKey: "aistudioCollapseNavbarDesc",
    settingId: "aistudio-collapse-navbar",
    defaultValue: false,
  },
  {
    field: "collapseRunSettings",
    labelKey: "aistudioCollapseRunSettings",
    descKey: "aistudioCollapseRunSettingsDesc",
    settingId: "aistudio-collapse-run-settings",
    defaultValue: false,
  },
  {
    field: "collapseTools",
    labelKey: "aistudioCollapseTools",
    descKey: "aistudioCollapseToolsDesc",
    settingId: "aistudio-collapse-tools",
    defaultValue: false,
  },
  {
    field: "collapseAdvanced",
    labelKey: "aistudioCollapseAdvanced",
    descKey: "aistudioCollapseAdvancedDesc",
    settingId: "aistudio-collapse-advanced",
    defaultValue: false,
  },
  {
    field: "enableSearch",
    labelKey: "aistudioEnableSearch",
    descKey: "aistudioEnableSearchDesc",
    settingId: "aistudio-enable-search",
    defaultValue: true,
  },
  {
    field: "removeWatermark",
    labelKey: "aistudioRemoveWatermark",
    descKey: "aistudioRemoveWatermarkDesc",
    settingId: "aistudio-remove-watermark",
    defaultValue: false,
    needsReload: true,
  },
  {
    field: "markdownFix",
    labelKey: "aistudioMarkdownFixLabel",
    descKey: "aistudioMarkdownFixDesc",
    settingId: "aistudio-markdown-fix",
    defaultValue: false,
  },
]

const AIStudioSettings: React.FC = () => {
  const { settings, setSettings } = useSettingsStore()

  if (!settings) return null

  return (
    <SettingCard settingId="aistudio-settings-card">
      {AISTUDIO_TOGGLES.map(
        ({ field, labelKey, descKey, settingId, defaultValue, needsReload }) => {
          const checked = settings.aistudio?.[field] ?? defaultValue
          return (
            <ToggleRow
              key={field}
              label={t(labelKey)}
              description={t(descKey)}
              settingId={settingId}
              checked={checked}
              onChange={() => {
                setSettings({ aistudio: { ...settings.aistudio, [field]: !checked } })
                if (needsReload) {
                  showToast(t("aistudioReloadHint"), 3000)
                }
              }}
            />
          )
        },
      )}
    </SettingCard>
  )
}

export default AIStudioSettings
