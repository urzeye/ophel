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
})
