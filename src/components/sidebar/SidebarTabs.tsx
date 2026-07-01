import React from "react"

import { t } from "~utils/i18n"

export type SidebarTabId = "outline" | "conversations" | "prompts"

interface SidebarTabsProps {
  activeTab: SidebarTabId
  onTabChange: (tab: SidebarTabId) => void
}

const TABS: Array<{ id: SidebarTabId; labelKey: string; fallback: string }> = [
  { id: "outline", labelKey: "outline", fallback: "Outline" },
  { id: "conversations", labelKey: "conversations", fallback: "Conversations" },
  { id: "prompts", labelKey: "prompts", fallback: "Prompts" },
]

export const SidebarTabs: React.FC<SidebarTabsProps> = ({ activeTab, onTabChange }) => (
  <nav className="gh-browser-sidebar-tabs" aria-label={t("panelTab")}>
    {TABS.map((tab) => {
      const label = t(tab.labelKey)
      return (
        <button
          key={tab.id}
          className={`gh-browser-sidebar-tab ${activeTab === tab.id ? "active" : ""}`}
          type="button"
          aria-pressed={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}>
          {label === tab.labelKey ? tab.fallback : label}
        </button>
      )
    })}
  </nav>
)
