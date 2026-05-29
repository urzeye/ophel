import React, { useMemo } from "react"
import { DiscordIcon } from "~components/icons/DiscordIcon"
import { GithubIcon } from "~components/icons/GithubIcon"
import { KofiIcon } from "~components/icons/KofiIcon"
import { Tooltip } from "~components/ui/Tooltip"
import { getStoreInfo } from "~utils/getStoreInfo"
import { t } from "~utils/i18n"

export function SidebarCommunityLinks() {
  const storeInfo = useMemo(() => getStoreInfo(), [])

  return (
    <div className="sidebar-community-links">
      <Tooltip content={t("rateAndReview")}>
        <a
          href={storeInfo.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("rateAndReview")}
          className="sidebar-social-btn review-btn">
          {React.cloneElement(storeInfo.icon as React.ReactElement, { size: 18 })}
        </a>
      </Tooltip>

      <Tooltip content={t("giveStar")}>
        <a
          href="https://github.com/urzeye/ophel"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("giveStar")}
          className="sidebar-social-btn github-btn">
          <GithubIcon size={18} />
        </a>
      </Tooltip>

      <Tooltip content={t("kofiSupport")}>
        <a
          href="https://ko-fi.com/urzeye"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("kofiSupport")}
          className="sidebar-social-btn kofi-btn">
          <KofiIcon size={18} />
        </a>
      </Tooltip>

      <Tooltip content={t("discordCommunity")}>
        <a
          href="https://discord.gg/rmPzb6Cx9u"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("discordCommunity")}
          className="sidebar-social-btn discord-btn">
          <DiscordIcon size={18} />
        </a>
      </Tooltip>
    </div>
  )
}
