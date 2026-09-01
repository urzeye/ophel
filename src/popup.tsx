/**
 * Ophel Popup
 *
 * Displays site status, quick actions, and recent prompts
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { PlatformIcon } from "~components/PlatformIcon"
import { ChevronDownIcon } from "~components/icons/ChevronDownIcon"
import { DiscordIcon } from "~components/icons/DiscordIcon"
import { KofiIcon } from "~components/icons/KofiIcon"
import { SettingsIcon } from "~components/icons/SettingsIcon"
import { StarIcon } from "~components/icons/StarIcon"
import { TimeIcon } from "~components/icons/TimeIcon"
import { Tooltip } from "~components/ui/Tooltip"
import {
  buildQuickAccessSites,
  hostOf,
  resolveQuickAccessUrl,
  resolveSiteEntryUrl,
  type QuickAccessSite,
} from "~core/quick-access-sites"
import { useSupportedAiPlatforms } from "~hooks/useSupportedAiPlatforms"
import { GITHUB_REPO_URL, getDonateChannels } from "~utils/donate-channels"
import { getStoreInfo } from "~utils/getStoreInfo"
import { getCurrentLang, setLanguage, t } from "~utils/i18n"
import { MSG_START_NEW_CONVERSATION } from "~utils/messaging"
import { version } from "../package.json"

import "./popup.css"

// Inject platform type
declare const __PLATFORM__: "extension" | "userscript" | undefined

interface Prompt {
  id: string
  title: string
  content: string
  lastUsedAt?: number
}

interface SiteInfo {
  name: string
  url: string
  supported: boolean
}

/** 记住每个平台上次打开的入口地址（多域名平台专用）。 */
const QUICK_ACCESS_LAST_URLS_KEY = "popupQuickAccessLastEntryUrls"

function IndexPopup() {
  const supportedPlatforms = useSupportedAiPlatforms()
  const quickAccessSites = useMemo(
    () => buildQuickAccessSites(supportedPlatforms),
    [supportedPlatforms],
  )
  const [currentSite, setCurrentSite] = useState<SiteInfo | null>(null)
  const [recentPrompts, setRecentPrompts] = useState<Prompt[]>([])
  const [lastEntryUrls, setLastEntryUrls] = useState<Record<string, string>>({})
  const [entryMenuSiteKey, setEntryMenuSiteKey] = useState<string | null>(null)
  const [entryMenuDropUp, setEntryMenuDropUp] = useState(false)
  const entryMenuRef = useRef<HTMLDivElement>(null)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState("")
  const [languageReady, setLanguageReady] = useState(false)

  useEffect(() => {
    // Load language setting from storage first
    chrome.storage.local.get("settings", (data) => {
      try {
        const parsed = typeof data.settings === "string" ? JSON.parse(data.settings) : data.settings
        const lang = parsed?.state?.settings?.language || "auto"
        setLanguage(lang)
      } catch (e) {
        console.error("Failed to load language setting:", e)
        setLanguage("auto")
      }
      setLanguageReady(true)
    })

    // Load recent prompts from storage
    chrome.storage.local.get("prompts", (data) => {
      try {
        const parsed = typeof data.prompts === "string" ? JSON.parse(data.prompts) : data.prompts
        const prompts: Prompt[] = parsed?.state?.prompts || []

        // Sort by lastUsedAt and take top 3
        const sorted = prompts
          .filter((p) => p.lastUsedAt)
          .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0))
          .slice(0, 3)

        setRecentPrompts(sorted)
      } catch (e) {
        console.error("Failed to load prompts:", e)
      }
    })

    // Load remembered quick access entry urls
    chrome.storage.local.get(QUICK_ACCESS_LAST_URLS_KEY, (data) => {
      const value = data[QUICK_ACCESS_LAST_URLS_KEY]
      if (value && typeof value === "object") {
        setLastEntryUrls(value as Record<string, string>)
      }
    })
  }, [])

  // 入口切换菜单：点击外部或按 Escape 关闭
  useEffect(() => {
    if (!entryMenuSiteKey) return
    const closeMenu = () => setEntryMenuSiteKey(null)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu()
    }
    document.addEventListener("click", closeMenu)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("click", closeMenu)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [entryMenuSiteKey])

  // 入口菜单默认向下弹出；渲染后（绘制前）测量一次，
  // 若下方空间不足且上方更宽敞则翻转向上，避免被隐藏滚动条的容器裁剪。
  useLayoutEffect(() => {
    const menu = entryMenuRef.current
    if (!menu) return
    const tile = menu.parentElement
    const scroller = menu.closest(".popup-scrollable")
    if (!tile || !scroller) return
    const tileRect = tile.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    const menuHeight = menu.offsetHeight
    const spaceBelow = scrollerRect.bottom - tileRect.bottom
    const spaceAbove = tileRect.top - scrollerRect.top
    setEntryMenuDropUp(spaceBelow < menuHeight + 4 && spaceAbove > spaceBelow)
  }, [entryMenuSiteKey])

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url || ""
      const matchedSite = supportedPlatforms.find((site) => site.pattern.test(url))

      if (matchedSite) {
        setCurrentSite({
          name: matchedSite.name,
          url: resolveSiteEntryUrl(matchedSite, url),
          supported: true,
        })
        return
      }

      try {
        const hostname = new URL(url).hostname || t("popupCurrentSite")
        setCurrentSite({ name: hostname, url: "", supported: false })
      } catch {
        setCurrentSite({ name: t("popupCurrentSite"), url: "", supported: false })
      }
    })
  }, [supportedPlatforms])

  const showToast = (message: string) => {
    setToastMessage(message)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 1500)
  }

  const getActiveTab = async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    return tabs[0] ?? null
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(t("popupCopied"))
    } catch {
      showToast(t("popupCopyFailed"))
    }
  }

  const openOptionsPage = (page?: string) => {
    // Use tabs.create as fallback for popup context
    const optionsUrl = chrome.runtime.getURL(
      page ? `tabs/options.html?page=${page}` : "tabs/options.html",
    )
    chrome.tabs.create({ url: optionsUrl })
    window.close()
  }

  const openUrl = (url: string) => {
    chrome.tabs.create({ url })
    window.close()
  }

  const rememberEntryUrl = (platformId: string, url: string) => {
    const next = { ...lastEntryUrls, [platformId]: url }
    setLastEntryUrls(next)
    chrome.storage.local.set({ [QUICK_ACCESS_LAST_URLS_KEY]: next })
  }

  const openQuickAccessSite = (site: QuickAccessSite) => {
    const url = resolveQuickAccessUrl(site, lastEntryUrls)
    if (!url) {
      openOptionsPage("sitePacks")
      return
    }
    // 单入口平台的打开目标可由 urls[0] 推导，无需落盘
    if (site.urls.length > 1) {
      rememberEntryUrl(site.platform.id, url)
    }
    openUrl(url)
  }

  const openQuickAccessEntry = (site: QuickAccessSite, url: string) => {
    rememberEntryUrl(site.platform.id, url)
    openUrl(url)
  }

  const quickAccessTooltip = (site: QuickAccessSite): string => {
    if (site.urls.length === 0) return `${site.platform.name} · ${t("popupSitePackUnbound")}`
    if (site.urls.length > 1) {
      const url = resolveQuickAccessUrl(site, lastEntryUrls)
      if (url) return `${site.platform.name} · ${hostOf(url)}`
    }
    return site.platform.name
  }

  const openUrlInCurrentTab = async (url: string) => {
    const activeTab = await getActiveTab()
    if (activeTab?.id) {
      await chrome.tabs.update(activeTab.id, { url, active: true })
    } else {
      await chrome.tabs.create({ url, active: true })
    }
    window.close()
  }

  const startNewChatInCurrentSite = async () => {
    if (!currentSite?.supported) {
      return
    }

    try {
      const activeTab = await getActiveTab()
      if (activeTab?.id) {
        const result = (await chrome.tabs.sendMessage(activeTab.id, {
          type: MSG_START_NEW_CONVERSATION,
        })) as { success?: boolean } | undefined

        if (result?.success) {
          window.close()
          return
        }
      }
    } catch (err) {
      console.warn("[Ophel Popup] Failed to start new conversation in current tab:", err)
    }

    await openUrlInCurrentTab(currentSite.url)
  }

  // Fetch store info
  const storeInfo = getStoreInfo()
  const donateChannels = getDonateChannels(getCurrentLang())

  // Wait for language to be loaded before rendering
  if (!languageReady) {
    return (
      <div className="popup-container" style={{ padding: 20, textAlign: "center" }}>
        ...
      </div>
    )
  }

  return (
    <div className="popup-container">
      <div className="popup-scrollable">
        {/* Header */}
        <div className="popup-header">
          <div className="popup-header-left">
            <img
              src={chrome.runtime.getURL("assets/icon.png")}
              alt="Ophel"
              className="popup-logo"
            />
            <span className="popup-title">Ophel Atlas</span>
          </div>
          <Tooltip content={t("popupSettings")}>
            <button className="popup-settings-btn" onClick={() => openOptionsPage()}>
              <SettingsIcon size={18} />
            </button>
          </Tooltip>
        </div>

        {/* Site Status */}
        <div className="popup-site-status">
          <div className="popup-site-status-left">
            {currentSite?.name !== t("popupCurrentSite") && (
              <div className="popup-site-label">{t("popupCurrentSite")}</div>
            )}
            <div className="popup-site-name">{currentSite?.name || "..."}</div>
          </div>
          {currentSite && (
            <div
              className={`popup-status-badge ${currentSite.supported ? "supported" : "unsupported"}`}>
              {currentSite.supported ? t("popupSupported") : t("popupUnsupported")}
            </div>
          )}
        </div>

        {/* Quick Actions or Site Links */}
        {currentSite?.supported ? (
          <div className="popup-actions popup-actions-single">
            <button className="popup-action-btn primary-btn" onClick={startNewChatInCurrentSite}>
              🚀 {t("popupNewChat")}
            </button>
          </div>
        ) : (
          <>
            <div className="popup-section-title">{t("popupQuickAccess")}</div>
            <div className="popup-sites-grid">
              {quickAccessSites.map((site) => {
                const resolvedUrl = resolveQuickAccessUrl(site, lastEntryUrls)
                const subtitle =
                  site.urls.length === 0
                    ? t("popupSitePackUnbound")
                    : site.urls.length > 1 && resolvedUrl
                      ? hostOf(resolvedUrl)
                      : null
                return (
                  <div className="popup-site-tile" key={site.key}>
                    <Tooltip
                      content={quickAccessTooltip(site)}
                      triggerStyle={{ width: "100%", display: "flex" }}
                      triggerClassName="popup-tooltip-trigger">
                      <button
                        className={`popup-site-link${site.urls.length === 0 ? " unbound" : ""}`}
                        onClick={() => openQuickAccessSite(site)}>
                        <PlatformIcon
                          platform={site.platform}
                          size={20}
                          className="popup-site-icon"
                          fallbackClassName="popup-site-emoji"
                        />
                        <span className="popup-site-title">{site.platform.name}</span>
                        {subtitle && <span className="popup-site-subtitle">{subtitle}</span>}
                      </button>
                    </Tooltip>
                    {site.urls.length > 1 && (
                      <>
                        <Tooltip
                          content={t("popupSwitchSiteEntry")}
                          placement="top"
                          triggerStyle={{ position: "absolute", top: 4, right: 4, zIndex: 2 }}>
                          <button
                            className="popup-site-entry-switch"
                            aria-label={t("popupSwitchSiteEntry")}
                            aria-haspopup="menu"
                            aria-expanded={entryMenuSiteKey === site.key}
                            onClick={(e) => {
                              e.stopPropagation()
                              setEntryMenuSiteKey(entryMenuSiteKey === site.key ? null : site.key)
                            }}>
                            <ChevronDownIcon size={12} />
                          </button>
                        </Tooltip>
                        {entryMenuSiteKey === site.key && (
                          <div
                            ref={entryMenuRef}
                            className={`popup-site-entry-menu${entryMenuDropUp ? " drop-up" : ""}`}
                            role="menu"
                            onClick={(e) => e.stopPropagation()}>
                            {site.urls.map((url) => (
                              <button
                                key={url}
                                className={`popup-site-entry-item${url === resolvedUrl ? " active" : ""}`}
                                role="menuitem"
                                onClick={() => openQuickAccessEntry(site, url)}>
                                {hostOf(url)}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Recent Prompts */}
        <div>
          <div className="popup-section-title">{t("popupRecentUsed")}</div>
          {recentPrompts.length > 0 ? (
            <div className="popup-prompts-list">
              {recentPrompts.map((prompt) => (
                <div
                  key={prompt.id}
                  className="popup-prompt-item"
                  onClick={() => copyToClipboard(prompt.content)}>
                  <span className="popup-prompt-title">{prompt.title}</span>
                  <span className="popup-prompt-copy">{t("copy")}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="popup-no-prompts">
              <TimeIcon size={28} />
              <span>{t("popupNoRecentPrompts")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer - fixed at bottom */}
      <div className="popup-footer">
        <span className="popup-version">v{version}</span>
        <div className="popup-footer-actions">
          <Tooltip content={t("rateAndReview")}>
            <button
              className="popup-action-pill review-btn icon-only"
              onClick={() => openUrl(storeInfo.url)}>
              {storeInfo.icon || <StarIcon size={16} />}
            </button>
          </Tooltip>

          <Tooltip content={t("giveStar")}>
            <button
              className="popup-action-pill star-btn icon-only"
              onClick={() => openUrl(GITHUB_REPO_URL)}>
              <StarIcon size={16} />
            </button>
          </Tooltip>

          <Tooltip content={t("kofiSupport")}>
            <button
              className="popup-action-pill kofi-btn icon-only"
              onClick={() => openUrl(donateChannels.primaryUrl)}>
              <KofiIcon size={16} />
            </button>
          </Tooltip>

          <Tooltip content={t("joinDiscordCommunity")}>
            <button
              className="popup-action-pill discord-btn icon-only"
              aria-label={t("joinDiscordCommunity")}
              onClick={() => openUrl("https://discord.gg/rmPzb6Cx9u")}>
              <DiscordIcon size={16} />
            </button>
          </Tooltip>
        </div>
        <div className="popup-footer-links">
          <a
            href={`${GITHUB_REPO_URL}/issues`}
            target="_blank"
            rel="noopener noreferrer"
            className="popup-feedback-link">
            {t("popupFeedback")}
          </a>
        </div>
      </div>

      {/* Toast */}
      <div className={`popup-toast ${toastVisible ? "show" : ""}`}>{toastMessage}</div>
    </div>
  )
}

export default IndexPopup
