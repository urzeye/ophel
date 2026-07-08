import {
  DEFAULT_CLEAN_MODE,
  DEFAULT_PANEL_AVOIDANCE,
  DEFAULT_PAGE_WIDTH,
  DEFAULT_SITE_THEME,
  DEFAULT_USER_QUERY_WIDTH,
  DEFAULT_ZEN_MODE,
} from "~constants/default-settings"
import type {
  ModelLockConfig,
  PageWidthConfig,
  PanelAvoidanceSettings,
  Settings,
  SiteId,
  SiteThemeConfig,
  ZenModeConfig,
} from "~types/settings"

/**
 * 获取站点配置，如果不存在则返回默认配置
 */
export function getSiteTheme(settings: Settings, siteId: string): SiteThemeConfig {
  const sites = settings.theme?.sites
  if (sites && siteId in sites) {
    return sites[siteId as SiteId]
  }
  return sites?._default ?? DEFAULT_SITE_THEME
}

export function getSitePageWidth(settings: Settings, siteId: string): PageWidthConfig {
  const pageWidth = settings.layout?.pageWidth
  if (pageWidth && siteId in pageWidth) {
    return pageWidth[siteId]
  }
  return pageWidth?._default ?? DEFAULT_PAGE_WIDTH
}

export function getSiteModelLock(settings: Settings, siteId: string): ModelLockConfig {
  return settings.modelLock?.[siteId] ?? { enabled: false, keyword: "" }
}

export function getSiteUserQueryWidth(settings: Settings, siteId: string): PageWidthConfig {
  const userQueryWidth = settings.layout?.userQueryWidth
  if (userQueryWidth && siteId in userQueryWidth) {
    return userQueryWidth[siteId]
  }
  return userQueryWidth?._default ?? DEFAULT_USER_QUERY_WIDTH
}

export function getSiteZenMode(settings: Settings, siteId: string): ZenModeConfig {
  const zenMode = settings.layout?.zenMode
  if (zenMode && siteId in zenMode) {
    return zenMode[siteId]
  }
  return zenMode?._default ?? DEFAULT_ZEN_MODE
}

export function getSiteCleanMode(settings: Settings, siteId: string): ZenModeConfig {
  const cleanMode = settings.layout?.cleanMode
  if (cleanMode && siteId in cleanMode) {
    return cleanMode[siteId]
  }
  return cleanMode?._default ?? DEFAULT_CLEAN_MODE
}

export function getSitePanelAvoidance(settings: Settings, siteId: string): PanelAvoidanceSettings {
  const panelAvoidance = settings.layout?.panelAvoidance
  if (panelAvoidance && siteId in panelAvoidance) {
    return panelAvoidance[siteId]
  }
  return panelAvoidance?._default ?? DEFAULT_PANEL_AVOIDANCE
}
