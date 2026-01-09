/**
 * 基本设置页面
 * 包含：通用设置 | 标签页设置
 */
import React, { useCallback, useRef, useState } from "react"

import { DragIcon, GeneralIcon } from "~components/icons"
import { Switch } from "~components/ui"
import { COLLAPSED_BUTTON_DEFS, TAB_DEFINITIONS } from "~constants"
import { useSettingsStore } from "~stores/settings-store"
import { setLanguage, t } from "~utils/i18n"

import { PageTitle, SettingCard, SettingRow, TabGroup, ToggleRow } from "../components"

interface GeneralPageProps {
  siteId: string
}

// 可排序项目组件
const SortableItem: React.FC<{
  iconNode?: React.ReactNode
  label: string
  index: number
  total: number
  enabled?: boolean
  showToggle?: boolean
  onToggle?: () => void
  onDragStart: (e: React.DragEvent, index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDragEnd?: () => void
  onDrop: (e: React.DragEvent, index: number) => void
  isDragging?: boolean
}> = ({
  iconNode,
  label,
  index,
  total,
  enabled = true,
  showToggle = false,
  onToggle,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragging = false,
}) => (
  <div
    className={`settings-sortable-item ${isDragging ? "dragging" : ""}`}
    draggable
    onDragStart={(e) => onDragStart(e, index)}
    onDragOver={(e) => onDragOver(e, index)}
    onDragEnd={onDragEnd}
    onDrop={(e) => onDrop(e, index)}
    style={{
      opacity: isDragging ? 0.4 : 1,
      cursor: "grab",
      border: isDragging ? "1px dashed var(--gh-primary)" : undefined,
    }}>
    {/* 拖拽手柄 */}
    <div
      className="settings-sortable-handle"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4px 8px 4px 0",
        cursor: "grab",
        color: "var(--gh-text-secondary, #9ca3af)",
      }}>
      <DragIcon size={16} />
    </div>

    {iconNode && <span className="settings-sortable-item-icon">{iconNode}</span>}
    <span className="settings-sortable-item-label">{label}</span>
    <div className="settings-sortable-item-actions">
      {showToggle && <Switch checked={enabled} onChange={() => onToggle?.()} size="sm" />}
    </div>
  </div>
)

const GeneralPage: React.FC<GeneralPageProps> = ({ siteId }) => {
  const [activeTab, setActiveTab] = useState("general")
  const { settings, setSettings, updateNestedSetting, updateDeepSetting } = useSettingsStore()

  // 拖拽状态
  const [draggedItem, setDraggedItem] = useState<{ type: "tab" | "button"; index: number } | null>(
    null,
  )

  // 处理拖拽开始
  const handleDragStart = (e: React.DragEvent, type: "tab" | "button", index: number) => {
    setDraggedItem({ type, index })
    e.dataTransfer.effectAllowed = "move"
    // 设置拖拽图像，避免默认的大片白色背景（可选，视浏览器表现而定）
  }

  // 处理拖拽经过（需要阻止默认行为以允许放置）
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  // 处理拖拽结束（清理状态）
  const handleDragEnd = () => {
    setDraggedItem(null)
  }

  // 处理放置 - Tab 排序
  const handleTabDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (!settings || !draggedItem || draggedItem.type !== "tab") return
    if (draggedItem.index === targetIndex) return

    const newOrder = [...(settings.features?.order || [])]
    const [movedItem] = newOrder.splice(draggedItem.index, 1)
    newOrder.splice(targetIndex, 0, movedItem)

    updateNestedSetting("features", "order", newOrder)
    setDraggedItem(null)
  }

  // 处理放置 - 按钮排序
  const handleButtonDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (!settings || !draggedItem || draggedItem.type !== "button") return
    if (draggedItem.index === targetIndex) return

    const newOrder = [...(settings.collapsedButtons || [])]
    const [movedItem] = newOrder.splice(draggedItem.index, 1)
    newOrder.splice(targetIndex, 0, movedItem)

    setSettings({ collapsedButtons: newOrder })
    setDraggedItem(null)
  }

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
      <PageTitle title={t("navGeneral") || "基本设置"} Icon={GeneralIcon} />
      <p className="settings-page-desc">{t("generalPageDesc") || "配置扩展的基本行为和界面"}</p>

      <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "general" && (
        <>
          {/* 通用设置卡片 */}
          <SettingCard title={t("generalSettings") || "通用设置"}>
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

            {/* 默认位置 */}
            <SettingRow
              label={t("defaultPositionLabel") || "默认位置"}
              description={t("defaultPositionDesc") || "页面刷新后面板显示在哪一侧"}>
              <div
                style={{
                  display: "inline-flex",
                  borderRadius: "6px",
                  overflow: "hidden",
                  border: "1px solid var(--gh-border, #e5e7eb)",
                }}>
                <button
                  onClick={() => updateNestedSetting("panel", "defaultPosition", "left")}
                  style={{
                    padding: "4px 12px",
                    fontSize: "13px",
                    border: "none",
                    cursor: "pointer",
                    background:
                      (settings.panel?.defaultPosition || "right") === "left"
                        ? "var(--gh-primary, #4285f4)"
                        : "var(--gh-bg, #fff)",
                    color:
                      (settings.panel?.defaultPosition || "right") === "left"
                        ? "#fff"
                        : "var(--gh-text-secondary, #6b7280)",
                    transition: "all 0.2s",
                  }}>
                  {t("defaultPositionLeft") || "左侧"}
                </button>
                <button
                  onClick={() => updateNestedSetting("panel", "defaultPosition", "right")}
                  style={{
                    padding: "4px 12px",
                    fontSize: "13px",
                    border: "none",
                    borderLeft: "1px solid var(--gh-border, #e5e7eb)",
                    cursor: "pointer",
                    background:
                      (settings.panel?.defaultPosition || "right") === "right"
                        ? "var(--gh-primary, #4285f4)"
                        : "var(--gh-bg, #fff)",
                    color:
                      (settings.panel?.defaultPosition || "right") === "right"
                        ? "#fff"
                        : "var(--gh-text-secondary, #6b7280)",
                    transition: "all 0.2s",
                  }}>
                  {t("defaultPositionRight") || "右侧"}
                </button>
              </div>
            </SettingRow>

            {/* 默认边距 */}
            <SettingRow
              label={t("defaultEdgeDistanceLabel") || "默认边距"}
              description={t("defaultEdgeDistanceDesc") || "面板距离屏幕边缘的初始距离"}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <input
                  type="number"
                  className="settings-input"
                  value={settings.panel?.defaultEdgeDistance ?? 20}
                  min={0}
                  max={200}
                  style={{ width: "70px" }}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0
                    const clamped = Math.max(0, Math.min(200, val))
                    updateNestedSetting("panel", "defaultEdgeDistance", clamped)
                  }}
                />
                <span style={{ fontSize: "13px", color: "var(--gh-text-secondary)" }}>px</span>
              </div>
            </SettingRow>

            <ToggleRow
              label={t("edgeSnapHideLabel") || "边缘吸附隐藏"}
              description={t("edgeSnapHideDesc") || "拖动面板到屏幕边缘时自动隐藏"}
              checked={settings.panel?.edgeSnap ?? false}
              onChange={() => updateNestedSetting("panel", "edgeSnap", !settings.panel?.edgeSnap)}
            />

            {/* 吸附触发距离 */}
            <SettingRow
              label={t("edgeSnapThresholdLabel") || "吸附触发距离"}
              description={t("edgeSnapThresholdDesc") || "拖拽面板到边缘多近时触发吸附"}
              disabled={!settings.panel?.edgeSnap}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <input
                  type="number"
                  className="settings-input"
                  value={settings.panel?.edgeSnapThreshold ?? 30}
                  min={10}
                  max={100}
                  disabled={!settings.panel?.edgeSnap}
                  style={{ width: "70px" }}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 30
                    const clamped = Math.max(10, Math.min(100, val))
                    updateNestedSetting("panel", "edgeSnapThreshold", clamped)
                  }}
                />
                <span style={{ fontSize: "13px", color: "var(--gh-text-secondary)" }}>px</span>
              </div>
            </SettingRow>
          </SettingCard>

          {/* 界面排版卡片 */}
          <SettingCard
            title={t("tabOrderSettings") || "界面排版"}
            description={t("tabOrderDesc") || "调整面板标签页的显示顺序 (拖拽排序)"}>
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
                    iconNode={
                      def.IconComponent ? (
                        <def.IconComponent size={18} color="currentColor" />
                      ) : (
                        def.icon
                      )
                    }
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
                    onDragStart={(e) => handleDragStart(e, "tab", index)}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    onDrop={handleTabDrop}
                    isDragging={draggedItem?.type === "tab" && draggedItem?.index === index}
                  />
                )
              })}
          </SettingCard>

          {/* 快捷按钮排序卡片 */}
          <SettingCard
            title={t("collapsedButtonsOrderTitle") || "快捷按钮组"}
            description={t("collapsedButtonsOrderDesc") || "快捷按钮组排序与启用 (拖拽排序)"}>
            {settings.collapsedButtons?.map((btn, index) => {
              const def = COLLAPSED_BUTTON_DEFS[btn.id]
              if (!def) return null
              return (
                <SortableItem
                  key={btn.id}
                  iconNode={
                    def.IconComponent ? (
                      <def.IconComponent size={18} color="currentColor" />
                    ) : (
                      def.icon
                    )
                  }
                  label={t(def.labelKey) || btn.id}
                  index={index}
                  total={settings.collapsedButtons.length}
                  enabled={btn.enabled}
                  showToggle={["anchor", "theme", "manualAnchor"].includes(btn.id)}
                  onToggle={() => toggleButton(index)}
                  onDragStart={(e) => handleDragStart(e, "button", index)}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onDrop={handleButtonDrop}
                  isDragging={draggedItem?.type === "button" && draggedItem?.index === index}
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
