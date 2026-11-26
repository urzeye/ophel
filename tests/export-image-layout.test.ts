import { describe, expect, it } from "vitest"

import { IMAGE_EXPORT_MAX_PAGES, planExportImageSlices } from "../src/utils/export-image-layout"

describe("image export pagination", () => {
  it("keeps short content in one image", () => {
    expect(planExportImageSlices(640.2, [200, 400])).toEqual([{ start: 0, end: 641 }])
  })

  it("prefers content boundaries without introducing gaps or overlap", () => {
    const pages = planExportImageSlices(7500, [3100, 6200, 200, 400])
    expect(pages).toEqual([
      { start: 0, end: 3100 },
      { start: 3100, end: 6200 },
      { start: 6200, end: 7500 },
    ])
  })

  it("bounds each canvas even for a single oversized block", () => {
    const pages = planExportImageSlices(18000, [])
    expect(pages[0].start).toBe(0)
    expect(pages.at(-1)?.end).toBe(18000)
    for (const [index, page] of pages.entries()) {
      expect(page.end - page.start).toBeLessThanOrEqual(3200)
      if (index) expect(page.start).toBe(pages[index - 1].end)
    }
  })

  it("ignores invalid and out of range breakpoints", () => {
    expect(planExportImageSlices(6000, [NaN, Infinity, -1, 0, 9000, 3000, 3000])).toEqual([
      { start: 0, end: 3000 },
      { start: 3000, end: 6000 },
    ])
  })

  it("rejects invalid geometry and excessive output before allocating canvases", () => {
    for (const height of [0, -1, NaN, Infinity])
      expect(() => planExportImageSlices(height, [])).toThrow(RangeError)
    expect(() => planExportImageSlices(3200 * (IMAGE_EXPORT_MAX_PAGES + 1), [])).toThrow(RangeError)
  })
})
