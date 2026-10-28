/**
 * 设置侧栏与窄屏返回栏：设置弹窗与独立 Options 页共用
 */
import React from "react"

import { ChevronDownIcon } from "~components/icons"
import { APP_DISPLAY_NAME, getAppIconUrl } from "~utils/config"
import { t } from "~utils/i18n"

import { NAV_IDS } from "~constants"

import type { SettingsNavItem } from "../settings-nav"
import { SidebarFooter } from "./SidebarFooter"

const getLocalizedLabel = (labelKey: string, fallback: string): string => {
  const localized = t(labelKey)
  return localized === labelKey ? fallback : localized
}

interface SettingsSidebarProps {
  items: SettingsNavItem[]
  activePage: string
  onSelect: (page: string) => void
  hasUnseenReleaseNotes: boolean
  siteId: string
  // 设置弹窗用品牌名作为对话框标题，打开时聚焦到这里
  titleId?: string
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  items,
  activePage,
  onSelect,
  hasUnseenReleaseNotes,
  siteId,
  titleId,
}) => (
  <aside className="settings-sidebar">
    <div className="settings-sidebar-header">
      <div className="settings-sidebar-logo">
        <img src={getAppIconUrl()} alt={APP_DISPLAY_NAME} />
        <span id={titleId} tabIndex={titleId ? -1 : undefined}>
          {APP_DISPLAY_NAME}
        </span>
      </div>
    </div>
    <nav className="settings-sidebar-nav">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`settings-nav-item ${activePage === item.id ? "active" : ""}`}
          onClick={() => onSelect(item.id)}>
          <span className="settings-nav-item-icon">
            <item.Icon size={20} />
          </span>
          <span className={`settings-nav-item-label${item.beta ? " has-badge" : ""}`}>
            {getLocalizedLabel(item.labelKey, item.label)}
            {item.id === NAV_IDS.ABOUT && hasUnseenReleaseNotes ? (
              <span className="settings-nav-unread-dot" aria-hidden="true" />
            ) : null}
          </span>
          {item.beta && (
            <span className="settings-beta-badge">{getLocalizedLabel("betaBadge", "Beta")}</span>
          )}
        </button>
      ))}
    </nav>

    {/* 侧边栏底部快捷设置 */}
    <SidebarFooter siteId={siteId} />
  </aside>
)

/** 窄屏页面屏顶部的返回栏：回到导航屏 */
export const SettingsCompactBar: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="settings-compact-bar">
    <button type="button" className="settings-compact-back" onClick={onBack}>
      <ChevronDownIcon size={16} className="settings-compact-back-icon" />
      <span>{t("navBack")}</span>
    </button>
  </div>
)
