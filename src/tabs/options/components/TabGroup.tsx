/**
 * 标签组组件
 * 页面顶部的二级导航标签切换器
 */
import React from "react"

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

export const TabGroup: React.FC<TabGroupProps> = ({ tabs, activeTab, onTabChange }) => {
  return (
    <div className="settings-tab-group">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`settings-tab-item ${activeTab === tab.id ? "active" : ""}`}
          onClick={() => onTabChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export default TabGroup
