import { describe, expect, it } from "vitest"

import { DEFAULT_SETTINGS } from "~constants/default-settings"
import { SITE_IDS } from "~constants"
import { normalizeSettings } from "~utils/settings-normalize"
import { isBuiltinSiteDisabled } from "~utils/settings-selectors"

describe("built-in site toggle", () => {
  it("defaults to an empty disabled list", () => {
    expect(DEFAULT_SETTINGS.disabledSites).toEqual([])
    expect(normalizeSettings({}).disabledSites).toEqual([])
  })

  it("keeps only valid built-in site IDs and dedupes", () => {
    const settings = normalizeSettings({
      disabledSites: [
        SITE_IDS.DOUBAO,
        SITE_IDS.DOUBAO,
        "not-a-site",
        42 as unknown as string,
        SITE_IDS.CHATGPT,
      ],
    })
    expect(settings.disabledSites).toEqual([SITE_IDS.DOUBAO, SITE_IDS.CHATGPT])
  })

  it("handles non-array dirty data", () => {
    expect(
      normalizeSettings({ disabledSites: "doubao" as unknown as string[] }).disabledSites,
    ).toEqual([])
    expect(normalizeSettings({ disabledSites: undefined }).disabledSites).toEqual([])
  })

  it("reports disabled state per site", () => {
    const settings = normalizeSettings({ disabledSites: [SITE_IDS.DOUBAO] })
    expect(isBuiltinSiteDisabled(settings, SITE_IDS.DOUBAO)).toBe(true)
    expect(isBuiltinSiteDisabled(settings, SITE_IDS.CHATGPT)).toBe(false)
    expect(isBuiltinSiteDisabled(null, SITE_IDS.DOUBAO)).toBe(false)
    expect(isBuiltinSiteDisabled(undefined, SITE_IDS.DOUBAO)).toBe(false)
  })
})
