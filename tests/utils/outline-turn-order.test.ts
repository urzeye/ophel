import { describe, expect, it } from "vitest"

import {
  createOutlineGroupIndexResolver,
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

  it("同批观测含重复未知 turnId 时只插入一次", () => {
    const order = ["t1", "t4"]
    reconcileObservedTurnOrder(order, ["t1", "t2", "t2", "t3", "t4"])
    expect(order).toEqual(["t1", "t2", "t3", "t4"])

    const leading: string[] = ["t5"]
    reconcileObservedTurnOrder(leading, ["t2", "t2", "t5"])
    expect(leading).toEqual(["t2", "t5"])
  })

  it("与已知表毫无重合的跳跃观测按 turnNumber 定位，不倒挂（跳跃滚动回归）", () => {
    // 初次打开长会话时 DOM 停在底部，随后点击 TOC 跳到顶部：
    // 观测窗口与已知表无重合邻居，盲目追加会让 t1/t2 永久排在 t45 之后
    const order = ["t45", "t46", "t47"]
    const turnNumbers = new Map([
      ["t45", 45],
      ["t46", 46],
      ["t47", 47],
      ["t1", 1],
      ["t2", 2],
    ])
    const getTurnNumber = (turnId: string): number | undefined => turnNumbers.get(turnId)
    reconcileObservedTurnOrder(order, ["t1", "t2"], getTurnNumber)
    expect(order).toEqual(["t1", "t2", "t45", "t46", "t47"])
  })

  it("跳跃到底部时按 turnNumber 仍追加在尾部", () => {
    const order = ["t1", "t2"]
    const turnNumbers = new Map([
      ["t1", 1],
      ["t2", 2],
      ["t45", 45],
    ])
    reconcileObservedTurnOrder(order, ["t45"], (turnId) => turnNumbers.get(turnId))
    expect(order).toEqual(["t1", "t2", "t45"])
  })

  it("无重合且缺少 turnNumber 时退化为追加（向后兼容）", () => {
    const order = ["t3", "t4"]
    reconcileObservedTurnOrder(order, ["t1", "t2"])
    expect(order).toEqual(["t3", "t4", "t1", "t2"])
  })

  it("已知与未知交错的整批观测一次归并就绪（批处理插入等价性）", () => {
    const order = ["t1", "t4", "t7"]
    reconcileObservedTurnOrder(order, ["t1", "t2", "t3", "t4", "t5", "t6", "t7"])
    expect(order).toEqual(["t1", "t2", "t3", "t4", "t5", "t6", "t7"])
  })

  it("leading 未知前缀批量插入到首个已知邻居之前，保持批内观测顺序", () => {
    const order = ["t5", "t6"]
    reconcileObservedTurnOrder(order, ["t2", "t3", "t4", "t5"])
    expect(order).toEqual(["t2", "t3", "t4", "t5", "t6"])
  })

  it("跳跃观测的多条未知 turn 作为整体按 turnNumber 定位，保持批内顺序", () => {
    const order = ["t1", "t40", "t41"]
    const turnNumbers = new Map([
      ["t1", 1],
      ["t40", 40],
      ["t41", 41],
      ["t10", 10],
      ["t11", 11],
    ])
    reconcileObservedTurnOrder(order, ["t10", "t11"], (turnId) => turnNumbers.get(turnId))
    expect(order).toEqual(["t1", "t10", "t11", "t40", "t41"])
  })
})

const buildContext = (
  overrides: Partial<OutlineGroupIndexContext> & { turnOrder?: string[] },
): OutlineGroupIndexContext => {
  const turnOrder = overrides.turnOrder ?? []
  return {
    turnId: null,
    turnNumbers: new Map(),
    turnOrder,
    turnOrderIndex: new Map(turnOrder.map((turnId, index) => [turnId, index])),
    turnTocIndex: new Map(),
    tocItemCount: 0,
    hasNativeToc: false,
    ...overrides,
  }
}

describe("resolveOutlineGroupIndex（conversation-turn-N 优先）", () => {
  it("同一问答的 user/assistant section 分别映射到 K 与 K+0.5", () => {
    // ChatGPT 每个挂载 section 自带 conversation-turn-N，同一问答的两个 section
    // 编号连续（user 在前）：N=9 → 第 5 问提问，N=10 → 第 5 问回答
    const context = buildContext({
      turnNumbers: new Map([
        ["u5", 9],
        ["a5", 10],
      ]),
      hasNativeToc: true,
    })
    expect(resolveOutlineGroupIndex({ ...context, turnId: "u5" })).toBe(4)
    expect(resolveOutlineGroupIndex({ ...context, turnId: "a5" })).toBe(4.5)
  })

  it("N 与 TOC/顺序表无关，跳跃滚动后依然精确（缺陷2回归）", () => {
    // 顺序表因跳跃滚动错序成 [t49, t50, t1, t2]，但 N 是绝对坐标，不受影响
    const turnOrder = ["t49", "t50", "t1", "t2"]
    const context = buildContext({
      turnOrder,
      turnNumbers: new Map([
        ["t49", 97],
        ["t50", 98],
        ["t1", 1],
        ["t2", 2],
      ]),
    })
    const values = turnOrder.map(
      (turnId) => resolveOutlineGroupIndex({ ...context, turnId }) as number,
    )
    expect(values[2]).toBeLessThan(values[0]) // t1 排在 t49 前
    expect(values[3]).toBeLessThan(values[0]) // t2 排在 t49 前
    expect(values[2]).toBeLessThan(values[3]) // t1 排在 t2 前
  })
})

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

  it("部分 turn 缺 N 时用相邻已知 N 插值，与 N 坐标系保持一致", () => {
    // 顺序表位置与 N 都按 section 单调递增、步长一致：a2 位置 3，
    // 估计 N = 1 + 3 = 4 → (4-1)/2 = 1.5（第 2 问的回答区间）
    const context = buildContext({
      turnOrder: ["u1", "a1", "u2", "a2"],
      turnNumbers: new Map([["u1", 1]]),
    })
    expect(resolveOutlineGroupIndex({ ...context, turnId: "a2" })).toBe(1.5)
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

  it("末个绑定之后的外插被压缩在 (K, K+1) 内，不会撞上下一个问题的序号（缺陷1回归）", () => {
    // 第 5 问的 user section 绑定 tocIndex=4，assistant section 紧随其后；
    // 整数外插会算出 5，恰好等于第 6 问的 TOC 序号
    const context = buildContext({
      turnOrder: ["u1", "a1", "u5", "a5"],
      turnTocIndex: new Map([["u5", 4]]),
      hasNativeToc: true,
    })
    const assistant = resolveOutlineGroupIndex({ ...context, turnId: "a5" })
    expect(assistant).toBeGreaterThan(4)
    expect(assistant).toBeLessThan(5)
  })

  it("首个绑定之前按位置占比映射到 [0, K)，相对顺序保持（缺陷2插值方向）", () => {
    const context = buildContext({
      turnOrder: ["u1", "a1", "u2", "a2"],
      turnTocIndex: new Map([["u2", 1]]),
      hasNativeToc: true,
    })
    const a1 = resolveOutlineGroupIndex({ ...context, turnId: "a1" })
    expect(a1).toBeGreaterThanOrEqual(0)
    expect(a1).toBeLessThan(1)
    const u1 = resolveOutlineGroupIndex({ ...context, turnId: "u1" })
    expect(u1).toBeLessThan(a1)
  })

  it("完全无绑定时按占比换算，吸收顺序表与 TOC 的步长差（隐患3回归）", () => {
    // 两轮问答共 4 个 section（步长 2），TOC 只有 2 个提问（步长 1）：
    // 第 2 问的回答 position=3 必须落在第 2 问的坐标区间 (1, 2)，而不是漂移到 3
    const context = buildContext({
      turnOrder: ["u1", "a1", "u2", "a2"],
      tocItemCount: 2,
      hasNativeToc: true,
    })
    const a2 = resolveOutlineGroupIndex({ ...context, turnId: "a2" })
    expect(a2).toBeGreaterThan(1)
    expect(a2).toBeLessThan(2)
  })

  it("完全无绑定且缺少 TOC 计数时退化为全局表顺序", () => {
    const context = buildContext({ turnOrder: ["t1", "t2"], hasNativeToc: true })
    expect(resolveOutlineGroupIndex({ ...context, turnId: "t2" })).toBe(1)
  })

  it("末尾存在连续未绑定提问时按 N 外插，回答不错位到上一问（Bug1 回归）", () => {
    // Q5 绑定 tocIndex=4；Q6 因重复文本未绑定（DOM 提问被过滤，仅 TOC 条目占 5.0）。
    // 若把 A6 压缩进 (4, 5)，A6 的回答标题会排到 Q6 提问之前、错挂到 Q5 下。
    const context = buildContext({
      turnOrder: ["u5", "a5", "u6", "a6"],
      turnNumbers: new Map([
        ["u5", 9],
        ["a5", 10],
        ["u6", 11],
        ["a6", 12],
      ]),
      turnTocIndex: new Map([["u5", 4]]),
      hasNativeToc: true,
    })
    const a5 = resolveOutlineGroupIndex({ ...context, turnId: "a5" })
    expect(a5).toBeGreaterThan(4)
    expect(a5).toBeLessThan(5)
    // A6 坐标必须大于 Q6 的 TOC 序号 5，才能排在 Q6 提问之后
    const a6 = resolveOutlineGroupIndex({ ...context, turnId: "a6" })
    expect(a6).toBeGreaterThan(5)
    expect(a6).toBeLessThan(6)
  })

  it("末尾未绑定 turn 缺 N 时仍压缩在 (K, K+1) 兜底", () => {
    const context = buildContext({
      turnOrder: ["u5", "a5"],
      turnTocIndex: new Map([["u5", 4]]),
      hasNativeToc: true,
    })
    const a5 = resolveOutlineGroupIndex({ ...context, turnId: "a5" })
    expect(a5).toBeGreaterThan(4)
    expect(a5).toBeLessThan(5)
  })

  it("首个绑定之前的开场白映射到负坐标，排在第 1 问上方（Bug2 回归）", () => {
    // Custom GPT 开场白 g0（Assistant 欢迎语，无 TOC 条目）位于第 1 问之前；
    // 旧占比公式算出 0，与第 1 问同坐标，tie-break 后标题被排到第 1 问下方
    const context = buildContext({
      turnOrder: ["g0", "u1", "a1"],
      turnNumbers: new Map([
        ["g0", 1],
        ["u1", 2],
        ["a1", 3],
      ]),
      turnTocIndex: new Map([["u1", 0]]),
      hasNativeToc: true,
    })
    const g0 = resolveOutlineGroupIndex({ ...context, turnId: "g0" })
    expect(g0).toBeLessThan(0)
    const a1 = resolveOutlineGroupIndex({ ...context, turnId: "a1" })
    expect(a1).toBeGreaterThan(0)
    expect(a1).toBeLessThan(1)
  })

  it("有绑定时以真实 TOC 绑定为准，不按 (N-1)/2 硬算（Custom GPT 开场白回归）", () => {
    // Custom GPT 开场白：N=1 是 Assistant 欢迎语，第 1 问是 N=2（TOC index 0）、
    // 回答是 N=3。若按 (N-1)/2，回答坐标为 1.0，恰好撞上第 2 问的 TOC 序号，
    // 全篇标题错移一个问题；按绑定插值则落在 (0, 1) 区间。
    const context = buildContext({
      turnOrder: ["g0", "u1", "a1", "u2", "a2"],
      turnNumbers: new Map([
        ["g0", 1],
        ["u1", 2],
        ["a1", 3],
        ["u2", 4],
        ["a2", 5],
      ]),
      turnTocIndex: new Map([
        ["u1", 0],
        ["u2", 1],
      ]),
      hasNativeToc: true,
    })
    const a1 = resolveOutlineGroupIndex({ ...context, turnId: "a1" })
    expect(a1).toBeGreaterThan(0)
    expect(a1).toBeLessThan(1)
    const a2 = resolveOutlineGroupIndex({ ...context, turnId: "a2" })
    expect(a2).toBeGreaterThan(1)
    expect(a2).toBeLessThan(2)
    // 已绑定 turn 仍返回精确 TOC 序号
    expect(resolveOutlineGroupIndex({ ...context, turnId: "u2" })).toBe(1)
  })

  it("完全无绑定时 conversation-turn-N 仍作为后备坐标", () => {
    // 提问文本全部重复导致没有任何绑定成功：N 比位置占比更精确
    const context = buildContext({
      turnOrder: ["u1", "a1", "u2", "a2"],
      turnNumbers: new Map([["a2", 4]]),
      tocItemCount: 2,
      hasNativeToc: true,
    })
    expect(resolveOutlineGroupIndex({ ...context, turnId: "a2" })).toBe(1.5)
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

  it("TOC 模式：assistant section 用 conversation-turn-N 精确定位（缺陷1端到端回归）", () => {
    // 真实 DOM 中回答挂在 assistant section（独立 data-turn-id）下，TOC 文本绑定
    // 只能覆盖 user section；旧外插会把回答推到下一问的坐标上。
    // N=9 → 第 5 问提问，N=10 → 第 5 问回答（坐标 4.5，位于 Q5=4 与 Q6=5 之间）
    const context = buildContext({
      turnOrder: ["u5", "a5"],
      turnNumbers: new Map([["a5", 10]]),
      turnTocIndex: new Map([["u5", 4]]),
      hasNativeToc: true,
    })
    const items: SortableItem[] = [
      { text: "Q5", turnId: null, tocIndex: 4, orderInTurn: 0 },
      { text: "Q6", turnId: null, tocIndex: 5, orderInTurn: 0 },
      { text: "H-of-Q5", turnId: "a5", tocIndex: null, orderInTurn: 1 },
    ]
    const sorted = sortOutline(items, context)
    expect(sorted.indexOf("H-of-Q5")).toBeGreaterThan(sorted.indexOf("Q5"))
    expect(sorted.indexOf("H-of-Q5")).toBeLessThan(sorted.indexOf("Q6"))
  })

  it("TOC 模式：Custom GPT 开场白场景下标题不错移一个问题", () => {
    // N=1 是 Assistant 欢迎语（无 TOC 条目），第 1 问是 N=2、回答 N=3。
    // 标题坐标必须落在 Q1 与 Q2 之间，而不是撞上 Q2 的序号。
    const context = buildContext({
      turnOrder: ["g0", "u1", "a1", "u2", "a2"],
      turnNumbers: new Map([
        ["g0", 1],
        ["u1", 2],
        ["a1", 3],
        ["u2", 4],
        ["a2", 5],
      ]),
      turnTocIndex: new Map([
        ["u1", 0],
        ["u2", 1],
      ]),
      hasNativeToc: true,
    })
    const items: SortableItem[] = [
      { text: "Q1", turnId: null, tocIndex: 0, orderInTurn: 0 },
      { text: "Q2", turnId: null, tocIndex: 1, orderInTurn: 0 },
      { text: "H-of-Q1", turnId: "a1", tocIndex: null, orderInTurn: 1 },
      { text: "H-of-Q2", turnId: "a2", tocIndex: null, orderInTurn: 1 },
    ]
    const sorted = sortOutline(items, context)
    expect(sorted.indexOf("H-of-Q1")).toBeGreaterThan(sorted.indexOf("Q1"))
    expect(sorted.indexOf("H-of-Q1")).toBeLessThan(sorted.indexOf("Q2"))
    expect(sorted.indexOf("H-of-Q2")).toBeGreaterThan(sorted.indexOf("Q2"))
  })
})

describe("createOutlineGroupIndexResolver", () => {
  it("同一批 tables 下多次解析与 resolveOutlineGroupIndex 单发结果一致", () => {
    // 混合场景：部分绑定、部分已知 N、部分全无信息，覆盖二分查找的所有分支
    const turnOrder = ["g0", "u1", "a1", "u2", "a2", "u3", "a3", "x1"]
    const tables = {
      turnNumbers: new Map([
        ["g0", 1],
        ["u1", 2],
        ["a1", 3],
        ["a2", 5],
        ["u3", 6],
        ["a3", 7],
      ]),
      turnOrder,
      turnOrderIndex: new Map(turnOrder.map((turnId, index) => [turnId, index])),
      turnTocIndex: new Map([
        ["u1", 0],
        ["u3", 2],
      ]),
      tocItemCount: 3,
      hasNativeToc: true,
    }
    const resolve = createOutlineGroupIndexResolver(tables)
    for (const turnId of [...turnOrder, "unknown", null]) {
      expect(resolve(turnId)).toBe(resolveOutlineGroupIndex({ ...tables, turnId }))
    }
  })

  it("无 TOC 模式下多次解析与单发结果一致", () => {
    const turnOrder = ["t1", "t2", "t3", "t4"]
    const tables = {
      turnNumbers: new Map([
        ["t1", 1],
        ["t4", 4],
      ]),
      turnOrder,
      turnOrderIndex: new Map(turnOrder.map((turnId, index) => [turnId, index])),
      turnTocIndex: new Map<string, number>(),
      tocItemCount: 0,
      hasNativeToc: false,
    }
    const resolve = createOutlineGroupIndexResolver(tables)
    for (const turnId of [...turnOrder, "unknown", null]) {
      expect(resolve(turnId)).toBe(resolveOutlineGroupIndex({ ...tables, turnId }))
    }
  })
})
