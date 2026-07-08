import React, { useCallback, useEffect, useMemo, useState } from "react"

import { RefreshIcon } from "~components/icons"
import { Switch, Tooltip } from "~components/ui"
import { SITE_IDS } from "~constants"
import { platform } from "~platform"
import { useSettingsStore } from "~stores/settings-store"
import { SettingCard } from "~tabs/options/components"
import { t } from "~utils/i18n"
import {
  MSG_GET_AISTUDIO_MODELS,
  sendToBackground,
  type AIStudioModelInfo,
  type AIStudioModelsResponse,
} from "~utils/messaging"
import type { Settings } from "~utils/storage"
import { showToast, showToastThrottled } from "~utils/toast"

type AIStudioModelListAdapter = {
  getSiteId(): string
  getModelList(): Promise<AIStudioModelInfo[]>
}

function hasAIStudioModelList(adapter: unknown): adapter is AIStudioModelListAdapter {
  if (!adapter || typeof adapter !== "object") return false

  const candidate = adapter as Partial<AIStudioModelListAdapter>
  return typeof candidate.getSiteId === "function" && typeof candidate.getModelList === "function"
}

async function fetchAIStudioModels(): Promise<AIStudioModelsResponse> {
  if (platform.type === "extension") {
    return sendToBackground({
      type: MSG_GET_AISTUDIO_MODELS,
    })
  }

  if (window.location.hostname !== "aistudio.google.com") {
    return { success: false, error: "NO_AISTUDIO_TAB" }
  }

  const { getAdapter } = await import("~adapters")
  const adapter = getAdapter()

  if (!hasAIStudioModelList(adapter) || adapter.getSiteId() !== SITE_IDS.AISTUDIO) {
    return { success: false, error: "NOT_AISTUDIO" }
  }

  const models = await adapter.getModelList()
  return { success: true, models }
}

const ModelLockRow: React.FC<{
  label: string
  siteKey: string
  settings: Settings
  setSettings: (settings: Partial<Settings>) => void
  placeholder: string
  onDisabledClick?: () => void
  settingId?: string
}> = ({ label, siteKey, settings, setSettings, placeholder, onDisabledClick, settingId }) => {
  const currentConfig = useMemo(
    () => settings.modelLock?.[siteKey] || { enabled: false, keyword: "" },
    [settings.modelLock, siteKey],
  )
  const [localKeyword, setLocalKeyword] = useState(currentConfig.keyword)

  useEffect(() => {
    setLocalKeyword(currentConfig.keyword)
  }, [currentConfig.keyword])

  const saveKeyword = useCallback(() => {
    if (localKeyword !== currentConfig.keyword) {
      setSettings({
        modelLock: {
          ...settings.modelLock,
          [siteKey]: { ...currentConfig, keyword: localKeyword },
        },
      })
    }
  }, [localKeyword, currentConfig, settings.modelLock, siteKey, setSettings])

  const toggleEnabled = () => {
    setSettings({
      modelLock: {
        ...settings.modelLock,
        [siteKey]: { ...currentConfig, enabled: !currentConfig.enabled },
      },
    })
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        marginBottom: "12px",
        cursor: currentConfig.enabled ? "default" : "not-allowed",
      }}
      data-setting-id={settingId}>
      <span
        style={{
          fontSize: "14px",
          fontWeight: 500,
          flex: 1,
          color: currentConfig.enabled
            ? "var(--gh-text, #374151)"
            : "var(--gh-text-secondary, #9ca3af)",
        }}>
        {label}
      </span>
      <div
        onMouseDown={(e) => {
          if (!currentConfig.enabled) {
            e.preventDefault()
            onDisabledClick?.()
          }
        }}>
        <input
          type="text"
          className="settings-input"
          value={localKeyword}
          onChange={(e) => setLocalKeyword(e.target.value)}
          onBlur={saveKeyword}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              saveKeyword()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          placeholder={placeholder}
          disabled={!currentConfig.enabled}
          style={{
            width: "200px",
            opacity: currentConfig.enabled ? 1 : 0.5,
            pointerEvents: currentConfig.enabled ? "auto" : "none",
          }}
        />
      </div>
      <Switch checked={currentConfig.enabled} onChange={toggleEnabled} />
    </div>
  )
}

const AIStudioModelLockRow: React.FC<{
  settings: Settings
  setSettings: (settings: Partial<Settings>) => void
  onDisabledClick?: () => void
  settingId?: string
}> = ({ settings, setSettings, onDisabledClick, settingId }) => {
  const siteKey = "aistudio"
  const currentConfig = settings.modelLock?.[siteKey] || { enabled: false, keyword: "" }

  const [modelList, setModelList] = useState<AIStudioModelInfo[]>(
    settings.aistudio?.cachedModels || [],
  )
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (settings.aistudio?.cachedModels) {
      setModelList(settings.aistudio.cachedModels)
    }
  }, [settings.aistudio?.cachedModels])

  const handleRefresh = async () => {
    setIsLoading(true)
    try {
      const response = await fetchAIStudioModels()

      if (response.success && response.models) {
        setModelList(response.models)
        setSettings({
          aistudio: {
            ...settings.aistudio,
            cachedModels: response.models,
          },
        })
        showToast(t("aistudioModelsFetched"), 2000)
      } else {
        const errorMsg =
          response.error === "NO_AISTUDIO_TAB" ? t("aistudioNoTabError") : t("aistudioModelsError")
        showToast(errorMsg, 3000)
      }
    } catch (err) {
      showToast(t("aistudioModelsError"), 3000)
      console.error("Refresh model list failed:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleEnabled = () => {
    setSettings({
      modelLock: {
        ...settings.modelLock,
        [siteKey]: { ...currentConfig, enabled: !currentConfig.enabled },
      },
    })
  }

  const handleModelChange = (modelId: string) => {
    setSettings({
      modelLock: {
        ...settings.modelLock,
        [siteKey]: { ...currentConfig, keyword: modelId },
      },
    })
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        marginBottom: "12px",
        cursor: currentConfig.enabled ? "default" : "not-allowed",
      }}
      data-setting-id={settingId}>
      <span
        style={{
          fontSize: "14px",
          fontWeight: 500,
          flex: 1,
          color: currentConfig.enabled
            ? "var(--gh-text, #374151)"
            : "var(--gh-text-secondary, #9ca3af)",
        }}>
        AI Studio
      </span>
      <Tooltip content={t("aistudioRefreshModelListTooltip")}>
        <button
          className="icon-button"
          onClick={handleRefresh}
          disabled={isLoading}
          style={{
            padding: "4px",
            opacity: isLoading ? 0.5 : 1,
            cursor: isLoading ? "not-allowed" : "pointer",
            background: "transparent",
            border: "none",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
          <RefreshIcon size={16} />
        </button>
      </Tooltip>
      <div
        onMouseDown={(e) => {
          if (!currentConfig.enabled) {
            e.preventDefault()
            onDisabledClick?.()
          }
        }}>
        <select
          className="settings-select"
          value={currentConfig.keyword || ""}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={!currentConfig.enabled || modelList.length === 0}
          style={{
            width: "200px",
            opacity: currentConfig.enabled ? 1 : 0.5,
            pointerEvents: currentConfig.enabled ? "auto" : "none",
          }}>
          {modelList.length === 0 && <option value="">{t("aistudioRefreshModelListFirst")}</option>}
          {modelList.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </div>
      <Switch checked={currentConfig.enabled} onChange={toggleEnabled} />
    </div>
  )
}

const ModelLockSettingsContent: React.FC = () => {
  const { settings, setSettings } = useSettingsStore()
  const prerequisiteToastTemplate = t("enablePrerequisiteToast")
  const modelLockLabel = t("modelLockTitle")
  const showPrerequisiteToast = (label: string) =>
    showToastThrottled(prerequisiteToastTemplate.replace("{setting}", label), 2000, {}, 1500, label)

  if (!settings) return null

  return (
    <SettingCard title={t("modelLockTitle")} description={t("modelLockDesc")}>
      <ModelLockRow
        label="Gemini"
        siteKey="gemini"
        settings={settings}
        setSettings={setSettings}
        placeholder={t("modelKeywordPlaceholder")}
        onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
        settingId="model-lock-gemini"
      />

      <ModelLockRow
        label="Gemini Enterprise"
        siteKey="gemini-enterprise"
        settings={settings}
        setSettings={setSettings}
        placeholder={t("modelKeywordPlaceholder")}
        onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
        settingId="model-lock-gemini-enterprise"
      />

      <AIStudioModelLockRow
        settings={settings}
        setSettings={setSettings}
        onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
        settingId="model-lock-aistudio"
      />

      <ModelLockRow
        label="ChatGPT"
        siteKey="chatgpt"
        settings={settings}
        setSettings={setSettings}
        placeholder={t("modelKeywordPlaceholder")}
        onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
        settingId="model-lock-chatgpt"
      />

      <ModelLockRow
        label="Claude"
        siteKey="claude"
        settings={settings}
        setSettings={setSettings}
        placeholder={t("modelKeywordPlaceholder")}
        onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
        settingId="model-lock-claude"
      />

      <ModelLockRow
        label="Grok"
        siteKey="grok"
        settings={settings}
        setSettings={setSettings}
        placeholder={t("modelKeywordPlaceholder")}
        onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
        settingId="model-lock-grok"
      />

      <ModelLockRow
        label="Kimi"
        siteKey="kimi"
        settings={settings}
        setSettings={setSettings}
        placeholder={t("modelKeywordPlaceholder")}
        onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
        settingId="model-lock-kimi"
      />

      <ModelLockRow
        label="Qianwen"
        siteKey="qianwen"
        settings={settings}
        setSettings={setSettings}
        placeholder={t("modelKeywordPlaceholder")}
        onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
        settingId="model-lock-qianwen"
      />

      <ModelLockRow
        label="Qwen Studio"
        siteKey="qwenai"
        settings={settings}
        setSettings={setSettings}
        placeholder={t("modelKeywordPlaceholder")}
        onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
        settingId="model-lock-qwenai"
      />

      <ModelLockRow
        label="Yuanbao"
        siteKey="yuanbao"
        settings={settings}
        setSettings={setSettings}
        placeholder={t("modelKeywordPlaceholder")}
        onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
        settingId="model-lock-yuanbao"
      />

      <ModelLockRow
        label="ima"
        siteKey="ima"
        settings={settings}
        setSettings={setSettings}
        placeholder={t("modelKeywordPlaceholder")}
        onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
        settingId="model-lock-ima"
      />

      <ModelLockRow
        label="Z.ai"
        siteKey="zai"
        settings={settings}
        setSettings={setSettings}
        placeholder={t("modelKeywordPlaceholder")}
        onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
        settingId="model-lock-zai"
      />
    </SettingCard>
  )
}

export default ModelLockSettingsContent
