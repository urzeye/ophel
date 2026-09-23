import { describe, expect, it, vi } from "vitest"

import { DeepSeekAdapter } from "~adapters/deepseek"
import type { DeepSeekHistoryOutlineData } from "~utils/deepseek-history-outline"

// base.ts 在模块顶层实例化 DOMToolkit（依赖 document）；node 环境下打桩
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

type AdapterInternals = {
  probeMountVirtualRow: (
    messageId: number,
    container: HTMLElement,
    data: DeepSeekHistoryOutlineData | null,
    requestId: number,
  ) => Promise<Element | null>
  findApiHeadingInRow: (
    row: Element,
    ref: { level: number; orderInMessage: number },
    text: string,
  ) => Element | null
}

const ROW_HEIGHT = 100
const WINDOW_SIZE = 6

/**
 * 模拟 ds-virtual-list 的同步重挂载：设置 scrollTop 后窗口立即切换到
 * 对应 key 区间；行高固定，key 可以有空洞（编辑/删除场景）。
 */
class FakeVirtualContainer {
  scrollTop = 0
  readonly clientHeight = 500

  constructor(private readonly keys: number[]) {}

  get scrollHeight(): number {
    return this.keys.length * ROW_HEIGHT
  }

  private windowKeys(): number[] {
    const start = Math.min(
      Math.max(0, this.keys.length - WINDOW_SIZE),
      Math.max(0, Math.floor(this.scrollTop / ROW_HEIGHT)),
    )
    return this.keys.slice(start, start + WINDOW_SIZE)
  }

  private rectFor(key: number) {
    const index = this.keys.indexOf(key)
    const top = index * ROW_HEIGHT - this.scrollTop
    return { top, bottom: top + ROW_HEIGHT, height: ROW_HEIGHT }
  }

  private fakeRow(key: number) {
    return {
      getAttribute: (name: string) => (name === "data-virtual-list-item-key" ? String(key) : null),
      getBoundingClientRect: () => this.rectFor(key),
    }
  }

  querySelectorAll(selector: string) {
    if (selector !== "[data-virtual-list-item-key]") return [] as unknown[]
    return this.windowKeys().map((key) => this.fakeRow(key))
  }

  querySelector(selector: string) {
    const match = selector.match(/^\[data-virtual-list-item-key="(\d+)"\]$/)
    if (!match) return null
    const key = Number(match[1])
    return this.windowKeys().includes(key) ? this.fakeRow(key) : null
  }

  dispatchEvent(): boolean {
    return true
  }

  getBoundingClientRect() {
    return { top: 0 }
  }
}

const keys = (count: number): number[] => Array.from({ length: count }, (_, i) => i + 1)

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

const probe = (
  adapter: DeepSeekAdapter,
  messageId: number,
  container: FakeVirtualContainer,
  data: DeepSeekHistoryOutlineData | null,
  requestId = 0,
) =>
  (adapter as unknown as AdapterInternals).probeMountVirtualRow(
    messageId,
    container as unknown as HTMLElement,
    data,
    requestId,
  )

describe("DeepSeekAdapter.probeMountVirtualRow", () => {
  it("mounts a row below the current window within a few probes", async () => {
    const adapter = new DeepSeekAdapter()
    const container = new FakeVirtualContainer(keys(40))

    const row = await probe(adapter, 20, container, branchData(keys(40)))

    expect(row).not.toBeNull()
    expect(row!.getAttribute("data-virtual-list-item-key")).toBe("20")
    expect(container.scrollTop).toBeGreaterThan(0)
  })

  it("mounts a row above the current window", async () => {
    const adapter = new DeepSeekAdapter()
    const container = new FakeVirtualContainer(keys(40))
    container.scrollTop = 3500

    const row = await probe(adapter, 3, container, branchData(keys(40)))

    expect(row).not.toBeNull()
    expect(row!.getAttribute("data-virtual-list-item-key")).toBe("3")
    expect(container.scrollTop).toBeLessThan(3500)
  })

  it("converges across id holes using branch index distances", async () => {
    const adapter = new DeepSeekAdapter()
    const holedKeys = [1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 20, 21, 22, 23, 24, 30, 31, 32, 33, 34]
    const container = new FakeVirtualContainer(holedKeys)

    const row = await probe(adapter, 22, container, branchData(holedKeys))

    expect(row).not.toBeNull()
    expect(row!.getAttribute("data-virtual-list-item-key")).toBe("22")
  })

  it("returns null when the target row does not exist (hits scroll bound)", async () => {
    const adapter = new DeepSeekAdapter()
    const container = new FakeVirtualContainer(keys(40))

    const row = await probe(adapter, 999, container, branchData(keys(40)))

    expect(row).toBeNull()
    expect(container.scrollTop).toBe(3500)
  })

  it("aborts when a newer reveal request preempts it", async () => {
    const adapter = new DeepSeekAdapter()
    const container = new FakeVirtualContainer(keys(40))

    // 适配器内部 requestId 初始为 0，传入更旧的 -1 表示已被抢占
    const row = await probe(adapter, 20, container, branchData(keys(40)), -1)

    expect(row).toBeNull()
    expect(container.scrollTop).toBe(0)
  })
})

const fakeHeading = (tagName: string, text: string) => ({ tagName, textContent: text })

const fakeRowWithHeadings = (headings: { tagName: string; textContent: string }[]) =>
  ({ querySelectorAll: () => headings }) as unknown as Element

describe("DeepSeekAdapter.findApiHeadingInRow", () => {
  const find = (
    adapter: DeepSeekAdapter,
    row: Element,
    ref: { level: number; orderInMessage: number },
    text: string,
  ) => (adapter as unknown as AdapterInternals).findApiHeadingInRow(row, ref, text)

  it("accepts the order hit when rendered text differs but level matches", () => {
    const adapter = new DeepSeekAdapter()
    // 接口 markdown 标题 "结论[reference:0]" 清洗为 "结论"，页面渲染出上标数字
    const row = fakeRowWithHeadings([fakeHeading("H2", "结论0"), fakeHeading("H3", "小节")])

    const found = find(adapter, row, { level: 2, orderInMessage: 0 }, "结论")

    expect(found).not.toBeNull()
    expect((found as unknown as { textContent: string }).textContent).toBe("结论0")
  })

  it("prefers exact text match on the order hit", () => {
    const adapter = new DeepSeekAdapter()
    const row = fakeRowWithHeadings([fakeHeading("H2", "结论"), fakeHeading("H3", "小节")])

    const found = find(adapter, row, { level: 2, orderInMessage: 0 }, "结论")

    expect((found as unknown as { textContent: string }).textContent).toBe("结论")
  })

  it("falls back to level+text match when the order hit diverges", () => {
    const adapter = new DeepSeekAdapter()
    const row = fakeRowWithHeadings([fakeHeading("H3", "其他"), fakeHeading("H2", "目标")])

    const found = find(adapter, row, { level: 2, orderInMessage: 0 }, "目标")

    expect((found as unknown as { textContent: string }).textContent).toBe("目标")
  })

  it("returns null when nothing matches", () => {
    const adapter = new DeepSeekAdapter()
    const row = fakeRowWithHeadings([fakeHeading("H3", "其他")])

    expect(find(adapter, row, { level: 2, orderInMessage: 5 }, "不存在")).toBeNull()
  })
})
