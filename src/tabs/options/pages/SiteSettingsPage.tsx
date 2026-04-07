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
      const response = await sendToBackground({
        type: MSG_GET_AISTUDIO_MODELS,
      })

      if (response.success && response.models) {
        setModelList(response.models)
        // 保存到缓存
        setSettings({
          aistudio: {
            ...settings.aistudio,
            cachedModels: response.models,
          },
        })
        showToast(t("aistudioModelsFetched") || `获取到 ${response.models.length} 个模型`, 2000)
      } else {
        // 根据错误码显示本地化消息
        const errorMsg =
          response.error === "NO_AISTUDIO_TAB"
            ? t("aistudioNoTabError") || "请先打开 AI Studio 页面"
            : t("aistudioModelsError") || "获取模型失败"
        showToast(errorMsg, 3000)
      }
    } catch (err) {
      showToast(t("aistudioModelsError") || "获取模型列表失败", 3000)
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
      <Tooltip
        content={t("aistudioRefreshModelListTooltip") || "点击在 AI Studio 页面刷新模型列表"}>
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
          {modelList.length === 0 && (
            <option value="">{t("aistudioRefreshModelListFirst") || "请先刷新模型列表"}</option>
          )}
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
  const prerequisiteToastTemplate = t("enablePrerequisiteToast") || "请先开启「{setting}」"
  const showPrerequisiteToast = (label: string) =>
    showToastThrottled(prerequisiteToastTemplate.replace("{setting}", label), 2000, {}, 1500, label)
  const enablePageWidthLabel = t("enablePageWidth") || "启用页面宽度"
  const enableUserQueryWidthLabel = t("enableUserQueryWidth") || "启用用户问题加宽"
  const modelLockLabel = t("modelLockTitle") || "模型切换锁定"

  // 宽度布局相关状态
  const currentPageWidth =
    settings?.layout?.pageWidth?.[siteId as keyof typeof settings.layout.pageWidth] ||
    settings?.layout?.pageWidth?._default
  const currentUserQueryWidth =
    settings?.layout?.userQueryWidth?.[siteId as keyof typeof settings.layout.userQueryWidth] ||
    settings?.layout?.userQueryWidth?._default

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
    { id: SITE_SETTINGS_TAB_IDS.LAYOUT, label: t("tabLayout") || "页面布局" },
    { id: SITE_SETTINGS_TAB_IDS.MODEL_LOCK, label: t("tabModelLock") || "模型锁定" },
    { id: SITE_IDS.GEMINI, label: t("tabGemini") || "Gemini" },
    { id: SITE_IDS.AISTUDIO, label: "AI Studio" },
    { id: SITE_IDS.CHATGPT, label: "ChatGPT" },
    { id: SITE_IDS.CLAUDE, label: "Claude" },
  ]

  return (
    <div>
      <PageTitle title={t("navSiteSettings") || "站点设置"} Icon={LayoutIcon} />
      <p className="settings-page-desc">
        {t("siteSettingsPageDesc") || "配置站点相关的页面布局和内容处理"}
      </p>

      <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ========== 页面布局 Tab ========== */}
      {activeTab === SITE_SETTINGS_TAB_IDS.LAYOUT && (
        <>
          {/* 页面宽度卡片 */}
          <SettingCard title={t("layoutSettingsTitle") || "页面宽度控制"}>
            <ToggleRow
              label={t("enablePageWidth") || "启用页面宽度"}
              description={t("pageWidthDesc") || "调整聊天页面的最大宽度"}
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
              label={t("pageWidthValueLabel") || "宽度值"}
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
                ariaLabel={t("pageWidthValueLabel") || "宽度值"}
              />
            </SettingRow>
          </SettingCard>

          {/* 用户问题宽度卡片 */}
          <SettingCard title={t("userQueryWidthSettings") || "用户问题宽度"}>
            <ToggleRow
              label={t("enableUserQueryWidth") || "启用用户问题加宽"}
              description={t("userQueryWidthDesc") || "调整用户问题气泡的最大宽度"}
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
              label={t("userQueryWidthValueLabel") || "问题宽度"}
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
                ariaLabel={t("userQueryWidthValueLabel") || "问题宽度"}
              />
            </SettingRow>
          </SettingCard>

          {/* 禅模式 (Zen Mode) 卡片 */}
          <SettingCard title={t("zenModeTitle") || "禅模式 (Zen Mode)"}>
            <ToggleRow
              label={t("zenModeLabel") || "启用禅模式"}
              description={
                t("zenModeDesc") ||
                "隐藏页面中不必要的元素（如底部的模型免责声明等），体验更纯粹的对话界面"
              }
              settingId="layout-zen-mode-enabled"
              checked={
                settings.layout?.zenMode?.[siteId as keyof typeof settings.layout.zenMode]
                  ?.enabled ?? false
              }
              onChange={() => {
                const currentZenMode = settings.layout?.zenMode?.[
                  siteId as keyof typeof settings.layout.zenMode
                ] || { enabled: false }

                setSettings({
                  layout: {
                    ...settings.layout,
                    zenMode: {
                      ...settings.layout?.zenMode,
                      [siteId]: {
                        ...currentZenMode,
                        enabled: !currentZenMode.enabled,
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
        <SettingCard
          title={t("modelLockTitle") || "模型切换锁定"}
          description={t("modelLockDesc") || "进入页面后自动切换到指定模型"}>
          {/* Gemini */}
          <ModelLockRow
            label="Gemini"
            siteKey="gemini"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-gemini"
          />

          {/* Gemini Enterprise */}
          <ModelLockRow
            label="Gemini Enterprise"
            siteKey="gemini-enterprise"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
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
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-chatgpt"
          />

          {/* Claude */}
          <ModelLockRow
            label="Claude"
            siteKey="claude"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-claude"
          />

          {/* Grok */}
          <ModelLockRow
            label="Grok"
            siteKey="grok"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-grok"
          />

          {/* Kimi */}
          <ModelLockRow
            label="Kimi"
            siteKey="kimi"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-kimi"
          />

          {/* Qianwen */}
          <ModelLockRow
            label="Qianwen"
            siteKey="qianwen"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-qianwen"
          />

          {/* QwenAI */}
          <ModelLockRow
            label="QwenAI"
            siteKey="qwenai"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-qwenai"
          />

          {/* Yuanbao */}
          <ModelLockRow
            label="Yuanbao"
            siteKey="yuanbao"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-yuanbao"
          />

          {/* ima */}
          <ModelLockRow
            label="ima"
            siteKey="ima"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-ima"
          />

          {/* Z.ai */}
          <ModelLockRow
            label="Z.ai"
            siteKey="zai"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
            onDisabledClick={() => showPrerequisiteToast(modelLockLabel)}
            settingId="model-lock-zai"
          />
        </SettingCard>
      )}

      {/* ========== Gemini 专属 Tab ========== */}
      {activeTab === "gemini" && (
        <SettingCard
          title={t("geminiSettingsTab") || "Gemini 专属"}
          description={t("contentProcessingDesc") || "配置 AI 回复内容的处理方式"}>
          <ToggleRow
            label={t("markdownFixLabel") || "Markdown 加粗修复"}
            description={t("markdownFixDesc") || "修复 Gemini 响应中未渲染的加粗文本"}
            settingId="gemini-markdown-fix"
            checked={settings.content?.markdownFix ?? true}
            onChange={() =>
              updateNestedSetting("content", "markdownFix", !settings.content?.markdownFix)
            }
          />

          <ToggleRow
            label={t("watermarkRemovalLabel") || "图片水印移除"}
            description={t("watermarkRemovalDesc") || "自动移除 AI 生成图片的水印"}
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
                // 1. 检查是否已有权限
                const response = await sendToBackground({
                  type: MSG_CHECK_PERMISSIONS,
                  origins: ["<all_urls>"],
                })

                if (response.success && response.hasPermission) {
                  updateNestedSetting("content", "watermarkRemoval", true)
                } else {
                  // 2. 请求权限 (打开独立窗口)
                  await sendToBackground({
                    type: MSG_REQUEST_PERMISSIONS,
                    permType: "allUrls",
                  })
                  showToast(t("permissionRequestToast") || "请在弹出的窗口中授予权限", 3000)
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
        <SettingCard
          title={t("aistudioSettingsTitle") || "AI Studio 设置"}
          description={t("aistudioSettingsDesc") || "配置 AI Studio 页面的默认行为"}>
          {/* 界面状态开关 */}
          <ToggleRow
            label={t("aistudioCollapseNavbar") || "默认折叠侧边栏"}
            description={t("aistudioCollapseNavbarDesc") || "打开页面时自动折叠左侧导航栏"}
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
            label={t("aistudioCollapseRunSettings") || "默认收起运行设置面板"}
            description={
              t("aistudioCollapseRunSettingsDesc") || "打开页面时自动收起右侧的运行设置面板"
            }
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
            label={t("aistudioCollapseTools") || "默认收起工具面板"}
            description={t("aistudioCollapseToolsDesc") || "打开页面时自动收起右侧运行设置面板"}
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
            label={t("aistudioCollapseAdvanced") || "默认收起高级设置"}
            description={
              t("aistudioCollapseAdvancedDesc") || "打开页面时自动收起运行设置中的高级选项"
            }
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
            label={t("aistudioEnableSearch") || "默认启用搜索工具"}
            description={t("aistudioEnableSearchDesc") || "打开页面时自动启用 Google 实时搜索"}
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
            label={t("aistudioRemoveWatermark") || "移除图片水印"}
            description={
              t("aistudioRemoveWatermarkDesc") ||
              "阻止加载水印图片，让生成图片无水印 (需刷新页面生效)"
            }
            settingId="aistudio-remove-watermark"
            checked={settings.aistudio?.removeWatermark ?? false}
            onChange={() => {
              setSettings({
                aistudio: {
                  ...settings.aistudio,
                  removeWatermark: !settings.aistudio?.removeWatermark,
                },
              })
              showToast(t("aistudioReloadHint") || "设置已保存，请刷新 AI Studio 页面以生效", 3000)
            }}
          />

          <ToggleRow
            label={t("aistudioMarkdownFixLabel") || "Markdown 加粗修复"}
            description={
              t("aistudioMarkdownFixDesc") || "修复 AI Studio 响应中未渲染的 **加粗** 文本"
            }
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
        <SettingCard
          title={t("chatgptSettingsTitle") || "ChatGPT 设置"}
          description={t("chatgptSettingsDesc") || "配置 ChatGPT 页面的默认行为"}>
          <ToggleRow
            label={t("chatgptMarkdownFixLabel") || "Markdown 加粗修复"}
            description={t("chatgptMarkdownFixDesc") || "修复 ChatGPT 响应中未渲染的 **加粗** 文本"}
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
