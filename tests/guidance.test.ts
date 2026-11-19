import { describe, expect, it } from "vitest"

import {
  DEFAULT_GUIDANCE_ENTRY_STATE,
  decideShouldShowGuidance,
  GUIDANCE_RULES,
  normalizeGuidanceEntryState,
} from "~utils/guidance"

const DAY_MS = 24 * 60 * 60 * 1000
const nudgeRule = GUIDANCE_RULES["global-search-shortcut-nudge"]
const shimmerRule = GUIDANCE_RULES["export-entry-shimmer"]

describe("decideShouldShowGuidance", () => {
  const now = 10 * DAY_MS

  it("shows for a fresh state", () => {
    expect(decideShouldShowGuidance({ ...DEFAULT_GUIDANCE_ENTRY_STATE }, nudgeRule, now)).toBe(true)
  })

  it("never shows once dismissed", () => {
    expect(
      decideShouldShowGuidance(
        { ...DEFAULT_GUIDANCE_ENTRY_STATE, dismissed: true },
        nudgeRule,
        now,
      ),
    ).toBe(false)
  })

  it("stops once the action threshold is reached", () => {
    expect(
      decideShouldShowGuidance(
        { ...DEFAULT_GUIDANCE_ENTRY_STATE, actionCount: nudgeRule.autoDismissAfterActions },
        nudgeRule,
        now,
      ),
    ).toBe(false)
  })

  it("stops at maxShows", () => {
    expect(
      decideShouldShowGuidance({ ...DEFAULT_GUIDANCE_ENTRY_STATE, shownCount: 3 }, nudgeRule, now),
    ).toBe(false)
    expect(
      decideShouldShowGuidance({ ...DEFAULT_GUIDANCE_ENTRY_STATE, shownCount: 2 }, nudgeRule, now),
    ).toBe(true)
  })

  it("respects minIntervalMs between shows", () => {
    const base = { ...DEFAULT_GUIDANCE_ENTRY_STATE }
    expect(
      decideShouldShowGuidance({ ...base, lastShownAt: now - DAY_MS + 1 }, nudgeRule, now),
    ).toBe(false)
    expect(decideShouldShowGuidance({ ...base, lastShownAt: now - DAY_MS }, nudgeRule, now)).toBe(
      true,
    )
  })

  it("keeps the export shimmer visible until the first export action", () => {
    expect(
      decideShouldShowGuidance(
        { ...DEFAULT_GUIDANCE_ENTRY_STATE, shownCount: 999 },
        shimmerRule,
        now,
      ),
    ).toBe(true)
    expect(
      decideShouldShowGuidance(
        { ...DEFAULT_GUIDANCE_ENTRY_STATE, actionCount: 1 },
        shimmerRule,
        now,
      ),
    ).toBe(false)
  })
})

describe("normalizeGuidanceEntryState", () => {
  it("returns defaults for non-object input", () => {
    expect(normalizeGuidanceEntryState(undefined)).toEqual(DEFAULT_GUIDANCE_ENTRY_STATE)
    expect(normalizeGuidanceEntryState("junk")).toEqual(DEFAULT_GUIDANCE_ENTRY_STATE)
    expect(normalizeGuidanceEntryState(null)).toEqual(DEFAULT_GUIDANCE_ENTRY_STATE)
  })

  it("clamps invalid fields", () => {
    expect(
      normalizeGuidanceEntryState({
        shownCount: -3,
        lastShownAt: "x",
        dismissed: 1,
        actionCount: 2,
      }),
    ).toEqual({ shownCount: 0, lastShownAt: 0, dismissed: false, actionCount: 2 })
  })
})
