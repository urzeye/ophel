/**
 * 基本设置页面
 * 包含：面板 | 界面排版 | 快捷按钮 | 宽度布局
 */
import React, { useEffect, useState } from "react"

import { DragIcon, GeneralIcon } from "~components/icons"
import { Switch } from "~components/ui"
import { COLLAPSED_BUTTON_DEFS, TAB_DEFINITIONS } from "~constants"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"

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
  const [activeTab, setActiveTab] = useState("panel")
  const { settings, setSettings, updateNestedSetting, updateDeepSetting } = useSettingsStore()

  // 拖拽状态
  const [draggedItem, setDraggedItem] = useState<{ type: "tab" | "button"; index: number } | null>(
    null,
  )

  // 宽度布局相关状态
  const currentPageWidth =
    settings?.layout?.pageWidth?.[siteId as keyof typeof settings.layout.pageWidth] ||
    settings?.layout?.pageWidth?._default
  const currentUserQueryWidth =
    settings?.layout?.userQueryWidth?.[siteId as keyof typeof settings.layout.userQueryWidth] ||
    settings?.layout?.userQueryWidth?._default

  const [tempWidth, setTempWidth] = useState(currentPageWidth?.value || "81")
  const [tempUserQueryWidth, setTempUserQueryWidth] = useState(
    currentUserQueryWidth?.value || "600",
  )

  // 面板设置本地状态 (优化输入体验)
  const [tempEdgeDistance, setTempEdgeDistance] = useState(
    settings.panel?.defaultEdgeDistance?.toString() ?? "20",
  )
  const [tempSnapThreshold, setTempSnapThreshold] = useState(
    settings.panel?.edgeSnapThreshold?.toString() ?? "30",
  )
  const [tempHeight, setTempHeight] = useState(settings.panel?.height?.toString() ?? "80")

  useEffect(() => {
    if (currentPageWidth?.value) {
      setTempWidth(currentPageWidth.value)
    }
  }, [currentPageWidth?.value])

  useEffect(() => {
    if (currentUserQueryWidth?.value) {
      setTempUserQueryWidth(currentUserQueryWidth.value)
    }
  }, [currentUserQueryWidth?.value])

  // 同步 Store 设置到本地状态
  useEffect(() => {
    if (settings.panel?.defaultEdgeDistance !== undefined) {
      setTempEdgeDistance(settings.panel?.defaultEdgeDistance.toString())
    }
  }, [settings.panel?.defaultEdgeDistance])

  useEffect(() => {
    if (settings.panel?.edgeSnapThreshold !== undefined) {
      setTempSnapThreshold(settings.panel?.edgeSnapThreshold.toString())
    }
  }, [settings.panel?.edgeSnapThreshold])

  useEffect(() => {
    if (settings.panel?.height !== undefined) {
      setTempHeight(settings.panel?.height.toString())
    }
  }, [settings.panel?.height])

  // 面板设置处理函数
  const handleEdgeDistanceBlur = () => {
    let val = parseInt(tempEdgeDistance)
    if (isNaN(val)) val = 20
    const clamped = Math.max(0, Math.min(200, val))
    setTempEdgeDistance(clamped.toString())
    updateNestedSetting("panel", "defaultEdgeDistance", clamped)
  }

  const handleSnapThresholdBlur = () => {
    let val = parseInt(tempSnapThreshold)
    if (isNaN(val)) val = 30
    const clamped = Math.max(10, Math.min(100, val))
    setTempSnapThreshold(clamped.toString())
    updateNestedSetting("panel", "edgeSnapThreshold", clamped)
  }

  const handleHeightBlur = () => {
    let val = parseInt(tempHeight)
    if (isNaN(val)) val = 80
    const clamped = Math.max(50, Math.min(100, val))
    setTempHeight(clamped.toString())
    updateNestedSetting("panel", "height", clamped)
  }

  // 页面宽度更新
  const handleWidthBlur = () => {
    let val = parseInt(tempWidth)
    const unit = currentPageWidth?.unit || "%"

    if (isNaN(val)) {
      val = unit === "%" ? 81 : 1280
    }

    if (unit === "%") {
      if (val < 40) val = 40
      if (val > 100) val = 100
    } else {
      if (val <= 0) val = 1200
    }

    const finalVal = val.toString()
    setTempWidth(finalVal)
    if (finalVal !== currentPageWidth?.value && settings) {
      const current = currentPageWidth || { enabled: true, value: finalVal, unit: "%" }
      setSettings({
        layout: {
          ...settings.layout,
          pageWidth: {
            ...settings.layout?.pageWidth,
            [siteId]: { ...current, value: finalVal },
          },
        },
      })
    }
  }

  const handleUnitChange = (newUnit: string) => {
    const newValue = newUnit === "px" ? "1280" : "81"
    setTempWidth(newValue)

    if (settings) {
      const newPageWidth = {
        ...currentPageWidth,
        unit: newUnit,
        value: newValue,
        enabled: currentPageWidth?.enabled ?? false,
      }
      setSettings({
        layout: {
          ...settings.layout,
          pageWidth: {
            ...settings.layout?.pageWidth,
            [siteId]: newPageWidth,
          },
        },
      })
    }
  }

  // 用户问题宽度更新
  const handleUserQueryWidthBlur = () => {
    let val = parseInt(tempUserQueryWidth)
    const unit = currentUserQueryWidth?.unit || "px"

    if (isNaN(val)) {
      val = unit === "%" ? 81 : 600
    }

    if (unit === "%") {
      if (val < 40) val = 40
      if (val > 100) val = 100
    } else {
      if (val <= 0) val = 600
    }

    const finalVal = val.toString()
    setTempUserQueryWidth(finalVal)
    if (finalVal !== currentUserQueryWidth?.value && settings) {
      const current = currentUserQueryWidth || { enabled: true, value: finalVal, unit: "px" }
      setSettings({
        layout: {
          ...settings.layout,
          userQueryWidth: {
            ...settings.layout?.userQueryWidth,
            [siteId]: { ...current, value: finalVal },
          },
        },
      })
    }
  }

  const handleUserQueryUnitChange = (newUnit: string) => {
    const newValue = newUnit === "px" ? "600" : "81"
    setTempUserQueryWidth(newValue)
    if (settings) {
      const current = currentUserQueryWidth || { enabled: false, value: newValue, unit: newUnit }
      setSettings({
        layout: {
          ...settings.layout,
          userQueryWidth: {
            ...settings.layout?.userQueryWidth,
            [siteId]: { ...current, unit: newUnit, value: newValue },
          },
        },
      })
    }
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
    { id: "layout", label: t("layoutTab") || "宽度布局" },
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
              <input
                type="number"
                className="settings-input"
                value={tempEdgeDistance}
                min={0}
                max={200}
                style={{ width: "70px" }}
                onChange={(e) => setTempEdgeDistance(e.target.value)}
                onBlur={handleEdgeDistanceBlur}
              />
              <span style={{ fontSize: "13px", color: "var(--gh-text-secondary)" }}>px</span>
            </div>
          </SettingRow>

          {/* 面板高度 */}
          <SettingRow
            label={t("panelHeightLabel") || "面板高度"}
            description={t("panelHeightDesc") || "面板占用屏幕高度的百分比"}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <input
                type="number"
                className="settings-input"
                value={tempHeight}
                min={50}
                max={100}
                style={{ width: "70px" }}
                onChange={(e) => setTempHeight(e.target.value)}
                onBlur={handleHeightBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleHeightBlur()
                }}
              />
              <span style={{ fontSize: "13px", color: "var(--gh-text-secondary)" }}>vh</span>
            </div>
          </SettingRow>

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

          {/* 吸附触发距离 */}
          <SettingRow
            label={t("edgeSnapThresholdLabel") || "吸附触发距离"}
            description={t("edgeSnapThresholdDesc") || "拖拽面板到边缘多近时触发吸附"}
            disabled={!settings.panel?.edgeSnap}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <input
                type="number"
                className="settings-input"
                value={tempSnapThreshold}
                min={10}
                max={100}
                disabled={!settings.panel?.edgeSnap}
                style={{ width: "70px" }}
                onChange={(e) => setTempSnapThreshold(e.target.value)}
                onBlur={handleSnapThresholdBlur}
              />
              <span style={{ fontSize: "13px", color: "var(--gh-text-secondary)" }}>px</span>
            </div>
          </SettingRow>
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
        </SettingCard>
      )}

      {/* ========== 宽度布局 Tab ========== */}
      {activeTab === "layout" && (
        <>
          {/* 页面宽度卡片 */}
          <SettingCard title={t("pageWidthSettings") || "页面宽度"}>
            <ToggleRow
              label={t("enablePageWidth") || "启用页面宽度"}
              description={t("enablePageWidthDesc") || "调整聊天页面的最大宽度"}
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
              label={t("pageWidthValueLabel") || "宽度值"}
              disabled={!currentPageWidth?.enabled}>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  className="settings-input"
                  value={tempWidth}
                  onChange={(e) => setTempWidth(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={handleWidthBlur}
                  disabled={!currentPageWidth?.enabled}
                  style={{ width: "80px" }}
                />
                <select
                  className="settings-select"
                  value={currentPageWidth?.unit || "%"}
                  onChange={(e) => handleUnitChange(e.target.value)}
                  disabled={!currentPageWidth?.enabled}>
                  <option value="%">%</option>
                  <option value="px">px</option>
                </select>
              </div>
            </SettingRow>
          </SettingCard>

          {/* 用户问题宽度卡片 */}
          <SettingCard title={t("userQueryWidthSettings") || "用户问题宽度"}>
            <ToggleRow
              label={t("enableUserQueryWidth") || "启用用户问题加宽"}
              description={t("enableUserQueryWidthDesc") || "调整用户问题气泡的最大宽度"}
              checked={currentUserQueryWidth?.enabled ?? false}
              onChange={() => {
                const current = currentUserQueryWidth || {
                  enabled: false,
                  value: "600",
                  unit: "px",
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
              label={t("userQueryWidthValueLabel") || "问题宽度"}
              disabled={!currentUserQueryWidth?.enabled}>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  className="settings-input"
                  value={tempUserQueryWidth}
                  onChange={(e) => setTempUserQueryWidth(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={handleUserQueryWidthBlur}
                  disabled={!currentUserQueryWidth?.enabled}
                  style={{ width: "80px" }}
                />
                <select
                  className="settings-select"
                  value={currentUserQueryWidth?.unit || "px"}
                  onChange={(e) => handleUserQueryUnitChange(e.target.value)}
                  disabled={!currentUserQueryWidth?.enabled}>
                  <option value="px">px</option>
                  <option value="%">%</option>
                </select>
              </div>
            </SettingRow>
          </SettingCard>
        </>
      )}
    </div>
  )
}

export default GeneralPage
