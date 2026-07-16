import { describe, expect, it } from "vitest"

import { NAV_IDS } from "~constants/ui"
import { getSettingsNavigationItems } from "~constants/settings-navigation"

describe("settings navigation", () => {
  it("exposes the same complete navigation to both settings surfaces", () => {
    const itemIds = getSettingsNavigationItems(true).map((item) => item.id)

    expect(itemIds).toContain(NAV_IDS.APPEARANCE)
    expect(itemIds).toContain(NAV_IDS.GLOBAL_SEARCH)
    expect(itemIds).toContain(NAV_IDS.SHORTCUTS)
    expect(itemIds).toHaveLength(9)
  })

  it("only removes permissions when the platform cannot request them", () => {
    const itemIds = getSettingsNavigationItems(false).map((item) => item.id)

    expect(itemIds).not.toContain(NAV_IDS.PERMISSIONS)
    expect(itemIds).toHaveLength(8)
  })
})
