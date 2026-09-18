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
 *
 * 与已知表毫无重合（拖动滚动条 / 点击 TOC 跳跃滚动）时，按
 * conversation-turn-N 的单调性定位插入点，避免把更早的 turn 盲目追加到尾部
 * 造成永久倒挂。
 */
export function reconcileObservedTurnOrder(
  order: string[],
  observedTurnIds: string[],
  getTurnNumber?: (turnId: string) => number | undefined,
): void {
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
      if (nextKnown >= 0) {
        insertAt = nextKnown
      } else {
        insertAt = order.length
        const observedNumber = getTurnNumber?.(turnId)
        if (getTurnNumber && observedNumber !== undefined) {
          for (let i = 0; i < order.length; i++) {
            const knownNumber = getTurnNumber(order[i])
            if (knownNumber !== undefined && knownNumber > observedNumber) {
              insertAt = i
              break
            }
          }
        }
      }
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
  /** turnId → conversation-turn-N（ChatGPT DOM 自带的全局 1-based 序号，最精确） */
  turnNumbers: ReadonlyMap<string, number>
  /** 全局顺序表（reconcileObservedTurnOrder 维护） */
  turnOrder: readonly string[]
  /** turnOrder 的反向索引，由调用方一次性构建 */
  turnOrderIndex: ReadonlyMap<string, number>
  /** turnId → 原生 TOC 的全局提问序号，仅原生 TOC 存在且有成功绑定时有值 */
  turnTocIndex: ReadonlyMap<string, number>
  /** 原生 TOC 提问总数，仅用于全无绑定时的比例换算兜底 */
  tocItemCount: number
  hasNativeToc: boolean
}

/**
 * 计算大纲条目所属 turn 的分组序号，全链路单一坐标：
 * - 有原生 TOC：以真实 DOM 捕获建立的 TOC 绑定为准，未绑定的 turn 在相邻绑定
 *   之间按全局顺序表位置插值。(N-1)/2 不能在这里优先——它硬编码了"首条必是
 *   提问、user/assistant 严格交替"，Custom GPT 开场白、连续提问、工具回合都
 *   会让 N 与 TOC 序号整体脱轨；只有完全没有任何绑定时才把 N 作为后备；
 * - 无原生 TOC：优先用 conversation-turn-N（同一问答的 user/assistant section
 *   编号连续，(N-1)/2 把提问映射到整数 K、回答映射到 K+0.5），缺 N 的 turn
 *   用相邻已知 N 插值；全表无 N（老版 DOM）才退化为全局顺序表位置。
 * 查不到任何位置信息时返回 MAX_SAFE_INTEGER，排到末尾（与历史行为一致）。
 */
export function resolveOutlineGroupIndex(context: OutlineGroupIndexContext): number {
  const { turnId, turnNumbers, turnOrderIndex, turnTocIndex, hasNativeToc } = context
  if (!turnId) return Number.MAX_SAFE_INTEGER

  const turnNumber = turnNumbers.get(turnId)

  if (hasNativeToc) {
    const bound = turnTocIndex.get(turnId)
    if (bound !== undefined) return bound

    // 完全无绑定（如提问文本全部重复导致绑定失败）时，N 比位置占比更精确
    if (turnTocIndex.size === 0 && turnNumber !== undefined) return (turnNumber - 1) / 2

    return interpolateTocGroupIndex(context)
  }

  if (turnNumber !== undefined) return (turnNumber - 1) / 2

  const position = turnOrderIndex.get(turnId)
  if (position === undefined) return Number.MAX_SAFE_INTEGER
  return interpolateTurnNumberGroupIndex(context, position)
}

function interpolateTocGroupIndex(context: OutlineGroupIndexContext): number {
  const { turnId, turnNumbers, turnOrder, turnOrderIndex, turnTocIndex } = context
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
  if (prevBound) {
    // 只有下侧绑定时优先按 conversation-turn-N 外插：末尾可能还有未成功绑定的
    // 后续提问（如重复文本触发防歧义拦截），其原生 TOC 条目仍占整数序号；
    // 一律压缩进 (K, K+1) 会把后续问题的回答标题排到该提问的 TOC 条目之前。
    const prevTurnNumber = turnNumbers.get(turnOrder[prevBound.position])
    const currentTurnNumber = turnId ? turnNumbers.get(turnId) : undefined
    if (
      prevTurnNumber !== undefined &&
      currentTurnNumber !== undefined &&
      currentTurnNumber > prevTurnNumber
    ) {
      return prevBound.tocIndex + (currentTurnNumber - prevTurnNumber) / 2
    }
    // 缺 N 时退化为压缩进该问题的坐标区间 (K, K+1)：
    // 整数步长外插会把回答标题恰好推到下一个问题的 TOC 序号上，造成错位
    const delta = position - prevBound.position
    return prevBound.tocIndex + delta / (delta + 1)
  }
  if (nextBound) {
    // 只有上侧绑定且其就是第 1 问时，前面的 turn（如 Custom GPT 开场白）
    // 映射到 [-1, 0)，保证排在第 1 问上方而不是与它同坐标撞序
    if (nextBound.tocIndex === 0) {
      return -1 + position / nextBound.position
    }
    // 其余情况按位置占比映射到 [0, K)：
    // user/assistant 交替的完整顺序表下恰好落在 K-0.5 / K-1 等正确区间
    return nextBound.tocIndex * (position / nextBound.position)
  }

  // TOC 存在但没有任何一条提问能绑定到 turn（如提问文本全部重复）。
  // 顺序表里 user/assistant section 各占一格（步长 2），与 TOC 步长 1 不一致，
  // 不能直接返回 position；按占比把顺序表全长映射到 TOC 序号全长。
  const { tocItemCount } = context
  if (turnOrder.length === 0 || tocItemCount === 0) return position
  return position * (tocItemCount / turnOrder.length)
}

/**
 * 无 TOC 模式下为缺 N 的 turn 估计 N 坐标：顺序表位置和 N 都按 section 单调
 * 递增且步长一致，用相邻已知 N 线性插值/外插，无缺口时结果精确；
 * 全表没有任何已知 N（老版 DOM）时退化为顺序表位置。
 */
function interpolateTurnNumberGroupIndex(
  context: OutlineGroupIndexContext,
  position: number,
): number {
  const { turnOrder, turnNumbers } = context

  let prev: { position: number; turnNumber: number } | null = null
  for (let i = position - 1; i >= 0; i--) {
    const turnNumber = turnNumbers.get(turnOrder[i])
    if (turnNumber !== undefined) {
      prev = { position: i, turnNumber }
      break
    }
  }

  let next: { position: number; turnNumber: number } | null = null
  for (let i = position + 1; i < turnOrder.length; i++) {
    const turnNumber = turnNumbers.get(turnOrder[i])
    if (turnNumber !== undefined) {
      next = { position: i, turnNumber }
      break
    }
  }

  let estimated: number
  if (prev && next) {
    const ratio = (position - prev.position) / (next.position - prev.position)
    estimated = prev.turnNumber + ratio * (next.turnNumber - prev.turnNumber)
  } else if (prev) {
    estimated = prev.turnNumber + (position - prev.position)
  } else if (next) {
    estimated = next.turnNumber - (next.position - position)
  } else {
    return position
  }

  return (estimated - 1) / 2
}
