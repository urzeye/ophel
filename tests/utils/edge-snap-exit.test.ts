import { describe, expect, it } from "vitest"

import { resolveWindowExitSide, WINDOW_EXIT_EDGE_THRESHOLD_PX } from "~utils/edge-snap-exit"

describe("resolveWindowExitSide", () => {
  const viewportWidth = 1920

  it("returns left when the pointer exits at the left edge", () => {
    expect(resolveWindowExitSide(0, viewportWidth)).toBe("left")
    expect(resolveWindowExitSide(1, viewportWidth)).toBe("left")
  })

  it("returns right when the pointer exits at the right edge", () => {
    expect(resolveWindowExitSide(viewportWidth, viewportWidth)).toBe("right")
    expect(resolveWindowExitSide(viewportWidth - 1, viewportWidth)).toBe("right")
  })

  it("tolerates classic scrollbar width on the right edge", () => {
    expect(resolveWindowExitSide(viewportWidth - 17, viewportWidth)).toBe("right")
  })

  it("returns null when the exit point is away from both side edges", () => {
    expect(resolveWindowExitSide(viewportWidth / 2, viewportWidth)).toBe(null)
    expect(resolveWindowExitSide(200, viewportWidth)).toBe(null)
    expect(resolveWindowExitSide(viewportWidth - 200, viewportWidth)).toBe(null)
  })

  it("includes the threshold boundary itself", () => {
    expect(resolveWindowExitSide(WINDOW_EXIT_EDGE_THRESHOLD_PX, viewportWidth)).toBe("left")
    expect(
      resolveWindowExitSide(viewportWidth - WINDOW_EXIT_EDGE_THRESHOLD_PX, viewportWidth),
    ).toBe("right")
  })

  it("respects a custom threshold", () => {
    expect(resolveWindowExitSide(5, viewportWidth, 4)).toBe(null)
    expect(resolveWindowExitSide(5, viewportWidth, 8)).toBe("left")
  })
})
