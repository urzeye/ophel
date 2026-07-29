import { describe, expect, it } from "vitest"

import { validateSitePackManifest } from "./validate"

const createValidManifest = () => ({
  schemaVersion: 1,
  id: "test-pack",
  version: 1,
  minAppVersion: "1.1.8",
  name: "Test Pack",
  matches: ["https://chat.example.com/*"],
  capabilities: ["outline"],
  selectors: {
    responseContainer: "main",
  },
})

describe("validateSitePackManifest", () => {
  it("accepts a minimal valid SitePack", () => {
    const result = validateSitePackManifest(createValidManifest())

    expect(result.valid).toBe(true)
    if (!result.valid) throw new Error("Expected the fixture to be valid")
    expect(result.value.id).toBe("test-pack")
  })

  it("returns a structured error for unknown keys", () => {
    const result = validateSitePackManifest({
      ...createValidManifest(),
      unexpected: true,
    })

    expect(result.valid).toBe(false)
    if (result.valid) throw new Error("Expected the fixture to be invalid")
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        path: "$.unexpected",
        code: "unknown_key",
      }),
    )
  })

  it("rejects CSS-escaped url tokens", () => {
    const result = validateSitePackManifest({
      ...createValidManifest(),
      capabilities: ["outline", "width"],
      widthSelectors: [
        {
          selector: "main",
          property: "max-width",
          extraCss: "background: \\75 rl(https://evil.example)",
        },
      ],
    })

    expect(result.valid).toBe(false)
    if (result.valid) throw new Error("Expected the fixture to be invalid")
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        path: "$.widthSelectors[0].extraCss",
        code: "unsafe_css",
      }),
    )
  })
})
