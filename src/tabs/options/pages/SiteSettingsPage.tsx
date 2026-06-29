/**
 * 站点设置页面
 * 包含：页面布局、模型锁定、内容处理
 * 这些设置与具体站点相关，按站点存储配置
 */
import React, { useCallback, useEffect, useMemo, useState } from "react"

import { PageContentIcon as LayoutIcon, RefreshIcon } from "~components/icons"
import { NumberInput, Slider, Switch, Tooltip } from "~components/ui"
import { LAYOUT_CONFIG, SITE_IDS, SITE_SETTINGS_TAB_IDS } from "~constants"
import { platform } from "~platform"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import {
  MSG_CHECK_PERMISSIONS,
  MSG_GET_AISTUDIO_MODELS,
  MSG_REQUEST_PERMISSIONS,
  sendToBackground,
  type AIStudioModelInfo,
} from "~utils/messaging"
import type { Settings } from "~utils/storage"
import { showToast, showToastThrottled } from "~utils/toast"

import { PageTitle, SettingCard, SettingRow, TabGroup, ToggleRow } from "../components"
import ClaudeSettings from "./ClaudeSettings"

interface SiteSettingsPageProps {
  siteId: string
  initialTab?: string
}

type AIStudioModelsResponse = {
  success: boolean
  models?: AIStudioModelInfo[]
  error?: string
}

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

// 模型锁定行组件 - 只在失焦或按回车时保存
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

  // 同步外部值变化
  useEffect(() => {
    setLocalKeyword(currentConfig.keyword)
  }, [currentConfig.keyword])

  // 保存关键词
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

  // 切换启用状态
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

// AI Studio 专用模型锁定行组件 - 带刷新按钮和下拉选择
const AIStudioModelLockRow: React.FC<{
  settings: Settings
  setSettings: (settings: Partial<Settings>) => void
  onDisabledClick?: () => void
  settingId?: string
}> = ({ settings, setSettings, onDisabledClick, settingId }) => {
  const siteKey = "aistudio"
  const currentConfig = settings.modelLock?.[siteKey] || { enabled: false, keyword: "" }

  // 缓存的模型列表
  const [modelList, setModelList] = useState<AIStudioModelInfo[]>(
    settings.aistudio?.cachedModels || [],
  )
  const [isLoading, setIsLoading] = useState(false)

  // 同步缓存的模型列表
  useEffect(() => {
    if (settings.aistudio?.cachedModels) {
      setModelList(settings.aistudio.cachedModels)
    }
  }, [settings.aistudio?.cachedModels])

  // 刷新模型列表
  const handleRefresh = async () => {
    setIsLoading(true)
    try {
      const response = await fetchAIStudioModels()

      if (response.success && response.models) {
        setModelList(response.models)
        // 保存到缓存
        setSettings({
          aistudio: {
            ...settings.aistudio,
            cachedModels: response.models,
          },
        })
        showToast(t("aistudioModelsFetched"), 2000)
      } else {
        // 根据错误码显示本地化消息
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

  // 切换启用状态
  const toggleEnabled = () => {
    setSettings({
      modelLock: {
        ...settings.modelLock,
        [siteKey]: { ...currentConfig, enabled: !currentConfig.enabled },
      },
    })
  }

  // 选择模型
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
      {/* 刷新按钮 */}
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
      {/* 模型选择下拉框 */}
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

const SiteSettingsPage: React.FC<SiteSettingsPageProps> = ({ siteId, initialTab }) => {
  const [activeTab, setActiveTab] = useState<string>(initialTab || SITE_SETTINGS_TAB_IDS.LAYOUT)

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])
  const { settings, setSettings, setPreviewSettings, clearPreviewSettings, updateNestedSetting } =
    useSettingsStore()
  const prerequisiteToastTemplate = t("enablePrerequisiteToast")
  const showPrerequisiteToast = (label: string) =>
    showToastThrottled(prerequisiteToastTemplate.replace("{setting}", label), 2000, {}, 1500, label)
  const enablePageWidthLabel = t("enablePageWidth")
  const enableUserQueryWidthLabel = t("enableUserQueryWidth")
  const modelLockLabel = t("modelLockTitle")

  // 宽度布局相关状态
  const currentPageWidth =
    settings?.layout?.pageWidth?.[siteId as keyof typeof settings.layout.pageWidth] ||
    settings?.layout?.pageWidth?._default
  const currentUserQueryWidth =
    settings?.layout?.userQueryWidth?.[siteId as keyof typeof settings.layout.userQueryWidth] ||
    settings?.layout?.userQueryWidth?._default
  const currentZenMode = settings?.layout?.zenMode?.[siteId] ||
    settings?.layout?.zenMode?._default || { enabled: false, showExitButton: true }

  const parseWidthValue = (value: string | undefined, fallback: string) => {
    const parsed = Number.parseInt(value ?? fallback, 10)
    return Number.isNaN(parsed) ? Number.parseInt(fallback, 10) : parsed
  }

  const currentPageWidthValue = parseWidthValue(
    currentPageWidth?.value,
    LAYOUT_CONFIG.PAGE_WIDTH.DEFAULT_PERCENT,
  )
  const currentUserQueryWidthValue = parseWidthValue(
    currentUserQueryWidth?.value,
    LAYOUT_CONFIG.USER_QUERY_WIDTH.DEFAULT_PERCENT,
  )

  const buildPercentWidthSettings = (key: "pageWidth" | "userQueryWidth", value: number) => {
    if (!settings) return

    const config = key === "pageWidth" ? LAYOUT_CONFIG.PAGE_WIDTH : LAYOUT_CONFIG.USER_QUERY_WIDTH
    const current = (key === "pageWidth" ? currentPageWidth : currentUserQueryWidth) || {
      enabled: false,
      value: config.DEFAULT_PERCENT,
      unit: "%",
    }
    const nextValue = Math.min(config.MAX_PERCENT, Math.max(config.MIN_PERCENT, value))

    return {
      layout: {
        ...settings.layout,
        [key]: {
          ...settings.layout?.[key],
          [siteId]: {
            ...current,
            value: String(nextValue),
            unit: "%",
          },
        },
      },
    }
  }

  const updatePercentWidthPreview = (key: "pageWidth" | "userQueryWidth", value: number) => {
    const nextSettings = buildPercentWidthSettings(key, value)
    if (!nextSettings) return
    setPreviewSettings(nextSettings)
  }

  const updatePercentWidth = (key: "pageWidth" | "userQueryWidth", value: number) => {
    const nextSettings = buildPercentWidthSettings(key, value)
    if (!nextSettings) return
    setSettings(nextSettings)
  }

  if (!settings) return null

  const tabs = [
    { id: SITE_SETTINGS_TAB_IDS.LAYOUT, label: t("tabLayout") },
    { id: SITE_SETTINGS_TAB_IDS.MODEL_LOCK, label: t("tabModelLock") },
    { id: SITE_IDS.GEMINI, label: t("tabGemini") },
    { id: SITE_IDS.AISTUDIO, label: "AI Studio" },
    { id: SITE_IDS.CHATGPT, label: "ChatGPT" },
    { id: SITE_IDS.CLAUDE, label: "Claude" },
  ]

  return (
    <div>
      <PageTitle title={t("navSiteSettings")} Icon={LayoutIcon} />
      <p className="settings-page-desc">{t("siteSettingsPageDesc")}</p>

      <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ========== 页面布局 Tab ========== */}
      {activeTab === SITE_SETTINGS_TAB_IDS.LAYOUT && (
        <>
          {/* 页面宽度卡片 */}
          <SettingCard title={t("layoutSettingsTitle")}>
            <ToggleRow
              label={t("enablePageWidth")}
              description={t("pageWidthDesc")}
              settingId="layout-page-width-enabled"
              checked={currentPageWidth?.enabled ?? false}
              onChange={() => {
                const current = currentPageWidth || { enabled: false, value: "81", unit: "%" }
                setSettings({
                  layout: {
                    ...settings?.layout,
                    pageWidth: {
                      ...settings?.layout?.pageWidth,
                      [siteId]: { ...current, enabled: !current.enabled },
                    },
                  },
                })
              }}
            />

            <SettingRow
              label={t("pageWidthValueLabel")}
              settingId="layout-page-width-value"
              disabled={!currentPageWidth?.enabled}
              onDisabledClick={() => showPrerequisiteToast(enablePageWidthLabel)}>
              <Slider
                value={currentPageWidthValue}
                onChange={(value) => updatePercentWidth("pageWidth", value)}
                onPreviewChange={(value) => updatePercentWidthPreview("pageWidth", value)}
                onCancelPreview={clearPreviewSettings}
                min={LAYOUT_CONFIG.PAGE_WIDTH.MIN_PERCENT}
                max={LAYOUT_CONFIG.PAGE_WIDTH.MAX_PERCENT}
                step={1}
                unit="%"
                defaultValue={Number.parseInt(LAYOUT_CONFIG.PAGE_WIDTH.DEFAULT_PERCENT, 10)}
                disabled={!currentPageWidth?.enabled}
                formatValue={(value) => `${value}%`}
                ariaLabel={t("pageWidthValueLabel")}
              />
            </SettingRow>
          </SettingCard>

          {/* 用户问题宽度卡片 */}
          <SettingCard title={t("userQueryWidthSettings")}>
            <ToggleRow
              label={t("enableUserQueryWidth")}
              description={t("userQueryWidthDesc")}
              settingId="layout-user-query-width-enabled"
              checked={currentUserQueryWidth?.enabled ?? false}
              onChange={() => {
                const current = currentUserQueryWidth || {
                  enabled: false,
                  value: "81",
                  unit: "%",
                }
                setSettings({
                  layout: {
                    ...settings?.layout,
                    userQueryWidth: {
                      ...settings?.layout?.userQueryWidth,
                      [siteId]: { ...current, enabled: !current.enabled },
                    },
                  },
                })
              }}
            />

            <SettingRow
              label={t("userQueryWidthValueLabel")}
              settingId="layout-user-query-width-value"
              disabled={!currentUserQueryWidth?.enabled}
              onDisabledClick={() => showPrerequisiteToast(enableUserQueryWidthLabel)}>
              <Slider
                value={currentUserQueryWidthValue}
                onChange={(value) => updatePercentWidth("userQueryWidth", value)}
                onPreviewChange={(value) => updatePercentWidthPreview("userQueryWidth", value)}
                onCancelPreview={clearPreviewSettings}
                min={LAYOUT_CONFIG.USER_QUERY_WIDTH.MIN_PERCENT}
                max={LAYOUT_CONFIG.USER_QUERY_WIDTH.MAX_PERCENT}
                step={1}
                unit="%"
                defaultValue={Number.parseInt(LAYOUT_CONFIG.USER_QUERY_WIDTH.DEFAULT_PERCENT, 10)}
                disabled={!currentUserQueryWidth?.enabled}
                formatValue={(value) => `${value}%`}
                ariaLabel={t("userQueryWidthValueLabel")}
              />
            </SettingRow>
          </SettingCard>

          {/* 禅模式 (Zen Mode) 卡片 */}
          <SettingCard title={t("zenModeTitle")}>
            <ToggleRow
              label={t("zenModeLabel")}
              description={t("zenModeDesc")}
              settingId="layout-zen-mode-enabled"
              checked={currentZenMode.enabled}
              onChange={() => {
                const newZenEnabled = !currentZenMode.enabled
                const updatedLayout: typeof settings.layout = {
                  ...settings.layout,
                  zenMode: {
                    ...settings.layout?.zenMode,
                    [siteId]: {
                      ...currentZenMode,
                      enabled: newZenEnabled,
                    },
                  },
                }
                // 开启禅模式时自动开启净化模式
                if (newZenEnabled) {
                  updatedLayout.cleanMode = {
                    ...settings.layout?.cleanMode,
                    [siteId]: { enabled: true },
                  }
                }
                setSettings({ layout: updatedLayout })
              }}
            />
            <ToggleRow
              label={t("zenModeExitButtonVisibleLabel")}
              description={t("zenModeExitButtonVisibleDesc")}
              settingId="layout-zen-mode-exit-button-visible"
              checked={currentZenMode.showExitButton ?? true}
              onChange={() => {
                setSettings({
                  layout: {
                    ...settings.layout,
                    zenMode: {
                      ...settings.layout?.zenMode,
                      [siteId]: {
                        ...currentZenMode,
                        showExitButton: !(currentZenMode.showExitButton ?? true),
                      },
                    },
                  },
                })
              }}
            />
          </SettingCard>

          {/* 净化模式 (Clean Mode) 卡片 */}
          <SettingCard title={t("cleanModeTitle")}>
            <ToggleRow
              label={t("cleanModeLabel")}
              description={t("cleanModeDesc")}
              settingId="layout-clean-mode-enabled"
              checked={
                settings.layout?.cleanMode?.[siteId as keyof typeof settings.layout.cleanMode]
                  ?.enabled ?? true
              }
              onChange={() => {
                const currentCleanMode = settings.layout?.cleanMode?.[
                  siteId as keyof typeof settings.layout.cleanMode
                ] || { enabled: true }

                setSettings({
                  layout: {
                    ...settings.layout,
                    cleanMode: {
                      ...settings.layout?.cleanMode,
                      [siteId]: {
                        ...currentCleanMode,
                        enabled: !currentCleanMode.enabled,
                      },
                    },
                  },
                })
              }}
            />
          </SettingCard>
        </>
      )}

      {/* ========== 模型锁定 Tab ========== */}
      {activeTab === SITE_SETTINGS_TAB_IDS.MODEL_LOCK && (
        <SettingCard title={t("modelLockTitle")} description={t("modelLockDesc")}>
          {/* Gemini */}
          <ModelLockRow
            label="Gemini"
            siteKey="gemini"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder")}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-gemini"
          />

          {/* Gemini Enterprise */}
          <ModelLockRow
            label="Gemini Enterprise"
            siteKey="gemini-enterprise"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder")}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-gemini-enterprise"
          />

          {/* AI Studio - 使用下拉选择器 */}
          <AIStudioModelLockRow
            settings={settings}
            setSettings={setSettings}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-aistudio"
          />

          {/* ChatGPT */}
          <ModelLockRow
            label="ChatGPT"
            siteKey="chatgpt"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder")}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-chatgpt"
          />

          {/* Claude */}
          <ModelLockRow
            label="Claude"
            siteKey="claude"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder")}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-claude"
          />

          {/* Grok */}
          <ModelLockRow
            label="Grok"
            siteKey="grok"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder")}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-grok"
          />

          {/* Kimi */}
          <ModelLockRow
            label="Kimi"
            siteKey="kimi"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder")}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-kimi"
          />

          {/* Qianwen */}
          <ModelLockRow
            label="Qianwen"
            siteKey="qianwen"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder")}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-qianwen"
          />

          {/* Qwen Studio */}
          <ModelLockRow
            label="Qwen Studio"
            siteKey="qwenai"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder")}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-qwenai"
          />

          {/* Yuanbao */}
          <ModelLockRow
            label="Yuanbao"
            siteKey="yuanbao"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder")}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-yuanbao"
          />

          {/* ima */}
          <ModelLockRow
            label="ima"
            siteKey="ima"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder")}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-ima"
          />

          {/* Z.ai */}
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
      )}

      {/* ========== Gemini 专属 Tab ========== */}
      {activeTab === "gemini" && (
        <SettingCard title={t("geminiSettingsTab")} description={t("contentProcessingDesc")}>
          <ToggleRow
            label={t("markdownFixLabel")}
            description={t("markdownFixDesc")}
            settingId="gemini-markdown-fix"
            checked={settings.content?.markdownFix ?? false}
            onChange={() =>
              updateNestedSetting("content", "markdownFix", !settings.content?.markdownFix)
            }
          />

          <ToggleRow
            label={t("watermarkRemovalLabel")}
            description={t("watermarkRemovalDesc")}
            settingId="gemini-watermark-removal"
            checked={settings.content?.watermarkRemoval ?? false}
            onChange={async () => {
              const checked = settings.content?.watermarkRemoval
              if (!checked) {
                // 油猴脚本环境：直接启用（不需要检查权限，GM_xmlhttpRequest 已通过 @grant 声明）
                if (!platform.hasCapability("permissions")) {
                  updateNestedSetting("content", "watermarkRemoval", true)
                  return
                }
                // Options 页面直接调用 chrome.permissions API（request 已授权时不弹窗直接返回 true）
                if (typeof chrome.permissions !== "undefined") {
                  const granted = await chrome.permissions.request({
                    origins: ["<all_urls>"],
                  })
                  if (granted) {
                    updateNestedSetting("content", "watermarkRemoval", true)
                  }
                } else {
                  // Content Script fallback：通过 background 打开权限请求弹窗
                  const response = await sendToBackground({
                    type: MSG_CHECK_PERMISSIONS,
                    origins: ["<all_urls>"],
                  })
                  if (response.success && response.hasPermission) {
                    updateNestedSetting("content", "watermarkRemoval", true)
                  } else {
                    await sendToBackground({
                      type: MSG_REQUEST_PERMISSIONS,
                      permType: "allUrls",
                    })
                    showToast(t("permissionRequestToast"), 3000)
                  }
                }
              } else {
                updateNestedSetting("content", "watermarkRemoval", false)
              }
            }}
          />

          {/* Gemini Enterprise 专属内容 */}
          <div
            className="setting-subsection"
            style={{
              marginTop: "24px",
              paddingTop: "16px",
              borderTop: "1px solid var(--gh-border-color)",
            }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>
              Gemini Enterprise
            </h3>
            <ToggleRow
              label={t("policyRetryLabel")}
              description={t("policyRetryDesc")}
              settingId="gemini-policy-retry"
              checked={settings.geminiEnterprise?.policyRetry?.enabled ?? false}
              onChange={() => {
                const current = settings.geminiEnterprise?.policyRetry || {
                  enabled: false,
                  maxRetries: 3,
                }
                setSettings({
                  geminiEnterprise: {
                    ...settings.geminiEnterprise,
                    policyRetry: {
                      ...current,
                      enabled: !current.enabled,
                    },
                  },
                })
              }}
            />
            {settings.geminiEnterprise?.policyRetry?.enabled && (
              <SettingRow label={t("maxRetriesLabel")} settingId="gemini-policy-max-retries">
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <NumberInput
                    value={settings.geminiEnterprise?.policyRetry?.maxRetries ?? 3}
                    onChange={(val) =>
                      setSettings({
                        geminiEnterprise: {
                          ...settings.geminiEnterprise,
                          policyRetry: {
                            ...settings.geminiEnterprise?.policyRetry!,
                            maxRetries: val,
                          },
                        },
                      })
                    }
                    min={1}
                    max={10}
                    defaultValue={3}
                    style={{ width: "60px" }}
                  />
                  <span style={{ fontSize: "12px", color: "var(--gh-text-secondary)" }}>
                    {t("retryCountSuffix")}
                  </span>
                </div>
              </SettingRow>
            )}
          </div>
        </SettingCard>
      )}

      {/* ========== AI Studio 专属 Tab ========== */}
      {activeTab === SITE_IDS.AISTUDIO && (
        <SettingCard title={t("aistudioSettingsTitle")} description={t("aistudioSettingsDesc")}>
          {/* 界面状态开关 */}
          <ToggleRow
            label={t("aistudioCollapseNavbar")}
            description={t("aistudioCollapseNavbarDesc")}
            settingId="aistudio-collapse-navbar"
            checked={settings.aistudio?.collapseNavbar ?? false}
            onChange={() =>
              setSettings({
                aistudio: {
                  ...settings.aistudio,
                  collapseNavbar: !settings.aistudio?.collapseNavbar,
                },
              })
            }
          />

          <ToggleRow
            label={t("aistudioCollapseRunSettings")}
            description={t("aistudioCollapseRunSettingsDesc")}
            settingId="aistudio-collapse-run-settings"
            checked={settings.aistudio?.collapseRunSettings ?? false}
            onChange={() =>
              setSettings({
                aistudio: {
                  ...settings.aistudio,
                  collapseRunSettings: !settings.aistudio?.collapseRunSettings,
                },
              })
            }
          />

          <ToggleRow
            label={t("aistudioCollapseTools")}
            description={t("aistudioCollapseToolsDesc")}
            settingId="aistudio-collapse-tools"
            checked={settings.aistudio?.collapseTools ?? false}
            onChange={() =>
              setSettings({
                aistudio: {
                  ...settings.aistudio,
                  collapseTools: !settings.aistudio?.collapseTools,
                },
              })
            }
          />

          <ToggleRow
            label={t("aistudioCollapseAdvanced")}
            description={t("aistudioCollapseAdvancedDesc")}
            settingId="aistudio-collapse-advanced"
            checked={settings.aistudio?.collapseAdvanced ?? false}
            onChange={() =>
              setSettings({
                aistudio: {
                  ...settings.aistudio,
                  collapseAdvanced: !settings.aistudio?.collapseAdvanced,
                },
              })
            }
          />

          <ToggleRow
            label={t("aistudioEnableSearch")}
            description={t("aistudioEnableSearchDesc")}
            settingId="aistudio-enable-search"
            checked={settings.aistudio?.enableSearch ?? true}
            onChange={() =>
              setSettings({
                aistudio: {
                  ...settings.aistudio,
                  enableSearch: !settings.aistudio?.enableSearch,
                },
              })
            }
          />

          <ToggleRow
            label={t("aistudioRemoveWatermark")}
            description={t("aistudioRemoveWatermarkDesc")}
            settingId="aistudio-remove-watermark"
            checked={settings.aistudio?.removeWatermark ?? false}
            onChange={() => {
              setSettings({
                aistudio: {
                  ...settings.aistudio,
                  removeWatermark: !settings.aistudio?.removeWatermark,
                },
              })
              showToast(t("aistudioReloadHint"), 3000)
            }}
          />

          <ToggleRow
            label={t("aistudioMarkdownFixLabel")}
            description={t("aistudioMarkdownFixDesc")}
            settingId="aistudio-markdown-fix"
            checked={settings.aistudio?.markdownFix ?? false}
            onChange={() =>
              setSettings({
                aistudio: {
                  ...settings.aistudio,
                  markdownFix: !settings.aistudio?.markdownFix,
                },
              })
            }
          />
        </SettingCard>
      )}

      {/* ========== Claude 专属 Tab ========== */}
      {activeTab === "claude" && <ClaudeSettings siteId={siteId} />}

      {/* ========== ChatGPT 专属 Tab ========== */}
      {activeTab === SITE_IDS.CHATGPT && (
        <SettingCard title={t("chatgptSettingsTitle")} description={t("chatgptSettingsDesc")}>
          <ToggleRow
            label={t("chatgptMarkdownFixLabel")}
            description={t("chatgptMarkdownFixDesc")}
            settingId="chatgpt-markdown-fix"
            checked={settings.chatgpt?.markdownFix ?? false}
            onChange={() =>
              setSettings({
                chatgpt: {
                  ...settings.chatgpt,
                  markdownFix: !settings.chatgpt?.markdownFix,
                },
              })
            }
          />
        </SettingCard>
      )}
    </div>
  )
}

export default SiteSettingsPage
