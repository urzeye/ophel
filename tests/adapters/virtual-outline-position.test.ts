import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ClaudeAdapter } from "~adapters/claude"
import { DeepSeekAdapter } from "~adapters/deepseek"
import type { OutlineItem } from "~adapters/base"
import type { DeepSeekHistoryOutlineData } from "~adapters/deepseek-history-outline"

// base.ts 在模块顶层实例化 DOMToolkit（依赖 document）；node 环境下打桩
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

const branchData = (branchMessageIds: number[]): DeepSeekHistoryOutlineData => ({
  sessionId: "session-1",
  version: branchMessageIds.length,
  branchMessageIds,
  maxMessageId: Math.max(...branchMessageIds),
  headingsByAssistantId: new Map(),
  replyWordCountByAssistantId: new Map(),
  queryIndexByAssistantId: new Map(),
  assistantIdByQueryIndex: new Map(),
  queryCount: 0,
  userQueries: [],
})

type DeepSeekInternals = {
  apiOutlineData: DeepSeekHistoryOutlineData | null
  getScrollContainer: () => HTMLElement | null
}

const ROW_HEIGHT = 500

/** 模拟 ds-virtual-list 当前挂载窗口：keys 中的行，行高固定，容器滚动 800 */
class FakeVirtualContainer {
  scrollTop = 800
  readonly clientHeight = 1000
  readonly scrollHeight = 10000

  constructor(private readonly keys: number[]) {}

  private fakeRow(key: number) {
    const windowIndex = this.keys.indexOf(key)
    const top = 100 + windowIndex * ROW_HEIGHT
    return {
      getAttribute: (name: string) => (name === "data-virtual-list-item-key" ? String(key) : null),
      getBoundingClientRect: () => ({ top, bottom: top + ROW_HEIGHT, height: ROW_HEIGHT }),
    }
  }

  querySelector(selector: string) {
    if (selector !== "[data-virtual-list-item-key]" || this.keys.length === 0) return null
    return this.fakeRow(this.keys[0])
  }

  querySelectorAll(selector: string) {
    if (selector !== "[data-virtual-list-item-key]") return [] as unknown[]
    return this.keys.map((key) => this.fakeRow(key))
  }

  getBoundingClientRect() {
    return { top: 0 }
  }
}

const buildDeepSeekAdapter = (
  data: DeepSeekHistoryOutlineData | null,
  container: FakeVirtualContainer | null,
): DeepSeekAdapter => {
  const adapter = new DeepSeekAdapter()
  const internals = adapter as unknown as DeepSeekInternals
  internals.apiOutlineData = data
  internals.getScrollContainer = () => container as unknown as HTMLElement | null
  return adapter
}

describe("DeepSeekAdapter 虚拟大纲高亮估算", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { pathname: "/a/chat/s/session-1" },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("按分支序号归目大纲条目：提问、标题、挂载行元素", () => {
    const adapter = buildDeepSeekAdapter(branchData([11, 12, 13, 21]), null)

    const query: OutlineItem = {
      level: 0,
      text: "提问",
      element: null,
      isUserQuery: true,
      navigationId: "deepseek:api-u:13",
    }
    expect(adapter.getVirtualOutlineRowIndex(query)).toBe(2)

    const heading: OutlineItem = {
      level: 2,
      text: "标题",
      element: null,
      id: "deepseek:api-h:21:2:0:abcd",
      navigationId: "deepseek:api-h:21:2:0:abcd",
    }
    expect(adapter.getVirtualOutlineRowIndex(heading)).toBe(3)

    const mounted: OutlineItem = {
      level: 2,
      text: "标题",
      element: {
        closest: (selector: string) =>
          selector === "[data-virtual-list-item-key]" ? { getAttribute: () => "12" } : null,
      } as unknown as Element,
    }
    expect(adapter.getVirtualOutlineRowIndex(mounted)).toBe(1)
  })

  it("无法归属的条目返回 null", () => {
    const adapter = buildDeepSeekAdapter(branchData([11, 12]), null)

    expect(adapter.getVirtualOutlineRowIndex({ level: 2, text: "x", element: null })).toBeNull()
    // message_id 不在激活分支（分支切换后的残留条目）
    expect(
      adapter.getVirtualOutlineRowIndex({
        level: 0,
        text: "x",
        element: null,
        navigationId: "deepseek:api-u:99",
      }),
    ).toBeNull()
  })

  it("接口数据缺失或会话不匹配时返回 null", () => {
    const noData = buildDeepSeekAdapter(null, null)
    expect(
      noData.getVirtualOutlineRowIndex({
        level: 0,
        text: "x",
        element: null,
        navigationId: "deepseek:api-u:11",
      }),
    ).toBeNull()

    const stale = buildDeepSeekAdapter({ ...branchData([11]), sessionId: "other-session" }, null)
    expect(
      stale.getVirtualOutlineRowIndex({
        level: 0,
        text: "x",
        element: null,
        navigationId: "deepseek:api-u:11",
      }),
    ).toBeNull()
  })

  it("快照以挂载行顶/底为锚点，边界取分支总数与最大 scrollTop", () => {
    const container = new FakeVirtualContainer([12, 13])
    const adapter = buildDeepSeekAdapter(branchData([11, 12, 13, 21]), container)

    const snapshot = adapter.getVirtualOutlinePositionSnapshot()

    expect(snapshot).not.toBeNull()
    expect(snapshot!.bounds).toEqual({ endSlot: 4, endTop: 9000 })
    // key 12 → 分支序号 1：行顶 100+800=900，行底 1400 记在序号 2；
    // key 13 → 分支序号 2：行顶 600+800=1400，行底 1900 记在序号 3
    expect(snapshot!.anchors).toEqual([
      { index: 1, top: 900 },
      { index: 2, top: 1400 },
      { index: 2, top: 1400 },
      { index: 3, top: 1900 },
    ])
  })

  it("非虚拟会话或挂载行为空时快照不可用", () => {
    const data = branchData([11, 12])
    expect(buildDeepSeekAdapter(data, null).getVirtualOutlinePositionSnapshot()).toBeNull()
    expect(
      buildDeepSeekAdapter(data, new FakeVirtualContainer([])).getVirtualOutlinePositionSnapshot(),
    ).toBeNull()
  })
})

describe("ClaudeAdapter 虚拟大纲高亮估算", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: {
        href: "https://claude.ai/chat/b56ad8d3-7271-432f-8651-75dc609c7f08",
        pathname: "/chat/b56ad8d3-7271-432f-8651-75dc609c7f08",
        origin: "https://claude.ai",
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("从条目 id 解析消息序号", () => {
    const adapter = new ClaudeAdapter()

    expect(
      adapter.getVirtualOutlineRowIndex({
        level: 0,
        text: "提问",
        element: null,
        isUserQuery: true,
        id: "claude-message:7:user",
      }),
    ).toBe(7)
    expect(
      adapter.getVirtualOutlineRowIndex({
        level: 2,
        text: "标题",
        element: null,
        id: "claude-message:3:heading:2",
      }),
    ).toBe(3)
  })

  it("无 id 且无元素时返回 null", () => {
    const adapter = new ClaudeAdapter()

    expect(adapter.getVirtualOutlineRowIndex({ level: 2, text: "x", element: null })).toBeNull()
  })
})
