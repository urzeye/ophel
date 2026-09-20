import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { resources } from "~locales/resources"

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")

const compact = (source: string): string => source.replace(/\s+/g, " ")

describe("tab order minimum enabled guard", () => {
  it("guards against disabling all tabs in GeneralPage", () => {
    const generalPageSource = compact(readSource("../../../src/tabs/options/pages/GeneralPage.tsx"))

    expect(generalPageSource).toContain("const enabledTabsCount = orderList.filter")
    expect(generalPageSource).toContain("const isOnlyEnabled = isEnabled && enabledTabsCount <= 1")
    expect(generalPageSource).toContain("if (isOnlyEnabled) {")
    expect(generalPageSource).toContain('showToast(t("tabOrderAtLeastOne"))')
    expect(generalPageSource).toContain("return")
  })

  it("ensures tabOrderAtLeastOne exists in all 11 supported app locales", () => {
    const localeKeys = Object.keys(resources) as Array<keyof typeof resources>
    expect(localeKeys).toHaveLength(11)

    for (const locale of localeKeys) {
      const translation = resources[locale] as Record<string, string>
      expect(translation.tabOrderAtLeastOne).toBeDefined()
      expect(typeof translation.tabOrderAtLeastOne).toBe("string")
      expect(translation.tabOrderAtLeastOne.trim().length).toBeGreaterThan(0)
    }
  })

  it("filters out legacy settings tab from features.order in normalizeSettings", async () => {
    const { normalizeSettings } = await import("~utils/settings-normalize")
    const { TAB_DEFINITIONS, TAB_IDS } = await import("~constants/ui")
    const { DEFAULT_SETTINGS } = await import("~constants/default-settings")

    expect("settings" in TAB_DEFINITIONS).toBe(false)
    expect("SETTINGS" in TAB_IDS).toBe(false)

    const normalized = normalizeSettings({
      features: {
        order: ["outline", "settings", "conversations", "prompts"],
      } as unknown as typeof DEFAULT_SETTINGS.features,
    })
    expect(normalized.features.order).toEqual(["outline", "conversations", "prompts"])

    const normalizedEmpty = normalizeSettings({
      features: {
        order: ["settings"],
      } as unknown as typeof DEFAULT_SETTINGS.features,
    })
    expect(normalizedEmpty.features.order).toEqual(DEFAULT_SETTINGS.features.order)

    // 缺少部分 Tab 时自动补齐缺失项，防止 Tab 永久丢失
    const normalizedPartial = normalizeSettings({
      features: {
        order: ["prompts", "settings"],
      } as unknown as typeof DEFAULT_SETTINGS.features,
    })
    expect(normalizedPartial.features.order).toEqual(["prompts", "outline", "conversations"])

    // 重复项去重与脏数据过滤
    const normalizedDuplicatesAndDirty = normalizeSettings({
      features: {
        order: ["outline", "unknown_tab", "outline", "prompts"],
      } as unknown as typeof DEFAULT_SETTINGS.features,
    })
    expect(normalizedDuplicatesAndDirty.features.order).toEqual([
      "outline",
      "prompts",
      "conversations",
    ])
  })
})
