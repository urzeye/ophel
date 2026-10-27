/**
 * 标签组组件
 * 页面顶部的二级导航标签切换器；放不下时单行横向滚动，不折成两行
 */
import React, { useCallback, useEffect, useRef } from "react"

export interface Tab {
  id: string
  label: string
}

export interface TabGroupProps {
  /** 标签列表 */
  tabs: Tab[]
  /** 当前激活的标签 ID */
  activeTab: string
  /** 标签切换回调 */
  onTabChange: (tabId: string) => void
}

/** 激活项滚入可视区时与边缘保留的距离，避免贴着渐隐区 */
const ACTIVE_TAB_EDGE_GAP = 24

export const TabGroup: React.FC<TabGroupProps> = ({ tabs, activeTab, onTabChange }) => {
  const groupRef = useRef<HTMLDivElement>(null)
  const tabsSignature = tabs.map((tab) => `${tab.id}:${tab.label}`).join("|")

  // 两端还有被裁掉的标签时标记出来，样式据此渐隐提示可横向滚动
  const syncOverflowEdges = useCallback(() => {
    const group = groupRef.current
    if (!group) return

    const maxScrollLeft = group.scrollWidth - group.clientWidth
    group.toggleAttribute("data-overflow-start", group.scrollLeft > 1)
    group.toggleAttribute("data-overflow-end", group.scrollLeft < maxScrollLeft - 1)
  }, [])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    syncOverflowEdges()
    const observer = new ResizeObserver(syncOverflowEdges)
    observer.observe(group)
    return () => observer.disconnect()
  }, [syncOverflowEdges, tabsSignature])

  // 只调整标签组自身的 scrollLeft，不连带滚动设置内容区或外层弹窗
  useEffect(() => {
    const group = groupRef.current
    const activeItem = group?.querySelector<HTMLElement>(".settings-tab-item.active")
    if (!group || !activeItem) return

    const groupRect = group.getBoundingClientRect()
    const itemRect = activeItem.getBoundingClientRect()
    if (itemRect.left < groupRect.left) {
      group.scrollLeft -= groupRect.left - itemRect.left + ACTIVE_TAB_EDGE_GAP
    } else if (itemRect.right > groupRect.right) {
      group.scrollLeft += itemRect.right - groupRect.right + ACTIVE_TAB_EDGE_GAP
    }
  }, [activeTab, tabsSignature])

  return (
    <div className="settings-tab-group-container">
      <div ref={groupRef} className="settings-tab-group" onScroll={syncOverflowEdges}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`settings-tab-item ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => onTabChange(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default TabGroup
