import { describe, expect, it } from "vitest"

import { resources } from "./resources"
import { loadLocaleMessages } from "./loader"

describe("locale loader", () => {
  it("returns every locale synchronously for the MV3 background", () => {
    for (const locale of Object.keys(resources) as Array<keyof typeof resources>) {
      expect(loadLocaleMessages(locale)).toBe(resources[locale])
    }
  })
})
