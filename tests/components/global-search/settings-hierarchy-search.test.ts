import { describe, expect, it } from "vitest"

import {
  BACKUP_TAB_IDS,
  FEATURES_TAB_IDS,
  NAV_IDS,
  SETTINGS_SEARCH_ITEMS,
  SITE_PACKS_TAB_IDS,
  SITE_SETTINGS_TAB_IDS,
  resolveSettingsNavigateDetail,
  resolveSettingId,
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

    const geminiCardRoute = resolveSettingRoute("gemini-settings-card")
    expect(geminiCardRoute).toEqual({
      page: NAV_IDS.SITE_SETTINGS,
      subTab: "gemini",
    })

    const aistudioCardRoute = resolveSettingRoute("aistudio-settings-card")
    expect(aistudioCardRoute).toEqual({
      page: NAV_IDS.SITE_SETTINGS,
      subTab: "aistudio",
    })

    const chatgptCardRoute = resolveSettingRoute("chatgpt-settings-card")
    expect(chatgptCardRoute).toEqual({
      page: NAV_IDS.SITE_SETTINGS,
      subTab: "chatgpt",
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

    const permissionsRequiredCardRoute = resolveSettingRoute("permissions-required-card")
    expect(permissionsRequiredCardRoute).toEqual({
      page: NAV_IDS.PERMISSIONS,
    })

    const collapsedButtonsCardRoute = resolveSettingRoute("collapsed-buttons-order-card")
    expect(collapsedButtonsCardRoute).toEqual({
      page: NAV_IDS.GENERAL,
      subTab: "shortcuts",
    })

    const panelAvoidanceCardRoute = resolveSettingRoute("layout-panel-avoidance-card")
    expect(panelAvoidanceCardRoute).toEqual({
      page: NAV_IDS.SITE_SETTINGS,
      subTab: SITE_SETTINGS_TAB_IDS.LAYOUT,
    })

    const webdavProviderRoute = resolveSettingRoute("backup-webdav-provider")
    expect(webdavProviderRoute).toEqual({
      page: NAV_IDS.BACKUP,
      subTab: BACKUP_TAB_IDS.WEBDAV,
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

    const searchItemIds = new Set(SETTINGS_SEARCH_ITEMS.map((item) => item.settingId))
    expect(searchItemIds.has("site-pack-custom-origin")).toBe(true)
    expect(searchItemIds.has("remote-config-registry-source")).toBe(true)
    expect(searchItemIds.has("appearance-theme-sync")).toBe(false)
    expect(resolveSettingId("appearance-theme-sync")).toBe("appearance-sync-native-page-theme")
  })

  it("ensures page and subtab label definitions exist for all navigation targets", () => {
    for (const pageId of Object.values(NAV_IDS)) {
      expect(SETTING_SEARCH_PAGE_LABEL_DEFINITIONS[pageId]).toBeDefined()
      expect(SETTING_SEARCH_PAGE_LABEL_DEFINITIONS[pageId].key).toBeTruthy()
    }

    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.outline).toEqual({
      key: "tabOutline",
      fallback: "Outline",
    })
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.conversations).toEqual({
      key: "tabConversations",
      fallback: "Conversations",
    })
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.prompts).toEqual({
      key: "tabPrompts",
      fallback: "Prompts",
    })
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.content).toEqual({
      key: "navContent",
      fallback: "Content",
    })
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.layout).toEqual({
      key: "tabLayout",
      fallback: "Layout",
    })
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.gemini).toEqual({
      key: "globalSearchSiteGemini",
      fallback: "Gemini",
    })
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.aistudio).toEqual({
      key: "globalSearchSiteAIStudio",
      fallback: "AI Studio",
    })
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.chatgpt).toEqual({
      key: "globalSearchSiteChatGPT",
      fallback: "ChatGPT",
    })
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.claude).toEqual({
      key: "globalSearchSiteClaude",
      fallback: "Claude",
    })
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.webdav).toBeDefined()
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.installed).toBeDefined()

    // 确保二级 Tab 标题与内部卡片标题不同，避免搜索结果重名与面包屑套娃
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.outline.key).not.toBe(
      SETTING_SEARCH_TITLE_KEY_MAP["outline-settings-card"],
    )
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.conversations.key).not.toBe(
      SETTING_SEARCH_TITLE_KEY_MAP["conversations-settings-card"],
    )
    expect(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS.prompts.key).not.toBe(
      SETTING_SEARCH_TITLE_KEY_MAP["prompts-settings-card"],
    )
  })

  it("maps section cards and missing settings in title key map", () => {
    expect(SETTING_SEARCH_TITLE_KEY_MAP["site-packs-registry"]).toBe("sitePacksRegistryTitle")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["site-packs-local-import"]).toBe(
      "sitePacksLocalImportTitle",
    )
    expect(SETTING_SEARCH_TITLE_KEY_MAP["remote-config-registry-source"]).toBe(
      "remoteConfigRegistrySourceLabel",
    )
    expect(SETTING_SEARCH_TITLE_KEY_MAP["panel-settings-card"]).toBe("panelSettings")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["quick-buttons-card"]).toBe("quickButtonsBehaviorTitle")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["outline-settings-card"]).toBe("outlineSettings")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["gemini-settings-card"]).toBe("geminiSettingsTab")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["aistudio-settings-card"]).toBe("aistudioSettingsTitle")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["chatgpt-settings-card"]).toBe("chatgptSettingsTitle")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["layout-panel-avoidance-card"]).toBe("panelAvoidanceTitle")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["layout-page-width-card"]).toBe("layoutSettingsTitle")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["layout-user-query-width-card"]).toBe(
      "userQueryWidthSettings",
    )
    expect(SETTING_SEARCH_TITLE_KEY_MAP["layout-zen-mode-card"]).toBe("zenModeTitle")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["collapsed-buttons-order-card"]).toBe(
      "collapsedButtonsOrderTitle",
    )
    expect(SETTING_SEARCH_TITLE_KEY_MAP["permissions-required-card"]).toBe("requiredPermissions")
    expect(SETTING_SEARCH_TITLE_KEY_MAP["backup-webdav-provider"]).toBe("webdavProvider")
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

  it("verifies every settingId declared in options page JSX resolves to the correct page", async () => {
    const { readFileSync, readdirSync } = await import("node:fs")
    const { fileURLToPath } = await import("node:url")
    const path = await import("node:path")

    const pageToExpectedNav: Record<string, string> = {
      "GeneralPage.tsx": NAV_IDS.GENERAL,
      "FeaturesPage.tsx": NAV_IDS.FEATURES,
      "AppearancePage.tsx": NAV_IDS.APPEARANCE,
      "SiteSettingsPage.tsx": NAV_IDS.SITE_SETTINGS,
      "SitePacksPage.tsx": NAV_IDS.SITE_PACKS,
      "GlobalSearchPage.tsx": NAV_IDS.GLOBAL_SEARCH,
      "ShortcutsPage.tsx": NAV_IDS.SHORTCUTS,
      "BackupPage.tsx": NAV_IDS.BACKUP,
      "PermissionsPage.tsx": NAV_IDS.PERMISSIONS,
      "AboutPage.tsx": NAV_IDS.ABOUT,
    }

    const pagesDir = fileURLToPath(new URL("../../../src/tabs/options/pages", import.meta.url))
    const files = readdirSync(pagesDir)

    const mismatches: Array<{
      file: string
      settingId: string
      expected: string
      resolved?: string
    }> = []

    for (const file of files) {
      const expectedPage = pageToExpectedNav[file]
      if (!expectedPage) continue

      const content = readFileSync(path.join(pagesDir, file), "utf8")
      const regex = /(?:settingId|data-setting-id)=["']([^"']+)["']/g
      let match: RegExpExecArray | null
      while ((match = regex.exec(content)) !== null) {
        const settingId = match[1]
        if (settingId.includes("${")) continue
        const route = resolveSettingRoute(settingId)
        if (!route || route.page !== expectedPage) {
          mismatches.push({
            file,
            settingId,
            expected: expectedPage,
            resolved: route?.page,
          })
        }
      }
    }

    expect(mismatches).toEqual([])
  })

  it("ensures all title and label keys exist across all 11 locales in resources", async () => {
    const { resources } = await import("~locales/resources")
    const locales = Object.keys(resources)

    expect(locales.length).toBe(11)

    const keysToCheck = new Set<string>()

    for (const def of Object.values(SETTING_SEARCH_PAGE_LABEL_DEFINITIONS)) {
      keysToCheck.add(def.key)
    }
    for (const def of Object.values(SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS)) {
      keysToCheck.add(def.key)
    }
    for (const key of Object.values(SETTING_SEARCH_TITLE_KEY_MAP)) {
      keysToCheck.add(key)
    }

    const missingInLocales: Array<{ locale: string; missingKeys: string[] }> = []

    for (const locale of locales) {
      const translation = (resources as Record<string, Record<string, string>>)[locale]
      const missing = [...keysToCheck].filter((key) => !translation || !(key in translation))
      if (missing.length > 0) {
        missingInLocales.push({ locale, missingKeys: missing })
      }
    }

    expect(missingInLocales).toEqual([])
  })

  it("ensures all settingId declarations across options pages are globally unique", async () => {
    const { readFileSync, readdirSync } = await import("node:fs")
    const { fileURLToPath } = await import("node:url")
    const path = await import("node:path")

    const pagesDir = fileURLToPath(new URL("../../../src/tabs/options/pages", import.meta.url))
    const files = readdirSync(pagesDir).filter((f) => f.endsWith(".tsx"))

    const seen = new Map<string, string>()
    const duplicates: Array<{ id: string; file1: string; file2: string }> = []

    for (const file of files) {
      const content = readFileSync(path.join(pagesDir, file), "utf8")
      const regex = /(?:settingId|data-setting-id)=["']([^"']+)["']/g
      let match: RegExpExecArray | null
      const pageSeen = new Set<string>()
      while ((match = regex.exec(content)) !== null) {
        const id = match[1]
        if (id.includes("${")) continue
        // Same file is allowed only for known mutually exclusive conditional renders (e.g. panel-width in floating vs docked)
        if (seen.has(id) && seen.get(id) !== file) {
          duplicates.push({ id, file1: seen.get(id)!, file2: file })
        } else if (pageSeen.has(id) && id !== "panel-width") {
          duplicates.push({ id, file1: file, file2: file })
        }
        seen.set(id, file)
        pageSeen.add(id)
      }
    }

    expect(duplicates).toEqual([])
  })

  it("ensures every settingId declared in options pages can be resolved by global search", async () => {
    const { readFileSync, readdirSync } = await import("node:fs")
    const { fileURLToPath } = await import("node:url")
    const path = await import("node:path")

    const pagesDir = fileURLToPath(new URL("../../../src/tabs/options/pages", import.meta.url))
    const files = readdirSync(pagesDir).filter((f) => f.endsWith(".tsx"))

    const searchIds = new Set(SETTINGS_SEARCH_ITEMS.map((item) => item.settingId))
    const unsearchableIds: Array<{ id: string; file: string }> = []

    for (const file of files) {
      const content = readFileSync(path.join(pagesDir, file), "utf8")
      const regex = /(?:settingId|data-setting-id)=["']([^"']+)["']/g
      let match: RegExpExecArray | null
      while ((match = regex.exec(content)) !== null) {
        const id = match[1]
        if (id.includes("${")) continue
        const resolvedId = resolveSettingId(id)
        if (!resolvedId || (!searchIds.has(resolvedId) && !searchIds.has(id))) {
          unsearchableIds.push({ id, file })
        }
      }
    }

    expect(unsearchableIds).toEqual([])
  })

  it("ensures every subTab from resolveSettingRoute is defined in SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS", () => {
    const missingSubTabs = new Set<string>()

    for (const item of SETTINGS_SEARCH_ITEMS) {
      const route = resolveSettingRoute(item.settingId)
      if (route?.subTab) {
        if (!SETTING_SEARCH_SUB_TAB_LABEL_DEFINITIONS[route.subTab]) {
          missingSubTabs.add(route.subTab)
        }
      }
    }

    expect([...missingSubTabs]).toEqual([])
  })

  it("ensures all SETTINGS_SEARCH_ITEMS IDs are strictly unique", () => {
    const seen = new Set<string>()
    const duplicates: string[] = []

    for (const item of SETTINGS_SEARCH_ITEMS) {
      if (seen.has(item.settingId)) {
        duplicates.push(item.settingId)
      }
      seen.add(item.settingId)
    }

    expect(duplicates).toEqual([])
  })
})
