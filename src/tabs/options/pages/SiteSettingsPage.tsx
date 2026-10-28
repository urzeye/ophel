/**
 * 站点设置页面
 * 结构：站点选择器 + 选中站点的聚合设置（页面布局 / 模型锁定 / 专属设置）
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
import { useSettingsStore } from "~stores/settings-store"
import type { PageWidthConfig, Settings } from "~types/settings"
import { getCurrentLang, subscribeI18nChanges, t } from "~utils/i18n"
import {
  getSiteAutoHideInput,
  getSiteCleanMode,
  getSitePageWidth,
  getSitePanelAvoidance,
  getSiteUserQueryWidth,
  getSiteZenMode,
} from "~utils/storage"
import { showToastThrottled } from "~utils/toast"

import { PageTitle, SettingCard, SettingRow, ToggleRow } from "../components"
import AIStudioSettings from "./AIStudioSettings"
import ChatGPTSettings from "./ChatGPTSettings"
import ClaudeSettings from "./ClaudeSettings"
import GeminiSettings from "./GeminiSettings"

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

type SiteLayoutKey = keyof Settings["layout"]
type SiteLayoutConfig<K extends SiteLayoutKey> = NonNullable<Settings["layout"][K]>[string]
type PercentWidthKey = "pageWidth" | "userQueryWidth"

// 页面宽度与用户问题宽度共用同一组行：开关 + 从属的滑块行
const PERCENT_WIDTH_ROWS = {
  pageWidth: {
    config: LAYOUT_CONFIG.PAGE_WIDTH,
    labelKey: "layoutSettingsTitle",
    descKey: "pageWidthDesc",
    valueLabelKey: "pageWidthValueLabel",
    enabledSettingId: "layout-page-width-enabled",
    valueSettingId: "layout-page-width-value",
  },
  userQueryWidth: {
    config: LAYOUT_CONFIG.USER_QUERY_WIDTH,
    labelKey: "userQueryWidthSettings",
    descKey: "userQueryWidthDesc",
    valueLabelKey: "userQueryWidthValueLabel",
    enabledSettingId: "layout-user-query-width-enabled",
    valueSettingId: "layout-user-query-width-value",
  },
} as const

/**
 * 把 patch 合并进某个站点的布局配置，只写该站点 key。
 * 以当前生效值（含 _default 回退）为基底，保持与改版前相同的存储结构。
 */
const buildSiteLayoutPatch = <K extends SiteLayoutKey>(
  layout: Settings["layout"] | undefined,
  key: K,
  siteKey: string,
  current: SiteLayoutConfig<K>,
  patch: Partial<SiteLayoutConfig<K>>,
): Pick<Settings, "layout"> =>
  ({
    layout: { ...layout, [key]: { ...layout?.[key], [siteKey]: { ...current, ...patch } } },
  }) as Pick<Settings, "layout">

const parseWidthValue = (value: string | undefined, fallback: string): number => {
  const parsed = Number.parseInt(value ?? fallback, 10)
  return Number.isNaN(parsed) ? Number.parseInt(fallback, 10) : parsed
}

const renderLabelWithBeta = (title: string): React.ReactNode => (
  <span className="settings-row-label-with-badge">
    <span>{title}</span>
    <span className="settings-beta-badge">{t("betaBadge")}</span>
  </span>
)

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

  const { settings, setSettings, setPreviewSettings, clearPreviewSettings } = useSettingsStore()

  // 深链跳入（如从适配中心点站点设置）时同步选中的站点
  useEffect(() => {
    setSelectedSite(pickInitialSite(initialTab))
  }, [initialTab, pickInitialSite])

  if (!settings) return null

  const prerequisiteToastTemplate = t("enablePrerequisiteToast")
  const showPrerequisiteToast = (label: string) =>
    showToastThrottled(prerequisiteToastTemplate.replace("{setting}", label), 2000, {}, 1500, label)

  const isCommunitySelected = isCommunitySitePack && selectedSite === siteInstanceKey
  const selectedSiteName =
    siteOptions.find((option) => option.value === selectedSite)?.name ?? selectedSite
  // 面板内选中非当前站点时常驻提示，避免误以为在改当前站点；Options 页无当前站点概念不提示
  const otherSiteHint =
    adapter && selectedSite !== currentSiteValue
      ? t("siteSettingsOtherSiteHint", { site: selectedSiteName })
      : null
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
  const hasLayoutSettings =
    supportsPanelAvoidance ||
    supportsPageWidth ||
    supportsUserQueryWidth ||
    supportsZenMode ||
    supportsCleanMode ||
    supportsAutoHideInput
  const supportsModelLock = supportsCapability("model-lock")
  const hasExclusiveSettings = EXCLUSIVE_SETTINGS_SITE_IDS.has(selectedSite)
  // 仅在面板内（有适配器上下文）且选中当前内置站点时提供"在此站点停用"入口
  const canDisableCurrentSite =
    Boolean(adapter) && isBuiltinSiteId(siteId) && selectedSite === siteId
  const handleDisableCurrentSite = () => {
    const current = settings.disabledSites ?? []
    if (!current.includes(siteId)) {
      setSettings({ disabledSites: [...current, siteId] })
    }
    // persist 写入 chrome.storage 是异步 IPC，立即刷新可能中断写入；
    // 留出持久化缓冲后再刷新（主世界注入脚本无法随设置卸载，需刷新彻底停用）
    setTimeout(() => window.location.reload(), 300)
  }

  // 当前站点各项布局配置（已含 _default 回退）
  const currentPageWidth = getSitePageWidth(settings, selectedSite)
  const currentUserQueryWidth = getSiteUserQueryWidth(settings, selectedSite)
  const currentZenMode = getSiteZenMode(settings, selectedSite)
  const currentCleanMode = getSiteCleanMode(settings, selectedSite)
  const currentAutoHideInput = getSiteAutoHideInput(settings, selectedSite)
  const currentPanelAvoidance = getSitePanelAvoidance(settings, selectedSite)

  const updateLayout = <K extends SiteLayoutKey>(
    key: K,
    current: SiteLayoutConfig<K>,
    patch: Partial<SiteLayoutConfig<K>>,
  ) => setSettings(buildSiteLayoutPatch(settings.layout, key, selectedSite, current, patch))

  // 开关 + 从属的宽度滑块行；开关关闭时滑块行置灰，点击提示先开启
  const renderPercentWidthRows = (key: PercentWidthKey, current: PageWidthConfig) => {
    const { config, labelKey, descKey, valueLabelKey, enabledSettingId, valueSettingId } =
      PERCENT_WIDTH_ROWS[key]
    const label = t(labelKey)
    const valueLabel = t(valueLabelKey)
    const buildWidthPatch = (value: number) => {
      const nextValue = Math.min(config.MAX_PERCENT, Math.max(config.MIN_PERCENT, value))
      return buildSiteLayoutPatch(settings.layout, key, selectedSite, current, {
        value: String(nextValue),
        unit: "%",
      })
    }

    return (
      <>
        <ToggleRow
          label={label}
          description={t(descKey)}
          settingId={enabledSettingId}
          className="has-sub"
          checked={current.enabled}
          onChange={() => updateLayout(key, current, { enabled: !current.enabled })}
        />
        <SettingRow
          className="is-sub"
          label={valueLabel}
          settingId={valueSettingId}
          disabled={!current.enabled}
          onDisabledClick={() => showPrerequisiteToast(label)}>
          <Slider
            value={parseWidthValue(current.value, config.DEFAULT_PERCENT)}
            onChange={(value) => setSettings(buildWidthPatch(value))}
            onPreviewChange={(value) => setPreviewSettings(buildWidthPatch(value))}
            onCancelPreview={clearPreviewSettings}
            min={config.MIN_PERCENT}
            max={config.MAX_PERCENT}
            step={1}
            unit="%"
            defaultValue={Number.parseInt(config.DEFAULT_PERCENT, 10)}
            disabled={!current.enabled}
            formatValue={(value) => `${value}%`}
            ariaLabel={valueLabel}
          />
        </SettingRow>
      </>
    )
  }

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
            onChange={setSelectedSite}
          />
        </div>
        {selectedSite === currentSiteValue && (
          <span className="settings-current-site-badge">{t("currentSiteBadge")}</span>
        )}
        {otherSiteHint && <span className="settings-site-selector-hint">{otherSiteHint}</span>}
      </div>

      {/* ========== 页面布局分组：一张卡，智能避让在首行 ========== */}
      {hasLayoutSettings && (
        <>
          <h2 className="settings-section-label">{t("tabLayout")}</h2>
          <SettingCard settingId="site-settings-layout">
            {supportsPanelAvoidance && (
              <ToggleRow
                label={renderLabelWithBeta(t("panelAvoidanceTitle"))}
                ariaLabel={t("panelAvoidanceTitle")}
                description={t("panelAvoidanceDesc")}
                settingId="layout-panel-avoidance-enabled"
                checked={currentPanelAvoidance.enabled}
                onChange={() =>
                  updateLayout("panelAvoidance", currentPanelAvoidance, {
                    enabled: !currentPanelAvoidance.enabled,
                  })
                }
              />
            )}

            {supportsPageWidth && renderPercentWidthRows("pageWidth", currentPageWidth)}
            {supportsUserQueryWidth &&
              renderPercentWidthRows("userQueryWidth", currentUserQueryWidth)}

            {supportsZenMode && (
              <>
                <ToggleRow
                  label={t("zenModeTitle")}
                  description={t("zenModeDesc")}
                  settingId="layout-zen-mode-enabled"
                  className="has-sub"
                  checked={currentZenMode.enabled}
                  onChange={() =>
                    updateLayout("zenMode", currentZenMode, { enabled: !currentZenMode.enabled })
                  }
                />
                <ToggleRow
                  className="is-sub"
                  label={t("zenModeExitButtonVisibleLabel")}
                  description={t("zenModeExitButtonVisibleDesc")}
                  settingId="layout-zen-mode-exit-button-visible"
                  disabled={!currentZenMode.enabled}
                  onDisabledClick={() => showPrerequisiteToast(t("zenModeTitle"))}
                  checked={currentZenMode.showExitButton ?? true}
                  onChange={() =>
                    updateLayout("zenMode", currentZenMode, {
                      showExitButton: !(currentZenMode.showExitButton ?? true),
                    })
                  }
                />
              </>
            )}

            {supportsCleanMode && (
              <ToggleRow
                label={t("cleanModeTitle")}
                description={t("cleanModeDesc")}
                settingId="layout-clean-mode-enabled"
                checked={currentCleanMode.enabled}
                onChange={() =>
                  updateLayout("cleanMode", currentCleanMode, {
                    enabled: !currentCleanMode.enabled,
                  })
                }
              />
            )}

            {supportsAutoHideInput && (
              <ToggleRow
                label={renderLabelWithBeta(t("autoHideInputTitle"))}
                ariaLabel={t("autoHideInputTitle")}
                description={t("autoHideInputDesc")}
                settingId="layout-auto-hide-input-enabled"
                checked={currentAutoHideInput.enabled}
                onChange={() =>
                  updateLayout("autoHideInput", currentAutoHideInput, {
                    enabled: !currentAutoHideInput.enabled,
                  })
                }
              />
            )}
          </SettingCard>
        </>
      )}

      {/* ========== 模型锁定分组 ========== */}
      {supportsModelLock && (
        <>
          <h2 className="settings-section-label">{t("tabModelLock")}</h2>
          <ModelLockSiteCard siteKey={selectedSite} />
        </>
      )}

      {/* ========== 专属设置分组 ========== */}
      {hasExclusiveSettings && (
        <>
          <h2 className="settings-section-label">{t("siteExclusiveSettingsLabel")}</h2>
          {selectedSite === SITE_IDS.GEMINI && <GeminiSettings />}
          {selectedSite === SITE_IDS.AISTUDIO && <AIStudioSettings />}
          {/* Claude 专属；siteId 传真实当前站点，用于「不在 Claude 站点」的操作门控 */}
          {selectedSite === SITE_IDS.CLAUDE && <ClaudeSettings siteId={siteId} />}
          {selectedSite === SITE_IDS.CHATGPT && <ChatGPTSettings />}
        </>
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
