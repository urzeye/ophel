import { afterEach, describe, expect, it, vi } from "vitest"

import { destroyNetworkMonitor, initNetworkMonitor } from "~core/network-monitor"
import { EVENT_MONITOR_INIT, EVENT_MONITOR_START } from "~utils/messaging"

describe("NetworkMonitor lifecycle", () => {
  afterEach(() => {
    destroyNetworkMonitor()
    vi.restoreAllMocks()
  })

  it("removes its exact message listener and can initialize again", () => {
    const addListener = vi.spyOn(window, "addEventListener")
    const removeListener = vi.spyOn(window, "removeEventListener")

    initNetworkMonitor()
    const firstRegistration = addListener.mock.calls.find(([type]) => type === "message")
    expect(firstRegistration).toBeDefined()

    destroyNetworkMonitor()
    expect(removeListener).toHaveBeenCalledWith("message", firstRegistration?.[1])

    initNetworkMonitor()
    const registrations = addListener.mock.calls.filter(([type]) => type === "message")
    expect(registrations).toHaveLength(2)
    expect(registrations[1]?.[1]).toBe(firstRegistration?.[1])
  })

  it("does not overwrite fetch or XHR hooks installed after its own hooks", () => {
    const originalFetch = window.fetch
    const originalXhrOpen = window.XMLHttpRequest.prototype.open
    const originalXhrSend = window.XMLHttpRequest.prototype.send

    initNetworkMonitor()
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: EVENT_MONITOR_INIT, payload: {} },
        source: window,
      }),
    )

    const laterFetch = vi.fn(originalFetch)
    const laterXhrOpen = vi.fn(originalXhrOpen) as unknown as typeof originalXhrOpen
    const laterXhrSend = vi.fn(originalXhrSend) as unknown as typeof originalXhrSend
    window.fetch = laterFetch
    window.XMLHttpRequest.prototype.open = laterXhrOpen
    window.XMLHttpRequest.prototype.send = laterXhrSend

    destroyNetworkMonitor()

    expect(window.fetch).toBe(laterFetch)
    expect(window.XMLHttpRequest.prototype.open).toBe(laterXhrOpen)
    expect(window.XMLHttpRequest.prototype.send).toBe(laterXhrSend)

    window.fetch = originalFetch
    window.XMLHttpRequest.prototype.open = originalXhrOpen
    window.XMLHttpRequest.prototype.send = originalXhrSend
  })

  it("does not emit a fetch start event after destroy while request metadata is pending", async () => {
    const originalFetch = window.fetch
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"))
    const postMessage = vi.spyOn(window, "postMessage")
    let resolveBody = (_value: string) => undefined
    const bodyText = new Promise<string>((resolve) => {
      resolveBody = resolve
    })
    const request = {
      clone: () => ({ clone: () => request, text: () => bodyText }),
      text: () => bodyText,
      toString: () => "https://example.com/generate",
    }
    window.fetch = fetchMock

    initNetworkMonitor()
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: EVENT_MONITOR_INIT,
          payload: {
            requestBodyRules: [
              { type: "json-field-exists", field: "prompt", metadata: { mode: "test" } },
            ],
          },
        },
        source: window,
      }),
    )

    const fetchPromise = window.fetch(request as unknown as Request)
    await Promise.resolve()
    destroyNetworkMonitor()
    resolveBody('{"prompt":"hello"}')
    await fetchPromise

    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: EVENT_MONITOR_START }),
      "*",
    )
    window.fetch = originalFetch
  })
})
