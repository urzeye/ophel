/**
 * 锚点全局存储
 *
 * 用于在 MainPanel、QuickButtons、useShortcuts 之间共享锚点位置。
 * 纯内存存储，不持久化。
 */

type Listener = () => void

let anchorPosition: number | null = null
const listeners = new Set<Listener>()

/**
 * 锚点相关异步操作的串行化锁。
 *
 * 去顶部 / 去底部 / 返回锚点 / 手动设锚等操作都是
 * 「读取当前位置 → 异步滚动 → 写回锚点」的非原子序列，
 * 中间的 await 会让第二次调用读到被第一次改过的状态，
 * 导致两个锚点塌缩成同一个位置（快速连点后锚点卡死）。
 * 该锁确保同一时刻只有一个锚点操作在飞；在飞期间的新触发直接忽略。
 */
let anchorOpInFlight = false

export async function withAnchorOp<T>(fn: () => Promise<T>): Promise<T | null> {
  if (anchorOpInFlight) return null
  anchorOpInFlight = true
  try {
    return await fn()
  } finally {
    anchorOpInFlight = false
  }
}

export const anchorStore = {
  /**
   * 获取当前锚点位置
   */
  get: (): number | null => anchorPosition,

  /**
   * 设置锚点位置
   */
  set: (position: number): void => {
    anchorPosition = position
    listeners.forEach((fn) => fn())
  },

  /**
   * 清除锚点
   */
  clear: (): void => {
    anchorPosition = null
    listeners.forEach((fn) => fn())
  },

  /**
   * 订阅锚点变化
   * @returns 取消订阅函数
   */
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  /**
   * 获取快照（用于 useSyncExternalStore）
   */
  getSnapshot: (): number | null => anchorPosition,
}

/**
 * 检查是否有锚点
 */
export const hasAnchor = (): boolean => anchorPosition !== null
