import React from "react"

import { ChromeIcon, FirefoxIcon, GreasyForkIcon } from "~components/icons/StoreIcons"
import type { ReactNode } from "react"
import { t } from "~utils/i18n"

// Inject platform type
declare const __PLATFORM__: "extension" | "userscript" | undefined

export interface StoreInfo {
  url: string
  icon: ReactNode
  label: string
}

export const getStoreInfo = (): StoreInfo => {
  // 1. Check if running as Userscript
  if (typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "userscript") {
    return {
      url: "https://greasyfork.org/zh-CN/scripts/563646-ophel-ai-chat-page-enhancer",
      icon: <GreasyForkIcon size={14} />,
      label: t("reviewBtn") || "Review",
    }
  }

  // 2. Browser Extension: Check UserAgent
  const userAgent = navigator.userAgent.toLowerCase()
  if (userAgent.indexOf("firefox") > -1) {
    return {
      url: "https://addons.mozilla.org/zh-CN/firefox/addon/ophel-ai-chat-enhancer/",
      icon: <FirefoxIcon size={14} />,
      label: t("reviewBtn") || "Review",
    }
  } else {
    // Default to Chrome (includes Edge, Brave etc)
    return {
      url: "https://chromewebstore.google.com/detail/ophel-ai-%E5%AF%B9%E8%AF%9D%E5%A2%9E%E5%BC%BA%E5%B7%A5%E5%85%B7/lpcohdfbomkgepfladogodgeoppclakd",
      icon: <ChromeIcon size={14} />,
      label: t("reviewBtn") || "Review",
    }
  }
}
