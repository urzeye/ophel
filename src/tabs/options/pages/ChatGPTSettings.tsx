/**
 * ChatGPT 专属设置：Markdown 修复与长对话渲染性能选项
 */
import React from "react"

import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"

import { SettingCard, ToggleRow } from "../components"

type ChatGPTToggleField =
  | "markdownFix"
  | "codeBlockBatchMount"
  | "streamingRenderOptimize"
  | "disableBackdropBlur"

interface ChatGPTToggle {
  field: ChatGPTToggleField
  labelKey: string
  descKey: string
  settingId: string
  /** settings.chatgpt 缺省该字段时的生效值，需与 DEFAULT_SETTINGS.chatgpt 一致 */
  defaultValue: boolean
}

const CHATGPT_TOGGLES: ChatGPTToggle[] = [
  {
    field: "markdownFix",
    labelKey: "chatgptMarkdownFixLabel",
    descKey: "chatgptMarkdownFixDesc",
    settingId: "chatgpt-markdown-fix",
    defaultValue: false,
  },
  {
    field: "codeBlockBatchMount",
    labelKey: "chatgptCodeBlockBatchMountLabel",
    descKey: "chatgptCodeBlockBatchMountDesc",
    settingId: "chatgpt-code-block-batch-mount",
    defaultValue: true,
  },
  {
    field: "streamingRenderOptimize",
    labelKey: "chatgptStreamingRenderOptimizeLabel",
    descKey: "chatgptStreamingRenderOptimizeDesc",
    settingId: "chatgpt-streaming-render-optimize",
    defaultValue: true,
  },
  {
    field: "disableBackdropBlur",
    labelKey: "chatgptDisableBackdropBlurLabel",
    descKey: "chatgptDisableBackdropBlurDesc",
    settingId: "chatgpt-disable-backdrop-blur",
    defaultValue: false,
  },
]

const ChatGPTSettings: React.FC = () => {
  const { settings, setSettings } = useSettingsStore()

  if (!settings) return null

  return (
    <SettingCard settingId="chatgpt-settings-card">
      {CHATGPT_TOGGLES.map(({ field, labelKey, descKey, settingId, defaultValue }) => {
        const checked = settings.chatgpt?.[field] ?? defaultValue
        return (
          <ToggleRow
            key={field}
            label={t(labelKey)}
            description={t(descKey)}
            settingId={settingId}
            checked={checked}
            onChange={() => setSettings({ chatgpt: { ...settings.chatgpt, [field]: !checked } })}
          />
        )
      })}
    </SettingCard>
  )
}

export default ChatGPTSettings
