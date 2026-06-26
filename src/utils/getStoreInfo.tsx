import React from "react"

import { ChromeIcon, EdgeIcon, FirefoxIcon, GreasyForkIcon } from "~components/icons/StoreIcons"
import { STORE_LINKS } from "~constants/store-links"
import type { ReactNode } from "react"
import { t } from "~utils/i18n"

// Inject platform type
declare const __PLATFORM__: "extension" | "userscript" | undefined

export interface StoreInfo {
  url: string
  icon: ReactNode
  label: string
}

export const isEdgeBrowser = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase()
  return userAgent.indexOf("edg/") > -1
}

export const getStoreInfo = (): StoreInfo => {
  // 1. Check if running as Userscript
  if (typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript") {
    return {
      url: STORE_LINKS.greasyFork,
      icon: <GreasyForkIcon size={14} />,
      label: t("reviewBtn"),
    }
  }

  // 2. Browser Extension: Check UserAgent
  const userAgent = navigator.userAgent.toLowerCase()
  if (userAgent.indexOf("firefox") > -1) {
    return {
      url: STORE_LINKS.firefox,
      icon: <FirefoxIcon size={14} />,
      label: t("reviewBtn"),
    }
  } else if (userAgent.indexOf("edg/") > -1) {
    // Microsoft Edge (Chromium-based) — UA contains "Edg/" not "Edge"
    return {
      url: STORE_LINKS.edge,
      icon: <EdgeIcon size={14} />,
      label: t("reviewBtn"),
    }
  } else {
    // Default to Chrome (includes Brave etc)
    return {
      url: STORE_LINKS.chrome,
      icon: <ChromeIcon size={14} />,
      label: t("reviewBtn"),
    }
  }
}
