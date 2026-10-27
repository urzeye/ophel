/**
 * 站点设置页面
 * 结构：站点选择器 + 选中站点的聚合设置（页面布局 / 模型锁定 / 站点专属）
 * 设置按站点 key 存储；未单独配置的站点读取时回退到 _default 兜底值
 */
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"

import type { SiteAdapter } from "~adapters/base"
import {
  createFeatureCapabilitiesFromSignature,
  getBuiltinFeatureCapabilities,
  getFeatureCapabilitiesSignature,
  type SitePackCapability,
} from "~adapters/feature-capabilities"
import { PageContentIcon as LayoutIcon, PowerIcon } from "~components/icons"
import { ModelLockSiteCard } from "~components/ModelLockSiteCard"
import { PlatformIcon } from "~components/PlatformIcon"
import { ConfirmDialog, SelectDropdown, Slider, Tooltip } from "~components/ui"
import { LAYOUT_CONFIG, SITE_IDS, isBuiltinSiteId } from "~constants"
import { SUPPORTED_AI_PLATFORMS } from "~constants/defaults"
import { platform } from "~platform"
import { useSettingsStore } from "~stores/settings-store"
import { getCurrentLang, subscribeI18nChanges, t } from "~utils/i18n"
import { MSG_CHECK_PERMISSIONS, MSG_REQUEST_PERMISSIONS, sendToBackground } from "~utils/messaging"
import {
  getSiteCleanMode,
  getSiteAutoHideInput,
  getSitePageWidth,
  getSitePanelAvoidance,
  getSiteUserQueryWidth,
  getSiteZenMode,
} from "~utils/storage"
import { showToast, showToastThrottled } from "~utils/toast"

import { PageTitle, SettingCard, SettingRow, ToggleRow } from "../components"
import ClaudeSettings from "./ClaudeSettings"

interface SiteSettingsPageProps {
  siteId: string
  siteInstanceKey?: string
  adapter?: SiteAdapter | null
  /** 深链传入的目标站点（siteId 或站点实例 key），非法值回退到当前站点 */
  initialTab?: string
}

const SITE_PACK_INFO_URL_EN = "https://ophel.app/docs/enhancements/site-extensions/capabilities"
const SITE_PACK_INFO_URL_ZH = "https://ophel.app/docs/zh/enhancements/site-extensions/capabilities"

const getSitePackInfoUrl = (lang: string): string =>
  lang.startsWith("zh") ? SITE_PACK_INFO_URL_ZH : SITE_PACK_INFO_URL_EN

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

// 自动隐藏输入框首发站点白名单；其余站点验证后逐步加入
const AUTO_HIDE_INPUT_SUPPORTED_SITE_IDS = new Set<string>([SITE_IDS.GEMINI])

// 有专属设置分组的站点
const EXCLUSIVE_SETTINGS_SITE_IDS = new Set<string>([
  SITE_IDS.GEMINI,
  SITE_IDS.AISTUDIO,
  SITE_IDS.CHATGPT,
  SITE_IDS.CLAUDE,
])

const SiteSettingsPage: React.FC<SiteSettingsPageProps> = ({
  siteId,
  siteInstanceKey = siteId,
  adapter,
  initialTab,
}) => {
  const featureCapabilitiesSignature = getFeatureCapabilitiesSignature(
    adapter?.getFeatureCapabilities() ?? [],
  )
  const featureCapabilities = useMemo(
    () => createFeatureCapabilitiesFromSignature(featureCapabilitiesSignature),
    [featureCapabilitiesSignature],
  )
  const isCommunitySitePack = Boolean(adapter && !isBuiltinSiteId(siteId))
  // 弹窗内当前站点：内置站点用 siteId，社区适配包用站点实例 key；独立 Options 页无站点上下文
  const currentSiteValue = isCommunitySitePack ? siteInstanceKey : siteId
  const currentLanguage = useSyncExternalStore(subscribeI18nChanges, getCurrentLang, getCurrentLang)
  const siteOptions = useMemo(() => {
    const options: Array<{
      value: string
      name: string
      platform?: { name: string; faviconUrl?: string }
    }> = SUPPORTED_AI_PLATFORMS.map((p) => ({
      value: p.id,
      name: p.name,
      platform: { name: p.name, faviconUrl: p.faviconUrl },
    }))
    // 社区适配包按实例 key 存配置，仅在面板内（有适配器上下文）提供当前实例入口
    if (isCommunitySitePack && adapter) {
      options.push({ value: siteInstanceKey, name: adapter.getName() })
    }
    // 与适配中心内置站点列表一致：当前站点置顶；独立 Options 页无匹配时保持目录顺序
    const currentIndex = options.findIndex((option) => option.value === currentSiteValue)
    if (currentIndex > 0) {
      const [current] = options.splice(currentIndex, 1)
      options.unshift(current)
    }
    return options
  }, [isCommunitySitePack, adapter, siteInstanceKey, currentSiteValue])
  // 独立 Options 页的 siteId 是 _default 占位，不在选项里，此时回退到第一个站点
  const fallbackSiteValue = siteOptions.some((option) => option.value === currentSiteValue)
    ? currentSiteValue
    : siteOptions[0].value
  const pickInitialSite = useCallback(
    (value: string | undefined): string =>
      value && siteOptions.some((option) => option.value === value) ? value : fallbackSiteValue,
    [siteOptions, fallbackSiteValue],
  )
  const [selectedSite, setSelectedSite] = useState<string>(() => pickInitialSite(initialTab))
  const [showDisableSiteConfirm, setShowDisableSiteConfirm] = useState(false)

  const { settings, setSettings, setPreviewSettings, clearPreviewSettings, updateNestedSetting } =
    useSettingsStore()
  const prerequisiteToastTemplate = t("enablePrerequisiteToast")
  const showPrerequisiteToast = (label: string) =>
    showToastThrottled(prerequisiteToastTemplate.replace("{setting}", label), 2000, {}, 1500, label)
  const enablePageWidthLabel = t("enablePageWidth")
  const enableUserQueryWidthLabel = t("enableUserQueryWidth")

  const otherSiteToastTemplate = t("siteSettingsOtherSiteToast")
  // 面板内切到非当前站点时提示上下文，避免误以为在改当前站点；Options 页无当前站点概念不提示
  const showOtherSiteToast = useCallback(
    (value: string) => {
      if (!adapter || value === currentSiteValue) return
      const name = siteOptions.find((option) => option.value === value)?.name ?? value
      showToastThrottled(
        otherSiteToastTemplate.replace("{site}", name),
        2000,
        {},
        800,
        "site-switch",
      )
    },
    [adapter, currentSiteValue, siteOptions, otherSiteToastTemplate],
  )

  useEffect(() => {
    const next = pickInitialSite(initialTab)
    setSelectedSite(next)
    // 深链跳入（如从适配中心点站点设置）落到非当前站点时同样提示
    showOtherSiteToast(next)
  }, [initialTab, pickInitialSite, showOtherSiteToast])

  const handleSiteChange = (value: string) => {
    setSelectedSite(value)
    showOtherSiteToast(value)
  }

  const isCommunitySelected = isCommunitySitePack && selectedSite === siteInstanceKey
  const selectedSiteName =
    siteOptions.find((option) => option.value === selectedSite)?.name ?? selectedSite
  const selectedCapabilities = isCommunitySelected
    ? featureCapabilities
    : getBuiltinFeatureCapabilities(selectedSite)
  const supportsCapability = (capability: SitePackCapability): boolean =>
    selectedCapabilities.has(capability)
  const supportsPanelAvoidance =
    PANEL_AVOIDANCE_SUPPORTED_SITE_IDS.has(selectedSite) ||
    (isCommunitySelected && selectedCapabilities.has("panel-avoidance"))
  const supportsPageWidth = supportsCapability("width")
  const supportsUserQueryWidth =
    supportsPageWidth &&
    (isBuiltinSiteId(selectedSite) ||
      (isCommunitySelected && (adapter?.getUserQueryWidthSelectors().length ?? 0) > 0))
  const supportsZenMode = supportsCapability("zen")
  const supportsCleanMode = supportsCapability("clean")
  const supportsAutoHideInput =
    AUTO_HIDE_INPUT_SUPPORTED_SITE_IDS.has(selectedSite) ||
    (isCommunitySelected && Boolean(adapter?.getAutoHideInputConfig()))
  const supportsModelLock = supportsCapability("model-lock")
  const hasExclusiveSettings = EXCLUSIVE_SETTINGS_SITE_IDS.has(selectedSite)
  // 仅在面板内（有适配器上下文）且选中当前内置站点时提供"在此站点停用"入口
  const canDisableCurrentSite =
    Boolean(adapter) && isBuiltinSiteId(siteId) && selectedSite === siteId
  const handleDisableCurrentSite = () => {
    const current = settings?.disabledSites ?? []
    if (!current.includes(siteId)) {
      setSettings({ disabledSites: [...current, siteId] })
    }
    // persist 写入 chrome.storage 是异步 IPC，立即刷新可能中断写入；
    // 留出持久化缓冲后再刷新（主世界注入脚本无法随设置卸载，需刷新彻底停用）
    setTimeout(() => window.location.reload(), 300)
  }
  // 宽度布局相关状态
  const currentPageWidth = settings ? getSitePageWidth(settings, selectedSite) : undefined
  const currentUserQueryWidth = settings ? getSiteUserQueryWidth(settings, selectedSite) : undefined
  const currentZenMode = settings
    ? getSiteZenMode(settings, selectedSite)
    : { enabled: false, showExitButton: true }
  const currentCleanMode = settings ? getSiteCleanMode(settings, selectedSite) : { enabled: true }
  const currentAutoHideInput = settings
    ? getSiteAutoHideInput(settings, selectedSite)
    : { enabled: false }
  const currentPanelAvoidance = settings
    ? getSitePanelAvoidance(settings, selectedSite)
    : { enabled: true }
  const panelAvoidanceTitle = (
    <span className="settings-card-title-with-badge">
      <span>{t("panelAvoidanceTitle")}</span>
      <span className="settings-beta-badge">{t("betaBadge")}</span>
    </span>
  )
  const autoHideInputTitle = (
    <span className="settings-card-title-with-badge">
      <span>{t("autoHideInputTitle")}</span>
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
          [selectedSite]: {
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

  const selectorOptions = siteOptions.map((option) => ({
    value: option.value,
    label: (
      <span className="settings-site-option">
        <PlatformIcon
          platform={option.platform ?? { name: option.name ?? option.value }}
          size={16}
        />
        <span>{option.name}</span>
      </span>
    ),
  }))

  return (
    <div>
      <PageTitle
        title={t("navSiteSettings")}
        Icon={LayoutIcon}
        action={
          canDisableCurrentSite ? (
            <Tooltip content={t("disableSiteEntryLabel")}>
              <button
                type="button"
                className="settings-site-disable-icon-btn"
                aria-label={t("disableSiteEntryLabel")}
                onClick={() => setShowDisableSiteConfirm(true)}>
                <PowerIcon size={16} />
              </button>
            </Tooltip>
          ) : undefined
        }
      />
      {isCommunitySelected && (
        <div className="settings-site-pack-notice" role="note">
          <span className="settings-site-pack-badge">{t("communitySitePackBadge")}</span>
          <span className="settings-site-pack-notice-text">{t("communitySitePackDesc")}</span>
          <a
            className="settings-site-pack-link"
            href={getSitePackInfoUrl(currentLanguage)}
            target="_blank"
            rel="noreferrer">
            {t("learnMore")}
          </a>
        </div>
      )}
      <p className="settings-page-desc">{t("siteSettingsPageDesc")}</p>

      <div className="settings-site-selector" data-settings-sticky>
        <span className="settings-site-selector-label">{t("siteSelectorLabel")}</span>
        <div className="settings-site-selector-dropdown">
          <SelectDropdown
            buttonClassName="settings-select"
            options={selectorOptions}
            value={selectedSite}
            ariaLabel={t("siteSelectorLabel")}
            onChange={handleSiteChange}
          />
        </div>
        {selectedSite === currentSiteValue && (
          <span className="settings-current-site-badge">{t("currentSiteBadge")}</span>
        )}
      </div>

      {/* ========== 页面布局分组 ========== */}
      <div className="settings-section-label">
        {t("tabLayout")} · {selectedSiteName}
      </div>
      {supportsPanelAvoidance && (
        <SettingCard title={panelAvoidanceTitle} settingId="layout-panel-avoidance-card">
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
                    [selectedSite]: {
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
      {supportsPageWidth && (
        <SettingCard title={t("layoutSettingsTitle")} settingId="layout-page-width-card">
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
                    [selectedSite]: { ...current, enabled: !current.enabled },
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
      )}

      {/* 用户问题宽度卡片 */}
      {supportsUserQueryWidth && (
        <SettingCard title={t("userQueryWidthSettings")} settingId="layout-user-query-width-card">
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
                    [selectedSite]: { ...current, enabled: !current.enabled },
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
      )}

      {/* 禅模式 (Zen Mode) 卡片 */}
      {supportsZenMode && (
        <SettingCard title={t("zenModeTitle")} settingId="layout-zen-mode-card">
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
                  [selectedSite]: {
                    ...currentZenMode,
                    enabled: newZenEnabled,
                  },
                },
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
                    [selectedSite]: {
                      ...currentZenMode,
                      showExitButton: !(currentZenMode.showExitButton ?? true),
                    },
                  },
                },
              })
            }}
          />
        </SettingCard>
      )}

      {/* 净化模式 (Clean Mode) 卡片 */}
      {supportsCleanMode && (
        <SettingCard title={t("cleanModeTitle")} settingId="layout-clean-mode-card">
          <ToggleRow
            label={t("cleanModeLabel")}
            description={t("cleanModeDesc")}
            settingId="layout-clean-mode-enabled"
            checked={currentCleanMode.enabled}
            onChange={() => {
              setSettings({
                layout: {
                  ...settings.layout,
                  cleanMode: {
                    ...settings.layout?.cleanMode,
                    [selectedSite]: {
                      ...currentCleanMode,
                      enabled: !currentCleanMode.enabled,
                    },
                  },
                },
              })
            }}
          />
        </SettingCard>
      )}

      {/* 自动隐藏输入框 (Auto Hide Input) 卡片 */}
      {supportsAutoHideInput && (
        <SettingCard title={autoHideInputTitle} settingId="layout-auto-hide-input-card">
          <ToggleRow
            label={t("autoHideInputLabel")}
            description={t("autoHideInputDesc")}
            settingId="layout-auto-hide-input-enabled"
            checked={currentAutoHideInput.enabled}
            onChange={() => {
              setSettings({
                layout: {
                  ...settings.layout,
                  autoHideInput: {
                    ...settings.layout?.autoHideInput,
                    [selectedSite]: {
                      ...currentAutoHideInput,
                      enabled: !currentAutoHideInput.enabled,
                    },
                  },
                },
              })
            }}
          />
        </SettingCard>
      )}

      {/* ========== 模型锁定分组 ========== */}
      {supportsModelLock && (
        <>
          <div className="settings-section-label">
            {t("tabModelLock")} · {selectedSiteName}
          </div>
          <ModelLockSiteCard siteKey={selectedSite} siteName={selectedSiteName} />
        </>
      )}

      {/* ========== 站点专属分组 ========== */}
      {hasExclusiveSettings && (
        <div className="settings-section-label">
          {selectedSiteName} · {t("siteExclusiveSettingsLabel")}
        </div>
      )}
      {!hasExclusiveSettings && !isCommunitySelected && (
        <p className="settings-section-hint">{t("noSiteExclusiveSettings")}</p>
      )}

      {/* Gemini 专属 */}
      {selectedSite === SITE_IDS.GEMINI && (
        <SettingCard
          title={t("geminiSettingsTab")}
          description={t("contentProcessingDesc")}
          settingId="gemini-settings-card">
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
        </SettingCard>
      )}

      {/* AI Studio 专属 */}
      {selectedSite === SITE_IDS.AISTUDIO && (
        <SettingCard
          title={t("aistudioSettingsTitle")}
          description={t("aistudioSettingsDesc")}
          settingId="aistudio-settings-card">
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

      {/* Claude 专属；siteId 传真实当前站点，用于「不在 Claude 站点」的操作门控 */}
      {selectedSite === SITE_IDS.CLAUDE && <ClaudeSettings siteId={siteId} />}

      {/* ChatGPT 专属 */}
      {selectedSite === SITE_IDS.CHATGPT && (
        <SettingCard
          title={t("chatgptSettingsTitle")}
          description={t("chatgptSettingsDesc")}
          settingId="chatgpt-settings-card">
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

          <ToggleRow
            label={t("chatgptCodeBlockBatchMountLabel")}
            description={t("chatgptCodeBlockBatchMountDesc")}
            settingId="chatgpt-code-block-batch-mount"
            checked={settings.chatgpt?.codeBlockBatchMount ?? true}
            onChange={() =>
              setSettings({
                chatgpt: {
                  ...settings.chatgpt,
                  codeBlockBatchMount: !(settings.chatgpt?.codeBlockBatchMount ?? true),
                },
              })
            }
          />

          <ToggleRow
            label={t("chatgptStreamingRenderOptimizeLabel")}
            description={t("chatgptStreamingRenderOptimizeDesc")}
            settingId="chatgpt-streaming-render-optimize"
            checked={settings.chatgpt?.streamingRenderOptimize ?? true}
            onChange={() =>
              setSettings({
                chatgpt: {
                  ...settings.chatgpt,
                  streamingRenderOptimize: !(settings.chatgpt?.streamingRenderOptimize ?? true),
                },
              })
            }
          />

          <ToggleRow
            label={t("chatgptDisableBackdropBlurLabel")}
            description={t("chatgptDisableBackdropBlurDesc")}
            settingId="chatgpt-disable-backdrop-blur"
            checked={settings.chatgpt?.disableBackdropBlur ?? false}
            onChange={() =>
              setSettings({
                chatgpt: {
                  ...settings.chatgpt,
                  disableBackdropBlur: !settings.chatgpt?.disableBackdropBlur,
                },
              })
            }
          />
        </SettingCard>
      )}

      {showDisableSiteConfirm && (
        <ConfirmDialog
          title={t("disableSiteConfirmTitle", { site: adapter?.getName() ?? siteId })}
          message={t("disableSiteConfirmDesc", { site: adapter?.getName() ?? siteId })}
          confirmText={t("disableSiteConfirmAction")}
          danger
          onConfirm={handleDisableCurrentSite}
          onCancel={() => setShowDisableSiteConfirm(false)}
        />
      )}
    </div>
  )
}

export default SiteSettingsPage
