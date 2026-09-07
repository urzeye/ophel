import { describe, expect, it } from "vitest"

import {
  createWeakModalRegistry,
  isViewportCovering,
  type ModalCandidate,
} from "~utils/page-modal-policy"

class FakeEl implements ModalCandidate {
  constructor(
    readonly name: string,
    private readonly children: FakeEl[] = [],
  ) {}

  contains(target: unknown): boolean {
    if (target === this) return true
    return this.children.some((child) => child.contains(target))
  }
}

describe("isViewportCovering", () => {
  const viewport = { width: 1000, height: 800 }

  it("treats a rect covering at least 85% of the viewport as covering", () => {
    expect(isViewportCovering({ width: 850, height: 680 }, viewport)).toBe(true)
    expect(isViewportCovering({ width: 1000, height: 800 }, viewport)).toBe(true)
  })

  it("rejects smaller rects", () => {
    expect(isViewportCovering({ width: 849, height: 800 }, viewport)).toBe(false)
    expect(isViewportCovering({ width: 1000, height: 679 }, viewport)).toBe(false)
    expect(isViewportCovering({ width: 200, height: 100 }, viewport)).toBe(false)
  })
})

describe("createWeakModalRegistry", () => {
  it("counts a visible weak element as a modal", () => {
    const registry = createWeakModalRegistry<FakeEl>()
    expect(registry.update([new FakeEl("dialog")])).toBe(true)
  })

  it("reports no modal when nothing is visible", () => {
    const registry = createWeakModalRegistry<FakeEl>()
    expect(registry.update([])).toBe(false)
    expect(registry.forgiveOnOutsideInteraction(new FakeEl("page"))).toBe(false)
  })

  it("forgives elements after an interaction outside them", () => {
    const registry = createWeakModalRegistry<FakeEl>()
    const dialog = new FakeEl("dialog")
    expect(registry.update([dialog])).toBe(true)

    expect(registry.forgiveOnOutsideInteraction(new FakeEl("page"))).toBe(true)
    expect(registry.update([dialog])).toBe(false)
  })

  it("keeps counting when the interaction lands inside the element", () => {
    const registry = createWeakModalRegistry<FakeEl>()
    const inner = new FakeEl("button")
    const dialog = new FakeEl("dialog", [inner])
    registry.update([dialog])

    expect(registry.forgiveOnOutsideInteraction(inner)).toBe(false)
    expect(registry.update([dialog])).toBe(true)
  })

  it("keeps counting when the interaction lands on a backdrop", () => {
    const registry = createWeakModalRegistry<FakeEl>()
    const dialog = new FakeEl("dialog")
    registry.update([dialog])

    expect(registry.forgiveOnOutsideInteraction(new FakeEl("backdrop"), { onBackdrop: true })).toBe(
      false,
    )
    expect(registry.update([dialog])).toBe(true)
  })

  it("resets forgiveness once the element hides, so re-showing counts again", () => {
    const registry = createWeakModalRegistry<FakeEl>()
    const dialog = new FakeEl("dialog")
    registry.update([dialog])
    registry.forgiveOnOutsideInteraction(new FakeEl("page"))
    expect(registry.update([dialog])).toBe(false)

    // 元素隐藏后放行状态重置
    expect(registry.update([])).toBe(false)
    expect(registry.update([dialog])).toBe(true)
  })

  it("does not report changes when everything visible is already forgiven", () => {
    const registry = createWeakModalRegistry<FakeEl>()
    const dialog = new FakeEl("dialog")
    registry.update([dialog])
    expect(registry.forgiveOnOutsideInteraction(new FakeEl("page"))).toBe(true)
    expect(registry.forgiveOnOutsideInteraction(new FakeEl("page"))).toBe(false)
  })

  it("handles multiple weak elements independently of null targets", () => {
    const registry = createWeakModalRegistry<FakeEl>()
    const a = new FakeEl("a")
    const b = new FakeEl("b")
    registry.update([a, b])

    expect(registry.forgiveOnOutsideInteraction(null)).toBe(true)
    expect(registry.update([a, b])).toBe(false)
  })
})
