/**
 * 虚拟列表只挂载视口附近的几条消息，离屏大纲条目没有 element。
 * 高亮二分查找只认有滚动坐标的条目，跳到顶部/底部时就会夹在
 * 「跳转前视口里的第一条或最后一条」。
 * 这里用已挂载行的内容坐标做锚点，给未挂载条目估一个单调的内容坐标
 * （与 outline-manager 的 scrollTop 同一坐标系：元素视口 top - 容器 top + scrollTop）。
 */

export interface VirtualPositionAnchor {
  /** 消息在完整列表中的序号（可以是行尾的下一个序号，用来表示该行的底边） */
  index: number
  top: number
}

export interface VirtualSlotBounds {
  /** 完整列表的消息条数；最后一条消息的序号是 endSlot - 1 */
  endSlot: number
  /** 滚到底时的 scrollTop。最后一条必须落在它之前或与它重合，滚到底才能高亮到真正的末尾 */
  endTop: number
}

export interface VirtualOutlineSlot {
  index: number
  /** 同一条消息内的先后顺序，越小越靠前 */
  order: number
}

/** 适配器提供的高亮估算快照：当前挂载窗口的锚点 + 完整列表边界 */
export interface VirtualOutlinePositionSnapshot {
  anchors: VirtualPositionAnchor[]
  bounds: VirtualSlotBounds
}

const isFiniteNumber = (value: number): boolean => Number.isFinite(value)

/**
 * 把锚点收成严格递增的折线。同一序号保留更大的 top（行底边应盖过行顶），
 * 回退的测量直接抬到前一个点，避免二分查找要求的单调性被破坏。
 */
export function normalizeVirtualPositionAnchors(
  anchors: readonly VirtualPositionAnchor[],
  bounds: VirtualSlotBounds,
): VirtualPositionAnchor[] {
  const endSlot = Math.max(0, bounds.endSlot)
  const endTop = Math.max(0, bounds.endTop)
  const sorted = anchors
    .filter(
      (anchor) =>
        isFiniteNumber(anchor.index) &&
        isFiniteNumber(anchor.top) &&
        anchor.index >= 0 &&
        anchor.index <= endSlot,
    )
    .sort((a, b) => a.index - b.index || a.top - b.top)

  const points: VirtualPositionAnchor[] = [{ index: 0, top: 0 }]
  for (const anchor of sorted) {
    const prev = points[points.length - 1]
    if (anchor.index === prev.index) {
      prev.top = Math.max(prev.top, anchor.top)
      continue
    }
    points.push({
      index: anchor.index,
      top: Math.max(prev.top, anchor.top),
    })
  }

  const last = points[points.length - 1]
  if (last.index === endSlot) {
    last.top = Math.max(last.top, endTop)
  } else {
    points.push({ index: endSlot, top: Math.max(last.top, endTop) })
  }
  return points
}

/** 在锚点折线上插值。slot 可以是小数，用来把同一条消息里的多个标题分开。 */
export function estimateVirtualSlotTop(
  slot: number,
  anchors: readonly VirtualPositionAnchor[],
  bounds: VirtualSlotBounds,
): number {
  const endSlot = Math.max(0, bounds.endSlot)
  if (endSlot <= 0) return 0

  const points = normalizeVirtualPositionAnchors(anchors, bounds)
  const clamped = Math.min(Math.max(slot, 0), endSlot)
  let prev = points[0]
  let next = points[points.length - 1]
  for (let i = 0; i < points.length - 1; i += 1) {
    if (points[i].index <= clamped && points[i + 1].index >= clamped) {
      prev = points[i]
      next = points[i + 1]
      break
    }
  }
  if (next.index === prev.index) return prev.top
  const ratio = (clamped - prev.index) / (next.index - prev.index)
  return prev.top + (next.top - prev.top) * ratio
}

/**
 * 按消息序号分组，组内按 order 均分到下一个消息序号之前。
 * 返回值与 items 下标对齐。
 */
export function estimateGroupedVirtualTops(
  items: readonly VirtualOutlineSlot[],
  anchors: readonly VirtualPositionAnchor[],
  bounds: VirtualSlotBounds,
): number[] {
  const groups = new Map<number, number[]>()
  items.forEach((item, inputIndex) => {
    if (!isFiniteNumber(item.index) || !isFiniteNumber(item.order)) return
    const group = groups.get(item.index)
    if (group) {
      group.push(inputIndex)
    } else {
      groups.set(item.index, [inputIndex])
    }
  })

  const tops = items.map(() => 0)
  for (const [index, inputIndexes] of groups) {
    const ordered = [...inputIndexes].sort((a, b) => items[a].order - items[b].order || a - b)
    ordered.forEach((inputIndex, orderIndex) => {
      tops[inputIndex] = estimateVirtualSlotTop(
        index + orderIndex / ordered.length,
        anchors,
        bounds,
      )
    })
  }
  return tops
}
