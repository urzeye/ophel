/**
 * 基本设置页面
 * 包含：面板 | 界面排版 | 快捷按钮 | 工具箱菜单
 */
import React, { useEffect, useState } from "react"

import {
  ChevronDownIcon,
  ReorderIcon,
  FloatingModeIcon,
  GeneralIcon,
  SnapToEdgeIcon,
} from "~components/icons"
import { Slider, Switch } from "~components/ui"
import {
  COLLAPSED_BUTTON_DEFS,
  TAB_DEFINITIONS,
  TOOLS_MENU_IDS,
  TOOLS_MENU_ITEMS,
  getDefaultToolsMenuIds,
} from "~constants"
import { DEFAULT_SETTINGS } from "~constants/default-settings"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import { showToast } from "~utils/toast"

import { PageTitle, SettingCard, SettingRow, TabGroup, ToggleRow } from "../components"

interface GeneralPageProps {
  siteId: string
  initialTab?: string
  locateSettingId?: string
  onPanelHoverWidthPreviewChange?: (isActive: boolean) => void
}

const PANEL_MODE_ADVANCED_SETTING_IDS = new Set(["panel-edge-trigger-mode"])
const PANEL_WIDTH_ADVANCED_SETTING_IDS = new Set(["panel-resize-on-hover", "panel-hover-width"])

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
  dropPosition?: "before" | "after" | null
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
  dropPosition = null,
}) => (
  <div
    className={`settings-sortable-item ${isDragging ? "is-dragging" : ""} ${
      dropPosition === "before" ? "drop-above" : dropPosition === "after" ? "drop-below" : ""
    }`}
    draggable
    onDragStart={(e) => onDragStart(e, index)}
    onDragOver={(e) => onDragOver(e, index)}
    onDragEnd={onDragEnd}
    onDrop={(e) => onDrop(e, index)}>
    {/* 拖拽手柄 */}
    <div className="settings-sortable-handle">
      <ReorderIcon size={16} />
    </div>

    {iconNode && <span className="settings-sortable-item-icon">{iconNode}</span>}
    <span className="settings-sortable-item-label">{label}</span>
    <div className="settings-sortable-item-actions">
      {showToggle && <Switch checked={enabled} onChange={() => onToggle?.()} size="sm" />}
    </div>
  </div>
)

const GeneralPage: React.FC<GeneralPageProps> = ({
  siteId: _siteId,
  initialTab,
  locateSettingId,
  onPanelHoverWidthPreviewChange,
}) => {
  const [activeTab, setActiveTab] = useState(initialTab || "panel")
  const [isPanelModeAdvancedOpen, setIsPanelModeAdvancedOpen] = useState(false)
  const [isPanelWidthAdvancedOpen, setIsPanelWidthAdvancedOpen] = useState(false)
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

  useEffect(
    () => () => {
      onPanelHoverWidthPreviewChange?.(false)
    },
    [onPanelHoverWidthPreviewChange],
  )

  // 拖拽状态
  const [draggedItem, setDraggedItem] = useState<{ type: "tab" | "button"; index: number } | null>(
    null,
  )
  // 拖拽落点提示（目标项 + 插入到其上方/下方）
  const [dropTarget, setDropTarget] = useState<{
    type: "tab" | "button"
    index: number
    position: "before" | "after"
  } | null>(null)

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

  const handleHoverWidthPreview = (val: number) => {
    setPreviewSettings(buildPanelPreview("hoverWidth", val))
  }

  const handleHoverWidthChange = (val: number) => {
    setSettings(buildPanelPreview("hoverWidth", val))
  }

  // 拖动快捷按钮组滑块时实时预览，松手后再写入设置
  const handleQuickButtonsPreview = (key: "proximityRadius" | "opacity", value: number) => {
    setPreviewSettings({ quickButtons: { ...settings.quickButtons, [key]: value } })
  }

  const activateHoverWidthPreview = () => {
    if (!isHoverResizeEnabled) {
      return
    }

    onPanelHoverWidthPreviewChange?.(true)
  }

  const deactivateHoverWidthPreview = () => {
    onPanelHoverWidthPreviewChange?.(false)
  }

  const handleHoverWidthPreviewBlur: React.FocusEventHandler<HTMLDivElement> = (event) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return
    }

    deactivateHoverWidthPreview()
  }

  const isFloatingPanelMode = (settings?.panel?.panelMode ?? "floating") === "floating"
  const isEdgeSnapPanelMode = (settings?.panel?.panelMode ?? "floating") === "edge-snap"
  const isPanelModeAdvancedVisible = isEdgeSnapPanelMode && isPanelModeAdvancedOpen
  const isHoverResizeEnabled = settings?.panel?.resizeOnHover ?? false

  useEffect(() => {
    if (!locateSettingId) {
      return
    }

    if (PANEL_MODE_ADVANCED_SETTING_IDS.has(locateSettingId)) {
      setActiveTab("panel")

      if (isEdgeSnapPanelMode) {
        setIsPanelModeAdvancedOpen(true)
      }

      return
    }

    if (!PANEL_WIDTH_ADVANCED_SETTING_IDS.has(locateSettingId)) {
      return
    }

    setActiveTab("panel")

    if (isFloatingPanelMode) {
      setIsPanelWidthAdvancedOpen(true)
    }
  }, [isEdgeSnapPanelMode, isFloatingPanelMode, locateSettingId])

  useEffect(() => {
    if (!isEdgeSnapPanelMode) {
      setIsPanelModeAdvancedOpen(false)
    }
  }, [isEdgeSnapPanelMode])

  useEffect(() => {
    if (
      activeTab === "panel" &&
      isFloatingPanelMode &&
      isPanelWidthAdvancedOpen &&
      isHoverResizeEnabled
    ) {
      return
    }

    onPanelHoverWidthPreviewChange?.(false)
  }, [
    activeTab,
    isFloatingPanelMode,
    isHoverResizeEnabled,
    isPanelWidthAdvancedOpen,
    onPanelHoverWidthPreviewChange,
  ])

  // 处理拖拽开始
  const handleDragStart = (e: React.DragEvent, type: "tab" | "button", index: number) => {
    setDraggedItem({ type, index })
    e.dataTransfer.effectAllowed = "move"
    // 必须调用 setData，部分站点在拖拽冒泡（bubbling）阶段会检测 dataTransfer 为空并取消拖拽
    e.dataTransfer.setData("text/plain", `${type}:${index}`)
  }

  // 按光标在目标项的上/下半区判定插入位置
  const getDropPosition = (e: React.DragEvent): "before" | "after" => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return e.clientY < rect.top + rect.height / 2 ? "before" : "after"
  }

  // 处理拖拽经过
  const handleDragOver = (e: React.DragEvent, type: "tab" | "button", index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"

    if (!draggedItem || draggedItem.type !== type || draggedItem.index === index) {
      if (dropTarget) setDropTarget(null)
      return
    }

    const position = getDropPosition(e)
    if (
      dropTarget?.type !== type ||
      dropTarget.index !== index ||
      dropTarget.position !== position
    ) {
      setDropTarget({ type, index, position })
    }
  }

  // 处理放置 - Tab 排序
  const handleTabDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (!draggedItem || draggedItem.type !== "tab") return
    const fromIndex = draggedItem.index
    if (fromIndex === targetIndex) {
      setDraggedItem(null)
      setDropTarget(null)
      return
    }

    const newOrder = [...(settings.features?.order || DEFAULT_SETTINGS.features.order)]
    const [moved] = newOrder.splice(fromIndex, 1)
    let insertIndex = targetIndex
    if (fromIndex < insertIndex) insertIndex--
    if (getDropPosition(e) === "after") insertIndex++
    newOrder.splice(insertIndex, 0, moved)
    updateNestedSetting("features", "order", newOrder)
    setDraggedItem(null)
    setDropTarget(null)
  }

  // 处理放置 - 按钮排序
  const handleButtonDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (!draggedItem || draggedItem.type !== "button") return
    const fromIndex = draggedItem.index
    if (fromIndex === targetIndex) {
      setDraggedItem(null)
      setDropTarget(null)
      return
    }

    const newButtons = [...(settings.quickButtons?.collapsed || [])]
    const [moved] = newButtons.splice(fromIndex, 1)
    let insertIndex = targetIndex
    if (fromIndex < insertIndex) insertIndex--
    if (getDropPosition(e) === "after") insertIndex++
    newButtons.splice(insertIndex, 0, moved)
    updateNestedSetting("quickButtons", "collapsed", newButtons)
    setDraggedItem(null)
    setDropTarget(null)
  }

  // 处理拖拽结束
  const handleDragEnd = () => {
    setDraggedItem(null)
    setDropTarget(null)
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
        // 卡片标题与当前分段“面板”同名，省掉一层重复标题；全局搜索仍按 settingId 定位到这张卡片
        <SettingCard settingId="panel-settings-card">
          {/* 面板模式 */}
          <div
            className={`settings-panel-mode-accordion ${isPanelModeAdvancedVisible ? "open" : ""}`}
            data-setting-id="panel-mode">
            <div className="settings-row settings-panel-mode-main">
              {isEdgeSnapPanelMode ? (
                <button
                  type="button"
                  className="settings-panel-mode-trigger"
                  aria-expanded={isPanelModeAdvancedVisible}
                  aria-controls="settings-panel-mode-advanced"
                  onClick={() => setIsPanelModeAdvancedOpen((value) => !value)}>
                  <div className="settings-row-info">
                    <div className="settings-row-label settings-panel-mode-label">
                      <span>{t("panelModeLabel")}</span>
                      <span className="settings-panel-mode-disclosure" aria-hidden="true">
                        <ChevronDownIcon size={14} className="settings-panel-mode-icon" />
                      </span>
                    </div>
                    <div className="settings-row-desc">{t("panelModeDesc")}</div>
                  </div>
                </button>
              ) : (
                <div className="settings-panel-mode-trigger settings-panel-mode-trigger-static">
                  <div className="settings-row-info">
                    <div className="settings-row-label settings-panel-mode-label">
                      <span>{t("panelModeLabel")}</span>
                    </div>
                    <div className="settings-row-desc">{t("panelModeDesc")}</div>
                  </div>
                </div>
              )}
              <div className="settings-segmented">
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
                ).map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className="settings-segmented-item"
                    aria-pressed={(settings.panel?.panelMode ?? "floating") === option.value}
                    onClick={() => updateNestedSetting("panel", "panelMode", option.value)}>
                    <option.Icon size={14} />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {isPanelModeAdvancedVisible && (
              <div id="settings-panel-mode-advanced" className="settings-panel-mode-body">
                <div
                  className="settings-panel-mode-subrow"
                  data-setting-id="panel-edge-trigger-mode">
                  <div className="settings-row-info">
                    <div className="settings-row-label">{t("edgeTriggerModeLabel")}</div>
                    <div className="settings-row-desc">{t("edgeTriggerModeDesc")}</div>
                  </div>
                  <div className="settings-segmented">
                    {(
                      [
                        { value: "handle", label: t("edgeTriggerModeHandle") },
                        { value: "hidden", label: t("edgeTriggerModeHidden") },
                      ] as const
                    ).map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        className="settings-segmented-item"
                        aria-pressed={
                          (settings.panel?.edgeTriggerMode ?? "handle") === option.value
                        }
                        onClick={() =>
                          updateNestedSetting("panel", "edgeTriggerMode", option.value)
                        }>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 默认侧边 */}
          <SettingRow
            label={t("defaultPositionLabel")}
            description={t("defaultPositionDesc")}
            settingId="panel-default-position">
            <div className="settings-segmented">
              <button
                type="button"
                className="settings-segmented-item"
                aria-pressed={(settings.panel?.defaultPosition || "right") === "left"}
                onClick={() => updateNestedSetting("panel", "defaultPosition", "left")}>
                {t("defaultPositionLeft")}
              </button>
              <button
                type="button"
                className="settings-segmented-item"
                aria-pressed={(settings.panel?.defaultPosition || "right") === "right"}
                onClick={() => updateNestedSetting("panel", "defaultPosition", "right")}>
                {t("defaultPositionRight")}
              </button>
            </div>
          </SettingRow>

          {/* 面板宽度 */}
          {isFloatingPanelMode ? (
            <div
              className={`settings-panel-width-accordion ${isPanelWidthAdvancedOpen ? "open" : ""}`}
              data-setting-id="panel-width">
              <div className="settings-row settings-panel-width-main">
                <button
                  type="button"
                  className="settings-panel-width-trigger"
                  aria-expanded={isPanelWidthAdvancedOpen}
                  aria-controls="settings-panel-width-advanced"
                  onClick={() => setIsPanelWidthAdvancedOpen((value) => !value)}>
                  <div className="settings-row-info">
                    <div className="settings-row-label settings-panel-width-label">
                      <span>{t("panelWidthLabel")}</span>
                      <span className="settings-panel-width-disclosure" aria-hidden="true">
                        <ChevronDownIcon size={14} className="settings-panel-width-icon" />
                      </span>
                    </div>
                    <div className="settings-row-desc">{t("panelWidthDesc")}</div>
                  </div>
                </button>
                <div className="settings-row-control">
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
                </div>
              </div>

              {isPanelWidthAdvancedOpen && (
                <div id="settings-panel-width-advanced" className="settings-panel-width-body">
                  <div
                    className="settings-panel-width-subrow"
                    data-setting-id="panel-resize-on-hover">
                    <div className="settings-row-info">
                      <div className="settings-row-label settings-row-label-with-badge">
                        <span>{t("panelResizeOnHoverLabel")}</span>
                        <span className="settings-beta-badge">{t("betaBadge")}</span>
                      </div>
                      <div className="settings-row-desc">{t("panelResizeOnHoverDesc")}</div>
                    </div>
                    <Switch
                      checked={isHoverResizeEnabled}
                      onChange={() =>
                        updateNestedSetting("panel", "resizeOnHover", !isHoverResizeEnabled)
                      }
                    />
                  </div>

                  <div
                    className={`settings-panel-width-subrow ${isHoverResizeEnabled ? "" : "disabled"}`.trim()}
                    data-setting-id="panel-hover-width"
                    aria-disabled={!isHoverResizeEnabled}
                    onMouseEnter={activateHoverWidthPreview}
                    onMouseLeave={deactivateHoverWidthPreview}
                    onFocus={activateHoverWidthPreview}
                    onBlur={handleHoverWidthPreviewBlur}>
                    <div className="settings-row-info">
                      <div className="settings-row-label settings-row-label-with-badge">
                        <span>{t("panelHoverWidthLabel")}</span>
                        <span className="settings-beta-badge">{t("betaBadge")}</span>
                      </div>
                      <div className="settings-row-desc">{t("panelHoverWidthDesc")}</div>
                    </div>
                    <div className="settings-row-control">
                      <Slider
                        value={Math.max(
                          settings.panel?.hoverWidth ?? 520,
                          settings.panel?.width ?? 320,
                          240,
                        )}
                        onChange={handleHoverWidthChange}
                        onPreviewChange={handleHoverWidthPreview}
                        onCancelPreview={clearPreviewSettings}
                        min={240}
                        max={600}
                        step={10}
                        unit="px"
                        defaultValue={520}
                        disabled={!isHoverResizeEnabled}
                        formatValue={(value) => `${value}px`}
                        ariaLabel={t("panelHoverWidthLabel")}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
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
          )}

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
          {(settings.panel?.panelMode ?? "floating") === "edge-snap" && (
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
          {(settings.panel?.panelMode ?? "floating") === "floating" && (
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
      {activeTab === "tabOrder" &&
        (() => {
          const orderList = (settings.features?.order || DEFAULT_SETTINGS.features.order).filter(
            (id) => TAB_DEFINITIONS[id],
          )
          const isTabEnabled = (id: string) => {
            if (id === "prompts") return settings.features?.prompts?.enabled !== false
            if (id === "outline") return settings.features?.outline?.enabled !== false
            if (id === "conversations") return settings.features?.conversations?.enabled !== false
            return false
          }
          const enabledTabsCount = orderList.filter((id) => isTabEnabled(id)).length

          return (
            <SettingCard
              title={t("tabOrderSettings")}
              description={t("tabOrderDesc")}
              settingId="tab-order-card">
              {orderList.map((tabId, index) => {
                const def = TAB_DEFINITIONS[tabId]
                const isEnabled = isTabEnabled(tabId)
                const isOnlyEnabled = isEnabled && enabledTabsCount <= 1

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
                    total={orderList.length}
                    enabled={isEnabled}
                    showToggle
                    onToggle={() => {
                      if (isOnlyEnabled) {
                        showToast(t("tabOrderAtLeastOne"))
                        return
                      }
                      if (tabId === "prompts")
                        updateDeepSetting("features", "prompts", "enabled", !isEnabled)
                      else if (tabId === "outline")
                        updateDeepSetting("features", "outline", "enabled", !isEnabled)
                      else if (tabId === "conversations")
                        updateDeepSetting("features", "conversations", "enabled", !isEnabled)
                    }}
                    onDragStart={(e) => handleDragStart(e, "tab", index)}
                    onDragOver={(e) => handleDragOver(e, "tab", index)}
                    onDragEnd={handleDragEnd}
                    onDrop={handleTabDrop}
                    isDragging={draggedItem?.type === "tab" && draggedItem?.index === index}
                    dropPosition={
                      dropTarget?.type === "tab" && dropTarget.index === index
                        ? dropTarget.position
                        : null
                    }
                  />
                )
              })}
            </SettingCard>
          )
        })()}

      {/* ========== 快捷按钮 Tab ========== */}
      {activeTab === "shortcuts" && (
        <>
          <SettingCard
            title={t("quickButtonsBehaviorTitle")}
            description={t("quickButtonsBehaviorDesc")}
            settingId="quick-buttons-card">
            <ToggleRow
              label={t("quickButtonsHideWhenPanelOpenLabel")}
              description={t("quickButtonsHideWhenPanelOpenDesc")}
              settingId="quick-buttons-hide-when-panel-open"
              checked={
                settings.quickButtons?.hideWhenPanelOpen ??
                DEFAULT_SETTINGS.quickButtons.hideWhenPanelOpen
              }
              onChange={() =>
                updateNestedSetting(
                  "quickButtons",
                  "hideWhenPanelOpen",
                  !(
                    settings.quickButtons?.hideWhenPanelOpen ??
                    DEFAULT_SETTINGS.quickButtons.hideWhenPanelOpen
                  ),
                )
              }
            />
            <SettingRow
              label={t("quickButtonsProximityRadiusLabel")}
              description={t("quickButtonsProximityRadiusDesc")}
              settingId="quick-buttons-proximity-radius">
              <Slider
                value={
                  settings.quickButtons?.proximityRadius ??
                  DEFAULT_SETTINGS.quickButtons.proximityRadius
                }
                onChange={(value) => updateNestedSetting("quickButtons", "proximityRadius", value)}
                onPreviewChange={(value) => handleQuickButtonsPreview("proximityRadius", value)}
                onCancelPreview={clearPreviewSettings}
                min={0}
                max={300}
                step={10}
                unit="px"
                defaultValue={DEFAULT_SETTINGS.quickButtons.proximityRadius}
                formatValue={(value) => `${value}px`}
                ariaLabel={t("quickButtonsProximityRadiusLabel")}
              />
            </SettingRow>
            <SettingRow
              label={t("quickButtonsOpacityLabel")}
              description={t("quickButtonsOpacityDesc")}
              settingId="quick-buttons-opacity">
              <Slider
                value={settings.quickButtons?.opacity ?? DEFAULT_SETTINGS.quickButtons.opacity}
                onChange={(value) => updateNestedSetting("quickButtons", "opacity", value)}
                onPreviewChange={(value) => handleQuickButtonsPreview("opacity", value)}
                onCancelPreview={clearPreviewSettings}
                min={0.4}
                max={1}
                step={0.05}
                defaultValue={DEFAULT_SETTINGS.quickButtons.opacity}
                formatValue={(value) => `${Math.round(value * 100)}%`}
                ariaLabel={t("quickButtonsOpacityLabel")}
              />
            </SettingRow>
          </SettingCard>
          <SettingCard
            title={t("collapsedButtonsOrderTitle")}
            description={t("collapsedButtonsOrderDesc")}
            settingId="collapsed-buttons-order-card">
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
                  onDragOver={(e) => handleDragOver(e, "button", index)}
                  onDragEnd={handleDragEnd}
                  onDrop={handleButtonDrop}
                  isDragging={draggedItem?.type === "button" && draggedItem?.index === index}
                  dropPosition={
                    dropTarget?.type === "button" && dropTarget.index === index
                      ? dropTarget.position
                      : null
                  }
                />
              )
            })}
          </SettingCard>
        </>
      )}

      {/* ========== 工具箱菜单 Tab ========== */}
      {activeTab === "toolsMenu" && (
        <SettingCard
          title={t("toolboxMenuTitle")}
          description={t("toolboxMenuDesc")}
          settingId="toolbox-menu-card">
          {TOOLS_MENU_ITEMS.filter((item) => item.id !== TOOLS_MENU_IDS.SETTINGS).map((item) => {
            const enabledIds = settings.quickButtons?.toolsMenu ?? getDefaultToolsMenuIds()
            const isEnabled = enabledIds.includes(item.id)
            return (
              <ToggleRow
                key={item.id}
                label={t(item.labelKey)}
                settingId={`tools-menu-${item.id}`}
                checked={isEnabled}
                onChange={() => {
                  const currentIds = settings.quickButtons?.toolsMenu ?? getDefaultToolsMenuIds()
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
