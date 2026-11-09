import React from "react"

import { t } from "~utils/i18n"

export const SafariWebsiteAccessGuide: React.FC<{ showAllWebsitesHint?: boolean }> = ({
  showAllWebsitesHint = true,
}) => (
  <details className="settings-perm-browser-guide">
    <summary>{t("safariWebsiteAccessGuide")}</summary>
    <ol>
      <li>{t("safariWebsiteAccessStep1")}</li>
      <li>{t("safariWebsiteAccessStep2")}</li>
      <li>{t("safariWebsiteAccessStep3")}</li>
    </ol>
    {showAllWebsitesHint && <p>{t("safariWebsiteAccessScopeHint")}</p>}
  </details>
)
