/**
 * Ophel Popup
 *
 * Displays site status, quick actions, and recent prompts
 */

import { useEffect, useState } from "react"

import { DiscordIcon } from "~components/icons/DiscordIcon"
import { KofiIcon } from "~components/icons/KofiIcon"
import { SettingsIcon } from "~components/icons/SettingsIcon"
import { StarIcon } from "~components/icons/StarIcon"
import { TimeIcon } from "~components/icons/TimeIcon"
import { SUPPORTED_AI_PLATFORMS } from "~constants/defaults"
import { Tooltip } from "~components/ui/Tooltip"
import { SITE_ICONS } from "~constants/site-icons"
import { getStoreInfo } from "~utils/getStoreInfo"
import { setLanguage, t } from "~utils/i18n"
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

function IndexPopup() {
  const [currentSite, setCurrentSite] = useState<SiteInfo | null>(null)
  const [recentPrompts, setRecentPrompts] = useState<Prompt[]>([])
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState("")
  const [languageReady, setLanguageReady] = useState(false)

  useEffect(() => {
    // Load language setting from storage first
    chrome.storage.local.get("settings", (data) => {
      try {
        const parsed = typeof data.settings === "string" ? JSON.parse(data.settings) : data.settings
        const lang = parsed?.state?.global?.language || "auto"
        setLanguage(lang)
      } catch (e) {
        console.error("Failed to load language setting:", e)
        setLanguage("auto")
      }
      setLanguageReady(true)
    })

    // Detect current tab's site
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url || ""
      const matchedSite = SUPPORTED_AI_PLATFORMS.find((site) => site.pattern.test(url))

      if (matchedSite) {
        setCurrentSite({ name: matchedSite.name, url: matchedSite.url, supported: true })
      } else {
        // Extract hostname for display
        try {
          const hostname = new URL(url).hostname || t("popupCurrentSite")
          setCurrentSite({ name: hostname, url: "", supported: false })
        } catch {
          setCurrentSite({ name: t("popupCurrentSite"), url: "", supported: false })
        }
      }
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
  }, [])

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

  const openOptionsPage = () => {
    // Use tabs.create as fallback for popup context
    const optionsUrl = chrome.runtime.getURL("tabs/options.html")
    chrome.tabs.create({ url: optionsUrl })
    window.close()
  }

  const openUrl = (url: string) => {
    chrome.tabs.create({ url })
    window.close()
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
            <button className="popup-settings-btn" onClick={openOptionsPage}>
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
              {SUPPORTED_AI_PLATFORMS.map((site) => (
                <Tooltip
                  key={site.id}
                  content={site.name}
                  triggerStyle={{ width: "100%", display: "flex" }}
                  triggerClassName="popup-tooltip-trigger">
                  <button className="popup-site-link" onClick={() => openUrl(site.url)}>
                    {SITE_ICONS[site.name] ? (
                      <img
                        src={SITE_ICONS[site.name]}
                        alt={site.name}
                        className="popup-site-icon"
                      />
                    ) : (
                      <span className="popup-site-emoji">{site.icon}</span>
                    )}
                    <span className="popup-site-title">{site.name}</span>
                  </button>
                </Tooltip>
              ))}
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
          <Tooltip content={t("rateAndReview") || "Love Ophel?"}>
            <button
              className="popup-action-pill review-btn icon-only"
              onClick={() => openUrl(storeInfo.url)}>
              {storeInfo.icon || <StarIcon size={16} />}
            </button>
          </Tooltip>

          <Tooltip content={t("giveStar") || "Star on GitHub"}>
            <button
              className="popup-action-pill star-btn icon-only"
              onClick={() => openUrl("https://github.com/urzeye/ophel")}>
              <StarIcon size={16} />
            </button>
          </Tooltip>

          <Tooltip content={t("kofiSupport") || "Buy Me a Coffee"}>
            <button
              className="popup-action-pill kofi-btn icon-only"
              onClick={() => openUrl("https://ko-fi.com/urzeye")}>
              <KofiIcon size={16} />
            </button>
          </Tooltip>

          <Tooltip content={t("discordCommunity") || "Discord 社区"}>
            <button
              className="popup-action-pill discord-btn icon-only"
              onClick={() => openUrl("https://discord.gg/79B2hFxR")}>
              <DiscordIcon size={16} />
            </button>
          </Tooltip>
        </div>
        <div className="popup-footer-links">
          <a
            href="https://github.com/urzeye/ophel/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="popup-feedback-link">
            {t("popupFeedback") || "反馈"}
          </a>
        </div>
      </div>

      {/* Toast */}
      <div className={`popup-toast ${toastVisible ? "show" : ""}`}>{toastMessage}</div>
    </div>
  )
}

export default IndexPopup
