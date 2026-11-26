import { describe, expect, it } from "vitest"

import {
  getExportImageContentHeight,
  IMAGE_EXPORT_MAX_PAGES,
  isWithinExportImageBudget,
  planExportImageSlices,
} from "../src/utils/export-image-layout"

describe("image export pagination", () => {
  it("keeps short content in one image", () => {
    expect(planExportImageSlices(640.2, [200, 400], 3200)).toEqual([{ start: 0, end: 641 }])
  })

  it("prefers content boundaries without introducing gaps or overlap", () => {
    const pages = planExportImageSlices(7500, [3100, 6200, 200, 400], 3200)
    expect(pages).toEqual([
      { start: 0, end: 3100 },
      { start: 3100, end: 6200 },
      { start: 6200, end: 7500 },
    ])
  })

  it("bounds each canvas even for a single oversized block", () => {
    const pages = planExportImageSlices(18000, [], 3200)
    expect(pages[0].start).toBe(0)
    expect(pages.at(-1)?.end).toBe(18000)
    for (const [index, page] of pages.entries()) {
      expect(page.end - page.start).toBeLessThanOrEqual(3200)
      if (index) expect(page.start).toBe(pages[index - 1].end)
    }
  })

  it("ignores invalid and out of range breakpoints", () => {
    expect(planExportImageSlices(6000, [NaN, Infinity, -1, 0, 9000, 3000, 3000], 3200)).toEqual([
      { start: 0, end: 3000 },
      { start: 3000, end: 6000 },
    ])
  })

  it("rejects invalid geometry and excessive output before allocating canvases", () => {
    for (const height of [0, -1, NaN, Infinity])
      expect(() => planExportImageSlices(height, [], 3200)).toThrow(RangeError)
    expect(() => planExportImageSlices(3200 * (IMAGE_EXPORT_MAX_PAGES + 1), [], 3200)).toThrow(
      RangeError,
    )
  })

  it("allows a long image past the old 3200px threshold when it fits the budget", () => {
    expect(isWithinExportImageBudget(800, 4600, 2)).toBe(true)
    expect(getExportImageContentHeight(800, 2, 300)).toBe(4700)
  })

  it("accounts for both pixel area and maximum side at each resolution", () => {
    expect(isWithinExportImageBudget(800, 5000, 2)).toBe(true)
    expect(isWithinExportImageBudget(800, 5000.1, 2)).toBe(false)
    expect(isWithinExportImageBudget(800, 8000, 2)).toBe(false)
    expect(isWithinExportImageBudget(800, 8000, 1)).toBe(true)
    expect(getExportImageContentHeight(800, 1, 300)).toBe(15700)
    expect(isWithinExportImageBudget(800, 16001, 1)).toBe(false)
  })

  it("includes branding and frame height when planning automatic splitting", () => {
    const maxContent = getExportImageContentHeight(800, 2, 397.5)
    const pages = planExportImageSlices(12000, [4000, 8000], maxContent)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.at(-1)?.end).toBe(12000)
    for (const page of pages) {
      expect(isWithinExportImageBudget(800, page.end - page.start + 397.5, 2)).toBe(true)
    }
    expect(getExportImageContentHeight(800, 2, 5000)).toBe(0)
    expect(() => getExportImageContentHeight(0, 2, 300)).toThrow(RangeError)
  })
})
