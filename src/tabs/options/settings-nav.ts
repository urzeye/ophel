/**
 * 设置导航：设置弹窗与独立 Options 页共用的一级导航定义与窄屏两级导航状态
 */
import type React from "react"
import { useCallback, useState } from "react"

import {
  AboutIcon,
  AppearanceIcon,
  BackupIcon,
  FeaturesIcon,
  GeneralIcon,
  KeyboardIcon,
  PageContentIcon,
  SitePacksIcon,
} from "~components/icons"
import { NAV_IDS, SETTINGS_COMPACT_MEDIA_QUERY } from "~constants"
import { useMediaQuery } from "~hooks/useMediaQuery"

export interface SettingsNavItem {
  id: string
  Icon: React.ComponentType<{ size?: number }>
  labelKey: string
  label: string
  beta?: boolean
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: NAV_IDS.GENERAL, Icon: GeneralIcon, labelKey: "navGeneral", label: "General" },
  {
    id: NAV_IDS.APPEARANCE,
    Icon: AppearanceIcon,
    labelKey: "navAppearance",
    label: "Appearance",
  },
  { id: NAV_IDS.FEATURES, Icon: FeaturesIcon, labelKey: "navFeatures", label: "Features" },
  {
    id: NAV_IDS.SITE_SETTINGS,
    Icon: PageContentIcon,
    labelKey: "navSiteSettings",
    label: "Site Settings",
  },
  {
    id: NAV_IDS.SITE_PACKS,
    Icon: SitePacksIcon,
    labelKey: "navSitePacks",
    label: "Site Packs",
    beta: true,
  },
  { id: NAV_IDS.SHORTCUTS, Icon: KeyboardIcon, labelKey: "navShortcuts", label: "Shortcuts" },
  { id: NAV_IDS.BACKUP, Icon: BackupIcon, labelKey: "navBackup", label: "Data & Permissions" },
  { id: NAV_IDS.ABOUT, Icon: AboutIcon, labelKey: "navAbout", label: "About" },
]

export const isSettingsNavPage = (page: string, items: SettingsNavItem[] = SETTINGS_NAV_ITEMS) =>
  items.some((item) => item.id === page)

export type SettingsCompactPane = "nav" | "page"

/**
 * 窄屏下设置改为两屏：先选导航（侧栏全宽），再进入页面（顶部带返回）。
 * 宽屏时 pane 不参与布局，侧栏与页面并排。
 */
export function useSettingsCompactNav(initialPane: SettingsCompactPane = "nav") {
  const isCompact = useMediaQuery(SETTINGS_COMPACT_MEDIA_QUERY)
  const [pane, setPane] = useState<SettingsCompactPane>(initialPane)
  const showPage = useCallback(() => setPane("page"), [])
  const showNav = useCallback(() => setPane("nav"), [])

  return { isCompact, pane, showPage, showNav }
}
