import React, { useMemo, useSyncExternalStore } from "react"
import { DiscordIcon } from "~components/icons/DiscordIcon"
import { GithubIcon } from "~components/icons/GithubIcon"
import { KofiIcon } from "~components/icons/KofiIcon"
import { ScriptCatIcon } from "~components/icons/StoreIcons"
import { Tooltip } from "~components/ui/Tooltip"
import { STORE_LINKS } from "~constants/store-links"
import { isScriptCatUserscriptManager } from "~platform/utils"
import { GITHUB_REPO_URL, getDonateChannels } from "~utils/donate-channels"
import { getStoreInfo } from "~utils/getStoreInfo"
import { getCurrentLang, subscribeI18nChanges, t } from "~utils/i18n"

export function SidebarCommunityLinks() {
  const storeInfo = useMemo(() => getStoreInfo(), [])
  const showScriptCat = useMemo(() => isScriptCatUserscriptManager(), [])
  const language = useSyncExternalStore(subscribeI18nChanges, getCurrentLang, getCurrentLang)
  const donateChannels = getDonateChannels(language)

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

      {showScriptCat && (
        <Tooltip content={t("scriptCat")}>
          <a
            href={STORE_LINKS.scriptCat}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("scriptCat")}
            className="sidebar-social-btn scriptcat-btn">
            <ScriptCatIcon size={18} />
          </a>
        </Tooltip>
      )}

      <Tooltip content={t("giveStar")}>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("giveStar")}
          className="sidebar-social-btn github-btn">
          <GithubIcon size={18} />
        </a>
      </Tooltip>

      <Tooltip content={t("kofiSupport")}>
        <a
          href={donateChannels.primaryUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("kofiSupport")}
          className="sidebar-social-btn kofi-btn">
          <KofiIcon size={18} />
        </a>
      </Tooltip>

      <Tooltip content={t("joinDiscordCommunity")}>
        <a
          href="https://discord.gg/rmPzb6Cx9u"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("joinDiscordCommunity")}
          className="sidebar-social-btn discord-btn">
          <DiscordIcon size={18} />
        </a>
      </Tooltip>
    </div>
  )
}
