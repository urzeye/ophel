/**
 * 站点设置页面
 * 包含：页面布局、模型锁定、内容处理
 * 这些设置与具体站点相关，按站点存储配置
 */
import React, { useCallback, useEffect, useRef, useState } from "react"

import { PageContentIcon as LayoutIcon, RefreshIcon } from "~components/icons"
import { NumberInput, Switch, Tooltip } from "~components/ui"
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
import type { AIStudioSettings, Settings } from "~utils/storage"
import { showToast } from "~utils/toast"

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
}> = ({ label, siteKey, settings, setSettings, placeholder }) => {
  const currentConfig = settings.modelLock?.[siteKey] || { enabled: false, keyword: "" }
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
      }}>
      <span style={{ fontSize: "14px", fontWeight: 500, flex: 1 }}>{label}</span>
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
        }}
      />
      <Switch checked={currentConfig.enabled} onChange={toggleEnabled} />
    </div>
  )
}

// AI Studio 专用模型锁定行组件 - 带刷新按钮和下拉选择
const AIStudioModelLockRow: React.FC<{
  settings: Settings
  setSettings: (settings: Partial<Settings>) => void
}> = ({ settings, setSettings }) => {
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
      }}>
      <span style={{ fontSize: "14px", fontWeight: 500, flex: 1 }}>AI Studio</span>
      {/* 刷新按钮 */}
      <Tooltip content="点击在 AI Studio 页面刷新模型列表">
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
      <select
        className="settings-select"
        value={currentConfig.keyword || ""}
        onChange={(e) => handleModelChange(e.target.value)}
        disabled={!currentConfig.enabled || modelList.length === 0}
        style={{
          width: "200px",
          opacity: currentConfig.enabled ? 1 : 0.5,
        }}>
        {modelList.length === 0 && <option value="">请先刷新模型列表</option>}
        {modelList.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
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
  const { settings, setSettings, updateNestedSetting } = useSettingsStore()

  // 宽度布局相关状态
  const currentPageWidth =
    settings?.layout?.pageWidth?.[siteId as keyof typeof settings.layout.pageWidth] ||
    settings?.layout?.pageWidth?._default
  const currentUserQueryWidth =
    settings?.layout?.userQueryWidth?.[siteId as keyof typeof settings.layout.userQueryWidth] ||
    settings?.layout?.userQueryWidth?._default

  const [tempWidth, setTempWidth] = useState(
    currentPageWidth?.value || LAYOUT_CONFIG.PAGE_WIDTH.DEFAULT_PERCENT,
  )
  const [tempUserQueryWidth, setTempUserQueryWidth] = useState(
    currentUserQueryWidth?.value || LAYOUT_CONFIG.USER_QUERY_WIDTH.DEFAULT_PX,
  )

  // 焦点状态追踪，防止 Store 同步覆盖用户输入
  const [focusedInput, setFocusedInput] = useState<string | null>(null)

  // 防抖定时器和输入框引用
  const widthBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userQueryWidthBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const widthInputRef = useRef<HTMLInputElement>(null)
  const userQueryWidthInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (currentPageWidth?.value && focusedInput !== "pageWidth") {
      setTempWidth(currentPageWidth.value)
    }
  }, [currentPageWidth?.value, focusedInput])

  useEffect(() => {
    if (currentUserQueryWidth?.value && focusedInput !== "userQueryWidth") {
      setTempUserQueryWidth(currentUserQueryWidth.value)
    }
  }, [currentUserQueryWidth?.value, focusedInput])

  // 清理防抖定时器
  useEffect(() => {
    return () => {
      if (widthBlurTimerRef.current) clearTimeout(widthBlurTimerRef.current)
      if (userQueryWidthBlurTimerRef.current) clearTimeout(userQueryWidthBlurTimerRef.current)
    }
  }, [])

  // 页面宽度更新
  const commitWidth = useCallback(() => {
    let val = parseInt(tempWidth)
    const unit = currentPageWidth?.unit || "%"

    if (isNaN(val)) {
      val =
        unit === "%"
          ? parseInt(LAYOUT_CONFIG.PAGE_WIDTH.DEFAULT_PERCENT)
          : parseInt(LAYOUT_CONFIG.PAGE_WIDTH.DEFAULT_PX)
    }

    if (unit === "%") {
      if (val < LAYOUT_CONFIG.PAGE_WIDTH.MIN_PERCENT) val = LAYOUT_CONFIG.PAGE_WIDTH.MIN_PERCENT
      if (val > LAYOUT_CONFIG.PAGE_WIDTH.MAX_PERCENT) val = LAYOUT_CONFIG.PAGE_WIDTH.MAX_PERCENT
    } else {
      if (val <= 0) val = LAYOUT_CONFIG.PAGE_WIDTH.MIN_PX
    }

    const finalVal = val.toString()
    setTempWidth(finalVal)
    if (finalVal !== currentPageWidth?.value && settings) {
      const current = currentPageWidth || { enabled: true, value: finalVal, unit: "%" }
      setSettings({
        layout: {
          ...settings.layout,
          pageWidth: {
            ...settings.layout?.pageWidth,
            [siteId]: { ...current, value: finalVal },
          },
        },
      })
    }
  }, [tempWidth, currentPageWidth, settings, siteId, setSettings])

  const handleWidthFocus = () => {
    if (widthBlurTimerRef.current) {
      clearTimeout(widthBlurTimerRef.current)
      widthBlurTimerRef.current = null
    }
    setFocusedInput("pageWidth")
  }

  const handleWidthBlur = () => {
    widthBlurTimerRef.current = setTimeout(() => {
      if (document.activeElement !== widthInputRef.current) {
        setFocusedInput(null)
        commitWidth()
      }
    }, 100)
  }

  const handleUnitChange = (newUnit: string) => {
    const newValue =
      newUnit === "px"
        ? LAYOUT_CONFIG.PAGE_WIDTH.DEFAULT_PX
        : LAYOUT_CONFIG.PAGE_WIDTH.DEFAULT_PERCENT
    setTempWidth(newValue)

    if (settings) {
      const newPageWidth = {
        ...currentPageWidth,
        unit: newUnit,
        value: newValue,
        enabled: currentPageWidth?.enabled ?? false,
      }
      setSettings({
        layout: {
          ...settings.layout,
          pageWidth: {
            ...settings.layout?.pageWidth,
            [siteId]: newPageWidth,
          },
        },
      })
    }
  }

  // 用户问题宽度更新
  const commitUserQueryWidth = useCallback(() => {
    let val = parseInt(tempUserQueryWidth)
    const unit = currentUserQueryWidth?.unit || "px"

    if (isNaN(val)) {
      val =
        unit === "%"
          ? parseInt(LAYOUT_CONFIG.USER_QUERY_WIDTH.DEFAULT_PERCENT)
          : parseInt(LAYOUT_CONFIG.USER_QUERY_WIDTH.DEFAULT_PX)
    }

    if (unit === "%") {
      if (val < LAYOUT_CONFIG.USER_QUERY_WIDTH.MIN_PERCENT)
        val = LAYOUT_CONFIG.USER_QUERY_WIDTH.MIN_PERCENT
      if (val > LAYOUT_CONFIG.USER_QUERY_WIDTH.MAX_PERCENT)
        val = LAYOUT_CONFIG.USER_QUERY_WIDTH.MAX_PERCENT
    } else {
      if (val <= 0) val = LAYOUT_CONFIG.USER_QUERY_WIDTH.MIN_PX
    }

    const finalVal = val.toString()
    setTempUserQueryWidth(finalVal)
    if (finalVal !== currentUserQueryWidth?.value && settings) {
      const current = currentUserQueryWidth || { enabled: true, value: finalVal, unit: "px" }
      setSettings({
        layout: {
          ...settings.layout,
          userQueryWidth: {
            ...settings.layout?.userQueryWidth,
            [siteId]: { ...current, value: finalVal },
          },
        },
      })
    }
  }, [tempUserQueryWidth, currentUserQueryWidth, settings, siteId, setSettings])

  const handleUserQueryWidthFocus = () => {
    if (userQueryWidthBlurTimerRef.current) {
      clearTimeout(userQueryWidthBlurTimerRef.current)
      userQueryWidthBlurTimerRef.current = null
    }
    setFocusedInput("userQueryWidth")
  }

  const handleUserQueryWidthBlur = () => {
    userQueryWidthBlurTimerRef.current = setTimeout(() => {
      if (document.activeElement !== userQueryWidthInputRef.current) {
        setFocusedInput(null)
        commitUserQueryWidth()
      }
    }, 100)
  }

  const handleUserQueryUnitChange = (newUnit: string) => {
    const newValue =
      newUnit === "px"
        ? LAYOUT_CONFIG.USER_QUERY_WIDTH.DEFAULT_PX
        : LAYOUT_CONFIG.USER_QUERY_WIDTH.DEFAULT_PERCENT
    setTempUserQueryWidth(newValue)
    if (settings) {
      const current = currentUserQueryWidth || { enabled: false, value: newValue, unit: newUnit }
      setSettings({
        layout: {
          ...settings.layout,
          userQueryWidth: {
            ...settings.layout?.userQueryWidth,
            [siteId]: { ...current, unit: newUnit, value: newValue },
          },
        },
      })
    }
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
              disabled={!currentPageWidth?.enabled}>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  ref={widthInputRef}
                  type="text"
                  className="settings-input"
                  value={tempWidth}
                  onFocus={handleWidthFocus}
                  onChange={(e) => setTempWidth(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={handleWidthBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      commitWidth()
                      widthInputRef.current?.blur()
                    }
                  }}
                  disabled={!currentPageWidth?.enabled}
                  style={{ width: "80px" }}
                />
                <select
                  className="settings-select"
                  value={currentPageWidth?.unit || "%"}
                  onChange={(e) => handleUnitChange(e.target.value)}
                  disabled={!currentPageWidth?.enabled}>
                  <option value="%">%</option>
                  <option value="px">px</option>
                </select>
              </div>
            </SettingRow>
          </SettingCard>

          {/* 用户问题宽度卡片 */}
          <SettingCard title={t("userQueryWidthSettings") || "用户问题宽度"}>
            <ToggleRow
              label={t("enableUserQueryWidth") || "启用用户问题加宽"}
              description={t("userQueryWidthDesc") || "调整用户问题气泡的最大宽度"}
              checked={currentUserQueryWidth?.enabled ?? false}
              onChange={() => {
                const current = currentUserQueryWidth || {
                  enabled: false,
                  value: "600",
                  unit: "px",
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
              disabled={!currentUserQueryWidth?.enabled}>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  ref={userQueryWidthInputRef}
                  type="text"
                  className="settings-input"
                  value={tempUserQueryWidth}
                  onFocus={handleUserQueryWidthFocus}
                  onChange={(e) => setTempUserQueryWidth(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={handleUserQueryWidthBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      commitUserQueryWidth()
                      userQueryWidthInputRef.current?.blur()
                    }
                  }}
                  disabled={!currentUserQueryWidth?.enabled}
                  style={{ width: "80px" }}
                />
                <select
                  className="settings-select"
                  value={currentUserQueryWidth?.unit || "px"}
                  onChange={(e) => handleUserQueryUnitChange(e.target.value)}
                  disabled={!currentUserQueryWidth?.enabled}>
                  <option value="px">px</option>
                  <option value="%">%</option>
                </select>
              </div>
            </SettingRow>
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
          />

          {/* Gemini Enterprise */}
          <ModelLockRow
            label="Gemini Enterprise"
            siteKey="gemini-enterprise"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
          />

          {/* AI Studio - 使用下拉选择器 */}
          <AIStudioModelLockRow settings={settings} setSettings={setSettings} />

          {/* ChatGPT */}
          <ModelLockRow
            label="ChatGPT"
            siteKey="chatgpt"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
          />

          {/* Claude */}
          <ModelLockRow
            label="Claude"
            siteKey="claude"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
          />

          {/* Grok */}
          <ModelLockRow
            label="Grok"
            siteKey="grok"
            settings={settings}
            setSettings={setSettings}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
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
            checked={settings.content?.markdownFix ?? true}
            onChange={() =>
              updateNestedSetting("content", "markdownFix", !settings.content?.markdownFix)
            }
          />

          <ToggleRow
            label={t("watermarkRemovalLabel") || "图片水印移除"}
            description={t("watermarkRemovalDesc") || "自动移除 AI 生成图片的水印"}
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
              <SettingRow label={t("maxRetriesLabel")}>
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
