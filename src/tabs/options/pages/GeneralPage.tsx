/**
 * 基本设置页面
 * 包含：面板 | 界面排版 | 快捷按钮 | 工具箱菜单
 */
import React, { useEffect, useState } from "react"

import { ReorderIcon, FloatingModeIcon, GeneralIcon, SnapToEdgeIcon } from "~components/icons"
import { Slider, Switch } from "~components/ui"
import {
  COLLAPSED_BUTTON_DEFS,
  TAB_DEFINITIONS,
  TOOLS_MENU_IDS,
  TOOLS_MENU_ITEMS,
} from "~constants"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"

import { PageTitle, SettingCard, SettingRow, TabGroup, ToggleRow } from "../components"

interface GeneralPageProps {
  siteId: string
  initialTab?: string
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
      <ReorderIcon size={16} />
    </div>

    {iconNode && <span className="settings-sortable-item-icon">{iconNode}</span>}
    <span className="settings-sortable-item-label">{label}</span>
    <div className="settings-sortable-item-actions">
      {showToggle && <Switch checked={enabled} onChange={() => onToggle?.()} size="sm" />}
    </div>
  </div>
)

const GeneralPage: React.FC<GeneralPageProps> = ({ siteId: _siteId, initialTab }) => {
  const [activeTab, setActiveTab] = useState(initialTab || "panel")
  const {
    settings,
    setSettings,
    setPreviewSettings,
    clearPreviewSettings,
    updateNestedSetting,
    updateDeepSetting,
  } = useSettingsStore()

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  // 拖拽状态
  const [draggedItem, setDraggedItem] = useState<{ type: "tab" | "button"; index: number } | null>(
    null,
  )

  const buildPanelPreview = (key: keyof typeof settings.panel, value: number) => ({
    panel: {
      ...settings.panel,
      [key]: value,
    },
  })

  // 面板设置更新函数
  const handleEdgeDistancePreview = (val: number) => {
    setPreviewSettings(buildPanelPreview("defaultEdgeDistance", val))
  }

  const handleEdgeDistanceChange = (val: number) => {
    setSettings(buildPanelPreview("defaultEdgeDistance", val))
  }

  const handleSnapThresholdPreview = (val: number) => {
    setPreviewSettings(buildPanelPreview("edgeSnapThreshold", val))
  }

  const handleSnapThresholdChange = (val: number) => {
    setSettings(buildPanelPreview("edgeSnapThreshold", val))
  }

  const handleHeightPreview = (val: number) => {
    setPreviewSettings(buildPanelPreview("height", val))
  }

  const handleHeightChange = (val: number) => {
    setSettings(buildPanelPreview("height", val))
  }

  const handleWidthPreview = (val: number) => {
    setPreviewSettings(buildPanelPreview("width", val))
  }

  const handleWidthChange = (val: number) => {
    setSettings(buildPanelPreview("width", val))
  }

  // 处理拖拽开始
  const handleDragStart = (e: React.DragEvent, type: "tab" | "button", index: number) => {
    setDraggedItem({ type, index })
    e.dataTransfer.effectAllowed = "move"
    // 必须调用 setData，部分站点在拖拽冒泡（bubbling）阶段会检测 dataTransfer 为空并取消拖拽
    e.dataTransfer.setData("text/plain", `${type}:${index}`)
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

    const newButtons = [...(settings.quickButtons?.collapsed || [])]
    const [moved] = newButtons.splice(fromIndex, 1)
    newButtons.splice(targetIndex, 0, moved)
    updateNestedSetting("quickButtons", "collapsed", newButtons)
    setDraggedItem(null)
  }

  // 处理拖拽结束
  const handleDragEnd = () => {
    setDraggedItem(null)
  }

  // 切换按钮启用状态
  const toggleButton = (index: number) => {
    const newButtons = [...(settings.quickButtons?.collapsed || [])]
    newButtons[index] = { ...newButtons[index], enabled: !newButtons[index].enabled }
    updateNestedSetting("quickButtons", "collapsed", newButtons)
  }

  if (!settings) return null

  const tabs = [
    { id: "panel", label: t("panelTab") },
    { id: "tabOrder", label: t("tabOrderTab") },
    { id: "shortcuts", label: t("shortcutsTab") },
    { id: "toolsMenu", label: t("toolboxMenu") },
  ]

  return (
    <div>
      <PageTitle title={t("navGeneral")} Icon={GeneralIcon} />
      <p className="settings-page-desc">{t("generalPageDesc")}</p>

      <TabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ========== 面板 Tab ========== */}
      {activeTab === "panel" && (
        <SettingCard title={t("panelSettings")}>
          {/* 面板模式 */}
          <SettingRow
            label={t("panelModeLabel")}
            description={t("panelModeDesc")}
            settingId="panel-mode">
            <div
              style={{
                display: "inline-flex",
                borderRadius: "6px",
                overflow: "hidden",
                border: "1px solid var(--gh-border, #e5e7eb)",
              }}>
              {(
                [
                  {
                    value: "edge-snap",
                    label: t("panelModeEdgeSnap"),
                    Icon: SnapToEdgeIcon,
                  },
                  {
                    value: "floating",
                    label: t("panelModeFloating"),
                    Icon: FloatingModeIcon,
                  },
                ] as const
              ).map((option, index) => (
                <button
                  type="button"
                  key={option.value}
                  aria-pressed={(settings.panel?.panelMode ?? "edge-snap") === option.value}
                  onClick={() => updateNestedSetting("panel", "panelMode", option.value)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "4px 12px",
                    fontSize: "13px",
                    border: "none",
                    borderLeft: index > 0 ? "1px solid var(--gh-border, #e5e7eb)" : "none",
                    cursor: "pointer",
                    background:
                      (settings.panel?.panelMode ?? "edge-snap") === option.value
                        ? "var(--gh-primary, #4285f4)"
                        : "var(--gh-bg, #fff)",
                    color:
                      (settings.panel?.panelMode ?? "edge-snap") === option.value
                        ? "#fff"
                        : "var(--gh-text-secondary, #6b7280)",
                    transition: "all 0.2s",
                  }}>
                  <option.Icon size={14} />
                  {option.label}
                </button>
              ))}
            </div>
          </SettingRow>

          {/* 默认侧边 */}
          <SettingRow
            label={t("defaultPositionLabel")}
            description={t("defaultPositionDesc")}
            settingId="panel-default-position">
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
                {t("defaultPositionLeft")}
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
                {t("defaultPositionRight")}
              </button>
            </div>
          </SettingRow>

          {/* 面板宽度 */}
          <SettingRow
            label={t("panelWidthLabel")}
            description={t("panelWidthDesc")}
            settingId="panel-width">
            <Slider
              value={Math.max(settings.panel?.width ?? 320, 240)}
              onChange={handleWidthChange}
              onPreviewChange={handleWidthPreview}
              onCancelPreview={clearPreviewSettings}
              min={240}
              max={600}
              step={10}
              unit="px"
              defaultValue={320}
              formatValue={(value) => `${value}px`}
              ariaLabel={t("panelWidthLabel")}
            />
          </SettingRow>

          {/* 面板高度 */}
          <SettingRow
            label={t("panelHeightLabel")}
            description={t("panelHeightDesc")}
            settingId="panel-height">
            <Slider
              value={settings.panel?.height ?? 85}
              onChange={handleHeightChange}
              onPreviewChange={handleHeightPreview}
              onCancelPreview={clearPreviewSettings}
              min={50}
              max={100}
              step={1}
              unit="vh"
              defaultValue={85}
              formatValue={(value) => `${value}vh`}
              ariaLabel={t("panelHeightLabel")}
            />
          </SettingRow>

          {/* 吸附触发距离 - 仅在自动吸附模式下显示 */}
          {(settings.panel?.panelMode ?? "edge-snap") === "edge-snap" && (
            <SettingRow
              label={t("edgeSnapThresholdLabel")}
              description={t("edgeSnapThresholdDesc")}
              settingId="panel-edge-snap-threshold">
              <Slider
                value={settings.panel?.edgeSnapThreshold ?? 30}
                onChange={handleSnapThresholdChange}
                onPreviewChange={handleSnapThresholdPreview}
                onCancelPreview={clearPreviewSettings}
                min={0}
                max={400}
                step={2}
                unit="px"
                defaultValue={30}
                formatValue={(value) => `${value}px`}
                ariaLabel={t("edgeSnapThresholdLabel")}
              />
            </SettingRow>
          )}

          {/* 默认边距 - 仅在悬浮模式下显示 */}
          {(settings.panel?.panelMode ?? "edge-snap") === "floating" && (
            <SettingRow
              label={t("defaultEdgeDistanceLabel")}
              description={t("defaultEdgeDistanceDesc")}
              settingId="panel-edge-distance">
              <Slider
                value={settings.panel?.defaultEdgeDistance ?? 0}
                onChange={handleEdgeDistanceChange}
                onPreviewChange={handleEdgeDistancePreview}
                onCancelPreview={clearPreviewSettings}
                min={0}
                max={400}
                step={5}
                unit="px"
                defaultValue={0}
                formatValue={(value) => `${value}px`}
                ariaLabel={t("defaultEdgeDistanceLabel")}
              />
            </SettingRow>
          )}
        </SettingCard>
      )}

      {/* ========== 界面排版 Tab ========== */}
      {activeTab === "tabOrder" && (
        <SettingCard title={t("tabOrderSettings")} description={t("tabOrderDesc")}>
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
                  label={t(def.label)}
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
        <>
          <SettingCard
            title={t("quickButtonsBehaviorTitle")}
            description={t("quickButtonsBehaviorDesc")}>
            <ToggleRow
              label={t("quickButtonsHideWhenPanelOpenLabel")}
              description={t("quickButtonsHideWhenPanelOpenDesc")}
              settingId="quick-buttons-hide-when-panel-open"
              checked={settings.quickButtons?.hideWhenPanelOpen ?? false}
              onChange={() =>
                updateNestedSetting(
                  "quickButtons",
                  "hideWhenPanelOpen",
                  !(settings.quickButtons?.hideWhenPanelOpen ?? false),
                )
              }
            />
            <SettingRow
              label={t("quickButtonsProximityRadiusLabel")}
              description={t("quickButtonsProximityRadiusDesc")}
              settingId="quick-buttons-proximity-radius">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="range"
                  min="0"
                  max="300"
                  step="10"
                  value={settings.quickButtons?.proximityRadius ?? 150}
                  onChange={(e) =>
                    updateNestedSetting(
                      "quickButtons",
                      "proximityRadius",
                      parseInt(e.target.value, 10),
                    )
                  }
                  style={{ width: "120px" }}
                />
                <span style={{ fontSize: "12px", minWidth: "36px" }}>
                  {settings.quickButtons?.proximityRadius ?? 150}px
                </span>
              </div>
            </SettingRow>
            <SettingRow
              label={t("quickButtonsOpacityLabel")}
              description={t("quickButtonsOpacityDesc")}
              settingId="quick-buttons-opacity">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="range"
                  min="0.4"
                  max="1"
                  step="0.05"
                  value={settings.quickButtons?.opacity ?? 1}
                  onChange={(e) =>
                    updateNestedSetting("quickButtons", "opacity", parseFloat(e.target.value))
                  }
                  style={{ width: "120px" }}
                />
                <span style={{ fontSize: "12px", minWidth: "36px" }}>
                  {Math.round((settings.quickButtons?.opacity ?? 1) * 100)}%
                </span>
              </div>
            </SettingRow>
          </SettingCard>
          <SettingCard
            title={t("collapsedButtonsOrderTitle")}
            description={t("collapsedButtonsOrderDesc")}>
            {settings.quickButtons?.collapsed?.map((btn, index) => {
              // 暂时隐藏"手动锚点"设置项，避免对用户造成困扰
              if (btn.id === "manualAnchor") return null
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
                  label={t(def.labelKey)}
                  index={index}
                  total={settings.quickButtons.collapsed.length}
                  enabled={btn.enabled}
                  showToggle={def.canToggle}
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

      {/* ========== 工具箱菜单 Tab ========== */}
      {activeTab === "toolsMenu" && (
        <SettingCard title={t("toolboxMenuTitle")} description={t("toolboxMenuDesc")}>
          {TOOLS_MENU_ITEMS.filter((item) => item.id !== TOOLS_MENU_IDS.SETTINGS).map((item) => {
            const enabledIds = settings.quickButtons?.toolsMenu ?? TOOLS_MENU_ITEMS.map((i) => i.id)
            const isEnabled = enabledIds.includes(item.id)
            return (
              <ToggleRow
                key={item.id}
                label={t(item.labelKey)}
                settingId={`tools-menu-${item.id}`}
                checked={isEnabled}
                onChange={() => {
                  const currentIds =
                    settings.quickButtons?.toolsMenu ?? TOOLS_MENU_ITEMS.map((i) => i.id)
                  const newIds = isEnabled
                    ? currentIds.filter((id) => id !== item.id)
                    : [...currentIds, item.id]
                  updateNestedSetting("quickButtons", "toolsMenu", newIds)
                }}
              />
            )
          })}
        </SettingCard>
      )}
    </div>
  )
}

export default GeneralPage
