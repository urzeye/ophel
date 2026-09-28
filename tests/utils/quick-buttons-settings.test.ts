import { describe, expect, it } from "vitest"

import { DEFAULT_QUICK_BUTTONS_SETTINGS, DEFAULT_SETTINGS } from "~constants/default-settings"
import { normalizeSettings } from "~utils/settings-normalize"

describe("quickButtons hideWhenPanelOpen setting default", () => {
  it("defaults hideWhenPanelOpen to true in DEFAULT_QUICK_BUTTONS_SETTINGS and DEFAULT_SETTINGS", () => {
    expect(DEFAULT_QUICK_BUTTONS_SETTINGS.hideWhenPanelOpen).toBe(true)
    expect(DEFAULT_SETTINGS.quickButtons.hideWhenPanelOpen).toBe(true)
  })

  it("normalizes empty or partial settings to have hideWhenPanelOpen true by default", () => {
    const normalizedEmpty = normalizeSettings({})
    expect(normalizedEmpty.quickButtons.hideWhenPanelOpen).toBe(true)

    const normalizedWithEmptyQuickButtons = normalizeSettings({ quickButtons: {} })
    expect(normalizedWithEmptyQuickButtons.quickButtons.hideWhenPanelOpen).toBe(true)
  })

  it("preserves explicit hideWhenPanelOpen boolean values", () => {
    const normalizedFalse = normalizeSettings({ quickButtons: { hideWhenPanelOpen: false } })
    expect(normalizedFalse.quickButtons.hideWhenPanelOpen).toBe(false)

    const normalizedTrue = normalizeSettings({ quickButtons: { hideWhenPanelOpen: true } })
    expect(normalizedTrue.quickButtons.hideWhenPanelOpen).toBe(true)
  })
})
