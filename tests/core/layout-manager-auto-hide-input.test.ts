import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AutoHideInputConfig, SiteAdapter } from "~adapters/base"
import { LayoutManager } from "~core/layout-manager"

vi.mock("~stores/settings-store", () => ({ useSettingsStore: { getState: vi.fn() } }))
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: { query: vi.fn(() => []), walkShadowRoots: vi.fn() },
}))
vi.mock("~utils/font", () => ({
  INTER_LOCAL_FONT_FACE: "",
  getPlatformFontFamily: () => "sans-serif",
}))
vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))

class MockClassList {
  private classes = new Set<string>()

  add(...names: string[]) {
    names.forEach((name) => this.classes.add(name))
  }

  remove(...names: string[]) {
    names.forEach((name) => this.classes.delete(name))
  }

  toggle(name: string, force?: boolean) {
    const next = force ?? !this.classes.has(name)
    if (next) this.classes.add(name)
    else this.classes.delete(name)
    return next
  }

  contains(name: string) {
    return this.classes.has(name)
  }
}

const AUTO_HIDE_CONFIG: AutoHideInputConfig = {
  container: ".composer",
  styles: [{ selector: ".conversation-container", property: "min-height", value: "0" }],
}

let rootClassList: MockClassList
let rootStyle: { setProperty: ReturnType<typeof vi.fn>; removeProperty: ReturnType<typeof vi.fn> }
let styleEl: {
  id: string
  textContent: string
  remove: ReturnType<typeof vi.fn>
}
let container: {
  isConnected: boolean
  parentElement: null
  getBoundingClientRect: ReturnType<typeof vi.fn>
  matches: ReturnType<typeof vi.fn>
  contains: ReturnType<typeof vi.fn>
  querySelector: ReturnType<typeof vi.fn>
  offsetHeight: number
}
let scroller: { appendChild: ReturnType<typeof vi.fn> }
let adapter: SiteAdapter
let manager: LayoutManager

const internals = () =>
  manager as unknown as {
    updateAutoHideVisibility(event?: { clientY: number }): void
  }

beforeEach(() => {
  vi.clearAllMocks()

  rootClassList = new MockClassList()
  rootStyle = { setProperty: vi.fn(), removeProperty: vi.fn() }
  styleEl = { id: "", textContent: "", remove: vi.fn() }
  container = {
    isConnected: true,
    parentElement: null,
    getBoundingClientRect: vi.fn(() => ({
      top: 800,
      left: 100,
      width: 600,
      height: 80,
      bottom: 880,
    })),
    matches: vi.fn(() => true),
    contains: vi.fn(() => false),
    querySelector: vi.fn(() => null),
    offsetHeight: 80,
  }
  scroller = { appendChild: vi.fn() }

  vi.stubGlobal("document", {
    documentElement: { classList: rootClassList, style: rootStyle },
    head: { appendChild: vi.fn((el: unknown) => el) },
    body: {},
    activeElement: null,
    querySelector: vi.fn((selector: string) =>
      selector === AUTO_HIDE_CONFIG.container ? container : null,
    ),
    querySelectorAll: vi.fn(() => []),
    getElementById: vi.fn(() => null),
    createElement: vi.fn((tag: string) =>
      tag === "style"
        ? styleEl
        : {
            id: "",
            textContent: "",
            style: {},
            setAttribute: vi.fn(),
            remove: vi.fn(),
          },
    ),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal("window", {
    innerHeight: 900,
    matchMedia: vi.fn(() => ({ matches: false })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
  })
  vi.stubGlobal(
    "getComputedStyle",
    vi.fn(() => ({ backgroundColor: "rgba(0, 0, 0, 0)" })),
  )
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )

  adapter = {
    getCapabilities: () => ({}),
    getPanelAvoidanceConfig: () => null,
    getAutoHideInputConfig: () => AUTO_HIDE_CONFIG,
    getScrollContainer: () => scroller,
    getTextareaElement: () => null,
  } as unknown as SiteAdapter

  manager = new LayoutManager(adapter, { enabled: false, value: "80", unit: "%" })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("LayoutManager auto-hide input", () => {
  it("injects floating css, floats the measured container and reserves a scroll spacer", () => {
    manager.updateAutoHideInput(true)

    expect(styleEl.textContent).toContain("position: fixed")
    expect(styleEl.textContent).toContain(AUTO_HIDE_CONFIG.container)
    expect(styleEl.textContent).toContain("translateY(calc(100% + 28px))")
    expect(styleEl.textContent).toContain("focus-within")
    expect(styleEl.textContent).toContain("min-height: 0 !important")
    expect(styleEl.textContent).toContain("gh-auto-hide-input-spacer")

    expect(rootClassList.contains("gh-ahi-float")).toBe(true)
    expect(rootStyle.setProperty).toHaveBeenCalledWith("--gh-ahi-top", "800px")
    expect(rootStyle.setProperty).toHaveBeenCalledWith("--gh-ahi-width", "600px")
    expect(rootStyle.setProperty).toHaveBeenCalledWith("--gh-ahi-footer", "20px")
    expect(scroller.appendChild).toHaveBeenCalled()
  })

  it("hides when idle and reveals when the pointer approaches the viewport bottom", () => {
    manager.updateAutoHideInput(true)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)

    internals().updateAutoHideVisibility({ clientY: 750 })
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)

    internals().updateAutoHideVisibility({ clientY: 200 })
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(true)
  })

  it("never hides on coarse-pointer devices", () => {
    vi.stubGlobal("window", {
      ...window,
      matchMedia: vi.fn(() => ({ matches: true })),
    })
    manager.updateAutoHideInput(true)

    expect(rootClassList.contains("gh-ahi-float")).toBe(true)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)
  })

  it("does nothing when the adapter has no auto-hide config", () => {
    ;(adapter as { getAutoHideInputConfig: () => null }).getAutoHideInputConfig = () => null
    manager.updateAutoHideInput(true)

    expect(rootClassList.contains("gh-ahi-float")).toBe(false)
    expect(styleEl.textContent).toBe("")
  })

  it("cleans up classes, css vars and styles when disabled", () => {
    manager.updateAutoHideInput(true)
    manager.updateAutoHideInput(false)

    expect(rootClassList.contains("gh-ahi-float")).toBe(false)
    expect(rootClassList.contains("gh-ahi-hidden")).toBe(false)
    expect(rootStyle.removeProperty).toHaveBeenCalledWith("--gh-ahi-top")
    expect(styleEl.remove).toHaveBeenCalled()
  })
})
