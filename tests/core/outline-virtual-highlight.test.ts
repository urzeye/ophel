import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SiteAdapter } from "~adapters/base"
import { OutlineManager, type OutlineNode } from "~core/outline-manager"
import type { Settings } from "~utils/storage"
import type { VirtualOutlinePositionSnapshot } from "~utils/virtual-outline-position"

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

describe("virtual outline highlight with frozen tree (estimated fallback)", () => {
  // 挂载窗口只有第 4、5 行：行顶 4000/5000，第 5 行底边 6000
  const SNAPSHOT: VirtualOutlinePositionSnapshot = {
    anchors: [
      { index: 4, top: 4000 },
      { index: 5, top: 5000 },
      { index: 6, top: 6000 },
    ],
    bounds: { endSlot: 10, endTop: 9000 },
  }

  const ROWS = [0, 2, 4, 6, 8]

  const buildFrozenManager = (snapshot: VirtualOutlinePositionSnapshot | null): OutlineManager => {
    const adapter = {
      getSiteId: () => "deepseek",
      usesVirtualOutlineFill: () => true,
      getOutlineSources: () => [],
      getOutlineScrollContainer: () => container,
      findActiveOutlineItemId: () => null,
      getVirtualOutlinePositionSnapshot: () => snapshot,
      getVirtualOutlineRowIndex: (item: { id?: string }) => {
        const match = item.id?.match(/^deepseek:api-u:(\d+)$/)
        return match ? Number(match[1]) : null
      },
    } as unknown as SiteAdapter
    const settings = { enabled: true, followMode: "current" } as Settings["features"]["outline"]
    return new OutlineManager(adapter, settings)
  }

  // 树冻结在旧挂载窗口：元素引用整体失效（isConnected 为假）
  const frozenNodes = (): OutlineNode[] =>
    ROWS.map((row, index) =>
      node(index, {
        text: `提问 ${row}`,
        isUserQuery: true,
        id: `deepseek:api-u:${row}`,
        element: { isConnected: false } as unknown as HTMLElement,
      }),
    )

  it("estimates the active item from mounted-row anchors when every element is stale", () => {
    const frozen = buildFrozenManager(SNAPSHOT)
    ;(frozen as unknown as { flatNodes: OutlineNode[] }).flatNodes = frozenNodes()
    // 锚线 = scrollTop + 160：5160 落在第 4 行（4000-6000）区间内
    container.scrollTop = 5000

    expect(frozen.findMountedActiveNode(container)?.text).toBe("提问 4")
  })

  it("reaches the true last item at the bottom instead of sticking to the mounted window", () => {
    const frozen = buildFrozenManager(SNAPSHOT)
    ;(frozen as unknown as { flatNodes: OutlineNode[] }).flatNodes = frozenNodes()
    container.scrollTop = 9000

    expect(frozen.findMountedActiveNode(container)?.text).toBe("提问 8")
  })

  it("returns null when the snapshot is unavailable, keeping the previous highlight", () => {
    const frozen = buildFrozenManager(null)
    ;(frozen as unknown as { flatNodes: OutlineNode[] }).flatNodes = frozenNodes()
    container.scrollTop = 5000

    expect(frozen.findMountedActiveNode(container)).toBeNull()
  })
})
