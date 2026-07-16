import {
  AboutIcon,
  AppearanceIcon,
  BackupIcon,
  FeaturesIcon,
  GeneralIcon,
  KeyboardIcon,
  PageContentIcon,
  PermissionsIcon,
  SearchIcon,
} from "~components/icons"

import { NAV_IDS } from "./ui"

export const SETTINGS_NAV_ITEMS = [
  { id: NAV_IDS.GENERAL, Icon: GeneralIcon, labelKey: "navGeneral" },
  { id: NAV_IDS.APPEARANCE, Icon: AppearanceIcon, labelKey: "navAppearance" },
  { id: NAV_IDS.FEATURES, Icon: FeaturesIcon, labelKey: "navFeatures" },
  { id: NAV_IDS.SITE_SETTINGS, Icon: PageContentIcon, labelKey: "navSiteSettings" },
  { id: NAV_IDS.GLOBAL_SEARCH, Icon: SearchIcon, labelKey: "navGlobalSearch" },
  { id: NAV_IDS.SHORTCUTS, Icon: KeyboardIcon, labelKey: "navShortcuts" },
  { id: NAV_IDS.BACKUP, Icon: BackupIcon, labelKey: "navBackup" },
  {
    id: NAV_IDS.PERMISSIONS,
    Icon: PermissionsIcon,
    labelKey: "navPermissions",
    requiresPermissions: true,
  },
  { id: NAV_IDS.ABOUT, Icon: AboutIcon, labelKey: "navAbout" },
] as const

export function getSettingsNavigationItems(hasPermissions: boolean) {
  return SETTINGS_NAV_ITEMS.filter(
    (item) => !("requiresPermissions" in item && item.requiresPermissions && !hasPermissions),
  )
}
