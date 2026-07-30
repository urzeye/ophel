import { describe, expect, it } from "vitest"

import {
  createBackupDocument,
  createBackupRestorePlan,
  type BackupDocument,
} from "~core/backup-codec"
import { DEFAULT_SETTINGS } from "~constants/default-settings"
import type { PlatformStorage } from "~platform/types"
import type { Settings } from "~types/settings"

import { parsePersistedSettings } from "~utils/persisted-settings"
import { normalizeSettings } from "~utils/settings-normalize"
import {
  getSiteCleanMode,
  getSiteModelLock,
  getSitePageWidth,
  getSitePanelAvoidance,
  getSiteTheme,
  getSiteUserQueryWidth,
  getSiteZenMode,
} from "~utils/settings-selectors"

const DYNAMIC_SITE_ID = "pack:fixture-chat"

class MemoryStorage implements PlatformStorage {
  private readonly values = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value))
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key)
  }

  watch<T>(
    _key: string,
    _callback: (newValue: T | undefined, oldValue: T | undefined) => void,
  ): () => void {
    return () => undefined
  }
}

const createDynamicSettings = (): Settings => {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.theme.sites[DYNAMIC_SITE_ID] = {
    mode: "dark",
    lightStyleId: "warm-paper",
    darkStyleId: "midnight-blue",
  }
  settings.layout.pageWidth[DYNAMIC_SITE_ID] = { enabled: true, value: "67", unit: "%" }
  settings.layout.userQueryWidth[DYNAMIC_SITE_ID] = {
    enabled: true,
    value: "73",
    unit: "%",
  }
  settings.layout.zenMode ??= {}
  settings.layout.zenMode[DYNAMIC_SITE_ID] = { enabled: true, showExitButton: false }
  settings.layout.cleanMode ??= {}
  settings.layout.cleanMode[DYNAMIC_SITE_ID] = { enabled: false }
  settings.layout.panelAvoidance ??= {}
  settings.layout.panelAvoidance[DYNAMIC_SITE_ID] = { enabled: false }
  settings.modelLock[DYNAMIC_SITE_ID] = { enabled: true, keyword: "atlas-pro" }
  return settings
}

const expectDynamicSettings = (settings: Settings): void => {
  expect(getSiteTheme(settings, DYNAMIC_SITE_ID)).toEqual({
    mode: "dark",
    lightStyleId: "warm-paper",
    darkStyleId: "midnight-blue",
  })
  expect(getSitePageWidth(settings, DYNAMIC_SITE_ID)).toEqual({
    enabled: true,
    value: "67",
    unit: "%",
  })
  expect(getSiteUserQueryWidth(settings, DYNAMIC_SITE_ID)).toEqual({
    enabled: true,
    value: "73",
    unit: "%",
  })
  expect(getSiteZenMode(settings, DYNAMIC_SITE_ID)).toEqual({
    enabled: true,
    showExitButton: false,
  })
  expect(getSiteCleanMode(settings, DYNAMIC_SITE_ID)).toEqual({ enabled: false })
  expect(getSitePanelAvoidance(settings, DYNAMIC_SITE_ID)).toEqual({ enabled: false })
  expect(getSiteModelLock(settings, DYNAMIC_SITE_ID)).toEqual({
    enabled: true,
    keyword: "atlas-pro",
  })
}

describe("dynamic site settings", () => {
  it("preserves and reads every arbitrary site record after JSON normalization", () => {
    const source = createDynamicSettings()
    const normalized = normalizeSettings(JSON.parse(JSON.stringify(source)) as Settings)

    expectDynamicSettings(normalized)
    expect(normalized.theme.sites.chatgpt).toEqual(source.theme.sites.chatgpt)
    expect(normalized.layout.pageWidth.chatgpt).toEqual(source.layout.pageWidth.chatgpt)
  })

  it("keeps the complete dynamic key through settings backup and restore planning", async () => {
    const storage = new MemoryStorage()
    const source = createDynamicSettings()
    await storage.set("settings", JSON.stringify({ state: { settings: source }, version: 0 }))

    const backup = await createBackupDocument(storage, "settings", "2026-07-30T00:00:00.000Z")
    const serialized = JSON.parse(JSON.stringify(backup)) as BackupDocument
    const restorePlan = createBackupRestorePlan(serialized)
    const restoredInput = parsePersistedSettings(restorePlan.updates.settings)
    if (!restoredInput) throw new Error("Expected restored settings input")
    const restored = normalizeSettings(restoredInput)

    expect(restorePlan.restoredKeys).toEqual(["settings"])
    expect(restorePlan.ignoredKeys).toEqual([])
    expectDynamicSettings(restored)
    expect(Object.keys(restored.theme.sites)).toContain(DYNAMIC_SITE_ID)
  })
})
