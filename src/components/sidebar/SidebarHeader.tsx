import React from "react"

import { SettingsIcon } from "~components/icons"
import { t } from "~utils/i18n"

interface SidebarHeaderProps {
  iconUrl: string
  title: string
  onOpenSettings: () => void
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ iconUrl, title, onOpenSettings }) => (
  <header className="gh-browser-sidebar-header">
    <div className="gh-browser-sidebar-brand">
      {iconUrl ? <img className="gh-browser-sidebar-logo" src={iconUrl} alt="" /> : null}
      <span className="gh-browser-sidebar-title">{title}</span>
    </div>
    <button
      className="gh-browser-sidebar-settings"
      type="button"
      title={t("settings")}
      aria-label={t("settings")}
      onClick={onOpenSettings}>
      <SettingsIcon size={16} />
    </button>
  </header>
)
