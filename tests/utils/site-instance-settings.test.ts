import { describe, expect, it } from "vitest"

import { DEFAULT_SETTINGS } from "~constants/default-settings"
import type { Settings } from "~types/settings"

import {
  getSiteCleanMode,
  getSiteModelLock,
  getSitePageWidth,
  getSitePanelAvoidance,
  getSiteTheme,
  getSiteUserQueryWidth,
  getSiteZenMode,
} from "~utils/settings-selectors"
import { migrateLegacySiteSettings } from "~utils/settings-normalize"
import { createSiteInstanceKey } from "~utils/site-identity"

const PACK_SITE_ID = "pack:shared-chat"
const FIRST_INSTANCE = createSiteInstanceKey(PACK_SITE_ID, "https://one.example")
const SECOND_INSTANCE = createSiteInstanceKey(PACK_SITE_ID, "https://two.example")

const createIsolatedSettings = (): Settings => {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.theme.sites[FIRST_INSTANCE] = {
    mode: "dark",
    lightStyleId: "warm-paper",
    darkStyleId: "midnight-blue",
  }
  settings.theme.sites[SECOND_INSTANCE] = {
    mode: "light",
    lightStyleId: "minimal",
    darkStyleId: "minimal-dark",
  }
  settings.layout.pageWidth[FIRST_INSTANCE] = { enabled: true, value: "61", unit: "%" }
  settings.layout.pageWidth[SECOND_INSTANCE] = { enabled: true, value: "83", unit: "%" }
  settings.layout.userQueryWidth[FIRST_INSTANCE] = { enabled: true, value: "57", unit: "%" }
  settings.layout.userQueryWidth[SECOND_INSTANCE] = { enabled: false, value: "74", unit: "%" }
  settings.layout.zenMode ??= {}
  settings.layout.zenMode[FIRST_INSTANCE] = { enabled: true, showExitButton: false }
  settings.layout.zenMode[SECOND_INSTANCE] = { enabled: false, showExitButton: true }
  settings.layout.cleanMode ??= {}
  settings.layout.cleanMode[FIRST_INSTANCE] = { enabled: false }
  settings.layout.cleanMode[SECOND_INSTANCE] = { enabled: true }
  settings.layout.panelAvoidance ??= {}
  settings.layout.panelAvoidance[FIRST_INSTANCE] = { enabled: false }
  settings.layout.panelAvoidance[SECOND_INSTANCE] = { enabled: true }
  settings.modelLock[FIRST_INSTANCE] = { enabled: true, keyword: "one-model" }
  settings.modelLock[SECOND_INSTANCE] = { enabled: false, keyword: "two-model" }
  return settings
}

describe("site instance settings", () => {
  it("keeps every per-site setting isolated between two origins of one SitePack", () => {
    const settings = createIsolatedSettings()

    expect(getSiteTheme(settings, FIRST_INSTANCE).mode).toBe("dark")
    expect(getSiteTheme(settings, SECOND_INSTANCE).mode).toBe("light")
    expect(getSitePageWidth(settings, FIRST_INSTANCE).value).toBe("61")
    expect(getSitePageWidth(settings, SECOND_INSTANCE).value).toBe("83")
    expect(getSiteUserQueryWidth(settings, FIRST_INSTANCE)).toMatchObject({
      enabled: true,
      value: "57",
    })
    expect(getSiteUserQueryWidth(settings, SECOND_INSTANCE)).toMatchObject({
      enabled: false,
      value: "74",
    })
    expect(getSiteZenMode(settings, FIRST_INSTANCE)).toEqual({
      enabled: true,
      showExitButton: false,
    })
    expect(getSiteZenMode(settings, SECOND_INSTANCE)).toEqual({
      enabled: false,
      showExitButton: true,
    })
    expect(getSiteCleanMode(settings, FIRST_INSTANCE)).toEqual({ enabled: false })
    expect(getSiteCleanMode(settings, SECOND_INSTANCE)).toEqual({ enabled: true })
    expect(getSitePanelAvoidance(settings, FIRST_INSTANCE)).toEqual({ enabled: false })
    expect(getSitePanelAvoidance(settings, SECOND_INSTANCE)).toEqual({ enabled: true })
    expect(getSiteModelLock(settings, FIRST_INSTANCE)).toEqual({
      enabled: true,
      keyword: "one-model",
    })
    expect(getSiteModelLock(settings, SECOND_INSTANCE)).toEqual({
      enabled: false,
      keyword: "two-model",
    })
  })

  it("moves legacy pack-level records without overwriting an existing instance value", () => {
    const source = structuredClone(DEFAULT_SETTINGS)
    source.theme.sites[PACK_SITE_ID] = {
      mode: "dark",
      lightStyleId: "legacy-light",
      darkStyleId: "legacy-dark",
    }
    source.theme.sites[FIRST_INSTANCE] = {
      mode: "light",
      lightStyleId: "instance-light",
      darkStyleId: "instance-dark",
    }
    source.layout.pageWidth[PACK_SITE_ID] = { enabled: true, value: "64", unit: "%" }
    source.layout.userQueryWidth[PACK_SITE_ID] = { enabled: true, value: "69", unit: "%" }
    source.layout.zenMode ??= {}
    source.layout.zenMode[PACK_SITE_ID] = { enabled: true, showExitButton: false }
    source.layout.cleanMode ??= {}
    source.layout.cleanMode[PACK_SITE_ID] = { enabled: false }
    source.layout.panelAvoidance ??= {}
    source.layout.panelAvoidance[PACK_SITE_ID] = { enabled: false }
    source.modelLock[PACK_SITE_ID] = { enabled: true, keyword: "legacy-model" }

    const migrated = migrateLegacySiteSettings(source, PACK_SITE_ID, FIRST_INSTANCE)

    expect(getSiteTheme(migrated, FIRST_INSTANCE)).toEqual({
      mode: "light",
      lightStyleId: "instance-light",
      darkStyleId: "instance-dark",
    })
    expect(getSitePageWidth(migrated, FIRST_INSTANCE)).toMatchObject({ value: "64" })
    expect(getSiteUserQueryWidth(migrated, FIRST_INSTANCE)).toMatchObject({ value: "69" })
    expect(getSiteZenMode(migrated, FIRST_INSTANCE)).toEqual({
      enabled: true,
      showExitButton: false,
    })
    expect(getSiteCleanMode(migrated, FIRST_INSTANCE)).toEqual({ enabled: false })
    expect(getSitePanelAvoidance(migrated, FIRST_INSTANCE)).toEqual({ enabled: false })
    expect(getSiteModelLock(migrated, FIRST_INSTANCE)).toEqual({
      enabled: true,
      keyword: "legacy-model",
    })

    const records = [
      migrated.theme.sites,
      migrated.layout.pageWidth,
      migrated.layout.userQueryWidth,
      migrated.layout.zenMode,
      migrated.layout.cleanMode,
      migrated.layout.panelAvoidance,
      migrated.modelLock,
    ]
    records.forEach((record) => {
      expect(record).not.toHaveProperty(PACK_SITE_ID)
    })
    expect(source.theme.sites).toHaveProperty(PACK_SITE_ID)
  })
})
