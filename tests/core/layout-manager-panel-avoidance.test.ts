import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"
import { LayoutManager } from "~core/layout-manager"
import { useSettingsStore } from "~stores/settings-store"

vi.mock("~stores/settings-store", () => ({ useSettingsStore: { getState: vi.fn() } }))
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: { query: vi.fn(() => []), walkShadowRoots: vi.fn() },
}))
vi.mock("~utils/font", () => ({
  INTER_LOCAL_FONT_FACE: "",
  getPlatformFontFamily: () => "sans-serif",
}))
vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))

type ReservationInternals = {
  getPanelReservation(
    panel: HTMLElement,
    scopeRect: { left: number; right: number; width: number },
  ): { targetWidth: number; rightEdgeInset: number } | null
  getPanelReservationFromObstacles(
    obstacles: { element: object; rect: object }[],
    scopeRect: { left: number; right: number; width: number },
    minSafeWidthOverride?: number,
  ): { targetWidth: number; rightEdgeInset: number } | null
  isPanelAvoidanceViewportTooNarrow(): boolean
}

const rightObstacle = (left: number, right: number) => ({
  element: {},
  rect: { left, right, top: 0, bottom: 900, width: right - left, height: 900 },
})

let manager: LayoutManager
let internals: ReservationInternals

beforeEach(() => {
  vi.stubGlobal("document", {
    body: {},
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal("window", {
    innerWidth: 1920,
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    location: { pathname: "/chat" },
  })
  const adapter = {
    getCapabilities: () => ({}),
    // gap 16，minSafeWidth 走默认值 360
    getPanelAvoidanceConfig: () => ({ scopeSelector: ".layout", widthSelectors: [], gap: 16 }),
    getChatContentSelectors: () => [".message"],
    getUserQuerySelector: () => ".query",
    usesShadowDOM: () => false,
  } as unknown as SiteAdapter
  manager = new LayoutManager(adapter, { enabled: false, value: "80", unit: "%" })
  internals = manager as unknown as ReservationInternals
  vi.mocked(useSettingsStore.getState).mockReturnValue({
    settings: { panel: { panelMode: "floating" } },
  } as ReturnType<typeof useSettingsStore.getState>)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("LayoutManager panel avoidance safe width", () => {
  it("suppresses avoidance for edge-snapped and pass-through panels", () => {
    const classList = { contains: (name: string) => name === "edge-snapped-left" }
    const edgeSnappedPanel = {
      isConnected: true,
      classList,
      closest: () => null,
    } as unknown as HTMLElement
    const passThroughPanel = {
      isConnected: true,
      classList: { contains: () => false },
      closest: (selector: string) =>
        selector === ".gh-root" ? { classList: { contains: () => true } } : null,
    } as unknown as HTMLElement
    const scope = { left: 0, right: 1920, width: 1920 }

    expect(internals.getPanelReservation(edgeSnappedPanel, scope)).toBeNull()
    expect(internals.getPanelReservation(passThroughPanel, scope)).toBeNull()
  })

  it("retains the narrow viewport avoidance guard", () => {
    vi.stubGlobal("window", { innerWidth: 420, location: { pathname: "/chat" } })

    expect(internals.isPanelAvoidanceViewportTooNarrow()).toBe(true)
  })

  it("keeps the default safe width when no override is given", () => {
    // 984 宽行容器 + 右侧 360 宽 Ophel 面板：安全区 984-360-16=608
    const scope = { left: 0, right: 984, width: 984 }
    expect(
      internals.getPanelReservationFromObstacles([rightObstacle(624, 984)], scope),
    ).not.toBeNull()
  })

  it("rejects the reservation when an inset override requires more room", () => {
    // 同一行内容纳 384 宽 Artifacts 侧栏时，608 的安全区不足以再放 360 宽正文
    const scope = { left: 0, right: 984, width: 984 }
    expect(
      internals.getPanelReservationFromObstacles([rightObstacle(624, 984)], scope, 744),
    ).toBeNull()
  })

  it("still applies the override reservation on wide desktop layouts", () => {
    // 1812 宽行容器：安全区 1812-360-16=1436，满足 744 的覆盖要求
    const scope = { left: 8, right: 1820, width: 1812 }
    const reservation = internals.getPanelReservationFromObstacles(
      [rightObstacle(1460, 1820)],
      scope,
      744,
    )
    expect(reservation).not.toBeNull()
    expect(reservation?.rightEdgeInset).toBeGreaterThanOrEqual(360)
  })
})

type PaneInternals = {
  panelAvoidanceConfig: {
    scopeSelector: string
    scopeEachMatch?: boolean
    widthSelectors: { selector: string; property: string }[]
  }
  syncPanelAvoidanceEachScope(panel: HTMLElement | null): void
  syncPanelAvoidanceObservers(): void
  getPanelReservation(
    panel: HTMLElement,
    rect: { left: number; width: number },
  ): {
    targetWidth: number
    leftInset: number
    rightInset: number
    leftEdgeInset: number
    rightEdgeInset: number
  } | null
  generatePanelAvoidanceCSS(panel: HTMLElement, reservation: { targetWidth: number } | null): string
  upsertStyle(id: string, css: string): HTMLStyleElement
  clearPanelAvoidanceStyle(): void
  scopePanelAvoidanceSelector(selector: string, marker: string): string
}

class PaneFixture {
  attributes = new Map<string, string>()
  hidden = false
  constructor(
    readonly left: number,
    readonly width: number,
  ) {}
  getBoundingClientRect() {
    return { left: this.left, right: this.left + this.width, width: this.width, height: 900 }
  }
  closest() {
    return this.hidden ? this : null
  }
  matches(selector: string) {
    return selector === ".pane"
  }
  querySelector() {
    return {}
  }
  querySelectorAll() {
    return []
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }
  removeAttribute(name: string) {
    this.attributes.delete(name)
  }
}

describe("LayoutManager opt-in pane avoidance", () => {
  it("measures visible panes independently, retains selector unions, and restores markers on hide and collapse", () => {
    vi.stubGlobal("HTMLElement", PaneFixture)
    vi.stubGlobal("window", {
      innerWidth: 1920,
      getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    })
    const left = new PaneFixture(0, 960)
    const right = new PaneFixture(960, 960)
    const hidden = new PaneFixture(0, 960)
    hidden.hidden = true
    left.setAttribute("data-gh-panel-avoidance-scope", "pre-existing")
    vi.mocked(document.querySelectorAll).mockReturnValue([
      hidden,
      left,
      right,
    ] as unknown as NodeListOf<Element>)
    const paneManager = manager as unknown as PaneInternals
    paneManager.panelAvoidanceConfig = {
      scopeSelector: ".pane",
      scopeEachMatch: true,
      widthSelectors: [{ selector: ".owner, .composer:is(.home, .thread)", property: "max-width" }],
    }
    vi.spyOn(paneManager, "syncPanelAvoidanceObservers").mockImplementation(() => {})
    const reserve = vi
      .spyOn(paneManager, "getPanelReservation")
      .mockImplementation((_panel, rect) => ({
        targetWidth: rect.left === 0 ? 600 : 820,
        leftInset: 0,
        rightInset: 0,
        leftEdgeInset: 0,
        rightEdgeInset: 0,
      }))
    const upsert = vi
      .spyOn(paneManager, "upsertStyle")
      .mockReturnValue({ remove() {} } as HTMLStyleElement)
    paneManager.syncPanelAvoidanceEachScope({} as HTMLElement)
    expect(reserve.mock.calls.map((call) => call[1].left)).toEqual([0, 960])
    const css = upsert.mock.calls[0][1]
    expect(css).toContain("max-width: 600px")
    expect(css).toContain("max-width: 820px")
    expect(css).toContain(":is(.composer:is(.home, .thread))")
    expect(css).toContain(left.getAttribute("data-gh-panel-avoidance-scope"))
    expect(css).toContain(right.getAttribute("data-gh-panel-avoidance-scope"))
    expect(hidden.getAttribute("data-gh-panel-avoidance-scope")).toBeNull()
    right.hidden = true
    paneManager.syncPanelAvoidanceEachScope({} as HTMLElement)
    expect(right.getAttribute("data-gh-panel-avoidance-scope")).toBeNull()
    reserve.mockReturnValue(null)
    paneManager.syncPanelAvoidanceEachScope({} as HTMLElement)
    expect(left.getAttribute("data-gh-panel-avoidance-scope")).toBe("pre-existing")
  })

  it("keeps legacy ID specificity out of other branches and preserves quoted commas", () => {
    const paneManager = manager as unknown as PaneInternals
    expect(
      paneManager.scopePanelAvoidanceSelector(
        '#thread .owner, [data-label="a,b"]:has(.home, .thread)',
        '[data-pane="1"]',
      ),
    ).toBe(
      '[data-pane="1"]:is(#thread .owner), [data-pane="1"] :is(#thread .owner), [data-pane="1"]:is([data-label="a,b"]:has(.home, .thread)), [data-pane="1"] :is([data-label="a,b"]:has(.home, .thread))',
    )
  })

  it("retains global CSS for adapters that do not opt in", () => {
    const paneManager = manager as unknown as PaneInternals
    paneManager.panelAvoidanceConfig = {
      scopeSelector: ".pane",
      widthSelectors: [{ selector: ".owner, .composer", property: "max-width" }],
    }
    const css = paneManager.generatePanelAvoidanceCSS({} as HTMLElement, { targetWidth: 600 })
    expect(css).toContain(".owner, .composer { max-width: 600px")
    expect(css).not.toContain("data-gh-panel-avoidance-scope")
  })
})
