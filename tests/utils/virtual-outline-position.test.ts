import { describe, expect, it } from "vitest"

import {
  estimateGroupedVirtualTops,
  estimateVirtualSlotTop,
  type VirtualPositionAnchor,
} from "~utils/virtual-outline-position"

const bounds = { endSlot: 10, endTop: 9000 }

describe("estimateVirtualSlotTop", () => {
  it("places the first slot at the top and the last slot before the bottom", () => {
    expect(estimateVirtualSlotTop(0, [], bounds)).toBe(0)
    const last = estimateVirtualSlotTop(9, [], bounds)
    expect(last).toBeGreaterThan(8000)
    expect(last).toBeLessThanOrEqual(9000)
    expect(estimateVirtualSlotTop(9.9, [], bounds)).toBeGreaterThan(last)
  })

  it("keeps unmounted slots outside a measured middle window", () => {
    // 中间挂着第 4 条：顶边 4000，底边记在下一个序号上
    const anchors: VirtualPositionAnchor[] = [
      { index: 4, top: 4000 },
      { index: 5, top: 7000 },
    ]

    expect(estimateVirtualSlotTop(0, anchors, bounds)).toBe(0)
    expect(estimateVirtualSlotTop(3, anchors, bounds)).toBeLessThan(4000)
    expect(estimateVirtualSlotTop(4, anchors, bounds)).toBe(4000)
    expect(estimateVirtualSlotTop(5, anchors, bounds)).toBe(7000)
    expect(estimateVirtualSlotTop(9, anchors, bounds)).toBeGreaterThan(7000)
    expect(estimateVirtualSlotTop(9, anchors, bounds)).toBeLessThanOrEqual(9000)
  })

  it("does not let a later anchor move backwards", () => {
    const anchors: VirtualPositionAnchor[] = [
      { index: 4, top: 4000 },
      { index: 6, top: 1000 },
    ]
    expect(estimateVirtualSlotTop(6, anchors, bounds)).toBeGreaterThanOrEqual(4000)
  })
})

describe("estimateGroupedVirtualTops", () => {
  it("orders headings inside one message and still reaches the real ends", () => {
    const items = [
      { index: 0, order: 0 },
      { index: 4, order: 0 },
      { index: 4, order: 1 },
      { index: 9, order: 2 },
      { index: 9, order: 0 },
    ]
    const anchors: VirtualPositionAnchor[] = [
      { index: 4, top: 4000 },
      { index: 5, top: 7000 },
    ]
    const tops = estimateGroupedVirtualTops(items, anchors, bounds)

    expect(tops[0]).toBe(0)
    expect(tops[1]).toBeLessThan(tops[2])
    expect(tops[2]).toBeLessThan(7000)
    expect(tops[4]).toBeLessThan(tops[3])
    expect(tops[3]).toBeGreaterThan(7000)
    expect(tops[3]).toBeLessThanOrEqual(9000)

    const ordered = [tops[0], tops[1], tops[2], tops[4], tops[3]]
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]).toBeGreaterThan(ordered[i - 1])
    }
    // 滚到底时，最后一个 top <= endTop 的条目必须是真正的最后一条
    const selected = ordered.reduce((best, top, index) => (top <= 9000 ? index : best), -1)
    expect(selected).toBe(ordered.length - 1)
  })
})
