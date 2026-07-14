import { describe, expect, it } from "vitest"

import {
  APPEARANCE_TAB_IDS,
  FEATURES_TAB_IDS,
  NAV_IDS,
  resolveSettingsNavigateDetail,
} from "~constants/ui"

describe("settings deep links", () => {
  it("resolves legacy setting aliases to the canonical page and tab", () => {
    expect(
      resolveSettingsNavigateDetail({
        settingId: "features.outline.preventAutoScroll",
      }),
    ).toEqual({
      page: NAV_IDS.FEATURES,
      subTab: FEATURES_TAB_IDS.OUTLINE,
      settingId: "outline-prevent-auto-scroll",
    })
  })

  it("routes global-search and appearance settings to their shared navigation pages", () => {
    expect(resolveSettingsNavigateDetail({ settingId: "globalSearch.enableFuzzySearch" })).toEqual({
      page: NAV_IDS.GLOBAL_SEARCH,
      subTab: undefined,
      settingId: "global-search-fuzzy-search",
    })

    expect(resolveSettingsNavigateDetail({ settingId: "appearance.presets.dark" })).toEqual({
      page: NAV_IDS.APPEARANCE,
      subTab: APPEARANCE_TAB_IDS.PRESETS,
      settingId: "appearance-preset-dark",
    })
  })

  it("keeps an explicit page override without leaking an unrelated inferred tab", () => {
    expect(
      resolveSettingsNavigateDetail({
        page: NAV_IDS.ABOUT,
        settingId: "outline-auto-update",
      }),
    ).toEqual({
      page: NAV_IDS.ABOUT,
      subTab: undefined,
      settingId: "outline-auto-update",
    })
  })
})
