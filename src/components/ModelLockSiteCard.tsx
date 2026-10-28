import React, { useCallback, useEffect, useMemo, useState } from "react"

import { RefreshIcon } from "~components/icons"
import { Switch, Tooltip } from "~components/ui"
import { SITE_IDS, isBuiltinSiteId } from "~constants"
import { platform } from "~platform"
import { useSettingsStore } from "~stores/settings-store"
import { SettingCard, SettingRow } from "~tabs/options/components"
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
  siteKey: string
  settings: Settings
  setSettings: (settings: Partial<Settings>) => void
  placeholder: string
  onDisabledClick?: () => void
  settingId?: string
}> = ({ siteKey, settings, setSettings, placeholder, onDisabledClick, settingId }) => {
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
    <SettingRow label={t("modelLockDesc")} settingId={settingId}>
      <div className="settings-inline-controls">
        {/* 输入框禁用时不接收指针事件，点击落到外层并提示先开启 */}
        <div
          className={`settings-model-lock-field ${currentConfig.enabled ? "" : "is-disabled"}`}
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
            aria-label={placeholder}
            disabled={!currentConfig.enabled}
          />
        </div>
        <Switch
          checked={currentConfig.enabled}
          onChange={toggleEnabled}
          ariaLabel={t("modelLockTitle")}
        />
      </div>
    </SettingRow>
  )
}

const AIStudioModelLockRow: React.FC<{
  settings: Settings
  setSettings: (settings: Partial<Settings>) => void
  onDisabledClick?: () => void
  settingId?: string
}> = ({ settings, setSettings, onDisabledClick, settingId }) => {
  const siteKey = SITE_IDS.AISTUDIO
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
    <SettingRow label={t("modelLockDesc")} settingId={settingId}>
      <div className="settings-inline-controls">
        <Tooltip content={t("aistudioRefreshModelListTooltip")}>
          <button
            type="button"
            className="settings-btn settings-btn-secondary settings-icon-only-btn"
            onClick={handleRefresh}
            disabled={isLoading}
            aria-label={t("aistudioRefreshModelListTooltip")}>
            <RefreshIcon size={16} />
          </button>
        </Tooltip>
        <div
          className={`settings-model-lock-field ${currentConfig.enabled ? "" : "is-disabled"}`}
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
            aria-label={t("modelLockDesc")}
            disabled={!currentConfig.enabled || modelList.length === 0}>
            {modelList.length === 0 && (
              <option value="">{t("aistudioRefreshModelListFirst")}</option>
            )}
            {modelList.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>
        <Switch
          checked={currentConfig.enabled}
          onChange={toggleEnabled}
          ariaLabel={t("modelLockTitle")}
        />
      </div>
    </SettingRow>
  )
}

interface ModelLockSiteCardProps {
  /** 模型锁定配置 key：内置站点为 siteId，社区适配包为站点实例 key */
  siteKey: string
}

/** 单个站点的模型锁定卡片，由站点设置页按当前选中的站点渲染；分组标题由页面提供 */
export const ModelLockSiteCard: React.FC<ModelLockSiteCardProps> = ({ siteKey }) => {
  const { settings, setSettings } = useSettingsStore()
  const prerequisiteToastTemplate = t("enablePrerequisiteToast")
  const modelLockLabel = t("modelLockTitle")
  const showPrerequisiteToast = () =>
    showToastThrottled(
      prerequisiteToastTemplate.replace("{setting}", modelLockLabel),
      2000,
      {},
      1500,
      modelLockLabel,
    )

  if (!settings) return null

  const settingId = isBuiltinSiteId(siteKey)
    ? `model-lock-${siteKey}`
    : "model-lock-community-site-pack"

  return (
    <SettingCard settingId="site-settings-model-lock">
      {siteKey === SITE_IDS.AISTUDIO ? (
        <AIStudioModelLockRow
          settings={settings}
          setSettings={setSettings}
          onDisabledClick={showPrerequisiteToast}
          settingId={settingId}
        />
      ) : (
        <ModelLockRow
          siteKey={siteKey}
          settings={settings}
          setSettings={setSettings}
          placeholder={t("modelKeywordPlaceholder")}
          onDisabledClick={showPrerequisiteToast}
          settingId={settingId}
        />
      )}
    </SettingCard>
  )
}

export default ModelLockSiteCard
