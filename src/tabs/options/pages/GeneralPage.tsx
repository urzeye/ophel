/**
 * 基本设置页面
 * 包含：面板 | 界面排版 | 快捷按钮 | 宽度布局
 */
import React, { useState } from "react"

import { DragIcon, GeneralIcon } from "~components/icons"
import { NumberInput, Switch } from "~components/ui"
import { COLLAPSED_BUTTON_DEFS, TAB_DEFINITIONS } from "~constants"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import { showToastThrottled } from "~utils/toast"

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
  total: _total,
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

const GeneralPage: React.FC<GeneralPageProps> = ({ siteId: _siteId }) => {
  const [activeTab, setActiveTab] = useState("panel")
  const { settings, setSettings, updateNestedSetting, updateDeepSetting } = useSettingsStore()

  const prerequisiteToastTemplate = t("enablePrerequisiteToast") || "请先开启「{setting}」"
  const showPrerequisiteToast = (label: string) =>
    showToastThrottled(prerequisiteToastTemplate.replace("{setting}", label), 2000, {}, 1500, label)
  const edgeSnapLabel = t("edgeSnapHideLabel") || "边缘自动吸附"

  // 拖拽状态
  const [draggedItem, setDraggedItem] = useState<{ type: "tab" | "button"; index: number } | null>(
    null,
  )

  // 面板设置更新函数
  const handleEdgeDistanceChange = (val: number) => {
    updateNestedSetting("panel", "defaultEdgeDistance", val)
  }

  const handleSnapThresholdChange = (val: number) => {
    updateNestedSetting("panel", "edgeSnapThreshold", val)
  }

  const handleHeightChange = (val: number) => {
    updateNestedSetting("panel", "height", val)
  }

  const handleWidthChange = (val: number) => {
    updateNestedSetting("panel", "width", val)
  }

  // 处理拖拽开始
  const handleDragStart = (e: React.DragEvent, type: "tab" | "button", index: number) => {
    setDraggedItem({ type, index })
    e.dataTransfer.effectAllowed = "move"
  }

  // 处理拖拽经过
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  // 处理放置 - Tab 排序
  const handleTabDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (!draggedItem || draggedItem.type !== "tab") return
    const fromIndex = draggedItem.index
    if (fromIndex === targetIndex) return

    const newOrder = [...(settings.features?.order || [])]
    const [moved] = newOrder.splice(fromIndex, 1)
    newOrder.splice(targetIndex, 0, moved)
    updateNestedSetting("features", "order", newOrder)
    setDraggedItem(null)
  }

  // 处理放置 - 按钮排序
  const handleButtonDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (!draggedItem || draggedItem.type !== "button") return
    const fromIndex = draggedItem.index
    if (fromIndex === targetIndex) return

    const newButtons = [...(settings.collapsedButtons || [])]
    const [moved] = newButtons.splice(fromIndex, 1)
    newButtons.splice(targetIndex, 0, moved)
    setSettings({ collapsedButtons: newButtons })
    setDraggedItem(null)
  }

  // 处理拖拽结束
  const handleDragEnd = () => {
    setDraggedItem(null)
  }

  // 切换按钮启用状态
  const toggleButton = (index: number) => {
    const newButtons = [...(settings.collapsedButtons || [])]
    newButtons[index] = { ...newButtons[index], enabled: !newButtons[index].enabled }
    setSettings({ collapsedButtons: newButtons })
  }

  if (!settings) return null

  const tabs = [
    { id: "panel", label: t("panelTab") || "面板" },
    { id: "tabOrder", label: t("tabOrderTab") || "界面排版" },
    { id: "shortcuts", label: t("shortcutsTab") || "快捷按钮" },
  ]

  return (
    <div>
      <PageTitle title={t("navGeneral") || "基本设置"} Icon={GeneralIcon} />
      <p className="settings-page-desc">{t("generalPageDesc") || "配置扩展的基本行为和界面"}</p>

      <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ========== 面板 Tab ========== */}
      {activeTab === "panel" && (
        <SettingCard title={t("panelSettings") || "面板设置"}>
          <ToggleRow
            label={t("defaultPanelStateLabel") || "默认显示面板"}
            description={t("defaultPanelStateDesc") || "页面加载后自动展开面板"}
            checked={settings.panel?.defaultOpen ?? false}
            onChange={() =>
              updateNestedSetting("panel", "defaultOpen", !settings.panel?.defaultOpen)
            }
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
              <NumberInput
                value={settings.panel?.defaultEdgeDistance ?? 25}
                onChange={handleEdgeDistanceChange}
                min={0}
                max={400}
                defaultValue={25}
                style={{ width: "85px" }}
              />
              <span style={{ fontSize: "13px", color: "var(--gh-text-secondary)" }}>px</span>
            </div>
          </SettingRow>

          {/* 面板宽度 */}
          <SettingRow
            label={t("panelWidthLabel") || "面板宽度"}
            description={t("panelWidthDesc") || "面板的宽度 (px)"}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <NumberInput
                value={settings.panel?.width ?? 320}
                onChange={handleWidthChange}
                min={200}
                max={600}
                defaultValue={320}
                style={{ width: "85px" }}
              />
              <span style={{ fontSize: "13px", color: "var(--gh-text-secondary)" }}>px</span>
            </div>
          </SettingRow>

          {/* 面板高度 */}
          <SettingRow
            label={t("panelHeightLabel") || "面板高度"}
            description={t("panelHeightDesc") || "面板占用屏幕高度的百分比"}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <NumberInput
                value={settings.panel?.height ?? 85}
                onChange={handleHeightChange}
                min={50}
                max={100}
                defaultValue={85}
                style={{ width: "85px" }}
              />
              <span style={{ fontSize: "13px", color: "var(--gh-text-secondary)" }}>vh</span>
            </div>
          </SettingRow>

          <ToggleRow
            label={t("edgeSnapHideLabel") || "边缘自动吸附"}
            description={t("edgeSnapHideDesc") || "拖动面板到屏幕边缘时自动吸附，悬停显示"}
            checked={settings.panel?.edgeSnap ?? false}
            onChange={() => updateNestedSetting("panel", "edgeSnap", !settings.panel?.edgeSnap)}
          />

          {/* 吸附触发距离 */}
          <SettingRow
            label={t("edgeSnapThresholdLabel") || "吸附触发距离"}
            description={t("edgeSnapThresholdDesc") || "拖拽面板到边缘多近时触发吸附"}
            disabled={!settings.panel?.edgeSnap}
            onDisabledClick={() => showPrerequisiteToast(edgeSnapLabel)}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <NumberInput
                value={settings.panel?.edgeSnapThreshold ?? 18}
                onChange={handleSnapThresholdChange}
                min={0}
                max={400}
                defaultValue={18}
                disabled={!settings.panel?.edgeSnap}
                style={{ width: "85px" }}
              />
              <span style={{ fontSize: "13px", color: "var(--gh-text-secondary)" }}>px</span>
            </div>
          </SettingRow>

          <ToggleRow
            label={t("autoHidePanelLabel") || "点击外部收起"}
            description={
              settings.panel?.edgeSnap
                ? t("autoHidePanelDescEdgeSnap") || "点击面板外部区域时自动缩回边缘"
                : t("autoHidePanelDesc") || "点击面板外部区域时自动收起为悬浮球"
            }
            checked={settings.panel?.autoHide ?? false}
            onChange={() => updateNestedSetting("panel", "autoHide", !settings.panel?.autoHide)}
          />
        </SettingCard>
      )}

      {/* ========== 界面排版 Tab ========== */}
      {activeTab === "tabOrder" && (
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
      )}

      {/* ========== 快捷按钮 Tab ========== */}
      {activeTab === "shortcuts" && (
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
          <SettingRow
            label={t("quickButtonsOpacityLabel") || "快捷按钮透明度"}
            description={t("quickButtonsOpacityDesc") || "调整快捷按钮组整体透明度"}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="range"
                min="0.4"
                max="1"
                step="0.05"
                value={settings.quickButtonsOpacity ?? 1}
                onChange={(e) => setSettings({ quickButtonsOpacity: parseFloat(e.target.value) })}
                style={{ width: "120px" }}
              />
              <span style={{ fontSize: "12px", minWidth: "36px" }}>
                {Math.round((settings.quickButtonsOpacity ?? 1) * 100)}%
              </span>
            </div>
          </SettingRow>
        </SettingCard>
      )}
    </div>
  )
}

export default GeneralPage
