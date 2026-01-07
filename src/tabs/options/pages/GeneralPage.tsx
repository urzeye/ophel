/**
 * 基本设置页面
 * 包含：通用设置 | 标签页设置
 */
import React, { useCallback, useState } from "react"

import { Switch } from "~components/ui"
import { COLLAPSED_BUTTON_DEFS, TAB_DEFINITIONS } from "~constants"
import { useSettingsStore } from "~stores/settings-store"
import { setLanguage, t } from "~utils/i18n"

import { SettingCard, SettingRow, TabGroup, ToggleRow } from "../components"

interface GeneralPageProps {
  siteId: string
}

// 可排序项目组件
const SortableItem: React.FC<{
  icon?: string
  label: string
  index: number
  total: number
  enabled?: boolean
  showToggle?: boolean
  onToggle?: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}> = ({
  icon,
  label,
  index,
  total,
  enabled = true,
  showToggle = false,
  onToggle,
  onMoveUp,
  onMoveDown,
}) => (
  <div className="settings-sortable-item">
    {icon && <span className="settings-sortable-item-icon">{icon}</span>}
    <span className="settings-sortable-item-label">{label}</span>
    <div className="settings-sortable-item-actions">
      {showToggle && <Switch checked={enabled} onChange={() => onToggle?.()} size="sm" />}
      <button
        className="settings-sortable-btn"
        onClick={onMoveUp}
        disabled={index === 0}
        title={t("moveUp") || "上移"}>
        ▲
      </button>
      <button
        className="settings-sortable-btn"
        onClick={onMoveDown}
        disabled={index === total - 1}
        title={t("moveDown") || "下移"}>
        ▼
      </button>
    </div>
  </div>
)

const GeneralPage: React.FC<GeneralPageProps> = ({ siteId }) => {
  const [activeTab, setActiveTab] = useState("general")
  const { settings, setSettings, updateNestedSetting, updateDeepSetting } = useSettingsStore()

  // Tab 排序
  const moveTab = useCallback(
    (index: number, direction: number) => {
      if (!settings) return
      const newOrder = [...(settings.features?.order || [])]
      const newIndex = index + direction
      if (newIndex >= 0 && newIndex < newOrder.length) {
        ;[newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]]
        updateNestedSetting("features", "order", newOrder)
      }
    },
    [settings, updateNestedSetting],
  )

  // 快捷按钮排序
  const moveButton = useCallback(
    (index: number, direction: number) => {
      if (!settings) return
      const newOrder = [...(settings.collapsedButtons || [])]
      const newIndex = index + direction
      if (newIndex >= 0 && newIndex < newOrder.length) {
        ;[newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]]
        setSettings({ collapsedButtons: newOrder })
      }
    },
    [settings, setSettings],
  )

  const toggleButton = useCallback(
    (index: number) => {
      if (!settings) return
      const newOrder = [...(settings.collapsedButtons || [])]
      newOrder[index] = { ...newOrder[index], enabled: !newOrder[index].enabled }
      setSettings({ collapsedButtons: newOrder })
    },
    [settings, setSettings],
  )

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang)
    if (settings) {
      setSettings({ language: lang })
    }
  }

  if (!settings) return null

  const tabs = [
    { id: "general", label: t("generalTab") || "通用" },
    { id: "tab", label: t("tabSettingsTab") || "标签页" },
  ]

  return (
    <div>
      <h1 className="settings-page-title">{t("navGeneral") || "基本设置"}</h1>
      <p className="settings-page-desc">{t("generalPageDesc") || "配置扩展的基本行为和界面"}</p>

      <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "general" && (
        <>
          {/* 通用设置卡片 */}
          <SettingCard title={t("generalSettings") || "通用设置"}>
            {/* 语言 */}
            <SettingRow
              label={t("languageLabel") || "语言"}
              description={t("languageDesc") || "设置面板显示语言，即时生效"}>
              <select
                className="settings-select"
                value={settings.language || "auto"}
                onChange={(e) => handleLanguageChange(e.target.value)}>
                <option value="auto">{t("languageAuto") || "自动"}</option>
                <option value="zh-CN">{t("languageZhCN") || "简体中文"}</option>
                <option value="zh-TW">{t("languageZhTW") || "繁体中文"}</option>
                <option value="en">{t("languageEn") || "English"}</option>
              </select>
            </SettingRow>

            <ToggleRow
              label={t("defaultPanelStateLabel") || "默认显示面板"}
              description={t("defaultPanelStateDesc") || "页面加载后自动展开面板"}
              checked={settings.panel?.defaultOpen ?? false}
              onChange={() =>
                updateNestedSetting("panel", "defaultOpen", !settings.panel?.defaultOpen)
              }
            />

            <ToggleRow
              label={t("autoHidePanelLabel") || "自动隐藏面板"}
              description={t("autoHidePanelDesc") || "点击面板外部时自动隐藏"}
              checked={settings.panel?.autoHide ?? false}
              onChange={() => updateNestedSetting("panel", "autoHide", !settings.panel?.autoHide)}
            />

            <ToggleRow
              label={t("edgeSnapHideLabel") || "边缘吸附隐藏"}
              description={t("edgeSnapHideDesc") || "拖动面板到屏幕边缘时自动隐藏"}
              checked={settings.panel?.edgeSnap ?? false}
              onChange={() => updateNestedSetting("panel", "edgeSnap", !settings.panel?.edgeSnap)}
            />
          </SettingCard>

          {/* 界面排版卡片 */}
          <SettingCard
            title={t("tabOrderSettings") || "界面排版"}
            description={t("tabOrderDesc") || "调整面板标签页的显示顺序"}>
            {settings.features?.order
              ?.filter((id) => TAB_DEFINITIONS[id])
              .map((tabId, index) => {
                const def = TAB_DEFINITIONS[tabId]
                const isEnabled =
                  tabId === "prompts"
                    ? settings.features?.prompts?.enabled !== false
                    : tabId === "outline"
                      ? settings.features?.outline?.enabled !== false
                      : tabId === "conversations"
                        ? settings.features?.conversations?.enabled !== false
                        : true
                return (
                  <SortableItem
                    key={tabId}
                    label={t(def.label) || tabId}
                    index={index}
                    total={settings.features?.order.filter((id) => TAB_DEFINITIONS[id]).length}
                    enabled={isEnabled}
                    showToggle
                    onToggle={() => {
                      if (tabId === "prompts")
                        updateDeepSetting("features", "prompts", "enabled", !isEnabled)
                      else if (tabId === "outline")
                        updateDeepSetting("features", "outline", "enabled", !isEnabled)
                      else if (tabId === "conversations")
                        updateDeepSetting("features", "conversations", "enabled", !isEnabled)
                    }}
                    onMoveUp={() => moveTab(index, -1)}
                    onMoveDown={() => moveTab(index, 1)}
                  />
                )
              })}
          </SettingCard>

          {/* 快捷按钮排序卡片 */}
          <SettingCard
            title={t("collapsedButtonsOrderTitle") || "快捷按钮组"}
            description={t("collapsedButtonsOrderDesc") || "快捷按钮组排序与启用"}>
            {settings.collapsedButtons?.map((btn, index) => {
              const def = COLLAPSED_BUTTON_DEFS[btn.id]
              if (!def) return null
              return (
                <SortableItem
                  key={btn.id}
                  icon={def.icon}
                  label={t(def.labelKey) || btn.id}
                  index={index}
                  total={settings.collapsedButtons.length}
                  enabled={btn.enabled}
                  showToggle={["anchor", "theme", "manualAnchor"].includes(btn.id)}
                  onToggle={() => toggleButton(index)}
                  onMoveUp={() => moveButton(index, -1)}
                  onMoveDown={() => moveButton(index, 1)}
                />
              )
            })}
          </SettingCard>
        </>
      )}

      {activeTab === "tab" && (
        <>
          {/* 标签页行为卡片 */}
          <SettingCard title={t("tabBehaviorTitle") || "标签页行为"}>
            <ToggleRow
              label={t("openNewTabLabel") || "新标签页打开"}
              description={t("openNewTabDesc") || "在新标签页中打开新对话"}
              checked={settings.tab?.openInNewTab ?? true}
              onChange={() =>
                updateNestedSetting("tab", "openInNewTab", !settings.tab?.openInNewTab)
              }
            />

            <ToggleRow
              label={t("autoRenameTabLabel") || "自动重命名"}
              description={t("autoRenameTabDesc") || "根据对话内容自动更新标签页标题"}
              checked={settings.tab?.autoRename ?? false}
              onChange={() => updateNestedSetting("tab", "autoRename", !settings.tab?.autoRename)}
            />

            <SettingRow
              label={t("renameIntervalLabel") || "检测频率"}
              disabled={!settings.tab?.autoRename}>
              <select
                className="settings-select"
                value={settings.tab?.renameInterval || 3}
                onChange={(e) =>
                  updateNestedSetting("tab", "renameInterval", parseInt(e.target.value))
                }
                disabled={!settings.tab?.autoRename}>
                {[1, 3, 5, 10, 30, 60].map((v) => (
                  <option key={v} value={v}>
                    {v} 秒
                  </option>
                ))}
              </select>
            </SettingRow>

            <SettingRow
              label={t("titleFormatLabel") || "标题格式"}
              description={t("titleFormatDesc") || "支持占位符：{status}、{title}、{model}"}
              disabled={!settings.tab?.autoRename}>
              <input
                type="text"
                className="settings-input"
                value={settings.tab?.titleFormat || "{status}{title}"}
                onChange={(e) => updateNestedSetting("tab", "titleFormat", e.target.value)}
                placeholder="{status}{title}"
                disabled={!settings.tab?.autoRename}
                style={{ width: "180px" }}
              />
            </SettingRow>

            <ToggleRow
              label={t("showStatusLabel") || "显示生成状态"}
              description={t("showStatusDesc") || "在标签页标题中显示生成状态"}
              checked={settings.tab?.showStatus ?? true}
              onChange={() => updateNestedSetting("tab", "showStatus", !settings.tab?.showStatus)}
            />
          </SettingCard>

          {/* 通知设置卡片 */}
          <SettingCard title={t("notificationSettings") || "通知设置"}>
            <ToggleRow
              label={t("showNotificationLabel") || "桌面通知"}
              description={t("showNotificationDesc") || "生成完成时发送桌面通知"}
              checked={settings.tab?.showNotification ?? true}
              onChange={() =>
                updateNestedSetting("tab", "showNotification", !settings.tab?.showNotification)
              }
            />

            <ToggleRow
              label={t("notificationSoundLabel") || "通知声音"}
              description={t("notificationSoundDesc") || "生成完成时播放提示音"}
              checked={settings.tab?.notificationSound ?? false}
              disabled={!settings.tab?.showNotification}
              onChange={() =>
                updateNestedSetting("tab", "notificationSound", !settings.tab?.notificationSound)
              }
            />

            <SettingRow
              label={t("notificationVolumeLabel") || "声音音量"}
              disabled={!settings.tab?.showNotification || !settings.tab?.notificationSound}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={settings.tab?.notificationVolume || 0.5}
                  onChange={(e) =>
                    updateNestedSetting("tab", "notificationVolume", parseFloat(e.target.value))
                  }
                  disabled={!settings.tab?.showNotification || !settings.tab?.notificationSound}
                  style={{ width: "100px" }}
                />
                <span style={{ fontSize: "12px", minWidth: "36px" }}>
                  {Math.round((settings.tab?.notificationVolume || 0.5) * 100)}%
                </span>
              </div>
            </SettingRow>

            <ToggleRow
              label={t("notifyWhenFocusedLabel") || "前台时也通知"}
              description={t("notifyWhenFocusedDesc") || "窗口在前台时也发送通知"}
              checked={settings.tab?.notifyWhenFocused ?? false}
              disabled={!settings.tab?.showNotification}
              onChange={() =>
                updateNestedSetting("tab", "notifyWhenFocused", !settings.tab?.notifyWhenFocused)
              }
            />

            <ToggleRow
              label={t("autoFocusLabel") || "自动窗口置顶"}
              description={t("autoFocusDesc") || "生成完成后自动激活窗口"}
              checked={settings.tab?.autoFocus ?? false}
              disabled={!settings.tab?.showNotification}
              onChange={() => updateNestedSetting("tab", "autoFocus", !settings.tab?.autoFocus)}
            />
          </SettingCard>

          {/* 隐私模式卡片 */}
          <SettingCard title={t("privacyModeTitle") || "隐私模式"}>
            <ToggleRow
              label={t("privacyModeLabel") || "启用隐私模式"}
              description={t("privacyModeDesc") || "使用伪装标题隐藏真实内容"}
              checked={settings.tab?.privacyMode ?? false}
              onChange={() => updateNestedSetting("tab", "privacyMode", !settings.tab?.privacyMode)}
            />

            <SettingRow
              label={t("privacyTitleLabel") || "伪装标题"}
              disabled={!settings.tab?.privacyMode}>
              <input
                type="text"
                className="settings-input"
                value={settings.tab?.privacyTitle || "Google"}
                onChange={(e) => updateNestedSetting("tab", "privacyTitle", e.target.value)}
                placeholder="Google"
                disabled={!settings.tab?.privacyMode}
                style={{ width: "180px" }}
              />
            </SettingRow>
          </SettingCard>
        </>
      )}
    </div>
  )
}

export default GeneralPage
