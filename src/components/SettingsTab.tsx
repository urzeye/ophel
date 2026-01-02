import React, { useCallback, useState } from "react"

import { useStorage } from "@plasmohq/storage/hook"

import { setLanguage, t } from "~utils/i18n"
import { DEFAULT_SETTINGS, STORAGE_KEYS, type Settings } from "~utils/storage"

// 快捷按钮定义
const COLLAPSED_BUTTON_DEFS: Record<string, { icon: string; label: string }> = {
  scrollTop: { icon: "⬆️", label: "scrollTop" },
  panel: { icon: "✨", label: "panelTitle" },
  anchor: { icon: "⚓", label: "showCollapsedAnchorLabel" },
  theme: { icon: "🌗", label: "toggleTheme" },
  manualAnchor: { icon: "📍", label: "manualAnchorLabel" },
  scrollBottom: { icon: "⬇️", label: "scrollBottom" },
}

// Tab定义
const TAB_DEFINITIONS: Record<string, { label: string }> = {
  prompts: { label: "tabPrompts" },
  conversations: { label: "tabConversations" },
  outline: { label: "tabOutline" },
}

// 通用开关组件
const ToggleRow: React.FC<{
  label: string
  desc?: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
}> = ({ label, desc, checked, onChange, disabled = false }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "10px",
      padding: "6px 0",
      opacity: disabled ? 0.5 : 1,
      pointerEvents: disabled ? "none" : "auto",
    }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 500, fontSize: "13px" }}>{label}</div>
      {desc && <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{desc}</div>}
    </div>
    <label style={{ position: "relative", display: "inline-block", width: "36px", height: "20px" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span
        style={{
          position: "absolute",
          cursor: disabled ? "not-allowed" : "pointer",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: checked ? "#4285f4" : "#ccc",
          borderRadius: "20px",
          transition: "0.3s",
        }}>
        <span
          style={{
            position: "absolute",
            height: "16px",
            width: "16px",
            left: checked ? "18px" : "2px",
            bottom: "2px",
            backgroundColor: "white",
            borderRadius: "50%",
            transition: "0.3s",
          }}
        />
      </span>
    </label>
  </div>
)

// 可折叠分组
const CollapsibleSection: React.FC<{
  title: string
  defaultExpanded?: boolean
  children: React.ReactNode
}> = ({ title, defaultExpanded = true, children }) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div style={{ marginBottom: "16px" }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          padding: "8px 0",
          borderBottom: "1px solid #e5e7eb",
        }}>
        <span style={{ fontWeight: 600, fontSize: "13px", color: "#374151" }}>{title}</span>
        <span style={{ fontSize: "12px", color: "#9ca3af" }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && <div style={{ paddingTop: "8px" }}>{children}</div>}
    </div>
  )
}

// 可排序列表项
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
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "6px 0",
      marginBottom: "4px",
    }}>
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {icon && <span style={{ fontSize: "14px" }}>{icon}</span>}
      <span style={{ fontSize: "13px", fontWeight: 500 }}>{label}</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      {showToggle && (
        <label
          style={{
            position: "relative",
            display: "inline-block",
            width: "32px",
            height: "18px",
            marginRight: "8px",
          }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={onToggle}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span
            style={{
              position: "absolute",
              cursor: "pointer",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: enabled ? "#4285f4" : "#ccc",
              borderRadius: "18px",
              transition: "0.3s",
            }}>
            <span
              style={{
                position: "absolute",
                height: "14px",
                width: "14px",
                left: enabled ? "16px" : "2px",
                bottom: "2px",
                backgroundColor: "white",
                borderRadius: "50%",
                transition: "0.3s",
              }}
            />
          </span>
        </label>
      )}
      <button
        onClick={onMoveUp}
        disabled={index === 0}
        style={{
          width: "28px",
          height: "28px",
          border: "1px solid #d1d5db",
          borderRadius: "4px",
          background: "#f9fafb",
          cursor: index === 0 ? "not-allowed" : "pointer",
          opacity: index === 0 ? 0.4 : 1,
          fontSize: "12px",
        }}>
        ⬆
      </button>
      <button
        onClick={onMoveDown}
        disabled={index === total - 1}
        style={{
          width: "28px",
          height: "28px",
          border: "1px solid #d1d5db",
          borderRadius: "4px",
          background: "#f9fafb",
          cursor: index === total - 1 ? "not-allowed" : "pointer",
          opacity: index === total - 1 ? 0.4 : 1,
          fontSize: "12px",
        }}>
        ⬇
      </button>
    </div>
  </div>
)

export const SettingsTab = () => {
  const [settings, setSettings] = useStorage<Settings>(STORAGE_KEYS.SETTINGS, (saved) =>
    saved === undefined ? DEFAULT_SETTINGS : { ...DEFAULT_SETTINGS, ...saved },
  )

  const updateNestedSetting = <K extends keyof Settings>(
    section: K,
    key: keyof Settings[K],
    value: any,
  ) => {
    if (!settings) return
    setSettings({
      ...settings,
      [section]: {
        ...(settings[section] as object),
        [key]: value,
      },
    })
  }

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang)
    if (settings) {
      setSettings({ ...settings, language: lang })
    }
  }

  // Tab 排序
  const moveTab = useCallback(
    (index: number, direction: number) => {
      if (!settings) return
      const newOrder = [...settings.tabOrder]
      const newIndex = index + direction
      if (newIndex >= 0 && newIndex < newOrder.length) {
        ;[newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]]
        setSettings({ ...settings, tabOrder: newOrder })
      }
    },
    [settings, setSettings],
  )

  // 快捷按钮排序
  const moveButton = useCallback(
    (index: number, direction: number) => {
      if (!settings) return
      const newOrder = [...settings.collapsedButtonsOrder]
      const newIndex = index + direction
      if (newIndex >= 0 && newIndex < newOrder.length) {
        ;[newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]]
        setSettings({ ...settings, collapsedButtonsOrder: newOrder })
      }
    },
    [settings, setSettings],
  )

  const toggleButton = useCallback(
    (index: number) => {
      if (!settings) return
      const newOrder = [...settings.collapsedButtonsOrder]
      newOrder[index] = { ...newOrder[index], enabled: !newOrder[index].enabled }
      setSettings({ ...settings, collapsedButtonsOrder: newOrder })
    },
    [settings, setSettings],
  )

  if (!settings) return <div style={{ padding: "16px" }}>加载设置中...</div>

  return (
    <div
      className="gh-settings-tab"
      style={{
        padding: "12px",
        fontSize: "13px",
        maxHeight: "calc(100vh - 150px)",
        overflowY: "auto",
      }}>
      {/* ========== 通用设置 ========== */}
      <CollapsibleSection title={t("settingsTitle")}>
        {/* 语言 */}
        <div style={{ marginBottom: "12px" }}>
          <label
            style={{ display: "block", marginBottom: "4px", fontWeight: 500, fontSize: "13px" }}>
            {t("languageLabel")}
          </label>
          <select
            value={settings.language || "auto"}
            onChange={(e) => handleLanguageChange(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: "4px",
              border: "1px solid #d1d5db",
              fontSize: "12px",
            }}>
            <option value="auto">{t("languageAuto")}</option>
            <option value="zh-CN">{t("languageZhCN")}</option>
            <option value="zh-TW">{t("languageZhTW")}</option>
            <option value="en">{t("languageEn")}</option>
          </select>
        </div>
      </CollapsibleSection>

      {/* ========== 面板设置 ========== */}
      <CollapsibleSection title={t("panelSettingsTitle") || "面板设置"} defaultExpanded={false}>
        <ToggleRow
          label={t("defaultPanelStateLabel") || "默认显示面板"}
          desc={t("defaultPanelStateDesc") || "页面加载后自动展开面板"}
          checked={settings.defaultPanelOpen ?? false}
          onChange={() =>
            setSettings({ ...settings, defaultPanelOpen: !settings.defaultPanelOpen })
          }
        />
        <ToggleRow
          label={t("autoHidePanelLabel") || "自动隐藏面板"}
          desc={t("autoHidePanelDesc") || "点击面板外部时自动隐藏"}
          checked={settings.autoHidePanel ?? false}
          onChange={() => setSettings({ ...settings, autoHidePanel: !settings.autoHidePanel })}
        />
        <ToggleRow
          label={t("edgeSnapHideLabel") || "边缘吸附隐藏"}
          desc={t("edgeSnapHideDesc") || "拖动面板到屏幕边缘时自动隐藏"}
          checked={settings.edgeSnapHide ?? false}
          onChange={() => setSettings({ ...settings, edgeSnapHide: !settings.edgeSnapHide })}
        />

        {/* 快捷按钮组排序 */}
        <div style={{ marginTop: "12px", marginBottom: "8px", fontSize: "12px", color: "#6b7280" }}>
          {t("collapsedButtonsOrderDesc") || "快捷按钮组排序与启用"}
        </div>
        {settings.collapsedButtonsOrder?.map((btn, index) => {
          const def = COLLAPSED_BUTTON_DEFS[btn.id]
          if (!def) return null
          return (
            <SortableItem
              key={btn.id}
              icon={def.icon}
              label={t(def.label) || btn.id}
              index={index}
              total={settings.collapsedButtonsOrder.length}
              enabled={btn.enabled}
              showToggle={["anchor", "theme", "manualAnchor"].includes(btn.id)}
              onToggle={() => toggleButton(index)}
              onMoveUp={() => moveButton(index, -1)}
              onMoveDown={() => moveButton(index, 1)}
            />
          )
        })}
      </CollapsibleSection>

      {/* ========== 界面排版 ========== */}
      <CollapsibleSection title={t("tabOrderSettings") || "界面排版"} defaultExpanded={false}>
        <div style={{ marginBottom: "8px", fontSize: "12px", color: "#6b7280" }}>
          {t("tabOrderDesc") || "调整面板标签页的显示顺序"}
        </div>
        {settings.tabOrder
          ?.filter((id) => TAB_DEFINITIONS[id])
          .map((tabId, index) => {
            const def = TAB_DEFINITIONS[tabId]
            const isEnabled =
              tabId === "prompts"
                ? settings.prompts?.enabled !== false
                : tabId === "outline"
                  ? settings.outline?.enabled !== false
                  : tabId === "conversations"
                    ? settings.conversations?.enabled !== false
                    : true
            return (
              <SortableItem
                key={tabId}
                label={t(def.label) || tabId}
                index={index}
                total={settings.tabOrder.filter((id) => TAB_DEFINITIONS[id]).length}
                enabled={isEnabled}
                showToggle
                onToggle={() => {
                  if (tabId === "prompts")
                    updateNestedSetting("prompts", "enabled", !settings.prompts?.enabled)
                  else if (tabId === "outline")
                    updateNestedSetting("outline", "enabled", !settings.outline?.enabled)
                  else if (tabId === "conversations")
                    updateNestedSetting(
                      "conversations",
                      "enabled",
                      !settings.conversations?.enabled,
                    )
                }}
                onMoveUp={() => moveTab(index, -1)}
                onMoveDown={() => moveTab(index, 1)}
              />
            )
          })}
      </CollapsibleSection>

      {/* ========== 页面显示 ========== */}
      <CollapsibleSection title={t("pageDisplaySettings") || "页面显示"} defaultExpanded={false}>
        <ToggleRow
          label={t("enablePageWidth") || "启用页面宽度"}
          checked={settings.pageWidth?.enabled ?? false}
          onChange={() => updateNestedSetting("pageWidth", "enabled", !settings.pageWidth?.enabled)}
        />
        {settings.pageWidth?.enabled && (
          <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
            <input
              type="number"
              value={settings.pageWidth?.value || "100"}
              onChange={(e) => updateNestedSetting("pageWidth", "value", e.target.value)}
              style={{
                flex: 1,
                padding: "4px 8px",
                borderRadius: "4px",
                border: "1px solid #d1d5db",
                fontSize: "12px",
              }}
            />
            <select
              value={settings.pageWidth?.unit || "%"}
              onChange={(e) => updateNestedSetting("pageWidth", "unit", e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: "4px",
                border: "1px solid #d1d5db",
                fontSize: "12px",
              }}>
              <option value="%">%</option>
              <option value="px">px</option>
            </select>
          </div>
        )}
        <ToggleRow
          label={t("preventAutoScrollLabel") || "防止自动滚动"}
          desc={t("preventAutoScrollDesc") || "阻止页面自动滚动到底部"}
          checked={settings.preventAutoScroll ?? false}
          onChange={() =>
            setSettings({ ...settings, preventAutoScroll: !settings.preventAutoScroll })
          }
        />
      </CollapsibleSection>

      {/* ========== 大纲设置 ========== */}
      <CollapsibleSection title={t("outlineSettings") || "大纲设置"} defaultExpanded={false}>
        <ToggleRow
          label={t("outlineAutoUpdateLabel") || "自动更新"}
          desc={t("outlineAutoUpdateDesc") || "在对话进行时自动刷新大纲"}
          checked={settings.outline?.autoUpdate ?? true}
          onChange={() =>
            updateNestedSetting("outline", "autoUpdate", !settings.outline?.autoUpdate)
          }
        />
        <div style={{ marginBottom: "12px" }}>
          <label
            style={{ display: "block", marginBottom: "4px", fontWeight: 500, fontSize: "13px" }}>
            {t("outlineUpdateIntervalLabel") || "更新间隔 (秒)"}
          </label>
          <input
            type="number"
            min={1}
            value={settings.outline?.updateInterval || 2}
            onChange={(e) =>
              updateNestedSetting("outline", "updateInterval", parseInt(e.target.value) || 2)
            }
            style={{
              width: "60px",
              padding: "4px 8px",
              borderRadius: "4px",
              border: "1px solid #d1d5db",
              fontSize: "12px",
            }}
          />
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label
            style={{ display: "block", marginBottom: "4px", fontWeight: 500, fontSize: "13px" }}>
            {t("outlineFollowModeLabel") || "大纲跟随模式"}
          </label>
          <select
            value={settings.outline?.followMode || "current"}
            onChange={(e) =>
              updateNestedSetting(
                "outline",
                "followMode",
                e.target.value as "current" | "latest" | "manual",
              )
            }
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: "4px",
              border: "1px solid #d1d5db",
              fontSize: "12px",
            }}>
            <option value="current">{t("outlineFollowCurrent") || "跟随当前位置"}</option>
            <option value="latest">{t("outlineFollowLatest") || "跟随最新消息"}</option>
            <option value="manual">{t("outlineFollowManual") || "手动控制"}</option>
          </select>
          <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
            {settings.outline?.followMode === "current"
              ? t("outlineFollowCurrentDesc") || "滚动页面时高亮当前大纲项"
              : settings.outline?.followMode === "latest"
                ? t("outlineFollowLatestDesc") || "自动滚动到最新消息"
                : t("outlineFollowManualDesc") || "不自动滚动，用户手动控制"}
          </div>
        </div>
      </CollapsibleSection>

      {/* ========== 会话设置 ========== */}
      <CollapsibleSection
        title={t("conversationsSettingsTitle") || "会话设置"}
        defaultExpanded={false}>
        <ToggleRow
          label={t("conversationsSyncUnpinLabel") || "同步时取消置顶"}
          desc={t("conversationsSyncUnpinDesc") || "同步会话时自动取消置顶"}
          checked={settings.conversations?.syncUnpin ?? false}
          onChange={() =>
            updateNestedSetting("conversations", "syncUnpin", !settings.conversations?.syncUnpin)
          }
        />
        <ToggleRow
          label={t("folderRainbowLabel") || "文件夹彩虹色"}
          desc={t("folderRainbowDesc") || "为不同文件夹使用不同颜色"}
          checked={settings.conversations?.folderRainbow ?? true}
          onChange={() =>
            updateNestedSetting(
              "conversations",
              "folderRainbow",
              !settings.conversations?.folderRainbow,
            )
          }
        />
      </CollapsibleSection>

      {/* ========== 标签页设置 ========== */}
      <CollapsibleSection title={t("tabSettingsTitle")} defaultExpanded={false}>
        <ToggleRow
          label={t("openNewTabLabel") || "新标签页打开"}
          desc={t("openNewTabDesc") || "在新标签页中打开新对话"}
          checked={settings.tabSettings?.openInNewTab ?? true}
          onChange={() =>
            updateNestedSetting("tabSettings", "openInNewTab", !settings.tabSettings?.openInNewTab)
          }
        />
        <ToggleRow
          label={t("autoRenameTabLabel")}
          desc={t("autoRenameTabDesc")}
          checked={settings.tabSettings?.autoRenameTab ?? false}
          onChange={() =>
            updateNestedSetting(
              "tabSettings",
              "autoRenameTab",
              !settings.tabSettings?.autoRenameTab,
            )
          }
        />
        {settings.tabSettings?.autoRenameTab && (
          <>
            <div style={{ marginBottom: "12px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "4px",
                  fontWeight: 500,
                  fontSize: "13px",
                }}>
                {t("renameIntervalLabel") || "检测频率 (秒)"}
              </label>
              <select
                value={settings.tabSettings?.renameInterval || 3}
                onChange={(e) =>
                  updateNestedSetting("tabSettings", "renameInterval", parseInt(e.target.value))
                }
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  border: "1px solid #d1d5db",
                  fontSize: "12px",
                }}>
                {[1, 3, 5, 10, 30, 60].map((v) => (
                  <option key={v} value={v}>
                    {v} 秒
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "12px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "4px",
                  fontWeight: 500,
                  fontSize: "13px",
                }}>
                {t("titleFormatLabel") || "标题格式"}
              </label>
              <input
                type="text"
                value={settings.tabSettings?.titleFormat || "{status}{title}"}
                onChange={(e) => updateNestedSetting("tabSettings", "titleFormat", e.target.value)}
                placeholder="{status}{title}"
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  border: "1px solid #d1d5db",
                  fontSize: "12px",
                }}
              />
              <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
                {t("titleFormatDesc") || "可用变量: {status} {title}"}
              </div>
            </div>
          </>
        )}
        <ToggleRow
          label={t("showStatusLabel") || "显示生成状态"}
          desc={t("showStatusDesc") || "在标签页标题中显示生成状态"}
          checked={settings.tabSettings?.showStatus ?? true}
          onChange={() =>
            updateNestedSetting("tabSettings", "showStatus", !settings.tabSettings?.showStatus)
          }
        />
        <ToggleRow
          label={t("showNotificationLabel")}
          desc={t("showNotificationDesc")}
          checked={settings.tabSettings?.showNotification ?? true}
          onChange={() =>
            updateNestedSetting(
              "tabSettings",
              "showNotification",
              !settings.tabSettings?.showNotification,
            )
          }
        />
        {settings.tabSettings?.showNotification && (
          <>
            <ToggleRow
              label={t("notificationSoundLabel") || "通知声音"}
              desc={t("notificationSoundDesc") || "生成完成时播放提示音"}
              checked={settings.tabSettings?.notificationSound ?? false}
              onChange={() =>
                updateNestedSetting(
                  "tabSettings",
                  "notificationSound",
                  !settings.tabSettings?.notificationSound,
                )
              }
            />
            {settings.tabSettings?.notificationSound && (
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "4px",
                    fontWeight: 500,
                    fontSize: "13px",
                  }}>
                  {t("notificationVolumeLabel") || "音量"}
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={settings.tabSettings?.notificationVolume || 0.5}
                    onChange={(e) =>
                      updateNestedSetting(
                        "tabSettings",
                        "notificationVolume",
                        parseFloat(e.target.value),
                      )
                    }
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: "12px", minWidth: "36px" }}>
                    {Math.round((settings.tabSettings?.notificationVolume || 0.5) * 100)}%
                  </span>
                </div>
              </div>
            )}
            <ToggleRow
              label={t("notifyWhenFocusedLabel") || "前台时也通知"}
              desc={t("notifyWhenFocusedDesc") || "窗口在前台时也发送通知"}
              checked={settings.tabSettings?.notifyWhenFocused ?? false}
              onChange={() =>
                updateNestedSetting(
                  "tabSettings",
                  "notifyWhenFocused",
                  !settings.tabSettings?.notifyWhenFocused,
                )
              }
            />
          </>
        )}
        <ToggleRow
          label={t("autoFocusLabel") || "自动窗口置顶"}
          desc={t("autoFocusDesc") || "生成完成后自动激活窗口"}
          checked={settings.tabSettings?.autoFocus ?? false}
          onChange={() =>
            updateNestedSetting("tabSettings", "autoFocus", !settings.tabSettings?.autoFocus)
          }
        />
        <ToggleRow
          label={t("privacyModeLabel")}
          desc={t("privacyModeDesc")}
          checked={settings.tabSettings?.privacyMode ?? false}
          onChange={() =>
            updateNestedSetting("tabSettings", "privacyMode", !settings.tabSettings?.privacyMode)
          }
        />
        {settings.tabSettings?.privacyMode && (
          <div style={{ marginBottom: "12px" }}>
            <label
              style={{ display: "block", marginBottom: "4px", fontWeight: 500, fontSize: "13px" }}>
              {t("privacyTitleLabel") || "伪装标题"}
            </label>
            <input
              type="text"
              value={settings.tabSettings?.privacyTitle || "Google"}
              onChange={(e) => updateNestedSetting("tabSettings", "privacyTitle", e.target.value)}
              placeholder="Google"
              style={{
                width: "100%",
                padding: "4px 8px",
                borderRadius: "4px",
                border: "1px solid #d1d5db",
                fontSize: "12px",
              }}
            />
          </div>
        )}
      </CollapsibleSection>

      {/* ========== 阅读历史 ========== */}
      <CollapsibleSection title={t("readingHistoryTitle") || "阅读历史"} defaultExpanded={false}>
        <ToggleRow
          label={t("readingHistoryPersistenceLabel")}
          desc={t("readingHistoryPersistenceDesc")}
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
          label={t("readingHistoryAutoRestoreLabel")}
          desc={t("readingHistoryAutoRestoreDesc")}
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
        <div
          style={{ marginBottom: "12px", opacity: settings.readingHistory?.persistence ? 1 : 0.5 }}>
          <label
            style={{ display: "block", marginBottom: "4px", fontWeight: 500, fontSize: "13px" }}>
            {t("readingHistoryCleanup") || "历史保留时间"}
          </label>
          <select
            value={settings.readingHistory?.cleanupDays || 30}
            onChange={(e) =>
              updateNestedSetting("readingHistory", "cleanupDays", parseInt(e.target.value))
            }
            disabled={!settings.readingHistory?.persistence}
            style={{
              width: "100%",
              padding: "4px 8px",
              borderRadius: "4px",
              border: "1px solid #d1d5db",
              fontSize: "12px",
            }}>
            <option value={1}>1 天</option>
            <option value={3}>3 天</option>
            <option value={7}>7 天</option>
            <option value={30}>30 天</option>
            <option value={90}>90 天</option>
            <option value={-1}>永久保留</option>
          </select>
        </div>
      </CollapsibleSection>

      {/* ========== 模型锁定 ========== */}
      <CollapsibleSection title={t("modelLockTitle") || "模型锁定"} defaultExpanded={false}>
        <ToggleRow
          label={t("modelLockEnabledLabel") || "启用模型锁定"}
          desc={t("modelLockEnabledDesc") || "自动切换到指定模型"}
          checked={settings.modelLock?.enabled ?? false}
          onChange={() => updateNestedSetting("modelLock", "enabled", !settings.modelLock?.enabled)}
        />
        {settings.modelLock?.enabled && (
          <div style={{ marginBottom: "12px" }}>
            <label
              style={{ display: "block", marginBottom: "4px", fontWeight: 500, fontSize: "13px" }}>
              {t("modelKeywordPlaceholder") || "模型关键词"}
            </label>
            <input
              type="text"
              value={settings.modelLock?.keyword || ""}
              onChange={(e) => updateNestedSetting("modelLock", "keyword", e.target.value)}
              placeholder="例如: 2.0 Flash"
              style={{
                width: "100%",
                padding: "4px 8px",
                borderRadius: "4px",
                border: "1px solid #d1d5db",
                fontSize: "12px",
              }}
            />
          </div>
        )}
      </CollapsibleSection>

      {/* ========== 内容设置 ========== */}
      <CollapsibleSection title={t("contentExportSettingsTitle")} defaultExpanded={false}>
        <ToggleRow
          label={t("markdownFixLabel")}
          desc={t("markdownFixDesc")}
          checked={settings.markdownFix ?? true}
          onChange={() => setSettings({ ...settings, markdownFix: !settings.markdownFix })}
        />
        <ToggleRow
          label={t("clearOnSendLabel")}
          desc={t("clearOnSendDesc")}
          checked={settings.clearTextareaOnSend ?? false}
          onChange={() =>
            setSettings({ ...settings, clearTextareaOnSend: !settings.clearTextareaOnSend })
          }
        />
        <ToggleRow
          label={t("watermarkRemovalLabel") || "水印移除"}
          desc={t("watermarkRemovalDesc") || "自动移除AI生成图片的水印"}
          checked={settings.watermarkRemoval ?? true}
          onChange={() =>
            setSettings({ ...settings, watermarkRemoval: !settings.watermarkRemoval })
          }
        />
        <ToggleRow
          label={t("exportImagesToBase64Label") || "导出时图片转Base64"}
          desc={t("exportImagesToBase64Desc") || "导出会话时将图片转为Base64嵌入"}
          checked={settings.conversations?.exportImagesToBase64 ?? false}
          onChange={() =>
            updateNestedSetting(
              "conversations",
              "exportImagesToBase64",
              !settings.conversations?.exportImagesToBase64,
            )
          }
        />
        <ToggleRow
          label={t("formulaCopyLabel")}
          desc={t("formulaCopyDesc")}
          checked={settings.copy?.formulaCopyEnabled ?? true}
          onChange={() =>
            updateNestedSetting("copy", "formulaCopyEnabled", !settings.copy?.formulaCopyEnabled)
          }
        />
        <ToggleRow
          label={t("formulaDelimiterLabel")}
          desc={t("formulaDelimiterDesc")}
          checked={settings.copy?.formulaDelimiterEnabled ?? true}
          disabled={!settings.copy?.formulaCopyEnabled}
          onChange={() =>
            updateNestedSetting(
              "copy",
              "formulaDelimiterEnabled",
              !settings.copy?.formulaDelimiterEnabled,
            )
          }
        />
        <ToggleRow
          label={t("tableCopyLabel")}
          desc={t("tableCopyDesc")}
          checked={settings.copy?.tableCopyEnabled ?? true}
          onChange={() =>
            updateNestedSetting("copy", "tableCopyEnabled", !settings.copy?.tableCopyEnabled)
          }
        />
      </CollapsibleSection>
    </div>
  )
}
