import { describe, expect, it } from "vitest"

import {
  BACKUP_TAB_IDS,
  FEATURES_TAB_IDS,
  NAV_IDS,
  SETTINGS_SEARCH_ITEMS,
  SITE_PACKS_TAB_IDS,
  SITE_SETTINGS_TAB_IDS,
  resolveSettingsNavigateDetail,
  resolveSettingRoute,
} from "~constants"
import {
  SETTING_SEARCH_PAGE_LABEL_DEFINITIONS,
  SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS,
  SETTING_SEARCH_TITLE_KEY_MAP,
} from "~components/global-search/settingsSearch"

describe("settings hierarchy search & route resolution", () => {
  it("resolves route for page-level tab search items", () => {
    const generalRoute = resolveSettingRoute("page-general")
    expect(generalRoute).toEqual({ page: NAV_IDS.GENERAL })

    const featuresRoute = resolveSettingRoute("page-features")
    expect(featuresRoute).toEqual({ page: NAV_IDS.FEATURES })

    const backupRoute = resolveSettingRoute("page-backup")
    expect(backupRoute).toEqual({ page: NAV_IDS.BACKUP })

    const sitePacksRoute = resolveSettingRoute("page-site-packs")
    expect(sitePacksRoute).toEqual({ page: NAV_IDS.SITE_PACKS })
  })

  it("resolves route for subtab search items", () => {
    const outlineRoute = resolveSettingRoute("subtab-features-outline")
    expect(outlineRoute).toEqual({
      page: NAV_IDS.FEATURES,
      subTab: FEATURES_TAB_IDS.OUTLINE,
    })

    const webdavRoute = resolveSettingRoute("subtab-backup-webdav")
    expect(webdavRoute).toEqual({
      page: NAV_IDS.BACKUP,
      subTab: BACKUP_TAB_IDS.WEBDAV,
    })

    const installedRoute = resolveSettingRoute("subtab-site-packs-installed")
    expect(installedRoute).toEqual({
      page: NAV_IDS.SITE_PACKS,
      subTab: SITE_PACKS_TAB_IDS.INSTALLED,
    })

    const layoutRoute = resolveSettingRoute("subtab-site-settings-layout")
    expect(layoutRoute).toEqual({
      page: NAV_IDS.SITE_SETTINGS,
      subTab: SITE_SETTINGS_TAB_IDS.LAYOUT,
    })
  })

  it("resolves route for setting cards / sections", () => {
    const registryRoute = resolveSettingRoute("site-packs-registry")
    expect(registryRoute).toEqual({
      page: NAV_IDS.SITE_PACKS,
      subTab: SITE_PACKS_TAB_IDS.UPDATES,
    })

    const tabBehaviorRoute = resolveSettingRoute("tab-behavior-card")
    expect(tabBehaviorRoute).toEqual({
      page: NAV_IDS.FEATURES,
      subTab: FEATURES_TAB_IDS.TAB_SETTINGS,
    })

    const cleanModeRoute = resolveSettingRoute("layout-clean-mode-card")
    expect(cleanModeRoute).toEqual({
      page: NAV_IDS.SITE_SETTINGS,
      subTab: SITE_SETTINGS_TAB_IDS.LAYOUT,
    })

    const webdavCardRoute = resolveSettingRoute("backup-webdav-card")
    expect(webdavCardRoute).toEqual({
      page: NAV_IDS.BACKUP,
      subTab: BACKUP_TAB_IDS.WEBDAV,
    })

    const shortcutsCardRoute = resolveSettingRoute("shortcuts-global-card")
    expect(shortcutsCardRoute).toEqual({
      page: NAV_IDS.SHORTCUTS,
    })

    const permissionsCardRoute = resolveSettingRoute("permissions-optional-card")
    expect(permissionsCardRoute).toEqual({
      page: NAV_IDS.PERMISSIONS,
    })
  })

  it("clears settingId when resolving navigation detail for page or subtab targets", () => {
    const pageNav = resolveSettingsNavigateDetail({ settingId: "page-features" })
    expect(pageNav).toEqual({
      page: NAV_IDS.FEATURES,
      subTab: undefined,
      settingId: undefined,
    })

    const subTabNav = resolveSettingsNavigateDetail({ settingId: "subtab-features-prompts" })
    expect(subTabNav).toEqual({
      page: NAV_IDS.FEATURES,
      subTab: FEATURES_TAB_IDS.PROMPTS,
      settingId: undefined,
    })

    const cardNav = resolveSettingsNavigateDetail({ settingId: "site-packs-registry" })
    expect(cardNav).toEqual({
      page: NAV_IDS.SITE_PACKS,
      subTab: SITE_PACKS_TAB_IDS.UPDATES,
      settingId: "site-packs-registry",
    })

    const leafNav = resolveSettingsNavigateDetail({ settingId: "backup-webdav-url" })
    expect(leafNav).toEqual({
      page: NAV_IDS.BACKUP,
      subTab: BACKUP_TAB_IDS.WEBDAV,
      settingId: "backup-webdav-url",
    })
  })

  it("ensures all SETTINGS_SEARCH_ITEMS have valid route mapping and titles", () => {
    const unroutableItems: string[] = []

    for (const item of SETTINGS_SEARCH_ITEMS) {
      const route = resolveSettingRoute(item.settingId)
      if (!route) {
        unroutableItems.push(item.settingId)
      }
      expect(item.title.length).toBeGreaterThan(0)
      expect(item.keywords.length).toBeGreaterThan(0)
    }

    expect(unroutableItems).toEqual([])
  })

  it("ensures page and subtab label definitions exist for all navigation targets", () => {
    for (const pageId of Object.values(NAV_IDS)) {
      expect(SETTING_SEARCH_PAGE_LABEL_DEFINITIONS[pageId]).toBeDefined()
      expect(SETTING_SEARCH_PAGE_LABEL_DEFINITIONS[pageId].key).toBeTruthy()
    }

    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.outline).toBeDefined()
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.conversations).toBeDefined()
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.prompts).toBeDefined()
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.webdav).toBeDefined()
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.installed).toBeDefined()
  })

  it("maps section cards and missing settings in title key map", () => {
    expect(SETTING_SEARCH_TITLE_KEY_MAP["site-packs-registry"]).toBe("sitePacksRegistryTitle")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["panel-settings-card"]).toBe("panelSettings")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["outline-settings-card"]).toBe("outlineSettings")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["tab-behavior-card"]).toBe("tabBehaviorTitle")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["tab-privacy-card"]).toBe("privacyModeTitle")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["backup-webdav-card"]).toBe("webdavConfig")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["backup-webdav-url"]).toBe("webdavAddress")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["chatgpt-code-block-batch-mount"]).toBe(
      "chatgptCodeBlockBatchMountLabel",
    )
  })

  it("suppresses focus outline on modal title and container in settings.css", async () => {
    const { readFileSync } = await import("node:fs")
    const { fileURLToPath } = await import("node:url")
    const css = readFileSync(
      fileURLToPath(new URL("../../../src/styles/settings.css", import.meta.url)),
      "utf8",
    )

    expect(css).toMatch(/\.settings-sidebar-logo\s+span[\s\S]*?outline:\s*none/)
    expect(css).toMatch(/#ophel-settings-modal-title[\s\S]*?outline:\s*none/)
    expect(css).toMatch(/\.settings-modal-container[\s\S]*?outline:\s*none/)
  })
})
