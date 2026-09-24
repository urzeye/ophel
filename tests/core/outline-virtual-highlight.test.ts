import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"
import { OutlineManager, type OutlineNode } from "~core/outline-manager"
import type { Settings } from "~utils/storage"

vi.mock("~stores/bookmarks-store", () => ({ useBookmarkStore: { subscribe: () => () => {} } }))
vi.mock("~stores/settings-store", () => ({ useSettingsStore: { getState: vi.fn() } }))
vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))
vi.mock("~utils/toast", () => ({ showToast: vi.fn() }))

let manager: OutlineManager
let container: HTMLElement

function rect(top: number, height: number) {
  return {
    isConnected: true,
    getClientRects: () => [{ top, bottom: top + height }],
  } as unknown as HTMLElement
}

function node(
  index: number,
  options: {
    text?: string
    isUserQuery?: boolean
    element?: HTMLElement | null
    scrollTop?: number
    id?: string
    children?: OutlineNode[]
  } = {},
): OutlineNode {
  return {
    index,
    level: options.isUserQuery ? 0 : 2,
    relativeLevel: options.isUserQuery ? 0 : 1,
    text: options.text ?? `Item ${index}`,
    children: options.children ?? [],
    collapsed: false,
    isUserQuery: options.isUserQuery,
    element: options.element === undefined ? null : options.element,
    scrollTop: options.scrollTop,
    id: options.id,
  }
}

beforeEach(() => {
  const doc = {
    documentElement: {},
    body: {},
    defaultView: { innerWidth: 1200, innerHeight: 800 },
  }
  container = {
    ownerDocument: doc,
    scrollTop: 5000,
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
  const adapter = {
    getSiteId: () => "deepseek",
    usesVirtualOutlineFill: () => true,
    getOutlineSources: () => [],
    getOutlineScrollContainer: () => container,
    findActiveOutlineItemId: () => null,
  } as unknown as SiteAdapter
  const settings = { enabled: true, followMode: "current" } as Settings["features"]["outline"]
  manager = new OutlineManager(adapter, settings)
})

afterEach(() => vi.unstubAllGlobals())

describe("virtual outline highlight", () => {
  it("highlights the on-screen question instead of a cached off-screen item or the next question", () => {
    const current = node(0, {
      text: "请给我一个数学公式",
      isUserQuery: true,
      element: rect(40, 36),
    })
    const next = node(1, {
      text: "给我2个二级标题",
      isUserQuery: true,
      element: rect(700, 36),
    })
    const cachedTail = node(23, {
      text: "第24轮",
      isUserQuery: true,
      element: null,
      scrollTop: 5100,
    })
    ;(manager as unknown as { flatNodes: OutlineNode[] }).flatNodes = [current, next, cachedTail]

    expect(manager.findMountedActiveNode(container)?.text).toBe("请给我一个数学公式")
  })

  it("returns null when the only candidates are unmounted, even if their cached position hits the anchor", () => {
    ;(manager as unknown as { flatNodes: OutlineNode[] }).flatNodes = [
      node(23, { isUserQuery: true, element: null, scrollTop: 5080 }),
      node(24, {
        element: {
          isConnected: false,
          getClientRects: () => [{ top: 120, bottom: 150 }],
        } as unknown as HTMLElement,
        scrollTop: 120,
      }),
    ]

    expect(manager.findMountedActiveNode(container)).toBeNull()
  })

  it("ignores mounted rows that sit outside the viewport", () => {
    const tail = node(37, {
      text: "尾部消息",
      isUserQuery: true,
      element: rect(4000, 40),
    })
    const visible = node(2, {
      text: "当前标题",
      element: rect(120, 28),
    })
    ;(manager as unknown as { flatNodes: OutlineNode[] }).flatNodes = [visible, tail]

    expect(manager.findMountedActiveNode(container)?.text).toBe("当前标题")
  })

  it("retains a rebuilt node by stable id instead of the old object", () => {
    const rebuilt = node(8, { id: "deepseek-user-query::0::公式", text: "公式", isUserQuery: true })
    ;(manager as unknown as { flatNodes: OutlineNode[] }).flatNodes = [rebuilt]
    const previous = node(0, {
      id: "deepseek-user-query::0::公式",
      text: "公式",
      isUserQuery: true,
    })

    expect(manager.findRetainedOutlineNode(previous)).toBe(rebuilt)
  })
})
