import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OutlineItem, SiteAdapter } from "~adapters/base"
import { OutlineManager, type OutlineNode } from "~core/outline-manager"
import type { Settings } from "~utils/storage"

vi.mock("~stores/bookmarks-store", () => ({ useBookmarkStore: { subscribe: () => () => {} } }))
vi.mock("~stores/settings-store", () => ({ useSettingsStore: { getState: vi.fn() } }))
vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))
vi.mock("~utils/toast", () => ({ showToast: vi.fn() }))

type OutlineInternals = {
  flatNodes: OutlineNode[]
  scrollPositions: number[]
  syncFlatNodeRuntimeData(items: OutlineItem[]): boolean
}

let manager: OutlineManager
let internals: OutlineInternals
let adapter: SiteAdapter
let geometryReads: number
let container: HTMLElement

function createNode(index: number, connected = true): OutlineNode {
  return {
    index,
    level: 2,
    relativeLevel: 1,
    text: `Heading ${index}`,
    children: [],
    collapsed: false,
    scrollTop: index * 72,
    scrollHeight: 36,
    element: {
      isConnected: connected,
      getClientRects: () => {
        geometryReads++
        const top = index * 72 - container.scrollTop
        return [{ top, bottom: top + 36 }]
      },
    } as unknown as HTMLElement,
  }
}

beforeEach(() => {
  geometryReads = 0
  const doc = { documentElement: {}, body: {}, defaultView: { innerWidth: 1200, innerHeight: 800 } }
  container = {
    ownerDocument: doc,
    scrollTop: 0,
    getBoundingClientRect: () => ({
      left: 0,
      right: 1000,
      top: 0,
      bottom: 800,
      width: 1000,
      height: 800,
    }),
  } as unknown as HTMLElement
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  adapter = {
    getSiteId: () => "gemini",
    getOutlineSources: () => [],
    getOutlineScrollContainer: () => container,
    findActiveOutlineItemId: () => null,
    findElementByHeading: vi.fn(() => null),
    findUserQueryElement: vi.fn(() => null),
  } as unknown as SiteAdapter
  const settings = { enabled: true, followMode: "current" } as Settings["features"]["outline"]
  manager = new OutlineManager(adapter, settings)
  internals = manager as unknown as OutlineInternals
})

afterEach(() => vi.unstubAllGlobals())

describe("OutlineManager scroll-path budget", () => {
  it("uses cached positions for unmounted headings instead of scanning the document for each", () => {
    internals.flatNodes = Array.from({ length: 5000 }, (_, index) => createNode(index, false))
    manager.updateScrollPositions()
    expect(vi.mocked(adapter.findElementByHeading).mock.calls.length).toBe(0)
    expect(geometryReads).toBe(0)
    expect(internals.scrollPositions.length).toBe(5000)
    expect(internals.scrollPositions[4999]).toBe(4999 * 72)
  })

  it("only measures a bounded viewport neighborhood while scrolling 5000 headings", () => {
    internals.flatNodes = Array.from({ length: 5000 }, (_, index) => createNode(index))
    manager.updateScrollPositions()
    container.scrollTop = 2000 * 72
    geometryReads = 0
    const active = manager.findMountedActiveNode(container)
    expect(active?.index).toBe(2002)
    expect(geometryReads).toBeLessThanOrEqual(60)
  })

  it("accepts remounted references through outline refresh and remeasures after resize", () => {
    internals.flatNodes = [createNode(0, false), createNode(1, false)]
    manager.updateScrollPositions()
    const mounted = [createNode(0), createNode(1)]
    expect(internals.syncFlatNodeRuntimeData(mounted)).toBe(true)
    manager.markScrollPositionsStale()
    manager.findMountedActiveNode(container)
    expect(geometryReads).toBeGreaterThanOrEqual(2)
    expect(vi.mocked(adapter.findElementByHeading).mock.calls.length).toBe(0)
  })
})
