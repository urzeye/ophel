import { describe, expect, it } from "vitest"

import { DEFAULT_SETTINGS } from "~constants/default-settings"

import { normalizeSettings } from "~utils/settings-normalize"

describe("normalizeSettings", () => {
  it("migrates legacy quick button fields without retaining duplicate sources", () => {
    const normalized = normalizeSettings({
      ...DEFAULT_SETTINGS,
      collapsedButtons: [{ id: "panel", enabled: false }],
      quickButtonsOpacity: 0.65,
      toolsMenu: ["copyMarkdown"],
      floatingToolbar: { open: false },
      quickButtons: undefined,
    })

    expect(normalized.quickButtons.opacity).toBe(0.65)
    expect(normalized.quickButtons.toolsMenu).toEqual(["copyMarkdown"])
    expect(normalized.quickButtons.floatingToolbar.open).toBe(false)
    expect(normalized.quickButtons.collapsed).toContainEqual({ id: "panel", enabled: false })
    expect(normalized).not.toHaveProperty("collapsedButtons")
    expect(normalized).not.toHaveProperty("quickButtonsOpacity")
  })

  it("normalizes legacy pixel widths to supported percentages", () => {
    const normalized = normalizeSettings({
      ...DEFAULT_SETTINGS,
      layout: {
        ...DEFAULT_SETTINGS.layout,
        pageWidth: {
          ...DEFAULT_SETTINGS.layout.pageWidth,
          _default: { enabled: true, value: "1200", unit: "px" },
        },
      },
    })

    expect(normalized.layout.pageWidth._default.unit).toBe("%")
    expect(Number(normalized.layout.pageWidth._default.value)).toBeGreaterThanOrEqual(50)
    expect(Number(normalized.layout.pageWidth._default.value)).toBeLessThanOrEqual(100)
  })
})
