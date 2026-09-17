import { describe, expect, it } from "vitest"

import {
  reconcileObservedTurnOrder,
  resolveOutlineGroupIndex,
  type OutlineGroupIndexContext,
} from "~utils/outline-turn-order"

describe("reconcileObservedTurnOrder", () => {
  it("向下滚动发现新 turn 时按观测顺序追加", () => {
    const order: string[] = []
    reconcileObservedTurnOrder(order, ["t1", "t2"])
    reconcileObservedTurnOrder(order, ["t2", "t3", "t4"])
    expect(order).toEqual(["t1", "t2", "t3", "t4"])
  })

  it("向上滚动揭示更早的 turn 时插入到已知邻居之前", () => {
    const order: string[] = []
    reconcileObservedTurnOrder(order, ["t5", "t6"])
    reconcileObservedTurnOrder(order, ["t1", "t2", "t5"])
    expect(order).toEqual(["t1", "t2", "t5", "t6"])
  })

  it("未知 turn 插入到本次观测到的已知邻居之间", () => {
    const order: string[] = []
    reconcileObservedTurnOrder(order, ["t1", "t4"])
    reconcileObservedTurnOrder(order, ["t1", "t2", "t3", "t4"])
    expect(order).toEqual(["t1", "t2", "t3", "t4"])
  })

  it("重复归并同一批观测不改变结果", () => {
    const order: string[] = []
    reconcileObservedTurnOrder(order, ["t1", "t2", "t3"])
    reconcileObservedTurnOrder(order, ["t1", "t2", "t3"])
    reconcileObservedTurnOrder(order, ["t2"])
    expect(order).toEqual(["t1", "t2", "t3"])
  })

  it("空观测批次是 no-op", () => {
    const order = ["t1"]
    reconcileObservedTurnOrder(order, [])
    expect(order).toEqual(["t1"])
  })
})

const buildContext = (
  overrides: Partial<OutlineGroupIndexContext> & { turnOrder?: string[] },
): OutlineGroupIndexContext => {
  const turnOrder = overrides.turnOrder ?? []
  return {
    turnId: null,
    turnOrder,
    turnOrderIndex: new Map(turnOrder.map((turnId, index) => [turnId, index])),
    turnTocIndex: new Map(),
    hasNativeToc: false,
    ...overrides,
  }
}

describe("resolveOutlineGroupIndex（无原生 TOC）", () => {
  it("已知 turn 返回全局表位置", () => {
    const context = buildContext({ turnOrder: ["t1", "t2", "t3"] })
    expect(resolveOutlineGroupIndex({ ...context, turnId: "t2" })).toBe(1)
  })

  it("未知 turn 或无 turnId 排到最后", () => {
    const context = buildContext({ turnOrder: ["t1"] })
    expect(resolveOutlineGroupIndex({ ...context, turnId: "tX" })).toBe(Number.MAX_SAFE_INTEGER)
    expect(resolveOutlineGroupIndex({ ...context, turnId: null })).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe("resolveOutlineGroupIndex（有原生 TOC）", () => {
  it("已绑定 turn 返回精确的 TOC 序号", () => {
    const context = buildContext({
      turnOrder: ["t1", "t9"],
      turnTocIndex: new Map([["t9", 8]]),
      hasNativeToc: true,
    })
    expect(resolveOutlineGroupIndex({ ...context, turnId: "t9" })).toBe(8)
  })

  it("未绑定 turn 在相邻已绑定 turn 之间插值", () => {
    const context = buildContext({
      turnOrder: ["t1", "t2", "t3"],
      turnTocIndex: new Map([
        ["t1", 0],
        ["t3", 4],
      ]),
      hasNativeToc: true,
    })
    const value = resolveOutlineGroupIndex({ ...context, turnId: "t2" })
    expect(value).toBeGreaterThan(0)
    expect(value).toBeLessThan(4)
  })

  it("未绑定 turn 在首个绑定之前时保持更小且相对有序", () => {
    const context = buildContext({
      turnOrder: ["t1", "t2", "t3"],
      turnTocIndex: new Map([["t3", 5]]),
      hasNativeToc: true,
    })
    const v1 = resolveOutlineGroupIndex({ ...context, turnId: "t1" })
    const v2 = resolveOutlineGroupIndex({ ...context, turnId: "t2" })
    expect(v1).toBeLessThan(v2)
    expect(v2).toBeLessThan(5)
  })

  it("未绑定 turn 在末个绑定之后时保持更大且相对有序", () => {
    const context = buildContext({
      turnOrder: ["t1", "t2", "t3"],
      turnTocIndex: new Map([["t1", 2]]),
      hasNativeToc: true,
    })
    const v2 = resolveOutlineGroupIndex({ ...context, turnId: "t2" })
    const v3 = resolveOutlineGroupIndex({ ...context, turnId: "t3" })
    expect(v2).toBeGreaterThan(2)
    expect(v3).toBeGreaterThan(v2)
  })

  it("完全无绑定时退化为全局表顺序", () => {
    const context = buildContext({ turnOrder: ["t1", "t2"], hasNativeToc: true })
    expect(resolveOutlineGroupIndex({ ...context, turnId: "t2" })).toBe(1)
  })
})

// 复现用户反馈的错位场景，验证统一坐标后的排序结果。
// 排序规则与 ChatGPTAdapter.mergeCachedChatGPTOutlineItems 一致：
// groupIndex → orderInTurn → originalIndex。
describe("大纲合并排序回归", () => {
  interface SortableItem {
    text: string
    turnId: string | null
    tocIndex: number | null
    orderInTurn: number
  }

  const sortOutline = (items: SortableItem[], context: OutlineGroupIndexContext): string[] =>
    items
      .map((item, originalIndex) => ({
        item,
        originalIndex,
        groupIndex:
          item.tocIndex !== null
            ? item.tocIndex
            : resolveOutlineGroupIndex({ ...context, turnId: item.turnId }),
      }))
      .sort((a, b) => {
        if (a.groupIndex !== b.groupIndex) return a.groupIndex - b.groupIndex
        if (a.item.orderInTurn !== b.item.orderInTurn) {
          return a.item.orderInTurn - b.item.orderInTurn
        }
        return a.originalIndex - b.originalIndex
      })
      .map(({ item }) => item.text)

  it("TOC 模式：已卸载 turn 的缓存标题跟随其 TOC 绑定，不沉底", () => {
    // 10 轮对话，原生 TOC 给出全部提问；t1 的回答标题来自缓存（turn 已卸载），
    // t9 的标题来自实时 DOM。旧实现里缓存标题会排到所有挂载 turn 之后。
    const turnOrder = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10"]
    const context = buildContext({
      turnOrder,
      turnTocIndex: new Map(turnOrder.map((turnId, index) => [turnId, index])),
      hasNativeToc: true,
    })
    const items: SortableItem[] = [
      ...turnOrder.map((_, index) => ({
        text: `Q${index + 1}`,
        turnId: null,
        tocIndex: index,
        orderInTurn: 0,
      })),
      { text: "H-of-Q9", turnId: "t9", tocIndex: null, orderInTurn: 1 },
      { text: "H-of-Q1", turnId: "t1", tocIndex: null, orderInTurn: 1 },
    ]
    const sorted = sortOutline(items, context)
    expect(sorted.indexOf("H-of-Q1")).toBe(sorted.indexOf("Q1") + 1)
    expect(sorted.indexOf("H-of-Q1")).toBeLessThan(sorted.indexOf("Q2"))
    expect(sorted.indexOf("H-of-Q9")).toBeGreaterThan(sorted.indexOf("Q9"))
    expect(sorted.indexOf("H-of-Q9")).toBeLessThan(sorted.indexOf("Q10"))
  })

  it("TOC 模式：未绑定 turn 的标题落在相邻绑定之间", () => {
    // t2 从未在 TOC 出现后挂载过（绑定失败），但其标题有缓存；
    // 插值后仍应位于 Q1 与 Q3 的绑定位置之间。
    const context = buildContext({
      turnOrder: ["t1", "t2", "t3"],
      turnTocIndex: new Map([
        ["t1", 0],
        ["t3", 2],
      ]),
      hasNativeToc: true,
    })
    const items: SortableItem[] = [
      { text: "Q1", turnId: null, tocIndex: 0, orderInTurn: 0 },
      { text: "Q2", turnId: null, tocIndex: 1, orderInTurn: 0 },
      { text: "Q3", turnId: null, tocIndex: 2, orderInTurn: 0 },
      { text: "H-of-Q2", turnId: "t2", tocIndex: null, orderInTurn: 1 },
    ]
    const sorted = sortOutline(items, context)
    expect(sorted.indexOf("H-of-Q2")).toBeGreaterThan(sorted.indexOf("Q1"))
    expect(sorted.indexOf("H-of-Q2")).toBeLessThan(sorted.indexOf("Q3"))
  })

  it("无 TOC 模式：卸载 turn 的缓存标题保持在原问题下，不排到末尾", () => {
    // 截图场景：Q1 回答被卸载只剩缓存，Q1/Q2 提问仍在 DOM。
    // 旧实现缓存条目 turnIndex = firstSeen + 1_000_000，会排到 Q2 之后。
    const context = buildContext({ turnOrder: ["t1", "t2"] })
    const items: SortableItem[] = [
      { text: "Q1", turnId: "t1", tocIndex: null, orderInTurn: 0 },
      { text: "Q2", turnId: "t2", tocIndex: null, orderInTurn: 0 },
      { text: "H-of-Q1", turnId: "t1", tocIndex: null, orderInTurn: 1 },
    ]
    const sorted = sortOutline(items, context)
    expect(sorted).toEqual(["Q1", "H-of-Q1", "Q2"])
  })
})
