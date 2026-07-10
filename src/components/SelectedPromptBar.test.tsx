import { act, render } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"

import { SelectedPromptBar } from "./SelectedPromptBar"

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe("SelectedPromptBar positioning", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("ResizeObserver", ResizeObserverStub)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it("stops animation-frame tracking after the bounded transition window", () => {
    const textarea = document.createElement("textarea")
    document.body.appendChild(textarea)
    let animationFrameCount = 0
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrameCount += 1
      return window.setTimeout(() => callback(performance.now()), 16)
    })
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id))
    const adapter = { getTextareaElement: () => textarea } as unknown as SiteAdapter

    render(<SelectedPromptBar title="Prompt" onClear={() => {}} adapter={adapter} />)

    act(() => {
      vi.advanceTimersByTime(1500)
    })
    const countAfterTrackingWindow = animationFrameCount
    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(countAfterTrackingWindow).toBeGreaterThan(1)
    expect(animationFrameCount).toBe(countAfterTrackingWindow)
  })
})
