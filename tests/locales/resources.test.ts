import { describe, expect, it } from "vitest"

import { resources } from "~locales/resources"

describe("locale resources", () => {
  it("keeps the same message keys in all 11 languages", () => {
    const expectedKeys = Object.keys(resources.en).sort()

    expect(Object.keys(resources)).toHaveLength(11)
    for (const [locale, messages] of Object.entries(resources)) {
      expect(Object.keys(messages).sort(), `${locale} locale keys differ from en`).toEqual(
        expectedKeys,
      )
    }
  })
})
