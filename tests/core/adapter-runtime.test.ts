import { afterEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"

import {
  clearAdapterRuntime,
  getAdapterRuntime,
  setAdapterRuntime,
  subscribeAdapterRuntime,
} from "~core/adapter-runtime"

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

  it("clears the current adapter and notifies subscribers", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeAdapterRuntime(listener)
    const adapter = {} as SiteAdapter

    setAdapterRuntime(adapter)
    clearAdapterRuntime(adapter)

    expect(getAdapterRuntime()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it("does not clear an adapter registered by a newer runtime", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeAdapterRuntime(listener)
    const staleAdapter = {} as SiteAdapter
    const currentAdapter = {} as SiteAdapter

    setAdapterRuntime(currentAdapter)
    clearAdapterRuntime(staleAdapter)

    expect(getAdapterRuntime()).toBe(currentAdapter)
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })
})
