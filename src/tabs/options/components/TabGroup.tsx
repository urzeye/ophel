/**
 * 标签组组件
 * 页面顶部的二级导航标签切换器；放不下时单行横向滚动，不折成两行：
 * 两端渐隐并出现箭头按钮，鼠标滚轮也能横向滚动，激活项自动滚入可视区
 */
import React, { useCallback, useEffect, useRef } from "react"

import { ChevronDownIcon } from "~components/icons"
import { t } from "~utils/i18n"

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
/** 箭头每次滚动可视宽度的比例，留一截上一屏的标签作参照 */
const ARROW_SCROLL_RATIO = 0.7
/** 按行计量的滚轮事件（Firefox 鼠标滚轮常见）换算成像素 */
const WHEEL_LINE_HEIGHT = 16

const getWheelDeltaPixels = (event: WheelEvent, pageSize: number): number => {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * WHEEL_LINE_HEIGHT
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * pageSize
  return event.deltaY
}

export const TabGroup: React.FC<TabGroupProps> = ({ tabs, activeTab, onTabChange }) => {
  const groupRef = useRef<HTMLDivElement>(null)
  const tabsSignature = tabs.map((tab) => `${tab.id}:${tab.label}`).join("|")

  // 两端还有被裁掉的标签时标记出来，样式据此渐隐并显示对应一侧的箭头
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

  // 竖向滚轮转成横向滚动，鼠标用户也能滚到两端的标签；滚到头后不拦截，交还给内容区继续竖向滚动。
  // React 的 onWheel 是 passive 监听，无法阻止内容区同时滚动，这里用原生非 passive 监听
  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

      const maxScrollLeft = group.scrollWidth - group.clientWidth
      if (maxScrollLeft <= 0) return

      const delta = getWheelDeltaPixels(event, group.clientWidth)
      const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, group.scrollLeft + delta))
      if (nextScrollLeft === group.scrollLeft) return

      event.preventDefault()
      group.scrollLeft = nextScrollLeft
    }

    group.addEventListener("wheel", handleWheel, { passive: false })
    return () => group.removeEventListener("wheel", handleWheel)
  }, [])

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

  const scrollByArrow = (direction: -1 | 1) => {
    const group = groupRef.current
    if (!group) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    group.scrollBy({
      left: direction * group.clientWidth * ARROW_SCROLL_RATIO,
      behavior: reduceMotion ? "auto" : "smooth",
    })
  }

  // 箭头只服务鼠标：键盘在标签间移动时激活项会自动滚入可视区，所以箭头不进 Tab 顺序；
  // 点击也不抢焦点，避免滚到头箭头隐藏时焦点丢到页面上
  const renderArrow = (direction: -1 | 1) => (
    <button
      type="button"
      tabIndex={-1}
      className={`settings-tab-group-arrow ${direction < 0 ? "is-start" : "is-end"}`}
      aria-label={t(direction < 0 ? "settingsTabsScrollLeft" : "settingsTabsScrollRight")}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => scrollByArrow(direction)}>
      <ChevronDownIcon size={14} style={{ transform: `rotate(${direction < 0 ? 90 : -90}deg)` }} />
    </button>
  )

  return (
    <div className="settings-tab-group-container">
      <div className="settings-tab-group-scroller">
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
        {renderArrow(-1)}
        {renderArrow(1)}
      </div>
    </div>
  )
}

export default TabGroup
