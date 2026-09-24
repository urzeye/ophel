import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"
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

type ReservationInternals = {
  getPanelReservationFromObstacles(
    obstacles: { element: object; rect: object }[],
    scopeRect: { left: number; right: number; width: number },
    minSafeWidthOverride?: number,
  ): { targetWidth: number; rightEdgeInset: number } | null
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
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("LayoutManager panel avoidance safe width", () => {
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
