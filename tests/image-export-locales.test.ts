import { describe, expect, it } from "vitest"

import { resources } from "../src/locales/resources"

const keys = Object.keys(resources.en).filter(
  (key) => key === "exportToImage" || key.startsWith("imageExport"),
)
const placeholders = (value: string) =>
  [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort()

describe("image export translations", () => {
  for (const [language, messages] of Object.entries(resources)) {
    it(`provides every image export label and interpolation in ${language}`, () => {
      for (const key of keys) {
        const value = (messages as Record<string, string>)[key]
        expect(value, key).toBeTruthy()
        expect(placeholders(value), key).toEqual(
          placeholders((resources.en as Record<string, string>)[key]),
        )
      }
    })
  }
})
