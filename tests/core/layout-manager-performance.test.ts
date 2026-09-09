import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"
import { LayoutManager } from "~core/layout-manager"
import { DOMToolkit } from "~utils/dom-toolkit"

vi.mock("~stores/settings-store", () => ({ useSettingsStore: { getState: vi.fn() } }))
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: { query: vi.fn(() => []), walkShadowRoots: vi.fn() },
}))
vi.mock("~utils/font", () => ({
  INTER_LOCAL_FONT_FACE: "",
  getPlatformFontFamily: () => "sans-serif",
}))
vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))

class MockElement {
  isConnected = true
  parentElement: MockElement | null = null
  shadowRoot = null
  getBoundingClientRect = vi.fn(() => ({ width: 800, height: 600 }))
  querySelector = vi.fn(() => null)
  querySelectorAll = vi.fn(() => [])

  constructor(readonly selector: string) {}

  matches(selectors: string) {
    return selectors.split(",").some((selector) => selector.trim() === this.selector)
  }

  closest(selectors: string): MockElement | null {
    return this.matches(selectors) ? this : this.parentElement?.closest(selectors) ?? null
  }
}

type LayoutInternals = {
  refreshShadowInjection(): void
  findMainPanel(): HTMLElement | null
  findPanelAvoidanceScope(selector?: string): HTMLElement | null
  panelAvoidanceObservedPanel: HTMLElement | null
}

const observers: Array<{ callback: MutationCallback; disconnect: ReturnType<typeof vi.fn> }> = []
const frame = vi.fn(() => 1)
let body: MockElement
let manager: LayoutManager
let internals: LayoutInternals

function emit(target: MockElement, type: MutationRecord["type"] = "attributes") {
  const record = { target, type, addedNodes: [], removedNodes: [] } as unknown as MutationRecord
  observers[0].callback([record], {} as MutationObserver)
}

beforeEach(() => {
  vi.clearAllMocks()
  observers.length = 0
  body = new MockElement("body")
  vi.stubGlobal("Element", MockElement)
  vi.stubGlobal("HTMLElement", MockElement)
  vi.stubGlobal("document", {
    body,
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal("window", {
    requestAnimationFrame: frame,
    cancelAnimationFrame: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal(
    "MutationObserver",
    class {
      disconnect = vi.fn()
      observe = vi.fn()
      constructor(callback: MutationCallback) {
        observers.push({ callback, disconnect: this.disconnect })
      }
    },
  )
  const adapter = {
    getCapabilities: () => ({}),
    getPanelAvoidanceConfig: () => ({ scopeSelector: ".layout", widthSelectors: [] }),
    getChatContentSelectors: () => [".message"],
    getUserQuerySelector: () => ".query",
  } as unknown as SiteAdapter
  manager = new LayoutManager(adapter, { enabled: false, value: "80", unit: "%" })
  internals = manager as unknown as LayoutInternals
  vi.spyOn(internals, "refreshShadowInjection").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("LayoutManager mutation work", () => {
  it("does not schedule page layout for streaming text, classes, or inline content", () => {
    manager.startPanelAvoidance()
    frame.mockClear()
    ;(manager as unknown as { panelAvoidanceRaf: number | null }).panelAvoidanceRaf = null
    const message = new MockElement(".message")
    const token = new MockElement("span")
    token.parentElement = message

    emit(token)
    emit(message, "childList")
    expect(frame).not.toHaveBeenCalled()
  })

  it("still schedules layout for host controls outside messages", () => {
    manager.startPanelAvoidance()
    frame.mockClear()
    // Consume the initial frame so a new mutation can schedule the next one.
    ;(manager as unknown as { panelAvoidanceRaf: number | null }).panelAvoidanceRaf = null
    emit(new MockElement(".sidebar"))
    expect(frame).toHaveBeenCalledOnce()
  })

  it("reuses the mounted panel instead of walking every shadow tree", () => {
    const panel = new MockElement(".gh-main-panel") as unknown as HTMLElement
    internals.panelAvoidanceObservedPanel = panel
    expect(internals.findMainPanel() === panel).toBe(true)
    expect(DOMToolkit.walkShadowRoots).not.toHaveBeenCalled()
  })

  it("queries a repeated inset scope once per layout calculation, including missing scopes", () => {
    expect(internals.findPanelAvoidanceScope(".missing")).toBeNull()
    expect(internals.findPanelAvoidanceScope(".missing")).toBeNull()
    expect(DOMToolkit.query).toHaveBeenCalledTimes(1)
  })
})
