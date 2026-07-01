import React from "react"

import type { SidebarPageContext } from "~utils/messaging"
import { t } from "~utils/i18n"

interface SidebarStatusProps {
  context: SidebarPageContext | null
  error?: string
}

export const SidebarStatus: React.FC<SidebarStatusProps> = ({ context, error }) => {
  if (error) {
    return <section className="gh-browser-sidebar-status">{t("operationFailed")}</section>
  }

  if (!context) {
    return <section className="gh-browser-sidebar-status">{t("loading")}</section>
  }

  return (
    <section className="gh-browser-sidebar-status">
      {context.siteName || context.title || t("panelSettings")}
      {context.sessionId ? ` · ${context.sessionId}` : ""}
    </section>
  )
}
