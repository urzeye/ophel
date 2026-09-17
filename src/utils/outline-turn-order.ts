/**
 * 跨虚拟滚动的全局 turn 顺序表与大纲分组序号计算。
 *
 * 背景：ChatGPT 对长对话做虚拟滚动，DOM 只保留视口附近的 turn。大纲条目里
 * 用户提问可能来自原生 TOC、AI 标题可能来自实时 DOM 或缓存回填，三者必须用
 * 同一套全局坐标排序——否则已卸载 turn 的缓存标题会被排到错误的问题下面。
 */

/**
 * 把一批按真实 DOM 顺序观测到的 turn 归并进全局顺序表。
 *
 * 已知 turn 的相对顺序保持不变；未知 turn 插入到本次观测中它前后的已知邻居
 * 之间（向上滚动揭示更早的 turn 时插到前面，而不是简单追加到尾部）。同一段
 * 空隙被不同批观测填入时，后观测到的排在更靠近前一个已知邻居的位置。
 */
export function reconcileObservedTurnOrder(order: string[], observedTurnIds: string[]): void {
  if (observedTurnIds.length === 0) return

  const position = new Map<string, number>()
  order.forEach((turnId, index) => position.set(turnId, index))

  let lastKnownPosition = -1
  observedTurnIds.forEach((turnId, observedIndex) => {
    const known = position.get(turnId)
    if (known !== undefined) {
      lastKnownPosition = known
      return
    }

    let insertAt: number
    if (lastKnownPosition >= 0) {
      insertAt = lastKnownPosition + 1
    } else {
      // 本次观测中位于所有已知 turn 之前：插到其后第一个已知 turn 前面；没有已知 turn 则追加
      let nextKnown = -1
      for (let i = observedIndex + 1; i < observedTurnIds.length; i++) {
        const candidate = position.get(observedTurnIds[i])
        if (candidate !== undefined) {
          nextKnown = candidate
          break
        }
      }
      insertAt = nextKnown >= 0 ? nextKnown : order.length
    }

    order.splice(insertAt, 0, turnId)
    position.forEach((value, key) => {
      if (value >= insertAt) position.set(key, value + 1)
    })
    position.set(turnId, insertAt)
    lastKnownPosition = insertAt
  })
}

export interface OutlineGroupIndexContext {
  turnId: string | null
  /** 全局顺序表（reconcileObservedTurnOrder 维护） */
  turnOrder: readonly string[]
  /** turnOrder 的反向索引，由调用方一次性构建 */
  turnOrderIndex: ReadonlyMap<string, number>
  /** turnId → 原生 TOC 的全局提问序号，仅原生 TOC 存在且有成功绑定时有值 */
  turnTocIndex: ReadonlyMap<string, number>
  hasNativeToc: boolean
}

/**
 * 计算大纲条目所属 turn 的分组序号，全链路单一坐标：
 * - 无原生 TOC：全局顺序表位置；
 * - 有原生 TOC：优先用绑定到的 TOC 序号，未绑定的 turn 用相邻已绑定 turn 插值。
 * 查不到任何位置信息时返回 MAX_SAFE_INTEGER，排到末尾（与历史行为一致）。
 */
export function resolveOutlineGroupIndex(context: OutlineGroupIndexContext): number {
  const { turnId, turnOrderIndex, turnTocIndex, hasNativeToc } = context
  if (!turnId) return Number.MAX_SAFE_INTEGER

  if (!hasNativeToc) {
    return turnOrderIndex.get(turnId) ?? Number.MAX_SAFE_INTEGER
  }

  const bound = turnTocIndex.get(turnId)
  if (bound !== undefined) return bound

  return interpolateTocGroupIndex(context)
}

function interpolateTocGroupIndex(context: OutlineGroupIndexContext): number {
  const { turnId, turnOrder, turnOrderIndex, turnTocIndex } = context
  const position = turnId === null ? undefined : turnOrderIndex.get(turnId)
  if (position === undefined) return Number.MAX_SAFE_INTEGER

  let prevBound: { position: number; tocIndex: number } | null = null
  for (let i = position - 1; i >= 0; i--) {
    const tocIndex = turnTocIndex.get(turnOrder[i])
    if (tocIndex !== undefined) {
      prevBound = { position: i, tocIndex }
      break
    }
  }

  let nextBound: { position: number; tocIndex: number } | null = null
  for (let i = position + 1; i < turnOrder.length; i++) {
    const tocIndex = turnTocIndex.get(turnOrder[i])
    if (tocIndex !== undefined) {
      nextBound = { position: i, tocIndex }
      break
    }
  }

  if (prevBound && nextBound) {
    const ratio = (position - prevBound.position) / (nextBound.position - prevBound.position)
    return prevBound.tocIndex + ratio * (nextBound.tocIndex - prevBound.tocIndex)
  }
  if (prevBound) return prevBound.tocIndex + (position - prevBound.position)
  if (nextBound) return nextBound.tocIndex - (nextBound.position - position)

  // TOC 存在但没有任何一条提问能绑定到 turn（如提问文本全部重复）：
  // 退化为全局表顺序。它与 TOC 序号都从 0 开始且都随会话单调，能近似对齐。
  return position
}
