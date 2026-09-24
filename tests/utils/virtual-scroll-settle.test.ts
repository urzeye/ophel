import { describe, expect, it } from "vitest"

import {
  isClaudeVirtualEdgeSettled,
  isDeepSeekVirtualEdgeSettled,
} from "~utils/virtual-scroll-settle"

function box(top: number, height: number) {
  return {
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 800,
    width: 800,
  }
}

describe("virtual scroll edge checks", () => {
  it("does not treat Claude's bottom window as the top", () => {
    const spacer = {
      getBoundingClientRect: () => box(0, 13321),
    }
    const sizer = {
      querySelector: (selector: string) => (selector.includes("transcript-spacer") ? spacer : null),
    }
    const container = {
      scrollTop: 0,
      scrollHeight: 20000,
      clientHeight: 800,
      getBoundingClientRect: () => box(0, 800),
      querySelector: (selector: string) => {
        if (selector.includes("transcript-sizer")) return sizer
        if (selector.includes('data-rs-index="0"')) return null
        return null
      },
    } as unknown as HTMLElement

    expect(isClaudeVirtualEdgeSettled(container, "start")).toBe(false)
  })

  it("accepts Claude only when the first message is at the top of the viewport", () => {
    const head = {
      getBoundingClientRect: () => box(24, 48),
    }
    const spacer = {
      getBoundingClientRect: () => box(0, 0),
    }
    const sizer = {
      querySelector: () => spacer,
    }
    const container = {
      scrollTop: 0,
      scrollHeight: 20000,
      clientHeight: 800,
      getBoundingClientRect: () => box(0, 800),
      querySelector: (selector: string) => {
        if (selector.includes("transcript-sizer")) return sizer
        if (selector.includes('data-rs-index="0"')) return head
        return null
      },
    } as unknown as HTMLElement

    expect(isClaudeVirtualEdgeSettled(container, "start")).toBe(true)
  })

  it("does not treat a DeepSeek window that is still translated downward as the top", () => {
    const windowEl = { style: { transform: "translateY(6440px)" } }
    const container = {
      scrollTop: 0,
      scrollHeight: 12000,
      clientHeight: 900,
      querySelector: (selector: string) =>
        selector === ".ds-virtual-list-visible-items" ? windowEl : null,
    } as unknown as HTMLElement

    expect(isDeepSeekVirtualEdgeSettled(container, "start")).toBe(false)
  })

  it("accepts DeepSeek when the visible window sits at the scroll position", () => {
    const row = { getBoundingClientRect: () => box(40, 80) }
    const windowEl = { style: { transform: "translateY(0px)" } }
    const container = {
      scrollTop: 0,
      scrollHeight: 12000,
      clientHeight: 900,
      getBoundingClientRect: () => box(0, 900),
      querySelector: (selector: string) =>
        selector === ".ds-virtual-list-visible-items" ? windowEl : null,
      querySelectorAll: () => [row],
    } as unknown as HTMLElement

    expect(isDeepSeekVirtualEdgeSettled(container, "start")).toBe(true)
  })
})
