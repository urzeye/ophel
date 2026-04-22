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
      <Tooltip content={t("rateAndReview") || "去商店评分"}>
        <a
          href={storeInfo.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("rateAndReview") || "去商店评分"}
          className="sidebar-social-btn review-btn">
          {React.cloneElement(storeInfo.icon as React.ReactElement, { size: 18 })}
        </a>
      </Tooltip>

      <Tooltip content={t("giveStar") || "Star on GitHub"}>
        <a
          href="https://github.com/urzeye/ophel"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("giveStar") || "Star on GitHub"}
          className="sidebar-social-btn github-btn">
          <GithubIcon size={18} />
        </a>
      </Tooltip>

      <Tooltip content={t("kofiSupport") || "Buy Me a Coffee"}>
        <a
          href="https://ko-fi.com/urzeye"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("kofiSupport") || "Buy Me a Coffee"}
          className="sidebar-social-btn kofi-btn">
          <KofiIcon size={18} />
        </a>
      </Tooltip>

      <Tooltip content={t("discordCommunity") || "Discord 社区"}>
        <a
          href="https://discord.gg/79B2hFxR"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("discordCommunity") || "Discord 社区"}
          className="sidebar-social-btn discord-btn">
          <DiscordIcon size={18} />
        </a>
      </Tooltip>
    </div>
  )
}
