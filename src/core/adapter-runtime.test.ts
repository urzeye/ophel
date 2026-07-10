import { afterEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"

import { getAdapterRuntime, setAdapterRuntime, subscribeAdapterRuntime } from "./adapter-runtime"

describe("adapter runtime", () => {
  afterEach(() => {
    window.__ophelAdapterRuntime = undefined
  })

  it("shares the adapter through window and notifies subscribers", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeAdapterRuntime(listener)
    const adapter = {} as SiteAdapter

    setAdapterRuntime(adapter)

    expect(getAdapterRuntime()).toBe(adapter)
    expect(listener).toHaveBeenCalledOnce()

    unsubscribe()
  })

  it("does not notify again when registering the same instance", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeAdapterRuntime(listener)
    const adapter = {} as SiteAdapter

    setAdapterRuntime(adapter)
    setAdapterRuntime(adapter)

    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })
})
