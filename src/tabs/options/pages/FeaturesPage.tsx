/**
 * 功能模块页面
 * 包含：大纲设置、会话管理、模型锁定、阅读历史
 * 无顶部标签，使用垂直卡片分组
 */
import React from "react"

import { Switch } from "~components/ui"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"

import { SettingCard, SettingRow, ToggleRow } from "../components"

interface FeaturesPageProps {
  siteId: string
}

// 模型关键词输入组件
const ModelKeywordInput: React.FC<{
  value: string
  onChange: (value: string) => void
  placeholder: string
  disabled?: boolean
}> = ({ value, onChange, placeholder, disabled = false }) => {
  const [localValue, setLocalValue] = React.useState(value)

  React.useEffect(() => {
    setLocalValue(value)
  }, [value])

  return (
    <input
      type="text"
      className="settings-input"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
        if (localValue !== value) {
          onChange(localValue)
        }
      }}
      placeholder={placeholder}
      disabled={disabled}
      style={{ width: "200px" }}
    />
  )
}

const FeaturesPage: React.FC<FeaturesPageProps> = ({ siteId }) => {
  const { settings, setSettings, updateDeepSetting, updateNestedSetting } = useSettingsStore()

  if (!settings) return null

  return (
    <div>
      <h1 className="settings-page-title">{t("navFeatures") || "功能模块"}</h1>
      <p className="settings-page-desc">{t("featuresPageDesc") || "配置扩展的各项功能模块"}</p>

      {/* 大纲设置卡片 */}
      <SettingCard
        title={t("outlineSettings") || "大纲设置"}
        description={t("outlineSettingsDesc") || "配置大纲生成和跟随行为"}>
        <ToggleRow
          label={t("outlineAutoUpdateLabel") || "自动更新"}
          description={t("outlineAutoUpdateDesc") || "在对话进行时自动刷新大纲"}
          checked={settings.features?.outline?.autoUpdate ?? true}
          onChange={() =>
            updateDeepSetting(
              "features",
              "outline",
              "autoUpdate",
              !settings.features?.outline?.autoUpdate,
            )
          }
        />

        <SettingRow
          label={t("outlineUpdateIntervalLabel") || "更新检测间隔"}
          description={t("outlineUpdateIntervalDesc") || "大纲自动更新的时间间隔（秒）"}>
          <input
            type="number"
            className="settings-input"
            min={1}
            value={settings.features?.outline?.updateInterval || 2}
            onChange={(e) =>
              updateDeepSetting(
                "features",
                "outline",
                "updateInterval",
                parseInt(e.target.value) || 2,
              )
            }
            style={{ width: "80px" }}
          />
        </SettingRow>

        <SettingRow
          label={t("outlineFollowModeLabel") || "大纲跟随模式"}
          description={
            settings.features?.outline?.followMode === "current"
              ? t("outlineFollowCurrentDesc") || "滚动页面时自动定位高亮大纲项"
              : settings.features?.outline?.followMode === "latest"
                ? t("outlineFollowLatestDesc") || "大纲始终自动滚动到底部"
                : t("outlineFollowManualDesc") || "不自动滚动大纲"
          }>
          <select
            className="settings-select"
            value={settings.features?.outline?.followMode || "current"}
            onChange={(e) =>
              updateDeepSetting(
                "features",
                "outline",
                "followMode",
                e.target.value as "current" | "latest" | "manual",
              )
            }>
            <option value="current">{t("outlineFollowCurrent") || "跟随当前位置"}</option>
            <option value="latest">{t("outlineFollowLatest") || "跟随最新消息"}</option>
            <option value="manual">{t("outlineFollowManual") || "手动控制"}</option>
          </select>
        </SettingRow>
      </SettingCard>

      {/* 会话管理卡片 */}
      <SettingCard
        title={t("conversationsSettingsTitle") || "会话管理"}
        description={t("conversationsSettingsDesc") || "配置会话同步和显示行为"}>
        <ToggleRow
          label={t("folderRainbowLabel") || "文件夹彩虹色"}
          description={t("folderRainbowDesc") || "为不同文件夹使用不同颜色"}
          checked={settings.features?.conversations?.folderRainbow ?? true}
          onChange={() =>
            updateDeepSetting(
              "features",
              "conversations",
              "folderRainbow",
              !settings.features?.conversations?.folderRainbow,
            )
          }
        />

        <ToggleRow
          label={t("conversationsSyncUnpinLabel") || "同步时取消置顶"}
          description={t("conversationsSyncUnpinDesc") || "同步会话时自动取消置顶"}
          checked={settings.features?.conversations?.syncUnpin ?? false}
          onChange={() =>
            updateDeepSetting(
              "features",
              "conversations",
              "syncUnpin",
              !settings.features?.conversations?.syncUnpin,
            )
          }
        />
      </SettingCard>

      {/* 模型锁定卡片 */}
      <SettingCard
        title={t("modelLockTitle") || "模型锁定"}
        description={t("modelLockDesc") || "锁定特定模型，防止自动切换"}>
        {/* Gemini Enterprise */}
        <div style={{ marginBottom: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}>
            <span style={{ fontSize: "14px", fontWeight: 500 }}>Gemini Enterprise</span>
            <Switch
              checked={settings.modelLock?.["gemini-enterprise"]?.enabled ?? false}
              onChange={() => {
                const current = settings.modelLock?.["gemini-enterprise"] || {
                  enabled: false,
                  keyword: "",
                }
                setSettings({
                  modelLock: {
                    ...settings.modelLock,
                    "gemini-enterprise": { ...current, enabled: !current.enabled },
                  },
                })
              }}
            />
          </div>
          <ModelKeywordInput
            value={settings.modelLock?.["gemini-enterprise"]?.keyword || ""}
            onChange={(value) => {
              const current = settings.modelLock?.["gemini-enterprise"] || {
                enabled: false,
                keyword: "",
              }
              setSettings({
                modelLock: {
                  ...settings.modelLock,
                  "gemini-enterprise": { ...current, keyword: value },
                },
              })
            }}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
            disabled={!settings.modelLock?.["gemini-enterprise"]?.enabled}
          />
        </div>

        {/* Gemini */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}>
            <span style={{ fontSize: "14px", fontWeight: 500 }}>Gemini</span>
            <Switch
              checked={settings.modelLock?.gemini?.enabled ?? false}
              onChange={() => {
                const current = settings.modelLock?.gemini || { enabled: false, keyword: "" }
                setSettings({
                  modelLock: {
                    ...settings.modelLock,
                    gemini: { ...current, enabled: !current.enabled },
                  },
                })
              }}
            />
          </div>
          <ModelKeywordInput
            value={settings.modelLock?.gemini?.keyword || ""}
            onChange={(value) => {
              const current = settings.modelLock?.gemini || { enabled: false, keyword: "" }
              setSettings({
                modelLock: {
                  ...settings.modelLock,
                  gemini: { ...current, keyword: value },
                },
              })
            }}
            placeholder={t("modelKeywordPlaceholder") || "模型关键词"}
            disabled={!settings.modelLock?.gemini?.enabled}
          />
        </div>
      </SettingCard>

      {/* 阅读历史卡片 */}
      <SettingCard
        title={t("readingHistoryTitle") || "阅读历史"}
        description={t("readingHistoryDesc") || "记录和恢复会话阅读位置"}>
        <ToggleRow
          label={t("readingHistoryPersistenceLabel") || "启用阅读历史"}
          description={t("readingHistoryPersistenceDesc") || "记录每个会话的阅读位置"}
          checked={settings.readingHistory?.persistence ?? true}
          onChange={() =>
            updateNestedSetting(
              "readingHistory",
              "persistence",
              !settings.readingHistory?.persistence,
            )
          }
        />

        <ToggleRow
          label={t("readingHistoryAutoRestoreLabel") || "自动恢复位置"}
          description={t("readingHistoryAutoRestoreDesc") || "打开会话时自动跳转到上次阅读位置"}
          checked={settings.readingHistory?.autoRestore ?? true}
          disabled={!settings.readingHistory?.persistence}
          onChange={() =>
            updateNestedSetting(
              "readingHistory",
              "autoRestore",
              !settings.readingHistory?.autoRestore,
            )
          }
        />

        <SettingRow
          label={t("readingHistoryCleanup") || "历史保留时间"}
          disabled={!settings.readingHistory?.persistence}>
          <select
            className="settings-select"
            value={settings.readingHistory?.cleanupDays || 30}
            onChange={(e) =>
              updateNestedSetting("readingHistory", "cleanupDays", parseInt(e.target.value))
            }
            disabled={!settings.readingHistory?.persistence}>
            <option value={1}>1 {t("day") || "天"}</option>
            <option value={3}>3 {t("days") || "天"}</option>
            <option value={7}>7 {t("days") || "天"}</option>
            <option value={30}>30 {t("days") || "天"}</option>
            <option value={90}>90 {t("days") || "天"}</option>
            <option value={-1}>{t("forever") || "永久"}</option>
          </select>
        </SettingRow>
      </SettingCard>
    </div>
  )
}

export default FeaturesPage
