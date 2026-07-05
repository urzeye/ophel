/**
 * 站点设置页面
 * 包含：页面布局、内容处理
 * 这些设置与具体站点相关，按站点存储配置
 */
import React, { useEffect, useState } from "react"

import { PageContentIcon as LayoutIcon } from "~components/icons"
import { NumberInput, Slider } from "~components/ui"
import { LAYOUT_CONFIG, SITE_IDS, SITE_SETTINGS_TAB_IDS } from "~constants"
import { platform } from "~platform"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import { MSG_CHECK_PERMISSIONS, MSG_REQUEST_PERMISSIONS, sendToBackground } from "~utils/messaging"
import { showToast, showToastThrottled } from "~utils/toast"

import { PageTitle, SettingCard, SettingRow, TabGroup, ToggleRow } from "../components"
import ClaudeSettings from "./ClaudeSettings"

interface SiteSettingsPageProps {
  siteId: string
  initialTab?: string
  modelLockContent?: React.ReactNode
}

const normalizeSiteSettingsTab = (
  tab: string | undefined,
  hasModelLockContent: boolean,
): string => {
  if (!tab) return SITE_SETTINGS_TAB_IDS.LAYOUT
  if (tab === SITE_SETTINGS_TAB_IDS.MODEL_LOCK && !hasModelLockContent) {
    return SITE_SETTINGS_TAB_IDS.LAYOUT
  }
  return tab
}

const PANEL_AVOIDANCE_SUPPORTED_SITE_IDS = new Set<string>([
  SITE_IDS.AISTUDIO,
  SITE_IDS.CHATGPT,
  SITE_IDS.CLAUDE,
  SITE_IDS.CHATGLM,
  SITE_IDS.DEEPSEEK,
  SITE_IDS.DOUBAO,
  SITE_IDS.GEMINI,
  SITE_IDS.GEMINI_ENTERPRISE,
  SITE_IDS.GROK,
  SITE_IDS.IMA,
  SITE_IDS.KIMI,
  SITE_IDS.QIANWEN,
  SITE_IDS.QWENAI,
  SITE_IDS.YUANBAO,
  SITE_IDS.ZAI,
])

const SiteSettingsPage: React.FC<SiteSettingsPageProps> = ({
  siteId,
  initialTab,
  modelLockContent,
}) => {
  const hasModelLockContent = Boolean(modelLockContent)
  const [activeTab, setActiveTab] = useState<string>(
    normalizeSiteSettingsTab(initialTab, hasModelLockContent),
  )

  useEffect(() => {
    setActiveTab(normalizeSiteSettingsTab(initialTab, hasModelLockContent))
  }, [initialTab, hasModelLockContent])
  const { settings, setSettings, setPreviewSettings, clearPreviewSettings, updateNestedSetting } =
    useSettingsStore()
  const prerequisiteToastTemplate = t("enablePrerequisiteToast")
  const showPrerequisiteToast = (label: string) =>
    showToastThrottled(prerequisiteToastTemplate.replace("{setting}", label), 2000, {}, 1500, label)
  const enablePageWidthLabel = t("enablePageWidth")
  const enableUserQueryWidthLabel = t("enableUserQueryWidth")
  const supportsPanelAvoidance = PANEL_AVOIDANCE_SUPPORTED_SITE_IDS.has(siteId)

  // 宽度布局相关状态
  const currentPageWidth =
    settings?.layout?.pageWidth?.[siteId as keyof typeof settings.layout.pageWidth] ||
    settings?.layout?.pageWidth?._default
  const currentUserQueryWidth =
    settings?.layout?.userQueryWidth?.[siteId as keyof typeof settings.layout.userQueryWidth] ||
    settings?.layout?.userQueryWidth?._default
  const currentZenMode = settings?.layout?.zenMode?.[siteId] ||
    settings?.layout?.zenMode?._default || { enabled: false, showExitButton: true }
  const currentPanelAvoidance = settings?.layout?.panelAvoidance?.[siteId] ||
    settings?.layout?.panelAvoidance?._default || { enabled: true }
  const panelAvoidanceTitle = (
    <span className="settings-card-title-with-badge">
      <span>{t("panelAvoidanceTitle")}</span>
      <span className="settings-beta-badge">{t("betaBadge")}</span>
    </span>
  )

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
    ...(hasModelLockContent
      ? [{ id: SITE_SETTINGS_TAB_IDS.MODEL_LOCK, label: t("tabModelLock") }]
      : []),
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
          {supportsPanelAvoidance && (
            <SettingCard title={panelAvoidanceTitle}>
              <ToggleRow
                label={t("panelAvoidanceLabel")}
                description={t("panelAvoidanceDesc")}
                settingId="layout-panel-avoidance-enabled"
                checked={currentPanelAvoidance.enabled}
                onChange={() => {
                  setSettings({
                    layout: {
                      ...settings.layout,
                      panelAvoidance: {
                        ...settings.layout?.panelAvoidance,
                        [siteId]: {
                          ...currentPanelAvoidance,
                          enabled: !currentPanelAvoidance.enabled,
                        },
                      },
                    },
                  })
                }}
              />
            </SettingCard>
          )}

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

      {activeTab === SITE_SETTINGS_TAB_IDS.MODEL_LOCK && modelLockContent}

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
