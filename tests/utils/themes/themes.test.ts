import { describe, expect, it } from "vitest"

import { darkPresets } from "~utils/themes/dark"
import { lightPresets } from "~utils/themes/light"

const REQUIRED_THEME_TOKENS = [
  "--gh-bg",
  "--gh-text",
  "--gh-border",
  "--gh-hover",
  "--gh-primary",
  "--gh-secondary",
  "--gh-danger",
  "--gh-overlay-bg",
  "--gh-input-focus-border",
  "--gh-input-focus-shadow",
] as const

describe("theme presets", () => {
  it("keeps the complete 12 light and 12 dark preset catalog", () => {
    expect(lightPresets).toHaveLength(12)
    expect(darkPresets).toHaveLength(12)
  })

  it("defines the required semantic primitives for every preset", () => {
    for (const preset of [...lightPresets, ...darkPresets]) {
      for (const token of REQUIRED_THEME_TOKENS) {
        expect(preset.variables[token], `${preset.id} is missing ${token}`).toBeTruthy()
      }
    }
  })
})
