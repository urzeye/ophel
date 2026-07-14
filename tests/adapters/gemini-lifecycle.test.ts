import { afterEach, describe, expect, it, vi } from "vitest"

import { DOMToolkit } from "~utils/dom-toolkit"
import { GeminiAdapter } from "~adapters/gemini"

describe("GeminiAdapter lifecycle", () => {
  afterEach(() => {
    document.head.innerHTML = ""
    document.body.innerHTML = ""
  })

  it("stops persistent adapter observers when disposed", () => {
    const stopCallbacks = [vi.fn(), vi.fn(), vi.fn()]
    const each = vi
      .spyOn(DOMToolkit, "each")
      .mockImplementationOnce(() => stopCallbacks[0])
      .mockImplementationOnce(() => stopCallbacks[1])
      .mockImplementationOnce(() => stopCallbacks[2])
    const adapter = new GeminiAdapter()

    adapter.afterPropertiesSet()
    adapter.dispose()
    adapter.dispose()

    expect(each).toHaveBeenCalledTimes(3)
    for (const stop of stopCallbacks) {
      expect(stop).toHaveBeenCalledOnce()
    }
    expect(document.getElementById("ophel-gemini-mystuff-style")).toBeNull()
    expect(document.getElementById("gh-gemini-panel-markdown-actions-style")).toBeNull()
  })
})
